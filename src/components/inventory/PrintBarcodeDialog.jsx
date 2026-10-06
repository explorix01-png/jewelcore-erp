import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Download, CheckCircle2, Info } from "lucide-react";
import { generateBarcodeSvg, printLabelDirect, downloadBarcodePdf } from "@/lib/printBarcode";

/**
 * Interactive Print Preview & Printing Modal for TSC TE244 (40mm × 20mm).
 * Renders an exact-scale WYSIWYG preview of both 20×20mm panels side-by-side.
 * Supports configurable roll tail offset (e.g. +20mm for dumbbell tags loaded tail-first).
 */
export default function PrintBarcodeDialog({ open, onClose, item, settings }) {
  const [copies, setCopies] = useState(1);
  const [svgHtml, setSvgHtml] = useState("");
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  
  // Default to 48mm offset for dumbbell tags (matching Image 1 on 95mm carrier roll), or user's saved setting
  const initialOffset = (settings?.barcode_offset_x !== undefined && Number(settings.barcode_offset_x) !== 20)
    ? Number(settings.barcode_offset_x)
    : 48;
  const [offsetX, setOffsetX] = useState(initialOffset);

  const barcodeType = settings?.barcode_type || "code128";
  const barcodeValue = item?.barcode || item?.item_code || "";

  useEffect(() => {
    if (open && barcodeValue) {
      generateBarcodeSvg(barcodeValue, barcodeType).then(setSvgHtml);
      setCopies(1);
      setPrintSuccess(false);
      const saved = (settings?.barcode_offset_x !== undefined && Number(settings.barcode_offset_x) !== 20)
        ? Number(settings.barcode_offset_x)
        : 48;
      setOffsetX(saved);
    }
  }, [open, barcodeValue, barcodeType, settings]);

  if (!item) return null;

  const shopName = settings?.shop_name || "";
  const itemName = item.item_name || "Jewellery Item";
  const huid = item.huid || "—";
  const itemCode = item.item_code || "—";
  const purity = item.purity_display || item.purity || "—";
  const gw = `${Number(item.gross_weight || 0).toFixed(3)}g`;
  const lw = `${Number(item.stone_weight ?? item.less_weight ?? 0).toFixed(3)}g`;
  const nw = `${Number(item.net_weight || 0).toFixed(3)}g`;
  const fine = `${Number(item.fine_weight || 0).toFixed(3)}g`;
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
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

        <div className="space-y-4 py-2">
          {/* Hardware & Calibration Hint */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>TSC TE244 Setup for Jewellery Tags (Image 1 Calibration)</span>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              In Windows Print Dialog, select <strong>TSC TE244</strong>. Set Scale to <strong>100% / Actual Size</strong> and Margins to <strong>None (0mm)</strong>.
              For dumbbell tag rolls (95mm roll carrier), use <strong>Dumbbell Tag (+48mm Offset)</strong> so the content lands directly inside the 45×20mm jewellery tag body.
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
                Tag Layout Preview (45mm × 20mm Content Box — Image 1 Specification)
              </Label>
              <span className="text-[11px] text-muted-foreground">
                2-Column Layout (Identification | Weights & Codes)
              </span>
            </div>

            {/* Scaled Preview Shell */}
            <div className="border-2 border-slate-300 rounded-xl bg-slate-100 p-4 flex flex-col items-center justify-center shadow-inner overflow-x-auto">
              <div className="flex items-center select-none py-1">
                {/* Visual Representation of Tail if offset > 0 */}
                {offsetX > 0 && (
                  <div
                    className="flex flex-col items-center justify-center bg-slate-200 border border-slate-300 border-r-0 rounded-l-md text-[9px] font-mono text-slate-500 text-center px-1"
                    style={{ width: `${Math.min(130, offsetX * 3)}px`, height: "36px" }}
                    title="Non-printable tail strip wraps around jewellery"
                  >
                    <span className="text-[8px] font-bold uppercase tracking-tight text-slate-600">Tail ({offsetX}mm)</span>
                    <span className="text-[7px] text-slate-500">No print zone</span>
                  </div>
                )}

                {/* 45mm × 20mm Printable Tag (Ratio 45:20 = 450px × 200px) */}
                <div
                  className="bg-white rounded-md shadow-md border border-slate-400 overflow-hidden flex flex-row relative select-none"
                  style={{ width: "450px", height: "200px" }}
                >
                  {/* LEFT PANEL (22.5mm × 20mm) - FRONT / IDENTIFICATION & BARCODE */}
                  <div className="w-1/2 h-full p-2.5 flex flex-col justify-between items-stretch text-left border-r border-dashed border-slate-500 relative">
                    <div className="w-full">
                      {shopName && (
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-900 truncate">
                          {shopName}
                        </p>
                      )}
                      <p className="text-[11px] font-bold text-slate-900 truncate mt-0.5">
                        {itemName}
                      </p>
                    </div>

                    {/* High contrast barcode graphic */}
                    <div className="w-full h-16 flex items-center justify-center py-0.5">
                      {svgHtml ? (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: svgHtml }}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground animate-pulse">
                          Rendering {barcodeType}...
                        </div>
                      )}
                    </div>

                    <div className="w-full space-y-0.5 text-[10px]">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-slate-700">Purity:</span>
                        <span className="font-bold text-amber-700 truncate">{purity}</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-slate-700">HUID:</span>
                        <span className="font-mono font-bold text-slate-950 truncate">{huid}</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT PANEL (22.5mm × 20mm) - BACK / WEIGHTS & CODE */}
                  <div className="w-1/2 h-full p-2.5 flex flex-col justify-center text-left bg-white relative">
                    <table className="w-full text-[10px] leading-tight border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="font-bold text-slate-900 w-12 py-1">GW</td>
                          <td className="text-slate-800 py-1">{gw}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="font-bold text-slate-900 py-1">LW</td>
                          <td className="text-slate-800 py-1">{lw}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="font-bold text-slate-900 py-1">NW</td>
                          <td className="font-bold text-slate-950 py-1">{nw}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="font-bold text-slate-900 py-1">Fine</td>
                          <td className="text-slate-800 py-1">{fine}</td>
                        </tr>
                        <tr>
                          <td className="font-bold text-slate-900 py-1">Code</td>
                          <td className="font-mono font-bold text-slate-950 py-1">{itemCode}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
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

        <DialogFooter className="gap-2 sm:gap-0">
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
