# ===============================================================
# AWS Secrets Manager: Protected Credentials & Database Secrets
# ===============================================================

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# 1. Database Connection & Credentials Secret
resource "aws_secretsmanager_secret" "db_secret" {
  name                    = "${var.app_name}-${var.environment}-db-credentials"
  description             = "PostgreSQL connection string and credentials for JewelCore"
  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = {
    Name = "${var.app_name}-${var.environment}-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_secret_val" {
  secret_id = aws_secretsmanager_secret.db_secret.id
  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.postgres.endpoint}/${var.db_name}?sslmode=require"
    host         = aws_db_instance.postgres.address
    port         = 5432
    username     = var.db_username
    password     = random_password.db_password.result
    dbname       = var.db_name
  })
}

# 2. Application Core Secrets (JWT Secret & Integration Keys)
resource "aws_secretsmanager_secret" "app_secret" {
  name                    = "${var.app_name}-${var.environment}-app-secrets"
  description             = "Application secrets including JWT secret"
  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = {
    Name = "${var.app_name}-${var.environment}-app-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "app_secret_val" {
  secret_id = aws_secretsmanager_secret.app_secret.id
  secret_string = jsonencode({
    JWT_SECRET = random_password.jwt_secret.result
  })
}
