# JewelCore ERP — Source Code Export & Local Setup

## What's Included

This archive contains the **complete source code** of your JewelCore ERP application:

| Directory | Contents |
|-----------|----------|
| `src/` | All React frontend pages, components, hooks, lib utilities, i18n translations |
| `base44/entities/` | 29 database entity schema definitions (JSON) |
| `base44/functions/` | 29 backend serverless functions (TypeScript) |
| `base44/shared/` | 7 shared backend modules (auth, audit, billing, permissions, etc.) |
| `base44/config.jsonc` | Base44 platform configuration |
| Root configs | `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `jsconfig.json`, `components.json`, `index.html` |
| `.env.example` | Environment variable template (no real secrets) |

## Architecture Overview

- **Frontend**: React 18 + Vite 6 + Tailwind CSS + shadcn/ui + Radix UI
- **Backend**: 29 serverless functions (TypeScript) running on Base44's runtime
- **Database**: Base44 managed document database (entities defined as JSON schemas)
- **Auth**: Base44 managed authentication (email/password, Google OAuth, roles)
- **SDK**: `@base44/sdk` — provides `base44.entities.*`, `base44.auth.*`, `base44.functions.invoke()`, `base44.integrations.Core.*`

## Running Locally (on Base44)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env
# Edit .env and set VITE_BASE44_APP_ID to your Base44 app ID

# 3. Start dev server
npm run dev

# 4. Build for production
npm run build
```

> **Note**: The app depends on `@base44/sdk` and `@base44/vite-plugin`. These are
> Base44 platform packages. The frontend, backend functions, and database all
> communicate through Base44's managed services. Running locally requires a
> valid Base44 app ID and an active Base44 account.

## Migrating to Google Antigravity / Other Platforms

This app is tightly integrated with the Base44 platform. A direct lift-and-shift
to another platform requires replacing these platform-specific layers:

### What Can Be Exported As-Is
1. **All frontend UI code** (`src/pages/`, `src/components/`) — standard React + Tailwind
2. **All UI components** (shadcn/ui in `src/components/ui/`) — framework-agnostic
3. **Styling** (`src/index.css`, `tailwind.config.js`) — standard Tailwind
4. **i18n system** (`src/lib/i18n/`, `src/lib/I18nProvider.jsx`) — self-contained
5. **Business logic libraries** (`src/lib/billCalc.js`, `src/lib/code128.js`, `src/lib/printBarcode.js`, etc.)
6. **Entity schemas** (`base44/entities/*.jsonc`) — usable as DB schema blueprints
7. **Backend business logic** (`base44/shared/*.ts`) — pure TypeScript, portable
8. **Backend function logic** (`base44/functions/*/entry.ts`) — logic is portable; runtime wrapper needs replacement

### What Requires Replacement
1. **`@base44/sdk`** → Replace with your chosen platform's SDK or direct API calls
2. **`@base44/vite-plugin`** → Remove from `vite.config.js`; use standard Vite config
3. **`src/api/base44Client.js`** → Replace with your API client (Axios/Fetch + your backend)
4. **`src/lib/app-params.js`** → Replace with your env/param resolution
5. **`src/lib/AuthContext.jsx`** → Replace Base44 auth calls with your auth provider
6. **Backend function runtime** → `createClientFromRequest(req)` and `Response.json()` are Base44 patterns; replace with Express/Fastify handlers or your serverless platform
7. **Entity CRUD** → `base44.entities.X.list/filter/create/update` → Replace with your ORM/DB calls
8. **Integrations** → `base44.integrations.Core.*` (InvokeLLM, SendEmail, UploadFile, etc.) → Replace with direct API calls
9. **Row-Level Security** → Defined in entity `.jsonc` files under `rls` key; needs reimplementation in your DB layer
10. **Realtime subscriptions** → `base44.entities.X.subscribe()` → Replace with WebSocket/SSE

### Migration Steps
1. Set up a new backend (Node.js/Express, Supabase, Firebase, etc.)
2. Create database tables from the entity schemas in `base44/entities/`
3. Port backend functions from `base44/functions/*/entry.ts` to your server framework
4. Replace `@base44/sdk` calls in frontend with your new API client
5. Implement authentication and role-based access (roles: admin, staff, cashier)
6. Set up file storage to replace `UploadPublicFile`/`UploadPrivateFile`
7. Set up email/LLM services to replace `SendEmail`/`InvokeLLM`

## Entity List (29 entities)

ActivityLog, Bill, BillItem, CategoryMaster, Customer, CustomerOrder,
CustomerOutstanding, DueReminder, ExchangeTransaction, GSTConfig,
InventoryItem, InventoryTransaction, ItemMaster, Karagir, KaragirOrder,
Notification, Payment, Purchase, PurchaseItem, PurityMaster, RateHistory,
ReturnTransaction, ShopMembership, ShopSettings, Supplier,
SupplierTransaction, User, WhatsAppConfig, WhatsAppShare

## Backend Functions (29 functions)

adjustStock, cancelBill, changeRate, collectDue, finalizeBill,
finalizePurchase, getDashboardRangeStats, getDashboardStats,
getPublicBill, manageCustomer, manageData, manageInventory, manageItem,
manageKaragir, manageKaragirOrder, manageMaster, manageMembers,
manageOrder, manageSettings, manageSupplier, manageWhatsApp, onboardShop,
processDueReminders, processExchange, processReturn, resolveSession,
restoreRecord, scanBarcodeImage, voiceAssistant

## Roles & Permissions

- **admin**: Full access to all modules and settings
- **staff**: Inventory, billing, customers, orders (no admin settings)
- **cashier**: Billing only (redirects to /billing on login)

Permission logic: `src/lib/permissions.js` (frontend) + `base44/shared/permissions.ts` (backend)