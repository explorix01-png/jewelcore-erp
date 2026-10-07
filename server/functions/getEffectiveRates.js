import { createClientFromRequest } from '../shared/createClient.js';
import { logger } from '../shared/logger.js';
import { createRateRepository } from '../repositories/rateRepository.js';
import { resolveEffectiveRates, RateResolutionError } from '../services/rateResolverService.js';

// Get Effective Rates — date-based rate resolution.
// Resolves the latest rates that were effective ON or BEFORE the given date
// (e.g. a historical bill date). Body: { date?: "YYYY-MM-DD" }.
// The resolution rules live in services/rateResolverService.js.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const result = await resolveEffectiveRates(createRateRepository(base44), body.date || body.bill_date);
    return Response.json(result);
  } catch (error) {
    if (error instanceof RateResolutionError) {
      const payload = error.extra.no_rate ? { success: false, error: error.message, ...error.extra } : { error: error.message };
      return Response.json(payload, { status: error.status });
    }
    logger.error('getEffectiveRates failed', { error });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
