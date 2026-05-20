// heptaweave — service worker.
//
// Strategy matches heptacipher's: HTML NetworkFirst (so dev edits + cache-busting
// always win), JS stale-while-revalidate (cb-fingerprinted URLs are new entries),
// icons & manifest CacheFirst.

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `heptaweave-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `heptaweave-runtime-${CACHE_VERSION}`;

const PRECACHE = ['./index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req, 3000));
    return;
  }

  if (req.destination === 'script' || url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (req.destination === 'image' || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function networkFirst(req, timeoutMs) {
  try {
    const fresh = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<style>body{font-family:ui-serif,Georgia,serif;background:#f6f1e7;color:#161310;padding:48px;text-align:center}</style>' +
      '<h1>Offline</h1>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((fresh) => {
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  }).catch(() => null);
  return cached || networkPromise || new Response('', { status: 504 });
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_e) {
    return new Response('', { status: 504 });
  }
}
