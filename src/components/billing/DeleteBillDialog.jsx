import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/billCalc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function DeleteBillDialog({ bill, onClose, onDeleted }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!bill) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("deleteBill", {
        bill_id: bill.id,
        reason: reason.trim() || "Deleted by administrator from Bill History",
      });

      if (!res.data?.success) {
        setError(res.data?.error || "Failed to delete bill.");
        setDeleting(false);
        return;
      }

      onDeleted();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to delete bill.");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!bill} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-red-600">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <DialogTitle className="text-red-900 font-display">Delete Sales Invoice</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-red-800 text-xs leading-relaxed">
            <strong className="block mb-1 text-red-900 font-semibold">⚠️ Critical Financial & Inventory Warning:</strong>
            Deleting this invoice will permanently reverse all inventory reductions (restoring stock quantity and weights), void recorded payments, and adjust the customer's outstanding balance. This action cannot be undone.
          </div>

          <div className="p-3 bg-muted/50 rounded-lg space-y-1.5 border text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Number:</span>
              <span className="font-mono font-bold text-foreground">{bill.bill_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-medium text-foreground">{bill.customer_name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Date:</span>
              <span>{new Date(bill.bill_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount:</span>
              <span className="font-bold text-foreground">{fmt(bill.total_amount)}</span>
            </div>
            {Number(bill.paid_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid Amount:</span>
                <span className="text-emerald-700 font-semibold">{fmt(bill.paid_amount)}</span>
              </div>
            )}
            {Number(bill.due_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding Due:</span>
                <span className="text-red-600 font-semibold">{fmt(bill.due_amount)}</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1 block">Reason for Deletion</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Billing error / Customer returned items"
              className="text-xs"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-100 text-red-800 border border-red-300 text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={deleting} size="sm">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            size="sm"
          >
            {deleting ? (
              <span>Reversing & Deleting...</span>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                <span>Confirm Delete Bill</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
