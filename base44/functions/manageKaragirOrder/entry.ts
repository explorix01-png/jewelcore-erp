import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Karagir Order — single-business CRUD.
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
      if (!str(data.karagir_id) || !str(data.work_description)) return Response.json({ error: 'Karagir and work description required' }, { status: 400 });
      const karagir = await base44.asServiceRole.entities.Karagir.get(str(data.karagir_id)).catch(() => null);
      if (!karagir) return Response.json({ error: 'Invalid karagir' }, { status: 400 });
      const payload = {
        ...data, karagir_name: karagir.name,
        order_number: str(data.order_number) || `KWO-${Date.now().toString().slice(-6)}`,
        order_date: str(data.order_date) || new Date().toISOString().slice(0, 10),
        status: str(data.status) || 'PENDING',
      };
      const created = await base44.asServiceRole.entities.KaragirOrder.create(payload);
      await writeAudit(base44, { action: 'create', module: 'karagir_orders', record_id: created.id, new_value: payload, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, id: created.id, record: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.KaragirOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      await base44.asServiceRole.entities.KaragirOrder.update(id, data);
      await writeAudit(base44, { action: 'update', module: 'karagir_orders', record_id: id, previous_value: prev, new_value: data, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'status_change') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const status = str(data.status);
      const prev = await base44.asServiceRole.entities.KaragirOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      const updates = { status };
      if (status === 'ASSIGNED' && !prev.assigned_date) updates.assigned_date = new Date().toISOString();
      if (status === 'READY' && !prev.completion_date) updates.completion_date = new Date().toISOString();
      if (status === 'DELIVERED' && !prev.delivery_date) updates.delivery_date = new Date().toISOString();
      await base44.asServiceRole.entities.KaragirOrder.update(id, updates);
      await base44.asServiceRole.entities.Notification.create({
        type: 'karagir_order',
        title: `Karagir Order ${prev.order_number} → ${status}`,
        message: `${prev.karagir_name || 'Unassigned'}: ${prev.work_description || ''}`,
        reference_type: 'karagir_order', reference_id: id,
        is_read: false, created_date: new Date().toISOString(),
      }).catch(() => {});
      await writeAudit(base44, { action: 'status_change', module: 'karagir_orders', record_id: id, previous_value: { status: prev.status }, new_value: updates, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.KaragirOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      await base44.asServiceRole.entities.KaragirOrder.update(id, { status: 'CANCELLED' });
      await writeAudit(base44, { action: 'delete', module: 'karagir_orders', record_id: id, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}