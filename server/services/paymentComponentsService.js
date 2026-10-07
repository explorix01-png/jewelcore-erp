import { round } from '../shared/utils.js';

const AMOUNT_TOLERANCE = 0.01;

// A bill can be settled with several payment methods, each with its own amount
// (e.g. UPI ₹36,470 + Cash ₹7). When no gold exchange is involved, those
// amounts must add up to the paid amount. Returns an error message, or null.
//
// Bills that include a gold exchange carry the gold value in `paid_amount`
// (and some callers list it as a component too), so they are left to the
// existing gold-exchange validation instead.
export function checkPaymentBreakdown(components, paidAmount, hasGoldExchange) {
  if (!Array.isArray(components) || components.length === 0 || hasGoldExchange) return null;

  for (const component of components) {
    const amount = Number(component?.amount);
    if (!Number.isFinite(amount) || amount < 0) return 'Payment amounts must be valid, non-negative numbers';
  }

  const componentTotal = round(components.reduce((sum, component) => sum + Number(component.amount), 0));
  if (Math.abs(componentTotal - Number(paidAmount)) > AMOUNT_TOLERANCE) {
    return `Payment methods add up to ${componentTotal} but the paid amount is ${round(Number(paidAmount))}`;
  }
  return null;
}
