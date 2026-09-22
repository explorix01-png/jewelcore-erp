import { db } from './database.js';
import crypto from 'node:crypto';

// Known numeric fields for safe PostgreSQL numeric casting
const NUMERIC_FIELDS = new Set([
  'subtotal', 'discount', 'other_charges', 'hallmarking_charge', 'cgst', 'sgst', 'igst',
  'total_amount', 'paid_amount', 'due_amount', 'gst_rate_snapshot', 'purity_value',
  'gross_weight', 'net_weight', 'wastage_weight', 'wastage_percent', 'fine_weight',
  'making_charges_per_gram', 'making_charges_percent', 'making_charges_fixed', 'making_charge',
  'making_amount', 'metal_value', 'taxable_amount', 'gst_amount', 'total', 'stone_weight',
  'wastage', 'chargeable_weight', 'gst_rate', 'outstanding', 'credit_limit', 'debit_amount',
  'credit_amount', 'rate_per_gram', 'gold_24k_rate', 'silver_rate', 'quantity', 'stock_quantity',
  'opening_stock', 'current_stock', 'amount', 'balance', 'balance_amount', 'invoice_sequence',
  'purity', 'stone_amount', 'total_weight', 'item_price'
]);

function parseSort(sort) {
  if (!sort || typeof sort !== 'string') return null;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : (sort.startsWith('+') ? sort.slice(1) : sort);
  return { field, direction: desc ? 'DESC' : 'ASC' };
}

function buildWhere(query = {}, startParamIndex = 1) {
  const clauses = [];
  const params = [];
  let paramIdx = startParamIndex;

  for (const [key, val] of Object.entries(query)) {
    if (val === undefined) continue;

    if (key === 'id') {
      if (val && typeof val === 'object' && Array.isArray(val.$in)) {
        if (val.$in.length === 0) {
          clauses.push('1 = 0');
        } else {
          const placeholders = val.$in.map(() => `$${paramIdx++}`).join(', ');
          clauses.push(`id IN (${placeholders})`);
          params.push(...val.$in);
        }
      } else {
        clauses.push(`id = $${paramIdx++}`);
        params.push(String(val));
      }
      continue;
    }

    const isNumericField = NUMERIC_FIELDS.has(key);
    const fieldExpr = isNumericField ? `(data->>'${key}')::numeric` : `(data->>'${key}')`;

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (Array.isArray(val.$in)) {
        if (val.$in.length === 0) {
          clauses.push('1 = 0');
        } else {
          const placeholders = val.$in.map(() => `$${paramIdx++}`).join(', ');
          clauses.push(`(data->>'${key}') IN (${placeholders})`);
          params.push(...val.$in.map(v => String(v)));
        }
      } else if (val.$gte !== undefined) {
        clauses.push(`${fieldExpr} >= $${paramIdx++}`);
        params.push(val.$gte);
      } else if (val.$lte !== undefined) {
        clauses.push(`${fieldExpr} <= $${paramIdx++}`);
        params.push(val.$lte);
      } else if (val.$gt !== undefined) {
        clauses.push(`${fieldExpr} > $${paramIdx++}`);
        params.push(val.$gt);
      } else if (val.$lt !== undefined) {
        clauses.push(`${fieldExpr} < $${paramIdx++}`);
        params.push(val.$lt);
      } else if (val.$ne !== undefined) {
        clauses.push(`((data->>'${key}') != $${paramIdx++} OR (data->>'${key}') IS NULL)`);
        params.push(typeof val.$ne === 'boolean' ? String(val.$ne) : String(val.$ne));
      }
    } else if (typeof val === 'boolean') {
      clauses.push(`((data->>'${key}')::boolean = $${paramIdx++})`);
      params.push(val);
    } else if (val === null) {
      clauses.push(`((data->>'${key}') IS NULL)`);
    } else {
      clauses.push(`(data->>'${key}') = $${paramIdx++}`);
      params.push(String(val));
    }
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

const GLOBAL_ENTITIES = new Set(['_migrations', '_auth_users', 'User']);

export function createEntityService(queryRunner = db.query, isTx = false, tenantId = null) {
  const service = {
    tenantId: tenantId ? String(tenantId) : null,

    async get(entityName, id) {
      if (!id) return null;
      let sql;
      let params;
      if (tenantId && !GLOBAL_ENTITIES.has(entityName)) {
        sql = `SELECT data FROM "${entityName}" WHERE id = $1 AND (data->>'tenant_id' = $2) LIMIT 1`;
        params = [String(id), String(tenantId)];
      } else {
        sql = `SELECT data FROM "${entityName}" WHERE id = $1 LIMIT 1`;
        params = [String(id)];
      }
      const res = await queryRunner(sql, params);
      if (!res.rows || res.rows.length === 0) return null;
      const row = res.rows[0];
      return typeof row.data === 'object' ? row.data : JSON.parse(row.data);
    },

    async list(entityName, sort = '-created_date', limit = 100) {
      return this.filter(entityName, {}, sort, limit);
    },

    async filter(entityName, query = {}, sort = '-created_date', limit = 100) {
      const effectiveQuery = (tenantId && !GLOBAL_ENTITIES.has(entityName))
        ? { ...query, tenant_id: String(tenantId) }
        : query;

      const { where, params } = buildWhere(effectiveQuery);
      let sql = `SELECT data FROM "${entityName}" ${where}`;
      const s = parseSort(sort);
      if (s) {
        if (s.field === 'id' || s.field === 'created_date' || s.field === 'updated_date') {
          sql += ` ORDER BY ${s.field} ${s.direction}`;
        } else if (NUMERIC_FIELDS.has(s.field)) {
          sql += ` ORDER BY (data->>'${s.field}')::numeric ${s.direction} NULLS LAST`;
        } else {
          sql += ` ORDER BY (data->>'${s.field}') ${s.direction} NULLS LAST`;
        }
      }
      if (limit && Number(limit) > 0) {
        sql += ` LIMIT ${Number(limit)}`;
      }
      const res = await queryRunner(sql, params);
      return (res.rows || []).map(r => (typeof r.data === 'object' ? r.data : JSON.parse(r.data)));
    },

    async create(entityName, data = {}) {
      const id = data.id || crypto.randomUUID();
      const now = new Date().toISOString();
      const item = {
        ...data,
        ...(tenantId && !GLOBAL_ENTITIES.has(entityName) ? { tenant_id: String(tenantId) } : {}),
        ...(tenantId && entityName === 'ShopMembership' ? { shop_id: String(tenantId) } : {}),
        id,
        created_date: data.created_date || now,
        updated_date: now
      };
      const jsonStr = JSON.stringify(item);
      await queryRunner(
        `INSERT INTO "${entityName}" (id, created_date, updated_date, data) VALUES ($1, $2, $3, $4::jsonb)`,
        [id, item.created_date, item.updated_date, jsonStr]
      );
      return item;
    },

    async update(entityName, id, updates = {}) {
      if (!id) throw new Error('ID required for update');
      const existing = await this.get(entityName, id);
      if (!existing) throw new Error(`${entityName} not found with id ${id}`);
      const now = new Date().toISOString();
      const merged = {
        ...existing,
        ...updates,
        ...(tenantId && !GLOBAL_ENTITIES.has(entityName) ? { tenant_id: String(tenantId) } : {}),
        id,
        created_date: existing.created_date || now,
        updated_date: now
      };
      const jsonStr = JSON.stringify(merged);
      if (tenantId && !GLOBAL_ENTITIES.has(entityName)) {
        await queryRunner(
          `UPDATE "${entityName}" SET updated_date = $1, data = $2::jsonb WHERE id = $3 AND (data->>'tenant_id' = $4)`,
          [now, jsonStr, String(id), String(tenantId)]
        );
      } else {
        await queryRunner(
          `UPDATE "${entityName}" SET updated_date = $1, data = $2::jsonb WHERE id = $3`,
          [now, jsonStr, String(id)]
        );
      }
      return merged;
    },

    async delete(entityName, id) {
      if (!id) return { success: false };
      if (tenantId && !GLOBAL_ENTITIES.has(entityName)) {
        await queryRunner(`DELETE FROM "${entityName}" WHERE id = $1 AND (data->>'tenant_id' = $2)`, [String(id), String(tenantId)]);
      } else {
        await queryRunner(`DELETE FROM "${entityName}" WHERE id = $1`, [String(id)]);
      }
      return { success: true, id };
    },

    async deleteMany(entityName, query = {}) {
      const effectiveQuery = (tenantId && !GLOBAL_ENTITIES.has(entityName))
        ? { ...query, tenant_id: String(tenantId) }
        : query;
      const { where, params } = buildWhere(effectiveQuery);
      const sql = `DELETE FROM "${entityName}" ${where}`;
      await queryRunner(sql, params);
      return { success: true };
    },

    async bulkCreate(entityName, items = []) {
      if (!Array.isArray(items) || items.length === 0) return [];
      const now = new Date().toISOString();

      const runInserts = async (qRunner) => {
        const createdList = [];
        for (const item of items) {
          const id = item.id || crypto.randomUUID();
          const obj = {
            ...item,
            ...(tenantId && !GLOBAL_ENTITIES.has(entityName) ? { tenant_id: String(tenantId) } : {}),
            ...(tenantId && entityName === 'ShopMembership' ? { shop_id: String(tenantId) } : {}),
            id,
            created_date: item.created_date || now,
            updated_date: now
          };
          await qRunner(
            `INSERT INTO "${entityName}" (id, created_date, updated_date, data) VALUES ($1, $2, $3, $4::jsonb)`,
            [id, obj.created_date, obj.updated_date, JSON.stringify(obj)]
          );
          createdList.push(obj);
        }
        return createdList;
      };

      if (isTx) {
        return runInserts(queryRunner);
      } else {
        return db.transaction(async (txClient) => {
          return runInserts(txClient.query.bind(txClient));
        });
      }
    },

    forTenant(tid) {
      return createEntityService(queryRunner, isTx, tid);
    },

    withTx(txClient) {
      const runner = txClient.query.bind(txClient);
      return createEntityService(runner, true, tenantId);
    }
  };

  return service;
}

export const entityService = createEntityService(db.query);
export default entityService;
