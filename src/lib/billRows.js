// Pure helpers for the New Bill item rows — shared by the desktop table and the
// mobile card so both behave identically. No React, no network.
import { round3 } from "@/lib/billCalc";

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const normalize = (s) => String(s ?? "").trim().toLowerCase();

// Net weight = Gross − Less (never negative), to gram-milligram precision.
export function calcNetWeight(grossWeight, lessWeight) {
  return round3(Math.max(0, toNumber(grossWeight) - toNumber(lessWeight)));
}

// Rate per gram for a metal + purity from the resolved effective-rate list
// (getEffectiveRates). With no purity, returns the first rate for that metal —
// the list is ordered base-purity first (24K gold / 999 silver).
export function findRate(rates, metalType, purityDisplay) {
  const metal = normalize(metalType);
  const purity = normalize(purityDisplay);
  const match = (rates || []).find((r) => (
    normalize(r.metal_type) === metal
    && (!purity || normalize(r.purity_display) === purity)
    && r.is_active !== false
  ));
  return match ? toNumber(match.rate_per_gram) : 0;
}

// PurityMaster entries available for a metal, in the order they were loaded.
export function puritiesForMetal(purities, metalType) {
  const metal = normalize(metalType);
  return (purities || []).filter((p) => normalize(p.metal_type) === metal && p.is_active !== false);
}

export function findPurity(purities, metalType, purityDisplay) {
  const label = normalize(purityDisplay);
  if (!label) return null;
  return puritiesForMetal(purities, metalType).find((p) => (
    normalize(p.display_format) === label || normalize(p.name) === label
  )) || null;
}

// Apply one edit to a bill row and return the updated row, keeping the derived
// fields in step:
//   - gross or less weight changes  -> net weight is recalculated
//   - purity is picked              -> rate/g comes from Rate Management for it
//   - metal changes                 -> purity is cleared (each metal has its own)
// ctx: { rates, purities, mode }
export function applyRowChange(row, field, value, ctx = {}) {
  const next = { ...row, [field]: value };

  if (field === "gross_weight" || field === "stone_weight") {
    next.net_weight = calcNetWeight(next.gross_weight, next.stone_weight);
  }

  if (field === "metal_type") {
    next.purity_display = "";
    next.purity_value = 0;
    // Gold/silver purchases have no purity picker, so start from the metal's base rate.
    next.rate_per_gram = ctx.mode === "customer_purchase" ? findRate(ctx.rates, value, "") : 0;
  }

  if (field === "purity_display") {
    const purity = findPurity(ctx.purities, next.metal_type, value);
    next.purity_value = purity ? toNumber(purity.purity_value) : 0;
    next.rate_per_gram = findRate(ctx.rates, next.metal_type, value);
  }

  return next;
}

// Re-price rows when the bill date, and so the effective rates, change. Rows
// with a purity take that purity's new rate. Rows without one keep their rate,
// except in gold/silver purchases (no purity picker) which follow the base rate.
export function repriceRows(rows, rates, mode) {
  return rows.map((row) => {
    if (!row.purity_display && mode !== "customer_purchase") return row;
    const rate = findRate(rates, row.metal_type, row.purity_display);
    return rate > 0 ? { ...row, rate_per_gram: rate } : row;
  });
}
