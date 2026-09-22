import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';
import { calcFineWeight, calcBill, computeDue } from '../shared/billCalc.js';
import { db } from '../db/database.js';

// Finalize Purchase — single-business. Stock-in via existing transaction model.
// Supports rate/making/GST calculation, multi-mode payments, edit, view, delete.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'finalizePurchase');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);

    // --- GET PURCHASE (view with items) ---
    if (action === 'get') {
      const purchaseId = str(body.purchase_id);
      if (!purchaseId) return Response.json({ error: 'Purchase ID required' }, { status: 400 });
      const purchase = await base44.asServiceRole.entities.Purchase.get(purchaseId).catch(() => null);
      if (!purchase) return Response.json({ error: 'Purchase not found' }, { status: 404 });
      const items = await base44.asServiceRole.entities.PurchaseItem.filter({ purchase_id: purchaseId }, '-created_date', 500);
      return Response.json({ success: true, purchase, items });
    }

    // --- DELETE PURCHASE (with inventory reversal) ---
    if (action === 'delete') {
      const purchaseId = str(body.purchase_id);
      if (!purchaseId) return Response.json({ error: 'Purchase ID required' }, { status: 400 });
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can delete purchases' }, { status: 403 });
      const result = await deletePurchaseCascade(base44, purchaseId, user, ctx);
      if (!result.deleted) return Response.json({ error: result.reason }, { status: 404 });
      return Response.json({ success: true, deleted: true, purchase_id: purchaseId });
    }

    // --- BULK DELETE PURCHASES (with inventory reversal for each) ---
    if (action === 'bulk_delete') {
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can delete purchases' }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return Response.json({ error: 'No IDs provided' }, { status: 400 });
      const bulkResult = { deleted: 0, skipped: [] };
      for (const rawId of ids) {
        const pid = str(rawId);
        const r = await deletePurchaseCascade(base44, pid, user, ctx);
        if (r.deleted) bulkResult.deleted++;
        else bulkResult.skipped.push({ id: pid, reason: r.reason || 'Failed' });
      }
      return Response.json({ success: true, ...bulkResult });
    }

    // --- EDIT PURCHASE (reverse old stock, re-apply new) ---
    if (action === 'edit') {
      const purchaseId = str(body.purchase_id);
      if (!purchaseId) return Response.json({ error: 'Purchase ID required' }, { status: 400 });
      if (ctx.role !== 'admin') return Response.json({ error: 'Only admins can edit purchases' }, { status: 403 });
      const purchase = await base44.asServiceRole.entities.Purchase.get(purchaseId).catch(() => null);
      if (!purchase) return Response.json({ error: 'Purchase not found' }, { status: 404 });
      if (purchase.status !== 'finalized') return Response.json({ error: 'Only finalized purchases can be edited' }, { status: 400 });

      // Check if the original purchase had inventory updates (Purchase Management
      // records created with update_inventory=false have no InventoryTransactions)
      const oldTxns = await base44.asServiceRole.entities.InventoryTransaction.filter({ reference_type: 'purchase', reference_id: purchaseId }, '-created_date', 1);
      const hadInventoryUpdate = oldTxns.length > 0;

      // Only reverse inventory if the original purchase actually updated inventory
      if (hadInventoryUpdate) {
      const oldItems = await base44.asServiceRole.entities.PurchaseItem.filter({ purchase_id: purchaseId }, '-created_date', 500);
      for (const pi of oldItems) {
        if (!pi.item_id) continue;
        const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(pi.item_id) }, '-updated_date', 1);
        if (invItems.length > 0) {
          const inv = invItems[0];
          const prevQty = Number(inv.quantity) || 0;
          const newQty = Math.max(0, prevQty - num(pi.quantity));
          const newNetWt = Math.max(0, (Number(inv.net_weight) || 0) - num(pi.net_weight));
          await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
            quantity: newQty,
            gross_weight: Math.max(0, (Number(inv.gross_weight) || 0) - num(pi.gross_weight)),
            net_weight: newNetWt,
            fine_weight: calcFineWeight(newNetWt, Number(inv.purity_value) || 0),
            status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
          }).catch(() => {});
        }
      }
      // Delete old transactions + items
      await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
      } // end if (hadInventoryUpdate)
      await base44.asServiceRole.entities.PurchaseItem.deleteMany({ purchase_id: purchaseId }).catch(() => {});

      // Reverse old supplier transaction
      await base44.asServiceRole.entities.SupplierTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
      if (purchase.supplier_id && num(purchase.total_amount) > 0) {
        const supplier = await base44.asServiceRole.entities.Supplier.get(purchase.supplier_id).catch(() => null);
        if (supplier) {
          await base44.asServiceRole.entities.Supplier.update(supplier.id, {
            outstanding: Math.max(0, (Number(supplier.outstanding) || 0) - num(purchase.total_amount)),
          }).catch(() => {});
        }
      }

      // Re-apply with new data (fall through to create logic, but update existing purchase)
      return await reapplyPurchase(base44, user, ctx, purchase, body);
    }

    // --- CREATE / FINALIZE PURCHASE ---
    const supplierId = str(body.supplier_id);
    const purchaseDate = str(body.purchase_date) || new Date().toISOString().slice(0, 10);
    const notes = str(body.notes);
    const items = Array.isArray(body.items) ? body.items : [];
    const operationId = str(body.operation_id) || `pop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const paymentMode = str(body.payment_mode) || 'cash';
    const paymentComponents = Array.isArray(body.payment_components) ? body.payment_components : [];
    const paymentComponentsStr = paymentComponents.length > 0 ? JSON.stringify(paymentComponents) : '';
    const paidAmount = num(body.paid_amount);
    const gstEnabled = body.gst_enabled === true;
    const gstMode = ['intra', 'inter', 'none'].includes(str(body.gst_mode)) ? str(body.gst_mode) : 'none';
    const otherCharges = num(body.other_charges);
    // When false, this is a Purchase Management record only — no inventory stock-in.
    // Default true for backward compatibility with existing Add Purchase workflow.
    const updateInventory = body.update_inventory !== false;

    // --- IDEMPOTENCY CHECK ---
    const existing = await base44.asServiceRole.entities.Purchase.filter(
      { operation_id: operationId }, '-created_date', 1
    );
    if (existing.length > 0 && existing[0].status === 'finalized') {
      const pur = existing[0];
      return Response.json({ success: true, purchase_id: pur.id, purchase_number: pur.purchase_number, total_amount: pur.total_amount, idempotent: true });
    }

    // --- VALIDATION ---
    if (!supplierId) return Response.json({ error: 'Supplier is required' }, { status: 400 });
    if (items.length === 0) return Response.json({ error: 'At least one item is required' }, { status: 400 });

    const supplier = await base44.asServiceRole.entities.Supplier.get(supplierId).catch(() => null);
    if (!supplier) return Response.json({ error: 'Invalid supplier' }, { status: 400 });

    for (const r of items) {
      if (!str(r.item_id) && !str(r.item_name)) return Response.json({ error: 'Each row needs an item' }, { status: 400 });
      if (num(r.quantity) <= 0) return Response.json({ error: 'Quantity must be > 0' }, { status: 400 });
      if (num(r.net_weight) <= 0) return Response.json({ error: 'Net weight must be > 0' }, { status: 400 });
    }

    // Purity lookup for fine weight calculation
    const purities = await base44.asServiceRole.entities.PurityMaster.filter({ is_active: true }, 'purity_value', 100);
    const purityMap = new Map(purities.map(p => [`${p.metal_type}:${p.display_format}`, p]));

    // GST config
    const gstConfigs = await base44.asServiceRole.entities.GSTConfig.filter({ is_active: true }, '-created_date', 5);
    const gstConfig = gstConfigs[0] || null;
    const effectiveGstRate = gstEnabled && gstConfig ? Number(gstConfig.gst_rate) : 0;

    // Normalize items with purity + rate resolution
    const normalizedItems = items.map((it) => {
      const purityKey = `${it.metal_type}:${it.purity_display || ''}`;
      const purity = purityMap.get(purityKey);
      const purityValue = num(it.purity_value) > 0 ? num(it.purity_value) : (purity ? Number(purity.purity_value) : 0);
      let rate = num(it.rate_per_gram);
      if (rate <= 0) {
        // Fallback: look up active rate for this metal+purity
        // (Purchase rate may be manually entered by admin)
      }
      return {
        ...it,
        rate_per_gram: rate,
        making_charge: num(it.making_charge) || 0,
        making_charge_type: str(it.making_charge_type) || 'percentage',
        hallmarking_charge: num(it.hallmarking_charge) || 0,
        discount: num(it.discount) || 0,
        gst_rate: effectiveGstRate,
        gst_enabled: gstEnabled,
        purity_value: purityValue,
      };
    });

    // Calculate using the centralized engine
    const calc = calcBill(normalizedItems, 0, gstConfig, { gst_enabled: gstEnabled, gst_mode: gstMode, other_charges: otherCharges });
    const totalAmount = calc.totalAmount;
    const due = computeDue(totalAmount, paidAmount);

    let purchaseNumber = `PUR-${Date.now().toString().slice(-6)}`;
    let exists = await base44.asServiceRole.entities.Purchase.filter({ purchase_number: purchaseNumber }, '-created_date', 1);
    if (exists.length > 0) purchaseNumber = `PUR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Rate snapshot
    const rateSnapshot = JSON.stringify(
      purities.filter(p => p.is_active).map(p => ({ metal: p.metal_type, purity: p.display_format, purity_value: p.purity_value }))
    );

    try {
      const txResult = await db.transaction(async (tx) => {
        const txBase44 = createClientFromRequest(req, { txClient: tx });

        const purchase = await txBase44.asServiceRole.entities.Purchase.create({
          purchase_number: purchaseNumber, supplier_id: supplierId, supplier_name: supplier.name,
          purchase_date: purchaseDate,
          subtotal: calc.subtotal, making_charge_total: calc.items.reduce((s, c) => s + num(c.making_amount), 0),
          hallmarking_charge_total: calc.hallmarkingTotal, other_charges: otherCharges,
          gst_enabled: gstEnabled, gst_mode: calc.gstMode, gst_rate_snapshot: effectiveGstRate,
          cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
          total_amount: totalAmount, paid_amount: paidAmount, due_amount: due,
          payment_mode: paymentMode, payment_details: str(body.payment_details), payment_components: paymentComponentsStr,
          rate_snapshot: rateSnapshot,
          operation_id: operationId, notes, status: 'finalized',
        });

        for (let i = 0; i < calc.items.length; i++) {
          const c = calc.items[i];
          const r = items[i];
          const fineWeight = calcFineWeight(num(c.net_weight), num(c.purity_value));
          await txBase44.asServiceRole.entities.PurchaseItem.create({
            purchase_id: purchase.id, item_id: str(r.item_id), item_name: str(c.item_name), item_code: str(c.item_code),
            huid: str(c.huid || ''),
            metal_type: c.metal_type, purity_display: str(c.purity_display), purity_value: num(c.purity_value), fine_weight: fineWeight,
            category_name: str(c.category_name),
            hsn: str(c.hsn), quantity: num(c.quantity), gross_weight: num(c.gross_weight),
            stone_weight: num(c.stone_weight), net_weight: num(c.net_weight),
            wastage: num(c.wastage),
            wastage_type: c.wastage_type || undefined, wastage_weight: num(c.wastage_weight), chargeable_weight: num(c.chargeable_weight),
            rate_per_gram: num(c.rate_per_gram), making_charge: num(c.making_charge),
            making_charge_type: c.making_charge_type || 'percentage', hallmarking_charge: num(c.hallmarking_charge),
            discount: num(c.discount), gst_rate: effectiveGstRate,
            metal_value: c.metal_value, making_amount: c.making_amount, taxable_amount: c.taxable_amount,
            gst_amount: num(c.gst_amount), total: c.total,
            purchase_price: c.total,
          });

          if (updateInventory) {
            const existingInv = await txBase44.asServiceRole.entities.InventoryItem.filter(
              { item_id: str(r.item_id) }, '-updated_date', 1
            );
            if (existingInv.length) {
              const inv = existingInv[0];
              const prev = Number(inv.quantity) || 0;
              const newQty = prev + num(r.quantity);
              const newNetWt = (Number(inv.net_weight) || 0) + num(r.net_weight);
              await txBase44.asServiceRole.entities.InventoryItem.update(inv.id, {
                quantity: newQty, gross_weight: (Number(inv.gross_weight) || 0) + num(r.gross_weight),
                net_weight: newNetWt, fine_weight: calcFineWeight(newNetWt, Number(inv.purity_value) || num(c.purity_value)),
                status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
              });
              await txBase44.asServiceRole.entities.InventoryTransaction.create({
                item_id: str(r.item_id), item_name: str(c.item_name), transaction_type: 'PURCHASE_IN',
                quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
                reference_type: 'purchase', reference_id: purchase.id, reason: 'Purchase ' + purchaseNumber,
                previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
              });
            } else {
              await txBase44.asServiceRole.entities.InventoryItem.create({
                item_id: str(r.item_id), item_name: str(c.item_name), item_code: str(c.item_code),
                category_name: str(c.category_name), metal_type: c.metal_type, purity_display: str(c.purity_display),
                purity_value: num(c.purity_value), fine_weight: fineWeight,
                hsn: str(c.hsn), quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
                wastage: num(r.wastage), status: num(r.quantity) <= 2 ? 'low_stock' : 'in_stock',
              });
              await txBase44.asServiceRole.entities.InventoryTransaction.create({
                item_id: str(r.item_id), item_name: str(c.item_name), transaction_type: 'PURCHASE_IN',
                quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
                reference_type: 'purchase', reference_id: purchase.id, reason: 'Purchase ' + purchaseNumber,
                previous_stock: 0, new_stock: num(r.quantity), date: new Date().toISOString(), user_name: user.full_name || user.email || '',
              });
            }
          }
        }

        await txBase44.asServiceRole.entities.SupplierTransaction.create({
          supplier_id: supplierId, supplier_name: supplier.name, transaction_type: 'purchase',
          reference_type: 'purchase', reference_id: purchase.id, amount: totalAmount, date: new Date().toISOString(),
        });
        await txBase44.asServiceRole.entities.Supplier.update(supplierId, { outstanding: (Number(supplier.outstanding) || 0) + totalAmount });

        await writeAudit(txBase44, {
          action: 'create', module: 'purchase', record_id: purchase.id,
          new_value: { purchase_number: purchaseNumber, total: totalAmount },
          user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
        });

        return {
          success: true,
          purchase_id: purchase.id,
          purchase_number: purchaseNumber,
          total_amount: totalAmount,
          operation_id: operationId
        };
      });

      return Response.json(txResult);
    } catch (writeError) {
      await writeAudit(base44, {
        action: 'error', module: 'purchase', record_id: purchaseNumber,
        new_value: { purchase_number: purchaseNumber, error: writeError.message, operation_id: operationId },
        reason: 'Purchase finalization rolled back in transaction',
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      }).catch(() => {});
      return Response.json({ error: `Purchase failed: ${writeError.message}`, operation_id: operationId }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Helper: re-apply purchase data to an existing purchase (used by edit action)
async function reapplyPurchase(base44, user, ctx, purchase, body) {
  const supplierId = str(body.supplier_id) || purchase.supplier_id;
  const purchaseDate = str(body.purchase_date) || purchase.purchase_date;
  const notes = str(body.notes);
  const items = Array.isArray(body.items) ? body.items : [];
  const paymentMode = str(body.payment_mode) || 'cash';
  const paymentComponents = Array.isArray(body.payment_components) ? body.payment_components : [];
  const paymentComponentsStr = paymentComponents.length > 0 ? JSON.stringify(paymentComponents) : '';
  const paidAmount = num(body.paid_amount);
  const gstEnabled = body.gst_enabled === true;
  const gstMode = ['intra', 'inter', 'none'].includes(str(body.gst_mode)) ? str(body.gst_mode) : 'none';
  const otherCharges = num(body.other_charges);
  const updateInventory = body.update_inventory !== false;

  if (items.length === 0) return Response.json({ error: 'At least one item is required' }, { status: 400 });
  const supplier = await base44.asServiceRole.entities.Supplier.get(supplierId).catch(() => null);
  if (!supplier) return Response.json({ error: 'Invalid supplier' }, { status: 400 });

  for (const r of items) {
    if (!str(r.item_id) && !str(r.item_name)) return Response.json({ error: 'Each row needs an item' }, { status: 400 });
    if (num(r.quantity) <= 0) return Response.json({ error: 'Quantity must be > 0' }, { status: 400 });
    if (num(r.net_weight) <= 0) return Response.json({ error: 'Net weight must be > 0' }, { status: 400 });
  }

  const purities = await base44.asServiceRole.entities.PurityMaster.filter({ is_active: true }, 'purity_value', 100);
  const purityMap = new Map(purities.map(p => [`${p.metal_type}:${p.display_format}`, p]));
  const gstConfigs = await base44.asServiceRole.entities.GSTConfig.filter({ is_active: true }, '-created_date', 5);
  const gstConfig = gstConfigs[0] || null;
  const effectiveGstRate = gstEnabled && gstConfig ? Number(gstConfig.gst_rate) : 0;

  const normalizedItems = items.map((it) => {
    const purityKey = `${it.metal_type}:${it.purity_display || ''}`;
    const purity = purityMap.get(purityKey);
    const purityValue = num(it.purity_value) > 0 ? num(it.purity_value) : (purity ? Number(purity.purity_value) : 0);
    return {
      ...it,
      rate_per_gram: num(it.rate_per_gram),
      making_charge: num(it.making_charge) || 0,
      making_charge_type: str(it.making_charge_type) || 'percentage',
      hallmarking_charge: num(it.hallmarking_charge) || 0,
      discount: num(it.discount) || 0,
      gst_rate: effectiveGstRate,
      gst_enabled: gstEnabled,
      purity_value: purityValue,
    };
  });

  const calc = calcBill(normalizedItems, 0, gstConfig, { gst_enabled: gstEnabled, gst_mode: gstMode, other_charges: otherCharges });
  const totalAmount = calc.totalAmount;
  const due = computeDue(totalAmount, paidAmount);

  // Update purchase record
  await base44.asServiceRole.entities.Purchase.update(purchase.id, {
    supplier_id: supplierId, supplier_name: supplier.name, purchase_date: purchaseDate,
    subtotal: calc.subtotal, making_charge_total: calc.items.reduce((s, c) => s + num(c.making_amount), 0),
    hallmarking_charge_total: calc.hallmarkingTotal, other_charges: otherCharges,
    gst_enabled: gstEnabled, gst_mode: calc.gstMode, gst_rate_snapshot: effectiveGstRate,
    cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
    total_amount: totalAmount, paid_amount: paidAmount, due_amount: due,
    payment_mode: paymentMode, payment_details: str(body.payment_details), payment_components: paymentComponentsStr,
    notes,
  });

  // Re-create items + stock-in
  for (let i = 0; i < calc.items.length; i++) {
    const c = calc.items[i];
    const r = items[i];
    const fineWeight = calcFineWeight(num(c.net_weight), num(c.purity_value));
    await base44.asServiceRole.entities.PurchaseItem.create({
      purchase_id: purchase.id, item_id: str(r.item_id), item_name: str(c.item_name), item_code: str(c.item_code),
      metal_type: c.metal_type, purity_display: str(c.purity_display), purity_value: num(c.purity_value), fine_weight: fineWeight,
      category_name: str(c.category_name),
      hsn: str(c.hsn), quantity: num(c.quantity), gross_weight: num(c.gross_weight),
      stone_weight: num(c.stone_weight), net_weight: num(c.net_weight),
      wastage: num(c.wastage),
      wastage_type: c.wastage_type || undefined, wastage_weight: num(c.wastage_weight), chargeable_weight: num(c.chargeable_weight),
      rate_per_gram: num(c.rate_per_gram), making_charge: num(c.making_charge),
      making_charge_type: c.making_charge_type || 'percentage', hallmarking_charge: num(c.hallmarking_charge),
      discount: num(c.discount), gst_rate: effectiveGstRate,
      metal_value: c.metal_value, making_amount: c.making_amount, taxable_amount: c.taxable_amount,
      gst_amount: num(c.gst_amount), total: c.total, purchase_price: c.total,
    });
    // --- INVENTORY STOCK-IN (only when update_inventory is true) ---
    if (updateInventory) {
      const existingInv = await base44.asServiceRole.entities.InventoryItem.filter(
        { item_id: str(r.item_id) }, '-updated_date', 1
      );
      if (existingInv.length) {
        const inv = existingInv[0];
        const prev = Number(inv.quantity) || 0;
        const newQty = prev + num(r.quantity);
        const newNetWt = (Number(inv.net_weight) || 0) + num(r.net_weight);
        await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
          quantity: newQty, gross_weight: (Number(inv.gross_weight) || 0) + num(r.gross_weight),
          net_weight: newNetWt, fine_weight: calcFineWeight(newNetWt, Number(inv.purity_value) || num(c.purity_value)),
          status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
        });
        await base44.asServiceRole.entities.InventoryTransaction.create({
          item_id: str(r.item_id), item_name: str(c.item_name), transaction_type: 'PURCHASE_IN',
          quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
          reference_type: 'purchase', reference_id: purchase.id, reason: 'Purchase Edit ' + purchase.purchase_number,
          previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
        });
      } else {
        await base44.asServiceRole.entities.InventoryItem.create({
          item_id: str(r.item_id), item_name: str(c.item_name), item_code: str(c.item_code),
          category_name: str(c.category_name), metal_type: c.metal_type, purity_display: str(c.purity_display),
          purity_value: num(c.purity_value), fine_weight: fineWeight,
          hsn: str(c.hsn), quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
          wastage: num(r.wastage), status: num(r.quantity) <= 2 ? 'low_stock' : 'in_stock',
        });
        await base44.asServiceRole.entities.InventoryTransaction.create({
          item_id: str(r.item_id), item_name: str(c.item_name), transaction_type: 'PURCHASE_IN',
          quantity: num(r.quantity), gross_weight: num(r.gross_weight), net_weight: num(r.net_weight),
          reference_type: 'purchase', reference_id: purchase.id, reason: 'Purchase Edit ' + purchase.purchase_number,
          previous_stock: 0, new_stock: num(r.quantity), date: new Date().toISOString(), user_name: user.full_name || user.email || '',
        });
      }
    }
  }

  // Re-create supplier transaction
  await base44.asServiceRole.entities.SupplierTransaction.create({
    supplier_id: supplierId, supplier_name: supplier.name, transaction_type: 'purchase',
    reference_type: 'purchase', reference_id: purchase.id, amount: totalAmount, date: new Date().toISOString(),
  });
  await base44.asServiceRole.entities.Supplier.update(supplierId, { outstanding: (Number(supplier.outstanding) || 0) + totalAmount });

  await writeAudit(base44, {
    action: 'update', module: 'purchase', record_id: purchase.id,
    new_value: { purchase_number: purchase.purchase_number, total: totalAmount, edited: true },
    user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
  });

  return Response.json({ success: true, purchase_id: purchase.id, purchase_number: purchase.purchase_number, total_amount: totalAmount });
}

// Helper: delete a purchase with full inventory reversal and cleanup.
// Used by the 'delete' action below and by manageData's cascade deletion.
export async function deletePurchaseCascade(base44, purchaseId, user, ctx) {
  const purchase = await base44.asServiceRole.entities.Purchase.get(purchaseId).catch(() => null);
  if (!purchase) return { deleted: false, reason: 'Purchase not found' };

  const purchaseItems = await base44.asServiceRole.entities.PurchaseItem.filter({ purchase_id: purchaseId }, '-created_date', 500);

  // Check if the purchase had inventory updates (Purchase Management records don't)
  const oldTxns = await base44.asServiceRole.entities.InventoryTransaction.filter({ reference_type: 'purchase', reference_id: purchaseId }, '-created_date', 1);
  const hadInventoryUpdate = oldTxns.length > 0;

  // Reverse inventory (subtract what was added) — only if the purchase actually updated inventory
  if (hadInventoryUpdate) {
    for (const pi of purchaseItems) {
      if (!pi.item_id) continue;
      const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(pi.item_id) }, '-updated_date', 1);
      if (invItems.length > 0) {
        const inv = invItems[0];
        const prevQty = Number(inv.quantity) || 0;
        const newQty = Math.max(0, prevQty - num(pi.quantity));
        const newNetWt = Math.max(0, (Number(inv.net_weight) || 0) - num(pi.net_weight));
        await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
          quantity: newQty,
          gross_weight: Math.max(0, (Number(inv.gross_weight) || 0) - num(pi.gross_weight)),
          net_weight: newNetWt,
          fine_weight: calcFineWeight(newNetWt, Number(inv.purity_value) || 0),
          status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
        }).catch(() => {});
      }
    }
  }

  // Delete dependent records
  await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
  await base44.asServiceRole.entities.SupplierTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
  await base44.asServiceRole.entities.PurchaseItem.deleteMany({ purchase_id: purchaseId }).catch(() => {});

  // Update supplier outstanding
  if (purchase.supplier_id && num(purchase.total_amount) > 0) {
    const supplier = await base44.asServiceRole.entities.Supplier.get(purchase.supplier_id).catch(() => null);
    if (supplier) {
      await base44.asServiceRole.entities.Supplier.update(supplier.id, {
        outstanding: Math.max(0, (Number(supplier.outstanding) || 0) - num(purchase.total_amount)),
      }).catch(() => {});
    }
  }

  // Delete the purchase
  await base44.asServiceRole.entities.Purchase.delete(purchaseId);
  await writeAudit(base44, {
    action: 'delete', module: 'purchase', record_id: purchaseId,
    previous_value: { purchase_number: purchase.purchase_number, total: purchase.total_amount },
    user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
  });
  return { deleted: true };
}