/**
 * GERENCIADOR DE AUTENTICAÇÃO
 * Guarda Municipal de Pitangueiras - PR
 *
 * Regras de Negócio:
 * - Supervisor: pode listar, criar, editar, ativar/desativar, resetar senha de qualquer usuário
 * - Guarda: pode editar apenas seus próprios dados (nome, telefone, email)
 * - Nenhum usuário pode alterar CPF, matrícula ou perfil de si mesmo
 * - Logs de acesso: registrados automaticamente no login, logout e ações importantes
 * - Apenas supervisores podem visualizar logs
 * - IP do usuário é capturado automaticamente via api.ipify.org
 * - Informações do dispositivo (navegador, tipo) são registradas nos logs
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

  // ============================================
  // OBTENÇÃO DE IP REAL
  // ============================================

  async obterIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.warn("⚠️ Erro ao obter IP:", error);
      return null;
    }
  }

  // ============================================
  // OBTENÇÃO DE INFORMAÇÕES DO DISPOSITIVO
  // ============================================

  obterInfoDispositivo() {
    const userAgent = navigator?.userAgent || null;

    let tipo = "Desktop";
    if (/mobile/i.test(userAgent)) tipo = "Mobile";
    if (/tablet/i.test(userAgent)) tipo = "Tablet";

    let navegador = "Desconhecido";
    if (userAgent?.includes("Chrome") && !userAgent?.includes("Edg"))
      navegador = "Chrome";
    else if (userAgent?.includes("Firefox")) navegador = "Firefox";
    else if (userAgent?.includes("Safari") && !userAgent?.includes("Chrome"))
      navegador = "Safari";
    else if (userAgent?.includes("Edg")) navegador = "Edge";
    else if (userAgent?.includes("Opera")) navegador = "Opera";

    return {
      userAgent: userAgent,
      tipo: tipo,
      navegador: navegador,
    };
  }

  // ============================================
  // REGISTRO DE LOGS DE ACESSO
  // ============================================

  async registrarLogAcesso(
    usuarioId,
    acao = "login",
    entidade = null,
    detalhes = null,
  ) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      // Obter IP automaticamente
      const ip = await this.obterIP();

      // Obter informações do dispositivo
      const infoDispositivo = this.obterInfoDispositivo();

      const logData = {
        usuario_id: usuarioId,
        ip: ip,
        user_agent: infoDispositivo.userAgent,
        acao: acao,
        entidade: entidade || null,
        detalhes: detalhes
          ? JSON.stringify({
              ...detalhes,
              dispositivo: infoDispositivo.tipo,
              navegador: infoDispositivo.navegador,
            })
          : JSON.stringify({
              dispositivo: infoDispositivo.tipo,
              navegador: infoDispositivo.navegador,
            }),
        data_hora: new Date().toISOString(),
      };

      const { data, error } = await client
        .from("logs_acesso")
        .insert([logData])
        .select()
        .single();

      if (error) {
        console.warn(
          "⚠️ Erro ao registrar log de acesso (não crítico):",
          error,
        );
        return { success: false, error: error.message, nonCritical: true };
      }

      console.log(
        `✅ Log de acesso registrado: ${acao} - Usuário ${usuarioId}`,
      );
      return { success: true, data };
    } catch (error) {
      console.warn("⚠️ Erro não crítico ao registrar log de acesso:", error);
      return { success: false, error: error.message, nonCritical: true };
    }
  }

  // ============================================
  // MÉTODOS ESPECÍFICOS DE LOG (WRAPPERS)
  // ============================================

  async logLogin(usuarioId) {
    return this.registrarLogAcesso(usuarioId, "login");
  }

  async logLogout(usuarioId) {
    return this.registrarLogAcesso(usuarioId, "logout");
  }

  async logCriarOcorrencia(usuarioId, ocorrenciaId) {
    return this.registrarLogAcesso(
      usuarioId,
      "criar_ocorrencia",
      "ocorrencia",
      { ocorrencia_id: ocorrenciaId },
    );
  }

  async logFinalizarOcorrencia(usuarioId, ocorrenciaId) {
    return this.registrarLogAcesso(
      usuarioId,
      "finalizar_ocorrencia",
      "ocorrencia",
      { ocorrencia_id: ocorrenciaId },
    );
  }

  async logCancelarOcorrencia(usuarioId, ocorrenciaId, motivo) {
    return this.registrarLogAcesso(
      usuarioId,
      "cancelar_ocorrencia",
      "ocorrencia",
      { ocorrencia_id: ocorrenciaId, motivo: motivo },
    );
  }

  async logSolicitarRetificacao(usuarioId, ocorrenciaId) {
    return this.registrarLogAcesso(
      usuarioId,
      "solicitar_retificacao",
      "ocorrencia",
      { ocorrencia_id: ocorrenciaId },
    );
  }

  async logAprovarRetificacao(usuarioId, retificacaoId) {
    return this.registrarLogAcesso(
      usuarioId,
      "aprovar_retificacao",
      "ocorrencia",
      { retificacao_id: retificacaoId },
    );
  }

  async logRejeitarRetificacao(usuarioId, retificacaoId) {
    return this.registrarLogAcesso(
      usuarioId,
      "rejeitar_retificacao",
      "ocorrencia",
      { retificacao_id: retificacaoId },
    );
  }

  async logCriarUsuario(usuarioId, novoUsuarioId) {
    return this.registrarLogAcesso(usuarioId, "criar_usuario", "usuario", {
      usuario_id: novoUsuarioId,
    });
  }

  async logEditarUsuario(usuarioId, usuarioAlteradoId) {
    return this.registrarLogAcesso(usuarioId, "editar_usuario", "usuario", {
      usuario_id: usuarioAlteradoId,
    });
  }

  async logResetarSenha(usuarioId, usuarioAlteradoId) {
    return this.registrarLogAcesso(usuarioId, "resetar_senha", "usuario", {
      usuario_id: usuarioAlteradoId,
    });
  }

  async logAtivarDesativarUsuario(usuarioId, usuarioAlteradoId) {
    return this.registrarLogAcesso(
      usuarioId,
      "ativar_desativar_usuario",
      "usuario",
      { usuario_id: usuarioAlteradoId },
    );
  }

  // ============================================
  // AUTENTICAÇÃO
  // ============================================

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

      // ===== REGISTRAR LOG DE LOGIN =====
      await this.logLogin(usuario.id);
      if (window.app && typeof window.app.registrarLogPericial === 'function') {
        await window.app.registrarLogPericial('LOGIN', 'usuarios', usuario.id);
      }

      // ===== ATUALIZAR ÚLTIMO LOGIN COM TRY/CATCH =====
      try {
        await client
          .from("usuarios")
          .update({
            ultimo_login: new Date().toISOString(),
            ultimo_ip: await this.obterIP(),
            ultimo_user_agent: navigator?.userAgent || null,
          })
          .eq("id", usuario.id);
      } catch (updateError) {
        console.warn("⚠️ Erro ao atualizar último login:", updateError);
      }

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

      // ===== REGISTRAR LOG DE PRIMEIRO ACESSO =====
      await this.registrarLogAcesso(this.user.id, "primeiro_acesso");

      this.notifyListeners("primeiro_acesso", this.user);
      return { success: true, usuario: this.user };
    } catch (error) {
      console.error("❌ Erro no primeiro acesso:", error);
      return { success: false, error: error.message };
    }
  }

  async logout() {
    const usuarioId = this.user?.id;

    // ===== REGISTRAR LOG DE LOGOUT =====
    if (usuarioId) {
      await this.logLogout(usuarioId);
    }

    this._isLoggedIn = false;
    this.user = null;
    localStorage.removeItem("auth_user");
    this.notifyListeners("logout", null);
    return { success: true };
  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

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

  getCPF() {
    return this.user?.cpf || null;
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

  // ============================================
  // PERMISSÕES
  // ============================================

  /**
   * Verifica se o usuário pode editar uma ocorrência
   * Regra: Apenas o CRIADOR (se for rascunho) ou SUPERVISOR podem editar
   */
  podeEditar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) {
      return ocorrencia.status === "draft";
    }
    return (
      ocorrencia.criado_por === this.user.id && ocorrencia.status === "draft"
    );
  }

  /**
   * Verifica se o usuário pode visualizar uma ocorrência
   * Regra: Todos os usuários autenticados podem visualizar TODAS as ocorrências
   */
  podeVisualizar(ocorrencia) {
    if (!this.user) return false;
    return true;
  }

  /**
   * Verifica se o usuário pode finalizar uma ocorrência
   * Regra: O CRIADOR (se for rascunho) ou SUPERVISOR podem finalizar
   */
  podeFinalizar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) {
      return ocorrencia.status === "draft";
    }
    return (
      ocorrencia.criado_por === this.user.id && ocorrencia.status === "draft"
    );
  }

  /**
   * Verifica se o usuário pode cancelar uma ocorrência
   * Regra: Apenas SUPERVISOR pode cancelar
   */
  podeCancelar(ocorrencia) {
    if (!this.user) return false;
    if (!this.isSupervisor()) return false;
    return ocorrencia.status !== "cancelled";
  }

  /**
   * Verifica se o usuário pode solicitar retificação
   * Regra:
   *   - Supervisor pode solicitar para qualquer ocorrência finalizada
   *   - Guarda pode solicitar apenas para suas próprias ocorrências finalizadas
   */
  podeSolicitarRetificacao(ocorrencia) {
    if (!this.user) return false;
    if (
      ocorrencia.status !== "synced" &&
      ocorrencia.status !== "pending_sync"
    ) {
      return false;
    }
    if (this.isSupervisor()) {
      return true;
    }
    return ocorrencia.criado_por === this.user.id;
  }

  /**
   * Verifica se o usuário pode aprovar uma retificação
   * Regra: Apenas SUPERVISOR pode aprovar retificações pendentes
   */
  podeAprovarRetificacao(ocorrencia) {
    if (!this.user) return false;
    return this.isSupervisor() && ocorrencia.status === "pending_rectification";
  }

  /**
   * Verifica se o usuário pode rejeitar uma retificação
   * Regra: Apenas SUPERVISOR pode rejeitar
   */
  podeRejeitarRetificacao(ocorrencia) {
    if (!this.user) return false;
    return this.isSupervisor() && ocorrencia.status === "pending_rectification";
  }

  /**
   * Verifica se o usuário pode ver o histórico
   * Regra: Todos os autenticados podem ver
   */
  podeVerHistorico(ocorrencia) {
    return this.isLoggedIn();
  }

  /**
   * Verifica se o usuário pode acessar relatórios
   * Regra: Apenas supervisores
   */
  podeAcessarRelatorios() {
    return this.isSupervisor();
  }

  /**
   * Verifica se o usuário pode gerenciar usuários
   * Regra: Apenas supervisores
   */
  podeGerenciarUsuarios() {
    return this.isSupervisor();
  }

  /**
   * Verifica se o usuário pode ver logs
   * Regra: Apenas supervisores
   */
  podeVerLogs() {
    return this.isSupervisor();
  }

  // ============================================
  // GERENCIAMENTO DE USUÁRIOS
  // ============================================

  /**
   * Lista todos os usuários (apenas supervisor)
   * @param {object} filtros - { perfil, status, search }
   * @returns {Promise<Object>}
   */
  async listarUsuarios(filtros = {}) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error: "Permissão negada. Apenas supervisores podem listar usuários.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      let query = client.from("usuarios").select("*");

      if (filtros.perfil) {
        query = query.eq("perfil", filtros.perfil);
      }
      if (filtros.status) {
        query = query.eq("status", filtros.status);
      }
      if (filtros.search) {
        query = query.or(
          `nome_completo.ilike.%${filtros.search}%,cpf.ilike.%${filtros.search}%,matricula.ilike.%${filtros.search}%`,
        );
      }

      const { data, error } = await query.order("nome_completo");
      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar usuários:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria um novo usuário (apenas supervisor)
   * @param {object} dados - { nome, cpf, matricula, email, telefone, perfil, senha }
   * @returns {Promise<Object>}
   */
  async criarUsuario(dados) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error: "Permissão negada. Apenas supervisores podem criar usuários.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const cpfClean = dados.cpf.replace(/[^0-9]/g, "");
      if (cpfClean.length !== 11) {
        return { success: false, error: "CPF inválido" };
      }

      // Verificar se CPF já existe
      const { data: existe } = await client
        .from("usuarios")
        .select("cpf")
        .eq("cpf", cpfClean)
        .maybeSingle();

      if (existe) {
        return { success: false, error: "CPF já cadastrado" };
      }

      // Se senha não for fornecida, gerar uma temporária
      const senhaTemp = dados.senha || this.gerarSenhaTemporaria();
      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: senhaTemp,
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

      // ===== REGISTRAR LOG DE CRIAÇÃO DE USUÁRIO =====
      await this.logCriarUsuario(this.user.id, data.id);

      // Retornar a senha temporária (para o supervisor repassar ao usuário)
      return {
        success: true,
        data,
        senha_temporaria: senhaTemp,
      };
    } catch (error) {
      console.error("❌ Erro ao criar usuário:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Atualiza dados de um usuário
   * - Supervisor pode editar qualquer usuário (todos os campos)
   * - Guarda pode editar apenas seu próprio perfil (apenas nome, telefone, email)
   * @param {string} id - ID do usuário
   * @param {object} dados - Dados a atualizar
   * @returns {Promise<Object>}
   */
  async atualizarUsuario(id, dados) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      // Se não for supervisor, verifica se está editando a si mesmo
      if (!this.isSupervisor()) {
        if (id !== this.user.id) {
          return {
            success: false,
            error: "Permissão negada. Você só pode editar seu próprio perfil.",
          };
        }
        // Guarda só pode editar campos permitidos
        const camposPermitidos = ["nome_completo", "telefone", "email"];
        const dadosFiltrados = {};
        for (const campo of camposPermitidos) {
          if (dados[campo] !== undefined) {
            dadosFiltrados[campo] = dados[campo];
          }
        }
        dados = dadosFiltrados;
      }

      // Se for supervisor, pode editar todos os campos, mas não pode alterar senha_hash diretamente
      // (use resetarSenha para isso)
      delete dados.senha_hash;

      const { data, error } = await client
        .from("usuarios")
        .update({
          ...dados,
          atualizado_por: this.user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // ===== REGISTRAR LOG DE EDIÇÃO DE USUÁRIO =====
      await this.logEditarUsuario(this.user.id, id);

      // Se o usuário atualizou a si mesmo, atualizar o objeto local
      if (id === this.user.id) {
        this.user = { ...this.user, ...dados };
        localStorage.setItem(
          "auth_user",
          JSON.stringify({
            id: this.user.id,
            nome_completo: this.user.nome_completo,
            cpf: this.user.cpf,
            perfil: this.user.perfil,
            matricula: this.user.matricula,
          }),
        );
      }

      console.log("✅ Usuário atualizado:", id);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao atualizar usuário:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ativa ou desativa um usuário (apenas supervisor)
   * @param {string} id - ID do usuário
   * @param {string} status - 'ativo' ou 'inativo'
   * @returns {Promise<Object>}
   */
  async ativarDesativarUsuario(id, status) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error:
          "Permissão negada. Apenas supervisores podem alterar status de usuários.",
      };
    }

    if (!["ativo", "inativo", "bloqueado"].includes(status)) {
      return {
        success: false,
        error: "Status inválido. Use 'ativo', 'inativo' ou 'bloqueado'.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const { data, error } = await client
        .from("usuarios")
        .update({
          status: status,
          atualizado_por: this.user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // ===== REGISTRAR LOG DE ATIVAÇÃO/DESATIVAÇÃO =====
      await this.logAtivarDesativarUsuario(this.user.id, id);

      console.log(`✅ Usuário ${id} alterado para status: ${status}`);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao alterar status do usuário:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reseta a senha de um usuário (apenas supervisor)
   * Gera uma nova senha temporária e marca como primeiro acesso
   * @param {string} id - ID do usuário
   * @returns {Promise<Object>}
   */
  async resetarSenha(id) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error: "Permissão negada. Apenas supervisores podem resetar senhas.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const senhaTemp = this.gerarSenhaTemporaria();
      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: senhaTemp,
      });

      const { data, error } = await client
        .from("usuarios")
        .update({
          senha_hash: hashData,
          status: "primeiro_acesso",
          primeiro_acesso: true,
          atualizado_por: this.user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // ===== REGISTRAR LOG DE RESET DE SENHA =====
      await this.logResetarSenha(this.user.id, id);

      console.log(`✅ Senha resetada para usuário ${id}`);
      return {
        success: true,
        data,
        senha_temporaria: senhaTemp,
      };
    } catch (error) {
      console.error("❌ Erro ao resetar senha:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gera uma senha temporária aleatória
   * @returns {string}
   */
  gerarSenhaTemporaria() {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let senha = "";
    for (let i = 0; i < 8; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Garantir pelo menos um número e uma letra maiúscula
    senha = "Temp" + senha + "123";
    return senha;
  }

  // ============================================
  // LISTAGEM DE LOGS DE ACESSO (APENAS SUPERVISOR)
  // ============================================

  /**
   * Lista logs de acesso (apenas supervisor)
   * @param {object} filtros - { usuario_id, acao, data_inicio, data_fim, limit }
   * @returns {Promise<Object>}
   */
  async listarLogsAcesso(filtros = {}) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error: "Permissão negada. Apenas supervisores podem visualizar logs.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      let query = client
        .from("logs_acesso")
        .select("*, usuarios(nome_completo, matricula)")
        .order("data_hora", { ascending: false });

      if (filtros.usuario_id) {
        query = query.eq("usuario_id", filtros.usuario_id);
      }
      if (filtros.acao) {
        query = query.eq("acao", filtros.acao);
      }
      if (filtros.data_inicio) {
        query = query.gte("data_hora", filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte("data_hora", filtros.data_fim);
      }
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar logs de acesso:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtém estatísticas de logs (apenas supervisor)
   * @param {object} filtros - { data_inicio, data_fim }
   * @returns {Promise<Object>}
   */
  async getLogStats(filtros = {}) {
    if (!this.isSupervisor()) {
      return {
        success: false,
        error:
          "Permissão negada. Apenas supervisores podem visualizar estatísticas de logs.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      let query = client.from("logs_acesso").select("*");

      if (filtros.data_inicio) {
        query = query.gte("data_hora", filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte("data_hora", filtros.data_fim);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Agrupar por ação
      const porAcao = {};
      const porUsuario = {};
      const porDia = {};

      data.forEach((log) => {
        // Por ação
        if (!porAcao[log.acao]) porAcao[log.acao] = 0;
        porAcao[log.acao]++;

        // Por usuário
        if (!porUsuario[log.usuario_id]) porUsuario[log.usuario_id] = 0;
        porUsuario[log.usuario_id]++;

        // Por dia
        const dia = log.data_hora.slice(0, 10);
        if (!porDia[dia]) porDia[dia] = 0;
        porDia[dia]++;
      });

      return {
        success: true,
        data: {
          total: data.length,
          por_acao: porAcao,
          por_usuario: porUsuario,
          por_dia: porDia,
          logs: data.slice(0, 100),
        },
      };
    } catch (error) {
      console.error("❌ Erro ao obter estatísticas de logs:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // LISTENERS
  // ============================================

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

  // ============================================
  // UTILITÁRIOS
  // ============================================

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

// ========== CRIA A INSTÂNCIA GLOBAL (APENAS UMA VEZ) ==========
// Verifica se já existe uma instância, se não, cria uma nova
// Usa a abordagem mais segura para evitar sobrescrita
(function () {
  if (typeof window.authManager === "undefined") {
    console.log("🔐 Criando instância global do AuthManager");
    window.authManager = new AuthManager();
  } else {
    console.log("🔐 AuthManager já existe, reutilizando instância");
  }

  // Adiciona a variável 'authManager' ao escopo global (window)
  if (typeof window.authManager !== "undefined") {
    window.authManager = window.authManager;
  }
})();

// Torna acessível via 'authManager' no escopo global
const authManager = window.authManager;

console.log("🔐 AuthManager carregado");
console.log("📋 Tipo de isLoggedIn:", typeof authManager.isLoggedIn);
console.log(
  "📋 authManager.isLoggedIn():",
  typeof authManager.isLoggedIn === "function"
    ? authManager.isLoggedIn()
    : "Método não disponível",
);
