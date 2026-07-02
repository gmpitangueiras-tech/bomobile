/**
 * ============================================
 * AUTENTICAÇÃO
 * ============================================
 */

class AuthManager {
  constructor() {
    this.isLoggedIn = false;
    this.userData = null;
    this.onAuthChange = null;
  }

  /**
   * Inicializa o gerenciador de autenticação
   */
  async init() {
    // Inicializa cliente Supabase
    const initialized = await supabaseClient.init();

    if (initialized && supabaseClient.isAuthenticated()) {
      const userId = supabaseClient.getCurrentUser().id;
      const perfil = await this.carregarPerfil(userId);

      if (perfil) {
        this.isLoggedIn = true;
        this.userData = perfil;
        this.redirecionarPorPerfil(perfil.perfil);
        return true;
      }
    }

    // Se não está autenticado, mostra tela de login
    this.mostrarLogin();
    return false;
  }

  /**
   * Carrega perfil do usuário
   */
  async carregarPerfil(userId) {
    try {
      const result = await supabaseClient.getPerfilUsuario(userId);
      if (result.success) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      return null;
    }
  }

  /**
   * Realiza login
   */
  async login(matricula, senha) {
    // Mostra loading
    this.mostrarLoading(true);

    try {
      const result = await supabaseClient.login(matricula, senha);

      if (result.success) {
        // Busca perfil do usuário
        const perfil = await this.carregarPerfil(result.user.id);

        if (perfil) {
          this.isLoggedIn = true;
          this.userData = perfil;

          // Redireciona
          this.redirecionarPorPerfil(perfil.perfil);
          this.mostrarToast("Login realizado com sucesso!", "success");
          return { success: true };
        } else {
          // Usuário autenticado mas sem perfil
          await supabaseClient.logout();
          this.mostrarToast("Erro: Perfil não encontrado", "error");
          return { success: false, error: "Perfil não encontrado" };
        }
      } else {
        this.mostrarToast(result.error, "error");
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error("Erro no login:", error);
      this.mostrarToast("Erro ao realizar login", "error");
      return { success: false, error: "Erro ao realizar login" };
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * Realiza logout
   */
  async logout() {
    try {
      await supabaseClient.logout();
      this.isLoggedIn = false;
      this.userData = null;

      // Limpa dados locais
      if (window.dbManager) {
        await window.dbManager.clearAll();
      }

      this.mostrarLogin();
      this.mostrarToast("Logout realizado com sucesso", "info");

      return { success: true };
    } catch (error) {
      console.error("Erro no logout:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Redireciona baseado no perfil
   */
  redirecionarPorPerfil(perfil) {
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
    if (!container) return;

    container.innerHTML = this.gerarHTMLLogin();
    this.setupLoginForm();
  }

  /**
   * Gera HTML da tela de login
   */
  gerarHTMLLogin() {
    return `
            <div class="login-screen">
                <div class="login-card">
                    <div class="logo-container">
                        <img src="/assets/logo.png" alt="Logo Guarda Municipal" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text y=%22.9em%22 font-size=%2290%22>🛡️</text></svg>'">
                        <h1>Guarda Municipal</h1>
                        <h2>Pitangueiras - PR</h2>
                        <div class="municipio">⚜️ ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}</div>
                    </div>
                    
                    <form id="loginForm" autocomplete="off">
                        <div class="form-group">
                            <label for="matricula">CPF ou Matrícula</label>
                            <input 
                                type="text" 
                                id="matricula" 
                                placeholder="Ex: GM12345 ou 123.456.789-00"
                                autocomplete="username"
                                required
                            >
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
                                >
                                <button type="button" class="toggle-password" onclick="authManager.toggleSenha()">
                                    👁️
                                </button>
                            </div>
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
                            <a href="#" onclick="event.preventDefault(); authManager.mostrarToast('Entre em contato com o administrador do sistema', 'info')">
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

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const matricula = document.getElementById("matricula").value.trim();
      const senha = document.getElementById("senha").value;

      if (!matricula || !senha) {
        this.mostrarToast("Preencha todos os campos", "warning");
        return;
      }

      await this.login(matricula, senha);
    });

    // Enter key para enviar
    document.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && document.getElementById("loginForm")) {
        document.getElementById("loginForm").dispatchEvent(new Event("submit"));
      }
    });
  }

  /**
   * Mostra/esconde senha
   */
  toggleSenha() {
    const input = document.getElementById("senha");
    const btn = document.querySelector(".toggle-password");

    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "🙈";
    } else {
      input.type = "password";
      btn.textContent = "👁️";
    }
  }

  /**
   * Mostra/esconde loading
   */
  mostrarLoading(show) {
    const form = document.getElementById("loginForm");
    const loading = document.getElementById("loginLoading");
    const btn = document.getElementById("loginBtn");

    if (form) form.style.display = show ? "none" : "block";
    if (loading) loading.style.display = show ? "block" : "none";
    if (btn) btn.disabled = show;
  }

  /**
   * Mostra toast/notificação
   */
  mostrarToast(mensagem, tipo = "info") {
    // Remove toast existente
    const old = document.querySelector(".toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  /**
   * Verifica se usuário está logado
   */
  isLoggedIn() {
    return this.isLoggedIn;
  }

  /**
   * Obtém dados do usuário
   */
  getUser() {
    return this.userData;
  }
}

// Instância global
const authManager = new AuthManager();
