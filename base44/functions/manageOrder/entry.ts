import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Order — single-business CRUD for CustomerOrder.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageOrder');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const id = str(body.id);
    const data = body.data || {};

    if (action === 'create') {
      if (!str(data.customer_id) || !str(data.required_item)) return Response.json({ error: 'Customer and item required' }, { status: 400 });
      const cust = await base44.asServiceRole.entities.Customer.get(str(data.customer_id)).catch(() => null);
      if (!cust) return Response.json({ error: 'Invalid customer' }, { status: 400 });
      const payload = { ...data, customer_name: cust.name, order_number: str(data.order_number) || `ORD-${Date.now().toString().slice(-6)}` };
      const created = await base44.asServiceRole.entities.CustomerOrder.create(payload);
      await writeAudit(base44, { action: 'create', module: 'orders', record_id: created.id, new_value: payload, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, id: created.id, record: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.CustomerOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      await base44.asServiceRole.entities.CustomerOrder.update(id, data);
      await writeAudit(base44, { action: 'update', module: 'orders', record_id: id, previous_value: prev, new_value: data, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'status_change') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const status = str(data.status);
      const prev = await base44.asServiceRole.entities.CustomerOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      await base44.asServiceRole.entities.CustomerOrder.update(id, { status, delivery_status: status === 'DELIVERED' ? 'delivered' : prev.delivery_status });
      await writeAudit(base44, { action: 'status_change', module: 'orders', record_id: id, previous_value: { status: prev.status }, new_value: { status }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.CustomerOrder.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Order not found' }, { status: 404 });
      await base44.asServiceRole.entities.CustomerOrder.update(id, { status: 'CANCELLED' });
      await writeAudit(base44, { action: 'delete', module: 'orders', record_id: id, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}