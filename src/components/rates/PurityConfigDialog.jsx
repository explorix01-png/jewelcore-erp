import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { sortPuritiesDescending } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sliders, Save, Loader2 } from "lucide-react";

export default function PurityConfigDialog({ open, onClose, onSaved }) {
  const [purities, setPurities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadPurities = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.PurityMaster.filter({ is_active: true }, "purity_value", 100);
      const sorted = sortPuritiesDescending(data, "gold");
      setPurities(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadPurities();
      setMsg(null);
    }
  }, [open]);

  const updatePurityValue = (id, newVal) => {
    setPurities(purities.map(p => p.id === id ? { ...p, purity_value: newVal } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      for (const p of purities) {
        const val = Number(p.purity_value);
        if (val > 0 && val <= 100) {
          await base44.entities.PurityMaster.update(p.id, {
            purity_value: val,
            updated_date: new Date().toISOString()
          });
        }
      }
      setMsg({ type: "success", text: "Purity percentages updated successfully! Metal rates will now index with these exact percentages." });
      onSaved?.();
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Failed to update purity configurations" });
    } finally {
      setSaving(false);
    }
  };

  const goldList = purities.filter(p => p.metal_type === "gold");
  const silverList = purities.filter(p => p.metal_type === "silver");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sliders className="w-5 h-5 text-amber-600" />
            <span>Purity Percentage Master Configuration</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Configure the underlying purity percentages for each karat alloy. The daily rate per gram is computed as (Base 24K Rate × Purity % ÷ 100).
          </p>
        </DialogHeader>

        {msg && (
          <div className={`p-3 rounded-lg text-xs font-medium ${msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {msg.text}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
            Loading purity masters...
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Gold Purities */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">Gold Purity Alloys (24K Standard)</h4>
              <div className="rounded-lg border divide-y overflow-hidden">
                {goldList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 text-xs bg-card hover:bg-muted/30">
                    <div>
                      <span className="font-bold text-foreground font-mono">{p.display_format || p.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 capitalize">{p.metal_type} alloy</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        max="100"
                        value={p.purity_value}
                        onChange={(e) => updatePurityValue(p.id, e.target.value)}
                        className="h-8 w-24 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-xs text-muted-foreground font-semibold">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Silver Purities */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">Silver Purities (999 Standard)</h4>
              <div className="rounded-lg border divide-y overflow-hidden">
                {silverList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 text-xs bg-card hover:bg-muted/30">
                    <div>
                      <span className="font-bold text-foreground font-mono">{p.display_format || p.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 capitalize">{p.metal_type} standard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        max="100"
                        value={p.purity_value}
                        onChange={(e) => updatePurityValue(p.id, e.target.value)}
                        className="h-8 w-24 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-xs text-muted-foreground font-semibold">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Purity Percentages
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
