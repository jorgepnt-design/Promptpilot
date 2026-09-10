/* PromptPilot Service Worker
 * Strategie:
 *  - Navigationen: Netzwerk zuerst, bei Offline die zwischengespeicherte App-Hülle.
 *  - Gehashte Build-Assets (/assets/...): Cache zuerst (Dateinamen ändern sich bei jedem Build).
 *  - Übrige eigene Dateien: Cache zuerst, im Hintergrund aktualisieren.
 *  - Updates werden NIE erzwungen. Die Seite entscheidet per Nachricht "SKIP_WAITING".
 */
const VERSION = 'pp-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const scopeUrl = new URL('./', self.location.href);
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
].map((p) => new URL(p, scopeUrl).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Einzeln laden, damit eine fehlende Datei die Installation nicht scheitern lässt.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source && event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

function isAssetRequest(url) {
  return url.pathname.includes('/assets/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigationen: Netzwerk zuerst, damit neue Versionen ankommen; offline die App-Hülle.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(new URL('./index.html', scopeUrl).href, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match(new URL('./index.html', scopeUrl).href)) ||
            (await cache.match(new URL('./', scopeUrl).href));
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  const cacheName = isAssetRequest(url) ? ASSET_CACHE : SHELL_CACHE;

  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(req);
      if (cached) {
        if (!isAssetRequest(url)) {
          // Im Hintergrund auffrischen (gehashte Assets ändern sich nie im Inhalt).
          fetch(req)
            .then((res) => res.ok && cache.put(req, res.clone()))
            .catch(() => undefined);
        }
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
