import { createClientFromRequest } from '../shared/createClient.js';
import { authorize, getSettings } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { str } from '../shared/utils.js';

// Manage Settings — single-business. Admin only. invoice_sequence protected.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageSettings');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const data = body.data || {};

    const safeFields = {};
    if (data.shop_name !== undefined) safeFields.shop_name = str(data.shop_name);
    if (data.logo_url !== undefined) safeFields.logo_url = str(data.logo_url);
    if (data.owner_name !== undefined) safeFields.owner_name = str(data.owner_name);
    if (data.address !== undefined) safeFields.address = str(data.address);
    if (data.state !== undefined) safeFields.state = str(data.state);
    if (data.city !== undefined) safeFields.city = str(data.city);
    if (data.pincode !== undefined) safeFields.pincode = str(data.pincode);
    if (data.mobile !== undefined) safeFields.mobile = str(data.mobile);
    if (data.email !== undefined) safeFields.email = str(data.email);
    if (data.gst_number !== undefined) safeFields.gst_number = str(data.gst_number);
    if (data.invoice_prefix !== undefined) safeFields.invoice_prefix = str(data.invoice_prefix);
    if (data.currency !== undefined) safeFields.currency = str(data.currency);
    if (data.default_language !== undefined) safeFields.default_language = str(data.default_language);
    if (data.business_type !== undefined) safeFields.business_type = str(data.business_type);
    if (data.making_charge_default !== undefined) safeFields.making_charge_default = Number(data.making_charge_default) || 0;
    if (data.making_charge_type_default !== undefined) safeFields.making_charge_type_default = str(data.making_charge_type_default) || 'percentage';
    if (data.gst_enabled !== undefined) safeFields.gst_enabled = data.gst_enabled !== false;
    if (data.gst_threshold_grams !== undefined) safeFields.gst_threshold_grams = Number(data.gst_threshold_grams) || 0;
    if (data.low_stock_threshold !== undefined) safeFields.low_stock_threshold = Number(data.low_stock_threshold) || 2;
    if (data.onboarding_completed !== undefined) safeFields.onboarding_completed = data.onboarding_completed === true;
    if (data.invoice_paper_size !== undefined) safeFields.invoice_paper_size = str(data.invoice_paper_size) || 'A4';
    if (data.barcode_preset !== undefined) safeFields.barcode_preset = str(data.barcode_preset) || 'medium';
    if (data.barcode_type !== undefined) safeFields.barcode_type = str(data.barcode_type) || 'code128';
    if (data.barcode_width !== undefined) safeFields.barcode_width = Number(data.barcode_width) || 2;
    if (data.barcode_height !== undefined) safeFields.barcode_height = Number(data.barcode_height) || 60;
    if (data.barcode_font_size !== undefined) safeFields.barcode_font_size = Number(data.barcode_font_size) || 14;
    if (data.barcode_label_width !== undefined) safeFields.barcode_label_width = Number(data.barcode_label_width) || 20;
    if (data.barcode_label_height !== undefined) safeFields.barcode_label_height = Number(data.barcode_label_height) || 40;
    if (data.huid_enabled !== undefined) safeFields.huid_enabled = data.huid_enabled === true;

    if (action === 'get') {
      const settings = await getSettings(base44);
      return Response.json({ success: true, settings });
    }

    if (action === 'update') {
      const prev = await getSettings(base44);
      if (!prev) return Response.json({ error: 'Settings not found. Complete onboarding first.' }, { status: 404 });
      await base44.asServiceRole.entities.ShopSettings.update(prev.id, safeFields);
      await writeAudit(base44, {
        action: 'update', module: 'settings', record_id: prev.id,
        previous_value: { shop_name: prev.shop_name, gst_enabled: prev.gst_enabled },
        new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}