/* ======================================================================
   TDX Client Portal — Hero Search Bar
   ======================================================================
   Wires the inline search input + button on the homepage hero to TDX's
   site-wide search results page. Replaces the form-based submission TDX's
   sanitizer doesn't allow.

   Module HTML must include:
     <input ... data-its-search ... />
     <button ... data-its-search-go ...>Search</button>

   Selectors use data-* attributes because TDX's allowlist permanently
   disallows id.
   ====================================================================== */

(function () {
  'use strict';

  function setup() {
    var input = document.querySelector('[data-its-search]');
    var btn = document.querySelector('[data-its-search-go]');
    if (!input || !btn) return;

    function submit() {
      var q = input.value.trim();
      if (!q) return;
      window.location.href =
        'https://cobleskill.teamdynamix.com/TDClient/277/Portal/Shared/Search/?c=all&s=' +
        encodeURIComponent(q);
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  if (document.readyState !== 'loading') {
    setup();
  } else {
    document.addEventListener('DOMContentLoaded', setup);
  }
})();
