const db = require('../db/postgres');
const { redis } = require('../db/redis');

/**
 * bot_state is a single row in Postgres (the source of truth, survives
 * restarts and redeploys) mirrored into a couple of hot Redis keys so the
 * poll loop isn't hitting Postgres every tick just to read one value.
 */

const HISTORY_ID_KEY = 'inbrix:historyId';
const PAUSED_KEY = 'inbrix:paused';

async function getHistoryId() {
  const cached = await redis.get(HISTORY_ID_KEY);
  if (cached) return cached;
  const { rows } = await db.query('SELECT history_id FROM bot_state WHERE id = 1');
  const value = rows[0] && rows[0].history_id;
  if (value) await redis.set(HISTORY_ID_KEY, value, 'EX', 3600);
  return value || null;
}

async function setHistoryId(historyId) {
  await db.query('UPDATE bot_state SET history_id = $1, updated_at = now() WHERE id = 1', [historyId]);
  await redis.set(HISTORY_ID_KEY, historyId, 'EX', 3600);
}

async function isPaused() {
  const cached = await redis.get(PAUSED_KEY);
  if (cached !== null) return cached === '1';
  const { rows } = await db.query('SELECT paused FROM bot_state WHERE id = 1');
  const value = !!(rows[0] && rows[0].paused);
  await redis.set(PAUSED_KEY, value ? '1' : '0', 'EX', 3600);
  return value;
}

async function setPaused(paused) {
  await db.query('UPDATE bot_state SET paused = $1, updated_at = now() WHERE id = 1', [paused]);
  await redis.set(PAUSED_KEY, paused ? '1' : '0', 'EX', 3600);
}

async function recordPollSuccess() {
  await db.query(
    "UPDATE bot_state SET last_poll_at = now(), last_poll_error = NULL, updated_at = now() WHERE id = 1"
  );
}

async function recordPollError(message) {
  await db.query(
    'UPDATE bot_state SET last_poll_error = $1, updated_at = now() WHERE id = 1',
    [String(message).slice(0, 2000)]
  );
}

async function recordPushSuccess() {
  await db.query(
    "UPDATE bot_state SET last_push_at = now(), last_push_error = NULL, updated_at = now() WHERE id = 1"
  );
}

async function recordPushError(message) {
  await db.query(
    'UPDATE bot_state SET last_push_error = $1, updated_at = now() WHERE id = 1',
    [String(message).slice(0, 2000)]
  );
}

async function setWatchExpiration(expirationMs) {
  await db.query(
    'UPDATE bot_state SET watch_expiration = to_timestamp($1 / 1000.0), updated_at = now() WHERE id = 1',
    [expirationMs]
  );
}

async function getState() {
  const { rows } = await db.query('SELECT * FROM bot_state WHERE id = 1');
  return rows[0] || null;
}

module.exports = {
  getHistoryId,
  setHistoryId,
  isPaused,
  setPaused,
  recordPollSuccess,
  recordPollError,
  recordPushSuccess,
  recordPushError,
  setWatchExpiration,
  getState,
};
