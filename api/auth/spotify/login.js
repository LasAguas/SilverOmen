import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SCOPES = [
  'user-library-modify',
  'user-follow-modify',
  'user-read-email',
  'user-read-private',
].join(' ');

export default async function handler(req, res) {
  const releaseId = Number(req.query.release_id);
  if (!releaseId) {
    res.status(400).send('Missing release_id');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: release, error } = await supabase
    .from('presave_releases')
    .select('id, active')
    .eq('id', releaseId)
    .maybeSingle();

  if (error || !release || release.active === false) {
    res.status(404).send('Release not found');
    return;
  }

  const state = crypto.randomBytes(24).toString('hex');
  const { error: stateErr } = await supabase
    .from('presave_oauth_states')
    .insert({ state, release_id: releaseId, dsp: 'spotify' });

  if (stateErr) {
    res.status(500).send('Could not start OAuth flow');
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: 'false',
  });

  res.redirect(302, `https://accounts.spotify.com/authorize?${params}`);
}
