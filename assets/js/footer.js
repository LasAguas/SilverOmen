// Footer component
// Usage: Footer.render(targetSelector, basePath)
// basePath adjusts asset paths per page depth (e.g. '' for root, '../' for /pages/)

var Footer = (function () {
  var socialLinks = [
    { name: 'Spotify', img: 'Spotify Logo.png', href: 'https://open.spotify.com/artist/04PVbCwPl3UEsNnVJUZbUl' },
    { name: 'Apple Music', img: 'Apple Music Logo.png', href: 'https://music.apple.com/gb/artist/silver-omen/1820988833' },
    { name: 'YouTube', img: 'YouTube Logo.png', href: 'https://www.youtube.com/@silveromen.mp4' },
    { name: 'Instagram', img: 'Instagram Logo.png', href: 'instagram.com/silver.omen' },
    { name: 'Facebook', img: 'Facebook Logo.png', href: 'https://www.facebook.com/silveromenmusic' },
    { name: 'Bandcamp', img: 'Bandcamp Logo.png', href: 'https://silveromen.bandcamp.com/track/welcome-to-the-club' },
    { name: 'Tidal', img: 'Tidal Logo.png', href: 'https://tidal.com/artist/57012046/u' },
    { name: 'Deezer', img: 'Deezer Logo.png', href: 'https://www.deezer.com/en/track/3849458051' }
  ];

  function buildSocialIcons(base) {
    return socialLinks.map(function (s) {
      return (
        '<a href="' + s.href + '" class="footer-social-link" aria-label="' + s.name + '">' +
          '<img src="' + base + 'assets/images/Socials Logos/' + s.img + '" alt="' + s.name + '" />' +
        '</a>'
      );
    }).join('');
  }

  function render(targetSelector, basePath) {
    var base = basePath || '';
    var html =
      '<footer class="footer">' +
        '<div class="footer-inner">' +
          '<div class="footer-socials">' +
            buildSocialIcons(base) +
          '</div>' +
          '<div class="footer-bottom">' +
            '<span class="footer-copy">&copy; ' + new Date().getFullYear() + ' Silver Omen. All rights reserved.</span>' +
          '</div>' +
        '</div>' +
      '</footer>';

    var target = document.querySelector(targetSelector);
    if (target) {
      target.insertAdjacentHTML('beforeend', html);
    }
  }

  return { render: render };
})();
