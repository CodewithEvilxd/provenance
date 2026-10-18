# Contributing to Provenance

Thank you for your interest in contributing to Provenance!

## Development Workflow

Provenance is structured as a pnpm monorepo.

### Prerequisites

- Node.js v22 or higher
- pnpm v10 or higher
- Docker Desktop (for FalkorDB)

### Setup

1. **Clone & Install**:

   ```bash
   git clone https://github.com/CodewithEvilxd/provenance.git
   cd provenance
   pnpm install
   ```

2. **Start Database**:

   ```bash
   docker compose up -d
   pnpm run probe:graph
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env.local
   ```

### Quality & Verification Standards

Before committing, all changes must pass the full verification suite:

```bash
# 1. Typecheck all packages
pnpm run typecheck

# 2. Run unit and integration tests
pnpm test

# 3. Run browser smoke tests
pnpm run test:e2e

# 4. Linting and formatting
pnpm run lint
pnpm run format:check

# 5. Architecture audit
pnpm run audit:code
```

### Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- Ensure all functions remain concise and focused ($\le 60$ lines).
- Ensure new files adhere to size limits ($\le 300$ lines).
