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
- Add your own Gmail address as a **test user** (since this app stays
  unverified — it's just for you, verification isn't worth pursuing)
- Scope: `.../auth/gmail.readonly` is all v1 needs

### 1.4 OAuth Client credentials
**APIs & Services → Credentials → Create Credentials → OAuth client ID**
- Application type: **Web application**
- Authorized redirect URIs: add `http://localhost:53682/oauth2callback`
  (matches the default in `.env.example` — change both together if you
  want a different port)
- Save the **Client ID** and **Client Secret** — these are your
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

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

### 2-alt. Get it via a deployed Railway service instead (no local machine needed)

If running things locally isn't convenient, deploy
`scripts/get-refresh-token-prod.js` as its **own temporary Railway service**
instead — it generates the token through a live public URL rather than
`localhost`.

**Google Cloud Console — add these to your OAuth client, specifically for
this helper's URL:**

1. **APIs & Services → Credentials → your OAuth Client**
2. **Authorized JavaScript origins** → Add URI:
   ```
   https://inbrix-oauth-helper.up.railway.app
   ```
   (your helper service's actual Railway URL — no path, no trailing slash)
3. **Authorized redirect URIs** → Add URI:
   ```
   https://inbrix-oauth-helper.up.railway.app/oauth2callback
   ```
   (same domain, must end in exactly `/oauth2callback` to match the script)
4. Save.

**Deploy the helper:**
1. New Railway service, same repo, but override the **start command** to:
   ```
   node scripts/get-refresh-token-prod.js
   ```
2. Env vars on **this helper service only**: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` set to the exact
   `https://.../oauth2callback` URL from step 3 above. It needs nothing
   else — no Postgres, no Redis, no Telegram token.
3. Deploy, then visit the service's root URL in your browser. Approve
   access → it prints your `GOOGLE_REFRESH_TOKEN` on the page (and in logs).
4. Copy that value into your **main bot service's** env vars (not this
   helper's), then redeploy the main service.
5. **Tear this helper service down** — remove its domain or delete the
   service entirely. It's a live credential-issuing endpoint; it has no
   reason to stay online once you have the token.

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
