/* Shared site menu. Markup lives in each page (so links stay crawlable) between
   <!-- SN-NAV --> markers; styles are in site.css (.sn-*). */
(function() {
  var head = document.querySelector('.sn-head');
  if (!head) return;
  var burger = head.querySelector('.sn-burger');
  var items = Array.prototype.slice.call(head.querySelectorAll('.sn-item'));
  var mobile = window.matchMedia('(max-width: 980px)');

  function closeAll(except) {
    items.forEach(function(it) {
      if (it !== except) { it.classList.remove('open'); it.querySelector('.sn-top').setAttribute('aria-expanded', 'false'); }
    });
  }
  function setPanel(open) {
    head.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  burger.addEventListener('click', function(e) { e.stopPropagation(); setPanel(!head.classList.contains('menu-open')); });

  items.forEach(function(it) {
    var top = it.querySelector('.sn-top');
    top.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = !it.classList.contains('open');
      if (!mobile.matches) closeAll(it);
      it.classList.toggle('open', open);
      top.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.addEventListener('click', function(e) {
    if (!head.contains(e.target)) { if (!mobile.matches) closeAll(); }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeAll(); setPanel(false); }
  });
  mobile.addEventListener && mobile.addEventListener('change', function() { closeAll(); setPanel(false); });

  var search = head.querySelectorAll('.sn-search');
  Array.prototype.forEach.call(search, function(b) {
    b.addEventListener('click', function() {
      setPanel(false);
      if (typeof window.openSearch === 'function') window.openSearch();
      else window.location.href = 'blog.html';
    });
  });

  // Mark the current page and its group.
  var here = location.pathname.replace(/^\/+/, '').replace(/\.html$/, '') || 'index';
  Array.prototype.forEach.call(head.querySelectorAll('a[href]'), function(a) {
    var h = a.getAttribute('href').replace(/^\/+/, '').replace(/\.html$/, '').split(/[?#]/)[0];
    if (h === here) {
      a.setAttribute('aria-current', 'page');
      var it = a.closest('.sn-item');
      if (it) {
        it.classList.add('sn-cur');
        if (mobile.matches) { it.classList.add('open'); it.querySelector('.sn-top').setAttribute('aria-expanded', 'true'); }
      }
    }
  });
})();
