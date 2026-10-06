import { useEffect, useRef } from "react";

// Detects USB/Bluetooth barcode scanners that emulate keyboard input (keyboard-wedge).
// Scanners type characters rapidly (typically 5-25ms apart) and terminate with Enter or Tab.
// Features:
// - Configurable Enter / Tab suffix termination.
// - Duplicate scan debounce (prevents accidental double scans within 500ms).
// - Protects standard text inputs from scanner keystroke bleed.
// - Compatible with 2.4GHz wireless dongles, Bluetooth BLE scanners, and USB wired scanners.
export function useUsbScanner(onScan, {
  minLength = 3,
  maxKeyDelay = 50,
  allowedSuffixes = ["Enter", "Tab"],
  debounceMs = 500
} = {}) {
  const cbRef = useRef(onScan);
  cbRef.current = onScan;
  const lastScanRef = useRef({ code: "", time: 0 });

  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    let isScannerStream = false;

    const handler = (e) => {
      // Ignore key combos with modifier keys (Ctrl+C, Alt+Tab, Cmd+V, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      const delay = now - lastTime;
      lastTime = now;

      // If time between keystrokes exceeds maxKeyDelay, reset buffer
      if (delay > maxKeyDelay) {
        buffer = "";
        isScannerStream = false;
      } else if (buffer.length >= 1) {
        // High typing speed indicates a hardware scanner burst
        isScannerStream = true;
      }

      // Check for scan termination suffix (Enter or Tab)
      if (allowedSuffixes.includes(e.key)) {
        if (buffer.length >= minLength && isScannerStream) {
          e.preventDefault();
          e.stopPropagation();

          const scannedCode = buffer.trim();
          const last = lastScanRef.current;

          // Prevent active non-barcode input fields from being polluted by scanner burst
          const target = e.target;
          if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
            const isDedicatedBarcodeField =
              target.dataset?.barcodeInput === "true" ||
              target.name?.toLowerCase().includes("barcode") ||
              target.id?.toLowerCase().includes("barcode") ||
              target.placeholder?.toLowerCase().includes("barcode");

            if (!isDedicatedBarcodeField && typeof target.value === "string" && target.value.endsWith(scannedCode)) {
              const cleanedValue = target.value.slice(0, target.value.length - scannedCode.length);
              const proto = target.tagName === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
              const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
              if (nativeSetter) {
                nativeSetter.call(target, cleanedValue);
              } else {
                target.value = cleanedValue;
              }
              target.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }

          // Duplicate prevention debounce
          if (scannedCode !== last.code || (now - last.time) > debounceMs) {
            lastScanRef.current = { code: scannedCode, time: now };
            cbRef.current(scannedCode);
          }
        }
        buffer = "";
        isScannerStream = false;
        return;
      }

      // Collect single printable characters
      if (e.key && e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [minLength, maxKeyDelay, allowedSuffixes, debounceMs]);
}