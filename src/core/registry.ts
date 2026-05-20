/**
 * Central tool registry.
 *
 * Each tool module under src/tools/*.ts exports one or more
 * `ToolDefinition`s. The registry collects them and the server entry point
 * (src/server.ts) walks the registry to call `McpServer.tool(...)` for each.
 *
 * This indirection means:
 *   - Adding a new tool = create a file in src/tools, export a definition,
 *     and import it in src/server.ts. No giant switch to edit.
 *   - Tests can call `handler({...})` directly without spinning up the MCP
 *     transport.
 *   - The resource://content-genie/sources resource can iterate the registry
 *     to publish the tool list.
 */

import type { ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MCP tool handler return shape. Mirrors what `McpServer.tool` expects.
 * Loose typing on `content` because the SDK accepts an array of typed
 * blocks (text/image/resource) and tightening it here would force every
 * tool to type-assert.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: string; [k: string]: unknown }>;
  isError?: boolean;
  [k: string]: unknown;
}

/**
 * Self-contained tool definition. Each src/tools/* file exports an array of
 * these and src/server.ts registers them all.
 *
 * `schema` matches the second argument of McpServer.tool — a Zod raw shape
 * (an object literal of Zod validators), NOT a wrapped z.object.
 */
export interface ToolDefinition<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: S;
  handler: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

const registry: ToolDefinition[] = [];

export function registerTool<S extends ZodRawShape>(def: ToolDefinition<S>): void {
  if (registry.find((t) => t.name === def.name)) {
    throw new Error(`Tool "${def.name}" registered twice`);
  }
  registry.push(def as ToolDefinition);
}

export function registerTools(defs: ToolDefinition[]): void {
  for (const d of defs) registerTool(d);
}

export function getRegisteredTools(): readonly ToolDefinition[] {
  return registry;
}

export function getToolNames(): string[] {
  return registry.map((t) => t.name);
}

/** Test helper. */
export function resetRegistry(): void {
  registry.length = 0;
}

/**
 * Wire every registered tool into an MCP server. Wraps the handler so any
 * unhandled throw is converted to `{ isError: true, content: [...] }` —
 * that's the contract the SDK expects.
 *
 * Uses the high-level `registerTool` API (config object form) rather than
 * the deprecated positional `tool(name, desc, schema, cb)` overload.
 */
export function bindToolsToServer(server: McpServer): void {
  for (const def of registry) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.schema as never,
      },
      (async (args: Record<string, unknown>) => {
        try {
          return (await def.handler(args)) as never;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text', text: `[${def.name}] ${message}` }],
            isError: true,
          } as never;
        }
      }) as never,
    );
  }
}
