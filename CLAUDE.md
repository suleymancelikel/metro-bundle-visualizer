# metro-bundle-visualizer — Claude Context

Interactive bundle size visualizer for React Native. Hooks into Metro's serializer pipeline directly instead of post-processing source maps (which are broken on Metro 0.83+ / RN 0.82+).

## Repository Layout

```
src/
  cli.ts          — Commander entry point, exit codes 1 (user error) / 2 (system error)
  detect.ts       — Auto-detects projectRoot, entryFile, metroConfig from cwd
  bundle.ts       — Writes temp metro.config.js, spawns npx react-native bundle, cleans up
  serializer.ts   — captureSerializer() + extractPackageName(); also the package export
  report.ts       — Reads template.html, injects stats JSON + CSS + D3 + treemap.js
  ui/
    template.html — HTML shell with 4 /* PLACEHOLDER */ comments
    styles.css    — Dark theme, flex layout, sidebar, tooltip
    treemap.js    — D3.js treemap, search, sidebar, tooltip (plain browser JS)
tests/
  detect.test.ts    — 10 tests, real filesystem via mkdtempSync
  serializer.test.ts — 10 tests including Windows paths, asset type filtering
  bundle.test.ts    — 17 tests via buildTempConfigContent string assertions
  report.test.ts    — 5 tests including XSS prevention
docs/
  architecture.md   — Pipeline overview, build system, data flow
  api.md            — Public TypeScript interfaces and exports
  testing.md        — Test strategy and patterns
  decisions/        — Architecture Decision Records (ADRs)
```

## Commands

```bash
npm run build       # tsup — outputs dist/cli.js + dist/serializer.js + dist/ui/
npm test            # jest — 42 tests across 4 suites (< 1s)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src --ext .ts
npm run release     # release-it (conventional commits → CHANGELOG → npm publish)
```

## Key Architectural Decisions

**Serializer hook, not source maps.** Metro 0.83+ emits invalid source map column references. This tool injects a custom serializer via a temporary metro.config.js that `require('metro-bundle-visualizer/serializer')`. The bundle output is never altered.

**Two build outputs.** tsup produces `dist/cli.js` (CJS, shebang) and `dist/serializer.js` (CJS, no shebang). The serializer is a separate package export so the temp metro.config.js can require it by name instead of inlining the code.

**open@8.4.2.** `open@9+` is ESM-only and breaks CJS consumers. Pin to `^8.4.2`.

**D3 copied at build time.** D3 is a devDependency. `tsup.config.ts` `onSuccess` copies `node_modules/d3/dist/d3.min.js` → `dist/ui/d3.min.js` so the self-contained HTML report works without a CDN.

**CJS throughout.** The tool runs inside a React Native project's Node environment which is typically CJS. All output is CJS (`format: ['cjs']` in tsup).

## Data Flow

```
cli.ts
  → detect.ts          finds projectRoot, entryFile, metroConfig
  → bundle.ts          writes /tmp/mbv-metro-config-{ts}.js
                       spawns: npx react-native bundle --config <tmpConfig>
                         Metro runs → captureSerializer fires
                         writes /tmp/mbv-stats-{ts}.json
  → report.ts          reads stats JSON + dist/ui assets
                       injects into template.html
                       writes bundle-report.html
  → open               opens HTML in default browser
```

## Temporary Files

- **Temp metro config:** `/tmp/mbv-metro-config-{timestamp}.js` — deleted in `bundle.ts` finally block
- **Stats JSON:** `/tmp/mbv-stats-{timestamp}.json` — deleted in `cli.ts` after report generation
- Neither is a directory; cleanup uses `fs.unlinkSync` in try/catch (no existsSync guard — TOCTOU).

## Conventions

- No comments explaining WHAT code does. Comments only for non-obvious WHY (e.g. open@8 CJS constraint).
- No `existsSync` before file operations — operate directly and catch errors.
- Exit code 1 = user error (no package.json found, wrong args). Exit code 2 = system error (bundle failed, serializer didn't write stats).
- `buildTempConfigContent()` in `bundle.ts` is exported specifically for testing — allows string assertions without spawning a real process.
- `extractPackageName()` in `serializer.ts` is exported for unit testing.
- JSON injected into HTML is unicode-escaped (`<`, `>`, `&`) to prevent `</script>` injection.
- Sidebar file names use `textContent` (not `innerHTML`) for XSS safety.

## Test Patterns

- `detect.test.ts` creates real temp directories with `fs.mkdtempSync` — no mocks for filesystem.
- `bundle.test.ts` tests the generated config string via `buildTempConfigContent()` — never spawns a process.
- `serializer.test.ts` builds a minimal fake `graph.dependencies` Map and calls `captureSerializer` directly.
- `report.test.ts` passes a fake `BundleStats` object and checks the generated HTML string.

## Publishing

```bash
git tag v0.x.x && git push origin v0.x.x
```

GitHub Actions `.github/workflows/release.yml` catches `v*` tags and runs `npm publish --provenance`. Provenance is enabled via `publishConfig.provenance: true` in package.json.
