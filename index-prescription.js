function render() {
  Header.render('#root', '');

  var heroImage = 'assets/images/Hero/silver-omen-prescription.jpg';

  var hero =
    '<section class="hero" id="home">' +
      '<div class="hero-image-wrap">' +
        '<img src="' + heroImage + '" alt="Silver Omen hero" class="hero-image" />' +
        '<div class="hero-overlay"></div>' +
      '</div>' +
      '<div class="hero-content">' +
        '<h1 class="hero-title">' +
          '<span class="hero-title-line">Silver</span>' +
          '<span class="hero-title-line">Omen</span>' +
        '</h1>' +
        '<div id="mc_embed_shell">' +
          '<div id="mc_embed_signup">' +
            '<form id="mc-embedded-subscribe-form" novalidate>' +
              '<div id="mc_embed_signup_scroll">' +
                '<div class="mc-field-group">' +
                  '<input type="text" name="name" class="text" placeholder="Name" />' +
                '</div>' +
                '<div class="mc-field-group">' +
                  '<input type="email" name="email" class="required email" required placeholder="Email Address" />' +
                '</div>' +
                '<div aria-hidden="true" style="position:absolute;left:-5000px;">' +
                  '<input type="text" name="website" tabindex="-1" autocomplete="off" />' +
                '</div>' +
                '<div class="mc-consent">' +
                  '<input type="checkbox" id="mc-consent-prescription" />' +
                  '<span>I agree to receive email updates from Silver Omen. See the <a href="privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>' +
                '</div>' +
                '<p class="mc-msg" id="mc-signup-msg" role="status" aria-live="polite"></p>' +
                '<div class="optionalParent">' +
                  '<div class="clear foot">' +
                    '<button type="submit" class="button">Subscribe to My Newsletter</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';

  document.getElementById('root').insertAdjacentHTML('beforeend', hero);

  Footer.render('#root', '');
  Header.init();

  SilverOmenMailingSignup({
    form: 'mc-embedded-subscribe-form',
    slug: 'newsletter-sign-up-htuw',
    formId: 'd7a4d029-6735-418c-878c-861f4cc53c06',
    msg: 'mc-signup-msg',
    consent: 'mc-consent-prescription',
  });
}

render();
