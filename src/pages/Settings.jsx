import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner } from "@/components/ui/erp";
import { usePermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Lock, Upload, Image as ImageIcon } from "lucide-react";
import WhatsAppSettings from "@/components/settings/WhatsAppSettings";
import BarcodeSettings from "@/components/settings/BarcodeSettings";
import HuidSettings from "@/components/settings/HuidSettings";

export default function Settings() {
  const t = useT();
  const { can } = usePermission();
  const canEdit = can("settings", "update");
  const [loading, setLoading] = useState(true);
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const list = await base44.entities.ShopSettings.list("-created_date", 1);
      setS(list[0] || { shop_name: "", invoice_prefix: "INV", invoice_sequence: 1, currency: "₹", default_language: "English", making_charge_default: 8, making_charge_type_default: "percentage", gst_enabled: true, gst_threshold_grams: 0, low_stock_threshold: 2 });
      setLoading(false);
    })();
  }, []);

  const set = (k, v) => setS({ ...s, [k]: v });

  const handleLogoUpload = async (file) => {
    if (!file) return;
    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!validTypes.includes(file.type)) { alert("Only JPG, JPEG, or PNG files are allowed"); return; }
    if (file.size > 2 * 1024 * 1024) { alert("File size must be under 2MB"); return; }
    setUploading(true);
    setLogoPreview(URL.createObjectURL(file));
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("logo_url", file_url);
    } catch (e) {
      alert("Logo upload failed: " + e.message);
      setLogoPreview(null);
    } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const action = s.id ? "update" : "create";
      const res = await base44.functions.invoke("manageSettings", { action, id: s.id || "", data: s });
      if (!res.data?.success) { alert(res.data?.error || "Save failed"); return; }
      if (res.data.settings) setS(res.data.settings);
      alert(t("settings.saved"));
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <span>Store Configuration</span>
          </span>
        }
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        actions={
          canEdit && (
            <Button
              onClick={save}
              disabled={saving || uploading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
            >
              <Save className="w-4 h-4 mr-1.5" />
              <span>{saving ? t("common.saving") : t("common.save")}</span>
            </Button>
          )
        }
      />
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 font-medium">
          <Lock className="w-4 h-4 text-amber-600" />
          <span>{t("settings.readOnly")}</span>
        </div>
      )}
      <div className="space-y-6 rounded-xl border border-border/80 bg-card p-6 shadow-2xs">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>{t("settings.shopName")} *</Label><Input value={s.shop_name || ""} onChange={(e) => set("shop_name", e.target.value)} disabled={!canEdit} /></div>
          <div><Label>{t("settings.ownerName")}</Label><Input value={s.owner_name || ""} onChange={(e) => set("owner_name", e.target.value)} disabled={!canEdit} /></div>
          <div><Label>{t("common.mobile")}</Label><Input value={s.mobile || ""} onChange={(e) => set("mobile", e.target.value)} disabled={!canEdit} /></div>
          <div><Label>Email</Label><Input value={s.email || ""} onChange={(e) => set("email", e.target.value)} disabled={!canEdit} /></div>
          <div><Label>GST Number</Label><Input value={s.gst_number || ""} onChange={(e) => set("gst_number", e.target.value)} disabled={!canEdit} /></div>
        </div>
        <div><Label>{t("common.name")}</Label><Input value={s.address || ""} onChange={(e) => set("address", e.target.value)} disabled={!canEdit} /></div>

        {/* Logo Upload */}
        <div>
          <Label>{t("settings.logo")}</Label>
          <div className="flex items-center gap-4 mt-2">
            <div className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted/30">
              {(logoPreview || s.logo_url) ? (
                <img src={logoPreview || s.logo_url} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(e) => e.target.files[0] && handleLogoUpload(e.target.files[0])} className="hidden" disabled={!canEdit || uploading} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={!canEdit || uploading}>
                <Upload className="w-3.5 h-3.5 mr-1" /> {uploading ? "Uploading..." : t("settings.logoUpload")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("settings.logoHint")}</p>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>{t("settings.invoicePrefix")}</Label><Input value={s.invoice_prefix || ""} onChange={(e) => set("invoice_prefix", e.target.value)} disabled={!canEdit} /></div>
          <div><Label>{t("settings.invoiceSequence")}</Label><Input type="number" value={s.invoice_sequence || 0} disabled className="opacity-60" /><p className="text-xs text-muted-foreground mt-1">Auto-managed by system</p></div>
          <div><Label>{t("settings.currency")}</Label><Input value={s.currency || "₹"} onChange={(e) => set("currency", e.target.value)} disabled={!canEdit} /></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>{t("settings.defaultLanguage")}</Label>
            <Select value={s.default_language} onValueChange={(v) => set("default_language", v)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["English", "Hindi", "Marathi"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("settings.defaultMaking")}</Label><Input type="number" value={s.making_charge_default || 0} onChange={(e) => set("making_charge_default", Number(e.target.value))} disabled={!canEdit} /></div>
          <div><Label>{t("settings.makingType")}</Label>
            <Select value={s.making_charge_type_default} onValueChange={(v) => set("making_charge_type_default", v)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed ₹</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>{t("settings.gstThreshold")}</Label><Input type="number" value={s.gst_threshold_grams || 0} onChange={(e) => set("gst_threshold_grams", Number(e.target.value))} disabled={!canEdit} /></div>
          <div><Label>{t("settings.lowStockThreshold")}</Label><Input type="number" value={s.low_stock_threshold || 2} onChange={(e) => set("low_stock_threshold", Number(e.target.value))} disabled={!canEdit} /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={s.gst_enabled} onChange={(e) => set("gst_enabled", e.target.checked)} disabled={!canEdit} /> {t("settings.gstEnabled")}</label></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>{t("settings.paperSize")}</Label>
            <Select value={s.invoice_paper_size || "A4"} onValueChange={(v) => set("invoice_paper_size", v)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="A4">A4 (210 × 297 mm)</SelectItem><SelectItem value="A5">A5 (148 × 210 mm)</SelectItem></SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{t("settings.paperSizeHint")}</p>
          </div>
        </div>
      </div>

      {/* Barcode Size Management */}
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h3 className="font-display text-base font-semibold">{t("settings.barcodeSizeTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("settings.barcodeSizeSubtitle")}</p>
        </div>
        <BarcodeSettings settings={s} onChange={set} canEdit={canEdit} />
      </div>

      {/* HUID Management */}
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h3 className="font-display text-base font-semibold">{t("settings.huidTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("settings.huidSubtitle")}</p>
        </div>
        <HuidSettings settings={s} onChange={set} canEdit={canEdit} />
      </div>

      <WhatsAppSettings />
    </div>
  );
}