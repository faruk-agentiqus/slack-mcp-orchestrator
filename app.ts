import pkg from '@slack/bolt';
const { App, ExpressReceiver, LogLevel } = pkg;
import 'dotenv/config';
import registerListeners from './listeners/index.js';
import { initDatabase } from './src/db/database.js';
import { sqliteInstallationStore } from './src/db/installation-store.js';
import { mountMcpApi } from './src/api/server.js';
import { cleanupExpiredTokens } from './src/auth/tokens.js';

/** Initialise SQLite before anything else */
initDatabase();

/** Run token cleanup on startup + every 24 hours */
cleanupExpiredTokens();
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);

const logLevel =
  process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;

/**
 * Dual-mode startup:
 * - If SLACK_APP_TOKEN is set → Socket Mode (local dev via `slack run`)
 * - Otherwise → ExpressReceiver with OAuth (production HTTP mode)
 */
const useSocketMode = Boolean(process.env.SLACK_APP_TOKEN);

let app: InstanceType<typeof App>;

if (useSocketMode) {
  // --- Socket Mode (local dev) ---
  app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    logLevel,
  });
} else {
  // --- HTTP Mode (production) ---
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET || 'mcp-orchestrator-state',
    scopes: [
      'channels:history',
      'channels:read',
      'chat:write',
      'commands',
      'users:read',
    ],
    installationStore: sqliteInstallationStore,
    installerOptions: { directInstall: true },
  });

  /** Mount MCP API on the same Express app */
  mountMcpApi(receiver.app);

  app = new App({ receiver, logLevel });
}

/** Register Slack Listeners */
registerListeners(app);

/** Start */
(async () => {
  const port = Number(process.env.PORT) || 3000;
  try {
    await app.start(port);
    const mode = useSocketMode ? 'Socket Mode (dev)' : 'HTTP Mode (production)';
    app.logger.info(`App running on port ${port} — ${mode}`);

    // In Socket Mode, start a separate Express server for the MCP API
    if (useSocketMode) {
      const express = await import('express');
      const apiApp = express.default();
      mountMcpApi(apiApp);
      const apiPort = Number(process.env.MCP_API_PORT) || 3001;
      apiApp.listen(apiPort, () => {
        app.logger.info(`MCP API server listening on port ${apiPort}`);
      });
    }
  } catch (error) {
    app.logger.error('Unable to start App', error);
    process.exit(1);
  }
})();

/** Graceful shutdown */
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await app.stop();
  } catch {
    // Ignore errors during shutdown
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
