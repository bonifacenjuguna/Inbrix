/**
 * `npm run smoke-test` — run this after every deploy (or Railway can run it
 * as a pre-deploy check) to confirm every dependency the bot needs is
 * actually reachable, before trusting that "it's running" means "it works."
 */
require('dotenv').config();

async function main() {
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail });
    } catch (err) {
      results.push({ name, ok: false, detail: err.message });
    }
  };

  await check('Environment variables', async () => {
    // Importing config.js throws immediately if anything required is missing.
    require('../src/config');
    return 'all required vars present';
  });

  await check('Postgres connection', async () => {
    const db = require('../src/db/postgres');
    const ms = await db.ping();
    return `connected (${ms}ms)`;
  });

  await check('Redis connection', async () => {
    const { ping } = require('../src/db/redis');
    const ms = await ping();
    return `connected (${ms}ms)`;
  });

  await check('Gmail API auth', async () => {
    const gmailAuth = require('../src/lib/gmailAuth');
    const profile = await gmailAuth.checkAuth();
    return `authenticated as ${profile.emailAddress}`;
  });

  await check('Telegram bot token', async () => {
    const config = require('../src/config');
    const { Telegraf } = require('telegraf');
    const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
    const me = await bot.telegram.getMe();
    return `authenticated as @${me.username}`;
  });

  console.log('\n─── Inbrix Smoke Test ───\n');
  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}: ${r.detail}`);
    if (!r.ok) allOk = false;
  }
  console.log('');

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
