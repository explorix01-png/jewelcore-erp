import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Search, Trash2, Eye, Edit as EditIcon, Plus } from "lucide-react";
import PurchaseManagementDialog from "@/components/purchase/PurchaseManagementDialog";
import PurchaseViewDialog from "@/components/purchase/PurchaseViewDialog";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function PurchaseManagement() {
  const t = useT();
  const [loading, setLoading] = useState(true);
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
    try { setPurchases(await base44.entities.Purchase.list("-purchase_date", 200)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => purchases.filter((p) => {
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

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("purchase.managementTitle")} subtitle={t("purchase.managementSubtitle")} />

      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t("purchase.purchaseManagement")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("purchase.purchaseManagementNote")}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Button onClick={() => setNewPurchaseOpen(true)}><Plus className="w-4 h-4 mr-1" /> {t("purchase.newPurchaseDoc")}</Button>
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); pag.setPage(1); }} placeholder={t("purchase.searchPlaceholder")} className="pl-9" />
            </div>
          </div>
        </div>
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState icon={ShoppingBag} title={t("purchase.noPurchases")} description={t("purchase.noPurchasesDesc")} />
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
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(p.id)} onCheckedChange={() => bulk.toggleOne(p.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{p.purchase_number}</td>
                    <td className="px-4 py-3">{p.purchase_date}</td>
                    <td className="px-4 py-3 font-medium">{p.supplier_name}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(p.total_amount)}</td>
                    <td className="px-4 py-3"><Badge variant={payStatus === "paid" ? "success" : payStatus === "partial" ? "warning" : "danger"}>{payStatus}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={p.status === "finalized" ? "success" : "default"}>{p.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewPurchase(p)} className="p-1.5 rounded hover:bg-muted text-blue-600" title={t("common.view")}><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleEdit(p)} className="p-1.5 rounded hover:bg-muted text-amber-600" title={t("common.edit")}><EditIcon className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deletePermanent(p)} className="p-1.5 rounded hover:bg-muted text-red-600" title={t("common.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
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