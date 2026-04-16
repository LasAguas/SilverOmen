// Header component
// Usage: Header.render(targetSelector, basePath)
// basePath adjusts asset paths per page depth (e.g. '' for root, '../' for /pages/)

var Header = (function () {
  var navLinks = [
    { href: 'about.html', text: 'Who is Silver' },
    { href: 'booking.html', text: 'Booking' },
    { href: 'music.html', text: 'Music' },
    { href: 'contact.html', text: 'Contact' }
  ];

  function buildNavLinks(base) {
    return navLinks.map(function (l) {
      return '<a href="' + base + l.href + '">' + l.text + '</a>';
    }).join('');
  }

  function render(targetSelector, basePath) {
    var base = basePath || '';
    var html =
      '<div class="loader" id="loader">' +
        '<span class="loader-text">Silver Omen</span>' +
      '</div>' +
      '<header class="header" id="header">' +
        '<div class="header-inner">' +
          '<a href="' + base + 'index.html" class="header-logo">' +
            '<span class="header-logo-text">Silver Omen</span>' +
          '</a>' +
          '<button class="header-toggle" id="headerToggle" aria-label="Toggle menu">' +
            '<span></span><span></span>' +
          '</button>' +
          '<nav class="header-nav" id="headerNav">' +
            buildNavLinks(base) +
          '</nav>' +
        '</div>' +
      '</header>';

    var target = document.querySelector(targetSelector);
    if (target) {
      target.insertAdjacentHTML('afterbegin', html);
    }
  }

  function init() {
    // Loader
    window.addEventListener('load', function () {
      var loader = document.getElementById('loader');
      if (loader) {
        setTimeout(function () {
          loader.classList.add('hidden');
        }, 1200);
      }
    });

    // Scroll effect
    var header = document.getElementById('header');
    if (header) {
      window.addEventListener('scroll', function () {
        if (window.scrollY > 60) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      });
    }

    // Mobile menu
    var headerToggle = document.getElementById('headerToggle');
    var headerNav = document.getElementById('headerNav');
    if (headerToggle && headerNav) {
      headerToggle.addEventListener('click', function () {
        headerToggle.classList.toggle('active');
        headerNav.classList.toggle('open');
      });
      headerNav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          headerToggle.classList.remove('active');
          headerNav.classList.remove('open');
        });
      });
    }
  }

  return { render: render, init: init };
})();
