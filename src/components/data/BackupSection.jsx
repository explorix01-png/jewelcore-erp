import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { downloadJSON } from "@/lib/download";
import { Database, Download } from "lucide-react";

export default function BackupSection() {
  const [loading, setLoading] = useState(false);
  const [backup, setBackup] = useState(null);

  const createBackup = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageData", { action: "backup" });
      if (!res.data?.success) { alert(res.data?.error || "Backup failed"); return; }
      setBackup(res.data.backup);
      downloadJSON(`backup_${new Date().toISOString().slice(0, 10)}.json`, res.data.backup);
    } catch (e) { alert("Backup failed: " + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="rounded-xl border bg-card p-5 max-w-2xl">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Database className="w-4 h-4" /> Create Backup</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Creates a complete backup of all shop data including masters, customers, suppliers, inventory, purchases, bills, payments, outstanding, orders, karagir work, transactions, rates, and settings.
        The backup is downloaded as a JSON file. Authentication credentials are never included.
      </p>
      <Button onClick={createBackup} disabled={loading}>
        <Download className="w-4 h-4 mr-1" /> {loading ? "Creating Backup..." : "Create & Download Backup"}
      </Button>
      {backup && (
        <div className="mt-4 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium mb-2">Backup Created Successfully</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Date:</span> {new Date(backup.backup_date).toLocaleString("en-IN")}</div>
            <div><span className="text-muted-foreground">Created By:</span> {backup.created_by}</div>
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
      )}
    </div>
  );
}