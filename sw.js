/* ============================================================
   sw.js — offline support
   ------------------------------------------------------------
   Registered by js/main.js (skipped on file://, which has no scope).

   Offline is not a nice-to-have here. The safety card is most needed
   exactly where phone signal is worst — a gym, a basement classroom,
   a bus. If this app ever shows a dinosaur instead of first-aid steps,
   it has failed at its one job.

   STRATEGY: network first, cache as the fallback.

   The first version served every file from cache and refreshed it in
   the background. That meant every user ran one release behind, and
   because each ES module was refreshed independently, a returning user
   could load an old main.js against a new store.js — a mismatched app.
   Network-first means anyone online always gets one consistent, current
   version; anyone offline gets the last version they loaded, which was
   consistent when it was cached.

   User data never touches this cache. It lives in localStorage and is
   never sent anywhere.
   ============================================================ */

const VERSION = 'synara-v2.2.0';
const CACHE = `${VERSION}-shell`;

/* Long enough for a slow school network to answer; short enough that
   someone with no signal isn't left staring at a blank screen. */
const NETWORK_TIMEOUT_MS = 3500;

/* Everything needed to boot with no network at all. */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/app.css',
  'css/print.css',
  'js/main.js',
  'js/store.js',
  'js/util.js',
  'js/ui.js',
  'js/seed.js',
  'js/insights.js',
  'js/notify.js',
  'js/views/home.js',
  'js/views/meds.js',
  'js/views/seizures.js',
  'js/views/safety.js',
  'js/views/profile.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/flux-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache.addAll() fails the whole install if any one request fails,
    // which would leave no offline support at all. Add individually.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[synara sw] could not precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Resolve with the network response, or reject after `ms`. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    // Revalidate with the server every time ("no-cache" sends a cheap
    // conditional request, answered 304 when nothing changed). Without
    // it, the browser's own HTTP cache can serve a stale module next to
    // a fresh one — which happened in testing: a new safety.js imported
    // a function an old util.js didn't have, and the app loaded blank.
    const fresh = await fetchWithTimeout(
      new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }),
      NETWORK_TIMEOUT_MS,
    );
    if (fresh && fresh.ok) cache.put(fallbackUrl || request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(fallbackUrl || request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Synara</title>' +
        '<body style="font-family:system-ui;padding:24px;line-height:1.5">' +
        '<h1>Synara is offline</h1><p>Open it once with a connection to finish ' +
        'setting up offline access.</p><p><strong>In an emergency, call 911.</strong></p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      // Cross-origin font responses are opaque (status 0) but still worth keeping.
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      request.mode === 'navigate'
        ? networkFirst(request, 'index.html')
        : networkFirst(request),
    );
    return;
  }

  // Google Fonts: keep a copy so the app doesn't restyle itself the
  // first time it opens without a connection.
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
