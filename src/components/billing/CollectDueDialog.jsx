import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function CollectDueDialog({ bill, onClose, onDone }) {
  const t = useT();
  const [amount, setAmount] = useState(bill?.due_amount || 0);
  const [mode, setMode] = useState("cash");
  const [saving, setSaving] = useState(false);

  if (!bill) return null;

  const collect = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      alert("Financial Safety Lock Active: Cannot record due payment while offline. Live database connection required to prevent financial balance mismatch.");
      return;
    }
    const amt = Number(amount);
    if (amt <= 0 || amt > Number(bill.due_amount)) { alert(t("collectDue.invalidAmount") + " (" + fmt(bill.due_amount) + ")"); return; }
    setSaving(true);
    const operationId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const res = await base44.functions.invoke("collectDue", {
        bill_id: bill.id, amount: amt, payment_mode: mode, operation_id: operationId,
      });
      const result = res.data;
      if (!result.success) { alert(result.error || t("collectDue.collectionFailed")); return; }
      onDone?.(); onClose();
    } catch (e) {
      alert(t("collectDue.collectionFailed") + ": " + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!bill} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("collectDue.title")} — {bill.bill_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{t("collectDue.outstanding")}: <span className="font-semibold text-red-600">{fmt(bill.due_amount)}</span></p>
          <div><Label>{t("collectDue.amount")}</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>{t("collectDue.paymentMode")}</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["cash", "upi", "card", "bank_transfer"].map((m) => (
                  <SelectItem key={m} value={m}>{t("paymentMode." + m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={collect} disabled={saving}>{saving ? t("common.saving") : t("collectDue.collect")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}