# Inbrix (@InbrixBot)

Owner-only Telegram bot that forwards your Gmail inbox into Telegram, in
real time (Gmail push) and as a safety net (polling), running side by side
so a missed push notification never means a missed email.

**v1 scope, on purpose:** stable receiving only. Filters, History, and
poll/push mode switching are visible in `/settings` as "coming soon" —
the plumbing for them (blocked-sender list, dedupe table) is already real,
the rest gets built once this is rock solid.

---

## 1. Google Cloud Console setup

### 1.1 Create/select a project
Go to [console.cloud.google.com](https://console.cloud.google.com), create
a project (or use an existing one).

### 1.2 Enable APIs
**APIs & Services → Library**, enable:
- **Gmail API**
- **Cloud Pub/Sub API** (only needed if you want push notifications — the
  bot runs fine on polling alone without this)

### 1.3 OAuth consent screen
**APIs & Services → OAuth consent screen**
- User type: External (Internal only works if you're on Google Workspace)
- Add your own Gmail address as a **test user** (fine to start; see the
  Publishing note below for the permanent fix to the 7-day token expiry)
- Scope: `.../auth/gmail.readonly` is all v1 needs

**Publishing (removes the 7-day refresh-token expiry):** while this app
stays in **Testing** mode, Google expires refresh tokens after 7 days no
matter what. Switching to **Production** removes that limit entirely —
and since `gmail.readonly` is unverified-but-not-restricted, this doesn't
require Google's review process, just a one-time click:

1. **OAuth consent screen → Branding** — fill in the required fields:
   App name, User support email, Developer contact email, **Homepage URL**,
   **Privacy Policy URL**, **Terms of Service URL**. Once deployed (§3),
   your app already serves all three:
   - Homepage URL: `{PUBLIC_BASE_URL}/`
   - Privacy Policy URL: `{PUBLIC_BASE_URL}/privacy`
   - Terms of Service URL: `{PUBLIC_BASE_URL}/terms`
   (All three are genuinely accurate — they plainly state this is a
   private, single-user bot with no other users and no data shared with
   anyone.)

   **Authorized domains:** enter just the base domain of your
   `PUBLIC_BASE_URL` — e.g. for
   `https://inbrix-bot-production.up.railway.app`, enter
   `up.railway.app` first; if Google rejects that and asks you to verify
   a "top private domain" you don't own, enter the **full subdomain
   instead** (`inbrix-bot-production.up.railway.app`) — Railway's shared
   domain is registered on the public suffix list specifically so
   individual app subdomains can be authorized this way without owning
   `railway.app` itself. If neither is accepted (`*.up.railway.app` has
   had reported acceptance issues in Google Cloud Console — a
   [known recent report](https://station.railway.com/questions/unable-to-create-o-auth-2-0-client-id-wit-b1c0fd0b)),
   the reliable fix is a
   [Railway custom domain](https://docs.railway.com/guides/public-networking#custom-domains)
   you actually own — then that domain goes everywhere (Homepage,
   Privacy, Terms, redirect URI, Authorized domains) instead.
2. **OAuth consent screen → Audience** (or the main overview page) →
   **Publish App** → confirm.
3. Re-run your refresh token flow (§2 or §2-alt) once more after
   publishing and update `GOOGLE_REFRESH_TOKEN` in Railway — a token minted
   while still in Testing may carry the old 7-day limit.
4. You'll now see a "Google hasn't verified this app" click-through on the
   consent screen — expected and harmless, since you're the only person
   who'll ever see it.

### 1.4 OAuth Client credentials
**APIs & Services → Credentials → Create Credentials → OAuth client ID**
- Application type: **Web application**
- Authorized redirect URIs: add `http://localhost:53682/oauth2callback`
  (matches the default in `.env.example` — change both together if you
  want a different port)
- Save the **Client ID** and **Client Secret** — these are your
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

**One domain only, always.** Earlier drafts of this README suggested a
separate `get-refresh-token-prod.js` helper deployed as its *own* Railway
service with its *own* domain — don't do that anymore. It meant two
different domains to authorize (your main bot's, and the helper's), and
Railway's shared `*.up.railway.app` subdomains have had reported issues
being accepted at all in Google Cloud Console's domain fields. Use the
**built-in `/reauth` route on your main app instead** (§2-alt below) — it
runs on the exact same domain as everything else, so there is only ever
**one domain** to add anywhere: your main bot's Railway URL. Add both of
these to this same OAuth Client:
- Authorized redirect URIs: `{PUBLIC_BASE_URL}/oauth2callback`
- (Authorized domains, on the Branding page, only ever needs your main
  bot's domain too — see the Publishing note there.)

### 1.5 (Optional, for push) Cloud Pub/Sub
Real-time delivery needs a Pub/Sub topic and a permission grant — full
walkthrough is in **§4. Set up Gmail Push**, once your bot is already
deployed and you have a live URL to point it at. Nothing to do here yet;
skip ahead to §2 if you just want the bot running on polling first.

---

## 2. Get your refresh token (run locally, once)

```bash
npm install
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET in .env
npm run get-refresh-token
```

This opens a URL — open it in your browser, sign in with the Gmail account
you want forwarded, approve access. The script prints:

```
GOOGLE_REFRESH_TOKEN=1//0g...
```

Copy that value — you'll paste it into Railway's env vars in step 3. You
only ever do this once per token; refresh tokens don't expire on their own
(unless you revoke access, or your OAuth consent screen is still in
**Testing** mode — see the note at the end of the next section).

### 2-alt. Get it via the bot's own live URL instead (no local machine needed, one domain only)

If running things locally isn't convenient, use the **built-in `/reauth`
route already in `src/server/app.js`** — it runs on your main bot's
existing domain, so there's no second domain to authorize anywhere.

1. **Add the redirect URI to your OAuth Client** (Cloud Console →
   Credentials → your OAuth Client → Authorized redirect URIs):
   ```
   https://your-app.up.railway.app/oauth2callback
   ```
   (your actual main bot domain — same one already used for Homepage/
   Privacy/Terms in §1.4/§1.3)
2. **Set two env vars** on your main bot service and redeploy:
   - `PUBLIC_BASE_URL` = `https://your-app.up.railway.app` (no trailing slash)
   - `OAUTH_HELPER_SECRET` = any random string (e.g. `openssl rand -hex 16`)
     — this route is a 404 to everyone until this is set, and checked again
     on every request
3. Visit `https://your-app.up.railway.app/reauth?secret=<that string>` in
   your browser. Approve access → it prints your new
   `GOOGLE_REFRESH_TOKEN` on the page.
4. Update `GOOGLE_REFRESH_TOKEN` in Railway with that value, redeploy.
5. **Unset `OAUTH_HELPER_SECRET`** afterward to close the route again —
   it's a credential-issuing endpoint, no reason to leave it reachable.

> **Testing-mode expiry:** while your OAuth consent screen is still in
> **Testing** (Google Cloud Console → OAuth consent screen), Google expires
> refresh tokens after 7 days regardless of activity. Either re-run this
> flow weekly, or click **Publish App** on the consent screen once you're
> past initial testing — for an unverified personal app with a sensitive
> scope, this doesn't require Google's review, it just shows a "Google
> hasn't verified this app" click-through, which is fine since you're the
> only one who'll ever see it.

---

## 3. Deploy to Railway

1. Push this project to a GitHub repo (or use Railway's CLI to deploy
   directly from this folder).
2. In Railway: **New Project → Deploy from GitHub repo**.
3. **Add plugins:** click **+ New → Database → PostgreSQL**, and
   **+ New → Database → Redis**. Railway auto-injects `DATABASE_URL` and
   `REDIS_URL` into your service — you don't need to set those by hand.
4. **Set environment variables** on your service (Settings → Variables):
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `TELEGRAM_OWNER_ID` — your numeric Telegram user id (get it from
     [@userinfobot](https://t.me/userinfobot))
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
   - `POLL_INTERVAL_MS` — safe to drop to `10000` (10s) or lower; it's a
     single-user bot, nowhere near Gmail's API quota. Once push (§4) is
     live, this becomes just a safety net and can go back up if you want.
5. Deploy. Check the logs — you should see:
   ```
   Database schema is up to date
   Gmail auth OK { emailAddress: 'you@gmail.com' }
   Telegram bot launching (long polling)
   Polling started
   ```
6. **Run the smoke test** to confirm everything's actually wired up
   (from your local machine, pointed at Railway's env, or via Railway's
   shell):
   ```bash
   npm run smoke-test
   ```
7. Message your bot on Telegram: `/start`.

Working on polling alone at this point is a completely valid place to stop
— §4 below is optional, for when you want real-time instead of a ~10-45s
delay.

---

## 4. Set up Gmail Push (real-time delivery)

Polling means "check every N seconds." Push means Gmail *tells* the bot
the instant new mail lands — typically 1–3 seconds instead of waiting on
the poll timer. Do this once your bot is already deployed from §3, since
you need its live URL.

**4.1 Enable the API** (if you skipped it in §1.2): Cloud Console →
**APIs & Services → Library** → enable **Cloud Pub/Sub API**.

**4.2 Create the topic:** Pub/Sub → Topics → **Create Topic**
- Topic ID: `gmail-notifications` (or anything you like)
- Leave **Add a default subscription** checked, everything else
  (schema, ingestion, message retention, BigQuery, backup, Cloud KMS)
  unchecked/default
- Click **Create**

Note the full topic name shown under the Topic ID field, e.g.:
```
projects/YOUR_PROJECT_ID/topics/gmail-notifications
```
That full string is your `GOOGLE_PUBSUB_TOPIC`.

**4.3 Grant Gmail permission to publish to it** — this is the step that's
easy to miss and causes push to silently never fire:
- Open the topic → **Permissions** tab → **+ Add principal**
- New principals: `gmail-api-push@system.gserviceaccount.com`
- Role: **Pub/Sub Publisher**
- **Save**

**4.4 Set three more env vars** on your bot service in Railway, then
redeploy:
- `GOOGLE_PUBSUB_TOPIC` — the full topic name from 4.2
- `PUBLIC_BASE_URL` — your bot's live Railway URL, e.g.
  `https://inbrix-bot-production.up.railway.app` (no trailing slash)
- `GOOGLE_PUBSUB_VERIFICATION_TOKEN` — any random string, e.g. the output
  of `openssl rand -hex 16` — this stops random internet traffic from
  triggering a fake "new mail" event on your webhook

**4.5 Grab the webhook URL from the boot logs.** With all three vars set,
redeploying prints:
```
Gmail Pub/Sub push endpoint (paste into your Cloud Pub/Sub push subscription)
url: 'https://inbrix-bot-production.up.railway.app/gmail/webhook?token=abc123...'
```
Copy that whole URL, token included.

**4.6 Create the push subscription:** back in Cloud Console → your
`gmail-notifications` topic → **Subscriptions** tab → **Create Subscription**
- Delivery type: **Push**
- Endpoint URL: paste the URL from 4.5
- Create it

**4.7 Confirm it's live.** The app auto-registers/renews the Gmail
`watch()` call on its own the moment `GOOGLE_PUBSUB_TOPIC` is set (see
`src/jobs/watchRenewal.js`) — no manual step needed — but you can double
check via Railway's shell:
```bash
npm run setup-watch
```
Should print an expiration date about 7 days out. The app renews this
automatically every day going forward, well before it expires.

**4.8 Test it.** Send yourself an email — it should land in Telegram
within a couple of seconds instead of waiting on the poll timer. Check
`/status` occasionally over the first week or two to confirm the daily
watch-renewal job is actually firing (`🔔 Push — last: Xm ago` should keep
updating) before trusting it fully unattended.

---

## How it works

- **Polling**: every `POLL_INTERVAL_MS` (default 45s), diffs Gmail's
  history feed since the last known `historyId` and forwards anything new.
- **Push**: Gmail notifies a Pub/Sub topic on new mail → Pub/Sub pushes to
  `/gmail/webhook` → the app runs the *exact same* history diff as polling.
- **No duplicates, ever**: both paths funnel through one Postgres table
  (`processed_messages`) with a unique constraint on Gmail's message id.
  Whichever path (poll or push) wins the insert is the one that forwards
  it — there's no coordination needed between them beyond that.
- **Everyone except you is ignored**: `src/lib/accessControl.js` drops
  every update that isn't from `TELEGRAM_OWNER_ID`, silently, before it
  reaches any handler.

## Commands

| Command | What it does |
|---|---|
| `/start` | Welcome screen, shows today's forwarded count |
| `/status` | Health check: polling/push last-seen, DB/Redis/Gmail status |
| `/pause`, `/resume` | Stop/restart forwarding |
| `/settings` | Ignored senders list; Filters/History/mode-switch coming soon |
| `/help` | Command reference |

On any forwarded email: **📎 View Full** (paginated, real hyperlinks),
**🔇 Ignore Sender** (blocks that address going forward).

## Troubleshooting

- **"Missing required env var" on boot** — check `.env` against
  `.env.example`; every required var must be non-empty.
- **`/status` shows Gmail token invalid** — your refresh token may have
  been revoked. Re-run `npm run get-refresh-token` locally and update
  `GOOGLE_REFRESH_TOKEN` in Railway.
- **Push never fires, only polling catches emails** — check the Pub/Sub
  subscription's push endpoint matches exactly what the boot logs printed,
  including the `?token=` suffix if you set
  `GOOGLE_PUBSUB_VERIFICATION_TOKEN`. Also confirm
  `gmail-api-push@system.gserviceaccount.com` has **Pub/Sub Publisher** on
  the topic (step 1.5) — this is the single most common misconfiguration.
- **Watchdog keeps alerting `poll_stalled`** — check `/status` for the
  actual `last_poll_error` message; it's usually an expired/revoked Gmail
  token or a Postgres/Redis connectivity issue.
