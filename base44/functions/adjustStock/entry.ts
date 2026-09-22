import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { num, str } from '../../shared/utils.ts';
import { calcFineWeight } from '../../shared/billCalc.ts';

// Adjust Stock — single-business. Only legitimate manual stock change outside transactions.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'adjustStock');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const inventoryId = str(body.inventory_id);
    const direction = str(body.direction);
    const quantity = num(body.quantity);
    const grossWeight = num(body.gross_weight);
    const netWeight = num(body.net_weight);
    const reason = str(body.reason);
    const supplierName = str(body.supplier_name);
    const purchaseRef = str(body.purchase_reference);
    const txnTypeOverride = str(body.transaction_type);

    if (!inventoryId) return Response.json({ error: 'Inventory item required' }, { status: 400 });
    if (direction !== 'in' && direction !== 'out') return Response.json({ error: 'Direction must be in or out' }, { status: 400 });
    if (quantity < 0) return Response.json({ error: 'Quantity cannot be negative' }, { status: 400 });
    if (grossWeight < 0) return Response.json({ error: 'Gross weight cannot be negative' }, { status: 400 });
    if (netWeight < 0) return Response.json({ error: 'Net weight cannot be negative' }, { status: 400 });
    if (quantity <= 0 && netWeight <= 0) return Response.json({ error: 'Quantity or weight required' }, { status: 400 });
    if (!reason) return Response.json({ error: 'Reason is required for stock adjustment' }, { status: 400 });

    const inv = await base44.asServiceRole.entities.InventoryItem.get(inventoryId).catch(() => null);
    if (!inv) return Response.json({ error: 'Inventory item not found' }, { status: 404 });

    const prev = Number(inv.quantity) || 0;
    const sign = direction === 'in' ? 1 : -1;
    const newQty = prev + sign * quantity;
    if (newQty < 0) return Response.json({ error: 'Resulting stock cannot be negative' }, { status: 400 });
    const newGross = (Number(inv.gross_weight) || 0) + sign * grossWeight;
    const newNet = (Number(inv.net_weight) || 0) + sign * netWeight;

    const purityValue = Number(inv.purity_value) || 0;
    await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
      quantity: newQty, gross_weight: newGross, net_weight: newNet,
      fine_weight: calcFineWeight(newNet, purityValue),
      status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
    });
    const fullReason = [reason, supplierName ? `Supplier: ${supplierName}` : '', purchaseRef ? `Purchase: ${purchaseRef}` : ''].filter(Boolean).join(' | ');
    await base44.asServiceRole.entities.InventoryTransaction.create({
      item_id: inv.item_id, item_name: inv.item_name,
      transaction_type: txnTypeOverride || (direction === 'in' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'),
      quantity, gross_weight: grossWeight, net_weight: netWeight,
      reference_type: purchaseRef ? 'purchase' : 'adjustment', reference_id: purchaseRef || undefined, reason: fullReason,
      previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
    });

    await writeAudit(base44, {
      action: 'stock_adjust', module: 'inventory', record_id: inv.id,
      previous_value: { quantity: prev, gross: inv.gross_weight, net: inv.net_weight },
      new_value: { quantity: newQty, gross: newGross, net: newNet, reason },
      reason, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, inventory_id: inv.id, new_quantity: newQty });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}