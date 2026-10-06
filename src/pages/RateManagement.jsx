import React, { useEffect, useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { usePermission } from "@/lib/permissions";
import { PageHeader, Spinner } from "@/components/ui/erp";
import { calcAllPurityRates, sortPuritiesDescending, fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Save, Coins, TrendingUp, Loader2, AlertCircle, CalendarCheck, Sliders, History, Calendar } from "lucide-react";
import HistoricalRateLookup from "@/components/rates/HistoricalRateLookup";
import PurityConfigDialog from "@/components/rates/PurityConfigDialog";
import RateHistoryDialog from "@/components/rates/RateHistoryDialog";

// Rate Management — DAILY RATE BENCHMARK & LOOKUP.
// Admin enters ONLY the 24K gold base rate and 999 silver base rate.
// All other purity rates are auto-calculated from PurityMaster percentages.
// Clean UI: Hides purity % column from main shopkeeper screen.
// Gold sequence starts from 24K descending (24K, 23.5K, 23K, 22K, 21K, 20K, 18K, 17K, 16K, 15K, 14K).
export default function RateManagement() {
  const t = useT();
  const { can } = usePermission();
  const { session, checkUserAuth } = useAuth();
  const canEdit = can("rates", "update");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [goldPurities, setGoldPurities] = useState([]);
  const [silverPurities, setSilverPurities] = useState([]);
  const [history, setHistory] = useState([]);
  const [rate24k, setRate24k] = useState("");
  const [silver999, setSilver999] = useState("");
  const [purityConfigOpen, setPurityConfigOpen] = useState(false);
  const [historyArchiveOpen, setHistoryArchiveOpen] = useState(false);
  const [historicalLookupOpen, setHistoricalLookupOpen] = useState(false);

  // Daily gate: true when today's rates are missing and user is admin
  const isDailyGate = session?.has_shop && session.rates_today === false && can("rates", "update");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, goldPur, silverPur, hist] = await Promise.all([
        base44.entities.ShopSettings.list("-created_date", 1),
        base44.entities.PurityMaster.filter({ is_active: true, metal_type: "gold" }, "purity_value", 50),
        base44.entities.PurityMaster.filter({ is_active: true, metal_type: "silver" }, "purity_value", 50),
        base44.entities.RateHistory.list("-effective_date", 100),
      ]);
      const st = s[0] || null;
      setSettings(st);
      if (st) {
        setRate24k(st.gold_24k_rate ? String(st.gold_24k_rate) : "");
        setSilver999(st.silver_rate ? String(st.silver_rate) : "");
      }
      setGoldPurities(sortPuritiesDescending(goldPur, "gold"));
      setSilverPurities(sortPuritiesDescending(silverPur, "silver"));
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live preview of calculated gold purity rates — 24K always first, descending order
  const calculatedGold = useMemo(() => {
    if (!rate24k || Number(rate24k) <= 0) return [];
    return calcAllPurityRates(Number(rate24k), goldPurities, "gold");
  }, [rate24k, goldPurities]);

  // Live preview of calculated silver purity rates
  const calculatedSilver = useMemo(() => {
    if (!silver999 || Number(silver999) <= 0) return [];
    return calcAllPurityRates(Number(silver999), silverPurities, "silver");
  }, [silver999, silverPurities]);

  const save = async () => {
    if (!rate24k || Number(rate24k) <= 0) {
      alert("24K gold base rate is required");
      return;
    }
    if (!silver999 || Number(silver999) <= 0) {
      alert("999 silver base rate is required");
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("changeRate", {
        gold_24k_rate: Number(rate24k),
        silver_rate: Number(silver999),
      });
      if (!res.data?.success) {
        alert(res.data?.error || "Rate change failed");
        return;
      }
      await load();
      // Reload session so the daily gate disappears immediately
      if (checkUserAuth) await checkUserAuth();
    } catch (e) {
      alert("Rate change failed: " + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            <span>Daily Benchmark Rates</span>
          </span>
        }
        title={t("rates.title")}
        subtitle="Set daily 24K pure gold & 999 silver base prices. All alloy purities (24K, 22K, 18K, 14K) are auto-indexed instantaneously."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPurityConfigOpen(true)}
              className="text-xs"
              title="Maintain purity percentage formulas"
            >
              <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              <span>Configure Purities</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoricalLookupOpen(true)}
              className="text-xs"
              title="Lookup rates applicable on any date"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              <span>View Rate by Date</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryArchiveOpen(true)}
              className="text-xs"
              title="View full historical rate log"
            >
              <History className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
              <span>Rate Archive</span>
            </Button>
            {canEdit && (
              <Button
                onClick={save}
                disabled={saving || !rate24k || !silver999}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    <span>{t("common.saving")}...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    <span>Update Daily Rates</span>
                  </>
                )}
              </Button>
            )}
          </div>
        }
      />

      {/* Daily Rate Gate Banner */}
      {isDailyGate && (
        <div className="flex items-start gap-3.5 rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-display font-bold text-amber-950">{t("rates.dailyGateTitle")}</h3>
            <p className="text-xs text-amber-900/80 mt-0.5">{t("rates.dailyGateMessage")}</p>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 font-medium">
          <Lock className="w-4 h-4 text-amber-600" />
          <span>{t("perm.adminOnly")}</span>
        </div>
      )}

      {/* Dual Column: Gold Base Card & Silver Base Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GOLD RATE SECTION */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">{t("rates.goldRate")}</h3>
                <p className="text-xs text-muted-foreground">Pure Gold (24 Karat) Benchmark</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-800 border border-amber-500/30">
              Gold 24K
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground block">
              {t("rates.baseRate24k")} (₹ per 1g standard) *
            </Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">₹</span>
              <Input
                type="number"
                value={rate24k}
                onChange={(e) => setRate24k(e.target.value)}
                placeholder="e.g. 7500"
                disabled={!canEdit}
                className="pl-8 text-lg font-bold font-mono bg-background"
              />
            </div>
            {settings?.rate_updated_date && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Last updated: {new Date(settings.rate_updated_date).toLocaleString("en-IN")}</span>
              </p>
            )}
          </div>

          {/* Clean Purity Rates — 24K first, descending sequence, clean rate per gram focus */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Applicable Purity Rates (1g)</p>
              <button
                type="button"
                onClick={() => setPurityConfigOpen(true)}
                className="text-[11px] text-amber-700 hover:text-amber-800 underline flex items-center gap-1"
              >
                Configure Percentages
              </button>
            </div>
            {calculatedGold.length > 0 ? (
              <CleanPurityRateTable rates={calculatedGold} accent="gold" baseLabel="24K" />
            ) : (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Enter a 24K rate to see calculated purity rates.</p>
            )}
          </div>
        </div>

        {/* SILVER RATE SECTION */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">{t("rates.silverRate")}</h3>
                <p className="text-xs text-muted-foreground">Fine Silver (999 Purity) Benchmark</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800 border border-slate-300">
              Silver 999
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground block">
              {t("rates.baseRate999")} (₹ per 1g standard) *
            </Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">₹</span>
              <Input
                type="number"
                value={silver999}
                onChange={(e) => setSilver999(e.target.value)}
                placeholder="e.g. 95"
                disabled={!canEdit}
                className="pl-8 text-lg font-bold font-mono bg-background"
              />
            </div>
          </div>

          {/* Clean Purity Rates — Silver */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Applicable Purity Rates (1g)</p>
              <button
                type="button"
                onClick={() => setPurityConfigOpen(true)}
                className="text-[11px] text-amber-700 hover:text-amber-800 underline flex items-center gap-1"
              >
                Configure Percentages
              </button>
            </div>
            {calculatedSilver.length > 0 ? (
              <CleanPurityRateTable rates={calculatedSilver} accent="silver" baseLabel="999" />
            ) : (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Enter a 999 rate to see calculated purity rates.</p>
            )}
          </div>
        </div>
      </div>

      {/* Save Button for mobile */}
      {canEdit && (
        <div className="sm:hidden">
          <Button
            onClick={save}
            disabled={saving || !rate24k || !silver999}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            size="lg"
          >
            {saving ? "Updating..." : "Update Daily Rates"}
          </Button>
        </div>
      )}

      {/* Historical Rate Lookup Dialog Modal */}
      <HistoricalRateLookup
        open={historicalLookupOpen}
        onClose={() => setHistoricalLookupOpen(false)}
      />

      {/* Modals for Purity Configuration & Rate Archive */}
      <PurityConfigDialog
        open={purityConfigOpen}
        onClose={() => setPurityConfigOpen(false)}
        onSaved={load}
      />

      <RateHistoryDialog
        open={historyArchiveOpen}
        onClose={() => setHistoryArchiveOpen(false)}
        history={history}
      />
    </div>
  );
}

// Clean purity rate table for jewellery shopkeepers — hides purity % calculation column,
// prominently displays Purity and Rate per gram in descending sequence (24K first).
function CleanPurityRateTable({ rates, accent, baseLabel }) {
  const isGold = accent === "gold";
  const headerBg = isGold ? "bg-amber-50" : "bg-slate-50";
  const baseText = isGold ? "text-amber-700" : "text-slate-700";
  const baseBg = isGold ? "bg-amber-100/60" : "bg-slate-100/60";

  return (
    <div className={`rounded-lg border ${isGold ? "border-amber-200" : "border-slate-200"} overflow-hidden shadow-2xs`}>
      <div className={`px-4 py-2 ${headerBg} border-b ${isGold ? "border-amber-200" : "border-slate-200"} flex items-center justify-between`}>
        <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${baseText}`}>
          <TrendingUp className="w-3.5 h-3.5" /> Effective Rates by Karat
        </p>
        <span className="text-[10px] text-muted-foreground">Standard 1 gram rate</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border/60">
            <tr>
              <th className="text-left font-medium px-4 py-2">Purity / Karat</th>
              <th className="text-right font-medium px-4 py-2">Rate / gram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rates.map((p) => {
              const isBase = p.purity_display === baseLabel || Number(p.purity_value) >= 99.9;
              return (
                <tr key={p.purity_id || p.purity_display} className={isBase ? baseBg : "hover:bg-muted/30"}>
                  <td className="px-4 py-2.5 font-semibold text-foreground">
                    <span className="font-mono">{p.purity_display}</span>
                    {isBase && <span className="ml-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider">(Base Standard)</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-bold font-mono text-sm ${isBase ? baseText : "text-foreground"}`}>
                    {fmt(p.rate_per_gram)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}