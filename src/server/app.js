const express = require('express');
const config = require('../config');
const logger = require('../lib/logger');
const historySync = require('../lib/historySync');

function createServer(bot) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ ok: true }));

  /**
   * Gmail's Pub/Sub push subscription posts here whenever new mail arrives.
   * The push payload only ever tells us "something changed" — we don't
   * trust its embedded historyId as a diff boundary, we just use it as a
   * trigger to run the exact same history-diff the poll loop runs, from
   * our own last-known historyId. This is also why push and poll can run
   * at the same time without ever double-forwarding: same code path,
   * same dedupe guard.
   */
  app.post('/gmail/webhook', async (req, res) => {
    if (config.GOOGLE_PUBSUB_VERIFICATION_TOKEN) {
      const token = req.query.token;
      if (token !== config.GOOGLE_PUBSUB_VERIFICATION_TOKEN) {
        logger.warn('Rejected Gmail webhook call with invalid/missing verification token');
        return res.status(401).send('invalid token');
      }
    }

    // Ack Pub/Sub immediately — it retries aggressively on anything but a
    // fast 2xx, and we don't want retries piling up while a sync is slow.
    res.status(200).send('ok');

    try {
      await historySync.sync('push', bot.telegram);
    } catch (err) {
      logger.error('Push-triggered sync failed', { error: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
