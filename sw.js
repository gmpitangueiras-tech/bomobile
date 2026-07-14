/**
 * SERVICE WORKER - PWA e Notificações Push
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Cache de assets para funcionamento offline
 * - Notificações push para alertas do sistema
 * - Sincronização em background
 * - Atualização automática de cache
 * - Estratégias de cache (stale-while-revalidate)
 *
 * MELHORIAS APLICADAS:
 * - Notificações push com interação
 * - Cache de imagens e assets dinâmicos
 * - Sincronização em background (Background Sync)
 * - Estratégias de cache otimizadas
 * - Gerenciamento de versões de cache
 * - Precache de rotas importantes
 */

// ============================================
// CONSTANTES
// ============================================

const CACHE_NAME = "guarda-pitangueiras-v3";
const BASE_PATH = "./";
const ASSETS_CACHE = "guarda-assets-v1";
const API_CACHE = "guarda-api-v1";
const IMAGES_CACHE = "guarda-images-v1";
const DYNAMIC_CACHE = "guarda-dynamic-v1";
const CACHE_VERSION = "v3";

const STATIC_ASSETS = [
  BASE_PATH,
  BASE_PATH + "index.html",
  BASE_PATH + "css/style.css",
  BASE_PATH + "js/config.js",
  BASE_PATH + "js/supabase.js",
  BASE_PATH + "js/auth.js",
  BASE_PATH + "js/ocorrencia.js",
  BASE_PATH + "js/session.js",
  BASE_PATH + "js/app.js",
  BASE_PATH + "manifest.json",
  BASE_PATH + "assets/icons/icon-192x192.png",
  BASE_PATH + "assets/icons/icon-512x512.png",
];

// Rotas da API que devem ser cacheadas
const API_ROUTES = ["/api/ocorrencias", "/api/usuarios", "/api/abordagens"];

// ============================================
// INSTALAÇÃO
// ============================================

self.addEventListener("install", (event) => {
  console.log("📦 Service Worker instalando...");

  event.waitUntil(
    Promise.all([
      // Cache dos assets estáticos
      caches.open(CACHE_NAME).then((cache) => {
        console.log("📦 Cacheando assets estáticos...");
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn("⚠️ Erro ao cachear alguns assets:", err);
          // Não falha completamente se algum asset falhar
        });
      }),
      // Criar caches separados para diferentes tipos de conteúdo
      caches.open(ASSETS_CACHE),
      caches.open(API_CACHE),
      caches.open(IMAGES_CACHE),
      caches.open(DYNAMIC_CACHE),
    ]).then(() => {
      console.log("✅ Service Worker instalado com sucesso");
      return self.skipWaiting();
    }),
  );
});

// ============================================
// ATIVAÇÃO
// ============================================

self.addEventListener("activate", (event) => {
  console.log("🚀 Service Worker ativando...");

  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return (
                cacheName !== CACHE_NAME &&
                cacheName !== ASSETS_CACHE &&
                cacheName !== API_CACHE &&
                cacheName !== IMAGES_CACHE &&
                cacheName !== DYNAMIC_CACHE
              );
            })
            .map((cacheName) => {
              console.log(`🗑️ Removendo cache antigo: ${cacheName}`);
              return caches.delete(cacheName);
            }),
        );
      }),
      // Reivindicar controle imediato
      self.clients.claim(),
    ]),
  );
});

// ============================================
// ESTRATÉGIAS DE CACHE
// ============================================

/**
 * Estratégia: Stale-While-Revalidate
 * Serve do cache imediatamente, depois atualiza em background
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        try {
          const responseClone = networkResponse.clone();
          await cache.put(request, responseClone);
        } catch (error) {
          console.warn("⚠️ Erro ao atualizar cache:", error);
        }
      }
      return networkResponse;
    })
    .catch(() => {
      // Se falhar e não tiver cache, retorna erro
      if (!cachedResponse) {
        return new Response("Offline", { status: 503 });
      }
      return cachedResponse;
    });

  // Retorna do cache imediatamente, atualiza em background
  return cachedResponse || fetchPromise;
}

/**
 * Estratégia: Cache First (para assets estáticos)
 */
async function cacheFirst(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    return networkResponse;
  } catch (error) {
    return new Response("Recurso não disponível offline", { status: 503 });
  }
}

/**
 * Estratégia: Network First (para APIs)
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(API_CACHE);
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Estratégia: Imagens (Cache First com revalidação)
 */
async function imagesStrategy(request) {
  const cache = await caches.open(IMAGES_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Revalidar em background
    fetch(request)
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          try {
            await cache.put(request, networkResponse.clone());
          } catch (e) {
            // Ignora erro ao atualizar cache
          }
        }
      })
      .catch(() => {});
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    return networkResponse;
  } catch (error) {
    // Fallback para imagem placeholder
    return new Response("", { status: 404 });
  }
}

// ============================================
// INTERCEPTAÇÃO DE REQUISIÇÕES
// ============================================

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorar requisições do Supabase (exceto GET)
  if (url.hostname.includes("supabase.co")) {
    if (request.method === "GET") {
      // Cache de requisições GET da API
      const isApiRoute = API_ROUTES.some((route) =>
        url.pathname.includes(route),
      );
      if (isApiRoute) {
        event.respondWith(networkFirst(request));
        return;
      }
    }
    // Outros métodos (POST, PUT, DELETE) não são cacheados
    event.respondWith(fetch(request));
    return;
  }

  // Requisições de navegação (HTML)
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .match(BASE_PATH + "index.html")
        .then((response) => {
          return response || fetch(request);
        })
        .catch(() => {
          return caches.match(BASE_PATH + "index.html");
        }),
    );
    return;
  }

  // Assets estáticos (.js, .css)
  if (url.pathname.match(/\.(js|css|json)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Imagens
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
    event.respondWith(imagesStrategy(request));
    return;
  }

  // API dinâmica
  if (url.pathname.includes("/api/") || url.pathname.includes("/rest/v1/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ============================================
// NOTIFICAÇÕES PUSH
// ============================================

self.addEventListener("push", (event) => {
  console.log("📨 Notificação push recebida:", event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    // Se não for JSON, trata como texto
    data = {
      title: event.data ? event.data.text() : "Nova notificação",
      body: "",
      icon: "/assets/icons/icon-192x192.png",
      badge: "/assets/icons/icon-192x192.png",
      tag: "notification",
      requireInteraction: true,
      data: {},
    };
  }

  const options = {
    body: data.body || "Você tem uma nova notificação",
    icon: data.icon || "/assets/icons/icon-192x192.png",
    badge: data.badge || "/assets/icons/icon-192x192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "notification-" + Date.now(),
    requireInteraction:
      data.requireInteraction !== undefined ? data.requireInteraction : true,
    renotify: true,
    data: data.data || {},
    actions: data.actions || [
      {
        action: "open",
        title: "Abrir",
      },
      {
        action: "dismiss",
        title: "Dispensar",
      },
    ],
  };

  // Adicionar ações específicas para retificações
  if (data.type === "retificacao") {
    options.actions = [
      {
        action: "open",
        title: "Ver Retificação",
      },
      {
        action: "dismiss",
        title: "Dispensar",
      },
    ];
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Guarda Municipal",
      options,
    ),
  );
});

// ============================================
// INTERAÇÃO COM NOTIFICAÇÕES
// ============================================

self.addEventListener("notificationclick", (event) => {
  console.log("📨 Clique na notificação:", event);

  const notification = event.notification;
  const action = event.action;

  notification.close();

  if (action === "dismiss") {
    // Fecha a notificação sem ação
    return;
  }

  // Abrir a aplicação
  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Se já tem uma janela aberta, foca nela
        for (const client of clientList) {
          if (client.url.includes("/") && "focus" in client) {
            client.focus();
            // Se tem um link para navegar
            if (notification.data && notification.data.link) {
              client.postMessage({
                type: "navigate",
                url: notification.data.link,
              });
            }
            return;
          }
        }

        // Se não tem janela aberta, abre uma nova
        if (clients.openWindow) {
          const url = notification.data?.link || "/";
          return clients.openWindow(url);
        }
      }),
  );
});

// ============================================
// BACKGROUND SYNC
// ============================================

self.addEventListener("sync", (event) => {
  console.log("🔄 Background sync:", event.tag);

  if (event.tag === "sync-ocorrencias") {
    event.waitUntil(syncOcorrencias());
  } else if (event.tag === "sync-abordagens") {
    event.waitUntil(syncAbordagens());
  } else if (event.tag === "sync-all") {
    event.waitUntil(syncAll());
  }
});

// Função para sincronizar ocorrências pendentes
async function syncOcorrencias() {
  console.log("🔄 Sincronizando ocorrências pendentes...");
  try {
    const cache = await caches.open(API_CACHE);
    const requests = await cache.keys();

    for (const request of requests) {
      if (request.url.includes("/ocorrencias") && request.method === "POST") {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.delete(request);
            console.log("✅ Ocorrência sincronizada:", request.url);
          }
        } catch (error) {
          console.warn("⚠️ Erro ao sincronizar ocorrência:", error);
        }
      }
    }
  } catch (error) {
    console.error("❌ Erro na sincronização de ocorrências:", error);
  }
}

// Função para sincronizar abordagens pendentes
async function syncAbordagens() {
  console.log("🔄 Sincronizando abordagens pendentes...");
  try {
    const cache = await caches.open(API_CACHE);
    const requests = await cache.keys();

    for (const request of requests) {
      if (request.url.includes("/abordagens") && request.method === "POST") {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            await cache.delete(request);
            console.log("✅ Abordagem sincronizada:", request.url);
          }
        } catch (error) {
          console.warn("⚠️ Erro ao sincronizar abordagem:", error);
        }
      }
    }
  } catch (error) {
    console.error("❌ Erro na sincronização de abordagens:", error);
  }
}

// Sincronizar tudo
async function syncAll() {
  await syncOcorrencias();
  await syncAbordagens();
  console.log("✅ Sincronização completa finalizada");
}

// ============================================
// MENSAGENS DO CLIENTE
// ============================================

self.addEventListener("message", (event) => {
  console.log("📨 Mensagem recebida no Service Worker:", event.data);

  if (event.data && event.data.type === "CACHE_URLS") {
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache
          .addAll(urls)
          .then(() => {
            console.log("✅ URLs adicionadas ao cache:", urls.length);
          })
          .catch((error) => {
            console.warn("⚠️ Erro ao cachear URLs:", error);
          });
      }),
    );
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              if (
                cacheName !== CACHE_NAME &&
                cacheName !== ASSETS_CACHE &&
                cacheName !== API_CACHE &&
                cacheName !== IMAGES_CACHE
              ) {
                return caches.delete(cacheName);
              }
            }),
          );
        })
        .then(() => {
          console.log("✅ Cache limpo");
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true });
          }
        }),
    );
  }
});

// ============================================
// GERENCIAMENTO DE VERSÃO
// ============================================

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CHECK_VERSION") {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.match("version.json");
        })
        .then((response) => {
          if (response) {
            return response.json().then((data) => {
              if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                  version: data.version || CACHE_VERSION,
                });
              }
            });
          }
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ version: CACHE_VERSION });
          }
        }),
    );
  }
});

// ============================================
// PERIODIC BACKGROUND SYNC (se suportado)
// ============================================

// Registrar sync periódico para manter dados atualizados
if (self.registration && self.registration.periodicSync) {
  self.addEventListener("periodicsync", (event) => {
    if (event.tag === "periodic-sync") {
      console.log("🔄 Sync periódico iniciado");
      event.waitUntil(syncAll());
    }
  });
}

// ============================================
// Gerenciamento de Erros
// ============================================

self.addEventListener("error", (event) => {
  console.error("❌ Erro no Service Worker:", event.message);
  // Poderia enviar para um serviço de monitoramento
});

// ============================================
// LOG DE EVENTOS IMPORTANTES
// ============================================

console.log(`📦 Service Worker ${CACHE_VERSION} carregado`);
console.log(`📂 Cache principal: ${CACHE_NAME}`);
console.log(`📂 Cache de assets: ${ASSETS_CACHE}`);
console.log(`📂 Cache de API: ${API_CACHE}`);
console.log(`📂 Cache de imagens: ${IMAGES_CACHE}`);
console.log(`📂 Cache dinâmico: ${DYNAMIC_CACHE}`);
