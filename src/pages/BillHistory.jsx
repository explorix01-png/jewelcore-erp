import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import {
  History, Search, Eye, IndianRupee, CheckCircle2, Clock, AlertCircle,
  Bell, Plus, Receipt, RotateCcw, Trash2
} from "lucide-react";
import { usePermission } from "@/lib/permissions";
import BillViewDialog from "@/components/billing/BillViewDialog";
import CollectDueDialog from "@/components/billing/CollectDueDialog";
import SetDueReminderDialog from "@/components/billing/SetDueReminderDialog";
import DeleteBillDialog from "@/components/billing/DeleteBillDialog";
import WhatsAppButton from "@/components/billing/WhatsAppButton";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { useDebounced } from "@/hooks/useDebounced";

// Badge for bill source type — distinguishes Inventory, Manual, and Customer Purchase bills.
function BillSourceBadge({ source }) {
  const t = useT();
  const s = source || "inventory";
  const config = {
    inventory: { variant: "default", label: t("billHistory.sourceInventory") },
    manual: { variant: "info", label: t("billHistory.sourceManual") },
    customer_purchase: { variant: "warning", label: t("billHistory.sourceCustomerPurchase") },
  };
  const c = config[s] || config.inventory;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// Derive payment status from authoritative bill values (never a manually typed string).
// Rounding-safe: treat within ₹0.50 as fully paid.
export function derivePayStatus(b) {
  if (b.status === "cancelled") return "cancelled";
  const total = Number(b.total_amount) || 0;
  const paid = Number(b.paid_amount) || 0;
  if (total <= 0) return "completed";
  if (paid >= total - 0.5) return "completed";
  if (paid > 0) return "partial";
  return "due";
}

export default function BillHistory() {
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canDelete = can("bills", "delete");
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState(null);
  const [collect, setCollect] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setBills(await base44.entities.Bill.list("-bill_date", 300));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    base44.functions.invoke("processDueReminders", {}).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const x = debouncedQ.toLowerCase().trim();
    const fromTime = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : 0;
    const toTime = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return bills
      .filter((b) => !b.is_deleted)
      .filter((b) => {
        const matchQ = !x || b.bill_number?.toLowerCase().includes(x) || b.customer_name?.toLowerCase().includes(x) || b.customer_mobile?.includes(x);
        const ps = derivePayStatus(b);
        const matchStatus = statusFilter === "all" || ps === statusFilter;
        const matchSource = sourceFilter === "all" || (b.bill_source || "inventory") === sourceFilter;
        const bt = new Date(b.bill_date).getTime();
        const matchDate = bt >= fromTime && bt <= toTime;
        return matchQ && matchStatus && matchSource && matchDate;
      });
  }, [bills, debouncedQ, statusFilter, sourceFilter, dateFrom, dateTo]);

  // Summary cards — computed from the full filtered set
  const summary = useMemo(() => {
    let completed = 0, partial = 0, due = 0, outstanding = 0, totalRevenue = 0;
    for (const b of filtered) {
      const ps = derivePayStatus(b);
      if (ps === "completed") completed++;
      else if (ps === "partial") partial++;
      else if (ps === "due") due++;
      outstanding += Number(b.due_amount) || 0;
      totalRevenue += Number(b.total_amount) || 0;
    }
    return { total: filtered.length, completed, partial, due, outstanding, totalRevenue };
  }, [filtered]);

  const pag = usePagination(filtered, 15);

  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setSourceFilter("all");
    setDateFrom("");
    setDateTo("");
    pag.setPage(1);
  };
  const hasFilters = q || statusFilter !== "all" || sourceFilter !== "all" || dateFrom || dateTo;

  const statusBadge = (b) => {
    const ps = derivePayStatus(b);
    if (ps === "cancelled") return <Badge variant="danger" dot={true}>{t("billHistory.statusCancelled")}</Badge>;
    if (ps === "completed") return <Badge variant="success" dot={true}>{t("billHistory.statusCompleted")}</Badge>;
    if (ps === "partial") return <Badge variant="warning" dot={true}>{t("billHistory.statusPartial")}</Badge>;
    return <Badge variant="danger" dot={true}>{t("billHistory.statusDue")}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            <span>Sales Invoices</span>
          </span>
        }
        title={t("billHistory.title")}
        subtitle="Search, audit, and collect payments on all past customer invoices, gold sales, and credits."
        actions={
          <Button
            onClick={() => navigate("/billing")}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>New Invoice</span>
          </Button>
        }
      />

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatCard
          label={t("billHistory.summaryTotal")}
          value={summary.total}
          sub={`${fmt(summary.totalRevenue)} billed`}
          icon={Receipt}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label={t("billHistory.summaryCompleted")}
          value={summary.completed}
          sub="Fully settled"
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
        />
        <StatCard
          label={t("billHistory.summaryPartial")}
          value={summary.partial}
          sub="Partially paid"
          icon={Clock}
          accent="bg-amber-50 text-amber-700 border border-amber-200/60"
        />
        <StatCard
          label={t("billHistory.summaryDue")}
          value={summary.due}
          sub="Zero payment received"
          icon={AlertCircle}
          accent="bg-rose-50 text-rose-700 border border-rose-200/60"
        />
        <StatCard
          label={t("billHistory.summaryOutstanding")}
          value={fmt(summary.outstanding)}
          sub="Total pending dues"
          icon={IndianRupee}
          accent={summary.outstanding > 0 ? "bg-red-50 text-red-700 border border-red-200/60" : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"}
        />
      </div>

      {/* Comprehensive Filter Bar */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Search Box */}
          <div className="md:col-span-4">
            <Label className="text-xs font-semibold text-foreground mb-1 block">Search Invoices</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); pag.setPage(1); }}
                placeholder="Bill #, Customer Name, Mobile..."
                className="pl-9 bg-background"
              />
            </div>
          </div>

          {/* Date Pickers */}
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold text-foreground mb-1 block">{t("billHistory.dateFrom")}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); pag.setPage(1); }}
              className="bg-background text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs font-semibold text-foreground mb-1 block">{t("billHistory.dateTo")}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); pag.setPage(1); }}
              className="bg-background text-xs"
            />
          </div>

          {/* Reset Filter Button */}
          {hasFilters && (
            <div className="md:col-span-4 flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset all filters</span>
              </Button>
            </div>
          )}
        </div>

        {/* Filter Pills */}
        <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Status:</span>
            {[
              { k: "all", l: t("billHistory.statusAll") },
              { k: "completed", l: t("billHistory.statusCompleted") },
              { k: "partial", l: t("billHistory.statusPartial") },
              { k: "due", l: t("billHistory.statusDue") },
              { k: "cancelled", l: t("billHistory.statusCancelled") },
            ].map((s) => (
              <button
                key={s.k}
                onClick={() => { setStatusFilter(s.k); pag.setPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  statusFilter === s.k
                    ? "bg-amber-500/15 text-amber-800 border-amber-500/30 font-semibold"
                    : "bg-background hover:bg-muted text-muted-foreground border-border"
                }`}
              >
                {s.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Source:</span>
            {[
              { k: "all", l: t("billHistory.sourceAll") },
              { k: "inventory", l: t("billHistory.sourceInventory") },
              { k: "manual", l: t("billHistory.sourceManual") },
              { k: "customer_purchase", l: t("billHistory.sourceCustomerPurchase") },
            ].map((s) => (
              <button
                key={s.k}
                onClick={() => { setSourceFilter(s.k); pag.setPage(1); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  sourceFilter === s.k
                    ? "bg-slate-900 text-white border-slate-900 font-semibold"
                    : "bg-background hover:bg-muted text-muted-foreground border-border"
                }`}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice Table / Empty State */}
      {loading ? (
        <Spinner label="Loading invoice archives..." />
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border/90 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <History className="w-8 h-8" />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {bills.length === 0 ? t("billHistory.noBills") : "No matching invoices found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {bills.length === 0
              ? "You haven't generated any customer invoices yet. Create your first bill to start tracking jewellery sales and tax archives."
              : "Try adjusting your dates or clearing your search filters to find specific customer invoices."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {bills.length === 0 ? (
              <Button
                onClick={() => navigate("/billing")}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Create First Bill</span>
              </Button>
            ) : (
              <Button variant="outline" onClick={clearFilters}>
                Reset Filter Settings
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TableShell
            headers={[
              t("billHistory.billNo"),
              t("common.date"),
              t("billHistory.customer"),
              t("billHistory.type"),
              t("common.total"),
              t("billHistory.paid"),
              t("billHistory.due"),
              t("billHistory.paymentStatus"),
              t("common.actions")
            ]}
          >
            {pag.pageItems.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3.5 font-mono text-xs font-semibold text-foreground">
                  <span className="px-2 py-0.5 rounded bg-muted/80 border border-border">
                    {b.bill_number}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(b.bill_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3.5 font-medium text-sm text-foreground">
                  <div>
                    <span className="font-semibold block">{b.customer_name}</span>
                    {b.customer_mobile && <span className="text-xs text-muted-foreground font-mono">{b.customer_mobile}</span>}
                  </div>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <BillSourceBadge source={b.bill_source} />
                </td>
                <td className="px-4 py-3.5 font-bold font-mono text-sm text-foreground whitespace-nowrap">
                  {fmt(b.total_amount)}
                </td>
                <td className="px-4 py-3.5 font-mono text-xs text-foreground whitespace-nowrap">
                  {fmt(b.paid_amount)}
                </td>
                <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap">
                  {Number(b.due_amount) > 0 ? (
                    <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      {fmt(b.due_amount)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  {statusBadge(b)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex gap-1.5 items-center">
                    <button
                      onClick={() => setView(b)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t("billHistory.viewBill")}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {b.status === "finalized" && (
                      <WhatsAppButton
                        bill={b}
                        iconOnly
                        variant="ghost"
                        className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                        title={t("whatsapp.share")}
                      />
                    )}
                    {Number(b.due_amount) > 0 && b.status === "finalized" && (
                      <button
                        onClick={() => setCollect(b)}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-700 transition-colors"
                        title={t("billHistory.collectDue")}
                      >
                        <IndianRupee className="w-4 h-4" />
                      </button>
                    )}
                    {Number(b.due_amount) > 0 && b.status === "finalized" && (
                      <button
                        onClick={() => setReminder(b)}
                        className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-700 transition-colors"
                        title={t("dueReminder.setReminder")}
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors"
                        title={t("common.delete") || "Delete Bill"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
          <Pagination {...pag} />
        </div>
      )}

      {view && <BillViewDialog bill={view} onClose={() => setView(null)} />}
      {collect && <CollectDueDialog bill={collect} onClose={() => setCollect(null)} onDone={load} />}
      {reminder && <SetDueReminderDialog bill={reminder} onClose={() => setReminder(null)} onDone={load} />}
      {deleteTarget && (
        <DeleteBillDialog
          bill={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}