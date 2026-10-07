import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { db } from './database.js';
import { entityService } from './entityService.js';

dotenv.config();

/**
 * Development-only seed script to idempotently create or update a local test admin account.
 * Reads credentials from environment variables (or development defaults).
 * Never exposes credentials in logs.
 * Associates the test admin with the active store and ensures today's metal rates exist.
 */
export async function seedLocalAdmin() {
  const email = (process.env.TEST_ADMIN_EMAIL || 'admin@jewelcore.local').trim().toLowerCase();
  const rawPassword = process.env.TEST_ADMIN_PASSWORD || 'Admin@JewelCore2026';
  const fullName = process.env.TEST_ADMIN_NAME || 'Local Test Admin';

  const passwordHash = bcrypt.hashSync(rawPassword, 10);
  const now = new Date().toISOString();

  console.log(`[Seed Admin] Ensuring test admin account exists for: ${email}`);

  // 1. Check if user already exists in _auth_users
  const existingUserRes = await db.query('SELECT id, email FROM _auth_users WHERE email = $1', [email]);
  let userId;

  if (existingUserRes.rows.length > 0) {
    userId = existingUserRes.rows[0].id;
    await db.query(`
      UPDATE _auth_users
      SET password_hash = $1,
          full_name = $2,
          role = 'admin',
          active_shop_role = 'admin',
          onboarding_completed = true,
          updated_at = $3
      WHERE id = $4
    `, [passwordHash, fullName, now, userId]);
    console.log(`[Seed Admin] Updated existing _auth_users record (id: ${userId})`);
  } else {
    userId = crypto.randomUUID();
    await db.query(`
      INSERT INTO _auth_users (id, email, password_hash, full_name, role, active_shop_role, onboarding_completed, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'admin', 'admin', true, $5, $5)
    `, [userId, email, passwordHash, fullName, now]);
    console.log(`[Seed Admin] Created new _auth_users record (id: ${userId})`);
  }

  // 2. Mirror into User entity table
  const existingEntityUser = await entityService.get('User', userId).catch(() => null);
  const userData = {
    id: userId,
    email,
    full_name: fullName,
    role: 'admin',
    active_shop_role: 'admin',
    onboarding_completed: true
  };

  if (existingEntityUser) {
    await entityService.update('User', userId, userData);
  } else {
    await entityService.create('User', userData);
  }

  // 3. Locate the primary onboarded shop (e.g. Royal Jewellers or first ShopSettings)
  let shopRes = await db.query(`SELECT id, data FROM "ShopSettings" WHERE (data->>'onboarding_completed')::boolean = true ORDER BY created_date ASC LIMIT 1`);
  if (shopRes.rows.length === 0) {
    shopRes = await db.query(`SELECT id, data FROM "ShopSettings" ORDER BY created_date ASC LIMIT 1`);
  }

  if (shopRes.rows.length === 0) {
    // If no shop exists at all, create default shop settings
    const shopId = crypto.randomUUID();
    const defaultShop = {
      id: shopId,
      shop_name: 'Royal Jewellers',
      owner_name: fullName,
      phone: '9876543210',
      email,
      address: '101, Main Jewellery Market, Zaveri Bazaar, Mumbai',
      gold_24k_rate: 7200,
      silver_rate: 85,
      making_charge_default: 8,
      making_charge_type_default: 'percentage',
      low_stock_threshold: 2,
      onboarding_completed: true,
      default_language: 'English',
      currency: 'INR',
      barcode_type: 'code128',
      barcode_height: 70,
      barcode_width: 2,
      barcode_font_size: 14,
      barcode_label_width: 45,
      barcode_label_height: 20,
      barcode_offset_x: 48
    };
    await entityService.create('ShopSettings', defaultShop);
    shopRes = { rows: [{ id: shopId, data: defaultShop }] };
    console.log(`[Seed Admin] Created initial ShopSettings record (id: ${shopId})`);
  }

  const primaryShop = shopRes.rows[0];
  const shopId = primaryShop.id;
  const shopName = primaryShop.data?.shop_name || 'Royal Jewellers';

  // Ensure shop has onboarding_completed: true
  if (!primaryShop.data?.onboarding_completed) {
    await entityService.update('ShopSettings', shopId, { onboarding_completed: true });
  }

  // 4. Ensure ShopMembership exists for this user and shop
  const memRes = await db.query(`
    SELECT id FROM "ShopMembership"
    WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
      AND (data->>'tenant_id' = $3 OR data->>'shop_id' = $3)
    LIMIT 1
  `, [userId, email, shopId]);

  if (memRes.rows.length > 0) {
    const memId = memRes.rows[0].id;
    await db.query(`
      UPDATE "ShopMembership"
      SET data = jsonb_set(
        jsonb_set(
          jsonb_set(data, '{role}', '"admin"'),
          '{is_active}', 'true'
        ),
        '{status}', '"active"'
      ),
      updated_date = $1
      WHERE id = $2
    `, [now, memId]);
    console.log(`[Seed Admin] Verified active admin ShopMembership (id: ${memId})`);
  } else {
    const memId = crypto.randomUUID();
    const memData = {
      id: memId,
      user_id: userId,
      user_email: email,
      user_name: fullName,
      tenant_id: shopId,
      shop_id: shopId,
      shop_name: shopName,
      role: 'admin',
      is_active: true,
      status: 'active',
      joined_date: now,
      created_date: now,
      updated_date: now
    };
    await db.query(`
      INSERT INTO "ShopMembership" (id, created_date, updated_date, data)
      VALUES ($1, $2, $3, $4::jsonb)
    `, [memId, now, now, JSON.stringify(memData)]);
    console.log(`[Seed Admin] Created admin ShopMembership for ${shopName} (id: ${memId})`);
  }

  // 5. Ensure today's metal rates exist in RateHistory for this shop
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existingRates = await entityService.filter('RateHistory', {
    tenant_id: shopId,
    is_active: true
  }, '-effective_date', 50).catch(() => []);

  const hasGoldToday = existingRates.some(r => r.metal_type === 'gold' && new Date(r.effective_date) >= todayStart);
  const hasSilverToday = existingRates.some(r => r.metal_type === 'silver' && new Date(r.effective_date) >= todayStart);

  const goldRateVal = Number(primaryShop.data?.gold_24k_rate) || 7200;
  const silverRateVal = Number(primaryShop.data?.silver_rate) || 85;

  // Rows must carry `rate_per_gram` and the base purity (24K gold / 999 silver),
  // exactly like changeRate writes them — a bare `rate` field is unreadable by
  // getEffectiveRates and zeroes every purity's rate on the billing screen.
  const basePurities = await entityService.filter('PurityMaster', { tenant_id: shopId, is_active: true }, 'purity_value', 100).catch(() => []);
  const baseGold = basePurities.find(p => p.metal_type === 'gold' && Number(p.purity_value) === 24);
  const baseSilver = basePurities.find(p => p.metal_type === 'silver' && Number(p.purity_value) >= 99);

  if (!hasGoldToday) {
    await entityService.create('RateHistory', {
      tenant_id: shopId,
      metal_type: 'gold',
      purity_id: baseGold?.id,
      purity_display: baseGold?.display_format || baseGold?.name || '24K',
      rate_per_gram: goldRateVal,
      effective_date: now,
      source: 'seed',
      is_active: true,
      notes: `24K=${goldRateVal} (auto-seeded daily rate)`
    });
    console.log(`[Seed Admin] Seeded today's gold rate: ₹${goldRateVal}/g`);
  }

  if (!hasSilverToday) {
    await entityService.create('RateHistory', {
      tenant_id: shopId,
      metal_type: 'silver',
      purity_id: baseSilver?.id,
      purity_display: baseSilver?.display_format || baseSilver?.name || '999',
      rate_per_gram: silverRateVal,
      effective_date: now,
      source: 'seed',
      is_active: true,
      notes: `999=${silverRateVal} (auto-seeded daily rate)`
    });
    console.log(`[Seed Admin] Seeded today's silver rate: ₹${silverRateVal}/g`);
  }

  // 6. Ensure test cashier account exists
  const cashierEmail = 'cashier@jewelcore.local';
  const cashierPasswordHash = bcrypt.hashSync('Cashier@JewelCore2026', 10);
  const cashierUserRes = await db.query('SELECT id FROM _auth_users WHERE email = $1', [cashierEmail]);
  let cashierId;
  if (cashierUserRes.rows.length > 0) {
    cashierId = cashierUserRes.rows[0].id;
    await db.query(`
      UPDATE _auth_users
      SET password_hash = $1, full_name = 'Test Cashier', role = 'cashier', active_shop_role = 'cashier', onboarding_completed = true, updated_at = $2
      WHERE id = $3
    `, [cashierPasswordHash, now, cashierId]);
  } else {
    cashierId = crypto.randomUUID();
    await db.query(`
      INSERT INTO _auth_users (id, email, password_hash, full_name, role, active_shop_role, onboarding_completed, created_at, updated_at)
      VALUES ($1, $2, $3, 'Test Cashier', 'cashier', 'cashier', true, $4, $4)
    `, [cashierId, cashierEmail, cashierPasswordHash, now]);
  }

  // Ensure cashier membership
  const cashierMem = await db.query(`
    SELECT id FROM "ShopMembership" WHERE lower(data->>'user_email') = $1 AND (data->>'tenant_id' = $2 OR data->>'shop_id' = $2)
  `, [cashierEmail, shopId]);
  if (cashierMem.rows.length === 0) {
    const cmId = crypto.randomUUID();
    await db.query(`
      INSERT INTO "ShopMembership" (id, created_date, updated_date, data)
      VALUES ($1, $2, $3, $4::jsonb)
    `, [cmId, now, now, JSON.stringify({
      id: cmId,
      user_id: cashierId,
      user_email: cashierEmail,
      user_name: 'Test Cashier',
      tenant_id: shopId,
      shop_id: shopId,
      shop_name: shopName,
      role: 'cashier',
      is_active: true,
      status: 'active',
      joined_date: now,
      created_date: now,
      updated_date: now
    })]);
  }

  console.log('✓ Local test admin & cashier accounts setup successfully completed.');
  return {
    email,
    userId,
    shopId,
    shopName
  };
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('seedAdmin.js')) {
  seedLocalAdmin()
    .then(() => db.close())
    .catch((err) => {
      console.error('[Seed Admin Error]', err);
      process.exit(1);
    });
}
