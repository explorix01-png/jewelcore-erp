import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Save, Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";

// Settings → WhatsApp Integration section.
// Stores non-secret config + the access token server-side (RLS read:false on
// WhatsAppConfig). The access token is NEVER returned to the client after saving.
export default function WhatsAppSettings() {
  const t = useT();
  const { can } = usePermission();
  const canEdit = can("settings", "update");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState({ enabled: false, phone_number_id: "", business_account_id: "", access_token: "", default_message: "" });
  const [status, setStatus] = useState({ configured: false });
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageWhatsApp", { action: "getStatus" });
      const d = res.data || {};
      setStatus({ configured: !!d.configured, api_status: d.api_status });
      setCfg({
        enabled: !!d.enabled,
        phone_number_id: d.phone_number_id || "",
        business_account_id: d.business_account_id || "",
        access_token: "", // never pre-fill the token
        default_message: d.default_message || "",
      });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setCfg({ ...cfg, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageWhatsApp", {
        action: "saveConfig",
        data: {
          enabled: cfg.enabled,
          phone_number_id: cfg.phone_number_id,
          business_account_id: cfg.business_account_id,
          access_token: cfg.access_token, // blank = keep existing
          default_message: cfg.default_message,
        },
      });
      if (!res.data?.success) { alert(res.data?.error || "Save failed"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setCfg((c) => ({ ...c, access_token: "" }));
      load();
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" /> {t("whatsappSettings.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("whatsappSettings.subtitle")}</p>
        </div>
        <div className="text-xs">
          {status.configured ? (
            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> {t("whatsappSettings.configured")}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> {t("whatsappSettings.notConfigured")}</span>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock className="w-4 h-4" /> {t("settings.readOnly")}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => set("enabled", e.target.checked)} disabled={!canEdit} />
        {t("whatsappSettings.enabled")}
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>{t("whatsappSettings.phoneNumberId")}</Label>
          <Input value={cfg.phone_number_id} onChange={(e) => set("phone_number_id", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label>{t("whatsappSettings.businessAccountId")}</Label>
          <Input value={cfg.business_account_id} onChange={(e) => set("business_account_id", e.target.value)} disabled={!canEdit} />
        </div>
      </div>

      <div>
        <Label>{t("whatsappSettings.accessToken")}</Label>
        <Input type="password" value={cfg.access_token} onChange={(e) => set("access_token", e.target.value)} placeholder={status.configured ? "•••••••• (stored securely)" : "Paste access token"} disabled={!canEdit} />
        <p className="text-xs text-muted-foreground mt-1">{t("whatsappSettings.accessTokenHint")}</p>
      </div>

      <div>
        <Label>{t("whatsappSettings.defaultMessage")}</Label>
        <Textarea value={cfg.default_message} onChange={(e) => set("default_message", e.target.value)} rows={4} disabled={!canEdit} />
      </div>

      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{t("whatsappSettings.secureNote")}</span>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {saving ? t("common.saving") : t("whatsappSettings.save")}
          </Button>
          {saved && <span className="text-sm text-emerald-700">{t("whatsappSettings.saved")}</span>}
        </div>
      )}
    </div>
  );
}