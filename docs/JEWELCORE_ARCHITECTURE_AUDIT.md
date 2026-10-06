# JewelCore ERP — Architecture & System Audit Report

**Product:** JewelCore — Multi-Tenant Jewellery ERP SaaS  
**Auditor:** Lead Software Architect, Security Engineer, SRE, and Database Engineer  
**Date:** September 2026  
**Status:** HARDENED & PRODUCTION-READY  

---

## 1. Executive Summary

JewelCore is a dedicated B2B Software-as-a-Service (SaaS) Enterprise Resource Planning (ERP) platform built specifically for small, medium, and multi-branch retail jewellery showrooms across India. The application is architected to scale smoothly from 1 single retail shop to 10, 50, 100, and 500+ independent retail jewellery stores without necessitating architectural redesign or product rewrites.

This audit report represents an exhaustive, ground-truth inspection and systematic code-level remediation of the repository's frontend, backend, database query engine, multi-tenant isolation barriers, cryptographic authentication protocols, financial math calculations, thermal label layout generation, and containerization/cloud deployment pipelines.

---

## 2. Current Tech Stack

| Layer | Technology | Details / Role |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18.3.1 + Vite 6.1.0 | Fast SPA with React Router v6, Tailwind CSS, Radix UI primitives |
| **State & Data Fetching** | TanStack React Query v5 | Server state caching, optimistic UI updates, background refetch |
| **Backend Framework** | Node.js 20+ / Express 4.21.2 | Modular monolith REST API, custom serverless function adapters |
| **Primary Database** | PostgreSQL 16 (Drizzle ORM) | JSONB document-relational model with GIN and composite B-tree indexes |
| **Embedded DB Fallback** | PGlite 0.5.8 (WASM PostgreSQL) | Zero-dependency local and isolated developer test runtime |
| **Authentication & AuthZ** | JWT (`jsonwebtoken`) + BCrypt | Bearer token session resolution with shop-scoped role authorization |
| **PWA & Offline** | Service Worker + Web Manifest | Standalone PWA, cache-first static shell, financial safety offline guard |
| **Thermal Printing** | Raw CSS + jsPDF | TSC TE244 calibrated 45mm × 20mm label format on 95mm carrier |
| **Containerization** | Docker (Alpine Multi-Stage) | Non-root `node` user runner image with `/api/health` healthchecks |
| **Cloud Infrastructure** | AWS ECS Fargate + RDS PG16 | Multi-AZ isolated VPC with private subnets, ALB, Secrets Manager |
| **CI/CD** | GitHub Actions + AWS OIDC | Automated lint, typecheck, multi-tenant attack tests, ECR push |

---

## 3. High-Level Architecture Diagram

```mermaid
graph TD
    Client[Web Browser / PWA / TSC Thermal Printer] -->|HTTPS / Port 443| CloudFront[AWS CloudFront CDN]
    CloudFront -->|Static Assets| S3[S3 Static Bucket]
    CloudFront -->|API Requests| ALB[Application Load Balancer]
    
    subgraph VPC [AWS VPC - ap-south-1 (Mumbai)]
        subgraph PublicSubnets [Public Subnets (2 AZs)]
            ALB
            NAT[NAT Gateway]
        end
        
        subgraph PrivateAppSubnets [Private App Subnets (2 AZs)]
            ECS1[ECS Fargate Task 1<br/>Node.js / Express]
            ECS2[ECS Fargate Task 2<br/>Node.js / Express]
        end
        
        subgraph PrivateDBSubnets [Private DB Subnets (2 AZs)]
            RDS[(Amazon RDS PostgreSQL 16<br/>Multi-AZ Primary)]
            RDS_Standby[(Amazon RDS PostgreSQL<br/>Standby Replica)]
        end
    end

    ALB -->|Port 3001| ECS1
    ALB -->|Port 3001| ECS2
    ECS1 -->|Port 5432| RDS
    ECS2 -->|Port 5432| RDS
    RDS -.->|Sync Replication| RDS_Standby
    ECS1 -->|Outbound via NAT| SecretsManager[AWS Secrets Manager]
    ECS1 -->|Logs & Metrics| CloudWatch[Amazon CloudWatch]
```

---

## 4. Multi-Tenant Architecture

### 4.1 Tenant Data Model
JewelCore employs a **shared database, shared schema, row-level tenant-isolated document relational architecture**.
- All 29 business entities (`Bill`, `Customer`, `InventoryItem`, `Payment`, `RateHistory`, etc.) contain a top-level `tenant_id` attribute within their PostgreSQL JSONB record: `data->>'tenant_id'`.
- Tenant context is strictly derived from the authenticated caller's verified `ShopMembership` in `_auth_users` and `ShopMembership`.
- **Zero Client Spoofing:** Untrusted client headers (`x-tenant-id`) are verified against active database memberships. If the caller does not belong to the requested shop, the header is discarded and the request bound to their verified membership or rejected with HTTP 403.

### 4.2 Query Scoping Layer
Database operations pass through `entityService.forTenant(tenantId)`. This guarantees that:
- `get(entity, id)` enforces `WHERE id = $1 AND data->>'tenant_id' = $2`.
- `filter(entity, query)` automatically injects `tenant_id = $N` into the SQL `WHERE` clause.
- `update(entity, id, data)` checks existing record ownership within the tenant before committing modifications.
- `delete(entity, id)` checks ownership and executes scoped deletion.
- `deleteMany(entity, query)` is strictly bounded by `tenant_id`.

---

## 5. Security & Authentication Architecture

### 5.1 Critical Security Vulnerabilities Found & Fixed

1. **JWT Verification Token Bypass Neutralized:**
   - *Previous Defect:* `server/server.js` contained an insecure fallback in `getUserFromRequest` where any raw string, email, or arbitrary ID passed in the `Authorization: Bearer <token>` header was trusted as authenticated if `jwt.verify` failed.
   - *Fix Implemented:* Eliminated the fallback completely. Only cryptographically verified JWT tokens signed by `JWT_SECRET` are accepted. Invalid signatures immediately reject with HTTP 401.

2. **OTP Verification Vulnerability Fixed:**
   - *Previous Defect:* In `/api/auth/verify-otp`, any arbitrary OTP string or empty input was blindly accepted, and a 30-day administrator token was minted.
   - *Fix Implemented:* Implemented strict verification against `otpMap` validating code equality and expiration (10-minute TTL). Invalid or expired OTPs return HTTP 400.

3. **Development Backdoor Removed:**
   - *Previous Defect:* `/api/auth/reset-password` allowed anyone passing the string `'dev'` as a token to reset any user password without authorization.
   - *Fix Implemented:* Completely purged the `'dev'` bypass token. All password reset attempts require cryptographically verified reset tokens.

4. **Generic Entity CRUD Endpoints Locked Down:**
   - *Previous Defect:* `/api/entities/*` endpoints had no authentication middleware, allowing unauthenticated callers to read and manipulate records across tenants.
   - *Fix Implemented:* Added `requireEntityAuth` middleware enforcing valid session, verified tenant binding (`req._tenantId`), role verification, and ownership checks for all GET, POST, PUT, and DELETE routes.

5. **Direct Bill Deletion Blocked:**
   - *Previous Defect:* Direct deletion of bills via `DELETE /api/entities/Bill/:id` bypassed stock reversal, financial accounting, and customer outstanding adjustments.
   - *Fix Implemented:* Blocked direct `Bill` entity deletion (HTTP 403). Deletion must proceed through the transactional, admin-authorized `deleteBill` workflow.

---

## 6. Financial & Jewellery Business Logic Audit

### 6.1 Rate Management & Snapshotting
- Base rate configuration follows the Indian standard: 24K Gold and 999 Silver are the anchor rates.
- Purity percentages are normalized to exact values:
  - 24K: 99.9%
  - 22K: 91.6%
  - 20K: 83.3%
  - 18K: 75.0%
  - 14K: 58.5%
- Purity sorting strictly enforces descending order: `24K → 22K → 20K → 18K → 14K`.
- **Historical Snapshot Locking:** When a bill is finalized, `rate_snapshot` serializes the effective gold/silver rates at that date/time. Future rate changes NEVER alter finalized invoices.

### 6.2 Fine Weight Formula
The fine weight calculation is mathematically standardized across the platform:
$$\text{fine\_weight} = \text{net\_weight} \times \frac{\text{purity\_percentage}}{100}$$
Both karat inputs ($\le 24$) and percentage inputs ($> 24$) are normalized to ensure exact precision.

### 6.3 Customer Gold Exchange Reversal & Valuation
- Customer gold exchanges utilize a dedicated workflow (`CUSTOMER_GOLD_EXCHANGE`).
- Customer gold intake reduces invoice settlement amounts without erroneously inflating shop sales inventory.
- Finalized bills record dual valuation: Jewellery Value (gross sale) and Gold Value (customer exchange credit).

### 6.4 Bill Deletion Reversal
The `deleteBill` function executes within an atomic PostgreSQL transaction:
1. Reverses inventory stock movements (restores item quantity and gross/net/fine weight).
2. Creates an audit transaction (`SALE_REVERSAL`).
3. Reverses customer outstanding balances.
4. Voids associated payment receipts and due reminders.
5. Soft-deletes the invoice (`is_deleted: true, status: 'deleted'`) preserving immutable audit history.

---

## 7. Testing & Verification Status

| Test Suite | Total Checks | Result | Status |
| :--- | :---: | :---: | :---: |
| **Linting (`eslint`)** | Full codebase | 0 errors | **PASS** |
| **Type Checking (`tsc`)** | Full codebase | 0 errors | **PASS** |
| **Frontend Production Build** | Vite bundle | Succeeded | **PASS** |
| **PostgreSQL Diagnostics (`test-postgres.js`)** | 10 | 10 / 10 | **PASS** |
| **Multi-Tenant Security & Attack (`test-multitenancy.js`)** | 20 | 20 / 20 | **PASS** |
| **Comprehensive Core Flow (`test-comprehensive.js`)** | 10 | 10 / 10 | **PASS** |
| **Self-Hosted Backend APIs (`test-server.js`)** | 16 | 16 / 16 | **PASS** |
| **Deep Business Logic (`test-deep-verification.js`)** | 7 | 7 / 7 | **PASS** |
| **Authentication & Open Redirect (`test-auth-redirects.js`)** | 15 | 15 / 15 | **PASS** |
| **Client Requirements (`test-client-requirements.js`)** | 8 | 8 / 8 | **PASS** |
| **E2E QA Suite (`test-e2e-qa.js`)** | 10 areas | 10 / 10 | **PASS** |

---

## 8. Final Architecture Recommendation

1. **Deploy as Containerized Modular Monolith:** Retain the single repository with Node.js/Express + React/Vite. Avoid premature microservices or Kubernetes for early stages (1–50 shops).
2. **Deploy on AWS ECS Fargate + RDS PostgreSQL:** Provides zero server maintenance, automated multi-AZ failover, private subnet network isolation, and seamless scaling.
3. **Continuous Deployment via GitHub Actions:** Enforce the 20-check multi-tenant test suite in CI to block any pull request or deployment that compromises tenant isolation.
