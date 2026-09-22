import React, { useEffect, useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { usePermission } from "@/lib/permissions";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { calcAllPurityRates, fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, Lock, Save, Coins, TrendingUp, Loader2, AlertCircle, CalendarCheck } from "lucide-react";

// Rate Management — DAILY RATE MODEL.
// Admin enters ONLY the 24K gold base rate and 999 silver base rate.
// All other purity rates are auto-calculated from PurityMaster percentages.
// Formula: calculated_rate = base_rate × purity_percentage / 100
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

  // Daily gate: true when today's rates are missing and user is admin
  const isDailyGate = session?.has_shop && session.rates_today === false && can("rates", "update");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, goldPur, silverPur, hist] = await Promise.all([
        base44.entities.ShopSettings.list("-created_date", 1),
        base44.entities.PurityMaster.filter({ is_active: true, metal_type: "gold" }, "purity_value", 50),
        base44.entities.PurityMaster.filter({ is_active: true, metal_type: "silver" }, "purity_value", 50),
        base44.entities.RateHistory.list("-effective_date", 50),
      ]);
      const st = s[0] || null;
      setSettings(st);
      if (st) {
        setRate24k(st.gold_24k_rate ? String(st.gold_24k_rate) : "");
        setSilver999(st.silver_rate ? String(st.silver_rate) : "");
      }
      setGoldPurities(goldPur);
      setSilverPurities(silverPur);
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live preview of calculated gold purity rates
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
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title={t("rates.title")} subtitle={t("rates.subtitle")} />

      {/* Daily Rate Gate Banner */}
      {isDailyGate && (
        <div className="flex items-start gap-3 mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-amber-900">{t("rates.dailyGateTitle")}</h3>
            <p className="text-sm text-amber-800 mt-0.5">{t("rates.dailyGateMessage")}</p>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-2 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <Lock className="w-4 h-4" /> {t("perm.adminOnly")}
        </div>
      )}

      {/* GOLD RATE SECTION */}
      <div className="rounded-xl border bg-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Coins className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg">{t("rates.goldRate")}</h3>
            <p className="text-xs text-muted-foreground">Enter 24K base rate — all purities auto-calculated</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <Label className="mb-1.5 block">{t("rates.baseRate24k")} *</Label>
            <Input
              type="number"
              value={rate24k}
              onChange={(e) => setRate24k(e.target.value)}
              placeholder="e.g. 153600"
              disabled={!canEdit}
              className="text-lg font-semibold"
            />
            {settings?.rate_updated_date && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <CalendarCheck className="w-3 h-3" /> {t("rates.lastUpdated")}:{" "}
                {new Date(settings.rate_updated_date).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        </div>

        {/* Auto-calculated gold purity table */}
        {calculatedGold.length > 0 ? (
          <PurityRateTable rates={calculatedGold} accent="gold" baseLabel="24K" />
        ) : (
          <p className="text-sm text-muted-foreground italic">Enter a 24K rate to see calculated purity rates.</p>
        )}
      </div>

      {/* SILVER RATE SECTION */}
      <div className="rounded-xl border bg-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
            <Coins className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg">{t("rates.silverRate")}</h3>
            <p className="text-xs text-muted-foreground">Enter 999 base rate — all purities auto-calculated</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <Label className="mb-1.5 block">{t("rates.baseRate999")} *</Label>
            <Input
              type="number"
              value={silver999}
              onChange={(e) => setSilver999(e.target.value)}
              placeholder="e.g. 2000"
              disabled={!canEdit}
              className="text-lg font-semibold"
            />
          </div>
        </div>

        {/* Auto-calculated silver purity table */}
        {calculatedSilver.length > 0 ? (
          <PurityRateTable rates={calculatedSilver} accent="silver" baseLabel="999" />
        ) : (
          <p className="text-sm text-muted-foreground italic">Enter a 999 rate to see calculated purity rates.</p>
        )}
      </div>

      {/* Save Button */}
      {canEdit && (
        <div className="mb-6">
          <Button onClick={save} disabled={saving || !rate24k || !silver999} className="w-full sm:w-auto" size="lg">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("common.saving")}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> {t("common.save")} {t("rates.title")}
              </>
            )}
          </Button>
          {isDailyGate && (!rate24k || !silver999) && (
            <p className="text-xs text-amber-700 mt-2">{t("rates.bothRequired")}</p>
          )}
        </div>
      )}

      {/* Rate History */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <h3 className="font-display font-semibold px-5 py-3 border-b">{t("rates.rateHistory")}</h3>
        {history.length === 0 ? (
          <EmptyState icon={Percent} title="No rate history" description="Rates will appear here after first update." />
        ) : (
          <TableShell headers={[t("rates.metal"), t("rates.purity"), t("rates.ratePerGram"), t("rates.source"), t("rates.effective"), t("rates.status")]}>
            {history.slice(0, 20).map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 capitalize">{r.metal_type}</td>
                <td className="px-4 py-3">{r.purity_display || "—"}</td>
                <td className="px-4 py-3 font-semibold">{fmt(r.rate_per_gram)}</td>
                <td className="px-4 py-3 text-xs">
                  {r.source || "manual"}
                  {r.is_manual_override ? " (override)" : ""}
                </td>
                <td className="px-4 py-3 text-xs">{new Date(r.effective_date).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3">
                  <Badge variant={r.is_active ? "success" : "default"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </div>
  );
}

// Reusable purity rate table — shows purity name, percentage, and calculated rate
function PurityRateTable({ rates, accent, baseLabel }) {
  const isGold = accent === "gold";
  const headerBg = isGold ? "bg-amber-50" : "bg-slate-50";
  const baseText = isGold ? "text-amber-700" : "text-slate-700";
  const baseBg = isGold ? "bg-amber-100/60" : "bg-slate-100/60";

  return (
    <div className={`rounded-lg border ${isGold ? "border-amber-200" : "border-slate-200"} overflow-hidden`}>
      <div className={`px-4 py-2.5 ${headerBg} border-b ${isGold ? "border-amber-200" : "border-slate-200"}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${baseText}`}>
          <TrendingUp className="w-3.5 h-3.5" /> Auto-Calculated Purity Rates
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2">Purity</th>
              <th className="text-right font-medium px-4 py-2">Purity %</th>
              <th className="text-right font-medium px-4 py-2">Rate / gram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rates.map((p) => {
              const isBase = Number(p.purity_value) === 100;
              return (
                <tr key={p.purity_id || p.purity_display} className={isBase ? baseBg : ""}>
                  <td className="px-4 py-2.5 font-medium">{p.purity_display}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {Number(p.purity_value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${isBase ? baseText : ""}`}>
                    {fmt(p.rate_per_gram)}
                    {isBase && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(base)</span>}
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