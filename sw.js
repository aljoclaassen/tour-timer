/* Keeps the Tour Timer pages opening on a phone or TV that has lost signal.
   Pages and assets: network first, so updates arrive, with the saved copy as the fallback.
   Calls to the Google web app and to Google Fonts are never cached. */
const CACHE = 'tour-timer-v2';   // change the number when you want every device to drop its old copy
const FILES = ['tv.html', 'phone.html', 'admin.html', 'assets/app.css', 'assets/core.js', 'assets/config.js', 'assets/app.js',
  'assets/img/logo-black-text.png', 'assets/img/logo-white-text.png', 'assets/img/spots.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
