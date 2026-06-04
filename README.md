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

Fresh database migration:

```bash
npm run migrate
```

Manual migration order if you are applying files directly:

```bash
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/001_init.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/002_seed_admin.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/003_kyc_submissions.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/004_ai_trading_activations.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/005_seed_ai_trading_activations.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/006_admin_access_and_giveaway_settings.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/007_remove_dummy_data.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/008_withdrawal_rules.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/009_withdrawal_fee.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/010_reservation_controls.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/011_vip_roi_ranges.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/012_ad_carousel_settings.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/013_asset_route_settings.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/014_verification_codes.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/015_fix_deposit_carousel_cta.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/016_security_passcode_and_mission_tasks.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/017_unique_user_phone.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/018_kyc_real_name_fields.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/019_public_user_ids.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/020_vip_direct_member_requirements.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/021_vip_daily_profit_cap.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/022_ensure_vip_runtime_columns.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/023_lucky_draw_event.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/024_lucky_draw_weighted_prizes.sql
psql postgresql://nevo:nevo@localhost:5432/nevo -f migrations/025_lucky_draw_controls_and_audit.sql
```

Initial admin login after running migrations:

- Email: `admin@fndk.capital`
- Password: `FndkAdmin2026!`

## Current status

This repo is scaffolded with representative controllers, services, routes, and dashboard views. It still needs:

- refresh token persistence beyond stateless JWT re-issue
- file upload handling for KYC and payment proofs
- socket.io server wiring
- end-to-end tests and production hardening

## Implemented backend flow

- `identity-service` persists users in Postgres and publishes `user.registered`
- JWT bearer authentication and role guards are shared through `@nevo/shared-infra`
- KYC submissions and deposit proofs are stored on disk under `UPLOADS_DIR` (defaults to `uploads/`) and exposed at `/uploads/*`
- `wallet-service` persists deposits/withdrawals, provisions wallets, and consumes deposit, withdrawal, and profit events
- `vip-service` reads tiers from Postgres and recalculates `user_vip` assignments from event activity
- `task-service` handles manual AI activations with tier-based daily click limits and timed completion, and it can still publish `profit.distributed`
- `notification-service` persists notifications and consumes platform events
- `admin-service` reads platform metrics from SQL and publishes approval events for deposits and withdrawals

Local email is delivered to MailHog in Docker Compose at http://localhost:8025. For real email, set `SMTP_HOST`, `SMTP_PORT`, optional `SMTP_USER`/`SMTP_PASS`, and `SMTP_FROM` to an SMTP provider.

For Render deployments, attach a persistent disk to services that store uploads and set `UPLOADS_DIR` to the disk path, for example `/var/data/uploads`. Without a persistent disk, uploaded KYC files can disappear after a deploy/restart while their database URLs still point to `/uploads/...`.

For durable KYC images without relying on Render disk storage, set `CLOUDINARY_URL` on `identity-service` using the format `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. When this is set, new KYC submissions are uploaded to Cloudinary and saved with permanent `https://res.cloudinary.com/...` URLs.
# fndk
