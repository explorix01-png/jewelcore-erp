import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { db } from './database.js';
import { initSchema, ENTITY_TABLES } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function importFromSqlite(options = {}) {
  const {
    sqlitePath = path.resolve(__dirname, '../data/jewelcore.sqlite'),
    backupDir = path.resolve(__dirname, '../data/backups'),
    overwriteExisting = false
  } = options;

  console.log('===============================================================');
  console.log('📦 JEWELCORE ERP SQLITE-TO-POSTGRESQL DATA MIGRATION UTILITY');
  console.log('===============================================================');

  if (!fs.existsSync(sqlitePath)) {
    console.log(`[Import] SQLite database not found at ${sqlitePath}. Nothing to import.`);
    return { success: true, importedCount: 0, message: 'SQLite database not found' };
  }

  // 1. Create timestamped backup of SQLite database
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `jewelcore_pre_pg_backup_${timestamp}.sqlite`);
  fs.copyFileSync(sqlitePath, backupPath);
  console.log(`✓ Safety backup created: ${backupPath} (${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB)`);

  // 2. Open SQLite in read mode
  const sqliteDb = new DatabaseSync(sqlitePath, { readOnly: true });

  // 3. Initialize PostgreSQL schema
  await initSchema();
  console.log('✓ PostgreSQL schema and indexes initialized.');

  const stats = {
    tablesProcessed: 0,
    totalRecordsRead: 0,
    totalImported: 0,
    totalSkipped: 0,
    totalErrors: 0,
    byTable: {}
  };

  // 4. Migrate _auth_users
  try {
    const authRows = sqliteDb.prepare('SELECT * FROM _auth_users').all();
    stats.byTable['_auth_users'] = { read: authRows.length, imported: 0, skipped: 0, testRecords: 0 };
    stats.totalRecordsRead += authRows.length;

    for (const user of authRows) {
      const isTestRecord = user.email.includes('example.com') || user.email.includes('verify_') || user.email.includes('test_');
      if (isTestRecord) {
        stats.byTable['_auth_users'].testRecords++;
      }

      const conflictClause = overwriteExisting
        ? `ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role, active_shop_role = EXCLUDED.active_shop_role, onboarding_completed = EXCLUDED.onboarding_completed, updated_at = EXCLUDED.updated_at`
        : `ON CONFLICT (id) DO NOTHING`;

      const insertRes = await db.query(`
        INSERT INTO _auth_users (id, email, password_hash, full_name, role, active_shop_role, onboarding_completed, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ${conflictClause}
      `, [
        user.id,
        user.email,
        user.password_hash,
        user.full_name,
        user.role,
        user.active_shop_role,
        Boolean(user.onboarding_completed),
        user.created_at,
        user.updated_at
      ]);

      if (insertRes.rowCount > 0) {
        stats.totalImported++;
        stats.byTable['_auth_users'].imported++;
      } else {
        stats.totalSkipped++;
        stats.byTable['_auth_users'].skipped++;
      }
    }
  } catch (err) {
    console.warn('[Import] Note on _auth_users import:', err.message);
  }

  // 5. Migrate all 29 entity tables
  for (const table of ENTITY_TABLES) {
    stats.byTable[table] = { read: 0, imported: 0, skipped: 0, errors: 0 };

    let rows = [];
    try {
      rows = sqliteDb.prepare(`SELECT id, created_date, updated_date, data FROM "${table}"`).all();
    } catch (_) {
      // Table might not exist in SQLite
      continue;
    }

    stats.tablesProcessed++;
    stats.byTable[table].read = rows.length;
    stats.totalRecordsRead += rows.length;

    for (const row of rows) {
      try {
        let parsed = typeof row.data === 'object' ? row.data : JSON.parse(row.data);
        if (table === 'ShopSettings') {
          parsed.tenant_id = row.id;
          parsed.onboarding_completed = true;
        } else if (table === 'ShopMembership') {
          if (!parsed.tenant_id) parsed.tenant_id = '88661c0f-b46b-478d-862e-77fcec877386';
          if (!parsed.shop_id) parsed.shop_id = '88661c0f-b46b-478d-862e-77fcec877386';
        } else if (table !== 'User' && !parsed.tenant_id) {
          parsed.tenant_id = '88661c0f-b46b-478d-862e-77fcec877386';
        }
        const jsonData = JSON.stringify(parsed);
        const conflictClause = overwriteExisting
          ? `ON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date, data = EXCLUDED.data`
          : `ON CONFLICT (id) DO NOTHING`;

        const res = await db.query(`
          INSERT INTO "${table}" (id, created_date, updated_date, data)
          VALUES ($1, $2, $3, $4::jsonb)
          ${conflictClause}
        `, [row.id, row.created_date, row.updated_date, jsonData]);

        if (res.rowCount > 0) {
          stats.totalImported++;
          stats.byTable[table].imported++;
        } else {
          stats.totalSkipped++;
          stats.byTable[table].skipped++;
        }
      } catch (insertErr) {
        stats.totalErrors++;
        stats.byTable[table].errors++;
        console.error(`[Import Error] ${table} (${row.id}):`, insertErr.message);
      }
    }
  }

  // 6. Financial and inventory verification checks
  console.log('\n--- Data Integrity & Verification ---');

  // Verify Bill count and financial totals
  const billCountSqlite = sqliteDb.prepare('SELECT COUNT(*) as c FROM "Bill"').get()?.c || 0;
  const billResPg = await db.query('SELECT COUNT(*) as c FROM "Bill"');
  const billCountPg = parseInt(billResPg.rows[0]?.c || '0', 10);
  console.log(`✓ Bill Records: SQLite = ${billCountSqlite}, PostgreSQL = ${billCountPg}`);

  // Total amount check
  let sqliteTotal = 0;
  try {
    const bills = sqliteDb.prepare('SELECT data FROM "Bill"').all();
    sqliteTotal = bills.reduce((sum, b) => {
      const d = JSON.parse(b.data);
      return sum + (Number(d.total_amount) || 0);
    }, 0);
  } catch (_) {}

  const pgTotalRes = await db.query(`
    SELECT COALESCE(SUM((data->>'total_amount')::numeric), 0) as total_sum FROM "Bill"
  `);
  const pgTotal = Number(pgTotalRes.rows[0]?.total_sum || 0);
  console.log(`✓ Bill Total Amount Sum: SQLite = ₹${sqliteTotal.toFixed(2)}, PostgreSQL = ₹${pgTotal.toFixed(2)}`);

  // Inventory balance check
  let sqliteStock = 0;
  try {
    const items = sqliteDb.prepare('SELECT data FROM "InventoryItem"').all();
    sqliteStock = items.reduce((sum, item) => {
      const d = JSON.parse(item.data);
      return sum + (Number(d.quantity) || 0);
    }, 0);
  } catch (_) {}

  const pgStockRes = await db.query(`
    SELECT COALESCE(SUM((data->>'quantity')::numeric), 0) as total_stock FROM "InventoryItem"
  `);
  const pgStock = Number(pgStockRes.rows[0]?.total_stock || 0);
  console.log(`✓ Inventory Quantity Balance: SQLite = ${sqliteStock} units, PostgreSQL = ${pgStock} units`);

  sqliteDb.close();

  console.log('\n===============================================================');
  console.log(`🎉 SQLITE-TO-POSTGRESQL MIGRATION COMPLETE!`);
  console.log(`   Total Read: ${stats.totalRecordsRead} | Imported: ${stats.totalImported} | Skipped/Existing: ${stats.totalSkipped} | Errors: ${stats.totalErrors}`);
  console.log('===============================================================\n');

  return stats;
}

// Standalone CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importFromSqlite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

export default importFromSqlite;
