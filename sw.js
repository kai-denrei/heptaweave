// heptaweave — service worker.
//
// Strategy matches heptacipher's: HTML NetworkFirst (so dev edits + cache-busting
// always win), JS stale-while-revalidate (cb-fingerprinted URLs are new entries),
// icons & manifest CacheFirst.
//
// Update lifecycle (per mobile-pwa skill): install does NOT skipWaiting and
// activate does NOT clients.claim() unconditionally — that would yank fresh JS
// underneath an in-flight session. Instead, the page detects the new worker via
// `updatefound` + `statechange === 'installed'` + an existing controller, shows
// an in-app toast, and ONLY when the user opts in we post `SKIP_WAITING` to the
// new worker so it activates and the page reloads on `controllerchange`.

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `heptaweave-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `heptaweave-runtime-${CACHE_VERSION}`;

// Precache the boot HTML, manifest, brand icons, and the styled offline page.
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './offline.html',
];

// FIFO trim cap for the runtime cache. Static cache is small + curated.
const RUNTIME_MAX_ENTRIES = 40;

self.addEventListener('install', (event) => {
  // No skipWaiting here — a fresh worker should wait until the page opts in.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload when supported — lets the SW kick off the
    // network request in parallel with worker boot for navigations.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_e) {}
    }
    // Evict stale cache buckets from prior CACHE_VERSIONs.
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k)),
    );
    // Intentionally do NOT call clients.claim(). The page reloads itself on
    // `controllerchange` once the user accepts the update toast, which is when
    // the new worker should take over — not unilaterally on activate.
  })());
});

// Page-driven activation: the toast posts { type: 'SKIP_WAITING' } when the
// user taps the refresh affordance.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(event, 3000));
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

// FIFO eviction. caches.keys() returns request entries in insertion order,
// so the oldest are at the front. We delete `(length - max)` from the head.
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys  = await cache.keys();
    const over  = keys.length - maxEntries;
    if (over <= 0) return;
    for (let i = 0; i < over; i++) {
      await cache.delete(keys[i]);
    }
  } catch (_e) {}
}

async function networkFirst(event, timeoutMs) {
  const req = event.request;
  // Prefer the navigation-preload response if the browser kicked one off.
  // It races against fetch() — whichever resolves first wins.
  const preload = event.preloadResponse ? Promise.resolve(event.preloadResponse) : null;
  try {
    const racers = [
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ];
    if (preload) {
      racers.push(preload.then((r) => (r ? r : new Promise(() => {}))));
    }
    const fresh = await Promise.race(racers);
    if (fresh && fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone()).then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES)).catch(() => {});
    }
    return fresh;
  } catch (_e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Styled offline page, precached at install time.
    const offline = await caches.match('./offline.html');
    if (offline) return offline;
    // Last-resort inline fallback if even the offline page isn't cached.
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>offline</title>' +
      '<style>body{font-family:ui-serif,Georgia,serif;background:#f6f1e7;color:#161310;padding:48px;text-align:center}</style>' +
      '<p>⊘</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((fresh) => {
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone())
        .then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES))
        .catch(() => {});
    }
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
