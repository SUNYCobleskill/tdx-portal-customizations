/* ======================================================================
   TDX Client Portal — Auth-State Toggle
   ======================================================================
   Toggles element visibility based on whether the user is authenticated,
   and personalizes greetings with the user's full name.

   Auth signal: TDX renders #btnUserProfileMenu (the user dropdown) only
   for logged-in users. Its presence = authenticated.

   Module HTML conventions:
     <... class="its-show-when-logged-out">  - shown only when logged out
     <... class="its-show-when-logged-in">   - shown only when logged in
     <span class="its-user-name">there</span> - replaced with FullName when
                                                logged in (fallback "there"
                                                if JS fails to populate)

   Defaults to expect in the HTML: logged-out elements visible, logged-in
   elements hidden via inline style="display: none;". The script flips
   them when authenticated.

   Personalization source: window.TdxGtmContext.User.FullName (set by TDX
   on every authenticated portal page).

   TDX renders desktop modules asynchronously via AJAX after DOMContentLoaded,
   so we poll every 250ms for up to 30s waiting for target elements to
   appear. (MutationObserver was tried first but missed the relevant
   mutation in this specific TDX module render path.)

   Selectors use class names because TDX's sanitizer strips most data-*
   attributes by default.

   File name kept as auth-hide.js for jsDelivr cache stability; scope is
   broader than just hiding now.

   Diagnostic logs are prefixed [TDX Portal: auth-hide] for filtering.
   ====================================================================== */

(function () {
  'use strict';

  var LOG = '[TDX Portal: auth-hide]';
  console.log(LOG, 'script loaded');

  function getFullName() {
    try {
      return (window.TdxGtmContext &&
              window.TdxGtmContext.User &&
              window.TdxGtmContext.User.FullName) || null;
    } catch (e) {
      return null;
    }
  }

  function applyAuthState() {
    var authenticated = !!document.getElementById('btnUserProfileMenu');
    console.log(LOG, 'auth state: user is', authenticated ? 'logged in' : 'logged out');

    var loggedInEls = document.querySelectorAll('.its-show-when-logged-in');
    var loggedOutEls = document.querySelectorAll('.its-show-when-logged-out');

    var i;
    if (authenticated) {
      for (i = 0; i < loggedInEls.length; i++) loggedInEls[i].style.display = '';
      for (i = 0; i < loggedOutEls.length; i++) loggedOutEls[i].style.display = 'none';

      var fullName = getFullName();
      if (fullName) {
        var nameSlots = document.querySelectorAll('.its-user-name');
        for (i = 0; i < nameSlots.length; i++) nameSlots[i].textContent = fullName;
        console.log(LOG, 'populated', nameSlots.length, 'name slot(s) with:', fullName);
      } else {
        console.warn(LOG, 'authenticated but FullName not available on window.TdxGtmContext');
      }
    } else {
      for (i = 0; i < loggedOutEls.length; i++) loggedOutEls[i].style.display = '';
      for (i = 0; i < loggedInEls.length; i++) loggedInEls[i].style.display = 'none';
    }

    console.log(LOG, 'applied auth state to', loggedInEls.length, 'logged-in element(s) and', loggedOutEls.length, 'logged-out element(s)');
  }

  function tryApply() {
    var loggedIn = document.querySelectorAll('.its-show-when-logged-in');
    var loggedOut = document.querySelectorAll('.its-show-when-logged-out');
    if (loggedIn.length > 0 || loggedOut.length > 0) {
      console.log(LOG, 'found', loggedIn.length, 'logged-in element(s) and', loggedOut.length, 'logged-out element(s)');
      applyAuthState();
      return true;
    }
    return false;
  }

  if (tryApply()) {
    return;
  }

  console.log(LOG, 'auth-toggle elements not yet present; polling every 250ms');
  var startTime = Date.now();
  var pollInterval = setInterval(function () {
    if (tryApply()) {
      console.log(LOG, 'poll matched; clearing');
      clearInterval(pollInterval);
    } else if (Date.now() - startTime > 30000) {
      console.warn(LOG, 'poll timeout (30s); auth-toggle elements never appeared');
      clearInterval(pollInterval);
    }
  }, 250);
})();
