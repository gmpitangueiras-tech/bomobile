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
 * - Sincronização periódica enquanto o app está aberto e autenticado
 *
 * MELHORIAS APLICADAS:
 * - Fila IndexedDB cifrada e sincronização foreground com JWT validado
 * - Resolução de conflitos (timestamp-based)
 * - Retry com backoff exponencial (1s, 2s, 4s, 8s, 16s, 32s, 60s)
 * - Fila de prioridade (urgente > normal > baixa)
 * - Monitoramento de status (progresso, itens pendentes)
 * - Service Worker não acessa nem decripta a fila
 * - Cache de resultados de sincronização
 * - Eventos de progresso
 * - Web Workers para processamento em background
 *
 * Depende de: offlineVault (global), supabaseClient (global),
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
    this.networkListenersInstalled = false;
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

    // A fila é lida exclusivamente do cofre cifrado; não iniciar o antigo DB plaintext.
    if (window.offlineVault?.unlocked) await this.carregarFila();

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
      if (!window.offlineVault?.unlocked) { this.syncQueue = []; return; }
      const pendentes = await window.offlineVault.listQueue("pending");
      const interrompidos = await window.offlineVault.listQueue("syncing");
      for (const item of interrompidos) await window.offlineVault.updateQueue(item.id, "pending", null, item.attempts);
      this.syncQueue = [...pendentes, ...interrompidos];
      console.log(`📋 ${this.syncQueue.length} itens cifrados pendentes na fila`);
    } catch (error) {
      console.warn("⚠️ Erro ao carregar fila de sincronização:", error);
      this.syncQueue = [];
    }
  }

  // ============================================
  // LISTENERS DE REDE
  // ============================================

  setupNetworkListeners() {
    if (this.networkListenersInstalled) return;
    this.networkListenersInstalled = true;
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

    // O Service Worker não recebe a chave derivada da senha. A fila cifrada
    // sincroniza apenas enquanto a página autenticada e o cofre estão desbloqueados.
  }

  // ============================================
  // ADICIONAR À FILA
  // ============================================

  async saveOccurrenceOffline(bundle, options = {}) {
    const user = authManager.getUser();
    if (!user || !window.offlineVault?.unlocked || window.offlineVault.userId !== user.id) throw new Error("Desbloqueie o cofre para salvar a ocorrência offline.");
    const occurrence = { ...(bundle.ocorrencia || {}), id: (bundle.ocorrencia || {}).id || crypto.randomUUID(), criado_por: user.id };
    const now = globalThis.obterTimestampBrasilSemFuso ? globalThis.obterTimestampBrasilSemFuso() : new Date().toISOString();
    occurrence.criado_em = occurrence.criado_em || now;
    occurrence.atualizado_em = now;
    occurrence.status = options.draft ? "draft" : (occurrence.status || "synced");
    const envolvidos = (bundle.envolvidos || []).map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
    const anexos = (bundle.anexos || []).map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
    const payload = { ocorrencia: occurrence, envolvidos, anexos, guardasParticipantes: bundle.guardasParticipantes || [], assinaturas: bundle.assinaturas || [] };
    const localType = options.draft ? "draft" : "offline-occurrence";
    await window.offlineVault.putRecord(localType, occurrence.id, payload, { status: "pending", createdAt: occurrence.criado_em });
    await this.addToQueue(payload, "ocorrencia", SYNC_PRIORITY.URGENTE, { idempotencyKey: `ocorrencia:${occurrence.id}:${occurrence.atualizado_em}` });
    return { id: occurrence.id, payload };
  }

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
    options = {},
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

      if (!window.offlineVault?.unlocked) throw new Error("Desbloqueie o cofre local antes de enfileirar dados.");
      const saved = await window.offlineVault.enqueue(tipo, data, {
        priority: prioridade,
        idempotencyKey: options.idempotencyKey || `${tipo}:${data?.id || crypto.randomUUID()}`,
      });
      Object.assign(item, saved);
      this.syncQueue = this.syncQueue.filter((queued) => queued.id !== item.id);
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

    // A chave jamais é entregue ao Service Worker. Além do cofre, exigir JWT
    // validado pelo Supabase para sincronizar; login offline não envia dados.
    if (typeof authManager === "undefined" || !authManager.isLoggedIn() || !window.offlineVault?.unlocked || window.offlineVault.userId !== authManager.getUserId()) {
      return { success: false, message: "Cofre bloqueado; a fila cifrada foi mantida." };
    }
    const authClient = supabaseClient.getClient();
    const { data: authResult, error: authError } = await authClient.auth.getUser();
    if (authError || !authResult?.user?.id || authResult.user.id !== authManager.getUserId()) {
      return { success: false, message: "Reautentique online; a fila cifrada foi mantida." };
    }
    authManager.offlineOnly = false;

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
        (item) => item.status === SYNC_STATUS.PENDING || item.status === SYNC_STATUS.CONFLICT,
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
        item.ultimo_erro = "SYNC_ERROR";

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
      item.ultimo_erro = "SYNC_ERROR";

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
  async sincronizarOcorrencia(payload, client) {
    try {
      const dados = payload.ocorrencia || payload;
      const envolvidos = payload.envolvidos || [];
      const anexos = payload.anexos || [];
      const guardas = payload.guardasParticipantes || [];
      if (!dados?.id || !dados?.criado_por || dados.criado_por !== authManager.getUserId()) throw new Error("Payload sem vínculo válido com o usuário autenticado.");
      const { data: saved, error } = await client.from("ocorrencias").upsert([dados], { onConflict: "id" }).select().single();
      if (error) throw error;

      if (envolvidos.length) {
        const rows = envolvidos.map((env) => ({
          id: env.id || crypto.randomUUID(), ocorrencia_id: dados.id, tipo: env.tipo,
          nome_completo: env.nome_completo, data_nascimento: env.data_nascimento || null,
          rg: env.rg || null, cpf: env.cpf || null, telefone: env.telefone || null,
          nome_pai: env.nome_pai || null, nome_mae: env.nome_mae || null,
          endereco: env.endereco || null, bairro: env.bairro || null,
          cidade: env.cidade || null, observacoes: env.observacoes || null,
          criado_por: authManager.getUserId(), criado_em: env.criado_em || new Date().toISOString(),
        }));
        const { error: e } = await client.from("envolvidos").upsert(rows, { onConflict: "id" });
        if (e) throw e;
      }
      if (guardas.length) {
        const result = await ocorrenciaManager.salvarGuardas(dados.id, guardas);
        if (!result.success) throw new Error(result.error || "Falha ao sincronizar equipe.");
      }
      for (const anexo of anexos) {
        if (!anexo?.arquivo) {
          if (anexo?.url && !/^blob:|^data:/i.test(anexo.url)) continue;
          throw new Error("Há anexo local sem arquivo binário; o item permanece na fila.");
        }
        const fileId = anexo.id || crypto.randomUUID();
        const ext = String(anexo.arquivo.name || "anexo").split(".").pop().replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
        const path = `${authManager.getUserId()}/${dados.id}/${fileId}.${ext}`;
        const { error: uploadError } = await client.storage.from("anexos").upload(path, anexo.arquivo, { upsert: true, contentType: anexo.arquivo.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
        const { data: urlData } = client.storage.from("anexos").getPublicUrl(path);
        const { error: metaError } = await client.from("anexos").upsert([{
          id: fileId, ocorrencia_id: dados.id, nome_arquivo: anexo.nome || anexo.arquivo.name || "anexo",
          tipo_arquivo: anexo.tipo || "anexo", tamanho: anexo.arquivo.size || anexo.tamanho || 0,
          url: urlData.publicUrl, mime_type: anexo.arquivo.type || null,
          hash_arquivo: anexo.hash_pericial || anexo.hash || null, criado_por: authManager.getUserId(),
        }], { onConflict: "id" });
        if (metaError) throw metaError;
      }
      const localType = saved.status === "draft" ? "draft" : "offline-occurrence";
      await window.offlineVault.putRecord(localType, dados.id, { ocorrencia: saved, envolvidos, anexos, guardasParticipantes: guardas, assinaturas: payload.assinaturas || [] }, { status: "synced" });
      return { success: true, data: saved };
    } catch (error) {
      console.error("Erro ao sincronizar ocorrência offline:", error?.code || "SYNC_ERROR");
      return { success: false, error: error?.code || "SYNC_ERROR" };
    }
  }

  /**
   * Sincroniza abordagem de veículo
   * @param {Object} dados - Dados da abordagem
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarAbordagemVeiculo(payload, client) {
    return this.sincronizarAbordagem(payload, client, "abordagens_veiculos");
  }

  async sincronizarAbordagem(payload, client, tabela) {
    try {
      const registro = { ...(payload.registro || payload) };
      const anexos = payload.anexos || [];
      const anexosRemotos = [];
      delete registro.status;
      delete registro.tipo_abordagem;
      for (const anexo of anexos) {
        if (!anexo?.arquivo) {
          if (anexo?.url && !/^blob:|^data:/i.test(anexo.url)) { anexosRemotos.push(anexo); continue; }
          throw new Error("Anexo offline sem arquivo; item preservado na fila cifrada.");
        }
        const fileId = anexo.id || crypto.randomUUID();
        const ext = String(anexo.arquivo.name || anexo.nome || "foto.jpg").split(".").pop().replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
        const storagePath = `${authManager.getUserId()}/${tabela}/${registro.id}/${fileId}.${ext}`;
        const { error: uploadError } = await client.storage.from("anexos").upload(storagePath, anexo.arquivo, { upsert: true, contentType: anexo.arquivo.type || "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: urlData } = client.storage.from("anexos").getPublicUrl(storagePath);
        anexosRemotos.push({ url: urlData.publicUrl, nome: anexo.nome || "Foto", tipo: anexo.tipo || "image", tamanho: anexo.arquivo.size || anexo.tamanho || 0, hash: anexo.hash || null });
      }
      registro.anexos = anexosRemotos;
      const { data, error } = await client.from(tabela).upsert([registro], { onConflict: "id" }).select().single();
      if (error) throw error;
      await window.offlineVault.putRecord("approach", registro.id, { registro: data, anexos }, { status: "synced", createdAt: registro.criado_em });
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao sincronizar abordagem:", error?.code || "SYNC_ERROR");
      return { success: false, error: error?.code || "SYNC_ERROR" };
    }
  }

  /**
   * Sincroniza abordagem de pessoa
   * @param {Object} dados - Dados da abordagem
   * @param {Object} client - Cliente Supabase
   * @returns {Promise<Object>}
   */
  async sincronizarAbordagemPessoa(payload, client) {
    return this.sincronizarAbordagem(payload, client, "abordagens_pessoas");
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
      // Persistir apenas metadados de estado; payload permanece cifrado.
      if (window.offlineVault?.unlocked) {
        const current = this.syncQueue.find((item) => item.id === id);
        await window.offlineVault.updateQueue(id, status, error ? "SYNC_ERROR" : null, current?.attempts ?? null);
      }

      // Atualizar na fila em memória
      const item = this.syncQueue.find((i) => i.id === id);
      if (item) {
        item.status = status;
        if (error) item.ultimo_erro = "SYNC_ERROR";
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
        globalThis.obterTimestampBrasilSemFuso(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      const results = {
        ocorrencias: [],
        abordagens: { veiculos: [], pessoas: [] },
        atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
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
          if (window.offlineVault?.unlocked) await window.offlineVault.putRecord("downloaded-occurrence", occ.id, occ, { status: "saved" });
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
          if (window.offlineVault?.unlocked) await window.offlineVault.putRecord("downloaded-vehicle-approach", v.id, v, { status: "saved" });
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
          if (window.offlineVault?.unlocked) await window.offlineVault.putRecord("downloaded-person-approach", p.id, p, { status: "saved" });
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
        if (window.offlineVault?.unlocked) await window.offlineVault.removeQueue(item.id);
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
  lock() {
    this.syncQueue = [];
    this.offlineQueue = [];
    this.pendingItems.clear();
    this.isSyncing = false;
    this.initialized = false;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    this.retryTimeouts.forEach(clearTimeout);
    this.retryTimeouts = [];
  }

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
