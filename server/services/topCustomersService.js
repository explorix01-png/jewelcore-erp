import { logger } from '../shared/logger.js';

export const TOP_CUSTOMERS_LIMIT = 5;
export const TOP_CUSTOMERS_PERIODS = ['daily', 'weekly', 'monthly'];
export const DEFAULT_TOP_CUSTOMERS_PERIOD = 'monthly';

export class InvalidPeriodError extends Error {
  constructor(period) {
    super(`Invalid period "${period}". Expected one of: ${TOP_CUSTOMERS_PERIODS.join(', ')}`);
    this.name = 'InvalidPeriodError';
  }
}

// Calendar windows, matching the "today / this week / this month" cards on
// the dashboard (getDashboardStats): today since midnight, the week since
// Monday, the month since the 1st. Only "daily" is capped at the end of today.
export function resolvePeriodWindow(period, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  if (period === 'daily') {
    return { start: new Date(year, month, date, 0, 0, 0, 0), end: new Date(year, month, date, 23, 59, 59, 999) };
  }
  if (period === 'weekly') {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    return { start: new Date(year, month, date - daysSinceMonday, 0, 0, 0, 0), end: null };
  }
  if (period === 'monthly') {
    return { start: new Date(year, month, 1, 0, 0, 0, 0), end: null };
  }
  throw new InvalidPeriodError(period);
}

function isWithinWindow(bill, window) {
  const billTime = new Date(bill.bill_date).getTime();
  if (Number.isNaN(billTime)) return false;
  return billTime >= window.start.getTime() && (!window.end || billTime <= window.end.getTime());
}

// Sum spend per customer, rank by total (then invoice count, then name so the
// order is stable), and keep the top N. Bills without a customer are skipped.
export function rankTopCustomers(bills, limit = TOP_CUSTOMERS_LIMIT) {
  const byCustomer = new Map();
  for (const bill of bills) {
    if (!bill.customer_id) continue;
    const entry = byCustomer.get(bill.customer_id)
      || { customer_id: bill.customer_id, name: bill.customer_name || '—', total: 0, count: 0 };
    entry.total += Number(bill.total_amount) || 0;
    entry.count += 1;
    byCustomer.set(bill.customer_id, entry);
  }

  return [...byCustomer.values()]
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function getTopCustomers(billRepository, period, now = new Date()) {
  const window = resolvePeriodWindow(period, now);
  const bills = await billRepository.findFinalizedSince(window.start.toISOString());

  if (bills.length >= billRepository.maxRows) {
    logger.warn('top customers query hit the row cap; totals may be incomplete', {
      period,
      maxRows: billRepository.maxRows,
    });
  }

  const inWindow = bills.filter((bill) => isWithinWindow(bill, window));
  logger.debug('top customers computed', { period, fetched: bills.length, inWindow: inWindow.length });

  return {
    period,
    from: window.start.toISOString(),
    topCustomers: rankTopCustomers(inWindow),
  };
}
