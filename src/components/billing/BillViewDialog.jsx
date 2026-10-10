import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Badge, TableShell } from "@/components/ui/erp";
import { fmt, fmtWt3 } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { printInvoice } from "@/lib/printInvoice";
import WhatsAppButton from "@/components/billing/WhatsAppButton";
import { Printer } from "lucide-react";

export default function BillViewDialog({ bill, onClose }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!bill) return;
    base44.entities.BillItem.filter({ bill_id: bill.id }, "-created_date", 100).then(setItems);
    base44.entities.ShopSettings.list("-created_date", 1).then((s) => setSettings(s[0]));
  }, [bill]);

  if (!bill) return null;

  // Whole-rupee rounding on the total: the saved total minus the taxable value and GST (nothing extra is stored).
  const gstTotal = bill.gst_enabled && bill.gst_mode !== "none" ? Number(bill.cgst || 0) + Number(bill.sgst || 0) + Number(bill.igst || 0) : 0;
  const taxable = Math.max(0, Number(bill.subtotal || 0) - Number(bill.discount || 0) + Number(bill.other_charges || 0));
  const roundOff = Number(bill.total_amount || 0) - (taxable + gstTotal);

  return (
    <Dialog open={!!bill} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("invoice.billNumber")}: {bill.bill_number}</DialogTitle></DialogHeader>
        {settings && (
          <div className="text-center border-b pb-3 mb-3">
            {settings.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 mx-auto mb-1" />}
            <h2 className="font-display text-lg font-semibold">{settings.shop_name}</h2>
            <p className="text-xs text-muted-foreground">{settings.address}</p>
            <p className="text-xs text-muted-foreground">{settings.mobile} · GST: {settings.gst_number}</p>
          </div>
        )}
        <div className="text-sm space-y-1 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={bill.gst_enabled && bill.gst_mode !== "none" ? "info" : "default"}>
              {bill.gst_enabled && bill.gst_mode !== "none" ? t("invoice.gstBill") : t("invoice.simpleBill")}
            </Badge>
            <Badge variant={bill.bill_source === "manual" ? "info" : bill.bill_source === "customer_purchase" ? "warning" : "default"}>
              {bill.bill_source === "manual" ? t("invoice.manualBill") : bill.bill_source === "customer_purchase" ? t("billHistory.sourceCustomerPurchase") : t("invoice.inventoryBill")}
            </Badge>
          </div>
          <p><span className="text-muted-foreground">{t("invoice.customer")}:</span> {bill.customer_name} ({bill.customer_mobile || "—"})</p>
          {bill.customer_gst_number && <p><span className="text-muted-foreground">{t("invoice.customerGst")}:</span> {bill.customer_gst_number}</p>}
          {bill.aadhaar_number && <p><span className="text-muted-foreground">Aadhaar:</span> {bill.aadhaar_number}</p>}
          {bill.pan_number && <p><span className="text-muted-foreground">PAN:</span> {bill.pan_number}</p>}
          <p><span className="text-muted-foreground">{t("invoice.date")}:</span> {new Date(bill.bill_date).toLocaleString("en-IN")}</p>
        </div>
        <TableShell headers={[t("invoice.item"), t("invoice.qty"), t("invoice.netWt"), t("billing.fineWt"), t("invoice.rate"), t("invoice.making"), t("invoice.hallmark"), t("invoice.total")]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2"><p className="font-medium text-sm">{it.item_name}</p><p className="text-xs text-muted-foreground">{it.purity_display} · {it.hsn || "—"}</p></td>
              <td className="px-3 py-2">{it.quantity}</td>
              <td className="px-3 py-2">{(Number(it.net_weight) * Number(it.quantity)).toFixed(2)}g</td>
              <td className="px-3 py-2">{fmtWt3(Number(it.fine_weight) * Number(it.quantity))}</td>
              <td className="px-3 py-2">{fmt(it.rate_per_gram)}</td>
              <td className="px-3 py-2">{it.making_charge}{it.making_charge_type === "percentage" ? "%" : ""}</td>
              <td className="px-3 py-2">{Number(it.hallmarking_charge) > 0 ? fmt(it.hallmarking_charge) : "—"}</td>
              <td className="px-3 py-2 font-semibold">{fmt(it.total)}</td>
            </tr>
          ))}
        </TableShell>
        <div className="space-y-1 text-sm mt-3 ml-auto max-w-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.subtotal")}</span><span>{fmt(bill.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.discount")}</span><span>{fmt(bill.discount)}</span></div>
          {Number(bill.other_charges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.otherCharges")}</span><span>{fmt(bill.other_charges)}</span></div>}
          {Number(bill.hallmarking_charge) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.hallmarking")}</span><span>{fmt(bill.hallmarking_charge)}</span></div>}
          {bill.gst_enabled && bill.gst_mode === "inter" && (
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.igst")}</span><span>{fmt(bill.igst)}</span></div>
          )}
          {bill.gst_enabled && bill.gst_mode !== "inter" && (<>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.cgst")}</span><span>{fmt(bill.cgst)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.sgst")}</span><span>{fmt(bill.sgst)}</span></div>
          </>)}
          {Math.abs(roundOff) >= 0.005 && <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.roundOff")}</span><span>{fmt(roundOff)}</span></div>}
          <div className="flex justify-between font-semibold border-t pt-1"><span>{t("invoice.totalAmount")}</span><span>{fmt(bill.total_amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.paid")}</span><span>{fmt(bill.paid_amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.due")}</span><span className="text-red-600">{fmt(bill.due_amount)}</span></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => printInvoice(bill, items, settings)}><Printer className="w-4 h-4 mr-1" /> {t("invoice.print")}</Button>
          <WhatsAppButton bill={bill} size="default" />
          <Button onClick={onClose}>{t("invoice.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}