const config = require('../config');
const logger = require('./logger');
const gmailApi = require('./gmail');
const mime = require('./mime');
const format = require('./emailFormat');
const emailCache = require('./emailCache');
const dedupe = require('./dedupe');
const filters = require('./filters');
const inline = require('../keyboards/inline');

/**
 * Processes one Gmail message id end-to-end. Safe to call redundantly from
 * both the poll loop and the push webhook for the same id — `dedupe.claim`
 * is the only thing that decides who actually forwards it.
 *
 * @param {string} messageId
 * @param {'poll'|'push'} source
 * @param {import('telegraf').Telegram} telegram - bot.telegram (or ctx.telegram)
 */
async function processMessage(messageId, source, telegram) {
  const claimed = await dedupe.claim(messageId, null, source);
  if (!claimed) {
    logger.debug('Message already processed, skipping', { messageId, source });
    return;
  }

  const raw = await gmailApi.getMessage(messageId);
  const headers = raw.payload ? raw.payload.headers : [];
  const fromHeader = mime.getHeader(headers, 'From');
  const subject = mime.getHeader(headers, 'Subject');
  const { name: senderName, email: senderEmail } = mime.parseFromHeader(fromHeader);

  if (await filters.isBlocked(senderEmail)) {
    logger.info('Sender is blocked, not forwarding', { senderEmail, messageId });
    return;
  }

  const { html, text } = mime.extractBodies(raw.payload);
  const bodyHtml = html ? format.htmlToTelegramHtml(html) : format.plainTextToTelegramHtml(text);
  const pages = format.paginate(bodyHtml);
  const compactLine = format.buildCompactLine(senderName || senderEmail, subject);

  await emailCache.save(messageId, {
    compactLine,
    pages,
    senderEmail,
    senderName,
    subject,
  });

  const sent = await telegram.sendMessage(config.TELEGRAM_OWNER_ID, compactLine, {
    parse_mode: 'HTML',
    ...inline.emailCompact(messageId),
  });

  await dedupe.recordTelegramMessage(messageId, sent.chat.id, sent.message_id);
  logger.info('Forwarded email', { messageId, source, senderEmail, subject });
}

module.exports = { processMessage };
