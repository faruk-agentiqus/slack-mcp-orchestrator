import type { App } from '@slack/bolt';

import actions from './actions/index.js';
import events from './events/index.js';
import views from './views/index.js';

const registerListeners = (app: App) => {
  actions.register(app);
  events.register(app);
  views.register(app);
};

export default registerListeners;
