import type { KnownBlock } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import {
  getEffectivePermissions,
  getUserOverrides,
  setUserOverrides,
  emptyPermissions,
  PERMISSION_KEYS,
} from '../permissions/engine.js';
import { getBlockedChannels } from '../permissions/channels.js';
import { isAdmin } from '../permissions/admin.js';

/** Build the user permissions section (shown to everyone). */
function buildUserSection(userId: string, orgId: string): KnownBlock[] {
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

/** Admin-only channel blocklist section. */
function buildAdminSection(orgId: string): KnownBlock[] {
  const blocked = getBlockedChannels(orgId);

  const blocks: KnownBlock[] = [
    { type: 'divider' },
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Admin: Channel Restrictions',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Block channels org-wide so no user can access them via MCP. All channels are allowed by default.',
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Block a Channel', emoji: true },
        action_id: 'admin_block_channel',
        style: 'danger',
      },
    },
  ];

  if (blocked.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No channels are currently blocked._' },
    });
  } else {
    for (const ch of blocked) {
      const name = ch.channelName ? `#${ch.channelName}` : ch.channelId;
      const readStatus = ch.blockRead
        ? ':no_entry: Read blocked'
        : ':white_check_mark: Read allowed';
      const writeStatus = ch.blockWrite
        ? ':no_entry: Write blocked'
        : ':white_check_mark: Write allowed';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${name}*\n${readStatus}  |  ${writeStatus}`,
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Unblock', emoji: true },
          action_id: `admin_unblock_channel_${ch.channelId}`,
          value: ch.channelId,
        },
      });
    }
  }

  return blocks;
}

/**
 * Build the full home view for a user.
 * If the user is an admin, includes the channel management section.
 */
export async function buildFullHomeView(
  client: WebClient,
  userId: string,
  orgId: string
): Promise<KnownBlock[]> {
  const blocks = buildUserSection(userId, orgId);

  const admin = await isAdmin(client, userId);
  if (admin) {
    blocks.push(...buildAdminSection(orgId));
  }

  return blocks;
}

/**
 * Publish the home view for a user.
 */
export async function publishHomeView(
  client: WebClient,
  userId: string,
  orgId: string
): Promise<void> {
  const blocks = await buildFullHomeView(client, userId, orgId);
  await client.views.publish({
    user_id: userId,
    view: { type: 'home', blocks },
  });
}
