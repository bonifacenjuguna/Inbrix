const { gmail } = require('./gmailAuth');
const config = require('../config');
const logger = require('./logger');

/**
 * Returns the list of new INBOX message ids since `startHistoryId`.
 * Returns { messageIds, newHistoryId, historyExpired }.
 *
 * `historyExpired` is true when Gmail has pruned history older than what we
 * had stored (it only keeps ~7 days) — the caller should then fall back to
 * re-baselining from the current profile historyId instead of retrying.
 */
async function listNewMessagesSince(startHistoryId) {
  let pageToken;
  const messageIds = new Set();
  let newHistoryId = startHistoryId;

  do {
    let res;
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
      });
    } catch (err) {
      if (err.code === 404 || (err.response && err.response.status === 404)) {
        return { messageIds: [], newHistoryId: null, historyExpired: true };
      }
      throw err;
    }

    const history = res.data.history || [];
    for (const entry of history) {
      for (const added of entry.messagesAdded || []) {
        const msg = added.message;
        if (!msg || !msg.labelIds) continue;
        // Only ever forward actual inbox mail — never SENT, DRAFT, or Gmail's
        // own CHAT label noise picked up incidentally by the history feed.
        if (msg.labelIds.includes('INBOX') && !msg.labelIds.includes('SENT')) {
          messageIds.add(msg.id);
        }
      }
    }

    if (res.data.historyId) newHistoryId = res.data.historyId;
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return { messageIds: Array.from(messageIds), newHistoryId, historyExpired: false };
}

/** Fetch the current baseline historyId — used on first run and after
 * a "history too old" reset. */
async function getCurrentHistoryId() {
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.historyId;
}

/** Full message payload, used to build the compact + expanded views. */
async function getMessage(messageId) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  return res.data;
}

/**
 * Registers (or renews) the Gmail push subscription against our Pub/Sub
 * topic. Must be re-called at least every 7 days — see jobs/watchRenewal.js.
 * No-ops (with a warning) if GOOGLE_PUBSUB_TOPIC isn't configured, so the
 * bot still runs on polling alone.
 */
async function registerWatch() {
  if (!config.GOOGLE_PUBSUB_TOPIC) {
    logger.warn('GOOGLE_PUBSUB_TOPIC not set — running on polling only, no Gmail push');
    return null;
  }
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: config.GOOGLE_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterAction: 'include',
    },
  });
  // res.data.expiration is a string epoch-ms per Gmail API docs.
  return {
    historyId: res.data.historyId,
    expirationMs: parseInt(res.data.expiration, 10),
  };
}

module.exports = { listNewMessagesSince, getCurrentHistoryId, getMessage, registerWatch };
