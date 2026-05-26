import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state, error: googleErr } = req.query;
  const siteUrl = process.env.SITE_URL || 'https://www.silveromen.com';

  if (googleErr) {
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
    .select('release_id, consumed_at')
    .eq('state', state)
    .eq('dsp', 'youtube')
    .maybeSingle();

  if (stateErr || !stateRow || stateRow.consumed_at) {
    res.status(400).send('Invalid or expired state');
    return;
  }

  await supabase
    .from('presave_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('state', state);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    res.redirect(302, `${siteUrl}/presave-thanks?status=error`);
    return;
  }

  const tokens = await tokenRes.json();

  // Google profile from userinfo endpoint (includes sub, email, name)
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  if (!profile.sub) {
    res.redirect(302, `${siteUrl}/presave-thanks?status=error`);
    return;
  }

  const { error: upsertErr } = await supabase
    .from('presaves')
    .upsert(
      {
        release_id: stateRow.release_id,
        dsp: 'youtube',
        dsp_user_id: profile.sub,
        email: profile.email || null,
        display_name: profile.name || null,
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
