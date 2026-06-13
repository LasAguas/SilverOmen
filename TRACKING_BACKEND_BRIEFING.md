# Website Tracking Backend — Briefing for Dashboard UI

This document describes a first-party analytics system built for Silver Omen's website (silveromen.com) and connected to the Las Aguas Supabase project. Use it to build a UI that surfaces the tracking data inside the existing Las Aguas dashboard.

---

## Supabase project

- **Project ID:** `gtccctajvobfvhlonaot`
- **URL:** `https://gtccctajvobfvhlonaot.supabase.co`
- **Silver Omen artist_id:** `11` (foreign key into the existing `artists` table)
- **Region:** eu-central-1 (Frankfurt)

The two new tables (`website_sessions`, `website_events`) sit in the `public` schema alongside all existing Las Aguas tables. They follow the same `artist_id` FK pattern used everywhere else in the schema.

---

## How the system works (end-to-end)

1. A fan visits any page on silveromen.com
2. `tracker.js` (loaded on every page) fires a beacon to the Supabase Edge Function `track-event`
3. The Edge Function reads geo from Vercel headers (IP never stored), parses the User-Agent into device/OS/browser (UA never stored), then writes one row to `website_sessions` and one row to `website_events`
4. Subsequent events in the same tab (link clicks, scroll milestones, conversions) add more rows to `website_events` and increment `event_count` on the session row
5. When the tab closes, a final `_session_end` beacon patches `duration_seconds` on the session

---

## Table: `website_sessions`

One row per browser tab visit. Created on the first event of a session, updated on each subsequent event.

```
id                UUID        primary key
artist_id         INTEGER     FK to artists.id
session_token     TEXT        anonymous UUID from sessionStorage (not a cookie)

-- Traffic source (how did they arrive?)
entry_page        TEXT        first page path, e.g. '/links', '/index'
referrer_url      TEXT        document.referrer (raw, truncated to 500 chars)
referrer_source   TEXT        parsed source: 'instagram'|'facebook'|'tiktok'|'spotify'
                              |'apple_music'|'youtube'|'google'|'bing'|'mailchimp'
                              |'bandcamp'|'soundcloud'|'tidal'|'deezer'|'direct'|'other'
                              or the raw hostname for unknown referrers
referrer_medium   TEXT        parsed medium: 'social'|'search'|'email'|'streaming'
                              |'paid'|'direct'|'referral'
utm_source        TEXT        ?utm_source from URL
utm_medium        TEXT        ?utm_medium from URL
utm_campaign      TEXT        ?utm_campaign from URL
utm_content       TEXT        ?utm_content from URL
utm_term          TEXT        ?utm_term from URL

-- Geo (derived at Vercel edge — IP never stored)
country_code      CHAR(2)     ISO 3166-1 alpha-2, e.g. 'GB', 'DE', 'US'
country_name      TEXT        human-readable, e.g. 'United Kingdom'
city              TEXT        city name from Vercel geo headers

-- Device (derived from User-Agent — UA never stored)
device_type       TEXT        'mobile'|'tablet'|'desktop'|'unknown'
os_family         TEXT        'iOS'|'Android'|'Windows'|'macOS'|'Linux'|'Other'
browser_family    TEXT        'Chrome'|'Safari'|'Firefox'|'Edge'|'Samsung'|'Opera'|'Other'
screen_width_px   SMALLINT    window.screen.width
language          TEXT        navigator.language, e.g. 'en-GB', 'de-DE'

-- Consent
consent_given     BOOLEAN     true once fan clicks Accept on the cookie banner
                              (Tier-2 tracking: scroll depth, time-on-page, returning visitor)

-- Session lifecycle
started_at        TIMESTAMPTZ when the session was created
last_seen_at      TIMESTAMPTZ updated on every event
duration_seconds  INTEGER     total time on site (patched when tab closes; may be null if tab was force-closed)
page_count        SMALLINT    number of pages visited in this session
event_count       SMALLINT    total events fired in this session

-- Attribution
is_returning      BOOLEAN     true if the fan has visited before (detected via first-party cookie,
                              only set when consent_given = true)
```

---

## Table: `website_events`

One row per event. Every event has a session FK and artist FK.

```
id                    UUID        primary key
session_id            UUID        FK to website_sessions.id (CASCADE DELETE)
artist_id             INTEGER     FK to artists.id

event_type            TEXT        see full list below
page_slug             TEXT        which page fired the event:
                                  'index'|'links'|'about'|'music'|'booking'|'contact'
                                  |'fill-your-prescription'|'index-prescription'
                                  |'index-scrollable'|'index-torso'

-- Link / click detail (populated for click_* events)
link_label            TEXT        human label: 'Spotify'|'Apple Music'|'Tidal'|'Merch'|etc.
link_destination      TEXT        destination URL
link_platform         TEXT        see platform list below
link_category         TEXT        'streaming'|'merch'|'tickets'|'social'|'newsletter'
                                  |'subscription'|'content'|'navigation'

-- Conversion detail (populated for conversion_* events)
product_id            TEXT        external product/SKU identifier
product_name          TEXT        e.g. 'T-Shirt', 'GA Ticket', 'Fan Subscription'
product_category      TEXT        'apparel'|'ticket_ga'|'ticket_vip'|'digital'|'subscription'
quantity              SMALLINT
value_cents           INTEGER     sale value in smallest currency unit
currency              CHAR(3)     defaults to 'EUR'

-- Engagement detail (populated for scroll_milestone and engagement events)
scroll_depth_pct      SMALLINT    0-100 (fired at 25, 50, 75, 90)
time_on_page_seconds  INTEGER     (fired at 15, 30, 60, 120 seconds)

-- Extensible
properties            JSONB       catch-all for future event data

occurred_at           TIMESTAMPTZ when the event happened
```

### All `event_type` values

| event_type | When it fires |
|---|---|
| `pageview` | On every page load |
| `click_streaming` | Click on Spotify, Apple Music, Tidal, Deezer, YouTube Music, Bandcamp, YouTube |
| `click_merch` | Click on a merch store link |
| `click_tickets` | Click on a ticket purchase link |
| `click_social` | Click on a social profile icon (Instagram, Facebook, TikTok, etc.) |
| `click_newsletter` | Click on a newsletter signup CTA |
| `click_subscription` | Click on a paid subscription / fan club link |
| `click_other` | Any other tracked link (interview, navigation, etc.) |
| `conversion_newsletter` | Fan submitted the Mailchimp newsletter signup form |
| `conversion_merch` | Fan completed a merch purchase (fired client-side on success) |
| `conversion_ticket` | Fan completed a ticket purchase |
| `conversion_subscription` | Fan completed a subscription signup |
| `scroll_milestone` | Fan scrolled to 25%, 50%, 75%, or 90% of the page (consent required) |
| `engagement` | Fan spent 15s, 30s, 60s, or 120s on the page (consent required) |
| `consent_granted` | Fan clicked Accept on the cookie banner |
| `_session_end` | Internal — tab was closed; used to patch `duration_seconds`. **Filter this out** of event counts in the UI. |

### All `link_platform` values

`spotify` · `apple_music` · `itunes` · `youtube` · `youtube_music` · `tidal` · `deezer` · `amazon_music` · `soundcloud` · `bandcamp` · `instagram` · `tiktok` · `facebook` · `twitter` · `shopify` · `mailchimp` · `patreon` · `multi` (expand button that reveals sub-links) · `silveromen` (navigation back to own site)

---

## RLS note — important for the dashboard

Both tables have Row Level Security **enabled** but no SELECT policies have been defined. This means:

- **The dashboard must read these tables using the service role key** (which it likely already uses for other admin tables). Anon/user-scoped reads will return zero rows.
- If you want user-scoped access (e.g. for an artist to see their own stats), add a policy: `CREATE POLICY "artist can read own sessions" ON website_sessions FOR SELECT USING (artist_id = current_user_artist_id());`
- Inserts are handled exclusively by the Edge Function (service role), so no INSERT policy is needed.

---

## Useful queries for the UI

### Sessions overview (last 30 days)
```sql
SELECT
  COUNT(*)                                          AS total_sessions,
  COUNT(DISTINCT session_token)                     AS unique_visitors,
  ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL)) AS avg_duration_secs,
  ROUND(AVG(event_count))                           AS avg_events_per_session,
  COUNT(*) FILTER (WHERE is_returning = true)       AS returning_visitors,
  COUNT(*) FILTER (WHERE consent_given = true)      AS consented_sessions
FROM website_sessions
WHERE artist_id = 11
  AND started_at > now() - interval '30 days';
```

### Daily sessions time-series
```sql
SELECT
  date_trunc('day', started_at) AS day,
  COUNT(*)                       AS sessions,
  COUNT(DISTINCT session_token)  AS unique_visitors
FROM website_sessions
WHERE artist_id = 11
  AND started_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

### Traffic source breakdown
```sql
SELECT
  referrer_source,
  referrer_medium,
  COUNT(*)                                                          AS sessions,
  COUNT(e.id) FILTER (WHERE e.event_type LIKE 'click_%'
                        AND e.event_type != '_session_end')        AS link_clicks,
  COUNT(e.id) FILTER (WHERE e.event_type LIKE 'conversion_%')      AS conversions
FROM website_sessions s
LEFT JOIN website_events e ON e.session_id = s.id
WHERE s.artist_id = 11
  AND s.started_at > now() - interval '30 days'
GROUP BY referrer_source, referrer_medium
ORDER BY sessions DESC;
```

### UTM campaign performance
```sql
SELECT
  utm_campaign,
  utm_source,
  utm_medium,
  COUNT(DISTINCT s.id)                                               AS sessions,
  COUNT(e.id) FILTER (WHERE e.event_type LIKE 'click_streaming')    AS streaming_clicks,
  COUNT(e.id) FILTER (WHERE e.event_type = 'click_merch')           AS merch_clicks,
  COUNT(e.id) FILTER (WHERE e.event_type = 'click_tickets')         AS ticket_clicks,
  COUNT(e.id) FILTER (WHERE e.event_type LIKE 'conversion_%')       AS conversions
FROM website_sessions s
LEFT JOIN website_events e ON e.session_id = s.id
WHERE s.artist_id = 11
  AND s.utm_campaign IS NOT NULL
  AND s.started_at > now() - interval '30 days'
GROUP BY utm_campaign, utm_source, utm_medium
ORDER BY sessions DESC;
```

### Streaming platform click breakdown
```sql
SELECT
  link_platform,
  link_label,
  COUNT(*) AS clicks
FROM website_events
WHERE artist_id = 11
  AND event_type = 'click_streaming'
  AND link_platform != 'multi'   -- exclude the expand-button click
  AND occurred_at > now() - interval '30 days'
GROUP BY link_platform, link_label
ORDER BY clicks DESC;
```

### Full funnel (sessions → clicks → conversions)
```sql
WITH funnel AS (
  SELECT
    COUNT(DISTINCT s.id)                                              AS sessions,
    COUNT(DISTINCT s.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM website_events e WHERE e.session_id = s.id
          AND e.event_type LIKE 'click_%' AND e.event_type != '_session_end'
      )
    )                                                                 AS sessions_with_click,
    COUNT(DISTINCT s.id) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM website_events e WHERE e.session_id = s.id
          AND e.event_type LIKE 'conversion_%'
      )
    )                                                                 AS sessions_with_conversion
  FROM website_sessions s
  WHERE s.artist_id = 11
    AND s.started_at > now() - interval '30 days'
)
SELECT
  sessions,
  sessions_with_click,
  sessions_with_conversion,
  ROUND(sessions_with_click::numeric      / NULLIF(sessions, 0) * 100, 1) AS click_rate_pct,
  ROUND(sessions_with_conversion::numeric / NULLIF(sessions, 0) * 100, 1) AS conversion_rate_pct
FROM funnel;
```

### Device breakdown
```sql
SELECT
  device_type,
  os_family,
  COUNT(*) AS sessions,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM website_sessions
WHERE artist_id = 11
  AND started_at > now() - interval '30 days'
GROUP BY device_type, os_family
ORDER BY sessions DESC;
```

### Top countries
```sql
SELECT
  country_code,
  country_name,
  COUNT(*) AS sessions
FROM website_sessions
WHERE artist_id = 11
  AND started_at > now() - interval '30 days'
  AND country_code IS NOT NULL
GROUP BY country_code, country_name
ORDER BY sessions DESC
LIMIT 10;
```

### Page popularity
```sql
SELECT
  page_slug,
  COUNT(*) AS pageviews,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM website_events
WHERE artist_id = 11
  AND event_type = 'pageview'
  AND occurred_at > now() - interval '30 days'
GROUP BY page_slug
ORDER BY pageviews DESC;
```

### Scroll depth distribution (consent sessions only)
```sql
SELECT
  scroll_depth_pct,
  COUNT(DISTINCT session_id) AS sessions_reached
FROM website_events
WHERE artist_id = 11
  AND event_type = 'scroll_milestone'
  AND occurred_at > now() - interval '30 days'
GROUP BY scroll_depth_pct
ORDER BY scroll_depth_pct;
```

---

## Suggested UI structure

The tracking data is primarily surfaced on a per-artist page (artist_id = 11 for Silver Omen). Suggested layout:

### Tab or section: "Website Analytics"

**Row 1 — KPI chips (last 30 days, with 7-day toggle)**
- Total sessions
- Unique visitors
- Avg. session duration
- Click-through rate (sessions with ≥1 link click / total sessions)
- Conversions (any conversion_* event)

**Row 2 — Two columns**
- Left: Sessions over time (line chart, daily, last 30 days)
- Right: Traffic sources (horizontal bar chart, referrer_source)

**Row 3 — Smart link performance**
- Bar chart: streaming platform clicks ranked (Spotify, Apple Music, Tidal, etc.)
- Small table: all link types with click counts (streaming / merch / tickets / social / newsletter)

**Row 4 — Audience**
- Device type donut (mobile / tablet / desktop)
- Top 5 countries table (flag + country_name + session count + %)
- Language breakdown (top 5)

**Row 5 — Campaign breakdown (only if UTM data exists)**
- Table: utm_campaign → sessions, streaming clicks, merch clicks, ticket clicks, conversions
- Filter by date range

**Row 6 — Funnel visualisation**
- Sessions → Sessions with a link click → Sessions with a conversion
- Show drop-off percentages at each step

---

## Date range filtering

All queries should support a `date_range` parameter. Recommended presets: Last 7 days / Last 30 days / Last 90 days / Custom. Filter on `website_sessions.started_at` (not `website_events.occurred_at`) to keep session-level aggregations consistent.

---

## Existing related tables

The tracking tables are designed to complement (not replace) existing data:

- `artist_platform_stats` — already has `pixel_page_views`, `pixel_purchases`, `pixel_purchase_value` as aggregate daily snapshots from the Meta Pixel. The new tables provide the raw event-level equivalent with far more detail.
- `event_orders` — confirmed ticket and merch purchases with Stripe data. When a `conversion_ticket` or `conversion_merch` event fires in `website_events`, it represents the intent/click-through; the actual confirmed sale lives in `event_orders`. These can be correlated by approximate timestamp.
- `artists` — `artist_id = 11` is Silver Omen. The tracking tables are multi-artist capable; the same tables will be used when other artists' sites are instrumented.

---

## What is NOT tracked (by design, for GDPR)

- IP addresses — never stored
- Raw User-Agent strings — never stored (only the parsed device_type / os_family / browser_family)
- Email addresses or names
- Cross-session identity (unless the fan accepted cookies — even then, only a first-party boolean flag `is_returning`)
- Individual fan profiles

The data is anonymised at the Edge Function level before it ever reaches the database.
