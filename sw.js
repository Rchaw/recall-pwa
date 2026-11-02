const CACHE = `recall-${new URL(self.registration.scope).pathname}-assets`;
const ASSETS = ['./','./index.html','./styles.css','./app.js','./core.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
const URLS = ASSETS.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS.map(url => new Request(url, {cache:'reload'})))));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); url.search = ''; url.hash = '';
  if (!URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) { try { await cache.put(url.href, response.clone()); } catch {} }
      return response;
    } catch {
      const cached = await cache.match(url.href);
      if (cached) return cached;
      throw new Error('This app file is unavailable offline.');
    }
  })());
});
