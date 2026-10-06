import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { usePermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function MasterConfig() {
  const t = useT();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <span>Enterprise Catalog Settings</span>
          </span>
        }
        title={t("master.title")}
        subtitle="Configure hallmarking purity standards, jewellery categories, and HSN tax classifications."
      />

      <Tabs defaultValue="purity" className="space-y-4">
        <div className="p-1 rounded-xl bg-card border border-border/80 shadow-2xs inline-block">
          <TabsList className="grid grid-cols-3 w-full max-w-md bg-muted/60">
            <TabsTrigger value="purity" className="text-xs font-semibold">{t("master.purity")}</TabsTrigger>
            <TabsTrigger value="category" className="text-xs font-semibold">{t("master.categories")}</TabsTrigger>
            <TabsTrigger value="gst" className="text-xs font-semibold">{t("master.gst")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="purity"><PurityTab /></TabsContent>
        <TabsContent value="category"><CategoryTab /></TabsContent>
        <TabsContent value="gst"><GSTTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// Shared delete handler — tries permanent delete; if blocked by dependencies, offers archive.
async function removeMaster(entityType, id, confirmMsg, reload) {
  if (!window.confirm(confirmMsg)) return;
  try {
    const res = await base44.functions.invoke("manageMaster", { action: "delete", entity_type: entityType, id });
    if (!res.data?.success) {
      if (res.data?.canArchive) {
        if (window.confirm(res.data?.error + "\n\nDo you want to archive (deactivate) it instead?")) {
          const archRes = await base44.functions.invoke("manageMaster", { action: "archive", entity_type: entityType, id });
          if (archRes.data?.success) {
            alert("Record archived (deactivated). It will no longer appear in active lists.");
            reload();
          } else {
            alert(archRes.data?.error || "Archive failed");
          }
        }
      } else {
        alert(res.data?.error || "Failed");
      }
      return;
    }
    alert("Deleted — record permanently removed.");
    reload();
  } catch (e) { alert(e.message); }
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative flex-1 min-w-[150px] max-w-sm">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

function StatusFilter({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
      </SelectContent>
    </Select>
  );
}

function PurityTab() {
  const t = useT();
  const { can } = usePermission();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const load = async () => { setLoading(true); setRows(await base44.entities.PurityMaster.list("-created_date", 500)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const x = debouncedQ.toLowerCase();
    return rows.filter((r) => {
      const matchQ = !x || r.name?.toLowerCase().includes(x) || r.metal_type?.toLowerCase().includes(x) || r.display_format?.toLowerCase().includes(x);
      const matchStatus = statusFilter === "all" || (statusFilter === "active" ? r.is_active : !r.is_active);
      return matchQ && matchStatus;
    });
  }, [rows, debouncedQ, statusFilter]);
  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected purity record(s)? Records referenced by inventory/bills will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageMaster", { action: "bulk_delete", entity_type: "purity", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data); bulk.clear(); load();
    } catch (e) { alert(e.message); } finally { setDeleting(false); }
  };
  const onSearch = (v) => { setQ(v); pag.setPage(1); };
  const onStatusChange = (v) => { setStatusFilter(v); pag.setPage(1); };
  const save = async (d) => {
    try {
      const res = await base44.functions.invoke("manageMaster", { action: editing ? "update" : "create", entity_type: "purity", id: editing?.id || "", data: d });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {can("master", "create") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("master.addPurity")}</Button>}
        <SearchBar value={q} onChange={onSearch} placeholder={t("master.searchPlaceholder")} />
        <StatusFilter value={statusFilter} onChange={onStatusChange} />
      </div>
      {filtered.length === 0 ? <EmptyState title="No purities" /> : (
        <>
          <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
          <TableShell headers={[
            <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
            "Name", "Metal", "Value", "Display", "Status", t("common.actions")
          ]}>
            {pag.pageItems.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(r.id)} onCheckedChange={() => bulk.toggleOne(r.id)} /></td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 capitalize">{r.metal_type}</td>
                <td className="px-4 py-3">{r.purity_value}</td>
                <td className="px-4 py-3"><Badge>{r.display_format}</Badge></td>
                <td className="px-4 py-3"><Badge variant={r.is_active ? "success" : "default"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {can("master", "update") && <button onClick={() => { setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>}
                    {can("master", "delete") && <button onClick={() => removeMaster("purity", r.id, t("master.confirmDelete"), load)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
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
        <DialogHeader><DialogTitle>{editing ? "Edit Purity" : "New Purity"}</DialogTitle></DialogHeader>
        <SimpleForm fields={[{ k: "name", l: "Name" }, { k: "purity_value", l: "Purity Value (number)", n: true }, { k: "display_format", l: "Display (e.g. 24K, 92%)" }]}
          selects={[{ k: "metal_type", l: "Metal", opts: ["gold", "silver", "diamond"] }, { k: "is_active", l: "Status", opts: ["true", "false"], bool: true }]}
          initial={editing} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </>
  );
}

function CategoryTab() {
  const t = useT();
  const { can } = usePermission();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const load = async () => { setLoading(true); setRows(await base44.entities.CategoryMaster.list("-created_date", 500)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const x = debouncedQ.toLowerCase();
    return rows.filter((r) => {
      const matchQ = !x || r.name?.toLowerCase().includes(x) || r.metal_type?.toLowerCase().includes(x) || r.parent_category_name?.toLowerCase().includes(x);
      const matchStatus = statusFilter === "all" || (statusFilter === "active" ? r.is_active : !r.is_active);
      return matchQ && matchStatus;
    });
  }, [rows, debouncedQ, statusFilter]);
  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected category record(s)? Records referenced by inventory/bills will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageMaster", { action: "bulk_delete", entity_type: "category", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data); bulk.clear(); load();
    } catch (e) { alert(e.message); } finally { setDeleting(false); }
  };
  const onSearch = (v) => { setQ(v); pag.setPage(1); };
  const onStatusChange = (v) => { setStatusFilter(v); pag.setPage(1); };
  const save = async (d) => {
    try {
      const res = await base44.functions.invoke("manageMaster", { action: editing ? "update" : "create", entity_type: "category", id: editing?.id || "", data: d });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {can("master", "create") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("master.addCategory")}</Button>}
        <SearchBar value={q} onChange={onSearch} placeholder={t("master.searchPlaceholder")} />
        <StatusFilter value={statusFilter} onChange={onStatusChange} />
      </div>
      {filtered.length === 0 ? <EmptyState title="No categories" /> : (
        <>
          <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
          <TableShell headers={[
            <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
            "Name", "Parent", "Metal", "Status", t("common.actions")
          ]}>
            {pag.pageItems.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(r.id)} onCheckedChange={() => bulk.toggleOne(r.id)} /></td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.parent_category_name || "—"}</td>
                <td className="px-4 py-3 capitalize">{r.metal_type}</td>
                <td className="px-4 py-3"><Badge variant={r.is_active ? "success" : "default"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {can("master", "update") && <button onClick={() => { setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>}
                    {can("master", "delete") && <button onClick={() => removeMaster("category", r.id, t("master.confirmDelete"), load)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
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
        <DialogHeader><DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
        <SimpleForm fields={[{ k: "name", l: "Name" }, { k: "parent_category_name", l: "Parent Category (optional)" }]}
          selects={[{ k: "metal_type", l: "Metal", opts: ["gold", "silver", "diamond", "mixed"] }, { k: "is_active", l: "Status", opts: ["true", "false"], bool: true }]}
          initial={editing} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </>
  );
}

function GSTTab() {
  const t = useT();
  const { can } = usePermission();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const load = async () => { setLoading(true); setRows(await base44.entities.GSTConfig.list("-created_date", 100)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const x = debouncedQ.toLowerCase();
    return rows.filter((r) => {
      const matchQ = !x || r.name?.toLowerCase().includes(x) || String(r.gst_rate).includes(x);
      const matchStatus = statusFilter === "all" || (statusFilter === "active" ? r.is_active : !r.is_active);
      return matchQ && matchStatus;
    });
  }, [rows, debouncedQ, statusFilter]);
  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected GST config(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageMaster", { action: "bulk_delete", entity_type: "gst", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data); bulk.clear(); load();
    } catch (e) { alert(e.message); } finally { setDeleting(false); }
  };
  const onSearch = (v) => { setQ(v); pag.setPage(1); };
  const onStatusChange = (v) => { setStatusFilter(v); pag.setPage(1); };
  const save = async (d) => {
    try {
      const res = await base44.functions.invoke("manageMaster", { action: editing ? "update" : "create", entity_type: "gst", id: editing?.id || "", data: d });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };
  if (loading) return <Spinner />;
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {can("master", "create") && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("master.addGst")}</Button>}
        <SearchBar value={q} onChange={onSearch} placeholder={t("master.searchPlaceholder")} />
        <StatusFilter value={statusFilter} onChange={onStatusChange} />
      </div>
      {filtered.length === 0 ? <EmptyState title="No GST configs" /> : (
        <>
          <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
          <TableShell headers={[
            <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
            "Name", "GST %", "CGST %", "SGST %", "Status", t("common.actions")
          ]}>
            {pag.pageItems.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(r.id)} onCheckedChange={() => bulk.toggleOne(r.id)} /></td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.gst_rate}%</td>
                <td className="px-4 py-3">{r.cgst_rate}%</td>
                <td className="px-4 py-3">{r.sgst_rate}%</td>
                <td className="px-4 py-3"><Badge variant={r.is_active ? "success" : "default"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {can("master", "update") && <button onClick={() => { setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>}
                    {can("master", "delete") && <button onClick={() => removeMaster("gst", r.id, t("master.confirmDelete"), load)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
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
        <DialogHeader><DialogTitle>{editing ? "Edit GST" : "New GST Config"}</DialogTitle></DialogHeader>
        <SimpleForm fields={[{ k: "name", l: "Name" }, { k: "gst_rate", l: "Total GST %", n: true }, { k: "cgst_rate", l: "CGST %", n: true }, { k: "sgst_rate", l: "SGST %", n: true }, { k: "description", l: "Description" }]}
          selects={[{ k: "is_active", l: "Status", opts: ["true", "false"], bool: true }]}
          initial={editing} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </>
  );
}

function SimpleForm({ fields, selects = [], initial, onSave, onCancel }) {
  const [f, setF] = useState(() => {
    const o = {};
    fields.forEach((x) => o[x.k] = initial?.[x.k] ?? (x.n ? 0 : ""));
    selects.forEach((x) => o[x.k] = initial?.[x.k] ?? (x.bool ? true : (x.opts[0] || "")));
    return o;
  });
  return (
    <>
      <div className="space-y-3 py-2">
        {fields.map((x) => <div key={x.k}><Label>{x.l}</Label><Input type={x.n ? "number" : "text"} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: x.n ? Number(e.target.value) : e.target.value })} /></div>)}
        {selects.map((x) => (
          <div key={x.k}><Label>{x.l}</Label>
            <Select value={String(f[x.k])} onValueChange={(v) => setF({ ...f, [x.k]: x.bool ? v === "true" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{x.opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <DialogFooter><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={() => onSave(f)}>Save</Button></DialogFooter>
    </>
  );
}