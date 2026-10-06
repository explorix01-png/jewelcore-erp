import { entityService } from '../db/entityService.js';
import { db } from '../db/database.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';

// Helper to resolve user from request headers (Bearer token)
export function getUserFromRequest(req) {
  if (req._user) return req._user;
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers?.['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (!token) return null;

  try {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded === 'object' && decoded.id) {
      return {
        id: decoded.id,
        email: decoded.email || '',
        full_name: decoded.full_name || '',
        role: decoded.role || 'user',
        active_shop_role: decoded.active_shop_role || 'staff',
        onboarding_completed: Boolean(decoded.onboarding_completed)
      };
    }
  } catch (e) {
    // fallback
  }

  return null;
}

export function createEntitiesProxy(service = entityService) {
  return new Proxy({}, {
    get(target, entityName) {
      return {
        get: async (id) => service.get(entityName, id),
        list: async (sort, limit) => service.list(entityName, sort, limit),
        filter: async (query, sort, limit) => service.filter(entityName, query, sort, limit),
        create: async (data) => service.create(entityName, data),
        update: async (id, data) => service.update(entityName, id, data),
        delete: async (id) => service.delete(entityName, id),
        deleteMany: async (query) => service.deleteMany(entityName, query),
        bulkCreate: async (items) => service.bulkCreate(entityName, items),
      };
    }
  });
}

// LLM gateway: Uses GEMINI_API_KEY if present, with graceful deterministic fallbacks
export async function invokeLLM({ prompt, response_json_schema, file_urls }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    try {
      // Call Google Gemini REST endpoint directly
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const parts = [{ text: prompt }];

      if (Array.isArray(file_urls) && file_urls.length > 0) {
        for (const fUrl of file_urls) {
          if (fUrl.startsWith('data:image')) {
            const matches = fUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              parts.push({
                inline_data: {
                  mime_type: matches[1],
                  data: matches[2]
                }
              });
            }
          }
        }
      }

      const bodyPayload = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: response_json_schema
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
    } catch (e) {
      console.warn('Gemini API call failed, using fallback:', e.message);
    }
  }

  // Graceful fallback for barcode reading
  if (prompt.includes('jewellery barcode label')) {
    return { barcode: '' };
  }

  // Graceful fallback for voice assistant intent
  if (prompt.includes('JewelCore jewellery ERP voice assistant')) {
    return {
      intent: 'UNKNOWN',
      reply: 'Voice command received.'
    };
  }

  return {};
}

// Data file extractor using xlsx or csv
export async function extractDataFromUploadedFile({ file_url, json_schema }) {
  let buffer;
  if (file_url.startsWith('http://') || file_url.startsWith('https://')) {
    const res = await fetch(file_url);
    buffer = Buffer.from(await res.arrayBuffer());
  } else if (file_url.startsWith('data:')) {
    const base64Data = file_url.split(',')[1];
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    // Local path
    const localPath = file_url.startsWith('/') ? path.join(process.cwd(), file_url) : file_url;
    buffer = fs.readFileSync(localPath);
  }

  let xlsx;
  try {
    xlsx = await import('xlsx');
  } catch (e) {
    throw new Error('xlsx module required for data extraction');
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(sheet);

  return rows;
}

export function createClientFromRequest(req, options = {}) {
  const user = req._user || getUserFromRequest(req);
  const requestedTenantId = options.tenantId || req._tenantId || null;

  const tenantId = requestedTenantId ? String(requestedTenantId) : null;
  const baseService = options.txClient ? entityService.withTx(options.txClient) : (options.entityService || entityService);
  const scopedService = tenantId ? baseService.forTenant(tenantId) : baseService;
  const entities = createEntitiesProxy(scopedService);

  const client = {
    tenantId,
    auth: {
      me: async () => user,
    },
    entities,
    asServiceRole: {
      entities,
      integrations: {
        Core: {
          InvokeLLM: invokeLLM,
          ExtractDataFromUploadedFile: extractDataFromUploadedFile,
        }
      }
    },
    bindTenant: (tid) => {
      if (!tid) return;
      client.tenantId = String(tid);
      const newScoped = baseService.forTenant(String(tid));
      const newEntities = createEntitiesProxy(newScoped);
      client.entities = newEntities;
      client.asServiceRole.entities = newEntities;
    },
    withTx: (txClient) => createClientFromRequest(req, { ...options, txClient, tenantId: client.tenantId }),
    users: {
      inviteUser: async (email, role) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await db.query(`
            INSERT INTO _auth_users (id, email, role, active_shop_role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [id, email.toLowerCase(), role || 'user', 'staff', now, now]);
        } catch (e) {
          const res = await db.query('SELECT * FROM _auth_users WHERE email = $1', [email.toLowerCase()]);
          if (res.rows[0]) return res.rows[0];
        }
        return { id, email: email.toLowerCase(), role: role || 'user' };
      }
    }
  };

  return client;
}

export default createClientFromRequest;
