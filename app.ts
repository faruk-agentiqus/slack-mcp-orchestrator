import { App, LogLevel } from '@slack/bolt';
import 'dotenv/config';
import registerListeners from './listeners/index.js';
import { initDatabase } from './src/db/database.js';
import { createApiServer } from './src/api/server.js';

/** Initialise SQLite before anything else */
initDatabase();

/** Slack Bolt App (Socket Mode) */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG,
});

/** Register Slack Listeners */
registerListeners(app);

/** Start both servers */
(async () => {
  try {
    // 1. Start Bolt (Socket Mode)
    await app.start(process.env.PORT || 3000);
    app.logger.info('Bolt app is running (Socket Mode)');

    // 2. Start Express API for MCP proxy
    const apiPort = Number(process.env.MCP_API_PORT) || 3001;
    const apiServer = createApiServer();
    apiServer.listen(apiPort, () => {
      app.logger.info(`MCP API server listening on port ${apiPort}`);
    });
  } catch (error) {
    app.logger.error('Unable to start App', error);
    process.exit(1);
  }
})();
