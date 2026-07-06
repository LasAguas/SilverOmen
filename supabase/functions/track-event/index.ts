import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ARTIST_IDS = new Set([5, 11]); // Lemon Eye, Silver Omen — add more as needed
const MAX_EVENTS_PER_SESSION = 200;       // guard against runaway beacons

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── User-Agent parsing ──────────────────────────────────────────────────────

function parseUA(ua: string): { device_type: string; os_family: string; browser_family: string } {
  let device_type = 'desktop';
  if (/mobile|android(?!.*tablet)|iphone|ipod|blackberry|windows phone/i.test(ua)) {
    device_type = 'mobile';
  } else if (/tablet|ipad|kindle|silk|playbook/i.test(ua)) {
    device_type = 'tablet';
  }

  let os_family = 'Other';
  if (/iphone|ipad|ipod/i.test(ua))        os_family = 'iOS';
  else if (/android/i.test(ua))            os_family = 'Android';
  else if (/windows/i.test(ua))            os_family = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os_family = 'macOS';
  else if (/linux/i.test(ua))              os_family = 'Linux';

  let browser_family = 'Other';
  if (/edg\//i.test(ua))                   browser_family = 'Edge';
  else if (/samsungbrowser/i.test(ua))     browser_family = 'Samsung';
  else if (/firefox|fxios/i.test(ua))      browser_family = 'Firefox';
  else if (/opr\//i.test(ua))              browser_family = 'Opera';
  else if (/chrome|crios/i.test(ua))       browser_family = 'Chrome';
  else if (/safari/i.test(ua))             browser_family = 'Safari';

  return { device_type, os_family, browser_family };
}

// ── Referrer parsing ────────────────────────────────────────────────────────

function parseReferrer(referrer: string | null): { referrer_source: string; referrer_medium: string } {
  if (!referrer) return { referrer_source: 'direct', referrer_medium: 'direct' };
  try {
    const hostname = new URL(referrer).hostname.replace(/^www\./, '');
    const map: Record<string, [string, string]> = {
      'instagram.com':    ['instagram',  'social'],
      'facebook.com':     ['facebook',   'social'],
      'fb.com':           ['facebook',   'social'],
      'tiktok.com':       ['tiktok',     'social'],
      'twitter.com':      ['twitter',    'social'],
      'x.com':            ['twitter',    'social'],
      'youtube.com':      ['youtube',    'social'],
      'youtu.be':         ['youtube',    'social'],
      'spotify.com':      ['spotify',    'streaming'],
      'music.apple.com':  ['apple_music','streaming'],
      'tidal.com':        ['tidal',      'streaming'],
      'deezer.com':       ['deezer',     'streaming'],
      'soundcloud.com':   ['soundcloud', 'streaming'],
      'bandcamp.com':     ['bandcamp',   'streaming'],
      'google.com':       ['google',     'search'],
      'bing.com':         ['bing',       'search'],
      'mailchi.mp':       ['mailchimp',  'email'],
      'list-manage.com':  ['mailchimp',  'email'],
    };
    for (const [domain, [source, medium]] of Object.entries(map)) {
      if (hostname.endsWith(domain)) return { referrer_source: source, referrer_medium: medium };
    }
    return { referrer_source: hostname, referrer_medium: 'referral' };
  } catch {
    return { referrer_source: 'other', referrer_medium: 'referral' };
  }
}

// ── Country name lookup (compact) ───────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  GB:'United Kingdom', DE:'Germany', US:'United States', FR:'France', NL:'Netherlands',
  IE:'Ireland', AU:'Australia', CA:'Canada', SE:'Sweden', NO:'Norway', DK:'Denmark',
  BE:'Belgium', AT:'Austria', CH:'Switzerland', ES:'Spain', IT:'Italy', PL:'Poland',
  PT:'Portugal', FI:'Finland', ZA:'South Africa', NZ:'New Zealand', BR:'Brazil',
  MX:'Mexico', JP:'Japan', KR:'South Korea', IN:'India', SG:'Singapore',
};

// ── Geo fallback via IP lookup ──────────────────────────────────────────────
// Supabase stopped forwarding the Cloudflare `cf-ipcountry` header to edge
// functions (geo went blank on 2026-06-02), so when no proxy geo header is
// present we resolve the country from the client IP. The IP is read transiently
// for the lookup and never stored.

function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  return real ? real.trim() : null;
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  ) {
    return false;
  }
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
  return true;
}

async function lookupGeo(
  ip: string,
): Promise<{ country_code: string | null; country_name: string | null; city: string | null }> {
  const empty = { country_code: null, country_name: null, city: null };
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,country,city`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!res.ok) return empty;
    const data = await res.json();
    if (!data || data.success === false) return empty;
    return {
      country_code: typeof data.country_code === 'string' ? data.country_code.slice(0, 2).toUpperCase() : null,
      country_name: typeof data.country === 'string' ? data.country.slice(0, 100) : null,
      city:         typeof data.city === 'string' ? data.city.slice(0, 100) : null,
    };
  } catch {
    return empty;
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const artist_id = Number(body.artist_id);
  if (!ALLOWED_ARTIST_IDS.has(artist_id)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown artist' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const session_token = String(body.session_token ?? '').slice(0, 64);
  if (!session_token) {
    return new Response(JSON.stringify({ ok: false, error: 'missing session_token' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Geo: prefer Vercel/Cloudflare edge headers when present; otherwise fall back
  // to an IP lookup when a new session is created (below). IP is never stored.
  let country_code = (
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('cf-ipcountry') ||
    null
  )?.slice(0, 2).toUpperCase() || null;

  let city = (
    req.headers.get('x-vercel-ip-city') ||
    req.headers.get('cf-ipcity') ||
    null
  )?.slice(0, 100) || null;

  let country_name = country_code ? (COUNTRY_NAMES[country_code] ?? country_code) : null;

  // Device from User-Agent (raw UA discarded after parsing)
  const rawUA = req.headers.get('user-agent') ?? '';
  const { device_type, os_family, browser_family } = parseUA(rawUA);

  // Referrer
  const { referrer_source, referrer_medium } = parseReferrer(
    typeof body.referrer_url === 'string' ? body.referrer_url : null
  );

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── Upsert session ──────────────────────────────────────────────────────
  // Try to find an existing session for this token first
  const { data: existingSession } = await supabase
    .from('website_sessions')
    .select('id, event_count')
    .eq('session_token', session_token)
    .eq('artist_id', artist_id)
    .maybeSingle();

  // Rate-limit check
  if (existingSession && existingSession.event_count >= MAX_EVENTS_PER_SESSION) {
    return new Response(JSON.stringify({ ok: true, rate_limited: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let session_id: string;

  if (existingSession) {
    session_id = existingSession.id;
    // Patch last_seen_at, duration, event_count
    await supabase
      .from('website_sessions')
      .update({
        last_seen_at: new Date().toISOString(),
        ...(typeof body.duration_seconds === 'number' ? { duration_seconds: body.duration_seconds } : {}),
        event_count: (existingSession.event_count ?? 0) + 1,
        ...(body.consent_given === true ? { consent_given: true } : {}),
      })
      .eq('id', session_id);
  } else {
    // No proxy geo header (current Supabase default) — derive geo from the
    // client IP. Only done on session creation, so at most one lookup per visit.
    if (!country_code) {
      const ip = getClientIp(req);
      if (ip && isPublicIp(ip)) {
        const geo = await lookupGeo(ip);
        country_code = geo.country_code;
        country_name = geo.country_name ?? (geo.country_code ? (COUNTRY_NAMES[geo.country_code] ?? geo.country_code) : null);
        if (!city) city = geo.city;
      }
    }

    // Create new session
    const { data: newSession, error: sessionError } = await supabase
      .from('website_sessions')
      .insert({
        artist_id,
        session_token,
        entry_page:       typeof body.page_slug === 'string' ? `/${body.page_slug}` : '/',
        referrer_url:     typeof body.referrer_url === 'string' ? body.referrer_url.slice(0, 500) : null,
        referrer_source,
        referrer_medium,
        utm_source:       typeof body.utm_source === 'string'   ? body.utm_source.slice(0, 100)   : null,
        utm_medium:       typeof body.utm_medium === 'string'   ? body.utm_medium.slice(0, 100)   : null,
        utm_campaign:     typeof body.utm_campaign === 'string' ? body.utm_campaign.slice(0, 100) : null,
        utm_content:      typeof body.utm_content === 'string'  ? body.utm_content.slice(0, 100)  : null,
        utm_term:         typeof body.utm_term === 'string'     ? body.utm_term.slice(0, 100)     : null,
        country_code,
        country_name,
        city,
        device_type,
        os_family,
        browser_family,
        screen_width_px:  typeof body.screen_width_px === 'number' ? body.screen_width_px : null,
        language:         typeof body.language === 'string' ? body.language.slice(0, 20) : null,
        consent_given:    body.consent_given === true,
        is_returning:     body.is_returning === true,
        event_count:      1,
      })
      .select('id')
      .single();

    if (sessionError || !newSession) {
      console.error('Session insert error:', sessionError);
      return new Response(JSON.stringify({ ok: false, error: 'session_error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    session_id = newSession.id;
  }

  // ── Insert event ────────────────────────────────────────────────────────
  const event_type = String(body.event_type ?? 'pageview');
  const page_slug  = String(body.page_slug ?? 'unknown').slice(0, 100);

  const { error: eventError } = await supabase
    .from('website_events')
    .insert({
      session_id,
      artist_id,
      event_type,
      page_slug,
      link_label:            typeof body.link_label === 'string'        ? body.link_label.slice(0, 100)        : null,
      link_destination:      typeof body.link_destination === 'string'  ? body.link_destination.slice(0, 500)  : null,
      link_platform:         typeof body.link_platform === 'string'     ? body.link_platform.slice(0, 50)      : null,
      link_category:         typeof body.link_category === 'string'     ? body.link_category.slice(0, 50)      : null,
      product_id:            typeof body.product_id === 'string'        ? body.product_id.slice(0, 100)        : null,
      product_name:          typeof body.product_name === 'string'      ? body.product_name.slice(0, 200)      : null,
      product_category:      typeof body.product_category === 'string'  ? body.product_category.slice(0, 50)   : null,
      quantity:              typeof body.quantity === 'number'          ? body.quantity                        : null,
      value_cents:           typeof body.value_cents === 'number'       ? body.value_cents                     : null,
      currency:              typeof body.currency === 'string'          ? body.currency.slice(0, 3).toUpperCase() : 'EUR',
      scroll_depth_pct:      typeof body.scroll_depth_pct === 'number'  ? Math.min(100, Math.max(0, body.scroll_depth_pct)) : null,
      time_on_page_seconds:  typeof body.time_on_page_seconds === 'number' ? body.time_on_page_seconds : null,
      properties:            body.properties && typeof body.properties === 'object' ? body.properties : null,
    });

  if (eventError) {
    console.error('Event insert error:', eventError);
    return new Response(JSON.stringify({ ok: false, error: 'event_error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, session_id }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
