# Security Policy

`content-genie-mcp` is a public MCP server that scrapes Korean content
platforms and accepts URLs / text from LLM-driven callers. This document
describes the in-process security model and how to report problems.

## Supported versions

Security fixes land on the latest minor release.

| Version | Supported |
|---------|-----------|
| `>= 2.11.x` | yes |
| `< 2.11.0`  | no  |

## Threat model

The server is invoked by an MCP host (Claude Desktop / Claude Code / a
remote LLM via Streamable HTTP). User input arrives through tool
arguments. We assume the LLM may be jailbroken / instructed by an
adversary, so we treat **all tool arguments as untrusted**.

In-scope threats:

1. **SSRF** — attacker passes an internal URL (e.g. cloud-metadata
   `169.254.169.254`, `localhost`, a private RFC1918 IP) to a URL-fetching
   tool and exfiltrates secrets.
2. **Path traversal** — attacker passes `../../etc/passwd` to a tool
   that writes to disk.
3. **Resource exhaustion** — attacker passes a URL that streams a
   multi-GB body, hanging the server or OOM-ing it.
4. **Hung connection / slow loris** — attacker passes a URL whose host
   accepts the TCP handshake but never sends bytes.

Out of scope:

- Network-level abuse of the *outbound* scraper requests we send to
  naver/daum/google. Those endpoints are public.
- Anything that requires compromising the MCP host process itself
  (Claude Desktop / npm / Node).

## Controls implemented (Phase 1 baseline)

All security helpers live in [`src/core/security.ts`](src/core/security.ts).

### 1. URL allow-list + SSRF guard

Every tool that fetches a **user-supplied** URL passes it through
`validatePublicUrl(url)` first. That function:

- Requires `http:` or `https:`.
- Rejects literal private / loopback / link-local / cloud-metadata IPs
  (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
  `0.0.0.0`, `::1`, `fe80::/10`, `fc00::/7`, plus `localhost` /
  `*.local` / `*.internal`).
- Requires the hostname to match the allow-list.

The default allow-list covers Korean search, video, social, blogging,
and commerce platforms (naver, daum, google, youtube, tistory, coupang,
etc. — see `DEFAULT_ALLOWED_HOSTS`).

**Override:** set the env var `CONTENT_GENIE_ALLOWED_HOSTS` to a
comma-separated list of hostname suffixes:

```bash
CONTENT_GENIE_ALLOWED_HOSTS=example.com,blog.example.com node dist/index.js
```

This replaces the default list entirely — supply the platforms you want.

Currently this guard is applied to:

- `analyze_competitor_content` (the only tool that takes URLs as input)

Other tools call hard-coded scraper endpoints (no user URL input → no
SSRF surface).

### 2. Fetch with timeout, retry, and body cap

`fetchWithRetry()` wraps all outbound HTTP calls performed against
user-influenced URLs:

- **30 s per-attempt timeout** via `AbortController`.
- **2 retries** on `429` / `5xx`, honoring `Retry-After`, exponential
  backoff otherwise.
- **5 MiB response-body cap** enforced by streaming the body and
  aborting once the cap is hit. Also checks `Content-Length` for an
  early rejection.

Failures surface as structured `ToolError`s with codes `TIMEOUT`,
`NETWORK_ERROR`, `BODY_TOO_LARGE`, or `VALIDATION_ERROR`.

### 3. Path traversal guard

`validatePathWithinDirectory(filePath, allowedDir)` resolves both
arguments and ensures the resolved path stays under the allowed root.
Exposed for future tools that write to disk; no current tool exercises
it.

### 4. Filename sanitization

`sanitizeFilename(name)` strips parent-directory references, control
characters, and dangerous filesystem characters.

## Reporting a vulnerability

Please **do not** open public GitHub issues for security problems.

- Preferred: open a private GitHub Security Advisory at
  <https://github.com/MUSE-CODE-SPACE/content-genie-mcp/security/advisories/new>.
- Alternative: email the maintainer via the address listed on the
  [GitHub profile](https://github.com/MUSE-CODE-SPACE).

We aim to acknowledge reports within 7 days and ship a fix within 30
days for high-severity issues.

## Hardening checklist for operators

If you run this server remotely (Streamable HTTP / Railway / Docker):

- Set `CONTENT_GENIE_ALLOWED_HOSTS` to the minimum set you actually
  scrape. Don't keep `coupang.com` in production if you don't use it.
- Front the `/mcp` endpoint with authentication (bearer token, mTLS,
  or a private VPC ingress).
- Bind to `127.0.0.1` for local-only deployments — the SDK's
  `createMcpExpressApp` will enable DNS-rebinding protection
  automatically in that case.
- Set tight container memory limits so the 5 MiB body cap is enforced
  by both the application and the runtime.
