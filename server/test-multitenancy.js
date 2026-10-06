import http from 'node:http';

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.TEST_BASE_URL || `http://127.0.0.1:${PORT}`;

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
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

async function api(path, { method = 'GET', body, token, tenantId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
    headers['x-shop-id'] = tenantId;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = { raw: res.statusText };
  }

  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('🏢 JEWELCORE ERP MULTI-TENANT ISOLATION & SECURITY TEST SUITE');
  console.log('===============================================================');

  await ensureServerRunning();

  const timestamp = Date.now();

  // 1. Setup User Accounts
  console.log('\n[STEP 1] Creating Test User Accounts for Tenant A & Tenant B...');
  
  // Admin A & Staff A
  const adminAEmail = `admin_a_${timestamp}@jeweltest.com`;
  const regAdminA = await api('/api/auth/register', {
    method: 'POST',
    body: { email: adminAEmail, password: 'Password123!', full_name: 'Admin Tenant A', role: 'user' }
  });
  const tokenAdminA = regAdminA.data.token;
  const userAdminA = regAdminA.data.user;

  const staffAEmail = `staff_a_${timestamp}@jeweltest.com`;
  const regStaffA = await api('/api/auth/register', {
    method: 'POST',
    body: { email: staffAEmail, password: 'Password123!', full_name: 'Staff Tenant A', role: 'user' }
  });
  const tokenStaffA = regStaffA.data.token;
  const userStaffA = regStaffA.data.user;

  // Admin B & Staff B
  const adminBEmail = `admin_b_${timestamp}@jeweltest.com`;
  const regAdminB = await api('/api/auth/register', {
    method: 'POST',
    body: { email: adminBEmail, password: 'Password123!', full_name: 'Admin Tenant B', role: 'user' }
  });
  const tokenAdminB = regAdminB.data.token;
  const userAdminB = regAdminB.data.user;

  const staffBEmail = `staff_b_${timestamp}@jeweltest.com`;
  const regStaffB = await api('/api/auth/register', {
    method: 'POST',
    body: { email: staffBEmail, password: 'Password123!', full_name: 'Staff Tenant B', role: 'user' }
  });
  const tokenStaffB = regStaffB.data.token;
  const userStaffB = regStaffB.data.user;

  console.log('✓ Created 4 test users: Admin A, Staff A, Admin B, Staff B');

  // 2. Onboard Tenant A and Tenant B
  console.log('\n[STEP 2] Onboarding Two Isolated Jewellery Shops...');
  
  // Onboard Shop A
  const onboardA = await api('/api/functions/onboardShop', {
    method: 'POST',
    token: tokenAdminA,
    body: {
      shop_name: 'Shree Ganesh Jewellers (Tenant A)',
      owner_name: 'Ganesh Patel',
      city: 'Ahmedabad',
      state: 'Gujarat',
      currency: '₹'
    }
  });
  if (!onboardA.ok || !onboardA.data.shop_id) throw new Error(`Onboard Shop A failed: ${JSON.stringify(onboardA.data)}`);
  const tenantAId = onboardA.data.shop_id;
  console.log(`✓ Tenant A Onboarded: "${onboardA.data.shop_name}" (ID: ${tenantAId})`);

  // Add Staff A to Shop A
  await api('/api/entities/ShopMembership', {
    method: 'POST',
    token: tokenAdminA,
    body: {
      user_id: userStaffA.id,
      user_email: staffAEmail,
      user_name: 'Staff Tenant A',
      tenant_id: tenantAId,
      shop_id: tenantAId,
      shop_name: 'Shree Ganesh Jewellers (Tenant A)',
      role: 'staff',
      is_active: true,
      status: 'active'
    }
  });

  // Onboard Shop B
  const onboardB = await api('/api/functions/onboardShop', {
    method: 'POST',
    token: tokenAdminB,
    body: {
      shop_name: 'Kalyan Jewellers (Tenant B)',
      owner_name: 'Kalyan Varma',
      city: 'Mumbai',
      state: 'Maharashtra',
      currency: '₹'
    }
  });
  if (!onboardB.ok || !onboardB.data.shop_id) throw new Error(`Onboard Shop B failed: ${JSON.stringify(onboardB.data)}`);
  const tenantBId = onboardB.data.shop_id;
  console.log(`✓ Tenant B Onboarded: "${onboardB.data.shop_name}" (ID: ${tenantBId})`);

  // Add Staff B to Shop B
  await api('/api/entities/ShopMembership', {
    method: 'POST',
    token: tokenAdminB,
    body: {
      user_id: userStaffB.id,
      user_email: staffBEmail,
      user_name: 'Staff Tenant B',
      tenant_id: tenantBId,
      shop_id: tenantBId,
      shop_name: 'Kalyan Jewellers (Tenant B)',
      role: 'staff',
      is_active: true,
      status: 'active'
    }
  });

  // 3. Seed Business Records in Tenant A
  console.log('\n[STEP 3] Seeding Business Data for Tenant A...');
  const custA = await api('/api/entities/Customer', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { name: 'Customer A (Ganesh Regular)', mobile: '9820000001', city: 'Ahmedabad' }
  });
  const customerAId = custA.data.id;

  const itemA = await api('/api/entities/InventoryItem', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { name: 'Gold Necklace 22K', barcode: `BAR-A-${timestamp}`, gross_weight: 15.5, stock_quantity: 3, status: 'in_stock' }
  });
  const itemAId = itemA.data.id;

  const billA = await api('/api/functions/finalizeBill', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: {
      customer_id: customerAId,
      customer_name: 'Customer A (Ganesh Regular)',
      bill_source: 'inventory',
      items: [{
        inventory_id: itemAId,
        item_id: itemAId,
        item_name: 'Gold Necklace 22K',
        description: 'Gold Necklace 22K',
        metal_type: 'gold',
        purity_display: '22K',
        purity_value: 91.6,
        gross_weight: 15.5,
        net_weight: 15.5,
        rate_per_gram: 7000,
        making_rate: 200,
        making_type: 'per_gram',
        quantity: 1
      }],
      payments: [],
      paid_amount: 0
    }
  });
  const billAId = billA.data.bill_id || billA.data.bill?.id;
  if (!billAId) throw new Error(`Failed to finalize Bill A: ${JSON.stringify(billA.data)}`);
  console.log(`✓ Tenant A created: Customer (${customerAId}), Item (${itemAId}), Bill (${billA.data.bill_number || billAId})`);

  // 4. Seed Business Records in Tenant B
  console.log('\n[STEP 4] Seeding Business Data for Tenant B...');
  const custB = await api('/api/entities/Customer', {
    method: 'POST',
    token: tokenAdminB,
    tenantId: tenantBId,
    body: { name: 'Customer B (Kalyan VIP)', mobile: '9820000002', city: 'Mumbai' }
  });
  const customerBId = custB.data.id;

  const itemB = await api('/api/entities/InventoryItem', {
    method: 'POST',
    token: tokenAdminB,
    tenantId: tenantBId,
    body: { name: 'Silver Bangles 999', barcode: `BAR-B-${timestamp}`, gross_weight: 50.0, stock_quantity: 10, status: 'in_stock' }
  });
  const itemBId = itemB.data.id;

  const billB = await api('/api/functions/finalizeBill', {
    method: 'POST',
    token: tokenAdminB,
    tenantId: tenantBId,
    body: {
      bill_date: new Date().toISOString(),
      customer_id: customerBId,
      customer_name: 'Customer B (Kalyan VIP)',
      bill_source: 'inventory',
      items: [{
        inventory_id: itemBId,
        item_id: itemBId,
        item_name: 'Silver Bangles 999',
        description: 'Silver Bangles 999',
        metal_type: 'silver',
        purity_display: '999',
        purity_value: 99.9,
        gross_weight: 50.0,
        net_weight: 50.0,
        rate_per_gram: 85,
        making_rate: 50,
        making_type: 'per_gram',
        quantity: 2
      }],
      payments: [],
      paid_amount: 0
    }
  });
  const billBId = billB.data.bill_id || billB.data.bill?.id;
  if (!billBId) throw new Error(`Failed to finalize Bill B: ${JSON.stringify(billB.data)}`);
  console.log(`✓ Tenant B created: Customer (${customerBId}), Item (${itemBId}), Bill (${billB.data.bill_number || billBId})`);

  // ===============================================================
  // MULTI-TENANT ISOLATION SECURITY CHECKS
  // ===============================================================

  console.log('\n[CHECK 1] Verifying Customer Isolation: Tenant A cannot read Tenant B Customer...');
  // Direct GET by ID
  const directGetB = await api(`/api/entities/Customer/${customerBId}`, {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  if (directGetB.status !== 404) {
    throw new Error(`SECURITY VIOLATION: Tenant A accessed Customer B directly! Status: ${directGetB.status}`);
  }
  // List/filter check
  const listCustA = await api('/api/entities/Customer', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const foundCustBInA = listCustA.data.some(c => c.id === customerBId || c.mobile === '9820000002');
  if (foundCustBInA) {
    throw new Error('SECURITY VIOLATION: Customer B appeared in Tenant A customer list!');
  }
  console.log('✓ PASS: Customer B is invisible to Tenant A (404 on direct ID lookup & excluded from lists).');

  console.log('\n[CHECK 2] Verifying Mutation Isolation: Tenant A cannot modify Tenant B Customer (IDOR Protection)...');
  const modAttempt = await api(`/api/entities/Customer/${customerBId}`, {
    method: 'PUT',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { name: 'HACKED CUSTOMER B' }
  });
  if (modAttempt.ok) {
    throw new Error('SECURITY VIOLATION: Tenant A successfully modified Tenant B Customer!');
  }
  // Verify Customer B remains unaltered
  const verifyCustB = await api(`/api/entities/Customer/${customerBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyCustB.ok || verifyCustB.data.name === 'HACKED CUSTOMER B') {
    throw new Error('SECURITY VIOLATION: Customer B data was corrupted by Tenant A or unreachable!');
  }
  console.log('✓ PASS: Cross-tenant update blocked with 404/error. Target record was not modified.');

  console.log('\n[CHECK 3] Verifying Bill Isolation: Tenant A cannot access Tenant B Bills...');
  const directBillB = await api(`/api/entities/Bill/${billBId}`, {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  if (directBillB.status !== 404) {
    throw new Error(`SECURITY VIOLATION: Tenant A accessed Bill B directly! Status: ${directBillB.status}`);
  }
  const billsA = await api('/api/entities/Bill', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const foundBillBInA = billsA.data.some(b => b.id === billBId);
  if (foundBillBInA) {
    throw new Error('SECURITY VIOLATION: Bill B leaked into Tenant A bills list!');
  }
  console.log('✓ PASS: Bill B is strictly isolated to Tenant B.');

  console.log('\n[CHECK 4] Verifying Inventory Isolation: Tenant A cannot access Tenant B Inventory Items...');
  const directItemB = await api(`/api/entities/InventoryItem/${itemBId}`, {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  if (directItemB.status !== 404) {
    throw new Error(`SECURITY VIOLATION: Tenant A accessed Inventory Item B directly!`);
  }
  const invA = await api('/api/entities/InventoryItem', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const foundItemBInA = invA.data.some(i => i.id === itemBId);
  if (foundItemBInA) {
    throw new Error('SECURITY VIOLATION: Inventory Item B leaked into Tenant A inventory!');
  }
  console.log('✓ PASS: Inventory Item B is strictly isolated to Tenant B.');

  console.log('\n[CHECK 5] Verifying Payment Isolation: Tenant A cannot access Tenant B Payments...');
  const paymentsA = await api('/api/entities/Payment', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const leakedPaymentB = paymentsA.data.some(p => p.bill_id === billBId);
  if (leakedPaymentB) {
    throw new Error('SECURITY VIOLATION: Payment B leaked into Tenant A payments!');
  }
  console.log('✓ PASS: Payments are isolated by tenant.');

  console.log('\n[CHECK 6] Verifying Dashboard Isolation: Stats only aggregate active tenant records...');
  const dashA = await api('/api/functions/getDashboardStats', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId
  });
  // Total sales for Shop A should equal billA amount (113815), NOT include billB (4892.5)
  console.log(`  Tenant A Dashboard Total Sales: ₹${dashA.data.stats?.today_sales}`);
  if (dashA.data.stats?.today_sales >= (113815 + 4892.5)) {
    throw new Error('SECURITY VIOLATION: Dashboard stats aggregated sales from another tenant!');
  }
  console.log('✓ PASS: Dashboard statistics only aggregate records belonging to Tenant A.');

  console.log('\n[CHECK 7] Verifying Settings Isolation: Tenant A cannot access Tenant B ShopSettings...');
  const settingsA = await api('/api/functions/manageSettings', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { action: 'get' }
  });
  if (settingsA.data.settings?.id !== tenantAId) {
    throw new Error(`SETTINGS MISMATCH: Expected ${tenantAId}, got ${settingsA.data.settings?.id}`);
  }
  console.log(`✓ PASS: Tenant A ShopSettings resolved to "${settingsA.data.settings?.shop_name}".`);

  console.log('\n[CHECK 8] Verifying Unauthorized Shop Switching: Tenant A user cannot switch to Tenant B...');
  const switchAttempt = await api('/api/auth/switch-shop', {
    method: 'POST',
    token: tokenStaffA, // Staff A has no membership in Tenant B
    body: { shop_id: tenantBId }
  });
  if (switchAttempt.status !== 403) {
    throw new Error(`SECURITY VIOLATION: Staff A was allowed to switch to Tenant B! Status: ${switchAttempt.status}`);
  }
  console.log('✓ PASS: Unauthorized shop switch correctly rejected with 403 Forbidden.');

  console.log('\n[CHECK 9] Verifying Forged Tenant Header Spoofing Protection...');
  // Staff A crafts a request with header x-tenant-id = tenantBId
  const forgedReq = await api('/api/entities/Customer', {
    token: tokenStaffA,
    tenantId: tenantBId // Spoofed header!
  });
  // Server must override forged header with Staff A's verified active membership (Tenant A)
  const hasCustB = forgedReq.data.some(c => c.id === customerBId);
  if (hasCustB) {
    throw new Error('SECURITY VIOLATION: Forged header allowed Staff A to query Tenant B customer!');
  }
  console.log('✓ PASS: Forged tenant header was safely rejected/sanitized to verified membership.');

  console.log('\n[CHECK 10] Verifying User Management Isolation in manageMembers...');
  const membersListA = await api('/api/functions/manageMembers', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { action: 'list' }
  });
  const leakedMemberB = (membersListA.data.members || []).some(m => m.user_id === userStaffB.id);
  if (leakedMemberB) {
    throw new Error('SECURITY VIOLATION: Staff B leaked into Tenant A member directory!');
  }
  console.log('✓ PASS: Member directory only exposes users belonging to the active tenant.');

  console.log('\n[CHECK 11] Verifying Authorized Multi-Shop Switching for Dual-Member User...');
  // Invite Staff A to also be Cashier in Tenant B
  await api('/api/entities/ShopMembership', {
    method: 'POST',
    token: tokenAdminB,
    body: {
      user_id: userStaffA.id,
      user_email: staffAEmail,
      user_name: 'Staff Tenant A (Dual)',
      tenant_id: tenantBId,
      shop_id: tenantBId,
      shop_name: 'Kalyan Jewellers (Tenant B)',
      role: 'cashier',
      is_active: true,
      status: 'active'
    }
  });

  // Now Staff A switches to Tenant B
  const validSwitch = await api('/api/auth/switch-shop', {
    method: 'POST',
    token: tokenStaffA,
    body: { shop_id: tenantBId }
  });
  if (!validSwitch.ok || validSwitch.data.role !== 'cashier') {
    throw new Error(`Valid switch failed: ${JSON.stringify(validSwitch.data)}`);
  }
  console.log(`✓ PASS: Staff A successfully switched to Tenant B with assigned role: "${validSwitch.data.role}".`);

  // Now querying with Staff A's new active context
  const dualCustList = await api('/api/entities/Customer', {
    token: tokenStaffA,
    tenantId: tenantBId
  });
  const foundCustBInDual = dualCustList.data.some(c => c.id === customerBId);
  if (!foundCustBInDual) {
    throw new Error('Dual member could not see Tenant B customer after switching!');
  }
  console.log('✓ PASS: Authorized switch cleanly swapped context to Tenant B customer database.');

  // [CHECK 12] Cross-Tenant Direct Bill Update Attempt (Direct IDOR Attack)
  console.log('\n[CHECK 12] Cross-Tenant Bill Update Attempt: Tenant A attempts to modify Tenant B Bill...');
  const billUpdateAttempt = await api(`/api/entities/Bill/${billBId}`, {
    method: 'PUT',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { total_amount: 0, status: 'cancelled' }
  });
  if (billUpdateAttempt.ok) {
    throw new Error('SECURITY VIOLATION: Tenant A modified Tenant B Bill!');
  }
  // Verify Bill B remains unaltered
  const verifyBillB = await api(`/api/entities/Bill/${billBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyBillB.ok || verifyBillB.data.total_amount === 0) {
    throw new Error('SECURITY VIOLATION: Bill B was corrupted by cross-tenant update!');
  }
  console.log('✓ PASS: Cross-tenant Bill update blocked (403/404). Bill B unaffected.');

  // [CHECK 13] Cross-Tenant Bill Delete Function Attempt
  console.log('\n[CHECK 13] Cross-Tenant Bill Delete Attempt: Tenant A admin tries to delete Tenant B Bill via deleteBill...');
  const crossDeleteBill = await api('/api/functions/deleteBill', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { bill_id: billBId, reason: 'Malicious deletion attempt by Tenant A' }
  });
  if (crossDeleteBill.status !== 404) {
    throw new Error(`SECURITY VIOLATION: Tenant A executed deleteBill on Tenant B! Status: ${crossDeleteBill.status}`);
  }
  // Verify Bill B is still intact and not deleted in Tenant B
  const verifyBillBStillActive = await api(`/api/entities/Bill/${billBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyBillBStillActive.ok || verifyBillBStillActive.data.is_deleted) {
    throw new Error('SECURITY VIOLATION: Bill B was deleted by Tenant A cross-tenant call!');
  }
  console.log('✓ PASS: Cross-tenant deleteBill rejected with 404. Bill B remained active.');

  // [CHECK 14] Cross-Tenant Rate History Isolation
  console.log('\n[CHECK 14] Cross-Tenant Rate History Isolation...');
  // Seed a rate history in Tenant B
  await api('/api/entities/RateHistory', {
    method: 'POST',
    token: tokenAdminB,
    tenantId: tenantBId,
    body: { gold_24k: 7850, silver_1kg: 92000, effective_date: '2026-09-29T00:00:00.000Z' }
  });
  // Query rate history from Tenant A
  const ratesA = await api('/api/entities/RateHistory', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const hasRateBInA = ratesA.data.some(r => r.gold_24k === 7850);
  if (hasRateBInA) {
    throw new Error('SECURITY VIOLATION: Tenant B rate history leaked into Tenant A!');
  }
  console.log('✓ PASS: Rate history records are strictly tenant-isolated.');

  // [CHECK 15] Cross-Tenant Data Export Isolation
  console.log('\n[CHECK 15] Cross-Tenant Data Export Containment in manageData...');
  const exportA = await api('/api/functions/manageData', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { action: 'export', entity: 'Customer' }
  });
  if (!exportA.ok) throw new Error(`Export failed: ${JSON.stringify(exportA.data)}`);
  const exportedBInA = (exportA.data.records || []).some(r => r.id === customerBId || r.name.includes('Kalyan VIP'));
  if (exportedBInA) {
    throw new Error('SECURITY VIOLATION: Tenant B Customer leaked into Tenant A Data Export!');
  }
  console.log('✓ PASS: Data export only extracts records belonging to the calling tenant.');

  // [CHECK 16] Privilege Escalation Attack: Staff attempts to escalate to Admin
  console.log('\n[CHECK 16] Privilege Escalation Attack: Staff attempts to grant themselves admin role...');
  // Find Staff A's membership ID
  const staffAMembershipRes = await api('/api/entities/ShopMembership', {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  const staffAMembership = (staffAMembershipRes.data || []).find(m => m.user_id === userStaffA.id && m.tenant_id === tenantAId);
  if (staffAMembership) {
    const escalateAttempt = await api(`/api/entities/ShopMembership/${staffAMembership.id}`, {
      method: 'PUT',
      token: tokenStaffA, // Staff A trying to modify membership
      tenantId: tenantAId,
      body: { role: 'admin' }
    });
    if (escalateAttempt.status !== 403) {
      throw new Error(`SECURITY VIOLATION: Staff A escalated their role! Status: ${escalateAttempt.status}`);
    }
    console.log('✓ PASS: Staff privilege escalation blocked with 403 Forbidden.');
  }

  // [CHECK 17] Unauthenticated Entity Access Attempt
  console.log('\n[CHECK 17] Unauthenticated Direct Access Attempt...');
  const unauthRes = await api('/api/entities/Customer');
  if (unauthRes.status !== 401) {
    throw new Error(`SECURITY VIOLATION: Unauthenticated entity access allowed! Status: ${unauthRes.status}`);
  }
  console.log('✓ PASS: Direct unauthenticated entity access blocked with 401 Unauthorized.');

  // [CHECK 18] Cross-Tenant Customer Deletion Attempt
  console.log('\n[CHECK 18] Cross-Tenant Customer Deletion Attempt...');
  const delAttempt = await api(`/api/entities/Customer/${customerBId}`, {
    method: 'DELETE',
    token: tokenAdminA,
    tenantId: tenantAId
  });
  // Must return 404 because customerB is outside Tenant A's scope
  if (delAttempt.status !== 404 && delAttempt.ok) {
    throw new Error('SECURITY VIOLATION: Tenant A was able to delete Tenant B customer!');
  }
  // Verify Customer B is still present
  const verifyCustBStillExists = await api(`/api/entities/Customer/${customerBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyCustBStillExists.ok) {
    throw new Error('SECURITY VIOLATION: Customer B was deleted or corrupted by cross-tenant DELETE!');
  }
  console.log('✓ PASS: Cross-tenant Customer deletion blocked. Customer B remains intact.');

  // [CHECK 19] Data Wipe Containment Attack (Tenant A wipes data -> Tenant B untouched)
  console.log('\n[CHECK 19] Data Wipe Blast Radius Containment: Tenant A clearBusinessData...');
  const wipeA = await api('/api/functions/manageData', {
    method: 'POST',
    token: tokenAdminA,
    tenantId: tenantAId,
    body: { action: 'clearBusinessData', confirmation: 'DELETE ALL DATA' }
  });
  if (!wipeA.ok) throw new Error(`Tenant A wipe failed: ${JSON.stringify(wipeA.data)}`);
  console.log('  Tenant A business data wiped successfully.');

  // Verify Tenant A customer and bill are gone
  const checkCustAGone = await api(`/api/entities/Customer/${customerAId}`, {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  if (checkCustAGone.status !== 404) {
    throw new Error('Tenant A customer was expected to be deleted after wipe!');
  }

  // CRITICAL: Verify Tenant B customer and bill are 100% INTACT!
  const verifyCustBAfterWipe = await api(`/api/entities/Customer/${customerBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyCustBAfterWipe.ok || verifyCustBAfterWipe.data.id !== customerBId) {
    throw new Error('CRITICAL SECURITY VIOLATION: Tenant A data wipe deleted Tenant B customer!');
  }
  const verifyBillBAfterWipe = await api(`/api/entities/Bill/${billBId}`, {
    token: tokenAdminB,
    tenantId: tenantBId
  });
  if (!verifyBillBAfterWipe.ok || verifyBillBAfterWipe.data.id !== billBId) {
    throw new Error('CRITICAL SECURITY VIOLATION: Tenant A data wipe deleted Tenant B bill!');
  }
  console.log('✓ PASS: Tenant A data wipe strictly isolated. Tenant B Customer & Bill remain 100% intact.');

  // [CHECK 20] Query Filter Injection Containment
  console.log('\n[CHECK 20] Query Filter Tenant Tampering Defense...');
  // Tenant A tries to bypass tenant scoping by passing a malicious tenant_id filter
  const tamperQuery = await api('/api/entities/Customer?tenant_id=' + tenantBId, {
    token: tokenAdminA,
    tenantId: tenantAId
  });
  // Service must enforce req._tenantId (Tenant A), ignoring any query params attempting to override tenant_id
  const hasCustBTamper = (tamperQuery.data || []).some(c => c.id === customerBId);
  if (hasCustBTamper) {
    throw new Error('SECURITY VIOLATION: Query parameter allowed tenant scope override!');
  }
  console.log('✓ PASS: Tenant context is strictly immutable from client query parameters.');

  console.log('\n===============================================================');
  console.log('🏆 ALL 20 MULTI-TENANT ISOLATION & ATTACK CHECKS PASSED (100%)!');
  console.log('===============================================================');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ MULTI-TENANT TEST FAILED:', err);
  process.exit(1);
});
