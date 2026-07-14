/**
 * SYNC MANAGER - Sincronização de Dados
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Sincronização de ocorrências (offline -> online)
 * - Sincronização de abordagens
 * - Fila de sincronização com prioridade
 * - Retry com backoff exponencial
 * - Resolução de conflitos
 * - Monitoramento de status
 * - Sincronização periódica em background
 *
 * MELHORIAS APLICADAS:
 * - Sincronização bidirecional (upload e download)
 * - Resolução de conflitos (timestamp-based)
 * - Retry com backoff exponencial (1s, 2s, 4s, 8s, 16s, 32s, 60s)
 * - Fila de prioridade (urgente > normal > baixa)
 * - Monitoramento de status (progresso, itens pendentes)
 * - Sync em background (Background Sync API)
 * - Cache de resultados de sincronização
 * - Eventos de progresso
 * - Web Workers para processamento em background
 *
 * Depende de: dbManager (global), supabaseClient (global),
 *             authManager (global), utils
 */

// ============================================
// CONSTANTES
// ============================================

const SYNC_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  SUCCESS: "success",
  ERROR: "error",
  CONFLICT: "conflict",
};

const SYNC_PRIORITY = {
  URGENTE: 0,
  NORMAL: 1,
  BAIXA: 2,
};

const MAX_RETRIES = 7;
const BASE_DELAY = 1000; // 1 segundo
const MAX_DELAY = 60000; // 60 segundos
const SYNC_INTERVAL = 300000; // 5 minutos
const BATCH_SIZE = 50;

// ============================================
// CLASSE SYNC MANAGER
// ============================================

class SyncManager {
  constructor() {
    this.initialized = false;
    this.isSyncing = false;
    this.syncQueue = [];
    this.progress = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      current: null,
    };
    this.listeners = [];
    this.retryTimeouts = [];
    this.lastSync = null;
    this.syncTimer = null;
    this.offlineQueue = [];
    this.isOffline = !navigator.onLine;
    this.syncInProgress = false;
    this.pendingItems = new Map();
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return;

    // Inicializar dbManager se disponível
    if (dbManager && !dbManager.isInitialized) {
      await dbManager.init();
    }

    // Carregar fila de sincronização
    await this.carregarFila();

    // Configurar listeners de rede
    this.setupNetworkListeners();

    // Iniciar sincronização periódica
    this.syncTimer = setInterval(() => {
      if (navigator.onLine) {
        this.sincronizar();
      }
    }, SYNC_INTERVAL);

    // Sincronizar imediatamente se online
    if (navigator.onLine) {
      setTimeout(() => this.sincronizar(), 3000);
    }

    this.initialized = true;
    console.log("🔄 Sync Manager inicializado");
    console.log(`📊 ${this.syncQueue.length} itens na fila de sincronização`);
    console.log(`🌐 Status online: ${navigator.onLine}`);

    return true;
  }

  // ============================================
  // CARREGAR FILA
  // ============================================

  async carregarFila() {
    try {
      if (dbManager) {
        const itens = await dbManager.getSyncQueue("pending");
        this.syncQueue = itens || [];

        // Remover itens antigos (mais de 30 dias)
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);
        const antigos = this.syncQueue.filter(
          (item) => new Date(item.created_at) < limite,
        );
        for (const item of antigos) {
          await dbManager.updateSyncStatus(item.id, "error", "Item expirado");
          const index = this.syncQueue.indexOf(item);
          if (index > -1) this.syncQueue.splice(index, 1);
        }

        console.log(`📋 ${this.syncQueue.length} itens pendentes na fila`);
      }
    } catch (error) {
      console.warn("⚠️ Erro ao carregar fila de sincronização:", error);
      this.syncQueue = [];
    }
  }

  // ============================================
  // LISTENERS DE REDE
  // ============================================

  setupNetworkListeners() {
    window.addEventListener("online", () => {
      console.log("🌐 Conexão restaurada");
      this.isOffline = false;
      this.sincronizar();
      this.notifyListeners("online", {});
    });

    window.addEventListener("offline", () => {
      console.log("📴 Conexão perdida");
      this.isOffline = true;
      this.notifyListeners("offline", {});
    });

    // Listeners para Background Sync
    if ("sync" in navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.sync.register("sync-all").catch((err) => {
          console.warn("⚠️ Erro ao registrar Background Sync:", err);
        });
      });
    }
  }

  // ============================================
  // ADICIONAR À FILA
  // ============================================

  /**
   * Adiciona item à fila de sincronização
   * @param {Object} data - Dados a sincronizar
   * @param {string} tipo - Tipo do item (ocorrencia, abordagem, etc.)
   * @param {number} prioridade - Prioridade (0=urgente, 1=normal, 2=baixa)
   * @returns {Promise<Object>}
   */
  async addToQueue(
    data,
    tipo = "ocorrencia",
    prioridade = SYNC_PRIORITY.NORMAL,
  ) {
    try {
      const item = {
        tipo: tipo,
        dados: data,
        prioridade: prioridade,
        status: SYNC_STATUS.PENDING,
        created_at: new Date().toISOString(),
        attempts: 0,
        tentativas: 0,
      };

      // Salvar no banco local
      if (dbManager) {
        const saved = await dbManager.addToSyncQueue(item);
        item.id = saved.id;
      }

      this.syncQueue.push(item);
      this.notifyListeners("queue_added", { item });

      // Se online, sincronizar imediatamente (se for urgente)
      if (navigator.onLine && prioridade === SYNC_PRIORITY.URGENTE) {
        setTimeout(() => this.sincronizar(), 500);
      }

      return item;
    } catch (error) {
      console.error("❌ Erro ao adicionar à fila:", error);
      throw error;
    }
  }

  // ============================================
  // SINCRONIZAÇÃO PRINCIPAL
  // ============================================

  /**
   * Executa sincronização de todos os itens pendentes
   * @param {Object} options - Opções de sincronização
   * @returns {Promise<Object>}
   */
  async sincronizar(options = {}) {
    if (this.isSyncing) {
      console.log("⏳ Sincronização já em andamento");
      return { success: false, message: "Sincronização em andamento" };
    }

    if (!navigator.onLine) {
      console.log("📴 Offline - Sincronização adiada");
      return { success: false, message: "Offline" };
    }

    // Verificar autenticação
    if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
      console.log("👤 Usuário não autenticado");
      return { success: false, message: "Não autenticado" };
    }

    this.isSyncing = true;
    this.progress = {
      total: this.syncQueue.length,
      processed: 0,
      successful: 0,
      failed: 0,
      current: null,
    };

    this.notifyListeners("sync_start", { total: this.progress.total });

    console.log(`🔄 Iniciando sincronização (${this.progress.total} itens)`);

    try {
      // Ordenar fila por prioridade e data
      const sorted = [...this.syncQueue].sort((a, b) => {
        if (a.prioridade !== b.prioridade) {
          return a.prioridade - b.prioridade;
        }
        return new Date(a.created_at) - new Date(b.created_at);
      });

      const results = [];
      const batchSize = options.batchSize || BATCH_SIZE;

      // Processar em lotes
      for (let i = 0; i < sorted.length; i += batchSize) {
        const batch = sorted.slice(i, i + batchSize);
        const batchResults = await this.processarBatch(batch);
        results.push(...batchResults);

        this.progress.processed += batch.length;
        this.notifyListeners("progress", this.progress);
      }

      // Atualizar fila
      this.syncQueue = this.syncQueue.filter(
        (item) => item.status === SYNC_STATUS.PENDING,
      );

      this.lastSync = new Date().toISOString();
      this.isSyncing = false;

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      console.log(
        `✅ Sincronização concluída: ${successCount} sucessos, ${failCount} falhas`,
      );

      this.notifyListeners("sync_complete", {
        total: results.length,
        successful: successCount,
        failed: failCount,
        results: results,
      });

      return {
        success: true,
        total: results.length,
        successful: successCount,
        failed: failCount,
        results,
      };
    } catch (error) {
      console.error("❌ Erro durante sincronização:", error);
      this.isSyncing = false;

      this.notifyListeners("sync_error", { error: error.message });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Processa um lote de itens
   * @param {Array} batch - Lote de itens
   * @returns {Promise<Array>}
   */
  async processarBatch(batch) {
    const results = [];
    const client = supabaseClient.getClient();

    if (!client) {
      return batch.map((item) => ({
        id: item.id,
        success: false,
        error: "Erro ao conectar",
      }));
    }

    for (const item of batch) {
      this.progress.current = item;
      this.notifyListeners("item_start", { item });

      try {
        const result = await this.sincronizarItem(item, client);
        results.push({
          id: item.id,
          success: result.success,
          data: result.data,
          error: result.error,
        });

        if (result.success) {
          this.progress.successful++;
          this.notifyListeners("item_success", { item, data: result.data });
        } else {
          this.progress.failed++;
          this.notifyListeners("item_error", { item, error: result.error });
        }
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error.message,
        });
        this.progress.failed++;
        this.notifyListeners("item_error", { item, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sincroniza um item específico
   * @param {Object} item - Item da fila
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarItem(item, client) {
    // Atualizar status para syncing
    await this.atualizarStatus(item.id, SYNC_STATUS.SYNCING);

    try {
      let result;
      const dados = item.dados;

      switch (item.tipo) {
        case "ocorrencia":
          result = await this.sincronizarOcorrencia(dados, client);
          break;
        case "abordagem_veiculo":
          result = await this.sincronizarAbordagemVeiculo(dados, client);
          break;
        case "abordagem_pessoa":
          result = await this.sincronizarAbordagemPessoa(dados, client);
          break;
        case "mural_aviso":
          result = await this.sincronizarMuralAviso(dados, client);
          break;
        case "comentario":
          result = await this.sincronizarComentario(dados, client);
          break;
        default:
          throw new Error(`Tipo de item não suportado: ${item.tipo}`);
      }

      if (result.success) {
        await this.atualizarStatus(
          item.id,
          SYNC_STATUS.SUCCESS,
          null,
          result.data,
        );
        return { success: true, data: result.data };
      } else {
        // Incrementar tentativas
        item.attempts = (item.attempts || 0) + 1;
        item.tentativas = (item.tentativas || 0) + 1;
        item.ultimo_erro = result.error;

        const status =
          item.attempts >= MAX_RETRIES
            ? SYNC_STATUS.ERROR
            : SYNC_STATUS.PENDING;
        await this.atualizarStatus(item.id, status, result.error);

        // Se ainda tem tentativas, agendar retry
        if (status === SYNC_STATUS.PENDING) {
          const delay = this.calcularBackoff(item.attempts);
          this.agendarRetry(item, delay);
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`❌ Erro ao sincronizar item ${item.id}:`, error);
      item.attempts = (item.attempts || 0) + 1;
      item.tentativas = (item.tentativas || 0) + 1;
      item.ultimo_erro = error.message;

      const status =
        item.attempts >= MAX_RETRIES ? SYNC_STATUS.ERROR : SYNC_STATUS.PENDING;
      await this.atualizarStatus(item.id, status, error.message);

      if (status === SYNC_STATUS.PENDING) {
        const delay = this.calcularBackoff(item.attempts);
        this.agendarRetry(item, delay);
      }

      return { success: false, error: error.message };
    }
  }

  // ============================================
  // SINCRONIZAÇÃO POR TIPO
  // ============================================

  /**
   * Sincroniza ocorrência
   * @param {Object} dados - Dados da ocorrência
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarOcorrencia(dados, client) {
    try {
      // Verificar se já existe no servidor
      const { data: existing, error: searchError } = await client
        .from("ocorrencias")
        .select("id, numero_ocorrencia, updated_at")
        .eq("id", dados.id)
        .maybeSingle();

      if (searchError) throw searchError;

      let result;
      if (existing) {
        // Verificar conflito (timestamp)
        if (existing.updated_at && dados.updated_at) {
          const serverTime = new Date(existing.updated_at);
          const localTime = new Date(dados.updated_at);

          if (serverTime > localTime) {
            // Conflito: servidor tem dados mais recentes
            await this.atualizarStatus(
              dados.id,
              SYNC_STATUS.CONFLICT,
              "Conflito de dados",
            );
            return {
              success: false,
              error: "Conflito de dados - servidor tem versão mais recente",
              conflict: true,
              serverData: existing,
            };
          }
        }

        // Atualizar
        const { data, error } = await client
          .from("ocorrencias")
          .update(dados)
          .eq("id", dados.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Inserir
        const { data, error } = await client
          .from("ocorrencias")
          .insert([dados])
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      // Salvar localmente com dados atualizados
      if (dbManager) {
        await dbManager.saveOcorrencia(result);
      }

      return { success: true, data: result };
    } catch (error) {
      console.error("Erro ao sincronizar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza abordagem de veículo
   * @param {Object} dados - Dados da abordagem
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarAbordagemVeiculo(dados, client) {
    try {
      const { data, error } = await client
        .from("abordagens_veiculos")
        .upsert([dados], { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao sincronizar abordagem veículo:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza abordagem de pessoa
   * @param {Object} dados - Dados da abordagem
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarAbordagemPessoa(dados, client) {
    try {
      const { data, error } = await client
        .from("abordagens_pessoas")
        .upsert([dados], { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao sincronizar abordagem pessoa:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza aviso do mural
   * @param {Object} dados - Dados do aviso
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarMuralAviso(dados, client) {
    try {
      const { data, error } = await client
        .from("mural_avisos")
        .upsert([dados], { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao sincronizar aviso do mural:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza comentário do mural
   * @param {Object} dados - Dados do comentário
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarComentario(dados, client) {
    try {
      const { data, error } = await client
        .from("mural_comentarios")
        .upsert([dados], { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao sincronizar comentário:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // BACKOFF EXPONENCIAL
  // ============================================

  /**
   * Calcula delay com backoff exponencial
   * @param {number} tentativas - Número de tentativas
   * @returns {number} - Delay em milissegundos
   */
  calcularBackoff(tentativas) {
    const delay = BASE_DELAY * Math.pow(2, tentativas - 1);
    return Math.min(delay, MAX_DELAY);
  }

  /**
   * Agenda retry de um item
   * @param {Object} item - Item da fila
   * @param {number} delay - Delay em milissegundos
   */
  agendarRetry(item, delay) {
    const timeoutId = setTimeout(() => {
      if (navigator.onLine) {
        console.log(`🔄 Retry do item ${item.id} após ${delay}ms`);
        this.sincronizar();
      } else {
        // Se offline, esperar reconectar
        this.offlineQueue.push(item);
      }
    }, delay);

    this.retryTimeouts.push(timeoutId);
  }

  // ============================================
  // ATUALIZAÇÃO DE STATUS
  // ============================================

  /**
   * Atualiza status de um item na fila
   * @param {number} id - ID do item
   * @param {string} status - Novo status
   * @param {string} error - Mensagem de erro
   * @param {Object} data - Dados adicionais
   * @returns {Promise<void>}
   */
  async atualizarStatus(id, status, error = null, data = null) {
    try {
      // Atualizar no banco
      if (dbManager) {
        await dbManager.updateSyncStatus(id, status, error);
      }

      // Atualizar na fila em memória
      const item = this.syncQueue.find((i) => i.id === id);
      if (item) {
        item.status = status;
        if (error) item.ultimo_erro = error;
        if (data) item.resultado = data;
      }

      this.notifyListeners("status_update", { id, status, error, data });
    } catch (e) {
      console.warn("⚠️ Erro ao atualizar status:", e);
    }
  }

  // ============================================
  // DOWNLOAD DE DADOS
  // ============================================

  /**
   * Baixa dados recentes do servidor
   * @param {Object} options - Opções de download
   * @returns {Promise<Object>}
   */
  async downloadDados(options = {}) {
    try {
      if (!navigator.onLine) {
        return { success: false, error: "Offline" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar" };
      }

      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const dataInicio =
        options.dataInicio ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const results = {
        ocorrencias: [],
        abordagens: { veiculos: [], pessoas: [] },
        atualizado_em: new Date().toISOString(),
      };

      // Baixar ocorrências do usuário
      const { data: ocorrencias, error: occError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("criado_por", user.id)
        .gte("criado_em", dataInicio)
        .order("criado_em", { ascending: false })
        .limit(options.limit || 100);

      if (!occError && ocorrencias) {
        results.ocorrencias = ocorrencias;
        // Salvar localmente
        for (const occ of ocorrencias) {
          if (dbManager) {
            await dbManager.saveOcorrencia(occ);
          }
        }
      }

      // Baixar abordagens de veículos
      const { data: veiculos, error: veicError } = await client
        .from("abordagens_veiculos")
        .select("*")
        .eq("criado_por", user.id)
        .gte("criado_em", dataInicio)
        .order("criado_em", { ascending: false })
        .limit(options.limit || 100);

      if (!veicError && veiculos) {
        results.abordagens.veiculos = veiculos;
        for (const v of veiculos) {
          if (dbManager) {
            await dbManager.save("abordagens_veiculos", v);
          }
        }
      }

      // Baixar abordagens de pessoas
      const { data: pessoas, error: pesError } = await client
        .from("abordagens_pessoas")
        .select("*")
        .eq("criado_por", user.id)
        .gte("criado_em", dataInicio)
        .order("criado_em", { ascending: false })
        .limit(options.limit || 100);

      if (!pesError && pessoas) {
        results.abordagens.pessoas = pessoas;
        for (const p of pessoas) {
          if (dbManager) {
            await dbManager.save("abordagens_pessoas", p);
          }
        }
      }

      console.log(
        `📥 Dados baixados: ${results.ocorrencias.length} ocorrências, ${results.abordagens.veiculos.length} veículos, ${results.abordagens.pessoas.length} pessoas`,
      );

      return { success: true, data: results };
    } catch (error) {
      console.error("❌ Erro ao baixar dados:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // STATUS E ESTATÍSTICAS
  // ============================================

  /**
   * Obtém status da sincronização
   * @returns {Object}
   */
  getStatus() {
    const pendentes = this.syncQueue.filter(
      (i) => i.status === SYNC_STATUS.PENDING,
    ).length;
    const emAndamento = this.syncQueue.filter(
      (i) => i.status === SYNC_STATUS.SYNCING,
    ).length;
    const comErro = this.syncQueue.filter(
      (i) => i.status === SYNC_STATUS.ERROR,
    ).length;
    const concluidos = this.syncQueue.filter(
      (i) => i.status === SYNC_STATUS.SUCCESS,
    ).length;

    return {
      isSyncing: this.isSyncing,
      isOffline: this.isOffline,
      lastSync: this.lastSync,
      total: this.syncQueue.length,
      pendentes,
      emAndamento,
      comErro,
      concluidos,
      progress: this.progress,
      online: navigator.onLine,
    };
  }

  /**
   * Obtém estatísticas de sincronização
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar" };
      }

      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      // Contar ocorrências
      const { count: ocorrencias, error: occError } = await client
        .from("ocorrencias")
        .select("*", { count: "exact", head: true })
        .eq("criado_por", user.id);

      // Contar abordagens
      const [veiculosCount, pessoasCount] = await Promise.all([
        client
          .from("abordagens_veiculos")
          .select("*", { count: "exact", head: true })
          .eq("criado_por", user.id),
        client
          .from("abordagens_pessoas")
          .select("*", { count: "exact", head: true })
          .eq("criado_por", user.id),
      ]);

      return {
        success: true,
        data: {
          total_ocorrencias: occError ? 0 : ocorrencias || 0,
          total_abordagens:
            (veiculosCount.error ? 0 : veiculosCount.count || 0) +
            (pessoasCount.error ? 0 : pessoasCount.count || 0),
          pendentes_sync: this.syncQueue.filter(
            (i) => i.status === SYNC_STATUS.PENDING,
          ).length,
          ultimo_sync: this.lastSync,
          online: navigator.onLine,
        },
      };
    } catch (error) {
      console.error("Erro ao obter stats:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // EVENTOS E LISTENERS
  // ============================================

  /**
   * Adiciona listener para eventos de sincronização
   * @param {Function} callback - Função callback
   */
  addListener(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  /**
   * Notifica listeners sobre eventos
   * @param {string} event - Nome do evento
   * @param {Object} data - Dados do evento
   */
  notifyListeners(event, data) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, data);
      } catch (e) {
        console.warn("⚠️ Erro no listener:", e);
      }
    });
  }

  // ============================================
  // LIMPEZA E DESTRUIÇÃO
  // ============================================

  /**
   * Limpa fila de sincronização
   * @param {string} status - Status dos itens a remover
   * @returns {Promise<number>}
   */
  async limparFila(status = null) {
    let removidos = 0;
    const itensParaRemover = this.syncQueue.filter(
      (item) => !status || item.status === status,
    );

    for (const item of itensParaRemover) {
      const index = this.syncQueue.indexOf(item);
      if (index > -1) {
        this.syncQueue.splice(index, 1);
        if (dbManager) {
          await dbManager.delete("syncQueue", item.id);
        }
        removidos++;
      }
    }

    console.log(`🧹 ${removidos} itens removidos da fila`);
    return removidos;
  }

  /**
   * Cancela todas as sincronizações em andamento
   */
  cancelar() {
    this.isSyncing = false;
    this.retryTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.retryTimeouts = [];
    console.log("⏹️ Sincronizações canceladas");
  }

  /**
   * Destroi o sync manager
   */
  destroy() {
    this.cancelar();
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.initialized = false;
    console.log("🗑️ Sync Manager destruído");
  }

  // ============================================
  // WEB WORKER (para processamento em background)
  // ============================================

  /**
   * Processa dados em Web Worker (se disponível)
   * @param {Array} dados - Dados para processar
   * @param {string} tipo - Tipo de processamento
   * @returns {Promise<any>}
   */
  async processarEmWorker(dados, tipo) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof Worker === "undefined") {
          // Fallback: processar no thread principal
          resolve(this.processarDados(dados, tipo));
          return;
        }

        // Criar worker inline
        const workerScript = `
          self.addEventListener('message', function(e) {
            const { dados, tipo } = e.data;
            let resultado;
            
            switch(tipo) {
              case 'compress':
                resultado = JSON.stringify(dados);
                break;
              case 'validate':
                resultado = dados.filter(d => d.id && d.tipo);
                break;
              default:
                resultado = dados;
            }
            
            self.postMessage({ success: true, resultado });
          });
        `;

        const blob = new Blob([workerScript], {
          type: "application/javascript",
        });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (e) => {
          if (e.data.success) {
            resolve(e.data.resultado);
          } else {
            reject(new Error("Erro no worker"));
          }
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        };

        worker.onerror = (error) => {
          reject(error);
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        };

        worker.postMessage({ dados, tipo });

        // Timeout de segurança
        setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
          reject(new Error("Timeout no worker"));
        }, 30000);
      } catch (error) {
        console.warn("⚠️ Erro ao usar Worker, usando fallback:", error);
        resolve(this.processarDados(dados, tipo));
      }
    });
  }

  /**
   * Processa dados (fallback para Worker)
   * @param {Array} dados - Dados para processar
   * @param {string} tipo - Tipo de processamento
   * @returns {any}
   */
  processarDados(dados, tipo) {
    switch (tipo) {
      case "compress":
        return JSON.stringify(dados);
      case "validate":
        return dados.filter((d) => d.id && d.tipo);
      default:
        return dados;
    }
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

const syncManager = new SyncManager();
window.syncManager = syncManager;

console.log("🔄 Sync Manager carregado");
