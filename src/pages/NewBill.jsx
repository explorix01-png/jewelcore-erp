import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { PageHeader, Spinner, Badge } from "@/components/ui/erp";
import { calcBill, calcChargeBreakdown, fmt, fmtNum, sortPuritiesDescending } from "@/lib/billCalc";
import { applyRowChange, findRate, puritiesForMetal, repriceRows } from "@/lib/billRows";
import { deriveBillPaymentMode } from "@/lib/paymentModes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Trash2, Check, Receipt, Scan, Printer, Eye, Calendar, AlertCircle } from "lucide-react";
import PaymentSection from "@/components/billing/PaymentSection";
import BarcodeScanner from "@/components/billing/BarcodeScanner";
import { printInvoice } from "@/lib/printInvoice";
import BillViewDialog from "@/components/billing/BillViewDialog";
import WhatsAppButton from "@/components/billing/WhatsAppButton";
import { useUsbScanner } from "@/hooks/useUsbScanner";
import BillItemCard from "@/components/billing/BillItemCard";

const formatAadhaar = (v) => { const d = (v || "").replace(/\D/g, "").slice(0, 12); return d.replace(/(.{4})/g, "$1 ").trim(); };
const formatPan = (v) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

export default function NewBill() {
  const t = useT();
  const { can, role } = usePermission();
  const canOverrideRate = can("rates", "update");
  // Only an administrator may type a different invoice number (the server enforces this too).
  const canEditInvoiceNumber = role === "admin";

  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [gstConfigs, setGstConfigs] = useState([]);
  const [rates, setRates] = useState([]);
  const [purities, setPurities] = useState([]);
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState("inventory");
  const [custQ, setCustQ] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [barcodeQ, setBarcodeQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [payments, setPayments] = useState([{ mode: "cash", amount: "" }]);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("cash");
  const [useOldGold, setUseOldGold] = useState(false);
  const [creditDue, setCreditDue] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [oldGold, setOldGold] = useState({
    item: "",
    metal: "gold",
    purity: "",
    purityValue: 0,
    grossWeight: 0,
    deductionWeight: 0,
    ratePerGram: 0,
    huid: "",
    barcode: "",
    notes: ""
  });
  const [paymentNotes, setPaymentNotes] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveRateInfo, setEffectiveRateInfo] = useState(null);
  const [customRateOverride, setCustomRateOverride] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstMode, setGstMode] = useState("intra");
  const [otherCharges, setOtherCharges] = useState(0);
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [saving, setSaving] = useState(false);
  // Invoice number: `null` means "automatic" (the form shows the next number as a preview);
  // a string means the admin typed their own, which is then sent to the server.
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(null);
  const [lastBill, setLastBill] = useState(null);
  const [lastBillItems, setLastBillItems] = useState([]);
  const [viewLastBill, setViewLastBill] = useState(false);

  // Preview only — the server picks the real number when the bill is saved.
  const refreshNextInvoiceNumber = async () => {
    try {
      const res = await base44.functions.invoke("getNextBillNumber", {});
      if (res.data?.bill_number) setNextInvoiceNumber(res.data.bill_number);
    } catch (e) {
      console.error("Could not load the next invoice number:", e);
    }
  };

  useEffect(() => {
    refreshNextInvoiceNumber();
    (async () => {
      const [cust, inv, gst, s, purs] = await Promise.all([
        base44.entities.Customer.list("-created_date", 200),
        base44.entities.InventoryItem.filter({ is_archived: false }, "-updated_date", 500),
        base44.entities.GSTConfig.filter({ is_active: true }, "-created_date", 20),
        base44.entities.ShopSettings.list("-created_date", 1),
        base44.entities.PurityMaster.filter({ is_active: true }, "purity_value", 100).catch(() => []),
      ]);
      setCustomers(cust);
      setInventory(inv);
      setGstConfigs(gst);
      setSettings(s[0] || null);
      if (s[0]) setGstEnabled(s[0].gst_enabled !== false);
      const sortedPurs = sortPuritiesDescending(purs, "gold");
      setPurities(sortedPurs);

      // Resolve effective rates for today's bill date
      try {
        const rateRes = await base44.functions.invoke("getEffectiveRates", { date: new Date().toISOString().slice(0, 10) });
        if (rateRes.data?.success && rateRes.data.rates) {
          setRates(rateRes.data.rates);
          setEffectiveRateInfo({
            date: rateRes.data.query_date,
            gold24k: rateRes.data.gold_24k_rate,
            silver: rateRes.data.silver_rate,
            effectiveDate: rateRes.data.gold_effective_date,
          });
        }
      } catch (rateErr) {
        // Fallback to active rates
        const rt = await base44.entities.RateHistory.filter({ is_active: true }, "-effective_date", 50);
        setRates(rt);
      }
    })();
  }, []);

  const activeCustomers = customers.filter((c) => !c.is_deleted);
  const custMatches = useMemo(() => {
    const x = custQ.toLowerCase();
    return activeCustomers.filter((c) => !x || c.name?.toLowerCase().includes(x) || c.mobile?.includes(x)).slice(0, 6);
  }, [custQ, activeCustomers]);

  const itemMatches = useMemo(() => {
    const x = itemQ.toLowerCase();
    return inventory.filter((i) => Number(i.quantity) > 0 && (!x || i.item_name?.toLowerCase().includes(x) || i.item_code?.toLowerCase().includes(x) || i.huid?.toLowerCase().includes(x))).slice(0, 6);
  }, [itemQ, inventory]);

  const [scanFeedback, setScanFeedback] = useState(null);

  useEffect(() => {
    if (!scanFeedback) return;
    const t = setTimeout(() => setScanFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [scanFeedback]);

  // Resolved rates (getEffectiveRates) carry no is_active flag, so the lookup
  // only skips rates explicitly marked inactive.
  const rateFor = (metalType, purityDisplay) => findRate(rates, metalType, purityDisplay);

  const addItem = (inv) => {
    if (!inv) return;
    const availableStock = Number(inv.quantity) || 0;
    if (availableStock <= 0) {
      setScanFeedback({ type: "error", text: `⚠️ Item "${inv.item_name}" is out of stock.` });
      return;
    }

    // Check how many units of this inventory piece are already added to the bill
    const alreadyAddedQty = rows
      .filter((r) => r._invId === inv.id || (r.item_id && r.item_id === inv.item_id))
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

    if (alreadyAddedQty >= availableStock) {
      setScanFeedback({
        type: "error",
        text: `⚠️ Cannot add more: all available stock (${availableStock} pcs) of "${inv.item_name}" is already in this bill.`,
      });
      return;
    }

    const rate = rateFor(inv.metal_type, inv.purity_display);
    // Per-piece weights. Less weight is whatever separates gross from net, so
    // "Gross − Less = Net" already holds for the stocked piece and stays true
    // as the user edits either weight.
    const perPieceDivisor = Number(inv.quantity) > 0 ? Number(inv.quantity) : 1;
    const grossPerPiece = Number(inv.gross_weight) / perPieceDivisor;
    const netPerPiece = Number(inv.net_weight) / perPieceDivisor;
    setRows((prev) => [...prev, {
      item_id: inv.item_id, item_name: inv.item_name, item_code: inv.item_code, huid: inv.huid || "", category_name: inv.category_name,
      metal_type: inv.metal_type, purity_display: inv.purity_display, hsn: inv.hsn,
      quantity: 1,
      gross_weight: grossPerPiece,
      stone_weight: Math.max(0, Math.round((grossPerPiece - netPerPiece) * 1000) / 1000),
      net_weight: netPerPiece,
      wastage: inv.wastage || 0,
      rate_per_gram: rate, making_charge: settings?.making_charge_default || 8, making_charge_type: settings?.making_charge_type_default || "percentage",
      hallmarking_charge: 0, discount: 0, gst_rate: (gstConfigs[0]?.gst_rate) || 3, _invId: inv.id, _stock: inv.quantity,
    }]);
    setItemQ("");
    setBarcodeQ("");
    setScanFeedback({ type: "success", text: `✓ Added: ${inv.item_name} (${inv.item_code || inv.barcode})` });
  };

  const handleBarcodeScan = async (code) => {
    const cleanCode = (code || "").trim();
    if (!cleanCode) return;

    let item = inventory.find((i) => i.barcode === cleanCode || i.item_code === cleanCode || i.huid === cleanCode);
    if (!item) {
      // Query backend if not in currently loaded 500 items
      try {
        let results = await base44.entities.InventoryItem.filter({ barcode: cleanCode, is_archived: false }, "-updated_date", 1);
        if (!results || results.length === 0) {
          results = await base44.entities.InventoryItem.filter({ item_code: cleanCode, is_archived: false }, "-updated_date", 1);
        }
        if (!results || results.length === 0) {
          results = await base44.entities.InventoryItem.filter({ huid: cleanCode, is_archived: false }, "-updated_date", 1);
        }
        if (results && results.length > 0) {
          item = results[0];
          setInventory((prev) => [item, ...prev.filter((x) => x.id !== item.id)]);
        }
      } catch (err) {
        console.error("Backend barcode lookup error in billing:", err);
      }
    }

    if (!item) {
      setScanFeedback({ type: "error", text: `⚠️ Barcode "${cleanCode}" not found in inventory` });
      return;
    }

    if (Number(item.quantity) <= 0) {
      setScanFeedback({ type: "error", text: `⚠️ Item "${item.item_name}" is out of stock` });
      return;
    }

    addItem(item);
  };

  useUsbScanner((code) => {
    handleBarcodeScan(code);
  });

  const addManualRow = () => {
    setRows((prev) => [...prev, {
      item_name: "", item_code: "", huid: "", category_name: "", metal_type: "gold", purity_display: "", hsn: "",
      // Numeric inputs start blank (not 0) so the user can type straight away;
      // calcBill/finalizeBill coerce "" to 0.
      quantity: 1, gross_weight: "", stone_weight: "", net_weight: "", wastage: "", wastage_type: "percentage", purity_value: "",
      // Manual jewellery: the rate fills in when a purity is picked. Gold/silver
      // purchases have no purity picker, so they start from the base rate.
      rate_per_gram: mode === "customer_purchase" ? (rateFor("gold", "") || "") : "",
      making_charge: settings?.making_charge_default || 8,
      making_charge_type: settings?.making_charge_type_default || "percentage",
      hallmarking_charge: "", discount: "", gst_rate: (gstConfigs[0]?.gst_rate) || 3,
    }]);
  };

  const updateRow = (i, field, val) => setRows((prev) => prev.map((r, idx) => (
    idx === i ? applyRowChange(r, field, val, { rates, purities, mode }) : r
  )));
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const calc = useMemo(() => calcBill(rows, Number(billDiscount) || 0, gstConfigs[0], { gst_enabled: gstEnabled, gst_mode: gstMode, other_charges: Number(otherCharges) || 0 }), [rows, billDiscount, gstConfigs, gstEnabled, gstMode, otherCharges]);

  const charges = useMemo(() => calcChargeBreakdown(calc.items), [calc.items]);

  const exchangeValue = useMemo(() => {
    const netWt = Math.max(0, Number(oldGold.grossWeight) - Number(oldGold.deductionWeight));
    return netWt * Number(oldGold.ratePerGram);
  }, [oldGold.grossWeight, oldGold.deductionWeight, oldGold.ratePerGram]);

  const computedPaid = useMemo(() => {
    if (creditDue) return 0;
    const methodSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return methodSum + (useOldGold ? Number(exchangeValue) || 0 : 0);
  }, [payments, creditDue, useOldGold, exchangeValue]);

  const due = Math.max(0, calc.totalAmount - computedPaid);

  const paymentDetailsStr = useMemo(() => {
    const parts = [];
    if (paymentRef) parts.push(`Ref: ${paymentRef}`);
    if (useOldGold) {
      const netWt = Math.max(0, Number(oldGold.grossWeight) - Number(oldGold.deductionWeight));
      parts.push(`Old Gold: ${oldGold.item || "—"} | ${oldGold.metal} ${oldGold.purity} | Net ${netWt}g @ ${oldGold.ratePerGram}/g = ₹${exchangeValue}`);
    }
    if (payments.length > 0) {
      const pStr = payments.filter(p => Number(p.amount) > 0).map(p => `${p.mode}=₹${p.amount}`).join(", ");
      if (pStr) parts.push(pStr);
    }
    if (paymentNotes) parts.push(paymentNotes);
    return parts.join(" | ");
  }, [paymentRef, oldGold, exchangeValue, payments, paymentNotes, useOldGold]);

  const paymentModeForBackend = deriveBillPaymentMode({ creditDue, useOldGold, payments });
  const paymentComponentsForBackend = creditDue ? [] : payments.filter(p => Number(p.amount) > 0).map(p => ({ mode: p.mode, amount: Number(p.amount) }));

  const createCustomer = async (custData) => {
    const dup = activeCustomers.find((c) => c.mobile && c.mobile === custData.mobile);
    if (dup) { setCustomerId(dup.id); setNewCustOpen(false); return; }
    try {
      const res = await base44.functions.invoke("manageCustomer", {
        action: "create", data: custData,
      });
      if (res.data?.success) {
        setCustomers([res.data.customer, ...customers]);
        setCustomerId(res.data.id);
      }
    } catch (e) { alert("Failed to create customer: " + e.message); }
    setNewCustOpen(false);
  };

  const [rateDateError, setRateDateError] = useState(null);

  const handleBillDateChange = async (newDate) => {
    setBillDate(newDate);
    setRateDateError(null);
    try {
      const rateRes = await base44.functions.invoke("getEffectiveRates", { date: newDate });
      if (rateRes.data?.error || !rateRes.data?.success) {
        setRateDateError(rateRes.data?.error || "No rate is configured for the selected date.");
        setEffectiveRateInfo(null);
        return;
      }
      if (rateRes.data?.rates) {
        const newRates = rateRes.data.rates;
        setRates(newRates);
        setEffectiveRateInfo({
          date: rateRes.data.query_date,
          gold24k: rateRes.data.gold_24k_rate,
          silver: rateRes.data.silver_rate,
          effectiveDate: rateRes.data.gold_effective_date,
        });

        // Update rows with new effective rates if not custom override
        if (!customRateOverride) {
          setRows((prevRows) => repriceRows(prevRows, newRates, mode));
        }

        // Update oldGold rate if purity selected
        if (oldGold.purity) {
          const matchingRate = newRates.find((r) => r.metal_type === (oldGold.metal || "gold") && (r.purity_display === oldGold.purity || r.purity_name === oldGold.purity));
          if (matchingRate) {
            setOldGold((prev) => ({ ...prev, ratePerGram: Number(matchingRate.rate_per_gram) }));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load effective rates for date:", err);
      setRateDateError(err.response?.data?.error || err.message || "No rate is configured for the selected date.");
      setEffectiveRateInfo(null);
    }
  };

  const handleRateOverrideToggle = (checked) => {
    if (checked && !canOverrideRate) {
      alert("Permission denied: Only authorized administrators can override rates.");
      return;
    }
    setCustomRateOverride(checked);
  };

  const finalize = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      alert("Financial Safety Lock Active: Cannot finalize bill while offline. Live database connection required to prevent duplicate invoices.");
      return;
    }
    if (rateDateError && !customRateOverride) {
      alert(`Cannot finalize bill: ${rateDateError} Please select an active rate date or enable Custom Rate Override.`);
      return;
    }
    if (!customerId) { alert(t("billing.selectCustomer")); return; }
    if (rows.length === 0) { alert(t("billing.addAtLeastOne")); return; }
    if (mode === "inventory") {
      for (const r of rows) {
        const inv = inventory.find((i) => i.id === r._invId);
        if (!inv || Number(inv.quantity) < Number(r.quantity)) { alert(`${t("billing.insufficientStock")} ${r.item_name}`); return; }
      }
    } else {
      for (const r of rows) {
        if (!r.item_name || Number(r.net_weight) <= 0) { alert("Each manual item needs a name and net weight > 0"); return; }
      }
    }
    if (computedPaid < 0) { alert(t("billing.invalidPaid")); return; }
    if (computedPaid > calc.totalAmount) {
      alert(t("billing.overpayWarning")); return;
    }
    const isGoldExchangeActive = useOldGold || selectedPaymentMode === "gold_exchange" || selectedPaymentMode === "old_gold_cash";
    if (isGoldExchangeActive) {
      const gw = Number(oldGold.grossWeight);
      const dw = Number(oldGold.deductionWeight);
      const rt = Number(oldGold.ratePerGram);
      if (gw <= 0) { alert(t("billing.oldGoldErrGross") || "Gross weight must be greater than zero"); return; }
      if (dw < 0) { alert(t("billing.oldGoldErrDeductionNeg") || "Less weight cannot be negative"); return; }
      if (dw > gw) { alert(t("billing.oldGoldErrDeductionExceed") || "Less weight cannot exceed gross weight"); return; }
      if (rt <= 0) { alert(t("billing.oldGoldErrRate") || "Rate per gram must be greater than zero"); return; }
    }
    setSaving(true);
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const goldExchangePayload = isGoldExchangeActive ? {
      item_type: oldGold.item || "Customer Gold Exchange",
      item: oldGold.item || "Customer Gold Exchange",
      metal: oldGold.metal || "gold",
      purity: oldGold.purity,
      purity_value: Number(oldGold.purityValue) || 0,
      gross_weight: Number(oldGold.grossWeight) || 0,
      less_weight: Number(oldGold.deductionWeight) || 0,
      net_weight: Math.max(0, Number(oldGold.grossWeight) - (Number(oldGold.deductionWeight) || 0)),
      fine_weight: (Math.max(0, Number(oldGold.grossWeight) - (Number(oldGold.deductionWeight) || 0)) * (Number(oldGold.purityValue) || 0)) / 100,
      rate_per_gram: Number(oldGold.ratePerGram) || 0,
      gold_value: Number(exchangeValue) || 0,
      huid: oldGold.huid || "",
      barcode: oldGold.barcode || "",
      notes: oldGold.notes || "",
    } : null;

    try {
      const res = await base44.functions.invoke("finalizeBill", {
        customer_id: customerId,
        bill_source: mode,
        bill_number: invoiceNumber && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
        bill_date: billDate,
        gst_enabled: gstEnabled,
        gst_mode: gstMode,
        custom_rate_override: customRateOverride,
        operation_id: operationId,
        items: rows.map((r) => ({
          inventory_id: r._invId, item_id: r.item_id, item_name: r.item_name, item_code: r.item_code,
          huid: r.huid || "",
          category_name: r.category_name, metal_type: r.metal_type, purity_display: r.purity_display,
          hsn: r.hsn, quantity: Number(r.quantity), gross_weight: Number(r.gross_weight),
          stone_weight: Number(r.stone_weight), net_weight: Number(r.net_weight), wastage: Number(r.wastage),
          wastage_type: r.wastage_type, purity_value: Number(r.purity_value) || 0,
          rate_per_gram: Number(r.rate_per_gram), making_charge: Number(r.making_charge),
          making_charge_type: r.making_charge_type, hallmarking_charge: Number(r.hallmarking_charge),
          discount: Number(r.discount), gst_rate: Number(r.gst_rate),
        })),
        bill_discount: Number(billDiscount) || 0,
        other_charges: Number(otherCharges) || 0,
        aadhaar_number: aadhaarNumber,
        pan_number: panNumber,
        paid_amount: computedPaid,
        payment_mode: paymentModeForBackend,
        payment_components: paymentComponentsForBackend,
        payment_reference: paymentRef,
        payment_details: paymentDetailsStr,
        gold_exchange: goldExchangePayload,
        notes: billNotes,
      });
      const result = res.data;
      if (!result.success) { alert(result.error || "Bill failed"); return; }
      // Load the full bill + items for printing
      // Fetch by id, not by number: a deleted bill can share a number with the new one.
      const [fullBill, inv] = await Promise.all([
        base44.entities.Bill.get(result.bill_id),
        base44.entities.InventoryItem.filter({ is_archived: false }, "-updated_date", 500),
      ]);
      const billItems = await base44.entities.BillItem.filter({ bill_id: fullBill.id }, "-created_date", 100);
      setLastBill(fullBill);
      setLastBillItems(billItems);
      setRows([]); setCustomerId(""); setBillDiscount(0); setCustQ("");
      setPayments([{ mode: "cash", amount: "" }]); setSelectedPaymentMode("cash"); setUseOldGold(false); setCreditDue(false);
      setPaymentRef(""); setOldGold({ item: "", metal: "gold", purity: "", grossWeight: 0, deductionWeight: 0, ratePerGram: 0 });
      setPaymentNotes(""); setCustomRateOverride(false); setOtherCharges(0);
      setAadhaarNumber(""); setPanNumber(""); setBillNotes("");
      setInvoiceNumber(null); refreshNextInvoiceNumber();
      setInventory(inv);
    } catch (e) {
      alert("Bill failed: " + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  if (!settings && inventory.length === 0 && customers.length === 0) return <Spinner />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
            <span>Point of Sale Terminal</span>
          </span>
        }
        title={t("billing.title")}
        subtitle="Generate GST or non-GST jewellery tax invoices with barcode lookup, instant purity rates, stone deductions, and split settlements."
      />

      <div className="p-1 rounded-xl bg-card border border-border/80 shadow-2xs inline-block">
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid grid-cols-3 w-full max-w-lg bg-muted/60">
            <TabsTrigger value="inventory" className="text-xs font-semibold">{t("billing.inventoryMode")}</TabsTrigger>
            <TabsTrigger value="manual" className="text-xs font-semibold">{t("billing.manualMode")}</TabsTrigger>
            <TabsTrigger value="customer_purchase" className="text-xs font-semibold">{t("billing.customerPurchaseMode")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <div className="rounded-xl border bg-card p-4">
            <Label className="mb-2 block">{t("billing.customer")}</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder={t("billing.searchCustomer")} className="pl-9" />
            </div>
            {custQ && (
              <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto">
                {custMatches.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t("billing.noMatch")} <button className="text-amber-700 underline" onClick={() => setNewCustOpen(true)}>{t("billing.createNew")}</button></p>
                ) : custMatches.map((c) => (
                  <button key={c.id} onClick={() => { setCustomerId(c.id); setCustQ(c.name); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${customerId === c.id ? "bg-amber-50" : ""}`}>
                    <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">{c.mobile || ""}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              {customerId && <Badge variant="success">{t("billing.selected")}</Badge>}
              <Button size="sm" variant="outline" onClick={() => setNewCustOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> {t("billing.createNew")}</Button>
            </div>
          </div>

          {/* Item entry */}
          {mode === "inventory" ? (
            <div className="rounded-xl border bg-card p-4">
              <Label className="mb-2 block">{t("billing.addItem")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder={t("billing.searchItems")} className="pl-9" />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Scan className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={barcodeQ}
                      onChange={(e) => setBarcodeQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && barcodeQ.trim()) {
                          e.preventDefault();
                          handleBarcodeScan(barcodeQ.trim());
                        }
                      }}
                      placeholder={t("billing.searchBarcode")}
                      className="pl-9"
                      data-barcode-input="true"
                    />
                  </div>
                  <BarcodeScanner inventory={inventory} onAddItem={addItem} />
                </div>
              </div>
              {scanFeedback && (
                <div className={`p-2 rounded-lg text-xs font-medium flex items-center justify-between gap-2 mb-2 ${
                  scanFeedback.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  <span>{scanFeedback.text}</span>
                  <button onClick={() => setScanFeedback(null)} className="opacity-70 hover:opacity-100 text-xs font-bold">✕</button>
                </div>
              )}
              {itemQ && (
                <div className="mt-2 border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {itemMatches.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{t("billing.noInStockMatch")}</p> :
                    itemMatches.map((i) => (
                      <button key={i.id} onClick={() => addItem(i)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-2">
                        <span className="min-w-0"><span className="font-medium truncate inline-block max-w-full">{i.item_name}</span> <span className="text-muted-foreground">{i.purity_display}</span></span>
                        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{i.quantity} pcs · {fmtNum(i.net_weight)}g</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <Label>{mode === "customer_purchase" ? t("billing.customerPurchaseDesc") : t("billing.manualItemDesc")}</Label>
                <Button size="sm" variant="outline" onClick={addManualRow}><Plus className="w-3.5 h-3.5 mr-1" /> {t("common.add")}</Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {mode === "customer_purchase" ? t("billing.customerPurchaseNote") : t("billing.manualNoStock")}
              </p>
            </div>
          )}

          {/* Bill items */}
          {rows.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs min-w-[1050px]">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">{t("billing.item")}</th>
                      <th className="px-2 py-2">{t("billing.qty")}</th>
                      <th className="px-2 py-2">{t("billing.grossWt")}</th>
                      <th className="px-2 py-2">{t("billing.stoneWt")}</th>
                      <th className="px-2 py-2">{t("billing.netWt")}</th>
                      <th className="px-2 py-2">{t("billing.rate")}</th>
                      <th className="px-2 py-2">{t("billing.making")}</th>
                      {mode === "customer_purchase" && <th className="px-2 py-2">{t("billing.wastage")}</th>}
                      <th className="px-2 py-2">{t("billing.hallmarkingCharge")}</th>
                      <th className="px-2 py-2">{t("billing.disc")}</th>
                      <th className="px-2 py-2">{t("common.total")}</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const c = calc.items[i] || { total: 0 };
                      const lineNetTotal = ((Number(r.net_weight) || 0) * (Number(r.quantity) || 0)).toFixed(3);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            {mode === "inventory" ? (
                              <><p className="font-medium">{r.item_name}</p>{r.huid && <p className="text-[10px] text-blue-700 font-mono">HUID: {r.huid}</p>}<p className="text-muted-foreground">{r.purity_display} · {r.hsn || "—"}</p></>
                            ) : (
                              <Input type="text" className="h-7 w-36 text-xs" value={r.item_name} onChange={(e) => updateRow(i, "item_name", e.target.value)} placeholder={t("billing.item")} />
                            )}
                            {mode === "manual" && (
                              <Input type="text" className="h-6 w-36 text-[10px] mt-1 font-mono" value={r.huid || ""} onChange={(e) => updateRow(i, "huid", e.target.value)} placeholder={t("inventory.huidPlaceholder")} aria-label={t("inventory.huid")} />
                            )}
                            {mode === "manual" && (
                              <div className="flex gap-1 mt-1">
                                <Select value={r.metal_type || "gold"} onValueChange={(v) => updateRow(i, "metal_type", v)}>
                                  <SelectTrigger className="h-6 w-20 text-[10px] px-1" aria-label={t("billing.metalType")}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="gold">Gold</SelectItem>
                                    <SelectItem value="silver">Silver</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select value={r.purity_display || ""} onValueChange={(v) => updateRow(i, "purity_display", v)}>
                                  <SelectTrigger className="h-6 w-20 text-[10px] px-1" aria-label={t("billing.purity")}><SelectValue placeholder={t("billing.purity")} /></SelectTrigger>
                                  <SelectContent>
                                    {puritiesForMetal(purities, r.metal_type).map((p) => (
                                      <SelectItem key={p.id} value={p.display_format || p.name}>{p.display_format || p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {mode === "customer_purchase" && (
                              <div className="flex gap-1 mt-1">
                                <Select value={r.metal_type || "gold"} onValueChange={(v) => updateRow(i, "metal_type", v)}>
                                  <SelectTrigger className="h-6 w-20 text-[10px] px-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="gold">Gold</SelectItem>
                                    <SelectItem value="silver">Silver</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input type="number" className="h-6 w-14 text-xs" value={r.purity_value} onChange={(e) => updateRow(i, "purity_value", e.target.value)} placeholder="Purity %" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" className="h-7 w-16 text-xs" value={r.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} />
                            {mode === "inventory" && Number(r.quantity) > Number(r._stock) && (
                              <p className="text-[10px] text-red-600 mt-0.5 whitespace-nowrap">Stock: {r._stock}</p>
                            )}
                          </td>
                          <td className="px-2 py-2"><Input type="number" step="0.001" min="0" className="h-7 w-20 text-xs" value={r.gross_weight} onChange={(e) => updateRow(i, "gross_weight", e.target.value)} /></td>
                          <td className="px-2 py-2"><Input type="number" step="0.001" min="0" className="h-7 w-20 text-xs" value={r.stone_weight} onChange={(e) => updateRow(i, "stone_weight", e.target.value)} /></td>
                          <td className="px-2 py-2">
                            <Input type="number" readOnly tabIndex={-1} title="Net Wt = Gross Wt − Less Wt (calculated)" className="h-7 w-20 text-xs font-semibold bg-muted/60" value={r.net_weight} />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Σ {lineNetTotal}g</p>
                          </td>
                          <td className="px-2 py-2"><Input type="number" step="0.01" min="0" className="h-7 w-24 text-xs" value={r.rate_per_gram} onChange={(e) => updateRow(i, "rate_per_gram", e.target.value)} /></td>
                          <td className="px-2 py-2">
                            <Input type="number" className="h-7 w-16 text-xs" value={r.making_charge} onChange={(e) => updateRow(i, "making_charge", e.target.value)} />
                            <Select value={r.making_charge_type || "percentage"} onValueChange={(v) => updateRow(i, "making_charge_type", v)}>
                              <SelectTrigger className="h-6 w-16 text-[10px] mt-0.5 px-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">%</SelectItem>
                                <SelectItem value="fixed">₹</SelectItem>
                                <SelectItem value="per_gram">₹/g</SelectItem>
                              </SelectContent>
                            </Select>
                            </td>
                            {mode === "customer_purchase" && (
                            <td className="px-2 py-2">
                              <Input type="number" className="h-7 w-16 text-xs" value={r.wastage} onChange={(e) => updateRow(i, "wastage", e.target.value)} />
                              <Select value={r.wastage_type || "percentage"} onValueChange={(v) => updateRow(i, "wastage_type", v)}>
                                <SelectTrigger className="h-6 w-16 text-[10px] mt-0.5 px-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">%</SelectItem>
                                  <SelectItem value="fixed_weight">g</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            )}
                            <td className="px-2 py-2"><Input type="number" className="h-7 w-20 text-xs" value={r.hallmarking_charge} onChange={(e) => updateRow(i, "hallmarking_charge", e.target.value)} /></td>
                          <td className="px-2 py-2"><Input type="number" className="h-7 w-20 text-xs" value={r.discount} onChange={(e) => updateRow(i, "discount", e.target.value)} /></td>
                          <td className="px-2 py-2 font-semibold">{fmt(c.total)}</td>
                          <td className="px-2 py-2"><button onClick={() => removeRow(i)} className="p-1 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden divide-y">
                {rows.map((r, i) => (
                  <BillItemCard key={i} row={r} index={i} mode={mode} calc={calc.items[i]} t={t} updateRow={updateRow} removeRow={removeRow} purities={purities} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold">{t("billing.billSummary")}</h3>
              <Badge variant={gstEnabled && gstMode !== "none" ? "info" : "default"}>
                {gstEnabled && gstMode !== "none" ? t("invoice.gstBill") : t("invoice.simpleBill")}
              </Badge>
            </div>
            {/* Invoice number: automatic by default; administrators can type their own */}
            <div className="mb-3">
              <Label className="text-xs">{t("billing.invoiceNo")}</Label>
              {canEditInvoiceNumber ? (
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-xs font-mono"
                    value={invoiceNumber ?? nextInvoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    onBlur={() => { if (invoiceNumber !== null && invoiceNumber.trim() === "") setInvoiceNumber(null); }}
                    maxLength={30}
                    data-testid="invoice-number-input"
                    aria-label={t("billing.invoiceNo")}
                  />
                  {invoiceNumber !== null && (
                    <button
                      type="button"
                      onClick={() => setInvoiceNumber(null)}
                      className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                      data-testid="invoice-number-reset"
                    >
                      {t("billing.invoiceNoAuto")}
                    </button>
                  )}
                </div>
              ) : (
                <p className="font-mono text-sm h-8 flex items-center" data-testid="invoice-number-readonly">{nextInvoiceNumber || "—"}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {invoiceNumber === null ? t("billing.invoiceNoHintAuto") : t("billing.invoiceNoHintCustom")}
              </p>
            </div>
            {/* Custom bill date + rate override */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <div>
                <Label className="text-xs">{t("billing.billDate")}</Label>
                <Input type="date" className="h-8 text-xs" value={billDate} onChange={(e) => handleBillDateChange(e.target.value)} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={customRateOverride} onChange={(e) => handleRateOverrideToggle(e.target.checked)} className="rounded border-input" />
                  {t("billing.customRateOverride")}
                </label>
              </div>
            </div>
            {rateDateError && (
              <div className="text-[11px] p-2.5 bg-red-50 rounded-lg border border-red-200 text-red-800 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <div>
                  <span className="font-semibold block">{rateDateError}</span>
                  <span className="text-[10px] text-red-700">Please select an active rate date or enable Custom Rate Override.</span>
                </div>
              </div>
            )}
            {effectiveRateInfo && (
              <div className="text-[11px] p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-900 mb-3">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-700" />
                    <span>Rates for Bill Date ({billDate}):</span>
                  </span>
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded">Auto Snapshot</span>
                </div>
                <div className="text-[10px] mt-1 text-amber-800 flex flex-wrap gap-x-2">
                  <span>Gold 24K: <strong>₹{effectiveRateInfo.gold24k ? Number(effectiveRateInfo.gold24k).toLocaleString("en-IN") : "—"}/g</strong></span>
                  <span>·</span>
                  <span>Silver: <strong>₹{effectiveRateInfo.silver ? Number(effectiveRateInfo.silver).toLocaleString("en-IN") : "—"}/g</strong></span>
                  {effectiveRateInfo.effectiveDate && (
                    <span className="text-muted-foreground">(active since {new Date(effectiveRateInfo.effectiveDate).toLocaleDateString()})</span>
                  )}
                </div>
              </div>
            )}
            {customRateOverride && (
              <p className="text-[10px] text-amber-700 mb-2 -mt-1">{t("billing.customRateHint")}</p>
            )}
            <div className="space-y-1.5 text-sm">
              {rows.length > 0 && (
                <div className="space-y-1 pb-2 mb-1 border-b border-dashed" data-testid="charge-breakdown">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.metalValue")}</span><span>{fmt(charges.metalValue)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("billing.makingCharges")}{charges.makingLabel ? ` (${charges.makingLabel})` : ""}</span>
                    <span>{fmt(charges.makingAmount)}</span>
                  </div>
                  {!charges.makingLabel && charges.makingRows.length > 1 && charges.makingRows.map((m, idx) => (
                    <div key={idx} className="flex justify-between gap-2 pl-3 text-[11px] text-muted-foreground">
                      <span className="truncate">{m.name || `${t("billing.item")} ${idx + 1}`} · {m.label}</span>
                      <span className="shrink-0">{fmt(m.amount)}</span>
                    </div>
                  ))}
                  {charges.wastageAmount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.wastageCharges")}</span><span>{fmt(charges.wastageAmount)}</span></div>
                  )}
                  {charges.hallmarkingAmount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.hallmarking")}</span><span>{fmt(charges.hallmarkingAmount)}</span></div>
                  )}
                  {charges.itemDiscount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.itemDiscount")}</span><span>− {fmt(charges.itemDiscount)}</span></div>
                  )}
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.subtotal")}</span><span>{fmt(calc.subtotal)}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">{t("billing.discount")}</span>
                <Input type="number" className="h-7 w-24 text-xs text-right" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} />
              </div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">{t("billing.otherCharges")}</span>
                <Input type="number" className="h-7 w-24 text-xs text-right" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} placeholder="0" />
              </div>
              <label className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={gstEnabled} onChange={(e) => { setGstEnabled(e.target.checked); if (!e.target.checked) setGstMode("none"); }} />
                {t("billing.gstEnabled")}
              </label>
              {gstEnabled && (
                <div className="py-1">
                  <Label className="text-xs">{t("billing.gstMode")}</Label>
                  <Select value={gstMode} onValueChange={setGstMode}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intra">{t("billing.gstIntra")}</SelectItem>
                      <SelectItem value="inter">{t("billing.gstInter")}</SelectItem>
                      <SelectItem value="none">{t("billing.gstNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {gstEnabled && gstMode === "intra" && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.cgst")}</span><span>{fmt(calc.cgst)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.sgst")}</span><span>{fmt(calc.sgst)}</span></div>
                </>
              )}
              {gstEnabled && gstMode === "inter" && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.igst")}</span><span>{fmt(calc.igst)}</span></div>
              )}
              <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2"><span>{t("billing.total")}</span><span>{fmt(calc.totalAmount)}</span></div>
              <div className="mt-3 pt-3 border-t space-y-2">
                <div>
                  <Label className="text-xs">{t("billing.aadhaarNumber")}</Label>
                  <Input className="h-8 text-xs" value={aadhaarNumber} onChange={(e) => setAadhaarNumber(formatAadhaar(e.target.value))} placeholder="XXXX XXXX XXXX" maxLength={14} />
                </div>
                <div>
                  <Label className="text-xs">{t("billing.panNumber")}</Label>
                  <Input className="h-8 text-xs uppercase tracking-wider" value={panNumber} onChange={(e) => setPanNumber(formatPan(e.target.value))} placeholder="ABCDE1234F" maxLength={10} />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <PaymentSection
                totalAmount={calc.totalAmount}
                payments={payments} setPayments={setPayments}
                reference={paymentRef} setReference={setPaymentRef}
                oldGold={oldGold} setOldGold={setOldGold}
                exchangeValue={exchangeValue}
                useOldGold={useOldGold} setUseOldGold={setUseOldGold}
                creditDue={creditDue} setCreditDue={setCreditDue}
                notes={paymentNotes} setNotes={setPaymentNotes}
                purities={purities}
                rates={rates}
                selectedPaymentMode={selectedPaymentMode}
                setSelectedPaymentMode={setSelectedPaymentMode}
                canOverrideRate={canOverrideRate}
              />
            </div>
            <div className="mt-4">
              <Label className="text-xs mb-1 block">{t("common.notes")}</Label>
              <Textarea
                value={billNotes}
                onChange={(e) => setBillNotes(e.target.value)}
                placeholder={t("common.notes")}
                rows={2}
                className="text-sm"
              />
            </div>
            <Button className="w-full mt-4" onClick={finalize} disabled={saving}>{saving ? t("common.processing") : <><Check className="w-4 h-4 mr-1" /> {t("billing.finalizeBill")}</>}</Button>
          </div>
        </div>
      </div>
      <NewCustomerDialog open={newCustOpen} onClose={() => setNewCustOpen(false)} onCreate={createCustomer} />
      {lastBill && (
        <BillSuccess
          bill={lastBill}
          items={lastBillItems}
          settings={settings}
          onClose={() => setLastBill(null)}
          onViewBill={() => { setViewLastBill(lastBill); setLastBill(null); }}
        />
      )}
      {viewLastBill && <BillViewDialog bill={viewLastBill} onClose={() => setViewLastBill(null)} />}
    </div>
  );
}

function NewCustomerDialog({ open, onClose, onCreate }) {
  const t = useT();
  const [f, setF] = useState({ name: "", mobile: "", email: "", address: "", gst_number: "", birth_date: "", notes: "" });
  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent>
      <DialogHeader><DialogTitle>{t("customers.newCustomer")}</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>{t("common.name")} *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>{t("common.mobile")}</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></div>
          <div><Label>{t("suppliers.email")}</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>{t("customers.gstNumber")}</Label><Input value={f.gst_number} onChange={(e) => setF({ ...f, gst_number: e.target.value })} /></div>
          <div><Label>{t("customers.birthDate")}</Label><Input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
        </div>
        <div><Label>{t("suppliers.address")}</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div><Label>{t("common.notes")}</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={() => f.name && onCreate(f)} disabled={!f.name}>{t("customers.newCustomer")}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function BillSuccess({ bill, items, settings, onClose, onViewBill }) {
  const t = useT();
  const handlePrint = () => printInvoice(bill, items, settings);
  return (
    <Dialog open={!!bill} onOpenChange={onClose}><DialogContent>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-emerald-700" /></div>
          <DialogTitle>{t("billing.billCreatedSuccess")}</DialogTitle>
        </div>
      </DialogHeader>
      <div className="py-2 text-center">
        <p className="text-sm text-muted-foreground">{t("billing.billNumber")}</p>
        <p className="font-display text-xl font-semibold">{bill.bill_number}</p>
        <p className="text-lg mt-2">{fmt(bill.total_amount)}</p>
        {Number(bill.due_amount) > 0 && <Badge variant="warning">{t("billing.due")}: {fmt(bill.due_amount)}</Badge>}
      </div>
      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button className="flex-1" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> {t("billing.printBill")}</Button>
        <WhatsAppButton bill={bill} className="flex-1" />
        <Button variant="outline" className="flex-1" onClick={onViewBill}><Eye className="w-4 h-4 mr-1" /> {t("billing.viewBill")}</Button>
        <Button variant="outline" className="flex-1" onClick={onClose}><Plus className="w-4 h-4 mr-1" /> {t("billing.newBill")}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  );
}