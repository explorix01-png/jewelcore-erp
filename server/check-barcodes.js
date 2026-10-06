import { db } from './db/database.js';

async function check() {
  const r = await db.query(`
    SELECT id,
           data->>'item_name' as name,
           data->>'barcode' as barcode,
           data->>'item_code' as code,
           data->>'metal_type' as metal,
           data->>'quantity' as qty,
           data->>'tenant_id' as tenant
    FROM "InventoryItem"
    LIMIT 20
  `);
  console.log('Inventory items count:', r.rows.length);
  console.log(r.rows);
  await db.close();
}
check();
