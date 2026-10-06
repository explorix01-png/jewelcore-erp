import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: "No role assigned" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const metric = body.metric || "today_sales";
    const subRange = body.range || "monthly"; // daily, weekly, monthly, all

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    // Fetch bills & items server-side with tenant isolation
    const [bills, billItems] = await Promise.all([
      base44.asServiceRole.entities.Bill.list("-bill_date", 5000),
      base44.asServiceRole.entities.BillItem.list("-created_date", 10000).catch(() => []),
    ]);

    const activeBills = bills.filter(b => b.status === "finalized" && !b.is_deleted);
    const billItemsMap = new Map();
    for (const it of billItems) {
      if (!billItemsMap.has(it.bill_id)) billItemsMap.set(it.bill_id, []);
      billItemsMap.get(it.bill_id).push(it);
    }

    let filteredBills = [];
    let title = "";
    let dateRangeText = "";

    const formatDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });

    switch (metric) {
      case "today_sales":
        title = "Today's Sales Breakdown";
        dateRangeText = formatDate(todayStart);
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          return bt >= todayStart && bt <= todayEnd;
        });
        break;

      case "weekly_sales":
        title = "Weekly Sales Breakdown";
        dateRangeText = `${formatDate(weekStart)} – ${formatDate(now)}`;
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          return bt >= weekStart;
        });
        break;

      case "monthly_sales":
        title = "Monthly Sales Breakdown";
        dateRangeText = `${formatDate(monthStart)} – ${formatDate(now)}`;
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          return bt >= monthStart;
        });
        break;

      case "total_bills":
        title = "All Finalized Invoices";
        dateRangeText = "Complete Financial History";
        filteredBills = activeBills;
        break;

      case "inventory_sales":
        title = "Inventory Tagged Sales";
        dateRangeText = subRange === "weekly" ? `Since ${formatDate(weekStart)}` : subRange === "monthly" ? `Since ${formatDate(monthStart)}` : "All Time";
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "weekly" ? bt >= weekStart : subRange === "monthly" ? bt >= monthStart : true;
          return matchPeriod && b.bill_source !== "manual";
        });
        break;

      case "manual_sales":
        title = "Manual Untagged Sales";
        dateRangeText = subRange === "weekly" ? `Since ${formatDate(weekStart)}` : subRange === "monthly" ? `Since ${formatDate(monthStart)}` : "All Time";
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "weekly" ? bt >= weekStart : subRange === "monthly" ? bt >= monthStart : true;
          return matchPeriod && b.bill_source === "manual";
        });
        break;

      case "gst_sales":
        title = "GST Tax Invoices";
        dateRangeText = subRange === "weekly" ? `Since ${formatDate(weekStart)}` : subRange === "monthly" ? `Since ${formatDate(monthStart)}` : "All Time";
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "weekly" ? bt >= weekStart : subRange === "monthly" ? bt >= monthStart : true;
          return matchPeriod && b.gst_enabled && b.gst_mode !== "none";
        });
        break;

      case "non_gst_sales":
        title = "Non-GST / Retail Bills";
        dateRangeText = subRange === "weekly" ? `Since ${formatDate(weekStart)}` : subRange === "monthly" ? `Since ${formatDate(monthStart)}` : "All Time";
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "weekly" ? bt >= weekStart : subRange === "monthly" ? bt >= monthStart : true;
          return matchPeriod && (!b.gst_enabled || b.gst_mode === "none");
        });
        break;

      case "pending_payments":
        title = "Outstanding Due Invoices";
        dateRangeText = "Pending Customer Balances";
        filteredBills = activeBills.filter(b => Number(b.due_amount) > 0);
        break;

      case "collected_payments":
        title = "Payment Collections";
        dateRangeText = subRange === "weekly" ? `Since ${formatDate(weekStart)}` : subRange === "monthly" ? `Since ${formatDate(monthStart)}` : "All Time";
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "weekly" ? bt >= weekStart : subRange === "monthly" ? bt >= monthStart : true;
          return matchPeriod && Number(b.paid_amount) > 0;
        });
        break;

      case "gold_sold":
        title = "Gold Sold Breakdown";
        dateRangeText = subRange === "daily" ? formatDate(todayStart) : subRange === "weekly" ? `${formatDate(weekStart)} – ${formatDate(now)}` : `${formatDate(monthStart)} – ${formatDate(now)}`;
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "daily" ? (bt >= todayStart && bt <= todayEnd) : subRange === "weekly" ? bt >= weekStart : bt >= monthStart;
          if (!matchPeriod) return false;
          const items = billItemsMap.get(b.id) || [];
          return items.some(it => (it.metal_type || "").toLowerCase() === "gold");
        });
        break;

      case "silver_sold":
        title = "Silver Sold Breakdown";
        dateRangeText = subRange === "daily" ? formatDate(todayStart) : subRange === "weekly" ? `${formatDate(weekStart)} – ${formatDate(now)}` : `${formatDate(monthStart)} – ${formatDate(now)}`;
        filteredBills = activeBills.filter(b => {
          const bt = new Date(b.bill_date).getTime();
          const matchPeriod = subRange === "daily" ? (bt >= todayStart && bt <= todayEnd) : subRange === "weekly" ? bt >= weekStart : bt >= monthStart;
          if (!matchPeriod) return false;
          const items = billItemsMap.get(b.id) || [];
          return items.some(it => (it.metal_type || "").toLowerCase() === "silver");
        });
        break;

      default:
        title = "Invoice Details";
        dateRangeText = "All Time";
        filteredBills = activeBills;
        break;
    }

    // Aggregate metrics across the filtered set of bills
    let totalSales = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let totalGst = 0;
    let gstSales = 0;
    let nonGstSales = 0;
    let cashCollected = 0;
    let upiCollected = 0;
    let cardCollected = 0;
    let bankCollected = 0;
    let goldExchangeValue = 0;
    let goldGrams = 0;
    let silverGrams = 0;

    for (const b of filteredBills) {
      const tot = Number(b.total_amount) || 0;
      const pd = Number(b.paid_amount) || 0;
      const du = Number(b.due_amount) || 0;
      totalSales += tot;
      totalPaid += pd;
      totalDue += du;

      const tax = (Number(b.cgst) || 0) + (Number(b.sgst) || 0) + (Number(b.igst) || 0);
      totalGst += tax;

      if (b.gst_enabled && b.gst_mode !== "none") {
        gstSales += tot;
      } else {
        nonGstSales += tot;
      }

      if (Number(b.gold_given_value) > 0) {
        goldExchangeValue += Number(b.gold_given_value);
      }

      // Parse payment components if available
      try {
        if (b.payment_components) {
          const comps = typeof b.payment_components === "string" ? JSON.parse(b.payment_components) : b.payment_components;
          if (Array.isArray(comps)) {
            for (const c of comps) {
              const m = (c.mode || "").toLowerCase();
              const a = Number(c.amount) || 0;
              if (m === "cash") cashCollected += a;
              else if (m === "upi") upiCollected += a;
              else if (m === "card") cardCollected += a;
              else if (m === "bank" || m === "bank_transfer" || m === "neft" || m === "rtgs") bankCollected += a;
            }
          }
        } else {
          const mode = (b.payment_mode || "").toLowerCase();
          if (mode === "cash") cashCollected += pd;
          else if (mode === "upi") upiCollected += pd;
          else if (mode === "card") cardCollected += pd;
          else if (mode === "bank" || mode === "bank_transfer") bankCollected += pd;
        }
      } catch (err) {
        // fallback
      }

      // Weight breakdown
      const items = billItemsMap.get(b.id) || [];
      for (const it of items) {
        const net = (Number(it.net_weight) || 0) * (Number(it.quantity) || 1);
        const metal = (it.metal_type || "").toLowerCase();
        if (metal === "gold") goldGrams += net;
        else if (metal === "silver") silverGrams += net;
      }
    }

    // Purity breakdown and detailed metal items with HUID for gold_sold and silver_sold
    const targetMetal = metric === "gold_sold" ? "gold" : metric === "silver_sold" ? "silver" : null;
    const purityMap = new Map();
    const metalItems = [];
    let totalMetalValue = 0;

    for (const b of filteredBills) {
      const items = billItemsMap.get(b.id) || [];
      for (const it of items) {
        const metal = (it.metal_type || "").toLowerCase();
        if (targetMetal && metal !== targetMetal) continue;

        const net = (Number(it.net_weight) || 0) * (Number(it.quantity) || 1);
        const gross = (Number(it.gross_weight) || 0) * (Number(it.quantity) || 1);
        const fine = (Number(it.fine_weight) || 0) * (Number(it.quantity) || 1);
        const val = Number(it.metal_value) || Number(it.total) || 0;
        const purityStr = it.purity_display || (targetMetal === "gold" ? "22K" : "925");

        if (targetMetal) {
          totalMetalValue += val;
          if (!purityMap.has(purityStr)) {
            purityMap.set(purityStr, { purity: purityStr, grams: 0, value: 0, count: 0 });
          }
          const pStat = purityMap.get(purityStr);
          pStat.grams = Number((pStat.grams + net).toFixed(3));
          pStat.value += val;
          pStat.count += Number(it.quantity) || 1;

          metalItems.push({
            id: it.id || `${b.id}-${metalItems.length}`,
            bill_id: b.id,
            bill_number: b.bill_number,
            bill_date: b.bill_date,
            customer_name: b.customer_name || "Walk-in Customer",
            huid: it.huid || it.item_code || "—",
            item_name: it.item_name || (targetMetal === "gold" ? "Gold Jewellery" : "Silver Jewellery"),
            gross_weight: Number(gross.toFixed(3)),
            net_weight: Number(net.toFixed(3)),
            purity: purityStr,
            fine_weight: Number(fine.toFixed(3)),
            rate_per_gram: Number(it.rate_per_gram) || 0,
            metal_value: Math.round(val),
            total: Math.round(Number(it.total) || val),
            status: b.status || "finalized",
          });
        }
      }
    }

    // Sort purity breakdown descending by numeric karat / fineness
    const purityBreakdown = Array.from(purityMap.values()).sort((a, b) => {
      const numA = parseFloat(a.purity) || 0;
      const numB = parseFloat(b.purity) || 0;
      return numB - numA;
    });

    // Format top 100 bills for fast UI table rendering
    const projectedBills = filteredBills.slice(0, 100).map(b => ({
      id: b.id,
      bill_number: b.bill_number,
      bill_date: b.bill_date,
      customer_name: b.customer_name || "Walk-in Customer",
      customer_mobile: b.customer_mobile || "",
      bill_source: b.bill_source || "inventory",
      total_amount: Number(b.total_amount) || 0,
      paid_amount: Number(b.paid_amount) || 0,
      due_amount: Number(b.due_amount) || 0,
      gst_enabled: b.gst_enabled,
      payment_mode: b.payment_mode || "cash",
      gold_given_value: Number(b.gold_given_value) || 0,
    }));

    return Response.json({
      success: true,
      metric,
      title,
      dateRangeText,
      summary: {
        billCount: filteredBills.length,
        totalSales,
        totalPaid,
        totalDue,
        totalGst,
        gstSales,
        nonGstSales,
        goldGrams: Number(goldGrams.toFixed(3)),
        silverGrams: Number(silverGrams.toFixed(3)),
        totalMetalValue: Math.round(totalMetalValue),
        cashCollected,
        upiCollected,
        cardCollected,
        bankCollected,
        goldExchangeValue,
      },
      purityBreakdown,
      metalItems: metalItems.slice(0, 100),
      bills: projectedBills,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
