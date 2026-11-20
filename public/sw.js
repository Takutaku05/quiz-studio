// Minimal service worker: exists only so browsers treat Quiz Studio as an
// installable app (PWA). It deliberately has no fetch handler and uses no
// caches, so auth redirects, Supabase API calls, and freshly deployed assets
// always go straight to the network. See docs/requirements-pwa.md.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
