import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// New Item + Opening Stock — creates the Item Master and the InventoryItem
// (with opening stock + a stable barcode) in one action. Reused by Inventory
// (metal locked to the page) and Purchase (metal selectable).
export default function NewItemDialog({ open, onClose, onDone, metal: lockedMetal, onCreated }) {
  const t = useT();
  const [cats, setCats] = useState([]);
  const [purities, setPurities] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [huidEnabled, setHuidEnabled] = useState(false);
  const [f, setF] = useState(emptyForm(lockedMetal));

  useEffect(() => {
    if (!open) return;
    setF(emptyForm(lockedMetal));
    setErr("");
    (async () => {
      const [c, p, settings] = await Promise.all([
        base44.entities.CategoryMaster.filter({ is_active: true }),
        base44.entities.PurityMaster.filter({ is_active: true }),
        base44.entities.ShopSettings.list("-created_date", 1),
      ]);
      setCats(c); setPurities(p);
      setHuidEnabled(settings[0]?.huid_enabled === true);
    })();
  }, [open, lockedMetal]);

  const metal = f.metal_type;
  const metalCats = useMemo(() => cats.filter((c) => c.metal_type === metal || c.metal_type === "mixed"), [cats, metal]);
  const metalPurities = useMemo(() => purities.filter((p) => p.metal_type === metal), [purities, metal]);
  const catOptions = useMemo(() => metalCats.map((c) => ({ value: c.id, label: c.name })), [metalCats]);
  const purOptions = useMemo(() => metalPurities.map((p) => ({ value: p.id, label: p.display_format })), [metalPurities]);

  const set = (k, v) => setF((s) => {
    const updated = { ...s, [k]: v };
    // Auto-calculate Net Wt = Gross Wt − Less Wt
    if (k === "gross_weight" || k === "stone_weight") {
      updated.net_weight = Math.max(0, (Number(updated.gross_weight) || 0) - (Number(updated.stone_weight) || 0));
    }
    return updated;
  });

  const save = async () => {
    setErr("");
    if (!f.item_name) { setErr(t("inv.errCodeName")); return; }
    if (!f.metal_type) { setErr(t("billing.metalType") + " *"); return; }
    if (!f.category_id) { setErr(t("billing.category") + " *"); return; }
    if (!f.purity_id) { setErr(t("billing.purity") + " *"); return; }
    if (Number(f.quantity) < 0 || Number(f.gross_weight) < 0 || Number(f.net_weight) < 0) { setErr(t("inv.errNegative")); return; }
    if (Number(f.stone_weight) < 0) { setErr(t("inv.errNegative")); return; }
    if (Number(f.stone_weight) > Number(f.gross_weight)) { setErr(t("inv.errLessWtExceedsGross")); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageItem", {
        action: "create_with_stock",
        data: {
          item_code: f.item_code, item_name: f.item_name, barcode: f.barcode, huid: f.huid,
          metal_type: f.metal_type, category_id: f.category_id, purity_id: f.purity_id,
          hsn: f.hsn, quantity: Number(f.quantity), gross_weight: Number(f.gross_weight),
          stone_weight: Number(f.stone_weight) || 0, net_weight: Number(f.net_weight),
          low_stock_threshold: Number(f.low_stock_threshold),
          is_active: f.is_active,
        },
      });
      if (!res.data?.success) { setErr(res.data?.error || t("inv.errCreate")); return; }
      onDone?.();
      onCreated?.(res.data.record);
      onClose?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("inv.newItemStock")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("inventory.jewelleryId")}</Label><Input value={f.huid || f.item_code} onChange={(e) => { const v = e.target.value; set("huid", v); set("item_code", v); }} placeholder="e.g. ABC123" /></div>
            <div><Label>{t("billing.item")} *</Label><Input value={f.item_name} onChange={(e) => set("item_name", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("inventory.barcode")}</Label><Input value={f.barcode} onChange={(e) => set("barcode", e.target.value.toUpperCase())} placeholder={t("inv.barcodeAuto")} maxLength={5} /></div>
            <div><Label>{t("billing.metalType")} *</Label>
              {lockedMetal ? (
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 capitalize text-sm">{t("metal." + lockedMetal)}</div>
              ) : (
                <Select value={f.metal_type} onValueChange={(v) => set("metal_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["gold", "silver"].map((m) => <SelectItem key={m} value={m} className="capitalize">{t("metal." + m)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("billing.category")} *</Label>
              <SearchableSelect
                options={catOptions}
                value={f.category_id}
                onChange={(v) => set("category_id", v)}
                placeholder={t("common.none")}
                emptyText={t("inv.noMatches")}
              />
            </div>
            <div><Label>{t("billing.purity")} *</Label>
              <SearchableSelect
                options={purOptions}
                value={f.purity_id}
                onChange={(v) => set("purity_id", v)}
                placeholder={t("common.none")}
                emptyText={t("inv.noMatches")}
              />
            </div>
          </div>
          <div><Label>{t("billing.hsn")}</Label><Input value={f.hsn} onChange={(e) => set("hsn", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("common.quantity")} *</Label><Input type="number" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
            <div><Label>{t("inv.lowStockThreshold")}</Label><Input type="number" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder={t("inv.lowStockHint")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>{t("billing.grossWt")} *</Label><Input type="number" step="0.001" value={f.gross_weight} onChange={(e) => set("gross_weight", e.target.value)} /></div>
            <div><Label>{t("billing.stoneWt")}</Label><Input type="number" step="0.001" value={f.stone_weight} onChange={(e) => set("stone_weight", e.target.value)} placeholder="0" /></div>
            <div><Label>{t("billing.netWt")} *</Label><Input type="number" step="0.001" value={f.net_weight} onChange={(e) => set("net_weight", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>Net = Gross − Less Wt</div>
            <div className="text-right">Fine Wt = {(() => { const pur = purities.find((p) => p.id === f.purity_id); return pur ? ((Number(f.net_weight) || 0) * Number(pur.purity_value) / 100).toFixed(3) : "—"; })()}g</div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> {t("common.active")}</label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyForm(lockedMetal) {
  return {
    item_code: "", item_name: "", barcode: "", huid: "",
    metal_type: lockedMetal || "gold",
    category_id: "", purity_id: "", hsn: "",
    quantity: 0, gross_weight: 0, stone_weight: 0, net_weight: 0,
    low_stock_threshold: 0, is_active: true,
  };
}