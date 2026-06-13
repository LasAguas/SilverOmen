# Pre-save System — Setup & Operation

A first-party Spotify pre-save flow for Silver Omen. Fan clicks the Spotify
button → OAuth handled by Vercel API routes → refresh token stored in Supabase
→ release-day worker calls Spotify's "Save to library" API on their behalf.

Apple Music + YouTube Music are scaffolded as disabled buttons; add them later.

---

## Architecture

The site is hosted on **Vercel**. All OAuth logic and the release-day worker run as Vercel serverless API routes — the Spotify client secret never leaves the server. **Supabase** is the database only: it stores releases, the refresh tokens, and OAuth state.

```
Fan → silveromen.com/presave                       (Vercel — static)
   → /api/auth/spotify/login                       (Vercel API — redirects to Spotify)
   → accounts.spotify.com                          (Spotify auth + consent)
   → /api/auth/spotify/callback                    (Vercel API — exchanges code,
                                                    writes refresh token to Supabase)
   → /presave-thanks                               (Vercel — static)

Release day:
   curl → /api/cron/presave-execute                (Vercel API — reads tokens
                                                    from Supabase, saves to libraries)
```

`vercel.json` has `cleanUrls: true`, so `/presave` and `/presave-thanks` work without the `.html` extension. Deploys happen automatically on `git push` to main.

---

## Files

| Path | What |
|---|---|
| `presave.html` | The release page. Contains `window.PRESAVE_RELEASE_ID`, set per campaign. |
| `presave-thanks.html` | Post-OAuth landing page. Reads `?status=ok\|denied\|error` from URL. |
| `api/auth/spotify/login.js` | Validates the release, generates a state token, redirects to Spotify. |
| `api/auth/spotify/callback.js` | Verifies state, exchanges code for tokens, writes to Supabase. |
| `api/cron/presave-execute.js` | Release-day worker. Manually triggered with `CRON_SECRET`. |
| `.env.local` | Local dev secrets — gitignored. Copy from `.env.local.example`. |
| Supabase tables | `presave_releases`, `presaves`, `presave_oauth_states` (RLS on, service-role-only). |

---

## One-time setup

### 1. Spotify Developer Dashboard — register redirect URIs

Open the Silver Omen / Las Aguas app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Settings → Redirect URIs. Add **both** of these (Spotify rejects any callback whose URI isn't pre-registered, exact match including scheme and trailing slash):

```
https://www.silveromen.com/api/auth/spotify/callback
http://localhost:3000/api/auth/spotify/callback
```

Add a preview-deploy URI too if you'll test OAuth on Vercel previews.

### 2. Local — `.env.local`

Copy the template and fill it in:

```bash
cp .env.local.example .env.local
```

| Variable | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | From Spotify Dashboard. |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Dashboard. **Never** prefix with `NEXT_PUBLIC_` or anything that would expose it to the browser — it's read only inside `api/*` routes, which run server-side. |
| `SPOTIFY_REDIRECT_URI` | `http://localhost:3000/api/auth/spotify/callback` for local. |
| `SITE_URL` | `http://localhost:3000` locally; where the callback redirects the fan after success. |
| `SUPABASE_URL` | `https://gtccctajvobfvhlonaot.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key. Server-only. |
| `CRON_SECRET` | Generate: `openssl rand -hex 32`. Required to call `/api/cron/presave-execute`. |

`.env.local` is gitignored. Restart `vercel dev` after editing.

### 3. Vercel — Project Settings → Environment Variables

Add the same keys for Production (and optionally Preview / Development) with deployed-domain values:

| Variable | Production value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Same as local. |
| `SPOTIFY_CLIENT_SECRET` | Same as local. |
| `SPOTIFY_REDIRECT_URI` | `https://www.silveromen.com/api/auth/spotify/callback` |
| `SITE_URL` | `https://www.silveromen.com` |
| `SUPABASE_URL` | Same as local. |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as local. |
| `CRON_SECRET` | Same as local. |

After adding or changing vars on Vercel, **trigger a new deploy** — env vars only apply to new builds.

### 4. Scopes requested

The OAuth flow requests:

- `user-library-modify` — to save the track/album
- `user-follow-modify` — to auto-follow Silver Omen on save
- `user-read-email` — for follow-up comms
- `user-read-private` — for country (analytics)

Fans see all four on the Spotify consent screen.

---

## Local development

`npx serve` can't run API routes — you need Vercel's local dev server, which simulates the production environment (loads `.env.local`, serves `api/*.js` as functions):

```bash
npm install -g vercel    # one-time
vercel link              # one-time, links this folder to the Vercel project
npm run dev              # alias for `vercel dev`, runs on http://localhost:3000
```

The plain static site (no OAuth needed) still works with `npm run serve` if you just want fast preview of HTML/CSS changes.

---

## Per-release workflow

### 1. Insert a row in `presave_releases`

```sql
INSERT INTO public.presave_releases (
  artist_id, slug, title, release_date,
  cover_url, spotify_uri, spotify_artist_id
) VALUES (
  11,
  'new-single-slug',                       -- url-safe identifier
  'New Single Title',
  '2026-07-15',                            -- release date (UTC)
  'https://www.silveromen.com/assets/images/Music/cover.webp',
  'spotify:album:XXXXXXXXXXXXXXXXXXXXXX',  -- or spotify:track:...
  '04PVbCwPl3UEsNnVJUZbUl'                 -- Silver Omen Spotify artist id (for auto-follow)
);
```

Note the `id` it returns.

### 2. Update `presave.html`

- Set `window.PRESAVE_RELEASE_ID` to the row id from step 1.
- Swap the cover image (`.links-cover img` and `.links-bg-image`).
- Update the title + date line: `<p class="links-release-title"><strong>Title</strong> &middot; 15 July 2026</p>`
- Update OG/Twitter meta tags.

Clone `presave.html` to `presave-<slug>.html` to run multiple campaigns in parallel — clean URLs serve it at `/presave-<slug>`.

### 3. Deploy + promote

`git push` — Vercel auto-deploys. Share `https://www.silveromen.com/presave`. Fan clicks Spotify → OAuth → row appears in `presaves` with `status = 'pending'`.

### 4. Release day — fire the saves

Manual trigger (you said no auto-cron):

```bash
# Fire one specific release
curl -X POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"release_id": 1}' \
  https://www.silveromen.com/api/cron/presave-execute

# Or fire every release whose date has arrived and hasn't fired yet
curl -X POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  https://www.silveromen.com/api/cron/presave-execute
```

Response: `{ releases_processed, summary: [{ release_id, slug, saved, failed, skipped }] }`.

After the function completes, the release row gets `fired_at` set — re-runs are no-ops.

---

## Monitoring

Quick stats per release:

```sql
SELECT
  r.slug, r.title, r.release_date, r.fired_at,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE p.status = 'pending')          AS pending,
  COUNT(*) FILTER (WHERE p.status = 'saved')            AS saved,
  COUNT(*) FILTER (WHERE p.status = 'failed')           AS failed,
  COUNT(*) FILTER (WHERE p.status = 'revoked')          AS revoked
FROM presave_releases r
LEFT JOIN presaves p ON p.release_id = r.id AND p.dsp = 'spotify'
GROUP BY r.id
ORDER BY r.release_date DESC;
```

Failed reasons (debugging):

```sql
SELECT status, error_msg, COUNT(*)
FROM presaves
WHERE release_id = 1 AND status IN ('failed', 'revoked')
GROUP BY status, error_msg;
```

Vercel logs: Project → Deployments → click the deployment → Functions tab. Errors in `api/*` show up there.

---

## Rules to follow

- `SPOTIFY_CLIENT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. Never expose with any `NEXT_PUBLIC_*` / `VITE_*` / similar browser-bundled prefix.
- `.env.local` stays out of git (covered by `.gitignore`).
- After editing env vars on Vercel, **redeploy** — they only apply to new builds.
- The redirect URI string must match exactly across three places: `.env.local`, Vercel env vars, and the Spotify dashboard Redirect URIs list. Trailing slash, scheme, host — all must match.

---

## Adding Apple Music later

Apple Music requires:

1. Apple Developer Program membership ($99/yr).
2. A MusicKit private key (`.p8`) generated in the Apple Developer console.
3. A signed developer JWT (server-side) used to bootstrap MusicKit JS on the page.
4. The fan signs in via MusicKit JS in the browser → returns a `Music-User-Token`.
5. POST that token to a new `api/auth/apple/callback.js` → store in `presaves`.
6. Extend `presave-execute` to call `PUT /v1/me/library?ids[songs]=...` with the stored user token (no refresh needed — Apple's user tokens last 6 months).

The data model is already DSP-agnostic (`presaves.dsp` enum-checked), so this slots in cleanly.

## YouTube Music

Code is built and wired (`api/auth/youtube/login.js`, `callback.js`, plus the YouTube branch in `presave-execute.js`). The button in `presave.html` stays **disabled** until Google verifies the OAuth app, because unverified apps show a scary "this app isn't verified" warning to fans and are capped at 100 lifetime users.

YouTube Music has no real "save song to library" API. The closest equivalent (what this presave does):
- **Like** the music video — on YouTube Music this adds the song to the fan's "Liked songs" playlist and feeds their personalised mix.
- **Subscribe** the fan to the Silver Omen channel — only fires if `YOUTUBE_CHANNEL_ID` env var is set. Failure here doesn't fail the presave; the like is what matters.

### Setup (one-time)

1. **Google Cloud Console** → create or open a project → enable **YouTube Data API v3** (APIs & Services → Library).
2. APIs & Services → OAuth consent screen → configure (External user type, app name, support email, scopes: add `youtube.force-ssl`, `openid`, `email`, `profile`). Submit for verification when ready.
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application. Add Authorized redirect URIs:
   - `https://www.silveromen.com/api/auth/youtube/callback`
   - `http://localhost:3000/api/auth/youtube/callback`
4. Copy the Client ID + Client Secret into `.env.local` AND Vercel env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).
5. Find the Silver Omen channel ID in YouTube Studio → Settings → Channel → Advanced settings (starts with `UC...`). Add it as `YOUTUBE_CHANNEL_ID` in both env locations.

### Per-release

Set `youtube_video_id` on the `presave_releases` row (the 11-character ID from the music video URL, e.g. `dQw4w9WgXcQ`). Without it, the YouTube branch of `presave-execute` skips that release. Can be added after the release row is inserted — doesn't need to be set at presave-page-launch time, only before release day.

### Enabling the button

Once Google has verified the app, in `presave.html`: comment out the `<button disabled>` for YouTube and uncomment the `<a id="presave-youtube-btn">` block right below it. The wiring script already populates its href.

## Adding Apple Music later

Apple Music requires:

1. Apple Developer Program membership ($99/yr).
2. A MusicKit private key (`.p8`) generated in the Apple Developer console.
3. A signed developer JWT (server-side) used to bootstrap MusicKit JS on the page.
4. The fan signs in via MusicKit JS in the browser → returns a `Music-User-Token`.
5. POST that token to a new `api/auth/apple/callback.js` → store in `presaves`.
6. Extend `presave-execute` to call `PUT /v1/me/library?ids[songs]=...` with the stored user token (no refresh needed — Apple's user tokens last 6 months).

The data model is already DSP-agnostic (`presaves.dsp` text column), so this slots in cleanly.
