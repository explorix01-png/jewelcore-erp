import { useEffect, useRef } from "react";

// Detects USB/Bluetooth barcode scanners that emulate keyboard input.
// Scanners type characters rapidly (typically 5-15ms apart) and end with Enter.
// Human typing is much slower (>50ms between keystrokes), so a short inter-key
// timeout distinguishes scanner input from human typing.
// The callback ref ensures the latest closure is always called without
// re-registering the event listener on every render.
export function useUsbScanner(onScan, { minLength = 3, maxKeyDelay = 35 } = {}) {
  const cbRef = useRef(onScan);
  cbRef.current = onScan;
  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    const handler = (e) => {
      // Ignore key combos with modifier keys (Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - lastTime > maxKeyDelay) buffer = "";
      lastTime = now;
      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault();
          cbRef.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [minLength, maxKeyDelay]);
}