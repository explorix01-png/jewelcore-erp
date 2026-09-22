import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, StatCard, Spinner, Badge, EmptyState } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Link } from "react-router-dom";
import { IndianRupee, Users, Package, Receipt, AlertTriangle, Clock, TrendingUp, ShoppingCart, FileText } from "lucide-react";
import QuickActions from "@/components/dashboard/QuickActions";

export default function Dashboard() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [staticData, setStaticData] = useState(null);
  const [rangeData, setRangeData] = useState(null);
  const [range, setRange] = useState("monthly");
  const [rangeLoading, setRangeLoading] = useState(false);

  // Static aggregates — fetched ONCE on mount (inventory, counts, today/weekly/monthly sales, recent lists).
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getDashboardStats", {});
        if (res.data?.error) throw new Error(res.data.error);
        setStaticData(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Range-dependent aggregates — fetched on mount and when range changes.
  // Only a tiny payload (a few sums + top-5 customers) is downloaded.
  useEffect(() => {
    (async () => {
      setRangeLoading(true);
      try {
        const res = await base44.functions.invoke("getDashboardRangeStats", { range });
        if (res.data?.error) throw new Error(res.data.error);
        setRangeData(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setRangeLoading(false);
      }
    })();
  }, [range]);

  if (loading) return <Spinner />;
  if (!staticData) return <EmptyState title={t("dashboard.noData")} description={t("dashboard.noDataDesc")} />;

  const s = staticData;
  const r = rangeData || { inventorySales: 0, manualSales: 0, gstSales: 0, nonGstSales: 0, collectedPayments: 0, topCustomers: [] };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("dashboard.todaySales")} value={fmt(s.todaySales)} icon={IndianRupee} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label={t("dashboard.weeklySales")} value={fmt(s.weeklySales)} icon={TrendingUp} accent="bg-blue-50 text-blue-700" />
        <StatCard label={t("dashboard.monthlySales")} value={fmt(s.monthlySales)} icon={IndianRupee} accent="bg-amber-50 text-amber-700" />
        <StatCard label={t("dashboard.totalBills")} value={s.totalBills} icon={Receipt} accent="bg-purple-50 text-purple-700" />
      </div>

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 transition-opacity ${rangeLoading ? "opacity-60" : ""}`}>
        <StatCard label={t("dashboard.inventorySales")} value={fmt(r.inventorySales)} icon={Package} accent="bg-yellow-50 text-yellow-700" />
        <StatCard label={t("dashboard.manualSales")} value={fmt(r.manualSales)} icon={FileText} accent="bg-indigo-50 text-indigo-700" />
        <StatCard label={t("dashboard.gstSales")} value={fmt(r.gstSales)} icon={Receipt} accent="bg-green-50 text-green-700" />
        <StatCard label={t("dashboard.nonGstSales")} value={fmt(r.nonGstSales)} icon={Receipt} accent="bg-slate-100 text-slate-700" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("dashboard.goldStock")} value={`${s.goldQty} pcs`} sub={`${fmt(s.goldValue)} est.`} icon={Package} accent="bg-yellow-50 text-yellow-700" />
        <StatCard label={t("dashboard.silverStock")} value={`${s.silverQty} pcs`} sub={`${fmt(s.silverValue)} est.`} icon={Package} accent="bg-slate-100 text-slate-700" />
        <StatCard label={t("dashboard.customers")} value={s.totalCustomers} icon={Users} accent="bg-indigo-50 text-indigo-700" />
        <StatCard label={t("dashboard.pendingPayments")} value={fmt(s.pendingPayments)} icon={Clock} accent="bg-red-50 text-red-700" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("dashboard.collectedPayments")} value={fmt(r.collectedPayments)} icon={IndianRupee} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label={t("dashboard.purchases")} value={s.totalPurchases} icon={ShoppingCart} accent="bg-blue-50 text-blue-700" />
        <StatCard label={t("dashboard.orders")} value={s.totalOrders} icon={FileText} accent="bg-purple-50 text-purple-700" />
        <StatCard label={t("dashboard.karagirs")} value={s.totalKaragirs} icon={Users} accent="bg-amber-50 text-amber-700" />
      </div>

      <QuickActions />

      {s.lowStock > 0 && (
        <div className="flex items-center gap-2 mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4" />
          {s.lowStock} {t("dashboard.lowStockAlert")}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold">{t("dashboard.recentBills")}</h3>
            <Link to="/bills" className="text-xs text-amber-700 hover:underline">{t("dashboard.viewAll")}</Link>
          </div>
          {s.recentBills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("dashboard.noBills")}</p>
          ) : (
            <div className="space-y-2">
              {s.recentBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{b.bill_number}</p>
                    <p className="text-xs text-muted-foreground">{b.customer_name} · {new Date(b.bill_date).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(b.total_amount)}</p>
                    {b.due_amount > 0 ? <Badge variant="warning">{t("billHistory.due")} {fmt(b.due_amount)}</Badge> : <Badge variant="success">{t("status.paid")}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold">{t("dashboard.recentPurchases")}</h3>
          </div>
          {s.recentPurchases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("dashboard.noPurchases")}</p>
          ) : (
            <div className="space-y-2">
              {s.recentPurchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{p.purchase_number}</p>
                    <p className="text-xs text-muted-foreground">{p.supplier_name} · {new Date(p.purchase_date).toLocaleDateString("en-IN")}</p>
                  </div>
                  <p className="text-sm font-semibold">{fmt(p.total_amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold">{t("dashboard.topCustomers")}</h3>
            <select value={range} onChange={(e) => setRange(e.target.value)} disabled={rangeLoading} className="text-xs border rounded px-2 py-1 bg-background disabled:opacity-50">
              <option value="weekly">{t("dashboard.weekly")}</option>
              <option value="monthly">{t("dashboard.monthly")}</option>
              <option value="yearly">{t("dashboard.yearly")}</option>
            </select>
          </div>
          {r.topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("dashboard.noDataPeriod")}</p>
          ) : (
            <div className="space-y-2">
              {r.topCustomers.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.count} bill(s)</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold">{fmt(c.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}