import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize, getSettings } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

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

    const safeFields = {
      shop_name: str(data.shop_name), logo_url: str(data.logo_url), owner_name: str(data.owner_name),
      address: str(data.address), state: str(data.state), city: str(data.city), pincode: str(data.pincode),
      mobile: str(data.mobile), email: str(data.email), gst_number: str(data.gst_number),
      invoice_prefix: str(data.invoice_prefix), currency: str(data.currency),
      default_language: str(data.default_language), business_type: str(data.business_type),
      making_charge_default: Number(data.making_charge_default) || 0,
      making_charge_type_default: str(data.making_charge_type_default) || 'percentage',
      gst_enabled: data.gst_enabled !== false, gst_threshold_grams: Number(data.gst_threshold_grams) || 0,
      low_stock_threshold: Number(data.low_stock_threshold) || 2,
      onboarding_completed: data.onboarding_completed === true,
      invoice_paper_size: str(data.invoice_paper_size) || 'A4',
      barcode_preset: str(data.barcode_preset) || 'medium',
      barcode_type: str(data.barcode_type) || 'code128',
      barcode_width: Number(data.barcode_width) || 2,
      barcode_height: Number(data.barcode_height) || 60,
      barcode_font_size: Number(data.barcode_font_size) || 14,
      barcode_label_width: Number(data.barcode_label_width) || 20,
      barcode_label_height: Number(data.barcode_label_height) || 40,
      huid_enabled: data.huid_enabled === true,
    };

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

    return Response.json({ error: 'Invalid action — settings are created during onboarding' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}