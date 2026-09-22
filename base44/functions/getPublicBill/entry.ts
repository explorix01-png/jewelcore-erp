import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { str } from '../../shared/utils.ts';

// Public Bill Viewer — read-only, token-based, NO authentication.
// A customer scans the QR on their printed invoice and lands on the public bill page.
// Only finalized bills are accessible. Only customer-safe fields are returned:
// NO supplier info, purchase cost, internal IDs, profit/margin, employee data, or admin controls.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json().catch(() => ({}));
    const token = str(body.token);
    if (!token || token.length < 16) return Response.json({ error: 'Invalid token' }, { status: 400 });

    const bills = await base44.asServiceRole.entities.Bill.filter({ public_token: token }, '-created_date', 2);
    const bill = bills[0];
    if (!bill) return Response.json({ error: 'Bill not found' }, { status: 404 });

    // Only finalized bills are publicly accessible
    if (bill.status === 'cancelled') {
      return Response.json({ status: 'cancelled', bill_number: bill.bill_number, bill_date: bill.bill_date, message: 'This bill has been cancelled.' });
    }
    if (bill.status !== 'finalized') return Response.json({ error: 'Bill not available' }, { status: 404 });

    const [items, settingsList] = await Promise.all([
      base44.asServiceRole.entities.BillItem.filter({ bill_id: bill.id }, '-created_date', 200),
      base44.asServiceRole.entities.ShopSettings.list('-created_date', 1),
    ]);
    const settings = settingsList[0] || {};

    return Response.json({
      success: true,
      shop: {
        name: settings.shop_name, logo_url: settings.logo_url, address: settings.address,
        mobile: settings.mobile, gst_number: settings.gst_number, state: settings.state,
      },
      bill: {
        bill_number: bill.bill_number,
        bill_date: bill.bill_date,
        customer_name: bill.customer_name,
        subtotal: bill.subtotal,
        discount: bill.discount,
        hallmarking_charge: bill.hallmarking_charge,
        gst_enabled: bill.gst_enabled,
        gst_mode: bill.gst_mode,
        cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst,
        gst_rate_snapshot: bill.gst_rate_snapshot,
        total_amount: bill.total_amount,
        paid_amount: bill.paid_amount,
        due_amount: bill.due_amount,
      },
      items: items.map((it) => ({
        item_name: it.item_name, item_code: it.item_code, metal_type: it.metal_type,
        purity_display: it.purity_display, hsn: it.hsn, quantity: it.quantity,
        gross_weight: it.gross_weight, stone_weight: it.stone_weight, net_weight: it.net_weight,
        rate_per_gram: it.rate_per_gram, making_charge: it.making_charge, making_charge_type: it.making_charge_type,
        discount: it.discount, gst_rate: it.gst_rate, taxable_amount: it.taxable_amount,
        gst_amount: it.gst_amount, total: it.total,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}