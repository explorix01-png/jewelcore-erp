// Server-side role resolution + authorization helper for the single-business ERP.
// The user's role (admin/staff/cashier) comes from the User entity's active_shop_role
// field, which is set during onboarding or invitation. No tenant resolution is needed.
import { canPerform } from "./permissions.ts";

// Resolve the authenticated user's role for the single business.
// Returns { role } or null if no role is assigned.
export async function resolveTenant(base44, user) {
  if (!user || !user.id) return null;
  const role = user.active_shop_role || user.data?.active_shop_role || null;
  if (!role) return null;
  return { role };
}

// Combined authorization: resolve role + check role permission.
// Returns { authorized: true, ctx } or { authorized: false, error, status }.
export async function authorize(base44, user, action) {
  if (!user) return { authorized: false, error: "Unauthorized", status: 401 };

  const ctx = await resolveTenant(base44, user);
  if (!ctx) return { authorized: false, error: "No role assigned. Please contact your admin.", status: 403 };

  if (!canPerform(ctx.role, action)) {
    return { authorized: false, error: `Permission denied: your role (${ctx.role}) cannot perform this action`, status: 403 };
  }

  return { authorized: true, ctx };
}

// Helper to fetch the single business's ShopSettings record.
export async function getSettings(base44) {
  const list = await base44.asServiceRole.entities.ShopSettings.list("-created_date", 1);
  return list[0] || null;
}