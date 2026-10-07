import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { db } from './db/database.js';
import { initSchema, ENTITY_TABLES } from './db/schema.js';
import { entityService } from './db/entityService.js';
import { getUserFromRequest } from './shared/createClient.js';
import { requestLogger } from './middleware/requestLogger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'jewelcore-erp-secret-key-2026');

if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === 'jewelcore-erp-secret-key-2026' || JWT_SECRET === 'replace_with_a_secure_random_jwt_secret_key' || JWT_SECRET.length < 16) {
    console.error('FATAL: A strong, random JWT_SECRET (minimum 16 characters) is required in production! Server cannot start with insecure secret.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is required in production mode! Server cannot start without production database connection string.');
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;

const app = express();

// Trust reverse proxy for HTTPS offloading (Nginx, Caddy, Cloudflare, Render, Traefik, etc.)
app.set('trust proxy', 1);

const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin && corsOrigin !== '*') {
  const allowedOrigins = corsOrigin.split(',').map(s => s.trim());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
} else {
  app.use(cors());
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request start/end logging with response time (API routes only)
app.use('/api', requestLogger);

// Ensure upload directories exist (configurable for persistent volume mounts)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer storage setup for uploads with file size & type validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /\.(jpg|jpeg|png|webp|gif|svg|pdf|csv|xlsx|xls|txt|json)$/i;
    if (allowedExts.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, GIF, SVG, PDF, CSV, XLSX, XLS, TXT, JSON.'));
    }
  }
});

// Simple in-memory rate limiter for auth endpoints (prevents brute force)
const authAttempts = new Map();
const rateLimitAuth = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxAttempts = 60; // 60 attempts per minute

  let record = authAttempts.get(ip);
  if (!record || now - record.startTime > windowMs) {
    record = { count: 1, startTime: now };
    authAttempts.set(ip, record);
  } else {
    record.count++;
    if (record.count > maxAttempts) {
      return res.status(429).json({ error: 'Too many authentication requests. Please try again later.' });
    }
  }
  next();
};

// Auth Middleware: attaches user to req if token present (async PostgreSQL lookup)
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userRes = await db.query('SELECT * FROM _auth_users WHERE id = $1', [decoded.id]);
      const row = userRes.rows[0];
      if (row) {
        req._user = {
          id: row.id,
          email: row.email,
          full_name: row.full_name,
          role: row.role,
          active_shop_role: row.active_shop_role,
          onboarding_completed: Boolean(row.onboarding_completed)
        };
      }
    } catch (_) {
      // Insecure raw token/email fallback strictly blocked
      req._user = null;
    }
  }

  // Multi-tenant resolution & security gate
  if (req._user) {
    const rawTenantHeader = req.headers['x-tenant-id'] || req.headers['x-shop-id'];
    let verifiedTenantId = null;

    if (rawTenantHeader) {
      // Validate membership in the requested shop
      const memRes = await db.query(`
        SELECT data FROM "ShopMembership"
        WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
          AND (data->>'tenant_id' = $3 OR data->>'shop_id' = $3)
          AND (data->>'is_active')::boolean = true
        LIMIT 1
      `, [req._user.id, req._user.email || '', String(rawTenantHeader)]);

      if (memRes.rows.length > 0) {
        verifiedTenantId = String(rawTenantHeader);
        const memRole = memRes.rows[0].data?.role;
        if (memRole) req._user.active_shop_role = memRole;
      } else if (req._user.role === 'admin') {
        // Platform super-admin can access any existing shop
        const shopRes = await db.query(`SELECT id FROM "ShopSettings" WHERE id = $1 LIMIT 1`, [String(rawTenantHeader)]);
        if (shopRes.rows.length > 0) {
          verifiedTenantId = String(rawTenantHeader);
          req._user.active_shop_role = 'admin';
        }
      }
    }

    // If no tenant verified yet, fallback to user's first active membership
    if (!verifiedTenantId) {
      const firstMem = await db.query(`
        SELECT data FROM "ShopMembership"
        WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
          AND (data->>'is_active')::boolean = true
        ORDER BY created_date ASC
        LIMIT 1
      `, [req._user.id, req._user.email || '']);

      if (firstMem.rows.length > 0) {
        verifiedTenantId = firstMem.rows[0].data?.tenant_id || firstMem.rows[0].data?.shop_id;
        const memRole = firstMem.rows[0].data?.role;
        if (memRole) req._user.active_shop_role = memRole;
      } else if (req._user.role === 'admin') {
        const firstShop = await db.query(`SELECT id FROM "ShopSettings" ORDER BY created_date ASC LIMIT 1`);
        if (firstShop.rows.length > 0) {
          verifiedTenantId = firstShop.rows[0].id;
          req._user.active_shop_role = 'admin';
        }
      }
    }

    req._tenantId = verifiedTenantId ? String(verifiedTenantId) : null;
  }
  next();
});

// -------------------------------------------------------------
// HEALTH ENDPOINT (with database diagnostics)
// -------------------------------------------------------------

app.get('/api/health', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const statusCode = dbHealth.ok ? 200 : 503;
  return res.status(statusCode).json({
    ok: dbHealth.ok,
    version: '1.0.0',
    database: dbHealth,
    time: new Date().toISOString()
  });
});

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------

app.post('/api/auth/register', rateLimitAuth, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    const existingRes = await db.query('SELECT id FROM _auth_users WHERE email = $1', [cleanEmail]);
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const id = crypto.randomUUID();
    const password_hash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    // First user becomes super admin
    const countRes = await db.query('SELECT COUNT(*) as count FROM _auth_users');
    const isFirstUser = parseInt(countRes.rows[0]?.count || '0', 10) === 0;
    const role = req.body.role || (isFirstUser ? 'admin' : 'user');
    const active_shop_role = req.body.active_shop_role || (role === 'admin' ? 'admin' : (isFirstUser ? 'admin' : 'staff'));

    await db.query(`
      INSERT INTO _auth_users (id, email, password_hash, full_name, role, active_shop_role, onboarding_completed, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [id, cleanEmail, password_hash, full_name || '', role, active_shop_role, false, now, now]);

    // Mirror to User entity
    await entityService.create('User', {
      id,
      email: cleanEmail,
      full_name: full_name || '',
      role,
      active_shop_role,
      onboarding_completed: false
    });

    const token = jwt.sign({ id, email: cleanEmail, role, active_shop_role }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({
      success: true,
      token,
      user: { id, email: cleanEmail, full_name: full_name || '', role, active_shop_role, onboarding_completed: false }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// In-memory OTP storage for registration / password resets
const otpMap = new Map();

app.post('/api/auth/verify-otp', rateLimitAuth, async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(otpCode || '').trim();

    if (!cleanEmail || !cleanCode) {
      return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    const storedOtp = otpMap.get(cleanEmail);
    if (!storedOtp || storedOtp.otp !== cleanCode || Date.now() > storedOtp.exp) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }
    otpMap.delete(cleanEmail);

    const userRes = await db.query('SELECT * FROM _auth_users WHERE email = $1', [cleanEmail]);
    const userRow = userRes.rows[0];
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role, active_shop_role: userRow.active_shop_role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({
      success: true,
      access_token: token,
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        full_name: userRow.full_name,
        role: userRow.role,
        active_shop_role: userRow.active_shop_role,
        onboarding_completed: Boolean(userRow.onboarding_completed)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/resend-otp', rateLimitAuth, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpMap.set(String(email).trim().toLowerCase(), { otp, exp: Date.now() + 10 * 60 * 1000 });
  console.log(`[AUTH] Resent OTP for ${email}: ${otp}`);
  return res.json({ success: true, message: 'OTP sent' });
});

app.post('/api/auth/reset-password-request', rateLimitAuth, (req, res) => {
  const { email } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return res.status(400).json({ error: 'Email required' });
  const resetToken = crypto.randomUUID();
  otpMap.set(resetToken, { email: cleanEmail, exp: Date.now() + 60 * 60 * 1000 });
  console.log(`[AUTH] Password reset requested for ${cleanEmail}. Token: ${resetToken}`);
  return res.json({ success: true, message: 'If an account exists, a reset link was generated', token: resetToken });
});

app.post('/api/auth/reset-password', rateLimitAuth, async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) return res.status(400).json({ error: 'Reset token and new password are required' });
  const item = otpMap.get(resetToken);
  if (!item || Date.now() > item.exp) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
  const email = item.email;
  if (email) {
    const password_hash = bcrypt.hashSync(newPassword, 10);
    await db.query('UPDATE _auth_users SET password_hash = $1, updated_at = $2 WHERE email = $3', [
      password_hash,
      new Date().toISOString(),
      email
    ]);
    otpMap.delete(resetToken);
  }
  return res.json({ success: true, message: 'Password updated successfully' });
});

// App public settings stub for backward compatibility
app.get('/api/apps/public/prod/public-settings/by-id/:appId', (req, res) => {
  return res.json({
    id: req.params.appId,
    public_settings: { auth_required: true }
  });
});

app.post('/api/auth/login', rateLimitAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const userRes = await db.query('SELECT * FROM _auth_users WHERE email = $1', [cleanEmail]);
    const userRow = userRes.rows[0];
    if (!userRow) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (userRow.password_hash) {
      const match = bcrypt.compareSync(password, userRow.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role, active_shop_role: userRow.active_shop_role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      access_token: token,
      user: {
        id: userRow.id,
        email: userRow.email,
        full_name: userRow.full_name,
        role: userRow.role,
        active_shop_role: userRow.active_shop_role,
        onboarding_completed: Boolean(userRow.onboarding_completed)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req._user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json(req._user);
});

app.post('/api/auth/logout', (req, res) => {
  return res.json({ success: true });
});

// Multi-tenant shop listing & switching
app.get('/api/auth/my-shops', async (req, res) => {
  if (!req._user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const memRes = await db.query(`
      SELECT data FROM "ShopMembership"
      WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
        AND (data->>'is_active')::boolean = true
      ORDER BY created_date ASC
    `, [req._user.id, req._user.email || '']);

    const shops = [];
    const seen = new Set();
    for (const row of memRes.rows) {
      const sId = row.data?.tenant_id || row.data?.shop_id;
      if (!sId || seen.has(sId)) continue;
      seen.add(sId);
      const shopRes = await db.query('SELECT data FROM "ShopSettings" WHERE id = $1 LIMIT 1', [sId]);
      if (shopRes.rows.length > 0) {
        shops.push({
          id: sId,
          shop_name: shopRes.rows[0].data?.shop_name || row.data?.shop_name,
          role: row.data?.role || 'staff',
          status: row.data?.status || 'active',
          logo_url: shopRes.rows[0].data?.logo_url || ''
        });
      }
    }

    if (req._user.role === 'admin' && shops.length === 0) {
      const allShops = await db.query('SELECT id, data FROM "ShopSettings"');
      for (const s of allShops.rows) {
        shops.push({
          id: s.id,
          shop_name: s.data?.shop_name,
          role: 'admin',
          status: 'active',
          logo_url: s.data?.logo_url || ''
        });
      }
    }

    return res.json({ success: true, shops, active_tenant_id: req._tenantId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/switch-shop', async (req, res) => {
  if (!req._user) return res.status(401).json({ error: 'Unauthorized' });
  const { shop_id } = req.body;
  if (!shop_id) return res.status(400).json({ error: 'shop_id is required' });

  try {
    // Verify user has active membership in this shop
    const memRes = await db.query(`
      SELECT data FROM "ShopMembership"
      WHERE (data->>'user_id' = $1 OR lower(data->>'user_email') = lower($2))
        AND (data->>'tenant_id' = $3 OR data->>'shop_id' = $3)
        AND (data->>'is_active')::boolean = true
      LIMIT 1
    `, [req._user.id, req._user.email || '', String(shop_id)]);

    if (memRes.rows.length === 0 && req._user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have access to this shop' });
    }

    const shopRes = await db.query('SELECT data FROM "ShopSettings" WHERE id = $1 LIMIT 1', [String(shop_id)]);
    if (shopRes.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const activeRole = memRes.rows[0]?.data?.role || (req._user.role === 'admin' ? 'admin' : 'staff');
    return res.json({
      success: true,
      shop_id: String(shop_id),
      shop_name: shopRes.rows[0].data?.shop_name,
      role: activeRole
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// FILE UPLOAD ENDPOINT
// -------------------------------------------------------------

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  return res.json({ file_url: fileUrl, filename: req.file.filename });
});

// Backward compatibility for public settings
app.get('/api/apps/public/prod/public-settings/by-id/:id', (req, res) => {
  return res.json({ id: req.params.id, public_settings: {} });
});

// -------------------------------------------------------------
// GENERIC ENTITY CRUD ROUTER (Tenant-Isolated Async PostgreSQL)
// -------------------------------------------------------------

// Entity authentication & multi-tenant isolation middleware
const requireEntityAuth = (req, res, next) => {
  if (!req._user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }
  const { entity } = req.params;
  const isGlobal = entity === 'User' || entity === '_auth_users';
  if (!isGlobal && !req._tenantId) {
    return res.status(403).json({ error: 'Forbidden: Active shop/tenant context required for tenant-scoped operations' });
  }
  next();
};

function getScopedService(req, entity) {
  const isGlobal = entity === 'User' || entity === '_auth_users';
  if (isGlobal) {
    return entityService;
  }
  if (!req._tenantId) {
    throw new Error('Active shop/tenant context required');
  }
  return entityService.forTenant(req._tenantId);
}

app.get('/api/entities/:entity', requireEntityAuth, async (req, res) => {
  try {
    const { entity } = req.params;
    const { sort = '-created_date', limit = 100 } = req.query;
    if (entity === 'User' && req._user.role !== 'admin') {
      const user = await entityService.get('User', req._user.id);
      return res.json(user ? [user] : []);
    }
    const svc = getScopedService(req, entity);
    const list = await svc.list(entity, sort, Number(limit));
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/entities/:entity/filter', requireEntityAuth, async (req, res) => {
  try {
    const { entity } = req.params;
    const { query = {}, sort = '-created_date', limit = 100 } = req.body;
    if (entity === 'User' && req._user.role !== 'admin') {
      const user = await entityService.get('User', req._user.id);
      return res.json(user ? [user] : []);
    }
    const svc = getScopedService(req, entity);
    const list = await svc.filter(entity, query, sort, Number(limit));
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/entities/:entity/:id', requireEntityAuth, async (req, res) => {
  try {
    const { entity, id } = req.params;
    if (entity === 'User' && req._user.role !== 'admin' && id !== req._user.id) {
      return res.status(403).json({ error: 'Forbidden: You can only view your own profile' });
    }
    const svc = getScopedService(req, entity);
    const item = await svc.get(entity, id);
    if (!item) return res.status(404).json({ error: `${entity} not found` });
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/entities/:entity', requireEntityAuth, async (req, res) => {
  try {
    const { entity } = req.params;
    const userRole = req._user.active_shop_role || req._user.role;
    if (['ShopSettings', 'ShopMembership'].includes(entity) && userRole !== 'admin') {
      return res.status(403).json({ error: `Permission denied: ${userRole} cannot create ${entity}` });
    }
    const svc = getScopedService(req, entity);
    const created = await svc.create(entity, req.body);
    return res.json(created);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/entities/:entity/:id', requireEntityAuth, async (req, res) => {
  try {
    const { entity, id } = req.params;
    const userRole = req._user.active_shop_role || req._user.role;
    if (entity === 'ShopSettings' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied: only administrators can update ShopSettings' });
    }
    if (entity === 'ShopMembership' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied: only administrators can modify memberships' });
    }
    const svc = getScopedService(req, entity);
    const existing = await svc.get(entity, id);
    if (!existing) {
      return res.status(404).json({ error: `${entity} not found` });
    }
    const updated = await svc.update(entity, id, req.body);
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/entities/:entity/:id', requireEntityAuth, async (req, res) => {
  try {
    const { entity, id } = req.params;
    const userRole = req._user.active_shop_role || req._user.role;
    if (entity === 'Bill') {
      return res.status(403).json({ error: 'Direct deletion of bills is prohibited. Use the authorized deleteBill function to preserve inventory and financial audit integrity.' });
    }
    if (userRole !== 'admin') {
      return res.status(403).json({ error: `Permission denied: only administrators can delete ${entity} records` });
    }
    const svc = getScopedService(req, entity);
    const existing = await svc.get(entity, id);
    if (!existing) {
      return res.status(404).json({ error: `${entity} not found` });
    }
    await svc.delete(entity, id);
    return res.json({ success: true, id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/entities/:entity/bulk-create', requireEntityAuth, async (req, res) => {
  try {
    const { entity } = req.params;
    const items = Array.isArray(req.body) ? req.body : req.body.items || [];
    const svc = getScopedService(req, entity);
    const created = await svc.bulkCreate(entity, items);
    return res.json(created);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/entities/:entity/delete-many', requireEntityAuth, async (req, res) => {
  try {
    const { entity } = req.params;
    const userRole = req._user.active_shop_role || req._user.role;
    if (entity === 'Bill') {
      return res.status(403).json({ error: 'Direct bulk deletion of bills is prohibited. Use the authorized deleteBill function.' });
    }
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied: only administrators can perform bulk deletions' });
    }
    const svc = getScopedService(req, entity);
    await svc.deleteMany(entity, req.body.query || req.body);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// FUNCTION INVOCATION ROUTER (29 ERP Business Actions)
// -------------------------------------------------------------

// Dynamically cache imported function handlers
const functionHandlers = new Map();

app.post('/api/functions/:name', async (req, res) => {
  const functionName = req.params.name;
  try {
    let handler = functionHandlers.get(functionName);
    if (!handler) {
      const funcPath = path.join(__dirname, 'functions', `${functionName}.js`);
      if (!fs.existsSync(funcPath)) {
        return res.status(404).json({ error: `Function ${functionName} not found` });
      }
      const mod = await import(`file:///${funcPath.replace(/\\/g, '/')}`);
      handler = mod.default;
      functionHandlers.set(functionName, handler);
    }

    // Create a fetch-like Request adapter for the function handler
    const reqAdapter = {
      _user: req._user,
      _tenantId: req._tenantId,
      headers: req.headers,
      json: async () => req.body || {},
    };

    const response = await handler(reqAdapter);

    // Unpack Fetch Response or raw object
    if (response instanceof Response) {
      const status = response.status || 200;
      const data = await response.json();
      return res.status(status).json(data);
    } else if (response && typeof response.json === 'function') {
      const data = await response.json();
      return res.status(response.status || 200).json(data);
    } else {
      return res.json(response);
    }
  } catch (error) {
    console.error(`Error executing function ${functionName}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

// Public bill viewer route
app.get('/api/public/bill/:token', async (req, res) => {
  try {
    const { token } = req.params;
    let handler = functionHandlers.get('getPublicBill');
    if (!handler) {
      const mod = await import(`file:///${path.join(__dirname, 'functions', 'getPublicBill.js').replace(/\\/g, '/')}`);
      handler = mod.default;
      functionHandlers.set('getPublicBill', handler);
    }
    const reqAdapter = {
      _user: null,
      headers: req.headers,
      json: async () => ({ token })
    };
    const response = await handler(reqAdapter);
    const data = await response.json();
    return res.status(response.status || 200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// PRODUCTION STATIC FRONTEND (Single Production URL)
// -------------------------------------------------------------
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Start listening and initialize schema
const server = app.listen(PORT, '0.0.0.0', async () => {
  try {
    await initSchema();
    if (!isProduction) {
      try {
        const { seedLocalAdmin } = await import('./db/seedAdmin.js');
        await seedLocalAdmin();
      } catch (seedErr) {
        console.warn('[Seed Admin Warning]', seedErr.message);
      }
    }
    console.log(`[JewelCore ERP Server] Running on http://localhost:${PORT}`);
    console.log(`[Database] PostgreSQL ready (${db.getEngine()})`);
  } catch (err) {
    console.error('[Database Init Error]', err);
  }
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received. Gracefully closing...');
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received. Gracefully closing...');
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
});

export default app;
