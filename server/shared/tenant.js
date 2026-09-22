// Server-side role resolution + authorization helper for multi-tenant ERP.
// Each user can belong to one or more shops via ShopMembership.
import { canPerform } from "./permissions.js";
import { entityService } from "../db/entityService.js";

// Resolve the authenticated user's role and tenant context.
// Returns { role, tenant_id, shop_id, shop_name, is_super_admin } or null.
export async function resolveTenant(base44, user, requestedTenantId = null) {
  if (!user || !user.id) return null;

  const targetTenantId = requestedTenantId || base44?.tenantId || null;

  // 1. If a specific tenant is requested, verify the user's active membership in it
  if (targetTenantId) {
    const memberships = await entityService.filter('ShopMembership', {
      user_id: user.id,
      tenant_id: String(targetTenantId),
      is_active: true
    }, '-created_date', 1).catch(() => []);

    if (memberships.length > 0 && memberships[0].status !== 'inactive') {
      return {
        role: memberships[0].role || 'staff',
        tenant_id: String(targetTenantId),
        shop_id: String(targetTenantId),
        shop_name: memberships[0].shop_name || '',
        is_super_admin: user.role === 'admin'
      };
    }

    // Platform super-admin can administer any valid shop
    if (user.role === 'admin') {
      const shop = await entityService.get('ShopSettings', targetTenantId).catch(() => null);
      if (shop) {
        return {
          role: 'admin',
          tenant_id: String(targetTenantId),
          shop_id: String(targetTenantId),
          shop_name: shop.shop_name || '',
          is_super_admin: true
        };
      }
    }

    // Tenant requested was not authorized for this non-admin user
    return null;
  }

  // 2. If no specific tenant requested, find the user's primary/active membership
  const memberships = await entityService.filter('ShopMembership', {
    user_id: user.id,
    is_active: true
  }, '-created_date', 1).catch(() => []);

  if (memberships.length > 0 && memberships[0].status !== 'inactive') {
    const m = memberships[0];
    const tid = m.tenant_id || m.shop_id;
    return {
      role: m.role || 'staff',
      tenant_id: String(tid),
      shop_id: String(tid),
      shop_name: m.shop_name || '',
      is_super_admin: user.role === 'admin'
    };
  }

  // 3. Fallback for platform super-admin if no membership exists yet
  if (user.role === 'admin') {
    const shops = await entityService.list('ShopSettings', '-created_date', 1).catch(() => []);
    if (shops.length > 0) {
      return {
        role: 'admin',
        tenant_id: String(shops[0].id),
        shop_id: String(shops[0].id),
        shop_name: shops[0].shop_name || '',
        is_super_admin: true
      };
    }
  }

  // 4. Default user active_shop_role fallback if single tenant
  if (user.active_shop_role) {
    return {
      role: user.active_shop_role,
      tenant_id: null,
      shop_id: null,
      shop_name: '',
      is_super_admin: user.role === 'admin'
    };
  }

  return null;
}

// Combined authorization: resolve role + check role permission within active tenant.
// Returns { authorized: true, ctx } or { authorized: false, error, status }.
export async function authorize(base44, user, action) {
  if (!user) return { authorized: false, error: "Unauthorized", status: 401 };

  const ctx = await resolveTenant(base44, user);
  if (!ctx) return { authorized: false, error: "No active shop membership found. Please select or join a shop.", status: 403 };

  if (!canPerform(ctx.role, action)) {
    return { authorized: false, error: `Permission denied: your role (${ctx.role}) cannot perform this action`, status: 403 };
  }

  return { authorized: true, ctx };
}

// Helper to fetch the current tenant's ShopSettings record.
export async function getSettings(base44) {
  if (base44?.tenantId) {
    const shop = await base44.asServiceRole.entities.ShopSettings.get(base44.tenantId).catch(() => null);
    if (shop) return shop;
    const list = await base44.asServiceRole.entities.ShopSettings.filter({ tenant_id: base44.tenantId }, "-created_date", 1).catch(() => []);
    if (list.length > 0) return list[0];
  }
  const list = await base44.asServiceRole.entities.ShopSettings.list("-created_date", 1).catch(() => []);
  return list[0] || null;
}
