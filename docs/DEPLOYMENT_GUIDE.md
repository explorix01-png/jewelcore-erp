# JewelCore ERP — Production AWS Deployment Guide

**Target Environment:** AWS ECS Fargate + RDS PostgreSQL 16 (Multi-AZ)  
**Region:** `ap-south-1` (Mumbai)  
**IaC Tool:** Terraform $\ge 1.5.0$  
**Automation:** GitHub Actions Continuous Delivery  

---

## 1. Prerequisites

Before initiating cloud deployment, verify the following prerequisites:
1. **AWS Account & Administrative Access:** An active AWS account with permissions to create VPC, Subnets, IAM roles, ECS, RDS, ALB, and Secrets Manager resources.
2. **Domain & SSL Certificate:** A registered domain name (e.g. `jewelcore.in`) in Amazon Route 53 and an SSL certificate requested in AWS Certificate Manager (ACM) for `*.jewelcore.in` in `ap-south-1`.
3. **GitHub Repository Setup:**
   - Secrets required in GitHub repository settings:
     - `AWS_STAGING_OIDC_ROLE_ARN` (ARN of Staging IAM role)
     - `AWS_PROD_OIDC_ROLE_ARN` (ARN of Production IAM role)
     - `STAGING_API_URL` (e.g. `https://staging-api.jewelcore.in`)
     - `PROD_API_URL` (e.g. `https://api.jewelcore.in`)

---

## 2. Infrastructure as Code (IaC) Provisioning with Terraform

### Step 1: Initialize Terraform
Navigate to the `/terraform` directory and initialize the AWS provider:
```bash
cd terraform
terraform init
```

### Step 2: Create Infrastructure for Target Environment
Select the target environment (`staging` or `prod`) using the prepared `.tfvars` file:

```bash
# Review planned AWS resources for Staging
terraform plan -var-file="environments/staging.tfvars" -out="staging.tfplan"

# Apply Staging Infrastructure
terraform apply "staging.tfplan"
```

For Production:
```bash
# Review planned AWS resources for Production
terraform plan -var-file="environments/prod.tfvars" -out="prod.tfplan"

# Apply Production Infrastructure
terraform apply "prod.tfplan"
```

### Step 3: Record Infrastructure Outputs
Upon successful provisioning, Terraform outputs essential values:
- `alb_dns_name`: Public DNS name of the Application Load Balancer
- `ecr_repository_url`: Amazon ECR repository URI
- `rds_address`: Private IP address of the PostgreSQL database
- `cloudwatch_log_group`: CloudWatch log stream

---

## 3. Initial Database Bootstrapping & Migration

Once the RDS instance is online, execute initial schema setup and administrator seeding:

1. **Configure Connection:** Set `DATABASE_URL` in your administrative shell pointing to the RDS endpoint (via AWS Systems Manager Session Manager or temporary VPN bastion):
   ```bash
   export DATABASE_URL="postgresql://jewelcore_admin:<SECRET_PASSWORD>@<RDS_ENDPOINT>:5432/jewelcore_erp?sslmode=require"
   ```

2. **Run Idempotent Migrations:**
   ```bash
   npm run db:migrate
   ```
   *Creates all 29 entity tables, JSONB indexes, and composite indexes.*

3. **Seed Initial Platform Administrator:**
   ```bash
   npm run seed:admin
   ```
   *Creates the initial platform super-administrator account.*

---

## 4. Container Build & Deployment via GitHub Actions

1. **Staging Continuous Deployment:**
   - Push code changes to branch `develop`.
   - The workflow `.github/workflows/staging.yml` automatically builds the multi-stage Docker image, runs quality gates, pushes to ECR, and deploys to the Staging ECS cluster.

2. **Production Release Deployment:**
   - Create a signed Git release tag:
     ```bash
     git tag -a v1.0.0 -m "Release v1.0.0 Production Launch"
     git push origin v1.0.0
     ```
   - The workflow `.github/workflows/production.yml` triggers.
   - Pre-flight checks execute all 101 tests in parallel.
   - The workflow pauses for **Manual Reviewer Approval** in the GitHub UI.
   - Upon approval, the release image is deployed with zero downtime to the Production ECS cluster.

---

## 5. Post-Deployment Verification & Smoke Testing

Immediately following deployment, run automated health and smoke tests:

```bash
# 1. Health Ping
curl -f https://app.jewelcore.in/api/health

# Expected JSON response:
# {
#   "ok": true,
#   "version": "1.0.0",
#   "database": {
#     "ok": true,
#     "engine": "postgres-rds",
#     "latencyMs": 2
#   }
# }

# 2. Automated Remote E2E Smoke Test
export TEST_BASE_URL="https://app.jewelcore.in"
node server/test-client-requirements.js
```
