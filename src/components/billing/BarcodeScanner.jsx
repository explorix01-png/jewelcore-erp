import React, { useState, useRef, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtNum, fmtWt3 } from "@/lib/billCalc";
import { Scan, Camera, Keyboard, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Barcode / QR scanner for billing item lookup.
// Supports: device camera (BarcodeDetector API), manual entry, and USB/Bluetooth
// keyboard-emulation scanners (handled globally via useUsbScanner in the page).
// On successful scan, displays full item details before adding to the bill.
export default function BarcodeScanner({ inventory, onAddItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState("");
  const [foundItem, setFoundItem] = useState(null);
  const [manual, setManual] = useState("");
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);

  const isSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleScan = (code) => {
    const item = inventory.find((i) => i.barcode === code || i.item_code === code || i.huid === code);
    stopCamera();
    if (!item || Number(item.quantity) <= 0) {
      setNotFound(code);
      setFoundItem(null);
      return;
    }
    setFoundItem(item);
    setNotFound("");
  };

  const detectLoop = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes && barcodes.length > 0) {
        handleScan(barcodes[0].rawValue);
        return;
      }
    } catch (e) { /* frame not ready */ }
    rafRef.current = requestAnimationFrame(detectLoop);
  }, []);

  const startCamera = async () => {
    setError("");
    setNotFound("");
    setFoundItem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      if (isSupported) {
        detectorRef.current = new window.BarcodeDetector({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"],
        });
        rafRef.current = requestAnimationFrame(detectLoop);
      }
    } catch (e) {
      setError(t("billing.cameraDenied"));
    }
  };

  const openScanner = () => {
    setOpen(true);
    setNotFound("");
    setError("");
    setFoundItem(null);
    setManual("");
    setTimeout(startCamera, 300);
  };

  const closeScanner = () => {
    stopCamera();
    setOpen(false);
    setFoundItem(null);
    setManual("");
  };

  const submitManual = () => {
    if (manual.trim()) handleScan(manual.trim());
  };

  // Graceful fallback for browsers without BarcodeDetector (iOS Safari, Firefox):
  // capture a frame, upload it, and use InvokeLLM vision to read the barcode value.
  const captureAndScan = async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    setError("");
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Capture failed");
      const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      const res = await base44.functions.invoke("scanBarcodeImage", { image_url: file_url });
      if (!res.data?.success) throw new Error(res.data?.error || "Scan failed");
      const code = (res.data.barcode || "").trim();
      if (code) handleScan(code);
      else setError("Could not read barcode from image. Try manual entry or Google Lens.");
    } catch (e) {
      setError(e.message || "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  const confirmAdd = () => {
    if (foundItem) {
      onAddItem(foundItem);
      closeScanner();
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openScanner}>
        <Camera className="w-4 h-4 mr-1" /> {t("billing.scanBarcode")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeScanner(); else setOpen(true); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scan className="w-4 h-4" /> {t("billing.scanBarcode")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {foundItem ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3">
                  <p className="text-sm font-semibold text-emerald-800 mb-2 break-words">{foundItem.item_name}</p>
                  <div className="grid grid-cols-2 gap-y-1 text-xs">
                    {foundItem.huid && <>
                      <span className="text-muted-foreground">HUID</span>
                      <span className="font-mono">{foundItem.huid}</span>
                    </>}
                    <span className="text-muted-foreground">Item Code</span>
                    <span className="font-mono">{foundItem.item_code || "—"}</span>
                    <span className="text-muted-foreground">Barcode</span>
                    <span className="font-mono">{foundItem.barcode || "—"}</span>
                    <span className="text-muted-foreground">Metal</span>
                    <span className="capitalize">{foundItem.metal_type}</span>
                    <span className="text-muted-foreground">Purity</span>
                    <span>{foundItem.purity_display || "—"}</span>
                    <span className="text-muted-foreground">Gross Wt</span>
                    <span>{fmtNum(foundItem.gross_weight)}g</span>
                    <span className="text-muted-foreground">Less Wt</span>
                    <span>{fmtNum(foundItem.stone_weight)}g</span>
                    <span className="text-muted-foreground">Net Wt</span>
                    <span>{fmtNum(foundItem.net_weight)}g</span>
                    <span className="text-muted-foreground">Fine Wt</span>
                    <span>{fmtWt3(foundItem.fine_weight)}</span>
                    <span className="text-muted-foreground">Stock</span>
                    <span>{foundItem.quantity} pcs</span>
                  </div>
                </div>
                <Button className="w-full" onClick={confirmAdd}><Check className="w-4 h-4 mr-1" /> {t("common.add")} {t("billing.item")}</Button>
                <Button variant="outline" className="w-full" onClick={() => { setFoundItem(null); setManual(""); setNotFound(""); startCamera(); }}>{t("billing.scanBarcode")}</Button>
              </div>
            ) : (
              <>
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3/4 h-1/3 border-2 border-white/80 rounded-lg" />
                  </div>
                  {!scanning && !error && (
                    <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                      {t("billing.startingCamera")}
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
                      <p className="text-sm mb-3">{error}</p>
                      <Button size="sm" variant="outline" onClick={startCamera}>{t("billing.retryCamera")}</Button>
                    </div>
                  )}
                </div>
                {!isSupported && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      {t("inventory.scannerNotSupported")}
                    </p>
                    {scanning && (
                      <Button onClick={captureAndScan} disabled={capturing} className="w-full">
                        <Camera className="w-4 h-4 mr-1" /> {capturing ? "Scanning image..." : "Capture & Scan"}
                      </Button>
                    )}
                  </div>
                )}
                {notFound && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {t("billing.itemNotAvailable")} <span className="font-mono">({notFound})</span>
                  </div>
                )}
                <div>
                  <Label className="text-xs">{t("inventory.enterManually")}</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("billing.searchBarcode")} onKeyDown={(e) => e.key === "Enter" && submitManual()} autoFocus />
                    <Button onClick={submitManual} disabled={!manual.trim()}><Keyboard className="w-4 h-4" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">{t("billing.scanHint")}</p>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeScanner}>{t("common.close")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}