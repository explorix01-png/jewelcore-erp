import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './database.js';
import { initSchema, ENTITY_TABLES } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Base44 Production Data Ingestion Utility
 * 
 * Safely ingests JSON or JSONL entity exports from Base44 into PostgreSQL.
 * If no export directory is present, provides clear instructions on where to place
 * exported Base44 datasets without inventing or fabricating records.
 */
export async function importFromBase44(options = {}) {
  const {
    exportDir = path.resolve(__dirname, '../data/base44_export'),
    backupDir = path.resolve(__dirname, '../data/backups'),
    overwriteExisting = false
  } = options;

  console.log('===============================================================');
  console.log('📦 JEWELCORE ERP BASE44-TO-POSTGRESQL DATA INGESTION UTILITY');
  console.log('===============================================================');

  if (!fs.existsSync(exportDir)) {
    console.log(`\nℹ️  [Base44 Import] No Base44 export folder found at: ${exportDir}`);
    console.log('   Status: Base44 live production data has NOT been migrated because no exported files were found.');
    console.log('\n   To import live Base44 data when exported:');
    console.log(`   1. Create directory: ${exportDir}`);
    console.log('   2. Place exported entity JSON/JSONL files named by entity (e.g. Bill.json, Customer.json, InventoryItem.json)');
    console.log('   3. Run: npm run db:import:base44\n');
    return {
      success: true,
      importedCount: 0,
      message: 'Base44 export directory not found; no data imported.'
    };
  }

  // Ensure PostgreSQL schema is initialized
  await initSchema();

  const stats = {
    tablesProcessed: 0,
    totalRecordsRead: 0,
    totalImported: 0,
    totalSkipped: 0,
    totalErrors: 0,
    byTable: {}
  };

  const files = fs.readdirSync(exportDir);
  console.log(`Found ${files.length} files in export directory.`);

  for (const table of ENTITY_TABLES) {
    const matchingFile = files.find(f => 
      f.toLowerCase() === `${table.toLowerCase()}.json` || 
      f.toLowerCase() === `${table.toLowerCase()}.jsonl`
    );

    if (!matchingFile) continue;

    stats.byTable[table] = { read: 0, imported: 0, skipped: 0, errors: 0 };
    stats.tablesProcessed++;

    const filePath = path.join(exportDir, matchingFile);
    const content = fs.readFileSync(filePath, 'utf-8');

    let records = [];
    if (matchingFile.endsWith('.jsonl')) {
      records = content.split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
    } else {
      const parsed = JSON.parse(content);
      records = Array.isArray(parsed) ? parsed : (parsed.records || parsed.items || []);
    }

    stats.byTable[table].read = records.length;
    stats.totalRecordsRead += records.length;

    for (const record of records) {
      try {
        const id = record.id;
        if (!id) {
          stats.totalErrors++;
          stats.byTable[table].errors++;
          console.warn(`[Base44 Import] Skipping record in ${table} missing primary key "id"`);
          continue;
        }

        const now = new Date().toISOString();
        const createdDate = record.created_date || record.created_at || now;
        const updatedDate = record.updated_date || record.updated_at || now;

        const conflictClause = overwriteExisting
          ? 'ON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date, data = EXCLUDED.data'
          : 'ON CONFLICT (id) DO NOTHING';

        const res = await db.query(`
          INSERT INTO "${table}" (id, created_date, updated_date, data)
          VALUES ($1, $2, $3, $4::jsonb)
          ${conflictClause}
        `, [String(id), createdDate, updatedDate, JSON.stringify(record)]);

        if (res.rowCount > 0) {
          stats.totalImported++;
          stats.byTable[table].imported++;
        } else {
          stats.totalSkipped++;
          stats.byTable[table].skipped++;
        }
      } catch (err) {
        stats.totalErrors++;
        stats.byTable[table].errors++;
        console.error(`[Base44 Import Error] ${table} (${record.id}):`, err.message);
      }
    }
  }

  console.log('\n===============================================================');
  console.log(`🎉 BASE44 DATA INGESTION COMPLETE!`);
  console.log(`   Read: ${stats.totalRecordsRead} | Imported: ${stats.totalImported} | Skipped/Existing: ${stats.totalSkipped} | Errors: ${stats.totalErrors}`);
  console.log('===============================================================\n');

  return stats;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importFromBase44()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Base44 import failed:', err);
      process.exit(1);
    });
}

export default importFromBase44;
