import React from "react";
import { buildSvgString } from "@/lib/code128";

// Renders a real, scannable Code 128B barcode as SVG (not monospace text).
// High contrast, proper quiet zones, crisp edges — suitable for printing and
// recognition by phone cameras, barcode scanners and Google Lens.
// Accepts size props from ShopSettings for jewellery-label-friendly sizing.
export default function Code128Barcode({ value, height = 60, moduleWidth = 2, fontSize = 14, showText = true, className }) {
  if (!value) return null;
  let svg;
  try {
    svg = buildSvgString(value, { height, moduleWidth });
  } catch (e) {
    return <div className="text-xs text-red-600">{e.message}</div>;
  }
  return (
    <div className={className} style={{ background: "#fff", padding: 12, display: "inline-block", borderRadius: 4 }}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {showText && (
        <div className="text-center font-mono mt-1.5 tracking-wider" style={{ fontSize: `${fontSize}px` }}>{value}</div>
      )}
    </div>
  );
}