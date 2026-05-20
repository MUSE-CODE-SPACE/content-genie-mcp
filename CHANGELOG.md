# Changelog

All notable changes to `content-genie-mcp` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- More trend sources (Tistory realtime, Brunch picks, Kakao View).
- Image-in thumbnail analysis (`analyze_thumbnail` currently works on concept descriptions only).
- `resource://content-genie/trends/{platform}/latest` so the LLM can read last-scrape results without spending a tool call.
- Opt-in Naver 검색광고 API integration for real search volume when the user supplies a key.

## [2.12.0] - 2026-05-20

### Highlights ⭐
- **17 tools, six small files.** The 4,712-line monolith is gone — domain-grouped modules (`trends`, `seo`, `contentIdeas`, `viralScoring`, `competitorAnalysis`, `koreanEvents`) make adding a tool a one-line edit.
- **A bad day at Naver no longer takes the MCP down.** Every scraper sits behind a per-source circuit breaker (3 fails → open 5 min) with stale-cache fallback; degraded sources surface as `status: 'stale' | 'unavailable'` so the LLM can adapt.
- **`@-mention` Korean events for any year.** `resource://content-genie/korean-events/2027` returns the full 100+ event DB rebased to 2027 — no tool call needed.
- **One slash command for the viral-title workflow.** `prompt://content-genie/viral-title` chains `optimize_title_hashtags` → `predict_viral_score` → `generate_ab_test_variants`.

### Added
- **Scraper circuit breaker** (`src/core/circuitBreaker.ts`) — per-source state machine: closed → open after 3 consecutive failures → half-open after 5 min → closed on next success or back to open on next failure. Protects against silent breakage when Naver / Daum HTML changes.
- **LRU + TTL cache** (`src/core/cache.ts`) — 100-entry, 15-minute TTL, used by every scraper. Expired entries are kept for stale fallback so a degraded source can still serve last-known-good data.
- **`runScraper` reliability primitive** (`src/scrapers/shared.ts`) — wraps every scraper call with: fresh cache hit → circuit breaker → stale cache fallback → `status: 'unavailable'`. Scrapers no longer throw; they return a `ScrapeResult` envelope.
- **MCP Resources (2):**
  - `resource://content-genie/korean-events/{year}` — full event DB rebased to any year (JSON).
  - `resource://content-genie/sources` — live snapshot of every scraper's circuit-breaker state + cache health.
- **MCP Prompts (2):**
  - `prompt://content-genie/viral-title` — multi-tool workflow (optimize → predict → A/B).
  - `prompt://content-genie/competitor-analysis` — guided URL analysis + gap-filling ideation.
- **Jest test suite** (`src/__tests__/`) — 38 tests across 8 suites covering circuit-breaker transitions, cache TTL/LRU, scraper status paths, registry uniqueness, viral scoring, SEO, competitor analysis (SSRF), and event DB.
- **`npm test` script** plus `jest` + `ts-jest` devDeps; CI now runs `npm test` before build on the Node 20 + 22 matrix.

### Changed
- **`src/index.ts` modularized.** Layered structure:
  - `src/index.ts` (≈ 96 LOC) — HTTP/stdio bootstrap only.
  - `src/server.ts` — `McpServer` factory + registry wiring.
  - `src/tools/*.ts` — 17 tools grouped by domain.
  - `src/scrapers/*.ts` — one file per source + shared circuit-breaker/cache wrapper.
  - `src/data/koreanEvents.ts` — 100+ event DB extracted from inline code.
  - `src/core/` — registry, cache, circuit breaker, security.
  - `src/types.ts` — shared Zod schemas + type aliases.
- **Tools registered via `McpServer.registerTool`** (modern config-object API). The legacy positional `tool(name, desc, schema, cb)` overload is no longer used.

### Notes
- All 17 tools retained the same name + input schema → **no breaking change for existing MCP consumers**.
- Graceful degradation: when a scraper source is unavailable, the combined trend response includes a `source_status` array so the LLM can see which platforms are degraded.

## [2.11.0] - 2026-05-20

### Highlights ⭐
- **SSRF + body-size protection.** `analyze_competitor_content` (the one tool that fetches user-supplied URLs) is now behind a host allowlist + 30-second timeout + 5 MiB streaming body cap.
- **CI on every push.** Node 20 + 22, typecheck + build + Inspector smoke, plus a tag-triggered release workflow.

### Added
- **Security utilities** (`src/core/security.ts`)
  - `validatePublicUrl()` — SSRF guard + allowlist for user-supplied URLs. Default allowlist covers Korean search/social/commerce platforms. Override via `CONTENT_GENIE_ALLOWED_HOSTS`.
  - `fetchWithRetry()` — 30 s timeout, exponential backoff on `429` / `5xx`, `Retry-After` honored, hard 5 MiB response-body cap (streaming enforcement).
  - `validatePathWithinDirectory()` & `sanitizeFilename()` — path-traversal guards for future filesystem-touching tools.
- **Structured errors** (`src/core/errors.ts`): `ToolError` with codes `VALIDATION_ERROR`, `TIMEOUT`, `NETWORK_ERROR`, `BODY_TOO_LARGE`, `RATE_LIMIT`, etc. JSON-serializable for clean MCP wire responses.
- **`analyze_competitor_content` hardening** — validates each user-supplied URL against the allowlist, reports rejections with structured error codes, and uses `fetchWithRetry` so a malicious URL cannot hang the server or stream multi-GB bodies.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): `npm ci` + `tsc --noEmit` + `npm run build` + dist verification on Node 20 & 22 against every push and PR to `main`.
- **Release workflow** (`.github/workflows/release.yml`): tag-triggered build + `npm publish` (skips cleanly if `NPM_TOKEN` is absent) + auto-generated GitHub Release notes.
- **Inspector smoke test** (`.github/workflows/verify.yml`): manual `workflow_dispatch` that runs MCP Inspector against the built binary to confirm `tools/list` returns.
- **`SECURITY.md`** with threat model, control inventory, reporting instructions, and operator hardening checklist.
- **`CHANGELOG.md`** (this file).
- **`npm run typecheck`** script for CI-friendly type checking without writing output.
- **`files` whitelist** in `package.json`: only `dist/`, README, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, and `server.json` ship to npm. Replaces the old blacklist-style `.npmignore`.

### Notes
- The MCP SDK was already at `^1.25.1` (latest), so no SDK bump in this release.
- The 4,685-line `src/index.ts` monolith was unchanged in this release; the split happens in 2.12.0.

## [2.10.0] - 2025-12-31

Baseline release at the time the Phase 1 upgrade started.

### Existing capability snapshot
- 17 MCP tools (trend / content idea / SEO / viral score / news / hashtag / calendar / A/B / seasonal / thumbnail / script / repurpose / influencer / performance).
- Trend scrapers for naver, daum, google, youtube, zum.
- 30-minute in-memory trend cache.
- Streamable HTTP transport (MCP 2025-03-26 spec) with `/health`, plus stdio for Claude Desktop / Claude Code.
- Docker + Railway deployment configs.
- Hard-coded Korean event DB through 2026.

[Unreleased]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.12.0...HEAD
[2.12.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.11.0...v2.12.0
[2.11.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.10.0...v2.11.0
[2.10.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/releases/tag/v2.10.0
