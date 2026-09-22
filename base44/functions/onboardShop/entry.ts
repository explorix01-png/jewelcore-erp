import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Onboard Shop — first-time single-business setup.
// Creates ShopSettings, admin ShopMembership, default masters.
// Only ONE shop can exist for the entire business.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Check if a shop already exists (single-business model)
    const existingShops = await base44.asServiceRole.entities.ShopSettings.list("-created_date", 1);
    if (existingShops.length > 0) {
      return Response.json({ error: 'Shop already set up for this business' }, { status: 400 });
    }

    const body = await req.json();
    const shopName = str(body.shop_name);
    if (!shopName) return Response.json({ error: 'Shop name is required' }, { status: 400 });

    // Create ShopSettings (single business config)
    const shop = await base44.asServiceRole.entities.ShopSettings.create({
      shop_name: shopName, owner_name: str(body.owner_name),
      address: str(body.address), state: str(body.state), city: str(body.city), pincode: str(body.pincode),
      mobile: str(body.mobile), email: str(body.email), gst_number: str(body.gst_number),
      logo_url: str(body.logo_url), invoice_prefix: str(body.invoice_prefix) || 'INV',
      currency: str(body.currency) || '₹', default_language: str(body.default_language) || 'English',
      business_type: str(body.business_type) || 'retail',
      onboarding_completed: false, invoice_sequence: 1,
    });

    // Create admin ShopMembership (for user management)
    const membership = await base44.asServiceRole.entities.ShopMembership.create({
      user_id: user.id, user_email: user.email || '', user_name: user.full_name || '',
      shop_name: shopName, role: 'admin',
      is_active: true, status: 'active', joined_date: new Date().toISOString(),
    });

    // Set user's role
    await base44.asServiceRole.entities.User.update(user.id, {
      active_shop_role: 'admin', onboarding_completed: false,
    }).catch(() => {});

    // Create default gold purities
    const defaultPurities = [
      { name: '24K', metal_type: 'gold', purity_value: 24, display_format: '24K' },
      { name: '22K', metal_type: 'gold', purity_value: 22, display_format: '22K' },
      { name: '20K', metal_type: 'gold', purity_value: 20, display_format: '20K' },
      { name: '18K', metal_type: 'gold', purity_value: 18, display_format: '18K' },
      { name: '14K', metal_type: 'gold', purity_value: 14, display_format: '14K' },
    ];
    for (const p of defaultPurities) {
      await base44.asServiceRole.entities.PurityMaster.create({ ...p, is_active: true });
    }

    // Default GST config (3%)
    await base44.asServiceRole.entities.GSTConfig.create({
      name: 'Standard GST', gst_rate: 3, cgst_rate: 1.5, sgst_rate: 1.5, igst_rate: 3,
      is_active: true, applicable_from: new Date().toISOString().slice(0, 10),
    });

    await writeAudit(base44, {
      action: 'onboard', module: 'shop', record_id: shop.id,
      new_value: { shop_name: shopName, owner: str(body.owner_name) },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: 'admin',
    });

    return Response.json({ success: true, shop_id: shop.id, shop_name: shopName, membership_id: membership.id, role: 'admin' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}