import type { WebClient } from '@slack/web-api';

/**
 * Check whether a Slack user is a workspace/org admin.
 * Uses the Slack users.info API to check is_admin or is_owner flags.
 */
export async function isAdmin(
  client: WebClient,
  userId: string
): Promise<boolean> {
  try {
    const result = await client.users.info({ user: userId });
    const user = result.user as Record<string, unknown> | undefined;
    return user?.is_admin === true || user?.is_owner === true;
  } catch {
    return false;
  }
}
