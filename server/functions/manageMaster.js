import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { str } from '../shared/utils.js';
import { nextBarcode } from '../shared/barcode.js';

// Manage Master — single-business CRUD for Purity, Category, ItemMaster, GSTConfig.
// Admin only. No tenant scoping — the app has one business.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageMasters');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);
    const entityType = str(body.entity_type);
    const id = str(body.id);
    const data = body.data || {};

    const ENTITY_MAP = { purity: 'PurityMaster', category: 'CategoryMaster', item: 'ItemMaster', gst: 'GSTConfig' };
    const entityName = ENTITY_MAP[entityType];
    if (!entityName) return Response.json({ error: 'Invalid entity type' }, { status: 400 });
    const entity = base44.asServiceRole.entities[entityName];

    if (action === 'create') {
      // Duplicate prevention (scoped by name + metal where relevant)
      const dupChecks = {
        purity: async () => (await base44.asServiceRole.entities.PurityMaster.filter({ is_active: true, name: str(data.name), metal_type: str(data.metal_type) }, '-created_date', 1)).length > 0,
        category: async () => (await base44.asServiceRole.entities.CategoryMaster.filter({ is_active: true, name: str(data.name), metal_type: str(data.metal_type) }, '-created_date', 1)).length > 0,
        gst: async () => (await base44.asServiceRole.entities.GSTConfig.filter({ is_active: true, name: str(data.name) }, '-created_date', 1)).length > 0,
        item: async () => (await base44.asServiceRole.entities.ItemMaster.filter({ is_active: true, item_code: str(data.item_code) }, '-created_date', 1)).length > 0,
      };
      if (dupChecks[entityType] && await dupChecks[entityType]()) {
        return Response.json({ error: 'A record with this name/code already exists' }, { status: 409 });
      }
      const created = await entity.create(data);
      await writeAudit(base44, { action: 'create', module: 'master', record_id: created.id, new_value: { type: entityType, ...data }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      // Creating an Item Master auto-creates a matching InventoryItem with ZERO stock
      // and a permanent system barcode. Master defines WHAT; Inventory tracks HOW MUCH.
      if (entityType === 'item') {
        const barcode = await nextBarcode(base44);
        await base44.asServiceRole.entities.InventoryItem.create({
          item_id: created.id,
          item_name: str(created.item_name),
          item_code: str(created.item_code),
          category_name: str(created.category_name),
          metal_type: str(created.metal_type),
          purity_display: str(created.purity_display),
          hsn: str(created.hsn),
          quantity: 0, gross_weight: 0, net_weight: 0,
          status: 'out_of_stock',
          barcode,
        });
      }
      return Response.json({ success: true, id: created.id, record: created });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await entity.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Record not found' }, { status: 404 });
      await entity.update(id, data);
      await writeAudit(base44, { action: 'update', module: 'master', record_id: id, previous_value: prev, new_value: { type: entityType, ...data }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      // Sync denormalized master fields into the InventoryItem (name, code, category, purity, hsn, metal).
      // The barcode and stock values are NEVER touched here — barcode is permanent, stock moves via transactions.
      if (entityType === 'item') {
        const inv = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: id }, '-created_date', 50);
        for (const invItem of (inv || [])) {
          await base44.asServiceRole.entities.InventoryItem.update(invItem.id, {
            item_name: str(data.item_name ?? invItem.item_name),
            item_code: str(data.item_code ?? invItem.item_code),
            category_name: str(data.category_name ?? invItem.category_name),
            metal_type: str(data.metal_type ?? invItem.metal_type),
            purity_display: str(data.purity_display ?? invItem.purity_display),
            hsn: str(data.hsn ?? invItem.hsn),
          });
        }
      }
      return Response.json({ success: true });
    }

    // Helper: try to delete a single master record. Returns { ok, deleted?, archived?, reason?, name?, canArchive? }.
    // Used by both 'delete' (single) and 'bulk_delete' (loop) to ensure identical dependency checks.
    const tryDelete = async (deleteId) => {
      const prev = await entity.get(deleteId).catch(() => null);
      if (!prev) return { ok: false, reason: 'Record not found' };

      if (entityType === 'item') {
        const [invTxns, billItems, invItems] = await Promise.all([
          base44.asServiceRole.entities.InventoryTransaction.filter({ item_id: deleteId }, '-date', 1),
          base44.asServiceRole.entities.BillItem.filter({ item_id: deleteId }, '-created_date', 1),
          base44.asServiceRole.entities.InventoryItem.filter({ item_id: deleteId }, '-created_date', 5),
        ]);
        const used = invTxns.length > 0 || billItems.length > 0;
        if (used) {
          await entity.update(deleteId, { is_active: false });
          for (const inv of invItems) await base44.asServiceRole.entities.InventoryItem.update(inv.id, { status: 'out_of_stock' });
          await writeAudit(base44, { action: 'archive', module: 'master', record_id: deleteId, new_value: { type: 'item', archived: true, reason: 'historical references exist' }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
          return { ok: true, archived: true, message: 'Item has historical transactions and was archived' };
        }
        for (const inv of invItems) await base44.asServiceRole.entities.InventoryItem.delete(inv.id);
        await entity.delete(deleteId);
        await writeAudit(base44, { action: 'delete', module: 'master', record_id: deleteId, new_value: { type: 'item', deleted: true }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        return { ok: true, deleted: true };
      }

      if (entityType === 'purity') {
        const displayFormat = str(prev.display_format);
        const [invItems, billItems] = await Promise.all([
          base44.asServiceRole.entities.InventoryItem.filter({ purity_display: displayFormat }, '-created_date', 500),
          base44.asServiceRole.entities.BillItem.filter({ purity_display: displayFormat }, '-created_date', 500),
        ]);
        const depCount = invItems.length + billItems.length;
        if (depCount > 0) {
          return { ok: false, reason: `Referenced by ${depCount} inventory/bill record(s)`, name: prev.name, canArchive: true, dependencies: depCount };
        }
        await entity.delete(deleteId);
        await writeAudit(base44, { action: 'delete', module: 'master', record_id: deleteId, new_value: { type: 'purity', deleted: true }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        return { ok: true, deleted: true };
      }

      if (entityType === 'category') {
        const catName = str(prev.name);
        const [invItems, billItems, itemMasters] = await Promise.all([
          base44.asServiceRole.entities.InventoryItem.filter({ category_name: catName }, '-created_date', 500),
          base44.asServiceRole.entities.BillItem.filter({ category_name: catName }, '-created_date', 500),
          base44.asServiceRole.entities.ItemMaster.filter({ category_name: catName }, '-created_date', 500),
        ]);
        const depCount = invItems.length + billItems.length + itemMasters.length;
        if (depCount > 0) {
          return { ok: false, reason: `Referenced by ${depCount} inventory/bill/item record(s)`, name: prev.name, canArchive: true, dependencies: depCount };
        }
        await entity.delete(deleteId);
        await writeAudit(base44, { action: 'delete', module: 'master', record_id: deleteId, new_value: { type: 'category', deleted: true }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        return { ok: true, deleted: true };
      }

      if (entityType === 'gst') {
        await entity.delete(deleteId);
        await writeAudit(base44, { action: 'delete', module: 'master', record_id: deleteId, new_value: { type: 'gst', deleted: true }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        return { ok: true, deleted: true };
      }

      return { ok: false, reason: 'Invalid entity type' };
    };

    if (action === 'delete') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const result = await tryDelete(id);
      if (result.ok) {
        return Response.json({ success: true, ...result });
      } else {
        return Response.json({ success: false, error: result.reason, canArchive: result.canArchive, dependencies: result.dependencies }, { status: result.canArchive ? 409 : 400 });
      }
    }

    if (action === 'bulk_delete') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const singleId = str(rawId);
        const r = await tryDelete(singleId);
        if (r.ok) bulkResult.deleted++;
        else bulkResult.skipped.push({ id: singleId, name: r.name, reason: r.reason });
      }
      return Response.json({ success: true, ...bulkResult });
    }

    // Archive action — explicit deactivation without deletion. Used when delete is blocked by dependencies.
    if (action === 'archive') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const prev = await entity.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Record not found' }, { status: 404 });
      await entity.update(id, { is_active: false });
      await writeAudit(base44, { action: 'archive', module: 'master', record_id: id, new_value: { type: entityType, deactivated: true }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, archived: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}