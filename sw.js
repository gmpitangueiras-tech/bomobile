const CACHE_NAME = "guarda-pitangueiras-v2";
const BASE_PATH = "./";

const ASSETS = [
  BASE_PATH,
  BASE_PATH + "index.html",
  BASE_PATH + "css/style.css",
  BASE_PATH + "js/config.js",
  BASE_PATH + "js/supabase.js",
  BASE_PATH + "js/auth.js",
  BASE_PATH + "js/ocorrencia.js",
  BASE_PATH + "js/app.js",
  BASE_PATH + "manifest.json",
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
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Se for uma navegação (requisição de página HTML)
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match(BASE_PATH + "index.html").then((response) => {
        return response || fetch(event.request);
      }),
    );
    return;
  }

  // Para outros recursos, tenta cache primeiro
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});
