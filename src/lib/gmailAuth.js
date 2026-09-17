const { google } = require('googleapis');
const config = require('../config');
const logger = require('../lib/logger');

/**
 * One OAuth2Client for the whole process. `googleapis` handles access-token
 * refresh transparently as long as a refresh_token is set — we never store
 * or manage access tokens ourselves.
 */
const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });

oauth2Client.on('tokens', (tokens) => {
  // googleapis fires this whenever it silently refreshes the access token.
  // We don't persist access tokens (they're short-lived and rebuilt from
  // the refresh token on every boot), but a log line helps confirm the
  // refresh flow is actually alive.
  if (tokens.access_token) {
    logger.debug('Gmail access token refreshed');
  }
  // Google can occasionally rotate the refresh token itself. If that ever
  // happens, the old one stored in Railway's env vars would stop working —
  // surface it loudly rather than failing mysteriously days later.
  if (tokens.refresh_token && tokens.refresh_token !== config.GOOGLE_REFRESH_TOKEN) {
    logger.warn(
      'Google issued a NEW refresh token — update GOOGLE_REFRESH_TOKEN in Railway or the bot will stop working once the old one is invalidated',
      { newRefreshTokenPreview: tokens.refresh_token.slice(0, 12) + '…' }
    );
  }
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

/** Cheap liveness check used by /status and the smoke test. */
async function checkAuth() {
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data; // { emailAddress, messagesTotal, threadsTotal, historyId }
}

module.exports = { oauth2Client, gmail, checkAuth };
