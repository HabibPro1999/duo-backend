# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun run dev              # Start dev server with hot reload
bun run start            # Run production build

# Code quality
bun run type-check       # TypeScript type checking
bun run lint             # Run ESLint
bun run lint:fix         # Fix ESLint issues

# Testing
bun run test             # Run tests in watch mode
bun run test:run         # Run tests once
bun run test:coverage    # Run tests with coverage report

# Database
bun run db:generate      # Generate Prisma client
bun run db:push          # Push schema to database (dev)
bun run db:migrate       # Run migrations (creates migration files)
```

## Architecture

This is a **modular monolith** backend using Fastify with enforced module boundaries.

### Path Aliases

- `@/*` → `src/*`
- `@config/*` → `src/config/*`
- `@core/*` → `src/core/*`
- `@shared/*` → `src/shared/*`
- `@modules/*` → `src/modules/*`
- `@identity`, `@clients`, `@events`, `@forms`, `@pricing` → Module barrel exports

**Important**: Always use `.js` extensions in imports (ES modules requirement).

### Core Layer (`src/core/`)

- `server.ts` - Fastify instance with Zod type provider, decorates `app.prisma`
- `plugins.ts` - CORS, Helmet, rate limiting, @fastify/sensible
- `hooks.ts` - Request ID lifecycle hooks
- `shutdown.ts` - Graceful shutdown with Prisma disconnect

### Shared Layer (`src/shared/`)

- `types/fastify.d.ts` - Type augmentation for Fastify (`AppInstance`, `request.user`, `app.prisma`)
- `errors/app-error.ts` - Custom error class with `statusCode`, `code`, `details`
- `errors/error-codes.ts` - Enumerated codes: `AUTH_*`, `VAL_*`, `RES_*`, `RATE_*`, `SRV_*`, `PRC_*`
- `middleware/error.middleware.ts` - Global error handler (handles Zod, AppError, rate limit)
- `utils/logger.ts` - Pino logger with redaction
- `utils/pagination.ts` - Shared pagination utility (`paginate()`, `getSkip()`)

### Modules Layer (`src/modules/`)

Feature modules with enforced boundaries. Each module should:
1. Have a barrel export (`index.ts`)
2. Add path alias to `tsconfig.json`: `"@{module}": ["./src/modules/{module}/index.ts"]`
3. Add ESLint boundary rule in `eslint.config.js`

Internal structure per module:
- `{domain}.schema.ts` - Zod schemas (use `.strict()`)
- `{domain}.service.ts` - Business logic (one table per service)
- `{domain}.routes.ts` - HTTP handlers (routes orchestrate services)

### Key Patterns

#### Route Definition (IMPORTANT)
Use Fastify's native schema validation instead of manual parsing:
```typescript
// CORRECT - Use schema option, Fastify validates automatically
app.post<{ Body: CreateUserInput }>(
  '/',
  {
    schema: { body: CreateUserSchema },
    preHandler: [requireAuth],
  },
  async (request, reply) => {
    // request.body is already validated and typed
    const user = await createUser(request.body);
    return reply.status(201).send(user);
  }
);

// WRONG - Don't manually parse
app.post('/', async (request, reply) => {
  const input = CreateUserSchema.parse(request.body); // Don't do this
});
```

#### Type Usage
- Use `AppInstance` type (from `@shared/types/fastify.js`) instead of `FastifyInstance`
- Use `Prisma.ModelGetPayload<{include: {...}}>` for accurate return types with includes

#### Error Handling
Use `@fastify/sensible` for simple HTTP errors:
```typescript
throw app.httpErrors.notFound('User not found');
throw app.httpErrors.forbidden('Insufficient permissions');
throw app.httpErrors.badRequest('Invalid input');
```

Use `AppError` for business errors with codes:
```typescript
throw new AppError('Sponsorship code already used', 409, true, ErrorCodes.CONFLICT, { code });
```

#### Pagination
Use the shared pagination utility:
```typescript
import { paginate, getSkip, type PaginatedResult } from '@shared/utils/pagination.js';

const skip = getSkip({ page, limit });
const [data, total] = await Promise.all([
  prisma.user.findMany({ skip, take: limit }),
  prisma.user.count({ where }),
]);
return paginate(data, total, { page, limit });
```

#### Database
- Prisma singleton at `src/database/client.ts`, accessible via `app.prisma`
- Config: Zod-validated env vars at `src/config/app.config.ts`
- Cross-module imports: Only through barrel exports, enforced by ESLint

### Testing

Tests use Vitest with Fastify's `inject()` method:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, cleanupDatabase } from '../helpers/test-app.js';

describe('Users API', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/users/me returns current user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });
});
```
