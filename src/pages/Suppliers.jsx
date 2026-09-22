import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function Suppliers() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setSuppliers(await base44.entities.Supplier.list("-created_date", 200)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => suppliers.filter((s) => {
    const x = debouncedQ.toLowerCase();
    return !x || s.name?.toLowerCase().includes(x) || s.mobile?.includes(x) || s.gst_number?.toLowerCase().includes(x);
  }), [suppliers, debouncedQ]);

  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected supplier(s)? Suppliers with purchases or transactions will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageSupplier", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data);
      bulk.clear();
      load();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const save = async (data) => {
    try {
      if (editing) {
        const res = await base44.functions.invoke("manageSupplier", { action: "update", id: editing.id, data });
        if (!res.data?.success) { alert(res.data?.error || "Update failed"); return; }
      } else {
        const res = await base44.functions.invoke("manageSupplier", { action: "create", data });
        if (!res.data?.success) { alert(res.data?.error || "Create failed"); return; }
      }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const deletePermanent = async (s) => {
    if (!confirm(`Permanently delete supplier "${s.name}"? This cannot be undone.`)) return;
    try {
      const res = await base44.functions.invoke("manageSupplier", { action: "delete_permanent", id: s.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Supplier deleted permanently.");
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("suppliers.title")} subtitle={t("suppliers.subtitle")}
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("suppliers.newSupplier")}</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("suppliers.searchPlaceholder")} className="pl-9" />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Truck} title={t("suppliers.noSuppliers")} description={t("suppliers.noSuppliersDesc")} />
      ) : (
        <>
        <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
        <TableShell headers={[
          <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
          "Code", "Name", "Mobile", "GST", "Outstanding", "Status", t("common.actions")
        ]}>
          {pag.pageItems.map((s) => (
            <tr key={s.id} className="hover:bg-muted/40">
              <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(s.id)} onCheckedChange={() => bulk.toggleOne(s.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs">{s.supplier_code || "—"}</td>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3">{s.mobile || "—"}</td>
              <td className="px-4 py-3 text-xs">{s.gst_number || "—"}</td>
              <td className="px-4 py-3">{Number(s.outstanding) > 0 ? <Badge variant="warning">{fmt(s.outstanding)}</Badge> : <Badge variant="success">Clear</Badge>}</td>
              <td className="px-4 py-3"><Badge variant={s.status === "active" ? "success" : "default"}>{s.status || "active"}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(s); setOpen(true); }} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deletePermanent(s)} className="p-1.5 rounded hover:bg-muted text-red-600" title="Delete Permanently"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
        <Pagination {...pag} />
        </>
      )}
      {bulkResult && <BulkDeleteResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t("suppliers.editSupplier") : t("suppliers.newSupplier")}</DialogTitle></DialogHeader>
          <SupplierForm initial={editing} onSave={save} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({
    name: initial?.name || "", mobile: initial?.mobile || "", email: initial?.email || "",
    address: initial?.address || "", gst_number: initial?.gst_number || "", notes: initial?.notes || "",
    status: initial?.status || "active",
  });
  return (
    <>
      <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
        <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Mobile</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </div>
        <div><Label>Address</Label><Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} /></div>
        <div><Label>GST Number</Label><Input value={f.gst_number} onChange={(e) => setF({ ...f, gst_number: e.target.value })} /></div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => f.name && onSave(f)} disabled={!f.name}>Save</Button>
      </DialogFooter>
    </>
  );
}