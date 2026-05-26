import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state, error: spotifyErr } = req.query;
  const siteUrl = process.env.SITE_URL || 'https://www.silveromen.com';

  if (spotifyErr) {
    res.redirect(302, `${siteUrl}/presave-thanks?status=denied`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('Missing code or state');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: stateRow, error: stateErr } = await supabase
    .from('presave_oauth_states')
    .select('release_id, created_at, consumed_at')
    .eq('state', state)
    .maybeSingle();

  if (stateErr || !stateRow || stateRow.consumed_at) {
    res.status(400).send('Invalid or expired state');
    return;
  }

  await supabase
    .from('presave_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', state);

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    res.redirect(302, `${siteUrl}/presave-thanks?status=error`);
    return;
  }

  const tokens = await tokenRes.json();

  const profileRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  const { error: upsertErr } = await supabase
    .from('presaves')
    .upsert(
      {
        release_id: stateRow.release_id,
        dsp: 'spotify',
        dsp_user_id: profile.id || null,
        email: profile.email || null,
        country: profile.country || null,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || null,
        status: 'pending',
      },
      { onConflict: 'release_id,dsp,dsp_user_id' }
    );

  if (upsertErr) {
    res.redirect(302, `${siteUrl}/presave-thanks?status=error`);
    return;
  }

  res.redirect(302, `${siteUrl}/presave-thanks?status=ok`);
}
