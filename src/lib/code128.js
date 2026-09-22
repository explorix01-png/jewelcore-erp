// Code 128B encoder + SVG builder (no external dependency).
// Patterns: 103 data symbols (values 0-102), each 11 modules, 6 bar/space widths.
// Start B (value 104) and Stop (13 modules) are hardcoded per the Code 128 spec.
// Source: standard ISO/IEC 15417 Code 128 bar pattern table.
const PATTERNS = "212222222122222221121223121322131222122213122312132212221213221312231212112232122132122231113222123122123221223211221132221231213212223112312131311222321122321221312212322112322211212123212321232121111323131123131321112313132113132311211313231113231311112133112331132131113123113321133121313121211331231131213113213311213131311123311321331121312113312311332111314111221411431111111224111422121124121421141122141221112214112412122114122411142112142211241211221114413111241112134111111242121142121241114212124112124211411212421112421211212141214121412121111143111341131141114113114311411113411311113141114131311141411131".match(/.{6}/g);
const START_B = "211214";
const STOP = "2331112";

export function encode128b(text) {
  // Do NOT uppercase — Code 128B encodes ASCII 32-126 as-is. Uppercasing would
  // change the encoded value, causing scanned barcodes to not match stored values.
  const chars = (text || "").split("");
  for (const c of chars) {
    const code = c.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error("Character not encodable in Code 128B: " + c);
    }
  }
  let sum = 104; // start B value
  const values = chars.map((c) => c.charCodeAt(0) - 32);
  chars.forEach((c, i) => { sum += values[i] * (i + 1); });
  const check = sum % 103;
  return [START_B, ...values.map((v) => PATTERNS[v]), PATTERNS[check], STOP];
}

export function buildSvgString(text, { height = 60, moduleWidth = 2 } = {}) {
  const patterns = encode128b(text);
  let modules = 20; // 10-module quiet zone on each side
  patterns.forEach((p) => { modules += p.split("").reduce((a, b) => a + (+b), 0); });
  const width = modules * moduleWidth;
  let x = 10 * moduleWidth;
  let bars = "";
  patterns.forEach((p) => {
    p.split("").forEach((d, i) => {
      const w = +d * moduleWidth;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      x += w;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${bars}</svg>`;
}

// Build an SVG sized in millimeters for printing at exact physical size.
// No CSS scaling needed — the browser renders the SVG at its mm dimensions,
// so bar widths are physically correct and the barcode remains scannable.
// The module width is calculated to fit the barcode within the label width.
export function buildSvgMm(text, { heightMm, labelWidthMm, paddingMm = 1.5 }) {
  const patterns = encode128b(text);
  let totalModules = 20; // 10-module quiet zone each side
  patterns.forEach((p) => { totalModules += p.split("").reduce((a, b) => a + (+b), 0); });

  const availableWidth = Math.max(5, labelWidthMm - 2 * paddingMm);
  const moduleMm = availableWidth / totalModules;

  const svgWidth = totalModules * moduleMm;
  let x = 10 * moduleMm; // left quiet zone
  let bars = "";
  patterns.forEach((p) => {
    p.split("").forEach((d, i) => {
      const w = +d * moduleMm;
      if (i % 2 === 0) bars += `<rect x="${x.toFixed(4)}" y="0" width="${w.toFixed(4)}" height="${heightMm}" fill="#000"/>`;
      x += w;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth.toFixed(4)}mm" height="${heightMm}mm" viewBox="0 0 ${svgWidth.toFixed(4)} ${heightMm}" shape-rendering="crispEdges">${bars}</svg>`;
}