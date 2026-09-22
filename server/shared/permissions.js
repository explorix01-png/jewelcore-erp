// Server-side ACTION permission map. Authoritative for backend business functions.
// Default-deny: any role/action not listed here is denied by the functions.
// Roles are per-shop (admin/staff/cashier) from ShopMembership.
export const ROLE_ACTIONS = {
  admin: [
    "finalizeBill", "finalizePurchase", "collectDue",
    "cancelBill",
    "processReturn", "processExchange", "adjustStock",
    "changeRate", "restoreRecord",
    "reconcileTransactions",
    "manageUsers", "manageMasters", "manageSettings", "manageItems",
    "manageCustomer", "manageSupplier",
    "manageOrder", "manageKaragir",
    "manageData",
    "importData", "exportData",
    "onboardShop", "inviteUser", "manageMembers",
    "manageWhatsApp",
  ],
  staff: [
    "finalizeBill", "finalizePurchase", "collectDue", "adjustStock",
    "manageItems",
    "manageCustomer", "manageSupplier",
    "manageOrder", "manageKaragir",
    "manageWhatsApp",
  ],
  cashier: [
    "finalizeBill", "collectDue",
    "manageCustomer",
    "manageWhatsApp",
  ],
};

export function canPerform(role, action) {
  if (!role) return false;
  const actions = ROLE_ACTIONS[role];
  return !!actions && actions.includes(action);
}
