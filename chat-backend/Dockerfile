# Multi-stage build for chat-backend (Express + TypeScript)
FROM node:20-bookworm-slim AS base
WORKDIR /app

# System dependencies required by mediasoup to build its worker
RUN apt-get update && \
    apt-get install -y python3 python3-pip build-essential && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Install Node dependencies (mediasoup postinstall runs here)
COPY package*.json ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Builder stage (for production build)
FROM base AS builder
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
# Build TypeScript
RUN npm run server-build && \
    if [ -d src/public ]; then cp -r src/public dist/public; fi

# Production runner stage
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# System dependencies required by mediasoup in the production image as well
RUN apt-get update && \
    apt-get install -y python3 python3-pip build-essential && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Security: Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy only production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built application and set owner
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
# If you have a public folder or uploads folder, copy/create them with correct permissions
RUN mkdir -p /app/dist/public/uploads && chown -R nodejs:nodejs /app

# Set user
USER nodejs

# Port configuration
ENV PORT=10018
EXPOSE 10018

# Start the server
CMD ["node", "dist/index.js"]