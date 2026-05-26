import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.force-ssl',
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
    .select('id, active, youtube_video_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (error || !release || release.active === false) {
    res.status(404).send('Release not found');
    return;
  }

  if (!release.youtube_video_id) {
    res.status(400).send('Release has no youtube_video_id set');
    return;
  }

  const state = crypto.randomBytes(24).toString('hex');
  const { error: stateErr } = await supabase
    .from('presave_oauth_states')
    .insert({ state, release_id: releaseId, dsp: 'youtube' });

  if (stateErr) {
    res.status(500).send('Could not start OAuth flow');
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    scope: SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
