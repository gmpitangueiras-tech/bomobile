/**
 * ============================================
 * CLIENTE SUPABASE
 * ============================================
 */

// Carrega a biblioteca Supabase do CDN
// (Adicione no HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>)

class SupabaseClient {
  constructor() {
    this.supabase = null;
    this.session = null;
    this.user = null;
    this.initialized = false;
  }

  /**
   * Inicializa o cliente Supabase
   */
  async init() {
    try {
      const { createClient } = supabase;

      this.supabase = createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        },
      );

      // Verifica sessão existente
      const {
        data: { session },
        error,
      } = await this.supabase.auth.getSession();

      if (error) {
        console.error("Erro ao recuperar sessão:", error);
        return false;
      }

      if (session) {
        this.session = session;
        this.user = session.user;
        this.initialized = true;
        return true;
      }

      this.initialized = true;
      return false;
    } catch (error) {
      console.error("Erro ao inicializar Supabase:", error);
      return false;
    }
  }

  /**
   * Login com CPF/Matrícula e Senha
   */
  async login(email, password) {
    try {
      // O Supabase usa email para login, vamos usar o email como matricula@dominio
      const emailLogin = this.formatarEmailLogin(email);

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: emailLogin,
        password: password,
      });

      if (error) {
        throw new Error(this.tratarErroLogin(error));
      }

      this.session = data.session;
      this.user = data.user;

      // Atualiza último login no banco
      await this.atualizarUltimoLogin(this.user.id);

      return {
        success: true,
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      console.error("Erro no login:", error);
      return {
        success: false,
        error: error.message || "Erro ao realizar login",
      };
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;

      this.session = null;
      this.user = null;

      return { success: true };
    } catch (error) {
      console.error("Erro no logout:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtém perfil do usuário
   */
  async getPerfilUsuario(userId) {
    try {
      const { data, error } = await this.supabase
        .from("usuarios")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error("Erro ao buscar perfil:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Atualiza último login do usuário
   */
  async atualizarUltimoLogin(userId) {
    try {
      await this.supabase
        .from("usuarios")
        .update({
          ultimo_login: new Date().toISOString(),
          ultimo_ip: await this.getIP(),
          ultimo_user_agent: navigator.userAgent,
        })
        .eq("id", userId);
    } catch (error) {
      console.error("Erro ao atualizar último login:", error);
    }
  }

  /**
   * Formata email para login
   */
  formatarEmailLogin(matricula) {
    // Remove espaços e caracteres especiais
    const clean = matricula.trim().toLowerCase();
    // Se já tem @, retorna como está
    if (clean.includes("@")) return clean;
    // Se não, adiciona domínio
    return `${clean}@guarda.pitangueiras.pr.gov.br`;
  }

  /**
   * Trata erros de login
   */
  tratarErroLogin(error) {
    switch (error.message) {
      case "Invalid login credentials":
        return "CPF/Matrícula ou senha incorretos";
      case "Email not confirmed":
        return "E-mail não confirmado. Verifique seu e-mail.";
      default:
        return "Erro ao realizar login. Tente novamente.";
    }
  }

  /**
   * Obtém IP do usuário (via API)
   */
  async getIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch {
      return "0.0.0.0";
    }
  }

  /**
   * Verifica se usuário está autenticado
   */
  isAuthenticated() {
    return this.session !== null && this.user !== null;
  }

  /**
   * Verifica se usuário é supervisor
   */
  async isSupervisor() {
    if (!this.user) return false;

    try {
      const { data, error } = await this.supabase
        .from("usuarios")
        .select("perfil")
        .eq("id", this.user.id)
        .single();

      if (error) throw error;
      return data.perfil === "supervisor";
    } catch {
      return false;
    }
  }

  /**
   * Obtém dados do usuário atual
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Obtém cliente Supabase
   */
  getClient() {
    return this.supabase;
  }
}

// Instância global
const supabaseClient = new SupabaseClient();
