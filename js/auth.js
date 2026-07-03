/**
 * GERENCIADOR DE AUTENTICAÇÃO
 * Guarda Municipal de Pitangueiras - PR
 */

class AuthManager {
  constructor() {
    this.user = null;
    this._isLoggedIn = false;
    this.initialized = false;
    this.listeners = [];
  }

  // Getter para isLoggedIn
  get isLoggedIn() {
    return this._isLoggedIn;
  }

  // Método para compatibilidade
  isLoggedIn() {
    return this._isLoggedIn;
  }

  async init() {
    if (this.initialized) return this._isLoggedIn;

    try {
      if (!supabaseClient.isInitialized()) {
        await supabaseClient.init();
      }

      const client = supabaseClient.getClient();
      if (!client) throw new Error("Supabase não disponível");

      const savedUser = localStorage.getItem("auth_user");
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          const { data: usuario } = await client
            .from("usuarios")
            .select("*")
            .eq("id", userData.id)
            .maybeSingle();

          if (
            usuario &&
            usuario.status !== "inativo" &&
            usuario.status !== "bloqueado"
          ) {
            this.user = usuario;
            this._isLoggedIn = true;
            this.initialized = true;
            console.log("✅ Sessão restaurada:", usuario.nome_completo);
            this.notifyListeners("login", usuario);
            return true;
          }
        } catch (e) {
          localStorage.removeItem("auth_user");
        }
      }

      this._isLoggedIn = false;
      this.user = null;
      this.initialized = true;
      console.log("👤 Usuário não autenticado");
      return false;
    } catch (error) {
      console.error("❌ Erro ao inicializar auth:", error);
      this.initialized = true;
      return false;
    }
  }

  async login(cpf, senha) {
    try {
      const cpfClean = cpf.replace(/[^0-9]/g, "");
      if (cpfClean.length !== 11)
        return { success: false, error: "CPF inválido" };

      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const { data: usuario } = await client
        .from("usuarios")
        .select("*")
        .eq("cpf", cpfClean)
        .maybeSingle();

      if (!usuario) return { success: false, error: "CPF não encontrado" };
      if (usuario.status === "inativo" || usuario.status === "bloqueado") {
        return { success: false, error: "Usuário inativo ou bloqueado" };
      }

      const { data: senhaValida } = await client.rpc("verificar_senha", {
        p_cpf: cpfClean,
        p_senha: senha,
      });

      if (!senhaValida) return { success: false, error: "Senha incorreta" };

      this.user = usuario;
      this._isLoggedIn = true;

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id: usuario.id,
          nome_completo: usuario.nome_completo,
          cpf: usuario.cpf,
          perfil: usuario.perfil,
          matricula: usuario.matricula,
        }),
      );

      await client
        .from("usuarios")
        .update({
          ultimo_login: new Date().toISOString(),
        })
        .eq("id", usuario.id);

      this.notifyListeners("login", usuario);

      if (
        usuario.status === "primeiro_acesso" ||
        usuario.primeiro_acesso === true
      ) {
        return { success: true, primeiro_acesso: true, usuario };
      }

      return { success: true, usuario };
    } catch (error) {
      console.error("❌ Erro no login:", error);
      return { success: false, error: error.message };
    }
  }

  async primeiroAcesso(novaSenha, telefone = null, email = null) {
    try {
      if (!this.user)
        return { success: false, error: "Usuário não autenticado" };

      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: novaSenha,
      });

      const updates = {
        senha_hash: hashData,
        status: "ativo",
        primeiro_acesso: false,
        atualizado_em: new Date().toISOString(),
      };
      if (telefone) updates.telefone = telefone;
      if (email) updates.email = email;

      await client.from("usuarios").update(updates).eq("id", this.user.id);

      this.user.status = "ativo";
      this.user.primeiro_acesso = false;
      if (telefone) this.user.telefone = telefone;
      if (email) this.user.email = email;

      this.notifyListeners("primeiro_acesso", this.user);
      return { success: true, usuario: this.user };
    } catch (error) {
      console.error("❌ Erro no primeiro acesso:", error);
      return { success: false, error: error.message };
    }
  }

  async logout() {
    this._isLoggedIn = false;
    this.user = null;
    localStorage.removeItem("auth_user");
    this.notifyListeners("logout", null);
    return { success: true };
  }

  // ========== MÉTODOS PÚBLICOS ==========
  isLoggedIn() {
    return this._isLoggedIn;
  }
  getUser() {
    return this.user;
  }
  getPerfil() {
    return this.user?.perfil || null;
  }
  getUserId() {
    return this.user?.id || null;
  }
  getNome() {
    return this.user?.nome_completo || null;
  }
  getMatricula() {
    return this.user?.matricula || null;
  }
  isSupervisor() {
    return this.user?.perfil === "supervisor";
  }
  isGuarda() {
    return this.user?.perfil === "guarda";
  }
  isPrimeiroAcesso() {
    return (
      this.user?.status === "primeiro_acesso" ||
      this.user?.primeiro_acesso === true
    );
  }

  // ========== PERMISSÕES ==========
  podeEditar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) return true;
    return (
      ocorrencia.criado_por === this.user.id &&
      ocorrencia.status !== "synced" &&
      ocorrencia.status !== "cancelled"
    );
  }

  podeVisualizar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) return true;
    return ocorrencia.criado_por === this.user.id;
  }

  podeCancelar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) return true;
    return (
      ocorrencia.criado_por === this.user.id &&
      ocorrencia.status !== "synced" &&
      ocorrencia.status !== "cancelled"
    );
  }

  podeFinalizar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) return true;
    return (
      ocorrencia.criado_por === this.user.id && ocorrencia.status === "draft"
    );
  }

  podeAcessarRelatorios() {
    return this.isSupervisor();
  }
  podeGerenciarUsuarios() {
    return this.isSupervisor();
  }

  // ========== LISTENERS ==========
  onAuthChange(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  notifyListeners(event, data) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, data);
      } catch (e) {}
    });
  }

  // ========== GERENCIAMENTO DE USUÁRIOS ==========
  async listarUsuarios(filtros = {}) {
    if (!this.isSupervisor())
      return { success: false, error: "Permissão negada" };
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      let query = client.from("usuarios").select("*");
      if (filtros.perfil) query = query.eq("perfil", filtros.perfil);
      if (filtros.status) query = query.eq("status", filtros.status);
      if (filtros.search) {
        query = query.or(
          `nome_completo.ilike.%${filtros.search}%,cpf.ilike.%${filtros.search}%`,
        );
      }

      const { data, error } = await query.order("nome_completo");
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async criarUsuario(dados) {
    if (!this.isSupervisor())
      return { success: false, error: "Permissão negada" };
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const cpfClean = dados.cpf.replace(/[^0-9]/g, "");
      if (cpfClean.length !== 11)
        return { success: false, error: "CPF inválido" };

      const { data: existe } = await client
        .from("usuarios")
        .select("cpf")
        .eq("cpf", cpfClean)
        .maybeSingle();
      if (existe) return { success: false, error: "CPF já cadastrado" };

      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: dados.senha,
      });

      const novoUsuario = {
        id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
        nome_completo: dados.nome,
        cpf: cpfClean,
        matricula: dados.matricula || null,
        email: dados.email || null,
        telefone: dados.telefone || null,
        perfil: dados.perfil || "guarda",
        status: "primeiro_acesso",
        primeiro_acesso: true,
        senha_hash: hashData,
        criado_por: this.user.id,
        criado_em: new Date().toISOString(),
      };

      const { data, error } = await client
        .from("usuarios")
        .insert([novoUsuario])
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  gerarUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
}

// ========== CRIA A INSTÂNCIA GLOBAL ==========
// Se já existir, substitui
if (window.authManager) {
  console.warn("⚠️ authManager já existia, substituindo...");
}
window.authManager = new AuthManager();
const authManager = window.authManager;

console.log("🔐 AuthManager carregado e instanciado");
console.log("📋 Tipo de isLoggedIn:", typeof authManager.isLoggedIn);
