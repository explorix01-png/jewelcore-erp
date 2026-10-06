import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hammer, Plus, Search, Pencil, ClipboardList, Trash2, Eye } from "lucide-react";
import KaragirOrdersDialog from "@/components/karagir/KaragirOrdersDialog";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

const KWO_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

export default function Karagir() {
  const t = useT();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Hammer className="w-3.5 h-3.5 text-amber-600" />
            <span>Artisan & Goldsmith Workshop</span>
          </span>
        }
        title={t("karagir.title")}
        subtitle="Manage in-house and contract goldsmiths, track job work orders, casting allocations, and craftsmanship progress."
      />

      <Tabs defaultValue="karagirs" className="space-y-4">
        <div className="p-1 rounded-xl bg-card border border-border/80 shadow-2xs inline-block">
          <TabsList className="grid grid-cols-2 w-full max-w-sm bg-muted/60">
            <TabsTrigger value="karagirs" className="text-xs font-semibold">{t("karagir.karagirs")}</TabsTrigger>
            <TabsTrigger value="orders" className="text-xs font-semibold">{t("karagir.workOrders")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="karagirs"><KaragirsTab /></TabsContent>
        <TabsContent value="orders"><KaragirOrdersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function KaragirsTab() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewOrdersFor, setViewOrdersFor] = useState(null);

  const load = async () => {
    setLoading(true);
    const [k, o] = await Promise.all([base44.entities.Karagir.list("-created_date", 200), base44.entities.KaragirOrder.list("-order_date", 200)]);
    setRows(k); setOrders(o); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (d) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageKaragir", { action: editing ? "update" : "create", id: editing?.id || "", data: d });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const pag = usePagination(rows);
  const bulk = useBulkSelection(rows);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected karagir(s)? Karagirs with work orders will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageKaragir", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data); bulk.clear(); load();
    } catch (e) { alert(e.message); } finally { setDeleting(false); }
  };
  // Precompute per-karagir order counts in O(orders) once per render instead
  // of calling orders.filter() 6× per row (O(karagirs × 6 × orders) per render).
  const orderStats = useMemo(() => {
    const map = {};
    for (const o of orders) {
      if (!map[o.karagir_id]) map[o.karagir_id] = { total: 0, pending: 0, completed: 0 };
      const s = map[o.karagir_id];
      s.total++;
      if (o.status === "IN_PROGRESS" || o.status === "ASSIGNED" || o.status === "PENDING") s.pending++;
      else if (o.status === "READY" || o.status === "DELIVERED") s.completed++;
    }
    return map;
  }, [orders]);

  const deletePermanent = async (r) => {
    if (!confirm(`Permanently delete karagir "${r.name}"? This cannot be undone.`)) return;
    try {
      const res = await base44.functions.invoke("manageKaragir", { action: "delete_permanent", id: r.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Karagir deleted permanently.");
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <div className="mb-3"><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("karagir.newKaragir")}</Button></div>
      {rows.length === 0 ? (
        <EmptyState icon={Hammer} title={t("karagir.noKaragirs")} description={t("karagir.noKaragirsDesc")} />
      ) : (
        <>
        <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
        <TableShell headers={[
          <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
          t("common.name"), t("common.mobile"), t("karagir.specialization"), t("karagir.assigned"), t("karagir.pending"), t("karagir.completed"), t("common.status"), t("common.actions")
        ]}>
          {pag.pageItems.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(r.id)} onCheckedChange={() => bulk.toggleOne(r.id)} /></td>
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3">{r.mobile || "—"}</td>
              <td className="px-4 py-3">{r.specialization || "—"}</td>
              <td className="px-4 py-3">{orderStats[r.id]?.total || 0}</td>
              <td className="px-4 py-3">{orderStats[r.id]?.pending || 0}</td>
              <td className="px-4 py-3">{orderStats[r.id]?.completed || 0}</td>
              <td className="px-4 py-3"><Badge variant={r.status === "active" ? "success" : "default"}>{t("status." + r.status)}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => setViewOrdersFor(r)} className="p-1.5 rounded hover:bg-muted text-blue-600" title={t("karagir.viewOrders")}><Eye className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deletePermanent(r)} className="p-1.5 rounded hover:bg-muted text-red-600" title="Delete Permanently"><Trash2 className="w-3.5 h-3.5" /></button>
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
        <DialogHeader><DialogTitle>{editing ? t("karagir.editKaragir") : t("karagir.newKaragir")}</DialogTitle></DialogHeader>
        <KaragirForm initial={editing} onSave={save} onCancel={() => setOpen(false)} saving={saving} />
      </DialogContent></Dialog>
      {viewOrdersFor && <KaragirOrdersDialog karagir={viewOrdersFor} onClose={() => setViewOrdersFor(null)} />}
    </>
  );
}

function KaragirOrdersTab() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [karagirs, setKaragirs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const [o, k, c] = await Promise.all([
      base44.entities.KaragirOrder.list("-order_date", 300),
      base44.entities.Karagir.list("-created_date", 200),
      base44.entities.Customer.list("-created_date", 200),
    ]);
    setOrders(o); setKaragirs(k); setCustomers(c.filter((x) => !x.is_deleted)); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o) => {
    const x = debouncedQ.toLowerCase();
    const matchQ = !x || o.order_number?.toLowerCase().includes(x) || o.karagir_name?.toLowerCase().includes(x) || o.customer_name?.toLowerCase().includes(x) || o.work_description?.toLowerCase().includes(x);
    const matchS = !statusFilter || o.status === statusFilter;
    return matchQ && matchS;
  });

  const pag = usePagination(filtered);

  const save = async (d) => {
    const k = karagirs.find((x) => x.id === d.karagir_id);
    const c = customers.find((x) => x.id === d.customer_id);
    const payload = { ...d, karagir_name: k?.name || "", customer_name: c?.name || "" };
    try {
      const res = await base44.functions.invoke("manageKaragirOrder", { action: editing ? "update" : "create", id: editing?.id || "", data: payload });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const setStatus = async (o, status) => {
    try {
      const res = await base44.functions.invoke("manageKaragirOrder", { action: "status_change", id: o.id, data: { status } });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("karagir.searchOrderPlaceholder")} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pag.setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("common.allStatuses")} /></SelectTrigger>
          <SelectContent><SelectItem value={null}>{t("common.all")}</SelectItem>{KWO_STATUSES.map((s) => <SelectItem key={s} value={s}>{t("status." + s)}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("karagir.newOrder")}</Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("karagir.noWorkOrders")} description={t("karagir.noWorkOrdersDesc")} />
      ) : (
        <>
        <TableShell headers={[t("karagir.orderNo"), t("karagir.karagir"), t("orders.customer"), t("karagir.workDescription"), t("orders.expected"), t("common.status"), t("common.actions")]}>
          {pag.pageItems.map((o) => (
            <tr key={o.id} className="hover:bg-muted/40">
              <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
              <td className="px-4 py-3 font-medium">{o.karagir_name || "—"}</td>
              <td className="px-4 py-3">{o.customer_name || "—"}</td>
              <td className="px-4 py-3 text-sm max-w-[200px] truncate">{o.work_description}</td>
              <td className="px-4 py-3 text-xs">{o.expected_delivery_date || "—"}</td>
              <td className="px-4 py-3"><Badge variant={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" ? "danger" : o.status === "READY" ? "info" : "warning"}>{t("status." + o.status)}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{KWO_STATUSES.map((s) => <SelectItem key={s} value={s}>{t("status." + s)}</SelectItem>)}</SelectContent>
                  </Select>
                  <button onClick={() => { setEditing(o); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
        <Pagination {...pag} />
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? t("karagir.editWorkOrder") : t("karagir.newOrder")}</DialogTitle></DialogHeader>
        <KaragirOrderForm initial={editing} karagirs={karagirs} customers={customers} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </>
  );
}

function KaragirForm({ initial, onSave, onCancel, saving }) {
  const t = useT();
  const [f, setF] = useState({ name: initial?.name || "", mobile: initial?.mobile || "", address: initial?.address || "", specialization: initial?.specialization || "", status: initial?.status || "active", notes: initial?.notes || "" });
  return (
    <>
      <div className="space-y-3 py-2">
        <div><Label>{t("common.name")} *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>{t("common.mobile")}</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
        <div><Label>{t("karagir.specialization")}</Label><Input value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} /></div>
        <div><Label>{t("suppliers.address")}</Label><Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} /></div>
        <div><Label>{t("common.status")}</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">{t("status.active")}</SelectItem><SelectItem value="inactive">{t("status.inactive")}</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>{t("common.notes")}</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onCancel} disabled={saving}>{t("common.cancel")}</Button><Button onClick={() => f.name && onSave(f)} disabled={!f.name || saving}>{saving ? t("common.saving") : t("common.save")}</Button></DialogFooter>
    </>
  );
}

function KaragirOrderForm({ initial, karagirs, customers, onSave, onCancel }) {
  const t = useT();
  const [f, setF] = useState({
    karagir_id: initial?.karagir_id || "", customer_id: initial?.customer_id || "",
    work_description: initial?.work_description || "", item_description: initial?.item_description || "",
    metal_type: initial?.metal_type || "gold", purity_display: initial?.purity_display || "",
    gross_weight: initial?.gross_weight || 0, net_weight: initial?.net_weight || 0,
    quantity: initial?.quantity || 1, expected_delivery_date: initial?.expected_delivery_date || "",
    labour_charge: initial?.labour_charge || 0, advance_payment: initial?.advance_payment || 0,
    status: initial?.status || "PENDING", order_date: initial?.order_date || new Date().toISOString().slice(0, 10),
    notes: initial?.notes || "",
  });
  return (
    <>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("karagir.karagir")} *</Label>
            <Select value={f.karagir_id} onValueChange={(v) => setF({ ...f, karagir_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("orders.selectCustomer")} /></SelectTrigger>
              <SelectContent>{karagirs.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("orders.customer")}</Label>
            <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("common.optional")} /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>{t("karagir.workDescription")} *</Label><Textarea value={f.work_description} onChange={(e) => setF({ ...f, work_description: e.target.value })} rows={2} /></div>
        <div><Label>{t("karagir.itemDescription")}</Label><Input value={f.item_description} onChange={(e) => setF({ ...f, item_description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{t("billing.metalType")}</Label>
            <Select value={f.metal_type} onValueChange={(v) => setF({ ...f, metal_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["gold", "silver", "diamond"].map((m) => <SelectItem key={m} value={m}>{t("metal." + m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("billing.purity")}</Label><Input value={f.purity_display} onChange={(e) => setF({ ...f, purity_display: e.target.value })} /></div>
          <div><Label>{t("common.quantity")}</Label><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("billing.grossWt")}</Label><Input type="number" value={f.gross_weight} onChange={(e) => setF({ ...f, gross_weight: e.target.value })} /></div>
          <div><Label>{t("billing.netWt")}</Label><Input type="number" value={f.net_weight} onChange={(e) => setF({ ...f, net_weight: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("karagir.expectedDelivery")}</Label><Input type="date" value={f.expected_delivery_date} onChange={(e) => setF({ ...f, expected_delivery_date: e.target.value })} /></div>
          <div><Label>{t("orders.orderDate")}</Label><Input type="date" value={f.order_date} onChange={(e) => setF({ ...f, order_date: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("karagir.labourCharge")}</Label><Input type="number" value={f.labour_charge} onChange={(e) => setF({ ...f, labour_charge: e.target.value })} /></div>
          <div><Label>{t("karagir.advancePayment")}</Label><Input type="number" value={f.advance_payment} onChange={(e) => setF({ ...f, advance_payment: e.target.value })} /></div>
        </div>
        <div><Label>{t("common.notes")}</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button><Button onClick={() => f.karagir_id && f.work_description && onSave(f)} disabled={!(f.karagir_id && f.work_description)}>{t("common.save")}</Button></DialogFooter>
    </>
  );
}