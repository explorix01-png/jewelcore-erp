terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # In production, use S3 backend for remote state with DynamoDB state locking
  # backend "s3" {
  #   bucket         = "jewelcore-terraform-state"
  #   key            = "environments/${var.environment}/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "jewelcore-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "JewelCore"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "JewelCore-DevOps"
    }
  }
}
