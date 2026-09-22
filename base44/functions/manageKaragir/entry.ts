import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Karagir — single-business CRUD.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageKaragir');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const id = str(body.id);
    const data = body.data || {};

    if (action === 'create') {
      if (!str(data.name)) return Response.json({ error: 'Name required' }, { status: 400 });
      const created = await base44.asServiceRole.entities.Karagir.create(data);
      await writeAudit(base44, { action: 'create', module: 'karagir', record_id: created.id, new_value: data, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, id: created.id, record: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Karagir.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Karagir not found' }, { status: 404 });
      await base44.asServiceRole.entities.Karagir.update(id, data);
      await writeAudit(base44, { action: 'update', module: 'karagir', record_id: id, previous_value: prev, new_value: data, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      // Soft-delete: deactivate the karagir.
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Karagir.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Karagir not found' }, { status: 404 });
      await base44.asServiceRole.entities.Karagir.update(id, { status: 'inactive' });
      await writeAudit(base44, { action: 'delete', module: 'karagir', record_id: id, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, archived: true });
    }

    if (action === 'delete_permanent') {
      // Permanent deletion with dependency check. Blocks if karagir orders exist.
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete karagirs' }, { status: 403 });
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Karagir.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Karagir not found' }, { status: 404 });

      const orders = await base44.asServiceRole.entities.KaragirOrder.filter({ karagir_id: id }, '-created_date', 1);
      if (orders.length > 0) {
        return Response.json({ error: `Cannot permanently delete this karagir because ${orders.length} work order(s) are linked to it. Delete the orders first.`, blocked: true, dependency: 'orders', count: orders.length }, { status: 400 });
      }

      // Safe to permanently delete
      await base44.asServiceRole.entities.Karagir.delete(id);
      await writeAudit(base44, { action: 'delete_permanent', module: 'karagir', record_id: id, previous_value: { name: prev.name }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, deleted: true });
    }

    if (action === 'bulk_delete') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete karagirs' }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const kid = str(rawId);
        const prev = await base44.asServiceRole.entities.Karagir.get(kid).catch(() => null);
        if (!prev) { bulkResult.skipped.push({ id: kid, reason: 'Not found' }); continue; }
        const orders = await base44.asServiceRole.entities.KaragirOrder.filter({ karagir_id: kid }, '-created_date', 1);
        if (orders.length > 0) { bulkResult.skipped.push({ id: kid, name: prev.name, reason: `${orders.length} work order(s) linked` }); continue; }
        await base44.asServiceRole.entities.Karagir.delete(kid);
        await writeAudit(base44, { action: 'delete_permanent', module: 'karagir', record_id: kid, previous_value: { name: prev.name }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        bulkResult.deleted++;
      }
      return Response.json({ success: true, ...bulkResult });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}