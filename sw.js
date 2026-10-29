/* =========================================================
   ALI FURNITURE & DECOR POINT — Service Worker
   Cache-first for static assets, network-first for CDN
   ========================================================= */

const VERSION = "v2.0.1";
const CACHE_NAME = "ali-furniture-" + VERSION;

// Core app shell — cached on install
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

// CDN assets — cached after first fetch (stale-while-revalidate)
const CDN_HOSTS = [
  "cdn.tailwindcss.com",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "images.unsplash.com"
];

// ---------- INSTALL ----------
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS).catch(() => {
        // If one asset fails, still continue installing
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k.startsWith("ali-furniture-") && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== "GET") return;

  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith("http")) return;

  const isCDN = CDN_HOSTS.some(h => url.hostname.includes(h));
  const isSameOrigin = url.origin === self.location.origin;
  const isHTML = req.headers.get("accept") && req.headers.get("accept").includes("text/html");

  // --- HTML navigation: network first, fall back to cache ---
  if (isHTML || req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // --- CDN assets: stale-while-revalidate ---
  if (isCDN) {
    event.respondWith(
      caches.match(req).then(cached => {
        const networkFetch = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // --- Same-origin static assets: cache first ---
  if (isSameOrigin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => {
          // Offline fallback for same-origin navigation already handled above
          return caches.match("./index.html");
        });
      })
    );
    return;
  }

  // --- Everything else: network only ---
  // (WhatsApp links, maps, QR code API, Google Analytics, etc.)
});

// ---------- MESSAGE (manual cache refresh) ----------
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: "CACHE_CLEARED" });
      }
    });
  }
});