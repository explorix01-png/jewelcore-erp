import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { str } from '../shared/utils.js';

// Restore Record — single-business. Restores soft-deleted Bill or Customer.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'restoreRecord');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const entityName = str(body.entity_name);
    const recordId = str(body.record_id);

    const RESTORABLE = ['Bill', 'Customer'];
    if (!RESTORABLE.includes(entityName)) return Response.json({ error: `Entity ${entityName} is not restorable` }, { status: 400 });
    if (!recordId) return Response.json({ error: 'Record id required' }, { status: 400 });

    const entity = base44.asServiceRole.entities[entityName];
    const record = await entity.get(recordId).catch(() => null);
    if (!record) return Response.json({ error: 'Record not found' }, { status: 404 });
    if (!record.is_deleted) return Response.json({ error: 'Record is not deleted' }, { status: 400 });

    await entity.update(recordId, { is_deleted: false });
    await writeAudit(base44, {
      action: 'restore', module: entityName.toLowerCase(), record_id: recordId,
      previous_value: { is_deleted: true }, new_value: { is_deleted: false },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, entity: entityName, record_id: recordId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}