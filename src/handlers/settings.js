const filters = require('../lib/filters');
const format = require('../lib/format');

async function handleSettings(ctx) {
  const blocked = await filters.list();
  const blockedLines = blocked.length
    ? blocked
        .slice(0, 10)
        .map((b) => `└ ${b.email} (${format.relativeTime(b.blocked_at)})`)
        .join('\n')
    : '└ none yet';

  const text =
    `◆ SETTINGS\n\n` +
    `🔇 Ignored senders (${blocked.length}):\n${blockedLines}\n\n` +
    `🔧 Filters (keyword rules) — coming soon\n` +
    `🔧 History browser — coming soon\n` +
    `🔧 Poll/Push mode toggle — coming soon`;

  await ctx.reply(text);
}

module.exports = { handleSettings };
