// Professional jewellery tax invoice printer.
// Opens a dedicated print window containing ONLY the invoice (no app chrome),
// so the browser print preview shows just the invoice on A4.
// DATA SOURCE: every value comes from the finalized Bill + BillItem snapshots
// and ShopSettings — never from current ItemMaster/RateHistory. This guarantees
// historical immutability: an old bill prints with the rates, names, weights and
// GST that were snapshotted at the time of sale.
//
// The invoice layout lives in @/lib/invoiceTemplate and is shared by Print, PDF
// and WhatsApp — so all three produce identical output.
import { base44 } from "@/api/base44Client";
import { buildInvoiceDocument } from "@/lib/invoiceTemplate";

// The customer record supplies the address printed in the "Customer Details" block.
async function loadCustomer(bill) {
  if (!bill.customer_id) return null;
  try { return await base44.entities.Customer.get(bill.customer_id); } catch { return null; }
}

export async function printInvoice(bill, items, settings) {
  const w = window.open("", "_blank", "width=820,height=650");
  if (!w) { alert("Please allow popups to print the invoice"); return; }
  if (!items || items.length === 0) { w.close(); alert("No items to print"); return; }

  const customer = await loadCustomer(bill);

  // Customer-facing QR: encodes the public bill URL (token-based, no internal IDs).
  let qrDataUrl = "";
  if (bill.public_token) {
    try {
      const { default: QRCode } = await import("qrcode");
      qrDataUrl = await QRCode.toDataURL(`${window.location.origin}/bill/${bill.public_token}`, { margin: 1, width: 140 });
    } catch { /* QR failed — print without it */ }
  }

  const html = buildInvoiceDocument({ bill, items, shop: settings, customer }, { qrDataUrl });
  w.document.open();
  w.document.write(html);
  w.document.close();
}