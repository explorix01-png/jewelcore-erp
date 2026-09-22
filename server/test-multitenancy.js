import http from 'node:http';
import { db } from './db/database.js';
import { initSchema } from './db/schema.js';
import { entityService } from './db/entityService.js';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function ensureServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/health`, (res) => {
      resolve(true);
    });
    req.on('error', async () => {
      console.log('⚡ Backend server not active on port 3001, auto-starting server in-process...');
      const app = (await import('./server.js')).default;
      setTimeout(resolve, 1500);
    });
  });
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
  await initSchema();

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
  await entityService.create('ShopMembership', {
    user_id: userStaffA.id,
    user_email: staffAEmail,
    user_name: 'Staff Tenant A',
    tenant_id: tenantAId,
    shop_id: tenantAId,
    shop_name: 'Shree Ganesh Jewellers (Tenant A)',
    role: 'staff',
    is_active: true,
    status: 'active'
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
  await entityService.create('ShopMembership', {
    user_id: userStaffB.id,
    user_email: staffBEmail,
    user_name: 'Staff Tenant B',
    tenant_id: tenantBId,
    shop_id: tenantBId,
    shop_name: 'Kalyan Jewellers (Tenant B)',
    role: 'staff',
    is_active: true,
    status: 'active'
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
      bill_date: new Date().toISOString(),
      customer_id: customerAId,
      customer_name: 'Customer A (Ganesh Regular)',
      items: [{
        item_id: itemAId,
        description: 'Gold Necklace 22K',
        metal_type: 'gold',
        purity: '22K',
        gross_weight: 15.5,
        net_weight: 15.5,
        rate_per_gram: 7000,
        metal_value: 108500,
        making_charges_fixed: 2000,
        making_charges_type: 'fixed',
        making_amount: 2000,
        taxable_amount: 110500,
        gst_amount: 3315,
        total: 113815,
        quantity: 1
      }],
      payments: [{ payment_mode: 'cash', amount: 113815 }],
      subtotal: 110500,
      gst_amount: 3315,
      total_amount: 113815,
      paid_amount: 113815,
      due_amount: 0
    }
  });
  const billAId = billA.data.bill?.id;
  console.log(`✓ Tenant A created: Customer (${customerAId}), Item (${itemAId}), Bill (${billA.data.bill?.bill_number || 'INV'})`);

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
      items: [{
        item_id: itemBId,
        description: 'Silver Bangles 999',
        metal_type: 'silver',
        purity: '999',
        gross_weight: 50.0,
        net_weight: 50.0,
        rate_per_gram: 85,
        metal_value: 4250,
        making_charges_fixed: 500,
        making_charges_type: 'fixed',
        making_amount: 500,
        taxable_amount: 4750,
        gst_amount: 142.5,
        total: 4892.5,
        quantity: 2
      }],
      payments: [{ payment_mode: 'upi', amount: 4892.5 }],
      subtotal: 4750,
      gst_amount: 142.5,
      total_amount: 4892.5,
      paid_amount: 4892.5,
      due_amount: 0
    }
  });
  const billBId = billB.data.bill?.id;
  console.log(`✓ Tenant B created: Customer (${customerBId}), Item (${itemBId}), Bill (${billB.data.bill?.bill_number || 'INV'})`);

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
  const verifyCustB = await entityService.get('Customer', customerBId);
  if (verifyCustB.name === 'HACKED CUSTOMER B') {
    throw new Error('SECURITY VIOLATION: Customer B data was corrupted by Tenant A!');
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
  await entityService.create('ShopMembership', {
    user_id: userStaffA.id,
    user_email: staffAEmail,
    user_name: 'Staff Tenant A (Dual)',
    tenant_id: tenantBId,
    shop_id: tenantBId,
    shop_name: 'Kalyan Jewellers (Tenant B)',
    role: 'cashier',
    is_active: true,
    status: 'active'
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

  console.log('\n===============================================================');
  console.log('🏆 ALL 11 MULTI-TENANT ISOLATION & SECURITY CHECKS PASSED (100%)!');
  console.log('===============================================================');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ MULTI-TENANT TEST FAILED:', err);
  process.exit(1);
});
