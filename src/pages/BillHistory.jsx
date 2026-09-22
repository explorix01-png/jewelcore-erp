import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { History, Search, Eye, IndianRupee, CheckCircle2, Clock, AlertCircle, XCircle, Bell } from "lucide-react";
import BillViewDialog from "@/components/billing/BillViewDialog";
import CollectDueDialog from "@/components/billing/CollectDueDialog";
import SetDueReminderDialog from "@/components/billing/SetDueReminderDialog";
import WhatsAppButton from "@/components/billing/WhatsAppButton";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
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

  const load = async () => {
    setLoading(true);
    try { setBills(await base44.entities.Bill.list("-bill_date", 200)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // Process due reminders on page load — creates notifications for due reminders whose date has arrived
    base44.functions.invoke("processDueReminders", {}).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const x = debouncedQ.toLowerCase();
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

  // Summary cards — computed from the full filtered set (respects date range + search), not just the current page.
  const summary = useMemo(() => {
    let completed = 0, partial = 0, due = 0, outstanding = 0;
    for (const b of filtered) {
      const ps = derivePayStatus(b);
      if (ps === "completed") completed++;
      else if (ps === "partial") partial++;
      else if (ps === "due") due++;
      outstanding += Number(b.due_amount) || 0;
    }
    return { total: filtered.length, completed, partial, due, outstanding };
  }, [filtered]);

  const pag = usePagination(filtered);

  const clearFilters = () => { setQ(""); setStatusFilter("all"); setSourceFilter("all"); setDateFrom(""); setDateTo(""); pag.setPage(1); };
  const hasFilters = q || statusFilter !== "all" || sourceFilter !== "all" || dateFrom || dateTo;

  const statusBadge = (b) => {
    const ps = derivePayStatus(b);
    if (ps === "cancelled") return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />{t("billHistory.statusCancelled")}</Badge>;
    if (ps === "completed") return <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-1" />{t("billHistory.statusCompleted")}</Badge>;
    if (ps === "partial") return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />{t("billHistory.statusPartial")}</Badge>;
    return <Badge variant="danger"><AlertCircle className="w-3 h-3 mr-1" />{t("billHistory.statusDue")}</Badge>;
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("billHistory.title")} subtitle={t("billHistory.subtitle")} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label={t("billHistory.summaryTotal")} value={summary.total} icon={History} accent="bg-blue-50 text-blue-700" />
        <StatCard label={t("billHistory.summaryCompleted")} value={summary.completed} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label={t("billHistory.summaryPartial")} value={summary.partial} icon={Clock} accent="bg-amber-50 text-amber-700" />
        <StatCard label={t("billHistory.summaryDue")} value={summary.due} icon={AlertCircle} accent="bg-red-50 text-red-700" />
        <StatCard label={t("billHistory.summaryOutstanding")} value={fmt(summary.outstanding)} icon={IndianRupee} accent="bg-purple-50 text-purple-700" />
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("billHistory.searchPlaceholder")} className="pl-9" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("billHistory.paymentStatus")}</Label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {[
              { k: "all", l: t("billHistory.statusAll") },
              { k: "completed", l: t("billHistory.statusCompleted") },
              { k: "partial", l: t("billHistory.statusPartial") },
              { k: "due", l: t("billHistory.statusDue") },
              { k: "cancelled", l: t("billHistory.statusCancelled") },
            ].map((s) => (
              <button key={s.k} onClick={() => { setStatusFilter(s.k); pag.setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${statusFilter === s.k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("billHistory.type")}</Label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {[
              { k: "all", l: t("billHistory.sourceAll") },
              { k: "inventory", l: t("billHistory.sourceInventory") },
              { k: "manual", l: t("billHistory.sourceManual") },
              { k: "customer_purchase", l: t("billHistory.sourceCustomerPurchase") },
            ].map((s) => (
              <button key={s.k} onClick={() => { setSourceFilter(s.k); pag.setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${sourceFilter === s.k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("billHistory.dateFrom")}</Label>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); pag.setPage(1); }} className="w-[150px]" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("billHistory.dateTo")}</Label>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); pag.setPage(1); }} className="w-[150px]" />
        </div>
        {hasFilters && <Button variant="outline" onClick={clearFilters} className="mb-0.5">{t("billHistory.clear")}</Button>}
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={History} title={t("billHistory.noBills")} description={t("billHistory.noBillsDesc")} />
      ) : (
        <>
          <TableShell headers={[t("billHistory.billNo"), t("common.date"), t("billHistory.customer"), t("billHistory.type"), t("common.total"), t("billHistory.paid"), t("billHistory.due"), t("billHistory.paymentStatus"), t("common.actions")]}>
            {pag.pageItems.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs">{b.bill_number}</td>
                <td className="px-4 py-3">{new Date(b.bill_date).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3 font-medium">{b.customer_name}</td>
                <td className="px-4 py-3"><BillSourceBadge source={b.bill_source} /></td>
                <td className="px-4 py-3 font-semibold">{fmt(b.total_amount)}</td>
                <td className="px-4 py-3">{fmt(b.paid_amount)}</td>
                <td className="px-4 py-3">{Number(b.due_amount) > 0 ? <span className="text-red-600 font-medium">{fmt(b.due_amount)}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">{statusBadge(b)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setView(b)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-3.5 h-3.5" /></button>
                    {b.status === "finalized" && <WhatsAppButton bill={b} iconOnly variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700" title={t("whatsapp.share")} />}
                    {Number(b.due_amount) > 0 && b.status === "finalized" && <button onClick={() => setCollect(b)} className="p-1.5 rounded hover:bg-muted text-emerald-700" title={t("billHistory.collectDue")}><IndianRupee className="w-3.5 h-3.5" /></button>}
                    {Number(b.due_amount) > 0 && b.status === "finalized" && <button onClick={() => setReminder(b)} className="p-1.5 rounded hover:bg-muted text-amber-600" title={t("dueReminder.setReminder")}><Bell className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>
          <Pagination {...pag} />
        </>
      )}
      {view && <BillViewDialog bill={view} onClose={() => setView(null)} />}
      {collect && <CollectDueDialog bill={collect} onClose={() => setCollect(null)} onDone={load} />}
      {reminder && <SetDueReminderDialog bill={reminder} onClose={() => setReminder(null)} onDone={load} />}
    </div>
  );
}