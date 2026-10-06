import { seedLocalAdmin } from './db/seedAdmin.js';
import { sortPuritiesDescending, calcFineWeight } from './shared/billCalc.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) return;
  } catch (e) {
    console.log('⚡ Backend server not active on port 3001, auto-starting server in-process...');
    await import('./server.js');
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) return;
      } catch {}
      await wait(200);
    }
  }
}

async function runE2E() {
  console.log('===============================================================');
  console.log('🔍 JEWELCORE ERP — COMPREHENSIVE AUTOMATED E2E QA TEST SUITE');
  console.log('===============================================================\n');

  await ensureServerRunning();

  // AREA 1: Server and Database Health
  console.log('>>> AREA 1: Health & Database Verification');
  const healthRes = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
  if (!healthRes.ok || !healthRes.database?.ok) {
    throw new Error('Health check failed: ' + JSON.stringify(healthRes));
  }
  console.log(`✓ Health OK. DB Engine: ${healthRes.database.engine}, Latency: ${healthRes.database.latencyMs}ms\n`);

  // AREA 2: Authentication Flow & Role Testing
  console.log('>>> AREA 2: Authentication Flow');
  // 1. Unauthenticated request to protected endpoint should fail
  const unauthRes = await fetch(`${BASE_URL}/api/functions/getDashboardStats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (unauthRes.status !== 401) {
    throw new Error(`Unauthenticated request should return 401, got ${unauthRes.status}`);
  }
  console.log('✓ Protected endpoint correctly returns 401 Unauthorized for unauthenticated callers');

  // 2. Admin login
  let testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@jewelcore.local';
  try {
    const adminInfo = await seedLocalAdmin();
    testEmail = adminInfo.email;
  } catch (_) {
    // Backend server holds lock
  }
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin@JewelCore2026';

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  }).then(r => r.json());

  if (!loginRes.token) throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  const adminToken = loginRes.token;
  const adminHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` };
  console.log(`✓ Admin successfully authenticated. Active shop role: ${loginRes.user?.active_shop_role || 'admin'}`);

  // 3. Verify session via /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: adminHeaders }).then(r => r.json());
  if (!meRes.email || meRes.email !== testEmail) {
    throw new Error('Session verification failed on /api/auth/me');
  }
  console.log(`✓ Session persistence verified on /api/auth/me (${meRes.email})\n`);

  // AREA 3 & 4: Rate Management & Historical Rate Lookup
  console.log('>>> AREA 3 & 4: Rate Management & Historical Lookup');
  // Check purity sequence descending starting with 24K
  const testPurities = [
    { display_format: '10K', purity_value: 41.7, metal_type: 'gold' },
    { display_format: '22K', purity_value: 91.67, metal_type: 'gold' },
    { display_format: '24K', purity_value: 99.9, metal_type: 'gold' },
    { display_format: '18K', purity_value: 75.0, metal_type: 'gold' },
    { display_format: '23.5K', purity_value: 98.0, metal_type: 'gold' },
  ];
  const sortedPurs = sortPuritiesDescending(testPurities, 'gold');
  if (sortedPurs[0].display_format !== '24K') throw new Error('First purity must be 24K');
  if (sortedPurs[1].display_format !== '23.5K' || sortedPurs[2].display_format !== '22K') {
    throw new Error('Purities not in descending order: ' + sortedPurs.map(p => p.display_format).join(', '));
  }
  console.log('✓ Gold purities sort descending starting from 24K:', sortedPurs.map(p => p.display_format).join(' → '));

  // Set historical rate A (effective for 2026-09-22 test date)
  await fetch(`${BASE_URL}/api/functions/changeRate`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      gold_24k_rate: 7200,
      silver_rate: 85,
      effective_date: '2026-09-21T23:59:00.000Z',
      notes: 'Historical Rate A'
    })
  });

  // Set historical rate B (effective 2026-09-25)
  await fetch(`${BASE_URL}/api/functions/changeRate`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      gold_24k_rate: 7400,
      silver_rate: 88,
      effective_date: '2026-09-25T10:00:00.000Z',
      notes: 'Historical Rate B'
    })
  });

  // Test lookup for 2026-09-22: must resolve Rate A (₹7200)
  const lookup22 = await fetch(`${BASE_URL}/api/functions/getEffectiveRates`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ date: '2026-09-22' })
  }).then(r => r.json());
  if (Number(lookup22.gold_24k_rate) !== 7200) {
    throw new Error(`Expected rate for 2026-09-22 to be 7200 (Rate A), got ${lookup22.gold_24k_rate}`);
  }
  console.log(`✓ Historical lookup on 2026-09-22 correctly resolved Rate A (7200): ₹${lookup22.gold_24k_rate}/g`);

  // Test lookup for 2026-09-27: must resolve Rate B (₹7400)
  const lookup27 = await fetch(`${BASE_URL}/api/functions/getEffectiveRates`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ date: '2026-09-27' })
  }).then(r => r.json());
  if (Number(lookup27.gold_24k_rate) !== 7400) {
    throw new Error(`Expected rate for 2026-09-27 to be 7400 (Rate B), got ${lookup27.gold_24k_rate}`);
  }
  console.log(`✓ Historical lookup on 2026-09-27 correctly resolved Rate B (7400): ₹${lookup27.gold_24k_rate}/g\n`);

  // AREA 5: New Bill with Historical Date & Rate Snapshot
  console.log('>>> AREA 5: New Bill Historical Rate & Snapshot Lock');
  // Create a customer for testing
  const custRes = await fetch(`${BASE_URL}/api/entities/Customer`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'QA Test Customer',
      mobile: '9900011223',
      address: 'QA Test Street',
    })
  }).then(r => r.json());

  // Create a bill with bill_date = 2026-09-22 (should lock rate A: ₹7200 for 24K)
  const histBill = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'manual',
      bill_date: '2026-09-22',
      gst_enabled: false,
      items: [{
        item_name: 'Historical Gold Coin',
        metal_type: 'gold',
        purity_display: '24K',
        quantity: 1,
        gross_weight: 2.0,
        net_weight: 2.0,
        stone_weight: 0,
        making_charge: 0,
        hallmarking_charge: 0,
        discount: 0,
      }],
      paid_amount: 14400, // 2g * 7200 = 14400
      payment_mode: 'cash',
      operation_id: `op-qa-hist-${Date.now()}`
    })
  }).then(r => r.json());

  if (!histBill.success) throw new Error('Historical bill failed: ' + JSON.stringify(histBill));
  console.log(`✓ Bill ${histBill.bill_number} finalized for date 2026-09-22 with total ₹${histBill.total_amount}`);

  // Verify bill snapshot
  const billDoc = await fetch(`${BASE_URL}/api/entities/Bill/${histBill.bill_id}`, { headers: adminHeaders }).then(r => r.json());
  const snap = JSON.parse(billDoc.rate_snapshot);
  if (Number(snap.gold_24k_rate) !== 7200) {
    throw new Error(`Bill rate snapshot expected 7200, got ${snap.gold_24k_rate}`);
  }
  console.log(`✓ Verified rate snapshot locked on bill: Gold 24K = ₹${snap.gold_24k_rate}/g, Effective: ${snap.effective_date}`);

  // Now change global rate to ₹8000 and verify historical bill is NOT changed
  await fetch(`${BASE_URL}/api/functions/changeRate`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      gold_24k_rate: 8000,
      silver_rate: 95,
      notes: 'Future Rate Change'
    })
  });

  const billDocAfterRateChange = await fetch(`${BASE_URL}/api/entities/Bill/${histBill.bill_id}`, { headers: adminHeaders }).then(r => r.json());
  if (Number(billDocAfterRateChange.total_amount) !== 14400) {
    throw new Error('Historical bill amount was modified after future rate change!');
  }
  console.log(`✓ Verified historical bill remains unchanged at ₹${billDocAfterRateChange.total_amount} after future global rate update\n`);

  // AREA 11 & 12: Gold Exchange / Gold Given Workflow & Fine Weight
  console.log('>>> AREA 11 & 12: Gold Exchange Workflow & Reconciliation');
  // Client requirement calculation: 3.880g @ 96.50% => Fine Weight = 3.744g (3.7442)
  const fineWeightClient = calcFineWeight(3.880, 96.50);
  if (Math.abs(fineWeightClient - 3.744) > 0.005) {
    throw new Error(`Fine weight calculation failed: expected 3.744, got ${fineWeightClient}`);
  }
  console.log(`✓ Fine Weight formula verified: 3.880g @ 96.50% = ${fineWeightClient}g`);

  // Create a bill with Gold Exchange:
  // Customer receives: 5g Jewellery @ ₹7000/g = ₹35,000
  // Customer gives: 3.880g Old Gold @ 96.50% (Fine 3.744g) @ ₹6800/g = ₹26,384
  // Net Due / Cash settled = 35,000 - 26,384 = ₹8,616
  const exchangeBill = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'manual',
      bill_date: '2026-09-28',
      gst_enabled: false,
      items: [{
        item_name: '22K Gold Pendant',
        metal_type: 'gold',
        purity_display: '22K',
        quantity: 1,
        gross_weight: 5.0,
        net_weight: 5.0,
        stone_weight: 0,
        rate_per_gram: 7000,
        making_charge: 0,
        hallmarking_charge: 0,
        discount: 0,
      }],
      gold_exchange: {
        item_type: 'Old Gold Scrap',
        metal: 'gold',
        purity: '23K',
        purity_value: 96.50,
        gross_weight: 3.880,
        less_weight: 0.000,
        net_weight: 3.880,
        fine_weight: fineWeightClient,
        rate_per_gram: 6800,
        gold_value: 26384,
        huid: 'HUID-EXC-001',
        barcode: 'BC-EXC-001',
        notes: 'Gold given in exchange test',
      },
      paid_amount: 35000, // Settled: Gold Given ₹26,384 + Cash ₹8,616
      payment_mode: 'old_gold_cash',
      payment_components: [
        { mode: 'gold_exchange', amount: 26384 },
        { mode: 'cash', amount: 8616 }
      ],
      operation_id: `op-exc-qa-${Date.now()}`
    })
  }).then(r => r.json());

  if (!exchangeBill.success) throw new Error('Gold Exchange bill failed: ' + JSON.stringify(exchangeBill));
  console.log(`✓ Gold Exchange bill ${exchangeBill.bill_number} created with dual valuation:`);
  console.log(`  - Customer Receives (Jewellery): ₹35,000`);
  console.log(`  - Customer Gives (Gold Value): ₹26,384`);
  console.log(`  - Cash Payment Settled: ₹8,616`);

  // Verify dedicated ExchangeTransaction record with CUSTOMER_GOLD_EXCHANGE (Area 13)
  const excTx = await fetch(`${BASE_URL}/api/entities/ExchangeTransaction?original_bill_id=${exchangeBill.bill_id}`, {
    headers: adminHeaders
  }).then(r => r.json());
  const excRecord = Array.isArray(excTx) ? excTx[0] : excTx;
  if (!excRecord || excRecord.transaction_type !== 'CUSTOMER_GOLD_EXCHANGE') {
    throw new Error('Exchange transaction was not created as dedicated CUSTOMER_GOLD_EXCHANGE');
  }
  console.log(`✓ Dedicated Exchange Transaction verified: Type="${excRecord.transaction_type}", Value=₹${excRecord.exchange_value}\n`);

  // AREA 6: Inventory Label & Search Verification
  console.log('>>> AREA 6: Inventory HUID & Item Code Separation');
  const invItemRes = await fetch(`${BASE_URL}/api/entities/InventoryItem`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      item_name: 'HUID Test Kada',
      item_code: 'CODE-KADA-77',
      huid: 'HUID-KADA-88',
      barcode: 'BAR-KADA-99',
      metal_type: 'gold',
      purity_display: '22K',
      quantity: 4,
      gross_weight: 40.0,
      net_weight: 40.0,
      fine_weight: 36.67,
    })
  }).then(r => r.json());
  const testInvId = invItemRes.id;

  // Verify search by HUID
  const huidSearch = await fetch(`${BASE_URL}/api/entities/InventoryItem?huid=HUID-KADA-88`, {
    headers: adminHeaders
  }).then(r => r.json());
  const foundHuid = Array.isArray(huidSearch) ? huidSearch[0] : huidSearch;
  if (!foundHuid || foundHuid.item_code !== 'CODE-KADA-77') {
    throw new Error('HUID lookup failed or item_code was merged with HUID');
  }
  console.log(`✓ Verified HUID and Item Code remain distinct: HUID="${foundHuid.huid}", Item Code="${foundHuid.item_code}"\n`);

  // AREA 7 & 14: Bill Deletion, Stock Reversal & Permission Enforcement
  console.log('>>> AREA 7 & 14: Bill Deletion & Role Enforcement');
  // 1. Finalize an inventory bill for 1 piece of HUID Test Kada
  const invSaleBill = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'inventory',
      bill_date: '2026-09-28',
      gst_enabled: false,
      items: [{
        inventory_id: testInvId,
        item_id: testInvId,
        item_name: 'HUID Test Kada',
        item_code: 'CODE-KADA-77',
        huid: 'HUID-KADA-88',
        metal_type: 'gold',
        purity_display: '22K',
        quantity: 1,
        gross_weight: 10.0,
        net_weight: 10.0,
        rate_per_gram: 7000,
        making_charge: 0,
        hallmarking_charge: 0,
        discount: 0,
      }],
      paid_amount: 50000, // ₹50k paid, ₹20k due
      payment_mode: 'cash',
      operation_id: `op-del-test-${Date.now()}`
    })
  }).then(r => r.json());

  if (!invSaleBill.success) throw new Error('Inventory sale failed: ' + JSON.stringify(invSaleBill));
  console.log(`✓ Finalized inventory bill ${invSaleBill.bill_number}: 1 piece sold (Stock reduced from 4 to 3)`);

  // Check inventory stock reduced to 3
  const invAfterSale = await fetch(`${BASE_URL}/api/entities/InventoryItem/${testInvId}`, { headers: adminHeaders }).then(r => r.json());
  if (Number(invAfterSale.quantity) !== 3) {
    throw new Error(`Inventory stock expected to be 3, got ${invAfterSale.quantity}`);
  }

  // 2. Test Staff / Cashier cannot delete bills
  // Create a staff user to test permission restriction
  const staffEmail = `staff_${Date.now()}@example.com`;
  await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: staffEmail,
      password: 'StaffPassword123!',
      full_name: 'Test Staff',
      role: 'user',
    })
  });
  const staffLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: staffEmail, password: 'StaffPassword123!' })
  }).then(r => r.json());

  const staffHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffLogin.token}` };
  const staffDeleteAttempt = await fetch(`${BASE_URL}/api/functions/deleteBill`, {
    method: 'POST',
    headers: staffHeaders,
    body: JSON.stringify({
      bill_id: invSaleBill.bill_id,
      reason: 'Unauthorized staff delete'
    })
  });
  if (staffDeleteAttempt.status === 200) {
    throw new Error('SECURITY BREACH: Unauthorized staff was able to call deleteBill!');
  }
  console.log(`✓ Backend permission check verified: Staff deletion rejected with HTTP ${staffDeleteAttempt.status}`);

  // 3. Admin deletes the bill
  const adminDeleteRes = await fetch(`${BASE_URL}/api/functions/deleteBill`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      bill_id: invSaleBill.bill_id,
      reason: 'Admin QA transactional reversal'
    })
  }).then(r => r.json());

  if (!adminDeleteRes.success) throw new Error('deleteBill failed for admin: ' + JSON.stringify(adminDeleteRes));
  console.log(`✓ Admin successfully deleted bill ${invSaleBill.bill_number}`);

  // Check inventory stock restored back to 4
  const invAfterReversal = await fetch(`${BASE_URL}/api/entities/InventoryItem/${testInvId}`, { headers: adminHeaders }).then(r => r.json());
  if (Number(invAfterReversal.quantity) !== 4) {
    throw new Error(`Inventory stock expected to be restored to 4, got ${invAfterReversal.quantity}`);
  }
  console.log(`✓ Stock reversal confirmed: Inventory restored back to ${invAfterReversal.quantity} pcs (net weight: ${invAfterReversal.net_weight}g)`);

  // Check bill is marked deleted
  const deletedBillCheck = await fetch(`${BASE_URL}/api/entities/Bill/${invSaleBill.bill_id}`, { headers: adminHeaders }).then(r => r.json());
  if (!deletedBillCheck.is_deleted) {
    throw new Error('Bill is_deleted flag was not set');
  }
  console.log('✓ Bill is_deleted flag verified (hidden from Bill History)\n');

  // AREA 8, 9 & 10: Dashboard, Drill-Down & Grams Sold
  console.log('>>> AREA 8, 9 & 10: Dashboard Intelligence, Grams Sold & Drill-Down');
  const dashStats = await fetch(`${BASE_URL}/api/functions/getDashboardStats`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({})
  }).then(r => r.json());

  if (dashStats.goldSold === undefined || dashStats.silverSold === undefined) {
    throw new Error('Dashboard stats missing goldSold/silverSold metrics');
  }
  console.log('✓ Dashboard Metrics verified:');
  console.log(`  - Gold Sold: Today=${dashStats.goldSold.today}g, Week=${dashStats.goldSold.weekly}g, Month=${dashStats.goldSold.monthly}g`);
  console.log(`  - Silver Sold: Today=${dashStats.silverSold.today}g, Week=${dashStats.silverSold.weekly}g, Month=${dashStats.silverSold.monthly}g`);

  // Test Drill-down API for Today Sales
  const drillToday = await fetch(`${BASE_URL}/api/functions/getDashboardDrillDown`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ metric: 'today_sales' })
  }).then(r => r.json());
  if (!drillToday.success || !drillToday.summary || !Array.isArray(drillToday.bills)) {
    throw new Error('Drill-down API failed: ' + JSON.stringify(drillToday));
  }
  console.log(`✓ Drill-Down for Today's Sales verified:`);
  console.log(`  - Invoices: ${drillToday.summary.billCount}`);
  console.log(`  - Total Revenue: ₹${drillToday.summary.totalSales}`);
  console.log(`  - Gold Net Weight: ${drillToday.summary.goldGrams}g`);
  console.log(`  - Cash Collected: ₹${drillToday.summary.cashCollected}`);
  console.log(`  - Gold Settlement Value: ₹${drillToday.summary.goldExchangeValue}`);

  // Test Drill-down API for Gold Sold
  const drillGold = await fetch(`${BASE_URL}/api/functions/getDashboardDrillDown`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ metric: 'gold_sold', range: 'daily' })
  }).then(r => r.json());
  if (!drillGold.success) throw new Error('Gold sold drill-down failed');
  console.log(`✓ Drill-Down for Gold Sold (daily) verified: ${drillGold.summary.goldGrams}g across ${drillGold.bills.length} bills\n`);

  console.log('===============================================================');
  console.log('🎉 ALL BACKEND BUSINESS LOGIC & QA CHECKS PASSED (100% SUCCESS)');
  console.log('===============================================================');
}

runE2E().catch((err) => {
  console.error('\n❌ QA Test Failure:', err);
  process.exit(1);
});
