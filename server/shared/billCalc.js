// Server-side AUTHORITATIVE bill calculation engine.
// Single source of truth for billing math: metal value, making charge, wastage
// (internal), hallmarking charge, stone weight, discount, GST (CGST/SGST/IGST),
// final total, paid, due.
// WEIGHT SEMANTICS: gross_weight, stone_weight, net_weight are PER-PIECE weights.
// quantity is a separate multiplier — total line weight = per-piece weight × quantity.
import { num, round } from "./utils.js";

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
export function sortPuritiesDescending(purities, metalType = 'gold') {
  return [...purities].sort((a, b) => {
    if (metalType === 'gold') {
      const aName = (a.display_format || a.name || '').toUpperCase();
      const bName = (b.display_format || b.name || '').toUpperCase();
      const aIs24k = aName.startsWith('24K') || aName === '24K';
      const bIs24k = bName.startsWith('24K') || bName === '24K';
      if (aIs24k && !bIs24k) return -1;
      if (!aIs24k && bIs24k) return 1;
    }
    return (Number(b.purity_value) || 0) - (Number(a.purity_value) || 0);
  });
}

// Calculate all purity rates for a given metal from a single base rate.
// purities = [{ name, purity_value, metal_type, is_active }] from PurityMaster
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

// Backward-compatible wrapper for gold-only callers.
export function calcAllGoldRates(rate24k, purities) {
  return calcAllPurityRates(rate24k, purities, "gold");
}

// Round to 3 decimal places — used for fine weight precision.
export function round3(v) {
  return Math.round((num(v) + Number.EPSILON) * 1000) / 1000;
}

// Fine weight = net_weight × purity_percentage / 100.
// Handles both configured percentage (e.g. 99.9, 91.6) and karat inputs (e.g. 24, 22).
export function calcFineWeight(netWeight, purityValue) {
  const p = num(purityValue);
  const pct = (p > 0 && p <= 24) ? (p / 24) * 100 : p;
  return round3(num(netWeight) * pct / 100);
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
    hallmarking_amount: hallmarkingAmount,   // total (× qty)
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    total,
  };
}

// GST mode: 'intra' (CGST+SGST), 'inter' (IGST only), 'none' (no GST)
export function calcBill(items, billDiscount = 0, gstConfig = null, options = {}) {
  const gstEnabled = options.gst_enabled !== false;
  const gstMode = options.gst_mode || "intra"; // 'intra' | 'inter' | 'none'
  const otherCharges = num(options.other_charges);
  const effectiveGstMode = gstEnabled ? gstMode : "none";
  const effectiveGst = effectiveGstMode !== "none";

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
    if (effectiveGstMode === "inter") {
      igst = gst;
    } else {
      // intra-state: split into CGST + SGST
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

  const exactTotal = round(afterDiscount + (effectiveGst ? cgst + sgst + igst : 0));
  // Customer invoices settle in whole rupees: 0.50 and above rounds up, below 0.50 rounds
  // down (9250.52 → 9251, 9250.49 → 9250). Opt-in via round_total so supplier purchases,
  // which share this engine, keep their exact total. roundOff = totalAmount − exact total.
  const totalAmount = options.round_total === true ? Math.round(exactTotal) : exactTotal;
  const roundOff = round(totalAmount - exactTotal);
  return {
    items: computed, subtotal, discount, otherCharges, afterDiscount,
    hallmarkingTotal,
    cgst, sgst, igst, totalGst: effectiveGst ? totalGst : 0,
    totalAmount, roundOff, gstEnabled, gstMode: effectiveGstMode,
  };
}

export function computeDue(totalAmount, paidAmount) {
  return round(num(totalAmount) - num(paidAmount));
}
