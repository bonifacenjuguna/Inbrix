const config = require('../config');
const logger = require('../lib/logger');
const db = require('../db/postgres');
const redis = require('../db/redis');
const gmailAuth = require('../lib/gmailAuth');
const state = require('../lib/state');

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // don't re-alert the same issue more than once an hour

/** Only actually sends a Telegram alert if we haven't alerted this same
 * `kind` recently — prevents a sustained outage from paging you every
 * WATCHDOG_INTERVAL_MS forever. */
async function alertOnce(bot, kind, message) {
  const { rows } = await db.query(
    `SELECT created_at FROM watchdog_alerts WHERE kind = $1 ORDER BY created_at DESC LIMIT 1`,
    [kind]
  );
  const last = rows[0] && new Date(rows[0].created_at).getTime();
  if (last && Date.now() - last < ALERT_COOLDOWN_MS) return;

  await db.query('INSERT INTO watchdog_alerts (kind, message) VALUES ($1, $2)', [kind, message]);
  try {
    await bot.telegram.sendMessage(config.TELEGRAM_OWNER_ID, `⚠️ *Inbrix watchdog*\n${message}`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error('Watchdog could not send Telegram alert (Telegram itself may be the problem)', {
      error: err.message,
    });
  }
}

async function runCheck(bot) {
  const issues = [];

  try {
    await db.ping();
  } catch (err) {
    issues.push(['db_down', `Postgres is unreachable: ${err.message}`]);
  }

  try {
    await redis.ping();
  } catch (err) {
    issues.push(['redis_down', `Redis is unreachable: ${err.message}`]);
  }

  try {
    await gmailAuth.checkAuth();
  } catch (err) {
    issues.push(['gmail_auth_failed', `Gmail token check failed (may need re-authorization): ${err.message}`]);
  }

  try {
    const s = await state.getState();
    if (s && !s.paused) {
      const lastPoll = s.last_poll_at ? new Date(s.last_poll_at).getTime() : 0;
      const stalled = Date.now() - lastPoll > config.WATCHDOG_STALL_THRESHOLD_MS;
      if (stalled) {
        issues.push([
          'poll_stalled',
          `No successful poll in over ${Math.round(config.WATCHDOG_STALL_THRESHOLD_MS / 60000)} minutes.` +
            (s.last_poll_error ? ` Last error: ${s.last_poll_error}` : ''),
        ]);
      }
    }
  } catch (err) {
    logger.error('Watchdog could not read bot_state', { error: err.message });
  }

  for (const [kind, message] of issues) {
    logger.warn('Watchdog issue detected', { kind, message });
    await alertOnce(bot, kind, message);
  }

  return issues;
}

function startWatchdog(bot) {
  const interval = setInterval(() => {
    runCheck(bot).catch((err) => logger.error('Watchdog check itself failed', { error: err.message }));
  }, config.WATCHDOG_INTERVAL_MS);

  logger.info('Watchdog started', { intervalMs: config.WATCHDOG_INTERVAL_MS });
  return () => clearInterval(interval);
}

module.exports = { startWatchdog, runCheck };
