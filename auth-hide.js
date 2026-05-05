/* ======================================================================
   TDX Client Portal — Auth-State Hide
   ======================================================================
   Hides elements with class .its-login-button when the user is already
   authenticated. TDX renders #btnUserProfileMenu (the user dropdown) only
   for logged-in users, so its presence is the auth signal.

   Module HTML for any element that should hide when logged in:
     <a ... class="its-login-button" ...>Log In</a>

   TDX renders desktop modules asynchronously via AJAX after DOMContentLoaded,
   so we poll every 250ms for up to 30s waiting for the target element to
   appear. (MutationObserver was tried first but missed the relevant
   mutation in this specific TDX module render path.)

   Selectors use class names because TDX's sanitizer strips most data-*
   attributes by default.

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
    var elements = document.querySelectorAll('.its-login-button');
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

  console.log(LOG, 'login button not yet present; polling every 250ms');
  var startTime = Date.now();
  var pollInterval = setInterval(function () {
    if (tryApply()) {
      console.log(LOG, 'poll matched; clearing');
      clearInterval(pollInterval);
    } else if (Date.now() - startTime > 30000) {
      console.warn(LOG, 'poll timeout (30s); login button never appeared');
      clearInterval(pollInterval);
    }
  }, 250);
})();
