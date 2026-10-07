import { getSettings } from '../shared/tenant.js';

const MAX_BILLS_SCANNED = 10000;

// Data access for invoice numbering. Queries only — no business rules.
//
// "Active" means not deleted. A deleted bill keeps its record (and its number)
// for the audit trail, but no longer holds the number: it can be issued again.
// Cancelled bills are still active — a cancelled invoice keeps its number.
export function createBillNumberRepository(base44) {
  const entities = base44.asServiceRole.entities;

  return {
    getShopSettings: () => getSettings(base44),

    async findActiveBillByNumber(billNumber) {
      const rows = await entities.Bill.filter({ bill_number: billNumber, is_deleted: { $ne: true } }, '-created_date', 1);
      return rows[0] || null;
    },

    async listActiveBillNumbers() {
      const rows = await entities.Bill.filter({ is_deleted: { $ne: true } }, '-created_date', MAX_BILLS_SCANNED);
      return rows.map((bill) => bill.bill_number);
    },

    updateInvoiceSequence: (settingsId, sequence) => entities.ShopSettings.update(settingsId, { invoice_sequence: sequence }),
  };
}
