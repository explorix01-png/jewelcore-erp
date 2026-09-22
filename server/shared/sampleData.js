// Server-side sample/demo data generator for end-to-end testing.
// ALL records are stamped and prefixed with "DEMO"
// so they can be safely identified and cleared without touching real data.
import { calcItem, calcBill, computeDue } from "./billCalc.js";
import { num, round } from "./utils.js";

const RATE_24K = 7200;
const RATE_22K = round(RATE_24K * 22 / 24);
const RATE_18K = round(RATE_24K * 18 / 24);
const RATE_SILVER = 95;
const GST_RATE = 3;
const CGST_RATE = 1.5;
const SGST_RATE = 1.5;

const DEMO_PREFIX = "DEMO";

function isDemo(record) {
  const checks = [
    record.name, record.item_name, record.item_code, record.bill_number,
    record.purchase_number, record.order_number, record.exchange_number,
    record.title, record.customer_name, record.supplier_name, record.karagir_name,
  ];
  return checks.some((v) => v && String(v).includes(DEMO_PREFIX));
}

export async function clearSampleData(base44, _ctx) {
  const results = {};
  const entitiesToClean = [
    "ExchangeTransaction", "ReturnTransaction", "Payment", "CustomerOutstanding",
    "BillItem", "Bill", "KaragirOrder", "CustomerOrder",
    "InventoryTransaction", "InventoryItem", "PurchaseItem", "Purchase",
    "Karagir", "Supplier", "Customer", "RateHistory", "Notification",
  ];
  for (const entityName of entitiesToClean) {
    try {
      const entity = base44.asServiceRole.entities[entityName];
      const all = await entity.list("-created_date", 5000);
      const demoRecords = all.filter(isDemo);
      if (demoRecords.length > 0) {
        const ids = demoRecords.map((r) => r.id);
        await entity.deleteMany({ id: { $in: ids } });
        results[entityName] = demoRecords.length;
      } else {
        results[entityName] = 0;
      }
    } catch (e) {
      results[entityName] = `error: ${e.message}`;
    }
  }
  return results;
}

export async function loadSampleData(base44, ctx, user) {
  const now = new Date().toISOString();
  const summary = {};

  // 1. PURITY MASTER
  const purityMaster = base44.asServiceRole.entities.PurityMaster;
  const existingPurities = await purityMaster.list("-created_date", 50);
  const purityDefs = [
    { name: "24K (999)", metal_type: "gold", purity_value: 24, display_format: "24K (999)" },
    { name: "22K (916)", metal_type: "gold", purity_value: 22, display_format: "22K (916)" },
    { name: "20K (833)", metal_type: "gold", purity_value: 20, display_format: "20K (833)" },
    { name: "18K (750)", metal_type: "gold", purity_value: 18, display_format: "18K (750)" },
    { name: "14K (585)", metal_type: "gold", purity_value: 14, display_format: "14K (585)" },
    { name: "Silver (999)", metal_type: "silver", purity_value: 999, display_format: "Silver (999)" },
  ];
  const purityMap = {};
  for (const p of purityDefs) {
    const existing = existingPurities.find((e) => e.name === p.name);
    if (existing) {
      purityMap[p.name] = existing;
    } else {
      const created = await purityMaster.create({ ...p, is_active: true });
      purityMap[p.name] = created;
    }
  }
  summary.purities = purityDefs.length;

  // 2. CATEGORY MASTER
  const categoryMaster = base44.asServiceRole.entities.CategoryMaster;
  const categoryDefs = [
    { name: "Rings", metal_type: "gold" },
    { name: "Necklaces", metal_type: "gold" },
    { name: "Bangles", metal_type: "gold" },
    { name: "Earrings", metal_type: "gold" },
    { name: "Chains", metal_type: "gold" },
    { name: "Pendants", metal_type: "gold" },
    { name: "Silver Rings", metal_type: "silver" },
    { name: "Silver Chains", metal_type: "silver" },
    { name: "Silver Bangles", metal_type: "silver" },
  ];
  for (const c of categoryDefs) {
    await categoryMaster.create({ ...c, is_active: true });
  }
  summary.categories = categoryDefs.length;

  // 3. SUPPLIERS
  const supplierEntity = base44.asServiceRole.entities.Supplier;
  const suppliers = await supplierEntity.bulkCreate([
    { supplier_code: "DEMO-SUP1", name: "DEMO - Gold Supplier Co.", mobile: "9876543210", gst_number: "27ABCDE1234F1Z5", state: "Maharashtra", city: "Mumbai", address: "123 Gold Market, Mumbai", status: "active", outstanding: 0 },
    { supplier_code: "DEMO-SUP2", name: "DEMO - Silver Supplier Ltd.", mobile: "9876543211", gst_number: "27PQRSX5678K2Z4", state: "Gujarat", city: "Surat", address: "456 Silver Plaza, Surat", status: "active", outstanding: 0 },
    { supplier_code: "DEMO-SUP3", name: "DEMO - Mixed Jewellery Supply", mobile: "9876543212", gst_number: "27LMNOP9012B3Z2", state: "Maharashtra", city: "Pune", address: "789 Jewellery Hub, Pune", status: "active", outstanding: 0 },
  ]);
  summary.suppliers = suppliers.length;

  // 4. CUSTOMERS
  const customerEntity = base44.asServiceRole.entities.Customer;
  const customers = await customerEntity.bulkCreate([
    { customer_code: "DEMO-CUST1", name: "DEMO - Rajesh Kumar", mobile: "9000000001", state: "Maharashtra", city: "Mumbai", address: "101 Hill Road, Mumbai", outstanding: 0 },
    { customer_code: "DEMO-CUST2", name: "DEMO - Priya Sharma", mobile: "9000000002", gst_number: "27AAACP1234A1Z5", state: "Maharashtra", city: "Pune", address: "202 MG Road, Pune", outstanding: 0 },
    { customer_code: "DEMO-CUST3", name: "DEMO - Amit Patel", mobile: "9000000003", state: "Gujarat", city: "Ahmedabad", address: "303 Satellite Road, Ahmedabad", outstanding: 0 },
    { customer_code: "DEMO-CUST4", name: "DEMO - Sunita Devi", mobile: "9000000004", state: "Maharashtra", city: "Nashik", address: "404 College Road, Nashik", outstanding: 0 },
    { customer_code: "DEMO-CUST5", name: "DEMO - Mohan Lal", mobile: "9000000005", state: "Rajasthan", city: "Jaipur", address: "505 Pink City, Jaipur", outstanding: 0 },
  ]);
  summary.customers = customers.length;

  // 5. KARAGIRS
  const karagirEntity = base44.asServiceRole.entities.Karagir;
  const karagirs = await karagirEntity.bulkCreate([
    { name: "DEMO - Karagir Ramesh", mobile: "9111111111", address: "Kolhapur", specialization: "Gold Ornaments", status: "active" },
    { name: "DEMO - Karagir Suresh", mobile: "9222222222", address: "Pune", specialization: "Silver Articles", status: "active" },
  ]);
  summary.karagirs = karagirs.length;

  // 6. INVENTORY ITEMS (10 Gold + 5 Silver)
  const inventoryEntity = base44.asServiceRole.entities.InventoryItem;
  const invDefs = [
    { item_name: "DEMO - Gold Ring Diamond Cut", item_code: "DEMO-G001", barcode: "DEMO890001", category_name: "Rings", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 6.2, net_weight: 5.5, wastage: 8, quantity: 3, status: "in_stock" },
    { item_name: "DEMO - Gold Necklace Temple Design", item_code: "DEMO-G002", barcode: "DEMO890002", category_name: "Necklaces", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 28.5, net_weight: 25.3, wastage: 12, quantity: 2, status: "in_stock" },
    { item_name: "DEMO - Gold Bangle Pair", item_code: "DEMO-G003", barcode: "DEMO890003", category_name: "Bangles", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 17.8, net_weight: 15.2, wastage: 10, quantity: 4, status: "in_stock" },
    { item_name: "DEMO - Gold Earrings Stud", item_code: "DEMO-G004", barcode: "DEMO890004", category_name: "Earrings", metal_type: "gold", purity_display: "18K (750)", hsn: "7113", gross_weight: 4.8, net_weight: 4.1, wastage: 6, quantity: 5, status: "in_stock" },
    { item_name: "DEMO - Gold Chain 22inch", item_code: "DEMO-G005", barcode: "DEMO890005", category_name: "Chains", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 14.5, net_weight: 12.8, wastage: 9, quantity: 3, status: "in_stock" },
    { item_name: "DEMO - Gold Pendant Lakshmi", item_code: "DEMO-G006", barcode: "DEMO890006", category_name: "Pendants", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 4.2, net_weight: 3.5, wastage: 7, quantity: 6, status: "in_stock" },
    { item_name: "DEMO - Gold Ring Solitaire", item_code: "DEMO-G007", barcode: "DEMO890007", category_name: "Rings", metal_type: "gold", purity_display: "18K (750)", hsn: "7113", gross_weight: 5.6, net_weight: 4.8, wastage: 5, quantity: 2, status: "in_stock" },
    { item_name: "DEMO - Gold Necklace Kasu Mala", item_code: "DEMO-G008", barcode: "DEMO890008", category_name: "Necklaces", metal_type: "gold", purity_display: "24K (999)", hsn: "7113", gross_weight: 34.0, net_weight: 30.1, wastage: 14, quantity: 1, status: "in_stock" },
    { item_name: "DEMO - Gold Bangle Kada", item_code: "DEMO-G009", barcode: "DEMO890009", category_name: "Bangles", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 21.0, net_weight: 18.5, wastage: 11, quantity: 3, status: "in_stock" },
    { item_name: "DEMO - Gold Earrings Jhumka", item_code: "DEMO-G010", barcode: "DEMO890010", category_name: "Earrings", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", gross_weight: 7.5, net_weight: 6.2, wastage: 8, quantity: 4, status: "in_stock" },
    { item_name: "DEMO - Silver Ring Traditional", item_code: "DEMO-S001", barcode: "DEMO890011", category_name: "Silver Rings", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", gross_weight: 9.5, net_weight: 8.5, wastage: 5, quantity: 8, status: "in_stock" },
    { item_name: "DEMO - Silver Chain Long", item_code: "DEMO-S002", barcode: "DEMO890012", category_name: "Silver Chains", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", gross_weight: 17.5, net_weight: 15.3, wastage: 6, quantity: 6, status: "in_stock" },
    { item_name: "DEMO - Silver Bangle Set", item_code: "DEMO-S003", barcode: "DEMO890013", category_name: "Silver Bangles", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", gross_weight: 25.0, net_weight: 22.5, wastage: 7, quantity: 5, status: "in_stock" },
    { item_name: "DEMO - Silver Earrings Pair", item_code: "DEMO-S004", barcode: "DEMO890014", category_name: "Earrings", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", gross_weight: 6.5, net_weight: 5.5, wastage: 4, quantity: 10, status: "in_stock" },
    { item_name: "DEMO - Silver Pendant Oxidized", item_code: "DEMO-S005", barcode: "DEMO890015", category_name: "Pendants", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", gross_weight: 8.5, net_weight: 7.2, wastage: 5, quantity: 7, status: "in_stock" },
  ];
  const inventoryItems = await inventoryEntity.bulkCreate(invDefs);
  summary.inventory = inventoryItems.length;

  // 7. PURCHASES (5)
  const purchaseEntity = base44.asServiceRole.entities.Purchase;
  const purchaseItemEntity = base44.asServiceRole.entities.PurchaseItem;
  const invTxnEntity = base44.asServiceRole.entities.InventoryTransaction;
  const supplierTxnEntity = base44.asServiceRole.entities.SupplierTransaction;

  const purchaseDefs = [
    { supplier: suppliers[0], items: [inventoryItems[0], inventoryItems[1], inventoryItems[2]], date: "2026-08-10", prices: [35000, 165000, 98000] },
    { supplier: suppliers[1], items: [inventoryItems[10], inventoryItems[11], inventoryItems[12]], date: "2026-08-12", prices: [800, 1400, 2100] },
    { supplier: suppliers[2], items: [inventoryItems[3], inventoryItems[4]], date: "2026-08-15", prices: [21000, 82000] },
    { supplier: suppliers[0], items: [inventoryItems[5], inventoryItems[6]], date: "2026-08-18", prices: [24000, 25000] },
    { supplier: suppliers[2], items: [inventoryItems[13], inventoryItems[14]], date: "2026-08-20", prices: [500, 650] },
  ];

  for (let i = 0; i < purchaseDefs.length; i++) {
    const pd = purchaseDefs[i];
    const purchaseNumber = `DEMO-PO${String(i + 1).padStart(3, "0")}`;
    const total = pd.prices.reduce((s, p) => s + p, 0);
    const purchase = await purchaseEntity.create({
      purchase_number: purchaseNumber, supplier_id: pd.supplier.id,
      supplier_name: pd.supplier.name, purchase_date: pd.date, total_amount: total,
      status: "finalized", notes: "DEMO purchase for testing",
    });
    for (let j = 0; j < pd.items.length; j++) {
      const item = pd.items[j];
      const price = pd.prices[j];
      await purchaseItemEntity.create({
        purchase_id: purchase.id, item_id: item.id, item_name: item.item_name,
        item_code: item.item_code, metal_type: item.metal_type, purity_display: item.purity_display,
        category_name: item.category_name, hsn: item.hsn, quantity: item.quantity,
        gross_weight: item.gross_weight, net_weight: item.net_weight, wastage: item.wastage,
        purchase_price: price,
      });
      await invTxnEntity.create({
        item_id: item.id, item_name: item.item_name,
        transaction_type: "PURCHASE_IN", quantity: item.quantity,
        gross_weight: item.gross_weight, net_weight: item.net_weight,
        reference_type: "purchase", reference_id: purchase.id,
        reason: "Purchase " + purchaseNumber, previous_stock: 0, new_stock: item.quantity,
        date: pd.date + "T10:00:00.000Z", user_name: user?.full_name || user?.email || "Admin",
      });
    }
    await supplierTxnEntity.create({
      supplier_id: pd.supplier.id, supplier_name: pd.supplier.name,
      transaction_type: "purchase", reference_type: "purchase", reference_id: purchase.id,
      amount: total, date: pd.date + "T10:00:00.000Z", notes: "DEMO purchase",
    });
  }
  summary.purchases = purchaseDefs.length;

  // 8. BILLS (6: 3 inventory + 3 manual)
  const billEntity = base44.asServiceRole.entities.Bill;
  const billItemEntity = base44.asServiceRole.entities.BillItem;
  const paymentEntity = base44.asServiceRole.entities.Payment;
  const outstandingEntity = base44.asServiceRole.entities.CustomerOutstanding;

  const gstConfig = { gst_rate: GST_RATE, cgst_rate: CGST_RATE, sgst_rate: SGST_RATE, igst_rate: GST_RATE };

  async function createBill(billDef) {
    const computedItems = billDef.items.map((it) => {
      const rate = it.metal_type === "silver" ? RATE_SILVER : (it.purity_display?.includes("18K") ? RATE_18K : RATE_22K);
      return calcItem({ ...it, rate_per_gram: rate, gst_rate: billDef.gstEnabled ? GST_RATE : 0, gst_enabled: billDef.gstEnabled });
    });
    const billResult = calcBill(computedItems, billDef.discount || 0, gstConfig, {
      gst_enabled: billDef.gstEnabled, gst_mode: billDef.gstMode || "intra",
    });
    const totalAmount = billResult.totalAmount;
    const paidAmount = billDef.paymentType === "full" ? totalAmount
      : billDef.paymentType === "partial" ? round(totalAmount * 0.5)
      : 0;
    const dueAmount = computeDue(totalAmount, paidAmount);

    const bill = await billEntity.create({
      bill_number: billDef.billNumber, customer_id: billDef.customer.id,
      customer_name: billDef.customer.name, customer_mobile: billDef.customer.mobile || "",
      customer_gst_number: billDef.customer.gst_number || "", customer_state: billDef.customer.state || "",
      bill_date: billDef.date + "T12:00:00.000Z", bill_source: billDef.source,
      subtotal: billResult.subtotal, discount: billDef.discount || 0,
      hallmarking_charge: billResult.hallmarkingTotal,
      gst_enabled: billDef.gstEnabled, gst_mode: billDef.gstEnabled ? (billDef.gstMode || "intra") : "none",
      gst_rate_snapshot: billDef.gstEnabled ? GST_RATE : 0,
      cgst: billResult.cgst, sgst: billResult.sgst, igst: billResult.igst,
      total_amount: totalAmount, paid_amount: paidAmount, due_amount: dueAmount,
      payment_mode: billDef.paymentMode || "cash", rate_snapshot: `24K=₹${RATE_24K}`,
      status: "finalized", notes: "DEMO bill for testing",
    });

    for (const it of billResult.items) {
      await billItemEntity.create({
        bill_id: bill.id, item_id: it.item_id || "", item_name: it.item_name,
        item_code: it.item_code || "", category_name: it.category_name || "",
        metal_type: it.metal_type, purity_display: it.purity_display || "",
        hsn: it.hsn || "", quantity: it.quantity, gross_weight: it.gross_weight || 0,
        stone_weight: 0, net_weight: it.net_weight, wastage: it.wastage || 0,
        rate_per_gram: it.rate_per_gram, making_charge: it.making_charge || 0,
        making_charge_type: it.making_charge_type || "percentage",
        hallmarking_charge: it.hallmarking_charge || 0, discount: it.discount || 0,
        gst_rate: it.gst_rate, metal_value: it.metal_value, making_amount: it.making_amount,
        taxable_amount: it.taxable_amount, total: it.total,
      });
      if (billDef.source === "inventory" && it.item_id) {
        const invItem = inventoryItems.find((x) => x.id === it.item_id);
        if (invItem) {
          const prevQty = invItem.quantity;
          const newQty = prevQty - it.quantity;
          await inventoryEntity.update(invItem.id, { quantity: newQty, status: newQty <= 0 ? "out_of_stock" : newQty <= 2 ? "low_stock" : "in_stock" });
          await invTxnEntity.create({
            item_id: invItem.id, item_name: invItem.item_name,
            transaction_type: "SALE_OUT", quantity: it.quantity,
            gross_weight: invItem.gross_weight, net_weight: invItem.net_weight,
            reference_type: "bill", reference_id: bill.id,
            reason: "Sale " + billDef.billNumber, previous_stock: prevQty, new_stock: newQty,
            date: billDef.date + "T12:00:00.000Z", user_name: user?.full_name || user?.email || "Admin",
          });
          invItem.quantity = newQty;
        }
      }
    }

    if (paidAmount > 0) {
      await paymentEntity.create({
        bill_id: bill.id, bill_number: billDef.billNumber,
        customer_id: billDef.customer.id, customer_name: billDef.customer.name,
        amount: paidAmount, payment_mode: billDef.paymentMode || "cash",
        payment_date: billDef.date + "T12:30:00.000Z", reference: "DEMO payment",
        user_name: user?.full_name || user?.email || "Admin",
      });
    }
    if (dueAmount > 0) {
      await outstandingEntity.create({
        customer_id: billDef.customer.id, customer_name: billDef.customer.name,
        bill_id: bill.id, bill_number: billDef.billNumber, amount: dueAmount,
        status: "open", created_date: billDef.date + "T12:00:00.000Z",
      });
      await customerEntity.update(billDef.customer.id, { outstanding: dueAmount });
    }
    return bill;
  }

  await createBill({
    billNumber: "DEMO-INV001", customer: customers[0], date: "2026-08-22", source: "inventory",
    gstEnabled: true, gstMode: "intra", paymentType: "full", paymentMode: "cash",
    items: [{ item_id: inventoryItems[0].id, item_name: inventoryItems[0].item_name, item_code: inventoryItems[0].item_code, category_name: inventoryItems[0].category_name, metal_type: "gold", purity_display: "22K (916)", hsn: "7113", quantity: 1, net_weight: 5.5, gross_weight: 6.2, wastage: 8, making_charge: 10, hallmarking_charge: 200, discount: 0 }],
  });
  await createBill({
    billNumber: "DEMO-INV002", customer: customers[2], date: "2026-08-23", source: "inventory",
    gstEnabled: true, gstMode: "inter", paymentType: "partial", paymentMode: "upi",
    items: [{ item_id: inventoryItems[1].id, item_name: inventoryItems[1].item_name, item_code: inventoryItems[1].item_code, category_name: inventoryItems[1].category_name, metal_type: "gold", purity_display: "22K (916)", hsn: "7113", quantity: 1, net_weight: 25.3, gross_weight: 28.5, wastage: 12, making_charge: 14, hallmarking_charge: 500, discount: 1000 }],
  });
  await createBill({
    billNumber: "DEMO-INV003", customer: customers[4], date: "2026-08-24", source: "inventory",
    gstEnabled: false, gstMode: "none", paymentType: "full", paymentMode: "cash",
    items: [{ item_id: inventoryItems[10].id, item_name: inventoryItems[10].item_name, item_code: inventoryItems[10].item_code, category_name: inventoryItems[10].category_name, metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", quantity: 2, net_weight: 17.0, gross_weight: 19.0, wastage: 5, making_charge: 8, hallmarking_charge: 0, discount: 0 }],
  });
  await createBill({
    billNumber: "DEMO-INV004", customer: customers[0], date: "2026-08-24", source: "manual",
    gstEnabled: false, gstMode: "none", paymentType: "full", paymentMode: "cash",
    items: [{ item_name: "DEMO - Custom Gold Bracelet", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", quantity: 1, net_weight: 10.5, gross_weight: 12.0, wastage: 6, making_charge: 12, hallmarking_charge: 300, discount: 0 }],
  });
  await createBill({
    billNumber: "DEMO-INV005", customer: customers[1], date: "2026-08-24", source: "manual",
    gstEnabled: true, gstMode: "intra", paymentType: "full", paymentMode: "bank_transfer",
    items: [{ item_name: "DEMO - Custom Diamond Necklace", metal_type: "gold", purity_display: "22K (916)", hsn: "7113", quantity: 1, net_weight: 20.0, gross_weight: 22.0, wastage: 10, making_charge: 15, hallmarking_charge: 800, discount: 500 }],
  });
  await createBill({
    billNumber: "DEMO-INV006", customer: customers[3], date: "2026-08-25", source: "manual",
    gstEnabled: true, gstMode: "intra", paymentType: "partial", paymentMode: "cash",
    items: [{ item_name: "DEMO - Custom Silver Set", metal_type: "silver", purity_display: "Silver (999)", hsn: "7113", quantity: 1, net_weight: 30.0, gross_weight: 33.0, wastage: 6, making_charge: 10, hallmarking_charge: 100, discount: 0 }],
  });
  summary.bills = 6;

  // 9. CUSTOMER ORDERS (3)
  const orderEntity = base44.asServiceRole.entities.CustomerOrder;
  await orderEntity.bulkCreate([
    { order_number: "DEMO-ORD001", customer_id: customers[3].id, customer_name: customers[3].name, required_item: "DEMO - Custom Gold Necklace 30g", design_details: "Temple design with Lakshmi pendant", expected_weight: 30, order_date: "2026-08-20", expected_completion_date: "2026-09-05", karagir_id: karagirs[0].id, karagir_name: karagirs[0].name, status: "IN_PROGRESS" },
    { order_number: "DEMO-ORD002", customer_id: customers[0].id, customer_name: customers[0].name, required_item: "DEMO - Gold Ring with Stone", design_details: "Solitaire ring 18K", expected_weight: 5, order_date: "2026-08-22", expected_completion_date: "2026-09-01", karagir_id: karagirs[0].id, karagir_name: karagirs[0].name, status: "READY" },
    { order_number: "DEMO-ORD003", customer_id: customers[4].id, customer_name: customers[4].name, required_item: "DEMO - Silver Anklet Pair", design_details: "Traditional anklets", expected_weight: 40, order_date: "2026-08-24", expected_completion_date: "2026-09-10", status: "NEW" },
  ]);
  summary.orders = 3;

  // 10. KARAGIR ORDERS (3)
  const kwoEntity = base44.asServiceRole.entities.KaragirOrder;
  await kwoEntity.bulkCreate([
    { order_number: "DEMO-KWO001", karagir_id: karagirs[0].id, karagir_name: karagirs[0].name, customer_id: customers[3].id, customer_name: customers[3].name, work_description: "DEMO - Temple necklace 30g 22K", item_description: "Gold Necklace", metal_type: "gold", purity_display: "22K (916)", gross_weight: 32, net_weight: 30, quantity: 1, expected_delivery_date: "2026-09-05", labour_charge: 2500, advance_payment: 1000, status: "IN_PROGRESS", order_date: "2026-08-20", notes: "DEMO karagir order" },
    { order_number: "DEMO-KWO002", karagir_id: karagirs[0].id, karagir_name: karagirs[0].name, customer_id: customers[0].id, customer_name: customers[0].name, work_description: "DEMO - Solitaire ring 5g 18K", item_description: "Gold Ring", metal_type: "gold", purity_display: "18K (750)", gross_weight: 6, net_weight: 5, quantity: 1, expected_delivery_date: "2026-09-01", labour_charge: 800, advance_payment: 500, status: "READY", order_date: "2026-08-22", notes: "DEMO karagir order" },
    { order_number: "DEMO-KWO003", karagir_id: karagirs[1].id, karagir_name: karagirs[1].name, customer_id: customers[4].id, customer_name: customers[4].name, work_description: "DEMO - Silver anklets 40g", item_description: "Silver Anklet Pair", metal_type: "silver", purity_display: "Silver (999)", gross_weight: 44, net_weight: 40, quantity: 1, expected_delivery_date: "2026-09-10", labour_charge: 1200, advance_payment: 0, status: "PENDING", order_date: "2026-08-24", notes: "DEMO karagir order" },
  ]);
  summary.karagirOrders = 3;

  // 11. RATE HISTORY
  const rateHistoryEntity = base44.asServiceRole.entities.RateHistory;
  await rateHistoryEntity.bulkCreate([
    { metal_type: "gold", purity_display: "24K (999)", rate_per_gram: 7000, effective_date: "2026-08-01T00:00:00.000Z", source: "manual", is_manual_override: true, is_active: false, notes: "DEMO historical rate" },
    { metal_type: "gold", purity_display: "24K (999)", rate_per_gram: 7100, effective_date: "2026-08-10T00:00:00.000Z", source: "manual", is_manual_override: true, is_active: false, notes: "DEMO historical rate" },
    { metal_type: "gold", purity_display: "24K (999)", rate_per_gram: RATE_24K, effective_date: "2026-08-20T00:00:00.000Z", source: "manual", is_manual_override: true, is_active: true, notes: "DEMO current rate" },
    { metal_type: "silver", purity_display: "Silver (999)", rate_per_gram: 90, effective_date: "2026-08-01T00:00:00.000Z", source: "manual", is_manual_override: true, is_active: false, notes: "DEMO historical rate" },
    { metal_type: "silver", purity_display: "Silver (999)", rate_per_gram: RATE_SILVER, effective_date: "2026-08-20T00:00:00.000Z", source: "manual", is_manual_override: true, is_active: true, notes: "DEMO current rate" },
  ]);
  summary.rateHistory = 5;

  // 12. NOTIFICATIONS
  const notifEntity = base44.asServiceRole.entities.Notification;
  await notifEntity.bulkCreate([
    { type: "customer_due", title: "DEMO - Payment Due Reminder", message: `DEMO - Amit Patel has an outstanding balance. Follow up for payment collection.`, reference_type: "bill", amount: 0, is_read: false, created_date: now },
    { type: "customer_order", title: "DEMO - Order Ready for Delivery", message: "DEMO - Order DEMO-ORD002 is ready. Contact customer for final billing.", reference_type: "order", is_read: false, created_date: now },
    { type: "karagir_order", title: "DEMO - Karagir Work Update", message: "DEMO - Karagir Ramesh has completed work on DEMO-KWO002. Ready for delivery.", reference_type: "karagir_order", is_read: true, read_date: now, created_date: now },
    { type: "low_stock", title: "DEMO - Low Stock Alert", message: "DEMO - Gold Ring Solitaire is running low on stock. Consider reordering.", reference_type: "inventory", is_read: false, created_date: now },
  ]);
  summary.notifications = 4;

  return summary;
}
