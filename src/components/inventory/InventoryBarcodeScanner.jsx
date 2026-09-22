import React, { useState, useRef, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scan, Keyboard, Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Mobile-friendly barcode scanner for inventory lookup.
// Uses the native BarcodeDetector API (Android Chrome) where available, with a
// manual-entry fallback for browsers without camera scanning (e.g. iOS Safari).
export default function InventoryBarcodeScanner({ open, onClose, onFound }) {
  const t = useT();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
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

  const handleDetected = useCallback((code) => {
    stopCamera();
    onFound(code);
  }, [onFound, stopCamera]);

  const detectLoop = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes && barcodes.length > 0) {
        handleDetected(barcodes[0].rawValue);
        return;
      }
    } catch (e) { /* frame not ready */ }
    rafRef.current = requestAnimationFrame(detectLoop);
  }, [handleDetected]);

  const startCamera = async () => {
    setError("");
    setManual("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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

  useEffect(() => {
    if (open) {
      const id = setTimeout(startCamera, 200);
      return () => clearTimeout(id);
    } else {
      stopCamera();
    }
  }, [open]);

  const submitManual = () => {
    if (manual.trim()) {
      stopCamera();
      onFound(manual.trim());
    }
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
      if (code) { stopCamera(); onFound(code); }
      else setError("Could not read barcode from image. Try manual entry or Google Lens.");
    } catch (e) {
      setError(e.message || "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { stopCamera(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scan className="w-4 h-4" /> {t("inventory.scanBarcode")}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-1/3 border-2 border-white/80 rounded-lg" />
            </div>
            {!scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm">{t("billing.startingCamera")}</div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center">
                <p className="text-sm mb-3">{error}</p>
                <Button size="sm" variant="outline" onClick={startCamera}>{t("billing.retryCamera")}</Button>
              </div>
            )}
          </div>
          {!isSupported && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{t("inventory.scannerNotSupported")}</p>
              {scanning && (
                <Button onClick={captureAndScan} disabled={capturing} className="w-full">
                  <Camera className="w-4 h-4 mr-1" /> {capturing ? "Scanning image..." : "Capture & Scan"}
                </Button>
              )}
            </div>
          )}
          <div className="mt-3">
            <Label className="text-xs">{t("inventory.enterManually")}</Label>
            <div className="flex gap-2 mt-1">
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("inventory.barcodePlaceholder")} onKeyDown={(e) => e.key === "Enter" && submitManual()} />
              <Button onClick={submitManual} disabled={!manual.trim()}><Keyboard className="w-4 h-4" /> {t("common.search")}</Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { stopCamera(); onClose(); }}>{t("common.close")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}