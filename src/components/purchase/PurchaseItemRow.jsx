import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { calcFineWeight, calcItem, fmtWt3, fmt } from "@/lib/billCalc";

// Read-only master info card + editable transaction-only fields.
// Master fields (name, code, metal, category, purity, HSN) come from ItemMaster
// and are NEVER editable here — they are the source of truth from Master Config.
// Transaction fields: quantity, gross/less/net weight, rate, making charge (%/₹).
export default function PurchaseItemRow({ row, index, onRemove, onUpdate, gstRate, gstEnabled }) {
  const t = useT();
  const fineWt = calcFineWeight(Number(row.net_weight) || 0, Number(row.purity_value) || 0);
  const calc = calcItem({ ...row, gst_rate: gstRate, gst_enabled: gstEnabled });
  return (
    <div className="p-3 border-b last:border-b-0">
      {/* Row 1: master info + qty + remove */}
      <div className="grid grid-cols-12 gap-3 items-start">
        <div className="col-span-12 sm:col-span-6">
          <div className="rounded-lg bg-muted/40 border p-3 relative">
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <Lock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Master</span>
            </div>
            <p className="font-medium text-sm pr-16">{row.item_name || "—"}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{row.item_code || "—"}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {row.metal_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 capitalize">{row.metal_type}</span>}
              {row.purity_display && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">{row.purity_display}</span>}
              {row.category_name && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">{row.category_name}</span>}
              {row.hsn && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">HSN: {row.hsn}</span>}
            </div>
          </div>
        </div>
        <div className="col-span-4 sm:col-span-2">
          <Label className="text-xs">{t("common.quantity")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.quantity} onChange={(e) => onUpdate(index, "quantity", e.target.value)} />
        </div>
        <div className="col-span-4 sm:col-span-3">
          <Label className="text-xs">{t("billing.fineWt")}</Label>
          <p className="text-xs mt-1.5 font-medium text-muted-foreground">{fmtWt3(fineWt)}</p>
        </div>
        <div className="col-span-4 sm:col-span-1 flex items-end justify-center pb-1">
          <button onClick={() => onRemove(index)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Row 2: weights + rate + making */}
      <div className="grid grid-cols-12 gap-3 mt-2">
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t("purchase.grossWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.gross_weight} onChange={(e) => onUpdate(index, "gross_weight", e.target.value)} />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t("purchase.lessWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.stone_weight || 0} onChange={(e) => onUpdate(index, "stone_weight", e.target.value)} />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t("purchase.netWt")}</Label>
          <Input type="number" step="0.001" className="h-8 text-xs" value={row.net_weight} onChange={(e) => onUpdate(index, "net_weight", e.target.value)} />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t("purchase.rate")}</Label>
          <Input type="number" step="0.01" className="h-8 text-xs" value={row.rate_per_gram || 0} onChange={(e) => onUpdate(index, "rate_per_gram", e.target.value)} />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t("purchase.making")}</Label>
          <Input type="number" step="0.01" className="h-8 text-xs" value={row.making_charge || 0} onChange={(e) => onUpdate(index, "making_charge", e.target.value)} />
        </div>
        <div className="col-span-6 sm:col-span-1">
          <Label className="text-xs">{t("purchase.makingType")}</Label>
          <Select value={row.making_charge_type || "percentage"} onValueChange={(v) => onUpdate(index, "making_charge_type", v)}>
            <SelectTrigger className="h-8 text-xs px-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">%</SelectItem>
              <SelectItem value="fixed">₹</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12 sm:col-span-1 flex items-end justify-end">
          <div className="text-right">
            <Label className="text-xs">{t("purchase.lineTotal")}</Label>
            <p className="text-sm font-semibold mt-1">{fmt(calc.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}