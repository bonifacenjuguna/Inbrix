const { redis } = require('../db/redis');

const TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days — plenty for a chat you'll still be scrolling

function key(messageId) {
  return `inbrix:email:${messageId}`;
}

/** Stores everything needed to render this email again later: the compact
 * line, every paginated page, and the sender (for the Ignore Sender action). */
async function save(messageId, { compactLine, pages, senderEmail, senderName, subject }) {
  await redis.set(
    key(messageId),
    JSON.stringify({ compactLine, pages, senderEmail, senderName, subject }),
    'EX',
    TTL_SECONDS
  );
}

async function load(messageId) {
  const raw = await redis.get(key(messageId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

module.exports = { save, load };
