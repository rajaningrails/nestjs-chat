# NestJS Chat — CLAUDE.md

## Stack
- **Runtime:** Node.js + NestJS v11, Fastify adapter
- **DB:** MySQL via TypeORM v0.3.28 (synchronize=on in dev, off in prod)
- **Cache/Queue:** Redis (ioredis) + BullMQ
- **Realtime:** Socket.IO v4 via `@nestjs/websockets`
- **Storage:** AWS S3 (presigned URLs)
- **Language:** TypeScript 5.7, target ES2023

## Source Layout
```
src/
  main.ts                    # Bootstrap (Fastify, CORS, pipes, graceful shutdown)
  app.module.ts              # Root module
  modules/
    users/                   # User accounts (school_id, user_id, type, is_admin)
    conversations/           # 1-on-1 conversations
    messages/                # Messages + WebSocket gateway + BullMQ processor
    group/                   # Group chats + members + seen receipts
    chat_configs/            # Chat config settings
    health/                  # Health check
    dlq/                     # Dead Letter Queue recovery
    debug/                   # Debug endpoints
  infrastructure/
    database/                # TypeORM DataSource, migrations/ (empty — uses sync)
    redis/                   # ioredis module
    queue/ bullmq/           # BullMQ queue setup
    socket/                  # Socket.IO gateway
    aws/                     # S3 upload
    config/                  # database.config, redis.config, queue.config, logger.config
    job/                     # @nestjs/schedule tasks
  common/
    decorators/
    exceptions/
    filters/                 # HttpExceptionFilter (global)
    guard/                   # Auth guards
    interceptors/            # TransformInterceptor (global)
    services/
    storage/                 # File storage abstraction
    throttler/               # Rate limiting
```

## DB Entities
| Entity | Key fields |
|---|---|
| `users` | school_id, user_id (unique), name, image, type, is_admin, class, section |
| `messages` | 7 indexes: conversation, school, sender, group, created_at, combined, seen_at |
| `conversations` | 1-on-1 conversation tracking |
| `chat_groups` | Group chat |
| `chat_group_members` | Membership |
| `chat_group_message_seen` | Read receipts |
| `chat_configs` | Config settings |

## Env Vars (see `.env.example`)
`DATABASE_*`, `REDIS_HOST/PORT`, `REDIS_URL`, `PORT` (default 4001), `NODE_ENV`, `SECRET` (required — no fallback), `ALLOWED_ORIGINS` (comma-separated), `MESSAGE_BATCH_SIZE`, `MESSAGE_BATCH_TIMEOUT`, `MAX_CONNECTIONS_PER_WORKER`, `AWS_KEY`, `AWS_SECRET`, `AWS_ENDPOINT`, `AWS_BUCKET`

## Key Conventions
- Each module follows: `controller → service → repository → use-cases → dto → entities`
- DTOs use `class-validator` + `class-transformer`; global pipe has `whitelist: true, transform: true`
- Entities live in `src/**/*.entity.ts` — TypeORM auto-discovers them; `synchronize` is off in production
- Migrations path: `src/infrastructure/database/migrations/`
- Logging: Winston via `nest-winston`; logs written to `logs/`
- Port: `process.env.PORT ?? 4001`

## Auth & Security
- **HTTP auth**: Global `HmacAuthGuard` — validates `x-signature`, `x-timestamp`, `x-app-id`, `x-app-user-id` headers. Signature = `HMAC-SHA256(secret, "<timestamp>:<METHOD>:<path>")`. Mark public endpoints with `@Public()`.
- **Socket auth**: `socketAuthMiddleware` — same HMAC scheme, signs `"<timestamp>:<sender_id>"`. Passes validated `userId` via `socket.data.userId`.
- **CORS**: Whitelist via `ALLOWED_ORIGINS` env var (comma-separated). Falls back to allow-all in dev.
- **Security headers**: `@fastify/helmet` registered in `main.ts` (CSP enabled in production only).
- **Rate limiting**: `ChatThrottlerGuard` keys on `x-app-id`+`x-app-user-id` (HMAC-validated, not spoofable); falls back to IP for `@Public()` routes.

## Socket.IO Scaling
- `@socket.io/redis-adapter` wired in `MessageGateway.afterInit()` via two `ioredis` duplicate connections. Required for PM2 cluster mode (4 instances).
- Gateway emits a **single** `newMessage` event containing both `message` and `conversation` fields. Clients must handle `newMessage` (not the old `message` + `latestMessageIndividual` pair).

## S3 Presigned URLs
- `S3PresignedUrlService.generatePresignedUrl()` caches results in Redis with TTL = 90% of the expiry time. Cache key: `s3:presign:<key>:<expiryTime>`. Redis failures are non-fatal (falls through to fresh presign).

## Pagination
- Hard cap of 100 records per page enforced in `MessageRepository` (`MAX_PAGE_SIZE = 100`). Applies to `findByConversation`, `getConversationMessages`, and `searchMessages`.
- `cleanupOldMessages` deletes in batches of 500 to avoid table locks.

## Scripts
```
npm run start:dev    # watch mode
npm run build        # tsc build → dist/
npm run start:prod   # node dist/main
npm run migration:run
npm run migration:generate -- --name=<Name>
```

## What to skip
- `dist/`, `node_modules/`, `logs/`, `.env` — see `.claudeignore`
- `graphify-out/` — generated knowledge graph, not source
- `public/socket-monitor.html` — static debug tool
