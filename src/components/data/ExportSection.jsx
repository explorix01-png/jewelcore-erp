import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCSV, downloadExcel, downloadPDF } from "@/lib/download";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

const EXPORT_MODULES = [
  { id: "Bill", label: "Bills", entity: "Bill", dateField: "bill_date", hasSourceFilter: true, hasCustomerFilter: true },
  { id: "Customer", label: "Customers", entity: "Customer" },
  { id: "GoldInventory", label: "Gold Inventory", entity: "InventoryItem", metalFilter: "gold" },
  { id: "SilverInventory", label: "Silver Inventory", entity: "InventoryItem", metalFilter: "silver" },
  { id: "Purchase", label: "Purchases", entity: "Purchase", dateField: "purchase_date" },
  { id: "Supplier", label: "Suppliers", entity: "Supplier" },
  { id: "CustomerOrder", label: "Customer Orders", entity: "CustomerOrder", dateField: "order_date", hasCustomerFilter: true },
  { id: "Karagir", label: "Karagirs", entity: "Karagir" },
];

export default function ExportSection() {
  const [moduleId, setModuleId] = useState("Bill");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [billSource, setBillSource] = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [recordCount, setRecordCount] = useState(null);

  const mod = EXPORT_MODULES.find((m) => m.id === moduleId);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageData", { action: "export", entity: mod.entity });
      if (!res.data?.success) { alert(res.data?.error || "Export failed"); return null; }
      let records = res.data.records || [];

      // Metal filter for inventory modules
      if (mod.metalFilter) {
        records = records.filter((r) => r.metal_type === mod.metalFilter && !r.is_archived);
      }

      // Date range filter
      if (mod.dateField && (dateFrom || dateTo)) {
        records = records.filter((r) => {
          if (!r[mod.dateField]) return false;
          const d = new Date(r[mod.dateField]);
          if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
          if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
          return true;
        });
      }

      // Bill source filter
      if (mod.hasSourceFilter && billSource !== "all") {
        records = records.filter((r) => r.bill_source === billSource);
      }

      // Customer search filter
      if (mod.hasCustomerFilter && customerSearch.trim()) {
        const q = customerSearch.toLowerCase().trim();
        records = records.filter((r) => (r.customer_name || "").toLowerCase().includes(q));
      }

      setRecordCount(records.length);
      return records;
    } catch (e) { alert("Export failed: " + e.message); return null; }
    finally { setLoading(false); }
  };

  const filters = { dateFrom, dateTo, billSource, customerSearch };
  const stamp = new Date().toISOString().slice(0, 10);

  const handleCSV = async () => {
    const rows = await fetchData();
    if (rows && rows.length > 0) downloadCSV(`${moduleId}_${stamp}.csv`, moduleId, rows);
    else if (rows) alert("No records match the selected filters");
  };
  const handleExcel = async () => {
    const rows = await fetchData();
    if (rows && rows.length > 0) downloadExcel(`${moduleId}_${stamp}.xls`, moduleId, rows);
    else if (rows) alert("No records match the selected filters");
  };
  const handlePDF = async () => {
    const rows = await fetchData();
    if (rows && rows.length > 0) downloadPDF(`${moduleId}_${stamp}.pdf`, moduleId, rows, filters);
    else if (rows) alert("No records match the selected filters");
  };

  return (
    <div className="rounded-xl border bg-card p-5 max-w-2xl">
      <h3 className="font-semibold mb-3">Export Data</h3>
      <div className="space-y-4">
        <div>
          <Label>Select Module to Export</Label>
          <Select value={moduleId} onValueChange={(v) => { setModuleId(v); setRecordCount(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EXPORT_MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {mod?.dateField && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        )}

        {mod?.hasSourceFilter && (
          <div>
            <Label className="text-xs">Bill Type</Label>
            <Select value={billSource} onValueChange={setBillSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="customer_purchase">Customer Purchase</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {mod?.hasCustomerFilter && (
          <div>
            <Label className="text-xs">Customer Search</Label>
            <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Filter by customer name..." />
          </div>
        )}

        {recordCount !== null && (
          <p className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
            {recordCount} record(s) match the selected filters
          </p>
        )}

        <p className="text-sm text-muted-foreground">Exports contain only the current shop's data. Filters apply consistently to CSV, Excel, and PDF.</p>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleCSV} disabled={loading} variant="outline"><Download className="w-4 h-4 mr-1" /> {loading ? "Loading..." : "CSV"}</Button>
          <Button onClick={handleExcel} disabled={loading} variant="outline"><FileSpreadsheet className="w-4 h-4 mr-1" /> {loading ? "Loading..." : "Excel"}</Button>
          <Button onClick={handlePDF} disabled={loading} variant="outline"><FileText className="w-4 h-4 mr-1" /> {loading ? "Loading..." : "PDF Report"}</Button>
        </div>
      </div>
    </div>
  );
}