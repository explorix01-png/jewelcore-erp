import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { PageHeader, Spinner, EmptyState, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmtNum, fmtWt3 } from "@/lib/billCalc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, History, Barcode as BarcodeIcon, Trash2, Receipt, Scan, Info, Printer, PackagePlus, Plus, Pencil } from "lucide-react";
import Code128Barcode from "@/components/Code128Barcode";
import PrintBarcodeDialog from "@/components/inventory/PrintBarcodeDialog";
import ItemDetailsDialog from "@/components/inventory/ItemDetailsDialog";
import InventoryBarcodeScanner from "@/components/inventory/InventoryBarcodeScanner";
import NewItemDialog from "@/components/inventory/NewItemDialog";
import EditItemDialog from "@/components/inventory/EditItemDialog";
import SearchableSelect from "@/components/ui/searchable-select";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";
import { useUsbScanner } from "@/hooks/useUsbScanner";

export default function Inventory() {
  const t = useT();
  const { can } = usePermission();
  const { metal = "gold" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [catFilter, setCatFilter] = useState("all");
  const [purFilter, setPurFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyItem, setHistoryItem] = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [stockInItem, setStockInItem] = useState(null);
  const [detailsItem, setDetailsItem] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const backfilled = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await base44.entities.InventoryItem.filter({ metal_type: metal, is_archived: false }, "-updated_date", 500));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      base44.entities.ShopSettings.list("-created_date", 1).then((s) => setSettings(s[0] || null)).catch(() => {});
      if (!backfilled.current) {
        backfilled.current = true;
        try { await base44.functions.invoke("manageInventory", { action: "backfill" }); } catch (e) { /* permission or transient — ignore */ }
      }
      await load();
    })();
  }, [metal]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(items.map((i) => i.category_name).filter(Boolean)))], [items]);
  const purities = useMemo(() => ["all", ...Array.from(new Set(items.map((i) => i.purity_display).filter(Boolean)))], [items]);

  // Real-time stock summary statistics from active inventory
  const inventoryStats = useMemo(() => {
    let pieces = 0, gross = 0, net = 0, lowStock = 0;
    for (const it of items) {
      pieces += Number(it.quantity || 0);
      gross += Number(it.gross_weight || 0);
      net += Number(it.net_weight || 0);
      if (it.status === "low_stock" || it.status === "out_of_stock") {
        lowStock++;
      }
    }
    return {
      count: items.length,
      pieces,
      gross: gross.toFixed(3),
      net: net.toFixed(3),
      lowStock,
    };
  }, [items]);

  const filtered = useMemo(() => items.filter((i) => {
    const x = debouncedQ.toLowerCase();
    const matchQ = !x || i.item_name?.toLowerCase().includes(x) || i.item_code?.toLowerCase().includes(x) || i.hsn?.toLowerCase().includes(x) || i.barcode?.toLowerCase().includes(x) || i.huid?.toLowerCase().includes(x) || i.category_name?.toLowerCase().includes(x) || i.purity_display?.toLowerCase().includes(x);
    const matchCat = catFilter === "all" || i.category_name === catFilter;
    const matchPur = purFilter === "all" || i.purity_display === purFilter;
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchQ && matchCat && matchPur && matchStatus && !i.is_archived;
  }), [items, debouncedQ, catFilter, purFilter, statusFilter]);

  const pag = usePagination(filtered);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected inventory item(s)? This will permanently remove the items and their stock movement history. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageInventory", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data);
      bulk.clear();
      load();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  const handleBarcodeLookup = async (code) => {
    const cleanCode = (code || "").trim();
    if (!cleanCode) return;

    // 1. Check in currently loaded items
    let item = items.find((i) => i.barcode === cleanCode || i.item_code === cleanCode || i.huid === cleanCode);
    if (item) {
      setDetailsItem(item);
      return;
    }

    // 2. Query backend database if not in active state (e.g. silver item scanned while on gold view, or beyond 500 items)
    try {
      let results = await base44.entities.InventoryItem.filter({ barcode: cleanCode, is_archived: false }, "-updated_date", 1);
      if (!results || results.length === 0) {
        results = await base44.entities.InventoryItem.filter({ item_code: cleanCode, is_archived: false }, "-updated_date", 1);
      }
      if (!results || results.length === 0) {
        results = await base44.entities.InventoryItem.filter({ huid: cleanCode, is_archived: false }, "-updated_date", 1);
      }

      if (results && results.length > 0) {
        const found = results[0];
        if (found.metal_type && found.metal_type !== metal) {
          navigate(`/inventory/${found.metal_type}`);
        }
        setDetailsItem(found);
        return;
      }
    } catch (err) {
      console.error("Barcode lookup error:", err);
    }

    alert(`Barcode "${cleanCode}" was not found in inventory.`);
  };

  const onFound = (code) => {
    setScanOpen(false);
    handleBarcodeLookup(code);
  };

  useUsbScanner((code) => {
    handleBarcodeLookup(code);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
              <Package className="w-3.5 h-3.5 text-amber-600" />
              <span>Stock Vault</span>
            </span>
            {/* Metal Quick Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted border border-border">
              <button
                onClick={() => navigate("/inventory/gold")}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                  metal === "gold" ? "bg-amber-500 text-slate-950 shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Gold Stock
              </button>
              <button
                onClick={() => navigate("/inventory/silver")}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                  metal === "silver" ? "bg-slate-700 text-white shadow-2xs font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Silver Stock
              </button>
            </div>
          </div>
        }
        title={metal === "gold" ? "Gold Inventory & Stock" : "Silver Inventory & Stock"}
        subtitle="Catalog jewellery designs, track barcodes & HUID hallmarking, manage weights and stock levels."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {can("inventory", "create") && (
              <Button
                onClick={() => setNewItemOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {t("inv.newItemStock")}
              </Button>
            )}
            {can("inventory", "adjust") && (
              <Button variant="outline" onClick={() => setAddStockOpen(true)} className="border-border hover:bg-muted">
                <PackagePlus className="w-4 h-4 mr-1.5 text-emerald-600" />
                {t("inv.addStock")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setScanOpen(true)} className="border-border hover:bg-muted">
              <Scan className="w-4 h-4 mr-1.5 text-blue-600" />
              {t("inventory.scanBarcode")}
            </Button>
          </div>
        }
      />

      {/* Stock Valuation KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Cataloged Designs"
          value={inventoryStats.count}
          sub={`${inventoryStats.pieces} total piece(s) in vault`}
          icon={Package}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label="Total Gross Weight"
          value={`${inventoryStats.gross} g`}
          sub="Combined item gross wt"
          icon={Package}
          accent="bg-amber-50 text-amber-700 border border-amber-200/60"
        />
        <StatCard
          label="Total Net Weight"
          value={`${inventoryStats.net} g`}
          sub="Metal net weight excluding stones"
          icon={Package}
          accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
        />
        <StatCard
          label="Low / Out of Stock"
          value={inventoryStats.lowStock}
          sub={inventoryStats.lowStock > 0 ? "Requires replenishing" : "All stock healthy"}
          icon={Package}
          accent={inventoryStats.lowStock > 0 ? "bg-red-50 text-red-700 border border-red-200/60" : "bg-teal-50 text-teal-700 border border-teal-200/60"}
        />
      </div>

      {/* Search and Filters Card */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); pag.setPage(1); }}
              placeholder="Search by item name, barcode, HUID, or code..."
              className="pl-9 bg-background"
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <SearchableSelect
              options={[{ value: "all", label: t("inventory.allCategories") }, ...categories.slice(1).map((c) => ({ value: c, label: c }))]}
              value={catFilter}
              onChange={(v) => { setCatFilter(v); pag.setPage(1); }}
              placeholder={t("inventory.allCategories")}
              emptyText={t("inv.noMatches")}
            />
          </div>
          <div className="w-full sm:w-[160px]">
            <SearchableSelect
              options={[{ value: "all", label: t("inventory.allPurities") }, ...purities.slice(1).map((p) => ({ value: p, label: p }))]}
              value={purFilter}
              onChange={(v) => { setPurFilter(v); pag.setPage(1); }}
              placeholder={t("inventory.allPurities")}
              emptyText={t("inv.noMatches")}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pag.setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="in_stock">{t("status.in_stock")}</SelectItem>
              <SelectItem value="low_stock">{t("status.low_stock")}</SelectItem>
              <SelectItem value="out_of_stock">{t("status.out_of_stock")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Package} title={t("inventory.noInventory")} description={t("inventory.noInventoryDesc")} />
      ) : (
        <>
        <BulkActionBar selectedCount={bulk.selectedCount} onDelete={handleBulkDelete} onClear={bulk.clear} deleting={deleting} />
        <TableShell headers={[
          <Checkbox checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false} onCheckedChange={bulk.toggleAll} />,
          t("billing.item"), t("inventory.jewelleryId"), t("inventory.barcode"), t("billing.category"), t("billing.purity"), t("billing.hsn"), t("common.quantity"), t("billing.grossWt"), t("billing.netWt"), t("billing.fineWt"), t("common.status"), t("common.actions")
        ]}>
          {pag.pageItems.map((i) => (
            <tr key={i.id} className="hover:bg-muted/40">
              <td className="px-4 py-3"><Checkbox checked={bulk.isSelected(i.id)} onCheckedChange={() => bulk.toggleOne(i.id)} /></td>
              <td className="px-4 py-3 font-medium"><button className="text-left hover:underline text-blue-700" onClick={() => setDetailsItem(i)}>{i.item_name}</button></td>
              <td className="px-4 py-3">
                {i.huid ? (
                  <>
                    <p className="font-mono text-xs font-semibold text-blue-700">{i.huid}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{i.item_code || ""}</p>
                  </>
                ) : (
                  <p className="font-mono text-xs">{i.item_code || "—"}</p>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{i.barcode || i.item_code || "—"}</td>
              <td className="px-4 py-3">{i.category_name || "—"}</td>
              <td className="px-4 py-3">{i.purity_display || "—"}</td>
              <td className="px-4 py-3 text-xs">{i.hsn || "—"}</td>
              <td className="px-4 py-3 font-semibold">{i.quantity}</td>
              <td className="px-4 py-3">{fmtNum(i.gross_weight)}g</td>
              <td className="px-4 py-3">{fmtNum(i.net_weight)}g</td>
              <td className="px-4 py-3">{fmtWt3(i.fine_weight)}</td>
              <td className="px-4 py-3"><Badge variant={i.status === "out_of_stock" ? "danger" : i.status === "low_stock" ? "warning" : "success"}>{t("status." + (i.status || "in_stock"))}</Badge></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => setDetailsItem(i)} className="p-1.5 rounded hover:bg-muted text-blue-600" title={t("inventory.itemDetails")}><Info className="w-3.5 h-3.5" /></button>
                  {can("inventory", "update") && <button onClick={() => setEditItem(i)} className="p-1.5 rounded hover:bg-muted" title={t("inv.editItem")}><Pencil className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => navigate("/billing")} className="p-1.5 rounded hover:bg-muted text-amber-600" title={t("common.createBill")}><Receipt className="w-3.5 h-3.5" /></button>
                  {can("inventory", "update") && <button onClick={() => setBarcodeItem(i)} className="p-1.5 rounded hover:bg-muted" title={t("inventory.viewBarcode")}><BarcodeIcon className="w-3.5 h-3.5" /></button>}
                  {can("inventory", "adjust") && <button onClick={() => setStockInItem(i)} className="p-1.5 rounded hover:bg-muted text-emerald-600" title={t("inventory.stockIn")}><PackagePlus className="w-3.5 h-3.5" /></button>}
                  {can("inventory", "delete") && <button onClick={() => setDeleteItem(i)} className="p-1.5 rounded hover:bg-muted text-red-500" title={t("inventory.deletePermanent")}><Trash2 className="w-3.5 h-3.5" /></button>}
                  <button onClick={() => setHistoryItem(i)} className="p-1.5 rounded hover:bg-muted" title={t("inventory.stockHistory")}><History className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
        <Pagination {...pag} />
        </>
      )}
      {bulkResult && <BulkDeleteResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />}
      <HistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />
      <BarcodeDialog item={barcodeItem} onClose={() => setBarcodeItem(null)} onDone={load} settings={settings} />
      <DeleteConfirmDialog item={deleteItem} onClose={() => setDeleteItem(null)} onDone={load} />
      <StockInDialog item={stockInItem} onClose={() => setStockInItem(null)} onDone={load} />
      <NewItemDialog open={newItemOpen} onClose={() => setNewItemOpen(false)} onDone={load} metal={metal} />
      <EditItemDialog item={editItem} onClose={() => setEditItem(null)} onDone={load} />
      <AddStockPickerDialog open={addStockOpen} onClose={() => setAddStockOpen(false)} items={items} onSelect={(it) => { setAddStockOpen(false); setStockInItem(it); }} />
      <ItemDetailsDialog
        item={detailsItem}
        onClose={() => setDetailsItem(null)}
        onEdit={(it) => { setDetailsItem(null); setEditItem(it); }}
        onBarcode={(it) => { setDetailsItem(null); setBarcodeItem(it); }}
        onBill={() => navigate("/billing")}
      />
      <InventoryBarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onFound={onFound} />
    </div>
  );
}

function HistoryDialog({ item, onClose }) {
  const t = useT();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!item) return;
    setLoading(true);
    base44.entities.InventoryTransaction.filter({ item_id: item.item_id }, "-date", 100)
      .then(setTxns).finally(() => setLoading(false));
  }, [item]);
  if (!item) return null;
  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("inventory.stockHistory")} — {item.item_name}</DialogTitle></DialogHeader>
        {loading ? <Spinner /> : txns.length === 0 ? (
          <EmptyState title={t("inventory.noTransactions")} />
        ) : (
          <TableShell headers={[t("inventory.transactionType"), t("common.quantity"), t("billing.netWt"), t("inventory.prevStock"), t("inventory.newStock"), t("common.notes"), t("common.date")]}>
            {txns.map((tx) => (
              <tr key={tx.id}>
                <td className="px-3 py-2"><Badge variant={tx.transaction_type.includes("IN") ? "success" : "danger"}>{tx.transaction_type}</Badge></td>
                <td className="px-3 py-2">{tx.quantity}</td>
                <td className="px-3 py-2">{fmtNum(tx.net_weight)}g</td>
                <td className="px-3 py-2">{tx.previous_stock}</td>
                <td className="px-3 py-2 font-semibold">{tx.new_stock}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{tx.reason || "—"}</td>
                <td className="px-3 py-2 text-xs">{new Date(tx.date).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </TableShell>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({ item, onClose, onDone }) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  if (!item) return null;

  const doDelete = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageInventory", { action: "delete_permanent", id: item.id });
      if (!res.data?.success) { alert(res.data?.error || t("inv.errDelete")); setSaving(false); return; }
      onDone(); onClose();
    } catch (e) { alert(e.message); setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("inventory.deletePermanent")}</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm font-medium text-red-800">{t("inventory.deleteConfirmTitle")}</p>
            <p className="text-sm text-red-700 mt-1">{t("inventory.deleteConfirmDesc")}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">{t("billing.item")}: <span className="font-medium text-foreground">{item.item_name}</span></p>
            <p className="text-muted-foreground">{t("common.code")}: <span className="font-mono">{item.item_code || "—"}</span></p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={doDelete} disabled={saving}>{saving ? t("common.processing") : t("inventory.deletePermanent")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BarcodeDialog({ item, onClose, onDone, settings }) {
  const t = useT();
  const [generating, setGenerating] = useState(false);
  const [desc, setDesc] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  useEffect(() => { if (item) setDesc(item.description || ""); }, [item]);
  if (!item) return null;
  const barcodeValue = item.barcode || item.item_code;
  const generate = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("manageInventory", { action: "generate_barcode", id: item.id });
      if (res.data?.success) { onDone(); }
      else alert(res.data?.error || "Generate failed");
    } catch (e) { alert(e.message); }
    finally { setGenerating(false); }
  };
  const saveDesc = async () => {
    setSavingDesc(true);
    try {
      const res = await base44.functions.invoke("manageInventory", { action: "edit_metadata", id: item.id, data: { description: desc } });
      if (res.data?.success) { onDone(); }
      else alert(res.data?.error || "Update failed");
    } catch (e) { alert(e.message); }
    finally { setSavingDesc(false); }
  };
  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("inventory.viewBarcode")} — {item.item_name}</DialogTitle></DialogHeader>
        <div className="py-4">
          <div className="rounded-lg bg-muted/40 border p-3 mb-4">
            <div className="flex flex-wrap gap-1.5 mb-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 capitalize">{item.metal_type}</span>
              {item.category_name && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">{item.category_name}</span>}
              {item.purity_display && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">{item.purity_display}</span>}
              {item.hsn && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">HSN: {item.hsn}</span>}
            </div>
            <p className="text-xs text-muted-foreground">{t("inventory.masterManaged")}</p>
          </div>
          <div className="text-center mb-4">
            {barcodeValue ? (
              <div>
                <Code128Barcode value={barcodeValue} height={Number(settings?.barcode_height) || 70} moduleWidth={Number(settings?.barcode_width) || 2} fontSize={Number(settings?.barcode_font_size) || 14} />
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="outline" onClick={() => setPrintOpen(true)}><Printer className="w-4 h-4 mr-1" /> {t("inventory.printBarcode")}</Button>
                  {!item.barcode && (
                    <Button variant="ghost" size="sm" onClick={generate} disabled={generating} className="text-xs">
                      {generating ? t("common.processing") : t("inventory.generateBarcode")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t("inventory.barcodeStable")}</p>
              </div>
            ) : (
              <div>
                <BarcodeIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">{t("inventory.noBarcode")}</p>
                <Button onClick={generate} disabled={generating}>{generating ? t("common.processing") : t("inventory.generateBarcode")}</Button>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">{t("common.notes")}</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("inventory.descPlaceholder")} />
            <Button size="sm" variant="outline" className="mt-2" onClick={saveDesc} disabled={savingDesc}>{savingDesc ? "..." : t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
      <PrintBarcodeDialog open={printOpen} onClose={() => setPrintOpen(false)} item={item} settings={settings} />
    </Dialog>
  );
}

function StockInDialog({ item, onClose, onDone }) {
  const t = useT();
  const [quantity, setQuantity] = useState(0);
  const [grossWeight, setGrossWeight] = useState(0);
  const [netWeight, setNetWeight] = useState(0);
  const [reason, setReason] = useState("opening");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseRef, setPurchaseRef] = useState("");
  const [saving, setSaving] = useState(false);

  if (!item) return null;
  const prevQty = Number(item.quantity) || 0;
  const newQty = prevQty + Number(quantity);

  const save = async () => {
    if (Number(quantity) <= 0 && Number(netWeight) <= 0) { alert("Enter quantity or weight to stock in"); return; }
    if (newQty < 0) { alert("Resulting stock cannot be negative"); return; }
    setSaving(true);
    try {
      const isPurchase = reason === "purchase" || !!purchaseRef;
      const res = await base44.functions.invoke("adjustStock", {
        inventory_id: item.id, direction: "in",
        quantity: Number(quantity),
        gross_weight: Number(grossWeight), net_weight: Number(netWeight),
        reason: reason === "opening" ? "Opening Stock" : reason === "purchase" ? "Purchase Stock In" : "Manual Stock In",
        transaction_type: isPurchase ? "PURCHASE_IN" : "ADJUSTMENT_IN",
        supplier_name: supplierName, purchase_reference: purchaseRef,
      });
      if (res.data?.success) { onDone(); onClose(); }
      else alert(res.data?.error || "Stock in failed");
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("inventory.stockIn")} — {item.item_name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">{t("inventory.currentStock")}</p><p className="font-semibold">{prevQty}</p></div>
            <div className="rounded-lg bg-emerald-50 p-2"><p className="text-xs text-muted-foreground">{t("inventory.stockIn")}</p><p className="font-semibold">+{Number(quantity) || 0}</p></div>
            <div className="rounded-lg bg-blue-50 p-2"><p className="text-xs text-muted-foreground">{t("inventory.newStock")}</p><p className="font-semibold">{newQty}</p></div>
          </div>
          <div><Label>{t("inventory.stockInReason")}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opening">Opening Stock</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="adjustment">Manual Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><Label className="text-xs">{t("common.quantity")}</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div><Label className="text-xs">{t("billing.grossWt")}</Label><Input type="number" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} /></div>
            <div><Label className="text-xs">{t("billing.netWt")}</Label><Input type="number" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><Label className="text-xs">{t("inventory.supplier")}</Label><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></div>
            <div><Label className="text-xs">{t("inventory.purchaseRef")}</Label><Input value={purchaseRef} onChange={(e) => setPurchaseRef(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? t("common.saving") : t("inventory.stockIn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Top-level "Add Stock" picker — search an existing item of the current metal,
// then hand off to the per-item StockInDialog.
function AddStockPickerDialog({ open, onClose, items, onSelect }) {
  const t = useT();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const matches = items.filter((i) => {
    const x = q.toLowerCase();
    return !i.is_archived && (!x || i.item_name?.toLowerCase().includes(x) || i.item_code?.toLowerCase().includes(x) || i.barcode?.includes(x));
  }).slice(0, 8);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("inv.addStock")}</DialogTitle></DialogHeader>
        <div className="py-2">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inventory.searchPlaceholder")} className="pl-9" autoFocus />
          </div>
          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">{t("inv.noItemsPick")}</p>
            ) : matches.map((i) => (
              <button key={i.id} onClick={() => onSelect(i)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex justify-between items-center">
                <span><span className="font-medium">{i.item_name}</span> <span className="text-xs text-muted-foreground ml-2 font-mono">{i.item_code}</span></span>
                <span className="text-xs text-muted-foreground">Qty: {i.quantity}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}