async function handleHelp(ctx) {
  const text =
    `❓ *Inbrix Help*\n\n` +
    `New emails land here automatically \\— tap 📎 *View Full* on any of them to read the whole thing, page by page, right inside the message\\.\n\n` +
    `/status \\— connection health, last poll/push, DB/Redis/Gmail checks\n` +
    `/pause, /resume \\— stop or restart forwarding\n` +
    `/settings \\— ignored senders and upcoming filters\n` +
    `/help \\— this screen`;

  await ctx.reply(text, { parse_mode: 'MarkdownV2' });
}

module.exports = { handleHelp };
