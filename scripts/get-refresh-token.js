/**
 * Run this LOCALLY (not on Railway): `npm run get-refresh-token`
 *
 * Spins up a tiny local HTTP server, opens the Google OAuth consent screen,
 * and prints the refresh token once you approve access. You only ever do
 * this once — refresh tokens don't expire on their own.
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI
 * in your local .env. GOOGLE_REDIRECT_URI must exactly match an
 * "Authorized redirect URI" configured on this OAuth Client in
 * Google Cloud Console → APIs & Services → Credentials.
 */
require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:53682/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your local .env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // required to get a refresh_token back
  prompt: 'consent', // forces a refresh_token even if you've authorized before
  scope: ['https://www.googleapis.com/auth/gmail.readonly'],
});

const redirectUrl = new URL(REDIRECT_URI);
const port = parseInt(redirectUrl.port, 10) || 80;

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  if (reqUrl.pathname !== redirectUrl.pathname) {
    res.writeHead(404);
    return res.end();
  }

  const code = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`Google returned an error: ${error}`);
    console.error(`\nGoogle returned an error: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Success — you can close this tab and go back to your terminal.');

    console.log('\n✅ Success! Add this to your Railway environment variables:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    if (!tokens.refresh_token) {
      console.warn(
        'No refresh_token was returned — this usually means you already granted access before.\n' +
          'Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.'
      );
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Token exchange failed — check your terminal.');
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(port, () => {
  console.log('Open this URL in your browser and approve access:\n');
  console.log(authUrl);
  console.log(`\nWaiting for the redirect back to ${REDIRECT_URI} …`);
});
