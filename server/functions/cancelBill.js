import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';

// Cancel Bill — single-business. Reverses stock, outstanding. Does NOT delete.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'cancelBill');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const billId = str(body.bill_id);
    const reason = str(body.reason);

    if (!billId) return Response.json({ error: 'Bill ID required' }, { status: 400 });
    if (!reason) return Response.json({ error: 'Cancellation reason required' }, { status: 400 });

    const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
    if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });
    if (bill.status === 'cancelled') return Response.json({ error: 'Bill already cancelled' }, { status: 400 });
    if (bill.status !== 'finalized') return Response.json({ error: 'Only finalized bills can be cancelled' }, { status: 400 });

    const returns = await base44.asServiceRole.entities.ReturnTransaction.filter({ original_bill_id: billId }, '-created_date', 1);
    if (returns.length > 0) return Response.json({ error: 'Cannot cancel bill with existing returns' }, { status: 400 });
    const exchanges = await base44.asServiceRole.entities.ExchangeTransaction.filter({ original_bill_id: billId }, '-created_date', 1);
    if (exchanges.length > 0) return Response.json({ error: 'Cannot cancel bill with existing exchanges' }, { status: 400 });

    const billItems = await base44.asServiceRole.entities.BillItem.filter({ bill_id: billId }, '-created_date', 100);

    if (bill.bill_source !== 'manual') {
      for (const bi of billItems) {
        const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(bi.item_id) }, '-updated_date', 1);
        if (invItems.length) {
          const inv = invItems[0];
          const prev = Number(inv.quantity) || 0;
          const newQty = prev + num(bi.quantity);
          const retGross = num(bi.gross_weight) * num(bi.quantity);
          const retNet = num(bi.net_weight) * num(bi.quantity);
          await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
            quantity: newQty, gross_weight: (Number(inv.gross_weight) || 0) + retGross,
            net_weight: (Number(inv.net_weight) || 0) + retNet,
            status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
          });
          await base44.asServiceRole.entities.InventoryTransaction.create({
            item_id: str(bi.item_id), item_name: bi.item_name, transaction_type: 'ADJUSTMENT_IN',
            quantity: num(bi.quantity), gross_weight: retGross, net_weight: retNet,
            reference_type: 'bill_cancellation', reference_id: bill.id, reason: 'Cancellation ' + bill.bill_number,
            previous_stock: prev, new_stock: newQty, date: new Date().toISOString(), user_name: user.full_name || user.email || '',
          });
        }
      }
    }

    const outs = await base44.asServiceRole.entities.CustomerOutstanding.filter({ bill_id: billId });
    for (const o of outs) {
      await base44.asServiceRole.entities.CustomerOutstanding.update(o.id, { status: 'paid', amount: 0 });
    }
    const cust = await base44.asServiceRole.entities.Customer.get(bill.customer_id).catch(() => null);
    if (cust) {
      await base44.asServiceRole.entities.Customer.update(cust.id, { outstanding: Math.max(0, (Number(cust.outstanding) || 0) - num(bill.due_amount)) });
    }

    await base44.asServiceRole.entities.Bill.update(bill.id, { status: 'cancelled', notes: `${bill.notes || ''}\nCANCELLED: ${reason}` });

    await writeAudit(base44, {
      action: 'cancel', module: 'billing', record_id: bill.id,
      previous_value: { status: 'finalized', total: bill.total_amount, due: bill.due_amount },
      new_value: { status: 'cancelled', reason },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, bill_id: bill.id, bill_number: bill.bill_number, status: 'cancelled' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}