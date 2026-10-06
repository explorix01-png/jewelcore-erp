import { createClientFromRequest } from '../shared/createClient.js';
import { authorize } from '../shared/tenant.js';
import { writeAudit } from '../shared/audit.js';
import { calcFineWeight } from '../shared/billCalc.js';
import { num, str } from '../shared/utils.js';
import { db } from '../db/database.js';

// Delete Bill — backend-authorized, transactional reversal.
// Admin-only. Reverses inventory stock movements (if finalized),
// updates customer receivables/outstanding, voids payments and due reminders,
// updates audit log, and marks bill as deleted so it disappears from Bill History
// and dashboard totals without corrupting relational integrity.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'deleteBill');
    if (!auth.authorized) {
      return Response.json({ error: auth.error || 'Only administrators can delete bills' }, { status: auth.status || 403 });
    }
    const { ctx } = auth;

    const body = await req.json().catch(() => ({}));
    const billId = str(body.bill_id);
    const reason = str(body.reason) || 'Bill deleted by authorized administrator';

    if (!billId) return Response.json({ error: 'Bill ID is required' }, { status: 400 });

    const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
    if (!bill || bill.is_deleted) {
      return Response.json({ error: 'Bill not found or already deleted' }, { status: 404 });
    }

    // Guard against deleting bills with active return transactions
    const returns = await base44.asServiceRole.entities.ReturnTransaction.filter(
      { original_bill_id: billId }, '-created_date', 1
    ).catch(() => []);
    if (returns.length > 0) {
      return Response.json({ error: 'Cannot delete bill with existing customer returns. Please reverse the return transaction first.' }, { status: 400 });
    }

    // Execute atomic deletion and reversals within a PostgreSQL transaction
    const txResult = await db.transaction(async (tx) => {
      const txBase44 = createClientFromRequest(req, { txClient: tx });

      // 1. Inventory Stock Reversal (only for finalized inventory bills)
      // Note: If the bill was already cancelled, cancelBill already restored stock, so avoid double restoration!
      if (bill.bill_source !== 'manual' && bill.status === 'finalized') {
        const billItems = await txBase44.asServiceRole.entities.BillItem.filter(
          { bill_id: billId }, '-created_date', 500
        ).catch(() => []);

        for (const bi of billItems) {
          let invItem = null;
          const targetId = str(bi.inventory_id || bi.item_id);
          if (targetId) {
            invItem = await txBase44.asServiceRole.entities.InventoryItem.get(targetId).catch(() => null);
          }
          if (!invItem && bi.item_id) {
            const list = await txBase44.asServiceRole.entities.InventoryItem.filter(
              { item_id: str(bi.item_id) }, '-updated_date', 1
            ).catch(() => []);
            if (list.length > 0) invItem = list[0];
          }
          if (!invItem && bi.item_code) {
            const list = await txBase44.asServiceRole.entities.InventoryItem.filter(
              { item_code: str(bi.item_code) }, '-updated_date', 1
            ).catch(() => []);
            if (list.length > 0) invItem = list[0];
          }

          if (invItem) {
            const prevQty = Number(invItem.quantity) || 0;
            const itemQty = num(bi.quantity) || 1;
            const newQty = prevQty + itemQty;
            const addGross = num(bi.gross_weight) * itemQty;
            const addNet = num(bi.net_weight) * itemQty;
            const newGross = (Number(invItem.gross_weight) || 0) + addGross;
            const newNet = (Number(invItem.net_weight) || 0) + addNet;
            const newFine = calcFineWeight(newNet, Number(invItem.purity_value) || 0);

            await txBase44.asServiceRole.entities.InventoryItem.update(invItem.id, {
              quantity: newQty,
              gross_weight: newGross,
              net_weight: newNet,
              fine_weight: newFine,
              status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
            });

            await txBase44.asServiceRole.entities.InventoryTransaction.create({
              item_id: str(bi.item_id),
              item_name: bi.item_name || invItem.item_name,
              transaction_type: 'SALE_REVERSAL',
              quantity: itemQty,
              gross_weight: addGross,
              net_weight: addNet,
              reference_type: 'bill_deletion',
              reference_id: bill.id,
              reason: `Sale reversed on bill deletion: ${bill.bill_number} (${reason})`,
              previous_stock: prevQty,
              new_stock: newQty,
              date: new Date().toISOString(),
              user_name: user.full_name || user.email || '',
            });
          }
        }
      }

      // 2. Customer Outstanding Reversal
      if (num(bill.due_amount) > 0 && bill.status === 'finalized') {
        const outstandings = await txBase44.asServiceRole.entities.CustomerOutstanding.filter(
          { bill_id: billId }
        ).catch(() => []);
        for (const o of outstandings) {
          await txBase44.asServiceRole.entities.CustomerOutstanding.update(o.id, {
            status: 'cancelled',
            amount: 0,
            notes: `Cancelled upon deletion of bill ${bill.bill_number}`
          });
        }

        if (bill.customer_id) {
          const cust = await txBase44.asServiceRole.entities.Customer.get(bill.customer_id).catch(() => null);
          if (cust) {
            const currentOut = Number(cust.outstanding) || 0;
            const newOut = Math.max(0, currentOut - num(bill.due_amount));
            await txBase44.asServiceRole.entities.Customer.update(cust.id, {
              outstanding: newOut
            });
          }
        }
      }

      // 3. Payment Records Void/Deletion
      const payments = await txBase44.asServiceRole.entities.Payment.filter(
        { bill_id: billId }
      ).catch(() => []);
      for (const p of payments) {
        await txBase44.asServiceRole.entities.Payment.update(p.id, {
          is_deleted: true,
          notes: `Voided due to deletion of bill ${bill.bill_number}`
        });
      }

      // 4. Due Reminders Cleanup
      const reminders = await txBase44.asServiceRole.entities.DueReminder.filter(
        { bill_id: billId }
      ).catch(() => []);
      for (const r of reminders) {
        await txBase44.asServiceRole.entities.DueReminder.update(r.id, {
          status: 'cancelled',
          is_deleted: true,
        });
      }

      // 5. Exchange Transaction Cancellation (if any)
      const exchanges = await txBase44.asServiceRole.entities.ExchangeTransaction.filter(
        { original_bill_id: billId }
      ).catch(() => []);
      for (const ex of exchanges) {
        await txBase44.asServiceRole.entities.ExchangeTransaction.update(ex.id, {
          status: 'cancelled',
          is_deleted: true,
          notes: `Cancelled upon deletion of bill ${bill.bill_number}`
        });
      }

      // 6. Mark Bill as Deleted
      await txBase44.asServiceRole.entities.Bill.update(bill.id, {
        status: 'deleted',
        is_deleted: true,
        deleted_date: new Date().toISOString(),
        deleted_by: user.id,
        deleted_by_name: user.full_name || user.email || '',
        deletion_reason: reason,
        notes: `${bill.notes || ''}\n[DELETED on ${new Date().toISOString()}: ${reason}]`
      });

      // 7. Audit Log
      await writeAudit(txBase44, {
        action: 'delete_bill',
        module: 'billing',
        record_id: bill.id,
        previous_value: {
          bill_number: bill.bill_number,
          total_amount: bill.total_amount,
          paid_amount: bill.paid_amount,
          due_amount: bill.due_amount,
          bill_source: bill.bill_source,
          customer_name: bill.customer_name,
        },
        new_value: {
          is_deleted: true,
          status: 'deleted',
          reason,
        },
        user_id: user.id,
        user_name: user.full_name || user.email || '',
        user_role: ctx.role,
      });

      return {
        success: true,
        bill_id: bill.id,
        bill_number: bill.bill_number,
        message: `Bill ${bill.bill_number} deleted successfully and related inventory/financial balances reversed.`
      };
    });

    return Response.json(txResult);
  } catch (error) {
    console.error('[deleteBill Error]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
