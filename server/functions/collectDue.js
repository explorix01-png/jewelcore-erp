import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';

// Collect Due — single-business with IDEMPOTENCY.
// Also manages Due Reminders: set, get, and auto-cancel on full collection.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'collectDue');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);

    // ---------------------------------------------------------------
    // SET DUE REMINDER — create a reminder for a due bill
    // ---------------------------------------------------------------
    if (action === 'set_reminder') {
      const billId = str(body.bill_id);
      const reminderDate = str(body.reminder_date);
      if (!billId || !reminderDate) return Response.json({ error: 'Bill ID and reminder date required' }, { status: 400 });
      const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
      if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });
      if (bill.status !== 'finalized') return Response.json({ error: 'Bill not finalized' }, { status: 400 });
      const due = num(bill.due_amount);
      if (due <= 0) return Response.json({ error: 'No due on this bill' }, { status: 400 });

      // Cancel any existing active reminders for this bill
      const existing = await base44.asServiceRole.entities.DueReminder.filter({ bill_id: billId, status: 'active' }, '-created_date', 50);
      for (const e of existing) {
        await base44.asServiceRole.entities.DueReminder.update(e.id, { status: 'cancelled' });
      }

      // Create new reminder
      await base44.asServiceRole.entities.DueReminder.create({
        bill_id: billId, bill_number: bill.bill_number,
        customer_id: bill.customer_id, customer_name: bill.customer_name,
        due_amount: due, due_date: new Date(bill.bill_date).toISOString().slice(0, 10),
        reminder_date: reminderDate, status: 'active', notification_sent: false,
        created_by: user.id,
      });

      await writeAudit(base44, {
        action: 'create', module: 'reminder', record_id: billId,
        new_value: { reminder_date: reminderDate, due_amount: due },
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });

      return Response.json({ success: true });
    }

    // ---------------------------------------------------------------
    // GET DUE REMINDERS — list reminders for a bill
    // ---------------------------------------------------------------
    if (action === 'get_reminders') {
      const billId = str(body.bill_id);
      if (!billId) return Response.json({ error: 'Bill ID required' }, { status: 400 });
      const reminders = await base44.asServiceRole.entities.DueReminder.filter({ bill_id: billId }, '-created_date', 10);
      return Response.json({ success: true, reminders });
    }

    // ---------------------------------------------------------------
    // COLLECT DUE PAYMENT (default action)
    // ---------------------------------------------------------------
    const billId = str(body.bill_id);
    const amount = num(body.amount);
    const mode = str(body.payment_mode) || 'cash';
    const reference = str(body.reference);
    const operationId = str(body.operation_id) || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!billId) return Response.json({ error: 'Bill is required' }, { status: 400 });

    // --- IDEMPOTENCY CHECK ---
    if (str(body.operation_id)) {
      const existingPay = await base44.asServiceRole.entities.Payment.filter(
        { operation_id: operationId }, '-created_date', 1
      );
      if (existingPay.length > 0) {
        return Response.json({ success: true, bill_id: billId, idempotent: true, message: 'Payment already recorded for this operation' });
      }
    }

    const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
    if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });
    if (bill.is_deleted) return Response.json({ error: 'Bill is deleted' }, { status: 400 });
    if (bill.status !== 'finalized') return Response.json({ error: 'Bill not finalized' }, { status: 400 });

    const currentDue = num(bill.due_amount);
    if (currentDue <= 0) return Response.json({ error: 'No due on this bill' }, { status: 400 });
    if (amount <= 0) return Response.json({ error: 'Amount must be > 0' }, { status: 400 });
    if (amount > currentDue) return Response.json({ error: `Amount exceeds due (${currentDue})` }, { status: 400 });

    await base44.asServiceRole.entities.Payment.create({
      bill_id: bill.id, bill_number: bill.bill_number, customer_id: bill.customer_id, customer_name: bill.customer_name,
      amount, payment_mode: mode, payment_date: new Date().toISOString(), reference,
      operation_id: operationId, user_name: user.full_name || user.email || '',
    });

    const newPaid = num(bill.paid_amount) + amount;
    const newDue = currentDue - amount;
    await base44.asServiceRole.entities.Bill.update(bill.id, { paid_amount: newPaid, due_amount: newDue });

    // --- DUE REMINDER MANAGEMENT ---
    const reminders = await base44.asServiceRole.entities.DueReminder.filter({ bill_id: bill.id, status: 'active' }, '-created_date', 50);
    for (const r of reminders) {
      if (newDue <= 0) {
        // Full collection — cancel the reminder
        await base44.asServiceRole.entities.DueReminder.update(r.id, { status: 'cancelled' });
      } else {
        // Partial collection — update the remaining due amount
        await base44.asServiceRole.entities.DueReminder.update(r.id, { due_amount: newDue });
      }
    }

    const outs = await base44.asServiceRole.entities.CustomerOutstanding.filter({ bill_id: bill.id });
    for (const o of outs) {
      if (o.status === 'open' || o.status === 'partial') {
        await base44.asServiceRole.entities.CustomerOutstanding.update(o.id, { status: newDue <= 0 ? 'paid' : 'partial' });
      }
    }

    const cust = await base44.asServiceRole.entities.Customer.get(bill.customer_id).catch(() => null);
    if (cust) {
      await base44.asServiceRole.entities.Customer.update(cust.id, { outstanding: Math.max(0, (Number(cust.outstanding) || 0) - amount) });
    }

    await writeAudit(base44, {
      action: 'payment', module: 'bills', record_id: bill.id,
      previous_value: { due: currentDue, paid: num(bill.paid_amount) },
      new_value: { due: newDue, paid: newPaid, amount, mode, operation_id: operationId },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, bill_id: bill.id, paid_amount: newPaid, due_amount: newDue, operation_id: operationId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}