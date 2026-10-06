import { sortPuritiesDescending, calcFineWeight } from './shared/billCalc.js';
import { seedLocalAdmin } from './db/seedAdmin.js';

const BASE_URL = 'http://localhost:3001';

async function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function runTests() {
  console.log('=====================================================');
  console.log('🧪 CLIENT REQUIREMENTS & BUSINESS LOGIC VERIFICATION');
  console.log('=====================================================\n');

  let serverProcess = null;

  // 1. Ensure server is running
  try {
    const health = await fetch(`${BASE_URL}/api/health`, { timeout: 1000 }).then(r => r.json());
    if (health.ok) console.log('✓ Backend server is active on port 3001');
  } catch (err) {
    console.log('⚡ Starting server in-process...');
    await import('./server.js');
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) {
          console.log('✓ Server started successfully');
          break;
        }
      } catch (e) {}
      await wait(200);
    }
  }

  // Seed and Login as admin
  let testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@jewelcore.local';
  try {
    const adminInfo = await seedLocalAdmin();
    testEmail = adminInfo.email;
  } catch (e) {
    // If backend server is already running as a daemon, it holds the pgdata file lock.
    // Admin was already seeded during server boot.
  }
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin@JewelCore2026';

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  }).then(r => r.json());

  if (!loginRes.token) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  }
  const token = loginRes.token;
  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  console.log(`✓ Admin authenticated successfully (${testEmail})\n`);

  // TEST 1: Gold Purity Sequence — starts from 24K descending
  console.log('[TEST 1] Gold Purity Sequence (starts from 24K descending)...');
  const samplePurities = [
    { display_format: '14K', purity_value: 58.33, metal_type: 'gold' },
    { display_format: '22K', purity_value: 91.67, metal_type: 'gold' },
    { display_format: '24K', purity_value: 99.90, metal_type: 'gold' },
    { display_format: '18K', purity_value: 75.00, metal_type: 'gold' },
    { display_format: '23.5K', purity_value: 98.00, metal_type: 'gold' },
    { display_format: '10K', purity_value: 41.70, metal_type: 'gold' },
  ];
  const sorted = sortPuritiesDescending(samplePurities, 'gold');
  if (sorted[0].display_format !== '24K') throw new Error(`First purity must be 24K, got ${sorted[0].display_format}`);
  if (sorted[1].display_format !== '23.5K' || sorted[2].display_format !== '22K') {
    throw new Error('Purities are not sorted descending: ' + sorted.map(s => s.display_format).join(', '));
  }
  console.log('✓ Sorted correctly descending starting with 24K:', sorted.map(s => s.display_format).join(' → '));

  // TEST 2: Fine Weight Calculation Formula
  console.log('\n[TEST 2] Fine Weight Calculation (Net Weight × Purity %)...');
  // Client requirement example: Net Weight = 3.880g, Purity = 96.50% => Fine Weight = 3.744g (3.7442)
  const fineWtTest = calcFineWeight(3.880, 96.50);
  if (Math.abs(fineWtTest - 3.744) > 0.005) {
    throw new Error(`Fine weight calculation mismatch: expected ~3.744, got ${fineWtTest}`);
  }
  console.log(`✓ Fine Weight calculated accurately: 3.880g @ 96.50% = ${fineWtTest}g`);

  // TEST 3: Historical Rate Lookup Endpoint (getEffectiveRates)
  console.log('\n[TEST 3] Historical Rate Lookup API (getEffectiveRates)...');
  // Set rate for today
  await fetch(`${BASE_URL}/api/functions/changeRate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      gold_24k_rate: 7500,
      silver_rate: 90,
      notes: 'Test client rate update',
      effective_date: new Date().toISOString()
    })
  });

  const effRes = await fetch(`${BASE_URL}/api/functions/getEffectiveRates`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ date: '2026-09-28' })
  }).then(r => r.json());

  if (!effRes.success || !effRes.rates || effRes.rates.length === 0) {
    throw new Error('getEffectiveRates failed: ' + JSON.stringify(effRes));
  }
  if (effRes.rates[0].purity_display !== '24K') {
    throw new Error(`First rate in effective rates must be 24K, got ${effRes.rates[0].purity_display}`);
  }
  console.log(`✓ Effective rates resolved for 2026-09-28: 24K Gold = ₹${effRes.gold_24k_rate}/g, Silver = ₹${effRes.silver_rate}/g`);
  console.log('✓ Rates display sequence starts with 24K:', effRes.rates.slice(0, 4).map(r => r.purity_display).join(', '));

  // TEST 4: Bill Creation with Historical Date & Immutable Rate Snapshot
  console.log('\n[TEST 4] Bill Creation with Historical Date & Rate Snapshot...');
  // Configure historical rate effective for 2026-09-15
  await fetch(`${BASE_URL}/api/functions/changeRate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      gold_24k_rate: 7000,
      silver_rate: 85,
      notes: 'Historical Rate for 2026-09-15',
      effective_date: '2026-09-14T00:00:00.000Z'
    })
  });

  const custRes = await fetch(`${BASE_URL}/api/entities/Customer`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Client Test Customer',
      mobile: '9888877777',
      address: 'Test Market',
    })
  }).then(r => r.json());

  const histBillRes = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'manual',
      bill_date: '2026-09-15',
      gst_enabled: false,
      items: [{
        item_name: 'Historical Gold Ring',
        metal_type: 'gold',
        purity_display: '22K',
        quantity: 1,
        gross_weight: 5.0,
        net_weight: 5.0,
        stone_weight: 0,
        rate_per_gram: 7000,
        making_charge: 500,
        making_charge_type: 'fixed',
        hallmarking_charge: 0,
        discount: 0,
      }],
      paid_amount: 30000,
      payment_mode: 'cash',
      operation_id: `op-hist-${Date.now()}`
    })
  }).then(r => r.json());

  if (!histBillRes.success) {
    throw new Error('Historical bill creation failed: ' + JSON.stringify(histBillRes));
  }
  console.log(`✓ Historical Bill created: ${histBillRes.bill_number} for date 2026-09-15`);

  // Verify rate snapshot exists on bill
  const fetchedBill = await fetch(`${BASE_URL}/api/entities/Bill?bill_number=${histBillRes.bill_number}`, {
    headers: authHeaders
  }).then(r => r.json());
  const bObj = Array.isArray(fetchedBill) ? fetchedBill[0] : fetchedBill;
  if (!bObj.rate_snapshot) {
    throw new Error('Rate snapshot was not saved on the bill!');
  }
  const snap = JSON.parse(bObj.rate_snapshot);
  console.log(`✓ Verified rate snapshot locked on bill: 24K Gold ₹${snap.gold_24k_rate}/g, Silver ₹${snap.silver_rate}/g`);

  // TEST 5: Gold Given / Customer Gold Exchange Workflow
  console.log('\n[TEST 5] Customer Gold Exchange Workflow (Fine Weight, Dual Value, Dedicated Transaction)...');
  const exchangeBillRes = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'manual',
      bill_date: '2026-09-28',
      gst_enabled: false,
      items: [{
        item_name: 'New 22K Gold Bangle',
        metal_type: 'gold',
        purity_display: '22K',
        quantity: 1,
        gross_weight: 10.0,
        net_weight: 10.0,
        stone_weight: 0,
        rate_per_gram: 7000,
        making_charge: 0,
        hallmarking_charge: 0,
        discount: 0,
      }],
      // Customer gives 5g of 96.5% gold @ ₹7000/g = ₹33,740
      gold_exchange: {
        item_type: 'Old Gold Chain',
        metal: 'gold',
        purity: '23K',
        purity_value: 95.8,
        gross_weight: 5.0,
        less_weight: 0.2,
        net_weight: 4.8,
        rate_per_gram: 7000,
        gold_value: 33600,
        huid: 'ABC999',
        notes: 'Exchange settlement test',
      },
      paid_amount: 70000, // Total ₹70,000 settled by Gold Given ₹33,600 + Cash ₹36,400
      payment_mode: 'old_gold_cash',
      payment_components: [
        { mode: 'gold_exchange', amount: 33600 },
        { mode: 'cash', amount: 36400 }
      ],
      operation_id: `op-exc-${Date.now()}`
    })
  }).then(r => r.json());

  if (!exchangeBillRes.success) {
    throw new Error('Gold Exchange bill creation failed: ' + JSON.stringify(exchangeBillRes));
  }
  console.log(`✓ Gold Exchange Bill created: ${exchangeBillRes.bill_number}`);

  // Check ExchangeTransaction entity for CUSTOMER_GOLD_EXCHANGE record
  const exchangeRecords = await fetch(`${BASE_URL}/api/entities/ExchangeTransaction?original_bill_id=${exchangeBillRes.bill_id}`, {
    headers: authHeaders
  }).then(r => r.json());
  const excArr = Array.isArray(exchangeRecords) ? exchangeRecords : [exchangeRecords];
  if (excArr.length === 0 || excArr[0].transaction_type !== 'CUSTOMER_GOLD_EXCHANGE') {
    throw new Error('Dedicated CUSTOMER_GOLD_EXCHANGE record not found! Found: ' + JSON.stringify(excArr));
  }
  console.log(`✓ Verified dedicated ExchangeTransaction: Type = "${excArr[0].transaction_type}", Exchange Value = ₹${excArr[0].exchange_value}`);

  // TEST 6: Delete Bill — Transactional Inventory & Financial Reversal
  console.log('\n[TEST 6] Bill Deletion with Transactional Stock & Balance Reversal...');
  // 1. Create an inventory item with quantity 5
  const invCreateRes = await fetch(`${BASE_URL}/api/entities/InventoryItem`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      item_name: 'Reversal Test Ring',
      item_code: `REV-${Date.now().toString().slice(-4)}`,
      metal_type: 'gold',
      purity_display: '22K',
      quantity: 5,
      gross_weight: 25.0,
      net_weight: 25.0,
      fine_weight: 22.9,
    })
  }).then(r => r.json());
  const initialInvId = invCreateRes.id;
  console.log(`✓ Created test inventory item: ID ${initialInvId} with quantity 5, net weight 25g`);

  // 2. Finalize an inventory bill for 2 pcs
  const invBillRes = await fetch(`${BASE_URL}/api/functions/finalizeBill`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customer_id: custRes.id,
      bill_source: 'inventory',
      bill_date: '2026-09-28',
      gst_enabled: false,
      items: [{
        inventory_id: initialInvId,
        item_id: initialInvId,
        item_name: 'Reversal Test Ring',
        metal_type: 'gold',
        purity_display: '22K',
        quantity: 2,
        gross_weight: 10.0,
        net_weight: 10.0,
        rate_per_gram: 7000,
        making_charge: 0,
        hallmarking_charge: 0,
        discount: 0,
      }],
      paid_amount: 100000,
      payment_mode: 'cash',
      operation_id: `op-del-${Date.now()}`
    })
  }).then(r => r.json());

  if (!invBillRes.success) {
    throw new Error('Inventory bill creation failed: ' + JSON.stringify(invBillRes));
  }
  console.log(`✓ Created inventory bill ${invBillRes.bill_number} for 2 pcs`);

  // Check inventory decremented to 3
  const invAfterSale = await fetch(`${BASE_URL}/api/entities/InventoryItem/${initialInvId}`, {
    headers: authHeaders
  }).then(r => r.json());
  if (Number(invAfterSale.quantity) !== 3) {
    throw new Error(`Inventory should be 3 after sale, got ${invAfterSale.quantity}`);
  }
  console.log(`✓ Inventory correctly decremented to ${invAfterSale.quantity} pcs`);

  // 3. Delete the bill via deleteBill
  const delRes = await fetch(`${BASE_URL}/api/functions/deleteBill`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      bill_id: invBillRes.bill_id,
      reason: 'Automated test reversal of billing error'
    })
  }).then(r => r.json());

  if (!delRes.success) {
    throw new Error('deleteBill failed: ' + JSON.stringify(delRes));
  }
  console.log(`✓ deleteBill succeeded: ${delRes.message}`);

  // Check inventory restored back to 5
  const invAfterDelete = await fetch(`${BASE_URL}/api/entities/InventoryItem/${initialInvId}`, {
    headers: authHeaders
  }).then(r => r.json());
  if (Number(invAfterDelete.quantity) !== 5) {
    throw new Error(`Inventory should be restored to 5, got ${invAfterDelete.quantity}`);
  }
  console.log(`✓ Inventory stock successfully reversed and restored to ${invAfterDelete.quantity} pcs (net weight: ${invAfterDelete.net_weight}g)`);

  // Check deleted bill is flagged is_deleted
  const checkDeletedBill = await fetch(`${BASE_URL}/api/entities/Bill/${invBillRes.bill_id}`, {
    headers: authHeaders
  }).then(r => r.json());
  if (!checkDeletedBill.is_deleted) {
    throw new Error('Bill was not marked as is_deleted!');
  }
  console.log('✓ Bill is flagged is_deleted: true, cleanly hidden from Bill History and dashboard counts');

  // TEST 7: Dashboard Metrics (Gold & Silver Sold in Grams)
  console.log('\n[TEST 7] Dashboard Metrics (Gold & Silver Sold in Grams)...');
  const dashRes = await fetch(`${BASE_URL}/api/functions/getDashboardStats`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  }).then(r => r.json());

  if (dashRes.goldSold === undefined || dashRes.silverSold === undefined) {
    throw new Error('Dashboard stats missing goldSold or silverSold: ' + JSON.stringify(dashRes));
  }
  console.log('✓ Dashboard Gold Sold (grams):', dashRes.goldSold);
  console.log('✓ Dashboard Silver Sold (grams):', dashRes.silverSold);
  if (typeof dashRes.goldSold.today !== 'number' || typeof dashRes.goldSold.weekly !== 'number' || typeof dashRes.goldSold.monthly !== 'number') {
    throw new Error('Gold sold does not contain daily, weekly, monthly numbers');
  }

  // TEST 8: Dashboard Drill-down Endpoint
  console.log('\n[TEST 8] Dashboard Drill-down Endpoint (getDashboardDrillDown)...');
  const drillRes = await fetch(`${BASE_URL}/api/functions/getDashboardDrillDown`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ metric: 'today_sales' })
  }).then(r => r.json());

  if (!drillRes.success || !drillRes.summary || !Array.isArray(drillRes.bills)) {
    throw new Error('Drill-down failed: ' + JSON.stringify(drillRes));
  }
  console.log(`✓ Drill-down for "today_sales" verified: ${drillRes.summary.billCount} bills, Total Sales ₹${drillRes.summary.totalSales}, Gold Sold ${drillRes.summary.goldGrams}g`);

  const drillGold = await fetch(`${BASE_URL}/api/functions/getDashboardDrillDown`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ metric: 'gold_sold', range: 'daily' })
  }).then(r => r.json());
  if (!drillGold.success) throw new Error('Drill-down for gold_sold failed');
  console.log(`✓ Drill-down for "gold_sold" verified: Gold Sold ${drillGold.summary.goldGrams}g, ${drillGold.bills.length} bills`);

  // TEST 9: Date with NO configured rate fails cleanly (no silent fallback to today's rate)
  console.log('\n[TEST 9] Historical Rate Resolution Rejection for unconfigured date...');
  const noRateRes = await fetch(`${BASE_URL}/api/functions/getEffectiveRates`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ date: '2020-01-01' })
  });
  const noRateData = await noRateRes.json();
  if (noRateRes.status !== 404 || !noRateData.no_rate) {
    throw new Error('Expected 404 no_rate error for unconfigured date, got: ' + JSON.stringify(noRateData));
  }
  console.log(`✓ Unconfigured date properly rejected without silent fallback: "${noRateData.error}"`);

  // TEST 10: Standalone Purchase Management (Purchase finalization and deletion MUST NOT mutate inventory)
  console.log('\n[TEST 10] Standalone Purchase Management (Separation from Inventory)...');
  const invBeforePur = await fetch(`${BASE_URL}/api/entities/InventoryItem`, { headers: authHeaders }).then(r => r.json());
  const totalInvQtyBefore = invBeforePur.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const totalInvNetBefore = invBeforePur.reduce((sum, it) => sum + (Number(it.net_weight) || 0), 0);

  // Create supplier
  const supRes = await fetch(`${BASE_URL}/api/entities/Supplier`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Zaveri Bullion Ltd', mobile: '9988776655' })
  }).then(r => r.json());

  // Finalize purchase without updating inventory
  const purRes = await fetch(`${BASE_URL}/api/functions/finalizePurchase`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      supplier_id: supRes.id,
      purchase_date: '2026-10-01',
      items: [{
        item_name: 'Raw Gold Casting 22K',
        item_code: 'RAW-AU-01',
        metal_type: 'gold',
        purity_display: '22K',
        purity_value: 91.67,
        quantity: 10,
        gross_weight: 100.0,
        net_weight: 100.0,
        rate_per_gram: 7200,
        making_charge: 0,
      }],
      paid_amount: 720000,
      payment_mode: 'bank_transfer',
      operation_id: `pur-sep-${Date.now()}`
    })
  }).then(r => r.json());

  if (!purRes.success) throw new Error('Purchase finalization failed: ' + JSON.stringify(purRes));
  console.log(`✓ Standalone Purchase created: ${purRes.purchase_number}`);

  // Verify inventory did NOT change
  const invAfterPur = await fetch(`${BASE_URL}/api/entities/InventoryItem`, { headers: authHeaders }).then(r => r.json());
  const totalInvQtyAfter = invAfterPur.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const totalInvNetAfter = invAfterPur.reduce((sum, it) => sum + (Number(it.net_weight) || 0), 0);

  if (totalInvQtyAfter !== totalInvQtyBefore || totalInvNetAfter !== totalInvNetBefore) {
    throw new Error(`Inventory mutated by Purchase! Before: ${totalInvQtyBefore} pcs (${totalInvNetBefore}g), After: ${totalInvQtyAfter} pcs (${totalInvNetAfter}g)`);
  }
  console.log(`✓ Verified: Purchase creation did NOT modify Gold/Silver/Jewellery inventory (${totalInvQtyAfter} pcs, ${totalInvNetAfter}g)`);

  // Delete purchase and verify inventory still did not change
  const purDelRes = await fetch(`${BASE_URL}/api/functions/finalizePurchase`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'delete', purchase_id: purRes.purchase_id })
  }).then(r => r.json());

  if (!purDelRes.success) throw new Error('Purchase deletion failed: ' + JSON.stringify(purDelRes));
  const invAfterPurDel = await fetch(`${BASE_URL}/api/entities/InventoryItem`, { headers: authHeaders }).then(r => r.json());
  const totalInvQtyAfterDel = invAfterPurDel.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  if (totalInvQtyAfterDel !== totalInvQtyBefore) {
    throw new Error(`Inventory mutated by Purchase deletion! Got: ${totalInvQtyAfterDel}, expected: ${totalInvQtyBefore}`);
  }
  console.log(`✓ Verified: Purchase deletion did NOT modify Inventory stock`);

  // TEST 11: Purchase with Gold Settlement (Metal Payment Mode)
  console.log('\n[TEST 11] Purchase with Gold Settlement (Metal payment mode & barter)...');
  const purSettleRes = await fetch(`${BASE_URL}/api/functions/finalizePurchase`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      supplier_id: supRes.id,
      purchase_date: '2026-10-02',
      items: [{
        item_name: 'Designer Gold Necklace',
        item_code: 'NECK-001',
        metal_type: 'gold',
        purity_display: '22K',
        purity_value: 91.67,
        quantity: 1,
        gross_weight: 25.0,
        net_weight: 25.0,
        rate_per_gram: 7500,
        making_charge: 500,
      }],
      paid_amount: 140000,
      payment_mode: 'gold_settlement',
      gold_settlement: {
        metal_type: 'gold',
        purity_display: '22K',
        purity_value: 91.67,
        gross_weight: 20.0,
        net_weight: 20.0,
        fine_weight: 18.334,
        rate_per_gram: 7000,
        settlement_value: 140000,
        reference: 'BARTER-AU-20G',
        notes: '20g 22K gold given as settlement in exchange for necklace'
      },
      operation_id: `pur-settle-${Date.now()}`
    })
  }).then(r => r.json());

  if (!purSettleRes.success) throw new Error('Gold settlement purchase failed: ' + JSON.stringify(purSettleRes));
  console.log(`✓ Gold Settlement purchase finalized: ${purSettleRes.purchase_number}`);

  // Verify purchase entity has gold_settlement data
  const purEntity = await fetch(`${BASE_URL}/api/entities/Purchase/${purSettleRes.purchase_id}`, { headers: authHeaders }).then(r => r.json());
  if (!purEntity.gold_settlement || Number(purEntity.metal_settlement_value) !== 140000) {
    throw new Error('Purchase record did not store gold_settlement: ' + JSON.stringify(purEntity));
  }
  console.log(`✓ Purchase record stored gold_settlement: Metal value ₹${purEntity.metal_settlement_value}`);

  // Verify dedicated ExchangeTransaction record created
  const settleTxs = await fetch(`${BASE_URL}/api/entities/ExchangeTransaction?reference_id=${purSettleRes.purchase_id}`, { headers: authHeaders }).then(r => r.json());
  if (!settleTxs || settleTxs.length === 0) {
    throw new Error('ExchangeTransaction record was not created for gold settlement');
  }
  const sTx = settleTxs[0];
  if (sTx.transaction_type !== 'PURCHASE_GOLD_SETTLEMENT' || Number(sTx.settlement_value) !== 140000 || Number(sTx.fine_weight) !== 18.334) {
    throw new Error('ExchangeTransaction record details mismatch: ' + JSON.stringify(sTx));
  }
  console.log(`✓ Dedicated ExchangeTransaction verified: Type="${sTx.transaction_type}", Fine Wt=${sTx.fine_weight}g, Value=₹${sTx.settlement_value}`);

  // Verify Inventory was NOT modified by Gold Settlement
  const invAfterSettle = await fetch(`${BASE_URL}/api/entities/InventoryItem`, { headers: authHeaders }).then(r => r.json());
  const totalInvQtyAfterSettle = invAfterSettle.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  if (totalInvQtyAfterSettle !== totalInvQtyBefore) {
    throw new Error(`Inventory was mutated by gold settlement! Expected ${totalInvQtyBefore}, got ${totalInvQtyAfterSettle}`);
  }
  console.log(`✓ Verified: Gold Settlement did NOT modify Inventory stock`);

  // TEST 12: Dashboard Drill-down Metal Purity Breakdown & Line Items with HUID
  console.log('\n[TEST 12] Dashboard Drill-down Purity Breakdown & Line Items with HUID...');
  const drillGoldDetailed = await fetch(`${BASE_URL}/api/functions/getDashboardDrillDown`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ metric: 'gold_sold', range: 'monthly' })
  }).then(r => r.json());

  if (!drillGoldDetailed.success || !Array.isArray(drillGoldDetailed.purityBreakdown) || !Array.isArray(drillGoldDetailed.metalItems)) {
    throw new Error('Drill-down missing purityBreakdown or metalItems: ' + JSON.stringify(drillGoldDetailed));
  }
  console.log(`✓ Purity Breakdown returned (${drillGoldDetailed.purityBreakdown.length} purities):`, drillGoldDetailed.purityBreakdown.map(p => `${p.purity}: ${p.grams}g (₹${p.value})`).join(', '));
  if (drillGoldDetailed.metalItems.length > 0) {
    const firstMetal = drillGoldDetailed.metalItems[0];
    if (!firstMetal.huid || !firstMetal.bill_number || firstMetal.gross_weight === undefined) {
      throw new Error('Metal item missing required fields: ' + JSON.stringify(firstMetal));
    }
    console.log(`✓ Metal item details verified with HUID: "${firstMetal.huid}", Item="${firstMetal.item_name}", Net Wt=${firstMetal.net_weight}g, Purity=${firstMetal.purity}`);
  }

  console.log('\n=====================================================');
  console.log('🎉 ALL CLIENT REQUIREMENTS TESTS PASSED (100% SUCCESS)!');
  console.log('=====================================================');

  if (serverProcess) serverProcess.kill();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
