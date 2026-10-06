import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, Badge, TableShell, StatCard } from "@/components/ui/erp";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [o, c, k] = await Promise.all([
        base44.entities.CustomerOrder.list("-order_date", 200),
        base44.entities.Customer.list("-created_date", 200),
        base44.entities.Karagir.filter({ status: "active" }, "-created_date", 100),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c.filter((x) => !x.is_deleted) : []);
      setKaragirs(Array.isArray(k) ? k : []);
    } catch (err) {
      console.error("Failed to load customer orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = orders.length;
    const inProgress = orders.filter((o) => o.status === "ASSIGNED" || o.status === "IN_PROGRESS").length;
    const ready = orders.filter((o) => o.status === "READY").length;
    const delivered = orders.filter((o) => o.status === "DELIVERED" || o.status === "COMPLETED").length;
    return { total, inProgress, ready, delivered };
  }, [orders]);

  const filtered = useMemo(() => orders.filter((o) => {
    const x = q.toLowerCase().trim();
    const matchQ = !x || o.order_number?.toLowerCase().includes(x) || o.customer_name?.toLowerCase().includes(x) || o.required_item?.toLowerCase().includes(x);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchQ && matchStatus;
  }), [orders, q, statusFilter]);

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
            <span>Custom Jewellery Orders</span>
          </span>
        }
        title={t("orders.title")}
        subtitle="Track bespoke customer design orders, expected completion deadlines, and craftsman assignment."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => navigate("/karagir")} variant="outline" className="border-border hover:bg-muted">
              <Hammer className="w-4 h-4 mr-1.5 text-amber-600" />
              <span>Karagir Workshop</span>
            </Button>
            <Button
              onClick={() => { setEditing(null); setOpen(true); }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t("orders.newOrder")}
            </Button>
          </div>
        }
      />

      {/* Orders Pipeline Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Orders"
          value={stats.total}
          sub="All custom requests"
          icon={ClipboardList}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label="In Workshop"
          value={stats.inProgress}
          sub="Crafted by karagirs"
          icon={Hammer}
          accent="bg-amber-50 text-amber-700 border border-amber-200/60"
        />
        <StatCard
          label="Ready for Delivery"
          value={stats.ready}
          sub="Awaiting customer pickup"
          icon={ClipboardList}
          accent="bg-teal-50 text-teal-700 border border-teal-200/60"
        />
        <StatCard
          label="Completed & Delivered"
          value={stats.delivered}
          sub="Finalized handovers"
          icon={ClipboardList}
          accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by order #, customer, or jewellery item..."
              className="pl-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {["all", "NEW", "ASSIGNED", "IN_PROGRESS", "READY", "DELIVERED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  statusFilter === st
                    ? "bg-amber-500/15 text-amber-800 border-amber-500/30 font-semibold"
                    : "bg-background hover:bg-muted text-muted-foreground border-border"
                }`}
              >
                {st === "all" ? "All Orders" : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading customer orders..." />
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border/90 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {orders.length === 0 ? t("orders.noOrders") : "No matching orders found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {orders.length === 0
              ? "Take custom jewellery manufacturing orders from customers and delegate them to your karagirs with deadlines."
              : "Try adjusting your search terms or filter selection."}
          </p>
          {orders.length === 0 && (
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() => { setEditing(null); setOpen(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Create First Order</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <TableShell headers={["Order No.", "Customer", "Jewellery Item", "Assigned Karagir", "Expected Date", "Status", t("common.actions")]}>
          {filtered.map((o) => (
            <tr key={o.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3.5 font-mono text-xs font-semibold text-foreground">
                <span className="px-2 py-0.5 rounded bg-muted border border-border">
                  {o.order_number}
                </span>
              </td>
              <td className="px-4 py-3.5 font-semibold text-sm text-foreground">{o.customer_name}</td>
              <td className="px-4 py-3.5 text-xs text-foreground font-medium">{o.required_item}</td>
              <td className="px-4 py-3.5 text-xs text-muted-foreground">
                {o.karagir_name ? (
                  <span className="font-medium text-foreground">{o.karagir_name}</span>
                ) : (
                  <span className="italic text-muted-foreground">Unassigned</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
                {o.expected_completion_date ? new Date(o.expected_completion_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' }) : "—"}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <Badge
                  variant={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" ? "danger" : o.status === "READY" ? "info" : "warning"}
                  dot={true}
                >
                  {t("status." + o.status)}
                </Badge>
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Select value={o.status} onValueChange={(v) => setStatus(o, v)}>
                    <SelectTrigger className="h-8 w-28 text-xs bg-background border-border/80"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t("status." + s)}</SelectItem>)}</SelectContent>
                  </Select>
                  <button
                    onClick={() => { setEditing(o); setOpen(true); }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit Order"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <ClipboardList className="w-4 h-4" />
              </div>
              {editing ? t("orders.editOrder") : t("orders.newOrder")}
            </DialogTitle>
          </DialogHeader>
          <OrderForm initial={editing} customers={customers} karagirs={karagirs} onSave={save} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
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