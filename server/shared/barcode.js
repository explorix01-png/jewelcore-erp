// Compact jewellery-label barcode generator.
// Format: 4-5 alphanumeric characters (no confusing chars like O/0/I/1/L).
// Examples: A7K2, G482, 9X21, AB731
// Collision-safe: checks existing barcodes and retries until unique.

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCompact() {
  const len = 4 + Math.floor(Math.random() * 2); // 4 or 5
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return s;
}

export async function nextBarcode(base44, _ctx) {
  const existing = await base44.asServiceRole.entities.InventoryItem.list("-created_date", 10000);
  const used = new Set((existing || []).map((i) => i.barcode).filter(Boolean));
  let code;
  let attempts = 0;
  do {
    code = generateCompact();
    attempts++;
    if (attempts > 1000) throw new Error("Unable to generate unique barcode after 1000 attempts");
  } while (used.has(code));
  return code;
}

// Validate a manually-entered barcode: 4-5 alphanumeric chars, no spaces/specials.
export function isValidBarcode(code) {
  if (!code) return false;
  const trimmed = String(code).trim();
  if (trimmed.length < 4 || trimmed.length > 5) return false;
  return /^[A-Za-z0-9]+$/.test(trimmed);
}
