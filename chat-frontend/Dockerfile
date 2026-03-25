# 1. Install dependencies only when needed
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --force


# 2. Rebuild the source code only when needed
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables
ARG NEXT_PUBLIC_PROXY
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY

ENV NEXT_PUBLIC_PROXY=${NEXT_PUBLIC_PROXY}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=${NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY}

RUN npm run build

# 3. Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 10016

ENV PORT 10016
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]