import React, { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/erp";
import { calcFineWeight, fmt, fmtNum, fmtWt3 } from "@/lib/billCalc";
import { Plus, Trash2, Coins, CheckCircle2, AlertCircle } from "lucide-react";

// Standard payment modes supported by JewelCore ERP
export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI / QR" },
  { value: "card", label: "Debit / Credit Card" },
  { value: "bank_transfer", label: "Bank Transfer (NEFT/RTGS)" },
  { value: "credit_due", label: "Credit (Full Due)" },
  { value: "gold_exchange", label: "Gold Exchange (Gold Given)" },
  { value: "old_gold_plus_cash", label: "Old Gold + Cash" },
  { value: "mixed", label: "Mixed / Split Settlement" },
];

export default function PaymentSection({
  totalAmount,
  payments,
  setPayments,
  oldGold,
  setOldGold,
  exchangeValue,
  useOldGold,
  setUseOldGold,
  creditDue,
  setCreditDue,
  reference,
  setReference,
  notes,
  setNotes,
  purities = [],
  rates = [],
  selectedPaymentMode = "cash",
  setSelectedPaymentMode,
  canOverrideRate = false,
}) {
  const t = useT();

  const ogGross = Number(oldGold?.grossWeight) || 0;
  const ogLess = Number(oldGold?.deductionWeight) || 0;
  const ogNetWeight = Math.max(0, ogGross - ogLess);

  // Fine weight calculated using authoritative JewelCore formula: Net Weight × Purity % / 100
  const ogPurityValue = Number(oldGold?.purityValue) || 0;
  const fineWeight = useMemo(() => {
    return calcFineWeight(ogNetWeight, ogPurityValue);
  }, [ogNetWeight, ogPurityValue]);

  // Mode management helper
  const handleModeChange = (newMode) => {
    setSelectedPaymentMode?.(newMode);
    if (newMode === "credit_due") {
      setCreditDue(true);
      setUseOldGold(false);
      setPayments([]);
    } else if (newMode === "gold_exchange") {
      setCreditDue(false);
      setUseOldGold(true);
      setPayments([]);
    } else if (newMode === "old_gold_plus_cash") {
      setCreditDue(false);
      setUseOldGold(true);
      const remainingCash = Math.max(0, Number(totalAmount) - (Number(exchangeValue) || 0));
      setPayments([{ mode: "cash", amount: remainingCash > 0 ? String(remainingCash) : "" }]);
    } else if (newMode === "mixed") {
      setCreditDue(false);
      // Keep existing payments and gold state
    } else {
      // Single monetary mode (cash, upi, card, bank_transfer)
      setCreditDue(false);
      setUseOldGold(false);
      setPayments([{ mode: newMode, amount: String(totalAmount) }]);
    }
  };

  const addPaymentMethod = () => {
    const used = payments.map((p) => p.mode);
    const available = ["cash", "upi", "card", "bank_transfer"].filter((m) => !used.includes(m));
    const nextMode = available[0] || "cash";
    setPayments([...payments, { mode: nextMode, amount: "" }]);
  };

  const removePaymentMethod = (idx) => setPayments(payments.filter((_, i) => i !== idx));
  const updatePaymentMethod = (idx, field, val) =>
    setPayments(payments.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));

  const setOG = (field, val) => setOldGold((prev) => ({ ...prev, [field]: val }));

  // Auto-fill rate when purity selection changes if rate not manually locked
  const handlePuritySelect = (purityDisplay) => {
    const matched = purities.find(
      (p) =>
        (p.display_format === purityDisplay || p.name === purityDisplay) &&
        p.metal_type === (oldGold?.metal || "gold")
    );
    const pValue = matched ? Number(matched.purity_value) : 0;
    setOG("purity", purityDisplay);
    setOG("purityValue", pValue);

    // Find applicable rate in current resolved rates
    const rateEntry = rates.find(
      (r) =>
        r.metal_type === (oldGold?.metal || "gold") &&
        (r.purity_display === purityDisplay || (matched && r.purity_id === matched.id))
    );
    if (rateEntry && Number(rateEntry.rate_per_gram) > 0) {
      setOG("ratePerGram", Number(rateEntry.rate_per_gram));
    }
  };

  // Monetary sum from payments
  const monetarySum = useMemo(() => {
    if (creditDue) return 0;
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, creditDue]);

  // Total amount given by customer: Gold Value + Monetary Payments
  const totalCustomerGives = useMemo(() => {
    if (creditDue) return 0;
    return monetarySum + (useOldGold ? Number(exchangeValue) || 0 : 0);
  }, [monetarySum, useOldGold, exchangeValue, creditDue]);

  const due = Math.max(0, Number(totalAmount) - totalCustomerGives);
  const customerRefundCredit = Math.max(0, totalCustomerGives - Number(totalAmount));

  return (
    <div className="space-y-4">
      {/* Primary Payment Mode Dropdown */}
      <div>
        <Label className="text-xs font-semibold text-foreground block mb-1.5">
          Settlement / Payment Mode *
        </Label>
        <Select value={selectedPaymentMode || "cash"} onValueChange={handleModeChange}>
          <SelectTrigger className="h-9 text-xs font-medium">
            <SelectValue placeholder="Select payment mode" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mode Note */}
      {creditDue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            Full Credit / Customer Ledger Account
          </p>
          <p className="text-amber-800/90 leading-relaxed">
            The full bill amount of <span className="font-bold font-mono">{fmt(totalAmount)}</span> will be added to this customer's ledger as an outstanding receivable.
          </p>
        </div>
      )}

      {/* Gold Exchange (Gold Given) Dedicated Form */}
      {useOldGold && (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/40 p-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Customer Gold Given / Exchange Details
                </h4>
                <p className="text-[11px] text-amber-800/80">
                  Value credited against jewellery purchase
                </p>
              </div>
            </div>
            {Number(exchangeValue) > 0 && (
              <Badge variant="success">Gold Value: {fmt(exchangeValue)}</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold">Gold Item / Type *</Label>
              <Input
                value={oldGold?.item || ""}
                onChange={(e) => setOG("item", e.target.value)}
                placeholder="e.g. Old Ring, Scrap Gold, Chain"
                className="h-8 text-xs bg-background"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Metal</Label>
              <Select
                value={oldGold?.metal || "gold"}
                onValueChange={(v) => {
                  setOG("metal", v);
                  setOG("purity", "");
                  setOG("purityValue", 0);
                  setOG("ratePerGram", 0);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weight row: Gross, Less, Net */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] font-semibold">Gross Wt (g) *</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={oldGold?.grossWeight ?? ""}
                onChange={(e) => setOG("grossWeight", e.target.value)}
                placeholder="0.000"
                className="h-8 text-xs font-mono text-right bg-background"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Less Wt (g)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={oldGold?.deductionWeight ?? ""}
                onChange={(e) => setOG("deductionWeight", e.target.value)}
                placeholder="0.000"
                className="h-8 text-xs font-mono text-right bg-background"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Net Weight (g)</Label>
              <Input
                type="text"
                readOnly
                value={`${fmtNum(ogNetWeight)} g`}
                className="h-8 text-xs font-mono font-bold text-right bg-amber-100/60 text-amber-950 border-amber-300"
              />
            </div>
          </div>

          {/* Purity & Fine Weight row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] font-semibold">Purity Alloy *</Label>
              <Select
                value={oldGold?.purity || ""}
                onValueChange={handlePuritySelect}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="Select purity" />
                </SelectTrigger>
                <SelectContent>
                  {purities
                    .filter((p) => p.metal_type === (oldGold?.metal || "gold"))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.display_format || p.name} className="text-xs">
                        {p.display_format || p.name} ({p.purity_value}%)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Fine Weight</Label>
              <Input
                type="text"
                readOnly
                value={fmtWt3(fineWeight)}
                className="h-8 text-xs font-mono text-right bg-background/80"
                title="Fine weight = Net Wt × Purity % ÷ 100"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold">Rate / gram (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                value={oldGold?.ratePerGram ?? ""}
                onChange={(e) => setOG("ratePerGram", e.target.value)}
                disabled={!canOverrideRate}
                className={`h-8 text-xs font-mono font-bold text-right bg-background ${
                  canOverrideRate ? "border-amber-400" : ""
                }`}
              />
            </div>
          </div>

          {/* Gold Value result */}
          <div className="p-2.5 rounded-lg bg-amber-100/70 border border-amber-300 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Calculated Gold Exchange Value:
            </span>
            <span className="text-sm font-mono font-bold text-amber-950">
              {fmt(exchangeValue)}
            </span>
          </div>

          {/* Optional identifiers */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <Label className="text-[10px] text-muted-foreground">HUID (Optional)</Label>
              <Input
                value={oldGold?.huid || ""}
                onChange={(e) => setOG("huid", e.target.value)}
                placeholder="Hallmark ID"
                className="h-7 text-xs bg-background"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Item / Barcode Ref (Optional)</Label>
              <Input
                value={oldGold?.barcode || ""}
                onChange={(e) => setOG("barcode", e.target.value)}
                placeholder="Ref code"
                className="h-7 text-xs bg-background"
              />
            </div>
          </div>
        </div>
      )}

      {/* Monetary Payments Section (Cash / UPI / Card / Bank / Split) */}
      {!creditDue && (selectedPaymentMode !== "gold_exchange" || payments.length > 0) && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground">
              {selectedPaymentMode === "old_gold_plus_cash"
                ? "Additional Cash Payment"
                : "Payment Method(s)"}
            </Label>
            {selectedPaymentMode === "mixed" && payments.length < 4 && (
              <button
                type="button"
                onClick={addPaymentMethod}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Method
              </button>
            )}
          </div>

          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={p.mode}
                onValueChange={(v) => updatePaymentMethod(i, "mode", v)}
                disabled={selectedPaymentMode === "old_gold_plus_cash"}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI / QR</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="h-8 flex-1 text-xs font-mono font-bold text-right"
                placeholder="Amount (₹)"
                value={p.amount}
                onChange={(e) => updatePaymentMethod(i, "amount", e.target.value)}
              />
              {selectedPaymentMode === "mixed" && payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePaymentMethod(i)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reference (UTR, Cheque, Auth Code) */}
      <div>
        <Label className="text-xs text-muted-foreground block mb-1">
          Payment Reference / Transaction ID (Optional)
        </Label>
        <Input
          value={reference || ""}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. UTR12345678, Cheque #00452"
          className="h-8 text-xs"
        />
      </div>

      {/* Transparent Dual Value Accounting Reconciliation (Requirement 16) */}
      <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2 text-xs">
        <p className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
          Settlement Balance Summary
        </p>

        <div className="space-y-1.5 pt-1">
          {/* Customer Receives */}
          <div className="flex justify-between text-muted-foreground">
            <span>Customer Receives (Jewellery Items Total):</span>
            <span className="font-semibold text-foreground font-mono">{fmt(totalAmount)}</span>
          </div>

          {/* Customer Gives */}
          {useOldGold && Number(exchangeValue) > 0 && (
            <div className="flex justify-between text-amber-900 font-medium">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-600" />
                Customer Gives (Gold Exchange Value):
              </span>
              <span className="font-mono font-bold text-amber-950">- {fmt(exchangeValue)}</span>
            </div>
          )}

          {monetarySum > 0 && (
            <div className="flex justify-between text-emerald-800 font-medium">
              <span>Customer Gives (Cash / Digital Paid):</span>
              <span className="font-mono font-bold text-emerald-950">- {fmt(monetarySum)}</span>
            </div>
          )}

          <div className="flex justify-between pt-1 border-t border-border/60 font-semibold">
            <span>Total Value Settled:</span>
            <span className="font-mono font-bold text-foreground">{fmt(totalCustomerGives)}</span>
          </div>

          {/* Net balance outcome */}
          {customerRefundCredit > 0 ? (
            <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 flex justify-between items-center font-bold">
              <span>Customer Balance Credit / Refund:</span>
              <span className="font-mono text-sm text-emerald-700">{fmt(customerRefundCredit)}</span>
            </div>
          ) : (
            <div className="flex justify-between font-bold text-sm pt-1">
              <span>Remaining Balance Due:</span>
              <span className={due > 0 ? "text-red-600 font-mono" : "text-emerald-600 font-mono"}>
                {fmt(due)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}