import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ArrowLeft } from "lucide-react";
import { fmt } from "@/lib/billCalc";

// Mobile/tablet card layout for Purchase Management items.
// Renders the same fields as the desktop table in a responsive 2-column grid.
// No horizontal scrolling — all fields accessible within the viewport.
export default function PurchaseItemCard({ row, index, calc, purities, updateRow, removeRow }) {
  const rateMissing = Number(row.rate_per_gram) <= 0;
  const c = calc || { metal_value: 0, total: 0 };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
        <button onClick={() => removeRow(index)} className="p-1 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Metal</Label>
          <Select value={row.metal_type} onValueChange={(v) => updateRow(index, "metal_type", v)}>
            <SelectTrigger className="h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Code</Label>
          <Input type="text" className="h-8 text-xs" value={row.item_code} onChange={(e) => updateRow(index, "item_code", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Item *</Label>
          <Input type="text" className="h-8 text-xs" value={row.item_name} onChange={(e) => updateRow(index, "item_name", e.target.value)} placeholder="Item name" />
        </div>
        <div>
          <Label className="text-xs">Gross Wt</Label>
          <Input type="number" step="0.001" className="h-8 text-xs text-right" value={row.gross_weight} onChange={(e) => updateRow(index, "gross_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Less Wt</Label>
          <Input type="number" step="0.001" className="h-8 text-xs text-right" value={row.stone_weight} onChange={(e) => updateRow(index, "stone_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Net Wt</Label>
          <Input type="number" step="0.001" className="h-8 text-xs text-right" value={row.net_weight} onChange={(e) => updateRow(index, "net_weight", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Purity</Label>
          {row._purityMode === "custom" ? (
            <div className="flex items-center gap-0.5">
              <Input type="text" className="h-8 text-xs flex-1" value={row._customPurity} onChange={(e) => updateRow(index, "_customPurity", e.target.value)} placeholder="e.g. 22K, 925" />
              <button onClick={() => updateRow(index, "_purityMode", "master")} className="p-1 text-muted-foreground hover:text-foreground shrink-0" title="Back to list">
                <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Select value={row.purity_display} onValueChange={(v) => updateRow(index, "purity_display", v)}>
              <SelectTrigger className="h-8 text-xs px-1"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {purities.filter((p) => p.metal_type === row.metal_type).map((p) => <SelectItem key={p.id} value={p.display_format}>{p.display_format}</SelectItem>)}
                <SelectItem value="__custom__">✏️ Custom…</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <Label className="text-xs">Hishob (%)</Label>
          <Input type="number" step="0.01" className="h-8 text-xs text-right" value={row.wastage} onChange={(e) => updateRow(index, "wastage", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Making Charge (₹/g)</Label>
          <Input type="number" step="0.01" className="h-8 text-xs text-right" value={row.making_charge} onChange={(e) => updateRow(index, "making_charge", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Rate/g</Label>
          <Input type="number" step="0.01" className={`h-8 text-xs text-right ${row._rateAuto && !rateMissing ? "bg-blue-50" : ""}`} value={row.rate_per_gram} onChange={(e) => updateRow(index, "rate_per_gram", e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs">Jama</Label>
          <div className="h-8 flex items-center justify-end text-xs font-medium whitespace-nowrap">{fmt(c.metal_value)}</div>
        </div>
        <div className="col-span-2 flex justify-between items-center pt-1.5 border-t">
          <span className="text-xs font-medium">Total</span>
          <span className="text-xs font-semibold">{fmt(c.total)}</span>
        </div>
      </div>
    </div>
  );
}