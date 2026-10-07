import { calcPurityRate, sortPuritiesDescending } from '../shared/billCalc.js';
import { logger } from '../shared/logger.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NO_RATE_MESSAGE = 'No rate is configured for the selected date.';

export class RateResolutionError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = 'RateResolutionError';
    this.status = status;
    this.extra = extra;
  }
}

// RateHistory rows are written by several paths. Real rate changes store
// `rate_per_gram`; older seed data stored a bare `rate`. Accept either and drop
// rows without a usable positive rate so one bad row can't zero every purity.
export function normalizeRateHistory(rows = []) {
  return rows
    .map((row) => ({ ...row, rate_per_gram: Number(row.rate_per_gram ?? row.rate) }))
    .filter((row) => row.effective_date && Number.isFinite(row.rate_per_gram) && row.rate_per_gram > 0);
}

// "YYYY-MM-DD" (or any parseable date) -> the last instant of that UTC day, so a
// rate set at any time during the bill date still applies to that date's bills.
export function endOfDayUtc(dateInput) {
  if (!dateInput) return new Date();
  if (DATE_ONLY_PATTERN.test(String(dateInput))) {
    const [year, month, day] = String(dateInput).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) throw new RateResolutionError('Invalid date format', 400);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999));
}

// PurityMaster stores purity either as karat (24, 22, 18...) or as a percentage
// (99.9, 91.6...). Both are normalised to a percentage here.
function purityPercent(purityValue) {
  const value = Number(purityValue) || 0;
  return value > 0 && value <= 24 ? (value / 24) * 100 : value;
}

function findBasePurity(purities) {
  return purities.find((p) => Number(p.purity_value) >= 99 || Number(p.purity_value) === 24);
}

// Base rate (24K gold / 999 silver) from the newest batch of rate rows.
function baseRateFromBatch(batch, purities, baseDisplay, basePurity) {
  const direct = batch.find((row) => (
    (row.purity_display && row.purity_display.trim().toUpperCase() === baseDisplay.toUpperCase())
    || (basePurity && row.purity_id === basePurity.id)
  ));
  if (direct) return direct.rate_per_gram;

  const noted = batch.map((row) => row.notes).find((note) => note && note.includes(`${baseDisplay}=`));
  const noteMatch = noted && noted.match(new RegExp(`${baseDisplay}=([0-9.]+)`));
  if (noteMatch && Number(noteMatch[1]) > 0) return Number(noteMatch[1]);

  // Derive the base from whichever purity this batch carries; a row with no
  // purity at all is treated as the base rate itself.
  const top = batch[0];
  const matched = purities.find((p) => p.display_format === top.purity_display || p.id === top.purity_id);
  const percent = matched ? purityPercent(matched.purity_value) : 100;
  return percent > 0 ? (top.rate_per_gram * 100) / percent : top.rate_per_gram;
}

function resolveBase({ metalEligible, purities, baseDisplay, fallbackBaseRate, targetDate, now }) {
  if (metalEligible.length > 0) {
    const effectiveDate = metalEligible[0].effective_date;
    const batch = metalEligible.filter((row) => row.effective_date === effectiveDate);
    const baseRate = baseRateFromBatch(batch, purities, baseDisplay, findBasePurity(purities));
    if (baseRate > 0) return { baseRate, effectiveDate, rateSource: 'historical_rate' };
  }

  // Never silently reuse today's rate for a past date.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  if (targetDate.getTime() >= startOfToday && Number(fallbackBaseRate) > 0) {
    return { baseRate: Number(fallbackBaseRate), effectiveDate: null, rateSource: 'current_benchmark' };
  }
  return null;
}

function resolveMetalRates({ metalType, purities, history, fallbackBaseRate, settings, targetDate, now }) {
  const metalEligible = history.filter((row) => row.metal_type === metalType);
  const baseDisplay = findBasePurity(purities)?.display_format || (metalType === 'gold' ? '24K' : '999');
  const base = resolveBase({ metalEligible, purities, baseDisplay, fallbackBaseRate, targetDate, now });
  if (!base) return { error: NO_RATE_MESSAGE };

  const effectiveDate = base.effectiveDate || settings?.rate_updated_date || new Date().toISOString();
  const rates = purities.map((purity) => {
    const label = purity.display_format || purity.name;
    const explicit = metalEligible.find((row) => (
      row.effective_date === base.effectiveDate && (row.purity_id === purity.id || row.purity_display === label)
    ));
    return {
      purity_id: purity.id,
      purity_display: label,
      purity_value: Number(purity.purity_value),
      metal_type: metalType,
      rate_per_gram: explicit ? explicit.rate_per_gram : calcPurityRate(base.baseRate, purity.purity_value),
      effective_date: effectiveDate,
      is_base: label === (metalType === 'gold' ? '24K' : '999') || Number(purity.purity_value) >= 99.9,
    };
  });

  return { baseRate: Math.round(base.baseRate * 100) / 100, effectiveDate, rateSource: base.rateSource, rates };
}

function activePuritiesFor(metalType, rows) {
  return sortPuritiesDescending(rows.filter((p) => p.metal_type === metalType && p.is_active !== false), metalType);
}

// The rate snapshot stored on a bill: one entry per purity, as resolved for the
// bill date. The invoice prints its "standard rates" line from this.
export function toRateSnapshot(resolved, billDateIso) {
  return {
    bill_date: billDateIso,
    effective_date: resolved.gold_effective_date || billDateIso,
    gold_24k_rate: resolved.gold_24k_rate,
    silver_rate: resolved.silver_rate,
    rates: resolved.rates.map((r) => ({ metal: r.metal_type, purity: r.purity_display, rate: r.rate_per_gram })),
  };
}

// Resolve the rate for every configured purity that was effective on or before
// `dateInput` (default: now). Used by the billing form AND by finalizeBill's
// rate snapshot, so the form, the saved bill and the printout agree.
export async function resolveEffectiveRates(rateRepository, dateInput, now = new Date()) {
  const targetDate = endOfDayUtc(dateInput);
  const targetIso = targetDate.toISOString();
  const [settings, purityRows, rawHistory] = await Promise.all([
    rateRepository.getShopSettings(),
    rateRepository.listActivePurities(),
    rateRepository.listRateHistory(),
  ]);

  const history = normalizeRateHistory(rawHistory)
    .filter((row) => new Date(row.effective_date).toISOString() <= targetIso);
  const queryDate = dateInput || now.toISOString().slice(0, 10);
  const inputs = { history, settings, targetDate, now };

  const gold = resolveMetalRates({ metalType: 'gold', purities: activePuritiesFor('gold', purityRows), fallbackBaseRate: settings?.gold_24k_rate, ...inputs });
  if (gold.error) throw new RateResolutionError(gold.error, 404, { no_rate: true, query_date: queryDate });
  const silver = resolveMetalRates({ metalType: 'silver', purities: activePuritiesFor('silver', purityRows), fallbackBaseRate: settings?.silver_rate, ...inputs });

  logger.debug('effective rates resolved', { queryDate, goldBase: gold.baseRate, silverBase: silver.baseRate ?? null });

  return {
    success: true,
    query_date: queryDate,
    effective_cutoff: targetIso,
    gold_24k_rate: gold.baseRate,
    silver_rate: silver.baseRate ?? 0,
    gold_effective_date: gold.effectiveDate,
    silver_effective_date: silver.effectiveDate ?? null,
    gold_source: gold.rateSource,
    silver_source: silver.rateSource ?? null,
    gold_rates: gold.rates,
    silver_rates: silver.rates || [],
    rates: [...gold.rates, ...(silver.rates || [])],
  };
}
