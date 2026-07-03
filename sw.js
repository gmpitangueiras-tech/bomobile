const CACHE_NAME = "guarda-pitangueiras-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/config.js",
  "/js/supabase.js",
  "/js/auth.js",
  "/js/ocorrencia.js",
  "/js/app.js",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("supabase.co")) return;
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request))
      .catch(() => new Response("Offline", { status: 503 })),
  );
});
