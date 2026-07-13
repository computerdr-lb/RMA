/* Caches the app itself (HTML/JS/CSS), so the page loads with no internet.
   Data is handled separately, by IndexedDB in src/lib — this file only
   makes sure the app can open at all when offline. */
const CACHE = "cd-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;               // never cache writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Supabase requests alone

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
  );
});
