import { logger } from '../shared/logger.js';

const DEFAULT_PREFIX = 'INV';
const SEQUENCE_PADDING = 5;
const MAX_NUMBER_LENGTH = 30;
const MAX_AUTO_ATTEMPTS = 50;
const ALLOWED_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 _\-/.]*$/;

export class BillNumberError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BillNumberError';
    this.status = status;
  }
}

const toCount = (value) => Math.max(0, Math.floor(Number(value) || 0));
const prefixOf = (settings) => settings?.invoice_prefix || DEFAULT_PREFIX;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function formatBillNumber(prefix, sequence) {
  return `${prefix || DEFAULT_PREFIX}-${String(sequence).padStart(SEQUENCE_PADDING, '0')}`;
}

// "INV-00048" -> 48 for prefix "INV"; null if the number isn't in the shop's series.
export function parseBillSequence(billNumber, prefix) {
  const match = String(billNumber ?? '').match(new RegExp(`^${escapeRegExp(prefix || DEFAULT_PREFIX)}-(\\d+)$`, 'i'));
  return match ? Number(match[1]) : null;
}

// The settings counter holds the LAST number issued; the next automatic number
// is the one after it, skipping any number an active bill already holds.
export async function resolveNextBillNumber(repository, settings) {
  const prefix = prefixOf(settings);
  let sequence = toCount(settings?.invoice_sequence);

  for (let attempt = 0; attempt < MAX_AUTO_ATTEMPTS; attempt += 1) {
    sequence += 1;
    const billNumber = formatBillNumber(prefix, sequence);
    if (!(await repository.findActiveBillByNumber(billNumber))) return { billNumber, sequence };
  }
  throw new BillNumberError('Could not find a free invoice number automatically. Please enter one manually.', 409);
}

// Validate a hand-typed invoice number. A number in the shop's own series
// ("inv-48" / "INV-00048") is normalised to the standard form; anything else
// (e.g. a paper-book number) is kept exactly as typed.
function normalizeManualNumber(requested, prefix) {
  const text = String(requested ?? '').trim().replace(/\s+/g, ' ');
  if (text.length === 0) throw new BillNumberError('Invoice number cannot be empty', 400);
  if (text.length > MAX_NUMBER_LENGTH) throw new BillNumberError(`Invoice number can be at most ${MAX_NUMBER_LENGTH} characters`, 400);
  if (!ALLOWED_NUMBER.test(text)) {
    throw new BillNumberError('Invoice number may only contain letters, digits, spaces and - _ / .', 400);
  }
  const sequence = parseBillSequence(text, prefix);
  return { billNumber: sequence === null ? text : formatBillNumber(prefix, sequence), sequence };
}

// A manually chosen number must not be held by another active bill. If it is in
// the shop's series and ahead of the counter, the counter moves up to it so the
// next automatic number continues after it; a lower number leaves the counter alone.
export async function resolveManualBillNumber(repository, settings, requested) {
  const prefix = prefixOf(settings);
  const manual = normalizeManualNumber(requested, prefix);

  if (await repository.findActiveBillByNumber(manual.billNumber)) {
    throw new BillNumberError(`Invoice number ${manual.billNumber} is already used by another bill`, 409);
  }
  const counter = toCount(settings?.invoice_sequence);
  const sequence = manual.sequence === null ? counter : Math.max(counter, manual.sequence);
  return { billNumber: manual.billNumber, sequence, manual: true };
}

// Pick the number for a new bill: the requested one (administrators only) or the next automatic one.
export async function allocateBillNumber(repository, settings, { requested, isAdmin }) {
  const wantsManual = typeof requested === 'string' && requested.trim() !== '';
  if (!wantsManual) return resolveNextBillNumber(repository, settings);
  if (!isAdmin) throw new BillNumberError('Only an administrator can set the invoice number manually', 403);
  return resolveManualBillNumber(repository, settings, requested);
}

// After a bill is deleted, give its number back if it was the latest one issued, so the
// next bill reuses it (delete INV-00048 -> the next bill is INV-00048 again). The counter
// falls back to the highest number still held by an active bill, which also lets a chain of
// deletions unwind in order. Deleting an older bill leaves the counter alone: reusing a
// number from the middle of the series would put invoices out of date order.
// Call this after the deletion has been written. Returns the new counter, or null if unchanged.
export async function releaseBillNumber(repository, deletedBill, settings) {
  const prefix = prefixOf(settings);
  const counter = toCount(settings?.invoice_sequence);
  const releasedSequence = parseBillSequence(deletedBill.bill_number, prefix);
  if (releasedSequence === null || releasedSequence !== counter) return null;

  const activeNumbers = await repository.listActiveBillNumbers();
  const stillUsed = activeNumbers
    .map((number) => parseBillSequence(number, prefix))
    .filter((sequence) => sequence !== null && sequence < counter);
  const newCounter = stillUsed.length > 0 ? Math.max(...stillUsed) : 0;

  await repository.updateInvoiceSequence(settings.id, newCounter);
  logger.info('invoice number released', { billNumber: deletedBill.bill_number, counterFrom: counter, counterTo: newCounter });
  return newCounter;
}
