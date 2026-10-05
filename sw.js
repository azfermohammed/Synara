/* ============================================================
   sw.js — offline support
   ------------------------------------------------------------
   Registered by js/main.js (skipped on file://, which has no scope).

   Offline is not a nice-to-have here. The safety card is most needed
   in exactly the places phone signal is worst — a gym, a basement
   classroom, a bus. If this app ever shows a dinosaur instead of
   first-aid steps, it has failed at its one job.

   So: every file the app needs is precached on install, and the shell
   is served from cache on a navigation even when the network is gone.
   User data never touches this cache — it lives in localStorage and
   is never sent anywhere.
   ============================================================ */

const VERSION = 'synara-v2.0.0';
const SHELL = `${VERSION}-shell`;

/* Everything needed to boot with no network at all. */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/app.css',
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
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll fails the whole install if any single request fails, which
    // would leave the app with no offline support at all. Add them
    // individually so one bad path can't take the rest down.
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
    await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Opaque responses (cross-origin fonts) have status 0 but are
      // still worth caching; anything else must be a real 200.
      if (response && (response.status === 200 || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await network;
  return fresh || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Navigations: try the network first so a deployed update is picked
     up promptly, but fall back to the cached shell the moment the
     network is unavailable. */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('index.html');
        return cached || new Response(
          '<h1>Synara is offline</h1><p>Reconnect once to finish setting up offline access.</p>',
          { headers: { 'Content-Type': 'text/html' }, status: 503 }
        );
      }
    })());
    return;
  }

  /* Google Fonts: cache once fetched, so the app doesn't restyle itself
     the first time it opens without a connection. */
  if (!sameOrigin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  /* Same-origin assets: serve from cache, refresh in the background. */
  event.respondWith(staleWhileRevalidate(request));
});

/* Let the page tell a waiting worker to take over immediately. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
