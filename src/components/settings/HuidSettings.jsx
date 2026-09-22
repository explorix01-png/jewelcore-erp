import React from "react";
import { useT } from "@/lib/i18n";

// HUID Management — ON/OFF toggle for Hallmark Unique ID.
// When ON, HUID field appears on item forms and must be unique.
// When OFF, HUID is not required and existing barcode workflow continues.
export default function HuidSettings({ settings, onChange, canEdit }) {
  const t = useT();
  const enabled = settings.huid_enabled === true;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange("huid_enabled", e.target.checked)}
          disabled={!canEdit}
          className="w-4 h-4 rounded border-input"
        />
        <div>
          <span className="text-sm font-medium">{t("settings.huidEnable")}</span>
          <p className="text-xs text-muted-foreground">{t("settings.huidEnableHint")}</p>
        </div>
      </label>
      <div className={`rounded-lg border p-3 text-xs ${enabled ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-muted/40 text-muted-foreground"}`}>
        {enabled ? t("settings.huidOnNote") : t("settings.huidOffNote")}
      </div>
    </div>
  );
}