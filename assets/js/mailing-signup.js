// Las Aguas dashboard mailing-list signup — shared wiring for the site's newsletter forms.
// Usage: SilverOmenMailingSignup({ form: 'form-id', slug: '...', formId: '...', msg: 'msg-id', consent: 'consent-checkbox-id', fields: ['email','name'] })
(function () {
  var API_BASE = "https://lasaguasproductions.com";

  function sessionToken() {
    try {
      var t = localStorage.getItem("laf_sid");
      if (!t) {
        t = (window.crypto && crypto.randomUUID && crypto.randomUUID())
          || (Date.now() + "-" + Math.random().toString(36).slice(2));
        localStorage.setItem("laf_sid", t);
      }
      return t;
    } catch (e) { return Date.now() + "-" + Math.random().toString(36).slice(2); }
  }
  function readUTM() {
    var p = new URLSearchParams(location.search);
    return {
      source: p.get("utm_source") || undefined, medium: p.get("utm_medium") || undefined,
      campaign: p.get("utm_campaign") || undefined, content: p.get("utm_content") || undefined,
      term: p.get("utm_term") || undefined,
    };
  }
  var TOKEN = sessionToken();

  window.SilverOmenMailingSignup = function (opts) {
    var formEl = typeof opts.form === "string" ? document.getElementById(opts.form) : opts.form;
    if (!formEl) return;
    var fields = opts.fields || ["email", "name"];
    var msgEl = opts.msg ? (typeof opts.msg === "string" ? document.getElementById(opts.msg) : opts.msg) : null;
    var consentEl = opts.consent ? (typeof opts.consent === "string" ? document.getElementById(opts.consent) : opts.consent) : null;
    var btn = formEl.querySelector('button[type="submit"], input[type="submit"]');
    var el = formEl.elements;

    if (opts.formId) {
      fetch(API_BASE + "/api/forms-public/track", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({
          formId: opts.formId, sessionToken: TOKEN, referrer: document.referrer,
          utm: readUTM(), language: navigator.language,
        }),
      }).catch(function () {});
    }

    formEl.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (el.website && el.website.value) return; // honeypot tripped — drop silently

      if (msgEl) { msgEl.style.color = ""; msgEl.textContent = ""; }

      if (consentEl && !consentEl.checked) {
        if (msgEl) {
          msgEl.style.color = "#ff6b6b";
          msgEl.textContent = "Please check the box to confirm you'd like to receive emails.";
        }
        return;
      }

      if (btn) btn.disabled = true;

      var payload = { slug: opts.slug, source_path: location.pathname, session_token: TOKEN };
      fields.forEach(function (k) {
        if (el[k] && el[k].value && el[k].value.trim()) payload[k] = el[k].value.trim();
      });

      try {
        var res = await fetch(API_BASE + "/api/forms-public/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        formEl.reset();
        if (msgEl) { msgEl.style.color = "#6fcf97"; msgEl.textContent = data.message || "Thanks — you're signed up!"; }
        if (typeof window.SilverOmenTrack === "function") {
          window.SilverOmenTrack("conversion_newsletter", {
            link_label: "Newsletter Signup",
            link_platform: "las_aguas",
            link_category: "newsletter",
          });
        }
      } catch (err) {
        if (msgEl) { msgEl.style.color = "#ff6b6b"; msgEl.textContent = err.message; }
        if (btn) btn.disabled = false;
      }
    });
  };
})();
