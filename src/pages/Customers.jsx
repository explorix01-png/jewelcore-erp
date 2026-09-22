import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Search, Pencil, Trash2, Receipt, History } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function Customers() {
  const t = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Customer.list("-created_date", 200);
      setCustomers(all.filter((c) => !c.is_deleted));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => customers.filter((c) => {
    const s = debouncedQ.toLowerCase();
    return !s || c.name?.toLowerCase().includes(s) || c.mobile?.includes(s) || c.customer_code?.toLowerCase().includes(s) || c.gst_number?.toLowerCase().includes(s);
  }), [customers, debouncedQ]);

  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected customer(s)? Customers with bills, orders, or outstanding balances will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageCustomer", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data);
      bulk.clear();
      load();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const save = async (data) => {
    if (data.mobile) {
      const dup = customers.find((c) => c.mobile === data.mobile && c.id !== editing?.id);
      if (dup) { alert("A customer with this mobile already exists: " + dup.name); return; }
    }
    try {
      if (editing) {
        const res = await base44.functions.invoke("manageCustomer", { action: "update", id: editing.id, data });
        if (!res.data?.success) { alert(res.data?.error || "Update failed"); return; }
      } else {
        const res = await base44.functions.invoke("manageCustomer", { action: "create", data });
        if (!res.data?.success) { alert(res.data?.error || "Create failed"); return; }
      }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const deletePermanent = async (c) => {
    if (!confirm(`Permanently delete customer "${c.name}"?\n\nIf this customer has bills, orders, or outstanding balances, deletion will be blocked with an explanation.`)) return;
    try {
      const res = await base44.functions.invoke("manageCustomer", { action: "delete_permanent", id: c.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Customer deleted permanently.");
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("customers.title")} subtitle={t("customers.subtitle")}
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("customers.newCustomer")}</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("customers.searchPlaceholder")} className="pl-9" />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title={t("customers.noCustomers")} description={t("customers.noCustomersDesc")} />
      ) : (
        <>
        <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
        <TableShell headers={[
          <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
          "Code", "Name", "Mobile", "GST", t("customers.outstanding"), "Notes", t("common.actions")
        ]}>
          {pag.pageItems.map((c) => (
            <tr key={c.id} className="hover:bg-muted/40">
              <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(c.id)} onCheckedChange={() => bulk.toggleOne(c.id)} /></td>
              <td className="px-4 py-3 font-mono text-xs">{c.customer_code || "—"}</td>
              <td className="px-4 py-3 font-medium"><button onClick={() => navigate(`/customers/${c.id}`)} className="hover:underline text-amber-700">{c.name}</button></td>
              <td className="px-4 py-3">{c.mobile || "—"}</td>
              <td className="px-4 py-3 text-xs">{c.gst_number || "—"}</td>
              <td className="px-4 py-3">{Number(c.outstanding) > 0 ? <Badge variant="warning">{fmt(c.outstanding)}</Badge> : <Badge variant="success">Clear</Badge>}</td>
              <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{c.notes || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => navigate(`/customers/${c.id}`)} className="p-1.5 rounded hover:bg-muted text-blue-600" title={t("customers.viewHistory")}><History className="w-3.5 h-3.5" /></button>
                  <button onClick={() => navigate("/billing")} className="p-1.5 rounded hover:bg-muted text-amber-600" title={t("customers.createBill")}><Receipt className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setEditing(c); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deletePermanent(c)} className="p-1.5 rounded hover:bg-muted text-red-600" title="Delete Permanently"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
        <Pagination {...pag} />
        </>
      )}
      {bulkResult && <BulkDeleteResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("customers.editCustomer") : t("customers.newCustomer")}</DialogTitle></DialogHeader>
        <CustomerForm initial={editing} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </div>
  );
}

function CustomerForm({ initial, onSave, onCancel }) {
  const t = useT();
  const [f, setF] = useState({
    name: initial?.name || "", mobile: initial?.mobile || "",
    gst_number: initial?.gst_number || "", birth_date: initial?.birth_date || "",
    notes: initial?.notes || "",
  });
  return (
    <>
      <div className="space-y-3 py-2">
        <div><Label>{t("common.name")} *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>{t("common.mobile")}</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
        <div><Label>{t("customers.gstNumber")}</Label><Input value={f.gst_number} onChange={(e) => setF({ ...f, gst_number: e.target.value })} placeholder="27AAAAA0000A1Z5" /></div>
        <div><Label>{t("customers.birthDate")}</Label><Input type="date" value={f.birth_date || ""} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
        <div><Label>{t("common.notes")}</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={() => f.name && onSave(f)} disabled={!f.name}>{t("common.save")}</Button>
      </DialogFooter>
    </>
  );
}