/* ======================================================================
   TDX Client Portal — Auth-State Hide
   ======================================================================
   Hides elements marked [data-its-login-button] when the user is already
   authenticated. TDX renders #btnUserProfileMenu (the user dropdown) only
   for logged-in users, so its presence is the auth signal.

   Module HTML for any element that should hide when logged in:
     <a ... data-its-login-button ...>Log In</a>

   TDX renders desktop modules asynchronously via AJAX after DOMContentLoaded,
   so a MutationObserver waits for the target elements to appear before
   applying. Without this, querySelectorAll returns nothing on initial load
   and the hide never happens.

   Diagnostic logs are prefixed [TDX Portal: auth-hide] for filtering.
   ====================================================================== */

(function () {
  'use strict';

  var LOG = '[TDX Portal: auth-hide]';
  console.log(LOG, 'script loaded');

  function applyHide(elements) {
    var authenticated = !!document.getElementById('btnUserProfileMenu');
    console.log(LOG, 'auth state: user is', authenticated ? 'logged in' : 'logged out');
    if (!authenticated) return;
    console.log(LOG, 'hiding', elements.length, 'login button(s)');
    for (var i = 0; i < elements.length; i++) {
      elements[i].style.display = 'none';
    }
  }

  function tryApply() {
    var elements = document.querySelectorAll('[data-its-login-button]');
    if (elements.length > 0) {
      console.log(LOG, 'found', elements.length, 'login button(s) in DOM');
      applyHide(elements);
      return true;
    }
    return false;
  }

  if (tryApply()) {
    return;
  }

  console.log(LOG, 'login button not yet present; starting MutationObserver');
  var observer = new MutationObserver(function () {
    if (tryApply()) {
      console.log(LOG, 'observer matched; disconnecting');
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(function () {
    console.warn(LOG, 'observer timeout (30s); login button never appeared. Disconnecting.');
    observer.disconnect();
  }, 30000);
})();
