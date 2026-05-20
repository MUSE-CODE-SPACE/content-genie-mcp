#!/usr/bin/env node
/**
 * content-genie-mcp entry point.
 *
 * Tiny bootstrap that:
 *   1. builds an McpServer with all tools/resources/prompts (see src/server.ts)
 *   2. attaches either a Streamable HTTP transport (MCP 2025-03-26) when
 *      MCP_HTTP_MODE=true, or a stdio transport otherwise.
 *
 * Domain code lives in:
 *   - src/tools/*       — the 17 MCP tools, grouped by domain
 *   - src/scrapers/*    — naver / daum / google / youtube / zum scrapers
 *   - src/data/         — Korean event DB
 *   - src/core/         — security utils, circuit breaker, cache, registry
 *   - src/resources.ts  — MCP resources (korean-events, sources)
 *   - src/prompts.ts    — MCP prompts (viral-title, competitor-analysis)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer, SERVER_VERSION, PROTOCOL_VERSION } from './server.js';
import { getToolNames } from './core/registry.js';

async function main(): Promise<void> {
  const isHttpMode = process.env.MCP_HTTP_MODE === 'true' || process.argv.includes('--http');
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  const server = createServer({ resetRegistry: true });
  const toolCount = getToolNames().length;

  if (isHttpMode) {
    console.log(`Starting content-genie-mcp v${SERVER_VERSION} in Streamable HTTP mode...`);

    const app = express();
    app.use(
      cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Last-Event-ID'],
        exposedHeaders: ['Mcp-Session-Id'],
      }),
    );
    app.use(express.json());

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);

    const healthBody = () => ({
      status: 'ok',
      server: 'content-genie-mcp',
      version: SERVER_VERSION,
      protocol: PROTOCOL_VERSION,
      transport: 'streamable-http',
      tools: toolCount,
      timestamp: new Date().toISOString(),
    });

    app.get('/', (_req: Request, res: Response) => res.json(healthBody()));
    app.get('/health', (_req: Request, res: Response) => res.json(healthBody()));

    app.all('/mcp', async (req: Request, res: Response) => {
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('MCP request error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
          });
        }
      }
    });

    app.listen(port, host, () => {
      console.log(
        `content-genie-mcp v${SERVER_VERSION} listening on http://${host}:${port} (${toolCount} tools)`,
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
      `content-genie-mcp v${SERVER_VERSION} on stdio (${toolCount} tools)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
