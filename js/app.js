/**
 * ============================================
 * APLICAÇÃO PRINCIPAL
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

/**
 * Classe principal da aplicação
 * Gerencia inicialização, navegação, status de conexão e ciclo de vida
 */
class App {
  constructor() {
    this.initialized = false;
    this.startTime = Date.now();
    this.version = CONFIG.VERSAO;
    this.municipio = CONFIG.MUNICIPIO;
    this.estado = CONFIG.ESTADO;
    this.syncInterval = null;
    this.connectionCheckInterval = null;
    this.pendingSyncs = 0;
    this.isOnline = navigator.onLine;
  }

  /**
   * Inicializa a aplicação
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      console.warn("⚠️ Aplicação já inicializada");
      return;
    }

    console.log("🚀 ========================================");
    console.log(`🚀 Iniciando Sistema Guarda Municipal`);
    console.log(`📍 ${this.municipio} - ${this.estado}`);
    console.log(`📱 Versão: ${this.version}`);
    console.log(`🕐 ${new Date().toLocaleString("pt-BR")}`);
    console.log("🚀 ========================================");

    try {
      // 1. Aguarda o DOM estar pronto
      await this.aguardarDOM();

      // 2. Verifica dependências
      this.verificarDependencias();

      // 3. Aguarda o Supabase carregar
      await this.aguardarSupabase();

      // 4. Inicializa o gerenciador de autenticação
      await authManager.init();

      // 5. Inicializa o gerenciador de banco de dados local
      if (typeof dbManager !== "undefined") {
        await dbManager.init();
        console.log("✅ Database Manager inicializado");
      } else {
        console.warn("⚠️ Database Manager não encontrado");
      }

      // 6. Inicializa o gerenciador de sincronização
      if (typeof syncManager !== "undefined") {
        await syncManager.init();
        console.log("✅ Sync Manager inicializado");
      } else {
        console.warn("⚠️ Sync Manager não encontrado");
      }

      // 7. Inicializa o gerenciador de ocorrências
      if (typeof ocorrenciaManager !== "undefined") {
        await ocorrenciaManager.init();
        console.log("✅ Ocorrência Manager inicializado");
      } else {
        console.warn("⚠️ Ocorrência Manager não encontrado");
      }

      // 8. Configura listeners
      this.setupListeners();

      // 9. Configura monitoramento de conexão
      this.setupConnectionMonitoring();

      // 10. Configura sincronização automática
      this.setupAutoSync();

      // 11. Configura Service Worker
      this.setupServiceWorker();

      // 12. Verifica se há atualizações
      this.checkForUpdates();

      // 13. Registra a sessão (apenas se authManager estiver disponível)
      if (
        typeof authManager !== "undefined" &&
        typeof authManager.isLoggedIn === "function"
      ) {
        this.registrarSessao();
      } else {
        console.warn("⚠️ AuthManager não disponível - aguardando...");
        // Tenta novamente após 2 segundos
        setTimeout(() => {
          if (
            typeof authManager !== "undefined" &&
            typeof authManager.isLoggedIn === "function"
          ) {
            this.registrarSessao();
          }
        }, 2000);
      }

      this.initialized = true;

      const loadTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
      console.log(`✅ Aplicação inicializada com sucesso (${loadTime}s)`);
      console.log("🚀 ========================================");
    } catch (error) {
      console.error("❌ Erro ao inicializar aplicação:", error);
      this.mostrarErro(
        "Erro ao iniciar o sistema. Verifique sua conexão e tente novamente.",
      );
    }
  }

  /**
   * Aguarda o DOM estar pronto
   * @returns {Promise<void>}
   */
  async aguardarDOM() {
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      return;
    }

    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve);
    });
  }

  /**
   * Aguarda o Supabase carregar
   * @returns {Promise<void>}
   */
  async aguardarSupabase() {
    let tentativas = 0;
    const maxTentativas = 15;
    const intervalo = 500;

    return new Promise((resolve) => {
      const verificar = () => {
        tentativas++;

        if (typeof supabase !== "undefined" && supabase.createClient) {
          console.log("✅ Supabase disponível");
          resolve();
          return;
        }

        if (tentativas >= maxTentativas) {
          console.warn("⚠️ Supabase não disponível após múltiplas tentativas");
          resolve(); // Continua mesmo sem Supabase
          return;
        }

        console.log(
          `⏳ Aguardando Supabase... (${tentativas}/${maxTentativas})`,
        );
        setTimeout(verificar, intervalo);
      };

      verificar();
    });
  }

  /**
   * Verifica dependências necessárias
   */
  verificarDependencias() {
    const dependencias = {
      CONFIG: typeof CONFIG !== "undefined",
      supabaseClient: typeof supabaseClient !== "undefined",
      authManager: typeof authManager !== "undefined",
    };

    let todosOk = true;
    console.log("📦 Verificando dependências:");

    for (const [nome, ok] of Object.entries(dependencias)) {
      console.log(`  ${ok ? "✅" : "❌"} ${nome}`);
      if (!ok) todosOk = false;
    }

    if (!todosOk) {
      console.warn("⚠️ Algumas dependências não estão disponíveis");
    }

    return todosOk;
  }

  /**
   * Configura listeners de eventos
   */
  setupListeners() {
    // Listener para mudanças de autenticação
    if (
      typeof authManager !== "undefined" &&
      typeof authManager.onAuthChange === "function"
    ) {
      authManager.onAuthChange((event, data) => {
        console.log("🔔 Evento de autenticação:", event);

        if (event === "login") {
          this.onUserLogin(data);
        } else if (event === "logout") {
          this.onUserLogout();
        }
      });
    } else {
      console.warn("⚠️ AuthManager não disponível para configurar listeners");
    }

    // Listener para mensagens do Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data;
        if (data.type === "SYNC_STARTED") {
          console.log("🔄 Sincronização iniciada pelo Service Worker");
          this.pendingSyncs++;
        } else if (data.type === "SYNC_COMPLETED") {
          console.log("✅ Sincronização concluída pelo Service Worker");
          this.pendingSyncs = Math.max(0, this.pendingSyncs - 1);
        } else if (data.type === "SYNC_ERROR") {
          console.error("❌ Erro na sincronização pelo Service Worker");
        }
      });
    }

    // Listener para visibilidade da página
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("👀 Página ficou visível");
        // Verifica sincronizações pendentes
        if (navigator.onLine) {
          this.verificarSincronizacoesPendentes();
        }
      }
    });

    // Listener para erro global
    window.addEventListener("error", (event) => {
      console.error("❌ Erro global:", event.message);
      if (event.error) {
        console.error("Detalhes:", event.error);
      }
    });

    // Listener para promise não tratada
    window.addEventListener("unhandledrejection", (event) => {
      console.error("❌ Promise não tratada:", event.reason);
    });
  }

  /**
   * Configura monitoramento de conexão
   */
  setupConnectionMonitoring() {
    const updateStatus = () => {
      this.isOnline = navigator.onLine;

      const statusElements = document.querySelectorAll(".status-conexao");
      statusElements.forEach((el) => {
        el.className = `status-conexao ${this.isOnline ? "online" : "offline"}`;
        const ponto = el.querySelector(".ponto");
        const texto = el.querySelector(".texto");
        if (ponto) {
          ponto.style.background = this.isOnline
            ? "var(--verde-bandeira)"
            : "#E65100";
        }
        if (texto) {
          texto.textContent = this.isOnline ? "Online" : "Offline";
        }
      });

      // Atualiza badges de status
      const badges = document.querySelectorAll(".status-badge");
      badges.forEach((el) => {
        el.textContent = this.isOnline ? "🟢 Online" : "🟡 Offline";
        el.className = `status-badge ${this.isOnline ? "online" : "offline"}`;
      });
    };

    window.addEventListener("online", () => {
      console.log("🟢 Conexão restaurada - Modo online");
      updateStatus();

      // Tenta sincronizar automaticamente
      if (window.syncManager) {
        window.syncManager.sincronizarAutomaticamente();
      }

      // Notifica o usuário
      if (
        typeof authManager !== "undefined" &&
        typeof authManager.mostrarToast === "function"
      ) {
        authManager.mostrarToast(
          "Conexão restaurada. Sincronizando dados...",
          "success",
        );
      }
    });

    window.addEventListener("offline", () => {
      console.log("🔴 Conexão perdida - Modo offline");
      updateStatus();

      // Notifica o usuário
      if (
        typeof authManager !== "undefined" &&
        typeof authManager.mostrarToast === "function"
      ) {
        authManager.mostrarToast(
          "Modo offline ativado. Os dados serão salvos localmente.",
          "warning",
        );
      }
    });

    // Atualização periódica do status
    this.connectionCheckInterval = setInterval(() => {
      if (navigator.onLine !== this.isOnline) {
        this.isOnline = navigator.onLine;
        updateStatus();
      }
    }, 30000);

    // Atualiza status inicial
    updateStatus();
  }

  /**
   * Configura sincronização automática
   */
  setupAutoSync() {
    const interval = CONFIG.SYNC_INTERVAL || 300000; // 5 minutos padrão

    this.syncInterval = setInterval(() => {
      if (
        navigator.onLine &&
        typeof authManager !== "undefined" &&
        typeof authManager.isLoggedIn === "function" &&
        authManager.isLoggedIn()
      ) {
        console.log("🔄 Executando sincronização automática...");
        this.verificarSincronizacoesPendentes();
      }
    }, interval);

    console.log(
      `⏰ Sincronização automática configurada (${interval / 1000}s)`,
    );
  }

  /**
   * Configura Service Worker
   */
  setupServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            console.log("✅ Service Worker registrado com sucesso");
            console.log("📌 Scope:", registration.scope);

            // Verifica atualizações
            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;
              console.log("🔄 Nova versão do Service Worker encontrada");

              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed") {
                  console.log("✅ Service Worker atualizado");
                  // Notifica o usuário
                  if (
                    typeof authManager !== "undefined" &&
                    typeof authManager.isLoggedIn === "function" &&
                    authManager.isLoggedIn()
                  ) {
                    if (typeof authManager.mostrarToast === "function") {
                      authManager.mostrarToast(
                        "Nova versão disponível. Atualize a página.",
                        "info",
                      );
                    }
                  }
                }
              });
            });
          })
          .catch((err) => {
            console.warn("⚠️ Falha ao registrar Service Worker:", err);
          });
      });
    } else {
      console.warn("⚠️ Service Worker não suportado neste navegador");
    }
  }

  /**
   * Verifica por atualizações do sistema
   */
  checkForUpdates() {
    // Verifica se há atualizações pendentes
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });
    }

    // Verifica versão no servidor (se houver endpoint)
    // Por enquanto, apenas log
    console.log("🔍 Verificando atualizações...");
  }

  /**
   * Registra a sessão do usuário
   */
  registrarSessao() {
    // Verifica se authManager existe e tem o método isLoggedIn
    if (
      typeof authManager !== "undefined" &&
      typeof authManager.isLoggedIn === "function"
    ) {
      if (authManager.isLoggedIn()) {
        const user = authManager.getUser();
        console.log("📋 Sessão do usuário:");
        console.log(`  👤 Nome: ${user?.nome_completo || "N/A"}`);
        console.log(`  📋 Matrícula: ${user?.matricula || "N/A"}`);
        console.log(`  🔑 Perfil: ${user?.perfil || "N/A"}`);
        console.log(`  📧 Email: ${user?.email || "N/A"}`);
        console.log(`  🕐 Login: ${new Date().toLocaleString("pt-BR")}`);
      }
    } else {
      console.warn("⚠️ AuthManager não disponível para registrar sessão");
    }
  }

  /**
   * Verifica sincronizações pendentes
   */
  async verificarSincronizacoesPendentes() {
    if (!window.syncManager) return;

    try {
      const pendentes = await window.syncManager.getPendentes();
      if (pendentes && pendentes.length > 0) {
        console.log(
          `📤 ${pendentes.length} ocorrências pendentes de sincronização`,
        );
        await window.syncManager.sincronizarAutomaticamente();
      } else {
        console.log("✅ Nenhuma ocorrência pendente de sincronização");
      }
    } catch (error) {
      console.error("❌ Erro ao verificar sincronizações:", error);
    }
  }

  /**
   * Callback quando usuário faz login
   * @param {Object} userData - Dados do usuário
   */
  onUserLogin(userData) {
    console.log("👋 Bem-vindo,", userData?.nome_completo || "Usuário");

    // Verifica sincronizações pendentes
    if (navigator.onLine) {
      setTimeout(() => {
        this.verificarSincronizacoesPendentes();
      }, 3000);
    }

    // Atualiza interface
    this.atualizarInterfaceUsuario(userData);
  }

  /**
   * Callback quando usuário faz logout
   */
  onUserLogout() {
    console.log("👋 Usuário desconectado");
    this.atualizarInterfaceUsuario(null);
  }

  /**
   * Atualiza interface com dados do usuário
   * @param {Object} userData - Dados do usuário ou null
   */
  atualizarInterfaceUsuario(userData) {
    const userElements = document.querySelectorAll(
      ".user-info, .user-name, .user-matricula, .user-avatar",
    );

    userElements.forEach((el) => {
      if (userData) {
        if (el.classList.contains("user-name")) {
          el.textContent = userData.nome_completo || "Usuário";
        } else if (el.classList.contains("user-matricula")) {
          el.textContent = userData.matricula || "";
        } else if (el.classList.contains("user-avatar")) {
          el.textContent = userData.nome_completo?.charAt(0) || "U";
        } else if (el.classList.contains("user-info")) {
          // Atualiza informações completas
          const nome = el.querySelector(".user-name");
          const matricula = el.querySelector(".user-matricula");
          if (nome) nome.textContent = userData.nome_completo || "Usuário";
          if (matricula) matricula.textContent = userData.matricula || "";
        }
      } else {
        if (el.classList.contains("user-name")) {
          el.textContent = "Usuário";
        } else if (el.classList.contains("user-matricula")) {
          el.textContent = "";
        } else if (el.classList.contains("user-avatar")) {
          el.textContent = "?";
        }
      }
    });
  }

  /**
   * Mostra erro na tela
   * @param {string} mensagem - Mensagem de erro
   */
  mostrarErro(mensagem) {
    const container = document.getElementById("page-content");
    if (!container) return;

    container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;">
                <div style="font-size:64px;margin-bottom:20px;">⚠️</div>
                <h2 style="color:var(--azul-bandeira);">Erro ao carregar</h2>
                <p style="color:var(--cinza-escuro);margin-bottom:8px;">${mensagem}</p>
                <p style="color:var(--cinza-medio);font-size:14px;margin-bottom:20px;">
                    Verifique sua conexão com a internet e tente novamente.
                </p>
                <button onclick="location.reload()" class="btn-primario" style="max-width:200px;">
                    🔄 Tentar Novamente
                </button>
                <div style="margin-top:20px;font-size:12px;color:var(--cinza-medio);">
                    Guarda Municipal de ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}
                    <br>
                    v${CONFIG.VERSAO}
                </div>
            </div>
        `;
  }

  /**
   * Mostra loading global
   */
  showLoading() {
    let overlay = document.getElementById("globalLoading");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "globalLoading";
      overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255,255,255,0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                flex-direction: column;
                transition: all 0.3s ease;
            `;
      overlay.innerHTML = `
                <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; border-color: var(--azul-bandeira);"></div>
                <p style="margin-top: 16px; color: var(--cinza-escuro); font-weight: 500;">Carregando...</p>
                <p style="margin-top: 4px; color: var(--cinza-medio); font-size: 13px;">Guarda Municipal de ${CONFIG.MUNICIPIO}</p>
            `;
      document.body.appendChild(overlay);
    }

    overlay.style.display = "flex";
  }

  /**
   * Remove loading global
   */
  hideLoading() {
    const overlay = document.getElementById("globalLoading");
    if (overlay) {
      overlay.style.display = "none";
    }
  }

  /**
   * Navega para uma página
   * @param {string} page - Caminho da página
   * @param {Object} params - Parâmetros da URL
   */
  navigateTo(page, params = {}) {
    let url = page;

    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += "?" + searchParams.toString();
    }

    window.location.href = url;
  }

  /**
   * Recarrega a página atual
   */
  reload() {
    window.location.reload();
  }

  /**
   * Obtém o tempo de atividade da aplicação
   * @returns {number} Tempo em segundos
   */
  getUptime() {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Obtém informações do sistema
   * @returns {Object} Informações do sistema
   */
  getSystemInfo() {
    return {
      version: this.version,
      municipio: this.municipio,
      estado: this.estado,
      uptime: this.getUptime(),
      online: this.isOnline,
      authenticated:
        typeof authManager !== "undefined" &&
        typeof authManager.isLoggedIn === "function"
          ? authManager.isLoggedIn()
          : false,
      user:
        typeof authManager !== "undefined" &&
        typeof authManager.getUser === "function"
          ? authManager.getUser()
          : null,
      pendingSyncs: this.pendingSyncs,
      browser: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Destroi a aplicação (limpa recursos)
   */
  destroy() {
    console.log("🔄 Destruindo aplicação...");

    // Limpa intervalos
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    // Remove listeners
    document.removeEventListener("visibilitychange", this.setupListeners);
    window.removeEventListener("error", this.setupListeners);
    window.removeEventListener("unhandledrejection", this.setupListeners);
    window.removeEventListener("online", this.setupConnectionMonitoring);
    window.removeEventListener("offline", this.setupConnectionMonitoring);

    this.initialized = false;
    console.log("✅ Aplicação destruída com sucesso");
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

// Cria a instância global
const app = new App();

// 🔴 EXPÕE PARA O WINDOW (GLOBAL)
window.app = app;

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================

// Inicializa quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM carregado, iniciando aplicação...");
  app.init();
});

// Inicializa imediatamente se o DOM já estiver pronto
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  console.log("📄 DOM já estava pronto, iniciando aplicação...");
  app.init();
}

// ============================================
// EXPORTA PARA MÓDULOS (CASO USE)
// ============================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = { app };
}

if (typeof define === "function" && define.amd) {
  define([], function () {
    return { app };
  });
}

// ============================================
// LOG DE INICIALIZAÇÃO
// ============================================

console.log("📦 App principal carregado");
console.log(`📱 Sistema: ${CONFIG.GUARDA_NOME}`);
console.log(`📍 Município: ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}`);
console.log(`📌 Versão: ${CONFIG.VERSAO}`);
console.log("✅ App pronto para inicialização");
