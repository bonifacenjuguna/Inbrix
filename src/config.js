require('dotenv').config();

/**
 * Single choke point for env vars. Fail loudly and immediately on boot if
 * something required is missing, rather than limping along and failing
 * confusingly three layers deep later (e.g. a cryptic Postgres error
 * instead of "DATABASE_URL is not set").
 */

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function optionalInt(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_OWNER_ID: parseInt(required('TELEGRAM_OWNER_ID'), 10),

  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REFRESH_TOKEN: required('GOOGLE_REFRESH_TOKEN'),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI', 'http://localhost:53682/oauth2callback'),

  // Push is optional-at-boot — the bot runs fine on polling alone if Pub/Sub
  // isn't wired up yet, and logs a clear one-time warning instead of crashing.
  GOOGLE_PUBSUB_TOPIC: optional('GOOGLE_PUBSUB_TOPIC', ''),
  GOOGLE_PUBSUB_VERIFICATION_TOKEN: optional('GOOGLE_PUBSUB_VERIFICATION_TOKEN', ''),
  PUBLIC_BASE_URL: optional('PUBLIC_BASE_URL', ''),

  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),

  POLL_INTERVAL_MS: optionalInt('POLL_INTERVAL_MS', 45000),
  WATCHDOG_INTERVAL_MS: optionalInt('WATCHDOG_INTERVAL_MS', 300000),
  WATCHDOG_STALL_THRESHOLD_MS: optionalInt('WATCHDOG_STALL_THRESHOLD_MS', 600000),
  PORT: optionalInt('PORT', 3000),
  BOT_VERSION: optional('BOT_VERSION', '0.1.2'),

  GMAIL_SCOPES: ['https://www.googleapis.com/auth/gmail.readonly'],
};

if (Number.isNaN(config.TELEGRAM_OWNER_ID)) {
  throw new Error('TELEGRAM_OWNER_ID must be a numeric Telegram user id');
}

module.exports = config;
