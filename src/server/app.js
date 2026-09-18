const express = require('express');
const { google } = require('googleapis');
const config = require('../config');
const logger = require('../lib/logger');
const historySync = require('../lib/historySync');

/** Bare-bones, dependency-free HTML wrapper — no styling frameworks needed
 * for two static informational pages. Injects the Google Search Console
 * "HTML tag" verification meta tag when GOOGLE_SITE_VERIFICATION is set. */
function renderPage(title, bodyHtml) {
  const verificationMeta = config.GOOGLE_SITE_VERIFICATION
    ? `<meta name="google-site-verification" content="${config.GOOGLE_SITE_VERIFICATION}">`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${verificationMeta}
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
    h1 { font-size: 1.6em; } h2 { font-size: 1.2em; margin-top: 1.5em; }
    a { color: #2563eb; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function createServer(bot) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ ok: true }));

  /**
   * Google Search Console "HTML file" verification method — an alternative
   * to the meta-tag method above. Google gives you a filename like
   * google1234567890abcdef.html and exact file content to serve at that
   * exact path. Only registered if both env vars are set.
   */
  if (config.GOOGLE_SITE_VERIFICATION_FILENAME && config.GOOGLE_SITE_VERIFICATION_FILE_CONTENT) {
    app.get(`/${config.GOOGLE_SITE_VERIFICATION_FILENAME}`, (req, res) => {
      res.status(200).type('text/html').send(config.GOOGLE_SITE_VERIFICATION_FILE_CONTENT);
    });
  }

  /**
   * Homepage + Privacy Policy — Google's OAuth consent screen requires both
   * a Homepage URL and a Privacy Policy URL before it lets you switch
   * publishing status from Testing to Production (which is what removes
   * the 7-day refresh-token expiry for a Testing-mode app). These are
   * genuinely accurate for what this app is: a single-user, self-hosted
   * bot with no other users and no data shared with anyone.
   *
   * Point Google Cloud Console → OAuth consent screen → Branding at:
   *   Homepage URL:        {PUBLIC_BASE_URL}/
   *   Privacy Policy URL:  {PUBLIC_BASE_URL}/privacy
   */
  app.get('/', (req, res) => {
    res.status(200).type('html').send(renderPage(
      'Inbrix',
      `<h1>Inbrix</h1>
       <p>Inbrix is a private, self-hosted Telegram bot that forwards email
       from one Gmail inbox into one Telegram chat, for the exclusive use of
       its single owner/operator. It is not a public product or service and
       has no other users.</p>
       <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>`
    ));
  });

  app.get('/privacy', (req, res) => {
    res.status(200).type('html').send(renderPage(
      'Privacy Policy — Inbrix',
      `<h1>Privacy Policy</h1>
       <p><strong>Last updated:</strong> ${new Date().toISOString().slice(0, 10)}</p>
       <p>Inbrix is a private, self-hosted bot built and operated by a single
       individual for their own personal use. It is not distributed,
       marketed, or made available to any other user.</p>
       <h2>What data it accesses</h2>
       <p>Inbrix connects to exactly one Gmail account — the operator's own
       — using the read-only Gmail API scope
       (<code>gmail.readonly</code>). It reads incoming email metadata and
       content solely to forward that mail into the operator's own private
       Telegram chat.</p>
       <h2>What it does with that data</h2>
       <p>Email content is forwarded to the operator's Telegram chat and
       temporarily cached (a few days) to support in-chat pagination and
       sender-blocking features. It is never sold, shared, or disclosed to
       any third party, and is never used for advertising, profiling, or
       any purpose other than delivering the operator's own email to
       themselves.</p>
       <h2>Data retention</h2>
       <p>Processed-message records and blocked-sender lists are retained
       indefinitely in the operator's own private database for deduplication
       and filtering. Cached email content used for in-chat pagination
       expires automatically after a few days. The operator may delete any
       or all of this data at any time.</p>
       <h2>Third parties</h2>
       <p>Data passes only between Google's Gmail API, the operator's own
       hosting infrastructure, and Telegram's Bot API (to deliver messages
       to the operator's own chat). No other third party has access.</p>
       <h2>Contact</h2>
       <p>This app has a single operator, who is also its only user. There
       is no public support channel because there is no public user base.</p>
       <p><a href="/">Back to homepage</a> · <a href="/terms">Terms of Service</a></p>`
    ));
  });

  app.get('/terms', (req, res) => {
    res.status(200).type('html').send(renderPage(
      'Terms of Service — Inbrix',
      `<h1>Terms of Service</h1>
       <p><strong>Last updated:</strong> ${new Date().toISOString().slice(0, 10)}</p>
       <p>Inbrix is a private, self-hosted bot built and operated by a
       single individual solely for their own personal use. It is not
       offered as a public product or service, has no other users or
       customers, and these terms exist only to satisfy Google's OAuth
       consent screen requirements.</p>
       <h2>Use of the service</h2>
       <p>Inbrix connects to exactly one Gmail account and one Telegram
       account, both belonging to its sole operator, and forwards email
       from the former into the latter. No one other than the operator is
       authorized to use this instance.</p>
       <h2>No warranty</h2>
       <p>Inbrix is provided "as is," with no guarantee of uptime,
       accuracy, or fitness for any particular purpose. As the operator is
       also the only user, they accept full responsibility for its
       operation, configuration, and any consequences of its use or
       downtime.</p>
       <h2>Changes</h2>
       <p>The operator may modify, suspend, or discontinue Inbrix, or these
       terms, at any time without notice, since there is no other party who
       would need to be notified.</p>
       <h2>Contact</h2>
       <p>This app has a single operator, who is also its only user. There
       is no public support channel because there is no public user base.</p>
       <p><a href="/">Back to homepage</a> · <a href="/privacy">Privacy Policy</a></p>`
    ));
  });

  /**
   * Reauth helper — lets you mint a fresh GOOGLE_REFRESH_TOKEN on the same
   * domain as everything else, so you never need a second Railway service
   * (and never need to get a second domain authorized in Google Cloud
   * Console). Fully disabled (404) unless OAUTH_HELPER_SECRET is set.
   *
   * Usage: set OAUTH_HELPER_SECRET to any random string, redeploy, then
   * visit  {PUBLIC_BASE_URL}/reauth?secret=<that string>  in your browser.
   * Add this exact redirect URI to your OAuth Client in Google Cloud
   * Console first:  {PUBLIC_BASE_URL}/oauth2callback
   */
  function buildOAuthClient() {
    const redirectUri = `${(config.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/oauth2callback`;
    return new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri);
  }

  app.get('/reauth', (req, res) => {
    if (!config.OAUTH_HELPER_SECRET) return res.status(404).send('Not found');
    if (req.query.secret !== config.OAUTH_HELPER_SECRET) return res.status(404).send('Not found');
    if (!config.PUBLIC_BASE_URL) {
      return res.status(500).send('PUBLIC_BASE_URL must be set for /reauth to work.');
    }

    const authUrl = buildOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      state: config.OAUTH_HELPER_SECRET, // verified again on callback below
    });
    res.redirect(authUrl);
  });

  app.get('/oauth2callback', async (req, res) => {
    if (!config.OAUTH_HELPER_SECRET) return res.status(404).send('Not found');
    const { code, error, state } = req.query;

    if (state !== config.OAUTH_HELPER_SECRET) {
      return res.status(403).send('Invalid or missing state — start again at /reauth?secret=...');
    }
    if (error) return res.status(400).send(`Google returned an error: ${error}`);
    if (!code) return res.status(400).send('Missing ?code — visit /reauth?secret=... first.');

    try {
      const { tokens } = await buildOAuthClient().getToken(code);
      if (!tokens.refresh_token) {
        return res.status(200).type('html').send(renderPage('Reauth — no refresh token', `
          <h2>No refresh_token was returned</h2>
          <p>This usually means you already approved this app before. Go to
          <a href="https://myaccount.google.com/permissions" target="_blank">
          Google Account &rarr; Security &rarr; Third-party access</a>, remove access
          for this app, then visit <a href="/reauth?secret=${encodeURIComponent(state)}">/reauth</a> again.</p>
        `));
      }
      logger.info('New Gmail refresh token minted via /reauth — update GOOGLE_REFRESH_TOKEN in Railway');
      res.status(200).type('html').send(renderPage('Reauth — success', `
        <h2>✅ Success</h2>
        <p>Copy this into <code>GOOGLE_REFRESH_TOKEN</code>, then redeploy:</p>
        <pre style="padding:14px;background:#111;color:#0f0;border-radius:6px;
                     word-break:break-all;font-size:14px;">${tokens.refresh_token}</pre>
        <p style="color:#b00;">Consider unsetting <code>OAUTH_HELPER_SECRET</code> afterward
        to close this route again.</p>
      `));
    } catch (err) {
      logger.error('Reauth token exchange failed', { error: err.message });
      res.status(500).send(`Token exchange failed: ${err.message}`);
    }
  });

  /**
   * Gmail's Pub/Sub push subscription posts here whenever new mail arrives.
   * The push payload only ever tells us "something changed" — we don't
   * trust its embedded historyId as a diff boundary, we just use it as a
   * trigger to run the exact same history-diff the poll loop runs, from
   * our own last-known historyId. This is also why push and poll can run
   * at the same time without ever double-forwarding: same code path,
   * same dedupe guard.
   */
  app.post('/gmail/webhook', async (req, res) => {
    if (config.GOOGLE_PUBSUB_VERIFICATION_TOKEN) {
      const token = req.query.token;
      if (token !== config.GOOGLE_PUBSUB_VERIFICATION_TOKEN) {
        logger.warn('Rejected Gmail webhook call with invalid/missing verification token');
        return res.status(401).send('invalid token');
      }
    }

    // Ack Pub/Sub immediately — it retries aggressively on anything but a
    // fast 2xx, and we don't want retries piling up while a sync is slow.
    res.status(200).send('ok');

    try {
      await historySync.sync('push', bot.telegram);
    } catch (err) {
      logger.error('Push-triggered sync failed', { error: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
