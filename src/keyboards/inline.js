const { Markup } = require('telegraf');
const style = require('./buttonStyle');

/** Compact (default) forwarded-email view. Both actions are incidental
 * per-message taps, not proceed/cancel — colorless per the locked rule. */
function emailCompact(messageId) {
  return Markup.inlineKeyboard([
    [style.callback('📎 View Full', `ef:view:${messageId}:1`), style.callback('🔇 Ignore Sender', `ef:ignore:${messageId}`)],
  ]);
}

/** Expanded view. Page indicator button is inert (no-op) — it's a label,
 * not a control, matching how the reference bot treats pure pagination
 * state as colorless/non-interactive-in-itself. */
function emailExpanded(messageId, page, totalPages) {
  const rows = [];
  if (totalPages > 1) {
    const prevTarget = page > 1 ? `ef:page:${messageId}:${page - 1}` : 'noop';
    const nextTarget = page < totalPages ? `ef:page:${messageId}:${page + 1}` : 'noop';
    rows.push([
      style.callback('◀ Prev', prevTarget),
      style.callback(`${page}/${totalPages}`, 'noop'),
      style.callback('Next ▶', nextTarget),
    ]);
  }
  rows.push([
    style.callback('🔼 Collapse', `ef:collapse:${messageId}`),
    style.callback('🔇 Ignore Sender', `ef:ignore:${messageId}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

/** /status screen actions — both are safe re-checks, BLUE. */
function statusActions() {
  return Markup.inlineKeyboard([
    [style.callback('🔄 Refresh', 'status:refresh', style.BLUE), style.callback('🔁 Force Poll Now', 'status:forcepoll', style.BLUE)],
  ]);
}

module.exports = { emailCompact, emailExpanded, statusActions };
