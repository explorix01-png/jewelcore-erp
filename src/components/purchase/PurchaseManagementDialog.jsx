import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { calcBill, calcPurityRate, fmt, fmtNum } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowLeft, Coins } from "lucide-react";
import PurchaseItemCard from "@/components/purchase/PurchaseItemCard";

// Purchase Management — supplier purchase document. Does NOT update inventory.
// Calls finalizePurchase with update_inventory: false.
// Item table: Item Code, Item Name (manual), Gross Wt, Less Wt, Purity,
// Hishob (%), Net Wt, Rate/g, Jama (metal value), Total (line total).
export default function PurchaseManagementDialog({ open, onClose, onDone, editPurchase, editItems }) {
  const [suppliers, setSuppliers] = useState([]);
  const [purities, setPurities] = useState([]);
  const [gstConfigs, setGstConfigs] = useState([]);
  const [rates, setRates] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstMode, setGstMode] = useState("intra");
  const [otherCharges, setOtherCharges] = useState(0);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paidAmount, setPaidAmount] = useState(0);

  const [goldSettlement, setGoldSettlement] = useState({
    metal_type: "gold",
    purity_display: "22K",
    purity_value: 91.67,
    gross_weight: "",
    net_weight: "",
    rate_per_gram: "",
    reference: "",
    description: "",
    notes: "",
  });

  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoadError(null);
    (async () => {
      try {
        const [sups, purs, gst, rt] = await Promise.all([
          base44.entities.Supplier.list("-created_date", 200).catch(() => []),
          base44.entities.PurityMaster.filter({ is_active: true }).catch(() => []),
          base44.entities.GSTConfig.filter({ is_active: true }, "-created_date", 5).catch(() => []),
          base44.entities.RateHistory.filter({ is_active: true }, "-effective_date", 100).catch(() => []),
        ]);
        const safeSups = Array.isArray(sups) ? sups : [];
        const safePurs = Array.isArray(purs) ? purs : [];
        const safeGst = Array.isArray(gst) ? gst : [];
        const safeRt = Array.isArray(rt) ? rt : [];
        setSuppliers(safeSups);
        setPurities(safePurs);
        setGstConfigs(safeGst);
        setRates(safeRt);
        if (editPurchase) {
          setSupplierId(editPurchase.supplier_id || "");
          setDate(editPurchase.purchase_date || new Date().toISOString().slice(0, 10));
          setNotes(editPurchase.notes || "");
          setGstEnabled(editPurchase.gst_enabled || false);
          setGstMode(editPurchase.gst_mode || "intra");
          setOtherCharges(editPurchase.other_charges || 0);
          setPaymentMode(editPurchase.payment_mode || "cash");
          setPaidAmount(editPurchase.paid_amount || 0);
          if (editPurchase.gold_settlement) {
            try {
              const gs = typeof editPurchase.gold_settlement === "string" ? JSON.parse(editPurchase.gold_settlement) : editPurchase.gold_settlement;
              if (gs) setGoldSettlement(gs);
            } catch (e) {}
          }
          setRows((editItems || []).map((pi) => ({
            item_id: pi.item_id || "", item_name: pi.item_name || "", item_code: pi.item_code || "",
            metal_type: pi.metal_type || "gold", purity_display: pi.purity_display || "",
            purity_value: pi.purity_value || 0, category_name: pi.category_name || "", hsn: pi.hsn || "",
            quantity: pi.quantity || 1, gross_weight: pi.gross_weight || 0,
            stone_weight: pi.stone_weight || 0, net_weight: pi.net_weight || 0,
            wastage: pi.wastage || 0, rate_per_gram: pi.rate_per_gram || 0,
            making_charge: pi.making_charge || 0, making_charge_type: "per_gram",
            _rateAuto: false,
            _purityMode: pi.purity_display && safePurs.some((p) => p && p.metal_type === pi.metal_type && p.display_format === pi.purity_display) ? "master" : "custom",
            _customPurity: pi.purity_display || "",
          })));
        } else {
          setRows([]);
          setSupplierId("");
          setNotes("");
          setOtherCharges(0);
          setPaidAmount(0);
          setGoldSettlement({
            metal_type: "gold",
            purity_display: "22K",
            purity_value: 91.67,
            gross_weight: "",
            net_weight: "",
            rate_per_gram: "",
            reference: "",
            description: "",
            notes: "",
          });
        }
      } catch (e) {
        console.error("Failed to load purchase configuration:", e);
        setLoadError(e.message || "Failed to load master records");
      }
    })();
  }, [open]);  

  const gstConfig = gstConfigs[0] || null;
  const effectiveGstRate = gstEnabled && gstConfig ? Number(gstConfig.gst_rate) : 0;

  // Resolve rate from Rate Management (RateHistory) — single source of truth.
  const rateFor = (metalType, purityDisplay) => {
    const r = rates.find((rt) => rt.metal_type === metalType && (!purityDisplay || rt.purity_display === purityDisplay) && rt.is_active);
    return r ? Number(r.rate_per_gram) : 0;
  };

  const settlementFineWeight = useMemo(() => {
    const net = Number(goldSettlement.net_weight) || 0;
    const pur = Number(goldSettlement.purity_value) || 0;
    return Number(((net * pur) / 100).toFixed(3));
  }, [goldSettlement.net_weight, goldSettlement.purity_value]);

  const effectiveSettlementRate = useMemo(() => {
    if (Number(goldSettlement.rate_per_gram) > 0) return Number(goldSettlement.rate_per_gram);
    return rateFor(goldSettlement.metal_type, goldSettlement.purity_display);
  }, [goldSettlement.rate_per_gram, goldSettlement.metal_type, goldSettlement.purity_display, rates]);

  const settlementValue = useMemo(() => {
    const net = Number(goldSettlement.net_weight) || 0;
    return Math.round(net * effectiveSettlementRate);
  }, [goldSettlement.net_weight, effectiveSettlementRate]);

  // Find the base rate (purity_value = 100) for a metal from Rate Management.
  // Used to calculate rates for custom/manual purity values via calcPurityRate.
  const baseRateFor = (metalType) => {
    const metalPurities = purities.filter((p) => p.metal_type === metalType);
    const metalRates = rates.filter((rt) => rt.metal_type === metalType && rt.is_active);
    const basePurity = metalPurities.find((p) => Number(p.purity_value) === 100);
    if (basePurity) {
      const r = metalRates.find((rt) => rt.purity_display === basePurity.display_format);
      if (r) return Number(r.rate_per_gram);
    }
    let bestRate = 0, bestPurityValue = 0;
    for (const p of metalPurities) {
      const r = metalRates.find((rt) => rt.purity_display === p.display_format);
      if (r && Number(p.purity_value) > bestPurityValue) {
        bestPurityValue = Number(p.purity_value);
        bestRate = Number(r.rate_per_gram);
      }
    }
    return bestRate;
  };

  // Parse a manual purity input to a numeric percentage.
  // Accepts: "22K", "23.5K", "92.60%", "96.50", "925", "990", "92.25%", "90%"
  const parsePurity = (input, metalType) => {
    const s = String(input).trim();
    if (!s) return null;
    if (s.endsWith("%")) {
      const n = parseFloat(s.slice(0, -1).trim());
      return (isNaN(n) || n <= 0 || n > 100) ? null : n;
    }
    const upperS = s.toUpperCase();
    if (upperS.endsWith("K")) {
      const match = purities.find((p) => p.metal_type === metalType &&
        (p.display_format?.toUpperCase() === upperS || p.name?.toUpperCase() === upperS));
      if (match) return Number(match.purity_value);
      const karat = parseFloat(s.slice(0, -1).trim());
      if (isNaN(karat) || karat <= 0 || karat > 24) return null;
      return (karat / 24) * 100;
    }
    const n = parseFloat(s);
    if (isNaN(n) || n <= 0) return null;
    if (metalType === "gold") {
      if (n <= 24) {
        const kStr = n + "K";
        const match = purities.find((p) => p.metal_type === metalType &&
          (p.display_format?.toUpperCase() === kStr.toUpperCase() || p.name?.toUpperCase() === kStr.toUpperCase()));
        if (match) return Number(match.purity_value);
        return (n / 24) * 100;
      }
      return n > 100 ? null : n;
    }
    if (metalType === "silver") {
      if (n >= 100) return n > 1000 ? null : n / 10;
      return n;
    }
    return n;
  };

  const calc = useMemo(() => calcBill(rows, 0, gstConfig, { gst_enabled: gstEnabled, gst_mode: gstMode, other_charges: Number(otherCharges) || 0 }), [rows, gstConfig, gstEnabled, gstMode, otherCharges]);
  const due = Math.max(0, calc.totalAmount - (Number(paidAmount) || 0));

  const addRow = () => {
    setRows([...rows, {
      item_id: "", item_name: "", item_code: "", metal_type: "gold", purity_display: "",
      purity_value: 0, category_name: "", hsn: "",
      quantity: 1, gross_weight: 0, stone_weight: 0, net_weight: 0,
      wastage: 0, rate_per_gram: 0, making_charge: 0, making_charge_type: "per_gram",
      _rateAuto: true, _purityMode: "master", _customPurity: "",
    }]);
  };

  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));

  const updateRow = (i, field, val) => setRows(rows.map((r, idx) => {
    if (idx !== i) return r;
    const updated = { ...r, [field]: val };
    if (field === "gross_weight" || field === "stone_weight") {
      updated.net_weight = Math.max(0, (Number(updated.gross_weight) || 0) - (Number(updated.stone_weight) || 0));
    }
    // "Custom…" selected from master dropdown → switch to custom mode
    if (field === "purity_display" && val === "__custom__") {
      updated._purityMode = "custom";
      updated.purity_display = "";
      updated.purity_value = 0;
      updated._customPurity = "";
      updated.rate_per_gram = 0;
      updated._rateAuto = true;
      return updated;
    }
    // Custom purity text input → parse + resolve rate from base rate
    if (field === "_customPurity") {
      const metal = updated.metal_type;
      const parsed = parsePurity(val, metal);
      if (parsed !== null && parsed > 0) {
        updated.purity_value = parsed;
        updated.purity_display = val;
        const baseRate = baseRateFor(metal);
        updated.rate_per_gram = baseRate > 0 ? calcPurityRate(baseRate, parsed) : 0;
      } else {
        updated.purity_value = 0;
        updated.purity_display = val;
        updated.rate_per_gram = 0;
      }
      updated._rateAuto = true;
      return updated;
    }
    // Switch back to master mode
    if (field === "_purityMode" && val === "master") {
      updated._customPurity = "";
      updated.purity_display = "";
      updated.purity_value = 0;
      updated.rate_per_gram = 0;
      updated._rateAuto = true;
      return updated;
    }
    // Auto-resolve rate when metal or purity changes
    if (field === "metal_type" || field === "purity_display") {
      const metal = field === "metal_type" ? val : updated.metal_type;
      if (updated._purityMode === "custom") {
        // Custom mode: recalculate rate from base rate for new metal
        const parsed = updated._customPurity ? parsePurity(updated._customPurity, metal) : null;
        if (parsed !== null && parsed > 0) {
          updated.purity_value = parsed;
          updated.purity_display = updated._customPurity;
          const baseRate = baseRateFor(metal);
          updated.rate_per_gram = baseRate > 0 ? calcPurityRate(baseRate, parsed) : 0;
        } else {
          updated.rate_per_gram = 0;
        }
        updated._rateAuto = true;
      } else {
        // Master mode: resolve from RateHistory
        const purity = field === "purity_display" ? val : updated.purity_display;
        const resolved = rateFor(metal, purity);
        if (resolved > 0) {
          updated.rate_per_gram = resolved;
          updated._rateAuto = true;
        }
        if (field === "purity_display" && val) {
          const pur = purities.find((p) => p.display_format === val && p.metal_type === metal);
          if (pur) updated.purity_value = pur.purity_value;
        }
        if (field === "metal_type") {
          const purAvailable = purities.some((p) => p.display_format === updated.purity_display && p.metal_type === val);
          if (!purAvailable) {
            updated.purity_display = "";
            updated.purity_value = 0;
            updated.rate_per_gram = rateFor(val, "");
            updated._rateAuto = true;
          }
        }
      }
    }
    if (field === "rate_per_gram") {
      updated._rateAuto = false;
    }
    return updated;
  }));

  const finalize = async () => {
    if (!supplierId) { alert("Please select a supplier"); return; }
    if (rows.length === 0) { alert("Add at least one item"); return; }
    for (const r of rows) {
      if (!r.item_name) { alert("Each row needs an item name"); return; }
      if (Number(r.quantity) <= 0) { alert("Quantity must be greater than 0"); return; }
      if (Number(r.net_weight) <= 0) { alert("Net weight must be greater than 0"); return; }
    }
    setSaving(true);
    const operationId = `pop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const payload = {
        supplier_id: supplierId, purchase_date: date, notes,
        operation_id: operationId,
        gst_enabled: gstEnabled, gst_mode: gstMode,
        other_charges: Number(otherCharges) || 0,
        update_inventory: false,
        paid_amount: Number(paidAmount) || 0, payment_mode: paymentMode,
        gold_settlement: (paymentMode.includes("gold") || paymentMode === "mixed" || Number(goldSettlement.net_weight) > 0) ? {
          metal_type: goldSettlement.metal_type,
          purity_display: goldSettlement.purity_display,
          purity_value: Number(goldSettlement.purity_value) || (goldSettlement.metal_type === "gold" ? 91.67 : 92.5),
          gross_weight: Number(goldSettlement.gross_weight) || 0,
          net_weight: Number(goldSettlement.net_weight) || 0,
          fine_weight: settlementFineWeight,
          rate_per_gram: effectiveSettlementRate,
          settlement_value: settlementValue,
          reference: goldSettlement.reference || "",
          description: goldSettlement.description || "",
          notes: goldSettlement.notes || "",
        } : null,
        items: rows.map((r) => ({
          item_id: r.item_id || "", item_name: r.item_name, item_code: r.item_code || "",
          metal_type: r.metal_type, purity_display: r.purity_display, category_name: r.category_name,
          hsn: r.hsn, quantity: Number(r.quantity), gross_weight: Number(r.gross_weight),
          stone_weight: Number(r.stone_weight) || 0, net_weight: Number(r.net_weight),
          wastage: Number(r.wastage) || 0, purity_value: Number(r.purity_value) || 0,
          rate_per_gram: Number(r.rate_per_gram), making_charge: Number(r.making_charge),
          making_charge_type: "per_gram", hallmarking_charge: 0, discount: 0,
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
      onDone?.();
      onClose?.();
    } catch (e) {
      alert("Purchase failed: " + (e.message || ""));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editPurchase ? "Edit Purchase Document" : "New Purchase Document"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">Purchase Management records supplier documents without updating inventory stock.</p>

          {/* Supplier + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>

          {/* Item table — only the table scrolls horizontally */}
          <div className="border rounded-lg">
            <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
              <span className="text-sm font-medium">Items</span>
              <Button size="sm" variant="outline" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Click "Add" to add items to this purchase.</p>
            ) : (
              <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs min-w-[1050px]">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-2">Metal</th>
                      <th className="text-left px-2 py-2">Code</th>
                      <th className="text-left px-2 py-2">Item *</th>
                      <th className="text-right px-2 py-2">Gross Wt</th>
                      <th className="text-right px-2 py-2">Less Wt</th>
                      <th className="text-right px-2 py-2">Net Wt</th>
                      <th className="text-left px-2 py-2">Purity</th>
                      <th className="text-right px-2 py-2">Hishob (%)</th>
                      <th className="text-right px-2 py-2">Making Charge (₹/g)</th>
                      <th className="text-right px-2 py-2">Rate/g</th>
                      <th className="text-right px-2 py-2">Jama</th>
                      <th className="text-right px-2 py-2">Total</th>
                      <th className="px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const c = calc.items[i] || { metal_value: 0, total: 0 };
                      const rateMissing = Number(r.rate_per_gram) <= 0;
                      return (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <Select value={r.metal_type} onValueChange={(v) => updateRow(i, "metal_type", v)}>
                              <SelectTrigger className="h-8 w-20 text-xs px-1 capitalize"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gold">Gold</SelectItem>
                                <SelectItem value="silver">Silver</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5"><Input type="text" className="h-8 w-24 text-xs" value={r.item_code} onChange={(e) => updateRow(i, "item_code", e.target.value)} /></td>
                          <td className="px-2 py-1.5"><Input type="text" className="h-8 w-32 text-xs" value={r.item_name} onChange={(e) => updateRow(i, "item_name", e.target.value)} placeholder="Item" /></td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-8 w-20 text-xs text-right" value={r.gross_weight} onChange={(e) => updateRow(i, "gross_weight", e.target.value)} /></td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-8 w-20 text-xs text-right" value={r.stone_weight} onChange={(e) => updateRow(i, "stone_weight", e.target.value)} /></td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-8 w-20 text-xs text-right" value={r.net_weight} onChange={(e) => updateRow(i, "net_weight", e.target.value)} /></td>
                          <td className="px-2 py-1.5">
                            {r._purityMode === "custom" ? (
                              <div className="flex items-center gap-0.5">
                                <Input
                                  type="text"
                                  className="h-8 w-20 text-xs"
                                  value={r._customPurity}
                                  onChange={(e) => updateRow(i, "_customPurity", e.target.value)}
                                  placeholder="e.g. 22K, 925"
                                />
                                <button
                                  onClick={() => updateRow(i, "_purityMode", "master")}
                                  className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                                  title="Back to list"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <Select value={r.purity_display} onValueChange={(v) => updateRow(i, "purity_display", v)}>
                                <SelectTrigger className="h-8 w-24 text-xs px-1"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {purities.filter((p) => p.metal_type === r.metal_type).map((p) => <SelectItem key={p.id} value={p.display_format}>{p.display_format}</SelectItem>)}
                                  <SelectItem value="__custom__">✏️ Custom…</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-8 w-16 text-xs text-right" value={r.wastage} onChange={(e) => updateRow(i, "wastage", e.target.value)} /></td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-8 w-20 text-xs text-right" value={r.making_charge} onChange={(e) => updateRow(i, "making_charge", e.target.value)} /></td>
                          <td className="px-2 py-1.5">
                            <Input type="number" step="0.01" className={`h-8 w-24 text-xs text-right ${r._rateAuto && !rateMissing ? "bg-blue-50" : ""}`} value={r.rate_per_gram} onChange={(e) => updateRow(i, "rate_per_gram", e.target.value)} placeholder="0" />
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-medium whitespace-nowrap">{fmt(c.metal_value)}</td>
                          <td className="px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap">{fmt(c.total)}</td>
                          <td className="px-1 py-1.5"><button onClick={() => removeRow(i)} className="p-1 text-red-600"><Trash2 className="w-3 h-3" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden space-y-3 p-3">
                {rows.map((r, i) => (
                  <PurchaseItemCard key={i} row={r} index={i} calc={calc.items[i]} purities={purities} updateRow={updateRow} removeRow={removeRow} />
                ))}
              </div>
              </>
            )}
          </div>

          {/* Other Charges + GST + Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Other Charges</Label>
              <Input type="number" className="h-8 text-xs" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gstEnabled} onChange={(e) => { setGstEnabled(e.target.checked); if (!e.target.checked) setGstMode("none"); }} /> GST Enabled</label>
              {gstEnabled && (
                <Select value={gstMode} onValueChange={setGstMode}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intra">Intra-State (CGST+SGST)</SelectItem>
                    <SelectItem value="inter">Inter-State (IGST)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Payment / Settlement Mode</Label>
                <Select
                  value={paymentMode}
                  onValueChange={(v) => {
                    setPaymentMode(v);
                    if (v === "gold_settlement" && settlementValue > 0) {
                      setPaidAmount(settlementValue);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="credit_due">Credit / Due</SelectItem>
                    <SelectItem value="gold_settlement">Gold / Metal Settlement</SelectItem>
                    <SelectItem value="old_gold_exchange">Old Gold Exchange</SelectItem>
                    <SelectItem value="old_gold_cash">Old Gold + Cash</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paid / Settled Amount</Label>
                <Input
                  type="number"
                  className="h-8 text-xs font-mono font-semibold"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Dedicated Gold / Metal Settlement Section */}
          {(paymentMode.includes("gold") || paymentMode === "mixed" || Number(goldSettlement.net_weight) > 0) && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-600" />
                  Gold / Metal Settlement Details
                </span>
                <span className="text-[10px] text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded font-medium">
                  Financial Settlement Only · Does not modify inventory stock
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <Label className="text-[11px]">Metal</Label>
                  <Select
                    value={goldSettlement.metal_type}
                    onValueChange={(v) => {
                      const defaultPur = v === "gold" ? "22K" : "925";
                      const pObj = purities.find(p => p.metal_type === v && p.display_format === defaultPur);
                      setGoldSettlement(s => ({
                        ...s,
                        metal_type: v,
                        purity_display: defaultPur,
                        purity_value: pObj ? Number(pObj.purity_value) : (v === "gold" ? 91.67 : 92.5),
                        rate_per_gram: "",
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px]">Purity</Label>
                  <Select
                    value={goldSettlement.purity_display}
                    onValueChange={(v) => {
                      const pObj = purities.find(p => p.metal_type === goldSettlement.metal_type && p.display_format === v);
                      setGoldSettlement(s => ({
                        ...s,
                        purity_display: v,
                        purity_value: pObj ? Number(pObj.purity_value) : s.purity_value,
                        rate_per_gram: "",
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {purities
                        .filter(p => p.metal_type === goldSettlement.metal_type)
                        .map(p => (
                          <SelectItem key={p.id} value={p.display_format}>{p.display_format}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px]">Gross Weight (g)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    className="h-8 text-xs font-mono"
                    value={goldSettlement.gross_weight}
                    onChange={(e) => setGoldSettlement(s => ({ ...s, gross_weight: e.target.value }))}
                    placeholder="0.000"
                  />
                </div>

                <div>
                  <Label className="text-[11px]">Net Weight (g) *</Label>
                  <Input
                    type="number"
                    step="0.001"
                    className="h-8 text-xs font-mono font-semibold"
                    value={goldSettlement.net_weight}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGoldSettlement(s => ({ ...s, net_weight: val }));
                      if (paymentMode === "gold_settlement") {
                        const net = Number(val) || 0;
                        const calcVal = Math.round(net * effectiveSettlementRate);
                        setPaidAmount(calcVal);
                      }
                    }}
                    placeholder="0.000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <Label className="text-[11px]">Fine Weight (g)</Label>
                  <div className="h-8 px-2.5 rounded-md border bg-muted/50 flex items-center font-mono font-bold text-amber-950">
                    {fmtNum(settlementFineWeight)} g
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">Rate / Gram (₹)</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs font-mono"
                    value={goldSettlement.rate_per_gram || (effectiveSettlementRate ? String(effectiveSettlementRate) : "")}
                    onChange={(e) => {
                      const r = e.target.value;
                      setGoldSettlement(s => ({ ...s, rate_per_gram: r }));
                      if (paymentMode === "gold_settlement") {
                        const net = Number(goldSettlement.net_weight) || 0;
                        setPaidAmount(Math.round(net * (Number(r) || effectiveSettlementRate)));
                      }
                    }}
                    placeholder={`e.g. ${effectiveSettlementRate}`}
                  />
                </div>

                <div>
                  <Label className="text-[11px]">Settlement Value</Label>
                  <div className="h-8 px-2.5 rounded-md border bg-emerald-50 border-emerald-200 flex items-center justify-between font-mono font-bold text-emerald-800">
                    <span>{fmt(settlementValue)}</span>
                    {paymentMode === "gold_settlement" && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-6 text-[10px] px-1.5 text-emerald-700 hover:text-emerald-900"
                        onClick={() => setPaidAmount(settlementValue)}
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">HUID / Ref / Item</Label>
                  <Input
                    type="text"
                    className="h-8 text-xs"
                    value={goldSettlement.reference}
                    onChange={(e) => setGoldSettlement(s => ({ ...s, reference: e.target.value }))}
                    placeholder="e.g. HUID / 20g Gold Bar"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[11px]">Settlement Notes / Exchange Description</Label>
                <Input
                  type="text"
                  className="h-8 text-xs"
                  value={goldSettlement.notes}
                  onChange={(e) => setGoldSettlement(s => ({ ...s, notes: e.target.value }))}
                  placeholder="e.g. 20g 22K gold used as settlement in exchange for jewellery received"
                />
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(calc.subtotal)}</span></div>
              {Number(otherCharges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Other Charges</span><span>{fmt(otherCharges)}</span></div>}
              {gstEnabled && gstMode === "intra" && (<>
                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{fmt(calc.cgst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{fmt(calc.sgst)}</span></div>
              </>)}
              {gstEnabled && gstMode === "inter" && (
                <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{fmt(calc.igst)}</span></div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{fmt(calc.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid Amount</span><span>{fmt(paidAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span className="text-red-600">{fmt(due)}</span></div>
            </div>
          </div>
          <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={finalize} disabled={saving}>{saving ? "Processing..." : (editPurchase ? "Save" : "Finalize Purchase")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}