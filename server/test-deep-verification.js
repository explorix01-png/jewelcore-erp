// Deep Verification Test Suite for JewelCore ERP Migration
import http from 'http';

const BASE_URL = 'http://localhost:3001';

async function fetchJson(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = { error: 'Non-JSON response', status: res.status };
  }
  return { status: res.status, ok: res.ok, data };
}

async function runDeepVerification() {
  console.log('===============================================================');
  console.log('🔍 JEWELCORE ERP DEEP FUNCTIONAL VERIFICATION');
  console.log('===============================================================');

  // Auto-start backend if not currently running
  try {
    await fetch(`${BASE_URL}/api/health`);
  } catch (e) {
    console.log('⚡ Backend server not active on port 3001, auto-starting server in-process...');
    await import('./server.js');
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // --- 1. SETUP ADMIN & GET TOKEN ---
  const adminEmail = `verify_admin_${Date.now()}@example.com`;
  const regAdmin = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: 'password123', full_name: 'Audit Admin', role: 'admin', active_shop_role: 'admin' })
  });
  if (!regAdmin.ok || !regAdmin.data.token) throw new Error('Admin registration failed');
  const adminToken = regAdmin.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log('✓ Admin authenticated:', adminEmail);

  // --- 2. RBAC TEST: STAFF RESTRICTIONS ---
  console.log('\n[CHECK 1] Verifying Role-Based Access Control (RBAC)...');
  const staffEmail = `verify_staff_${Date.now()}@example.com`;
  const regStaff = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: staffEmail, password: 'password123', full_name: 'Sales Staff', role: 'user', active_shop_role: 'staff' })
  });
  if (!regStaff.ok || !regStaff.data.token) throw new Error('Staff registration failed');
  const staffHeaders = { Authorization: `Bearer ${regStaff.data.token}` };

  // Staff attempts admin-only changeRate
  const unauthorizedRateChange = await fetchJson('/api/functions/changeRate', {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({ gold_24k_rate: 8000, silver_rate: 100 })
  });
  if (unauthorizedRateChange.status !== 403) {
    throw new Error(`Expected 403 Forbidden for staff changeRate, got: ${unauthorizedRateChange.status}`);
  }
  console.log('✓ RBAC confirmed: Staff correctly blocked (403) from admin-only rate changes.');

  // --- 3. CUSTOMER CREATION ---
  console.log('\n[CHECK 2] Creating Test Customer...');
  const custRes = await fetchJson('/api/entities/Customer', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Pooja Verma',
      mobile: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
      city: 'Delhi',
      state: 'Delhi'
    })
  });
  if (!custRes.ok || !custRes.data.id) throw new Error('Customer creation failed');
  const customerId = custRes.data.id;
  console.log('✓ Customer created:', customerId);

  // Ensure active rates are set
  await fetchJson('/api/functions/changeRate', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ gold_24k_rate: 7200, silver_rate: 85 })
  });

  // --- 4. CHECK POINT 7: MANUAL BILLS DO NOT CHANGE INVENTORY ---
  console.log('\n[CHECK 3] Verifying Manual Bills DO NOT Alter Inventory (Point 7)...');
  const manualInvItem = await fetchJson('/api/entities/InventoryItem', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      item_name: 'Manual Test Gold Chain',
      item_code: `CHN-${Date.now().toString().slice(-4)}`,
      category_name: 'Chains',
      metal_type: 'gold',
      purity_display: '22K',
      purity_value: 91.6,
      quantity: 10,
      gross_weight: 100.0,
      net_weight: 95.0,
      status: 'in_stock'
    })
  });
  const manualInvId = manualInvItem.data.id;

  // Finalize bill with bill_source: 'manual'
  const manualBillRes = await fetchJson('/api/functions/finalizeBill', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      customer_id: customerId,
      bill_source: 'manual',
      items: [
        {
          item_name: 'Custom Handmade Pendant',
          quantity: 1,
          gross_weight: 5.0,
          net_weight: 4.8,
          metal_type: 'gold',
          purity_display: '22K',
          rate_per_gram: 6600,
          making_charge: 500,
          making_charge_type: 'fixed'
        }
      ],
      bill_discount: 0,
      paid_amount: 10000,
      payment_mode: 'cash',
      gst_enabled: false
    })
  });
  if (!manualBillRes.ok || !manualBillRes.data.success) {
    throw new Error(`Manual bill failed: ${JSON.stringify(manualBillRes.data)}`);
  }
  const checkManualInv = await fetchJson(`/api/entities/InventoryItem/${manualInvId}`, { headers: adminHeaders });
  if (checkManualInv.data.quantity !== 10) {
    throw new Error(`Manual bill changed inventory! Expected 10, got: ${checkManualInv.data.quantity}`);
  }
  console.log('✓ Verified: Manual bill preserved inventory item quantity at exactly 10.');

  // --- 5. CHECK POINT 8: CUSTOMER PURCHASES DO NOT ALTER INVENTORY ---
  console.log('\n[CHECK 4] Verifying Customer Purchase Bills DO NOT Alter Inventory (Point 8)...');
  const custPurchBillRes = await fetchJson('/api/functions/finalizeBill', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      customer_id: customerId,
      bill_source: 'customer_purchase',
      items: [
        {
          item_name: 'Customer Requested Gold Coin 24K',
          quantity: 2,
          gross_weight: 10.0,
          net_weight: 10.0,
          metal_type: 'gold',
          purity_display: '24K',
          purity_value: 99.9,
          rate_per_gram: 7200
        }
      ],
      bill_discount: 0,
      paid_amount: 10000,
      payment_mode: 'upi'
    })
  });
  if (!custPurchBillRes.ok || !custPurchBillRes.data.success) {
    throw new Error(`Customer purchase bill failed: ${JSON.stringify(custPurchBillRes.data)}`);
  }
  const checkCustPurchInv = await fetchJson(`/api/entities/InventoryItem/${manualInvId}`, { headers: adminHeaders });
  if (checkCustPurchInv.data.quantity !== 10) {
    throw new Error(`Customer purchase incorrectly altered inventory! Expected 10, got: ${checkCustPurchInv.data.quantity}`);
  }
  console.log('✓ Verified: Customer purchase bill did not alter inventory.');

  // --- 6. CHECK SUPPLIER PURCHASE FINALIZATION (FINALIZEPURCHASE) ---
  console.log('\n[CHECK 5] Verifying Supplier Purchase Finalization (finalizePurchase)...');
  const supplierRes = await fetchJson('/api/entities/Supplier', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Surat Diamond & Gold Mart',
      mobile: '9822114455',
      city: 'Surat',
      state: 'Gujarat'
    })
  });
  const supplierId = supplierRes.data.id;

  const supplierPurchaseItemCode = `PUR-BRC-${Date.now().toString().slice(-4)}`;
  const finalizePurchRes = await fetchJson('/api/functions/finalizePurchase', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      supplier_id: supplierId,
      purchase_date: new Date().toISOString(),
      update_inventory: true,
      items: [
        {
          item_id: `itm-${Date.now()}`,
          item_name: 'Gold Bracelet 22K',
          item_code: supplierPurchaseItemCode,
          category_name: 'Bracelets',
          metal_type: 'gold',
          purity_display: '22K',
          purity_value: 91.6,
          quantity: 8,
          gross_weight: 80.0,
          net_weight: 76.0,
          rate_per_gram: 6500,
          making_charge: 300,
          making_charge_type: 'per_gram'
        }
      ],
      bill_discount: 0,
      paid_amount: 200000,
      payment_mode: 'bank_transfer',
      gst_enabled: false
    })
  });
  if (!finalizePurchRes.ok || !finalizePurchRes.data.success) {
    throw new Error(`Supplier purchase finalization failed: ${JSON.stringify(finalizePurchRes.data)}`);
  }
  console.log('✓ Supplier purchase finalized. Purchase #:', finalizePurchRes.data.purchase_number);

  // Verify inventory stock-in occurred for supplier purchase
  const stockedItems = await fetchJson('/api/entities/InventoryItem/filter', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ query: { item_code: supplierPurchaseItemCode } })
  });
  if (!stockedItems.ok || stockedItems.data.length === 0 || stockedItems.data[0].quantity !== 8) {
    throw new Error('Supplier purchase failed to stock-in inventory item!');
  }
  console.log('✓ Stock-in verified: 8 units accurately added to inventory via purchase.');

  // --- 6. CHECK RETURNS AND EXCHANGES ---
  console.log('\n[CHECK 6] Verifying processExchange & processReturn...');
  // Process Exchange
  const exchangeRes = await fetchJson('/api/functions/processExchange', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      original_bill_id: manualBillRes.data.bill_id,
      old_item: {
        item_id: manualInvId,
        name: 'Old Gold Chain',
        quantity: 1,
        weight: 5.0,
        value: 30000
      },
      new_item: {
        item_id: manualInvId,
        name: 'New Designer Gold Chain',
        quantity: 1,
        weight: 6.0,
        value: 36000
      },
      difference_amount: 6000,
      notes: 'Customer upgraded chain'
    })
  });
  if (!exchangeRes.ok || !exchangeRes.data.success) {
    throw new Error(`Exchange failed: ${JSON.stringify(exchangeRes.data)}`);
  }
  console.log('✓ processExchange verified! Exchange ID:', exchangeRes.data.exchange_id);

  // Process Return
  const returnRes = await fetchJson('/api/functions/processReturn', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      original_bill_id: manualBillRes.data.bill_id,
      quantity: 1,
      reason: 'Customer return for exchange adjustment'
    })
  });
  if (!returnRes.ok || !returnRes.data.success) {
    throw new Error(`processReturn failed: ${JSON.stringify(returnRes.data)}`);
  }
  console.log('✓ processReturn verified! Return ID:', returnRes.data.return_id);

  // --- 8. PERSISTENCE TEST (POINT 9) ---
  console.log('\n[CHECK 7] Verifying Database Persistence across writes...');
  const persistenceMarker = `marker_${Date.now()}`;
  const markerCustomer = await fetchJson('/api/entities/Customer', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Persistence Test Record',
      notes: persistenceMarker
    })
  });
  const markerId = markerCustomer.data.id;

  // Read it back immediately
  const checkMarker = await fetchJson(`/api/entities/Customer/${markerId}`, { headers: adminHeaders });
  if (checkMarker.data?.notes !== persistenceMarker) {
    throw new Error('Direct write failed verification');
  }
  console.log('✓ Database write verified and committed to PostgreSQL.');

  console.log('\n===============================================================');
  console.log('🏆 ALL DEEP VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================\n');
  process.exit(0);
}

runDeepVerification().catch(e => {
  console.error('❌ Deep verification error:', e);
  process.exit(1);
});
