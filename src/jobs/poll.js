const config = require('../config');
const logger = require('../lib/logger');
const historySync = require('../lib/historySync');

function startPolling(bot) {
  const interval = setInterval(async () => {
    try {
      await historySync.sync('poll', bot.telegram);
    } catch (err) {
      // Never let a poll failure crash the process — log and try again
      // next tick. The watchdog is what surfaces sustained failures to you.
      logger.error('Poll cycle failed', { error: err.message });
    }
  }, config.POLL_INTERVAL_MS);

  logger.info('Polling started', { intervalMs: config.POLL_INTERVAL_MS });
  return () => clearInterval(interval);
}

module.exports = { startPolling };
