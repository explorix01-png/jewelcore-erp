import { base44 } from "@/api/base44Client";

// Single source of truth for invoice rendering (Print / PDF / WhatsApp).
// Loads ONLY finalized snapshots: Bill + BillItems + Customer + ShopSettings.
// NEVER queries current ItemMaster / GSTConfig / RateHistory / Inventory — this
// guarantees historical immutability: an old bill always renders with the rates,
// names, weights and GST snapshotted at the time of sale.
export async function getFinalizedInvoiceData(billId) {
  const bill = await base44.entities.Bill.get(billId);
  if (!bill) throw new Error("Bill not found");
  const items = await base44.entities.BillItem.filter({ bill_id: billId }, "created_date", 200);
  let customer = null;
  if (bill.customer_id) {
    try { customer = await base44.entities.Customer.get(bill.customer_id); } catch { customer = null; }
  }
  const settingsList = await base44.entities.ShopSettings.list("-created_date", 1);
  return { bill, items: items || [], customer, shop: settingsList[0] || null };
}