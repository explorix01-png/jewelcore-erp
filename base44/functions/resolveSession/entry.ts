import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Resolve Session — called by AuthContext after login to determine:
// 1. Is the user authenticated?
// 2. Does the single business have settings (shop) configured?
// 3. What is the user's role?
// 4. Does the business need onboarding (rate setup)?
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ authenticated: false });

    // Get the single business settings
    const settingsList = await base44.asServiceRole.entities.ShopSettings.list("-created_date", 1);
    const shop = settingsList[0] || null;

    if (!shop) {
      return Response.json({
        authenticated: true,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
        has_shop: false,
        needs_onboarding: true,
      });
    }

    // Resolve role: prefer User.active_shop_role, fallback to ShopMembership.
    // NOTE: is_active is the real gate. We intentionally do NOT filter by status='active'
    // because invited users have status='invited' until manually activated — excluding them
    // here caused invited admins to fall through to the 'staff' default.
    let role = user.active_shop_role || user.data?.active_shop_role || null;
    if (!role) {
      let memberships = await base44.asServiceRole.entities.ShopMembership.filter(
        { user_id: user.id, is_active: true }, '-created_date', 1
      );
      // Email fallback: invited users may have user_id='' if inviteUser didn't return a
      // platform user id (e.g. user already existed and inviteUser threw). Matching by
      // email ensures the selected ShopMembership.role is never lost.
      if (memberships.length === 0 && user.email) {
        memberships = await base44.asServiceRole.entities.ShopMembership.filter(
          { user_email: user.email.toLowerCase(), is_active: true }, '-created_date', 1
        );
      }
      if (memberships.length > 0) {
        role = memberships[0].role;
        await base44.asServiceRole.entities.User.update(user.id, { active_shop_role: role }).catch(() => {});
        // Backfill user_id on the membership if it was missing, so future logins find it directly.
        if (!memberships[0].user_id) {
          await base44.asServiceRole.entities.ShopMembership.update(memberships[0].id, { user_id: user.id }).catch(() => {});
        }
      }
    }

    // Daily rate gate: check if today's approved gold AND silver rates exist
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeRates = await base44.asServiceRole.entities.RateHistory.filter(
      { is_active: true }, '-effective_date', 100
    );
    const hasGoldToday = activeRates.some(r => r.metal_type === 'gold' && new Date(r.effective_date) >= todayStart);
    const hasSilverToday = activeRates.some(r => r.metal_type === 'silver' && new Date(r.effective_date) >= todayStart);
    const rates_today = hasGoldToday && hasSilverToday;

    return Response.json({
      authenticated: true,
      user: {
        id: user.id, email: user.email, full_name: user.full_name, role: user.role,
        active_shop_role: role || 'staff',
      },
      has_shop: true,
      rates_today,
      shop: {
        id: shop.id, shop_name: shop.shop_name, logo_url: shop.logo_url,
        onboarding_completed: shop.onboarding_completed,
        gold_24k_rate: shop.gold_24k_rate,
        silver_rate: shop.silver_rate,
        default_language: shop.default_language,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}