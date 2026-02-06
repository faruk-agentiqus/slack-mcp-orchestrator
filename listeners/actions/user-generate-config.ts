import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { signToken } from '../../src/auth/tokens.js';
import {
  getEffectivePermissions,
  emptyPermissions,
} from '../../src/permissions/engine.js';

/**
 * Generate a per-user MCP config JSON containing a fresh JWT.
 * Triggered by the "Generate MCP Config" button on the user home tab.
 */
export const userGenerateConfigCallback = async ({
  ack,
  body,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  try {
    const userId = (body as { user: { id: string } }).user.id;
    const orgId = context.enterpriseId ?? context.teamId ?? 'unknown';

    // Check the user has at least some permissions
    const perms = getEffectivePermissions(userId, orgId);
    const hasAny = Object.values(perms).some(f => f.read || f.write);

    if (!hasAny) {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'No Access' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'You do not have any MCP permissions configured. Contact your workspace admin to get access.',
              },
            },
          ],
        },
      });
      return;
    }

    // Generate a new token (revokes any previous one)
    const token = signToken(userId, orgId);

    const apiUrl =
      process.env.MCP_API_URL ||
      `http://localhost:${process.env.MCP_API_PORT || 3001}/api/mcp`;

    // Use MCP_CLIENT_PATH env var for local dev, fall back to npx for published package
    const clientPath = process.env.MCP_CLIENT_PATH;

    const serverConfig = clientPath
      ? { command: 'node', args: [clientPath] }
      : { command: 'npx', args: ['-y', '@agentiqus/slack-mcp-client'] };

    const config = JSON.stringify(
      {
        mcpServers: {
          slack: {
            ...serverConfig,
            env: {
              MCP_TOKEN: token,
              MCP_API_URL: apiUrl,
            },
          },
        },
      },
      null,
      2
    );

    await client.views.open({
      trigger_id: (body as { trigger_id: string }).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'user_config_modal',
        title: { type: 'plain_text', text: 'MCP Configuration' },
        close: { type: 'plain_text', text: 'Close' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':warning: *Copy this config and keep it safe.* The token grants access to Slack on your behalf. It will not be shown again.',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Paste this into your `.cursor/mcp.json` or Claude Desktop config:',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${config}\`\`\``,
            },
          },
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};
