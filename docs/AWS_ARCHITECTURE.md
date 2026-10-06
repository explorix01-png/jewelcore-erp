# JewelCore ERP — Production AWS Architecture Guide

**Platform:** Amazon Web Services (AWS)  
**Primary Region:** `ap-south-1` (Mumbai, India — optimal latency for Indian jewellery retailers)  
**Workload Target:** 1 Shop (Launch) $\rightarrow$ 10 Shops $\rightarrow$ 50 Shops $\rightarrow$ 100+ Shops $\rightarrow$ 500+ Shops  
**Architecture Style:** High-Availability, Containerized Modular Monolith  

---

## 1. AWS Architecture Topology

```mermaid
graph TD
    subgraph Route53_CloudFront [Edge Layer]
        DNS[Amazon Route 53<br/>app.jewelcore.in] --> CloudFront[Amazon CloudFront CDN<br/>Edge Caching & TLS 1.3]
        CloudFront -->|Static Web Assets| S3_Web[Amazon S3<br/>Static Frontend Assets]
    end

    CloudFront -->|Dynamic API Requests /api/*| ALB[Application Load Balancer<br/>Public Subnets]

    subgraph VPC [AWS VPC - 10.0.0.0/16 (ap-south-1)]
        subgraph PublicSubnets [Public Subnets - AZ 1a & 1b]
            ALB
            NAT[NAT Gateway]
        end

        subgraph PrivateAppSubnets [Private App Subnets - AZ 1a & 1b]
            ECS1[ECS Fargate Task 1<br/>Node.js / Express Container]
            ECS2[ECS Fargate Task 2<br/>Node.js / Express Container]
        end

        subgraph PrivateDBSubnets [Private Database Subnets - AZ 1a & 1b]
            RDS_Primary[(Amazon RDS PostgreSQL 16<br/>gp3 Encrypted Primary)]
            RDS_Standby[(Amazon RDS PostgreSQL 16<br/>Multi-AZ Standby)]
        end
    end

    ALB -->|HTTP/3001| ECS1
    ALB -->|HTTP/3001| ECS2
    ECS1 -->|Port 5432| RDS_Primary
    ECS2 -->|Port 5432| RDS_Primary
    RDS_Primary -.->|Synchronous Replication| RDS_Standby

    subgraph Management [Security & Observability]
        ECR[Amazon ECR<br/>Container Images]
        Secrets[AWS Secrets Manager<br/>DB Credentials & JWT Key]
        CW[Amazon CloudWatch<br/>Logs, Alarms & Metrics]
        S3_Uploads[Amazon S3<br/>Bill Logos & Attachments]
    end

    ECS1 -->|Pull Image| ECR
    ECS1 -->|Decrypt Secrets| Secrets
    ECS1 -->|Stream Logs| CW
    ECS1 -->|Store Media| S3_Uploads
```

---

## 2. Component Breakdown & Design Rationale

### 2.1 Application Load Balancer (ALB)
- **Role:** Internet-facing load balancer spanning 2 Availability Zones (`ap-south-1a`, `ap-south-1b`).
- **TLS Termination:** Terminates HTTPS using certificates managed by AWS Certificate Manager (ACM). Enforces TLS 1.2 and TLS 1.3 with modern cipher suites.
- **Health Checking:** Continuously monitors `/api/health`. Removes unhealthy containers from traffic within 10 seconds.

### 2.2 ECS Fargate (Elastic Container Service)
- **Why Fargate over EC2:** Fargate eliminates EC2 instance patching, OS maintenance, and capacity planning. Containers run in serverless compute units with microVM isolation.
- **Resource Sizing:**
  - *Initial (1–10 shops):* 2 tasks $\times$ 0.25 vCPU (256 CPU units) / 0.5 GB RAM.
  - *Growth (10–50 shops):* 2–4 tasks $\times$ 0.5 vCPU (512 CPU units) / 1.0 GB RAM.
  - *Scale (50–500+ shops):* Auto-scaling 4–16 tasks $\times$ 1.0 vCPU / 2.0 GB RAM based on CPU/Request count.

### 2.3 Amazon RDS PostgreSQL 16
- **Storage:** Amazon EBS General Purpose SSD (`gp3`) with baseline 3,000 IOPS and storage auto-scaling up to 200 GB.
- **Multi-AZ Replication:** Synchronous standby replica in a second Availability Zone provides automatic failover in $< 60$ seconds without data loss during hardware failures.
- **Encryption:** Storage encrypted at rest using AWS KMS (AES-256). Network connections strictly enforce SSL/TLS via parameter group setting `rds.force_ssl = 1`.
- **Private Subnets:** Zero internet gateways or public IP addresses attached to database subnets. Only accessible from the ECS Application Security Group.

### 2.4 AWS Secrets Manager
- Injects database credentials and JWT signing keys into ECS tasks at container startup.
- Secrets are never hardcoded in source control, Docker images, or CI/CD pipelines.

### 2.5 Amazon CloudWatch
- Centralized log streaming (`/ecs/jewelcore-prod`) with 90-day retention.
- Alarms configured for:
  - Container CPU utilization $> 80\%$
  - Container Memory utilization $> 85\%$
  - ALB 5xx server errors $> 5$ in 5 minutes

---

## 3. Initial Cost Optimization (1 to 10 Shops)

To ensure high availability without unnecessary expenditure during the initial launch, the architecture avoids expensive enterprise services (e.g. multi-thousand-dollar Aurora Serverless or oversized EC2 instances):

| AWS Service | Tier / Size | Estimated Monthly Cost (ap-south-1) |
| :--- | :--- | :--- |
| **ECS Fargate** | 2 tasks $\times$ 0.25 vCPU, 0.5 GB RAM | $\approx \$14.00$ |
| **Application Load Balancer** | Standard ALB + LCU consumption | $\approx \$18.00$ |
| **Amazon RDS PostgreSQL** | `db.t4g.micro` (Single-AZ for dev/staging, Multi-AZ for prod) | $\approx \$26.00$ |
| **EBS gp3 Storage** | 20 GB Storage + automated snapshots | $\approx \$2.50$ |
| **NAT Gateway** | 1 Single NAT Gateway (Shared between AZs) | $\approx \$32.00$ |
| **Amazon CloudWatch & Secrets**| Logs + 2 Secrets | $\approx \$2.50$ |
| **Route 53 & ACM** | 1 Hosted Zone + Free ACM SSL Certs | $\approx \$0.50$ |
| **Total Estimated Run-Rate** | **Launch Phase (1–10 Shops)** | **$\approx \$95.50$ / month** |

*Note: For staging and development environments, NAT Gateway can be substituted with VPC Endpoints or scheduled off-hours shutdown to reduce staging costs to under $\$35$/month.*
