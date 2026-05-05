/* ======================================================================
   TDX Client Portal — Auth-State Hide
   ======================================================================
   Hides elements marked [data-its-login-button] when the user is already
   authenticated. TDX renders #btnUserProfileMenu (the user dropdown) only
   for logged-in users, so its presence is the auth signal.

   Module HTML for any element that should hide when logged in:
     <a ... data-its-login-button ...>Log In</a>
   ====================================================================== */

(function () {
  'use strict';

  function setup() {
    if (!document.getElementById('btnUserProfileMenu')) return;
    var elements = document.querySelectorAll('[data-its-login-button]');
    for (var i = 0; i < elements.length; i++) {
      elements[i].style.display = 'none';
    }
  }

  if (document.readyState !== 'loading') {
    setup();
  } else {
    document.addEventListener('DOMContentLoaded', setup);
  }
})();
