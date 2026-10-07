// Centralized bill calculation engine — single source of truth for jewellery billing math.
// Never duplicate these formulas across UI components.
// WEIGHT SEMANTICS: gross_weight, stone_weight, net_weight are PER-PIECE weights.
// quantity is a separate multiplier — total line weight = per-piece weight × quantity.
// metal value, making charge (%, fixed-per-piece), wastage, hallmarking all scale with quantity.
// discount is a total line discount (not per-piece).
// Supports: GST (toggleable, intra/inter/none), final total, paid, due.

function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function round(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function calcItem(item) {
  const quantity = num(item.quantity) || 1;
  const netWeight = num(item.net_weight);          // per-piece
  const ratePerGram = num(item.rate_per_gram);
  const makingCharge = num(item.making_charge);    // % , ₹-per-piece (fixed), or ₹-per-gram
  const makingType = item.making_charge_type || "percentage";
  const wastage = num(item.wastage);              // % (legacy) or grams (fixed_weight)
  const wastageType = item.wastage_type;           // "percentage" | "fixed_weight" | undefined (legacy)
  const discount = num(item.discount);            // total line discount
  const gstRate = num(item.gst_rate);
  const hallmarkingCharge = num(item.hallmarking_charge); // ₹-per-piece
  const gstEnabled = item.gst_enabled !== false;

  // Weights are kept to 3 decimals (e.g. 4.207 g). Rounding to 2 decimals here
  // would silently misprice every piece whose weight isn't a multiple of 0.01 g.
  const totalNetWeight = round3(netWeight * quantity);

  // --- WASTAGE / CHARGEABLE WEIGHT ---
  // When wastage_type is set (silver model), wastage affects chargeable weight
  // (metal value = chargeable weight × rate). No separate wastage charge.
  // When unset (legacy/gold), wastage is % of metal value added as separate charge.
  let chargeableWeight = totalNetWeight;
  let wastageWeight = 0;
  let wastageAmount = 0;

  if (wastageType === "percentage") {
    wastageWeight = round3(totalNetWeight * wastage / 100);
    chargeableWeight = round3(totalNetWeight + wastageWeight);
  } else if (wastageType === "fixed_weight") {
    wastageWeight = round3(wastage * quantity);
    chargeableWeight = round3(totalNetWeight + wastageWeight);
  }

  const metalValue = round(chargeableWeight * ratePerGram);

  // Legacy wastage: % of metal value, separate charge (only when wastage_type not set)
  if (!wastageType) {
    wastageAmount = round(metalValue * wastage / 100);
  }

  // --- MAKING CHARGE (independent of wastage — never double-charged) ---
  let makingAmount;
  if (makingType === "fixed") {
    makingAmount = round(makingCharge * quantity);
  } else if (makingType === "per_gram") {
    makingAmount = round(totalNetWeight * makingCharge);
  } else {
    makingAmount = round(metalValue * makingCharge / 100);
  }

  const hallmarkingAmount = round(hallmarkingCharge * quantity);
  const grossBeforeDiscount = metalValue + makingAmount + wastageAmount + hallmarkingAmount;
  const taxableAmount = round(Math.max(0, grossBeforeDiscount - discount));
  const gstAmount = gstEnabled ? round(taxableAmount * gstRate / 100) : 0;
  const total = round(taxableAmount + gstAmount);

  return {
    ...item,
    metal_value: metalValue,
    making_amount: makingAmount,
    wastage_amount: wastageAmount,
    wastage_weight: wastageWeight,
    chargeable_weight: chargeableWeight,
    hallmarking_charge: hallmarkingCharge,   // per-piece (as entered)
    hallmarking_amount: hallmarkingAmount,    // total (× qty)
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    total,
  };
}

export function calcBill(items, billDiscount = 0, gstConfig = null, options = {}) {
  const gstEnabled = options.gst_enabled !== false;
  const gstMode = options.gst_mode || "intra";
  const otherCharges = num(options.other_charges);
  const effectiveGst = gstEnabled && gstMode !== "none";

  let subtotal = 0;
  let totalGst = 0;
  const computed = items.map((it) => {
    const c = calcItem({ ...it, gst_enabled: effectiveGst });
    subtotal += c.taxable_amount;
    totalGst += c.gst_amount;
    return c;
  });
  subtotal = round(subtotal);
  const hallmarkingTotal = round(computed.reduce((s, c) => s + num(c.hallmarking_amount), 0));
  const discount = num(billDiscount);
  // Other charges added to taxable base before GST (not double-counted)
  const afterDiscount = round(Math.max(0, subtotal - discount + otherCharges));

  let cgst = 0, sgst = 0, igst = 0;
  if (effectiveGst && gstConfig && gstConfig.gst_rate) {
    const gst = round(afterDiscount * gstConfig.gst_rate / 100);
    if (gstMode === "inter") {
      igst = gst;
    } else {
      const cgstRate = num(gstConfig.cgst_rate);
      const sgstRate = num(gstConfig.sgst_rate);
      const totalSplit = cgstRate + sgstRate;
      if (totalSplit > 0) {
        cgst = round(gst * cgstRate / totalSplit);
        sgst = round(gst - cgst);
      } else {
        cgst = round(gst / 2);
        sgst = round(gst - cgst);
      }
    }
    totalGst = gst;
  } else if (effectiveGst) {
    cgst = round(totalGst / 2);
    sgst = round(totalGst - cgst);
  }
  const totalAmount = round(afterDiscount + (effectiveGst ? cgst + sgst + igst : 0));
  return {
    items: computed,
    subtotal,
    discount,
    otherCharges,
    afterDiscount,
    hallmarkingTotal,
    cgst,
    sgst,
    igst,
    totalGst: effectiveGst ? totalGst : 0,
    totalAmount,
    gstEnabled,
    gstMode: effectiveGst ? gstMode : "none",
  };
}

export function computeDue(totalAmount, paidAmount) {
  return round(totalAmount - num(paidAmount));
}

// Short label for how a making charge was entered: "20%", "₹500/pc" or "₹80/g".
export function makingChargeLabel(type, rate) {
  const value = num(rate);
  if (type === "fixed") return `₹${value}/pc`;
  if (type === "per_gram") return `₹${value}/g`;
  return `${value}%`;
}

// Itemised charges behind a bill's subtotal, for the Bill Summary panel. Works
// on the calculated items from calcBill, so it can never drift from the totals:
//   metal + making + wastage + hallmarking − item discounts = subtotal
// `makingRows` has one entry per item; `makingLabel` is set when every item uses
// the same making charge (e.g. "20%"), so the summary can name it on one line.
export function calcChargeBreakdown(items) {
  const sumOf = (pick) => round(items.reduce((s, it) => s + num(pick(it)), 0));

  const makingRows = items.map((it) => ({
    name: it.item_name || "",
    label: makingChargeLabel(it.making_charge_type || "percentage", it.making_charge),
    amount: num(it.making_amount),
  }));
  const uniform = makingRows.length > 0 && makingRows.every((r) => r.label === makingRows[0].label);

  return {
    metalValue: sumOf((it) => it.metal_value),
    makingAmount: sumOf((it) => it.making_amount),
    wastageAmount: sumOf((it) => it.wastage_amount),
    hallmarkingAmount: sumOf((it) => it.hallmarking_amount),
    itemDiscount: sumOf((it) => it.discount),
    makingRows,
    makingLabel: uniform ? makingRows[0].label : "",
  };
}

// Calculate a purity rate from the base rate using purity percentage or karat.
// purity_rate = base_rate × purity_percentage / 100
// PurityMaster may store purity_value as karat (e.g. 24, 22, 18, 14) or percentage (e.g. 99.9, 91.67, 75.00).
export function calcPurityRate(baseRate, purityPercentage) {
  const p = num(purityPercentage);
  const pct = (p > 0 && p <= 24) ? (p / 24) * 100 : p;
  return round(num(baseRate) * pct / 100);
}

// Sort purities in descending order starting from 24K for gold.
// Required order: 24K, 23.5K, 23K, 22K, 21K, 20K, 18K, 17K, 16K, 15K, 14K...
export function sortPuritiesDescending(purities, metalType = "gold") {
  return [...purities].sort((a, b) => {
    if (metalType === "gold") {
      const aName = (a.display_format || a.name || "").toUpperCase();
      const bName = (b.display_format || b.name || "").toUpperCase();
      const aIs24k = aName.startsWith("24K") || aName === "24K";
      const bIs24k = bName.startsWith("24K") || bName === "24K";
      if (aIs24k && !bIs24k) return -1;
      if (!aIs24k && bIs24k) return 1;
    }
    return (Number(b.purity_value) || 0) - (Number(a.purity_value) || 0);
  });
}

// Calculate all purity rates for a given metal from a single base rate.
export function calcAllPurityRates(baseRate, purities, metalType) {
  const filtered = purities.filter((p) => p.metal_type === metalType && p.is_active !== false);
  const sorted = sortPuritiesDescending(filtered, metalType);
  return sorted.map((p) => ({
    purity_id: p.id,
    purity_display: p.display_format || p.name,
    purity_value: p.purity_value,
    rate_per_gram: calcPurityRate(baseRate, p.purity_value),
  }));
}

// Round to 3 decimal places — used for fine weight precision.
export function round3(v) {
  return Math.round((num(v) + Number.EPSILON) * 1000) / 1000;
}

// Fine weight = net_weight × purity_value / 100.
// PurityMaster stores purity_value as a percentage for BOTH gold and silver
// (e.g. 96.50 for 23K gold, 92.50 for 925 silver). This single formula works
// for both metals because the percentage is already normalized to /100.
// Gold:   2.200g × 96 / 100    = 2.112g
// Silver: 100g  × 92.50 / 100  = 92.500g  (equivalent to 100 × 925 / 1000)
export function calcFineWeight(netWeight, purityValue) {
  return round3(num(netWeight) * num(purityValue) / 100);
}

// Legacy helper kept for any older callers.
export function purityDerivedRate(baseRatePerGram, purityValue, basePurityValue) {
  if (!basePurityValue) return calcPurityRate(baseRatePerGram, purityValue);
  return round(num(baseRatePerGram) * (num(purityValue) / num(basePurityValue)));
}

export const fmt = (v) => `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtNum = (v) => num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtWt3 = (v) => `${round3(v).toFixed(3)}g`;