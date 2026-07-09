// js/session.js - Gerenciador de Sessão com Logout Automático

class SessionManager {
  constructor() {
    this.timeout = 30 * 60 * 1000; // 30 minutos em milissegundos
    this.timer = null;
    this.lastActivity = Date.now();
    this.initialized = false;
    this.events = ["click", "touchstart", "keydown", "scroll", "mousemove"];
    this.warningShown5min = false;
    this.warningShown1min = false;
  }

  init(timeoutMinutes = 30) {
    if (this.initialized) return;

    this.timeout = timeoutMinutes * 60 * 1000;
    this.lastActivity = Date.now();
    this.warningShown5min = false;
    this.warningShown1min = false;

    // Configurar listeners de atividade
    this.setupActivityListeners();

    // Verificar inatividade a cada 30 segundos (mais responsivo)
    this.timer = setInterval(() => this.checkInactivity(), 30000);

    this.initialized = true;
    console.log(
      `⏰ Sessão configurada: ${timeoutMinutes} minutos de inatividade`,
    );
  }

  setupActivityListeners() {
    const resetTimer = () => {
      this.lastActivity = Date.now();
      // Resetar o contador no localStorage também (para múltiplas abas)
      localStorage.setItem("session_last_activity", Date.now().toString());
      // Resetar flags de aviso
      this.warningShown5min = false;
      this.warningShown1min = false;
    };

    // Adicionar listeners com passive: true para melhor performance
    this.events.forEach((event) => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    // Monitorar quando a página ganha foco
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // Quando a página volta a ser visível, verifica se houve atividade em outras abas
        const storedActivity = parseInt(
          localStorage.getItem("session_last_activity") || "0",
        );
        if (storedActivity > this.lastActivity) {
          this.lastActivity = storedActivity;
        }
        // Resetar flags de aviso
        this.warningShown5min = false;
        this.warningShown1min = false;
      }
    });

    // Monitorar quando a página é carregada/recarregada
    window.addEventListener("load", () => {
      const storedActivity = parseInt(
        localStorage.getItem("session_last_activity") || "0",
      );
      if (storedActivity > this.lastActivity) {
        this.lastActivity = storedActivity;
      }
    });

    // Monitorar atividade em outras abas via storage
    window.addEventListener("storage", (e) => {
      if (e.key === "session_last_activity" && e.newValue) {
        const storedActivity = parseInt(e.newValue);
        if (storedActivity > this.lastActivity) {
          this.lastActivity = storedActivity;
          this.warningShown5min = false;
          this.warningShown1min = false;
        }
      }
    });
  }

  checkInactivity() {
    // Verificar se o usuário está logado
    if (typeof authManager !== "undefined" && !authManager.isLoggedIn()) {
      // Se não estiver logado, não precisa verificar inatividade
      return;
    }

    // Verificar se o usuário está na tela de login ou primeiro acesso
    const currentPage = document.querySelector(".page.active");
    if (currentPage) {
      const pageId = currentPage.id;
      if (pageId === "page-login") {
        // Não faz logout na tela de login
        return;
      }
    }

    const now = Date.now();

    // Verificar também o localStorage (para abas diferentes)
    const storedActivity = parseInt(
      localStorage.getItem("session_last_activity") || "0",
    );
    if (storedActivity > this.lastActivity) {
      this.lastActivity = storedActivity;
    }

    const totalElapsed = now - this.lastActivity;

    // Se ultrapassou o tempo limite, faz logout
    if (totalElapsed > this.timeout) {
      console.log("⏰ Sessão expirada por inatividade");
      this.performLogout();
      return;
    }

    // Avisos de expiração iminente
    const timeLeft = this.timeout - totalElapsed;

    // Aviso de 5 minutos (mostrar apenas uma vez)
    if (timeLeft < 300000 && timeLeft > 290000 && !this.warningShown5min) {
      this.warningShown5min = true;
      this.showWarningToast(
        "⏰ Sua sessão expirará em 5 minutos por inatividade",
      );
    }

    // Aviso de 1 minuto (mostrar apenas uma vez)
    if (timeLeft < 60000 && timeLeft > 50000 && !this.warningShown1min) {
      this.warningShown1min = true;
      this.showWarningToast("⏰ Sua sessão expirará em 1 minuto!");
    }
  }

  async performLogout() {
    // Limpar recursos antes de fazer logout
    this.cleanup();

    // Verificar se ainda está logado
    if (typeof authManager !== "undefined" && authManager.isLoggedIn()) {
      // Mostrar toast de expiração
      this.showWarningToast(
        "⏰ Sessão expirada por inatividade. Faça login novamente.",
      );

      try {
        // Forçar logout
        await authManager.logout();

        // Redirecionar para login
        if (typeof app !== "undefined" && app.route) {
          app.route();
        } else {
          window.location.reload();
        }
      } catch (error) {
        console.error("❌ Erro ao fazer logout automático:", error);
        // Fallback: recarregar a página
        window.location.reload();
      }
    }
  }

  showWarningToast(message) {
    if (typeof app !== "undefined" && app.showToast) {
      app.showToast(message, "warning");
    } else {
      // Fallback: usar console
      console.warn("⚠️", message);
      // Tentar criar um toast simples
      this.createFallbackToast(message);
    }
  }

  createFallbackToast(message) {
    // Criar um toast simples caso o app não esteja disponível
    const existingToast = document.querySelector(".session-toast-fallback");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.className = "session-toast-fallback";
    toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #f59e0b;
            color: #fff;
            padding: 12px 20px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 9999;
            max-width: 90%;
            text-align: center;
            animation: fadeIn 0.3s ease;
            pointer-events: none;
        `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Remover após 5 segundos
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Remover listeners
    const resetTimer = () => {
      this.lastActivity = Date.now();
      localStorage.setItem("session_last_activity", Date.now().toString());
    };

    // Não é possível remover listeners específicos facilmente,
    // mas vamos limpar o timer e marcar como não inicializado
    this.initialized = false;
    this.warningShown5min = false;
    this.warningShown1min = false;

    // Não remove o localStorage para manter a referência
    console.log("🧹 Session Manager limpo");
  }

  // Método para reiniciar o timer manualmente (ex: após login)
  resetSession() {
    this.lastActivity = Date.now();
    localStorage.setItem("session_last_activity", Date.now().toString());
    this.warningShown5min = false;
    this.warningShown1min = false;
    console.log("🔄 Sessão resetada manualmente");
  }

  // Método para obter o tempo restante em minutos
  getTimeRemaining() {
    const now = Date.now();
    const storedActivity = parseInt(
      localStorage.getItem("session_last_activity") || "0",
    );
    const lastActivity = Math.max(this.lastActivity, storedActivity);
    const elapsed = now - lastActivity;
    const remaining = Math.max(0, (this.timeout - elapsed) / 60000);
    return Math.round(remaining);
  }

  // Método para obter o tempo restante formatado
  getTimeRemainingFormatted() {
    const minutes = this.getTimeRemaining();
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}min`;
    }
    return `${minutes}min`;
  }

  // Método para verificar se a sessão está ativa
  isSessionActive() {
    if (typeof authManager !== "undefined" && !authManager.isLoggedIn()) {
      return false;
    }
    const now = Date.now();
    const storedActivity = parseInt(
      localStorage.getItem("session_last_activity") || "0",
    );
    const lastActivity = Math.max(this.lastActivity, storedActivity);
    return now - lastActivity < this.timeout;
  }

  // Método para estender a sessão manualmente (ex: ação do usuário)
  extendSession() {
    this.resetSession();
    console.log("⏰ Sessão estendida");
    return true;
  }

  // Método para configurar timeout personalizado
  setTimeout(minutes) {
    if (minutes < 1) {
      console.warn("⚠️ Tempo mínimo de sessão é 1 minuto");
      minutes = 1;
    }
    this.timeout = minutes * 60 * 1000;
    console.log(`⏰ Timeout da sessão alterado para ${minutes} minutos`);
    // Resetar flags de aviso
    this.warningShown5min = false;
    this.warningShown1min = false;
  }

  // Método para pausar a verificação (ex: durante uploads longos)
  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("⏸️ Verificação de inatividade pausada");
    }
  }

  // Método para retomar a verificação
  resume() {
    if (!this.timer && this.initialized) {
      this.timer = setInterval(() => this.checkInactivity(), 30000);
      console.log("▶️ Verificação de inatividade retomada");
    }
  }

  // Método para destruir completamente o SessionManager
  destroy() {
    this.cleanup();
    this.initialized = false;
    localStorage.removeItem("session_last_activity");
    console.log("🗑️ Session Manager destruído");
  }
}

// Instância global
const sessionManager = new SessionManager();
window.sessionManager = sessionManager;

console.log("⏰ Session Manager carregado");
