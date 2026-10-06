import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Download, CheckCircle2, Info } from "lucide-react";
import { generateLabelHtml, printLabelDirect, downloadBarcodePdf } from "@/lib/printBarcode";

/**
 * Interactive Print Preview & Printing Modal for TSC TE244 (40mm × 20mm).
 * Renders an exact-scale WYSIWYG preview of both 20×20mm panels side-by-side.
 * Supports configurable roll tail offset (e.g. +20mm for dumbbell tags loaded tail-first).
 */
const LABEL_WIDTH_MM = 45;
const LABEL_HEIGHT_MM = 20;
const CARRIER_WIDTH_MM = 95;
const PX_PER_MM = 3.7795;
const PREVIEW_MAX_PX = 580;

export default function PrintBarcodeDialog({ open, onClose, item, settings }) {
  const [copies, setCopies] = useState(1);
  const [previewHtml, setPreviewHtml] = useState("");
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  
  // Default to 48mm offset for dumbbell tags (matching Image 1 on 95mm carrier roll), or user's saved setting
  const initialOffset = (settings?.barcode_offset_x !== undefined && Number(settings.barcode_offset_x) !== 20)
    ? Number(settings.barcode_offset_x)
    : 48;
  const [offsetX, setOffsetX] = useState(initialOffset);

  // Fit the preview to the actual width of its container so it never needs a scrollbar.
  const [previewBoxEl, setPreviewBoxEl] = useState(null);
  const [previewMaxPx, setPreviewMaxPx] = useState(PREVIEW_MAX_PX);
  useEffect(() => {
    if (!previewBoxEl) return;
    const update = () => {
      const w = previewBoxEl.clientWidth;
      if (w > 0) setPreviewMaxPx(Math.min(PREVIEW_MAX_PX, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(previewBoxEl);
    return () => ro.disconnect();
  }, [previewBoxEl]);

  const barcodeType = settings?.barcode_type || "code128";
  const barcodeValue = item?.barcode || item?.item_code || "";

  useEffect(() => {
    if (open && barcodeValue) {
      setCopies(1);
      setPrintSuccess(false);
      const saved = (settings?.barcode_offset_x !== undefined && Number(settings.barcode_offset_x) !== 20)
        ? Number(settings.barcode_offset_x)
        : 48;
      setOffsetX(saved);
    }
  }, [open, barcodeValue, barcodeType, settings]);

  useEffect(() => {
    if (!open || !item || !barcodeValue) return;
    let cancelled = false;
    generateLabelHtml(item, settings, 1, {
      offsetX, labelWidth: LABEL_WIDTH_MM, labelHeight: LABEL_HEIGHT_MM, preview: true,
    }).then((html) => { if (!cancelled) setPreviewHtml(html); });
    return () => { cancelled = true; };
  }, [open, item, settings, offsetX, barcodeValue]);

  if (!item) return null;

  const totalWidthMm = offsetX > 0 ? Math.max(CARRIER_WIDTH_MM, offsetX + LABEL_WIDTH_MM) : LABEL_WIDTH_MM;
  const previewScale = Math.min(3.2, previewMaxPx / (totalWidthMm * PX_PER_MM));
  const previewWidthPx = Math.round(totalWidthMm * PX_PER_MM * previewScale);
  const previewHeightPx = Math.round(LABEL_HEIGHT_MM * PX_PER_MM * previewScale);
  const stockQty = Number(item.quantity) || 1;

  const handlePrint = async () => {
    setPrinting(true);
    setPrintSuccess(false);
    try {
      const ok = await printLabelDirect(item, settings, copies, { offsetX, labelWidth: 45, labelHeight: 20 });
      if (ok) {
        setPrintSuccess(true);
        setTimeout(() => setPrintSuccess(false), 5000);
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBarcodePdf(item, settings, copies, { offsetX, labelWidth: 45, labelHeight: 20 });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] !flex flex-col gap-3 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Printer className="w-5 h-5 text-amber-600" />
              <span>Print Barcode Label</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-mono text-[11px]">
                TSC TE244 (203 DPI)
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px]">
                45mm × 20mm Tag (Image 1)
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                95mm Roll Carrier
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          {/* Hardware & Calibration Hint */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs">
            <p className="text-amber-800 text-[11px] leading-snug flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" />
              <span>
                Select <strong>TSC TE244</strong>, Scale <strong>100%</strong>, Margins <strong>None</strong>.
                For dumbbell rolls (95mm carrier) use <strong>+48mm Offset</strong>.
              </span>
            </p>
          </div>

          {/* Roll Alignment / Tail Offset Selector */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Roll Loading & Tail Offset</Label>
              <span className="text-[11px] text-muted-foreground font-mono">
                Current Offset: {offsetX}mm
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={offsetX === 48 ? "default" : "outline"}
                className={`text-xs h-8 ${offsetX === 48 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                onClick={() => setOffsetX(48)}
              >
                Dumbbell Tag (+48mm Tail Offset)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={offsetX === 50 ? "default" : "outline"}
                className={`text-xs h-8 ${offsetX === 50 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                onClick={() => setOffsetX(50)}
              >
                Dumbbell Tag (+50mm Tail Offset)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={offsetX === 0 ? "default" : "outline"}
                className={`text-xs h-8 ${offsetX === 0 ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                onClick={() => setOffsetX(0)}
              >
                Standard (0mm / Flaps First)
              </Button>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-muted-foreground">Custom:</span>
                <Input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={offsetX}
                  onChange={(e) => setOffsetX(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 h-8 text-center text-xs font-mono font-bold"
                />
                <span className="text-xs text-muted-foreground">mm</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {offsetX > 0
                ? "Spaces past the non-printable 45mm tail strip on 95mm carrier paper so the content prints squarely inside the 45×20mm jewellery tag."
                : "Standard printing starting directly at the 0mm edge (use if roll is loaded flaps first, or printer driver already has a left margin)."}
            </p>
          </div>

          {/* WYSIWYG Label Preview (45mm × 20mm Content Box) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Tag Preview (45mm × 20mm)
              </Label>
              <span className="text-[11px] text-muted-foreground">
                2-Column Layout (Identification | Weights & Codes)
              </span>
            </div>

            {/* Exact-scale preview rendered from the same HTML that gets printed */}
            <div className="border-2 border-slate-300 rounded-xl bg-slate-100 p-3 shadow-inner overflow-hidden">
              <div ref={setPreviewBoxEl} className="w-full">
              <div style={{ width: previewWidthPx, height: previewHeightPx, margin: "0 auto", overflow: "hidden" }}>
                <iframe
                  title="Label preview"
                  scrolling="no"
                  srcDoc={previewHtml}
                  style={{
                    width: `${totalWidthMm}mm`,
                    height: `${LABEL_HEIGHT_MM}mm`,
                    border: "none",
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                />
              </div>
              </div>
              {copies > 1 && (
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  {copies} identical labels will be printed
                </p>
              )}
            </div>
          </div>

          {/* Controls: Copies & Presets */}
          <div className="rounded-xl border p-3.5 bg-card space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <Label className="text-xs font-semibold">Print Copies</Label>
                <p className="text-[11px] text-muted-foreground">
                  Number of sequential labels to feed through the TSC TE244 roll
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  disabled={copies <= 1}
                >
                  -
                </Button>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 h-8 text-center font-bold text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCopies((c) => c + 1)}
                >
                  +
                </Button>

                {/* Quick Stock Preset */}
                {stockQty > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs ml-1"
                    onClick={() => setCopies(stockQty)}
                  >
                    Stock ({stockQty})
                  </Button>
                )}
              </div>
            </div>
          </div>

          {printSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Print dialog launched! Select your <strong>TSC TE244</strong> printer to print the label.</span>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={printing || downloading}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={downloading || printing}
            className="border"
          >
            <Download className="w-4 h-4 mr-1.5" />
            {downloading ? "Generating PDF..." : "Download PDF (45×20mm)"}
          </Button>
          <Button
            onClick={handlePrint}
            disabled={printing || downloading}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            {printing ? "Launching Dialog..." : `Print Label (TSC TE244)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
