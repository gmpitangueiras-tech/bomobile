/**
 * LOGGER - Sistema de Logs e Auditoria
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Logs de acesso e ações do sistema
 * - Logs periciais para integridade
 * - Níveis de log (debug, info, warn, error)
 * - Persistência local de logs
 * - Exportação de logs
 * - Rotação de logs
 *
 * MELHORIAS APLICADAS:
 * - Logs periciais com hash de integridade
 * - Níveis de log configuráveis (debug, info, warn, error)
 * - Persistência local (IndexedDB / localStorage)
 * - Exportação de logs (CSV, JSON)
 * - Rotação de logs (limite de tamanho)
 * - Filtros por nível, data, usuário, ação
 * - Buffer de logs para reduzir chamadas ao banco
 * - Fallback para localStorage quando offline
 * - Integração com logs_periciais do banco
 *
 * Depende de: authManager (global), supabaseClient (global)
 */

// ============================================
// CONSTANTES
// ============================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  PERICIAL: 4,
};

const LOG_LEVEL_NAMES = {
  0: "DEBUG",
  1: "INFO",
  2: "WARN",
  3: "ERROR",
  4: "PERICIAL",
};

const LOG_LEVEL_COLORS = {
  DEBUG: "#6B7280",
  INFO: "#003F87",
  WARN: "#F59E0B",
  ERROR: "#DC2626",
  PERICIAL: "#8B5CF6",
};

const DEFAULT_LOG_LEVEL = LOG_LEVELS.INFO;
const MAX_LOCAL_LOGS = 1000;
const MAX_LOCAL_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
const LOG_RETENTION_DAYS = 30;

// ============================================
// CLASSE LOGGER
// ============================================

class Logger {
  constructor() {
    this.initialized = false;
    this.logLevel = DEFAULT_LOG_LEVEL;
    this.buffer = [];
    this.bufferSize = 10;
    this.flushInterval = 5000; // 5 segundos
    this.localLogs = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.storageKey = "guarda_logs";
    this.maxLocalLogs = MAX_LOCAL_LOGS;
    this.enableConsole = true;
    this.enableRemote = true;
    this.enableLocal = true;
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  /**
   * Inicializa o logger
   * @param {Object} options - Opções de configuração
   * @param {number} options.logLevel - Nível de log (0-4)
   * @param {boolean} options.enableConsole - Habilitar console
   * @param {boolean} options.enableRemote - Habilitar envio remoto
   * @param {boolean} options.enableLocal - Habilitar armazenamento local
   * @param {number} options.bufferSize - Tamanho do buffer
   * @param {number} options.flushInterval - Intervalo de flush (ms)
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    if (this.initialized) return;

    // Configurar opções
    this.logLevel =
      options.logLevel !== undefined ? options.logLevel : DEFAULT_LOG_LEVEL;
    this.enableConsole =
      options.enableConsole !== undefined ? options.enableConsole : true;
    this.enableRemote =
      options.enableRemote !== undefined ? options.enableRemote : true;
    this.enableLocal =
      options.enableLocal !== undefined ? options.enableLocal : true;
    this.bufferSize = options.bufferSize || 10;
    this.flushInterval = options.flushInterval || 5000;

    // Carregar logs locais
    if (this.enableLocal) {
      await this.carregarLogsLocais();
    }

    // Iniciar flush automático
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);

    this.initialized = true;
    console.log("📝 Logger inicializado");
    console.log(`📊 Nível de log: ${LOG_LEVEL_NAMES[this.logLevel]}`);
    console.log(
      `📊 Buffer: ${this.bufferSize} logs, flush a cada ${this.flushInterval / 1000}s`,
    );

    // Log de inicialização
    await this.info("Logger inicializado", {
      level: LOG_LEVEL_NAMES[this.logLevel],
      bufferSize: this.bufferSize,
      flushInterval: this.flushInterval,
    });
  }

  // ============================================
  // CARREGAR LOGS LOCAIS
  // ============================================

  /**
   * Carrega logs do localStorage
   * @returns {Promise<void>}
   */
  async carregarLogsLocais() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.localLogs = JSON.parse(stored);
        // Verificar tamanho
        if (this.localLogs.length > this.maxLocalLogs) {
          this.localLogs = this.localLogs.slice(-this.maxLocalLogs);
          this.salvarLogsLocais();
        }
        console.log(`📂 ${this.localLogs.length} logs locais carregados`);
      } else {
        this.localLogs = [];
      }
    } catch (error) {
      console.warn("⚠️ Erro ao carregar logs locais:", error);
      this.localLogs = [];
    }
  }

  /**
   * Salva logs no localStorage
   * @returns {void}
   */
  salvarLogsLocais() {
    try {
      // Verificar tamanho
      const json = JSON.stringify(this.localLogs);
      if (json.length > MAX_LOCAL_STORAGE_SIZE) {
        // Remover logs antigos
        this.localLogs = this.localLogs.slice(
          -Math.floor(this.maxLocalLogs / 2),
        );
        this.salvarLogsLocais();
        return;
      }
      localStorage.setItem(this.storageKey, json);
    } catch (error) {
      console.warn("⚠️ Erro ao salvar logs locais:", error);
    }
  }

  // ============================================
  // NÍVEIS DE LOG
  // ============================================

  /**
   * Define o nível de log
   * @param {number} level - Nível de log
   */
  setLogLevel(level) {
    if (level >= LOG_LEVELS.DEBUG && level <= LOG_LEVELS.PERICIAL) {
      this.logLevel = level;
      console.log(`📊 Nível de log alterado para: ${LOG_LEVEL_NAMES[level]}`);
    }
  }

  /**
   * Verifica se um nível deve ser logado
   * @param {number} level - Nível a verificar
   * @returns {boolean} - True se deve logar
   */
  shouldLog(level) {
    return level >= this.logLevel;
  }

  // ============================================
  // MÉTODOS DE LOG
  // ============================================

  /**
   * Log de debug
   * @param {string} mensagem - Mensagem
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async debug(mensagem, data = null) {
    return this.log(LOG_LEVELS.DEBUG, mensagem, data);
  }

  /**
   * Log de info
   * @param {string} mensagem - Mensagem
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async info(mensagem, data = null) {
    return this.log(LOG_LEVELS.INFO, mensagem, data);
  }

  /**
   * Log de warning
   * @param {string} mensagem - Mensagem
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async warn(mensagem, data = null) {
    return this.log(LOG_LEVELS.WARN, mensagem, data);
  }

  /**
   * Log de error
   * @param {string} mensagem - Mensagem
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async error(mensagem, data = null) {
    return this.log(LOG_LEVELS.ERROR, mensagem, data);
  }

  /**
   * Log pericial (com hash de integridade)
   * @param {string} acao - Ação realizada
   * @param {string} tabela - Tabela afetada
   * @param {string} registroId - ID do registro
   * @param {Object} dadosAnt - Dados anteriores
   * @param {Object} dadosNov - Dados novos
   * @returns {Promise<void>}
   */
  async logPericial(
    acao,
    tabela = null,
    registroId = null,
    dadosAnt = null,
    dadosNov = null,
  ) {
    // Gerar hash de integridade
    const hash = await this.gerarHashPericial(
      acao,
      tabela,
      registroId,
      dadosAnt,
      dadosNov,
    );

    const data = {
      acao: acao,
      tabela_afetada: tabela,
      registro_id: registroId,
      dados_anteriores: dadosAnt,
      dados_novos: dadosNov,
      hash_integridade: hash,
      usuario: authManager.getUser()?.nome_completo || "Sistema",
      usuario_id: authManager.getUserId(),
    };

    return this.log(LOG_LEVELS.PERICIAL, `Log pericial: ${acao}`, data);
  }

  /**
   * Método principal de log
   * @param {number} level - Nível de log
   * @param {string} mensagem - Mensagem
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async log(level, mensagem, data = null) {
    if (!this.shouldLog(level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level: level,
      levelName: LOG_LEVEL_NAMES[level],
      mensagem: mensagem,
      data: data,
      usuario: authManager.getUser()?.nome_completo || "Sistema",
      usuario_id: authManager.getUserId(),
      ip: await this.obterIP(),
      userAgent: navigator.userAgent,
      id: this.gerarID(),
    };

    // Adicionar ao buffer
    this.buffer.push(entry);

    // Console
    if (this.enableConsole) {
      this.logToConsole(entry);
    }

    // Local storage
    if (this.enableLocal) {
      this.localLogs.push(entry);
      if (this.localLogs.length > this.maxLocalLogs) {
        this.localLogs = this.localLogs.slice(-this.maxLocalLogs);
      }
      this.salvarLogsLocais();
    }

    // Enviar remoto
    if (this.enableRemote && this.buffer.length >= this.bufferSize) {
      await this.flush();
    }

    return entry;
  }

  // ============================================
  // CONSOLE
  // ============================================

  /**
   * Exibe log no console com cores
   * @param {Object} entry - Entrada de log
   */
  logToConsole(entry) {
    const levelName = entry.levelName;
    const color = LOG_LEVEL_COLORS[levelName] || "#6B7280";

    const style = `color: ${color}; font-weight: bold;`;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString("pt-BR");

    const prefix = `[${timestamp}] [${levelName}]`;

    if (entry.data) {
      console.log(`%c${prefix} ${entry.mensagem}`, style, entry.data);
    } else {
      console.log(`%c${prefix} ${entry.mensagem}`, style);
    }
  }

  // ============================================
  // FLUSH - ENVIO REMOTO
  // ============================================

  /**
   * Envia logs do buffer para o servidor
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    const logs = [...this.buffer];
    this.buffer = [];

    try {
      if (this.enableRemote && navigator.onLine) {
        const client = supabaseClient.getClient();
        if (client) {
          // Separar logs periciais dos logs normais
          const periciais = logs.filter((l) => l.level === LOG_LEVELS.PERICIAL);
          const normais = logs.filter((l) => l.level !== LOG_LEVELS.PERICIAL);

          // Enviar logs periciais para tabela específica
          if (periciais.length > 0) {
            await this.enviarLogsPericiais(periciais);
          }

          // Enviar logs normais para tabela de logs
          if (normais.length > 0) {
            await this.enviarLogsNormais(normais);
          }

          console.log(
            `📤 ${logs.length} logs enviados (${periciais.length} periciais)`,
          );
        }
      }
    } catch (error) {
      console.warn("⚠️ Erro ao enviar logs:", error);
      // Recolocar logs no buffer em caso de erro
      this.buffer = [...logs, ...this.buffer];
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Envia logs periciais para o banco
   * @param {Array} logs - Logs periciais
   * @returns {Promise<void>}
   */
  async enviarLogsPericiais(logs) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return;

      // Buscar informações adicionais para logs periciais
      const logsFormatados = await Promise.all(
        logs.map(async (log) => {
          const data = log.data || {};
          return {
            usuario_id: log.usuario_id,
            acao: data.acao || log.mensagem,
            tabela_afetada: data.tabela_afetada || null,
            registro_id: data.registro_id || null,
            dados_anteriores: data.dados_anteriores || null,
            dados_novos: data.dados_novos || null,
            ip_address: log.ip || null,
            user_agent: log.userAgent || null,
            hash_integridade: data.hash_integridade || null,
            criado_em: log.timestamp,
          };
        }),
      );

      const { error } = await client
        .from("logs_periciais")
        .insert(logsFormatados);

      if (error) throw error;
    } catch (error) {
      console.warn("⚠️ Erro ao enviar logs periciais:", error);
    }
  }

  /**
   * Envia logs normais para o banco
   * @param {Array} logs - Logs normais
   * @returns {Promise<void>}
   */
  async enviarLogsNormais(logs) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return;

      const logsFormatados = logs.map((log) => ({
        usuario_id: log.usuario_id,
        acao: log.mensagem,
        entidade: log.data?.entidade || null,
        detalhes: JSON.stringify(log.data || {}),
        ip: log.ip || null,
        user_agent: log.userAgent || null,
        data_hora: log.timestamp,
      }));

      const { error } = await client.from("logs_acesso").insert(logsFormatados);

      if (error) throw error;
    } catch (error) {
      console.warn("⚠️ Erro ao enviar logs normais:", error);
    }
  }

  // ============================================
  // HASH PERICIAL
  // ============================================

  /**
   * Gera hash de integridade para log pericial
   * @param {string} acao - Ação
   * @param {string} tabela - Tabela
   * @param {string} registroId - ID do registro
   * @param {Object} dadosAnt - Dados anteriores
   * @param {Object} dadosNov - Dados novos
   * @returns {Promise<string>} - Hash SHA-256
   */
  async gerarHashPericial(acao, tabela, registroId, dadosAnt, dadosNov) {
    try {
      const conteudo = JSON.stringify({
        acao,
        tabela,
        registroId,
        dadosAnt,
        dadosNov,
        timestamp: Date.now(),
      });

      const encoder = new TextEncoder();
      const data = encoder.encode(conteudo);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      console.warn("⚠️ Erro ao gerar hash pericial:", error);
      return null;
    }
  }

  // ============================================
  // CONSULTA DE LOGS
  // ============================================

  /**
   * Consulta logs locais
   * @param {Object} filtros - Filtros
   * @param {string} filtros.inicio - Data início
   * @param {string} filtros.fim - Data fim
   * @param {number} filtros.level - Nível de log
   * @param {string} filtros.usuario - Usuário
   * @param {string} filtros.busca - Texto de busca
   * @param {number} filtros.limit - Limite de resultados
   * @returns {Array} - Logs filtrados
   */
  consultarLogs(filtros = {}) {
    let logs = [...this.localLogs];

    if (filtros.inicio) {
      logs = logs.filter((l) => l.timestamp >= filtros.inicio);
    }
    if (filtros.fim) {
      logs = logs.filter((l) => l.timestamp <= filtros.fim);
    }
    if (filtros.level !== undefined && filtros.level !== null) {
      logs = logs.filter((l) => l.level === filtros.level);
    }
    if (filtros.usuario) {
      logs = logs.filter(
        (l) => l.usuario && l.usuario.includes(filtros.usuario),
      );
    }
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.mensagem.toLowerCase().includes(busca) ||
          (l.data && JSON.stringify(l.data).toLowerCase().includes(busca)),
      );
    }

    // Ordenar por timestamp (mais recente primeiro)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (filtros.limit) {
      logs = logs.slice(0, filtros.limit);
    }

    return logs;
  }

  // ============================================
  // EXPORTAÇÃO
  // ============================================

  /**
   * Exporta logs para CSV
   * @param {Object} filtros - Filtros para exportação
   * @param {string} nomeArquivo - Nome do arquivo
   * @returns {Object} - { success, data?, error? }
   */
  exportarCSV(filtros = {}, nomeArquivo = "logs.csv") {
    try {
      const logs = this.consultarLogs(filtros);

      if (logs.length === 0) {
        return { success: false, error: "Nenhum log para exportar" };
      }

      const cabecalhos = [
        "Data/Hora",
        "Nível",
        "Mensagem",
        "Usuário",
        "IP",
        "Dados",
      ];
      let csv = cabecalhos.join(",") + "\n";

      logs.forEach((log) => {
        const linha = [
          new Date(log.timestamp).toLocaleString("pt-BR"),
          log.levelName,
          `"${log.mensagem.replace(/"/g, '""')}"`,
          log.usuario || "Sistema",
          log.ip || "-",
          `"${JSON.stringify(log.data || {}).replace(/"/g, '""')}"`,
        ];
        csv += linha.join(",") + "\n";
      });

      // Download
      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", nomeArquivo);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true, fileName: nomeArquivo, total: logs.length };
    } catch (error) {
      console.error("❌ Erro ao exportar logs:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Exporta logs para JSON
   * @param {Object} filtros - Filtros para exportação
   * @param {string} nomeArquivo - Nome do arquivo
   * @returns {Object} - { success, data?, error? }
   */
  exportarJSON(filtros = {}, nomeArquivo = "logs.json") {
    try {
      const logs = this.consultarLogs(filtros);

      if (logs.length === 0) {
        return { success: false, error: "Nenhum log para exportar" };
      }

      const json = JSON.stringify(logs, null, 2);
      const blob = new Blob([json], {
        type: "application/json;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", nomeArquivo);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true, fileName: nomeArquivo, total: logs.length };
    } catch (error) {
      console.error("❌ Erro ao exportar logs:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // ROTAÇÃO DE LOGS
  // ============================================

  /**
   * Realiza rotação de logs (remove logs antigos)
   * @param {number} dias - Dias para manter
   * @returns {Promise<number>} - Número de logs removidos
   */
  async rotacionarLogs(dias = LOG_RETENTION_DAYS) {
    try {
      const limite = new Date();
      limite.setDate(limite.getDate() - dias);
      const limiteISO = limite.toISOString();

      const removidos = this.localLogs.filter(
        (l) => l.timestamp < limiteISO,
      ).length;
      this.localLogs = this.localLogs.filter((l) => l.timestamp >= limiteISO);
      this.salvarLogsLocais();

      console.log(`🗑️ ${removidos} logs antigos removidos (${dias} dias)`);

      // Também limpar buffer
      this.buffer = this.buffer.filter((l) => l.timestamp >= limiteISO);

      return removidos;
    } catch (error) {
      console.error("❌ Erro ao rotacionar logs:", error);
      return 0;
    }
  }

  // ============================================
  // MÉTODOS ESPECÍFICOS (WRAPPERS)
  // ============================================

  /**
   * Registra log de login
   * @param {string} usuarioId - ID do usuário
   * @returns {Promise<void>}
   */
  async logLogin(usuarioId) {
    await this.info(`Login do usuário ${usuarioId}`, {
      entidade: "login",
      usuario_id: usuarioId,
    });
    await this.logPericial("LOGIN", "usuarios", usuarioId);
  }

  /**
   * Registra log de logout
   * @param {string} usuarioId - ID do usuário
   * @returns {Promise<void>}
   */
  async logLogout(usuarioId) {
    await this.info(`Logout do usuário ${usuarioId}`, {
      entidade: "logout",
      usuario_id: usuarioId,
    });
    await this.logPericial("LOGOUT", "usuarios", usuarioId);
  }

  /**
   * Registra log de criação de ocorrência
   * @param {string} usuarioId - ID do usuário
   * @param {string} ocorrenciaId - ID da ocorrência
   * @returns {Promise<void>}
   */
  async logCriarOcorrencia(usuarioId, ocorrenciaId) {
    await this.info(`Criação de ocorrência ${ocorrenciaId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      ocorrencia_id: ocorrenciaId,
    });
    await this.logPericial("CRIAR_OCORRENCIA", "ocorrencias", ocorrenciaId);
  }

  /**
   * Registra log de finalização de ocorrência
   * @param {string} usuarioId - ID do usuário
   * @param {string} ocorrenciaId - ID da ocorrência
   * @returns {Promise<void>}
   */
  async logFinalizarOcorrencia(usuarioId, ocorrenciaId) {
    await this.info(`Finalização de ocorrência ${ocorrenciaId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      ocorrencia_id: ocorrenciaId,
    });
    await this.logPericial("FINALIZAR_OCORRENCIA", "ocorrencias", ocorrenciaId);
  }

  /**
   * Registra log de cancelamento de ocorrência
   * @param {string} usuarioId - ID do usuário
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {string} motivo - Motivo do cancelamento
   * @returns {Promise<void>}
   */
  async logCancelarOcorrencia(usuarioId, ocorrenciaId, motivo) {
    await this.warn(`Cancelamento de ocorrência ${ocorrenciaId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      ocorrencia_id: ocorrenciaId,
      motivo: motivo,
    });
    await this.logPericial(
      "CANCELAR_OCORRENCIA",
      "ocorrencias",
      ocorrenciaId,
      null,
      { motivo },
    );
  }

  /**
   * Registra log de solicitação de retificação
   * @param {string} usuarioId - ID do usuário
   * @param {string} ocorrenciaId - ID da ocorrência
   * @returns {Promise<void>}
   */
  async logSolicitarRetificacao(usuarioId, ocorrenciaId) {
    await this.info(`Solicitação de retificação ${ocorrenciaId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      ocorrencia_id: ocorrenciaId,
    });
    await this.logPericial(
      "SOLICITAR_RETIFICACAO",
      "ocorrencias",
      ocorrenciaId,
    );
  }

  /**
   * Registra log de aprovação de retificação
   * @param {string} usuarioId - ID do usuário
   * @param {string} retificacaoId - ID da retificação
   * @returns {Promise<void>}
   */
  async logAprovarRetificacao(usuarioId, retificacaoId) {
    await this.info(`Aprovação de retificação ${retificacaoId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      retificacao_id: retificacaoId,
    });
    await this.logPericial("APROVAR_RETIFICACAO", "ocorrencias", retificacaoId);
  }

  /**
   * Registra log de rejeição de retificação
   * @param {string} usuarioId - ID do usuário
   * @param {string} retificacaoId - ID da retificação
   * @param {string} motivo - Motivo da rejeição
   * @returns {Promise<void>}
   */
  async logRejeitarRetificacao(usuarioId, retificacaoId, motivo) {
    await this.warn(`Rejeição de retificação ${retificacaoId}`, {
      entidade: "ocorrencia",
      usuario_id: usuarioId,
      retificacao_id: retificacaoId,
      motivo: motivo,
    });
    await this.logPericial(
      "REJEITAR_RETIFICACAO",
      "ocorrencias",
      retificacaoId,
      null,
      { motivo },
    );
  }

  /**
   * Registra log de criação de usuário
   * @param {string} usuarioId - ID do usuário
   * @param {string} novoUsuarioId - ID do novo usuário
   * @returns {Promise<void>}
   */
  async logCriarUsuario(usuarioId, novoUsuarioId) {
    await this.info(`Criação de usuário ${novoUsuarioId}`, {
      entidade: "usuario",
      usuario_id: usuarioId,
      novo_usuario_id: novoUsuarioId,
    });
    await this.logPericial("CRIAR_USUARIO", "usuarios", novoUsuarioId);
  }

  /**
   * Registra log de edição de usuário
   * @param {string} usuarioId - ID do usuário
   * @param {string} usuarioAlteradoId - ID do usuário alterado
   * @returns {Promise<void>}
   */
  async logEditarUsuario(usuarioId, usuarioAlteradoId) {
    await this.info(`Edição de usuário ${usuarioAlteradoId}`, {
      entidade: "usuario",
      usuario_id: usuarioId,
      usuario_alterado_id: usuarioAlteradoId,
    });
    await this.logPericial("EDITAR_USUARIO", "usuarios", usuarioAlteradoId);
  }

  /**
   * Registra log de reset de senha
   * @param {string} usuarioId - ID do usuário
   * @param {string} usuarioAlteradoId - ID do usuário
   * @returns {Promise<void>}
   */
  async logResetarSenha(usuarioId, usuarioAlteradoId) {
    await this.warn(`Reset de senha do usuário ${usuarioAlteradoId}`, {
      entidade: "usuario",
      usuario_id: usuarioId,
      usuario_alterado_id: usuarioAlteradoId,
    });
    await this.logPericial("RESETAR_SENHA", "usuarios", usuarioAlteradoId);
  }

  /**
   * Registra log de ativação/desativação de usuário
   * @param {string} usuarioId - ID do usuário
   * @param {string} usuarioAlteradoId - ID do usuário
   * @param {string} status - Novo status
   * @returns {Promise<void>}
   */
  async logAtivarDesativarUsuario(usuarioId, usuarioAlteradoId, status) {
    await this.info(
      `Alteração de status do usuário ${usuarioAlteradoId} para ${status}`,
      {
        entidade: "usuario",
        usuario_id: usuarioId,
        usuario_alterado_id: usuarioAlteradoId,
        status: status,
      },
    );
    await this.logPericial(
      "ALTERAR_STATUS_USUARIO",
      "usuarios",
      usuarioAlteradoId,
      null,
      { status },
    );
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================

  /**
   * Obtém o IP do usuário
   * @returns {Promise<string|null>}
   */
  async obterIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gera ID único para cada log
   * @returns {string} - ID único
   */
  gerarID() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Limpa todos os logs locais
   * @returns {Promise<void>}
   */
  async limparLogsLocais() {
    this.localLogs = [];
    this.buffer = [];
    localStorage.removeItem(this.storageKey);
    console.log("🗑️ Logs locais limpos");
  }

  /**
   * Obtém estatísticas de logs
   * @returns {Object} - Estatísticas
   */
  getStats() {
    const total = this.localLogs.length;
    const porNivel = {};

    Object.values(LOG_LEVEL_NAMES).forEach((name) => {
      porNivel[name] = 0;
    });

    this.localLogs.forEach((log) => {
      if (porNivel[log.levelName] !== undefined) {
        porNivel[log.levelName]++;
      }
    });

    const hoje = new Date().toISOString().slice(0, 10);
    const hojeLogs = this.localLogs.filter(
      (l) => l.timestamp.slice(0, 10) === hoje,
    ).length;

    return {
      total,
      hoje: hojeLogs,
      porNivel,
      ultimoLog: this.localLogs.length > 0 ? this.localLogs[0].timestamp : null,
      tamanho: JSON.stringify(this.localLogs).length,
    };
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

const logger = new Logger();
window.logger = logger;

console.log("📝 Logger carregado");
