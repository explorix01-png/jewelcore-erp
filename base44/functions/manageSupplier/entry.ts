import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';

// Manage Supplier — single-business CRUD. outstanding field protected.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageSupplier');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const id = str(body.id);
    const data = body.data || {};

    const safeFields = {
      name: str(data.name), mobile: str(data.mobile), email: str(data.email),
      address: str(data.address), state: str(data.state), city: str(data.city),
      gst_number: str(data.gst_number), notes: str(data.notes),
      status: str(data.status) || 'active', supplier_code: str(data.supplier_code),
    };

    if (action === 'create') {
      if (!safeFields.name) return Response.json({ error: 'Name required' }, { status: 400 });
      if (!safeFields.supplier_code) safeFields.supplier_code = `SUP-${Date.now().toString().slice(-6)}`;
      const created = await base44.asServiceRole.entities.Supplier.create(safeFields);
      await writeAudit(base44, { action: 'create', module: 'suppliers', record_id: created.id, new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, id: created.id, supplier: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Supplier.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Supplier not found' }, { status: 404 });
      await base44.asServiceRole.entities.Supplier.update(id, safeFields);
      await writeAudit(base44, { action: 'update', module: 'suppliers', record_id: id, previous_value: { name: prev.name }, new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      // Soft-delete: deactivate the supplier (sets status to inactive).
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Supplier.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Supplier not found' }, { status: 404 });
      if (Number(prev.outstanding) > 0) return Response.json({ error: 'Cannot delete supplier with outstanding balance' }, { status: 400 });
      await base44.asServiceRole.entities.Supplier.update(id, { status: 'inactive' });
      await writeAudit(base44, { action: 'delete', module: 'suppliers', record_id: id, previous_value: { name: prev.name }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, archived: true });
    }

    if (action === 'delete_permanent') {
      // Permanent deletion with dependency check. Blocks if historical records exist.
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete suppliers' }, { status: 403 });
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await base44.asServiceRole.entities.Supplier.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Supplier not found' }, { status: 404 });

      // Check dependencies
      const [purchases, transactions] = await Promise.all([
        base44.asServiceRole.entities.Purchase.filter({ supplier_id: id }, '-created_date', 1),
        base44.asServiceRole.entities.SupplierTransaction.filter({ supplier_id: id }, '-created_date', 1),
      ]);
      if (purchases.length > 0) {
        return Response.json({ error: `Cannot permanently delete this supplier because ${purchases.length} purchase record(s) are linked to it. Delete the purchases first.`, blocked: true, dependency: 'purchases', count: purchases.length }, { status: 400 });
      }
      if (transactions.length > 0) {
        return Response.json({ error: `Cannot permanently delete this supplier because ${transactions.length} supplier transaction(s) are linked to it.`, blocked: true, dependency: 'transactions', count: transactions.length }, { status: 400 });
      }

      // Safe to permanently delete
      await base44.asServiceRole.entities.Supplier.delete(id);
      await writeAudit(base44, { action: 'delete_permanent', module: 'suppliers', record_id: id, previous_value: { name: prev.name, supplier_code: prev.supplier_code }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, deleted: true });
    }

    if (action === 'bulk_delete') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete suppliers' }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const sid = str(rawId);
        const prev = await base44.asServiceRole.entities.Supplier.get(sid).catch(() => null);
        if (!prev) { bulkResult.skipped.push({ id: sid, reason: 'Not found' }); continue; }
        const [purchases, transactions] = await Promise.all([
          base44.asServiceRole.entities.Purchase.filter({ supplier_id: sid }, '-created_date', 1),
          base44.asServiceRole.entities.SupplierTransaction.filter({ supplier_id: sid }, '-created_date', 1),
        ]);
        if (purchases.length > 0) { bulkResult.skipped.push({ id: sid, name: prev.name, reason: `${purchases.length} purchase(s) linked` }); continue; }
        if (transactions.length > 0) { bulkResult.skipped.push({ id: sid, name: prev.name, reason: `${transactions.length} transaction(s) linked` }); continue; }
        await base44.asServiceRole.entities.Supplier.delete(sid);
        await writeAudit(base44, { action: 'delete_permanent', module: 'suppliers', record_id: sid, previous_value: { name: prev.name, supplier_code: prev.supplier_code }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        bulkResult.deleted++;
      }
      return Response.json({ success: true, ...bulkResult });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}