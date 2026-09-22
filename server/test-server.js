// Comprehensive automated test suite for JewelCore ERP self-hosted backend

const BASE_URL = 'http://localhost:3001';

async function fetchJson(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('=====================================================');
  console.log('🚀 JEWELCORE ERP SELF-HOSTED BACKEND TEST SUITE');
  console.log('=====================================================');

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

  // 1. Health check
  console.log('\n[TEST 1] Health Endpoint...');
  const health = await fetchJson('/api/health');
  if (!health.ok || !health.data.ok) throw new Error('Health check failed');
  console.log('✓ Health OK:', health.data);

  // 2. User Registration
  console.log('\n[TEST 2] User Registration...');
  const testEmail = `admin_${Date.now()}@example.com`;
  const regRes = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: 'password123',
      full_name: 'Super Admin',
      role: 'admin',
      active_shop_role: 'admin'
    })
  });
  if (!regRes.ok || !regRes.data.token) {
    throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
  }
  const token = regRes.data.token;
  console.log('✓ Registration successful! User:', regRes.data.user.email);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. User Login
  console.log('\n[TEST 3] User Login...');
  const loginRes = await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: 'password123'
    })
  });
  if (!loginRes.ok || !loginRes.data.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
  }
  console.log('✓ Login verified.');

  // 4. Check /api/auth/me
  console.log('\n[TEST 4] /api/auth/me...');
  const meRes = await fetchJson('/api/auth/me', { headers: authHeaders });
  if (!meRes.ok || meRes.data.email !== testEmail) {
    throw new Error(`/api/auth/me failed: ${JSON.stringify(meRes.data)}`);
  }
  console.log('✓ Auth /me verified:', meRes.data.email);

  // 5. Function invoke: resolveSession (before onboarding)
  console.log('\n[TEST 5] resolveSession (pre-onboarding)...');
  const session1 = await fetchJson('/api/functions/resolveSession', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  });
  if (!session1.ok) throw new Error(`resolveSession failed: ${JSON.stringify(session1.data)}`);
  console.log('✓ resolveSession (pre-onboarding):', { authenticated: session1.data.authenticated, has_shop: session1.data.has_shop });

  // 6. Function invoke: onboardShop
  console.log('\n[TEST 6] onboardShop...');
  let shopId;
  if (!session1.data.has_shop) {
    const onboardRes = await fetchJson('/api/functions/onboardShop', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        shop_name: 'Royal Jewellers',
        owner_name: 'Rajesh Soni',
        address: 'MG Road, Pune',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        mobile: '9876543210',
        email: testEmail,
        currency: '₹',
        gst_number: '27AAAAA0000A1Z5'
      })
    });
    if (!onboardRes.ok || !onboardRes.data.success) {
      throw new Error(`onboardShop failed: ${JSON.stringify(onboardRes.data)}`);
    }
    shopId = onboardRes.data.shop_id;
    console.log('✓ onboardShop successful! Created Shop ID:', shopId);
  } else {
    shopId = session1.data.shop?.id;
    console.log('✓ Shop already onboarded. Using Shop ID:', shopId);
  }

  // 7. Function invoke: resolveSession (post-onboarding)
  console.log('\n[TEST 7] resolveSession (post-onboarding)...');
  const session2 = await fetchJson('/api/functions/resolveSession', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  });
  if (!session2.ok || !session2.data.has_shop || session2.data.shop.shop_name !== 'Royal Jewellers') {
    throw new Error(`Post-onboarding resolveSession failed: ${JSON.stringify(session2.data)}`);
  }
  console.log('✓ Post-onboarding session verified. Shop:', session2.data.shop.shop_name);

  // 8. Entity CRUD: Customer
  console.log('\n[TEST 8] Customer Entity CRUD...');
  const customerMobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const createCust = await fetchJson('/api/entities/Customer', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Ramesh Sharma',
      mobile: customerMobile,
      city: 'Pune',
      state: 'Maharashtra',
      is_deleted: false
    })
  });
  if (!createCust.ok || !createCust.data.id) {
    throw new Error(`Customer create failed: ${JSON.stringify(createCust.data)}`);
  }
  const customerId = createCust.data.id;
  console.log('✓ Customer created with ID:', customerId);

  // Filter Customer
  const filterCust = await fetchJson('/api/entities/Customer/filter', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      query: { mobile: customerMobile }
    })
  });
  if (!filterCust.ok || filterCust.data.length === 0) {
    throw new Error('Customer filter failed');
  }
  console.log('✓ Customer filter verified. Found count:', filterCust.data.length);

  // 9. Function invoke: changeRate
  console.log('\n[TEST 9] changeRate (24K Gold Model)...');
  const changeRateRes = await fetchJson('/api/functions/changeRate', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      gold_24k_rate: 7500,
      silver_rate: 90
    })
  });
  if (!changeRateRes.ok || !changeRateRes.data.success) {
    throw new Error(`changeRate failed: ${JSON.stringify(changeRateRes.data)}`);
  }
  console.log('✓ changeRate verified. Created rates count:', changeRateRes.data.created_count);

  // 10. Create InventoryItem
  console.log('\n[TEST 10] InventoryItem creation...');
  const itemCode = `RNG-${Math.floor(1000 + Math.random() * 9000)}`;
  const createItem = await fetchJson('/api/entities/InventoryItem', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      item_name: 'Gold Ring 22K Designer',
      item_code: itemCode,
      category_name: 'Rings',
      metal_type: 'gold',
      purity_display: '22K',
      purity_value: 22,
      quantity: 5,
      gross_weight: 50.0,
      net_weight: 48.0,
      fine_weight: 44.0,
      making_rate: 450,
      making_type: 'per_gram',
      wastage_percent: 2,
      status: 'in_stock'
    })
  });
  if (!createItem.ok || !createItem.data.id) {
    throw new Error(`InventoryItem create failed: ${JSON.stringify(createItem.data)}`);
  }
  const invId = createItem.data.id;
  console.log('✓ InventoryItem created with ID:', invId, 'quantity:', createItem.data.quantity);

  // 11. Function invoke: finalizeBill
  console.log('\n[TEST 11] finalizeBill (with automated calculation & inventory deduction)...');
  const finalizeRes = await fetchJson('/api/functions/finalizeBill', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customer_id: customerId,
      bill_source: 'inventory',
      items: [
        {
          inventory_id: invId,
          item_name: 'Gold Ring 22K Designer',
          item_code: itemCode,
          category_name: 'Rings',
          metal_type: 'gold',
          purity_display: '22K',
          purity_value: 22,
          quantity: 1,
          gross_weight: 10.0,
          net_weight: 9.6,
          making_rate: 450,
          making_type: 'per_gram',
          wastage_percent: 2
        }
      ],
      bill_discount: 100,
      paid_amount: 10000,
      payment_mode: 'cash',
      gst_enabled: true,
      gst_mode: 'intra'
    })
  });
  if (!finalizeRes.ok || !finalizeRes.data.success) {
    throw new Error(`finalizeBill failed: ${JSON.stringify(finalizeRes.data)}`);
  }
  const billData = finalizeRes.data;
  console.log('✓ finalizeBill successful!');
  console.log(`  Bill Number : ${billData.bill_number}`);
  console.log(`  Total Amount: ₹${billData.total_amount}`);
  console.log(`  Paid Amount : ₹${billData.paid_amount}`);
  console.log(`  Due Amount  : ₹${billData.due_amount}`);

  // 12. Verify inventory reduction
  console.log('\n[TEST 12] Verifying Inventory Deduction...');
  const updatedInv = await fetchJson(`/api/entities/InventoryItem/${invId}`, { headers: authHeaders });
  if (!updatedInv.ok || updatedInv.data.quantity !== 4) {
    throw new Error(`Inventory quantity should be 4, got: ${updatedInv.data?.quantity}`);
  }
  console.log('✓ Inventory accurately decremented from 5 to:', updatedInv.data.quantity);

  // 13. Test Public Bill access
  if (billData.public_token) {
    console.log('\n[TEST 13] Testing Public Bill access by token...');
    const pubBill = await fetchJson(`/api/public/bill/${billData.public_token}`);
    if (!pubBill.ok || pubBill.data.bill?.bill_number !== billData.bill_number) {
      throw new Error(`Public bill access failed: ${JSON.stringify(pubBill.data)}`);
    }
    console.log('✓ Public bill access verified for:', pubBill.data.bill.bill_number);
  }

  // 14. Function invoke: collectDue
  console.log('\n[TEST 14] collectDue (Customer payment against due bill)...');
  const collectRes = await fetchJson('/api/functions/collectDue', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      bill_id: billData.bill_id,
      amount: 1000,
      payment_mode: 'upi',
      reference: 'UPI-TXN-123456'
    })
  });
  if (!collectRes.ok || !collectRes.data.success) {
    throw new Error(`collectDue failed: ${JSON.stringify(collectRes.data)}`);
  }
  const billAfterPayment = await fetchJson(`/api/entities/Bill/${billData.bill_id}`, { headers: authHeaders });
  console.log('✓ collectDue verified! New paid:', billAfterPayment.data.paid_amount, 'New due:', billAfterPayment.data.due_amount);

  // 15. Function invoke: getDashboardStats
  console.log('\n[TEST 15] getDashboardStats (Static KPI aggregates)...');
  const dashRes = await fetchJson('/api/functions/getDashboardStats', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({})
  });
  if (!dashRes.ok || dashRes.data.todaySales === undefined) {
    throw new Error(`getDashboardStats failed: ${JSON.stringify(dashRes.data)}`);
  }
  console.log('✓ getDashboardStats verified! Today sales:', dashRes.data.todaySales, 'Total bills:', dashRes.data.totalBills);

  // 16. Test File Upload Endpoint (/api/upload)
  console.log('\n[TEST 16] File Upload Endpoint (/api/upload)...');
  const formBoundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const fileContent = 'Dummy invoice test file content';
  const postData = [
    `--${formBoundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.txt"',
    'Content-Type: text/plain',
    '',
    fileContent,
    `--${formBoundary}--`,
    ''
  ].join('\r\n');

  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formBoundary}`
    },
    body: postData
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.file_url) {
    throw new Error(`File upload failed: ${JSON.stringify(uploadData)}`);
  }
  console.log('✓ File upload verified! Uploaded URL:', uploadData.file_url);

  console.log('\n=====================================================');
  console.log('🎉 ALL 16/16 COMPREHENSIVE VERIFICATION TESTS PASSED (100%)!');
  console.log('=====================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
