// Reusable jewellery tax-invoice template — shared by Print, PDF and WhatsApp.
// All values come from finalized Bill + BillItem snapshots + ShopSettings.
// This module NEVER recalculates the bill; it only formats snapshotted values.
import { amountToWords } from "@/lib/amountToWords";
import { fmt } from "@/lib/billCalc";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function n(v, d = 3) {
  return Number(v || 0).toFixed(d);
}

// Full CSS for the invoice. Scoped under `.invoice-page` so the same styles
// apply whether rendered in a print window (<body class>) or an offscreen PDF container.
export function invoiceStyles(paperSize) {
  const isA5 = paperSize === "A5";
  const pageRule = isA5 ? "size: A5 portrait; margin: 8mm;" : "size: A4 portrait; margin: 12mm;";
  const baseFont = isA5 ? "8.5px" : "10px";
  const pagePad = isA5 ? "8px" : "14px";
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .invoice-page { font-family: 'Segoe UI', Arial, sans-serif; font-size: ${baseFont}; color: #111; padding: ${pagePad}; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
    .header img { max-height: 48px; margin-bottom: 4px; }
    .header h1 { font-size: 19px; font-weight: 700; letter-spacing: 0.3px; }
    .header p { font-size: 10px; color: #444; line-height: 1.4; overflow-wrap: break-word; }
    .badge-row { margin-top: 5px; }
    .badge { display: inline-block; padding: 2px 12px; border: 1.5px solid #111; border-radius: 3px; font-weight: 700; font-size: 11px; letter-spacing: 1px; }
    .copy { display:inline-block; margin-left: 8px; font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 1px; }
    .rate-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; padding: 5px 8px; margin-bottom: 8px; font-size: 10px; }
    .rate-group { display: flex; flex-wrap: wrap; gap: 3px 10px; align-items: baseline; }
    .rate-group strong { margin-right: 2px; white-space: nowrap; }
    .rate-bar span { white-space: nowrap; }
    .meta-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .meta-box { flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; }
    .meta-box h3 { font-size: 9px; text-transform: uppercase; color: #777; margin-bottom: 3px; letter-spacing: 0.5px; }
    .meta-box p { line-height: 1.45; font-size: 10px; overflow-wrap: break-word; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    th { background: #f0f0f0; padding: 5px 3px; font-size: 8.5px; text-transform: uppercase; border: 1px solid #ccc; color: #333; }
    td { padding: 4px 3px; border: 1px solid #ddd; font-size: 9.5px; line-height: 1.35; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; }
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
    .totals { width: 55%; max-width: 280px; min-width: 200px; margin-left: auto; }
    .totals td { border: none; padding: 2px 6px; font-size: 10px; }
    .totals .grand { font-weight: 700; font-size: 12px; border-top: 2px solid #111; border-bottom: 2px solid #111; padding: 4px 6px; }
    .words { font-style: italic; padding: 6px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; margin: 6px 0; font-size: 10px; overflow-wrap: break-word; word-break: break-word; }
    .terms { margin-top: 8px; font-size: 8.5px; color: #555; }
    .terms h3 { font-size: 9px; text-transform: uppercase; margin-bottom: 3px; color: #333; }
    .terms ol { padding-left: 14px; line-height: 1.5; overflow-wrap: break-word; word-break: break-word; }
    .signatures { display: flex; justify-content: space-between; margin-top: 26px; page-break-inside: avoid; }
    .sig-box { text-align: center; width: 45%; }
    .sig-line { border-top: 1px solid #111; margin-top: 26px; padding-top: 3px; font-size: 9px; }
    .qr-box { text-align: center; margin-top: 10px; page-break-inside: avoid; }
    .qr-box img { border: 1px solid #ddd; padding: 3px; border-radius: 3px; }
    .qr-label { font-size: 8.5px; color: #555; margin-top: 3px; }
    .footer { margin-top: 10px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5px; color: #777; text-align: center; }
    .keep { page-break-inside: avoid; }
    @media print {
      .invoice-page { padding: 0; }
      @page { ${pageRule} }
    }
  `;
}

// Build the invoice body HTML from finalized snapshot data.
// { bill, items, shop, customer } + { qrDataUrl }
export function invoiceBody({ bill, items, shop, customer }, opts = {}) {
  const settings = shop;
  const qrDataUrl = opts.qrDataUrl || "";
  if (!items || items.length === 0) return "<p>No items</p>";

  const isGst = bill.gst_enabled && bill.gst_mode !== "none";
  const isInter = bill.gst_mode === "inter";
  const dateStr = new Date(bill.bill_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const gstRate = Number(bill.gst_rate_snapshot || 0);
  const halfRate = (gstRate / 2).toFixed(2);

  const totalQty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalGross = items.reduce((s, it) => s + Number(it.gross_weight || 0) * Number(it.quantity || 0), 0);
  const totalStone = items.reduce((s, it) => s + Number(it.stone_weight || 0) * Number(it.quantity || 0), 0);
  const totalNet = items.reduce((s, it) => s + Number(it.net_weight || 0) * Number(it.quantity || 0), 0);
  const totalMaking = items.reduce((s, it) => s + Number(it.making_amount || 0), 0);
  const totalTaxable = items.reduce((s, it) => s + Number(it.taxable_amount || 0), 0);
  const totalGstAmt = items.reduce((s, it) => s + Number(it.gst_amount || 0), 0);
  const itemDisc = items.reduce((s, it) => s + Number(it.discount || 0), 0);
  const billDisc = Number(bill.discount || 0);
  const totalDisc = itemDisc + billDisc;

  let rateBar = "";
  try {
    const snap = JSON.parse(bill.rate_snapshot || "[]");
    const gold = snap.filter((r) => r.metal === "gold");
    const silver = snap.filter((r) => r.metal === "silver");
    if (gold.length || silver.length) {
      const goldHtml = gold.length
        ? `<div class="rate-group"><strong>Gold:</strong> ${gold.map((r) =>
            `<span>${esc(r.purity || "")} ₹${n(r.rate, 0)}/g</span>`
          ).join("")}</div>`
        : "";
      const silverHtml = silver.length
        ? `<div class="rate-group"><strong>Silver:</strong> ${silver.map((r) =>
            `<span>${esc(r.purity || "")} ₹${n(r.rate, 0)}/g</span>`
          ).join("")}</div>`
        : "";
      rateBar = `<div class="rate-bar">${goldHtml}${silverHtml}</div>`;
    }
  } catch { /* ignore */ }

  const payMode = bill.payment_mode || "—";
  const payRef = bill.payment_details || "";
  const paid = Number(bill.paid_amount || 0);
  const due = Number(bill.due_amount || 0);

  const rowsHtml = items.map((it, i) => {
    const qty = Number(it.quantity || 0);
    const lineGross = Number(it.gross_weight || 0) * qty;
    const lineStone = Number(it.stone_weight || 0) * qty;
    const lineNet = Number(it.net_weight || 0) * qty;
    const mk = Number(it.making_charge || 0);
    const mkType = it.making_charge_type === "fixed" ? "₹" : "%";
    return `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${esc(it.item_name || "—")}<div class="muted small">${esc(it.purity_display || "")}${it.metal_type ? " · " + esc(it.metal_type) : ""}</div>${it.huid ? `<div class="muted small">HUID: ${esc(it.huid)}</div>` : ""}</td>
      <td class="center">${esc(it.hsn || "—")}</td>
      <td class="center">${qty}</td>
      <td class="right">${n(lineGross)}</td>
      <td class="right">${n(lineStone)}</td>
      <td class="right">${n(lineNet)}</td>
      <td class="right">${n(it.rate_per_gram, 0)}</td>
      <td class="right">${n(it.making_amount, 0)}<div class="muted small">${mk}${mkType}</div></td>
      <td class="right">${n(it.discount, 0)}</td>
      <td class="right">${n(it.gst_amount, 0)}</td>
      <td class="right bold">${n(it.total, 0)}</td>
    </tr>`;
  }).join("");

  const gstTotalsRows = isGst
    ? (isInter
        ? `<tr><td>IGST (${gstRate}%):</td><td class="right">${fmt(bill.igst)}</td></tr>`
        : `<tr><td>CGST (${halfRate}%):</td><td class="right">${fmt(bill.cgst)}</td></tr>
           <tr><td>SGST (${halfRate}%):</td><td class="right">${fmt(bill.sgst)}</td></tr>`)
    : "";

  return `
  <div class="header">
    ${settings?.logo_url ? `<img src="${esc(settings.logo_url)}" />` : ""}
    <h1>${esc(settings?.shop_name || "Jewellery Shop")}</h1>
    <p>${esc(settings?.address || "")}</p>
    <p>${esc(settings?.mobile || "")}${settings?.email ? " · " + esc(settings.email) : ""}</p>
    <p>GSTIN: ${esc(settings?.gst_number || "—")} · State: ${esc(settings?.state || "—")}</p>
    <div class="badge-row"><span class="badge">${isGst ? "TAX INVOICE" : "INVOICE"}</span><span class="copy">Customer Copy</span></div>
  </div>

  ${rateBar}

  <div class="meta-row">
    <div class="meta-box">
      <h3>Invoice Details</h3>
      <p><strong>No:</strong> ${esc(bill.bill_number)}</p>
      <p><strong>Date:</strong> ${dateStr}</p>
      <p><strong>Type:</strong> ${bill.bill_source === "manual" ? "Manual" : bill.bill_source === "customer_purchase" ? "Customer Purchase" : "Inventory"} Sale</p>
    </div>
    <div class="meta-box">
      <h3>Customer Details</h3>
      <p><strong>${esc(bill.customer_name)}</strong></p>
      <p>${esc(bill.customer_mobile || "")}</p>
      ${bill.customer_gst_number ? `<p>GSTIN: ${esc(bill.customer_gst_number)}</p>` : ""}
      ${bill.customer_state ? `<p>State: ${esc(bill.customer_state)}</p>` : ""}
      ${bill.aadhaar_number ? `<p>Aadhaar: ${esc(bill.aadhaar_number)}</p>` : ""}
      ${bill.pan_number ? `<p>PAN: ${esc(bill.pan_number)}</p>` : ""}
    </div>
  </div>

  <table>
    <colgroup>
      <col style="width:3%"><col style="width:22%"><col style="width:7%"><col style="width:5%">
      <col style="width:8%"><col style="width:7%"><col style="width:8%"><col style="width:8%">
      <col style="width:9%"><col style="width:6%"><col style="width:7%"><col style="width:10%">
    </colgroup>
    <thead><tr>
      <th>#</th><th>Item / Description</th><th>HSN</th><th>Qty</th>
      <th>Gross Wt</th><th>Less Wt</th><th>Net Wt</th><th>Rate/g</th>
      <th>Making</th><th>Disc</th><th>GST</th><th>Total</th>
    </tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="totals-row">
        <td colspan="3" class="right">Total</td>
        <td class="center">${totalQty}</td>
        <td class="right">${n(totalGross)}</td>
        <td class="right">${n(totalStone)}</td>
        <td class="right">${n(totalNet)}</td>
        <td colspan="2" class="right">Making: ${fmt(totalMaking)}</td>
        <td class="right">${fmt(totalDisc)}</td>
        <td class="right">${fmt(totalGstAmt)}</td>
        <td class="right">${fmt(bill.total_amount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="bottom-grid">
    <div class="pay-box">
      <h3>Payment Details</h3>
      <table>
        <tr><td><strong>Mode</strong></td><td>${esc(payMode)}</td></tr>
        ${payRef ? `<tr><td><strong>Reference</strong></td><td>${esc(payRef)}</td></tr>` : ""}
        <tr><td><strong>Amount Paid</strong></td><td class="right">${fmt(paid)}</td></tr>
        ${due > 0 ? `<tr><td><strong>Balance Due</strong></td><td class="right">${fmt(due)}</td></tr>` : ""}
      </table>
      <div class="terms" style="margin-top:8px;">
        <h3>Terms &amp; Conditions</h3>
        <ol>
          <li>Goods once sold will not be taken back or exchanged without prior approval.</li>
          <li>Metal value is based on the rate per gram applicable on the date of invoice.</li>
          <li>Making charges and wastage are charged as per the design and craftsmanship.</li>
          <li>GST is charged as per applicable rates under the prevailing tax law.</li>
          <li>All weights are approximate and subject to BIS hallmarking standards.</li>
          <li>Any dispute is subject to local jurisdiction only.</li>
        </ol>
      </div>
    </div>
    <div class="totals keep">
      <table class="totals">
        <tr><td>Subtotal:</td><td class="right">${fmt(bill.subtotal)}</td></tr>
        ${totalDisc > 0 ? `<tr><td>Discount:</td><td class="right">−${fmt(totalDisc)}</td></tr>` : ""}
        ${Number(bill.other_charges) > 0 ? `<tr><td>Other Charges:</td><td class="right">${fmt(bill.other_charges)}</td></tr>` : ""}
        ${Number(bill.hallmarking_charge) > 0 ? `<tr><td>Hallmarking:</td><td class="right">${fmt(bill.hallmarking_charge)}</td></tr>` : ""}
        ${gstTotalsRows}
        <tr class="grand"><td>Grand Total:</td><td class="right">${fmt(bill.total_amount)}</td></tr>
        <tr><td>Amount Paid:</td><td class="right">${fmt(paid)}</td></tr>
        ${due > 0 ? `<tr><td>Balance Due:</td><td class="right">${fmt(due)}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <div class="words keep"><strong>Amount in Words:</strong> ${amountToWords(bill.total_amount)}</div>

  <div class="signatures keep">
    <div class="sig-box"><div class="sig-line">Customer Signature</div></div>
    <div class="sig-box"><div class="sig-line">For ${esc(settings?.shop_name || "")}<br>Authorised Signatory</div></div>
  </div>

  ${qrDataUrl ? `<div class="qr-box keep"><img src="${qrDataUrl}" width="90" height="90" /><div class="qr-label">Scan to View Bill Details</div></div>` : ""}
  <div class="footer">This is a computer-generated invoice and does not require a physical signature. · ${esc(settings?.shop_name || "")}</div>
  `;
}

// Full standalone HTML document (for the print window).
export function buildInvoiceDocument(invoiceData, opts = {}) {
  const { bill, shop } = invoiceData;
  const paperSize = shop?.invoice_paper_size || "A4";
  const body = invoiceBody(invoiceData, opts);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <title>${esc(bill.bill_number)} — ${esc(shop?.shop_name || "Invoice")}</title>
  <style>${invoiceStyles(paperSize)}</style></head><body>
  <div class="invoice-page">${body}</div>
  <script>window.onload = function() { window.focus(); window.print(); setTimeout(function() { window.close(); }, 800); };</script>
  </body></html>`;
}