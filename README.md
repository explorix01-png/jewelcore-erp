# JewelCore ERP (Self-Hosted, Multi-Tenant & PostgreSQL Production Ready)

Complete Jewelry Enterprise Resource Planning (ERP) System migrated away from Base44 to an independent, self-hosted Node.js + PostgreSQL backend with an installable Progressive Web App (PWA) React + Vite frontend.

All existing business logic, workflows, validations, calculation engines (gold 24K model, wastage, making charges, fine weight, GST, customer outstanding, due reminders), invoice printing, barcode handling, and WhatsApp sharing have been 100% preserved.

---

## Architecture Overview

1. **Frontend (`src/`):**
   - React 18, Vite 6, TailwindCSS, Radix UI, TanStack React Query.
   - PWA: Web App Manifest (`public/manifest.json`), service worker (`public/sw.js`), install prompt (`PWAInstallButton.jsx`), and offline fallback shell (`public/offline.html`).
   - Secure Multi-Shop Switcher (`ShopSwitcher.jsx`) managing authenticated active shop context.
   - Decoupled from `@base44/sdk`. Client requests use `src/api/client.js` with zero Base44 runtime dependencies.

2. **Backend Server (`server/server.js`):**
   - Express.js API running on port 3001 (or Render port 10000).
   - Canonical PostgreSQL database engine via connection pooling (`pg.Pool`) using `DATABASE_URL` in production, with embedded PostgreSQL (`PGlite`) for zero-dependency local development and testing.
   - Complete document database schema with JSONB expressions and B-Tree indexes on `((data->>'tenant_id'))` for all 29 entity tables.
   - Multi-tenant data isolation: all CRUD operations and 29 backend functions are scoped strictly by authenticated server-verified `tenant_id`. Forged tenant headers are sanitized against PostgreSQL `ShopMembership`.
   - Atomic database transactions (`db.transaction` and `entityService.withTx`) for financial operations (billing, purchases, inventory).
   - JWT authentication (`/api/auth/*`) with bcrypt password hashing and session resolution.
   - File upload endpoint (`/api/upload`) storing to persistent storage with MIME type enforcement.
   - Public bill verification (`/api/public/bill/:token`).
   - Health check endpoint at `GET /api/health` providing database connectivity and query latency telemetry.

---

## Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
For local development, if `DATABASE_URL` is omitted, the server automatically initializes embedded PostgreSQL (`PGlite`) in `./server/data/pgdata`.

### 3. Run Migrations
```bash
npm run db:migrate
```

### 4. Run Development Servers
```bash
# Terminal 1: Backend API
npm run server

# Terminal 2: Vite Frontend
npm run dev
```

### 5. Production Build & Start
```bash
npm run build
npm start
```

---

## CI/CD Pipeline (GitHub Actions)

A full continuous integration pipeline is defined in `.github/workflows/ci.yml`. It runs on every pull request and push to the `main` branch.

### Workflow Pipeline Steps:
1. `npm ci`: Clean install of dependencies from `package-lock.json`.
2. `npm run lint`: Static code analysis using ESLint.
3. `npm run typecheck`: TypeScript verification using `jsconfig.json`.
4. `npm run test:multitenancy`: 11 multi-tenant security and cross-tenant isolation checks.
5. `npm run test:postgres`: 10 PostgreSQL transaction, indexing, and precision checks.
6. `npm run test:backend`: 16 end-to-end backend business logic tests.
7. `npm run build`: Vite production asset compilation and bundle verification.

The pipeline utilizes a native `postgres:16-alpine` service container with automated health checks. Any failing check immediately halts the pipeline.

---

## Render Staging Deployment

The repository includes a ready-to-deploy Render Blueprint in `render.yaml`.

### Render Service Specifications
| Resource | Name | Type / Plan | Disk / Storage | Monthly Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Web Service** | `jewelcore-erp-staging` | Web (Node.js) / Starter | 10 GB Persistent Disk | $9.50 ($7 + $2.50) |
| **Database** | `jewelcore-db-staging` | Managed PostgreSQL / Starter | 10 GB Storage (Automated Backups) | $7.00 |
| **Total Staging**| | | | **~$16.50/mo** |

*(Note: In production with Standard plan, Web Service is $25/mo, Managed PostgreSQL with Point-in-time recovery is $20/mo, and 10 GB disk is $2.50/mo, totaling ~$47.50/mo).*

### Required Environment Variables

| Variable Name | Required | Description | Value Source |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | Execution mode (`production`) | Set in `render.yaml` |
| `PORT` | **Yes** | Port to listen on (Render uses `10000`) | Set in `render.yaml` |
| `JWT_SECRET` | **Yes** | Cryptographic key for session signing | `generateValue: true` (Render managed) |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `fromDatabase: jewelcore-db-staging` |
| `UPLOADS_DIR` | Optional | Path to persistent disk mount (`/opt/render/project/src/uploads`) | Set in `render.yaml` |
| `PG_MAX_CONNECTIONS`| Optional | Max pool connections (default: `20`) | Optional |
| `GEMINI_API_KEY` | Optional | Google Gemini key for voice assistant | Optional secret |

### Step-by-Step Staging Setup:
1. Initialize git and push the codebase to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "feat: jewelcore erp multi-tenant pwa staging release"
   git branch -M main
   git remote add origin https://github.com/<your-org>/<your-repo>.git
   git push -u origin main
   ```
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Connect your GitHub repository and select the repository.
5. Render will detect `render.yaml` and display the resources:
   - Web Service: `jewelcore-erp-staging`
   - Managed Database: `jewelcore-db-staging`
   - Persistent Disk: `jewelcore-staging-uploads`
6. Click **Apply Blueprint**.
7. Once provisioned, Render automatically compiles the frontend and boots the web server.

---

## Safe Database Migrations & Rollbacks

### Initial Migration Execution
Migrations in JewelCore are strictly **additive, non-destructive, and idempotent**.
On service boot, `server/server.js` calls `initSchema()`, which automatically runs pending migrations tracked in the `_migrations` table:
- `0001_initial_postgresql_schema`: Generates `_auth_users` and all 29 entity tables with JSONB indexes.
- `0002_multi_tenant_backfill`: Safely associates untagged records with the tenant ID and adds tenant indexes.

To run migrations manually before traffic:
```bash
npm run db:migrate
```

### Database Backup & Restore

#### 1. Automated Render Backups
Render automatically takes daily snapshots of Managed PostgreSQL databases (retained for 7 days on Starter, 30 days on Standard).
To restore from Render Dashboard:
- Go to **Databases** -> `jewelcore-db-staging` -> **Backups** tab.
- Choose a timestamp and click **Restore**.

#### 2. Manual CLI Backup (`pg_dump`)
```bash
pg_dump "$DATABASE_URL" -F c -b -v -f "backup_jewelcore_$(date +%Y%m%d_%H%M%S).dump"
```

#### 3. Manual CLI Restore (`pg_restore`)
```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" -v "backup_jewelcore_<filename>.dump"
```

### Application Deployment Rollback
- In Render Dashboard -> Web Service -> **Deploys** tab:
  Click **Rollback** on any previous successful deploy. Render switches traffic in <30 seconds without rebuilding.
- **Migration Rollback Limitations**: Because migrations are additive and use JSONB documents, previous application code is fully backward-compatible. If a migration added new default data, rolling back code will simply ignore the new fields.

---

## Test Verification Commands

Run all verification test suites locally:

```bash
# Multi-tenant isolation & security tests (11 checks)
npm run test:multitenancy

# PostgreSQL connection, schema, and transaction rollback tests (10 checks)
npm run test:postgres

# Backend business logic and ERP workflow tests (16 checks)
npm run test:backend

# Deep verification tests (RBAC, stock deduction, returns)
node server/test-deep-verification.js

# Code quality & type safety
npm run lint
npm run typecheck

# Production build validation
npm run build
```
