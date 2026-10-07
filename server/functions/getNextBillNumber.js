import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';
import { logger } from '../shared/logger.js';
import { createBillNumberRepository } from '../repositories/billNumberRepository.js';
import { resolveNextBillNumber } from '../services/billNumberService.js';

// The invoice number the next bill will get, for the New Bill form to show.
// It is only a preview: finalizeBill always allocates the number itself, so a
// stale preview can never produce a duplicate. `can_edit` tells the form whether
// this user may type a different number (administrators only).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: 'No role assigned' }, { status: 403 });
    if (ctx.tenant_id) base44.bindTenant(ctx.tenant_id);

    const repository = createBillNumberRepository(base44);
    const settings = await repository.getShopSettings();
    if (!settings) return Response.json({ error: 'Shop settings not configured' }, { status: 400 });

    const next = await resolveNextBillNumber(repository, settings);
    return Response.json({ success: true, bill_number: next.billNumber, can_edit: ctx.role === 'admin' });
  } catch (error) {
    logger.error('getNextBillNumber failed', { error });
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
