import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge, TableShell } from "@/components/ui/erp";
import { FileSpreadsheet, Check, AlertCircle } from "lucide-react";

const IMPORT_ENTITIES = [
  { name: "Customer", label: "Customers", required: "name" },
  { name: "Supplier", label: "Suppliers", required: "name" },
  { name: "InventoryItem", label: "Inventory", required: "item_name" },
  { name: "ItemMaster", label: "Item Master", required: "item_code" },
  { name: "Karagir", label: "Karagirs", required: "name" },
];

export default function ImportSection() {
  const [entity, setEntity] = useState("Customer");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const parseCSV = async (file) => {
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { total: 0, valid: 0, errors: 0, allValidRows: [], sample: [] };
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((l) => {
      const vals = l.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map((v) => v.trim().replace(/^"|"$/g, "")) || [];
      const obj = {};
      headers.forEach((h, i) => (obj[h] = vals[i] || ""));
      return obj;
    });
    return validateRows(rows);
  };

  const validateRows = (rows) => {
    const reqField = IMPORT_ENTITIES.find((e) => e.name === entity)?.required || "name";
    const valid = rows.filter((r) => r[reqField]);
    return { total: rows.length, valid: valid.length, errors: rows.length - valid.length, allValidRows: valid, sample: valid.slice(0, 5) };
  };

  const handleCSV = async (file) => {
    setParsing(true);
    setPreview(null);
    try {
      setPreview(await parseCSV(file));
    } catch (e) { alert("CSV parse failed: " + e.message); }
    finally { setParsing(false); }
  };

  const handleExcel = async (file) => {
    setParsing(true);
    setPreview(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke("manageData", { action: "extractFile", entity, file_url });
      const records = res.data?.records || [];
      setPreview(validateRows(records));
    } catch (e) { alert("Excel parse failed: " + e.message); }
    finally { setParsing(false); }
  };

  const commitImport = async () => {
    if (!preview || preview.valid === 0) return;
    setImporting(true);
    try {
      const res = await base44.functions.invoke("manageData", { action: "import", entity, records: preview.allValidRows });
      if (!res.data?.success) { alert(res.data?.error || "Import failed"); return; }
      alert(`Successfully imported ${res.data.imported} record(s) into ${entity}`);
      setPreview(null);
    } catch (e) { alert("Import failed: " + e.message); }
    finally { setImporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-3">CSV Import</h3>
          <div className="space-y-3">
            <div><Label>Entity to Import</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{IMPORT_ENTITIES.map((e) => <SelectItem key={e.name} value={e.name}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <input type="file" accept=".csv" onChange={(e) => e.target.files[0] && handleCSV(e.target.files[0])} className="text-sm w-full" disabled={parsing} />
            <p className="text-xs text-muted-foreground">CSV must have column headers matching entity field names.</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel Import</h3>
          <div className="space-y-3">
            <div><Label>Entity to Import</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{IMPORT_ENTITIES.map((e) => <SelectItem key={e.name} value={e.name}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files[0] && handleExcel(e.target.files[0])} className="text-sm w-full" disabled={parsing} />
            <p className="text-xs text-muted-foreground">Excel file is parsed server-side. Column headers should match field names.</p>
          </div>
        </div>
      </div>
      {parsing && <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Parsing file...</p>}
      {preview && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-3">Import Preview — {entity}</h3>
          <div className="flex gap-4 mb-4 text-sm">
            <Badge variant="info">Total: {preview.total}</Badge>
            <Badge variant="success">Valid: {preview.valid}</Badge>
            <Badge variant="danger">Errors: {preview.errors}</Badge>
          </div>
          {preview.sample.length > 0 && (
            <TableShell headers={Object.keys(preview.sample[0])}>
              {preview.sample.map((r, i) => (<tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="px-3 py-2 text-xs">{String(v).slice(0, 40)}</td>)}</tr>))}
            </TableShell>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={commitImport} disabled={importing || preview.valid === 0}><Check className="w-4 h-4 mr-1" /> {importing ? "Importing..." : `Import ${preview.valid} Records`}</Button>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}