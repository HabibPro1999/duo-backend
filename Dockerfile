FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
COPY prisma ./prisma/
RUN bun install --frozen-lockfile --production
RUN bun x prisma generate

# Production image
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

# Security: non-root user
RUN addgroup -g 1001 -S bun && \
    adduser -S bun -u 1001 && \
    chown -R bun:bun /app
USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1))"

CMD ["bun", "src/index.ts"]
