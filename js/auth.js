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

// logs_acesso.data_hora é timestamp sem fuso, armazenado como UTC.
function dataLocalSPParaUtcSemFuso(dataString, diasAdicionais = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataString || ""));
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const dataValidacao = new Date(Date.UTC(ano, mes - 1, dia));
  if (dataValidacao.getUTCFullYear() !== ano || dataValidacao.getUTCMonth() !== mes - 1 || dataValidacao.getUTCDate() !== dia) return null;

  const diaAlvo = dia + diasAdicionais;
  const meioDiaUtc = Date.UTC(ano, mes - 1, diaAlvo, 12, 0, 0);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(meioDiaUtc));
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  const paredeLocalEmUtc = Date.UTC(
    Number(valores.year), Number(valores.month) - 1, Number(valores.day),
    Number(valores.hour), Number(valores.minute), Number(valores.second),
  );
  const diferencaFuso = paredeLocalEmUtc - meioDiaUtc;
  return new Date(Date.UTC(ano, mes - 1, diaAlvo, 0, 0, 0) - diferencaFuso)
    .toISOString().slice(0, 19);
}

function aplicarFiltrosDataLogs(query, filtros = {}) {
  if (filtros.data_inicio) {
    const inicio = dataLocalSPParaUtcSemFuso(filtros.data_inicio);
    if (!inicio) throw new Error("Data inicial inválida.");
    query = query.gte("data_hora", inicio);
  }
  if (filtros.data_fim) {
    const fimExclusivo = dataLocalSPParaUtcSemFuso(filtros.data_fim, 1);
    if (!fimExclusivo) throw new Error("Data final inválida.");
    query = query.lt("data_hora", fimExclusivo);
  }
  return query;
}

function sanitizarBuscaLogs(valor) {
  return String(valor || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s@._:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// ============================================
// CLASSE AUTH MANAGER
// ============================================

class AuthManager {
  constructor() {
    this.user = null;
    this._currentCpf = null;
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
      localStorage.removeItem("encryption_key");
      this.encryptionKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: ENCRYPTION_KEY_LENGTH },
        false,
        ["encrypt", "decrypt"],
      );
      this.initializedEncryption = true;
    } catch (error) {
      console.warn("Criptografia efêmera indisponível nesta sessão.");
      this.encryptionKey = null;
      this.initializedEncryption = true;
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

  async carregarPerfilJWT(userId) {
    const client = supabaseClient.getClient();
    if (!client || !userId) return null;
    const { data, error } = await client.rpc("gm_my_profile");
    if (error) throw error;
    // A RPC retorna somente o perfil seguro associado ao JWT atual.
    const rawProfile = data && typeof data === "object" && !Array.isArray(data) ? data : null;
    if (!rawProfile || ["inativo", "bloqueado"].includes(rawProfile.status)) return null;
    const { cpf, cpf_hash, senha_hash, ...profile } = rawProfile;
    return profile;
  }
  async init() {
    if (this.initialized) return this._isLoggedIn;

    try {
      if (!supabaseClient.isInitialized()) await supabaseClient.init();
      const client = supabaseClient.getClient();
      if (!client) throw new Error("Supabase não disponível");

      // auth_user continha perfil/PII e era tratado como prova de autenticação.
      // Removê-lo é seguro: a sessão válida passa a vir exclusivamente do Supabase Auth.
      localStorage.removeItem("auth_user");
      const { data: { session }, error } = await client.auth.getSession();
      if (error) throw error;
      // A sessão JWT sozinha não desbloqueia o cofre: após recarga, solicitar
      // novamente CPF/senha no formulário para derivar a chave local.
      if (session?.user?.id) {
        this._isLoggedIn = false;
        this.user = null;
        this.initialized = true;
        return false;
      }

      this._isLoggedIn = false;
      this.user = null;
      this.initialized = true;
      console.log("👤 Usuário não autenticado");
      return false;
    } catch (error) {
      console.error("❌ Erro ao inicializar auth:", error);
      this._isLoggedIn = false;
      this.user = null;
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
        data_hora: globalThis.obterTimestampBrasilSemFuso(),
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
      const cpfClean = String(cpf || "").replace(/\D/g, "");
      if (cpfClean.length !== 11 || typeof senha !== "string" || !senha) {
        return { success: false, error: "CPF ou senha inválidos." };
      }

      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Serviço indisponível." };

      const loginOffline = async () => {
        const local = await window.offlineVault.tryOfflineLogin(cpfClean, senha);
        this.user = { ...local.profile, id: local.userId };
        this._currentCpf = cpfClean;
        this._isLoggedIn = true;
        this.initialized = true;
        this.offlineOnly = true;
        this.notifyListeners("login", this.user);
        return { success: true, offline: true, usuario: this.user };
      };
      if (!navigator.onLine) {
        try { return await loginOffline(); }
        catch (_) { return { success: false, error: "Sem conexão. O acesso offline não foi habilitado para esta conta neste dispositivo." }; }
      }

      // A validação de CPF/senha ocorre no servidor; não consultar CPF nem hash no client.
      const endpoint = `${String(CONFIG.SUPABASE_URL).replace(/\/$/, "")}/functions/v1/legacy-login`;
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: cpfClean, senha }),
        });
      } catch (_) {
        try { return await loginOffline(); }
        catch (_) { return { success: false, error: "Não foi possível autenticar. O cofre offline não está disponível para esta conta." }; }
      }
      let result = null;
      try { result = await response.json(); } catch { /* resposta inválida */ }
      if (!response.ok || result?.success !== true || !result.session) {
        return { success: false, error: result?.error || "CPF ou senha inválidos.", blocked: response.status === 429 };
      }

      const { data: sessionData, error: sessionError } = await client.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      // Remover referências locais aos tokens temporários do payload.
      result.session.access_token = "";
      result.session.refresh_token = "";
      if (sessionError || !sessionData?.user?.id) {
        return { success: false, error: "Não foi possível concluir a autenticação." };
      }

      const usuario = await this.carregarPerfilJWT(sessionData.user.id);
      if (!usuario) {
        await client.auth.signOut({ scope: "local" });
        return { success: false, error: "Conta sem perfil ativo autorizado." };
      }

      try {
        await window.offlineVault.unlock(usuario.id, senha, usuario, cpfClean);
      } catch (vaultError) {
        await client.auth.signOut({ scope: "local" });
        window.offlineVault?.lock();
        this.user = null; this._currentCpf = null; this._isLoggedIn = false; this.initialized = true;
        return { success: false, error: vaultError.message || "Não foi possível abrir o cofre local." };
      }
      this.user = usuario;
      this._currentCpf = cpfClean;
      this._isLoggedIn = true;
      this.initialized = true;
      this.offlineOnly = false;

      // Login é confirmado pelo servidor. Falha de log não deve invalidar a sessão.
      try { await this.logLogin(usuario.id); } catch (e) { console.warn("Falha ao registrar login."); }
      try {
        if (window.app && typeof window.app.registrarLogPericial === "function") {
          await window.app.registrarLogPericial("LOGIN", "usuarios", usuario.id);
        }
      } catch (e) { console.warn("Falha ao registrar auditoria do login."); }

      this.notifyListeners("login", usuario);
      if (usuario.status === "primeiro_acesso" || usuario.primeiro_acesso === true) {
        return { success: true, primeiro_acesso: true, usuario };
      }
      return { success: true, usuario };
    } catch (error) {
      console.error("❌ Erro no login:", error?.name || "erro");
      return { success: false, error: "Não foi possível autenticar agora. Verifique a conexão e tente novamente." };
    }
  }

  async primeiroAcesso(novaSenha, telefone = null, email = null) {
    try {
      if (!this.user) return { success: false, error: "Usuário não autenticado" };
      const validacao = this.validarForcaSenha(novaSenha);
      if (!validacao.valid) return { success: false, error: `Senha fraca: ${validacao.errors.join(", ")}`, validationErrors: validacao.errors };
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };
      const { data: hashData, error: hashError } = await client.rpc("criar_hash_senha", { p_senha: novaSenha });
      if (hashError) throw hashError;
      const { error: completeError } = await client.rpc("gm_complete_first_access", {
        p_password_hash: hashData,
        p_email: email || null,
        p_telefone: telefone || null,
      });
      if (completeError) throw completeError;
      // Fluxo compatível já existente: a atualização do Auth ocorre após a RPC.
      // Se falhar, a senha do perfil já estará atualizada e Auth poderá divergir.
      const { error: authPasswordError } = await client.auth.updateUser({ password: novaSenha });
      if (authPasswordError) throw new Error(`Perfil atualizado, mas a senha Auth não foi sincronizada: ${authPasswordError.message}`);
      if (window.offlineVault?.unlocked && window.offlineVault.userId === this.user.id) await window.offlineVault.rekey(novaSenha, this._currentCpf);
      this.user.status = "ativo";
      this.user.primeiro_acesso = false;
      if (telefone) this.user.telefone = telefone;
      if (email) this.user.email = email;
      await this.registrarLogAcesso(this.user.id, "primeiro_acesso");
      this.notifyListeners("primeiro_acesso", this.user);
      return { success: true, usuario: this.user };
    } catch (error) {
      console.error("❌ Erro no primeiro acesso:", error);
      return { success: false, error: error.message };
    }
  }
  podeAcessarRelatorios() {
    // Todos os perfis autenticados podem consultar relatórios; o módulo aplica
    // escopo próprio para guarda e escopo completo para supervisor/admin.
    return this.isLoggedIn();
  }

  podeGerenciarUsuarios() {
    return this.isAdministrador();
  }

  podeVerLogs() {
    return this.isAdministrador();
  }

  // ============================================
  // GERENCIAMENTO DE USUÁRIOS
  // ============================================

  async listarUsuarios(filtros = {}) {
    if (!this.isAdministrador()) return { success: false, error: "Permissão negada. Apenas administradores podem listar usuários." };
    try {
      if (!window.adminApi) throw new Error("API administrativa indisponível.");
      const response = await window.adminApi.listUsers(filtros.search || "");
      let data = response.users || response.data || [];
      if (!Array.isArray(data)) data = [];
      // Nunca propagar identificadores/hash em listagens gerais, mesmo se a API os incluir.
      data = data.map(({ cpf, cpf_hash, senha_hash, ...user }) => user);
      if (filtros.perfil) data = data.filter((u) => u.perfil === filtros.perfil);
      if (filtros.status) data = data.filter((u) => u.status === filtros.status);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao listar usuários:", error);
      return { success: false, error: error.message };
    }
  }
  async listarUsuariosParaLogs() {
    if (!this.isAdministrador()) {
      return { success: false, error: "Permissão negada. Apenas administradores podem consultar usuários nos logs." };
    }
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };
      const { data, error } = await client
        .from("usuarios")
        .select("id,nome_completo,matricula")
        .order("nome_completo")
        .limit(500);
      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Erro ao carregar usuários para filtros de logs:", error);
      return { success: false, error: error.message };
    }
  }

  async criarUsuario(dados) {
    if (!this.isAdministrador()) return { success: false, error: "Permissão negada. Apenas administradores podem criar usuários." };
    try {
      if (!window.adminApi) throw new Error("API administrativa indisponível.");
      const response = await window.adminApi.createUser({
        nome: dados.nome, cpf: String(dados.cpf || "").replace(/\D/g, ""),
        matricula: dados.matricula || null, email: dados.email || null,
        telefone: dados.telefone || null, perfil: dados.perfil || "guarda",
        senha: dados.senha || null,
      });
      const data = response.data || response.user || null;
      if (data?.id) await this.logCriarUsuario(this.user.id, data.id);
      if (data?.id && window.app?.registrarLogPericial) await window.app.registrarLogPericial("CRIAR_USUARIO", "usuarios", data.id);
      return { success: true, data, senha_temporaria: response.senha_temporaria || response.temporary_password || null };
    } catch (error) {
      console.error("❌ Erro ao criar usuário:", error);
      return { success: false, error: error.message };
    }
  }
  async atualizarUsuario(id, dados) {
    try {
      const atualizaProprioPerfil = id === this.user?.id;
      if (!this.isAdministrador() && !atualizaProprioPerfil) return { success: false, error: "Permissão negada. Você só pode atualizar o próprio perfil." };
      const camposPerfil = ["nome_completo", "apelido", "email", "telefone"];
      if (this.isAdministrador()) {
        if (!window.adminApi) throw new Error("API administrativa indisponível.");
        const response = await window.adminApi.updateUser({ id, ...dados });
        const data = response.data || response.user || null;
        await this.logEditarUsuario(this.user.id, id);
        if (window.app?.registrarLogPericial) await window.app.registrarLogPericial("EDITAR_USUARIO", "usuarios", id);
        return { success: true, data };
      }
      const payload = {};
      camposPerfil.forEach((campo) => {
        if (Object.prototype.hasOwnProperty.call(dados, campo)) payload[campo] = dados[campo];
      });
      if (!Object.keys(payload).length) return { success: false, error: "Nenhum campo de perfil permitido para atualização." };
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };
      const { data, error } = await client.from("usuarios").update(payload).eq("id", id)
        .select("id,nome_completo,apelido,email,telefone,perfil,status,primeiro_acesso,foto_url").single();
      if (error) throw error;
      await this.logEditarUsuario(this.user.id, id);
      if (id === this.user.id) this.user = { ...this.user, ...data };
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao atualizar usuário:", error);
      return { success: false, error: error.message };
    }
  }
  async ativarDesativarUsuario(id, status) {
    if (!this.isAdministrador()) return { success: false, error: "Permissão negada. Apenas administradores podem alterar status de usuários." };
    if (!["ativo", "inativo", "bloqueado"].includes(status)) return { success: false, error: "Status inválido." };
    try {
      const response = await window.adminApi.updateUser({ id, status });
      return { success: true, data: response.data || response.user || null };
    } catch (error) { return { success: false, error: error.message }; }
  }
  async resetarSenha(id) {
    if (!this.isAdministrador()) return { success: false, error: "Permissão negada. Apenas administradores podem resetar senhas." };
    try {
      const response = await window.adminApi.resetPassword(id);
      const data = response.data || response.user || null;
      if (window.app?.registrarLogPericial) await window.app.registrarLogPericial("RESETAR_SENHA", "usuarios", id);
      return { success: true, data, senha_temporaria: response.senha_temporaria || response.temporary_password || null };
    } catch (error) { return { success: false, error: error.message }; }
  }

  async listarLogsAcesso(filtros = {}) {
    if (!this.isAdministrador()) {
      return {
        success: false,
        error: "Permissão negada. Apenas administradores podem visualizar logs.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const limiteSolicitado = Number.parseInt(filtros.limit, 10);
      const limite = Math.max(1, Math.min(Number.isFinite(limiteSolicitado) ? limiteSolicitado : 50, 500));
      const deslocamentoSolicitado = Number.parseInt(filtros.offset, 10);
      const deslocamento = Math.max(0, Number.isFinite(deslocamentoSolicitado) ? deslocamentoSolicitado : 0);
      let query = client
        .from("logs_acesso")
        .select("id,data_hora,usuario_id,acao,entidade,detalhes,ip,usuarios(nome_completo,matricula)", { count: "exact" });

      if (filtros.usuario_id) {
        query = query.eq("usuario_id", filtros.usuario_id);
      }
      if (filtros.acao) {
        query = query.eq("acao", filtros.acao);
      }
      query = aplicarFiltrosDataLogs(query, filtros);
      const busca = sanitizarBuscaLogs(filtros.busca);
      if (busca) {
        query = query.or(`acao.ilike.%${busca}%,entidade.ilike.%${busca}%,detalhes.ilike.%${busca}%,ip.ilike.%${busca}%`);
      }

      const { data, error, count } = await query
        .order("data_hora", { ascending: false })
        .order("id", { ascending: false })
        .range(deslocamento, deslocamento + limite - 1);
      if (error) throw error;

      return { success: true, data: data || [], count: count ?? 0, limit: limite, offset: deslocamento };
    } catch (error) {
      console.error("❌ Erro ao listar logs de acesso:", error);
      return { success: false, error: error.message };
    }
  }

  async getLogStats(filtros = {}) {
    if (!this.isAdministrador()) {
      return {
        success: false,
        error:
          "Permissão negada. Apenas administradores podem visualizar estatísticas de logs.",
      };
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar" };

      const contar = async (tipo) => {
        let query = client.from("logs_acesso").select("id", { count: "exact", head: true });
        query = aplicarFiltrosDataLogs(query, filtros);
        if (tipo === "login") query = query.eq("acao", "login");
        if (tipo === "ocorrencias") {
          query = query.in("acao", [
            "criar_ocorrencia", "finalizar_ocorrencia", "cancelar_ocorrencia",
            "solicitar_retificacao", "aprovar_retificacao", "rejeitar_retificacao",
          ]);
        }
        return query;
      };
      const [total, logins, acoesOcorrencia] = await Promise.all([
        contar("total"), contar("login"), contar("ocorrencias"),
      ]);
      for (const resultado of [total, logins, acoesOcorrencia]) {
        if (resultado.error) throw resultado.error;
      }

      return {
        success: true,
        data: {
          total: total.count ?? 0,
          logins: logins.count ?? 0,
          acoes_ocorrencia: acoesOcorrencia.count ?? 0,
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

  async logout() {
    const usuarioId = this.user?.id;
    if (usuarioId) {
      await this.logLogout(usuarioId);
      try {
        await window.app?.registrarLogPericial?.("LOGOUT", "usuarios", usuarioId);
      } catch (_) {}
    }
    this._isLoggedIn = false;
    this.user = null;
    this._currentCpf = null;
    this.offlineOnly = false;
    window.offlineVault?.lock();
    window.syncManager?.lock?.();
    window.adminApi?.clear?.();
    localStorage.removeItem("auth_user");
    const client = supabaseClient.getClient();
    if (client) await client.auth.signOut({ scope: "local" });
    this.notifyListeners("logout", null);
    return { success: true };
  }

  getUser() { return this.user; }
  getPerfil() { return this.user?.perfil || null; }
  getUserId() { return this.user?.id || null; }
  getNome() { return this.user?.nome_completo || null; }
  getMatricula() { return this.user?.matricula || null; }
  isSupervisor() { return this.user?.perfil === "supervisor"; }
  isAdministrador() { return this.user?.perfil === "administrador"; }
  isSupervisorOperacional() { return this.isSupervisor(); }
  isGuarda() { return this.user?.perfil === "guarda"; }
  isPrimeiroAcesso() {
    return this.user?.status === "primeiro_acesso" || this.user?.primeiro_acesso === true;
  }
  can(permission) {
    const matrix = {
      governanca: this.isAdministrador(),
      logs: this.isAdministrador(),
      usuarios: this.isAdministrador(),
      resetar_senha: this.isAdministrador(),
      relatorios: this.podeAcessarRelatorios(),
      retificacoes: this.isSupervisor() || this.isAdministrador(),
    };
    return Boolean(matrix[permission]);
  }

  podeEditar(ocorrencia) {
    if (!this.user || !ocorrencia) return false;
    const gestor = this.isSupervisor() || this.isAdministrador();
    const autor = ocorrencia.criado_por === this.user.id;
    const rascunho = ocorrencia.status === "draft";
    const rapidoIncompleto = autor && ocorrencia.modo_criacao === "rapido" && !ocorrencia.completado_em && ["synced", "pending_sync"].includes(ocorrencia.status);
    return (gestor || autor) && (rascunho || rapidoIncompleto);
  }
  podeVisualizar(ocorrencia) { return Boolean(this.user && ocorrencia); }
  podeFinalizar(ocorrencia) { return this.podeEditar(ocorrencia); }
  podeCancelar(ocorrencia) {
    return Boolean(this.user && (this.isSupervisor() || this.isAdministrador()) && ocorrencia?.status !== "cancelled");
  }
  podeSolicitarRetificacao(ocorrencia) {
    if (!this.user || !ocorrencia || ocorrencia.status !== "synced" || ocorrencia.ocorrencia_original_id) return false;
    return this.isSupervisor() || this.isAdministrador() || ocorrencia.criado_por === this.user.id || ocorrencia._guarda_designado === true;
  }
  podeAprovarRetificacao(ocorrencia) {
    return Boolean(this.user && (this.isSupervisor() || this.isAdministrador()) && ocorrencia?.status === "pending_rectification");
  }
  podeRejeitarRetificacao(ocorrencia) { return this.podeAprovarRetificacao(ocorrencia); }
  podeVerHistorico() { return this._isLoggedIn; }

  getCPF() {
    return this._isLoggedIn ? this._currentCpf : null;
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
