import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { num, str } from '../../shared/utils.ts';

// Process Exchange — single-business. Old item stock-in + new item stock-out.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'processExchange');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const billId = str(body.original_bill_id);
    const oldItem = body.old_item || {};
    const newItem = body.new_item || {};
    const differenceAmount = num(body.difference_amount);
    const operationId = str(body.operation_id) || `exc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // --- IDEMPOTENCY CHECK ---
    if (str(body.operation_id)) {
      const existingExc = await base44.asServiceRole.entities.ExchangeTransaction.filter(
        { operation_id: operationId }, '-created_date', 1
      );
      if (existingExc.length > 0) {
        return Response.json({ success: true, exchange_id: existingExc[0].id, idempotent: true });
      }
    }

    if (!billId) return Response.json({ error: 'Original bill required' }, { status: 400 });
    if (!str(oldItem.item_id) || !str(newItem.item_id)) return Response.json({ error: 'Old and new item required' }, { status: 400 });

    const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
    if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });

    const exchangeNumber = `EXC-${Date.now().toString().slice(-6)}`;
    const exc = await base44.asServiceRole.entities.ExchangeTransaction.create({
      exchange_number: exchangeNumber, original_bill_id: bill.id, original_bill_number: bill.bill_number,
      customer_id: bill.customer_id, customer_name: bill.customer_name,
      old_item_details: JSON.stringify(oldItem), new_item_details: JSON.stringify(newItem),
      exchange_value: num(oldItem.value), difference_amount: differenceAmount,
      exchange_date: new Date().toISOString(), user_name: user.full_name || user.email || '',
      operation_id: operationId,
    });

    // Old item stock-in
    const oldInv = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(oldItem.item_id) }, '-updated_date', 1);
    if (oldInv.length) {
      const inv = oldInv[0];
      const prev = Number(inv.quantity) || 0;
      const newQty = prev + num(oldItem.quantity || 1);
      await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
        quantity: newQty, net_weight: (Number(inv.net_weight) || 0) + num(oldItem.weight), gross_weight: (Number(inv.gross_weight) || 0) + num(oldItem.weight),
      });
      await base44.asServiceRole.entities.InventoryTransaction.create({
        item_id: str(oldItem.item_id), item_name: str(oldItem.name), transaction_type: 'EXCHANGE_IN',
        quantity: num(oldItem.quantity || 1), net_weight: num(oldItem.weight), gross_weight: num(oldItem.weight),
        reference_type: 'exchange', reference_id: exc.id, reason: 'Exchange in ' + exchangeNumber,
        previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
      });
    }

    // New item stock-out
    const newInv = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(newItem.item_id) }, '-updated_date', 1);
    if (newInv.length) {
      const inv = newInv[0];
      const prev = Number(inv.quantity) || 0;
      if (prev < num(newItem.quantity || 1)) return Response.json({ error: 'Insufficient stock for new item' }, { status: 400 });
      const newQty = prev - num(newItem.quantity || 1);
      await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
        quantity: newQty, net_weight: (Number(inv.net_weight) || 0) - num(newItem.weight), gross_weight: (Number(inv.gross_weight) || 0) - num(newItem.weight),
        status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
      });
      await base44.asServiceRole.entities.InventoryTransaction.create({
        item_id: str(newItem.item_id), item_name: str(newItem.name), transaction_type: 'EXCHANGE_OUT',
        quantity: num(newItem.quantity || 1), net_weight: num(newItem.weight), gross_weight: num(newItem.weight),
        reference_type: 'exchange', reference_id: exc.id, reason: 'Exchange out ' + exchangeNumber,
        previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
      });
    }

    await writeAudit(base44, {
      action: 'exchange', module: 'billing', record_id: exc.id,
      new_value: { exchange_number: exchangeNumber, difference: differenceAmount },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, exchange_id: exc.id, exchange_number: exchangeNumber, difference_amount: differenceAmount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}