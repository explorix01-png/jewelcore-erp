import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';

// Range-dependent dashboard aggregates — called on mount AND when the
// user changes the date range. Uses server-side date filters so only
// bills/payments within the selected range are fetched. Returns a tiny
// payload: a few sums + top-5 customers.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: "No role assigned" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const range = body.range || "monthly";
    const rangeDays = range === "weekly" ? 7 : range === "monthly" ? 30 : 365;
    const now = new Date();
    const periodCutoff = new Date(now.getTime() - rangeDays * 86400000).toISOString();

    // Date-filtered fetches — only records within the selected range.
    const [bills, payments] = await Promise.all([
      base44.asServiceRole.entities.Bill.filter({ bill_date: { $gte: periodCutoff } }, "-bill_date", 10000),
      base44.asServiceRole.entities.Payment.filter({ payment_date: { $gte: periodCutoff } }, "-payment_date", 10000),
    ]);

    const activeBills = bills.filter(b => b.status === "finalized" && !b.is_deleted);
    const sum = (arr, f) => arr.reduce((s, x) => s + (Number(x[f]) || 0), 0);

    const inventorySales = sum(activeBills.filter(b => b.bill_source !== "manual"), "total_amount");
    const manualSales = sum(activeBills.filter(b => b.bill_source === "manual"), "total_amount");
    const gstSales = sum(activeBills.filter(b => b.gst_enabled), "total_amount");
    const nonGstSales = sum(activeBills.filter(b => !b.gst_enabled), "total_amount");
    const collectedPayments = sum(payments, "amount");

    // Top 5 customers by total spend in the period.
    const custMap = {};
    activeBills.forEach(b => {
      if (!b.customer_id) return;
      custMap[b.customer_id] = custMap[b.customer_id] || { name: b.customer_name || "—", total: 0, count: 0 };
      custMap[b.customer_id].total += Number(b.total_amount) || 0;
      custMap[b.customer_id].count += 1;
    });
    const topCustomers = Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 5);

    return Response.json({
      inventorySales, manualSales, gstSales, nonGstSales, collectedPayments, topCustomers,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}