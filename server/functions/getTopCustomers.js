import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';
import { logger } from '../shared/logger.js';
import { createBillRepository } from '../repositories/billRepository.js';
import {
  getTopCustomers,
  InvalidPeriodError,
  DEFAULT_TOP_CUSTOMERS_PERIOD,
} from '../services/topCustomersService.js';

// Top customers by spend for the dashboard's own daily / weekly / monthly
// filter. Body: { period?: "daily" | "weekly" | "monthly" } (default monthly).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: 'No role assigned' }, { status: 403 });
    if (ctx.tenant_id) base44.bindTenant(ctx.tenant_id);

    const body = await req.json().catch(() => ({}));
    const period = body.period || DEFAULT_TOP_CUSTOMERS_PERIOD;

    const result = await getTopCustomers(createBillRepository(base44), period);
    return Response.json(result);
  } catch (error) {
    if (error instanceof InvalidPeriodError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    logger.error('getTopCustomers failed', { error });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
