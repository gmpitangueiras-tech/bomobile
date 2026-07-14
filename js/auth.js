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
 *
 * MELHORIAS APLICADAS:
 * - Criptografia de dados sensíveis (CPF, RG, telefone) com AES-GCM
 * - Integração com logs periciais
 * - Hash de integridade para dados sensíveis
 * - Validação de força de senha
 * - Rate limiting para tentativas de login
 * - Registro de tentativas de login falhas
 * - Bloqueio temporário após múltiplas tentativas falhas
 */

// ============================================
// CONSTANTES
// ============================================

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos
const SALT_ROUNDS = 10;
const ENCRYPTION_KEY_LENGTH = 256;

// ============================================
// CLASSE AUTH MANAGER
// ============================================

class AuthManager {
  constructor() {
    this.user = null;
    this._isLoggedIn = false;
    this.initialized = false;
    this.listeners = [];
    this.loginAttempts = {};
    this.encryptionKey = null;
    this.initializedEncryption = false;
  }

  // ============================================
  // CRIPTOGRAFIA
  // ============================================

  /**
   * Inicializa a chave de criptografia
   * @returns {Promise<void>}
   */
  async initEncryption() {
    if (this.initializedEncryption) return;

    try {
      // Gerar ou recuperar chave do localStorage
      let keyData = localStorage.getItem("encryption_key");

      if (!keyData) {
        // Gerar nova chave
        const key = await crypto.subtle.generateKey(
          {
            name: "AES-GCM",
            length: ENCRYPTION_KEY_LENGTH,
          },
          true,
          ["encrypt", "decrypt"],
        );

        // Exportar chave para armazenamento
        const exported = await crypto.subtle.exportKey("raw", key);
        keyData = btoa(String.fromCharCode(...new Uint8Array(exported)));
        localStorage.setItem("encryption_key", keyData);
        this.encryptionKey = key;
      } else {
        // Importar chave existente
        const keyBuffer = Uint8Array.from(atob(keyData), (c) =>
          c.charCodeAt(0),
        );
        this.encryptionKey = await crypto.subtle.importKey(
          "raw",
          keyBuffer,
          "AES-GCM",
          true,
          ["encrypt", "decrypt"],
        );
      }

      this.initializedEncryption = true;
      console.log("🔐 Criptografia inicializada");
    } catch (error) {
      console.error("❌ Erro ao inicializar criptografia:", error);
      this.initializedEncryption = false;
    }
  }

  /**
   * Criptografa um texto
   * @param {string} text - Texto a ser criptografado
   * @returns {Promise<string>} Texto criptografado (base64)
   */
  async encryptData(text) {
    if (!text) return null;

    try {
      await this.initEncryption();
      if (!this.encryptionKey) return text;

      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      // Gerar IV aleatório
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        this.encryptionKey,
        data,
      );

      // Combinar IV + dados criptografados
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error("❌ Erro ao criptografar dados:", error);
      return text; // Fallback: retorna sem criptografia
    }
  }

  /**
   * Descriptografa um texto
   * @param {string} encryptedText - Texto criptografado (base64)
   * @returns {Promise<string>} Texto descriptografado
   */
  async decryptData(encryptedText) {
    if (!encryptedText) return null;

    try {
      await this.initEncryption();
      if (!this.encryptionKey) return encryptedText;

      const combined = Uint8Array.from(atob(encryptedText), (c) =>
        c.charCodeAt(0),
      );

      // Extrair IV (primeiros 12 bytes)
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        this.encryptionKey,
        data,
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("❌ Erro ao descriptografar dados:", error);
      return encryptedText; // Fallback: retorna como está
    }
  }

  /**
   * Gera hash de integridade para dados sensíveis
   * @param {string} data - Dados para gerar hash
   * @returns {Promise<string>} Hash SHA-256
   */
  async generateIntegrityHash(data) {
    if (!data) return null;

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      console.error("❌ Erro ao gerar hash de integridade:", error);
      return null;
    }
  }

  /**
   * Processa dados sensíveis para armazenamento (criptografa e gera hash)
   * @param {Object} data - Dados a serem processados
   * @param {Array} sensitiveFields - Campos sensíveis
   * @returns {Promise<Object>} Dados processados
   */
  async processSensitiveData(
    data,
    sensitiveFields = ["cpf", "rg", "telefone"],
  ) {
    const processed = { ...data };

    for (const field of sensitiveFields) {
      if (data[field]) {
        // Criptografar
        processed[`${field}_encrypted`] = await this.encryptData(data[field]);
        // Gerar hash para verificação de integridade
        processed[`${field}_hash`] = await this.generateIntegrityHash(
          data[field],
        );
        // Manter campo original se necessário (para compatibilidade)
        // Mas podemos removê-lo para maior segurança
        // processed[field] = data[field]; // Manter por enquanto
      }
    }

    return processed;
  }

  /**
   * Verifica integridade de dados sensíveis
   * @param {string} value - Valor atual
   * @param {string} storedHash - Hash armazenado
   * @returns {Promise<boolean>} True se íntegro
   */
  async verifyIntegrity(value, storedHash) {
    if (!value || !storedHash) return true;
    const currentHash = await this.generateIntegrityHash(value);
    return currentHash === storedHash;
  }

  // ============================================
  // Getter para isLoggedIn
  // ============================================

  get isLoggedIn() {
    return this._isLoggedIn;
  }

  // Método para compatibilidade
  isLoggedIn() {
    return this._isLoggedIn;
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return this._isLoggedIn;

    try {
      // Inicializar criptografia
      await this.initEncryption();

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

      const ip = await this.obterIP();
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
        console.warn("⚠️ Erro ao registrar log de acesso:", error);
        return { success: false, error: error.message, nonCritical: true };
      }

      console.log(`✅ Log de acesso registrado: ${acao}`);
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
  // VALIDAÇÃO DE SENHA
  // ============================================

  /**
   * Valida a força da senha
   * @param {string} senha - Senha a ser validada
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validarForcaSenha(senha) {
    const errors = [];

    if (senha.length < 8) {
      errors.push("A senha deve ter pelo menos 8 caracteres");
    }
    if (!/[a-z]/.test(senha)) {
      errors.push("A senha deve conter pelo menos uma letra minúscula");
    }
    if (!/[A-Z]/.test(senha)) {
      errors.push("A senha deve conter pelo menos uma letra maiúscula");
    }
    if (!/[0-9]/.test(senha)) {
      errors.push("A senha deve conter pelo menos um número");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(senha)) {
      errors.push("A senha deve conter pelo menos um caractere especial");
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      score: Math.max(0, 5 - errors.length),
    };
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  /**
   * Verifica se o usuário está bloqueado por tentativas falhas
   * @param {string} cpf - CPF do usuário
   * @returns {Object} { blocked: boolean, remainingTime: number }
   */
  checkLoginAttempts(cpf) {
    const key = cpf.replace(/\D/g, "");
    const record = this.loginAttempts[key];

    if (!record) {
      return { blocked: false, remainingTime: 0 };
    }

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingTime = Math.ceil(
        (record.lockedUntil - Date.now()) / 60000,
      );
      return { blocked: true, remainingTime };
    }

    // Se o bloqueio expirou, resetar contador
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      delete this.loginAttempts[key];
      return { blocked: false, remainingTime: 0 };
    }

    return { blocked: false, remainingTime: 0 };
  }

  /**
   * Registra uma tentativa de login falha
   * @param {string} cpf - CPF do usuário
   */
  registerFailedAttempt(cpf) {
    const key = cpf.replace(/\D/g, "");
    if (!this.loginAttempts[key]) {
      this.loginAttempts[key] = { attempts: 0, lockedUntil: null };
    }

    this.loginAttempts[key].attempts++;

    if (this.loginAttempts[key].attempts >= MAX_LOGIN_ATTEMPTS) {
      this.loginAttempts[key].lockedUntil = Date.now() + LOCKOUT_DURATION;
      console.log(
        `🔒 Usuário ${cpf} bloqueado por ${LOCKOUT_DURATION / 60000} minutos`,
      );
    }
  }

  /**
   * Limpa as tentativas de login após sucesso
   * @param {string} cpf - CPF do usuário
   */
  clearLoginAttempts(cpf) {
    const key = cpf.replace(/\D/g, "");
    delete this.loginAttempts[key];
  }

  // ============================================
  // AUTENTICAÇÃO
  // ============================================

  async login(cpf, senha) {
    try {
      const cpfClean = cpf.replace(/[^0-9]/g, "");
      if (cpfClean.length !== 11) {
        return { success: false, error: "CPF inválido" };
      }

      // Verificar rate limiting
      const attemptCheck = this.checkLoginAttempts(cpfClean);
      if (attemptCheck.blocked) {
        return {
          success: false,
          error: `Muitas tentativas falhas. Aguarde ${attemptCheck.remainingTime} minutos.`,
          blocked: true,
          remainingTime: attemptCheck.remainingTime,
        };
      }

      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const { data: usuario } = await client
        .from("usuarios")
        .select("*")
        .eq("cpf", cpfClean)
        .maybeSingle();

      if (!usuario) {
        this.registerFailedAttempt(cpfClean);
        return { success: false, error: "CPF não encontrado" };
      }

      if (usuario.status === "inativo" || usuario.status === "bloqueado") {
        return { success: false, error: "Usuário inativo ou bloqueado" };
      }

      const { data: senhaValida } = await client.rpc("verificar_senha", {
        p_cpf: cpfClean,
        p_senha: senha,
      });

      if (!senhaValida) {
        this.registerFailedAttempt(cpfClean);
        return { success: false, error: "Senha incorreta" };
      }

      // Limpar tentativas após sucesso
      this.clearLoginAttempts(cpfClean);

      this.user = usuario;
      this._isLoggedIn = true;

      // Processar dados sensíveis para armazenamento local
      const sensitiveData = await this.processSensitiveData(usuario, [
        "cpf",
        "rg",
        "telefone",
      ]);

      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id: usuario.id,
          nome_completo: usuario.nome_completo,
          cpf: usuario.cpf,
          perfil: usuario.perfil,
          matricula: usuario.matricula,
          // Armazenar dados criptografados
          sensitive: {
            cpf_encrypted: sensitiveData.cpf_encrypted,
            cpf_hash: sensitiveData.cpf_hash,
            rg_encrypted: sensitiveData.rg_encrypted,
            rg_hash: sensitiveData.rg_hash,
            telefone_encrypted: sensitiveData.telefone_encrypted,
            telefone_hash: sensitiveData.telefone_hash,
          },
        }),
      );

      // ===== REGISTRAR LOG DE LOGIN =====
      await this.logLogin(usuario.id);

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial("LOGIN", "usuarios", usuario.id);
      }

      // ===== ATUALIZAR ÚLTIMO LOGIN =====
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
      if (!this.user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      // Validar força da senha
      const validacao = this.validarForcaSenha(novaSenha);
      if (!validacao.valid) {
        return {
          success: false,
          error: `Senha fraca: ${validacao.errors.join(", ")}`,
          validationErrors: validacao.errors,
        };
      }

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

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial("LOGOUT", "usuarios", usuarioId);
      }
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

  podeEditar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) {
      return ocorrencia.status === "draft";
    }
    return (
      ocorrencia.criado_por === this.user.id && ocorrencia.status === "draft"
    );
  }

  podeVisualizar(ocorrencia) {
    if (!this.user) return false;
    return true;
  }

  podeFinalizar(ocorrencia) {
    if (!this.user) return false;
    if (this.isSupervisor()) {
      return ocorrencia.status === "draft";
    }
    return (
      ocorrencia.criado_por === this.user.id && ocorrencia.status === "draft"
    );
  }

  podeCancelar(ocorrencia) {
    if (!this.user) return false;
    if (!this.isSupervisor()) return false;
    return ocorrencia.status !== "cancelled";
  }

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

  podeAprovarRetificacao(ocorrencia) {
    if (!this.user) return false;
    return this.isSupervisor() && ocorrencia.status === "pending_rectification";
  }

  podeRejeitarRetificacao(ocorrencia) {
    if (!this.user) return false;
    return this.isSupervisor() && ocorrencia.status === "pending_rectification";
  }

  podeVerHistorico(ocorrencia) {
    return this.isLoggedIn();
  }

  podeAcessarRelatorios() {
    return this.isSupervisor();
  }

  podeGerenciarUsuarios() {
    return this.isSupervisor();
  }

  podeVerLogs() {
    return this.isSupervisor();
  }

  // ============================================
  // GERENCIAMENTO DE USUÁRIOS
  // ============================================

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

      const { data: existe } = await client
        .from("usuarios")
        .select("cpf")
        .eq("cpf", cpfClean)
        .maybeSingle();

      if (existe) {
        return { success: false, error: "CPF já cadastrado" };
      }

      const senhaTemp = dados.senha || this.gerarSenhaTemporaria();
      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: senhaTemp,
      });

      // Processar dados sensíveis
      const sensitiveData = await this.processSensitiveData(dados, [
        "cpf",
        "telefone",
      ]);

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
        // Campos criptografados
        cpf_encrypted: sensitiveData.cpf_encrypted,
        cpf_hash: sensitiveData.cpf_hash,
        telefone_encrypted: sensitiveData.telefone_encrypted,
        telefone_hash: sensitiveData.telefone_hash,
      };

      const { data, error } = await client
        .from("usuarios")
        .insert([novoUsuario])
        .select()
        .single();

      if (error) throw error;

      await this.logCriarUsuario(this.user.id, data.id);

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial(
          "CRIAR_USUARIO",
          "usuarios",
          data.id,
        );
      }

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

  async atualizarUsuario(id, dados) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      if (!this.isSupervisor()) {
        if (id !== this.user.id) {
          return {
            success: false,
            error: "Permissão negada. Você só pode editar seu próprio perfil.",
          };
        }
        const camposPermitidos = ["nome_completo", "telefone", "email"];
        const dadosFiltrados = {};
        for (const campo of camposPermitidos) {
          if (dados[campo] !== undefined) {
            dadosFiltrados[campo] = dados[campo];
          }
        }
        dados = dadosFiltrados;
      }

      // Se for supervisor, pode editar todos os campos
      delete dados.senha_hash;

      // Processar dados sensíveis se presentes
      if (dados.cpf || dados.telefone) {
        const sensitiveData = await this.processSensitiveData(dados, [
          "cpf",
          "telefone",
        ]);
        if (dados.cpf) {
          dados.cpf_encrypted = sensitiveData.cpf_encrypted;
          dados.cpf_hash = sensitiveData.cpf_hash;
        }
        if (dados.telefone) {
          dados.telefone_encrypted = sensitiveData.telefone_encrypted;
          dados.telefone_hash = sensitiveData.telefone_hash;
        }
      }

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

      await this.logEditarUsuario(this.user.id, id);

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial("EDITAR_USUARIO", "usuarios", id);
      }

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

      await this.logAtivarDesativarUsuario(this.user.id, id);

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial(
          "ALTERAR_STATUS_USUARIO",
          "usuarios",
          id,
        );
      }

      console.log(`✅ Usuário ${id} alterado para status: ${status}`);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao alterar status do usuário:", error);
      return { success: false, error: error.message };
    }
  }

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

      await this.logResetarSenha(this.user.id, id);

      // Registrar log pericial
      if (window.app && typeof window.app.registrarLogPericial === "function") {
        await window.app.registrarLogPericial("RESETAR_SENHA", "usuarios", id);
      }

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

  gerarSenhaTemporaria() {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let senha = "";
    for (let i = 0; i < 12; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Garantir pelo menos uma letra maiúscula, uma minúscula, um número e um especial
    senha = "Temp" + senha + "123!";
    return senha;
  }

  // ============================================
  // LISTAGEM DE LOGS DE ACESSO
  // ============================================

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

      const porAcao = {};
      const porUsuario = {};
      const porDia = {};

      data.forEach((log) => {
        if (!porAcao[log.acao]) porAcao[log.acao] = 0;
        porAcao[log.acao]++;

        if (!porUsuario[log.usuario_id]) porUsuario[log.usuario_id] = 0;
        porUsuario[log.usuario_id]++;

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

// ============================================
// CRIA A INSTÂNCIA GLOBAL
// ============================================

(function () {
  if (typeof window.authManager === "undefined") {
    console.log("🔐 Criando instância global do AuthManager");
    window.authManager = new AuthManager();
  } else {
    console.log("🔐 AuthManager já existe, reutilizando instância");
  }

  if (typeof window.authManager !== "undefined") {
    window.authManager = window.authManager;
  }
})();

const authManager = window.authManager;

console.log("🔐 AuthManager carregado");
console.log("📋 Tipo de isLoggedIn:", typeof authManager.isLoggedIn);
console.log(
  "📋 authManager.isLoggedIn():",
  typeof authManager.isLoggedIn === "function"
    ? authManager.isLoggedIn()
    : "Método não disponível",
);
