/**
 * MCP server factory.
 *
 * `createServer()` wires the McpServer instance: it imports every tool
 * module's exported definitions, pushes them through the registry, then
 * binds them to the high-level McpServer.tool() API. It also registers the
 * resources and prompts.
 *
 * Splitting this out from src/index.ts means:
 *   - tests can spin up a fully-wired server without touching stdio/http
 *   - the entry point file stays under 200 LOC (Phase 4 target)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, bindToolsToServer, resetRegistry } from './core/registry.js';
import { trendTools } from './tools/trends.js';
import { seoTools } from './tools/seo.js';
import { contentIdeasTools } from './tools/contentIdeas.js';
import { viralScoringTools } from './tools/viralScoring.js';
import { competitorAnalysisTools } from './tools/competitorAnalysis.js';
import { koreanEventsTools } from './tools/koreanEvents.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';

export const SERVER_NAME = 'content-genie-mcp';
export const SERVER_VERSION = '2.12.0';
export const PROTOCOL_VERSION = '2025-03-26';

export interface CreateServerOptions {
  /** If true, clears the singleton tool registry before re-populating. Useful for tests. */
  resetRegistry?: boolean;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  if (options.resetRegistry) resetRegistry();

  // Collect all 17 tools from their domain modules.
  // Order is preserved for the resource://content-genie/sources listing.
  registerTools([
    ...trendTools, // 2 — get_korean_trends, analyze_news_trends
    ...contentIdeasTools, // 3 — generate_content_ideas, generate_script_outline, repurpose_content
    ...seoTools, // 3 — analyze_seo_keywords, optimize_title_hashtags, generate_hashtag_strategy
    ...viralScoringTools, // 4 — predict_viral_score, generate_ab_test_variants, predict_content_performance, analyze_thumbnail
    ...competitorAnalysisTools, // 3 — analyze_competitor_content, benchmark_content_performance, analyze_influencer_collab
    ...koreanEventsTools, // 2 — create_content_calendar, get_seasonal_content_guide
  ]);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  bindToolsToServer(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
