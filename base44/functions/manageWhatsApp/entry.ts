import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// WhatsApp integration — config management + optional Cloud API document sending.
// The access token lives in WhatsAppConfig (RLS read:false) and is NEVER returned to the client.
// Sharing is a communication action only — it never mutates Bill / BillItem / Inventory / Payment.
const GRAPH_VERSION = 'v18.0';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageWhatsApp');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);

    // ---- getStatus: return non-secret config only (no access_token) ----
    if (action === 'getStatus') {
      const list = await base44.asServiceRole.entities.WhatsAppConfig.list('-created_date', 1);
      const c = list[0] || null;
      if (!c) return Response.json({ success: true, configured: false, enabled: false, api_status: 'unconfigured' });
      return Response.json({
        success: true,
        configured: !!c.access_token,
        enabled: !!c.enabled,
        phone_number_id: c.phone_number_id || '',
        business_account_id: c.business_account_id || '',
        default_message: c.default_message || '',
        api_status: c.api_status || 'unconfigured',
      });
    }

    // ---- saveConfig: admin only. Stores token server-side; blank token = keep existing. ----
    if (action === 'saveConfig') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const data = body.data || {};
      const list = await base44.asServiceRole.entities.WhatsAppConfig.list('-created_date', 1);
      const existing = list[0] || null;

      const accessToken = str(data.access_token);
      const keepToken = !accessToken && existing?.access_token;
      const finalToken = accessToken || (keepToken ? existing.access_token : '');
      const configured = !!finalToken;

      const payload = {
        enabled: !!data.enabled,
        phone_number_id: str(data.phone_number_id),
        business_account_id: str(data.business_account_id),
        access_token: finalToken,
        default_message: str(data.default_message),
        api_status: configured ? 'configured' : 'unconfigured',
      };

      let recordId = existing?.id || '';
      if (existing) {
        await base44.asServiceRole.entities.WhatsAppConfig.update(existing.id, payload);
      } else {
        const created = await base44.asServiceRole.entities.WhatsAppConfig.create(payload);
        recordId = created.id;
      }
      await writeAudit(base44, { action: 'update', module: 'settings', record_id: recordId, new_value: { whatsapp: { enabled: payload.enabled, configured } }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, configured });
    }

    // ---- send: Cloud API document send. Requires configured credentials. ----
    if (action === 'send') {
      const billId = str(body.bill_id);
      const phone = str(body.phone);
      const fileUrl = str(body.file_url);
      const message = str(body.message);
      const documentName = str(body.document_name) || 'Invoice.pdf';
      if (!billId || !phone || !fileUrl) return Response.json({ error: 'bill_id, phone and file_url are required' }, { status: 400 });

      const list = await base44.asServiceRole.entities.WhatsAppConfig.list('-created_date', 1);
      const cfg = list[0] || null;
      if (!cfg || !cfg.access_token || !cfg.phone_number_id || !cfg.enabled) {
        return Response.json({ success: false, configured: false, error: 'WhatsApp Cloud API not configured' });
      }

      // Log a pending attempt first.
      const log = await base44.asServiceRole.entities.WhatsAppShare.create({
        bill_id: billId,
        bill_number: str(body.bill_number),
        customer_id: str(body.customer_id),
        customer_name: str(body.customer_name),
        phone_number: phone,
        message_type: 'cloud_api',
        document_name: documentName,
        status: 'pending',
        created_by: user.id,
      });

      try {
        // 1. Fetch the generated PDF.
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok) throw new Error('Failed to fetch invoice PDF');
        const pdfBuf = await fileRes.arrayBuffer();

        // 2. Upload to WhatsApp media endpoint.
        const mediaForm = new FormData();
        mediaForm.append('file', new Blob([pdfBuf], { type: 'application/pdf' }), documentName);
        mediaForm.append('type', 'application/pdf');
        mediaForm.append('messaging_product', 'whatsapp');

        const mediaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phone_number_id}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.access_token}` },
          body: mediaForm,
        });
        const mediaJson = await mediaRes.json();
        if (!mediaRes.ok || !mediaJson.id) throw new Error(mediaJson.error?.message || 'Media upload failed');
        const mediaId = mediaJson.id;

        // 3. Send the document message.
        const msgRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'document',
            document: { id: mediaId, filename: documentName, caption: message },
          }),
        });
        const msgJson = await msgRes.json();
        if (!msgRes.ok) throw new Error(msgJson.error?.message || 'Message send failed');

        await base44.asServiceRole.entities.WhatsAppShare.update(log.id, {
          status: 'sent',
          provider_message_id: msgJson.messages?.[0]?.id || '',
          sent_at: new Date().toISOString(),
        });
        return Response.json({ success: true, status: 'sent', provider_message_id: msgJson.messages?.[0]?.id || '' });
      } catch (e) {
        await base44.asServiceRole.entities.WhatsAppShare.update(log.id, {
          status: 'failed',
          error_message: str(e.message).slice(0, 500),
        });
        return Response.json({ success: false, status: 'failed', error: e.message || 'WhatsApp send failed' });
      }
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}