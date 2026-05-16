# FNDK Trading Platform

Starter monorepo for an AI-powered trading investment platform with:

- React 18 + Vite investor and admin dashboards
- NestJS microservice scaffold for identity, wallet, VIP, task, notification, and admin domains
- Shared TypeScript contracts and utilities
- Shared infrastructure package for Postgres and RabbitMQ
- PostgreSQL raw SQL migration bootstrap
- Docker Compose for PostgreSQL, RabbitMQ, frontend, and all services

## Workspace layout

```text
apps/
  frontend/
  backend/
    identity-service/
    wallet-service/
    vip-service/
    task-service/
    notification-service/
    admin-service/
packages/
  shared-types/
  shared-utils/
migrations/
```

## Start points

- Frontend routes live in `apps/frontend/src/router/index.tsx`
- Shared contracts live in `packages/shared-types/src/index.ts`
- VIP business constants and helpers live in `packages/shared-utils/src/index.ts`
- Shared database and event bus helpers live in `packages/shared-infra/src/index.ts`
- SQL bootstrap lives in `migrations/001_init.sql`

## Commands

```bash
npm install
npm run typecheck
npm run dev --workspace apps/frontend
npm run dev --workspace apps/backend/identity-service
npm run dev --workspace apps/backend/task-service
npm run typecheck --workspaces --if-present
docker compose up --build
```

Fresh database migration order:

```bash
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/001_init.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/002_seed_admin.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/003_kyc_submissions.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/004_ai_trading_activations.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/005_seed_ai_trading_activations.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/006_admin_access_and_giveaway_settings.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/007_remove_dummy_data.sql
```

Initial admin login after running migrations:

- Email: `admin@fndk.capital`
- Password: `FndkAdmin2026!`

## Current status

This repo is scaffolded with representative controllers, services, routes, and dashboard views. It still needs:

- refresh token persistence beyond stateless JWT re-issue
- file upload handling for KYC and payment proofs
- socket.io server wiring and email delivery implementation
- end-to-end tests and production hardening

## Implemented backend flow

- `identity-service` persists users in Postgres and publishes `user.registered`
- JWT bearer authentication and role guards are shared through `@nevo/shared-infra`
- KYC submissions and deposit proofs are stored on disk under `uploads/` and exposed at `/uploads/*`
- `wallet-service` persists deposits/withdrawals, provisions wallets, and consumes deposit, withdrawal, and profit events
- `vip-service` reads tiers from Postgres and recalculates `user_vip` assignments from event activity
- `task-service` handles manual AI activations with tier-based daily click limits and timed completion, and it can still publish `profit.distributed`
- `notification-service` persists notifications and consumes platform events
- `admin-service` reads platform metrics from SQL and publishes approval events for deposits and withdrawals
