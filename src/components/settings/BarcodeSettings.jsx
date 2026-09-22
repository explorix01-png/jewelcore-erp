import React from "react";
import { useT } from "@/lib/i18n";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Code128Barcode from "@/components/Code128Barcode";

// Fold-over tag presets.
// Width = tag width (narrow dimension). Height = total unfolded height (front + back).
// Fold position = height / 2.
const PRESETS = {
  small: { width: 2, height: 50, fontSize: 11, labelWidth: 18, labelHeight: 36 },
  medium: { width: 2, height: 60, fontSize: 14, labelWidth: 20, labelHeight: 40 },
  custom: { width: 2, height: 60, fontSize: 14, labelWidth: 20, labelHeight: 40 },
};

// Barcode Size Management — configures fold-over jewellery tag dimensions.
// All settings (bar width, height, font size, label width/height, barcode type) flow
// through to the print output. Preview reflects the saved settings with a fold boundary.
export default function BarcodeSettings({ settings, onChange, canEdit }) {
  const t = useT();
  const preset = settings.barcode_preset || "medium";
  const width = Number(settings.barcode_width) || 2;
  const height = Number(settings.barcode_height) || 60;
  const fontSize = Number(settings.barcode_font_size) || 14;
  const labelWidth = Number(settings.barcode_label_width) || 20;
  const labelHeight = Number(settings.barcode_label_height) || 40;
  const barcodeType = settings.barcode_type || "code128";

  const applyPreset = (p) => {
    if (p === "custom") {
      onChange("barcode_preset", "custom");
    } else {
      const cfg = PRESETS[p];
      onChange("barcode_preset", p);
      onChange("barcode_width", cfg.width);
      onChange("barcode_height", cfg.height);
      onChange("barcode_font_size", cfg.fontSize);
      onChange("barcode_label_width", cfg.labelWidth);
      onChange("barcode_label_height", cfg.labelHeight);
    }
  };

  const setCustom = (field, val) => {
    onChange(field, val);
    onChange("barcode_preset", "custom");
  };

  // Preview: scale the unfolded tag to fit within a ~280px wide area.
  // 1mm ≈ 3.78px at 96dpi.
  const pxPerMm = 3.78;
  const maxPreviewW = 280;
  const naturalW = labelWidth * pxPerMm;
  const scale = Math.min(1, maxPreviewW / naturalW);
  const previewW = naturalW * scale;
  const previewH = labelHeight * pxPerMm * scale;
  const foldPx = (labelHeight / 2) * pxPerMm * scale;
  const previewShopFont = Math.max(5, fontSize * scale * 0.5);
  const previewItemFont = Math.max(4, fontSize * scale * 0.4);
  const previewValueFont = Math.max(3.5, fontSize * scale * 0.32);
  const previewBarHeight = Math.max(10, height * scale * 0.3);
  const previewBarModule = Math.max(0.8, width * scale * 0.5);
  const previewBackFont = Math.max(3.5, fontSize * scale * 0.32);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">{t("settings.barcodeType")}</Label>
        <Select value={barcodeType} onValueChange={(v) => setCustom("barcode_type", v)} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="code128">{t("settings.barcodeTypeCode128")}</SelectItem>
            <SelectItem value="qr">{t("settings.barcodeTypeQR")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t("settings.barcodePreset")}</Label>
        <Select value={preset} onValueChange={applyPreset} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="small">{t("settings.barcodePresetSmall")}</SelectItem>
            <SelectItem value="medium">{t("settings.barcodePresetMedium")}</SelectItem>
            <SelectItem value="custom">{t("settings.barcodePresetCustom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">{t("settings.barcodeWidth")}</Label>
          <Input type="number" step="0.5" min="1" max="5" value={width} onChange={(e) => setCustom("barcode_width", Number(e.target.value))} disabled={!canEdit} />
        </div>
        <div>
          <Label className="text-xs">{t("settings.barcodeHeight")}</Label>
          <Input type="number" step="5" min="20" max="200" value={height} onChange={(e) => setCustom("barcode_height", Number(e.target.value))} disabled={!canEdit} />
        </div>
        <div>
          <Label className="text-xs">{t("settings.barcodeFontSize")}</Label>
          <Input type="number" step="1" min="8" max="30" value={fontSize} onChange={(e) => setCustom("barcode_font_size", Number(e.target.value))} disabled={!canEdit} />
        </div>
        <div>
          <Label className="text-xs">{t("settings.barcodeLabelWidth")}</Label>
          <Input type="number" step="1" min="10" max="100" value={labelWidth} onChange={(e) => setCustom("barcode_label_width", Number(e.target.value))} disabled={!canEdit} />
        </div>
        <div>
          <Label className="text-xs">{t("settings.barcodeLabelHeight")}</Label>
          <Input type="number" step="1" min="20" max="100" value={labelHeight} onChange={(e) => setCustom("barcode_label_height", Number(e.target.value))} disabled={!canEdit} />
        </div>
      </div>
      {/* Fold-over tag preview — front (top) + fold + back (bottom) */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground mb-3">
          {t("settings.barcodePreview")} — {labelWidth}×{labelHeight}mm ({t("settings.barcodeFoldOver")})
        </p>
        <div className="flex justify-center">
          <div
            style={{ width: `${previewW}px`, height: `${previewH}px` }}
            className="bg-white border-2 border-gray-400 rounded overflow-hidden shadow-sm relative"
          >
            {/* FRONT HALF (top) */}
            <div
              style={{ height: `${foldPx}px` }}
              className="flex flex-col items-center justify-between px-1 py-0.5 overflow-hidden"
            >
              <div className="text-center font-bold leading-tight truncate w-full" style={{ fontSize: `${previewShopFont}px` }}>
                {settings.shop_name || "Shop Name"}
              </div>
              <div className="text-center leading-tight truncate w-full" style={{ fontSize: `${previewItemFont}px` }}>
                Item Name
              </div>
              <div className="flex-1 flex items-center justify-center overflow-hidden w-full">
                {barcodeType === "qr" ? (
                  <div className="border border-black flex items-center justify-center" style={{ width: `${previewBarHeight * 1.2}px`, height: `${previewBarHeight * 1.2}px`, fontSize: `${previewValueFont}px` }}>
                    QR
                  </div>
                ) : (
                  <Code128Barcode value="B0001468" height={previewBarHeight} moduleWidth={previewBarModule} fontSize={previewValueFont} showText={false} />
                )}
              </div>
              <div className="font-mono text-center leading-tight w-full" style={{ fontSize: `${previewValueFont}px` }}>B0001468</div>
            </div>
            {/* FOLD LINE (dashed, preview only — not printed) */}
            <div className="absolute left-0 right-0 border-t border-dashed border-blue-400" style={{ top: `${foldPx}px` }}>
              <span className="absolute -top-2.5 right-1 text-[8px] text-blue-500 bg-white px-0.5">{t("settings.barcodeFold")}</span>
            </div>
            {/* BACK HALF (bottom) */}
            <div
              style={{ height: `${previewH - foldPx}px` }}
              className="px-1 py-0.5 overflow-hidden text-left"
            >
              <div className="space-y-0.5" style={{ fontSize: `${previewBackFont}px` }}>
                <div className="flex justify-between"><span className="font-bold">Item</span><span className="truncate ml-1">Item Name</span></div>
                <div className="flex justify-between"><span className="font-bold">HUID</span><span>—</span></div>
                <div className="flex justify-between"><span className="font-bold">Code</span><span>—</span></div>
                <div className="flex justify-between"><span className="font-bold">GW</span><span>0.000g</span></div>
                <div className="flex justify-between"><span className="font-bold">LW</span><span>0.000g</span></div>
                <div className="flex justify-between"><span className="font-bold">NW</span><span>0.000g</span></div>
                <div className="flex justify-between"><span className="font-bold">Purity</span><span>—</span></div>
                <div className="flex justify-between"><span className="font-bold">Fine</span><span>0.000g</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* TSC TE244 Print Configuration Help */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-800 mb-2">{t("settings.barcodePrintConfigTitle")}</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>{t("settings.barcodePrintConfigSize")}</li>
          <li>{t("settings.barcodePrintConfigScale")}</li>
          <li>{t("settings.barcodePrintConfigFit")}</li>
          <li>{t("settings.barcodePrintConfigOrientation")}</li>
          <li>{t("settings.barcodePrintConfigDriver")}</li>
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.barcodeSizeHint")}</p>
    </div>
  );
}