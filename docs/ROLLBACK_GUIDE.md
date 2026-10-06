# JewelCore ERP — Production Incident Response & Rollback Guide

**Objective:** Standard Operating Procedures (SOP) for instantaneous recovery and safe rollback in the event of production failure, failed releases, or database anomalies.  
**Recovery Time Objective (RTO):** $< 5$ minutes for application rollback; $< 15$ minutes for database PITR.  
**Recovery Point Objective (RPO):** $< 1$ minute (Amazon RDS Continuous Write-Ahead Log Archival).  

---

## 1. Fast Application Rollback (ECS Fargate)

Because Docker images are built immutably with both Git SHA and semantic release tags (`v1.0.0`, `v1.0.1`), rolling back an application release does NOT require rebuilding code.

### Scenario A: Rollback via GitHub Actions
1. Open the GitHub repository $\rightarrow$ **Actions** tab.
2. Select **JewelCore ERP Production Deployment**.
3. Choose the last known good release tag (e.g. `v1.0.0`) and trigger a **Workflow Dispatch**.
4. ECS pulls the previously verified image from ECR and performs a zero-downtime rolling update.

### Scenario B: Emergency Instant Rollback via AWS CLI
If GitHub Actions is unavailable, roll back directly from your terminal in under 60 seconds:

```bash
# 1. Inspect previous task definition revision
aws ecs describe-services \
  --cluster jewelcore-prod-cluster \
  --services jewelcore-prod-service \
  --region ap-south-1 \
  --query "services[0].taskDefinition"

# 2. Update service to the previous task definition revision (e.g. revision 4)
aws ecs update-service \
  --cluster jewelcore-prod-cluster \
  --services jewelcore-prod-service \
  --task-definition jewelcore-prod-task:4 \
  --force-new-deployment \
  --region ap-south-1

# 3. Monitor stability
aws ecs wait services-stable \
  --cluster jewelcore-prod-cluster \
  --services jewelcore-prod-service \
  --region ap-south-1
```

---

## 2. Database Recovery Procedures (Amazon RDS PostgreSQL)

### 2.1 Point-in-Time Recovery (PITR)
Amazon RDS continuously archives transaction write-ahead logs (WAL) to Amazon S3. If a catastrophic administrative error occurs (e.g. accidental corruption before an audit):

1. **Identify the exact target timestamp** prior to the incident (e.g. `2026-09-29T14:30:00Z`).
2. **Restore to a New DB Instance:**
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier jewelcore-prod-db \
     --target-db-instance-identifier jewelcore-prod-db-recovered \
     --restore-time 2026-09-29T14:30:00Z \
     --db-subnet-group-name jewelcore-prod-db-subnet-group \
     --vpc-security-group-ids sg-xxxxxxxxxxxx \
     --region ap-south-1
   ```
3. **Verify Data Integrity:** Connect privately to `jewelcore-prod-db-recovered` and inspect records.
4. **Repoint ECS Service:** Update the `DATABASE_URL` secret in AWS Secrets Manager to the new database endpoint and trigger an ECS task reload.

---

## 3. Incident Severity Levels & Runbook

| Severity | Definition | Response Window | Escalation & Actions |
| :--- | :--- | :---: | :--- |
| **P1 - Critical** | Platform outage, database unavailable, multi-tenant leak detected | $< 15$ mins | 1. Page On-Call Lead<br/>2. Isolate traffic via ALB maintenance rule<br/>3. Execute ECS or RDS rollback |
| **P2 - Major** | Core feature broken (billing finalization failing, rates not updating) | $< 1$ hour | 1. Check CloudWatch 5xx logs<br/>2. Revert recent commit or deploy hotfix tag |
| **P3 - Minor** | UI visual defect, non-blocking report timeout | $< 1$ business day | File issue, reproduce in staging, ship next scheduled release |
