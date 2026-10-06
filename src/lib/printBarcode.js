import { encode128b } from "./code128.js";
import QRCode from "qrcode";

// Prints a jewellery barcode tag calibrated for TSC TE244 matching Image 1 specification.
// Primary content box: 45mm wide × 20mm high (landscape).
// Divided into TWO COLUMNS / PANELS separated by a dashed divider:
//   - LEFT / FRONT PANEL (22.5mm × 20mm): Shop Name, Item Name, Machine-Readable Barcode (Code128 / QR), Purity, HUID
//   - RIGHT / BACK PANEL (22.5mm × 20mm): GW, LW, NW, Fine Weight, Item Code
//
// Carrier / Paper Roll (Image 1 "page - 9.5 cm"):
//   Total roll liner width: 95mm.
//   Tag stock has a 45mm tail on the left and a 45mm tag body on the right (total label: 90mm = "9 cm").
//   When roll is loaded with narrow tail on left:
//     Tail offset (offsetX) = 48mm (or 50mm) positions the 45mm × 20mm tag body squarely on the printable flap.
//   When tag stock is standard or flaps-first:
//     offsetX = 0mm prints directly at the left edge.

const esc = (s) => String(s || "").trim();

// Largest font size (pt) at which `chars` monospace characters fit in `widthMm`, clamped to [minPt, maxPt].
// 1pt = 0.3528mm; bold monospace glyphs are ~0.62em wide.
const INLINE_CODE_WIDTH_MM = 10; // value column beside the 10mm label column
const MIN_INLINE_CODE_PT = 5;
const fitMonoPt = (chars, widthMm, maxPt, minPt) => {
  const fit = widthMm / (Math.max(1, chars) * 0.62 * 0.3528);
  return Math.min(maxPt, Math.max(minPt, Number(fit.toFixed(2))));
};

/**
 * Generate a standalone SVG barcode string (Code 128 or QR) sized for the front panel.
 * Code 128 uses crisp vector rects with exact integer modules for 203 DPI thermal heads.
 */
export async function generateBarcodeSvg(barcodeValue, barcodeType = "code128") {
  if (!barcodeValue) return "";

  if (barcodeType === "qr") {
    try {
      const qrSvg = await QRCode.toString(barcodeValue, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        width: 80,
      });
      return qrSvg;
    } catch (e) {
      console.error("QR Code generation error:", e);
      return "";
    }
  }

  // Code 128B
  try {
    const patterns = encode128b(barcodeValue);
    let totalModules = 20; // 10 quiet modules each side
    patterns.forEach((p) => {
      totalModules += p.split("").reduce((a, b) => a + (+b), 0);
    });

    const svgHeight = 40;
    let x = 10;
    let bars = "";

    patterns.forEach((p) => {
      p.split("").forEach((d, i) => {
        const w = +d;
        if (i % 2 === 0) {
          bars += `<rect x="${x}" y="0" width="${w}" height="${svgHeight}" fill="#000000"/>`;
        }
        x += w;
      });
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${svgHeight}" width="100%" height="100%" preserveAspectRatio="none" shape-rendering="crispEdges">${bars}</svg>`;
  } catch (e) {
    console.error("Code128 SVG generation error:", e);
    return "";
  }
}

/**
 * Builds the complete print HTML document calibrated for TSC TE244 matching Image 1 (45mm × 20mm).
 * Accommodates roll tail offset (e.g. +48mm for 95mm carrier roll dumbbell stock).
 */
export async function generateLabelHtml(item, settings, copies = 1, options = {}) {
  const barcodeType = settings?.barcode_type || "code128";
  const itemName = esc(item.item_name || "Jewellery Item");
  const barcodeValue = esc(item.barcode || item.item_code || "");
  const huid = esc(item.huid || "—");
  const itemCode = esc(item.item_code || "—");
  const purity = esc(item.purity_display || item.purity || "—");
  const gw = `${Number(item.gross_weight || 0).toFixed(3)}g`;
  const lw = `${Number(item.stone_weight ?? item.less_weight ?? 0).toFixed(3)}g`;
  const nw = `${Number(item.net_weight || 0).toFixed(3)}g`;

  const barcodeSvg = await generateBarcodeSvg(barcodeValue, barcodeType);
  // Shrink long HUID / item code so they print in full instead of being clipped.
  const huidPt = fitMonoPt(huid.length + 6, 20, 6.5, 3.8);
  // Short codes sit inline beside the "Item Code" label (like the weight rows);
  // only long codes drop to their own full-width line.
  const inlineCodePt = fitMonoPt(itemCode.length, INLINE_CODE_WIDTH_MM, 6.5, 3.8);
  const codeInline = inlineCodePt >= MIN_INLINE_CODE_PT;
  const itemCodePt = codeInline ? inlineCodePt : fitMonoPt(itemCode.length, 20, 6.5, 3.8);
  const numCopies = Math.max(1, parseInt(copies, 10) || 1);

  // Label geometry:
  // Primary target from Image 1: Content box 45mm × 20mm (two 22.5mm columns).
  // Backward compatibility: If label width is explicitly 40, uses 40mm × 20mm (two 20mm columns).
  const labelWidth = Number(options?.labelWidth ?? settings?.barcode_label_width ?? 45);
  const labelHeight = Number(options?.labelHeight ?? settings?.barcode_label_height ?? 20);
  const panelWidth = (labelWidth / 2).toFixed(1);
  // Page height = tag-to-tag pitch (head + gap) so the printer feeds exactly one tag per page.
  // The tag content (labelHeight) sits at the top of each page. Defaults to labelHeight.
  const pageHeight = Math.max(labelHeight, Number(options?.pageHeight ?? settings?.barcode_label_pitch ?? labelHeight));
  // Tag heads shorter than the legacy 20mm get a tighter layout so every row stays inside the head.
  const compact = labelHeight < 18.5;

  const offsetX = Math.max(0, Number(options?.offsetX ?? settings?.barcode_offset_x ?? 0));
  const previewCss = options?.preview
    ? `html, body { overflow: hidden !important; } body { background: #e2e8f0 !important; } .tag-body { background: #ffffff; outline: 0.25mm solid #64748b; outline-offset: -0.25mm; }`
    : "";

  // Total carrier page width for TSC TE244 printer:
  // When offsetX > 0 (dumbbell roll on 95mm carrier), total page width is 95mm.
  // When offsetX === 0 (flaps first / standard label), page width matches labelWidth.
  const totalWidthMm = options?.pageWidth
    ? Number(options.pageWidth).toFixed(1)
    : (offsetX > 0 ? Math.max(95, offsetX + labelWidth).toFixed(1) : labelWidth.toFixed(1));

  let pagesHtml = "";
  for (let c = 0; c < numCopies; c++) {
    pagesHtml += `
      <div class="label-page${compact ? " compact" : ""}">
        ${offsetX > 0 ? `<div class="tail-spacer" style="width: ${offsetX}mm; height: ${labelHeight}mm; flex-shrink: 0;"></div>` : ""}

        <!-- 45mm × 20mm TAG BODY (Image 1 Specification) -->
        <div class="tag-body" style="width: ${labelWidth}mm; height: ${labelHeight}mm; flex-shrink: 0;">
          <!-- LEFT / FRONT PANEL (Identification, Barcode, Purity, HUID) -->
          <div class="panel front-panel">
            <div class="header-group">
              <div class="item-name">${itemName}</div>
            </div>
            <div class="barcode-container ${barcodeType === "qr" ? "qr-mode" : ""}">
              ${barcodeSvg}
            </div>
            <div class="meta-group">
              <div class="meta-row">
                <span class="meta-lbl">Purity:</span>
                <span class="meta-val font-bold">${purity}</span>
              </div>
              <div class="meta-row">
                <span class="meta-lbl" style="font-size: ${huidPt}pt;">HUID:</span>
                <span class="meta-val mono font-bold" style="font-size: ${huidPt}pt;">${huid}</span>
              </div>
            </div>
          </div>

          <!-- RIGHT / BACK PANEL (GW, LW, NW, Fine, Item Code) -->
          <div class="panel back-panel">
            <table class="spec-table ${codeInline ? "" : "stacked"}">
              <tr><td class="spec-lbl">Gross Wt</td><td class="spec-val">${gw}</td></tr>
              <tr><td class="spec-lbl">Less Wt</td><td class="spec-val">${lw}</td></tr>
              <tr><td class="spec-lbl">Net Wt</td><td class="spec-val font-bold">${nw}</td></tr>
              ${codeInline
                ? `<tr><td class="spec-lbl">Item Code</td><td class="spec-val mono font-bold" style="font-size: ${itemCodePt}pt;">${itemCode}</td></tr>`
                : `<tr class="code-row"><td colspan="2" class="code-cell">
                <div class="spec-lbl code-lbl">Item Code</div>
                <div class="code-val mono font-bold" style="font-size: ${itemCodePt}pt;">${itemCode}</div>
              </td></tr>`}
            </table>
          </div>
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>JewelCore ERP — Label (${barcodeValue})</title>
  <style>
    /* Exact physical size calibrated for TSC TE244 — 45mm x 20mm tag (95mm roll carrier) */
    @page {
      size: ${totalWidthMm}mm ${pageHeight}mm;
      margin: 0;
    }
    @media print {
      /* Copies flow one under another. On a 95x20mm label page each copy fills exactly one page,
         so it still prints one label per page; on a larger sheet they stack vertically. */
      html, body {
        width: ${totalWidthMm}mm;
        height: auto;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: #ffffff !important;
      }
      .label-page {
        page-break-inside: avoid;
        break-inside: avoid;
        break-after: page;
        flex-shrink: 0;
      }
      .label-page:last-child {
        break-after: auto;
      }
    }
    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      margin: 0;
      padding: 0;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #ffffff;
      color: #000000;
    }
    .label-page {
      width: ${totalWidthMm}mm;
      /* Slightly under the page height so rounding never spills a blank page (which would feed an extra tag). */
      height: ${(pageHeight - (pageHeight > labelHeight ? 0.3 : 0)).toFixed(2)}mm;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      overflow: hidden;
      background: #ffffff;
      position: relative;
    }
    .tag-body {
      width: ${labelWidth}mm;
      height: ${labelHeight}mm;
      display: flex;
      flex-direction: row;
      overflow: hidden;
      background: #ffffff;
      position: relative;
    }
    .panel {
      width: ${panelWidth}mm;
      height: ${labelHeight}mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .front-panel {
      padding: 0.8mm 1.2mm 0.8mm 0.8mm;
      border-right: 0.5px dashed #000000;
      justify-content: space-between;
      align-items: stretch;
      text-align: left;
    }
    .header-group {
      width: 100%;
      overflow: hidden;
    }
    .shop-name {
      font-size: 6pt;
      font-weight: 800;
      line-height: 1.05;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      color: #000000;
    }
    .item-name {
      font-size: 7pt;
      font-weight: 700;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #000000;
      margin-top: 0.2mm;
    }
    .barcode-container {
      width: 100%;
      height: 7.5mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin: 0.2mm 0;
    }
    .barcode-container.qr-mode {
      height: 8.5mm;
    }
    .barcode-container svg {
      width: 100%;
      height: 100%;
      max-height: 100%;
      display: block;
    }
    .meta-group {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.2mm;
    }
    .meta-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      font-size: 6.5pt;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
    }
    .meta-lbl {
      font-weight: 700;
      color: #222222;
      font-size: 6pt;
    }
    .meta-val {
      color: #000000;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    .back-panel {
      padding: 0.6mm 0.8mm 0.6mm 1.2mm;
      justify-content: flex-start;
    }
    .spec-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .spec-table tr {
      height: 25%;
    }
    .spec-table.stacked tr {
      height: 21%;
    }
    .spec-table.stacked tr.code-row {
      height: 37%;
    }
    .code-cell {
      vertical-align: top !important;
      padding-top: 0.3mm !important;
    }
    .code-lbl {
      width: auto;
      display: block;
    }
    .code-val {
      width: 100%;
      line-height: 1.15;
      white-space: nowrap;
      overflow: visible;
    }
    .spec-table td {
      padding: 0;
      line-height: 1.1;
      vertical-align: middle;
    }
    .spec-lbl {
      font-size: 5.6pt;
      font-weight: 700;
      color: #000000;
      width: 10mm;
      padding-right: 0.4mm;
      white-space: nowrap;
      overflow: hidden;
    }
    .spec-val {
      font-size: 6.5pt;
      font-weight: 600;
      color: #000000;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 10.5mm;
    }
    .font-bold {
      font-weight: 700;
    }
    .font-semibold {
      font-weight: 700;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
      font-size: 6.5pt;
    }
    /* Compact layout for tag heads shorter than 18.5mm (e.g. 16mm dumbbell head) */
    .compact .front-panel { padding: 0.5mm 1mm 0.5mm 0.8mm; }
    .compact .item-name { font-size: 6.5pt; line-height: 1.15; margin-top: 0; }
    .compact .barcode-container { height: 6mm; margin: 0.1mm 0; }
    .compact .barcode-container.qr-mode { height: 7mm; }
    .compact .meta-group { gap: 0.1mm; }
    .compact .meta-row { font-size: 6pt; line-height: 1.1; }
    .compact .back-panel { padding: 0.4mm 0.8mm 0.4mm 1.2mm; }
    ${previewCss}
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}

/**
 * Triggers the browser/Windows print dialog for TSC TE244 via an isolated zero-margin iframe.
 */
export async function printLabelDirect(item, settings, copies = 1, options = {}) {
  if (!item || (!item.barcode && !item.item_code)) {
    alert("No barcode or item code available to print.");
    return false;
  }

  try {
    const offsetX = Math.max(0, Number(options?.offsetX ?? settings?.barcode_offset_x ?? 0));
    const labelWidth = Number(options?.labelWidth ?? settings?.barcode_label_width ?? 45);
    const labelHeight = Number(options?.labelHeight ?? settings?.barcode_label_height ?? 20);
    const totalWidthMm = options?.pageWidth
      ? Number(options.pageWidth).toFixed(1)
      : (offsetX > 0 ? Math.max(95, offsetX + labelWidth).toFixed(1) : labelWidth.toFixed(1));

    const html = await generateLabelHtml(item, settings, copies, { ...options, offsetX, labelWidth, labelHeight, totalWidthMm });

    // Remove any previous print iframe
    const oldFrame = document.getElementById("jewelcore-barcode-print-frame");
    if (oldFrame) {
      document.body.removeChild(oldFrame);
    }

    const iframe = document.createElement("iframe");
    iframe.id = "jewelcore-barcode-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = `${totalWidthMm}mm`;
    const pageHeight = Math.max(labelHeight, Number(options?.pageHeight ?? settings?.barcode_label_pitch ?? labelHeight));
    iframe.style.height = `${pageHeight * Math.max(1, parseInt(copies, 10) || 1)}mm`;
    iframe.style.border = "none";
    iframe.style.opacity = "0.001";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Allow iframe rendering and font settlement before opening print dialog
    await new Promise((resolve) => setTimeout(resolve, 350));

    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    // Clean up iframe after print dialog closes
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 60000);

    return true;
  } catch (e) {
    console.error("Direct label print error:", e);
    alert("Failed to initiate print: " + (e.message || e));
    return false;
  }
}

/**
 * Generates a calibrated 45mm × 20mm PDF document using jsPDF matching Image 1.
 */
export async function generateBarcodePdf(item, settings, copies = 1, options = {}) {
  if (!item || (!item.barcode && !item.item_code)) {
    throw new Error("No barcode or item code available.");
  }

  const { jsPDF } = await import("jspdf");

  const offsetX = Math.max(0, Number(options?.offsetX ?? settings?.barcode_offset_x ?? 0));
  const labelWidth = Number(options?.labelWidth ?? settings?.barcode_label_width ?? 45);
  const panelWidth = labelWidth / 2;
  const panelHeight = Number(options?.labelHeight ?? settings?.barcode_label_height ?? 20);
  const pageWidth = options?.pageWidth
    ? Number(options.pageWidth)
    : (offsetX > 0 ? Math.max(95, offsetX + labelWidth) : labelWidth);
  const pageHeight = panelHeight;
  const dividerX = offsetX + panelWidth;

  const barcodeType = settings?.barcode_type || "code128";

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: "landscape",
    compress: true,
  });

  doc.viewerPreferences({
    PrintScaling: "None",
    PickTrayByPDFSize: true,
  });

  const numCopies = Math.max(1, parseInt(copies, 10) || 1);

  for (let pageIdx = 0; pageIdx < numCopies; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage([pageWidth, pageHeight], "landscape");
    }

    const padding = 0.6;
    const itemName = esc(item.item_name || "Jewellery Item");
    const barcodeValue = esc(item.barcode || item.item_code || "");
    const huid = esc(item.huid || "—");
    const itemCode = esc(item.item_code || "—");
    const purity = esc(item.purity_display || item.purity || "—");
    const gw = `${Number(item.gross_weight || 0).toFixed(3)}g`;
    const lw = `${Number(item.stone_weight ?? item.less_weight ?? 0).toFixed(3)}g`;
    const nw = `${Number(item.net_weight || 0).toFixed(3)}g`;

    // === LEFT / FRONT PANEL (offsetX to offsetX + panelWidth) ===
    let y = padding + 0.3;
    const leftMargin = offsetX + padding + 0.2;
    const leftWidth = panelWidth - padding * 2 - 0.4;


    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(itemName, leftMargin, y + 1.4);
    y += 2.2;

    // Barcode area
    const barcodeTop = y;
    const barcodeHeight = 5.6;
    const barcodeWidth = leftWidth;

    if (barcodeType === "qr") {
      const qrSize = Math.min(barcodeWidth, 7.5);
      const dataUrl = await QRCode.toDataURL(barcodeValue, { width: 300, margin: 1, errorCorrectionLevel: "M" });
      doc.addImage(dataUrl, "PNG", leftMargin, barcodeTop, qrSize, qrSize);
      y += qrSize + 0.8;
    } else {
      const patterns = encode128b(barcodeValue);
      let patternModules = 0;
      patterns.forEach((p) => {
        patternModules += p.split("").reduce((a, b) => a + (+b), 0);
      });
      const totalModules = patternModules + 20;
      const moduleMm = barcodeWidth / totalModules;

      let barX = leftMargin + 10 * moduleMm;
      patterns.forEach((p) => {
        p.split("").forEach((d, i) => {
          const w = +d * moduleMm;
          if (i % 2 === 0) {
            doc.rect(barX, barcodeTop, w, barcodeHeight, "F");
          }
          barX += w;
        });
      });
      y += barcodeHeight + 0.5;
    }

    // Purity & HUID lines
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(purity, leftMargin, y + 1.2);
    y += 2.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(fitMonoPt(huid.length + 6, leftWidth, 6, 3.8));
    doc.text("HUID: " + huid, leftMargin, y + 1.2);

    // Dashed center divider line
    doc.setDrawColor(0, 0, 0);
    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.setLineWidth(0.1);
    doc.line(dividerX, padding, dividerX, pageHeight - padding);
    doc.setLineDashPattern([], 0); // reset

    // === RIGHT / BACK PANEL (dividerX to dividerX + panelWidth) ===
    const rightMargin = dividerX + padding + 0.6;
    const rightItems = [
      ["Gross Wt", gw],
      ["Less Wt", lw],
      ["Net Wt", nw],
    ];

    const rightAreaTop = padding + 0.4;
    const inlineCodePdfPt = fitMonoPt(itemCode.length, INLINE_CODE_WIDTH_MM, 6.5, 3.8);
    const codeInline = inlineCodePdfPt >= MIN_INLINE_CODE_PT;
    const rightRowHeight = codeInline ? 4.6 : 3.9;

    doc.setFontSize(6.5);
    rightItems.forEach((row, i) => {
      const rowY = rightAreaTop + i * rightRowHeight + 1.8;
      doc.setFont("helvetica", "bold");
      doc.text(row[0], rightMargin, rowY);
      doc.setFont(row[0] === "Net Wt" ? "courier" : "helvetica", row[0] === "Net Wt" ? "bold" : "normal");
      doc.text(row[1], rightMargin + 10, rowY);
    });

    const codeLabelY = rightAreaTop + rightItems.length * rightRowHeight + (codeInline ? 1.8 : 2.0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.6);
    doc.text("Item Code", rightMargin, codeLabelY);
    doc.setFont("courier", "bold");
    if (codeInline) {
      // Short code: same line as the label, like the weight rows.
      doc.setFontSize(inlineCodePdfPt);
      doc.text(itemCode, rightMargin + 10, codeLabelY);
    } else {
      // Long code: own full-width line below the label so it isn't clipped.
      doc.setFontSize(fitMonoPt(itemCode.length, panelWidth - padding - 0.6 - 0.8, 6.5, 3.8));
      doc.text(itemCode, rightMargin, codeLabelY + 3);
    }
  }

  return doc;
}

/**
 * Downloads the calibrated 45mm × 20mm PDF directly.
 */
export async function downloadBarcodePdf(item, settings, copies = 1, options = {}) {
  try {
    const doc = await generateBarcodePdf(item, settings, copies, options);
    const barcode = item.barcode || item.item_code || "label";
    doc.save(`jewelcore-barcode-${barcode}.pdf`);
    return true;
  } catch (e) {
    console.error("PDF download error:", e);
    alert("Failed to download PDF: " + (e.message || e));
    return false;
  }
}

/**
 * Default print handler for legacy callers: triggers direct label print.
 */
export async function printBarcodeLabel(item, settings, options = {}) {
  return printLabelDirect(item, settings, 1, options);
}