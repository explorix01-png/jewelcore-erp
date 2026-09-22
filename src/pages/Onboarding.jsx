import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Store, Check, ChevronRight, Loader2 } from "lucide-react";

// Onboarding — first-time admin shop setup + 24K gold rate setup.
// Step 1: Shop details → onboardShop backend function
// Step 2: 24K gold rate → changeRate backend function → mark onboarding complete
export default function Onboarding() {
  const t = useT();
  const { checkUserAuth, session } = useAuth();
  // If the shop already exists (setup was interrupted before rate step), skip
  // shop creation (Step 1) and go straight to rate setup (Step 2). This prevents
  // the "Shop already set up for this business" error from onboardShop.
  const [step, setStep] = useState(session?.has_shop ? 2 : 1);
  const [saving, setSaving] = useState(false);

  const [shop, setShop] = useState({
    shop_name: "", owner_name: "", mobile: "", email: "", address: "",
    state: "", city: "", gst_number: "", invoice_prefix: "INV", default_language: "English",
  });

  const [rate24k, setRate24k] = useState("");
  const [silverRate, setSilverRate] = useState("");

  const set = (k, v) => setShop({ ...shop, [k]: v });

  const submitShop = async () => {
    if (!shop.shop_name) { alert("Shop name is required"); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("onboardShop", shop);
      if (res.data?.success) {
        setStep(2);
      } else {
        alert(res.data?.error || "Failed to create shop");
      }
    } catch (e) {
      alert("Failed: " + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  const submitRate = async () => {
    if (!rate24k || Number(rate24k) <= 0) { alert("24K gold rate is required"); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("changeRate", {
        gold_24k_rate: Number(rate24k),
        silver_rate: Number(silverRate) || 0,
      });
      await base44.functions.invoke("manageSettings", {
        action: "update",
        data: { onboarding_completed: true },
      });
      await checkUserAuth();
      window.location.href = "/";
    } catch (e) {
      alert("Failed: " + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-background to-amber-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 items-center justify-center shadow-lg mb-4">
            <Coins className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t("onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("onboarding.subtitle")}</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step >= s ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 2 && <div className={`w-12 h-0.5 ${step > s ? "bg-amber-600" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Shop Setup */}
        {step === 1 && (
          <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Store className="w-5 h-5 text-amber-600" />
              <h2 className="font-display font-semibold text-lg">{t("onboarding.shopDetails")}</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("settings.shopName")} *</Label>
                <Input value={shop.shop_name} onChange={(e) => set("shop_name", e.target.value)} placeholder="e.g. Shree Jewellers" />
              </div>
              <div>
                <Label>{t("settings.ownerName")}</Label>
                <Input value={shop.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
              </div>
              <div>
                <Label>{t("common.mobile")}</Label>
                <Input value={shop.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="9876543210" />
              </div>
              <div>
                <Label>{t("suppliers.email")}</Label>
                <Input type="email" value={shop.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>{t("customers.gstNumber")}</Label>
                <Input value={shop.gst_number} onChange={(e) => set("gst_number", e.target.value)} placeholder="27ABCDE1234F1Z5" />
              </div>
              <div>
                <Label>{t("settings.invoicePrefix")}</Label>
                <Input value={shop.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} placeholder="INV" />
              </div>
              <div>
                <Label>{t("onboarding.state")}</Label>
                <Input value={shop.state} onChange={(e) => set("state", e.target.value)} placeholder="Maharashtra" />
              </div>
              <div>
                <Label>{t("onboarding.city")}</Label>
                <Input value={shop.city} onChange={(e) => set("city", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t("suppliers.address")}</Label>
              <Input value={shop.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop address" />
            </div>
            <div>
              <Label>{t("settings.defaultLanguage")}</Label>
              <Select value={shop.default_language} onValueChange={(v) => set("default_language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Hindi">हिंदी</SelectItem>
                  <SelectItem value="Marathi">मराठी</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={submitShop} disabled={saving || !shop.shop_name}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("onboarding.creatingShop")}</> : <>{t("onboarding.continue")} <ChevronRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        )}

        {/* Step 2: 24K Gold Rate Setup */}
        {step === 2 && (
          <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-5 h-5 text-amber-600" />
              <h2 className="font-display font-semibold text-lg">{t("onboarding.goldRateSetup")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.goldRateDesc")}
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>{t("onboarding.goldRate24k")} *</Label>
                <Input type="number" value={rate24k} onChange={(e) => setRate24k(e.target.value)} placeholder="e.g. 7000" />
              </div>
              <div>
                <Label>{t("onboarding.silverRate")}</Label>
                <Input type="number" value={silverRate} onChange={(e) => setSilverRate(e.target.value)} placeholder="e.g. 95" />
              </div>
            </div>

            {/* Live preview of calculated purities */}
            {rate24k && Number(rate24k) > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <p className="text-xs font-semibold text-amber-800 mb-2 uppercase tracking-wide">{t("onboarding.autoCalculated")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {[24, 22, 20, 18, 14].map((k) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}K</span>
                      <span className="font-medium">₹{Math.round((Number(rate24k) * k / 24)).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>{t("common.back")}</Button>
              <Button className="flex-1" onClick={submitRate} disabled={saving || !rate24k}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("onboarding.completingSetup")}</> : <>{t("onboarding.completeSetup")}</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}