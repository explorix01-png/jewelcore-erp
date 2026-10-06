# ===============================================================
# JewelCore ERP — Production Multi-Stage Dockerfile
# Self-hosted React + Vite frontend and Node.js + Express backend
# ===============================================================

# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy full source and build production bundle
COPY . .
RUN npm run build

# --- Stage 2: Production Runtime ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Install runtime tools
RUN apk add --no-cache curl postgresql-client

# Copy package manifests and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend server code, functions, shared utils, and database schema
COPY server ./server
COPY uploads ./uploads

# Ensure uploads and server data directories exist with write permissions for non-root node user
RUN mkdir -p /app/uploads /app/server/data && chown -R node:node /app

USER node

EXPOSE 3001

# Healthcheck against self-hosted health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start JewelCore ERP
CMD ["node", "server/server.js"]
