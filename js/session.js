/**
 * GERENCIADOR DE SESSÃO - Logout Automático com Reconhecimento de Movimento
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Logout automático por inatividade
 * - Avisos de expiração (5min e 1min)
 * - Reconhecimento de movimento via GPS para estender sessão
 * - Sincronização entre múltiplas abas
 * - Reset manual de sessão
 *
 * MELHORIAS APLICADAS:
 * - Expiração com reconhecimento de movimento (estende sessão se o guarda estiver em movimento)
 * - Detecção de movimento significativo (>100 metros)
 * - Estensão automática de sessão baseada em atividade física
 * - Integração com GPS contínuo do app
 * - Configuração dinâmica do timeout
 *
 * Depende de: authManager (global), navigator.geolocation
 */

// ============================================
// CLASSE SESSION MANAGER
// ============================================

class SessionManager {
  constructor() {
    this.timeout = 30 * 60 * 1000; // 30 minutos em milissegundos
    this.timer = null;
    this.lastActivity = Date.now();
    this.initialized = false;
    this.events = ["click", "touchstart", "keydown", "scroll", "mousemove"];
    this.warningShown5min = false;
    this.warningShown1min = false;
    this.gpsWatchId = null;
    this.ultimaLocalizacao = null;
    this.movementDetected = false;
    this.lastMovementCheck = Date.now();
    this.movementThreshold = 100; // metros
    this.checkInterval = 30000; // 30 segundos
    this.isPaused = false;
    this.timeoutConfig = {
      default: 30,
      min: 5,
      max: 120,
    };
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  /**
   * Inicializa o gerenciador de sessão
   * @param {number} timeoutMinutes - Tempo de timeout em minutos (padrão: 30)
   */
  init(timeoutMinutes = 30) {
    if (this.initialized) return;

    // Validar timeout
    if (timeoutMinutes < this.timeoutConfig.min) {
      console.warn(
        `⚠️ Timeout mínimo é ${this.timeoutConfig.min} minutos. Ajustando...`,
      );
      timeoutMinutes = this.timeoutConfig.min;
    }
    if (timeoutMinutes > this.timeoutConfig.max) {
      console.warn(
        `⚠️ Timeout máximo é ${this.timeoutConfig.max} minutos. Ajustando...`,
      );
      timeoutMinutes = this.timeoutConfig.max;
    }

    this.timeout = timeoutMinutes * 60 * 1000;
    this.lastActivity = Date.now();
    this.warningShown5min = false;
    this.warningShown1min = false;

    // Configurar listeners de atividade
    this.setupActivityListeners();

    // Iniciar verificação de inatividade
    this.timer = setInterval(() => this.checkInactivity(), 30000);

    // Iniciar monitoramento de GPS para movimento
    this.iniciarMonitoramentoGPS();

    // Configurar listener para eventos de localização do app
    this.setupLocationListener();

    this.initialized = true;
    console.log(
      `⏰ Sessão configurada: ${timeoutMinutes} minutos de inatividade com reconhecimento de movimento`,
    );
  }

  // ============================================
  // MONITORAMENTO DE MOVIMENTO (GPS)
  // ============================================

  /**
   * Inicia o monitoramento de GPS para detectar movimento
   */
  iniciarMonitoramentoGPS() {
    if (!navigator.geolocation) {
      console.warn(
        "⚠️ Geolocalização não disponível para monitoramento de movimento",
      );
      return;
    }

    try {
      // Verificar se já está monitorando
      if (this.gpsWatchId) {
        navigator.geolocation.clearWatch(this.gpsWatchId);
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      };

      this.gpsWatchId = navigator.geolocation.watchPosition(
        (position) => this.handleLocationUpdate(position),
        (error) => {
          console.warn(
            "⚠️ Erro no GPS para monitoramento de sessão:",
            error.message,
          );
        },
        options,
      );

      console.log("📍 Monitoramento de movimento GPS iniciado para sessão");
    } catch (error) {
      console.warn("⚠️ Erro ao iniciar monitoramento GPS:", error);
    }
  }

  /**
   * Manipula atualização de localização do GPS
   * @param {GeolocationPosition} position - Posição do GPS
   */
  handleLocationUpdate(position) {
    const localizacao = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    // Verificar se houve movimento significativo
    if (this.ultimaLocalizacao) {
      const distancia = this.calcularDistancia(
        this.ultimaLocalizacao.latitude,
        this.ultimaLocalizacao.longitude,
        localizacao.latitude,
        localizacao.longitude,
      );

      if (distancia > this.movementThreshold) {
        this.movementDetected = true;
        this.lastMovementCheck = Date.now();

        // Resetar temporizador de inatividade
        this.resetSession();
        console.log(
          `🚶 Movimento detectado (${distancia.toFixed(0)}m) - Sessão estendida`,
        );

        // Resetar flags de aviso
        this.warningShown5min = false;
        this.warningShown1min = false;
      }
    }

    this.ultimaLocalizacao = localizacao;
  }

  /**
   * Configura listener para eventos de localização do app
   */
  setupLocationListener() {
    document.addEventListener("localizacao_atualizada", (e) => {
      const localizacao = e.detail;
      if (localizacao) {
        // Verificar movimento
        if (this.ultimaLocalizacao) {
          const distancia = this.calcularDistancia(
            this.ultimaLocalizacao.latitude,
            this.ultimaLocalizacao.longitude,
            localizacao.latitude,
            localizacao.longitude,
          );

          if (distancia > this.movementThreshold) {
            this.movementDetected = true;
            this.lastMovementCheck = Date.now();
            this.resetSession();
            console.log(
              `🚶 Movimento detectado via app (${distancia.toFixed(0)}m) - Sessão estendida`,
            );
            this.warningShown5min = false;
            this.warningShown1min = false;
          }
        }
        this.ultimaLocalizacao = localizacao;
      }
    });
  }

  /**
   * Calcula a distância entre dois pontos em metros (fórmula de Haversine)
   * @param {number} lat1 - Latitude do ponto 1
   * @param {number} lon1 - Longitude do ponto 1
   * @param {number} lat2 - Latitude do ponto 2
   * @param {number} lon2 - Longitude do ponto 2
   * @returns {number} Distância em metros
   */
  calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ============================================
  // ATIVIDADE DO USUÁRIO
  // ============================================

  /**
   * Configura listeners para detectar atividade do usuário
   */
  setupActivityListeners() {
    const resetTimer = () => {
      this.lastActivity = Date.now();
      localStorage.setItem("session_last_activity", Date.now().toString());

      // Resetar flags de aviso
      this.warningShown5min = false;
      this.warningShown1min = false;

      // Se estava pausado, retomar
      if (this.isPaused) {
        this.resume();
      }
    };

    // Adicionar listeners com passive: true para melhor performance
    this.events.forEach((event) => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    // Monitorar quando a página ganha foco
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        const storedActivity = parseInt(
          localStorage.getItem("session_last_activity") || "0",
        );
        if (storedActivity > this.lastActivity) {
          this.lastActivity = storedActivity;
        }
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

  // ============================================
  // VERIFICAÇÃO DE INATIVIDADE
  // ============================================

  /**
   * Verifica se o usuário está inativo e deve ser desconectado
   */
  checkInactivity() {
    // Se estiver pausado, não verifica
    if (this.isPaused) return;

    // Verificar se o usuário está logado
    if (typeof authManager !== "undefined" && !authManager.isLoggedIn()) {
      return;
    }

    // Verificar se está na tela de login
    const currentPage = document.querySelector(".page.active");
    if (currentPage) {
      const pageId = currentPage.id;
      if (pageId === "page-login") {
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

    // Verificar se houve movimento recente (últimos 2 minutos)
    const timeSinceMovement = now - this.lastMovementCheck;
    if (this.movementDetected && timeSinceMovement < 120000) {
      // Se houve movimento nos últimos 2 minutos, resetar contagem
      this.lastActivity = now;
      localStorage.setItem("session_last_activity", now.toString());
      this.movementDetected = false;
      console.log("🚶 Movimento recente detectado - sessão mantida");
      return;
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

  // ============================================
  // LOGOUT
  // ============================================

  /**
   * Realiza o logout do usuário
   */
  async performLogout() {
    this.cleanup();

    if (typeof authManager !== "undefined" && authManager.isLoggedIn()) {
      this.showWarningToast(
        "⏰ Sessão expirada por inatividade. Faça login novamente.",
      );

      try {
        await authManager.logout();

        if (typeof window.app !== "undefined" && window.app.route) {
          window.app.route();
        } else {
          window.location.reload();
        }
      } catch (error) {
        console.error("❌ Erro ao fazer logout automático:", error);
        window.location.reload();
      }
    }
  }

  // ============================================
  // AVISOS (TOASTS)
  // ============================================

  /**
   * Exibe um aviso de expiração da sessão
   * @param {string} message - Mensagem do aviso
   */
  showWarningToast(message) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast(message, "warning");
    } else {
      console.warn("⚠️", message);
      this.createFallbackToast(message);
    }
  }

  /**
   * Cria um toast de fallback caso o app não esteja disponível
   * @param {string} message - Mensagem do toast
   */
  createFallbackToast(message) {
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

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // ============================================
  // CONTROLE DE SESSÃO
  // ============================================

  /**
   * Reseta o timer da sessão
   */
  resetSession() {
    this.lastActivity = Date.now();
    localStorage.setItem("session_last_activity", Date.now().toString());
    this.warningShown5min = false;
    this.warningShown1min = false;
    this.movementDetected = false;
    console.log("🔄 Sessão resetada manualmente");
  }

  /**
   * Limpa os recursos do gerenciador
   */
  cleanup() {
    // Limpar timer
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Limpar watch de GPS
    if (this.gpsWatchId) {
      try {
        navigator.geolocation.clearWatch(this.gpsWatchId);
      } catch (e) {
        // Ignora erro ao limpar watch
      }
      this.gpsWatchId = null;
    }

    this.initialized = false;
    this.warningShown5min = false;
    this.warningShown1min = false;
    this.movementDetected = false;
    this.ultimaLocalizacao = null;

    console.log("🧹 Session Manager limpo");
  }

  /**
   * Pausa a verificação de inatividade (para uploads longos, etc.)
   */
  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.isPaused = true;
      console.log("⏸️ Verificação de inatividade pausada");
    }
  }

  /**
   * Retoma a verificação de inatividade
   */
  resume() {
    if (!this.timer && this.initialized) {
      this.timer = setInterval(() => this.checkInactivity(), 30000);
      this.isPaused = false;
      console.log("▶️ Verificação de inatividade retomada");
    }
  }

  /**
   * Destroi completamente o SessionManager
   */
  destroy() {
    this.cleanup();
    this.initialized = false;
    localStorage.removeItem("session_last_activity");
    console.log("🗑️ Session Manager destruído");
  }

  // ============================================
  // CONFIGURAÇÃO
  // ============================================

  /**
   * Configura o timeout da sessão dinamicamente
   * @param {number} minutes - Tempo em minutos
   */
  setTimeout(minutes) {
    if (minutes < this.timeoutConfig.min) {
      console.warn(`⚠️ Tempo mínimo é ${this.timeoutConfig.min} minutos`);
      minutes = this.timeoutConfig.min;
    }
    if (minutes > this.timeoutConfig.max) {
      console.warn(`⚠️ Tempo máximo é ${this.timeoutConfig.max} minutos`);
      minutes = this.timeoutConfig.max;
    }

    this.timeout = minutes * 60 * 1000;
    console.log(`⏰ Timeout da sessão alterado para ${minutes} minutos`);

    // Resetar flags de aviso
    this.warningShown5min = false;
    this.warningShown1min = false;

    // Resetar sessão para aplicar novo timeout
    this.resetSession();
  }

  /**
   * Configura o limite de movimento para estender a sessão
   * @param {number} meters - Distância em metros (padrão: 100)
   */
  setMovementThreshold(meters = 100) {
    if (meters < 10) {
      console.warn("⚠️ Limite mínimo de movimento é 10 metros");
      meters = 10;
    }
    this.movementThreshold = meters;
    console.log(
      `🚶 Limite de movimento para estender sessão: ${meters} metros`,
    );
  }

  // ============================================
  // CONSULTA DE ESTADO
  // ============================================

  /**
   * Retorna o tempo restante em minutos
   * @returns {number} Tempo restante em minutos
   */
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

  /**
   * Retorna o tempo restante formatado
   * @returns {string} Tempo restante formatado
   */
  getTimeRemainingFormatted() {
    const minutes = this.getTimeRemaining();
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}min`;
    }
    return `${minutes}min`;
  }

  /**
   * Verifica se a sessão está ativa
   * @returns {boolean}
   */
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

  /**
   * Verifica se o usuário está em movimento
   * @returns {boolean}
   */
  isUserMoving() {
    return this.movementDetected;
  }

  /**
   * Obtém a última localização conhecida
   * @returns {Object|null} Localização {latitude, longitude}
   */
  getLastLocation() {
    return this.ultimaLocalizacao;
  }

  /**
   * Estende a sessão manualmente (sem resetar completamente)
   */
  extendSession() {
    this.resetSession();
    console.log("⏰ Sessão estendida manualmente");
    return true;
  }

  // ============================================
  // GERENCIAMENTO DE ESTADO
  // ============================================

  /**
   * Salva o estado atual da sessão (para recuperação)
   */
  saveState() {
    try {
      const state = {
        lastActivity: this.lastActivity,
        movementDetected: this.movementDetected,
        timeout: this.timeout,
        timestamp: Date.now(),
      };
      localStorage.setItem("session_state", JSON.stringify(state));
    } catch (error) {
      console.warn("Erro ao salvar estado da sessão:", error);
    }
  }

  /**
   * Restaura o estado da sessão
   */
  restoreState() {
    try {
      const saved = localStorage.getItem("session_state");
      if (saved) {
        const state = JSON.parse(saved);
        const now = Date.now();
        // Só restaura se não tiver passado mais de 5 minutos
        if (now - state.timestamp < 300000) {
          this.lastActivity = Math.max(this.lastActivity, state.lastActivity);
          this.movementDetected = state.movementDetected || false;
          if (state.timeout) {
            this.timeout = state.timeout;
          }
          console.log("♻️ Estado da sessão restaurado");
        } else {
          localStorage.removeItem("session_state");
        }
      }
    } catch (error) {
      console.warn("Erro ao restaurar estado da sessão:", error);
    }
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

const sessionManager = new SessionManager();
window.sessionManager = sessionManager;

console.log("⏰ Session Manager carregado");
