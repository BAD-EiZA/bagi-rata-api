# bagi-rata-api

NestJS backend untuk **Bagi Rata**.

## Stack

- NestJS + TypeScript
- Prisma + PostgreSQL (Supabase)
- Clerk Auth
- OpenAPI (`/docs`)

## Setup lokal

1. Salin env:

```bash
cp .env.example .env
```

2. Isi `DATABASE_URL`, `DIRECT_URL`, dan kunci Clerk.

3. Install & generate:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
```

4. Jalankan:

```bash
npm run start:dev
```

- Health: `GET http://localhost:3001/v1/health`
- Docs: `http://localhost:3001/docs`

## Endpoint Fase 0

| Method | Path | Auth |
|---|---|---|
| GET | `/v1/health` | Public |
| GET | `/v1/me` | Bearer Clerk |
| POST | `/v1/me/bootstrap` | Bearer Clerk |
| PATCH | `/v1/me` | Bearer Clerk |
| POST | `/v1/webhooks/clerk` | Svix signature |

## Scripts

```bash
npm run start:dev
npm run build
npm run lint
npx prisma migrate dev
npx prisma studio
```
