import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { Spinner, EmptyState, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BillViewDialog from "@/components/billing/BillViewDialog";
import CollectDueDialog from "@/components/billing/CollectDueDialog";
import { ArrowLeft, Receipt, IndianRupee, ClipboardList, Search, Eye, RefreshCw, ArrowLeftRight, Phone, MapPin, FileText } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useDebounced } from "@/hooks/useDebounced";

export default function CustomerDetail() {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [bills, setBills] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [viewBill, setViewBill] = useState(null);
  const [collectBill, setCollectBill] = useState(null);
  // Filters
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [cust, bls, pmts, ords, rts, exch, out] = await Promise.all([
        base44.entities.Customer.get(id),
        base44.entities.Bill.filter({ customer_id: id }, "-bill_date", 500),
        base44.entities.Payment.filter({ customer_id: id }, "-payment_date", 500),
        base44.entities.CustomerOrder.filter({ customer_id: id }, "-order_date", 200),
        base44.entities.ReturnTransaction.filter({ customer_id: id }, "-created_date", 200),
        base44.entities.ExchangeTransaction.filter({ customer_id: id }, "-created_date", 200),
        base44.entities.CustomerOutstanding.filter({ customer_id: id }, "-created_date", 200),
      ]);
      setCustomer(cust);
      const activeBills = bls.filter((b) => !b.is_deleted);
      setBills(activeBills);
      setPayments(pmts);
      setOrders(ords);
      setReturns(rts);
      setExchanges(exch);
      setOutstanding(out);
      // Single batched query for all bill items — eliminates N+1 requests.
      const billIds = activeBills.map((b) => b.id);
      const allItems = billIds.length
        ? await base44.entities.BillItem.filter({ bill_id: { $in: billIds } }, "-created_date", 5000)
        : [];
      setBillItems(allItems);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  // Summary calculations from real transaction records
  const summary = useMemo(() => {
    const totalAmount = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalPaid = bills.reduce((s, b) => s + Number(b.paid_amount || 0), 0);
    const totalDue = bills.reduce((s, b) => s + Number(b.due_amount || 0), 0);
    const lastDate = bills.length > 0 ? new Date(bills[0].bill_date) : null;
    return { totalAmount, totalPaid, totalDue, numBills: bills.length, lastDate };
  }, [bills]);

  // Build a flat transaction history: one row per bill-item, enriched with bill-level data
  const transactions = useMemo(() => {
    const billMap = {};
    bills.forEach((b) => { billMap[b.id] = b; });
    return billItems.map((it) => {
      const b = billMap[it.bill_id];
      if (!b) return null;
      return {
        bill_id: b.id,
        bill_number: b.bill_number,
        bill_date: b.bill_date,
        bill_source: b.bill_source,
        status: b.status,
        item_name: it.item_name,
        item_code: it.item_code || "—",
        category: it.category_name || "—",
        metal: it.metal_type || "—",
        purity: it.purity_display || "—",
        quantity: it.quantity,
        gross_weight: it.gross_weight,
        net_weight: it.net_weight,
        making_charge: it.making_charge,
        hallmarking_charge: it.hallmarking_charge,
        discount: it.discount,
        gst_rate: it.gst_rate,
        item_total: it.total,
        bill_total: b.total_amount,
        paid_amount: b.paid_amount,
        due_amount: b.due_amount,
        payment_status: Number(b.due_amount) > 0 ? (Number(b.paid_amount) > 0 ? "partial" : "unpaid") : "paid",
      };
    }).filter(Boolean);
  }, [bills, billItems]);

  // Apply filters
  const filteredTx = useMemo(() => {
    return transactions.filter((tx) => {
      // Search filter
      if (debouncedQ) {
        const s = debouncedQ.toLowerCase();
        const match = tx.bill_number?.toLowerCase().includes(s) || tx.item_name?.toLowerCase().includes(s) || tx.item_code?.toLowerCase().includes(s);
        if (!match) return false;
      }
      // Date filter
      const d = new Date(tx.bill_date);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const dt = new Date(dateTo); dt.setHours(23, 59, 59); if (d > dt) return false; }
      // Source filter
      if (sourceFilter !== "all" && tx.bill_source !== sourceFilter) return false;
      // Status filter
      if (statusFilter !== "all" && tx.payment_status !== statusFilter) return false;
      return true;
    });
  }, [transactions, debouncedQ, dateFrom, dateTo, sourceFilter, statusFilter]);

  const pag = usePagination(filteredTx);

  if (loading) return <div className="p-6"><Spinner /></div>;
  if (!customer) return <div className="p-6"><EmptyState title={t("customerDetail.notFound")} /></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumbs & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/customers")}
            className="h-9 w-9 rounded-xl border-border/80 hover:bg-muted"
            title="Back to Customers Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Customer Profile</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-xs font-mono text-muted-foreground">{customer.customer_code || "ID-" + customer.id}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {customer.name}
            </h1>
          </div>
        </div>

        {/* Contextual Actions Cluster */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {can("billing", "create") && (
            <Button
              onClick={() => navigate("/billing")}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
            >
              <Receipt className="w-4 h-4 mr-1.5" />
              {t("customerDetail.createBill")}
            </Button>
          )}
          {Number(summary.totalDue) > 0 && can("bills", "update") && (
            <Button
              variant="outline"
              onClick={() => {
                const dueBill = bills.find((b) => Number(b.due_amount) > 0 && b.status === "finalized");
                if (dueBill) setCollectBill(dueBill);
              }}
              className="border-amber-500/40 text-amber-800 bg-amber-50/50 hover:bg-amber-100 font-semibold"
            >
              <IndianRupee className="w-4 h-4 mr-1.5 text-amber-600" />
              {t("customerDetail.collectDue")}
            </Button>
          )}
          {can("orders", "create") && (
            <Button
              variant="outline"
              onClick={() => navigate("/orders")}
              className="border-border hover:bg-muted"
            >
              <ClipboardList className="w-4 h-4 mr-1.5" />
              {t("customerDetail.createOrder")}
            </Button>
          )}
        </div>
      </div>

      {/* Customer Information & Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile Card */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold text-base flex items-center justify-center shadow-xs">
              {customer.name ? customer.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "C"}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-foreground truncate">{customer.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{customer.customer_code || "No customer code"}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60 space-y-2.5 text-xs">
            {customer.mobile && (
              <div className="flex items-center gap-2 text-foreground">
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-medium">{customer.mobile}</span>
              </div>
            )}
            {customer.gst_number && (
              <div className="flex items-center gap-2 text-foreground">
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono text-muted-foreground">GST: {customer.gst_number}</span>
              </div>
            )}
            {(customer.address || customer.city) && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  {customer.address && <p>{customer.address}</p>}
                  {customer.city && <p>{customer.city}, {customer.state} {customer.pincode}</p>}
                </div>
              </div>
            )}
            {customer.notes && (
              <p className="p-2.5 rounded-lg bg-muted/50 border border-border/40 text-muted-foreground italic">
                "{customer.notes}"
              </p>
            )}
          </div>
        </div>

        {/* Financial Stat Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label={t("customerDetail.totalPurchases")}
            value={fmt(summary.totalAmount)}
            sub={`${summary.numBills} completed invoice(s)`}
            icon={Receipt}
            accent="bg-amber-50 text-amber-700 border border-amber-200/60"
          />
          <StatCard
            label={t("customerDetail.totalPaid")}
            value={fmt(summary.totalPaid)}
            sub="Settled payments"
            icon={IndianRupee}
            accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
          />
          <StatCard
            label={t("customerDetail.totalOutstanding")}
            value={fmt(summary.totalDue)}
            sub={Number(summary.totalDue) > 0 ? "Pending collection" : "All balances clear"}
            icon={IndianRupee}
            accent={Number(summary.totalDue) > 0 ? "bg-red-50 text-red-700 border border-red-200/60" : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"}
          />
        </div>
      </div>

      {summary.lastDate && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>{t("customerDetail.lastPurchaseDate")}: {summary.lastDate.toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      )}

      {/* History Tabs */}
      <Tabs defaultValue="purchases" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="purchases">{t("customerDetail.purchaseHistory")} ({bills.length})</TabsTrigger>
          <TabsTrigger value="payments">{t("customerDetail.paymentHistory")} ({payments.length})</TabsTrigger>
          <TabsTrigger value="orders">{t("customerDetail.orderHistory")} ({orders.length})</TabsTrigger>
          <TabsTrigger value="returns">{t("customerDetail.returnExchangeHistory")} ({returns.length + exchanges.length})</TabsTrigger>
        </TabsList>

        {/* Purchase History Tab */}
        <TabsContent value="purchases">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("customerDetail.searchPlaceholder")} className="pl-9" />
            </div>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); pag.setPage(1); }} className="w-40" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); pag.setPage(1); }} className="w-40" />
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); pag.setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allSources")}</SelectItem>
                <SelectItem value="inventory">{t("customerDetail.inventory")}</SelectItem>
                <SelectItem value="manual">{t("customerDetail.manual")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pag.setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
                <SelectItem value="paid">{t("customerDetail.paid")}</SelectItem>
                <SelectItem value="partial">{t("customerDetail.partial")}</SelectItem>
                <SelectItem value="unpaid">{t("customerDetail.unpaid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredTx.length === 0 ? (
            <EmptyState icon={Receipt} title={t("customerDetail.noBills")} description={t("customerDetail.noBillsDesc")} />
          ) : (
            <>
            <TableShell headers={[
              t("customerDetail.billNumber"), t("customerDetail.billDate"), t("customerDetail.billSource"),
              t("customerDetail.itemName"), t("customerDetail.category"), t("customerDetail.metal"),
              t("customerDetail.purity"), t("common.quantity"), t("customerDetail.netWt"),
              t("customerDetail.makingCharge"), t("customerDetail.billTotal"), t("customerDetail.paidAmount"),
              t("customerDetail.dueAmount"), t("customerDetail.paymentStatus"), t("common.actions")
            ]}>
              {pag.pageItems.map((tx, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono text-xs">{tx.bill_number}</td>
                  <td className="px-3 py-2 text-xs">{new Date(tx.bill_date).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2"><Badge variant={tx.bill_source === "manual" ? "info" : tx.bill_source === "customer_purchase" ? "warning" : "default"}>{tx.bill_source === "manual" ? t("customerDetail.manual") : tx.bill_source === "customer_purchase" ? t("billHistory.sourceCustomerPurchase") : t("customerDetail.inventory")}</Badge></td>
                  <td className="px-3 py-2 font-medium text-sm">{tx.item_name}</td>
                  <td className="px-3 py-2 text-xs">{tx.category}</td>
                  <td className="px-3 py-2 text-xs capitalize">{tx.metal}</td>
                  <td className="px-3 py-2 text-xs">{tx.purity}</td>
                  <td className="px-3 py-2">{tx.quantity}</td>
                  <td className="px-3 py-2">{Number(tx.net_weight).toFixed(2)}g</td>
                  <td className="px-3 py-2 text-xs">{tx.making_charge}{tx.making_charge_type === "percentage" ? "%" : ""}</td>
                  <td className="px-3 py-2 font-semibold">{fmt(tx.bill_total)}</td>
                  <td className="px-3 py-2">{fmt(tx.paid_amount)}</td>
                  <td className="px-3 py-2">{Number(tx.due_amount) > 0 ? <Badge variant="warning">{fmt(tx.due_amount)}</Badge> : <Badge variant="success">{t("billHistory.clear")}</Badge>}</td>
                  <td className="px-3 py-2"><Badge variant={tx.payment_status === "paid" ? "success" : tx.payment_status === "partial" ? "warning" : "danger"}>{t("customerDetail." + tx.payment_status)}</Badge></td>
                  <td className="px-3 py-2">
                    <button onClick={() => setViewBill(bills.find((b) => b.id === tx.bill_id))} className="p-1.5 rounded hover:bg-muted" title={t("customerDetail.viewBill")}><Eye className="w-3.5 h-3.5" /></button>
                    {Number(tx.due_amount) > 0 && tx.status === "finalized" && can("bills", "update") && (
                      <button onClick={() => setCollectBill(bills.find((b) => b.id === tx.bill_id))} className="p-1.5 rounded hover:bg-muted text-emerald-700" title={t("billHistory.collectDue")}><IndianRupee className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </TableShell>
            <Pagination {...pag} />
            </>
          )}
        </TabsContent>

        {/* Payment History Tab */}
        <TabsContent value="payments">
          {payments.length === 0 ? (
            <EmptyState icon={IndianRupee} title={t("customerDetail.noPayments")} />
          ) : (
            <TableShell headers={[t("customerDetail.billNumber"), t("common.date"), t("common.amount"), t("customerDetail.paymentMode"), t("customerDetail.reference")]}>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{p.bill_number || "—"}</td>
                  <td className="px-4 py-3 text-xs">{new Date(p.payment_date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 font-semibold">{fmt(p.amount)}</td>
                  <td className="px-4 py-2"><Badge variant="info">{t("paymentMode." + p.payment_mode)}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.reference || "—"}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders">
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("customerDetail.noOrders")} />
          ) : (
            <TableShell headers={[t("customerDetail.orderNumber"), t("common.date"), t("customerDetail.requiredItem"), "Karagir", t("customerDetail.expected"), t("common.status")]}>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                  <td className="px-4 py-3 text-xs">{new Date(o.order_date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 font-medium">{o.required_item}</td>
                  <td className="px-4 py-3 text-sm">{o.karagir_name || "—"}</td>
                  <td className="px-4 py-3 text-xs">{o.expected_completion_date || "—"}</td>
                  <td className="px-4 py-3"><Badge variant={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" ? "danger" : o.status === "READY" ? "info" : "warning"}>{t("status." + o.status)}</Badge></td>
                </tr>
              ))}
            </TableShell>
          )}
        </TabsContent>

        {/* Returns & Exchanges Tab */}
        <TabsContent value="returns">
          {returns.length === 0 && exchanges.length === 0 ? (
            <EmptyState icon={RefreshCw} title={t("customerDetail.noReturnsExchanges")} />
          ) : (
            <div className="space-y-6">
              {returns.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> {t("customerDetail.returns")}</h3>
                  <TableShell headers={[t("customerDetail.billNumber"), t("common.date"), t("customerDetail.itemDetails"), t("customerDetail.returnValue")]}>
                    {returns.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs">{r.original_bill_number || "—"}</td>
                        <td className="px-4 py-3 text-xs">{new Date(r.return_date || r.created_date).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-3 text-sm">{r.item_name || "—"}</td>
                        <td className="px-4 py-3 font-semibold">{fmt(r.value)}</td>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              )}
              {exchanges.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2 flex items-center gap-1.5"><ArrowLeftRight className="w-4 h-4" /> {t("customerDetail.exchanges")}</h3>
                  <TableShell headers={[t("customerDetail.billNumber"), t("common.date"), t("customerDetail.oldItem"), t("customerDetail.newItem"), t("customerDetail.difference")]}>
                    {exchanges.map((e) => (
                      <tr key={e.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs">{e.original_bill_number || "—"}</td>
                        <td className="px-4 py-3 text-xs">{new Date(e.exchange_date).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-3 text-sm">{e.old_item_details || "—"}</td>
                        <td className="px-4 py-3 text-sm">{e.new_item_details || "—"}</td>
                        <td className="px-4 py-3 font-semibold">{fmt(e.difference_amount)}</td>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {viewBill && <BillViewDialog bill={viewBill} onClose={() => setViewBill(null)} />}
      {collectBill && <CollectDueDialog bill={collectBill} onClose={() => setCollectBill(null)} onDone={load} />}
    </div>
  );
}