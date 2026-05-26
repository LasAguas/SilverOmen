import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const provided =
    req.headers['x-cron-secret'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    res.status(401).send('Unauthorized');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const explicitId = body && body.release_id;

  const releaseQuery = supabase
    .from('presave_releases')
    .select('id, slug, spotify_uri, spotify_artist_id, youtube_video_id, fired_at, active, release_date');

  const { data: releases, error: relErr } = explicitId
    ? await releaseQuery.eq('id', explicitId)
    : await releaseQuery
        .eq('active', true)
        .is('fired_at', null)
        .lte('release_date', new Date().toISOString().slice(0, 10));

  if (relErr) {
    res.status(500).json({ error: relErr.message });
    return;
  }

  const summary = [];
  for (const release of releases || []) {
    const spotify = await processSpotify(supabase, release);
    const youtube = await processYouTube(supabase, release);
    summary.push({ release_id: release.id, slug: release.slug, spotify, youtube });

    await supabase
      .from('presave_releases')
      .update({ fired_at: new Date().toISOString() })
      .eq('id', release.id);
  }

  res.status(200).json({ releases_processed: summary.length, summary });
}

// ── Spotify ─────────────────────────────────────────────────────────────────

async function processSpotify(supabase, release) {
  const target = parseSpotifyUri(release.spotify_uri);
  if (!target) return { saved: 0, failed: 0, skipped: 0, note: 'no spotify_uri' };

  const { data: rows, error } = await supabase
    .from('presaves')
    .select('id, refresh_token')
    .eq('release_id', release.id)
    .eq('dsp', 'spotify')
    .eq('status', 'pending');
  if (error) return { saved: 0, failed: 0, skipped: 0, error: error.message };

  let saved = 0, failed = 0;
  for (const row of rows || []) {
    try {
      const accessToken = await refreshSpotifyToken(row.refresh_token);

      const saveRes = await fetch(
        target.kind === 'album'
          ? `https://api.spotify.com/v1/me/albums?ids=${target.id}`
          : `https://api.spotify.com/v1/me/tracks?ids=${target.id}`,
        { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!saveRes.ok) throw new Error(`save ${saveRes.status}`);

      if (release.spotify_artist_id) {
        await fetch(
          `https://api.spotify.com/v1/me/following?type=artist&ids=${release.spotify_artist_id}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }

      await markSaved(supabase, row.id);
      saved++;
    } catch (e) {
      await markFailed(supabase, row.id, e);
      failed++;
    }
  }
  return { saved, failed, skipped: 0 };
}

async function refreshSpotifyToken(refreshToken) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!r.ok) throw new Error(`refresh ${r.status}`);
  return (await r.json()).access_token;
}

function parseSpotifyUri(uri) {
  if (!uri) return null;
  const m = uri.match(/^spotify:(album|track):([A-Za-z0-9]+)$/);
  return m ? { kind: m[1], id: m[2] } : null;
}

// ── YouTube ─────────────────────────────────────────────────────────────────

async function processYouTube(supabase, release) {
  if (!release.youtube_video_id) return { saved: 0, failed: 0, skipped: 0, note: 'no youtube_video_id' };

  const { data: rows, error } = await supabase
    .from('presaves')
    .select('id, refresh_token')
    .eq('release_id', release.id)
    .eq('dsp', 'youtube')
    .eq('status', 'pending');
  if (error) return { saved: 0, failed: 0, skipped: 0, error: error.message };

  let saved = 0, failed = 0;
  for (const row of rows || []) {
    try {
      const accessToken = await refreshGoogleToken(row.refresh_token);

      // Like the music video — on YouTube Music this adds it to "Liked songs"
      const likeRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos/rate?id=${encodeURIComponent(release.youtube_video_id)}&rating=like`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!likeRes.ok && likeRes.status !== 204) throw new Error(`rate ${likeRes.status}`);

      // Subscribe to the channel (optional — only if YOUTUBE_CHANNEL_ID set)
      if (process.env.YOUTUBE_CHANNEL_ID) {
        const subRes = await fetch(
          'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              snippet: {
                resourceId: {
                  kind: 'youtube#channel',
                  channelId: process.env.YOUTUBE_CHANNEL_ID,
                },
              },
            }),
          }
        );
        // 409 = already subscribed; treat as success
        if (!subRes.ok && subRes.status !== 409) {
          // Don't fail the whole presave if only subscription failed — the like landed
        }
      }

      await markSaved(supabase, row.id);
      saved++;
    } catch (e) {
      await markFailed(supabase, row.id, e);
      failed++;
    }
  }
  return { saved, failed, skipped: 0 };
}

async function refreshGoogleToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`refresh ${r.status}`);
  return (await r.json()).access_token;
}

// ── Shared ──────────────────────────────────────────────────────────────────

async function markSaved(supabase, id) {
  await supabase
    .from('presaves')
    .update({ status: 'saved', saved_at: new Date().toISOString(), error_msg: null })
    .eq('id', id);
}

async function markFailed(supabase, id, err) {
  const msg = String(err.message || err);
  const revoked = /invalid_grant|400|401/.test(msg);
  await supabase
    .from('presaves')
    .update({ status: revoked ? 'revoked' : 'failed', error_msg: msg })
    .eq('id', id);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
