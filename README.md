# My Backend

A production-ready Node.js backend using the modular monolith architecture pattern with Fastify.

## Tech Stack

- **Runtime**: Node.js 22 LTS
- **Framework**: Fastify 5.x
- **Type System**: TypeScript 5.7+
- **Validation**: Zod 4.x
- **Database**: Prisma 6.x
- **Logging**: Pino 10.x

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment file and configure:
   ```bash
   cp .env.example .env
   ```

3. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

4. Run database migrations (when you have models):
   ```bash
   npm run db:migrate
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run type-check` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run database migrations |

## Project Structure

```
src/
├── index.ts                    # Application entry point
├── config/
│   └── app.config.ts           # Zod-validated env vars + derived config
├── core/
│   ├── server.ts               # Fastify setup, plugins, route registration
│   ├── plugins.ts              # CORS, Helmet, Rate limiting
│   ├── hooks.ts                # Request/response lifecycle hooks
│   └── shutdown.ts             # Graceful shutdown handler
├── database/
│   └── client.ts               # Prisma singleton with transaction config
├── modules/                    # Feature modules go here
│   └── .gitkeep
└── shared/
    ├── middleware/
    │   └── error.middleware.ts # Global error handler
    ├── errors/
    │   ├── app-error.ts        # Custom error class
    │   ├── error-codes.ts      # Enumerated error codes
    │   └── zod-error-formatter.ts
    ├── types/
    │   └── fastify.d.ts        # Fastify type augmentation
    └── utils/
        └── logger.ts           # Pino logger configuration
```

## Adding a Module

1. Create folder: `src/modules/{module}/`
2. Create barrel: `src/modules/{module}/index.ts`
3. Add path alias to `tsconfig.json`:
   ```json
   "@{module}": ["./src/modules/{module}/index.ts"]
   ```
4. Add ESLint boundary rule in `eslint.config.js`
5. Create subdomains as needed with:
   - `{subdomain}.schemas.ts` - Zod schemas with `.strict()`
   - `{subdomain}.service.ts` - Business logic (one table only)
   - `{subdomain}.routes.ts` - HTTP handlers

## Architecture Rules

| Rule | Reason |
|------|--------|
| Use `.js` in imports | ES modules requirement |
| Use `.strict()` on Zod schemas | Security - rejects unknown fields |
| One table per service | Clean boundaries |
| Cross-module via barrel only | Enforced by ESLint |
| Routes orchestrate, not services | Clear responsibility |
