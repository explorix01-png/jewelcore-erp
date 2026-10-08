// Reusable jewellery tax-invoice template — shared by Print, PDF and WhatsApp.
// Layout follows the traditional Indian jeweller's tax invoice: letterhead band,
// TAX INVOICE title with number/date, seller | customer boxes, a ruled item table
// (SC, HSN, CT, Rate/10gm, GW, NW, Value Addition, Amount), then amount in words,
// payment details and a totals ladder beside the QR / signature boxes, and a
// contact footer band.
// All values come from the finalized Bill + BillItem snapshots + ShopSettings.
// This module NEVER recalculates the bill; it only formats snapshotted values.
import { amountToWords } from "@/lib/amountToWords";
import { fmtNum } from "@/lib/billCalc";
import { stateCodeFor } from "@/lib/stateCodes";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const num = (v) => Number(v) || 0;
const weight = (v) => num(v).toFixed(3);
// Values that round to zero print as 0.00 — never "-0.00".
const money = (v) => fmtNum(Math.abs(num(v)) < 0.005 ? 0 : v);
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
  // The safe margin is part of the invoice itself (padding), not just the @page margin:
  // Chrome's "Margins: None" print setting (it remembers it between prints) zeroes the
  // @page margin, and a printer cannot print the outer few mm — the edges got cut off.
  // @page keeps only a small top/bottom margin for the pages of a multi-page invoice.
  const pageRule = isA5 ? "size: A5 portrait; margin: 5mm 0;" : "size: A4 portrait; margin: 6mm 0;";
  const printPad = isA5 ? "5mm 8mm" : "6mm 10mm";
  // Printed invoices sit in the vertical middle of the sheet: the container is as tall as the
  // printable area (in print, 100vh is the page height minus whatever margins are in effect;
  // 2mm is shaved off so rounding never adds a blank page) and centres its content.
  // A bill taller than one page just flows onto the next.
  const printMinHeight = "calc(100vh - 2mm)";
  const baseFont = isA5 ? "7.5px" : "10px";
  const cellFont = isA5 ? "7px" : "9px";
  const tinyFont = isA5 ? "6px" : "7.5px";
  const brandFont = isA5 ? "15px" : "22px";
  const titleFont = isA5 ? "10px" : "13px";
  const pagePad = isA5 ? "6px" : "10px";
  const logoBox = isA5 ? "40px" : "64px";
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .invoice-page { font-family: Arial, 'Segoe UI', sans-serif; font-size: ${baseFont}; color: #111; padding: ${pagePad}; background: #fff; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .muted { color: #444; }
    .tiny { font-size: ${tinyFont}; }

    .letterhead { display: grid; grid-template-columns: ${logoBox} 1fr ${logoBox}; align-items: center; gap: 8px; padding: 8px 12px; background: linear-gradient(#fdf7df, #f3e5ae); border: 1px solid #c9b46a; border-bottom: 0; }
    .letterhead .logo img { max-width: 100%; max-height: ${logoBox}; display: block; margin: 0 auto; }
    .letterhead h1 { grid-column: 2; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: ${brandFont}; font-weight: 700; letter-spacing: 0.5px; color: #3b2a0a; overflow-wrap: anywhere; }

    .frame { border: 1px solid #000; }
    .title-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid #000; }
    .title-row .title { grid-column: 2; text-align: center; font-weight: 700; font-size: ${titleFont}; letter-spacing: 0.5px; }
    .title-row .sub { text-align: center; font-size: ${tinyFont}; font-weight: 400; letter-spacing: 0; }
    .title-row .doc { grid-column: 3; text-align: right; font-weight: 700; font-size: ${cellFont}; overflow-wrap: anywhere; }

    .party { display: flex; border-bottom: 1px solid #000; }
    .party > div { flex: 1; padding: 5px 8px; overflow-wrap: anywhere; font-size: ${cellFont}; }
    .party > div + div { border-left: 1px solid #000; }
    .party .line { padding: 1px 0; }
    .party .split { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    .party .name { font-weight: 700; text-transform: uppercase; }

    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    table.items th { padding: 3px 3px; font-size: ${cellFont}; font-weight: 700; text-align: center; vertical-align: middle; border-bottom: 1px solid #000; border-right: 1px solid #000; overflow-wrap: anywhere; line-height: 1.25; }
    table.items th small { display: block; font-weight: 400; font-size: ${tinyFont}; }
    table.items td { padding: 3px 4px; font-size: ${cellFont}; vertical-align: top; border-right: 1px solid #000; overflow-wrap: anywhere; line-height: 1.3; }
    table.items th:last-child, table.items td:last-child { border-right: none; }
    table.items td.left, table.items th.left { text-align: left; }
    table.items td.c { text-align: center; }
    table.items td.right { text-align: right; }
    table.items tbody tr { page-break-inside: avoid; }
    table.items tr.filler td { padding: 0; }
    table.items tr.total-row td { font-weight: 700; border-top: 1px solid #000; border-bottom: 1px solid #000; }

    .bottom { display: flex; page-break-inside: avoid; }
    .bottom-left { flex: 1.6; border-right: 1px solid #000; display: flex; flex-direction: column; }
    .bottom-right { flex: 1; font-size: ${cellFont}; }

    .words-pay { display: flex; flex: 1; border-bottom: 1px solid #000; }
    .words { flex: 1.2; padding: 5px 8px; border-right: 1px solid #000; font-size: ${cellFont}; overflow-wrap: anywhere; }
    .words h4 { font-weight: 700; font-size: ${cellFont}; }
    .words p { margin-bottom: 6px; }
    .paybox { flex: 1; padding: 5px 8px; font-size: ${cellFont}; overflow-wrap: anywhere; }
    .paybox h4 { font-weight: 700; font-size: ${cellFont}; margin-bottom: 2px; }
    .p-row { display: flex; justify-content: space-between; gap: 6px; padding: 1px 0; text-transform: uppercase; }
    .p-ref { padding-top: 3px; font-size: ${tinyFont}; text-transform: none; }

    .sign-row { display: flex; align-items: stretch; min-height: ${isA5 ? "52px" : "78px"}; }
    .sign-row > div { padding: 4px 6px; display: flex; flex-direction: column; justify-content: flex-end; font-size: ${cellFont}; }
    .sign-row > div + div { border-left: 1px solid #000; }
    .sign-row .qr { width: ${isA5 ? "66px" : "96px"}; align-items: center; justify-content: center; text-align: center; }
    .sign-row .qr img { width: ${isA5 ? "56px" : "80px"}; height: ${isA5 ? "56px" : "80px"}; }
    .sign-row .qr-label { font-size: ${tinyFont}; color: #333; margin-top: 1px; }
    .sign-row .cust-sign { width: ${isA5 ? "62px" : "92px"}; text-align: center; }
    .sign-row .for-shop { flex: 1; text-align: left; overflow-wrap: anywhere; }

    .t-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 8px; }
    .t-row.strong { font-weight: 700; border-top: 1px solid #000; border-bottom: 1px solid #000; padding-top: 3px; padding-bottom: 3px; margin: 2px 0; }

    .footer-band { padding: 6px 12px; text-align: center; background: linear-gradient(#f3e5ae, #fdf7df); border: 1px solid #c9b46a; border-top: 0; font-size: ${tinyFont}; color: #3b2a0a; overflow-wrap: anywhere; }
    .terms { margin-top: 6px; font-size: ${tinyFont}; color: #333; page-break-inside: avoid; }
    .terms ol { padding-left: 13px; line-height: 1.45; overflow-wrap: anywhere; }
    .terms .agree { font-weight: 700; margin-top: 2px; }
    .computer { margin-top: 4px; text-align: center; font-size: ${tinyFont}; color: #555; }

    @media print {
      .invoice-page { padding: ${printPad}; min-height: ${printMinHeight}; display: flex; flex-direction: column; justify-content: center; }
      @page { ${pageRule} }
    }
  `;
}

// ---------- data shaping (formatting only — never recalculating the bill) ----------

// Per-line figures from the BillItem snapshot. "Amount" is metal value + value
// addition (making, plus legacy wastage) — i.e. before hallmarking and discount,
// which the totals ladder lists separately.
function lineFigures(it) {
  const qty = num(it.quantity);
  const hallmarking = num(it.hallmarking_charge) * qty;
  const amount = num(it.taxable_amount) + num(it.discount) - hallmarking;
  const metalValue = num(it.metal_value);
  return {
    qty,
    gross: num(it.gross_weight) * qty,
    net: num(it.net_weight) * qty,
    rate10: num(it.rate_per_gram) * 10,
    hallmarking,
    amount,
    // Older snapshots without metal_value fall back to the saved making amount.
    valueAddition: metalValue > 0 ? amount - metalValue : num(it.making_amount),
    discount: num(it.discount),
    gst: num(it.gst_amount),
  };
}

const ITEM_COLUMN_WIDTHS = [4, 30, 9, 8, 6, 10, 8, 8, 8, 9];

function itemRow(it, fig, index) {
  const metal = it.metal_type ? String(it.metal_type).toUpperCase() : "";
  return `
    <tr>
      <td class="c">${index + 1}</td>
      <td class="left"><strong>${esc(it.item_name || "—")}</strong>${fig.qty !== 1 ? ` <span class="muted">× ${fig.qty}</span>` : ""}
        ${num(it.wastage_weight) > 0 ? `<div class="muted tiny">Wastage ${weight(it.wastage_weight)} g</div>` : ""}
        ${it.huid ? `<div class="muted tiny">HUID: ${esc(it.huid)}</div>` : ""}</td>
      <td class="c">${esc(it.item_code || "")}</td>
      <td class="c">${esc(it.hsn || "")}</td>
      <td class="c">${esc(it.purity_display || "—")}${metal ? `<div class="muted tiny">${esc(metal)}</div>` : ""}</td>
      <td class="right">${money(fig.rate10)}</td>
      <td class="right">${weight(fig.gross)}</td>
      <td class="right">${weight(fig.net)}</td>
      <td class="right">${money(fig.valueAddition)}</td>
      <td class="right">${money(fig.amount)}</td>
    </tr>`;
}

function itemsTable(items, figures, isA5) {
  const sum = (key) => figures.reduce((s, f) => s + f[key], 0);
  // Short invoices are padded to a minimum item-area height (rows are roughly
  // 9mm / 7mm tall) so the ruled table keeps the tall look of the traditional bill.
  const fillerMm = Math.max(0, (isA5 ? 28 : 46) - items.length * (isA5 ? 7 : 9));
  const filler = fillerMm > 0
    ? `<tr class="filler" style="height:${fillerMm}mm">${ITEM_COLUMN_WIDTHS.map(() => "<td></td>").join("")}</tr>`
    : "";

  return `
  <table class="items">
    <colgroup>${ITEM_COLUMN_WIDTHS.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>
    <thead><tr>
      <th>Sr.<br>No</th>
      <th class="left">Particulars</th>
      <th>SC</th>
      <th>HSN</th>
      <th>CT</th>
      <th>Rate<small>/ 10 gm</small></th>
      <th>GW</th>
      <th>NW</th>
      <th>Value Addition</th>
      <th>Amount</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => itemRow(it, figures[i], i)).join("")}
      ${filler}
      <tr class="total-row">
        <td></td><td class="left">Total</td><td></td><td></td><td></td><td></td>
        <td class="right">${weight(sum("gross"))}</td>
        <td class="right">${weight(sum("net"))}</td>
        <td class="right">${money(sum("valueAddition"))}</td>
        <td class="right">${money(sum("amount"))}</td>
      </tr>
    </tbody>
  </table>`;
}

// The bill-level figures the totals ladder prints. Tax comes from the amounts
// saved on the bill (what the saved total actually includes); "Round off" is the
// remaining difference to that saved total, so the ladder always reconciles.
function billTotals(bill, items, figures, isGst, isInter) {
  const sum = (key) => figures.reduce((s, f) => s + f[key], 0);
  const itemDiscount = sum("discount");
  const billDiscount = num(bill.discount);
  const otherCharges = num(bill.other_charges);
  const subtotal = bill.subtotal != null ? num(bill.subtotal) : items.reduce((s, it) => s + num(it.taxable_amount), 0);
  const taxable = Math.max(0, roundCents(subtotal - billDiscount + otherCharges));

  let cgst = isGst ? num(bill.cgst) : 0;
  let sgst = isGst ? num(bill.sgst) : 0;
  let igst = isGst ? num(bill.igst) : 0;
  if (isGst && cgst + sgst + igst === 0) {
    // Older bills without the bill-level split: fall back to the per-item GST snapshots.
    const gst = roundCents(sum("gst"));
    if (isInter) igst = gst;
    else { cgst = roundCents(gst / 2); sgst = roundCents(gst - cgst); }
  }
  const gstTotal = roundCents(cgst + sgst + igst);
  const total = num(bill.total_amount);

  return {
    goodsValue: sum("amount"),
    hallmarking: sum("hallmarking"),
    discount: itemDiscount + billDiscount,
    otherCharges,
    taxable,
    cgst, sgst, igst, gstTotal,
    roundOff: roundCents(total - (taxable + gstTotal)),
    total,
    paid: num(bill.paid_amount),
    due: num(bill.due_amount),
  };
}

function totalsPanel(t, bill, isGst, isInter) {
  const row = (label, value, cls = "") => `<div class="t-row ${cls}"><span>${label}</span><span>${money(value)}</span></div>`;
  const rate = num(bill.gst_rate_snapshot);
  const half = (isInter ? 0 : rate / 2).toFixed(2);
  const taxRows = isGst
    ? `${row(`CGST ${half} %`, t.cgst)}${row(`SGST ${half} %`, t.sgst)}${row(`IGST ${(isInter ? rate : 0).toFixed(2)} %`, t.igst)}`
    : "";
  return `
    ${row("Total Amount", t.goodsValue)}
    ${row("Hallmarking Charges", t.hallmarking)}
    ${row("Discount", t.discount > 0 ? -t.discount : 0)}
    ${t.otherCharges > 0 ? row("Other Charges", t.otherCharges) : ""}
    ${row("Taxable value", t.taxable)}
    ${taxRows}
    ${row("Round off", t.roundOff)}
    ${row("Total", t.total, "strong")}
    ${row("Amount Received", t.paid, "strong")}
    ${row("Balance Due Amount", t.due)}`;
}

function referenceOf(bill) {
  if (bill.payment_reference) return String(bill.payment_reference);
  const match = String(bill.payment_details || "").match(/Ref:\s*([^|]+)/);
  return match ? match[1].trim() : "";
}

// One entry per payment method (split payments list each with its own amount),
// plus the customer's gold when it was part of the settlement.
function paymentRows(bill) {
  const components = parseJson(bill.payment_components, []);
  const list = Array.isArray(components) ? components : [];
  const rows = list
    .filter((c) => num(c.amount) > 0)
    .map((c) => ({ mode: c.mode, amount: num(c.amount) }));

  const goldValue = num(bill.gold_given_value);
  if (goldValue > 0 && !list.some((c) => c.mode === "gold_exchange")) {
    const gold = parseJson(bill.gold_exchange, {}) || {};
    const detail = gold.net_weight ? ` (${weight(gold.net_weight)}g ${gold.purity || ""})` : "";
    rows.push({ mode: "gold_exchange", amount: goldValue, detail });
  }
  if (rows.length === 0 && num(bill.paid_amount) > 0) {
    rows.push({ mode: bill.payment_mode, amount: num(bill.paid_amount) });
  }
  return rows;
}

// Payment Details box: the fixed Cash / Card / UPI lines of the traditional bill,
// plus a line for any other method actually used.
function paymentBox(bill) {
  const rows = paymentRows(bill);
  const modeKey = (m) => (String(m || "").toLowerCase() === "bank" ? "bank_transfer" : String(m || "").toLowerCase());
  const amountOf = (key) => rows.filter((r) => modeKey(r.mode) === key).reduce((s, r) => s + r.amount, 0);
  const fixed = ["cash", "card", "upi"];
  const others = rows.filter((r) => !fixed.includes(modeKey(r.mode)));
  const line = (label, amount) => `<div class="p-row"><span>${esc(label)}</span><span>${money(amount)}</span></div>`;
  const otherLabel = (r) => {
    const key = modeKey(r.mode);
    if (key === "bank_transfer") return "Bank Transfer";
    if (key === "gold_exchange") return `Gold Exchange${r.detail || ""}`;
    return String(r.mode || "Other").replace(/_/g, " ");
  };
  const reference = referenceOf(bill);

  return `
    <h4>Payment Details :</h4>
    ${line("Cash Recd Amt", amountOf("cash"))}
    ${line("Card Amount", amountOf("card"))}
    ${line("UPI Amount", amountOf("upi"))}
    ${others.map((r) => line(otherLabel(r), r.amount)).join("")}
    ${reference ? `<div class="p-ref">Ref / Txn No. : ${esc(reference)}</div>` : ""}`;
}

function sellerBlock(shop) {
  const gstin = shop?.gst_number || "";
  const place = [shop?.city, shop?.pincode].filter(Boolean).join(" - ");
  const address = [shop?.address, place].filter(Boolean).join(", ");
  return `
    <div>
      <div class="line">Name : <span class="name">${esc(shop?.shop_name || "Jewellery Shop")}</span></div>
      ${address ? `<div class="line">Address : ${esc(address)}</div>` : ""}
      <div class="split"><span>State : ${esc(shop?.state || "")}</span><span>State Code : ${esc(stateCodeFor(shop?.state, gstin))}</span></div>
      <div class="line">GSTIN : ${esc(gstin || "-")}</div>
    </div>`;
}

function customerBlock(bill, customer) {
  const address = customer?.address || bill.customer_address || "";
  return `
    <div>
      <div class="line">Name : <span class="name">${esc(bill.customer_name || "")}</span></div>
      <div class="line">Address : ${esc(address)}</div>
      <div class="split"><span>State : ${esc(bill.customer_state || "")}</span><span>State Code : ${esc(stateCodeFor(bill.customer_state, bill.customer_gst_number))}</span></div>
      <div class="line">Phone No : ${esc(bill.customer_mobile || "-")}</div>
      <div class="line">GSTIN : ${esc(bill.customer_gst_number || "-")}</div>
      ${bill.aadhaar_number ? `<div class="line">Aadhaar : ${esc(bill.aadhaar_number)}</div>` : ""}
      ${bill.pan_number ? `<div class="line">PAN : ${esc(bill.pan_number)}</div>` : ""}
    </div>`;
}

const NOTES = [
  "Please note that the net amount includes Metal Value, Cost of Stones (Precious, Non Precious and other material Charges), Product Making Charges/Wastage Charges, GST and other taxes (as applicable). Upon specific request a detailed statement will be provided.",
  "Weight verified and received product in good condition.",
  "Goods once sold will not be taken back or exchanged without prior approval.",
  "Metal value is based on the rate per gram applicable on the date of invoice.",
  "All weights are subject to BIS hallmarking standards.",
  "Any dispute is subject to local jurisdiction only.",
];

// Build the invoice body HTML from finalized snapshot data.
// { bill, items, shop, customer } + { qrDataUrl }
export function invoiceBody({ bill, items, shop, customer }, opts = {}) {
  if (!items || items.length === 0) return "<p>No items</p>";

  const isA5 = shop?.invoice_paper_size === "A5";
  const isGst = !!bill.gst_enabled && bill.gst_mode !== "none";
  const isInter = isGst && bill.gst_mode === "inter";
  const qrDataUrl = opts.qrDataUrl || "";
  const dateStr = new Date(bill.bill_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const shopName = shop?.shop_name || "Jewellery Shop";

  const figures = items.map(lineFigures);
  const totals = billTotals(bill, items, figures, isGst, isInter);
  const contact = [shop?.mobile ? `Phone : ${esc(shop.mobile)}` : "", shop?.email ? `Email : ${esc(shop.email)}` : "", shop?.gst_number ? `GSTIN : ${esc(shop.gst_number)}` : ""].filter(Boolean).join(" · ");

  return `
  <div class="letterhead">
    <div class="logo">${shop?.logo_url ? `<img src="${esc(shop.logo_url)}" alt="" />` : ""}</div>
    <h1>${esc(shopName)}</h1>
  </div>

  <div class="frame">
    <div class="title-row">
      <div class="title">${isGst ? "TAX INVOICE" : "INVOICE"}${isGst ? `<div class="sub">Tax Invoice u/s 31(1) of CGST Act 2017</div>` : ""}</div>
      <div class="doc">No. : ${esc(bill.bill_number)}<br>Date : ${esc(dateStr)}</div>
    </div>
    <div class="party">${sellerBlock(shop)}${customerBlock(bill, customer)}</div>
    ${itemsTable(items, figures, isA5)}
    <div class="bottom">
      <div class="bottom-left">
        <div class="words-pay">
          <div class="words">
            <h4>Invoice Amount In Words :</h4><p>${esc(amountToWords(totals.total))}</p>
            ${isGst ? `<h4>GST Amount In Words :</h4><p>${esc(amountToWords(totals.gstTotal))}</p>` : ""}
          </div>
          <div class="paybox">${paymentBox(bill)}</div>
        </div>
        <div class="sign-row">
          ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="" /><div class="qr-label">Scan to view bill</div></div>` : ""}
          <div class="cust-sign">Customer Sign</div>
          <div class="for-shop"><strong>FOR ${esc(shopName)}</strong></div>
        </div>
      </div>
      <div class="bottom-right">${totalsPanel(totals, bill, isGst, isInter)}</div>
    </div>
  </div>
  <div class="footer-band">
    <div><strong>${esc(shopName)}</strong>${shop?.address ? ` · ${esc(shop.address)}` : ""}</div>
    ${contact ? `<div>${contact}</div>` : ""}
  </div>
  <div class="terms">
    <ol>${NOTES.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
    <div class="agree">Read / Understood and agreed to the terms and conditions</div>
  </div>
  <div class="computer">This is a computer generated ${isGst ? "tax " : ""}invoice</div>
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
