/**
 * Manually registers (or re-registers) the Gmail push watch against
 * GOOGLE_PUBSUB_TOPIC. Useful for confirming your Pub/Sub setup works
 * before relying on the app's automatic daily renewal
 * (see src/jobs/watchRenewal.js).
 *
 * Run with: node scripts/setup-gmail-watch.js
 */
require('dotenv').config();

async function main() {
  const config = require('../src/config');
  const gmailApi = require('../src/lib/gmail');
  const state = require('../src/lib/state');

  if (!config.GOOGLE_PUBSUB_TOPIC) {
    console.error('GOOGLE_PUBSUB_TOPIC is not set — nothing to register.');
    process.exit(1);
  }

  console.log(`Registering Gmail watch on topic: ${config.GOOGLE_PUBSUB_TOPIC}`);
  const result = await gmailApi.registerWatch();

  if (!result) {
    console.error('registerWatch() returned nothing — check GOOGLE_PUBSUB_TOPIC.');
    process.exit(1);
  }

  await state.setWatchExpiration(result.expirationMs);

  console.log('✅ Watch registered.');
  console.log(`   historyId: ${result.historyId}`);
  console.log(`   expires:   ${new Date(result.expirationMs).toISOString()}`);
  console.log(
    '\nMake sure your Pub/Sub push subscription points at:\n' +
      `  ${config.PUBLIC_BASE_URL || '<your Railway URL>'}/gmail/webhook` +
      (config.GOOGLE_PUBSUB_VERIFICATION_TOKEN ? `?token=${config.GOOGLE_PUBSUB_VERIFICATION_TOKEN}` : '')
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to register watch:', err.message);
  process.exit(1);
});
