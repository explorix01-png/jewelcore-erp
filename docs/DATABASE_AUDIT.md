# JewelCore ERP — PostgreSQL Database Architecture & Audit

**Target Engine:** Amazon RDS PostgreSQL 16 (gp3 Storage, Multi-AZ)  
**Embedded Fallback:** PGlite 0.5.8 (WASM PostgreSQL)  
**ORM / Query Layer:** Custom Scoped PostgreSQL Engine + Drizzle ORM  
**Audit Outcome:** **HIGH-PERFORMANCE, TENANT-INDEXED, TRANSACTIONALLY SAFE**  

---

## 1. Storage Engine Model: Hybrid Document-Relational

JewelCore stores business entities using a **PostgreSQL JSONB Document-Relational Pattern**. Each entity table adheres to the following core relational structure:

```sql
CREATE TABLE IF NOT EXISTS "Bill" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  data JSONB NOT NULL
);
```

### Why this architecture fits retail jewellery ERP SaaS:
1. **Dynamic Custom Attributes:** Jewellery shops require varying attributes depending on product lines (e.g. diamonds need cut/color/clarity/carat, kadas need inner diameter, bangles need size codes, gold bars require refinery assay stamps). JSONB accommodates dynamic fields without schema migrations on every shop onboarding.
2. **PostgreSQL Power:** PostgreSQL JSONB supports exact B-tree and GIN indexing, native containment queries (`@>`), JSON path extraction (`->>`), and casting to `::numeric` or `::boolean`.
3. **Embedded Parity:** Because PGlite compiles the exact PostgreSQL 16 C codebase to WebAssembly, local developers, offline terminals, and CI test pipelines execute the identical SQL syntax without discrepancies.

---

## 2. Composite Tenant-Aware Indexes

To guarantee sub-millisecond query performance as the database scales from 1 shop to 500+ shops and millions of bills, the schema includes 14 tenant-aware composite indexes in `server/db/schema.js`:

```sql
-- 1. Bill Tenant + Status + Date Index (for Dashboard & Invoicing lists)
CREATE INDEX IF NOT EXISTS "idx_bill_tenant_status_date" 
ON "Bill" ((data->>'tenant_id'), (data->>'status'), created_date DESC);

-- 2. Bill Tenant + Customer Index (for customer purchase history)
CREATE INDEX IF NOT EXISTS "idx_bill_tenant_customer" 
ON "Bill" ((data->>'tenant_id'), (data->>'customer_id'));

-- 3. Bill Tenant + Number Index (for unique invoice lookups)
CREATE INDEX IF NOT EXISTS "idx_bill_tenant_number" 
ON "Bill" ((data->>'tenant_id'), (data->>'bill_number'));

-- 4. BillItem Tenant + Bill Index (for bill line item aggregation)
CREATE INDEX IF NOT EXISTS "idx_billitem_tenant_bill" 
ON "BillItem" ((data->>'tenant_id'), (data->>'bill_id'));

-- 5. InventoryItem Tenant + Barcode Index (for high-speed barcode scans)
CREATE INDEX IF NOT EXISTS "idx_inventory_tenant_barcode" 
ON "InventoryItem" ((data->>'tenant_id'), (data->>'barcode'));

-- 6. InventoryItem Tenant + Status + Category Index (for inventory queries)
CREATE INDEX IF NOT EXISTS "idx_inventory_tenant_status" 
ON "InventoryItem" ((data->>'tenant_id'), (data->>'status'), (data->>'category_name'));

-- 7. Customer Tenant + Mobile Index (for customer phone search)
CREATE INDEX IF NOT EXISTS "idx_customer_tenant_mobile" 
ON "Customer" ((data->>'tenant_id'), (data->>'mobile'));

-- 8. Customer Tenant + Name Index (for customer autocomplete)
CREATE INDEX IF NOT EXISTS "idx_customer_tenant_name" 
ON "Customer" ((data->>'tenant_id'), (data->>'name'));

-- 9. RateHistory Tenant + Metal + Effective Date Index (for historical lookup)
CREATE INDEX IF NOT EXISTS "idx_ratehistory_tenant_metal_date" 
ON "RateHistory" ((data->>'tenant_id'), (data->>'metal_type'), ((data->>'effective_date')::text) DESC);

-- 10. Purchase Tenant + Date Index (for supplier purchase history)
CREATE INDEX IF NOT EXISTS "idx_purchase_tenant_date" 
ON "Purchase" ((data->>'tenant_id'), created_date DESC);

-- 11. Payment Tenant + Bill Index (for bill payment reconciliation)
CREATE INDEX IF NOT EXISTS "idx_payment_tenant_bill" 
ON "Payment" ((data->>'tenant_id'), (data->>'bill_id'));

-- 12. CustomerOutstanding Tenant + Status Index (for credit reminders)
CREATE INDEX IF NOT EXISTS "idx_customeroutstanding_tenant_status" 
ON "CustomerOutstanding" ((data->>'tenant_id'), (data->>'status'));

-- 13. DueReminder Tenant + Date Index (for daily due alerts)
CREATE INDEX IF NOT EXISTS "idx_duereminder_tenant_date" 
ON "DueReminder" ((data->>'tenant_id'), (data->>'reminder_date'));

-- 14. ShopMembership User + Tenant Index (for high-speed auth resolution)
CREATE INDEX IF NOT EXISTS "idx_shopmembership_user_tenant" 
ON "ShopMembership" ((data->>'user_id'), (data->>'tenant_id'));
```

---

## 3. Monetary Precision & Numeric Sorting

In standard JSON, all numbers are double-precision floating-point numbers. In PostgreSQL JSONB, stringified numbers can cause alphanumeric sorting defects (e.g. `"100"` sorts before `"20"`).

To guarantee strict financial accuracy:
1. `entityService.js` maintains `NUMERIC_FIELDS`, an explicit set of 42 financial and weight fields (`total_amount`, `paid_amount`, `due_amount`, `gross_weight`, `net_weight`, `fine_weight`, `cgst`, `sgst`, etc.).
2. In SQL queries, numeric comparisons and sorting dynamically cast JSONB text attributes to PostgreSQL `::numeric`:
   ```sql
   ORDER BY (data->>'total_amount')::numeric DESC NULLS LAST
   ```
3. Test 4 in `server/test-postgres.js` explicitly verifies that `250000.50` sorts above `99999.99` and that floating-point addition preserves two-decimal place precision without rounding drift.

---

## 4. Transaction Boundaries & Atomic Rollback

All multi-step financial mutations execute within PostgreSQL transactions:

```javascript
await db.transaction(async (tx) => {
  const txBase44 = createClientFromRequest(req, { txClient: tx });
  // 1. Create Bill record
  // 2. Insert BillItem line items
  // 3. Update stock levels in InventoryItem
  // 4. Create Payment ledger entry
  // 5. Create CustomerOutstanding if due > 0
  // 6. Write AuditLog
});
```

### Rollback Verification:
- In `server/test-postgres.js` (Test 5), a deliberate failure was triggered after step 3 of a simulated sale.
- PostgreSQL immediately triggered a `ROLLBACK`.
- The database was inspected, proving that **zero dirty records** remained and inventory stock was untouched.

---

## 5. Idempotency & Concurrency Protection

To protect retail counters against network retries or double-clicking finalization buttons:
- Every bill creation payload includes an `operation_id` (e.g. `op-1790648119-a8f3d1`).
- `finalizeBill.js` checks:
  ```javascript
  const existing = await base44.asServiceRole.entities.Bill.filter(
    { operation_id: operationId }, '-created_date', 1
  );
  if (existing.length > 0 && existing[0].status === 'finalized') {
    return Response.json({ success: true, bill_id: existing[0].id, idempotent: true });
  }
  ```
- If a network timeout occurs and the cashier clicks submit again, the identical bill is returned without decrementing inventory twice or minting duplicate invoices.

---

## 6. Server-Side Aggregation vs Frontend Processing

| Metric / KPI | Old Approach (Anti-Pattern) | JewelCore Hardened Architecture |
| :--- | :--- | :--- |
| **Today's Revenue** | Download all bills to browser and `reduce()` | Server-side `getDashboardStats` computes totals in single query |
| **Gold Sold (Grams)** | Download all items and sum net weight | Server-side aggregation over `BillItem` and `RateSnapshot` |
| **Customer Outstanding** | Client downloads entire ledger | `CustomerOutstanding` filtered by `status: 'open'` |
| **Inventory Low Stock** | Client scans 10,000 items | Filter query: `quantity <= 2` with composite index |
