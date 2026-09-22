import { useAuth } from "@/lib/AuthContext";

// Permission matrix at module/action level. Enforced in UI via hasPermission; backend RLS can mirror.
const PERMISSIONS = {
  admin: {
    dashboard: ["read"],
    billing: ["read", "create"],
    bills: ["read", "create", "update", "delete", "restore"],
    inventory: ["read", "create", "update", "delete", "adjust"],
    customers: ["read", "create", "update", "delete"],
    suppliers: ["read", "create", "update", "delete"],
    purchase: ["read", "create", "update", "delete"],
    orders: ["read", "create", "update", "delete"],
    karagir: ["read", "create", "update", "delete"],
    rates: ["read", "create", "update"],
    settings: ["read", "update"],
    master: ["read", "create", "update", "delete"],
    admin: ["read", "update"],
    data: ["read", "import", "export"],
    audit: ["read"],
  },
  cashier: {
    dashboard: ["read"],
    billing: ["read", "create"],
    bills: ["read", "create", "update"],
    customers: ["read", "create", "update"],
    inventory: ["read"],
    rates: ["read"],
  },
  staff: {
    dashboard: ["read"],
    billing: ["read", "create"],
    bills: ["read"],
    inventory: ["read", "create", "update", "adjust"],
    customers: ["read", "create", "update"],
    suppliers: ["read", "create", "update"],
    purchase: ["read", "create", "update"],
    orders: ["read", "create", "update"],
    karagir: ["read", "create", "update"],
    rates: ["read"],
  },
};

export function usePermission() {
  const { user } = useAuth();
  const role = user?.active_shop_role || user?.data?.active_shop_role || "staff";
  const perms = PERMISSIONS[role] || {};

  const can = (module, action) => {
    const actions = perms[module];
    return !!actions && actions.includes(action);
  };
  const canAny = (module) => !!perms[module];
  return { can, canAny, role };
}

// Client-side audit logging is DEPRECATED. ActivityLog is now server-only — backend
// business functions (finalizeBill, collectDue, changeRate, etc.) write audit records
// via the service role. This no-op keeps the import surface stable for pages that still
// reference logActivity for non-sensitive client CRUD; those audit entries are deferred
// to future server-side handlers. ActivityLog.create is denied at the data layer (RLS).
export async function logActivity(action, module, recordId, prev, next, reason) {
  // no-op: audit is written server-side by authorized business functions
}