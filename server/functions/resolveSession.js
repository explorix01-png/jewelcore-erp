import { createClientFromRequest } from '../shared/createClient.js';
import { entityService } from '../db/entityService.js';

// Resolve Session — called by AuthContext after login or shop switch to determine:
// 1. Is the user authenticated?
// 2. What shops does the user belong to?
// 3. What is the active shop context and user's role in it?
// 4. Does the active shop have today's gold/silver rates configured?
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ authenticated: false });

    // Find all active memberships for this user
    let memberships = await entityService.filter('ShopMembership', {
      user_id: user.id,
      is_active: true
    }, '-created_date', 100).catch(() => []);

    // Email fallback if user_id was missing during invitation
    if (memberships.length === 0 && user.email) {
      memberships = await entityService.filter('ShopMembership', {
        user_email: user.email.toLowerCase(),
        is_active: true
      }, '-created_date', 100).catch(() => []);
    }

    // Collect all shops
    const userShops = [];
    const seenShopIds = new Set();

    for (const m of memberships) {
      const sId = m.tenant_id || m.shop_id;
      if (!sId || seenShopIds.has(sId)) continue;
      seenShopIds.add(sId);

      const shop = await entityService.get('ShopSettings', sId).catch(() => null);
      if (shop) {
        userShops.push({
          id: shop.id,
          shop_name: shop.shop_name,
          logo_url: shop.logo_url || '',
          role: m.role || 'staff',
          onboarding_completed: Boolean(shop.onboarding_completed),
          gold_24k_rate: shop.gold_24k_rate,
          silver_rate: shop.silver_rate,
          default_language: shop.default_language || 'English',
          status: m.status || 'active'
        });
      }
    }

    // If super admin and no memberships found, or for admin discovery, load existing shops
    if (user.role === 'admin' && userShops.length === 0) {
      const allShops = await entityService.list('ShopSettings', '-created_date', 100).catch(() => []);
      for (const s of allShops) {
        if (!seenShopIds.has(s.id)) {
          seenShopIds.add(s.id);
          userShops.push({
            id: s.id,
            shop_name: s.shop_name,
            logo_url: s.logo_url || '',
            role: 'admin',
            onboarding_completed: Boolean(s.onboarding_completed),
            gold_24k_rate: s.gold_24k_rate,
            silver_rate: s.silver_rate,
            default_language: s.default_language || 'English',
            status: 'active'
          });
        }
      }
    }

    if (userShops.length === 0) {
      return Response.json({
        authenticated: true,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, active_shop_role: 'staff' },
        has_shop: false,
        needs_onboarding: true,
        shops: [],
        shop: null,
        rates_today: false,
      });
    }

    // Determine active shop
    const requestedTenantId = req.headers?.['x-tenant-id'] || req.headers?.['x-shop-id'] || base44.tenantId;
    let activeShop = userShops.find(s => s.id === requestedTenantId) || userShops[0];

    // If user is admin and requested a valid shop not in their personal list
    if (!activeShop && user.role === 'admin' && requestedTenantId) {
      const targetShop = await entityService.get('ShopSettings', requestedTenantId).catch(() => null);
      if (targetShop) {
        activeShop = {
          id: targetShop.id,
          shop_name: targetShop.shop_name,
          logo_url: targetShop.logo_url || '',
          role: 'admin',
          onboarding_completed: Boolean(targetShop.onboarding_completed),
          gold_24k_rate: targetShop.gold_24k_rate,
          silver_rate: targetShop.silver_rate,
          default_language: targetShop.default_language || 'English',
          status: 'active'
        };
      }
    }

    if (!activeShop) {
      activeShop = userShops[0];
    }

    // Daily rate gate for active shop
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeRates = await entityService.filter('RateHistory', {
      tenant_id: activeShop.id,
      is_active: true
    }, '-effective_date', 100).catch(() => []);

    const hasGoldToday = activeRates.some(r => r.metal_type === 'gold' && new Date(r.effective_date) >= todayStart);
    const hasSilverToday = activeRates.some(r => r.metal_type === 'silver' && new Date(r.effective_date) >= todayStart);
    const rates_today = hasGoldToday && hasSilverToday;

    return Response.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        active_shop_role: activeShop.role || 'staff',
      },
      has_shop: true,
      rates_today,
      shops: userShops,
      shop: activeShop,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}