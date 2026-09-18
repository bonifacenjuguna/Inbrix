/**
 * DEPRECATED — kept only for reference. Deploying this as its own Railway
 * service means a second domain to authorize in Google Cloud Console,
 * which is exactly the multi-domain headache the built-in /reauth route
 * (see src/server/app.js) avoids by running on the main bot's own domain.
 * Prefer README §2-alt instead.
 *
 * PRODUCTION-STYLE refresh token helper — deploy THIS as its own temporary
 * Railway service (or override your main service's start command to run
 * this instead, deploy once, then switch back) when you can't easily run
 * `npm run get-refresh-token` locally.
 *
 * It's completely standalone: no Postgres, no Redis, no Telegram — only
 * needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / PORT.
 *
 * Flow:
 *   1. Deploy this file as a Railway service → note its public URL
 *      (e.g. https://inbrix-oauth-helper.up.railway.app)
 *   2. In Google Cloud Console, add that URL's origin + redirect (see
 *      README §1.4-alt below) to your OAuth client
 *   3. Set this service's env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *      GOOGLE_REDIRECT_URI = https://inbrix-oauth-helper.up.railway.app/oauth2callback
 *   4. Visit the service's root URL in your browser, approve access
 *   5. Copy the refresh token it shows you into your MAIN bot service's
 *      GOOGLE_REFRESH_TOKEN env var
 *   6. Tear this service down (or remove its public domain) — it's a live
 *      credential-issuing endpoint and has no reason to stay online after
 *      you've got the token.
 *
 * Run locally too if you want: `node scripts/get-refresh-token-prod.js`
 */
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const PORT = process.env.PORT || 3000;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error(
    'Missing env vars. This service needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ' +
      'and GOOGLE_REDIRECT_URI (the full public URL to /oauth2callback on THIS deployed service).'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const app = express();

app.get('/', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // required or Google won't return a refresh_token
    prompt: 'consent', // forces one even if you've approved this app before
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`<h2>Google returned an error</h2><pre>${error}</pre>`);
  }
  if (!code) {
    return res.status(400).send('Missing ?code — visit / first to start the consent flow.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(200).send(`
        <h2>No refresh_token was returned</h2>
        <p>This usually means you already approved this exact app before. Go to
        <a href="https://myaccount.google.com/permissions" target="_blank">
        Google Account &rarr; Security &rarr; Third-party access</a>, remove access
        for this app, then visit <a href="/">/</a> again.</p>
      `);
    }

    // Printed to logs too, in case the page load gets interrupted.
    console.log('\n✅ GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token + '\n');

    res.status(200).send(`
      <h2>✅ Success</h2>
      <p>Copy this into <code>GOOGLE_REFRESH_TOKEN</code> on your <b>main bot service</b>
      (not this one), then redeploy the main service.</p>
      <pre style="padding:14px;background:#111;color:#0f0;border-radius:6px;
                   word-break:break-all;font-size:14px;">${tokens.refresh_token}</pre>
      <p style="color:#b00;"><b>Then take this helper service down.</b> It's a live
      credential-issuing endpoint — it has no reason to stay online once you have the token.</p>
    `);
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    res.status(500).send(`<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`OAuth helper listening on port ${PORT}`);
  console.log(`Open this service's public URL in a browser to start the consent flow.`);
});
