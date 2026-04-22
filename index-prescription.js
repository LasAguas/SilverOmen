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
            '<form action="https://silveromen.us6.list-manage.com/subscribe/post?u=7482966efbe5eb135b80f0bce&amp;id=e2326bd25c&amp;f_id=006be5e1f0" method="post" id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" class="validate" target="_blank">' +
              '<div id="mc_embed_signup_scroll">' +
                '<div class="mc-field-group">' +
                  '<input type="email" name="EMAIL" class="required email" id="mce-EMAIL" required placeholder="Email Address *" />' +
                '</div>' +
                '<div class="mc-field-group">' +
                  '<input type="text" name="FNAME" class="text" id="mce-FNAME" placeholder="First Name" />' +
                '</div>' +
                '<div class="mc-field-group">' +
                  '<input type="text" name="CITY" class="text" id="mce-CITY" placeholder="City" />' +
                '</div>' +
                '<div id="mce-responses" class="clear foot">' +
                  '<div class="response" id="mce-error-response" style="display:none;"></div>' +
                  '<div class="response" id="mce-success-response" style="display:none;"></div>' +
                '</div>' +
                '<div aria-hidden="true" style="position:absolute;left:-5000px;">' +
                  '<input type="text" name="b_7482966efbe5eb135b80f0bce_e2326bd25c" tabindex="-1" value="" />' +
                '</div>' +
                '<div class="optionalParent">' +
                  '<div class="clear foot">' +
                    '<input type="submit" name="subscribe" id="mc-embedded-subscribe" class="button" value="Subscribe to My Newsletter" />' +
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
}

render();
