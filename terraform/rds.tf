# ===============================================================
# Amazon RDS PostgreSQL: Private, Encrypted, Automated Backups
# ===============================================================

# Subnet Group for Database (restricted to private database subnets)
resource "aws_db_subnet_group" "rds" {
  name        = "${var.app_name}-${var.environment}-db-subnet-group"
  subnet_ids  = aws_subnet.database[*].id
  description = "Private database subnets for JewelCore PostgreSQL"

  tags = {
    Name = "${var.app_name}-${var.environment}-db-subnet-group"
  }
}

# Parameter Group (Enforce SSL / TLS Encryption in Transit)
resource "aws_db_parameter_group" "postgres16" {
  name        = "${var.app_name}-${var.environment}-pg16-params"
  family      = "postgres16"
  description = "PostgreSQL 16 parameter group with SSL enforcement"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Name = "${var.app_name}-${var.environment}-pg16-params"
  }
}

# Random Master Database Password
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Amazon RDS PostgreSQL Instance
resource "aws_db_instance" "postgres" {
  identifier                  = "${var.app_name}-${var.environment}-db"
  engine                      = "postgres"
  engine_version              = "16.3"
  instance_class              = var.db_instance_class
  allocated_storage           = var.db_allocated_storage
  max_allocated_storage       = var.db_max_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  
  db_name                     = var.db_name
  username                    = var.db_username
  password                    = random_password.db_password.result
  port                        = 5432

  db_subnet_group_name        = aws_db_subnet_group.rds.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  parameter_group_name        = aws_db_parameter_group.postgres16.name

  publicly_accessible         = false
  multi_az                    = var.db_multi_az
  backup_retention_period     = var.backup_retention_days
  backup_window               = "20:00-21:00" # UTC (01:30 AM - 02:30 AM IST off-peak)
  maintenance_window          = "Sun:21:00-Sun:22:00"

  auto_minor_version_upgrade  = true
  deletion_protection         = var.db_deletion_protection
  skip_final_snapshot         = var.environment == "dev" ? true : false
  final_snapshot_identifier   = "${var.app_name}-${var.environment}-db-final-snapshot"

  tags = {
    Name = "${var.app_name}-${var.environment}-postgresql"
  }
}
