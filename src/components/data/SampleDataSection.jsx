import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, CheckCircle } from "lucide-react";

export default function SampleDataSection() {
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [clearResult, setClearResult] = useState(null);

  const loadSample = async () => {
    if (!confirm("This will create demo data (clearly marked with DEMO prefix) in your shop. Continue?")) return;
    setLoading(true);
    setSummary(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "loadSampleData" });
      if (!res.data?.success) { alert(res.data?.error || "Failed to load sample data"); return; }
      setSummary(res.data.summary);
    } catch (e) { alert("Failed: " + e.message); }
    finally { setLoading(false); }
  };

  const clearSample = async () => {
    if (!confirm("This will delete ALL records with DEMO prefix. Real data will not be affected. Continue?")) return;
    setClearing(true);
    setClearResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "clearSampleData" });
      if (!res.data?.success) { alert(res.data?.error || "Failed to clear sample data"); return; }
      setClearResult(res.data.results);
    } catch (e) { alert("Failed: " + e.message); }
    finally { setClearing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 max-w-2xl">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Load Sample Data</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Creates realistic demo data covering the complete workflow: 5 customers, 3 suppliers, 15 inventory items, 5 purchases, 6 bills (inventory + manual), 3 customer orders, 3 karagir orders, rate history, and notifications.
          All demo records are prefixed with "DEMO" for easy identification.
        </p>
        <Button onClick={loadSample} disabled={loading}>
          <Sparkles className="w-4 h-4 mr-1" /> {loading ? "Loading Sample Data..." : "Load Sample Data"}
        </Button>
        {summary && (
          <div className="mt-4 rounded-lg border bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Sample Data Loaded Successfully</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary).map(([k, v]) => (
                <span key={k} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{k}: {v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50/30 p-5 max-w-2xl">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-700"><Trash2 className="w-4 h-4" /> Clear Sample Data</h3>
        <p className="text-sm text-red-600 mb-4">
          Deletes ALL records with "DEMO" prefix from every entity. Real production data is never affected.
        </p>
        <Button variant="destructive" onClick={clearSample} disabled={clearing}>
          <Trash2 className="w-4 h-4 mr-1" /> {clearing ? "Clearing..." : "Clear All Sample Data"}
        </Button>
        {clearResult && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium mb-2">Cleared Records:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(clearResult).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => (
                <span key={k} className="text-xs px-2 py-1 rounded bg-muted">{k}: {v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}