import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { publishHomeView } from '../../src/views/home-builder.js';

function resolveOrgId(event: { team?: string }, enterpriseId?: string): string {
  return enterpriseId ?? event.team ?? 'unknown';
}

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
    await publishHomeView(client, event.user, orgId);
  } catch (error) {
    logger.error(error);
  }
};

export { appHomeOpenedCallback };
