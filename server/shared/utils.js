// Shared server-side helpers. Imported by all backend functions.
export function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
export function str(v) { return v == null ? "" : String(v); }
export function round(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
