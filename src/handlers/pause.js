const state = require('../lib/state');
const bbtb = require('../keyboards/bbtb');

async function handleToggle(ctx) {
  const currentlyPaused = await state.isPaused();
  const next = !currentlyPaused;
  await state.setPaused(next);

  await ctx.reply(
    next
      ? '⏸ Paused. Nothing will be forwarded until you tap ▶️ Resume.'
      : '▶️ Resumed — watching your inbox again.',
    bbtb.mainMenuFor(next)
  );
}

module.exports = { handleToggle };
