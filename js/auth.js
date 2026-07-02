/**
 * ============================================
 * GERENCIADOR DE AUTENTICAÇÃO
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

/**
 * Gerenciador de Autenticação - Gerencia login, logout, sessão e redirecionamentos
 */
class AuthManager {
  constructor() {
    this.isLoggedIn = false;
    this.userData = null;
    this.onAuthChangeCallback = null;
    this.initialized = false;
    this.loginAttempts = 0;
    this.maxLoginAttempts = 5;
    this.blockedUntil = null;
    this.currentPage = null;
    this.authListeners = [];
  }

  /**
   * Inicializa o gerenciador de autenticação
   * @returns {Promise<boolean>} True se autenticado
   */
  async init() {
    if (this.initialized) return this.isLoggedIn;

    console.log("🔐 Inicializando AuthManager...");

    try {
      // Aguarda o Supabase inicializar
      const initialized = await supabaseClient.init();

      if (initialized && supabaseClient.isAuthenticated()) {
        const userId = supabaseClient.getCurrentUser()?.id;
        if (userId) {
          const perfil = await this.carregarPerfil(userId);

          if (perfil) {
            this.isLoggedIn = true;
            this.userData = perfil;
            this.initialized = true;

            console.log("✅ Usuário autenticado:", perfil.nome_completo);
            console.log("👤 Perfil:", perfil.perfil);
            console.log("📋 Matrícula:", perfil.matricula);

            // Notifica listeners
            this.notificarAuthChange("login", perfil);

            // Redireciona
            this.redirecionarPorPerfil(perfil.perfil);
            return true;
          } else {
            // Usuário autenticado mas sem perfil - faz logout
            console.warn("⚠️ Usuário sem perfil encontrado. Fazendo logout...");
            await supabaseClient.logout();
            this.isLoggedIn = false;
            this.userData = null;
          }
        }
      }

      this.initialized = true;

      // Se não está autenticado, mostra tela de login
      this.mostrarLogin();
      console.log("👤 Usuário não autenticado");
      return false;
    } catch (error) {
      console.error("❌ Erro ao inicializar AuthManager:", error);
      this.initialized = true;
      this.mostrarLogin();
      return false;
    }
  }

  /**
   * Carrega perfil do usuário do banco
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object|null>} Dados do perfil
   */
  async carregarPerfil(userId) {
    try {
      const result = await supabaseClient.getPerfilUsuario(userId);
      if (result.success) {
        return result.data;
      }

      // Se não encontrou, tenta criar perfil padrão
      if (result.code === "not_found") {
        console.log("🔄 Criando perfil para usuário:", userId);
        return await this.criarPerfilPadrao(userId);
      }

      return null;
    } catch (error) {
      console.error("❌ Erro ao carregar perfil:", error);
      return null;
    }
  }

  /**
   * Cria perfil padrão para novo usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object|null>} Perfil criado
   */
  async criarPerfilPadrao(userId) {
    try {
      const user = supabaseClient.getCurrentUser();
      if (!user) return null;

      // Extrai matrícula do email (remove @guarda.pitangueiras.pr.gov.br)
      const email = user.email || "";
      let matricula = email.split("@")[0] || "USUARIO";

      // Remove caracteres especiais
      matricula = matricula.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

      // Se matrícula muito curta, usa parte do ID
      if (matricula.length < 4) {
        matricula = "GM" + userId.substring(0, 6).toUpperCase();
      }

      const novoPerfil = {
        nome_completo: user.user_metadata?.nome || user.email || "Usuário",
        matricula: matricula,
        cpf: "00000000000", // Será atualizado depois
        email: user.email,
        perfil: "guarda", // Perfil padrão
        status: "ativo",
      };

      const { data, error } = await supabaseClient
        .getClient()
        .from("usuarios")
        .insert([novoPerfil])
        .select()
        .single();

      if (error) {
        console.error("❌ Erro ao criar perfil:", error);
        return null;
      }

      console.log("✅ Perfil criado com sucesso para:", matricula);
      return data;
    } catch (error) {
      console.error("❌ Erro ao criar perfil:", error);
      return null;
    }
  }

  /**
   * Realiza login do usuário
   * @param {string} matricula - Matrícula ou CPF
   * @param {string} senha - Senha do usuário
   * @returns {Promise<Object>} Resultado do login
   */
  async login(matricula, senha) {
    // Verifica se o usuário está bloqueado
    if (this.isBlocked()) {
      const tempoRestante = this.getTempoBloqueio();
      this.mostrarToast(
        `Muitas tentativas. Aguarde ${Math.ceil(tempoRestante / 60)} minutos.`,
        "error",
      );
      return {
        success: false,
        error: `Muitas tentativas. Aguarde ${Math.ceil(tempoRestante / 60)} minutos.`,
      };
    }

    this.mostrarLoading(true);

    try {
      console.log("🔐 Tentando login com:", matricula);

      const result = await supabaseClient.login(matricula, senha);

      if (result.success) {
        // Resetar tentativas em caso de sucesso
        this.loginAttempts = 0;
        this.blockedUntil = null;

        // Busca perfil do usuário
        const perfil = await this.carregarPerfil(result.user.id);

        if (perfil) {
          this.isLoggedIn = true;
          this.userData = perfil;

          this.mostrarToast("Login realizado com sucesso!", "success");
          this.notificarAuthChange("login", perfil);

          // Redireciona após 1 segundo
          setTimeout(() => {
            this.redirecionarPorPerfil(perfil.perfil);
          }, 1000);

          return { success: true };
        } else {
          // Faz logout se não encontrar perfil
          await supabaseClient.logout();
          this.mostrarToast("Erro: Perfil não encontrado", "error");
          return { success: false, error: "Perfil não encontrado" };
        }
      } else {
        // Incrementa tentativas em caso de erro
        this.loginAttempts++;
        if (this.loginAttempts >= this.maxLoginAttempts) {
          this.blockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Bloqueia por 15 minutos
          this.mostrarToast("Muitas tentativas. Aguarde 15 minutos.", "error");
        } else {
          const tentativasRestantes =
            this.maxLoginAttempts - this.loginAttempts;
          this.mostrarToast(
            `${result.error}. ${tentativasRestantes} tentativas restantes.`,
            "error",
          );
        }
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("❌ Erro no login:", error);
      this.mostrarToast("Erro ao realizar login", "error");
      return { success: false, error: error.message };
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * Realiza logout do usuário
   * @returns {Promise<Object>} Resultado do logout
   */
  async logout() {
    try {
      this.mostrarLoading(true);

      const result = await supabaseClient.logout();

      if (result.success) {
        this.isLoggedIn = false;
        this.userData = null;
        this.currentPage = null;

        // Limpa dados locais
        if (window.dbManager) {
          await window.dbManager.clearAll();
        }

        this.mostrarLogin();
        this.mostrarToast("Logout realizado com sucesso", "info");
        this.notificarAuthChange("logout", null);

        return { success: true };
      } else {
        this.mostrarToast("Erro ao realizar logout", "error");
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("❌ Erro no logout:", error);
      this.mostrarToast("Erro ao realizar logout", "error");
      return { success: false, error: error.message };
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * Verifica se o usuário está bloqueado
   * @returns {boolean} True se bloqueado
   */
  isBlocked() {
    if (!this.blockedUntil) return false;
    return new Date() < this.blockedUntil;
  }

  /**
   * Obtém tempo restante de bloqueio em segundos
   * @returns {number} Segundos restantes
   */
  getTempoBloqueio() {
    if (!this.blockedUntil) return 0;
    const diff = this.blockedUntil - new Date();
    return Math.max(0, Math.ceil(diff / 1000));
  }

  /**
   * Redireciona baseado no perfil do usuário
   * @param {string} perfil - Perfil do usuário ('guarda' ou 'supervisor')
   */
  redirecionarPorPerfil(perfil) {
    console.log("🔄 Redirecionando para:", perfil);

    if (perfil === "supervisor") {
      window.location.href = "/pages/dashboard-supervisor.html";
    } else {
      window.location.href = "/pages/home.html";
    }
  }

  /**
   * Mostra tela de login
   */
  mostrarLogin() {
    const container = document.getElementById("page-content");
    if (!container) {
      console.warn("⚠️ Container #page-content não encontrado");
      return;
    }

    container.innerHTML = this.gerarHTMLLogin();
    this.setupLoginForm();
    this.setupSocialButtons();
  }

  /**
   * Gera HTML da tela de login
   * @returns {string} HTML da tela de login
   */
  gerarHTMLLogin() {
    return `
            <div class="login-screen">
                <div class="login-card">
                    <div class="logo-container">
                        <img src="/assets/logo.png" 
                             alt="Logo Guarda Municipal" 
                             onerror="this.style.display='none'; this.parentElement.querySelector('.logo-fallback').style.display='block'">
                        <div class="logo-fallback" style="display:none; font-size:64px;">🛡️</div>
                        <h1>Guarda Municipal</h1>
                        <h2>Pitangueiras - PR</h2>
                        <div class="municipio">⚜️ ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}</div>
                        <div style="margin-top:4px;font-size:12px;color:var(--cinza-medio);">
                            Sistema de Registro de Ocorrências
                        </div>
                    </div>
                    
                    <form id="loginForm" autocomplete="off" novalidate>
                        <div class="form-group">
                            <label for="matricula">CPF ou Matrícula</label>
                            <input 
                                type="text" 
                                id="matricula" 
                                placeholder="Ex: GM12345 ou 123.456.789-00"
                                autocomplete="username"
                                required
                                maxlength="20"
                            >
                            <div class="input-error" id="matriculaError"></div>
                        </div>
                        
                        <div class="form-group">
                            <label for="senha">Senha</label>
                            <div class="input-icon">
                                <input 
                                    type="password" 
                                    id="senha" 
                                    placeholder="Digite sua senha"
                                    autocomplete="current-password"
                                    required
                                    maxlength="50"
                                >
                                <button type="button" class="toggle-password" onclick="window.authManager?.toggleSenha()">
                                    👁️
                                </button>
                            </div>
                            <div class="input-error" id="senhaError"></div>
                        </div>
                        
                        <div class="form-group" style="margin-top: 8px;">
                            <label class="checkbox-container">
                                <input type="checkbox" id="remember-me">
                                <span>Lembrar-me</span>
                            </label>
                        </div>
                        
                        <button type="submit" class="btn-primario" id="loginBtn">
                            ENTRAR
                        </button>
                        
                        <div class="links-row mt-16">
                            <a href="#" onclick="event.preventDefault(); window.authManager?.mostrarToast('Entre em contato com o administrador do sistema para redefinir sua senha.', 'info')">
                                Esqueceu a senha?
                            </a>
                            <span style="color: var(--cinza-medio); font-size: 12px;">
                                v${CONFIG.VERSAO}
                            </span>
                        </div>
                    </form>
                    
                    <div id="loginLoading" style="display: none; text-align: center; padding: 16px;">
                        <div class="spinner spinner-azul" style="margin: 0 auto;"></div>
                        <p style="margin-top: 8px; color: var(--cinza-medio); font-size: 14px;">Aguarde...</p>
                    </div>
                    
                    <div style="margin-top:16px;text-align:center;font-size:12px;color:var(--cinza-medio);">
                        <span>🔒 Ambiente seguro</span>
                        <span style="margin:0 8px;">|</span>
                        <span>🏛️ Guarda Municipal de Pitangueiras</span>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * Configura formulário de login
   */
  setupLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    // Remove listeners anteriores (evita duplicação)
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    const formAtual = document.getElementById("loginForm");
    if (!formAtual) return;

    // Submit do formulário
    formAtual.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Valida campos
      const matricula = document.getElementById("matricula").value.trim();
      const senha = document.getElementById("senha").value;

      // Limpa erros anteriores
      this.limparErros();

      let hasError = false;

      if (!matricula) {
        this.mostrarErro("matricula", "Digite sua matrícula ou CPF");
        hasError = true;
      }

      if (!senha) {
        this.mostrarErro("senha", "Digite sua senha");
        hasError = true;
      }

      if (hasError) return;

      await this.login(matricula, senha);
    });

    // Validação em tempo real
    const matriculaInput = document.getElementById("matricula");
    const senhaInput = document.getElementById("senha");

    if (matriculaInput) {
      matriculaInput.addEventListener("input", () => {
        this.limparErro("matricula");
      });
      matriculaInput.addEventListener("blur", () => {
        const valor = matriculaInput.value.trim();
        if (valor && valor.length < 3) {
          this.mostrarErro("matricula", "Digite uma matrícula válida");
        }
      });
    }

    if (senhaInput) {
      senhaInput.addEventListener("input", () => {
        this.limparErro("senha");
        if (senhaInput.value.length > 0 && senhaInput.value.length < 4) {
          this.mostrarErro("senha", "A senha deve ter pelo menos 4 caracteres");
        }
      });
    }

    // Enter key já é tratado pelo submit do form

    // Salva o estado do "Lembrar-me"
    const rememberCheck = document.getElementById("remember-me");
    if (rememberCheck) {
      const saved = localStorage.getItem("remember_me");
      if (saved === "true") {
        rememberCheck.checked = true;
        const savedMatricula = localStorage.getItem("saved_matricula");
        if (savedMatricula && matriculaInput) {
          matriculaInput.value = savedMatricula;
        }
      }
    }
  }

  /**
   * Configura botões sociais (se houver)
   */
  setupSocialButtons() {
    // Placeholder para futuras integrações (ex: login com Google, etc)
  }

  /**
   * Mostra erro em um campo
   * @param {string} fieldId - ID do campo
   * @param {string} message - Mensagem de erro
   */
  mostrarErro(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + "Error");

    if (input) {
      input.classList.add("error");
    }

    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  /**
   * Limpa erro de um campo
   * @param {string} fieldId - ID do campo
   */
  limparErro(fieldId) {
    const input = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + "Error");

    if (input) {
      input.classList.remove("error");
    }

    if (errorDiv) {
      errorDiv.textContent = "";
      errorDiv.style.display = "none";
    }
  }

  /**
   * Limpa todos os erros
   */
  limparErros() {
    this.limparErro("matricula");
    this.limparErro("senha");
  }

  /**
   * Mostra/esconde senha
   */
  toggleSenha() {
    const input = document.getElementById("senha");
    const btn = document.querySelector(".toggle-password");

    if (input && btn) {
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
      } else {
        input.type = "password";
        btn.textContent = "👁️";
      }
    }
  }

  /**
   * Mostra/esconde loading
   * @param {boolean} show - True para mostrar loading
   */
  mostrarLoading(show) {
    const form = document.getElementById("loginForm");
    const loading = document.getElementById("loginLoading");
    const btn = document.getElementById("loginBtn");

    if (form) {
      form.style.display = show ? "none" : "block";
    }

    if (loading) {
      loading.style.display = show ? "block" : "none";
    }

    if (btn) {
      btn.disabled = show;
      btn.textContent = show ? "AGUARDE..." : "ENTRAR";
    }
  }

  /**
   * Mostra toast/notificação
   * @param {string} mensagem - Mensagem a ser exibida
   * @param {string} tipo - Tipo: success, error, warning, info
   */
  mostrarToast(mensagem, tipo = "info") {
    // Remove toast existente
    const old = document.querySelector(".toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;

    // Ícones para cada tipo
    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
    };

    toast.innerHTML = `${icons[tipo] || "ℹ️"} ${mensagem}`;
    document.body.appendChild(toast);

    // Remove após 4 segundos
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  /**
   * Adiciona listener para mudanças de autenticação
   * @param {Function} callback - Função a ser chamada quando houver mudança
   */
  onAuthChange(callback) {
    if (typeof callback === "function") {
      this.onAuthChangeCallback = callback;
      console.log("✅ Listener de autenticação registrado");
    } else {
      console.warn("⚠️ Callback inválido para onAuthChange");
    }
  }

  /**
   * Notifica mudanças de autenticação
   * @param {string} event - Evento ('login' ou 'logout')
   * @param {Object} data - Dados do evento
   */
  notificarAuthChange(event, data) {
    // Notifica o callback principal
    if (this.onAuthChangeCallback) {
      try {
        this.onAuthChangeCallback(event, data);
      } catch (error) {
        console.error("❌ Erro no callback de autenticação:", error);
      }
    }

    // Notifica os listeners adicionais
    this.authListeners.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error("❌ Erro no listener de autenticação:", error);
      }
    });
  }

  /**
   * Adiciona um listener para eventos de autenticação
   * @param {Function} callback - Função a ser chamada
   */
  addAuthListener(callback) {
    if (typeof callback === "function") {
      this.authListeners.push(callback);
      console.log("✅ Listener adicional de autenticação registrado");
    }
  }

  /**
   * Remove um listener de autenticação
   * @param {Function} callback - Função a ser removida
   */
  removeAuthListener(callback) {
    this.authListeners = this.authListeners.filter((cb) => cb !== callback);
    console.log("🗑️ Listener de autenticação removido");
  }

  /**
   * Verifica se usuário está logado
   * @returns {boolean} True se logado
   */
  isLoggedIn() {
    return this.isLoggedIn;
  }

  /**
   * Obtém dados do usuário
   * @returns {Object|null} Dados do usuário
   */
  getUser() {
    return this.userData;
  }

  /**
   * Obtém o perfil do usuário
   * @returns {string|null} Perfil do usuário
   */
  getPerfil() {
    return this.userData?.perfil || null;
  }

  /**
   * Obtém a matrícula do usuário
   * @returns {string|null} Matrícula do usuário
   */
  getMatricula() {
    return this.userData?.matricula || null;
  }

  /**
   * Obtém o nome completo do usuário
   * @returns {string|null} Nome do usuário
   */
  getNomeCompleto() {
    return this.userData?.nome_completo || null;
  }

  /**
   * Verifica se o usuário atual é supervisor
   * @returns {Promise<boolean>} True se supervisor
   */
  async isSupervisor() {
    if (!this.userData) return false;
    return this.userData.perfil === "supervisor";
  }

  /**
   * Verifica se o usuário atual é guarda
   * @returns {boolean} True se guarda
   */
  isGuarda() {
    if (!this.userData) return false;
    return this.userData.perfil === "guarda";
  }

  /**
   * Recupera a página atual
   * @returns {string} Página atual
   */
  getCurrentPage() {
    return this.currentPage;
  }

  /**
   * Define a página atual
   * @param {string} page - Nome da página
   */
  setCurrentPage(page) {
    this.currentPage = page;
  }

  /**
   * Verifica se o usuário tem permissão para acessar uma página
   * @param {string} page - Página a ser acessada
   * @returns {boolean} True se tem permissão
   */
  hasPermission(page) {
    if (!this.userData) return false;

    // Páginas de supervisor
    const supervisorPages = [
      "/pages/dashboard-supervisor.html",
      "/pages/relatorios.html",
      "/pages/usuarios.html",
      "/pages/auditoria.html",
    ];

    // Páginas de guarda
    const guardaPages = [
      "/pages/home.html",
      "/pages/nova-ocorrencia.html",
      "/pages/detalhes.html",
    ];

    // Páginas públicas (qualquer um logado pode acessar)
    const publicPages = ["/pages/perfil.html", "/pages/configuracoes.html"];

    if (publicPages.includes(page)) return true;

    if (this.userData.perfil === "supervisor") {
      return true; // Supervisor tem acesso a tudo
    }

    if (this.userData.perfil === "guarda") {
      return guardaPages.includes(page) || !supervisorPages.includes(page);
    }

    return false;
  }

  /**
   * Verifica se o usuário tem permissão para editar uma ocorrência
   * @param {Object} ocorrencia - Dados da ocorrência
   * @returns {boolean} True se pode editar
   */
  podeEditar(ocorrencia) {
    if (!this.userData) return false;

    // Supervisor pode editar qualquer uma
    if (this.userData.perfil === "supervisor") return true;

    // Guarda só pode editar as próprias
    if (this.userData.perfil === "guarda") {
      return ocorrencia.criado_por === this.userData.id;
    }

    return false;
  }

  /**
   * Verifica se o usuário tem permissão para visualizar uma ocorrência
   * @param {Object} ocorrencia - Dados da ocorrência
   * @returns {boolean} True se pode visualizar
   */
  podeVisualizar(ocorrencia) {
    if (!this.userData) return false;

    // Supervisor pode visualizar qualquer uma
    if (this.userData.perfil === "supervisor") return true;

    // Guarda só pode visualizar as próprias
    if (this.userData.perfil === "guarda") {
      return ocorrencia.criado_por === this.userData.id;
    }

    return false;
  }

  /**
   * Verifica se o usuário tem permissão para cancelar uma ocorrência
   * @param {Object} ocorrencia - Dados da ocorrência
   * @returns {boolean} True se pode cancelar
   */
  podeCancelar(ocorrencia) {
    if (!this.userData) return false;

    // Supervisor pode cancelar qualquer uma
    if (this.userData.perfil === "supervisor") return true;

    // Guarda só pode cancelar as próprias (se não estiver finalizada)
    if (this.userData.perfil === "guarda") {
      return (
        ocorrencia.criado_por === this.userData.id &&
        ocorrencia.status !== "synced" &&
        ocorrencia.status !== "cancelled"
      );
    }

    return false;
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

// Cria a instância global
const authManager = new AuthManager();

// 🔴 EXPÕE PARA O WINDOW (GLOBAL)
window.authManager = authManager;

// ============================================
// LOG DE INICIALIZAÇÃO
// ============================================

console.log("🔐 AuthManager inicializado");
console.log("📋 Versão:", CONFIG.VERSAO);

// ============================================
// EXPORTA PARA MÓDULOS (CASO USE)
// ============================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = { authManager };
}

if (typeof define === "function" && define.amd) {
  define([], function () {
    return { authManager };
  });
}

console.log("✅ AuthManager pronto para uso");
