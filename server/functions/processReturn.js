import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';

// Process Return — single-business. Reverses sale, returns stock, adjusts outstanding.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'processReturn');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const billId = str(body.original_bill_id);
    const billItemId = str(body.bill_item_id);
    const quantity = num(body.quantity);
    const reason = str(body.reason);
    const operationId = str(body.operation_id) || `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // --- IDEMPOTENCY CHECK ---
    if (str(body.operation_id)) {
      const existingRet = await base44.asServiceRole.entities.ReturnTransaction.filter(
        { operation_id: operationId }, '-created_date', 1
      );
      if (existingRet.length > 0) {
        return Response.json({ success: true, return_id: existingRet[0].id, idempotent: true });
      }
    }

    if (!billId) return Response.json({ error: 'Original bill required' }, { status: 400 });
    if (quantity <= 0) return Response.json({ error: 'Return quantity must be > 0' }, { status: 400 });

    const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
    if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });
    if (bill.status !== 'finalized') return Response.json({ error: 'Bill not finalized' }, { status: 400 });

    let billItem = null;
    if (billItemId) {
      billItem = await base44.asServiceRole.entities.BillItem.get(billItemId).catch(() => null);
    }
    if (!billItem) {
      const items = await base44.asServiceRole.entities.BillItem.filter({ bill_id: billId }, '-created_date', 50);
      billItem = items[0];
    }
    if (!billItem) return Response.json({ error: 'Bill item not found' }, { status: 404 });
    if (quantity > Number(billItem.quantity)) return Response.json({ error: 'Return quantity exceeds billed quantity' }, { status: 400 });

    const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
    const value = num(billItem.total) * (quantity / num(billItem.quantity));

    const ret = await base44.asServiceRole.entities.ReturnTransaction.create({
      return_number: returnNumber, original_bill_id: bill.id, original_bill_number: bill.bill_number,
      customer_id: bill.customer_id, customer_name: bill.customer_name,
      bill_item_id: billItem.id, item_id: str(billItem.item_id), item_name: billItem.item_name,
      quantity, net_weight: num(billItem.net_weight) * (quantity / num(billItem.quantity)),
      value, reason, return_date: new Date().toISOString(), user_name: user.full_name || user.email || '',
      operation_id: operationId,
    });

    const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(billItem.item_id) }, '-updated_date', 1);
    if (invItems.length) {
      const inv = invItems[0];
      const prev = Number(inv.quantity) || 0;
      const newQty = prev + quantity;
      const ratio = quantity / num(billItem.quantity);
      const retGross = num(billItem.gross_weight) * ratio;
      const retNet = num(billItem.net_weight) * ratio;
      await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
        quantity: newQty, net_weight: (Number(inv.net_weight) || 0) + retNet, gross_weight: (Number(inv.gross_weight) || 0) + retGross,
        status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
      });
      await base44.asServiceRole.entities.InventoryTransaction.create({
        item_id: str(billItem.item_id), item_name: billItem.item_name, transaction_type: 'RETURN_IN',
        quantity, gross_weight: retGross, net_weight: retNet,
        reference_type: 'return', reference_id: ret.id, reason: 'Return ' + returnNumber,
        previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
      });
    }

    const cust = await base44.asServiceRole.entities.Customer.get(bill.customer_id).catch(() => null);
    if (cust) {
      await base44.asServiceRole.entities.Customer.update(cust.id, { outstanding: Math.max(0, (Number(cust.outstanding) || 0) - value) });
    }

    await writeAudit(base44, {
      action: 'return', module: 'billing', record_id: ret.id,
      new_value: { return_number: returnNumber, bill_id: bill.id, value },
      reason, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, return_id: ret.id, return_number: returnNumber, value });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}