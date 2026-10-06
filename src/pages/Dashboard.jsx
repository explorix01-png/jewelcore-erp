import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { StatCard, Spinner, Badge, EmptyState } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  IndianRupee, Users, Package, Receipt, AlertTriangle, TrendingUp,
  FileText, ArrowRight, Coins, Gem, Plus, Sparkles, CheckCircle2, ShoppingBag
} from "lucide-react";
import QuickActions from "@/components/dashboard/QuickActions";
import DashboardDrillDownModal from "@/components/dashboard/DashboardDrillDownModal";

export default function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { user, activeShop } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staticData, setStaticData] = useState(null);
  const [rangeData, setRangeData] = useState(null);
  const [range, setRange] = useState("monthly");
  const [rangeLoading, setRangeLoading] = useState(false);
  const [weightPeriod, setWeightPeriod] = useState("daily");
  const [drillDown, setDrillDown] = useState(null);

  // Static aggregates — fetched ONCE on mount
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

  // Range-dependent aggregates — fetched when range changes
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

  if (loading) return <Spinner label="Loading dashboard intelligence..." />;
  if (!staticData) return <EmptyState title={t("dashboard.noData")} description={t("dashboard.noDataDesc")} />;

  const s = staticData;
  const r = rangeData || { inventorySales: 0, manualSales: 0, gstSales: 0, nonGstSales: 0, collectedPayments: 0, topCustomers: [] };

  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-7">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-amber-50/40 p-5 sm:p-7 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
                <Sparkles className="w-3 h-3 text-amber-600" />
                Store Performance Hub
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">· {todayFormatted}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {activeShop?.shop_name || "Jewellery Store"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Real-time jewellery sales, gold & silver stocks, customer dues, and procurement analytics.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => navigate("/billing")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{t("dashboard.qa.newBill")}</span>
            </button>
            <button
              onClick={() => navigate("/rates")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-border/80 bg-background hover:bg-muted text-foreground transition-all"
            >
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span>Metal Rates</span>
            </button>
          </div>
        </div>
      </div>

      {/* Low Stock Alert if any */}
      {s.lowStock > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold">{s.lowStock} {t("dashboard.lowStockAlert")}</p>
              <p className="text-xs text-amber-800/80">Some jewellery items have fallen below minimum threshold.</p>
            </div>
          </div>
          <Link
            to="/inventory/gold"
            className="text-xs font-bold text-amber-900 underline hover:text-amber-950 shrink-0"
          >
            Review Stock →
          </Link>
        </div>
      )}

      {/* Primary Financial Overview Row */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
            Financial & Sales Overview
          </h2>
          <span className="text-xs text-muted-foreground">Click any card to inspect transactions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("dashboard.todaySales")}
            value={fmt(s.todaySales)}
            sub="POS Invoices today"
            icon={IndianRupee}
            accent="bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs"
            onClick={() => setDrillDown({ metric: "today_sales" })}
          />
          <StatCard
            label={t("dashboard.weeklySales")}
            value={fmt(s.weeklySales)}
            sub="Current week (from Mon)"
            icon={TrendingUp}
            accent="bg-blue-50 text-blue-700 border border-blue-200/60"
            onClick={() => setDrillDown({ metric: "weekly_sales" })}
          />
          <StatCard
            label={t("dashboard.monthlySales")}
            value={fmt(s.monthlySales)}
            sub="Current calendar month"
            icon={IndianRupee}
            accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
            onClick={() => setDrillDown({ metric: "monthly_sales" })}
          />
          <StatCard
            label={t("dashboard.totalBills")}
            value={s.totalBills}
            sub={`${fmt(s.pendingPayments)} pending dues`}
            icon={Receipt}
            accent="bg-purple-50 text-purple-700 border border-purple-200/60"
            onClick={() => setDrillDown({ metric: "total_bills" })}
          />
        </div>
      </section>

      {/* Metal Sales in Grams Row (Requirement 9 & 12) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            Metal Quantity Sold (Grams)
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/70 border border-border/60 self-start sm:self-auto">
            {[
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
              { key: "monthly", label: "Monthly" },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setWeightPeriod(p.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  weightPeriod === p.key
                    ? "bg-background text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label={`Gold Sold (${weightPeriod.charAt(0).toUpperCase() + weightPeriod.slice(1)})`}
            value={`${(weightPeriod === "daily" ? s.goldSold?.today : weightPeriod === "weekly" ? s.goldSold?.weekly : s.goldSold?.monthly) || 0} g`}
            sub={`Today: ${s.goldSold?.today || 0}g · Week: ${s.goldSold?.weekly || 0}g · Month: ${s.goldSold?.monthly || 0}g`}
            icon={Coins}
            accent="bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs"
            onClick={() => setDrillDown({ metric: "gold_sold", range: weightPeriod })}
          />
          <StatCard
            label={`Silver Sold (${weightPeriod.charAt(0).toUpperCase() + weightPeriod.slice(1)})`}
            value={`${(weightPeriod === "daily" ? s.silverSold?.today : weightPeriod === "weekly" ? s.silverSold?.weekly : s.silverSold?.monthly) || 0} g`}
            sub={`Today: ${s.silverSold?.today || 0}g · Week: ${s.silverSold?.weekly || 0}g · Month: ${s.silverSold?.monthly || 0}g`}
            icon={Gem}
            accent="bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs"
            onClick={() => setDrillDown({ metric: "silver_sold", range: weightPeriod })}
          />
        </div>
      </section>

      {/* Period Performance & Breakdown */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
            Sales Channels & Collections Breakdown
          </h2>

          {/* Range Period Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/70 border border-border/60 self-start sm:self-auto">
            {["weekly", "monthly", "yearly"].map((p) => (
              <button
                key={p}
                onClick={() => setRange(p)}
                disabled={rangeLoading}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize ${
                  range === p
                    ? "bg-background text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`dashboard.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 transition-opacity duration-150 ${rangeLoading ? "opacity-60" : ""}`}>
          <StatCard
            label={t("dashboard.inventorySales")}
            value={fmt(r.inventorySales)}
            sub="Barcode / Tagged items"
            icon={Package}
            accent="bg-amber-50 text-amber-700 border border-amber-200/60"
            onClick={() => setDrillDown({ metric: "inventory_sales", range })}
          />
          <StatCard
            label={t("dashboard.manualSales")}
            value={fmt(r.manualSales)}
            sub="Custom / Untagged bills"
            icon={FileText}
            accent="bg-indigo-50 text-indigo-700 border border-indigo-200/60"
            onClick={() => setDrillDown({ metric: "manual_sales", range })}
          />
          <StatCard
            label={t("dashboard.gstSales")}
            value={fmt(r.gstSales)}
            sub="Tax Invoices with GST"
            icon={Receipt}
            accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
            onClick={() => setDrillDown({ metric: "gst_sales", range })}
          />
          <StatCard
            label="Non-GST Sales"
            value={fmt(r.nonGstSales)}
            sub="Retail & Composite Bills"
            icon={Receipt}
            accent="bg-slate-100 text-slate-800 border border-slate-200"
            onClick={() => setDrillDown({ metric: "non_gst_sales", range })}
          />
          <StatCard
            label={t("dashboard.collectedPayments")}
            value={fmt(r.collectedPayments)}
            sub="Collected in this period"
            icon={CheckCircle2}
            accent="bg-teal-50 text-teal-700 border border-teal-200/60"
            onClick={() => setDrillDown({ metric: "collected_payments", range })}
          />
        </div>
      </section>

      {/* Inventory & Operations Row */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-amber-600" />
          Stock Valuation & Workshop
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("dashboard.goldStock")}
            value={`${s.goldQty} pcs`}
            sub={`${fmt(s.goldValue)} estimated`}
            icon={Coins}
            accent="bg-amber-50 text-amber-700 border border-amber-200/60"
            onClick={() => navigate("/inventory/gold")}
          />
          <StatCard
            label={t("dashboard.silverStock")}
            value={`${s.silverQty} pcs`}
            sub={`${fmt(s.silverValue)} estimated`}
            icon={Gem}
            accent="bg-slate-100 text-slate-700 border border-slate-200"
            onClick={() => navigate("/inventory/silver")}
          />
          <StatCard
            label={t("dashboard.customers")}
            value={s.totalCustomers}
            sub={`${fmt(s.pendingPayments)} pending dues`}
            icon={Users}
            accent="bg-blue-50 text-blue-700 border border-blue-200/60"
            onClick={() => navigate("/customers")}
          />
          <StatCard
            label="Pending Dues"
            value={fmt(s.pendingPayments)}
            sub="Unpaid customer dues"
            icon={IndianRupee}
            accent="bg-red-50 text-red-700 border border-red-200/60"
            onClick={() => setDrillDown({ metric: "pending_payments" })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <StatCard
            label="Purchases"
            value={`${s.totalPurchases} Orders`}
            sub="Supplier procurements"
            icon={ShoppingBag}
            accent="bg-amber-50 text-amber-800 border border-amber-200/60"
            onClick={() => navigate("/purchase/management")}
          />
          <StatCard
            label="Customer Orders"
            value={`${s.totalOrders} Active`}
            sub="Custom order book"
            icon={FileText}
            accent="bg-blue-50 text-blue-700 border border-blue-200/60"
            onClick={() => navigate("/orders")}
          />
          <StatCard
            label="Karagir Craftsmen"
            value={`${s.totalKaragirs} Craftsmen`}
            sub="Assigned workshop orders"
            icon={Users}
            accent="bg-purple-50 text-purple-700 border border-purple-200/60"
            onClick={() => navigate("/karagir")}
          />
        </div>
      </section>

      {/* Quick Action Bar */}
      <QuickActions />

      {/* Split View: Recent Activity & Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bills (2 Columns on large screen) */}
        <div className="lg:col-span-2 rounded-xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" />
              <h3 className="font-display font-bold text-foreground">{t("dashboard.recentBills")}</h3>
            </div>
            <Link
              to="/bills"
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              <span>{t("dashboard.viewAll")}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {s.recentBills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("dashboard.noBills")}</p>
          ) : (
            <div className="divide-y divide-border/60">
              {s.recentBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-3 hover:bg-muted/30 px-2 rounded-lg transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold font-mono text-foreground">{b.bill_number}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{b.customer_name}</span>
                      <span> · {new Date(b.bill_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}</span>
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-bold text-foreground font-mono">{fmt(b.total_amount)}</p>
                    {b.due_amount > 0 ? (
                      <Badge variant="warning" dot={true}>
                        {t("billHistory.due")} {fmt(b.due_amount)}
                      </Badge>
                    ) : (
                      <Badge variant="success" dot={true}>
                        {t("status.paid")}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Customers Leaderboard */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <h3 className="font-display font-bold text-foreground">{t("dashboard.topCustomers")}</h3>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">{range}</span>
          </div>

          {r.topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("dashboard.noDataPeriod")}</p>
          ) : (
            <div className="space-y-2.5">
              {r.topCustomers.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                      i === 0 ? "bg-amber-500 text-slate-950" : i === 1 ? "bg-slate-300 text-slate-900" : i === 2 ? "bg-amber-700/60 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.count} invoice(s)</p>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-foreground font-mono shrink-0 ml-2">{fmt(c.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {drillDown && (
        <DashboardDrillDownModal
          metric={drillDown.metric}
          subRange={drillDown.range}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}