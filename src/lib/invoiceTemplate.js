// Reusable jewellery tax-invoice template — shared by Print, PDF and WhatsApp.
// Layout follows the standard jewellery retail tax invoice: brand header, seller
// and customer blocks, standard-rate line, itemised table (weights, gross product
// price, making charges, discount, SGST/CGST, product value), payment details,
// net invoice value, notes and signatures.
// All values come from the finalized Bill + BillItem snapshots + ShopSettings.
// This module NEVER recalculates the bill; it only formats snapshotted values.
import { amountToWords } from "@/lib/amountToWords";
import { fmtNum } from "@/lib/billCalc";
import { paymentModeLabel } from "@/lib/paymentModes";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const num = (v) => Number(v) || 0;
const weight = (v) => num(v).toFixed(3);
const money = (v) => fmtNum(v);
const roundCents = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Full CSS for the invoice. Scoped under `.invoice-page` so the same styles
// apply whether rendered in a print window (<body class>) or an offscreen PDF container.
export function invoiceStyles(paperSize) {
  const isA5 = paperSize === "A5";
  const pageRule = isA5 ? "size: A5 portrait; margin: 8mm;" : "size: A4 portrait; margin: 10mm;";
  const baseFont = isA5 ? "7.5px" : "9.5px";
  const cellFont = isA5 ? "7px" : "8.5px";
  const brandFont = isA5 ? "16px" : "24px";
  const pagePad = isA5 ? "6px" : "10px";
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .invoice-page { font-family: Arial, 'Segoe UI', sans-serif; font-size: ${baseFont}; color: #000; padding: ${pagePad}; background: #fff; line-height: 1.35; }
    .top-line { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2px; font-size: ${cellFont}; }
    .copy { font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .brand { text-align: center; padding: 4px 0 8px; }
    .brand img { max-height: 46px; display: block; margin: 0 auto 3px; }
    .brand h1 { font-size: ${brandFont}; font-weight: 400; letter-spacing: 7px; text-transform: uppercase; }
    .frame { border: 1px solid #000; }
    .frame-head { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; border-bottom: 1px solid #000; }
    .frame-head .title { font-weight: 700; font-size: ${isA5 ? "9px" : "11px"}; letter-spacing: 0.3px; }
    .frame-head .doc { font-weight: 700; text-align: right; }
    .party { display: flex; gap: 10px; padding: 5px 8px; border-bottom: 1px solid #000; }
    .party > div { flex: 1; overflow-wrap: anywhere; }
    .party h3 { font-size: ${cellFont}; font-weight: 700; margin-bottom: 1px; }
    .party .name { font-weight: 700; text-transform: uppercase; }
    .rate-line { padding: 3px 6px; border-bottom: 1px solid #000; font-weight: 700; font-size: ${cellFont}; overflow-wrap: anywhere; }
    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.items th, table.items td { border: 1px solid #000; padding: 3px 3px; font-size: ${cellFont}; text-align: center; vertical-align: top; overflow-wrap: anywhere; line-height: 1.3; }
    table.items th { font-weight: 700; vertical-align: middle; }
    table.items th small { display: block; font-weight: 400; font-size: ${isA5 ? "6px" : "7.5px"}; }
    table.items td.left, table.items th.left { text-align: left; }
    table.items td.right { text-align: right; }
    table.items tbody tr { page-break-inside: avoid; }
    table.items tr.total-row td { font-weight: 700; }
    thead { display: table-header-group; }
    .muted { color: #444; }
    .tiny { font-size: ${isA5 ? "6px" : "7.5px"}; }
    .qty-line { display: flex; justify-content: space-between; padding: 3px 6px; border-bottom: 1px solid #000; font-weight: 700; }
    .settle { display: flex; border-bottom: 1px solid #000; page-break-inside: avoid; }
    .settle .left { flex: 1.15; border-right: 1px solid #000; }
    .settle .right { flex: 1; }
    .block-title { font-weight: 700; padding: 3px 6px; border-bottom: 1px solid #000; }
    table.pay { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.pay th, table.pay td { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 3px 5px; font-size: ${cellFont}; text-align: left; }
    table.pay th:last-child, table.pay td:last-child { border-right: none; text-align: right; }
    table.pay td.num, table.pay th.num { text-align: right; }
    table.pay tr.strong td { font-weight: 700; }
    table.pay tr:last-child td { border-bottom: none; }
    .kv { display: flex; justify-content: space-between; gap: 8px; padding: 2px 6px; }
    .kv.strong { font-weight: 700; border-top: 1px solid #000; padding-top: 3px; }
    .kv.boxed { font-weight: 700; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 6px; margin-top: 3px; }
    .kv.sub { padding-left: 14px; }
    .heading { font-weight: 700; padding: 3px 6px 0; }
    .words { padding: 4px 6px; border-top: 1px solid #000; font-weight: 700; }
    .notes-row { display: flex; gap: 10px; padding: 5px 8px; border-bottom: 1px solid #000; page-break-inside: avoid; }
    .notes-row ol { flex: 1; padding-left: 13px; font-size: ${isA5 ? "6.5px" : "7.5px"}; line-height: 1.45; overflow-wrap: anywhere; }
    .qr-box { text-align: center; width: 84px; }
    .qr-box img { width: 80px; height: 80px; border: 1px solid #ddd; padding: 2px; }
    .qr-label { font-size: 6.5px; color: #333; margin-top: 2px; }
    .agree { font-weight: 700; padding: 3px 6px; border-bottom: 1px solid #000; }
    .signatures { display: flex; justify-content: space-between; padding: 5px 8px 6px; page-break-inside: avoid; min-height: 52px; }
    .signatures .sig { width: 48%; }
    .signatures .sig.right { text-align: right; }
    .sig-space { height: 28px; }
    .footer { margin-top: 6px; font-size: ${isA5 ? "6px" : "7.5px"}; color: #333; text-align: center; overflow-wrap: anywhere; }
    .keep { page-break-inside: avoid; }
    @media print {
      .invoice-page { padding: 0; }
      @page { ${pageRule} }
    }
  `;
}

// ---------- data shaping (formatting only — never recalculating the bill) ----------

// One entry per metal+purity (the saved snapshot can hold several batches, newest first).
function snapshotRates(bill) {
  const rows = parseJson(bill.rate_snapshot, {});
  const list = Array.isArray(rows) ? rows : (rows.rates || []);
  const seen = new Set();
  return list.filter((r) => {
    const key = `${r.metal}|${r.purity}`;
    if (seen.has(key) || !(num(r.rate) > 0)) return false;
    seen.add(key);
    return true;
  });
}

function rateLine(bill) {
  const rates = snapshotRates(bill);
  const byKarat = (a, b) => (parseFloat(b.purity) || 0) - (parseFloat(a.purity) || 0);
  const gold = rates.filter((r) => r.metal === "gold").sort(byKarat);
  const silver = rates.filter((r) => r.metal === "silver");
  const parts = [];
  if (gold.length) {
    const names = gold.map((r) => String(r.purity || "").replace(/k$/i, " Karat")).join("/");
    parts.push(`Standard Rate of ${esc(names)} Gold Rs: ${gold.map((r) => money(r.rate)).join(" Rs/")} Rs`);
  }
  if (silver.length) {
    parts.push(`Standard Rate of ${esc(silver.map((r) => r.purity).join("/"))} Silver Rs: ${silver.map((r) => money(r.rate)).join(" Rs/")} Rs`);
  }
  return parts.length ? `<div class="rate-line">${parts.join(" &nbsp;·&nbsp; ")}</div>` : "";
}

// Per-line figures from the BillItem snapshot. Gross Product Price is metal value
// + making (+ wastage) — i.e. taxable amount before hallmarking and discount.
function lineFigures(it, isInter) {
  const qty = num(it.quantity);
  const hallmarking = num(it.hallmarking_charge) * qty;
  const gst = num(it.gst_amount);
  const half = roundCents(gst / 2);
  return {
    qty,
    gross: num(it.gross_weight) * qty,
    stone: num(it.stone_weight) * qty,
    net: num(it.net_weight) * qty,
    hallmarking,
    grossPrice: num(it.taxable_amount) + num(it.discount) - hallmarking,
    making: num(it.making_amount),
    makingLabel: it.making_charge_type === "fixed" ? `₹${num(it.making_charge)}/pc`
      : it.making_charge_type === "per_gram" ? `₹${num(it.making_charge)}/g` : `${num(it.making_charge).toFixed(2)}%`,
    discount: num(it.discount),
    cgst: isInter ? 0 : half,
    sgst: isInter ? 0 : roundCents(gst - half),
    igst: isInter ? gst : 0,
    total: num(it.total),
  };
}

// The tax columns depend on the bill: none, IGST only, or SGST + CGST.
function taxColumns(bill) {
  const isGst = bill.gst_enabled && bill.gst_mode !== "none";
  if (!isGst) return { isGst, isInter: false, headers: [], widths: [] };
  const rate = num(bill.gst_rate_snapshot);
  if (bill.gst_mode === "inter") {
    return { isGst, isInter: true, headers: [`IGST<small>(${rate.toFixed(2)}%)</small>`], widths: [8] };
  }
  const half = (rate / 2).toFixed(2);
  return { isGst, isInter: false, headers: [`SGST<small>(${half}%)</small>`, `CGST<small>(${half}%)</small>`], widths: [7, 7] };
}

function itemRow(it, fig, tax) {
  const taxCells = tax.isGst
    ? (tax.isInter ? `<td class="right">${money(fig.igst)}</td>` : `<td class="right">${money(fig.sgst)}</td><td class="right">${money(fig.cgst)}</td>`)
    : "";
  return `
    <tr>
      <td class="left"><strong>${esc(it.item_name || "—")}</strong>
        ${it.item_code ? `<div class="muted">${esc(it.item_code)}</div>` : ""}
        <div class="muted">${esc(it.metal_type ? String(it.metal_type).toUpperCase() : "")}${it.purity_display ? ` · ${esc(it.purity_display)}` : ""}</div>
        ${it.huid ? `<div class="muted tiny">HUID: ${esc(it.huid)}</div>` : ""}</td>
      <td>${esc(it.purity_display || "—")}<div class="muted">${esc(it.hsn || "")}</div></td>
      <td>${fig.qty}N</td>
      <td class="right">${weight(fig.gross)}</td>
      <td class="right">${weight(fig.stone)}</td>
      <td class="right">${weight(fig.net)}</td>
      <td class="right">${money(fig.grossPrice)}</td>
      <td class="right">${money(fig.making)}<div class="muted">${esc(fig.makingLabel)}</div>${fig.hallmarking > 0 ? `<div class="muted">${money(fig.hallmarking)}</div>` : ""}</td>
      <td class="right">${money(fig.discount)}</td>
      ${taxCells}
      <td class="right"><strong>${money(fig.total)}</strong></td>
    </tr>`;
}

function itemsTable(items, tax) {
  const figures = items.map((it) => lineFigures(it, tax.isInter));
  const sum = (key) => figures.reduce((s, f) => s + f[key], 0);
  const taxWidth = tax.widths.reduce((s, w) => s + w, 0);
  // Every column but the description has a fixed width (66% together with the
  // product-value column); the description column takes whatever is left.
  const widths = [100 - taxWidth - 66, 6, 4, 7, 6, 7, 10, 9, 7, ...tax.widths, 10];
  const taxTotals = tax.isGst
    ? (tax.isInter ? `<td class="right">${money(sum("igst"))}</td>` : `<td class="right">${money(sum("sgst"))}</td><td class="right">${money(sum("cgst"))}</td>`)
    : "";
  const taxHeads = tax.headers.map((h) => `<th>${h}</th>`).join("");

  return `
  <table class="items">
    <colgroup>${widths.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>
    <thead><tr>
      <th class="left">Variant no / Product description<small>/ Fineness</small></th>
      <th>Purity<small>HSN</small></th>
      <th>Net<small>Qty</small></th>
      <th>Gross Product Weight<small>(grams)</small></th>
      <th>Less / Stone Weight<small>(grams)</small></th>
      <th>Net Metal Weight<small>(grams)</small></th>
      <th>Gross Product Price<small>(Rs.)</small></th>
      <th>Making Charges (Rs.)<small>Making % / HM Charges</small></th>
      <th>Scheme Discount<small>(Rs.)</small></th>
      ${taxHeads}
      <th>Product Value<small>(Rs.)</small></th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => itemRow(it, figures[i], tax)).join("")}
      <tr class="total-row">
        <td class="left">Total</td><td></td>
        <td>${sum("qty")}N</td>
        <td class="right">${weight(sum("gross"))}</td>
        <td class="right">${weight(sum("stone"))}</td>
        <td class="right">${weight(sum("net"))}</td>
        <td class="right">${money(sum("grossPrice"))}</td>
        <td class="right">${money(sum("making"))}</td>
        <td class="right">${money(sum("discount"))}</td>
        ${taxTotals}
        <td class="right">${money(sum("total"))}</td>
      </tr>
    </tbody>
  </table>`;
}

function referenceOf(bill) {
  if (bill.payment_reference) return String(bill.payment_reference);
  const match = String(bill.payment_details || "").match(/Ref:\s*([^|]+)/);
  return match ? match[1].trim() : "";
}

// One row per payment method (split payments list each with its own amount),
// plus the customer's gold when it was part of the settlement.
function paymentRows(bill) {
  const reference = referenceOf(bill);
  const components = parseJson(bill.payment_components, []);
  const rows = (Array.isArray(components) ? components : [])
    .filter((c) => num(c.amount) > 0)
    .map((c) => ({ label: paymentModeLabel(c.mode), ref: c.mode === "cash" ? "" : reference, amount: num(c.amount) }));

  const goldValue = num(bill.gold_given_value);
  const hasGoldRow = (Array.isArray(components) ? components : []).some((c) => c.mode === "gold_exchange");
  if (goldValue > 0 && !hasGoldRow) {
    const gold = parseJson(bill.gold_exchange, {}) || {};
    const detail = gold.net_weight ? ` (${weight(gold.net_weight)}g ${gold.purity || ""})` : "";
    rows.push({ label: `Gold Exchange${detail}`, ref: "", amount: goldValue });
  }
  if (rows.length === 0 && num(bill.paid_amount) > 0) {
    rows.push({ label: paymentModeLabel(bill.payment_mode), ref: reference, amount: num(bill.paid_amount) });
  }
  return rows;
}

function paymentBlock(bill) {
  const rows = paymentRows(bill);
  const paid = num(bill.paid_amount);
  const due = num(bill.due_amount);
  const body = rows.length
    ? rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.ref)}</td><td>${esc(bill.customer_name || "")}</td><td class="num">${money(r.amount)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">No payment received — full amount on credit</td></tr>`;
  return `
    <div class="block-title">Payment Details</div>
    <table class="pay">
      <colgroup><col style="width:34%"><col style="width:22%"><col style="width:24%"><col style="width:20%"></colgroup>
      <thead><tr><th>Payment Mode</th><th>Doc No</th><th>Customer Name</th><th class="num">Amount (Rs)</th></tr></thead>
      <tbody>
        ${body}
        <tr class="strong"><td colspan="3">Total Amount Paid</td><td class="num">${money(paid)}</td></tr>
        ${due > 0 ? `<tr class="strong"><td colspan="3">Balance Due</td><td class="num">${money(due)}</td></tr>` : ""}
      </tbody>
    </table>`;
}

// Net invoice value panel. Product Total + other charges − bill discount (+ the GST
// effect of those two) always equals the saved total, so the lines reconcile.
function netValuePanel(bill, items) {
  const productTotal = items.reduce((s, it) => s + num(it.total), 0);
  const itemDiscount = items.reduce((s, it) => s + num(it.discount), 0);
  const otherCharges = num(bill.other_charges);
  const billDiscount = num(bill.discount);
  const total = num(bill.total_amount);
  const gstAdjustment = roundCents(total - (productTotal + otherCharges - billDiscount));
  const row = (label, value, cls = "") => `<div class="kv ${cls}"><span>${label}</span><span>${money(value)}</span></div>`;

  return `
    <div class="heading">Additional Other Charges</div>
    ${row("Other charges:", otherCharges, "sub")}
    ${row("Total Other charges value", otherCharges)}
    ${billDiscount > 0 ? row("Bill discount", -billDiscount) : ""}
    ${Math.abs(gstAdjustment) >= 0.01 ? row("GST adjustment", gstAdjustment) : ""}
    ${row("Net invoice values", total, "strong")}
    <div class="heading">Discount Details :</div>
    ${itemDiscount > 0 ? row("Scheme / item discount :", itemDiscount, "sub") : ""}
    ${billDiscount > 0 ? row("Bill discount :", billDiscount, "sub") : ""}
    ${itemDiscount + billDiscount === 0 ? row("Total discount :", 0, "sub") : ""}
    ${row("Total Amount to be paid", total, "boxed")}
    <div class="words">Value in words :- ${esc(amountToWords(total))}</div>`;
}

function sellerBlock(shop) {
  const gstin = shop?.gst_number || "";
  const place = [shop?.city, shop?.pincode].filter(Boolean).join(" - ");
  const stateLine = [shop?.state, gstin ? `State Code : ${gstin.slice(0, 2)}` : ""].filter(Boolean).join(" · ");
  return `
    <div>
      <div class="name"><strong>${esc(shop?.shop_name || "Jewellery Shop")}</strong></div>
      ${shop?.address ? `<div>${esc(shop.address)}</div>` : ""}
      ${place ? `<div>${esc(place)}</div>` : ""}
      ${shop?.mobile ? `<div>Phone Number : ${esc(shop.mobile)}</div>` : ""}
      ${shop?.email ? `<div>Email : ${esc(shop.email)}</div>` : ""}
      <div>GSTIN : ${esc(gstin || "—")}</div>
      ${stateLine ? `<div>${esc(stateLine)}</div>` : ""}
    </div>`;
}

function customerBlock(bill, customer) {
  const address = customer?.address || bill.customer_address || "";
  return `
    <div>
      <h3>CUSTOMER DETAILS:</h3>
      <div class="name">${esc(bill.customer_name || "")}</div>
      ${address ? `<div>${esc(address)}</div>` : ""}
      ${bill.customer_state ? `<div>${esc(bill.customer_state)}</div>` : ""}
      ${bill.customer_mobile ? `<div>Phone Number : ${esc(bill.customer_mobile)}</div>` : ""}
      ${bill.customer_gst_number ? `<div>GSTIN : ${esc(bill.customer_gst_number)}</div>` : ""}
      ${bill.aadhaar_number ? `<div>Aadhaar : ${esc(bill.aadhaar_number)}</div>` : ""}
      ${bill.pan_number ? `<div>PAN : ${esc(bill.pan_number)}</div>` : ""}
    </div>`;
}

const NOTES = [
  "Please note that the net amount includes Metal Value, Cost of Stones (Precious, Non Precious and other material Charges), Product Making Charges/Wastage Charges, GST and other taxes (as applicable). Upon specific request a detailed statement will be provided.",
  "Weight verified and received product in good condition.",
  "Goods once sold will not be taken back or exchanged without prior approval.",
  "Metal value is based on the rate per gram applicable on the date of invoice.",
  "NA - Not applicable, since the product is sold by piece / number. All weights are subject to BIS hallmarking standards.",
  "Any dispute is subject to local jurisdiction only.",
];

// Build the invoice body HTML from finalized snapshot data.
// { bill, items, shop, customer } + { qrDataUrl }
export function invoiceBody({ bill, items, shop, customer }, opts = {}) {
  if (!items || items.length === 0) return "<p>No items</p>";

  const tax = taxColumns(bill);
  const qrDataUrl = opts.qrDataUrl || "";
  const dateStr = new Date(bill.bill_date).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const totalQty = items.reduce((s, it) => s + num(it.quantity), 0);
  const productTotal = items.reduce((s, it) => s + num(it.total), 0);
  const sourceLabel = bill.bill_source === "manual" ? "Manual Sale" : bill.bill_source === "customer_purchase" ? "Customer Purchase" : "Inventory Sale";

  return `
  <div class="top-line"><span></span><span class="copy">Customer Copy</span></div>
  <div class="brand">
    ${shop?.logo_url ? `<img src="${esc(shop.logo_url)}" alt="" />` : ""}
    <h1>${esc(shop?.shop_name || "Jewellery Shop")}</h1>
  </div>

  <div class="frame">
    <div class="frame-head">
      <span class="title">${tax.isGst ? "TAX INVOICE" : "INVOICE"}</span>
      <span class="doc">DOC/${esc(bill.bill_number)} &nbsp; Date : ${esc(dateStr)}<div class="tiny muted">${esc(sourceLabel)}</div></span>
    </div>
    <div class="party">${sellerBlock(shop)}${customerBlock(bill, customer)}</div>
    ${rateLine(bill)}
    ${itemsTable(items, tax)}
    <div class="qty-line"><span>Total Qty Purchased &nbsp; ${totalQty}N</span><span>Product Total Value &nbsp; ${money(productTotal)}</span></div>
    <div class="settle">
      <div class="left">${paymentBlock(bill)}</div>
      <div class="right">${netValuePanel(bill, items)}</div>
    </div>
    <div class="notes-row">
      <ol>${NOTES.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
      ${qrDataUrl ? `<div class="qr-box"><img src="${qrDataUrl}" alt="" /><div class="qr-label">Scan to view bill details</div></div>` : ""}
    </div>
    <div class="agree">Read / Understood and agreed to the terms and conditions</div>
    <div class="signatures">
      <div class="sig"><div>Customer Name : ${esc(bill.customer_name || "")}</div><div class="sig-space"></div><div>Customer Signature</div></div>
      <div class="sig right"><div>For ${esc((shop?.shop_name || "").toUpperCase())}</div><div class="sig-space"></div><div>Authorised Signatory</div></div>
    </div>
  </div>
  <div class="footer">This is a computer generated tax invoice · ${esc(shop?.shop_name || "")}${shop?.gst_number ? ` · GSTIN ${esc(shop.gst_number)}` : ""}${shop?.address ? ` · ${esc(shop.address)}` : ""}</div>
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
