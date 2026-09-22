import React, { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/billCalc";
import { Plus, Trash2, Coins } from "lucide-react";

const PAY_METHODS = ["cash", "upi", "card", "bank_transfer"];

export default function PaymentSection({
  totalAmount, payments, setPayments,
  oldGold, setOldGold, exchangeValue, useOldGold, setUseOldGold,
  creditDue, setCreditDue, reference, setReference, notes, setNotes,
}) {
  const t = useT();

  const totalPaid = useMemo(() => {
    if (creditDue) return 0;
    const methodSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return methodSum + (useOldGold ? Number(exchangeValue) || 0 : 0);
  }, [payments, creditDue, useOldGold, exchangeValue]);

  const due = Math.max(0, Number(totalAmount) - totalPaid);
  const overpay = totalPaid > Number(totalAmount) && !creditDue;

  const addPayment = () => {
    const used = payments.map(p => p.mode);
    const available = PAY_METHODS.filter(m => !used.includes(m));
    const mode = available[0] || "cash";
    setPayments([...payments, { mode, amount: "" }]);
  };
  const removePayment = (i) => setPayments(payments.filter((_, idx) => idx !== i));
  const updatePayment = (i, field, val) => setPayments(payments.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const ogNetWeight = Math.max(0, Number(oldGold.grossWeight) - Number(oldGold.deductionWeight));
  const setOG = (k, v) => setOldGold((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-3">
      {/* Credit Due toggle */}
      <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
        <input type="checkbox" checked={creditDue} onChange={(e) => { setCreditDue(e.target.checked); if (e.target.checked) setUseOldGold(false); }}
          className="rounded border-input" />
        <span className="font-medium">{t("paymentMode.credit_due")}</span>
      </label>

      {!creditDue && (
        <>
          {/* Payment method rows */}
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={p.mode} onValueChange={(v) => updatePayment(i, "mode", v)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{t("paymentMode." + m)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" className="h-8 flex-1 text-xs" placeholder="Amount" value={p.amount}
                  onChange={(e) => updatePayment(i, "amount", e.target.value)} />
                <button onClick={() => removePayment(i)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {payments.length < PAY_METHODS.length && (
            <Button size="sm" variant="outline" onClick={addPayment} className="w-full text-xs">
              <Plus className="w-3 h-3 mr-1" /> {t("billing.addPaymentMethod")}
            </Button>
          )}

          {/* Old Gold Exchange toggle */}
          <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
            <input type="checkbox" checked={useOldGold} onChange={(e) => setUseOldGold(e.target.checked)} className="rounded border-input" />
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-medium">{t("billing.oldGoldExchange")}</span>
          </label>

          {/* Old Gold details */}
          {useOldGold && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-amber-800">{t("billing.oldGoldDetails")}</p>
              <div><Label className="text-xs">{t("billing.oldGoldItem")}</Label>
                <Input value={oldGold.item} onChange={(e) => setOG("item", e.target.value)} placeholder={t("billing.oldGoldItemPh")} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">{t("billing.oldGoldMetal")}</Label>
                  <Select value={oldGold.metal} onValueChange={(v) => setOG("metal", v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold">{t("metal.gold")}</SelectItem>
                      <SelectItem value="silver">{t("metal.silver")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">{t("billing.oldGoldPurity")}</Label>
                  <Input value={oldGold.purity} onChange={(e) => setOG("purity", e.target.value)} placeholder="e.g. 22K" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">{t("billing.oldGoldGrossWt")}</Label>
                  <Input type="number" value={oldGold.grossWeight} onChange={(e) => setOG("grossWeight", e.target.value)} />
                </div>
                <div><Label className="text-xs">{t("billing.oldGoldDeductionWt")}</Label>
                  <Input type="number" value={oldGold.deductionWeight} onChange={(e) => setOG("deductionWeight", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">{t("billing.oldGoldNetWt")}</Label>
                  <Input type="number" value={ogNetWeight} readOnly className="bg-muted/50" />
                </div>
                <div><Label className="text-xs">{t("billing.oldGoldRate")}</Label>
                  <Input type="number" value={oldGold.ratePerGram} onChange={(e) => setOG("ratePerGram", e.target.value)} />
                </div>
              </div>
              <div><Label className="text-xs">{t("billing.exchangeValue")}</Label>
                <Input type="number" value={exchangeValue} readOnly className="bg-muted/50 font-semibold" />
              </div>
            </div>
          )}

          {/* Reference */}
          <div><Label className="text-xs">{t("billing.referenceOptional")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("billing.referencePlaceholder")} />
          </div>

          {/* Summary */}
          <div className="space-y-1 text-sm pt-2 border-t">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.grandTotal")}</span><span>{fmt(totalAmount)}</span></div>
            {payments.map((p, i) => Number(p.amount) > 0 && (
              <div key={i} className="flex justify-between"><span className="text-muted-foreground">{t("paymentMode." + p.mode)}</span><span>{fmt(p.amount)}</span></div>
            ))}
            {useOldGold && Number(exchangeValue) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.exchangeValue")}</span><span>{fmt(exchangeValue)}</span></div>
            )}
            <div className="flex justify-between font-medium"><span>{t("billing.totalPaid")}</span><span>{fmt(totalPaid)}</span></div>
            <div className="flex justify-between font-semibold">
              <span>{t("billing.due")}</span>
              <span className={due > 0 ? "text-red-600" : "text-emerald-600"}>{fmt(due)}</span>
            </div>
            {overpay && <p className="text-xs text-red-600">{t("billing.overpayWarning")}</p>}
          </div>
        </>
      )}
      {creditDue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800">
          {t("billing.creditDueNote")}
        </div>
      )}
    </div>
  );
}