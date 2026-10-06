import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, Badge, TableShell, StatCard, EmptyState } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Search, Trash2, Eye, Edit as EditIcon, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import PurchaseManagementDialog from "@/components/purchase/PurchaseManagementDialog";
import PurchaseViewDialog from "@/components/purchase/PurchaseViewDialog";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function PurchaseManagement() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [viewPurchase, setViewPurchase] = useState(null);
  const [editData, setEditData] = useState(null);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await base44.entities.Purchase.list("-purchase_date", 200);
      setPurchases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load purchases:", err);
      setError(err?.message || "Failed to load purchase records from server.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (purchases || []).filter((p) => {
    if (!p) return false;
    const x = debouncedQ.toLowerCase();
    return !x || p.purchase_number?.toLowerCase().includes(x) || p.supplier_name?.toLowerCase().includes(x);
  }), [purchases, debouncedQ]);

  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected purchase(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("finalizePurchase", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data);
      bulk.clear();
      load();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const deletePermanent = async (p) => {
    if (!confirm(`Permanently delete purchase "${p.purchase_number}"?\n\nThis cannot be undone.`)) return;
    try {
      const res = await base44.functions.invoke("finalizePurchase", { action: "delete", purchase_id: p.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Purchase deleted permanently.");
      load();
    } catch (e) { alert(e.message); }
  };

  const handleEdit = async (p) => {
    try {
      const res = await base44.functions.invoke("finalizePurchase", { action: "get", purchase_id: p.id });
      if (!res.data?.success) { alert(res.data?.error || "Failed to load purchase"); return; }
      setEditData({ purchase: res.data.purchase, items: res.data.items });
      setViewPurchase(null);
    } catch (e) { alert(e.message); }
  };

  const stats = useMemo(() => {
    const total = purchases.length;
    const totalSpend = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const settled = purchases.filter((p) => Number(p.paid_amount || 0) >= Number(p.total_amount || 0)).length;
    return { total, totalSpend, settled };
  }, [purchases]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
            <span>Procurement Records</span>
          </span>
        }
        title={t("purchase.managementTitle")}
        subtitle="Manage bulk jewellery purchases, vendor tax invoices, gold/silver bullion inward records, and settlements."
        actions={
          <Button
            onClick={() => setNewPurchaseOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t("purchase.newPurchaseDoc")}
          </Button>
        }
      />

      {/* Procurement KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Inward Purchases"
          value={stats.total}
          sub={`${stats.settled} settled with vendors`}
          icon={ShoppingBag}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label="Procurement Value"
          value={fmt(stats.totalSpend)}
          sub="Total bullion & stock inward value"
          icon={ShoppingBag}
          accent="bg-amber-50 text-amber-700 border border-amber-200/60"
        />
        <StatCard
          label="Settled Invoices"
          value={stats.settled}
          sub="100% paid to suppliers"
          icon={ShoppingBag}
          accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
        />
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
          <div>
            <h2 className="font-display text-base font-bold text-foreground">{t("purchase.purchaseManagement")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("purchase.purchaseManagementNote")}</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); pag.setPage(1); }}
              placeholder={t("purchase.searchPlaceholder")}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center my-4">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-3" />
            <h3 className="font-display font-bold text-base text-slate-900">Failed to load purchases</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">{error}</p>
            <Button onClick={load} variant="outline" className="mt-4 bg-white border-slate-200 text-slate-700 hover:bg-slate-50">
              <RefreshCw className="w-4 h-4 mr-1.5" /> Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="py-12 flex items-center justify-center"><Spinner label="Loading purchase archives..." /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={t("purchase.noPurchases")}
            description={purchases.length === 0 ? t("purchase.noPurchasesDesc") : "No purchase records matched your search query."}
            action={purchases.length === 0 ? (
              <Button onClick={() => setNewPurchaseOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs">
                <Plus className="w-4 h-4 mr-1.5" /> {t("purchase.newPurchaseDoc")}
              </Button>
            ) : null}
          />
        ) : (
          <>
            <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
            <TableShell headers={[
              <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
              "Purchase No.", "Date", "Supplier", "Amount", "Payment", "Status", "Actions"
            ]}>
              {pag.pageItems.map((p) => {
                const paid = Number(p.paid_amount) || 0;
                const total = Number(p.total_amount) || 0;
                const payStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "due";
                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5"><Checkbox checked={bulk.isSelected(p.id)} onCheckedChange={() => bulk.toggleOne(p.id)} /></td>
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-foreground">
                      <span className="px-2 py-0.5 rounded bg-muted border border-border">
                        {p.purchase_number}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{p.purchase_date}</td>
                    <td className="px-4 py-3.5 font-medium text-sm text-foreground">{p.supplier_name}</td>
                    <td className="px-4 py-3.5 font-bold font-mono text-sm text-foreground whitespace-nowrap">{fmt(p.total_amount)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap"><Badge variant={payStatus === "paid" ? "success" : payStatus === "partial" ? "warning" : "danger"} dot={true}>{payStatus}</Badge></td>
                    <td className="px-4 py-3.5 whitespace-nowrap"><Badge variant={p.status === "finalized" ? "success" : "default"}>{p.status}</Badge></td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex gap-1.5 items-center">
                        <button onClick={() => setViewPurchase(p)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={t("common.view")}><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(p)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-700 transition-colors" title={t("common.edit")}><EditIcon className="w-4 h-4" /></button>
                        <button onClick={() => deletePermanent(p)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </TableShell>
            <Pagination {...pag} />
          </>
        )}
      </div>

      {bulkResult && <BulkDeleteResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />}
      <PurchaseManagementDialog
        open={newPurchaseOpen}
        onClose={() => setNewPurchaseOpen(false)}
        onDone={() => { load(); setNewPurchaseOpen(false); }}
      />
      {editData && (
        <PurchaseManagementDialog
          open={!!editData}
          onClose={() => setEditData(null)}
          onDone={() => { load(); setEditData(null); }}
          editPurchase={editData.purchase}
          editItems={editData.items}
        />
      )}
      {viewPurchase && (
        <PurchaseViewDialog
          purchase={viewPurchase}
          onClose={() => setViewPurchase(null)}
          onEdit={() => handleEdit(viewPurchase)}
        />
      )}
    </div>
  );
}