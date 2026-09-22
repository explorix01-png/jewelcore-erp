import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { fmtNum, fmtWt3 } from "@/lib/billCalc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Code128Barcode from "@/components/Code128Barcode";
import { printBarcodeLabel } from "@/lib/printBarcode";
import { Printer, Pencil, Barcode as BarcodeIcon, Receipt } from "lucide-react";

// Complete inventory item details: master info, current stock, barcode (printable),
// quick actions, and chronological stock movement history from InventoryTransaction.
export default function ItemDetailsDialog({ item, onClose, onEdit, onBarcode, onBill }) {
  const t = useT();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    base44.entities.InventoryTransaction.filter({ item_id: item.item_id }, "-date", 100)
      .then(setTxns).finally(() => setLoading(false));
    base44.entities.ShopSettings.list("-created_date", 1).then((s) => setSettings(s[0] || null));
  }, [item]);

  if (!item) return null;
  const status = item.status || "in_stock";
  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("inventory.itemDetails")} — {item.item_name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inventory.itemInfo")}</p>
            <div className="grid grid-cols-2 gap-y-1.5 text-sm">
              <InfoRow label={t("billing.item")} value={item.item_name} />
              {item.huid ? (
                <>
                  <InfoRow label={t("inventory.huid")} value={item.huid} mono />
                  <InfoRow label={t("inventory.internalCode")} value={item.item_code} mono />
                </>
              ) : (
                <InfoRow label={t("common.code")} value={item.item_code} mono />
              )}
              <InfoRow label={t("billing.metalType")} value={item.metal_type ? t("metal." + item.metal_type) : ""} />
              <InfoRow label={t("billing.category")} value={item.category_name} />
              <InfoRow label={t("billing.purity")} value={item.purity_display} />
              <InfoRow label={t("billing.hsn")} value={item.hsn} />
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inventory.currentStock")}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <StockBox label={t("common.quantity")} value={item.quantity} />
              <StockBox label={t("billing.grossWt")} value={`${fmtNum(item.gross_weight)}g`} />
              <StockBox label={t("billing.netWt")} value={`${fmtNum(item.net_weight)}g`} />
              <StockBox label={t("billing.fineWt")} value={fmtWt3(item.fine_weight)} />
            </div>
            <div className="mt-2 text-center"><Badge variant={status === "out_of_stock" ? "danger" : status === "low_stock" ? "warning" : "success"}>{t("status." + status)}</Badge></div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inventory.barcode")}</p>
            {item.barcode ? (
              <>
                <Code128Barcode value={item.barcode} height={Number(settings?.barcode_height) || 70} moduleWidth={Number(settings?.barcode_width) || 2} fontSize={Number(settings?.barcode_font_size) || 14} />
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => printBarcodeLabel(item, settings)}><Printer className="w-4 h-4 mr-1" /> {t("inventory.printBarcode")}</Button>
                  <Button size="sm" variant="outline" onClick={() => onBarcode(item)}><BarcodeIcon className="w-4 h-4 mr-1" /> {t("inventory.viewBarcode")}</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("inventory.noBarcode")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onEdit(item)}><Pencil className="w-4 h-4 mr-1" /> {t("inv.editItem")}</Button>
            <Button size="sm" variant="outline" onClick={() => onBill()}><Receipt className="w-4 h-4 mr-1" /> {t("common.createBill")}</Button>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("inventory.stockHistory")}</p>
            {loading ? <Spinner /> : txns.length === 0 ? (
              <EmptyState title={t("inventory.noTransactions")} />
            ) : (
              <TableShell headers={[t("common.date"), t("inventory.transactionType"), t("common.quantity"), t("billing.netWt"), t("inventory.prevStock"), t("inventory.newStock"), t("inventory.reason")]}>
                {txns.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2 text-xs">{new Date(tx.date).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2"><Badge variant={tx.transaction_type.includes("IN") ? "success" : "danger"}>{tx.transaction_type}</Badge></td>
                    <td className="px-3 py-2">{tx.quantity}</td>
                    <td className="px-3 py-2">{fmtNum(tx.net_weight)}g</td>
                    <td className="px-3 py-2">{tx.previous_stock}</td>
                    <td className="px-3 py-2 font-semibold">{tx.new_stock}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{tx.reason || "—"}</td>
                  </tr>
                ))}
              </TableShell>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value || "—"}</span>
    </>
  );
}

function StockBox({ label, value }) {
  return (
    <div className="rounded bg-muted/50 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-lg">{value}</p>
    </div>
  );
}