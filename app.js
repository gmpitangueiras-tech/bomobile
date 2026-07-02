/**
 * ============================================
 * APLICAÇÃO PRINCIPAL
 * ============================================
 */

class App {
  constructor() {
    this.initialized = false;
  }

  /**
   * Inicializa a aplicação
   */
  async init() {
    if (this.initialized) return;

    console.log(
      `🚀 Iniciando Sistema Guarda Municipal - ${CONFIG.MUNICIPIO}/${CONFIG.ESTADO}`,
    );
    console.log(`📱 Versão: ${CONFIG.VERSAO}`);

    // Inicializa gerenciador de autenticação
    await authManager.init();

    // Verifica se está logado
    if (authManager.isLoggedIn()) {
      console.log("👤 Usuário logado:", authManager.getUser()?.nome_completo);
    }

    // Configura service worker para PWA
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("✅ Service Worker registrado com sucesso");
          })
          .catch((err) => {
            console.log("❌ Erro ao registrar Service Worker:", err);
          });
      });
    }

    // Configura detecção de conexão
    this.setupConnectionMonitoring();

    this.initialized = true;
    console.log("✅ Aplicação inicializada com sucesso");
  }

  /**
   * Configura monitoramento de conexão
   */
  setupConnectionMonitoring() {
    const updateStatus = () => {
      const status = navigator.onLine ? "online" : "offline";
      const statusElements = document.querySelectorAll(".status-conexao");

      statusElements.forEach((el) => {
        el.className = `status-conexao ${status}`;
        const ponto = el.querySelector(".ponto");
        const texto = el.querySelector(".texto");
        if (texto) {
          texto.textContent = status === "online" ? "Online" : "Offline";
        }
      });
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();

    // Verifica conexão a cada 30 segundos
    setInterval(updateStatus, 30000);
  }

  /**
   * Navega para uma página
   */
  navigateTo(page) {
    window.location.href = page;
  }

  /**
   * Mostra loading global
   */
  showLoading() {
    const overlay = document.createElement("div");
    overlay.id = "globalLoading";
    overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            flex-direction: column;
        `;
    overlay.innerHTML = `
            <div class="spinner" style="width: 40px; height: 40px; border-width: 4px; border-color: var(--azul-bandeira);"></div>
            <p style="margin-top: 16px; color: var(--cinza-escuro);">Carregando...</p>
        `;
    document.body.appendChild(overlay);
  }

  /**
   * Remove loading global
   */
  hideLoading() {
    const overlay = document.getElementById("globalLoading");
    if (overlay) overlay.remove();
  }
}

// Instância global
const app = new App();

// Inicializa quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});

// Torna acessível globalmente
window.app = app;
window.authManager = authManager;
window.supabaseClient = supabaseClient;
