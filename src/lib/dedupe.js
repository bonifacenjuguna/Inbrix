const db = require('../db/postgres');

/**
 * Atomically claims a message id. Returns true if THIS call is the one that
 * gets to forward it (poll and push race here constantly by design — this
 * unique-key insert is what makes that race harmless instead of a source
 * of duplicate messages).
 */
async function claim(messageId, threadId, source) {
  const { rows } = await db.query(
    `INSERT INTO processed_messages (message_id, thread_id, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [messageId, threadId, source]
  );
  return rows.length > 0;
}

async function recordTelegramMessage(messageId, chatId, telegramMessageId) {
  await db.query(
    'UPDATE processed_messages SET telegram_chat_id = $1, telegram_message_id = $2 WHERE message_id = $3',
    [chatId, telegramMessageId, messageId]
  );
}

async function countForwardedSince(sinceDate) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM processed_messages WHERE forwarded_at >= $1',
    [sinceDate]
  );
  return rows[0].count;
}

module.exports = { claim, recordTelegramMessage, countForwardedSince };
