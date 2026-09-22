import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bell, Calendar, CheckCircle2 } from "lucide-react";

// Set Due Reminder — admin/staff selects a reminder date for a due bill.
// Stores customer, bill, due amount, due date, reminder date in DueReminder entity.
export default function SetDueReminderDialog({ bill, onClose, onDone }) {
  const t = useT();
  const [reminderDate, setReminderDate] = useState("");
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!bill) return;
    setErr("");
    setReminderDate("");
    (async () => {
      try {
        const res = await base44.functions.invoke("collectDue", { action: "get_reminders", bill_id: bill.id });
        if (res.data?.success) {
          const active = res.data.reminders?.find((r) => r.status === "active");
          setExisting(active || null);
          if (active) setReminderDate(active.reminder_date);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [bill]);

  if (!bill) return null;
  const due = Number(bill.due_amount) || 0;

  const save = async () => {
    if (!reminderDate) { setErr(t("dueReminder.selectDate")); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("collectDue", { action: "set_reminder", bill_id: bill.id, reminder_date: reminderDate });
      if (!res.data?.success) { setErr(res.data?.error || "Failed"); return; }
      onDone?.();
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!bill} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> {t("dueReminder.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billHistory.billNo")}</span><span className="font-mono">{bill.bill_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billHistory.customer")}</span><span className="font-medium">{bill.customer_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billHistory.due")}</span><span className="font-semibold text-red-600">{fmt(due)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("dueReminder.billDate")}</span><span>{new Date(bill.bill_date).toLocaleDateString("en-IN")}</span></div>
          </div>
          {existing && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <Calendar className="w-3.5 h-3.5" /> {t("dueReminder.existingActive")} {existing.reminder_date}
            </div>
          )}
          <div>
            <Label>{t("dueReminder.reminderDate")} *</Label>
            <Input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            <p className="text-xs text-muted-foreground mt-1">{t("dueReminder.reminderDateHint")}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <p className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5" /> {t("dueReminder.autoCancelTitle")}</p>
            <p>{t("dueReminder.autoCancelDesc")}</p>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving || due <= 0}>{saving ? t("common.saving") : t("dueReminder.setReminder")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}