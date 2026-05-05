/* TDX Pipeline Test
   Temporary script for verifying the GitHub-host → TDX Script Sources
   allowlist → Client HTML Header pipeline. Delete after verification. */
(function () {
  'use strict';
  console.log('TDX external JS loaded successfully');
  var banner = document.createElement('div');
  banner.textContent = 'EXTERNAL JS LOADED — Script Sources allowlist works';
  banner.style.cssText = 'background:lime;color:black;padding:10px;text-align:center;position:fixed;top:0;left:0;right:0;z-index:9999;font-family:sans-serif;font-weight:bold;';
  document.body.appendChild(banner);
})();
