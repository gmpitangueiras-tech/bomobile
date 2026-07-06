// novo arquivo: js/logger.js
class Logger {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("📝 Logger inicializado");
  }

  async log(acao, entidade = null, entidadeId = null, detalhes = null) {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      // Obter IP real
      let ip = null;
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        ip = data.ip;
      } catch (e) {}

      await client.from("logs_acesso").insert({
        usuario_id: user.id,
        ip: ip,
        user_agent: navigator.userAgent,
        acao: acao,
        entidade: entidade,
        entidade_id: entidadeId,
        detalhes: detalhes ? JSON.stringify(detalhes) : null,
        data_hora: new Date().toISOString(),
      });

      console.log(`📝 Log registrado: ${acao}`);
    } catch (error) {
      console.warn("⚠️ Erro ao registrar log (não crítico):", error);
    }
  }

  // Métodos específicos para cada ação
  async logLogin(usuarioId) {
    return this.log("login");
  }

  async logLogout() {
    return this.log("logout");
  }

  async logCriarOcorrencia(ocorrenciaId, dados) {
    return this.log("criar_ocorrencia", "ocorrencia", ocorrenciaId, { dados });
  }

  async logFinalizarOcorrencia(ocorrenciaId) {
    return this.log("finalizar_ocorrencia", "ocorrencia", ocorrenciaId);
  }

  async logCancelarOcorrencia(ocorrenciaId, motivo) {
    return this.log("cancelar_ocorrencia", "ocorrencia", ocorrenciaId, {
      motivo,
    });
  }

  async logSolicitarRetificacao(ocorrenciaId, camposAlterados) {
    return this.log("solicitar_retificacao", "ocorrencia", ocorrenciaId, {
      camposAlterados,
    });
  }

  async logAprovarRetificacao(retificacaoId) {
    return this.log("aprovar_retificacao", "ocorrencia", retificacaoId);
  }

  async logRejeitarRetificacao(retificacaoId, motivo) {
    return this.log("rejeitar_retificacao", "ocorrencia", retificacaoId, {
      motivo,
    });
  }

  async logCriarUsuario(usuarioId) {
    return this.log("criar_usuario", "usuario", usuarioId);
  }

  async logEditarUsuario(usuarioId, camposAlterados) {
    return this.log("editar_usuario", "usuario", usuarioId, {
      camposAlterados,
    });
  }

  async logResetarSenha(usuarioId) {
    return this.log("resetar_senha", "usuario", usuarioId);
  }

  async logAtivarDesativarUsuario(usuarioId, status) {
    return this.log("ativar_desativar_usuario", "usuario", usuarioId, {
      status,
    });
  }
}

const logger = new Logger();
window.logger = logger;
