# Contributing to metro-bundle-visualizer

## Prerequisites

- Node.js 18+
- A React Native project (bare or Expo) for manual integration testing

## Setup

```bash
git clone https://github.com/suleymancelikel/metro-bundle-visualizer.git
cd metro-bundle-visualizer
npm install
npm run build
```

## Development Workflow

```bash
npm test              # run tests
npm test -- --watch   # watch mode
npm run typecheck     # type check
npm run build         # compile
```

To test against a real RN project:

```bash
npm run build
npm link
cd /path/to/your-rn-project
metro-bundle-visualizer
```

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add android platform support
fix: handle missing metro.config.js gracefully
docs: update quick start example
chore: bump dependencies
test: add integration test for detect.ts
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `ci`

Breaking changes: append `!` — `feat!: rename --out to --output`

## Pull Request Process

1. Fork and branch: `feat/your-feature` or `fix/your-bug`
2. Write tests before implementation (TDD)
3. Ensure `npm test` and `npm run typecheck` pass
4. Open PR against `main`

## Labels

- `good first issue` — great starting points
- `help wanted` — contributions especially welcome
- `bug` — confirmed bugs
- `enhancement` — new features
