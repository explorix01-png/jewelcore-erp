import { encode128b } from "@/lib/code128";

// Prints a FOLD-OVER jewellery barcode tag as a SINGLE PDF page with EXACT mm dimensions.
// The physical stock is TWO 20mm × 20mm sections placed SIDE-BY-SIDE.
// Unfolded physical label: 40mm wide × 20mm high (landscape).
// Fold line: vertical at X = 20mm (internal reference only — NOT printed on production label).
//
// Layout (one horizontal strip, landscape):
//   0 mm         20 mm         40 mm
//   |  FRONT PANEL | BACK PANEL  |
//   | shop/item/code| item details|
//   |  (20 × 20mm)  | (20 × 20mm) |
//
// Front panel (X 0–20mm): shop name, item name, Code128 or QR code, identifier value
// Back  panel (X 20–40mm): item name, HUID, code, GW, LW, NW, Purity, Fine
//
// After folding at the vertical 20mm center, final folded tag = 20mm × 20mm.
//
// All applicable Barcode Settings flow through to the physical PDF output:
//   - barcode_type        → code128 or qr
//   - barcode_width       → bar module width (setting × 0.1mm, capped to fit panel)
//   - barcode_height      → barcode height in mm (setting / 3.78, capped to fit panel)
//   - barcode_font_size   → text font size in pt (capped to fit panel)
//
// Opens the PDF with auto-print enabled for direct TSC TE244 printing.
export async function printBarcodeLabel(item, settings) {
  if (!item || !item.barcode) {
    alert("No barcode to print.");
    return;
  }

  try {
    const { jsPDF } = await import("jspdf");

    // --- Physical label dimensions (mm) — FIXED 40 × 20mm landscape ---
    // Two 20×20mm panels side-by-side. Fold at vertical center (X = 20mm).
    const panelWidth = 20;   // each panel = 20mm wide
    const panelHeight = 20;  // each panel = 20mm high
    const pageWidth = panelWidth * 2;  // 40mm total
    const pageHeight = panelHeight;    // 20mm total
    const foldX = panelWidth;           // vertical fold at X = 20mm (internal, not printed)

    // --- Barcode settings (all flow through to output) ---
    const barcodeType = settings?.barcode_type || "code128";
    const barWidthSetting = Number(settings?.barcode_width) || 2;   // 1-5 scale
    const barcodeHeightSetting = Number(settings?.barcode_height) || 60; // px
    const fontSetting = Number(settings?.barcode_font_size) || 14;  // pt

    // Convert settings to physical mm values
    // barWidthSetting × 0.1mm = module width (2 → 0.2mm, scannable at 203 DPI)
    // barcodeHeightSetting / 3.78 px→mm (60 → ~15.9mm, fits 20mm panel)
    const userModuleMm = barWidthSetting * 0.1;
    const userBarcodeHeightMm = barcodeHeightSetting / 3.78;

    // Create PDF with EXACT label dimensions in mm (landscape: width > height)
    // format: [width, height] = [40, 20]. orientation: "landscape" ensures
    // jsPDF keeps width > height (no swap since 40 > 20). The resulting PDF
    // page is exactly 40mm wide × 20mm high with NO /Rotate attribute.
    const doc = new jsPDF({
      unit: "mm",
      format: [pageWidth, pageHeight],
      orientation: "landscape",
      compress: true,
    });

    // Force the PDF viewer to print at ACTUAL SIZE (40×20mm) — no scaling,
    // no "Fit to Page", no auto-rotate to A4/Letter. This prevents the
    // browser's print dialog from scaling/rotating the small landscape page
    // to fit a portrait sheet, which would produce a vertical strip.
    doc.viewerPreferences({
      PrintScaling: "None",
      PickTrayByPDFSize: true,
    });

    const pw = doc.internal.pageSize.getWidth();   // = 40mm
    const ph = doc.internal.pageSize.getHeight();  // = 20mm
    const padding = 0.5; // mm — small safe margin inside panel boundaries

    // Font sizes: use user setting, capped to fit the 20mm panel height
    const maxShopPt = (panelHeight * 0.14) / 0.353;
    const maxItemPt = (panelHeight * 0.11) / 0.353;
    const maxMonoPt = (panelHeight * 0.10) / 0.353;
    const maxBackPt = (panelHeight * 0.07) / 0.353; // ~18% smaller — item-details font reduction
    const shopNamePt = Math.max(3, Math.min(fontSetting, maxShopPt));
    const itemNamePt = Math.max(2.5, Math.min(fontSetting * 0.8, maxItemPt));
    const monoPt = Math.max(2.5, Math.min(fontSetting * 0.7, maxMonoPt));
    const backPt = Math.max(2.5, Math.min(fontSetting * 0.65, maxBackPt));

    const esc = (s) => String(s || "");

    // === FRONT PANEL (X: 0 to 20mm, Y: 0 to 20mm) ===
    const contentShiftX = 2; // mm — shift entire content block right to use blank area
    const frontCenterX = panelWidth / 2 + contentShiftX; // X = 12mm — shifted right
    let y = padding;

    // Shop name (top, centered within front panel, bold)
    if (settings?.shop_name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(shopNamePt);
      doc.text(esc(settings.shop_name), frontCenterX, y + shopNamePt * 0.353 * 0.75, { align: "center" });
      y += shopNamePt * 0.353 + 0.15;
    }

    // Item name (centered within front panel)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(itemNamePt);
    doc.text(esc(item.item_name), frontCenterX, y + itemNamePt * 0.353 * 0.75, { align: "center" });
    y += itemNamePt * 0.353 + 0.15;

    // Barcode or QR code — fits between current y and the value text at the bottom of front panel
    const valueTextHeight = monoPt * 0.353 + 0.2;
    const codeAreaTop = y;
    const codeAreaBottom = pageHeight - padding - valueTextHeight;
    const codeAreaHeight = Math.max(2, codeAreaBottom - codeAreaTop);
    const codeAreaWidth = panelWidth - 2 * padding; // available width within front panel

    if (barcodeType === "qr") {
      // QR code — square, centered within front panel code area
      const QRModule = await import("qrcode");
      const QRCode = QRModule.default || QRModule;
      const qrSize = Math.min(codeAreaWidth, codeAreaHeight);
      const qrX = frontCenterX - qrSize / 2;
      const qrY = codeAreaTop + (codeAreaHeight - qrSize) / 2;
      const dataUrl = await QRCode.toDataURL(item.barcode, { width: 300, margin: 1, errorCorrectionLevel: "M" });
      doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } else {
      // Code 128 barcode — bars drawn directly as PDF rectangles for crisp output
      const patterns = encode128b(item.barcode);
      let totalModules = 20; // 10-module quiet zone each side
      patterns.forEach((p) => { totalModules += p.split("").reduce((a, b) => a + (+b), 0); });

      // Module width: use user setting, capped to fit front panel width
      const maxModuleMm = codeAreaWidth / totalModules;
      const moduleMm = Math.min(userModuleMm, maxModuleMm);

      // Barcode height: use user setting, capped to fit available height
      const barcodeHeightMm = Math.min(userBarcodeHeightMm, codeAreaHeight);

      // Center the barcode horizontally and vertically within the front panel code area
      const barcodeWidth = totalModules * moduleMm;
      const barcodeX = frontCenterX - barcodeWidth / 2 + 10 * moduleMm; // left quiet zone offset
      const barcodeY = codeAreaTop + (codeAreaHeight - barcodeHeightMm) / 2;

      let barX = barcodeX;
      patterns.forEach((p) => {
        p.split("").forEach((d, i) => {
          const w = +d * moduleMm;
          if (i % 2 === 0) {
            doc.rect(barX, barcodeY, w, barcodeHeightMm, "F"); // F = fill black
          }
          barX += w;
        });
      });
    }

    // Barcode value (bottom of front panel, centered, monospace)
    doc.setFont("courier", "normal");
    doc.setFontSize(monoPt);
    doc.text(esc(item.barcode), frontCenterX, pageHeight - padding, { align: "center" });

    // === BACK PANEL (X: 20mm to 40mm, Y: 0 to 20mm) ===
    const backItems = [
      ["Item", esc(item.item_name) || "—"],
      ["HUID", esc(item.huid) || "—"],
      ["Code", esc(item.item_code) || "—"],
      ["GW", `${Number(item.gross_weight || 0).toFixed(3)}g`],
      ["LW", `${Number(item.stone_weight || 0).toFixed(3)}g`],
      ["NW", `${Number(item.net_weight || 0).toFixed(3)}g`],
      ["Purity", esc(item.purity_display) || "—"],
      ["Fine", `${Number(item.fine_weight || 0).toFixed(3)}g`],
    ];

    const backAreaTop = padding;
    const backAreaHeight = pageHeight - padding - backAreaTop;
    const rowHeight = backAreaHeight / backItems.length;
    const labelColX = foldX + padding + contentShiftX;                       // X = 22.5mm — shifted right
    const valueColX = foldX + padding + panelWidth * 0.35 + contentShiftX;   // X ≈ 29.5mm — shifted right

    doc.setFontSize(backPt);
    backItems.forEach((row, i) => {
      const rowY = backAreaTop + i * rowHeight + backPt * 0.353 * 0.75;
      doc.setFont("helvetica", "bold");
      doc.text(row[0], labelColX, rowY);
      doc.setFont("helvetica", "normal");
      doc.text(row[1], valueColX, rowY);
    });

    // NOTE: The vertical fold line at X = 20mm is an internal reference only.
    // It is NOT drawn on the production label (requirement #4).

    // Download the PDF directly. The autoPrint action is embedded in the PDF,
    // so when opened in any standards-compliant PDF viewer (Adobe Acrobat, etc.)
    // it will trigger printing immediately at the correct 40×20mm size.
    // This bypasses the browser's built-in PDF viewer, which may auto-rotate
    // or scale the small landscape page to fit a portrait sheet.
    doc.autoPrint();
    doc.save(`barcode-${item.barcode}.pdf`);
  } catch (e) {
    console.error("Barcode print error:", e);
    alert("Failed to generate barcode label: " + (e.message || e));
  }
}