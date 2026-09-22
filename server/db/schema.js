import { db } from './database.js';
import crypto from 'node:crypto';

export const ENTITY_TABLES = [
  'ActivityLog',
  'Bill',
  'BillItem',
  'CategoryMaster',
  'Customer',
  'CustomerOrder',
  'CustomerOutstanding',
  'DueReminder',
  'ExchangeTransaction',
  'GSTConfig',
  'InventoryItem',
  'InventoryTransaction',
  'ItemMaster',
  'Karagir',
  'KaragirOrder',
  'Notification',
  'Payment',
  'Purchase',
  'PurchaseItem',
  'PurityMaster',
  'RateHistory',
  'ReturnTransaction',
  'ShopMembership',
  'ShopSettings',
  'Supplier',
  'SupplierTransaction',
  'User',
  'WhatsAppConfig',
  'WhatsAppShare'
];

export async function initSchema() {
  // Migration tracking table
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Auth users table
  await db.query(`
    CREATE TABLE IF NOT EXISTS _auth_users (
      id VARCHAR(100) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      full_name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      active_shop_role VARCHAR(50) DEFAULT 'staff',
      onboarding_completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create document table with JSONB for each of the 29 entities
  for (const table of ENTITY_TABLES) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        id VARCHAR(100) PRIMARY KEY,
        created_date TIMESTAMPTZ NOT NULL,
        updated_date TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL
      );
    `);
  }

  // Performance B-Tree and GIN indexes using PostgreSQL JSONB expressions
  const indexDefinitions = [
    // GIN indexes on entire JSONB documents for high-speed containment search
    `CREATE INDEX IF NOT EXISTS idx_bill_gin ON "Bill" USING gin (data);`,
    `CREATE INDEX IF NOT EXISTS idx_inv_item_gin ON "InventoryItem" USING gin (data);`,
    `CREATE INDEX IF NOT EXISTS idx_customer_gin ON "Customer" USING gin (data);`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_gin ON "Supplier" USING gin (data);`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_gin ON "Purchase" USING gin (data);`,

    // Bill B-Tree indexes
    `CREATE INDEX IF NOT EXISTS idx_bill_number ON "Bill" ((data->>'bill_number'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_customer ON "Bill" ((data->>'customer_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_token ON "Bill" ((data->>'public_token'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_op ON "Bill" ((data->>'operation_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_status ON "Bill" ((data->>'status'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_date ON "Bill" ((data->>'bill_date'));`,

    // BillItem indexes
    `CREATE INDEX IF NOT EXISTS idx_bill_item_bill ON "BillItem" ((data->>'bill_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_bill_item_item ON "BillItem" ((data->>'item_id'));`,

    // Customer & Supplier indexes
    `CREATE INDEX IF NOT EXISTS idx_customer_code ON "Customer" ((data->>'customer_code'));`,
    `CREATE INDEX IF NOT EXISTS idx_customer_mobile ON "Customer" ((data->>'mobile'));`,
    `CREATE INDEX IF NOT EXISTS idx_customer_del ON "Customer" ((data->>'is_deleted'));`,
    `CREATE INDEX IF NOT EXISTS idx_supplier_code ON "Supplier" ((data->>'supplier_code'));`,

    // InventoryItem indexes
    `CREATE INDEX IF NOT EXISTS idx_inv_item_id ON "InventoryItem" ((data->>'item_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_barcode ON "InventoryItem" ((data->>'barcode'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_huid ON "InventoryItem" ((data->>'huid'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_metal ON "InventoryItem" ((data->>'metal_type'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_status ON "InventoryItem" ((data->>'status'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_archived ON "InventoryItem" ((data->>'is_archived'));`,

    // InventoryTransaction indexes
    `CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON "InventoryTransaction" ((data->>'item_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_inv_tx_ref ON "InventoryTransaction" ((data->>'reference_type'), (data->>'reference_id'));`,

    // RateHistory & PurityMaster indexes
    `CREATE INDEX IF NOT EXISTS idx_rate_metal ON "RateHistory" ((data->>'metal_type'), (data->>'is_active'));`,
    `CREATE INDEX IF NOT EXISTS idx_rate_date ON "RateHistory" ((data->>'effective_date'));`,
    `CREATE INDEX IF NOT EXISTS idx_purity_metal ON "PurityMaster" ((data->>'metal_type'), (data->>'is_active'));`,

    // Purchase & PurchaseItem
    `CREATE INDEX IF NOT EXISTS idx_purchase_num ON "Purchase" ((data->>'purchase_number'));`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_supplier ON "Purchase" ((data->>'supplier_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_purchase_item_pur ON "PurchaseItem" ((data->>'purchase_id'));`,

    // Orders & Reminders
    `CREATE INDEX IF NOT EXISTS idx_cust_order_cust ON "CustomerOrder" ((data->>'customer_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_karagir_order_k ON "KaragirOrder" ((data->>'karagir_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_due_reminder_bill ON "DueReminder" ((data->>'bill_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_due_reminder_status ON "DueReminder" ((data->>'status'));`,
    `CREATE INDEX IF NOT EXISTS idx_cust_out_bill ON "CustomerOutstanding" ((data->>'bill_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_cust_out_cust ON "CustomerOutstanding" ((data->>'customer_id'));`,

    // ShopMembership
    `CREATE INDEX IF NOT EXISTS idx_membership_user ON "ShopMembership" ((data->>'user_id'));`,
    `CREATE INDEX IF NOT EXISTS idx_membership_email ON "ShopMembership" ((data->>'user_email'));`,
    `CREATE INDEX IF NOT EXISTS idx_membership_tenant ON "ShopMembership" ((data->>'tenant_id'));`,

    // Notification
    `CREATE INDEX IF NOT EXISTS idx_notif_read ON "Notification" ((data->>'is_read'));`
  ];

  // Add tenant_id index for all 29 entity tables
  for (const table of ENTITY_TABLES) {
    indexDefinitions.push(`CREATE INDEX IF NOT EXISTS "idx_${table.toLowerCase()}_tenant" ON "${table}" ((data->>'tenant_id'));`);
  }

  for (const idxSql of indexDefinitions) {
    try {
      await db.query(idxSql);
    } catch (e) {
      console.warn('PostgreSQL Index creation note:', e.message);
    }
  }

  // Record initial migration
  try {
    await db.query(`
      INSERT INTO _migrations (name) VALUES ('0001_initial_postgresql_schema')
      ON CONFLICT (name) DO NOTHING;
    `);
  } catch (_) {}

  // Multi-tenant migration 0002: Backfill existing data with existing shop tenant_id
  try {
    const migCheck = await db.query(`SELECT id FROM _migrations WHERE name = '0002_multi_tenant_backfill'`);
    if (migCheck.rows.length === 0) {
      const shopRes = await db.query(`SELECT id, data FROM "ShopSettings" ORDER BY created_date ASC LIMIT 1`);
      if (shopRes.rows.length > 0) {
        const defaultTenantId = shopRes.rows[0].id;
        console.log(`[Migration 0002] Backfilling existing records to tenant_id: ${defaultTenantId}`);

        // Update all 29 tables where tenant_id is missing
        for (const table of ENTITY_TABLES) {
          await db.query(`
            UPDATE "${table}"
            SET data = jsonb_set(data, '{tenant_id}', to_jsonb($1::text))
            WHERE (data->>'tenant_id') IS NULL OR (data->>'tenant_id') = ''
          `, [defaultTenantId]);
        }

        // Also ensure shop_id on ShopMembership
        await db.query(`
          UPDATE "ShopMembership"
          SET data = jsonb_set(data, '{shop_id}', to_jsonb($1::text))
          WHERE (data->>'shop_id') IS NULL OR (data->>'shop_id') = ''
        `, [defaultTenantId]);

        // Ensure all existing _auth_users have a membership for this shop
        const usersRes = await db.query(`SELECT id, email, full_name, role, active_shop_role FROM _auth_users`);
        const now = new Date().toISOString();
        for (const u of usersRes.rows) {
          const memCheck = await db.query(`
            SELECT id FROM "ShopMembership"
            WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
              AND (data->>'tenant_id' = $3 OR data->>'shop_id' = $3)
          `, [u.id, u.email || '', defaultTenantId]);

          if (memCheck.rows.length === 0) {
            const memId = crypto.randomUUID();
            const memData = {
              id: memId,
              user_id: u.id,
              user_email: u.email || '',
              user_name: u.full_name || '',
              tenant_id: defaultTenantId,
              shop_id: defaultTenantId,
              shop_name: shopRes.rows[0].data?.shop_name || 'Jewellery Store',
              role: u.active_shop_role || (u.role === 'admin' ? 'admin' : 'staff'),
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
          }
        }
        console.log(`[Migration 0002] Backfill complete.`);
      }

      await db.query(`
        INSERT INTO _migrations (name) VALUES ('0002_multi_tenant_backfill')
        ON CONFLICT (name) DO NOTHING;
      `);
    }
  } catch (migErr) {
    console.warn('[Migration 0002 Warning]', migErr.message);
  }

  // Seed default master data if empty
  try {
    const purityCountRes = await db.query('SELECT COUNT(*) as c FROM "PurityMaster"');
    const purityCount = parseInt(purityCountRes.rows[0]?.c || '0', 10);
    if (purityCount === 0) {
      const now = new Date().toISOString();
      const defaultPurities = [
        { name: '24K', metal_type: 'gold', purity_value: 99.9, display_format: '24K', is_active: true },
        { name: '22K', metal_type: 'gold', purity_value: 91.6, display_format: '22K', is_active: true },
        { name: '20K', metal_type: 'gold', purity_value: 83.3, display_format: '20K', is_active: true },
        { name: '18K', metal_type: 'gold', purity_value: 75.0, display_format: '18K', is_active: true },
        { name: '14K', metal_type: 'gold', purity_value: 58.5, display_format: '14K', is_active: true },
        { name: 'Silver 999', metal_type: 'silver', purity_value: 99.9, display_format: '999', is_active: true }
      ];
      for (const p of defaultPurities) {
        const id = crypto.randomUUID();
        const record = { id, ...p, created_date: now, updated_date: now };
        await db.query(
          'INSERT INTO "PurityMaster" (id, created_date, updated_date, data) VALUES ($1, $2, $3, $4)',
          [id, now, now, JSON.stringify(record)]
        );
      }
    }

    const gstCountRes = await db.query('SELECT COUNT(*) as c FROM "GSTConfig"');
    const gstCount = parseInt(gstCountRes.rows[0]?.c || '0', 10);
    if (gstCount === 0) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const gstRecord = {
        id,
        name: 'Standard GST (3%)',
        gst_rate: 3,
        cgst_rate: 1.5,
        sgst_rate: 1.5,
        igst_rate: 3,
        is_active: true,
        applicable_from: now.slice(0, 10),
        created_date: now,
        updated_date: now
      };
      await db.query(
        'INSERT INTO "GSTConfig" (id, created_date, updated_date, data) VALUES ($1, $2, $3, $4)',
        [id, now, now, JSON.stringify(gstRecord)]
      );
    }
  } catch (seedErr) {
    console.warn('Default master seeding note:', seedErr.message);
  }
}

export const initializePostgresSchema = initSchema;
export default { initSchema, initializePostgresSchema, ENTITY_TABLES };
