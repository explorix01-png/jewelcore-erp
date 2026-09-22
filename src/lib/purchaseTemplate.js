// Supplier Purchase Copy template — a practical jewellery-shop row bill for the
// supplier/shop owner. Distinct from the customer sales invoice.
// All values come from finalized Purchase + PurchaseItem snapshots + ShopSettings.
import { fmt } from "@/lib/billCalc";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function n(v, d = 3) {
  return Number(v || 0).toFixed(d);
}

export function purchaseStyles(paperSize) {
  const isA5 = paperSize === "A5";
  const pageRule = isA5 ? "size: A5 portrait; margin: 8mm;" : "size: A4 portrait; margin: 12mm;";
  const baseFont = isA5 ? "8.5px" : "10px";
  const pagePad = isA5 ? "8px" : "14px";
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .purchase-page { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${baseFont}; color: #111; padding: ${pagePad}; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
    .header img { max-height: 48px; margin-bottom: 4px; }
    .header h1 { font-size: 19px; font-weight: 700; letter-spacing: 0.3px; }
    .header p { font-size: 10px; color: #444; line-height: 1.4; }
    .badge { display: inline-block; padding: 2px 12px; border: 1.5px solid #111; border-radius: 3px; font-weight: 700; font-size: 11px; letter-spacing: 1px; }
    .copy { display:inline-block; margin-left: 8px; font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 1px; }
    .meta-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .meta-box { flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; }
    .meta-box h3 { font-size: 9px; text-transform: uppercase; color: #777; margin-bottom: 3px; letter-spacing: 0.5px; }
    .meta-box p { line-height: 1.45; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    th { background: #f0f0f0; padding: 5px 3px; font-size: 8.5px; text-transform: uppercase; border: 1px solid #ccc; color: #333; }
    td { padding: 4px 3px; border: 1px solid #ddd; font-size: 9.5px; word-wrap: break-word; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .muted { color: #777; }
    .small { font-size: 8.5px; }
    .totals-row td { background: #fafafa; font-weight: 700; }
    .bottom-grid { display: flex; gap: 10px; margin-top: 6px; }
    .pay-box { flex: 1; }
    .pay-box h3 { font-size: 9px; text-transform: uppercase; color: #777; margin-bottom: 3px; }
    .pay-box table { margin-bottom: 0; }
    .pay-box td { border: 1px solid #ddd; padding: 3px 5px; font-size: 9.5px; }
    .totals { width: 260px; margin-left: auto; }
    .totals td { border: none; padding: 2px 6px; font-size: 10px; }
    .totals .grand { font-weight: 700; font-size: 12px; border-top: 2px solid #111; border-bottom: 2px solid #111; padding: 4px 6px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 26px; page-break-inside: avoid; }
    .sig-box { text-align: center; width: 45%; }
    .sig-line { border-top: 1px solid #111; margin-top: 26px; padding-top: 3px; font-size: 9px; }
    .footer { margin-top: 10px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5px; color: #777; text-align: center; }
    .keep { page-break-inside: avoid; }
    @media print {
      .purchase-page { padding: 0; }
      @page { ${pageRule} }
    }
  `;
}

export function purchaseBody({ purchase, items, shop }) {
  if (!items || items.length === 0) return "<p>No items</p>";
  const dateStr = purchase.purchase_date || "";
  const isGst = purchase.gst_enabled;
  const isInter = purchase.gst_mode === "inter";
  const gstRate = Number(purchase.gst_rate_snapshot || 0);
  const halfRate = (gstRate / 2).toFixed(2);

  const totalQty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalGross = items.reduce((s, it) => s + Number(it.gross_weight || 0) * Number(it.quantity || 0), 0);
  const totalStone = items.reduce((s, it) => s + Number(it.stone_weight || 0) * Number(it.quantity || 0), 0);
  const totalNet = items.reduce((s, it) => s + Number(it.net_weight || 0) * Number(it.quantity || 0), 0);
  const totalFine = items.reduce((s, it) => s + Number(it.fine_weight || 0) * Number(it.quantity || 0), 0);

  const rowsHtml = items.map((it, i) => {
    const qty = Number(it.quantity || 0);
    const lineGross = Number(it.gross_weight || 0) * qty;
    const lineStone = Number(it.stone_weight || 0) * qty;
    const lineNet = Number(it.net_weight || 0) * qty;
    const lineFine = Number(it.fine_weight || 0) * qty;
    const mk = Number(it.making_charge || 0);
    const mkType = it.making_charge_type === "fixed" ? "₹" : it.making_charge_type === "per_gram" ? "₹/g" : "%";
    return `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${esc(it.item_name || "—")}<div class="muted small">${esc(it.purity_display || "")}${it.metal_type ? " · " + esc(it.metal_type) : ""}</div>${it.huid ? `<div class="muted small">HUID: ${esc(it.huid)}</div>` : ""}</td>
      <td class="center">${esc(it.hsn || "—")}</td>
      <td class="center">${qty}</td>
      <td class="right">${n(lineGross)}</td>
      <td class="right">${n(lineStone)}</td>
      <td class="right">${n(lineNet)}</td>
      <td class="right">${n(lineFine)}</td>
      <td class="right">${n(it.rate_per_gram, 0)}</td>
      <td class="right">${n(it.making_amount, 0)}<div class="muted small">${mk}${mkType}</div></td>
      <td class="right">${n(it.taxable_amount, 0)}</td>
      <td class="right">${n(it.gst_amount, 0)}</td>
      <td class="right bold">${n(it.total, 0)}</td>
    </tr>`;
  }).join("");

  const gstTotalsRows = isGst
    ? (isInter
        ? `<tr><td>IGST (${gstRate}%):</td><td class="right">${fmt(purchase.igst)}</td></tr>`
        : `<tr><td>CGST (${halfRate}%):</td><td class="right">${fmt(purchase.cgst)}</td></tr>
           <tr><td>SGST (${halfRate}%):</td><td class="right">${fmt(purchase.sgst)}</td></tr>`)
    : "";

  const paid = Number(purchase.paid_amount || 0);
  const due = Number(purchase.due_amount || 0);

  return `
  <div class="header">
    ${shop?.logo_url ? `<img src="${esc(shop.logo_url)}" />` : ""}
    <h1>${esc(shop?.shop_name || "Jewellery Shop")}</h1>
    <p>${esc(shop?.address || "")}</p>
    <p>${esc(shop?.mobile || "")}${shop?.email ? " · " + esc(shop.email) : ""}</p>
    <p>GSTIN: ${esc(shop?.gst_number || "—")}</p>
    <div><span class="badge">PURCHASE BILL</span><span class="copy">Supplier Copy</span></div>
  </div>

  <div class="meta-row">
    <div class="meta-box">
      <h3>Purchase Details</h3>
      <p><strong>No:</strong> ${esc(purchase.purchase_number)}</p>
      <p><strong>Date:</strong> ${esc(dateStr)}</p>
      <p><strong>Status:</strong> ${esc(purchase.status || "—")}</p>
    </div>
    <div class="meta-box">
      <h3>Supplier Details</h3>
      <p><strong>${esc(purchase.supplier_name || "—")}</strong></p>
      <p>${esc(purchase.supplier_id || "")}</p>
    </div>
  </div>

  <table>
    <colgroup>
      <col style="width:3%"><col style="width:18%"><col style="width:7%"><col style="width:5%">
      <col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:7%"><col style="width:8%">
      <col style="width:9%"><col style="width:7%"><col style="width:6%"><col style="width:9%">
    </colgroup>
    <thead><tr>
      <th>#</th><th>Item / Description</th><th>HSN</th><th>Qty</th>
      <th>Gross Wt</th><th>Less Wt</th><th>Net Wt</th><th>Fine Wt</th><th>Rate/g</th>
      <th>Making</th><th>Taxable</th><th>GST</th><th>Total</th>
    </tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="totals-row">
        <td colspan="3" class="right">Total</td>
        <td class="center">${totalQty}</td>
        <td class="right">${n(totalGross)}</td>
        <td class="right">${n(totalStone)}</td>
        <td class="right">${n(totalNet)}</td>
        <td class="right">${n(totalFine)}</td>
        <td colspan="2" class="right"></td>
        <td class="right">${fmt(purchase.subtotal)}</td>
        <td class="right">${isGst ? fmt(purchase.cgst + purchase.sgst + purchase.igst) : "—"}</td>
        <td class="right">${fmt(purchase.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="bottom-grid">
    <div class="pay-box">
      <h3>Payment Details</h3>
      <table>
        <tr><td><strong>Mode</strong></td><td>${esc(purchase.payment_mode || "—")}</td></tr>
        ${purchase.payment_details ? `<tr><td><strong>Reference</strong></td><td>${esc(purchase.payment_details)}</td></tr>` : ""}
        <tr><td><strong>Amount Paid</strong></td><td class="right">${fmt(paid)}</td></tr>
        ${due > 0 ? `<tr><td><strong>Balance Due</strong></td><td class="right">${fmt(due)}</td></tr>` : ""}
      </table>
    </div>
    <div class="totals keep">
      <table class="totals">
        <tr><td>Subtotal:</td><td class="right">${fmt(purchase.subtotal)}</td></tr>
        ${Number(purchase.making_charge_total) > 0 ? `<tr><td>Making Charges:</td><td class="right">${fmt(purchase.making_charge_total)}</td></tr>` : ""}
        ${Number(purchase.hallmarking_charge_total) > 0 ? `<tr><td>Hallmarking:</td><td class="right">${fmt(purchase.hallmarking_charge_total)}</td></tr>` : ""}
        ${Number(purchase.other_charges) > 0 ? `<tr><td>Other Charges:</td><td class="right">${fmt(purchase.other_charges)}</td></tr>` : ""}
        ${gstTotalsRows}
        <tr class="grand"><td>Grand Total:</td><td class="right">${fmt(purchase.total_amount)}</td></tr>
        <tr><td>Amount Paid:</td><td class="right">${fmt(paid)}</td></tr>
        ${due > 0 ? `<tr><td>Balance Due:</td><td class="right">${fmt(due)}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <div class="signatures keep">
    <div class="sig-box"><div class="sig-line">Supplier Signature</div></div>
    <div class="sig-box"><div class="sig-line">For ${esc(shop?.shop_name || "")}<br>Authorised Signatory</div></div>
  </div>

  <div class="footer">This is a computer-generated purchase bill. · ${esc(shop?.shop_name || "")}</div>
  `;
}

export function buildPurchaseDocument(purchaseData) {
  const { purchase, shop } = purchaseData;
  const paperSize = shop?.invoice_paper_size || "A4";
  const body = purchaseBody(purchaseData);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <title>${esc(purchase.purchase_number)} — Purchase</title>
  <style>${purchaseStyles(paperSize)}</style></head><body>
  <div class="purchase-page">${body}</div>
  <script>window.onload = function() { window.focus(); window.print(); setTimeout(function() { window.close(); }, 800); };</script>
  </body></html>`;
}