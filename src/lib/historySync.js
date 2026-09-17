const gmailApi = require('./gmail');
const state = require('./state');
const logger = require('./logger');
const emailPipeline = require('./emailPipeline');

// In-process guard so a push notification arriving mid-poll (or two pushes
// back to back) doesn't run two history.list diffs concurrently. Duplicate
// forwarding is already impossible either way (dedupe.claim is the real
// guard), but this avoids doing the Gmail API work twice for nothing.
let syncing = false;

/**
 * Diffs Gmail history since our last known historyId, forwards anything
 * new, and advances the stored historyId. Called by the poll interval on a
 * timer, and by the Pub/Sub push webhook the moment Gmail signals new mail.
 *
 * @param {'poll'|'push'} source
 * @param {import('telegraf').Telegram} telegram - bot.telegram (or ctx.telegram)
 */
async function sync(source, telegram) {
  if (syncing) {
    logger.debug('Sync already in progress, skipping this trigger', { source });
    return { skipped: true };
  }
  syncing = true;
  try {
    const paused = await state.isPaused();
    if (paused) {
      logger.debug('Bot is paused, skipping sync', { source });
      return { skipped: true, paused: true };
    }

    let startHistoryId = await state.getHistoryId();
    if (!startHistoryId) {
      // First run ever: baseline to "now" so we don't dump the whole inbox
      // history into Telegram the moment the bot first boots.
      startHistoryId = await gmailApi.getCurrentHistoryId();
      await state.setHistoryId(startHistoryId);
      logger.info('Baselined Gmail history — nothing to forward on first boot', { startHistoryId });
      return { baselined: true };
    }

    const { messageIds, newHistoryId, historyExpired } = await gmailApi.listNewMessagesSince(startHistoryId);

    if (historyExpired) {
      logger.warn('Gmail history window expired — re-baselining (a few recent emails may be missed)');
      const freshHistoryId = await gmailApi.getCurrentHistoryId();
      await state.setHistoryId(freshHistoryId);
      return { rebaselined: true };
    }

    for (const messageId of messageIds) {
      try {
        await emailPipeline.processMessage(messageId, source, telegram);
      } catch (err) {
        // One bad message should never take down the whole batch.
        logger.error('Failed to process one message, continuing', { messageId, error: err.message });
      }
    }

    if (newHistoryId) await state.setHistoryId(newHistoryId);

    if (source === 'poll') await state.recordPollSuccess();
    else await state.recordPushSuccess();

    return { processed: messageIds.length };
  } catch (err) {
    if (source === 'poll') await state.recordPollError(err.message);
    else await state.recordPushError(err.message);
    throw err;
  } finally {
    syncing = false;
  }
}

module.exports = { sync };
