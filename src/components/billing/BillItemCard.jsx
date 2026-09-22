import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { fmt, fmtNum } from "@/lib/billCalc";

// Mobile/tablet card layout for New Bill items.
// Handles all 3 billing modes: inventory, manual, customer_purchase.
// All fields from the desktop table are preserved — only the layout changes.
export default function BillItemCard({ row, index, mode, calc, t, updateRow, removeRow }) {
  const c = calc || { total: 0 };
  const lineNetTotal = fmtNum((Number(row.net_weight) || 0) * (Number(row.quantity) || 0));

  return (
    <div className="border-b p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
        <button onClick={() => removeRow(index)} className="p-1 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {mode === "inventory" ? (
          <div className="col-span-2">
            <p className="font-medium text-sm">{row.item_name}</p>
            {row.huid && <p className="text-[10px] text-blue-700 font-mono">HUID: {row.huid}</p>}
            <p className="text-muted-foreground text-xs">{row.purity_display} · {row.hsn || "—"}</p>
          </div>
        ) : (
          <div className="col-span-2">
            <Label className="text-xs">{t("billing.item")}</Label>
            <Input type="text" className="h-8 text-xs" value={row.item_name} onChange={(e) => updateRow(index, "item_name", e.target.value)} placeholder={t("billing.item")} />
          </div>
        )}
        {mode === "manual" && (
          <>
            <div>
              <Label className="text-xs">{t("billing.metalType")}</Label>
              <Input type="text" className="h-8 text-xs" value={row.metal_type} onChange={(e) => updateRow(index, "metal_type", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("billing.purity")}</Label>
              <Input type="text" className="h-8 text-xs" value={row.purity_display} onChange={(e) => updateRow(index, "purity_display", e.target.value)} />
            </div>
          </>
        )}
        {mode === "customer_purchase" && (
          <>
            <div>
              <Label className="text-xs">{t("billing.metalType")}</Label>
              <Select value={row.metal_type || "gold"} onValueChange={(v) => updateRow(index, "metal_type", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Purity %</Label>
              <Input type="number" className="h-8 text-xs" value={row.purity_value} onChange={(e) => updateRow(index, "purity_value", e.target.value)} placeholder="Purity %" />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs">{t("billing.qty")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.quantity} onChange={(e) => updateRow(index, "quantity", e.target.value)} />
          {mode === "inventory" && Number(row.quantity) > Number(row._stock) && (
            <p className="text-[10px] text-red-600 mt-0.5">Stock: {row._stock}</p>
          )}
        </div>
        <div>
          <Label className="text-xs">{t("billing.grossWt")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.gross_weight} onChange={(e) => updateRow(index, "gross_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("billing.stoneWt")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.stone_weight} onChange={(e) => updateRow(index, "stone_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("billing.netWt")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.net_weight} onChange={(e) => updateRow(index, "net_weight", e.target.value)} />
          <p className="text-[10px] text-muted-foreground mt-0.5">Σ {lineNetTotal}g</p>
        </div>
        <div>
          <Label className="text-xs">{t("billing.rate")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.rate_per_gram} onChange={(e) => updateRow(index, "rate_per_gram", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("billing.making")}</Label>
          <div className="flex gap-1">
            <Input type="number" className="h-8 text-xs flex-1 min-w-0" value={row.making_charge} onChange={(e) => updateRow(index, "making_charge", e.target.value)} />
            <Select value={row.making_charge_type || "percentage"} onValueChange={(v) => updateRow(index, "making_charge_type", v)}>
              <SelectTrigger className="h-8 w-14 text-xs px-1 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">%</SelectItem>
                <SelectItem value="fixed">₹</SelectItem>
                <SelectItem value="per_gram">₹/g</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {mode === "customer_purchase" && (
          <div>
            <Label className="text-xs">{t("billing.wastage")}</Label>
            <div className="flex gap-1">
              <Input type="number" className="h-8 text-xs flex-1 min-w-0" value={row.wastage} onChange={(e) => updateRow(index, "wastage", e.target.value)} />
              <Select value={row.wastage_type || "percentage"} onValueChange={(v) => updateRow(index, "wastage_type", v)}>
                <SelectTrigger className="h-8 w-14 text-xs px-1 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="fixed_weight">g</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div>
          <Label className="text-xs">{t("billing.hallmarkingCharge")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.hallmarking_charge} onChange={(e) => updateRow(index, "hallmarking_charge", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{t("billing.disc")}</Label>
          <Input type="number" className="h-8 text-xs" value={row.discount} onChange={(e) => updateRow(index, "discount", e.target.value)} />
        </div>
        <div className="col-span-2 flex justify-between items-center pt-1.5 border-t">
          <span className="text-xs font-medium">{t("common.total")}</span>
          <span className="text-sm font-semibold">{fmt(c.total)}</span>
        </div>
      </div>
    </div>
  );
}