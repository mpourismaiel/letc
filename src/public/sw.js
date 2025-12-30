const CACHE_NAME = 'letc-v1';
const CORE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of CORE_ASSETS) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res?.ok) await cache.put(url, res.clone());
      } catch {
        // ignore individual failures
      }
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const networkResp = await fetch(req);
      if (networkResp?.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkResp.clone()).catch(() => {});
      }
      return networkResp;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      if (req.mode === 'navigate') {
        const cachedIndex = await cache.match('/index.html');
        if (cachedIndex) return cachedIndex;
      }
      const cached = await cache.match(req);
      if (cached) return cached;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
