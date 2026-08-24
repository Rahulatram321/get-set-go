# Contributing to OrbitQueue

## Development Setup

1. Fork and clone the repository
2. `cp .env.example .env`
3. `pnpm install`
4. `docker compose up postgres redis -d`
5. `pnpm db:generate && pnpm db:migrate && pnpm db:seed`
6. `pnpm dev`

## Code Standards

- TypeScript strict mode
- No `any` unless absolutely necessary
- Business logic in services, not controllers
- Infrastructure abstractions in `packages/queue-core`
- All API endpoints require auth unless explicitly public
- Tests for core distributed systems logic

## Pull Request Process

1. Create a feature branch
2. Ensure `pnpm typecheck && pnpm test && pnpm build` pass
3. Update documentation if architecture changes
4. Submit PR with clear description
