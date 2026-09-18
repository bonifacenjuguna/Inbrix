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

/**
 * A 409 "Conflict: terminated by other getUpdates request" almost never
 * means two real services are fighting over the token — it usually means
 * THIS SAME process's previous crash didn't give Telegram's server time to
 * release its old long-poll session before Railway restarted the container.
 * Exiting immediately on that error (the old behavior) made Railway restart
 * within a couple of seconds, which collided with the still-active old
 * session again — a self-inflicted crash loop. Backing off first, instead
 * of crashing instantly, lets that stale session expire on its own.
 */
function launchBot(bot, attempt = 1) {
  const MAX_ATTEMPTS = 6;
  bot.launch().catch((err) => {
    const isConflict = /409/.test(err.message) && /Conflict/i.test(err.message);
    if (isConflict && attempt < MAX_ATTEMPTS) {
      const delayMs = 15000 * attempt; // 15s, 30s, 45s, 60s, 75s
      logger.warn(
        `Telegram getUpdates conflict (attempt ${attempt}/${MAX_ATTEMPTS}) — ` +
          `retrying in ${delayMs / 1000}s instead of crash-looping`,
        { error: err.message }
      );
      setTimeout(() => launchBot(bot, attempt + 1), delayMs);
      return;
    }
    logger.error('Telegram bot crashed', { error: err.message, attempt });
    process.exit(1);
  });
}

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

  launchBot(bot);
  // NOTE: bot.launch() does NOT resolve when the bot starts — by Telegraf's
  // own design, its promise only resolves once the bot stops (bot.stop()).
  // Awaiting it here would block every line below forever, including the
  // very jobs that make automatic polling work. Fire-and-forget is correct.
  logger.info('Telegram bot launching (long polling)');

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
