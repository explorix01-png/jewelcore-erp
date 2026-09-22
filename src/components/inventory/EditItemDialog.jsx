import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import SearchableSelect from "@/components/ui/searchable-select";

// Edit Item — corrects master information (code, name, barcode, category, purity,
// HSN, active, low-stock threshold) AND optionally stock (quantity/weights).
// Stock corrections are audited server-side as a Manual Stock Correction transaction.
export default function EditItemDialog({ item, onClose, onDone }) {
  const t = useT();
  const [cats, setCats] = useState([]);
  const [purities, setPurities] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [huidEnabled, setHuidEnabled] = useState(false);
  const [f, setF] = useState(null);

  useEffect(() => {
    if (!item) return;
    setErr("");
    setF({
      item_code: item.item_code || "", item_name: item.item_name || "", barcode: item.barcode || "", huid: item.huid || "",
      metal_type: item.metal_type || "gold", category_id: "", purity_id: "",
      hsn: item.hsn || "", low_stock_threshold: item.low_stock_threshold ?? 0,
      is_active: item.is_archived ? false : true,
      quantity: item.quantity ?? 0, gross_weight: item.gross_weight ?? 0, stone_weight: item.stone_weight ?? 0, net_weight: item.net_weight ?? 0,
      stockTouched: false,
    });
    (async () => {
      const [c, p, settings] = await Promise.all([
        base44.entities.CategoryMaster.filter({ is_active: true }),
        base44.entities.PurityMaster.filter({ is_active: true }),
        base44.entities.ShopSettings.list("-created_date", 1),
      ]);
      setCats(c); setPurities(p);
      setHuidEnabled(settings[0]?.huid_enabled === true);
      const matchedCat = c.find((x) => x.name === item.category_name);
      const matchedPur = p.find((x) => x.display_format === item.purity_display && x.metal_type === item.metal_type);
      setF((s) => ({ ...s, category_id: matchedCat?.id || "", purity_id: matchedPur?.id || "" }));
    })();
  }, [item]);

  const metalCats = useMemo(() => cats.filter((c) => c.metal_type === f?.metal_type || c.metal_type === "mixed"), [cats, f]);
  const metalPurities = useMemo(() => purities.filter((p) => p.metal_type === f?.metal_type), [purities, f]);
  const catOptions = useMemo(() => metalCats.map((c) => ({ value: c.id, label: c.name })), [metalCats]);
  const purOptions = useMemo(() => metalPurities.map((p) => ({ value: p.id, label: p.display_format })), [metalPurities]);

  if (!item || !f) return null;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setStock = (k, v) => setF((s) => {
    const updated = { ...s, [k]: v, stockTouched: true };
    // Auto-calculate Net Wt = Gross Wt − Less Wt
    if (k === "gross_weight" || k === "stone_weight") {
      updated.net_weight = Math.max(0, (Number(updated.gross_weight) || 0) - (Number(updated.stone_weight) || 0));
    }
    return updated;
  });

  const stockChanged = f.stockTouched && (
    Number(f.quantity) !== Number(item.quantity) ||
    Number(f.gross_weight) !== Number(item.gross_weight) ||
    Number(f.stone_weight) !== Number(item.stone_weight) ||
    Number(f.net_weight) !== Number(item.net_weight)
  );

  const save = async () => {
    setErr("");
    if (!f.item_name) { setErr(t("inv.errCodeName")); return; }
    if (Number(f.quantity) < 0 || Number(f.gross_weight) < 0 || Number(f.net_weight) < 0) { setErr(t("inv.errNegative")); return; }
    if (Number(f.stone_weight) < 0) { setErr(t("inv.errNegative")); return; }
    if (Number(f.stone_weight) > Number(f.gross_weight)) { setErr(t("inv.errLessWtExceedsGross")); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageItem", {
        action: "edit",
        inventory_id: item.id,
        data: {
          item_code: f.item_code, item_name: f.item_name, barcode: f.barcode, huid: f.huid,
          metal_type: f.metal_type, category_id: f.category_id, purity_id: f.purity_id,
          hsn: f.hsn, low_stock_threshold: Number(f.low_stock_threshold), is_active: f.is_active,
          ...(stockChanged ? {
            quantity: Number(f.quantity),
            gross_weight: Number(f.gross_weight),
            stone_weight: Number(f.stone_weight) || 0,
            net_weight: Number(f.net_weight),
          } : {}),
        },
      });
      if (!res.data?.success) { setErr(res.data?.error || t("inv.errUpdate")); return; }
      onDone?.();
      onClose?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("inv.editItem")} — {item.item_name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* SECTION 1 — Item Details */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inv.sectionItemDetails")}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("common.code")}</Label><Input value={f.item_code} onChange={(e) => set("item_code", e.target.value)} /></div>
                <div><Label>{t("billing.item")} *</Label><Input value={f.item_name} onChange={(e) => set("item_name", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("inventory.barcode")}</Label><Input value={f.barcode} onChange={(e) => set("barcode", e.target.value.toUpperCase())} maxLength={5} /></div>
                <div><Label>{t("billing.metalType")}</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 capitalize text-sm">{t("metal." + f.metal_type)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("billing.category")}</Label>
                  <SearchableSelect
                    options={catOptions}
                    value={f.category_id}
                    onChange={(v) => set("category_id", v)}
                    placeholder={t("common.none")}
                    emptyText={t("inv.noMatches")}
                  />
                </div>
                <div><Label>{t("billing.purity")}</Label>
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
              {huidEnabled && (
                <div>
                  <Label>{t("inventory.huid")}</Label>
                  <div className="flex gap-2">
                    <Input value={f.huid} onChange={(e) => set("huid", e.target.value)} placeholder={t("inventory.huidPlaceholder")} />
                    <Button type="button" variant="outline" size="sm" onClick={async () => {
                      try {
                        const res = await base44.functions.invoke("manageItem", { action: "assign_huid_from_code", inventory_id: item.id });
                        if (res.data?.success) { set("huid", res.data.huid); alert(t("inventory.huidAssigned")); }
                        else alert(res.data?.error || "Failed");
                      } catch (e) { alert(e.message); }
                    }} title={t("inventory.useCodeAsHuid")}>{t("inventory.useCodeAsHuid")}</Button>
                  </div>
                </div>
              )}
              <div><Label>{t("inv.lowStockThreshold")}</Label><Input type="number" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder={t("inv.lowStockHint")} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> {t("common.active")}</label>
            </div>
          </div>

          {/* SECTION 2 — Stock Details */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inv.sectionStockDetails")}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div><Label>{t("common.quantity")}</Label><Input type="number" value={f.quantity} onChange={(e) => setStock("quantity", e.target.value)} /></div>
                <div><Label>{t("billing.grossWt")}</Label><Input type="number" step="0.001" value={f.gross_weight} onChange={(e) => setStock("gross_weight", e.target.value)} /></div>
                <div><Label>{t("billing.stoneWt")}</Label><Input type="number" step="0.001" value={f.stone_weight} onChange={(e) => setStock("stone_weight", e.target.value)} /></div>
                <div><Label>{t("billing.netWt")}</Label><Input type="number" step="0.001" value={f.net_weight} onChange={(e) => setStock("net_weight", e.target.value)} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Net = Gross − Less Wt · Fine Wt = Net × Purity%</p>
              <p className="text-xs text-muted-foreground">{stockChanged ? t("inv.stockChangeNote") : t("inv.stockNoChangeNote")}</p>
            </div>
          </div>

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