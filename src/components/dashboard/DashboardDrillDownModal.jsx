import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { fmt, fmtNum } from "@/lib/billCalc";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Spinner } from "@/components/ui/erp";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Search, Eye, ArrowUpRight,
  Receipt, Coins, Gem
} from "lucide-react";
import BillViewDialog from "@/components/billing/BillViewDialog";

export default function DashboardDrillDownModal({ metric, subRange, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [viewBill, setViewBill] = useState(null);

  useEffect(() => {
    if (!metric) return;
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("getDashboardDrillDown", {
          metric,
          range: subRange || "monthly",
        });
        if (res.data?.success) {
          setData(res.data);
        }
      } catch (err) {
        console.error("Failed to load drill-down data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [metric, subRange]);

  const isMetalDrillDown = metric === "gold_sold" || metric === "silver_sold";

  const filteredBills = useMemo(() => {
    if (!data?.bills) return [];
    const q = searchQ.toLowerCase().trim();
    if (!q) return data.bills;
    return data.bills.filter(b =>
      b.bill_number?.toLowerCase().includes(q) ||
      b.customer_name?.toLowerCase().includes(q) ||
      b.customer_mobile?.includes(q)
    );
  }, [data?.bills, searchQ]);

  const filteredMetalItems = useMemo(() => {
    if (!data?.metalItems) return [];
    const q = searchQ.toLowerCase().trim();
    if (!q) return data.metalItems;
    return data.metalItems.filter(it =>
      it.bill_number?.toLowerCase().includes(q) ||
      it.customer_name?.toLowerCase().includes(q) ||
      it.huid?.toLowerCase().includes(q) ||
      it.item_name?.toLowerCase().includes(q) ||
      it.purity?.toLowerCase().includes(q)
    );
  }, [data?.metalItems, searchQ]);

  if (!metric) return null;

  return (
    <Dialog open={!!metric} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <DialogTitle className="text-lg font-bold font-display text-foreground">
                  {data?.title || "Operational Performance Breakdown"}
                </DialogTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data?.dateRangeText ? `Active Period: ${data.dateRangeText}` : "Live filtered transactions"}
              </p>
            </div>
            {data?.summary && (
              <Badge variant="outline" className="self-start sm:self-auto bg-background text-xs font-mono font-semibold">
                {data.summary.billCount} invoice(s)
              </Badge>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-16">
              <Spinner label="Loading transaction details & aggregations..." />
            </div>
          ) : !data ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No breakdown data available.</p>
          ) : (
            <>
              {/* Financial KPI Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border bg-muted/30 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Total Revenue
                  </span>
                  <p className="text-base font-bold font-mono text-foreground">
                    {fmt(data.summary.totalSales)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Collected: {fmt(data.summary.totalPaid)}
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 space-y-1">
                  <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-600" />
                    Gold Sold (g)
                  </span>
                  <p className="text-base font-bold font-mono text-amber-950">
                    {fmtNum(data.summary.goldGrams)} g
                  </p>
                  <p className="text-[10px] text-amber-800/80">Net weight sold</p>
                </div>

                <div className="p-3 rounded-xl border bg-slate-100 border-slate-200 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Gem className="w-3 h-3 text-slate-600" />
                    Silver Sold (g)
                  </span>
                  <p className="text-base font-bold font-mono text-slate-900">
                    {fmtNum(data.summary.silverGrams)} g
                  </p>
                  <p className="text-[10px] text-slate-600">Net weight sold</p>
                </div>

                <div className="p-3 rounded-xl border bg-muted/30 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Outstanding Due
                  </span>
                  <p className="text-base font-bold font-mono text-red-600">
                    {fmt(data.summary.totalDue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    GST: {fmt(data.summary.totalGst)}
                  </p>
                </div>
              </div>

              {/* Settlement & Payment Mode Distribution */}
              <div className="p-3 rounded-xl border bg-card text-xs space-y-2">
                <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block">
                  Payment Channels Collected
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono">
                  <div className="p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground block text-[10px]">Cash</span>
                    <span className="font-bold text-foreground">{fmt(data.summary.cashCollected)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground block text-[10px]">UPI</span>
                    <span className="font-bold text-foreground">{fmt(data.summary.upiCollected)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground block text-[10px]">Card</span>
                    <span className="font-bold text-foreground">{fmt(data.summary.cardCollected)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground block text-[10px]">Bank / NEFT</span>
                    <span className="font-bold text-foreground">{fmt(data.summary.bankCollected)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-amber-800 block text-[10px]">Gold Settlement</span>
                    <span className="font-bold text-amber-950">{fmt(data.summary.goldExchangeValue)}</span>
                  </div>
                </div>
              </div>

              {/* Purity Breakdown if available */}
              {data.purityBreakdown && data.purityBreakdown.length > 0 && (
                <div className="p-3.5 rounded-xl border bg-card text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block">
                      Purity Breakdown ({metric === "gold_sold" ? "Gold Karats" : "Silver Grades"})
                    </span>
                    {data.summary?.totalMetalValue > 0 && (
                      <span className="text-[11px] font-mono font-semibold text-foreground">
                        Total Metal Value: {fmt(data.summary.totalMetalValue)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.purityBreakdown.map((p) => (
                      <div key={p.purity} className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                        <span className="font-bold text-amber-950 font-mono text-xs">{p.purity}</span>
                        <span className="text-muted-foreground text-[11px]">·</span>
                        <span className="font-mono font-bold text-foreground text-xs">{fmtNum(p.grams)} g</span>
                        <span className="text-[10px] text-muted-foreground">({fmt(p.value)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions List Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    {isMetalDrillDown ? <Coins className="w-4 h-4 text-amber-600" /> : <Receipt className="w-4 h-4 text-amber-600" />}
                    {isMetalDrillDown
                      ? `Metal Sales Transactions (${filteredMetalItems.length})`
                      : `Contributing Sales Invoices (${filteredBills.length})`}
                  </h4>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder={isMetalDrillDown ? "Search HUID, item, customer..." : "Search bill # or customer..."}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                {isMetalDrillDown ? (
                  filteredMetalItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center border rounded-xl">
                      No matching metal line items found in this period.
                    </p>
                  ) : (
                    <div className="border rounded-xl overflow-hidden bg-card">
                      <div className="overflow-x-auto max-h-72">
                        <table className="w-full text-xs min-w-[850px]">
                          <thead className="bg-muted/60 text-muted-foreground sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">Bill No</th>
                              <th className="px-3 py-2 text-left font-semibold">Date</th>
                              <th className="px-3 py-2 text-left font-semibold">Customer</th>
                              <th className="px-3 py-2 text-left font-semibold">HUID</th>
                              <th className="px-3 py-2 text-left font-semibold">Item</th>
                              <th className="px-3 py-2 text-right font-semibold">Gross Wt</th>
                              <th className="px-3 py-2 text-right font-semibold">Net Wt</th>
                              <th className="px-3 py-2 text-center font-semibold">Purity</th>
                              <th className="px-3 py-2 text-right font-semibold">Fine Wt</th>
                              <th className="px-3 py-2 text-right font-semibold">Rate</th>
                              <th className="px-3 py-2 text-right font-semibold">Value</th>
                              <th className="px-3 py-2 text-center font-semibold">Status</th>
                              <th className="px-3 py-2 text-center font-semibold">View</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {filteredMetalItems.map((m) => (
                              <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                                <td className="px-3 py-2 font-mono font-semibold text-foreground">{m.bill_number}</td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                  {new Date(m.bill_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                                </td>
                                <td className="px-3 py-2 font-medium">
                                  <span className="block truncate max-w-[120px]">{m.customer_name}</span>
                                </td>
                                <td className="px-3 py-2 font-mono font-semibold text-blue-700">{m.huid}</td>
                                <td className="px-3 py-2 font-medium">{m.item_name}</td>
                                <td className="px-3 py-2 font-mono text-right">{fmtNum(m.gross_weight)}g</td>
                                <td className="px-3 py-2 font-mono text-right font-semibold text-amber-950">{fmtNum(m.net_weight)}g</td>
                                <td className="px-3 py-2 text-center font-mono font-semibold">{m.purity}</td>
                                <td className="px-3 py-2 font-mono text-right text-emerald-800">{fmtNum(m.fine_weight)}g</td>
                                <td className="px-3 py-2 font-mono text-right">{fmt(m.rate_per_gram)}</td>
                                <td className="px-3 py-2 font-mono font-bold text-right text-foreground">{fmt(m.metal_value)}</td>
                                <td className="px-3 py-2 text-center">
                                  <Badge variant="success" className="text-[10px] py-0">{m.status}</Badge>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => {
                                      const found = data.bills?.find(b => b.id === m.bill_id);
                                      if (found) setViewBill(found);
                                    }}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="View invoice"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : filteredBills.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center border rounded-xl">
                    No matching invoices found in this period.
                  </p>
                ) : (
                  <div className="border rounded-xl overflow-hidden bg-card">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs min-w-[650px]">
                        <thead className="bg-muted/60 text-muted-foreground sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Bill No</th>
                            <th className="px-3 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Customer</th>
                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                            <th className="px-3 py-2 text-right font-semibold">Paid</th>
                            <th className="px-3 py-2 text-right font-semibold">Due</th>
                            <th className="px-3 py-2 text-center font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {filteredBills.map((b) => (
                            <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                              <td className="px-3 py-2 font-mono font-semibold text-foreground">
                                {b.bill_number}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {new Date(b.bill_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                <span className="block truncate max-w-[150px]">{b.customer_name}</span>
                                {b.customer_mobile && (
                                  <span className="text-[10px] text-muted-foreground font-mono">{b.customer_mobile}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <Badge variant={b.bill_source === "manual" ? "info" : "default"} className="text-[10px] py-0">
                                  {b.bill_source === "manual" ? "Manual" : "Inventory"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-right text-foreground">
                                {fmt(b.total_amount)}
                              </td>
                              <td className="px-3 py-2 font-mono text-right text-emerald-700">
                                {fmt(b.paid_amount)}
                              </td>
                              <td className="px-3 py-2 font-mono text-right">
                                {b.due_amount > 0 ? (
                                  <span className="text-red-600 font-semibold">{fmt(b.due_amount)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => setViewBill(b)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title="View invoice"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose();
              navigate("/bills");
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          >
            <span>Open in Sales Invoices</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Nested View Bill Dialog if user clicks eye */}
      {viewBill && (
        <BillViewDialog bill={viewBill} onClose={() => setViewBill(null)} />
      )}
    </Dialog>
  );
}
