(function () {
  'use strict';

  var ENDPOINT = 'https://gtccctajvobfvhlonaot.supabase.co/functions/v1/track-event';
  var ARTIST_ID = 11;

  // ── Consent ──────────────────────────────────────────────────────────────
  // so_consent cookie: 'true' = Tier-2 enabled, 'false' = Tier-1 only
  function getConsent() {
    var m = document.cookie.match(/(?:^|;\s*)so_consent=([^;]*)/);
    return m ? m[1] : null; // null = no decision yet
  }

  function setConsent(val) {
    var exp = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = 'so_consent=' + val + '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  var consentGiven = getConsent() === 'true';

  // ── Session token (sessionStorage — clears on tab close, no consent needed) ──
  var sessionToken = sessionStorage.getItem('so_sess');
  if (!sessionToken) {
    sessionToken = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('so_sess', sessionToken);
  }

  // ── Returning visitor (first-party cookie, consent-gated) ────────────────
  var isReturning = false;
  if (consentGiven) {
    isReturning = !!document.cookie.match(/(?:^|;\s*)so_ret=1/);
    if (!isReturning) {
      var retExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = 'so_ret=1; expires=' + retExp + '; path=/; SameSite=Lax';
    }
  }

  // ── UTM params (from URL — user chose to include these, no consent needed) ──
  var urlParams = new URLSearchParams(window.location.search);

  // ── Page slug ────────────────────────────────────────────────────────────
  var pageSlug = window.location.pathname
    .replace(/^\//, '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '') || 'index';

  // ── Session start time (for duration calc) ───────────────────────────────
  var sessionStart = Date.now();

  // ── Core send function ───────────────────────────────────────────────────
  function send(payload) {
    var body = Object.assign({
      artist_id:       ARTIST_ID,
      session_token:   sessionToken,
      page_slug:       pageSlug,
      referrer_url:    document.referrer ? document.referrer.slice(0, 500) : null,
      utm_source:      urlParams.get('utm_source'),
      utm_medium:      urlParams.get('utm_medium'),
      utm_campaign:    urlParams.get('utm_campaign'),
      utm_content:     urlParams.get('utm_content'),
      utm_term:        urlParams.get('utm_term'),
      screen_width_px: window.screen ? window.screen.width : null,
      language:        navigator.language || null,
      consent_given:   consentGiven,
      is_returning:    isReturning,
    }, payload);

    try {
      // keepalive: true ensures the request completes even if the page unloads
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function track(eventType, props) {
    send(Object.assign({ event_type: eventType }, props || {}));
  }

  window.SilverOmenTrack = track;

  // ── Auto pageview ────────────────────────────────────────────────────────
  track('pageview');

  // ── Link click tracking (data-track-* attributes) ───────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target;
    // Walk up to find the nearest element with data-track-type
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.trackType) {
        track('click_' + el.dataset.trackType, {
          link_label:       el.dataset.trackLabel       || (el.textContent || '').trim().slice(0, 100),
          link_destination: el.dataset.trackDest        || el.href         || null,
          link_platform:    el.dataset.trackPlatform    || null,
          link_category:    el.dataset.trackCategory    || el.dataset.trackType || null,
        });
        return;
      }
      el = el.parentElement;
    }
  });

  // ── Session duration patch on page hide ──────────────────────────────────
  function patchDuration() {
    var secs = Math.round((Date.now() - sessionStart) / 1000);
    send({ event_type: '_session_end', duration_seconds: secs });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') patchDuration();
  });

  window.addEventListener('pagehide', patchDuration);

  // ── Tier-2: scroll depth milestones (consent-gated) ──────────────────────
  if (consentGiven) {
    var scrollFired = {};
    var milestones = [25, 50, 75, 90];

    window.addEventListener('scroll', function () {
      var scrolled = window.scrollY + window.innerHeight;
      var total    = document.documentElement.scrollHeight || 1;
      var pct      = Math.round((scrolled / total) * 100);

      milestones.forEach(function (m) {
        if (!scrollFired[m] && pct >= m) {
          scrollFired[m] = true;
          track('scroll_milestone', { scroll_depth_pct: m });
        }
      });
    }, { passive: true });
  }

  // ── Tier-2: time-on-page milestones (consent-gated) ──────────────────────
  if (consentGiven) {
    var timeMilestones = [15, 30, 60, 120];
    timeMilestones.forEach(function (secs) {
      setTimeout(function () {
        if (document.visibilityState !== 'hidden') {
          track('engagement', { time_on_page_seconds: secs });
        }
      }, secs * 1000);
    });
  }

  // ── Consent banner logic ──────────────────────────────────────────────────
  if (getConsent() === null) {
    var banner = document.createElement('div');
    banner.id = 'so-consent-banner';
    banner.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'right:0',
      'z-index:99999',
      'background:rgba(11,27,40,0.97)',
      'border-top:1px solid rgba(44,137,211,0.4)',
      'padding:1rem 1.5rem',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'flex-wrap:wrap',
      'gap:0.75rem',
      'font-family:Brans,sans-serif',
      'font-size:0.72rem',
      'letter-spacing:0.1em',
      'color:#f8f8f8',
    ].join(';');

    banner.innerHTML = [
      '<span>We use cookies to remember your preferences and improve your experience.',
      ' <a href="/privacy" style="color:#2C89D3;text-decoration:underline">Privacy policy</a></span>',
      '<span style="display:flex;gap:0.6rem;flex-shrink:0">',
      '  <button id="so-consent-decline" style="',
      '    padding:0.45rem 1rem;border:1px solid rgba(248,248,248,0.3);',
      '    background:transparent;color:#f8f8f8;cursor:pointer;',
      '    font-family:Brans,sans-serif;font-size:0.7rem;letter-spacing:0.1em;',
      '    text-transform:uppercase;border-radius:3px">Essential only</button>',
      '  <button id="so-consent-accept" style="',
      '    padding:0.45rem 1rem;border:1px solid #2C89D3;',
      '    background:#2C89D3;color:#f8f8f8;cursor:pointer;',
      '    font-family:Brans,sans-serif;font-size:0.7rem;letter-spacing:0.1em;',
      '    text-transform:uppercase;border-radius:3px">Accept</button>',
      '</span>',
    ].join('');

    document.body.appendChild(banner);

    document.getElementById('so-consent-accept').addEventListener('click', function () {
      setConsent('true');
      consentGiven = true;
      banner.remove();
      // Set returning visitor cookie now that consent is granted
      if (!isReturning) {
        var retExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = 'so_ret=1; expires=' + retExp + '; path=/; SameSite=Lax';
      }
      track('consent_granted');
    });

    document.getElementById('so-consent-decline').addEventListener('click', function () {
      setConsent('false');
      banner.remove();
    });
  }
})();
