const emailCache = require('../lib/emailCache');
const filters = require('../lib/filters');
const inline = require('../keyboards/inline');
const logger = require('../lib/logger');

/** Loads the cached render for a message, or tells the user it expired
 * (cache TTL is 3 days — plenty for normal use, but honest about the edge). */
async function loadOrWarn(ctx, messageId) {
  const cached = await emailCache.load(messageId);
  if (!cached) {
    await ctx.answerCbQuery('This email is too old to expand anymore.', { show_alert: true }).catch(() => {});
    return null;
  }
  return cached;
}

async function handleView(ctx, messageId, page) {
  const cached = await loadOrWarn(ctx, messageId);
  if (!cached) return;

  const pageIndex = Math.min(Math.max(page, 1), cached.pages.length) - 1;
  const header = `✉️ <b>${escapeAlready(cached.senderName || cached.senderEmail)}</b>\n` +
    `📌 ${escapeAlready(cached.subject || '(no subject)')}\n\n`;
  const body = header + cached.pages[pageIndex];

  try {
    await ctx.editMessageText(body, {
      parse_mode: 'HTML',
      ...inline.emailExpanded(messageId, pageIndex + 1, cached.pages.length),
    });
  } catch (err) {
    logger.error('Failed to edit message for View Full', { error: err.message, messageId });
  }
  await ctx.answerCbQuery().catch(() => {});
}

async function handleCollapse(ctx, messageId) {
  const cached = await loadOrWarn(ctx, messageId);
  if (!cached) return;

  try {
    await ctx.editMessageText(cached.compactLine, {
      parse_mode: 'HTML',
      ...inline.emailCompact(messageId),
    });
  } catch (err) {
    logger.error('Failed to edit message for Collapse', { error: err.message, messageId });
  }
  await ctx.answerCbQuery().catch(() => {});
}

async function handleIgnoreSender(ctx, messageId) {
  const cached = await emailCache.load(messageId);
  const email = cached && cached.senderEmail;
  if (!email) {
    await ctx.answerCbQuery('Could not identify the sender for this message.', { show_alert: true }).catch(() => {});
    return;
  }
  await filters.block(email);
  await ctx.answerCbQuery(`Future emails from ${email} will be ignored.`, { show_alert: true }).catch(() => {});
}

// The header we build here already contains real content that came out of
// emailFormat.js's own escaping — sender/subject strings from Gmail headers
// still need HTML-escaping since they never passed through that pipeline.
function escapeAlready(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Single entry point wired into bot.js's `bot.action(/^ef:/, ...)`. */
async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  const parts = data.split(':');
  const [, action, messageId, pageStr] = parts;

  if (action === 'view') return handleView(ctx, messageId, parseInt(pageStr, 10) || 1);
  if (action === 'page') return handleView(ctx, messageId, parseInt(pageStr, 10) || 1);
  if (action === 'collapse') return handleCollapse(ctx, messageId);
  if (action === 'ignore') return handleIgnoreSender(ctx, messageId);

  await ctx.answerCbQuery().catch(() => {});
}

module.exports = { handleCallback };
