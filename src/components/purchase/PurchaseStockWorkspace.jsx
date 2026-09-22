import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { calcFineWeight, fmtWt3 } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Plus, Trash2 } from "lucide-react";
import PurchaseItemPicker from "./PurchaseItemPicker";
import PurchaseStockItemCard from "./PurchaseStockItemCard";

// Add Purchase — pure stock-entry workspace. Adds stock directly to Gold or
// Silver Inventory using the existing adjustStock mechanism. Does NOT create
// a Purchase record, supplier transaction, or GST bill.
export default function PurchaseStockWorkspace({ onDone }) {
  const t = useT();
  const [metal, setMetal] = useState("gold");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftItems, setDraftItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraftItems([]); }, [metal]);

  const addItem = async (item) => {
    let barcode = "", huid = "", invId = "";
    try {
      const invItems = await base44.entities.InventoryItem.filter({ item_id: item.id }, "-updated_date", 1);
      if (invItems.length > 0) {
        barcode = invItems[0].barcode || "";
        huid = invItems[0].huid || "";
        invId = invItems[0].id;
      }
    } catch (e) { /* ignore */ }
    setDraftItems([...draftItems, {
      inventory_id: invId,
      item_id: item.id, item_name: item.item_name, item_code: item.item_code || "",
      huid, barcode,
      metal_type: item.metal_type, purity_display: item.purity_display || "",
      purity_value: item.purity_value || 0, category_name: item.category_name || "",
      hsn: item.hsn || "",
      quantity: 1, gross_weight: 0, stone_weight: 0, net_weight: 0, rate_per_gram: 0,
    }]);
  };

  const removeItem = (i) => setDraftItems(draftItems.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) => {
    setDraftItems(draftItems.map((r, idx) => {
      if (idx !== i) return r;
      const updated = { ...r, [field]: value };
      if (field === "gross_weight" || field === "stone_weight") {
        updated.net_weight = Math.max(0, (Number(updated.gross_weight) || 0) - (Number(updated.stone_weight) || 0));
      }
      return updated;
    }));
  };

  const finalize = async () => {
    if (draftItems.length === 0) { alert(t("purchase.addAtLeastOne")); return; }
    for (const r of draftItems) {
      if (!r.inventory_id) { alert(`${r.item_name}: ${t("purchase.noInventoryItem")}`); return; }
      if (Number(r.quantity) <= 0) { alert(t("purchase.qtyGtZero")); return; }
      if (Number(r.net_weight) <= 0) { alert(t("purchase.netWtGtZero")); return; }
    }
    setSaving(true);
    try {
      for (const r of draftItems) {
        await base44.functions.invoke("adjustStock", {
          inventory_id: r.inventory_id,
          direction: "in",
          quantity: Number(r.quantity),
          gross_weight: Number(r.gross_weight),
          net_weight: Number(r.net_weight),
          reason: t("purchase.stockEntryReason"),
          transaction_type: "PURCHASE_IN",
        });
      }
      setDraftItems([]);
      onDone?.();
    } catch (e) {
      alert(t("purchase.stockEntryFailed") + ": " + (e.message || ""));
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-5 h-5 text-amber-700" />
        <h2 className="font-display text-lg font-semibold">{t("purchase.addPurchaseStock")}</h2>
        <span className="text-xs text-muted-foreground ml-2">— {t("purchase.stockEntryOnly")}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("purchase.addPurchaseNote")}</p>

      <Tabs value={metal} onValueChange={setMetal} className="mb-4">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="gold">{t("purchase.goldTab")}</TabsTrigger>
          <TabsTrigger value="silver">{t("purchase.silverTab")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <Label className="text-xs">{t("common.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={() => setPickerOpen(true)}><Plus className="w-4 h-4 mr-1" /> {t("purchase.addStockItem")}</Button>
        </div>
      </div>

      {draftItems.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
          {t("purchase.draftEmpty")}
        </div>
      ) : (
        <>
        <div className="hidden lg:block overflow-x-auto rounded-lg border mb-4">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">{t("billing.item")}</th>
                <th className="px-2 py-2 text-left">{t("inventory.jewelleryId")}</th>
                <th className="px-2 py-2 text-left">{t("billing.purity")}</th>
                <th className="px-2 py-2 text-center">{t("common.quantity")}</th>
                <th className="px-2 py-2 text-right">{t("purchase.grossWt")}</th>
                <th className="px-2 py-2 text-right">{t("purchase.lessWt")}</th>
                <th className="px-2 py-2 text-right">{t("purchase.netWt")}</th>
                <th className="px-2 py-2 text-right">{t("purchase.fineWt")}</th>
                <th className="px-2 py-2 text-right">{t("purchase.rate")}</th>
                <th className="px-2 py-2 text-center">—</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draftItems.map((row, i) => {
                const fineWt = calcFineWeight(Number(row.net_weight) || 0, Number(row.purity_value) || 0);
                return (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-xs">{row.item_name}</td>
                    <td className="px-2 py-1.5">
                      {row.huid ? (
                        <>
                          <p className="font-mono text-xs font-semibold text-blue-700">{row.huid}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{row.item_code || ""}</p>
                        </>
                      ) : (
                        <p className="font-mono text-xs">{row.item_code || "—"}</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{row.purity_display || "—"}</td>
                    <td className="px-2 py-1.5"><Input type="number" className="h-7 w-14 text-xs text-center" value={row.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-7 w-20 text-xs text-right" value={row.gross_weight} onChange={(e) => updateItem(i, "gross_weight", e.target.value)} /></td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-7 w-20 text-xs text-right" value={row.stone_weight} onChange={(e) => updateItem(i, "stone_weight", e.target.value)} /></td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-7 w-20 text-xs text-right" value={row.net_weight} onChange={(e) => updateItem(i, "net_weight", e.target.value)} /></td>
                    <td className="px-2 py-1.5 text-right text-xs font-medium">{fmtWt3(fineWt)}</td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-7 w-20 text-xs text-right" value={row.rate_per_gram} onChange={(e) => updateItem(i, "rate_per_gram", e.target.value)} /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => removeItem(i)} className="p-1 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="lg:hidden space-y-3 mb-4">
          {draftItems.map((row, i) => (
            <PurchaseStockItemCard key={i} row={row} index={i} t={t} updateItem={updateItem} removeItem={removeItem} />
          ))}
        </div>
        </>
      )}

      {draftItems.length > 0 && (
        <Button onClick={finalize} disabled={saving} className="w-full">
          {saving ? t("common.processing") : t("purchase.addStock")}
        </Button>
      )}

      <PurchaseItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addItem} metal={metal} />
    </div>
  );
}