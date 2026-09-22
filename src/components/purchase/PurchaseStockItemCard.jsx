import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { calcFineWeight, fmtWt3 } from "@/lib/billCalc";

// Mobile/tablet card layout for Add Purchase (stock entry) items.
// All fields from the desktop table are preserved — only the layout changes.
export default function PurchaseStockItemCard({ row, index, t, updateItem, removeItem }) {
  const fineWt = calcFineWeight(Number(row.net_weight) || 0, Number(row.purity_value) || 0);
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{row.item_name}</p>
          {row.huid ? (
            <p className="font-mono text-xs font-semibold text-blue-700">{row.huid}</p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">{row.item_code || "—"}</p>
          )}
          <p className="text-xs text-muted-foreground">{row.purity_display || "—"}</p>
        </div>
        <button onClick={() => removeItem(index)} className="p-1 text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("common.quantity")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("purchase.grossWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.gross_weight} onChange={(e) => updateItem(index, "gross_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("purchase.lessWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.stone_weight} onChange={(e) => updateItem(index, "stone_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("purchase.netWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.net_weight} onChange={(e) => updateItem(index, "net_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("purchase.fineWt")}</Label>
          <div className="h-8 flex items-center text-xs font-medium">{fmtWt3(fineWt)}</div>
        </div>
        <div>
          <Label className="text-xs">{t("purchase.rate")}</Label>
          <Input type="number" step="0.01" className="h-8 text-xs" value={row.rate_per_gram} onChange={(e) => updateItem(index, "rate_per_gram", e.target.value)} />
        </div>
      </div>
    </div>
  );
}