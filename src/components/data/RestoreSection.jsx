import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UploadCloud, AlertTriangle } from "lucide-react";

export default function RestoreSection() {
  const [backup, setBackup] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.data || !data.tenant_id) { alert("Invalid backup file format"); return; }
      setBackup(data);
      setResult(null);
    } catch (e) { alert("Failed to read backup: " + e.message); }
  };

  const executeRestore = async () => {
    if (!backup) return;
    if (confirmText !== "RESTORE BACKUP") { alert("Type 'RESTORE BACKUP' to confirm"); return; }
    setRestoring(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "restore", backup, confirmation: confirmText });
      if (!res.data?.success) { alert(res.data?.error || "Restore failed"); return; }
      setResult(res.data.results);
      setConfirmText("");
    } catch (e) { alert("Restore failed: " + e.message); }
    finally { setRestoring(false); }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 max-w-2xl">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-amber-700"><UploadCloud className="w-4 h-4" /> Restore Backup</h3>
      <div className="space-y-4">
        <input type="file" accept=".json" onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} className="text-sm w-full" />
        {backup && (
          <>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium mb-2">Backup Information</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Backup Date:</span> {new Date(backup.backup_date).toLocaleString("en-IN")}</div>
                <div><span className="text-muted-foreground">Created By:</span> {backup.created_by}</div>
                <div><span className="text-muted-foreground">Shop:</span> {backup.shop_name || "N/A"}</div>
                <div><span className="text-muted-foreground">Version:</span> {backup.version}</div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Record Counts:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(backup.counts).filter(([, c]) => c > 0).map(([k, c]) => (
                    <span key={k} className="text-xs px-2 py-1 rounded bg-muted">{k}: {c}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">Restore will import all records from this backup into the current shop. This action is logged in the audit trail. Cross-tenant restore is blocked.</p>
            </div>
            <div><Label>Type to confirm: RESTORE BACKUP</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE BACKUP" className="font-mono" />
            </div>
            <Button variant="destructive" onClick={executeRestore} disabled={restoring || confirmText !== "RESTORE BACKUP"}>
              {restoring ? "Restoring..." : "Restore Backup"}
            </Button>
          </>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <p className="font-medium mb-2">Restore Complete</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => (
                <span key={k} className="text-xs px-2 py-1 rounded bg-green-100">{k}: {v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}