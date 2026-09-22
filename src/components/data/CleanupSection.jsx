import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Trash2 } from "lucide-react";

const RESET_TARGETS = [
  { key: "customers", label: "Delete All Customers" },
  { key: "suppliers", label: "Delete All Suppliers" },
  { key: "karagirs", label: "Delete All Karagirs" },
  { key: "orders", label: "Delete All Customer Orders" },
  { key: "purchases", label: "Delete All Purchase Data" },
  { key: "inventory", label: "Delete All Inventory" },
  { key: "bills", label: "Delete All Bills" },
  { key: "payments", label: "Delete All Payments" },
  { key: "transactions", label: "Delete All Transaction History" },
];

export default function CleanupSection() {
  const [resetTarget, setResetTarget] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  const executeReset = async () => {
    if (!resetTarget) { alert("Select a target"); return; }
    if (confirmText !== "DELETE OPERATIONAL DATA") { alert("Confirmation phrase required"); return; }
    setResetting(true);
    setResetResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "delete", target: resetTarget, confirmation: confirmText });
      if (!res.data?.success) { alert(res.data?.error || "Reset failed"); return; }
      setResetResult({ target: resetTarget, deleted: res.data.deleted });
      setConfirmText("");
    } catch (e) { alert("Reset failed: " + e.message); }
    finally { setResetting(false); }
  };

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/30 p-5 max-w-2xl">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" /> Data Cleanup</h3>
      <p className="text-sm text-red-600 mb-4">
        Permanently deletes operational data for the selected module. This action cannot be undone. All deletions are logged in the audit trail.
      </p>
      <div className="space-y-3">
        <div><Label>Select Data to Delete</Label>
          <Select value={resetTarget} onValueChange={setResetTarget}>
            <SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger>
            <SelectContent>{RESET_TARGETS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Type to confirm: DELETE OPERATIONAL DATA</Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE OPERATIONAL DATA" className="font-mono" />
        </div>
        <Button variant="destructive" onClick={executeReset} disabled={resetting || !resetTarget || confirmText !== "DELETE OPERATIONAL DATA"}>
          <Trash2 className="w-4 h-4 mr-1" /> {resetting ? "Deleting..." : "Delete Selected Data"}
        </Button>
        {resetResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            Deleted {resetResult.deleted} record(s) from {resetResult.target}.
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">ActivityLog and ShopSettings are never deleted. Masters are preserved unless explicitly selected.</p>
    </div>
  );
}