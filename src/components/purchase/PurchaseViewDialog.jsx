import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Badge, TableShell } from "@/components/ui/erp";
import { fmt, fmtWt3 } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { printPurchase } from "@/lib/printPurchase";
import { Printer, Edit } from "lucide-react";

export default function PurchaseViewDialog({ purchase, onClose, onEdit }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!purchase) return;
    base44.entities.PurchaseItem.filter({ purchase_id: purchase.id }, "-created_date", 500).then(setItems);
    base44.entities.ShopSettings.list("-created_date", 1).then((s) => setSettings(s[0]));
  }, [purchase]);

  if (!purchase) return null;

  const handlePrint = () => printPurchase(purchase, items, settings);

  return (
    <Dialog open={!!purchase} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("purchase.viewPurchase")}: {purchase.purchase_number}</DialogTitle></DialogHeader>
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
            <Badge variant={purchase.status === "finalized" ? "success" : "default"}>{purchase.status}</Badge>
            {purchase.gst_enabled && <Badge variant="info">{t("invoice.gstBill")}</Badge>}
          </div>
          <p><span className="text-muted-foreground">{t("purchase.supplier")}:</span> {purchase.supplier_name}</p>
          <p><span className="text-muted-foreground">{t("common.date")}:</span> {purchase.purchase_date}</p>
          {purchase.payment_mode && <p><span className="text-muted-foreground">{t("purchase.paymentMode")}:</span> {purchase.payment_mode}</p>}
        </div>
        <TableShell headers={[t("invoice.item"), t("common.quantity"), t("purchase.grossWt"), t("purchase.lessWt"), t("purchase.netWt"), t("billing.fineWt"), t("purchase.rate"), t("purchase.making"), t("common.total")]}>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-2"><p className="font-medium text-sm">{it.item_name}</p><p className="text-xs text-muted-foreground">{it.purity_display} · {it.hsn || "—"}</p></td>
              <td className="px-3 py-2">{it.quantity}</td>
              <td className="px-3 py-2">{(Number(it.gross_weight) * Number(it.quantity)).toFixed(3)}g</td>
              <td className="px-3 py-2">{(Number(it.stone_weight || 0) * Number(it.quantity)).toFixed(3)}g</td>
              <td className="px-3 py-2">{(Number(it.net_weight) * Number(it.quantity)).toFixed(3)}g</td>
              <td className="px-3 py-2">{fmtWt3(Number(it.fine_weight || 0) * Number(it.quantity))}</td>
              <td className="px-3 py-2">{fmt(it.rate_per_gram)}</td>
              <td className="px-3 py-2">{it.making_charge}{it.making_charge_type === "percentage" ? "%" : it.making_charge_type === "per_gram" ? "₹/g" : "₹"}</td>
              <td className="px-3 py-2 font-semibold">{fmt(it.total)}</td>
            </tr>
          ))}
        </TableShell>
        <div className="space-y-1 text-sm mt-3 ml-auto max-w-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.subtotal")}</span><span>{fmt(purchase.subtotal)}</span></div>
          {Number(purchase.making_charge_total) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.makingCharge")}</span><span>{fmt(purchase.making_charge_total)}</span></div>}
          {Number(purchase.hallmarking_charge_total) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.hallmarking")}</span><span>{fmt(purchase.hallmarking_charge_total)}</span></div>}
          {Number(purchase.other_charges) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.otherCharges")}</span><span>{fmt(purchase.other_charges)}</span></div>}
          {purchase.gst_enabled && purchase.gst_mode === "inter" && (
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoice.igst")}</span><span>{fmt(purchase.igst)}</span></div>
          )}
          {purchase.gst_enabled && purchase.gst_mode !== "inter" && (<>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.cgst")}</span><span>{fmt(purchase.cgst)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.sgst")}</span><span>{fmt(purchase.sgst)}</span></div>
          </>)}
          <div className="flex justify-between font-semibold border-t pt-1"><span>{t("billing.total")}</span><span>{fmt(purchase.total_amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("purchase.paidAmount")}</span><span>{fmt(purchase.paid_amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("billing.due")}</span><span className="text-red-600">{fmt(purchase.due_amount)}</span></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> {t("purchase.printPurchase")}</Button>
          {onEdit && <Button variant="outline" onClick={onEdit}><Edit className="w-4 h-4 mr-1" /> {t("purchase.editPurchase")}</Button>}
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}