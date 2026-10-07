// Payment-method helpers shared by the New Bill form and the printed invoice.

// The monetary methods a bill can be split across.
export const SPLIT_PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI / QR" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export const MAX_PAYMENT_METHODS = SPLIT_PAYMENT_MODES.length;

const MODE_LABELS = {
  cash: "Cash",
  upi: "UPI / QR",
  card: "Card",
  bank: "Bank Transfer",
  bank_transfer: "Bank Transfer",
  gold_exchange: "Gold Exchange",
  old_gold_plus_cash: "Old Gold + Cash",
  old_gold_cash: "Old Gold + Cash",
  credit_due: "Credit (Due)",
  mixed: "Mixed",
};

export function paymentModeLabel(mode) {
  const key = String(mode || "").toLowerCase();
  return MODE_LABELS[key] || String(mode || "—");
}

// The payment_mode saved on the bill, derived from what was actually entered
// (not from the settlement dropdown, which can be stale after the user edits a
// method row).
export function deriveBillPaymentMode({ creditDue, useOldGold, payments }) {
  if (creditDue) return "credit_due";
  const modes = [...new Set((payments || []).filter((p) => Number(p.amount) > 0).map((p) => p.mode))];
  if (useOldGold) {
    if (modes.length === 0) return "gold_exchange";
    return modes.length === 1 && modes[0] === "cash" ? "old_gold_plus_cash" : "mixed";
  }
  if (modes.length === 0) return "cash";
  return modes.length === 1 ? modes[0] : "mixed";
}

// The method a payment row should be set to when it is added: the first one
// not already used, so splits start with distinct methods.
export function nextUnusedMode(payments) {
  const used = new Set((payments || []).map((p) => p.mode));
  return (SPLIT_PAYMENT_MODES.find((m) => !used.has(m.value)) || SPLIT_PAYMENT_MODES[0]).value;
}

// The settlement-dropdown value to show for the current rows.
export function settlementModeForPayments(payments, currentMode) {
  if (!["cash", "upi", "card", "bank_transfer", "mixed"].includes(currentMode)) return currentMode;
  if ((payments || []).length > 1) return "mixed";
  return payments?.[0]?.mode || currentMode;
}
