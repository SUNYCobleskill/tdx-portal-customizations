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

   TDX renders desktop modules asynchronously via AJAX after DOMContentLoaded,
   so a MutationObserver waits for our input/button to appear before wiring
   handlers. Without this, querySelector returns null on initial load and
   the script silently does nothing.

   Selectors use data-* attributes because TDX's allowlist permanently
   disallows id.

   Diagnostic logs are prefixed [TDX Portal: search-bar] for filtering.
   ====================================================================== */

(function () {
  'use strict';

  var LOG = '[TDX Portal: search-bar]';
  console.log(LOG, 'script loaded');

  function getPortalId() {
    var match = window.location.pathname.match(/\/TDClient\/(\d+)\//);
    return match ? match[1] : null;
  }

  function attach(input, btn) {
    var portalId = getPortalId();
    if (!portalId) {
      console.warn(LOG, 'could not detect portal ID from URL — aborting setup');
      return;
    }
    console.log(LOG, 'wiring handlers; portal ID detected:', portalId);

    function submit() {
      var q = input.value.trim();
      if (!q) {
        console.log(LOG, 'submit called with empty query, ignoring');
        return;
      }
      var url = 'https://cobleskill.teamdynamix.com/TDClient/' + portalId +
        '/Portal/Shared/Search/?c=all&s=' + encodeURIComponent(q);
      console.log(LOG, 'submitting search; navigating to:', url);
      window.location.href = url;
    }

    btn.addEventListener('click', function () {
      console.log(LOG, 'search button clicked');
      submit();
    });
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        console.log(LOG, 'Enter pressed in search input');
        e.preventDefault();
        submit();
      }
    });
  }

  function tryAttach() {
    var input = document.querySelector('[data-its-search]');
    var btn = document.querySelector('[data-its-search-go]');
    if (input && btn) {
      console.log(LOG, 'found search elements in DOM');
      attach(input, btn);
      return true;
    }
    return false;
  }

  if (tryAttach()) {
    return;
  }

  console.log(LOG, 'search elements not yet present; starting MutationObserver');
  var observer = new MutationObserver(function () {
    if (tryAttach()) {
      console.log(LOG, 'observer matched; disconnecting');
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(function () {
    console.warn(LOG, 'observer timeout (30s); search elements never appeared. Disconnecting.');
    observer.disconnect();
  }, 30000);
})();
