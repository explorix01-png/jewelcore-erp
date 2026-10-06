# ===============================================================
# JewelCore Security Groups: Least Privilege Network Boundaries
# ===============================================================

# 1. Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name        = "${var.app_name}-${var.environment}-alb-sg"
  description = "Allows inbound HTTP/HTTPS traffic to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from Internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from Internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "Forward traffic to ECS App containers only"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    cidr_blocks     = aws_subnet.app[*].cidr_block
  }

  tags = {
    Name = "${var.app_name}-${var.environment}-alb-sg"
  }
}

# 2. ECS Fargate Application Security Group
resource "aws_security_group" "ecs" {
  name        = "${var.app_name}-${var.environment}-ecs-sg"
  description = "Allows inbound traffic only from ALB, and outbound to RDS and AWS services"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Inbound from ALB on application port"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Outbound HTTPS for AWS APIs (ECR, Secrets Manager, CloudWatch)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "Outbound to RDS PostgreSQL on port 5432"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = aws_subnet.database[*].cidr_block
  }

  tags = {
    Name = "${var.app_name}-${var.environment}-ecs-sg"
  }
}

# 3. Amazon RDS PostgreSQL Security Group
resource "aws_security_group" "rds" {
  name        = "${var.app_name}-${var.environment}-rds-sg"
  description = "Allows PostgreSQL inbound only from ECS application containers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL access strictly from ECS task security group"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "No outbound internet traffic allowed from database"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["127.0.0.1/32"]
  }

  tags = {
    Name = "${var.app_name}-${var.environment}-rds-sg"
  }
}
