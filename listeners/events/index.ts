import type { App } from '@slack/bolt';
import { appHomeOpenedCallback } from './app-home-opened.js';
import { appUninstalledCallback } from './app-uninstalled.js';

const register = (app: App) => {
  app.event('app_home_opened', appHomeOpenedCallback);
  app.event('app_uninstalled', appUninstalledCallback);
};

export default { register };
