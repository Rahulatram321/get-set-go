#!/usr/bin/env bash
# OrbitQueue — local setup WITHOUT Docker (macOS + Homebrew)
set -e

cd "$(dirname "$0")/.."

echo "=== OrbitQueue Local Setup (no Docker) ==="
echo ""

# 1. Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js 20+ required. Install from https://nodejs.org or: nvm install 20"
  exit 1
fi
echo "✓ Node $(node -v)"

# 2. Check/install PostgreSQL
if ! command -v psql &>/dev/null; then
  echo ""
  echo "PostgreSQL not found. Install with:"
  echo "  brew install postgresql@16"
  echo "  brew services start postgresql@16"
  echo "  echo 'export PATH=\"/opt/homebrew/opt/postgresql@16/bin:\$PATH\"' >> ~/.zshrc"
  echo "  source ~/.zshrc"
  echo ""
  echo "Then re-run: pnpm setup:local"
  exit 1
fi
echo "✓ PostgreSQL found"

# 3. Check/install Redis
if ! command -v redis-cli &>/dev/null; then
  echo ""
  echo "Redis not found. Install with:"
  echo "  brew install redis"
  echo "  brew services start redis"
  echo ""
  echo "Then re-run: pnpm setup:local"
  exit 1
fi
echo "✓ Redis found"

# 4. Start services if not running
if ! redis-cli ping &>/dev/null 2>&1; then
  echo "Starting Redis..."
  brew services start redis 2>/dev/null || redis-server --daemonize yes 2>/dev/null || true
  sleep 1
fi
if ! redis-cli ping &>/dev/null 2>&1; then
  echo "❌ Redis is not running. Run: brew services start redis"
  exit 1
fi
echo "✓ Redis running"

# Start Postgres if needed (macOS brew)
if ! pg_isready -q 2>/dev/null; then
  echo "Starting PostgreSQL..."
  brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
  sleep 2
fi
if ! pg_isready -q 2>/dev/null; then
  echo "❌ PostgreSQL is not running. Run: brew services start postgresql@16"
  exit 1
fi
echo "✓ PostgreSQL running"

# 5. Create database (uses your macOS user — no password needed locally)
DB_USER="${PGUSER:-$(whoami)}"
export DATABASE_URL="postgresql://${DB_USER}@localhost:5432/orbitqueue"

echo ""
echo "Creating database 'orbitqueue' (if needed)..."
createdb orbitqueue 2>/dev/null || true

# Update .env DATABASE_URL for local dev without custom user
if grep -q "orbitqueue:orbitqueue@" .env 2>/dev/null; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env
  else
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env
  fi
  echo "✓ Updated .env DATABASE_URL for local Postgres user: ${DB_USER}"
fi

# 6. Install deps
echo ""
echo "Installing dependencies..."
pnpm install

# 7. Prisma
echo ""
echo "Generating Prisma client & running migrations..."
pnpm db:generate
pnpm db:migrate

# 8. Seed demo data
echo ""
echo "Seeding demo data..."
pnpm db:seed

echo ""
echo "============================================"
echo "✅ Setup complete!"
echo ""
echo "Start the platform (open 4 terminals OR use one):"
echo ""
echo "  Terminal 1 — API:       pnpm --filter @orbitqueue/api dev"
echo "  Terminal 2 — Worker:   pnpm --filter @orbitqueue/worker dev"
echo "  Terminal 3 — Scheduler: pnpm --filter @orbitqueue/scheduler dev"
echo "  Terminal 4 — Web UI:     pnpm --filter @orbitqueue/web dev"
echo ""
echo "Or all at once:  pnpm dev"
echo ""
echo "Optional live demo jobs:  pnpm demo"
echo ""
echo "Open:  http://localhost:3000"
echo "Login: admin@orbitqueue.dev / password123"
echo "API:   http://localhost:3001/docs"
echo "============================================"
