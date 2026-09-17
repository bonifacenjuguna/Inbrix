const state = require('../lib/state');
const db = require('../db/postgres');
const { ping: redisPing } = require('../db/redis');
const gmailAuth = require('../lib/gmailAuth');
const format = require('../lib/format');
const inline = require('../keyboards/inline');
const historySync = require('../lib/historySync');
const logger = require('../lib/logger');

async function buildStatusText() {
  const s = await state.getState();

  let dbLatency = null;
  try {
    dbLatency = await db.ping();
  } catch (_) {
    dbLatency = null;
  }

  let redisLatency = null;
  try {
    redisLatency = await redisPing();
  } catch (_) {
    redisLatency = null;
  }

  let gmailOk = true;
  try {
    await gmailAuth.checkAuth();
  } catch (_) {
    gmailOk = false;
  }

  const pushConfigured = !!(s && s.watch_expiration);

  return (
    `◆ STATUS\n` +
    `${s && s.paused ? '⏸ Paused' : '🟢 Watching your inbox'}\n\n` +
    `📡 Polling — last: ${format.relativeTime(s && s.last_poll_at)}` +
    `${s && s.last_poll_error ? ` ⚠️ ${s.last_poll_error}` : ''}\n` +
    `🔔 Push — ${pushConfigured ? `last: ${format.relativeTime(s && s.last_push_at)}` : 'not configured'}` +
    `${s && s.last_push_error ? ` ⚠️ ${s.last_push_error}` : ''}\n\n` +
    `🗄️ Database: ${dbLatency !== null ? `🟢 ${dbLatency}ms` : '🔴 unreachable'}\n` +
    `🧠 Redis: ${redisLatency !== null ? `🟢 ${redisLatency}ms` : '🔴 unreachable'}\n` +
    `✉️ Gmail token: ${gmailOk ? '🟢 valid' : '🔴 invalid — may need reauthorization'}`
  );
}

async function handleStatus(ctx) {
  const text = await buildStatusText();
  await ctx.reply(text, inline.statusActions());
}

async function handleRefresh(ctx) {
  const text = await buildStatusText();
  try {
    await ctx.editMessageText(text, inline.statusActions());
  } catch (err) {
    // Telegram throws if the content is byte-identical to what's already
    // shown — harmless, just answer the tap so the loading spinner clears.
  }
  await ctx.answerCbQuery('Refreshed').catch(() => {});
}

async function handleForcePoll(ctx) {
  await ctx.answerCbQuery('Polling now…').catch(() => {});
  try {
    await historySync.sync('poll', ctx.telegram);
  } catch (err) {
    logger.error('Force poll failed', { error: err.message });
  }
  await handleRefresh(ctx);
}

module.exports = { handleStatus, handleRefresh, handleForcePoll };
