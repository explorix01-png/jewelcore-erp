import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';
import { nextBarcode, isValidBarcode } from '../shared/barcode.js';
import { calcFineWeight } from '../shared/billCalc.js';

// Manage Item — the Inventory-first item management endpoint.
// Creates an ItemMaster + InventoryItem (with opening stock) in one atomic action,
// and edits item master fields (never stock). Stock moves only via adjustStock /
// finalizePurchase / finalizeBill.
//
// Permission: manageItems (admin + staff). Single-business. Duplicate-safe.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageItems');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);

    // ---------------------------------------------------------------
    // CREATE ITEM + OPENING STOCK
    // ---------------------------------------------------------------
    if (action === 'create_with_stock') {
      const d = body.data || {};
      const itemCode = str(d.item_code);
      const itemName = str(d.item_name);
      const metal = str(d.metal_type);
      const categoryId = str(d.category_id);
      const purityId = str(d.purity_id);
      const quantity = num(d.quantity);
      const grossWeight = num(d.gross_weight);
      const stoneWeight = num(d.stone_weight);
      // Auto-calculate net weight if not explicitly provided: Net = Gross − Less Wt
      let netWeight = num(d.net_weight);
      if (netWeight <= 0 && grossWeight > 0) {
        netWeight = Math.max(0, grossWeight - stoneWeight);
      }
      const providedBarcode = str(d.barcode);
      const huid = str(d.huid);

      if (!itemName) return Response.json({ error: 'Item Name is required' }, { status: 400 });
      if (!metal) return Response.json({ error: 'Metal is required' }, { status: 400 });
      if (!categoryId) return Response.json({ error: 'Category is required' }, { status: 400 });
      if (!purityId) return Response.json({ error: 'Purity is required' }, { status: 400 });
      if (quantity < 0 || grossWeight < 0 || netWeight < 0) return Response.json({ error: 'Stock values cannot be negative' }, { status: 400 });
      if (stoneWeight < 0) return Response.json({ error: 'Less weight cannot be negative' }, { status: 400 });
      if (stoneWeight > grossWeight) return Response.json({ error: 'Less weight cannot exceed gross weight' }, { status: 400 });

      // Resolve category + purity names from masters (single source of truth).
      const category = await base44.asServiceRole.entities.CategoryMaster.get(categoryId).catch(() => null);
      if (!category || !category.is_active)
        return Response.json({ error: 'Invalid or inactive category' }, { status: 400 });
      const purity = await base44.asServiceRole.entities.PurityMaster.get(purityId).catch(() => null);
      if (!purity || !purity.is_active)
        return Response.json({ error: 'Invalid or inactive purity' }, { status: 400 });
      if (purity.metal_type !== metal)
        return Response.json({ error: 'Purity does not match the selected metal' }, { status: 400 });

      // --- DUPLICATE PREVENTION (only when Item Code is provided) ---
      if (itemCode) {
        const dupCode = await base44.asServiceRole.entities.ItemMaster.filter(
          { item_code: itemCode }, '-created_date', 1
        );
        if (dupCode.length > 0) return Response.json({ error: 'An item with this Item Code already exists' }, { status: 409 });
      }

      if (providedBarcode) {
        if (!isValidBarcode(providedBarcode)) return Response.json({ error: 'Barcode must be 4-5 alphanumeric characters (letters and numbers only, no spaces)' }, { status: 400 });
        const dupBarcode = await base44.asServiceRole.entities.InventoryItem.filter(
          { barcode: providedBarcode }, '-created_date', 1
        );
        if (dupBarcode.length > 0) return Response.json({ error: 'An item with this Barcode already exists' }, { status: 409 });
      }

      // HUID uniqueness check (if provided)
      if (huid) {
        const dupHuid = await base44.asServiceRole.entities.InventoryItem.filter(
          { huid }, '-created_date', 1
        );
        if (dupHuid.length > 0) return Response.json({ error: 'An item with this HUID already exists' }, { status: 409 });
      }

      // --- CREATE ITEM MASTER ---
      const master = await base44.asServiceRole.entities.ItemMaster.create({
        item_code: itemCode,
        item_name: itemName,
        category_id: categoryId,
        category_name: str(category.name),
        metal_type: metal,
        purity_id: purityId,
        purity_display: str(purity.display_format),
        purity_value: Number(purity.purity_value) || 0,
        hsn: str(d.hsn),
        is_active: d.is_active !== false,
      });

      // --- BARCODE (use provided or generate a stable one) ---
      const barcode = providedBarcode || await nextBarcode(base44);

      // --- CREATE INVENTORY ITEM WITH OPENING STOCK ---
      const lowThreshold = num(d.low_stock_threshold);
      const status = quantity <= 0 ? 'out_of_stock' : (lowThreshold > 0 ? (quantity <= lowThreshold ? 'low_stock' : 'in_stock') : (quantity <= 2 ? 'low_stock' : 'in_stock'));
      const inv = await base44.asServiceRole.entities.InventoryItem.create({
        item_id: master.id,
        item_name: itemName,
        item_code: itemCode,
        barcode,
        huid,
        category_name: str(category.name),
        metal_type: metal,
        purity_display: str(purity.display_format),
        purity_value: Number(purity.purity_value) || 0,
        fine_weight: calcFineWeight(netWeight, purity.purity_value),
        hsn: str(d.hsn),
        description: str(d.description),
        quantity,
        gross_weight: grossWeight,
        stone_weight: stoneWeight,
        net_weight: netWeight,
        wastage: num(d.wastage),
        low_stock_threshold: lowThreshold,
        status,
        is_archived: false,
      });

      // --- OPENING STOCK TRANSACTION (only if there is actual stock) ---
      if (quantity > 0 || netWeight > 0 || grossWeight > 0) {
        await base44.asServiceRole.entities.InventoryTransaction.create({
          item_id: master.id,
          item_name: itemName,
          transaction_type: 'OPENING_IN',
          quantity,
          gross_weight: grossWeight,
          stone_weight: stoneWeight,
          net_weight: netWeight,
          reference_type: 'opening',
          reason: 'Opening Stock',
          previous_stock: 0,
          new_stock: quantity,
          date: new Date().toISOString(),
          user_name: user.full_name || user.email || '',
        });
      }

      await writeAudit(base44, {
        action: 'create', module: 'inventory', record_id: inv.id,
        new_value: { type: 'item_with_stock', item_id: master.id, item_code: itemCode, quantity, barcode, huid },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });

      return Response.json({ success: true, item_id: master.id, inventory_id: inv.id, barcode, record: master });
    }

    // ---------------------------------------------------------------
    // EDIT ITEM DETAILS (master fields + optional stock correction).
    // Stock changes are audited via InventoryTransaction (Manual Correction).
    // ---------------------------------------------------------------
    if (action === 'edit') {
      const inventoryId = str(body.inventory_id);
      if (!inventoryId) return Response.json({ error: 'Inventory item required' }, { status: 400 });
      const d = body.data || {};

      const inv = await base44.asServiceRole.entities.InventoryItem.get(inventoryId).catch(() => null);
      if (!inv) return Response.json({ error: 'Inventory item not found' }, { status: 404 });

      const masterId = str(inv.item_id);
      const master = masterId ? await base44.asServiceRole.entities.ItemMaster.get(masterId).catch(() => null) : null;

      const itemCode = str(d.item_code ?? inv.item_code);
      const itemName = str(d.item_name ?? inv.item_name);
      const metal = str(d.metal_type ?? inv.metal_type);
      const categoryId = str(d.category_id);
      const purityId = str(d.purity_id);
      const hsn = str(d.hsn ?? inv.hsn);
      const isActive = d.is_active !== undefined ? d.is_active !== false : (master ? master.is_active : true);
      const newBarcode = str(d.barcode);
      const newHuid = str(d.huid);

      if (!itemName || !metal) return Response.json({ error: 'Item Name and Metal are required' }, { status: 400 });

      // Barcode format validation
      if (newBarcode && !isValidBarcode(newBarcode)) return Response.json({ error: 'Barcode must be 4-5 alphanumeric characters (letters and numbers only, no spaces)' }, { status: 400 });

      // Resolve category + purity if changed.
      let categoryName = inv.category_name;
      if (categoryId) {
        const category = await base44.asServiceRole.entities.CategoryMaster.get(categoryId).catch(() => null);
        if (!category) return Response.json({ error: 'Invalid category' }, { status: 400 });
        categoryName = str(category.name);
      }
      let purityDisplay = inv.purity_display;
      let purityValue = Number(inv.purity_value) || 0;
      let purityChanged = false;
      if (purityId) {
        const purity = await base44.asServiceRole.entities.PurityMaster.get(purityId).catch(() => null);
        if (!purity) return Response.json({ error: 'Invalid purity' }, { status: 400 });
        purityDisplay = str(purity.display_format);
        purityValue = Number(purity.purity_value) || 0;
        purityChanged = true;
      }

      // Duplicate item_code check (exclude self) — only when Item Code is provided.
      if (master && itemCode) {
        const dupCode = await base44.asServiceRole.entities.ItemMaster.filter(
          { item_code: itemCode }, '-created_date', 5
        );
        if (dupCode.some((x) => x.id !== master.id)) return Response.json({ error: 'Another item with this Item Code already exists' }, { status: 409 });
      }

      // Barcode change — validate uniqueness if actually changing.
      let finalBarcode = inv.barcode;
      if (newBarcode && newBarcode !== inv.barcode) {
        const dupBarcode = await base44.asServiceRole.entities.InventoryItem.filter(
          { barcode: newBarcode }, '-created_date', 5
        );
        if (dupBarcode.some((x) => x.id !== inv.id)) return Response.json({ error: 'Another item with this Barcode already exists' }, { status: 409 });
        finalBarcode = newBarcode;
      }

      // HUID change — validate uniqueness if actually changing.
      let finalHuid = inv.huid || '';
      if (newHuid !== undefined && newHuid !== (inv.huid || '')) {
        if (newHuid) {
          const dupHuid = await base44.asServiceRole.entities.InventoryItem.filter(
            { huid: newHuid }, '-created_date', 5
          );
          if (dupHuid.some((x) => x.id !== inv.id)) return Response.json({ error: 'Another item with this HUID already exists' }, { status: 409 });
        }
        finalHuid = newHuid;
      }

      // --- UPDATE ITEM MASTER ---
      if (master) {
        await base44.asServiceRole.entities.ItemMaster.update(master.id, {
          item_code: itemCode,
          item_name: itemName,
          category_id: categoryId || master.category_id,
          category_name: categoryName,
          metal_type: metal,
          purity_id: purityId || master.purity_id,
          purity_display: purityDisplay,
          purity_value: purityValue,
          hsn,
          is_active: isActive,
        });
      }

      // --- STOCK CORRECTION (optional) ---
      const hasStockFields = d.quantity !== undefined || d.gross_weight !== undefined || d.stone_weight !== undefined || d.net_weight !== undefined;
      let stockCorrection = null;
      if (hasStockFields) {
        const prevQty = Number(inv.quantity) || 0;
        const prevGross = Number(inv.gross_weight) || 0;
        const prevStone = Number(inv.stone_weight) || 0;
        const prevNet = Number(inv.net_weight) || 0;
        const newQty = d.quantity !== undefined ? num(d.quantity) : prevQty;
        const newGross = d.gross_weight !== undefined ? num(d.gross_weight) : prevGross;
        const newStone = d.stone_weight !== undefined ? num(d.stone_weight) : prevStone;
        let newNet = d.net_weight !== undefined ? num(d.net_weight) : prevNet;
        // Auto-calc net if gross or stone changed but net not explicitly set
        if (d.net_weight === undefined && (d.gross_weight !== undefined || d.stone_weight !== undefined)) {
          newNet = Math.max(0, newGross - newStone);
        }
        if (newQty < 0 || newGross < 0 || newNet < 0) return Response.json({ error: 'Stock values cannot be negative' }, { status: 400 });
        if (newStone < 0 || newStone > newGross) return Response.json({ error: 'Less weight must be between 0 and gross weight' }, { status: 400 });
        if (newQty !== prevQty || newGross !== prevGross || newStone !== prevStone || newNet !== prevNet) {
          stockCorrection = { prevQty, newQty, prevGross, newGross, prevStone, newStone, prevNet, newNet };
        }
      }

      // --- SYNC INVENTORY ITEM ---
      const lowThreshold = num(d.low_stock_threshold ?? inv.low_stock_threshold);
      const baseQty = stockCorrection ? stockCorrection.newQty : (Number(inv.quantity) || 0);
      const newStatus = baseQty <= 0 ? 'out_of_stock' : (lowThreshold > 0 ? (baseQty <= lowThreshold ? 'low_stock' : 'in_stock') : (baseQty <= 2 ? 'low_stock' : 'in_stock'));
      const invUpdate = {
        item_name: itemName,
        item_code: itemCode,
        barcode: finalBarcode,
        huid: finalHuid,
        category_name: categoryName,
        metal_type: metal,
        purity_display: purityDisplay,
        purity_value: purityValue,
        hsn,
        low_stock_threshold: lowThreshold,
        status: newStatus,
      };
      if (stockCorrection) {
        invUpdate.quantity = stockCorrection.newQty;
        invUpdate.gross_weight = stockCorrection.newGross;
        invUpdate.stone_weight = stockCorrection.newStone;
        invUpdate.net_weight = stockCorrection.newNet;
        invUpdate.fine_weight = calcFineWeight(stockCorrection.newNet, purityValue);
      } else if (purityChanged) {
        invUpdate.fine_weight = calcFineWeight(Number(inv.net_weight) || 0, purityValue);
      }
      await base44.asServiceRole.entities.InventoryItem.update(inv.id, invUpdate);

      // --- RECORD MANUAL STOCK CORRECTION TRANSACTION ---
      if (stockCorrection) {
        const dir = stockCorrection.newQty >= stockCorrection.prevQty ? 'IN' : 'OUT';
        await base44.asServiceRole.entities.InventoryTransaction.create({
          item_id: masterId || str(inv.item_id),
          item_name: itemName,
          transaction_type: dir === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantity: Math.abs(stockCorrection.newQty - stockCorrection.prevQty),
          gross_weight: Math.abs(stockCorrection.newGross - stockCorrection.prevGross),
          stone_weight: Math.abs(stockCorrection.newStone - stockCorrection.prevStone),
          net_weight: Math.abs(stockCorrection.newNet - stockCorrection.prevNet),
          reference_type: 'correction',
          reason: 'Manual Stock Correction (Edit)',
          previous_stock: stockCorrection.prevQty,
          new_stock: stockCorrection.newQty,
          date: new Date().toISOString(),
          user_name: user.full_name || user.email || '',
        });
      }

      await writeAudit(base44, {
        action: 'update', module: 'inventory', record_id: inv.id,
        previous_value: { item_name: inv.item_name, item_code: inv.item_code, hsn: inv.hsn, barcode: inv.barcode, huid: inv.huid, quantity: inv.quantity, gross_weight: inv.gross_weight, net_weight: inv.net_weight },
        new_value: { item_name: itemName, item_code: itemCode, hsn, barcode: finalBarcode, huid: finalHuid, low_stock_threshold: lowThreshold, ...(stockCorrection ? { quantity: stockCorrection.newQty, gross_weight: stockCorrection.newGross, net_weight: stockCorrection.newNet } : {}) },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });

      return Response.json({ success: true });
    }

    // ---------------------------------------------------------------
    // ASSIGN HUID FROM ITEM CODE — explicit "Use Item Code as HUID" action.
    // Does NOT overwrite item_code. Validates HUID uniqueness before saving.
    // ---------------------------------------------------------------
    if (action === 'assign_huid_from_code') {
      const inventoryId = str(body.inventory_id);
      if (!inventoryId) return Response.json({ error: 'Inventory item required' }, { status: 400 });
      const inv = await base44.asServiceRole.entities.InventoryItem.get(inventoryId).catch(() => null);
      if (!inv) return Response.json({ error: 'Inventory item not found' }, { status: 404 });
      const itemCode = str(inv.item_code);
      if (!itemCode) return Response.json({ error: 'Item has no Item Code to use as HUID' }, { status: 400 });

      // Uniqueness check (exclude self)
      const dup = await base44.asServiceRole.entities.InventoryItem.filter(
        { huid: itemCode }, '-created_date', 5
      );
      if (dup.some((x) => x.id !== inv.id)) return Response.json({ error: 'Another item already uses this HUID' }, { status: 409 });

      await base44.asServiceRole.entities.InventoryItem.update(inv.id, { huid: itemCode });
      await writeAudit(base44, {
        action: 'update', module: 'inventory', record_id: inv.id,
        new_value: { huid: itemCode, source: 'assign_from_code' },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true, huid: itemCode });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}