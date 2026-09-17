const cron = require('node-cron');
const config = require('../config');
const logger = require('../lib/logger');
const gmailApi = require('../lib/gmail');
const state = require('../lib/state');

const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000; // renew if expiring within 1 day

async function renewIfNeeded() {
  if (!config.GOOGLE_PUBSUB_TOPIC) return; // push not configured — polling-only mode

  const current = await state.getState();
  const expiresAt = current && current.watch_expiration ? new Date(current.watch_expiration).getTime() : 0;
  const needsRenewal = !expiresAt || expiresAt - Date.now() < RENEW_WITHIN_MS;

  if (!needsRenewal) return;

  try {
    const result = await gmailApi.registerWatch();
    if (result) {
      await state.setWatchExpiration(result.expirationMs);
      logger.info('Gmail push watch registered/renewed', {
        expiresAt: new Date(result.expirationMs).toISOString(),
      });
    }
  } catch (err) {
    logger.error('Failed to renew Gmail push watch — push notifications may stop; polling continues regardless', {
      error: err.message,
    });
  }
}

function startWatchRenewal() {
  // Run once at boot, then check daily. Gmail watch subscriptions expire
  // after 7 days regardless of activity, so this must never be skipped.
  renewIfNeeded().catch((err) => logger.error('Initial watch registration failed', { error: err.message }));

  const task = cron.schedule('0 3 * * *', () => {
    renewIfNeeded().catch((err) => logger.error('Scheduled watch renewal failed', { error: err.message }));
  });

  return () => task.stop();
}

module.exports = { startWatchRenewal, renewIfNeeded };
