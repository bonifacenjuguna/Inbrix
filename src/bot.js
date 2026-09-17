const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./lib/logger');
const { ownerOnly } = require('./lib/accessControl');

const startHandler = require('./handlers/start');
const statusHandler = require('./handlers/status');
const pauseHandler = require('./handlers/pause');
const settingsHandler = require('./handlers/settings');
const helpHandler = require('./handlers/help');
const emailActions = require('./handlers/emailActions');
const state = require('./lib/state');

function createBot() {
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  // Everything below this line only ever runs for the owner. Anyone else's
  // update is dropped here, silently, with no trace back to them.
  bot.use(ownerOnly());

  bot.command('start', startHandler.handleStart);
  bot.command('status', statusHandler.handleStatus);
  bot.command('pause', async (ctx) => {
    const paused = await state.isPaused();
    if (paused) return ctx.reply('Already paused. Tap ▶️ Resume to start watching again.');
    return pauseHandler.handleToggle(ctx);
  });
  bot.command('resume', async (ctx) => {
    const paused = await state.isPaused();
    if (!paused) return ctx.reply('Already watching your inbox.');
    return pauseHandler.handleToggle(ctx);
  });
  bot.command('settings', settingsHandler.handleSettings);
  bot.command('help', helpHandler.handleHelp);

  // BBTB (reply keyboard) text buttons mirror the slash commands exactly —
  // one handler per action, reachable both ways.
  bot.hears('📥 Status', statusHandler.handleStatus);
  bot.hears(['⏸ Pause', '▶️ Resume'], pauseHandler.handleToggle);
  bot.hears('⚙️ Settings', settingsHandler.handleSettings);
  bot.hears('❓ Help', helpHandler.handleHelp);

  // Forwarded-email inline buttons: ef:view / ef:page / ef:collapse / ef:ignore
  bot.action(/^ef:/, emailActions.handleCallback);

  bot.action('status:refresh', statusHandler.handleRefresh);
  bot.action('status:forcepoll', statusHandler.handleForcePoll);
  bot.action('noop', (ctx) => ctx.answerCbQuery().catch(() => {}));

  bot.catch((err, ctx) => {
    logger.error('Unhandled error in bot update', { error: err.message, updateType: ctx.updateType });
  });

  return bot;
}

module.exports = { createBot };
