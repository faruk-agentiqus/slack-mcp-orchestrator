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

/** Run token cleanup on startup */
cleanupExpiredTokens();

/** Schedule periodic token cleanup every 24 hours */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);

const logLevel = process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;

/** ExpressReceiver: single HTTP server for both Slack events and MCP API */
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.SLACK_STATE_SECRET || 'mcp-orchestrator-state',
  scopes: ['channels:history', 'channels:read', 'chat:write', 'commands', 'users:read'],
  installationStore: sqliteInstallationStore,
  installerOptions: {
    directInstall: true,
  },
});

/** Mount the MCP API routes on the same Express app */
mountMcpApi(receiver.app);

/** Slack Bolt App */
const app = new App({
  receiver,
  logLevel,
});

/** Register Slack Listeners */
registerListeners(app);

/** Start */
(async () => {
  const port = Number(process.env.PORT) || 3000;
  try {
    await app.start(port);
    app.logger.info(`App running on port ${port} (Slack events + MCP API)`);
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
