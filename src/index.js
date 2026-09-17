const config = require('./config');
const logger = require('./lib/logger');
const { migrate } = require('./db/migrate');
const { pool } = require('./db/postgres');
const { redis } = require('./db/redis');
const { createBot } = require('./bot');
const { createServer } = require('./server/app');
const { startPolling } = require('./jobs/poll');
const { startWatchRenewal } = require('./jobs/watchRenewal');
const { startWatchdog } = require('./jobs/watchdog');
const gmailAuth = require('./lib/gmailAuth');

async function main() {
  logger.info(`Inbrix v${config.BOT_VERSION} starting…`);

  await migrate();
  logger.info('Database ready');

  // Fail fast and loudly if the Gmail credentials are actually wrong,
  // rather than discovering it three minutes later on the first poll tick.
  const profile = await gmailAuth.checkAuth();
  logger.info('Gmail auth OK', { emailAddress: profile.emailAddress });

  const bot = createBot();
  const app = createServer(bot);

  const server = app.listen(config.PORT, () => {
    logger.info(`HTTP server listening`, { port: config.PORT });
  });

  await bot.launch();
  logger.info('Telegram bot launched (long polling)');

  const stopPolling = startPolling(bot);
  const stopWatchRenewal = startWatchRenewal();
  const stopWatchdog = startWatchdog(bot);

  if (config.PUBLIC_BASE_URL && config.GOOGLE_PUBSUB_TOPIC) {
    const suffix = config.GOOGLE_PUBSUB_VERIFICATION_TOKEN
      ? `?token=${config.GOOGLE_PUBSUB_VERIFICATION_TOKEN}`
      : '';
    logger.info('Gmail Pub/Sub push endpoint (paste into your Cloud Pub/Sub push subscription)', {
      url: `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/gmail/webhook${suffix}`,
    });
  }

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully…`);
    try {
      stopPolling();
      stopWatchRenewal();
      stopWatchdog();
      bot.stop(signal);
      await new Promise((resolve) => server.close(resolve));
      await redis.quit();
      await pool.end();
    } catch (err) {
      logger.error('Error during shutdown', { error: err.message });
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
