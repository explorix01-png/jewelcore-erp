import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str } from '../../shared/utils.ts';
import { nextBarcode, isValidBarcode } from '../../shared/barcode.ts';

// Manage Inventory — single-business metadata edit + barcode generation + admin delete.
// Does NOT allow direct quantity/weight changes — those go through adjustStock.
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
    const id = str(body.id);

    if (action === 'edit_metadata') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const data = body.data || {};
      const prev = await base44.asServiceRole.entities.InventoryItem.get(id).catch(() => null);
      if (!prev) return Response.json({ error: 'Inventory item not found' }, { status: 404 });
      const newBarcode = str(data.barcode);
      const newHuid = str(data.huid);
      // Barcode format validation
      if (newBarcode && !isValidBarcode(newBarcode)) return Response.json({ error: 'Barcode must be 4-5 alphanumeric characters (letters and numbers only, no spaces)' }, { status: 400 });
      // Barcode uniqueness
      if (newBarcode && newBarcode !== prev.barcode) {
        const dup = await base44.asServiceRole.entities.InventoryItem.filter({ barcode: newBarcode }, '-created_date', 5);
        if (dup.some((x) => x.id !== id)) return Response.json({ error: 'Another item with this Barcode already exists' }, { status: 409 });
      }
      // HUID uniqueness
      if (newHuid && newHuid !== (prev.huid || '')) {
        const dup = await base44.asServiceRole.entities.InventoryItem.filter({ huid: newHuid }, '-created_date', 5);
        if (dup.some((x) => x.id !== id)) return Response.json({ error: 'Another item with this HUID already exists' }, { status: 409 });
      }
      const safeFields = {
        barcode: newBarcode,
        huid: newHuid,
        description: str(data.description),
      };
      await base44.asServiceRole.entities.InventoryItem.update(id, safeFields);
      await writeAudit(base44, { action: 'update', module: 'inventory', record_id: id, previous_value: { name: prev.item_name, code: prev.item_code }, new_value: safeFields, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true });
    }

    if (action === 'generate_barcode') {
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const inv = await base44.asServiceRole.entities.InventoryItem.get(id).catch(() => null);
      if (!inv) return Response.json({ error: 'Inventory item not found' }, { status: 404 });
      // Keep existing barcode — a stable barcode is never regenerated.
      if (inv.barcode) return Response.json({ success: true, barcode: inv.barcode });
      const barcode = await nextBarcode(base44);
      await base44.asServiceRole.entities.InventoryItem.update(id, { barcode });
      await writeAudit(base44, { action: 'barcode_generate', module: 'inventory', record_id: id, new_value: { barcode }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, barcode });
    }

    if (action === 'delete_permanent') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete inventory items' }, { status: 403 });
      if (!id) return Response.json({ error: 'ID required' }, { status: 400 });
      const inv = await base44.asServiceRole.entities.InventoryItem.get(id).catch(() => null);
      if (!inv) return Response.json({ error: 'Inventory item not found' }, { status: 404 });

      const masterId = str(inv.item_id);
      const prev = { item_name: inv.item_name, item_code: inv.item_code, quantity: inv.quantity, barcode: inv.barcode };

      await base44.asServiceRole.entities.InventoryItem.delete(id);
      if (masterId) {
        await base44.asServiceRole.entities.ItemMaster.delete(masterId).catch(() => {});
      }
      const txns = await base44.asServiceRole.entities.InventoryTransaction.filter({ item_id: masterId || id }, '-date', 10000);
      if (txns.length > 0) {
        await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ item_id: masterId || id });
      }

      await writeAudit(base44, { action: 'delete', module: 'inventory', record_id: id, previous_value: prev, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, deleted: true });
    }

    if (action === 'backfill') {
      // Ensure every active Item Master has an InventoryItem (zero stock) and every InventoryItem has a barcode.
      const masters = await base44.asServiceRole.entities.ItemMaster.filter({ is_active: true }, '-created_date', 10000);
      const invs = await base44.asServiceRole.entities.InventoryItem.list('-created_date', 10000);
      const invByItemId = new Map((invs || []).map((i) => [i.item_id, i]));
      const used = new Set((invs || []).map((i) => i.barcode).filter(Boolean));
      const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const nextCode = () => {
        let code;
        do {
          const len = 4 + Math.floor(Math.random() * 2);
          code = "";
          for (let i = 0; i < len; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
        } while (used.has(code));
        used.add(code);
        return code;
      };
      let createdCount = 0, barcodedCount = 0;
      for (const m of (masters || [])) {
        let inv = invByItemId.get(m.id);
        if (!inv) {
          inv = await base44.asServiceRole.entities.InventoryItem.create({
            item_id: m.id, item_name: str(m.item_name), item_code: str(m.item_code),
            category_name: str(m.category_name), metal_type: str(m.metal_type), purity_display: str(m.purity_display), hsn: str(m.hsn),
            quantity: 0, gross_weight: 0, net_weight: 0, status: 'out_of_stock', barcode: nextCode(),
          });
          invByItemId.set(m.id, inv);
          createdCount++;
        } else if (!inv.barcode) {
          const barcode = nextCode();
          await base44.asServiceRole.entities.InventoryItem.update(inv.id, { barcode });
          barcodedCount++;
        }
      }
      return Response.json({ success: true, created: createdCount, barcoded: barcodedCount });
    }

    if (action === 'bulk_delete') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can permanently delete inventory items' }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const iid = str(rawId);
        const inv = await base44.asServiceRole.entities.InventoryItem.get(iid).catch(() => null);
        if (!inv) { bulkResult.skipped.push({ id: iid, reason: 'Not found' }); continue; }
        const masterId = str(inv.item_id);
        const prev = { item_name: inv.item_name, item_code: inv.item_code, quantity: inv.quantity, barcode: inv.barcode };
        await base44.asServiceRole.entities.InventoryItem.delete(iid);
        if (masterId) await base44.asServiceRole.entities.ItemMaster.delete(masterId).catch(() => {});
        await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ item_id: masterId || iid }).catch(() => {});
        await writeAudit(base44, { action: 'delete', module: 'inventory', record_id: iid, previous_value: prev, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
        bulkResult.deleted++;
      }
      return Response.json({ success: true, ...bulkResult });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}