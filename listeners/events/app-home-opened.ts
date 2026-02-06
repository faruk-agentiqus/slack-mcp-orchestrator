import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import {
  getEffectivePermissions,
  getUserOverrides,
  setUserOverrides,
  emptyPermissions,
  PERMISSION_KEYS,
} from '../../src/permissions/engine.js';

/**
 * Resolve the org/enterprise ID from the event context.
 * Prefers enterprise_id for org-wide installs, falls back to team_id.
 */
function resolveOrgId(event: { team?: string }, enterpriseId?: string): string {
  return enterpriseId ?? event.team ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Block Kit builder
// ---------------------------------------------------------------------------

function buildHomeView(userId: string, orgId: string): KnownBlock[] {
  // Auto-create a user record if one doesn't exist yet
  const existing = getUserOverrides(userId, orgId);
  if (!existing) {
    setUserOverrides(userId, orgId, emptyPermissions());
  }

  const perms = getEffectivePermissions(userId, orgId);

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'MCP Orchestrator', emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Your Permissions*\nThese scopes control what AI tools can do via Slack on your behalf.',
      },
    },
  ];

  for (const key of PERMISSION_KEYS) {
    const flags = perms[key] ?? { read: false, write: false };
    const readIcon = flags.read ? ':white_check_mark:' : ':x:';
    const writeIcon = flags.write ? ':white_check_mark:' : ':x:';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${key}*\n  ${readIcon} Read   ${writeIcon} Write`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Edit Permissions', emoji: true },
        action_id: 'user_edit_permissions',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Generate MCP Config', emoji: true },
        action_id: 'user_generate_config',
        style: 'primary',
      },
    ],
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_home_opened'>) => {
  if (event.tab !== 'home') return;

  try {
    const orgId = resolveOrgId(
      event as unknown as { team?: string },
      context.enterpriseId ?? undefined
    );
    const blocks = buildHomeView(event.user, orgId);

    await client.views.publish({
      user_id: event.user,
      view: { type: 'home', blocks },
    });
  } catch (error) {
    logger.error(error);
  }
};

export { appHomeOpenedCallback };
