import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { WebClient } from '@slack/web-api';
import { authMiddleware, type AuthenticatedRequest } from './middleware.js';
import { isAllowed } from '../permissions/engine.js';
import { getToolByName, toolsToMcpFormat, type ToolContext } from './tools.js';
import { getInstallationByOrgId } from '../db/installation-store.js';
import { isChannelAllowed } from '../permissions/channels.js';

/** Per-user rate limiter: 60 requests per minute keyed by JWT identity. */
const mcpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const auth = (req as AuthenticatedRequest).tokenPayload;
    return auth ? `${auth.sub}:${auth.org}` : req.ip ?? 'unknown';
  },
  message: { error: 'Too many requests. Try again shortly.' },
});

/**
 * Mount the MCP proxy API routes on the given Express app.
 * Multi-tenant: resolves the bot token per-org from the installation store
 * based on the JWT's `org` claim.
 */
export function mountMcpApi(expressApp: Application): void {
  expressApp.use(express.json());

  // Health check (no auth, no rate limit)
  expressApp.get('/api/mcp/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // All MCP routes require JWT auth, then rate limiting
  expressApp.use('/api/mcp', authMiddleware);
  expressApp.use('/api/mcp', mcpRateLimiter);

  // -----------------------------------------------------------------------
  // POST /api/mcp/tools/list
  // -----------------------------------------------------------------------
  expressApp.post('/api/mcp/tools/list', (req, res) => {
    const { sub: userId, org: orgId } = (req as AuthenticatedRequest)
      .tokenPayload;

    const allTools = toolsToMcpFormat();
    const allowed = allTools.filter(t => {
      const def = getToolByName(t.name);
      if (!def) return false;
      return isAllowed(userId, orgId, def.permissionKey, def.operation);
    });

    res.json({ tools: allowed });
  });

  // -----------------------------------------------------------------------
  // POST /api/mcp/tools/call
  // -----------------------------------------------------------------------
  expressApp.post('/api/mcp/tools/call', async (req, res) => {
    const { sub: userId, org: orgId } = (req as AuthenticatedRequest)
      .tokenPayload;
    const { name, arguments: toolArgs } = req.body as {
      name: string;
      arguments?: Record<string, unknown>;
    };

    if (!name) {
      res.status(400).json({ error: 'Missing tool name' });
      return;
    }

    const tool = getToolByName(name);
    if (!tool) {
      res.status(404).json({ error: `Unknown tool: ${name}` });
      return;
    }

    if (!isAllowed(userId, orgId, tool.permissionKey, tool.operation)) {
      res.status(403).json({
        error: `Permission denied: ${tool.permissionKey}:${tool.operation}`,
      });
      return;
    }

    // Check channel-level blocklist for tools that target a specific channel
    const channelArg = (toolArgs?.channel as string) ?? null;
    if (
      (channelArg && tool.permissionKey === 'channels') ||
      (channelArg && tool.permissionKey === 'chat')
    ) {
      if (!isChannelAllowed(channelArg, orgId, tool.operation)) {
        res.status(403).json({
          error: `Channel ${channelArg} is blocked by your organization admin for ${tool.operation} access`,
        });
        return;
      }
    }

    // Resolve bot token for this org from installation store
    const installation = getInstallationByOrgId(orgId);
    if (!installation) {
      res.status(404).json({
        error:
          'No Slack installation found for this organization. Has the app been installed?',
      });
      return;
    }

    try {
      const client = new WebClient(installation.botToken);
      const ctx: ToolContext = {
        client,
        teamId: installation.teamId ?? undefined,
      };
      const result = await tool.execute(ctx, toolArgs ?? {});
      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Tool execution failed';
      res.status(500).json({ error: message, isRetryable: false });
    }
  });

  // -----------------------------------------------------------------------
  // Centralized error handler — never leak internals in production
  // -----------------------------------------------------------------------
  expressApp.use(
    '/api/mcp',
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      if (process.env.NODE_ENV === 'production') {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.status(500).json({ error: err.message, stack: err.stack });
      }
    }
  );
}
