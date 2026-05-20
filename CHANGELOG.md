# Changelog

All notable changes to `content-genie-mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.11.0...HEAD
[2.11.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/compare/v2.10.0...v2.11.0
[2.10.0]: https://github.com/MUSE-CODE-SPACE/content-genie-mcp/releases/tag/v2.10.0
