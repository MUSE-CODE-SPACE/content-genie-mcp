/**
 * Structured error classes for content-genie-mcp tools.
 *
 * Adapted from vibe-coding-mcp/src/core/errors.ts so security/runtime helpers
 * can throw rich, JSON-serializable errors that propagate cleanly through MCP.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'PLATFORM_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'INTERNAL_ERROR'
  | 'PARSE_ERROR'
  | 'TIMEOUT'
  | 'BODY_TOO_LARGE';

export interface ErrorContext {
  tool?: string;
  platform?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ToolError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: ErrorContext;
  public readonly cause?: Error;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: ErrorCode,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.context = context;
    this.cause = cause;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace?.(this, ToolError);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause?.message,
    };
  }

  static fromError(
    error: unknown,
    code: ErrorCode = 'INTERNAL_ERROR',
    context?: ErrorContext
  ): ToolError {
    if (error instanceof ToolError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    return new ToolError(message, code, context, cause);
  }
}
