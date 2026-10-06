import { createClientFromRequest } from '../shared/createClient.js';
import { writeAudit } from '../shared/audit.js';
import { str } from '../shared/utils.js';
import { db } from '../db/database.js';
import { entityService } from '../db/entityService.js';
import crypto from 'node:crypto';

// Onboard Shop — creates a new isolated jewellery business (tenant).
// Creates ShopSettings, admin ShopMembership, and default master configurations.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const shopName = str(body.shop_name);
    if (!shopName) return Response.json({ error: 'Shop name is required' }, { status: 400 });

    const shopId = crypto.randomUUID();

    // Create ShopSettings for the new tenant
    const shop = await entityService.create('ShopSettings', {
      id: shopId,
      tenant_id: shopId,
      shop_name: shopName,
      owner_name: str(body.owner_name),
      address: str(body.address),
      state: str(body.state),
      city: str(body.city),
      pincode: str(body.pincode),
      mobile: str(body.mobile),
      email: str(body.email),
      gst_number: str(body.gst_number),
      logo_url: str(body.logo_url),
      invoice_prefix: str(body.invoice_prefix) || 'INV',
      currency: str(body.currency) || '₹',
      default_language: str(body.default_language) || 'English',
      business_type: str(body.business_type) || 'retail',
      onboarding_completed: false,
      invoice_sequence: 1,
    });

    // Create admin ShopMembership for the creator
    const membership = await entityService.create('ShopMembership', {
      user_id: user.id,
      user_email: user.email || '',
      user_name: user.full_name || '',
      tenant_id: shopId,
      shop_id: shopId,
      shop_name: shopName,
      role: 'admin',
      is_active: true,
      status: 'active',
      joined_date: new Date().toISOString(),
    });

    // Update user active role
    await entityService.update('User', user.id, {
      active_shop_role: 'admin',
      onboarding_completed: false,
    }).catch(() => {});

    try {
      await db.query("UPDATE _auth_users SET active_shop_role = 'admin' WHERE id = $1", [user.id]);
    } catch (e) {}

    // Seed default gold and silver purities for this tenant
    const defaultPurities = [
      { name: '24K', metal_type: 'gold', purity_value: 99.9, display_format: '24K', tenant_id: shopId, is_active: true },
      { name: '22K', metal_type: 'gold', purity_value: 91.6, display_format: '22K', tenant_id: shopId, is_active: true },
      { name: '20K', metal_type: 'gold', purity_value: 83.3, display_format: '20K', tenant_id: shopId, is_active: true },
      { name: '18K', metal_type: 'gold', purity_value: 75.0, display_format: '18K', tenant_id: shopId, is_active: true },
      { name: '14K', metal_type: 'gold', purity_value: 58.5, display_format: '14K', tenant_id: shopId, is_active: true },
      { name: 'Silver 999', metal_type: 'silver', purity_value: 99.9, display_format: '999', tenant_id: shopId, is_active: true }
    ];
    for (const p of defaultPurities) {
      await entityService.create('PurityMaster', p);
    }

    // Default GST config for this tenant (3%)
    await entityService.create('GSTConfig', {
      tenant_id: shopId,
      name: 'Standard GST (3%)',
      gst_rate: 3,
      cgst_rate: 1.5,
      sgst_rate: 1.5,
      igst_rate: 3,
      is_active: true,
      applicable_from: new Date().toISOString().slice(0, 10),
    });

    await writeAudit(base44, {
      action: 'onboard', module: 'shop', record_id: shop.id,
      new_value: { shop_name: shopName, owner: str(body.owner_name), tenant_id: shopId },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: 'admin',
    });

    return Response.json({
      success: true,
      shop_id: shop.id,
      tenant_id: shop.id,
      shop_name: shopName,
      membership_id: membership.id,
      role: 'admin'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}