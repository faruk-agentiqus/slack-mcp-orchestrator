import express from 'express';
import { WebClient } from '@slack/web-api';
import { authMiddleware, type AuthenticatedRequest } from './middleware.js';
import { isAllowed } from '../permissions/engine.js';
import {
  TOOLS,
  getToolByName,
  toolsToMcpFormat,
  type ToolContext,
} from './tools.js';

/**
 * Create and configure the Express app that serves the MCP proxy API.
 * Uses the bot token from env to make Slack API calls on behalf of permitted users.
 */
export function createApiServer(): express.Express {
  const app = express();
  app.use(express.json());

  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    throw new Error('SLACK_BOT_TOKEN is required for the MCP API server');
  }

  const slackClient = new WebClient(botToken);

  // For Enterprise Grid installs, many API calls need team_id.
  // Resolve once at startup via auth.test.
  let resolvedTeamId: string | undefined;
  (async () => {
    try {
      const auth = await slackClient.auth.test();
      // For enterprise installs, use the workspace grant team_id (from SLACK_TEAM_ID env or fallback)
      resolvedTeamId =
        process.env.SLACK_TEAM_ID ?? (auth.team_id as string | undefined);
    } catch {
      // Will be undefined; tools that need it will fail with clear error
    }
  })();

  // Health check (no auth)
  app.get('/api/mcp/health', (_req, res) => {
    res.json({ ok: true });
  });

  // All MCP routes require auth
  app.use('/api/mcp', authMiddleware);

  // -----------------------------------------------------------------------
  // POST /api/mcp/tools/list
  // Returns the tools the authenticated user is allowed to use.
  // -----------------------------------------------------------------------
  app.post('/api/mcp/tools/list', (req, res) => {
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
  // Executes a tool if the user has permission.
  // Body: { name: string, arguments: Record<string, unknown> }
  // -----------------------------------------------------------------------
  app.post('/api/mcp/tools/call', async (req, res) => {
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

    // Permission check
    if (!isAllowed(userId, orgId, tool.permissionKey, tool.operation)) {
      res.status(403).json({
        error: `Permission denied: ${tool.permissionKey}:${tool.operation}`,
      });
      return;
    }

    try {
      const ctx: ToolContext = { client: slackClient, teamId: resolvedTeamId };
      const result = await tool.execute(ctx, toolArgs ?? {});
      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Tool execution failed';
      res.status(500).json({ error: message, isRetryable: false });
    }
  });

  return app;
}
