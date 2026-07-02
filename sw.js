/**
 * ============================================
 * SERVICE WORKER - PWA
 * ============================================
 */

const CACHE_NAME = "guarda-pitangueiras-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/css/cores-pitangueiras.css",
  "/css/components.css",
  "/js/config.js",
  "/js/supabase-client.js",
  "/js/auth.js",
  "/js/app.js",
  "/js/db.js",
  "/manifest.json",
];

// Instalação
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Cache aberto");
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting()),
  );
});

// Ativação
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

// Interceptação de requisições
self.addEventListener("fetch", (event) => {
  // Ignora requisições para Supabase (API)
  if (event.request.url.includes("supabase.co")) {
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        // Retorna do cache se encontrado
        if (response) {
          return response;
        }

        // Caso contrário, busca da rede
        return fetch(event.request).then((response) => {
          // Não cacheia respostas de erro
          if (!response || response.status !== 200) {
            return response;
          }

          // Clone da resposta para cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return response;
        });
      })
      .catch(() => {
        // Fallback offline
        return new Response("Offline - Sem conexão com a internet", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }),
  );
});

// Sincronização em background
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-ocorrencias") {
    event.waitUntil(sincronizarOcorrencias());
  }
});

// Notificações push
self.addEventListener("push", (event) => {
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/assets/icons/icon-192x192.png",
      badge: "/assets/icons/icon-192x192.png",
      tag: data.tag || "notification",
      data: data.url || "/",
    }),
  );
});

// Clique na notificação
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(clients.openWindow(event.notification.data || "/"));
});

// Função de sincronização
async function sincronizarOcorrencias() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "SYNC_STARTED",
      });
    });

    // Aqui será implementada a lógica de sincronização
    // Buscar ocorrências pendentes e enviar ao servidor

    clients.forEach((client) => {
      client.postMessage({
        type: "SYNC_COMPLETED",
      });
    });
  } catch (error) {
    console.error("Erro na sincronização:", error);
  }
}
