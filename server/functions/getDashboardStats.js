import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';

// Static dashboard aggregates — called ONCE on mount.
// Computes all non-range-dependent KPIs server-side and returns only
// aggregate values + a handful of recent records. The browser never
// downloads the raw bill/inventory/customer datasets.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: "No role assigned" }, { status: 403 });

    // Parallel server-side fetches — high limits ensure complete totals.
    const [bills, billItems, goldInv, silverInv, customers, outstanding, purchases, orders, karagirs, settingsList] = await Promise.all([
      base44.asServiceRole.entities.Bill.list("-bill_date", 10000),
      base44.asServiceRole.entities.BillItem.list("-created_date", 20000).catch(() => []),
      base44.asServiceRole.entities.InventoryItem.filter({ metal_type: "gold", is_archived: false }, "-updated_date", 10000),
      base44.asServiceRole.entities.InventoryItem.filter({ metal_type: "silver", is_archived: false }, "-updated_date", 10000),
      base44.asServiceRole.entities.Customer.list("-created_date", 10000),
      base44.asServiceRole.entities.CustomerOutstanding.filter({ status: "open" }, "-created_date", 10000),
      base44.asServiceRole.entities.Purchase.list("-purchase_date", 10000),
      base44.asServiceRole.entities.CustomerOrder.list("-created_date", 10000),
      base44.asServiceRole.entities.Karagir.list("-created_date", 10000),
      base44.asServiceRole.entities.ShopSettings.list("-created_date", 1),
    ]);

    const settings = settingsList[0] || null;
    const now = new Date();

    // Calendar date boundaries (Requirement 12)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0).getTime();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    const activeBills = bills.filter(b => b.status === "finalized" && !b.is_deleted);
    const sum = (arr, f) => arr.reduce((s, x) => s + (Number(x[f]) || 0), 0);

    const goldRate = Number(settings?.gold_24k_rate) || 0;
    const silverRate = Number(settings?.silver_rate) || 0;
    const lowStockThreshold = Number(settings?.low_stock_threshold) || 2;

    const goldQty = sum(goldInv, "quantity");
    const silverQty = sum(silverInv, "quantity");
    const goldValue = sum(goldInv, "net_weight") * goldRate;
    const silverValue = sum(silverInv, "net_weight") * silverRate;
    const lowStock = [...goldInv, ...silverInv].filter(i => Number(i.quantity) <= lowStockThreshold).length;

    const todayBills = activeBills.filter(b => {
      const bt = new Date(b.bill_date).getTime();
      return bt >= todayStart && bt <= todayEnd;
    });
    const weeklyBills = activeBills.filter(b => {
      const bt = new Date(b.bill_date).getTime();
      return bt >= weekStart;
    });
    const monthlyBills = activeBills.filter(b => {
      const bt = new Date(b.bill_date).getTime();
      return bt >= monthStart;
    });

    // Compute Gold and Silver sold in grams for daily, weekly, monthly (Requirement 9)
    const activeBillMap = new Map(activeBills.map(b => [b.id, b]));
    let goldSoldTodayGrams = 0, goldSoldWeekGrams = 0, goldSoldMonthGrams = 0;
    let silverSoldTodayGrams = 0, silverSoldWeekGrams = 0, silverSoldMonthGrams = 0;

    for (const it of billItems) {
      const bill = activeBillMap.get(it.bill_id);
      if (!bill) continue;
      const bt = new Date(bill.bill_date).getTime();
      const netGrams = (Number(it.net_weight) || 0) * (Number(it.quantity) || 1);
      const metal = (it.metal_type || "").toLowerCase();

      if (metal === "gold") {
        if (bt >= todayStart && bt <= todayEnd) goldSoldTodayGrams += netGrams;
        if (bt >= weekStart) goldSoldWeekGrams += netGrams;
        if (bt >= monthStart) goldSoldMonthGrams += netGrams;
      } else if (metal === "silver") {
        if (bt >= todayStart && bt <= todayEnd) silverSoldTodayGrams += netGrams;
        if (bt >= weekStart) silverSoldWeekGrams += netGrams;
        if (bt >= monthStart) silverSoldMonthGrams += netGrams;
      }
    }

    // Project only the fields the UI needs for recent lists.
    const recentBills = bills.filter(b => !b.is_deleted).slice(0, 6).map(b => ({
      id: b.id, bill_number: b.bill_number, customer_name: b.customer_name,
      bill_date: b.bill_date, total_amount: b.total_amount, due_amount: b.due_amount || 0,
    }));

    const recentPurchases = purchases.filter(p => p.status === "finalized").slice(0, 5).map(p => ({
      id: p.id, purchase_number: p.purchase_number, supplier_name: p.supplier_name,
      purchase_date: p.purchase_date, total_amount: p.total_amount || 0,
    }));

    return Response.json({
      todaySales: sum(todayBills, "total_amount"),
      weeklySales: sum(weeklyBills, "total_amount"),
      monthlySales: sum(monthlyBills, "total_amount"),
      goldSold: {
        today: Number(goldSoldTodayGrams.toFixed(3)),
        weekly: Number(goldSoldWeekGrams.toFixed(3)),
        monthly: Number(goldSoldMonthGrams.toFixed(3)),
      },
      silverSold: {
        today: Number(silverSoldTodayGrams.toFixed(3)),
        weekly: Number(silverSoldWeekGrams.toFixed(3)),
        monthly: Number(silverSoldMonthGrams.toFixed(3)),
      },
      totalBills: bills.filter(b => !b.is_deleted).length,
      totalCustomers: customers.filter(c => !c.is_deleted).length,
      goldQty, silverQty, goldValue, silverValue, lowStock,
      pendingPayments: sum(outstanding, "amount"),
      outstandingDue: sum(outstanding, "amount"),
      totalPurchases: purchases.filter(p => p.status === "finalized").length,
      totalOrders: orders.filter(o => o.status !== "CANCELLED").length,
      totalKaragirs: karagirs.filter(k => k.status === "active").length,
      recentBills,
      recentPurchases,
      goldRate, silverRate, lowStockThreshold,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}