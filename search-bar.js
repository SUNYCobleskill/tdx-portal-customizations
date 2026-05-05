/* ======================================================================
   TDX Client Portal — Hero Search Bar
   ======================================================================
   Wires the inline search input + button on the homepage hero to TDX's
   site-wide search results page. Replaces the form-based submission TDX's
   sanitizer doesn't allow.

   Module HTML must include:
     <input ... data-its-search ... />
     <button ... data-its-search-go ...>Search</button>

   The portal ID (e.g. 659 for test, 277 for production) is detected from
   the current page URL, so the same script works on any TDX client portal
   without modification.

   Selectors use data-* attributes because TDX's allowlist permanently
   disallows id.
   ====================================================================== */

(function () {
  'use strict';

  // Pulls the numeric portal application ID out of the current URL path.
  // E.g. https://.../TDClient/659/Portal/Home/ -> "659"
  function getPortalId() {
    var match = window.location.pathname.match(/\/TDClient\/(\d+)\//);
    return match ? match[1] : null;
  }

  function setup() {
    var input = document.querySelector('[data-its-search]');
    var btn = document.querySelector('[data-its-search-go]');
    if (!input || !btn) return;

    var portalId = getPortalId();
    if (!portalId) return;

    function submit() {
      var q = input.value.trim();
      if (!q) return;
      window.location.href =
        'https://cobleskill.teamdynamix.com/TDClient/' + portalId +
        '/Portal/Shared/Search/?c=all&s=' + encodeURIComponent(q);
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
