# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Build for production (prisma generate + tsc + tsc-alias)
npm start                # Run production build

# Code quality
npm run type-check       # TypeScript type checking
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database (dev)
npm run db:migrate       # Run migrations (creates migration files)
```

## Architecture

This is a **modular monolith** backend using Fastify with enforced module boundaries.

### Path Aliases

- `@/*` → `src/*`
- `@config/*` → `src/config/*`
- `@core/*` → `src/core/*`
- `@shared/*` → `src/shared/*`
- `@modules/*` → `src/modules/*`

**Important**: Always use `.js` extensions in imports (ES modules requirement).

### Core Layer (`src/core/`)

- `server.ts` - Fastify instance with Zod type provider, decorates `app.prisma`
- `plugins.ts` - CORS, Helmet, rate limiting registration
- `hooks.ts` - Request ID lifecycle hooks
- `shutdown.ts` - Graceful shutdown with Prisma disconnect

### Shared Layer (`src/shared/`)

- `errors/app-error.ts` - Custom error class with `statusCode`, `code`, `details`
- `errors/error-codes.ts` - Enumerated codes: `AUTH_*`, `VAL_*`, `RES_*`, `RATE_*`, `SRV_*`
- `middleware/error.middleware.ts` - Global error handler (handles Zod, AppError, rate limit)
- `utils/logger.ts` - Pino logger with redaction

### Modules Layer (`src/modules/`)

Feature modules with enforced boundaries. Each module should:
1. Have a barrel export (`index.ts`)
2. Add path alias to `tsconfig.json`: `"@{module}": ["./src/modules/{module}/index.ts"]`
3. Add ESLint boundary rule in `eslint.config.js`

Internal structure per module:
- `{domain}.schemas.ts` - Zod schemas (use `.strict()`)
- `{domain}.service.ts` - Business logic (one table per service)
- `{domain}.routes.ts` - HTTP handlers (routes orchestrate services)

### Key Patterns

- **Validation**: Zod with `fastify-type-provider-zod` for request/response validation
- **Database**: Prisma singleton at `src/database/client.ts`, accessible via `app.prisma`
- **Config**: Zod-validated env vars at `src/config/app.config.ts`
- **Cross-module imports**: Only through barrel exports, enforced by ESLint

### Error Handling

Throw `AppError` for operational errors:
```typescript
throw new AppError('Not found', 404, true, ErrorCodes.NOT_FOUND);
```

Zod validation errors are automatically formatted by the global error handler.
