const config = require('../config');
const state = require('../lib/state');
const dedupe = require('../lib/dedupe');
const bbtb = require('../keyboards/bbtb');
const format = require('../lib/format');

async function handleStart(ctx) {
  const paused = await state.isPaused();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const forwardedToday = await dedupe.countForwardedSince(startOfDay);

  const text =
    `◆ INBRIX\n` +
    `${paused ? '⏸ Paused' : '🟢 Watching your inbox'} · Polling + Push\n\n` +
    `📥 ${forwardedToday} forwarded today\n` +
    `${format.relativeLastSeen(await state.getState())}\n\n` +
    `Tap a button below to get started.\n` +
    `❓ /help\n` +
    `🔧 v${config.BOT_VERSION}`;

  await ctx.reply(text, bbtb.mainMenuFor(paused));
}

module.exports = { handleStart };
