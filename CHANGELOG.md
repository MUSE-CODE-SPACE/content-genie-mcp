# Changelog

All notable changes to `content-genie-mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.12.0] - 2026-05-20

### Changed

- **Modularized `src/index.ts`** — the 4 712-line monolith was split into
  a layered structure:
  - `src/index.ts` (≈ 96 LOC) — entry point only (HTTP/stdio bootstrap)
  - `src/server.ts` — `McpServer` factory + registry wiring
  - `src/tools/` — 17 MCP tools grouped by domain (trends, seo,
    contentIdeas, viralScoring, competitorAnalysis, koreanEvents)
  - `src/scrapers/` — one file per source (naver, daum, google, youtube,
    zum) plus a shared circuit-breaker + cache wrapper
  - `src/data/koreanEvents.ts` — the 100+ event database, extracted from
    inline code
  - `src/core/` — registry, cache, circuit breaker, security (Phase 1)
  - `src/types.ts` — shared Zod schemas + type aliases
- **Tools registered via `McpServer.registerTool`** (the modern config-object
  API). The legacy positional `tool(name, desc, schema, cb)` overload is no
  longer used.

### Added

- **Scraper circuit breaker** (`src/core/circuitBreaker.ts`) — per-source
  state machine: closed → open after 3 consecutive failures → half-open
  after 5 min → closed on next success or back to open on next failure.
  Protects against silent breakage when Naver / Daum HTML changes.
- **LRU + TTL cache** (`src/core/cache.ts`) — 100-entry, 15-minute TTL.
  Used by every scraper. Expired entries are kept around for **stale
  fallback** so a degraded source can still serve last-known-good data.
- **`runScraper` reliability primitive** (`src/scrapers/shared.ts`) —
  wraps every scraper call with: fresh cache hit → circuit breaker →
  stale cache fallback → `status: 'unavailable'`. Scrapers no longer
  throw; they return a `ScrapeResult` envelope with explicit status.
- **MCP Resources** —
  - `resource://content-genie/korean-events/{year}` — JSON dump of the
    full event DB rebased to any year (e.g. `…/2027`).
  - `resource://content-genie/sources` — live snapshot of every
    scraper's circuit-breaker state + cache health.
- **MCP Prompts** —
  - `prompt://content-genie/viral-title` — multi-tool workflow:
    `optimize_title_hashtags` → `predict_viral_score` → `generate_ab_test_variants`.
  - `prompt://content-genie/competitor-analysis` — guided URL analysis
    + gap-filling ideation.
- **Jest test suite** (`src/__tests__/`) — 38 tests across 8 suites:
  - `circuitBreaker.test.ts` — open/close/half-open transitions
  - `cache.test.ts` — TTL, LRU eviction, peek-for-stale
  - `scraperFallback.test.ts` — ok/stale/unavailable status paths
  - `registry.test.ts` — exactly 17 tools registered, no dups
  - `koreanEvents.test.ts` — DB lookup + calendar/seasonal tools
  - `viralScoring.test.ts` — viral score, A/B variants, thumbnail
  - `seo.test.ts` — title optimization, hashtag strategy
  - `competitorAnalysis.test.ts` — SSRF guard, benchmark, influencer
- **`npm test` script** + `jest` + `ts-jest` + `@types/jest` devDeps.
- **CI now runs `npm test`** before build (Node 20 + 22 matrix).

### Notes

- All 17 tools retained exactly the same name + input schema → no
  breaking change for existing MCP consumers.
- Graceful degradation: when a scraper source is unavailable, the
  combined trend response includes a `source_status` array so the LLM
  can see which platforms are degraded.

## [2.11.0] - 2026-05-20

### Added

- **Security utilities** (`src/core/security.ts`)
  - `validatePublicUrl()` — SSRF guard + allow-list for user-supplied URLs.
    Default allow-list covers Korean search/social/commerce platforms.
    Override via the `CONTENT_GENIE_ALLOWED_HOSTS` env var.
  - `fetchWithRetry()` — 30 s timeout, exponential backoff on `429`/`5xx`,
    `Retry-After` honored, hard 5 MiB response-body cap (streaming
    enforcement, not just `Content-Length`).
  - `validatePathWithinDirectory()` & `sanitizeFilename()` — path
    traversal guards (exposed for future filesystem-touching tools).
- **Structured errors** (`src/core/errors.ts`): `ToolError` with codes
  `VALIDATION_ERROR`, `TIMEOUT`, `NETWORK_ERROR`, `BODY_TOO_LARGE`,
  `RATE_LIMIT`, etc. Errors are JSON-serializable for clean MCP wire
  responses.
- **`analyze_competitor_content` hardening**: now validates each
  user-supplied URL against the allow-list and reports rejections with
  structured error codes; uses `fetchWithRetry` so a malicious URL
  cannot hang the server or stream multi-GB bodies.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): runs `npm ci`,
  `tsc --noEmit`, `npm run build`, and verifies the dist artifact on
  Node 20 & 22 against every push and PR to `main`.
- **Release workflow** (`.github/workflows/release.yml`): tag-triggered
  build + `npm publish` (skips cleanly if `NPM_TOKEN` is absent) +
  auto-generated GitHub Release notes.
- **Inspector smoke test** (`.github/workflows/verify.yml`): manual
  `workflow_dispatch` that runs MCP Inspector against the built binary
  to confirm `tools/list` returns. Best-effort, doesn't gate merges.
- **`SECURITY.md`** with threat model, control inventory, reporting
  instructions, and operator hardening checklist.
- **`CHANGELOG.md`** (this file).
- **`npm run typecheck`** script for CI-friendly type checking
  without writing output.
- **`files` whitelist** in `package.json`: only `dist/`, README,
  `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, and `server.json` ship to
  npm. Replaces the old blacklist-style `.npmignore`.

### Notes

- The MCP SDK was already at `^1.25.1` (latest), so no SDK bump in this
  release.
- The 4 685-line `src/index.ts` monolith is unchanged in this release.
  Module split is tracked for a follow-up.

## [2.10.0] - 2025-12-31

Baseline release at the time the Phase 1 upgrade started.

### Existing capability snapshot

- 17 MCP tools (trend / content idea / SEO / viral score / news /
  hashtag / calendar / A/B / seasonal / thumbnail / script / repurpose
  / influencer / performance).
- Trend scrapers for naver, daum, google, youtube, zum.
- 30-minute in-memory trend cache.
- Streamable HTTP transport (MCP 2025-03-26 spec) with `/health`,
  plus stdio transport for Claude Desktop / Claude Code.
- Docker + Railway deployment configs.
- Hard-coded Korean event DB through 2026.

[Unreleased]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.12.0...HEAD
[2.12.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.11.0...v2.12.0
[2.11.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.10.0...v2.11.0
[2.10.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/releases/tag/v2.10.0
