import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authorize, getSettings } from '../../shared/tenant.ts';
import { writeAudit } from '../../shared/audit.ts';
import { str, num } from '../../shared/utils.ts';
import { loadSampleData, clearSampleData } from '../../shared/sampleData.ts';

// Manage Data — single-business admin-only data import/export/backup/restore/sample/deletion.
// CRITICAL: All deletion operations use an explicit allowlist. No arbitrary entity names.
const IMPORTABLE_ENTITIES = ['Customer', 'Supplier', 'InventoryItem', 'ItemMaster', 'Karagir'];

// Allowlist of entities supported for deletion operations
const DELETABLE_ENTITIES = {
  customers: 'Customer',
  suppliers: 'Supplier',
  inventory: 'InventoryItem',
  item_masters: 'ItemMaster',
  bills: 'Bill',
  bill_items: 'BillItem',
  payments: 'Payment',
  purchases: 'Purchase',
  purchase_items: 'PurchaseItem',
  orders: 'CustomerOrder',
  karagirs: 'Karagir',
  karagir_orders: 'KaragirOrder',
  stock_transactions: 'InventoryTransaction',
  supplier_transactions: 'SupplierTransaction',
  customer_outstanding: 'CustomerOutstanding',
  exchanges: 'ExchangeTransaction',
  returns: 'ReturnTransaction',
  rate_history: 'RateHistory',
  notifications: 'Notification',
  activity_logs: 'ActivityLog',
};

// Entities cleared during "Clear All Business Data" — transactional data only.
// Preserves: ShopSettings, CategoryMaster, PurityMaster, GSTConfig, User, ShopMembership, ActivityLog, WhatsAppConfig
const BUSINESS_DATA_ENTITIES = [
  'ExchangeTransaction', 'ReturnTransaction', 'CustomerOutstanding',
  'Payment', 'BillItem', 'Bill',
  'KaragirOrder', 'CustomerOrder',
  'PurchaseItem', 'Purchase', 'SupplierTransaction',
  'InventoryTransaction', 'InventoryItem', 'ItemMaster',
  'Customer', 'Supplier', 'Karagir',
  'RateHistory', 'Notification',
];

const EXPORTABLE_ENTITIES = [
  'Customer', 'Supplier', 'InventoryItem', 'Bill', 'BillItem', 'Purchase', 'PurchaseItem',
  'Payment', 'CustomerOutstanding', 'CustomerOrder', 'Karagir', 'KaragirOrder',
  'InventoryTransaction', 'SupplierTransaction', 'RateHistory', 'CategoryMaster',
  'PurityMaster', 'ItemMaster', 'ExchangeTransaction', 'ReturnTransaction', 'Notification',
];

const BACKUP_ENTITIES = [
  'ShopSettings', 'CategoryMaster', 'PurityMaster', 'ItemMaster',
  'Customer', 'Supplier', 'Karagir', 'InventoryItem',
  'Purchase', 'PurchaseItem', 'Bill', 'BillItem', 'Payment', 'CustomerOutstanding',
  'CustomerOrder', 'KaragirOrder', 'InventoryTransaction', 'SupplierTransaction',
  'RateHistory', 'ExchangeTransaction', 'ReturnTransaction', 'Notification',
  'ActivityLog',
];

// ── Dependency-aware deletion helpers ──

async function deleteBillCascade(base44, billId) {
  const bill = await base44.asServiceRole.entities.Bill.get(billId).catch(() => null);
  if (!bill) return { deleted: false, reason: 'Bill not found' };

  const billItems = await base44.asServiceRole.entities.BillItem.filter({ bill_id: billId }, '-created_date', 500);

  // Restore inventory if inventory-sourced bill
  if (bill.bill_source === 'inventory') {
    for (const bi of billItems) {
      if (!bi.item_id) continue;
      const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(bi.item_id) }, '-updated_date', 1);
      if (invItems.length > 0) {
        const inv = invItems[0];
        const prevQty = Number(inv.quantity) || 0;
        const newQty = prevQty + num(bi.quantity);
        await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
          quantity: newQty,
          gross_weight: (Number(inv.gross_weight) || 0) + num(bi.gross_weight),
          net_weight: (Number(inv.net_weight) || 0) + num(bi.net_weight),
          status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
        }).catch(() => {});
      }
    }
  }

  // Delete dependent records
  await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ reference_type: 'bill', reference_id: billId }).catch(() => {});
  await base44.asServiceRole.entities.Payment.deleteMany({ bill_id: billId }).catch(() => {});
  await base44.asServiceRole.entities.CustomerOutstanding.deleteMany({ bill_id: billId }).catch(() => {});
  await base44.asServiceRole.entities.BillItem.deleteMany({ bill_id: billId }).catch(() => {});

  // Update customer outstanding
  if (bill.customer_id && num(bill.due_amount) > 0) {
    const cust = await base44.asServiceRole.entities.Customer.get(bill.customer_id).catch(() => null);
    if (cust) {
      await base44.asServiceRole.entities.Customer.update(cust.id, {
        outstanding: Math.max(0, (Number(cust.outstanding) || 0) - num(bill.due_amount)),
      }).catch(() => {});
    }
  }

  // Delete the bill
  await base44.asServiceRole.entities.Bill.delete(billId);
  return { deleted: true };
}

async function deletePurchaseCascade(base44, purchaseId) {
  const purchase = await base44.asServiceRole.entities.Purchase.get(purchaseId).catch(() => null);
  if (!purchase) return { deleted: false, reason: 'Purchase not found' };

  const purchaseItems = await base44.asServiceRole.entities.PurchaseItem.filter({ purchase_id: purchaseId }, '-created_date', 500);

  // Reverse inventory (subtract what was added)
  for (const pi of purchaseItems) {
    if (!pi.item_id) continue;
    const invItems = await base44.asServiceRole.entities.InventoryItem.filter({ item_id: str(pi.item_id) }, '-updated_date', 1);
    if (invItems.length > 0) {
      const inv = invItems[0];
      const prevQty = Number(inv.quantity) || 0;
      const newQty = Math.max(0, prevQty - num(pi.quantity));
      await base44.asServiceRole.entities.InventoryItem.update(inv.id, {
        quantity: newQty,
        gross_weight: Math.max(0, (Number(inv.gross_weight) || 0) - num(pi.gross_weight)),
        net_weight: Math.max(0, (Number(inv.net_weight) || 0) - num(pi.net_weight)),
        status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
      }).catch(() => {});
    }
  }

  // Delete dependent records
  await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
  await base44.asServiceRole.entities.SupplierTransaction.deleteMany({ reference_type: 'purchase', reference_id: purchaseId }).catch(() => {});
  await base44.asServiceRole.entities.PurchaseItem.deleteMany({ purchase_id: purchaseId }).catch(() => {});

  // Update supplier outstanding
  if (purchase.supplier_id && num(purchase.total_amount) > 0) {
    const supplier = await base44.asServiceRole.entities.Supplier.get(purchase.supplier_id).catch(() => null);
    if (supplier) {
      await base44.asServiceRole.entities.Supplier.update(supplier.id, {
        outstanding: Math.max(0, (Number(supplier.outstanding) || 0) - num(purchase.total_amount)),
      }).catch(() => {});
    }
  }

  // Delete the purchase
  await base44.asServiceRole.entities.Purchase.delete(purchaseId);
  return { deleted: true };
}

async function deleteCustomerCheck(base44, customerId) {
  const bills = await base44.asServiceRole.entities.Bill.filter({ customer_id: customerId }, '-created_date', 1);
  if (bills.length > 0) return { deleted: false, reason: `Customer has ${bills.length} bill(s). Delete the bills first.` };
  const orders = await base44.asServiceRole.entities.CustomerOrder.filter({ customer_id: customerId }, '-created_date', 1);
  if (orders.length > 0) return { deleted: false, reason: `Customer has ${orders.length} order(s). Delete the orders first.` };
  const outstanding = await base44.asServiceRole.entities.CustomerOutstanding.filter({ customer_id: customerId }, '-created_date', 1);
  if (outstanding.length > 0) return { deleted: false, reason: `Customer has ${outstanding.length} outstanding record(s).` };
  await base44.asServiceRole.entities.Customer.delete(customerId);
  return { deleted: true };
}

async function deleteSupplierCheck(base44, supplierId) {
  const purchases = await base44.asServiceRole.entities.Purchase.filter({ supplier_id: supplierId }, '-created_date', 1);
  if (purchases.length > 0) return { deleted: false, reason: `Supplier has ${purchases.length} purchase(s). Delete the purchases first.` };
  const transactions = await base44.asServiceRole.entities.SupplierTransaction.filter({ supplier_id: supplierId }, '-created_date', 1);
  if (transactions.length > 0) return { deleted: false, reason: `Supplier has ${transactions.length} transaction(s).` };
  await base44.asServiceRole.entities.Supplier.delete(supplierId);
  return { deleted: true };
}

async function deleteInventoryItemCheck(base44, itemId) {
  const inv = await base44.asServiceRole.entities.InventoryItem.get(itemId).catch(() => null);
  if (!inv) return { deleted: false, reason: 'Item not found' };
  const masterId = str(inv.item_id);

  const billItems = await base44.asServiceRole.entities.BillItem.filter({ item_id: masterId }, '-created_date', 1);
  if (billItems.length > 0) return { deleted: false, reason: `Item has ${billItems.length} bill item(s). Delete the bills first.` };
  const purchaseItems = await base44.asServiceRole.entities.PurchaseItem.filter({ item_id: masterId }, '-created_date', 1);
  if (purchaseItems.length > 0) return { deleted: false, reason: `Item has ${purchaseItems.length} purchase item(s). Delete the purchases first.` };

  await base44.asServiceRole.entities.InventoryItem.delete(itemId);
  if (masterId) await base44.asServiceRole.entities.ItemMaster.delete(masterId).catch(() => {});
  await base44.asServiceRole.entities.InventoryTransaction.deleteMany({ item_id: masterId || itemId }).catch(() => {});
  return { deleted: true };
}

// Dispatch deletion by entity type
async function deleteRecord(base44, entityName, id) {
  if (entityName === 'Bill') return deleteBillCascade(base44, id);
  if (entityName === 'Purchase') return deletePurchaseCascade(base44, id);
  if (entityName === 'Customer') return deleteCustomerCheck(base44, id);
  if (entityName === 'Supplier') return deleteSupplierCheck(base44, id);
  if (entityName === 'InventoryItem') return deleteInventoryItemCheck(base44, id);
  // Simple delete for all other entities
  await base44.asServiceRole.entities[entityName].delete(id);
  return { deleted: true };
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'manageData');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const action = str(body.action);

    // ── GET COUNTS (for deletion preview) ──
    if (action === 'getCounts') {
      const counts = {};
      for (const [key, entityName] of Object.entries(DELETABLE_ENTITIES)) {
        try {
          const records = await base44.asServiceRole.entities[entityName].list('-created_date', 10000);
          counts[key] = records.length;
        } catch (e) { counts[key] = 0; }
      }
      return Response.json({ success: true, counts });
    }

    // ── GET RECORDS (for selection UI) ──
    if (action === 'getRecords') {
      const target = str(body.target);
      const entityName = DELETABLE_ENTITIES[target];
      if (!entityName) return Response.json({ error: 'Invalid target' }, { status: 400 });
      const records = await base44.asServiceRole.entities[entityName].list('-created_date', 5000);
      const items = records.map(r => ({
        id: r.id,
        label: r.name || r.item_name || r.bill_number || r.purchase_number || r.order_number || r.return_number || r.exchange_number || r.title || r.item_code || r.supplier_code || r.customer_code || r.id,
        sub: r.mobile || r.metal_type || r.status || r.bill_number || r.customer_name || r.supplier_name || '',
      }));
      return Response.json({ success: true, entity: entityName, records: items, count: items.length });
    }

    // ── DELETE SELECTED ──
    if (action === 'deleteSelected') {
      const target = str(body.target);
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      const entityName = DELETABLE_ENTITIES[target];
      if (!entityName) return Response.json({ error: 'Invalid target' }, { status: 400 });
      if (ids.length === 0) return Response.json({ error: 'No records selected' }, { status: 400 });

      let deletedCount = 0;
      const blocked = [];
      for (const id of ids) {
        try {
          const res = await deleteRecord(base44, entityName, id);
          if (res.deleted) deletedCount++;
          else blocked.push({ id, reason: res.reason });
        } catch (e) { blocked.push({ id, reason: e.message }); }
      }
      await writeAudit(base44, {
        action: 'delete_selected', module: 'data', new_value: { entity: entityName, deleted: deletedCount, blocked: blocked.length },
        reason: `Deleted ${deletedCount} ${entityName} record(s)`, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true, deleted: deletedCount, blocked });
    }

    // ── DELETE ALL MODULE ──
    if (action === 'deleteAllModule') {
      const target = str(body.target);
      const confirmation = str(body.confirmation);
      const entityName = DELETABLE_ENTITIES[target];
      if (!entityName) return Response.json({ error: 'Invalid target' }, { status: 400 });
      if (confirmation !== 'DELETE') return Response.json({ error: 'Type DELETE to confirm' }, { status: 400 });

      const records = await base44.asServiceRole.entities[entityName].list('-created_date', 10000);
      if (records.length === 0) return Response.json({ success: true, deleted: 0, blocked: [] });

      let deletedCount = 0;
      const blocked = [];
      for (const r of records) {
        try {
          const res = await deleteRecord(base44, entityName, r.id);
          if (res.deleted) deletedCount++;
          else blocked.push({ id: r.id, reason: res.reason });
        } catch (e) { blocked.push({ id: r.id, reason: e.message }); }
      }
      await writeAudit(base44, {
        action: 'delete_all_module', module: 'data', new_value: { entity: entityName, deleted: deletedCount, blocked: blocked.length },
        reason: `Deleted all ${entityName} (${deletedCount} records)`, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true, deleted: deletedCount, blocked });
    }

    // ── CLEAR ALL BUSINESS DATA ──
    if (action === 'clearBusinessData') {
      const confirmation = str(body.confirmation);
      if (confirmation !== 'DELETE ALL DATA') return Response.json({ error: 'Type DELETE ALL DATA to confirm' }, { status: 400 });

      const summary = {};
      // 1. Delete all bills (with inventory restoration)
      const bills = await base44.asServiceRole.entities.Bill.list('-created_date', 10000);
      for (const bill of bills) { try { await deleteBillCascade(base44, bill.id); } catch (e) {} }
      summary.bills = bills.length;
      // 2. Delete all purchases (with inventory reversal)
      const purchases = await base44.asServiceRole.entities.Purchase.list('-created_date', 10000);
      for (const pur of purchases) { try { await deletePurchaseCascade(base44, pur.id); } catch (e) {} }
      summary.purchases = purchases.length;
      // 3. Delete remaining transactional entities
      const remaining = ['ExchangeTransaction', 'ReturnTransaction', 'CustomerOutstanding', 'KaragirOrder', 'CustomerOrder', 'SupplierTransaction', 'InventoryTransaction', 'InventoryItem', 'ItemMaster', 'Customer', 'Supplier', 'Karagir', 'RateHistory', 'Notification'];
      for (const entityName of remaining) {
        try {
          const recs = await base44.asServiceRole.entities[entityName].list('-created_date', 10000);
          await base44.asServiceRole.entities[entityName].deleteMany({});
          summary[entityName] = recs.length;
        } catch (e) { summary[entityName] = `error: ${e.message}`; }
      }
      await writeAudit(base44, {
        action: 'clear_business_data', module: 'data', new_value: summary, reason: 'Cleared all business data',
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      });
      return Response.json({ success: true, summary });
    }

    // ── EXTRACT FILE ──
    if (action === 'extractFile') {
      const entityName = str(body.entity);
      if (!IMPORTABLE_ENTITIES.includes(entityName)) return Response.json({ error: 'Extract not supported for this entity' }, { status: 400 });
      const fileUrl = str(body.file_url);
      if (!fileUrl) return Response.json({ error: 'File URL required' }, { status: 400 });
      const schemas = {
        Customer: { type: 'object', properties: { name: { type: 'string' }, mobile: { type: 'string' }, gst_number: { type: 'string' }, address: { type: 'string' }, state: { type: 'string' }, city: { type: 'string' }, pincode: { type: 'string' }, notes: { type: 'string' } }, required: ['name'] },
        Supplier: { type: 'object', properties: { name: { type: 'string' }, mobile: { type: 'string' }, email: { type: 'string' }, gst_number: { type: 'string' }, address: { type: 'string' }, state: { type: 'string' }, city: { type: 'string' }, notes: { type: 'string' } }, required: ['name'] },
        InventoryItem: { type: 'object', properties: { item_name: { type: 'string' }, item_code: { type: 'string' }, barcode: { type: 'string' }, category_name: { type: 'string' }, metal_type: { type: 'string' }, purity_display: { type: 'string' }, hsn: { type: 'string' }, gross_weight: { type: 'number' }, net_weight: { type: 'number' }, quantity: { type: 'number' }, wastage: { type: 'number' } }, required: ['item_name', 'metal_type'] },
        Karagir: { type: 'object', properties: { name: { type: 'string' }, mobile: { type: 'string' }, address: { type: 'string' }, specialization: { type: 'string' }, notes: { type: 'string' } }, required: ['name'] },
        ItemMaster: { type: 'object', properties: { item_code: { type: 'string' }, item_name: { type: 'string' }, category_name: { type: 'string' }, metal_type: { type: 'string' }, purity_display: { type: 'string' }, hsn: { type: 'string' } }, required: ['item_code', 'item_name', 'metal_type'] },
      };
      const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({ file_url: fileUrl, json_schema: schemas[entityName] });
      return Response.json({ success: true, records: result.output || [] });
    }

    // ── IMPORT ──
    if (action === 'import') {
      const entityName = str(body.entity);
      if (!IMPORTABLE_ENTITIES.includes(entityName)) return Response.json({ error: 'Import not supported for this entity' }, { status: 400 });
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length === 0) return Response.json({ error: 'No records to import' }, { status: 400 });
      const entity = base44.asServiceRole.entities[entityName];
      const created = await entity.bulkCreate(records.slice(0, 500));
      await writeAudit(base44, { action: 'import', module: 'data', new_value: { entity: entityName, count: created.length }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, imported: created.length });
    }

    // ── EXPORT ──
    if (action === 'export') {
      const entityName = str(body.entity);
      if (!EXPORTABLE_ENTITIES.includes(entityName)) return Response.json({ error: 'Export not supported for this entity' }, { status: 400 });
      const records = await base44.asServiceRole.entities[entityName].list('-created_date', 5000);
      const safe = records.map(r => { const { created_by_id, ...rest } = r; return rest; });
      await writeAudit(base44, { action: 'export', module: 'data', new_value: { entity: entityName, count: safe.length }, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, entity: entityName, records: safe, count: safe.length });
    }

    // ── BACKUP ──
    if (action === 'backup') {
      const data = {}; const counts = {};
      for (const entityName of BACKUP_ENTITIES) {
        try {
          const records = await base44.asServiceRole.entities[entityName].list('-created_date', 10000);
          const safe = records.map(r => { const { created_by_id, ...rest } = r; return rest; });
          data[entityName] = safe; counts[entityName] = safe.length;
        } catch (e) { data[entityName] = []; counts[entityName] = 0; }
      }
      const backup = { version: '1.0', backup_date: new Date().toISOString(), created_by: user.full_name || user.email || '', shop_name: ctx.shop?.shop_name || '', counts, data };
      await writeAudit(base44, { action: 'backup', module: 'data', new_value: counts, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, backup });
    }

    // ── RESTORE ──
    if (action === 'restore') {
      const backup = body.backup;
      if (!backup || !backup.data) return Response.json({ error: 'Invalid backup file' }, { status: 400 });
      const confirmation = str(body.confirmation);
      if (confirmation !== 'RESTORE BACKUP') return Response.json({ error: 'Confirmation phrase "RESTORE BACKUP" required' }, { status: 400 });
      const results = {};
      const restoreOrder = ['ShopSettings', 'CategoryMaster', 'PurityMaster', 'ItemMaster', 'Customer', 'Supplier', 'Karagir', 'InventoryItem', 'Purchase', 'PurchaseItem', 'Bill', 'BillItem', 'Payment', 'CustomerOutstanding', 'CustomerOrder', 'KaragirOrder', 'InventoryTransaction', 'SupplierTransaction', 'RateHistory', 'ExchangeTransaction', 'ReturnTransaction', 'Notification'];
      for (const entityName of restoreOrder) {
        const records = backup.data[entityName];
        if (!Array.isArray(records) || records.length === 0) { results[entityName] = 0; continue; }
        try {
          const stamped = records.map(r => { const { id, created_date, updated_date, created_by_id, ...fields } = r; return fields; });
          await base44.asServiceRole.entities[entityName].bulkCreate(stamped);
          results[entityName] = stamped.length;
        } catch (e) { results[entityName] = `error: ${e.message}`; }
      }
      await writeAudit(base44, { action: 'restore', module: 'data', new_value: results, reason: 'Backup restore', user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, results });
    }

    // ── LOAD SAMPLE DATA ──
    if (action === 'loadSampleData') {
      const existingCustomers = await base44.asServiceRole.entities.Customer.list('-created_date', 500);
      const hasDemo = existingCustomers.some(c => c.name && c.name.includes('DEMO'));
      if (hasDemo) return Response.json({ error: 'Sample data already exists. Clear it first before loading again.' }, { status: 400 });
      const summary = await loadSampleData(base44, ctx, user);
      await writeAudit(base44, { action: 'loadSampleData', module: 'data', new_value: summary, user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, summary });
    }

    // ── CLEAR SAMPLE DATA ──
    if (action === 'clearSampleData') {
      const results = await clearSampleData(base44, ctx);
      await writeAudit(base44, { action: 'clearSampleData', module: 'data', new_value: results, reason: 'Clear demo data', user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role });
      return Response.json({ success: true, results });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}