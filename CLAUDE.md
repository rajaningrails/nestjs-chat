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
`DATABASE_*`, `REDIS_HOST/PORT`, `PORT` (default 4001), `NODE_ENV`, `SECRET`, `MESSAGE_BATCH_SIZE`, `MESSAGE_BATCH_TIMEOUT`, `MAX_CONNECTIONS_PER_WORKER`

## Key Conventions
- Each module follows: `controller → service → repository → use-cases → dto → entities`
- DTOs use `class-validator` + `class-transformer`; global pipe has `whitelist: true, transform: true`
- Entities live in `src/**/*.entity.ts` — TypeORM auto-discovers them
- Migrations path: `src/infrastructure/database/migrations/` (currently unused; sync mode active)
- Logging: Winston via `nest-winston`; logs written to `logs/`
- Port: `process.env.PORT ?? 4001`

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
