// Client-side file download helpers for CSV, Excel, and PDF exports.
// Uses human-readable column mappings from exportColumns.js — never dumps
// raw JSON, database field names, technical IDs, or rate_snapshot objects.
import { COLUMN_MAP, mapRecords } from "@/lib/exportColumns";

export function downloadCSV(filename, moduleId, records) {
  if (!records || records.length === 0) { alert("No records to export"); return; }
  const { headers, rows } = mapRecords(moduleId, records);
  if (headers.length === 0) { alert("Unsupported module for CSV export"); return; }
  const csv = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function downloadExcel(filename, moduleId, records) {
  if (!records || records.length === 0) { alert("No records to export"); return; }
  const { headers, rows } = mapRecords(moduleId, records);
  if (headers.length === 0) { alert("Unsupported module for Excel export"); return; }
  let html = '<table border="1"><thead><tr>';
  headers.forEach((h) => { html += `<th>${escHtml(h)}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach((r) => {
    html += '<tr>';
    r.forEach((cell) => { html += `<td>${escHtml(cell)}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// Generates a clean, human-readable business report PDF — NOT a database dump.
// Includes: report title, generated date/time, applied filters, proper table
// with human-readable column names, text wrapping, repeated headers on new
// pages, page numbers, and zebra striping. No raw JSON or technical IDs.
export function downloadPDF(filename, moduleId, records, filters = {}) {
  if (!records || records.length === 0) { alert("No records to export"); return; }
  const config = COLUMN_MAP[moduleId];
  if (!config) { alert("Unsupported module for PDF export"); return; }
  const { headers, rows, columns } = mapRecords(moduleId, records);

  import("jspdf").then(({ jsPDF }) => {
    const pageWidth = 297; // A4 landscape
    const pageHeight = 210;
    const margin = 12;
    const usableWidth = pageWidth - margin * 2;
    const fontSize = 7;
    const lineHeight = 3.2;
    const minRowHeight = 5;
    const headerHeight = 7;

    // Dynamic column widths: wider for long-content columns, narrower for short
    const colContentWidths = columns.map((c, i) => {
      const maxData = Math.max(...rows.map((r) => r[i].length), c.label.length);
      return Math.min(Math.max(maxData * 1.2, 18), 55);
    });
    const totalContentWidth = colContentWidths.reduce((s, w) => s + w, 0);
    const colWidths = colContentWidths.map((w) => (w / totalContentWidth) * usableWidth);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    let y = margin;
    let pageNum = 1;

    // ── Title block ──
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`${config.label} Report`, margin, y + 5);
    y += 8;

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, margin, y);
    doc.text(`Records: ${rows.length}`, margin + 120, y);
    y += 5;

    // ── Applied filters ──
    const filterTexts = [];
    if (filters.dateFrom) filterTexts.push(`From: ${filters.dateFrom}`);
    if (filters.dateTo) filterTexts.push(`To: ${filters.dateTo}`);
    if (filters.billSource && filters.billSource !== "all") {
      filterTexts.push(`Type: ${({ inventory: "Inventory", manual: "Manual", customer_purchase: "Customer Purchase" })[filters.billSource] || filters.billSource}`);
    }
    if (filters.customerSearch) filterTexts.push(`Customer: "${filters.customerSearch}"`);
    if (filterTexts.length > 0) {
      const filterLine = `Filters: ${filterTexts.join("  ·  ")}`;
      const wrappedFilters = doc.splitTextToSize(filterLine, usableWidth);
      wrappedFilters.forEach((line) => {
        doc.text(line, margin, y);
        y += 4;
      });
    }
    y += 2;

    const drawTableHeader = () => {
      doc.setFontSize(fontSize);
      doc.setFont(undefined, "bold");
      doc.setFillColor(235, 235, 235);
      doc.rect(margin, y, usableWidth, headerHeight, "F");
      let x = margin;
      headers.forEach((h, i) => {
        const wrapped = doc.splitTextToSize(h, colWidths[i] - 1);
        doc.text(wrapped[0] || h, x + 0.5, y + headerHeight - 2);
        x += colWidths[i];
      });
      y += headerHeight;
      doc.setFont(undefined, "normal");
    };

    const drawFooter = (pn) => {
      doc.setFontSize(7);
      doc.setFont(undefined, "normal");
      doc.text(`Page ${pn}`, pageWidth - margin - 10, pageHeight - 3);
      doc.text(`${config.label} — ${rows.length} records`, margin, pageHeight - 3);
    };

    drawTableHeader();

    rows.forEach((row, ri) => {
      // Pre-wrap every cell to determine row height
      const cellLines = columns.map((c, i) => doc.splitTextToSize(row[i], colWidths[i] - 1));
      const maxLines = Math.max(...cellLines.map((l) => l.length), 1);
      const thisRowHeight = Math.max(minRowHeight, maxLines * lineHeight + 1.5);

      // Page break before the row if it would overflow
      if (y + thisRowHeight > pageHeight - margin - 5) {
        drawFooter(pageNum);
        doc.addPage();
        pageNum++;
        y = margin;
        drawTableHeader();
      }

      // Zebra striping
      if (ri % 2 === 0) {
        doc.setFillColor(249, 249, 249);
        doc.rect(margin, y, usableWidth, thisRowHeight, "F");
      }

      // Draw each cell with full wrapped text
      let x = margin;
      cellLines.forEach((lines, i) => {
        const align = columns[i].align === "right" ? "right" : "left";
        const textX = align === "right" ? x + colWidths[i] - 1 : x + 0.5;
        lines.forEach((line, li) => {
          doc.text(line, textX, y + 3 + li * lineHeight, { align });
        });
        x += colWidths[i];
      });

      y += thisRowHeight;
    });

    drawFooter(pageNum);
    doc.save(filename);
  });
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function escHtml(s) {
  return String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}