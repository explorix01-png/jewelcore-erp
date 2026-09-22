import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { num, str } from '../shared/utils.js';

// Process Due Reminders — checks active reminders whose reminder_date has arrived.
// Creates in-app notifications (no duplicates) and cancels reminders for fully-paid bills.
// Called from BillHistory on page load.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const auth = await authorize(base44, user, 'collectDue');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });

    const today = new Date().toISOString().slice(0, 10);
    const reminders = await base44.asServiceRole.entities.DueReminder.filter(
      { status: 'active' }, '-reminder_date', 500
    );

    let notified = 0, cancelled = 0;
    for (const r of reminders) {
      // Only process reminders whose date has arrived
      if (r.reminder_date > today) continue;

      // Check current bill due
      const bill = await base44.asServiceRole.entities.Bill.get(str(r.bill_id)).catch(() => null);
      if (!bill || bill.is_deleted || bill.status === 'cancelled') {
        await base44.asServiceRole.entities.DueReminder.update(r.id, { status: 'cancelled' });
        cancelled++;
        continue;
      }

      const currentDue = num(bill.due_amount);
      if (currentDue <= 0) {
        // Fully collected — cancel reminder, no notification
        await base44.asServiceRole.entities.DueReminder.update(r.id, { status: 'cancelled' });
        cancelled++;
        continue;
      }

      // Create notification (only if not already sent)
      if (!r.notification_sent) {
        await base44.asServiceRole.entities.Notification.create({
          type: 'customer_due',
          title: `Due Reminder: ${r.customer_name || 'Customer'} — ${r.bill_number || ''}`,
          message: `Bill ${r.bill_number || ''} for ${r.customer_name || ''} has a pending due of ₹${currentDue}. Bill date: ${r.due_date || 'N/A'}.`,
          reference_type: 'bill',
          reference_id: str(r.bill_id),
          amount: currentDue,
          is_read: false,
          created_date: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.DueReminder.update(r.id, { status: 'notified', notification_sent: true, due_amount: currentDue });
        notified++;
      }
    }

    return Response.json({ success: true, notified, cancelled });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}