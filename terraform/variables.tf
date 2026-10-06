variable "aws_region" {
  description = "AWS Region for deployment (Mumbai ap-south-1 recommended for Indian jewellery SaaS)"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "staging"
}

variable "app_name" {
  description = "Application identifier"
  type        = string
  default     = "jewelcore"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for multi-AZ high availability"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

# ECS Fargate Configuration
variable "app_port" {
  description = "Port exposed by the Node.js application container"
  type        = number
  default     = 3001
}

variable "ecs_cpu" {
  description = "Fargate CPU units (256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "Fargate Memory (MB)"
  type        = number
  default     = 1024
}

variable "app_count" {
  description = "Desired number of running ECS task replicas"
  type        = number
  default     = 2
}

# RDS PostgreSQL Configuration
variable "db_instance_class" {
  description = "RDS instance class (e.g. db.t4g.micro for dev/staging, db.t4g.small for prod)"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB for PostgreSQL"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage auto-scaling threshold in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "PostgreSQL initial database name"
  type        = string
  default     = "jewelcore_erp"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "jewelcore_admin"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ high availability failover for RDS (recommended for prod)"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Prevent accidental RDS deletion"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Automated daily snapshot backup retention in days"
  type        = number
  default     = 7
}

# Custom Domain & SSL
variable "domain_name" {
  description = "Custom domain name (optional)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM Certificate ARN for HTTPS listener (optional)"
  type        = string
  default     = ""
}
