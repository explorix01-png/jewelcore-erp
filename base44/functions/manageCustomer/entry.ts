import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Customer — single-business CRUD. outstanding field protected.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageCustomer');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const id = str(body.id);
    const data = body.data || {};

    const safeFields = {
      name: str(data.name), mobile: str(data.mobile), gst_number: str(data.gst_number),
      birth_date: str(data.birth_date), notes: str(data.notes), customer_code: str(data.customer_code),
      address: str(data.address), state: str(data.state), city: str(data.city), pincode: str(data.pincode),
    };

    if (action === 'create') {
      if (!safeFields.name) return Response.json({ error: 'Name required' }, { status: 400 });
      if (!safeFields.customer_code) safeFields.customer_code = `CUST-${Date.now().toString().slice(-6)}`;
      const created = await base44.asServiceRole.entities.Customer.create(safeFields);
      await writeAudit(base44, { action: 'create', module: 'customers', record_id: created.id, new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, id: created.id, customer: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Customer.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Customer not found' }, { status: 404 });
      await base44.asServiceRole.entities.Customer.update(id, safeFields);
      await writeAudit(base44, { action: 'update', module: 'customers', record_id: id, previous_value: { name: prev.name }, new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      // Soft-delete: mark as deleted (hidden from active lists, restorable).
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Customer.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Customer not found' }, { status: 404 });
      if (Number(prev.outstanding) > 0) return Response.json({ error: 'Cannot delete customer with outstanding balance' }, { status: 400 });
      await base44.asServiceRole.entities.Customer.update(id, { is_deleted: true });
      await writeAudit(base44, { action: 'delete', module: 'customers', record_id: id, previous_value: { name: prev.name }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, archived: true });
    }

    if (action === 'delete_permanent') {
      // Permanent deletion with dependency check. Blocks if historical records exist.
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete customers' }, { status: 403 });
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Customer.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Customer not found' }, { status: 404 });

      // Check dependencies
      const [bills, orders, outstanding] = await Promise.all([
        base44.asServiceRole.entities.Bill.filter({ customer_id: id }, '-created_date', 1),
        base44.asServiceRole.entities.CustomerOrder.filter({ customer_id: id }, '-created_date', 1),
        base44.asServiceRole.entities.CustomerOutstanding.filter({ customer_id: id }, '-created_date', 1),
      ]);
      if (bills.length > 0) {
        return Response.json({ error: `Cannot permanently delete this customer because ${bills.length} bill(s) are linked to it. Delete the bills first.`, blocked: true, dependency: 'bills', count: bills.length }, { status: 400 });
      }
      if (orders.length > 0) {
        return Response.json({ error: `Cannot permanently delete this customer because ${orders.length} order(s) are linked to it.`, blocked: true, dependency: 'orders', count: orders.length }, { status: 400 });
      }
      if (outstanding.length > 0) {
        return Response.json({ error: `Cannot permanently delete this customer because ${outstanding.length} outstanding record(s) are linked to it.`, blocked: true, dependency: 'outstanding', count: outstanding.length }, { status: 400 });
      }

      // Safe to permanently delete
      await base44.asServiceRole.entities.Customer.delete(id);
      await writeAudit(base44, { action: 'delete_permanent', module: 'customers', record_id: id, previous_value: { name: prev.name, customer_code: prev.customer_code }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, deleted: true });
    }

    if (action === 'restore') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Customer.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Customer not found' }, { status: 404 });
      await base44.asServiceRole.entities.Customer.update(id, { is_deleted: false });
      await writeAudit(base44, { action: 'restore', module: 'customers', record_id: id, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'bulk_delete') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete customers' }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const cid = str(rawId);
        const prev = await base44.asServiceRole.entities.Customer.get(cid).catch(() => null);
        if (!prev) { bulkResult.skipped.push({ id: cid, reason: 'Not found' }); continue; }
        const [bills, orders, outstanding] = await Promise.all([
          base44.asServiceRole.entities.Bill.filter({ customer_id: cid }, '-created_date', 1),
          base44.asServiceRole.entities.CustomerOrder.filter({ customer_id: cid }, '-created_date', 1),
          base44.asServiceRole.entities.CustomerOutstanding.filter({ customer_id: cid }, '-created_date', 1),
        ]);
        if (bills.length > 0) { bulkResult.skipped.push({ id: cid, name: prev.name, reason: `${bills.length} bill(s) linked` }); continue; }
        if (orders.length > 0) { bulkResult.skipped.push({ id: cid, name: prev.name, reason: `${orders.length} order(s) linked` }); continue; }
        if (outstanding.length > 0) { bulkResult.skipped.push({ id: cid, name: prev.name, reason: `${outstanding.length} outstanding record(s) linked` }); continue; }
        await base44.asServiceRole.entities.Customer.delete(cid);
        await writeAudit(base44, { action: 'delete_permanent', module: 'customers', record_id: cid, previous_value: { name: prev.name, customer_code: prev.customer_code }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        bulkResult.deleted++;
      }
      return Response.json({ success: true, ...bulkResult });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}