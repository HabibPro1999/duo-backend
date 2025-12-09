# Module Architecture

## Overview

This document defines the modular decomposition of the Event Registration Platform backend. The architecture follows a **modular monolith** pattern with 8 distinct modules, each with clear ownership boundaries and no circular dependencies.

---

## Module Decomposition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              IDENTITY                                        │
│  Users • Firebase Auth • Roles • Permissions • Auth Middleware              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ (foundational - all modules depend on this)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               CLIENTS                                        │
│  Client CRUD • Branding (logo, colors) • Contact Info                       │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               EVENTS                                         │
│  Event CRUD • Status Machine • Capacity Tracking • Social Image             │
└───────────────────┬─────────────────────────────────┬───────────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────┐   ┌─────────────────────────────────────┐
│              FORMS                │   │           SPONSORSHIPS              │
│  Form Schema (JSONB)              │   │  Lab Requests • Approval Workflow   │
│  Field Types • Conditions         │   │  Code Generation • Validation       │
│  Pricing Config • Multi-lang      │   │  Consumption • Reactivation         │
│  Public: GET by slug              │   │  Public: Request + Validate         │
└───────────────────┬───────────────┘   └──────────────┬──────────────────────┘
                    │                                  │
                    └──────────────┬───────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REGISTRATIONS                                      │
│  Submissions • Status Machine • Payment Tracking • Bank Transfer Verify     │
│  Edit Token Flow • Notes • Duplicate Prevention • Capacity Consumption      │
│  Public: Submit + Edit via token                                            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NOTIFICATIONS                                       │
│  Email Service (Resend) • Templates • Variable Interpolation • Logs         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              AUDIT                                           │
│  Activity Logging • Change Tracking • Compliance (cross-cutting)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Ownership Matrix

| Module | Prisma Models | Public Routes | Admin Routes |
|--------|---------------|---------------|--------------|
| **identity** | `User` | — | `/api/users` |
| **clients** | `Client` | — | `/api/clients` |
| **events** | `Event` | — | `/api/events`, `/api/clients/:id/events` |
| **forms** | `Form` | `GET /api/public/forms/:slug` | `/api/events/:id/forms` |
| **registrations** | `Registration`, `RegistrationNote` | `POST /api/public/registrations`, `GET/PUT .../:token` | `/api/events/:id/registrations` |
| **sponsorships** | `Sponsorship` | `POST /api/public/sponsorships/request`, `POST .../validate` | `/api/events/:id/sponsorships` |
| **notifications** | `EmailLog` | — | `/api/events/:id/emails` |
| **audit** | `AuditLog` | — | `/api/audit` |

---

## Module Internal Structure

```
src/modules/
├── identity/
│   ├── index.ts                  # Barrel: services, middleware, routes
│   ├── users.schema.ts           # Zod schemas
│   ├── users.service.ts          # User CRUD
│   ├── users.routes.ts           # Admin routes
│   ├── auth.service.ts           # Firebase token verification
│   ├── auth.middleware.ts        # requireAuth, requireRole, requireClient
│   └── permissions.ts            # Role definitions, permission checks
│
├── clients/
│   ├── index.ts
│   ├── clients.schema.ts
│   ├── clients.service.ts
│   └── clients.routes.ts
│
├── events/
│   ├── index.ts
│   ├── events.schema.ts
│   ├── events.service.ts
│   ├── events.routes.ts
│   └── capacity.service.ts       # Isolated capacity logic
│
├── forms/
│   ├── index.ts
│   ├── forms.schema.ts
│   ├── forms.service.ts
│   ├── forms.routes.ts           # Admin routes
│   ├── forms.public.routes.ts    # Public: get by slug
│   └── schema-builder/
│       ├── fields.ts             # Field type definitions
│       ├── conditions.ts         # Conditional logic evaluation
│       ├── pricing.ts            # Price calculation from selections
│       └── validation.ts         # Schema validation helpers
│
├── registrations/
│   ├── index.ts
│   ├── registrations.schema.ts
│   ├── registrations.service.ts
│   ├── registrations.routes.ts
│   ├── registrations.public.routes.ts
│   ├── payments.service.ts       # Payment status transitions, verification
│   ├── notes.service.ts          # Admin notes on registrations
│   └── edit-token.service.ts     # Token generation, validation, expiry
│
├── sponsorships/
│   ├── index.ts
│   ├── sponsorships.schema.ts
│   ├── sponsorships.service.ts   # Approval workflow, status transitions
│   ├── sponsorships.routes.ts
│   ├── sponsorships.public.routes.ts
│   └── codes.service.ts          # Code generation, validation, consumption
│
├── notifications/
│   ├── index.ts
│   ├── emails.schema.ts
│   ├── emails.service.ts         # Resend integration
│   ├── emails.routes.ts          # Manual email sending
│   ├── email-logs.service.ts
│   └── templates/
│       ├── confirmation.ts
│       ├── sponsorship-code.ts
│       └── interpolation.ts      # {{firstName}} replacement
│
└── audit/
    ├── index.ts
    ├── audit.schema.ts
    ├── audit.service.ts          # logAction(entity, action, changes, userId)
    └── audit.routes.ts           # Admin: query audit logs
```

---

## Dependency Graph

```
identity ◄──────────────────────────────────────────────────────────┐
    │                                                                │
    ▼                                                                │
clients ◄─────────────────────────────────────────────────┐         │
    │                                                      │         │
    ▼                                                      │         │
events ◄────────────────────────────────────┐             │         │
    │                                        │             │         │
    ├───────────────┬────────────────────────┤             │         │
    ▼               ▼                        │             │         │
  forms        sponsorships                  │             │         │
    │               │                        │             │         │
    │               │ (code validation)      │             │         │
    │               ▼                        │             │         │
    └──────► registrations ◄─────────────────┘             │         │
                    │                                      │         │
                    ▼                                      │         │
             notifications ────────────────────────────────┘         │
                    │                                                │
                    ▼                                                │
                  audit ─────────────────────────────────────────────┘
```

### Avoiding Circular Dependencies

Sponsorship code **consumption** happens in the `registrations` module, not `sponsorships`. The `sponsorships` module only exposes:

- `validateCode(code, eventId)` → returns sponsorship or null
- `markCodeConsumed(code, registrationId)` → called by registrations after successful submission

This prevents circular dependencies between registrations and sponsorships.

---

## Cross-Cutting Concerns

### Shared Utilities (not modules)

```
src/shared/
├── services/
│   └── storage.service.ts        # Firebase Storage upload/delete
├── middleware/
│   └── error.middleware.ts       # Global error handler
├── errors/
│   ├── app-error.ts
│   ├── error-codes.ts
│   └── zod-error-formatter.ts
├── types/
│   └── fastify.d.ts
└── utils/
    ├── logger.ts                 # Pino logger
    ├── slug.ts                   # URL-safe slug generation
    └── crypto.ts                 # Secure token generation
```

### Audit Integration Pattern

Every module imports the audit service directly:

```typescript
import { AuditService } from '@audit';

// In registrations.service.ts
await AuditService.log({
  entity: 'registration',
  entityId: registration.id,
  action: 'payment_verified',
  changes: { paymentStatus: { from: 'pending_verification', to: 'paid' } },
  userId: verifierId,
});
```

---

## Design Decisions

### Why Not Fewer Modules?

| Alternative | Rationale for Rejection |
|-------------|------------------------|
| Merge `clients` + `events` | Different lifecycles—clients are long-lived, events are time-bound. Super Admin manages clients; Client Admin manages events. |
| Merge `forms` + `registrations` | Form **builder** vs form **submissions** are different concerns. Forms can exist without registrations. Schema builder logic is complex enough to isolate. |
| Merge `payments` into separate module | Tempting for payment gateway isolation, but payments are always in registration context. Extract later if needed. |
| Merge `notifications` + `audit` | Different purposes—audit is compliance, notifications is user communication. Different query patterns. |

### Why Not More Modules?

| Alternative | Rationale for Rejection |
|-------------|------------------------|
| Separate `payments` module | Payments are never independent of registrations. Bank transfer verification is registration-context. Keep together until payment gateway complexity justifies extraction. |
| Separate `notes` module | Notes only exist on registrations. 1 table, 2 operations. Too small. |
| Separate `capacity` module | Capacity is event attribute + registration effect. Cross-cutting but not independent enough. |
| Separate `storage` module | No Prisma model. Pure infrastructure. Belongs in `shared/services/`. |

---

## Implementation Order

Based on PRD implementation phases:

```
Phase 1: identity → clients                          # Foundation
Phase 2: events → forms (basic)                      # Event & Form Core
Phase 3: forms (complete)                            # Form Builder Complete
Phase 4: registrations                               # Registration System
Phase 5: registrations (payments)                    # Payment System
Phase 6: sponsorships                                # Sponsorship System
Phase 7: notifications                               # Email & Communications
Phase 8: audit                                       # Polish & Launch
```

---

## Module Summary

| # | Module | Complexity | Tables | Key Responsibility |
|---|--------|------------|--------|-------------------|
| 1 | `identity` | Medium | 1 | Auth, users, permissions |
| 2 | `clients` | Low | 1 | Client organizations |
| 3 | `events` | Medium | 1 | Events, capacity |
| 4 | `forms` | High | 1 | Dynamic form builder |
| 5 | `registrations` | High | 2 | Submissions, payments, notes |
| 6 | `sponsorships` | Medium | 1 | Code lifecycle |
| 7 | `notifications` | Medium | 1 | Email delivery |
| 8 | `audit` | Low | 1 | Activity logging |

---

## Future Considerations

- **Payment Gateway Extraction**: If online payment integration (CMI) becomes complex, extract `payments` into its own module
- **Module Federation**: If team grows, modules can be assigned to different teams with clear API contracts
- **Event Sourcing**: Audit module provides foundation for event sourcing if needed later
