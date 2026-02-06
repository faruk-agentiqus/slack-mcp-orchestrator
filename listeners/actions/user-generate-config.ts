import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { signToken } from '../../src/auth/tokens.js';
import { getEffectivePermissions } from '../../src/permissions/engine.js';

/**
 * Resolve the public MCP API URL.
 * In production this comes from the MCP_API_URL env var (set once at deploy).
 * Falls back to localhost for development.
 */
function getMcpApiUrl(): string {
  if (process.env.MCP_API_URL) return process.env.MCP_API_URL;
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}/api/mcp`;
}

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

    const perms = getEffectivePermissions(userId, orgId);
    const hasAny = Object.values(perms).some((f) => f.read || f.write);

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
                text: 'You have no permissions enabled. Click *Edit Permissions* first to select what AI tools can access.',
              },
            },
          ],
        },
      });
      return;
    }

    // Generate a new token (revokes any previous one)
    const token = signToken(userId, orgId);
    const apiUrl = getMcpApiUrl();

    // Use MCP_CLIENT_PATH for local dev, npx for published package
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
      2,
    );

    await client.views.open({
      trigger_id: (body as { trigger_id: string }).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'user_config_modal',
        title: { type: 'plain_text', text: 'MCP Configuration' },
        submit: { type: 'plain_text', text: 'Done' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':warning: *Copy this config and keep it safe.* The token grants access to Slack on your behalf. Generating a new config will revoke the previous one.',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*For Cursor:* paste into `~/.cursor/mcp.json`\n*For Claude Desktop:* paste into your Claude config file',
            },
          },
          {
            type: 'input',
            block_id: 'config_block',
            label: { type: 'plain_text', text: 'Your MCP Config (click, Cmd+A, Cmd+C to copy)' },
            element: {
              type: 'plain_text_input',
              action_id: 'config_text',
              multiline: true,
              initial_value: config,
            },
            optional: true,
          },
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};
