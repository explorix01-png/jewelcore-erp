import React from "react";
import { useT } from "@/lib/i18n";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Code128Barcode from "@/components/Code128Barcode";

// Jewellery barcode tag presets calibrated for TSC TE244.
// Primary specification (Image 1): Content box 45mm × 20mm on 95mm carrier roll.
// Divided into TWO panels: Left (Item, Barcode, Purity, HUID) and Right (GW, LW, NW, Fine, Code).
const PRESETS = {
  dumbbell48: { width: 2, height: 60, fontSize: 14, labelWidth: 45, labelHeight: 20, offsetX: 48 },
  dumbbell50: { width: 2, height: 60, fontSize: 14, labelWidth: 45, labelHeight: 20, offsetX: 50 },
  standard0: { width: 2, height: 60, fontSize: 14, labelWidth: 45, labelHeight: 20, offsetX: 0 },
  legacy40: { width: 2, height: 60, fontSize: 14, labelWidth: 40, labelHeight: 20, offsetX: 20 },
  custom: { width: 2, height: 60, fontSize: 14, labelWidth: 45, labelHeight: 20, offsetX: 48 },
};

export default function BarcodeSettings({ settings, onChange, canEdit }) {
  const t = useT();
  const preset = settings.barcode_preset || "dumbbell48";
  const width = Number(settings.barcode_width) || 2;
  const height = Number(settings.barcode_height) || 60;
  const fontSize = Number(settings.barcode_font_size) || 14;
  const labelWidth = Number(settings.barcode_label_width) || 45;
  const labelHeight = Number(settings.barcode_label_height) || 20;
  const barcodeType = settings.barcode_type || "code128";
  const offsetX = (settings.barcode_offset_x !== undefined && Number(settings.barcode_offset_x) !== 20)
    ? Number(settings.barcode_offset_x)
    : 48;

  const applyPreset = (p) => {
    if (p === "custom") {
      onChange("barcode_preset", "custom");
    } else {
      const cfg = PRESETS[p] || PRESETS.dumbbell48;
      onChange("barcode_preset", p);
      onChange("barcode_width", cfg.width);
      onChange("barcode_height", cfg.height);
      onChange("barcode_font_size", cfg.fontSize);
      onChange("barcode_label_width", cfg.labelWidth);
      onChange("barcode_label_height", cfg.labelHeight);
      onChange("barcode_offset_x", cfg.offsetX);
    }
  };

  const setCustom = (field, val) => {
    onChange(field, val);
    onChange("barcode_preset", "custom");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <SelectItem value="dumbbell48">Dumbbell 45×20mm (95mm Roll / +48mm Tail Offset)</SelectItem>
              <SelectItem value="dumbbell50">Dumbbell 45×20mm (95mm Roll / +50mm Tail Offset)</SelectItem>
              <SelectItem value="standard0">Standard 45×20mm (0mm / Flaps First)</SelectItem>
              <SelectItem value="legacy40">Fold-Over 40×20mm (+20mm Offset)</SelectItem>
              <SelectItem value="custom">{t("settings.barcodePresetCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tail / Roll Alignment Offset Control */}
      <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold">Roll Tail Offset (X-Shift in mm)</Label>
            <p className="text-[11px] text-muted-foreground">
              Offsets past the narrow tail strip on dumbbell rolls (95mm carrier paper) to land directly on the 45×20mm tag body
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="0"
              max="60"
              step="1"
              value={offsetX}
              onChange={(e) => setCustom("barcode_offset_x", Math.max(0, Number(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-16 h-8 text-center text-xs font-mono font-bold"
            />
            <span className="text-xs text-muted-foreground">mm</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={offsetX === 48 ? "default" : "outline"}
            className={`text-xs h-7 ${offsetX === 48 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
            onClick={() => setCustom("barcode_offset_x", 48)}
            disabled={!canEdit}
          >
            Dumbbell 95mm (+48mm)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={offsetX === 50 ? "default" : "outline"}
            className={`text-xs h-7 ${offsetX === 50 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
            onClick={() => setCustom("barcode_offset_x", 50)}
            disabled={!canEdit}
          >
            Dumbbell 95mm (+50mm)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={offsetX === 0 ? "default" : "outline"}
            className={`text-xs h-7 ${offsetX === 0 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
            onClick={() => setCustom("barcode_offset_x", 0)}
            disabled={!canEdit}
          >
            Flaps First (0mm)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <Label className="text-xs">Tag Width (mm)</Label>
          <Input type="number" step="1" min="20" max="100" value={labelWidth} onChange={(e) => setCustom("barcode_label_width", Number(e.target.value))} disabled={!canEdit} />
        </div>
      </div>

      {/* Tag Preview — 45×20mm Image 1 Specification */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("settings.barcodePreview")} — 45×20mm (Image 1 Layout)
          </p>
          <span className="text-[11px] text-muted-foreground">
            {offsetX > 0 ? `Tail: ${offsetX}mm | Tag Body: 45×20mm (95mm Roll)` : "Direct: 45×20mm"}
          </span>
        </div>

        <div className="flex justify-center items-center py-2 overflow-x-auto">
          <div className="flex items-center">
            {/* Visual representation of tail */}
            {offsetX > 0 && (
              <div
                className="bg-slate-200 border border-slate-300 border-r-0 rounded-l flex flex-col items-center justify-center text-[8px] font-mono text-slate-500 select-none px-1 text-center"
                style={{ width: `${Math.min(120, offsetX * 2.5)}px`, height: "30px" }}
              >
                <span className="font-bold">Tail</span>
                <span>{offsetX}mm</span>
              </div>
            )}

            {/* 45mm × 20mm printable tag (ratio 45:20 = 405px × 180px) */}
            <div
              style={{ width: "405px", height: "180px" }}
              className="bg-white border-2 border-slate-400 rounded-r flex flex-row overflow-hidden shadow-sm relative select-none"
            >
              {/* LEFT HALF (22.5×20mm) - Identification & Barcode */}
              <div className="w-1/2 h-full p-2 flex flex-col justify-between items-stretch text-left border-r border-dashed border-slate-500 relative">
                <div className="w-full">
                  <div className="font-extrabold text-[9px] uppercase truncate w-full tracking-wider text-slate-900">
                    {settings.shop_name || "JEWELCORE"}
                  </div>
                  <div className="text-[10px] font-bold text-slate-800 truncate w-full mt-0.5">
                    Gold Ring Test
                  </div>
                </div>

                <div className="w-full flex-1 flex items-center justify-center overflow-hidden my-0.5">
                  {barcodeType === "qr" ? (
                    <div className="border border-black flex items-center justify-center w-12 h-12 text-[10px] font-bold">
                      QR
                    </div>
                  ) : (
                    <Code128Barcode value="B0001468" height={36} moduleWidth={1.1} fontSize={8} showText={false} />
                  )}
                </div>

                <div className="w-full text-[9px] space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-700">Purity:</span>
                    <span className="font-bold text-amber-700">22K (916)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-700">HUID:</span>
                    <span className="font-mono font-bold text-slate-950">HUID789</span>
                  </div>
                </div>
              </div>

              {/* RIGHT HALF (22.5×20mm) - Weights & Item Code */}
              <div className="w-1/2 h-full p-2 flex flex-col justify-center text-left relative bg-white">
                <table className="w-full text-[9px] leading-tight border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="font-bold text-slate-900 w-10 py-0.5">GW</td>
                      <td className="text-slate-800 py-0.5">8.084g</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="font-bold text-slate-900 py-0.5">LW</td>
                      <td className="text-slate-800 py-0.5">0.000g</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="font-bold text-slate-900 py-0.5">NW</td>
                      <td className="font-bold text-slate-950 py-0.5">8.084g</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="font-bold text-slate-900 py-0.5">Fine</td>
                      <td className="text-slate-800 py-0.5">7.405g</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-slate-900 py-0.5">Code</td>
                      <td className="font-mono font-bold text-slate-950 py-0.5">GR-001</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TSC TE244 Print Configuration Help */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-800 mb-2">TSC TE244 Driver Configuration Checklist</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li><strong>Paper Size:</strong> Set to 95.0mm (Width) × 20.0mm (Height) for Dumbbell 95mm rolls, or 45.0mm × 20.0mm for standard tag.</li>
          <li><strong>Orientation:</strong> Landscape (horizontal 95mm/45mm across thermal print head).</li>
          <li><strong>Scaling:</strong> Always select <strong>100% / Actual Size</strong> (never "Fit to Page").</li>
          <li><strong>Margins:</strong> Set Margins to <strong>None (0mm)</strong>.</li>
          <li><strong>Tail Offset:</strong> If your roll has the narrow tail on the left (Image 1), use "+48mm Tail Offset" so content prints squarely inside the 45×20mm jewellery tag.</li>
        </ul>
      </div>
    </div>
  );
}