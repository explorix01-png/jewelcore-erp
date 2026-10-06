import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/erp";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Search, Coins, Gem, Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function HistoricalRateLookup({ open, onClose, onSelectRateForDate }) {
  const [lookupDate, setLookupDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const performLookup = async (dateToLookup) => {
    const targetDate = dateToLookup || lookupDate;
    if (!targetDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getEffectiveRates", { date: targetDate });
      if (res.data?.error || !res.data?.success) {
        setError(res.data?.error || "No rate is configured for the selected date.");
        setResult(null);
      } else {
        setResult(res.data);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to resolve historical rates");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Perform initial lookup for selected date when dialog opens or on mount
    if (open !== false) {
      performLookup(lookupDate);
    }
  }, [open]);

  const content = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-foreground">View Rate by Date</h3>
            <p className="text-xs text-muted-foreground">Select any calendar date to view the official gold and silver benchmark rates applicable on that date.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={lookupDate}
            onChange={(e) => {
              setLookupDate(e.target.value);
              performLookup(e.target.value);
            }}
            className="h-9 w-40 text-xs font-medium"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => performLookup(lookupDate)}
            disabled={loading}
            className="h-9 text-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
            <span>Lookup</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-amber-50/70 border border-amber-200/80">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-slate-900">
                Selected Date: <span className="font-mono text-amber-950 font-bold">{new Date(result.query_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Active since: {result.gold_effective_date ? new Date(result.gold_effective_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' }) : "Benchmark default"}
              </span>
              <Badge variant="success">Deterministic Snapshot</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gold Breakdown for selected date */}
            <div className="rounded-lg border border-amber-200 bg-background overflow-hidden">
              <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-200/80 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-600" />
                  Gold Rates (Applicable on Date)
                </span>
                <span className="text-xs font-mono font-bold text-amber-900">
                  24K: {fmt(result.gold_24k_rate)}/g
                </span>
              </div>
              <div className="p-2 divide-y divide-border/60 max-h-56 overflow-y-auto">
                {result.gold_rates?.map((gr) => (
                  <div key={gr.purity_id || gr.purity_display} className="flex items-center justify-between py-1.5 px-2 text-xs">
                    <span className="font-semibold text-foreground font-mono">{gr.purity_display}</span>
                    <span className="font-mono font-bold text-slate-900">{fmt(gr.rate_per_gram)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Silver Breakdown for selected date */}
            <div className="rounded-lg border border-slate-200 bg-background overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Gem className="w-3.5 h-3.5 text-slate-600" />
                  Silver Rates (Applicable on Date)
                </span>
                <span className="text-xs font-mono font-bold text-slate-900">
                  999: {fmt(result.silver_rate)}/g
                </span>
              </div>
              <div className="p-2 divide-y divide-border/60 max-h-56 overflow-y-auto">
                {result.silver_rates?.map((sr) => (
                  <div key={sr.purity_id || sr.purity_display} className="flex items-center justify-between py-1.5 px-2 text-xs">
                    <span className="font-semibold text-foreground font-mono">{sr.purity_display}</span>
                    <span className="font-mono font-bold text-slate-900">{fmt(sr.rate_per_gram)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (open !== undefined) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Calendar className="w-5 h-5 text-amber-600" />
              <span>Historical Rate by Date</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">{content}</div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs space-y-4">
      {content}
    </div>
  );
}
