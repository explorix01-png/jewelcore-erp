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
  const shopName = esc(settings?.shop_name || "");
  const itemName = esc(item.item_name || "Jewellery Item");
  const barcodeValue = esc(item.barcode || item.item_code || "");
  const huid = esc(item.huid || "—");
  const itemCode = esc(item.item_code || "—");
  const purity = esc(item.purity_display || item.purity || "—");
  const gw = `${Number(item.gross_weight || 0).toFixed(3)}g`;
  const lw = `${Number(item.stone_weight ?? item.less_weight ?? 0).toFixed(3)}g`;
  const nw = `${Number(item.net_weight || 0).toFixed(3)}g`;
  const fine = `${Number(item.fine_weight || 0).toFixed(3)}g`;

  const barcodeSvg = await generateBarcodeSvg(barcodeValue, barcodeType);
  const numCopies = Math.max(1, parseInt(copies, 10) || 1);

  // Label geometry:
  // Primary target from Image 1: Content box 45mm × 20mm (two 22.5mm columns).
  // Backward compatibility: If label width is explicitly 40, uses 40mm × 20mm (two 20mm columns).
  const labelWidth = Number(options?.labelWidth ?? settings?.barcode_label_width ?? 45);
  const labelHeight = Number(options?.labelHeight ?? settings?.barcode_label_height ?? 20);
  const panelWidth = (labelWidth / 2).toFixed(1);

  const offsetX = Math.max(0, Number(options?.offsetX ?? settings?.barcode_offset_x ?? 0));

  // Total carrier page width for TSC TE244 printer:
  // When offsetX > 0 (dumbbell roll on 95mm carrier), total page width is 95mm.
  // When offsetX === 0 (flaps first / standard label), page width matches labelWidth.
  const totalWidthMm = options?.pageWidth
    ? Number(options.pageWidth).toFixed(1)
    : (offsetX > 0 ? Math.max(95, offsetX + labelWidth).toFixed(1) : labelWidth.toFixed(1));

  let pagesHtml = "";
  for (let c = 0; c < numCopies; c++) {
    pagesHtml += `
      <div class="label-page">
        ${offsetX > 0 ? `<div class="tail-spacer" style="width: ${offsetX}mm; height: ${labelHeight}mm; flex-shrink: 0;"></div>` : ""}

        <!-- 45mm × 20mm TAG BODY (Image 1 Specification) -->
        <div class="tag-body" style="width: ${labelWidth}mm; height: ${labelHeight}mm; flex-shrink: 0;">
          <!-- LEFT / FRONT PANEL (Identification, Barcode, Purity, HUID) -->
          <div class="panel front-panel">
            <div class="header-group">
              ${shopName ? `<div class="shop-name">${shopName}</div>` : ""}
              <div class="item-name">${itemName}</div>
            </div>
            <div class="barcode-container ${barcodeType === "qr" ? "qr-mode" : ""}">
              ${barcodeSvg}
            </div>
            <div class="meta-group">
              <div class="meta-row">
                <span class="meta-lbl">Purity</span>
                <span class="meta-val font-bold">${purity}</span>
              </div>
              <div class="meta-row">
                <span class="meta-lbl">HUID</span>
                <span class="meta-val mono font-bold">${huid}</span>
              </div>
            </div>
          </div>

          <!-- RIGHT / BACK PANEL (GW, LW, NW, Fine, Item Code) -->
          <div class="panel back-panel">
            <table class="spec-table">
              <tr><td class="spec-lbl">GW</td><td class="spec-val">${gw}</td></tr>
              <tr><td class="spec-lbl">LW</td><td class="spec-val">${lw}</td></tr>
              <tr><td class="spec-lbl">NW</td><td class="spec-val font-bold">${nw}</td></tr>
              <tr><td class="spec-lbl">Fine</td><td class="spec-val">${fine}</td></tr>
              <tr><td class="spec-lbl">Code</td><td class="spec-val mono font-bold">${itemCode}</td></tr>
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
      size: ${totalWidthMm}mm ${labelHeight}mm;
      margin: 0;
    }
    @media print {
      html, body {
        width: ${totalWidthMm}mm;
        height: ${labelHeight}mm;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: #ffffff !important;
      }
      .label-page {
        page-break-after: always;
        page-break-inside: avoid;
        break-after: page;
      }
      .label-page:last-child {
        page-break-after: auto;
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
      height: ${labelHeight}mm;
      display: flex;
      flex-direction: row;
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
      padding: 0.6mm 1.2mm 0.6mm 0.8mm;
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
      font-size: 4.2pt;
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
      font-size: 5.2pt;
      font-weight: 700;
      line-height: 1.1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #000000;
      margin-top: 0.2mm;
    }
    .barcode-container {
      width: 100%;
      height: 6.8mm;
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
      font-size: 4.8pt;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
    }
    .meta-lbl {
      font-weight: 700;
      color: #222222;
      font-size: 4.5pt;
    }
    .meta-val {
      color: #000000;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    .back-panel {
      padding: 0.6mm 0.8mm 0.6mm 1.2mm;
      justify-content: center;
    }
    .spec-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .spec-table tr {
      height: 3.2mm;
    }
    .spec-table td {
      padding: 0;
      line-height: 1.1;
      vertical-align: middle;
    }
    .spec-lbl {
      font-size: 4.6pt;
      font-weight: 700;
      color: #000000;
      width: 6.8mm;
      white-space: nowrap;
      overflow: hidden;
    }
    .spec-val {
      font-size: 4.8pt;
      font-weight: 500;
      color: #000000;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 13.5mm;
    }
    .font-bold {
      font-weight: 700;
    }
    .font-semibold {
      font-weight: 700;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
      font-size: 4.5pt;
    }
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
    iframe.style.height = `${labelHeight}mm`;
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
    const shopName = esc(settings?.shop_name || "");
    const itemName = esc(item.item_name || "Jewellery Item");
    const barcodeValue = esc(item.barcode || item.item_code || "");
    const huid = esc(item.huid || "—");
    const itemCode = esc(item.item_code || "—");
    const purity = esc(item.purity_display || item.purity || "—");
    const gw = `${Number(item.gross_weight || 0).toFixed(3)}g`;
    const lw = `${Number(item.stone_weight ?? item.less_weight ?? 0).toFixed(3)}g`;
    const nw = `${Number(item.net_weight || 0).toFixed(3)}g`;
    const fine = `${Number(item.fine_weight || 0).toFixed(3)}g`;

    // === LEFT / FRONT PANEL (offsetX to offsetX + panelWidth) ===
    let y = padding + 0.3;
    const leftMargin = offsetX + padding + 0.2;
    const leftWidth = panelWidth - padding * 2 - 0.4;

    if (shopName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.2);
      doc.text(shopName, leftMargin, y + 1.1);
      y += 1.8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.0);
    doc.text(itemName, leftMargin, y + 1.4);
    y += 2.2;

    // Barcode area
    const barcodeTop = y;
    const barcodeHeight = 6.2;
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
    doc.setFontSize(4.6);
    doc.text("Purity: " + purity, leftMargin, y + 1.2);
    y += 2.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(4.5);
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
      ["GW", gw],
      ["LW", lw],
      ["NW", nw],
      ["Fine", fine],
      ["Code", itemCode],
    ];

    const rightAreaTop = padding + 0.4;
    const rightRowHeight = 3.2;

    doc.setFontSize(4.7);
    rightItems.forEach((row, i) => {
      const rowY = rightAreaTop + i * rightRowHeight + 1.8;
      doc.setFont("helvetica", "bold");
      doc.text(row[0], rightMargin, rowY);
      doc.setFont(row[0] === "NW" || row[0] === "Code" ? "courier" : "helvetica", row[0] === "NW" || row[0] === "Code" ? "bold" : "normal");
      doc.text(row[1], rightMargin + 6.8, rowY);
    });
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