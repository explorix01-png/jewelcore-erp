import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { calcBill, fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Package } from "lucide-react";
import PurchaseItemRow from "./PurchaseItemRow";
import NewItemDialog from "@/components/inventory/NewItemDialog";

export default function PurchaseDialog({ open, onClose, onDone, metal: lockedMetal, editPurchase, editItems }) {
  const t = useT();
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [gstConfigs, setGstConfigs] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstMode, setGstMode] = useState("intra");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentRef, setPaymentRef] = useState("");

  const loadItems = async () => {
    setItems(await base44.entities.ItemMaster.filter({ is_active: true }, "-created_date", 500));
  };

  useEffect(() => {
    if (open) {
      (async () => {
        const [sups, gst] = await Promise.all([
          base44.entities.Supplier.list("-created_date", 200),
          base44.entities.GSTConfig.filter({ is_active: true }, "-created_date", 5),
          loadItems(),
        ]);
        setSuppliers(sups);
        setGstConfigs(gst);
        if (editPurchase) {
          setSupplierId(editPurchase.supplier_id || "");
          setDate(editPurchase.purchase_date || new Date().toISOString().slice(0, 10));
          setNotes(editPurchase.notes || "");
          setGstEnabled(editPurchase.gst_enabled || false);
          setGstMode(editPurchase.gst_mode || "intra");
          setPaymentMode(editPurchase.payment_mode || "cash");
          setPaidAmount(editPurchase.paid_amount || 0);
          setPaymentRef(editPurchase.payment_details || "");
          setRows((editItems || []).map((pi) => ({
            item_id: pi.item_id, item_name: pi.item_name, item_code: pi.item_code || "",
            metal_type: pi.metal_type, purity_display: pi.purity_display || "",
            purity_value: pi.purity_value || 0, category_name: pi.category_name || "", hsn: pi.hsn || "",
            quantity: pi.quantity, gross_weight: pi.gross_weight, stone_weight: pi.stone_weight || 0,
            net_weight: pi.net_weight, rate_per_gram: pi.rate_per_gram || 0,
            making_charge: pi.making_charge || 0, making_charge_type: pi.making_charge_type || "percentage",
          })));
        }
      })();
    }
  }, [open]);  

  // Filter items by locked metal when in tab mode
  const filteredItems = useMemo(() => {
    const x = itemSearch.toLowerCase();
    return items.filter((it) => {
      if (lockedMetal && it.metal_type !== lockedMetal) return false;
      return !x || it.item_name?.toLowerCase().includes(x) || it.item_code?.toLowerCase().includes(x);
    }).slice(0, 8);
  }, [items, itemSearch, lockedMetal]);

  const addItem = (it) => {
    setRows([...rows, {
      item_id: it.id, item_name: it.item_name, item_code: it.item_code || "",
      metal_type: it.metal_type, purity_display: it.purity_display || "",
      purity_value: it.purity_value || 0, category_name: it.category_name || "", hsn: it.hsn || "",
      quantity: 1, gross_weight: 0, stone_weight: 0, net_weight: 0,
      rate_per_gram: 0, making_charge: 0, making_charge_type: "percentage",
    }]);
    setItemSearch("");
  };

  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setRows(rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const gstConfig = gstConfigs[0] || null;
  const effectiveGstRate = gstEnabled && gstConfig ? Number(gstConfig.gst_rate) : 0;
  const calc = useMemo(() => calcBill(rows, 0, gstConfig, { gst_enabled: gstEnabled, gst_mode: gstMode }), [rows, gstConfig, gstEnabled, gstMode]);
  const due = Math.max(0, calc.totalAmount - (Number(paidAmount) || 0));

  const finalize = async () => {
    if (!supplierId) { alert("Select a supplier"); return; }
    if (rows.length === 0) { alert("Add at least one item"); return; }
    for (const r of rows) {
      if (!r.item_id) { alert("Each row needs a master item — search and select from the dropdown"); return; }
      if (Number(r.quantity) <= 0 || Number(r.net_weight) <= 0) { alert("Each row needs quantity > 0 and net weight > 0"); return; }
      if (Number(r.rate_per_gram) <= 0) { alert("Each row needs a rate per gram > 0"); return; }
    }
    setSaving(true);
    const operationId = `pop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const payload = {
        supplier_id: supplierId, purchase_date: date, notes,
        operation_id: operationId,
        gst_enabled: gstEnabled, gst_mode: gstMode,
        paid_amount: Number(paidAmount) || 0, payment_mode: paymentMode,
        payment_details: paymentRef,
        items: rows.map((r) => ({
          item_id: r.item_id, item_name: r.item_name, item_code: r.item_code || "",
          metal_type: r.metal_type, purity_display: r.purity_display, category_name: r.category_name,
          hsn: r.hsn, quantity: Number(r.quantity), gross_weight: Number(r.gross_weight),
          stone_weight: Number(r.stone_weight) || 0, net_weight: Number(r.net_weight), wastage: 0,
          rate_per_gram: Number(r.rate_per_gram), making_charge: Number(r.making_charge),
          making_charge_type: r.making_charge_type, hallmarking_charge: 0, discount: 0,
        })),
      };
      let res;
      if (editPurchase) {
        res = await base44.functions.invoke("finalizePurchase", { ...payload, action: "edit", purchase_id: editPurchase.id });
      } else {
        res = await base44.functions.invoke("finalizePurchase", payload);
      }
      const result = res.data;
      if (!result.success) { alert(result.error || "Purchase failed"); return; }
      onDone(); onClose(); setRows([]); setSupplierId(""); setNotes(""); setPaidAmount(0); setPaymentRef("");
    } catch (e) {
      alert("Purchase failed: " + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editPurchase ? t("purchase.editPurchase") : t("purchase.newPurchase")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Supplier + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("purchase.supplier")} *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("common.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>

          {/* Item search */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <Label className="mb-2 block text-sm font-medium">{t("purchase.addItem")}</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder={t("purchase.searchItem")} className="pl-9" autoFocus />
            </div>
            {itemSearch && (
              <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto bg-background">
                {filteredItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm">
                    <p className="text-muted-foreground mb-2">{t("purchase.itemNotFound")}</p>
                    <Button size="sm" variant="outline" onClick={() => setNewItemOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> {t("inv.newItemStock")}</Button>
                  </div>
                ) : filteredItems.map((it) => (
                  <button key={it.id} onClick={() => addItem(it)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center">
                    <span><span className="font-medium">{it.item_name}</span><span className="text-xs text-muted-foreground ml-2 font-mono">{it.item_code}</span></span>
                    <span className="flex gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 capitalize">{it.metal_type}</span>
                      {it.purity_display && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">{it.purity_display}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!itemSearch && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Package className="w-3 h-3" /> {t("purchase.searchItemHint")}
              </p>
            )}
          </div>

          {/* Selected items */}
          <div className="border rounded-lg">
            <div className="px-3 py-2 bg-muted/50 text-sm font-medium border-b">{t("purchase.items")}</div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("purchase.selectItemPrompt")}</p>
            ) : (
              rows.map((r, i) => (
                <PurchaseItemRow key={i} row={r} index={i} onRemove={removeRow} onUpdate={updateRow} gstRate={effectiveGstRate} gstEnabled={gstEnabled} />
              ))
            )}
          </div>

          {/* GST + Payment */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gstEnabled} onChange={(e) => { setGstEnabled(e.target.checked); if (!e.target.checked) setGstMode("none"); }} /> {t("purchase.gstEnabled")}</label>
              {gstEnabled && (
                <Select value={gstMode} onValueChange={setGstMode}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intra">{t("billing.gstIntra")}</SelectItem>
                    <SelectItem value="inter">{t("billing.gstInter")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">{t("purchase.paymentMode")}</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("paymentMode.cash")}</SelectItem>
                    <SelectItem value="upi">{t("paymentMode.upi")}</SelectItem>
                    <SelectItem value="card">{t("paymentMode.card")}</SelectItem>
                    <SelectItem value="bank_transfer">{t("paymentMode.bank_transfer")}</SelectItem>
                    <SelectItem value="credit_due">{t("paymentMode.credit_due")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">{t("purchase.paidAmount")}</Label><Input type="number" className="h-8 text-xs" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></div>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.subtotal")}</span><span>{fmt(calc.subtotal)}</span></div>
              {gstEnabled && gstMode === "intra" && (<>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.cgst")}</span><span>{fmt(calc.cgst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.sgst")}</span><span>{fmt(calc.sgst)}</span></div>
              </>)}
              {gstEnabled && gstMode === "inter" && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.igst")}</span><span>{fmt(calc.igst)}</span></div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1"><span>{t("billing.total")}</span><span>{fmt(calc.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("purchase.paidAmount")}</span><span>{fmt(paidAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.due")}</span><span className="text-red-600">{fmt(due)}</span></div>
            </div>
          </div>
          <Textarea placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={finalize} disabled={saving}>{saving ? t("common.processing") : (editPurchase ? t("common.save") : t("purchase.finalizePurchase"))}</Button>
        </DialogFooter>
      </DialogContent>
      <NewItemDialog
        open={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onDone={loadItems}
        onCreated={(rec) => { if (rec) addItem(rec); }}
        metal={lockedMetal}
      />
    </Dialog>
  );
}