/**
 * Color tiers (Bot API 9.4 `style` field on keyboard buttons):
 *   RED       — reserved for a genuinely irreversible execute action.
 *               Nothing in v1 uses it yet — there's no destructive action
 *               in this bot's current scope. Keep it that way: don't reach
 *               for RED just because a button "sounds important."
 *   GREEN     — means exactly one thing: "the safe way out" (Cancel).
 *               Nothing in v1 uses it yet either (no multi-step flows to
 *               cancel out of) — wired up and ready for when Filters/History
 *               land.
 *   BLUE      — the expected way to move forward: navigation, refresh,
 *               resume, confirm-a-safe-action.
 *   colorless — incidental, per-item taps: pagination, per-message actions
 *               like Ignore Sender. No style key — Telegram's default.
 */
const { Markup } = require('telegraf');

const RED = 'danger';
const GREEN = 'success';
const BLUE = 'primary';

const MAX_CALLBACK_DATA_BYTES = 64;
function checkCallbackLength(data) {
  const bytes = Buffer.byteLength(data, 'utf8');
  if (bytes > MAX_CALLBACK_DATA_BYTES) {
    // eslint-disable-next-line global-require
    const logger = require('../lib/logger');
    logger.warn("callback_data exceeds Telegram's 64-byte limit — this button will fail", {
      bytes,
      data: data.length > 80 ? `${data.slice(0, 80)}…` : data,
    });
  }
}

function callback(text, data, colorStyle) {
  checkCallbackLength(data);
  const button = Markup.button.callback(text, data);
  return colorStyle ? { ...button, style: colorStyle } : button;
}

function text(label, colorStyle) {
  const button = Markup.button.text(label);
  return colorStyle ? { ...button, style: colorStyle } : button;
}

module.exports = { RED, GREEN, BLUE, callback, text };
