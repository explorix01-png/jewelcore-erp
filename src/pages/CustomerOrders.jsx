import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Plus, Search, Pencil, Hammer } from "lucide-react";

const STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "READY", "COMPLETED", "DELIVERED", "CANCELLED"];

export default function CustomerOrders() {
  const t = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [karagirs, setKaragirs] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const [o, c, k] = await Promise.all([
      base44.entities.CustomerOrder.list("-order_date", 200),
      base44.entities.Customer.list("-created_date", 200),
      base44.entities.Karagir.filter({ status: "active" }, "-created_date", 100),
    ]);
    setOrders(o); setCustomers(c.filter((x) => !x.is_deleted)); setKaragirs(k); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => orders.filter((o) => {
    const x = q.toLowerCase();
    return !x || o.order_number?.toLowerCase().includes(x) || o.customer_name?.toLowerCase().includes(x) || o.required_item?.toLowerCase().includes(x);
  }), [orders, q]);

  const save = async (d) => {
    const cust = customers.find((c) => c.id === d.customer_id);
    const k = karagirs.find((x) => x.id === d.karagir_id);
    const payload = { ...d, customer_name: cust?.name || "", karagir_name: k?.name || "", status: d.karagir_id && d.status === "NEW" ? "ASSIGNED" : d.status };
    try {
      const res = await base44.functions.invoke("manageOrder", { action: editing ? "update" : "create", id: editing?.id || "", data: payload });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setOpen(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const setStatus = async (o, status) => {
    try {
      const res = await base44.functions.invoke("manageOrder", { action: "status_change", id: o.id, data: { status } });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("orders.title")} subtitle={t("orders.subtitle")}
        actions={<div className="flex gap-2"><Button onClick={() => navigate("/karagir")} variant="outline"><Hammer className="w-4 h-4 mr-1" /> Karagir Orders</Button><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> {t("orders.newOrder")}</Button></div>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("orders.searchPlaceholder")} className="pl-9" />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("orders.noOrders")} description={t("orders.noOrdersDesc")} />
      ) : (
        <TableShell headers={["Order No.", "Customer", "Item", "Karagir", "Expected", "Status", t("common.actions")]}>
          {filtered.map((o) => (
            <tr key={o.id} className="hover:bg-muted/40">
              <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
              <td className="px-4 py-3 font-medium">{o.customer_name}</td>
              <td className="px-4 py-3">{o.required_item}</td>
              <td className="px-4 py-3">{o.karagir_name || "—"}</td>
              <td className="px-4 py-3 text-xs">{o.expected_completion_date || "—"}</td>
              <td className="px-4 py-3"><Badge variant={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" ? "danger" : o.status === "READY" ? "info" : "warning"}>{t("status." + o.status)}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t("status." + s)}</SelectItem>)}</SelectContent>
                  </Select>
                  <button onClick={() => { setEditing(o); setOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("orders.editOrder") : t("orders.newOrder")}</DialogTitle></DialogHeader>
        <OrderForm initial={editing} customers={customers} karagirs={karagirs} onSave={save} onCancel={() => setOpen(false)} />
      </DialogContent></Dialog>
    </div>
  );
}

function OrderForm({ initial, customers, karagirs, onSave, onCancel }) {
  const t = useT();
  const [f, setF] = useState({
    customer_id: initial?.customer_id || "", required_item: initial?.required_item || "",
    design_details: initial?.design_details || "", expected_weight: initial?.expected_weight || 0,
    notes: initial?.notes || "", order_date: initial?.order_date || new Date().toISOString().slice(0, 10),
    expected_completion_date: initial?.expected_completion_date || "", karagir_id: initial?.karagir_id || "",
    status: initial?.status || "NEW",
  });
  return (
    <>
      <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
        <div><Label>{t("orders.customer")} *</Label>
          <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
            <SelectTrigger><SelectValue placeholder={t("orders.selectCustomer")} /></SelectTrigger>
            <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.mobile || ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>{t("orders.requiredItem")} *</Label><Input value={f.required_item} onChange={(e) => setF({ ...f, required_item: e.target.value })} /></div>
        <div><Label>{t("orders.designDetails")}</Label><Textarea value={f.design_details} onChange={(e) => setF({ ...f, design_details: e.target.value })} rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("orders.expectedWeight")}</Label><Input type="number" value={f.expected_weight} onChange={(e) => setF({ ...f, expected_weight: e.target.value })} /></div>
          <div><Label>{t("orders.orderDate")}</Label><Input type="date" value={f.order_date} onChange={(e) => setF({ ...f, order_date: e.target.value })} /></div>
        </div>
        <div><Label>{t("orders.expectedCompletion")}</Label><Input type="date" value={f.expected_completion_date} onChange={(e) => setF({ ...f, expected_completion_date: e.target.value })} /></div>
        <div><Label>{t("orders.karagir")}</Label>
          <Select value={f.karagir_id} onValueChange={(v) => setF({ ...f, karagir_id: v })}>
            <SelectTrigger><SelectValue placeholder={t("orders.unassigned")} /></SelectTrigger>
            <SelectContent>{karagirs.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>{t("common.notes")}</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onCancel}>{t("common.cancel")}</Button><Button onClick={() => f.customer_id && f.required_item && onSave(f)} disabled={!(f.customer_id && f.required_item)}>{t("common.save")}</Button></DialogFooter>
    </>
  );
}