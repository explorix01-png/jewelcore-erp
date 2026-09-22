import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";

const MODULES = [
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "inventory", label: "Inventory Items" },
  { key: "bills", label: "Bills" },
  { key: "purchases", label: "Purchases" },
  { key: "payments", label: "Payments" },
  { key: "orders", label: "Customer Orders" },
  { key: "karagirs", label: "Karagirs" },
  { key: "karagir_orders", label: "Karagir Orders" },
  { key: "stock_transactions", label: "Stock Transactions" },
  { key: "bill_items", label: "Bill Items" },
  { key: "purchase_items", label: "Purchase Items" },
  { key: "supplier_transactions", label: "Supplier Transactions" },
  { key: "customer_outstanding", label: "Customer Outstanding" },
  { key: "exchanges", label: "Exchange Transactions" },
  { key: "returns", label: "Return Transactions" },
  { key: "rate_history", label: "Rate History" },
  { key: "notifications", label: "Notifications" },
  { key: "item_masters", label: "Item Masters" },
  { key: "activity_logs", label: "Activity Logs" },
];

const BUSINESS_SUMMARY_KEYS = [
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "bills", label: "Bills" },
  { key: "purchases", label: "Purchases" },
  { key: "inventory", label: "Inventory Items" },
  { key: "stock_transactions", label: "Stock Transactions" },
  { key: "payments", label: "Payments" },
  { key: "orders", label: "Orders" },
  { key: "karagirs", label: "Karagir Records" },
];

export default function DeletionSection() {
  const [counts, setCounts] = useState({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  // Delete Selected state
  const [selModule, setSelModule] = useState("");
  const [records, setRecords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState(null);

  // Delete All Module state
  const [allModule, setAllModule] = useState("");
  const [allConfirm, setAllConfirm] = useState("");
  const [allDeleting, setAllDeleting] = useState(false);
  const [allResult, setAllResult] = useState(null);

  // Clear All Business Data state
  const [clearConfirm, setClearConfirm] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState(null);

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const res = await base44.functions.invoke("manageData", { action: "getCounts" });
      if (res.data?.success) setCounts(res.data.counts || {});
    } catch (e) { console.error("Failed to load counts", e); }
    finally { setLoadingCounts(false); }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const loadRecords = async (moduleKey) => {
    setSelModule(moduleKey);
    setSelectedIds(new Set());
    setResult(null);
    if (!moduleKey) { setRecords([]); return; }
    setLoadingRecords(true);
    try {
      const res = await base44.functions.invoke("manageData", { action: "getRecords", target: moduleKey });
      if (res.data?.success) setRecords(res.data.records || []);
      else setRecords([]);
    } catch (e) { setRecords([]); }
    finally { setLoadingRecords(false); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === records.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(records.map(r => r.id)));
  };

  const doDeleteSelected = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected record(s) permanently? This cannot be undone.`)) return;
    setDeleting(true); setResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "deleteSelected", target: selModule, ids: Array.from(selectedIds) });
      if (!res.data?.success) { setResult({ error: res.data?.error || "Delete failed" }); return; }
      setResult({ deleted: res.data.deleted, blocked: res.data.blocked || [] });
      await loadRecords(selModule);
      await loadCounts();
    } catch (e) { setResult({ error: e.message }); }
    finally { setDeleting(false); }
  };

  const doDeleteAllModule = async () => {
    if (!allModule) return;
    const count = counts[allModule] || 0;
    if (count === 0) { setAllResult({ error: "No records to delete" }); return; }
    if (allConfirm !== "DELETE") { setAllResult({ error: 'Type DELETE to confirm' }); return; }
    if (!window.confirm(`This will permanently delete all ${count} record(s). This cannot be undone.`)) return;
    setAllDeleting(true); setAllResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "deleteAllModule", target: allModule, confirmation: allConfirm });
      if (!res.data?.success) { setAllResult({ error: res.data?.error || "Delete failed" }); return; }
      setAllResult({ deleted: res.data.deleted, blocked: res.data.blocked || [] });
      setAllConfirm("");
      await loadCounts();
    } catch (e) { setAllResult({ error: e.message }); }
    finally { setAllDeleting(false); }
  };

  const doClearAll = async () => {
    if (clearConfirm !== "DELETE ALL DATA") { setClearResult({ error: 'Type DELETE ALL DATA to confirm' }); return; }
    if (!window.confirm("This will permanently delete ALL business data. This CANNOT be undone.")) return;
    setClearing(true); setClearResult(null);
    try {
      const res = await base44.functions.invoke("manageData", { action: "clearBusinessData", confirmation: clearConfirm });
      if (!res.data?.success) { setClearResult({ error: res.data?.error || "Clear failed" }); return; }
      setClearResult({ summary: res.data.summary });
      setClearConfirm("");
      await loadCounts();
    } catch (e) { setClearResult({ error: e.message }); }
    finally { setClearing(false); }
  };

  return (
    <div className="space-y-6">
      {/* ── DELETE SELECTED RECORDS ── */}
      <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2 text-red-700"><Trash2 className="w-4 h-4" /> A. Delete Selected Records</h3>
        <p className="text-sm text-red-600 mb-4">Select a module, then choose individual records to permanently delete. Dependent records are handled safely.</p>
        <div className="space-y-3">
          <div>
            <Label>Select Module</Label>
            <Select value={selModule} onValueChange={loadRecords}>
              <SelectTrigger><SelectValue placeholder="Select module..." /></SelectTrigger>
              <SelectContent>{MODULES.map(m => <SelectItem key={m.key} value={m.key}>{m.label} ({counts[m.key] ?? "-"})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {selModule && (
            <div className="border rounded-lg bg-white max-h-80 overflow-y-auto">
              {loadingRecords ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : records.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No records found.</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 sticky top-0">
                    <Checkbox checked={selectedIds.size === records.length && records.length > 0} onCheckedChange={toggleAll} />
                    <span className="text-xs font-medium text-muted-foreground">Select All ({records.length})</span>
                    <span className="ml-auto text-xs font-medium text-red-600">Selected: {selectedIds.size}</span>
                  </div>
                  {records.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-4 py-2 border-b hover:bg-muted/20">
                      <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        {r.sub && <p className="text-xs text-muted-foreground truncate">{r.sub}</p>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={doDeleteSelected} disabled={deleting}>
              {deleting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4 mr-1" /> Delete {selectedIds.size} Selected</>}
            </Button>
          )}
          {result && (result.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {result.error}</div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> <div><p>Deleted {result.deleted} record(s) permanently.</p>{result.blocked?.length > 0 && <p className="mt-1 text-amber-600">{result.blocked.length} blocked: {result.blocked.map(b => b.reason).join("; ")}</p>}</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DELETE ALL MODULE DATA ── */}
      <div className="rounded-xl border border-red-300 bg-red-50/40 p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" /> B. Delete All Module Data</h3>
        <p className="text-sm text-red-600 mb-4">Permanently delete ALL records in a single module. Type DELETE to confirm.</p>
        <div className="space-y-3 max-w-xl">
          <div>
            <Label>Select Data Type</Label>
            <Select value={allModule} onValueChange={(v) => { setAllModule(v); setAllResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Select module..." /></SelectTrigger>
              <SelectContent>{MODULES.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {allModule && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Records found: <span className="font-bold">{counts[allModule] ?? 0}</span>
              <p className="mt-1">This will permanently delete {counts[allModule] ?? 0} record(s).</p>
            </div>
          )}
          <div>
            <Label>Type to confirm: DELETE</Label>
            <Input value={allConfirm} onChange={(e) => setAllConfirm(e.target.value)} placeholder="DELETE" className="font-mono" />
          </div>
          <Button variant="destructive" onClick={doDeleteAllModule} disabled={allDeleting || !allModule || allConfirm !== "DELETE"}>
            {allDeleting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4 mr-1" /> Delete All {MODULES.find(m => m.key === allModule)?.label || ""}</>}
          </Button>
          {allResult && (allResult.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {allResult.error}</div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> <div><p>Deleted {allResult.deleted} record(s) permanently.</p>{allResult.blocked?.length > 0 && <p className="mt-1 text-amber-600">{allResult.blocked.length} blocked: {allResult.blocked.map(b => b.reason).join("; ")}</p>}</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CLEAR ALL BUSINESS DATA ── */}
      <div className="rounded-xl border-2 border-red-400 bg-red-50/50 p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2 text-red-800"><AlertTriangle className="w-5 h-5" /> C. Clear All Business Data</h3>
        <p className="text-sm text-red-700 mb-4 font-medium">This will permanently delete ALL business records and transaction history. This action cannot be undone.</p>
        <div className="space-y-3 max-w-xl">
          <div className="rounded-lg border border-red-300 bg-white p-4">
            <p className="text-sm font-medium mb-2">Data to be deleted:</p>
            {loadingCounts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading counts...</div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {BUSINESS_SUMMARY_KEYS.map(k => (
                  <div key={k.key} className="flex justify-between"><span className="text-muted-foreground">{k.label}:</span> <span className="font-semibold">{counts[k.key] ?? 0}</span></div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t text-xs text-green-700">
              <p className="font-medium">Preserved:</p>
              <p>Admin account, Shop Settings, Purity, Categories, GST Config, Roles, Permissions, Activity Logs</p>
            </div>
          </div>
          <div>
            <Label>Type to confirm: DELETE ALL DATA</Label>
            <Input value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} placeholder="DELETE ALL DATA" className="font-mono" />
          </div>
          <Button variant="destructive" size="lg" onClick={doClearAll} disabled={clearing || clearConfirm !== "DELETE ALL DATA"} className="w-full">
            {clearing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Clearing all data...</> : <><AlertTriangle className="w-4 h-4 mr-1" /> Clear All Business Data</>}
          </Button>
          {clearResult && (clearResult.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {clearResult.error}</div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> <div><p className="font-medium">All business data cleared successfully.</p><div className="mt-1 grid grid-cols-2 gap-x-4 text-xs">{Object.entries(clearResult.summary || {}).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}:</span> <span>{v}</span></div>)}</div></div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}