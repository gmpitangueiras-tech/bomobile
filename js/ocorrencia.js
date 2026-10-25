/**
 * GERENCIADOR DE OCORRÊNCIAS
 * Guarda Municipal de Pitangueiras - PR
 *
 * Regras de Negócio:
 * - Guarda: pode criar, editar (apenas seus rascunhos), finalizar (apenas seus rascunhos)
 * - Guarda: pode solicitar retificação (apenas de suas ocorrências finalizadas)
 * - Supervisor: pode editar qualquer rascunho, finalizar qualquer rascunho, cancelar, aprovar/rejeitar retificações
 * - Após finalizada, nenhum usuário pode editar diretamente a ocorrência
 * - Retificação: apenas campos retificáveis podem ser alterados. Campos imutáveis (data/hora, número, etc) são preservados.
 * - Baseado em sistemas policiais oficiais (BO, BAT, DIAO, SRO)
 * - Ao solicitar retificação, NÃO copia o número da ocorrência original para evitar duplicidade
 * - Um novo número é gerado apenas quando a retificação é aprovada pelo supervisor
 * - Na listagem, apenas ocorrências ativas (esta_ativa = true) são exibidas
 * - Ao aprovar retificação, mantém o mesmo número da ocorrência original
 * - Suporte a geolocalização (latitude/longitude)
 * - Suporte a campos: tipo_ocorrencia, sub_tipo_ocorrencia, gravidade, numero_bo, orgao_bo, data_bo
 * - Logs: todas as ações importantes são registradas na tabela logs_acesso
 * - Dados do criador (nome, cpf) são carregados após a listagem (busca separada otimizada com cache)
 * - 🔥 NOVO: Assinaturas são armazenadas separadamente e NÃO aparecem na galeria de anexos
 * - 🔥 NOVO: Assinaturas são vinculadas a envolvidos via envolvido_id
 *
 * MELHORIAS APLICADAS:
 * - Correção de anexos (verificação de URLs e persistência)
 * - Logs periciais automáticos em ações críticas
 * - Hash SHA-256 em imagens para integridade
 * - Auditoria de visualização (registra quem visualizou cada ocorrência)
 * - Compressão otimizada de imagens
 * - Modo Rápido (modo_criacao) e Completar BO Rápido
 * - Método completarRapido() para finalizar BOs Rápidos
 * - Busca e listagem com modo_criacao
 * - 🔥 ALTERADO: Removido MAX_ANEXOS - agora ilimitado
 * - 🔥 NOVO: data_hora_finalizacao para registrar quando foi finalizada no sistema
 * - 🔥 NOVO: Validação de anexos sem limite de quantidade
 * - 🔥 NOVO: Logs de finalização com data_hora_finalizacao
 * - 🔥 NOVO: Método para atualizar data_hora_finalizacao
 * - 🔥 NOVO: Assinaturas separadas de anexos (campo assinaturas JSONB)
 * - 🔥 NOVO: Assinaturas vinculadas a envolvidos via envolvido_id
 * - 🔥 NOVO: Métodos para salvar, listar e remover assinaturas com envolvido_id
 * - 🔥 NOVO: Assinaturas NÃO aparecem na galeria de anexos
 * - 🔥 CORRIGIDO: Removido campo assinaturas_objeto do envio para o banco
 * - 🔥 CORRIGIDO: Método listarAssinaturas retorna dados completos com envolvido_id
 */

/**
 * Retorna os componentes locais para colunas timestamp sem fuso.
 * Não usa getTimezoneOffset nem acrescenta o sufixo Z.
 */
function formatarTimestampLocalSemFuso(value = new Date(), includeSeconds = true) {
  return globalThis.obterTimestampBrasilSemFuso(value, includeSeconds);
}

class OcorrenciaManager {
  constructor() {
    this.initialized = false;
    this.cacheUsuarios = {};
    this.cacheAnexos = {};
  }

  /**
   * CAMPOS QUE PODEM SER RETIFICADOS
   * Baseado em sistemas policiais oficiais
   * Permite: correção cadastral, correção de endereço, complementação de informações
   */
  get CAMPOS_RETIFICAVEIS() {
    return [
      // Dados do Solicitante (correção cadastral)
      "nome_solicitante",
      "cpf_solicitante",
      "rg_solicitante",
      "telefone_solicitante",
      "endereco_solicitante",
      "bairro_solicitante",
      "complemento",
      "identificacao_adicional",
      "codigo_municipal",

      // Dados do Local (correção de endereço)
      "local_ocorrencia",
      "rodovia",
      "bairro_ocorrencia",
      "referencia",

      // Descrição (complementação de informações)
      "observacoes",

      // Dados Operacionais (correção de digitação)
      "codigo_operacional",

      // Natureza da Ocorrência (correção de classificação)
      "tipo_ocorrencia",
      "sub_tipo_ocorrencia",
      "gravidade",

      // Dados do BO (correção de dados)
      "numero_bo",
      "orgao_bo",
      "data_bo",
    ];
  }

  /**
   * CAMPOS QUE NUNCA PODEM SER ALTERADOS
   * Data/Hora do fato é HISTÓRICO e IMUTÁVEL
   * Número da ocorrência é identificador único
   */
  get CAMPOS_IMUTAVEIS() {
    return [
      "numero_ocorrencia",
      "numero_temporario",
      "criado_por",
      "criado_em",
      "data_hora_inicio",
      "data_hora_encerramento",
      "status",
      "numero_versao",
      "ocorrencia_original_id",
      "forma_solicitacao",
      "criado_em",
      "modo_criacao",
      "completado_em",
      "completado_por",
      // 🔥 NOVO: data_hora_finalizacao também é imutável após definida
      "data_hora_finalizacao",
      // 🔥 NOVO: Assinaturas são imutáveis após definidas (não podem ser retificadas)
      "assinaturas",
    ];
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("✅ Ocorrência Manager inicializado");
  }

  // ============================================
  // FUNÇÃO AUXILIAR - BUSCAR DADOS DOS USUÁRIOS (CACHE)
  // ============================================

  async buscarDadosUsuario(usuarioId) {
    if (!usuarioId) return { nome_completo: null, cpf: null };

    if (this.cacheUsuarios[usuarioId]) {
      return this.cacheUsuarios[usuarioId];
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return { nome_completo: null, cpf: null };

      const { data, error } = await client
        .from("usuarios")
        .select("nome_completo")
        .eq("id", usuarioId)
        .single();

      if (error) {
        console.warn("Erro ao buscar dados do usuário:", error);
        return { nome_completo: null, cpf: null };
      }

      if (data) {
        this.cacheUsuarios[usuarioId] = { nome_completo: data.nome_completo, cpf: null };
      }

      return data ? { nome_completo: data.nome_completo, cpf: null } : { nome_completo: null, cpf: null };
    } catch (error) {
      console.warn("Erro ao buscar dados do usuário:", error);
      return { nome_completo: null, cpf: null };
    }
  }

  async buscarDadosUsuariosEmLote(usuarioIds) {
    const ids = [...new Set(usuarioIds.filter((id) => id))];
    if (ids.length === 0) return {};

    const idsParaBuscar = ids.filter((id) => !this.cacheUsuarios[id]);
    if (idsParaBuscar.length === 0) {
      const resultado = {};
      ids.forEach((id) => {
        resultado[id] = this.cacheUsuarios[id] || {
          nome_completo: null,
          cpf: null,
        };
      });
      return resultado;
    }

    try {
      const client = supabaseClient.getClient();
      if (!client) return {};

      const { data, error } = await client
        .from("usuarios")
        .select("id, nome_completo")
        .in("id", idsParaBuscar);

      if (error) {
        console.warn("Erro ao buscar usuários em lote:", error);
        return {};
      }

      const resultado = {};
      data.forEach((usuario) => {
        this.cacheUsuarios[usuario.id] = {
          nome_completo: usuario.nome_completo,
          cpf: null,
        };
        resultado[usuario.id] = this.cacheUsuarios[usuario.id];
      });

      idsParaBuscar.forEach((id) => {
        if (!resultado[id]) {
          resultado[id] = { nome_completo: null, cpf: null };
          this.cacheUsuarios[id] = { nome_completo: null, cpf: null };
        }
      });

      return resultado;
    } catch (error) {
      console.warn("Erro ao buscar usuários em lote:", error);
      return {};
    }
  }

  // ============================================
  // REGISTRO DE LOGS PERICIAIS
  // ============================================

  async registrarLogPericial(
    acao,
    tabela,
    registroId,
    dadosAnt = null,
    dadosNov = null,
  ) {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      // Obter IP
      let ip = null;
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        ip = data.ip;
      } catch (e) {}

      // Obter localização
      let latitude = null;
      let longitude = null;
      try {
        if (navigator.geolocation) {
          const position = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 10000 },
            );
          });
          if (position) {
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
          }
        }
      } catch (e) {}

      const logData = {
        usuario_id: user.id,
        acao: acao,
        tabela_afetada: tabela,
        registro_id: registroId?.toString(),
        dados_anteriores: dadosAnt,
        dados_novos: dadosNov,
        ip_address: ip,
        user_agent: navigator.userAgent,
        latitude: latitude?.toString(),
        longitude: longitude?.toString(),
        criado_em: globalThis.obterTimestampBrasilSemFuso(),
      };

      await client.from("logs_periciais").insert([logData]);
    } catch (error) {
      console.warn("Erro ao registrar log pericial:", error);
    }
  }

  // ============================================
  // REGISTRO DE AUDITORIA DE VISUALIZAÇÃO - CORRIGIDO
  // ============================================

  async registrarVisualizacao(ocorrenciaId) {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      // Verificar se a tabela existe
      try {
        const { error: tableCheck } = await client
          .from("visualizacoes_ocorrencias")
          .select("id", { count: "exact", head: true })
          .limit(1);

        if (tableCheck && tableCheck.code === "42P01") {
          console.debug("ℹ️ Tabela visualizacoes_ocorrencias não encontrada");
          return;
        }
      } catch (e) {
        console.debug(
          "ℹ️ Erro ao verificar tabela visualizacoes_ocorrencias:",
          e.message,
        );
        return;
      }

      // Buscar registro existente
      const { data: existing, error: checkError } = await client
        .from("visualizacoes_ocorrencias")
        .select("id, visualizado_em, visualizacoes")
        .eq("ocorrencia_id", ocorrenciaId)
        .eq("usuario_id", user.id)
        .maybeSingle();

      if (checkError) {
        console.warn("Erro ao verificar visualização:", checkError);
        return;
      }

      // CORREÇÃO: Usar upsert em vez de client.raw
      if (existing) {
        // Atualizar registro existente - incrementar contador
        const novoContador = (existing.visualizacoes || 0) + 1;
        const { error: updateError } = await client
          .from("visualizacoes_ocorrencias")
          .update({
            visualizado_em: globalThis.obterTimestampBrasilSemFuso(),
            visualizacoes: novoContador,
          })
          .eq("id", existing.id);

        if (updateError) {
          console.warn("Erro ao atualizar visualização:", updateError);
        }
      } else {
        // Inserir novo registro
        const { error: insertError } = await client
          .from("visualizacoes_ocorrencias")
          .insert({
            ocorrencia_id: ocorrenciaId,
            usuario_id: user.id,
            visualizado_em: globalThis.obterTimestampBrasilSemFuso(),
            visualizacoes: 1,
          });

        if (insertError) {
          console.warn("Erro ao inserir visualização:", insertError);
        }
      }
    } catch (error) {
      console.debug("⚠️ Erro ao registrar visualização:", error.message);
    }
  }

  // ============================================
  // GERAR HASH DE ANEXO
  // ============================================

  async gerarHashAnexo(arquivo) {
    try {
      const buffer = await arquivo.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      console.warn("Erro ao gerar hash do anexo:", error);
      return null;
    }
  }

  // ============================================
  // COMPRESSÃO DE IMAGEM OTIMIZADA
  // ============================================

  async comprimirImagemOtimizada(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve(file);
        return;
      }

      // Se o arquivo já é pequeno, não comprime
      if (file.size < 1024 * 1024 && file.type === "image/jpeg") {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality,
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // ============================================
  // CRUD OCORRÊNCIAS
  // ============================================

  /**
   * Cria uma nova ocorrência
   * @param {Object} dados - Dados da ocorrência
   * @param {string} dados.modo_criacao - 'rapido' ou 'completo'
   * @returns {Promise<Object>}
   */
  async criar(dados) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const numeroTemporario = !navigator.onLine ? `LOCAL-${Date.now()}` : null;

      let dataHoraInicio = dados.data_hora_inicio;
      if (
        !dataHoraInicio ||
        dataHoraInicio === "" ||
        dataHoraInicio === "null"
      ) {
        dataHoraInicio = formatarTimestampLocalSemFuso(new Date(), true);
      }

      // 🔥 GARANTIR QUE ASSINATURAS SEJA UM ARRAY COM INVOLVIDO_ID
      let assinaturas = dados.assinaturas || [];
      // Garantir que cada assinatura tenha envolvido_id se disponível
      assinaturas = assinaturas.map((ass) => {
        // Se não tiver envolvido_id, tentar buscar pelo tipo (fallback)
        if (!ass.envolvido_id && ass.tipo) {
          // Fallback: manter como está, mas logar aviso
          console.warn("Assinatura sem envolvido_id:", ass);
        }
        return ass;
      });

      const ocorrencia = {
        ...dados,
        numero_temporario: numeroTemporario,
        status: dados.status || "draft",
        criado_por: user.id,
        criado_em: formatarTimestampLocalSemFuso(new Date(), true),
        data_hora_inicio: dataHoraInicio,
        numero_versao: 1,
        esta_ativa: true,
        latitude: dados.latitude || null,
        longitude: dados.longitude || null,
        tipo_ocorrencia: dados.tipo_ocorrencia || null,
        sub_tipo_ocorrencia: dados.sub_tipo_ocorrencia || null,
        gravidade: dados.gravidade || null,
        numero_bo: dados.numero_bo || null,
        orgao_bo: dados.orgao_bo || null,
        data_bo: dados.data_bo || null,
        cpf_solicitante: dados.cpf_solicitante || null,
        rg_solicitante: dados.rg_solicitante || null,
        ocorrencia_original_id: null,
        justificativa_retificacao: null,
        retificado_em: null,
        retificado_por: null,
        solicitacao_retificacao_justificativa: null,
        solicitada_em: null,
        solicitada_por: null,
        aprovada_em: null,
        aprovada_por: null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        campos_alterados: null,
        versao_original: null,
        // 🔥 NOVO: data_hora_finalizacao inicia como null
        data_hora_finalizacao: null,
        // Modo Rápido
        modo_criacao: dados.modo_criacao || "completo",
        completado_em: null,
        completado_por: null,
        // 🔥 NOVO: Assinaturas - array com envolvido_id
        assinaturas: assinaturas,
      };

      // 🔥 CORRIGIDO: Remover campos que não existem no banco
      delete ocorrencia.assinaturas_objeto;
      delete ocorrencia.envolvidos;
      delete ocorrencia.guardasParticipantes;
      delete ocorrencia.anexos;
      delete ocorrencia.envolvidosMap;

      const { data, error } = await client
        .from("ocorrencias")
        .insert([ocorrencia])
        .select()
        .single();

      if (error) throw error;

      console.log(
        "✅ Ocorrência criada:",
        data.id,
        "| Modo:",
        data.modo_criacao,
        "| Assinaturas:",
        data.assinaturas?.length || 0,
      );

      await authManager.logCriarOcorrencia(user.id, data.id);

      // Registrar log pericial
      await this.registrarLogPericial(
        "CRIAR_OCORRENCIA",
        "ocorrencias",
        data.id,
        null,
        {
          modo_criacao: data.modo_criacao,
          total_assinaturas: data.assinaturas?.length || 0,
        },
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao criar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lista ocorrências com filtros
   * @param {Object} filtros - Filtros para listagem
   * @returns {Promise<Object>}
   */
  async listar(filtros = {}) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!navigator.onLine && window.offlineVault?.unlocked && window.offlineVault.userId === user.id) {
        const localRecords = [
          ...(await window.offlineVault.listRecords("offline-occurrence")),
          ...(await window.offlineVault.listRecords("downloaded-occurrence")),
          ...(await window.offlineVault.listRecords("draft")),
        ];
        const byId = new Map();
        for (const local of localRecords) {
          const row = local.data?.ocorrencia || local.data;
          if (!row?.id || row.criado_por !== user.id) continue;
          byId.set(row.id, { ...row, status: local.status === "synced" ? row.status : (row.status === "draft" ? "draft" : "pending_sync"), criador: { nome_completo: user.nome_completo, cpf: null } });
        }
        for (const item of await window.offlineVault.listQueue("pending")) {
          if (item.tipo !== "ocorrencia") continue;
          const row = item.dados?.ocorrencia || item.dados;
          if (row?.id) byId.set(row.id, { ...row, status: row.status === "draft" ? "draft" : "pending_sync", criador: { nome_completo: user.nome_completo, cpf: null } });
        }
        let local = [...byId.values()].filter((row) => row.esta_ativa !== false);
        if (filtros.status) local = local.filter((row) => row.status === filtros.status);
        if (filtros.tipo_ocorrencia) local = local.filter((row) => row.tipo_ocorrencia === filtros.tipo_ocorrencia);
        if (filtros.gravidade) local = local.filter((row) => row.gravidade === filtros.gravidade);
        if (filtros.data_inicio) local = local.filter((row) => String(row.criado_em || "").slice(0, 10) >= filtros.data_inicio);
        if (filtros.data_fim) local = local.filter((row) => String(row.criado_em || "").slice(0, 10) <= filtros.data_fim);
        if (filtros.search) { const term = String(filtros.search).toLocaleLowerCase("pt-BR"); local = local.filter((row) => `${row.numero_ocorrencia || ""} ${row.local_ocorrencia || ""}`.toLocaleLowerCase("pt-BR").includes(term)); }
        if (filtros.modo_criacao) local = local.filter((row) => row.modo_criacao === filtros.modo_criacao);
        local.sort((a, b) => String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
        if (filtros.limit) local = local.slice(0, filtros.limit);
        return { success: true, data: local };
      }

      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar ao servidor" };

      let query = client.from("ocorrencias").select("*").eq("esta_ativa", true);

      if (filtros.status) {
        query = query.eq("status", filtros.status);
      }
      if (filtros.tipo_ocorrencia) {
        query = query.eq("tipo_ocorrencia", filtros.tipo_ocorrencia);
      }
      if (filtros.gravidade) {
        query = query.eq("gravidade", filtros.gravidade);
      }
      if (filtros.data_inicio) {
        query = query.gte("criado_em", filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte("criado_em", filtros.data_fim + "T23:59:59");
      }
      if (filtros.search) {
        query = query.or(
          `numero_ocorrencia.ilike.%${filtros.search}%,local_ocorrencia.ilike.%${filtros.search}%`,
        );
      }
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }
      if (filtros.modo_criacao) {
        query = query.eq("modo_criacao", filtros.modo_criacao);
      }

      query = query.order("criado_em", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      const ocorrencias = data || [];
      if (window.offlineVault?.unlocked && window.offlineVault.userId === user.id) {
        for (const row of ocorrencias) {
          if (row.criado_por === user.id) await window.offlineVault.putRecord("downloaded-occurrence", row.id, { ocorrencia: row }, { status: "synced", createdAt: row.criado_em });
        }
      }
      if (ocorrencias.length > 0) {
        const idsCriadores = ocorrencias
          .map((o) => o.criado_por)
          .filter((id) => id);
        const dadosUsuarios =
          await this.buscarDadosUsuariosEmLote(idsCriadores);

        ocorrencias.forEach((ocorrencia) => {
          ocorrencia.criador = dadosUsuarios[ocorrencia.criado_por] || {
            nome_completo: null,
            cpf: null,
          };
        });
      }

      return { success: true, data: ocorrencias };
    } catch (error) {
      console.error("❌ Erro ao listar ocorrências:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca uma ocorrência pelo ID
   * @param {string} id - ID da ocorrência
   * @returns {Promise<Object>}
   */
  async buscar(id) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      if (data && data.criado_por) {
        const dadosCriador = await this.buscarDadosUsuario(data.criado_por);
        data.criador = dadosCriador;
      }

      // Registrar visualização (auditoria) - COM FALLBACK SEGURO
      if (data) {
        try {
          await this.registrarVisualizacao(id);
        } catch (error) {
          console.debug("⚠️ Erro ao registrar visualização:", error.message);
        }
      }

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao buscar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔥 NOVO: Completa um BO Rápido
   * @param {string} id - ID da ocorrência
   * @param {Object} dados - Dados adicionais para completar
   * @returns {Promise<Object>}
   */
  async completarRapido(id, dados) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar ocorrência
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      // Verificar se é um BO Rápido
      if (ocorrencia.modo_criacao !== "rapido") {
        return {
          success: false,
          error: "Esta ocorrência não está no modo Rápido",
        };
      }

      // Verificar se já foi completado
      if (ocorrencia.completado_em) {
        return {
          success: false,
          error: "Esta ocorrência já foi completada",
        };
      }

      // Verificar se está cancelada
      if (ocorrencia.status === "cancelled") {
        return {
          success: false,
          error: "Ocorrência cancelada não pode ser completada",
        };
      }

      // Preparar dados para atualização
      const dadosAtualizados = {
        ...dados,
        modo_criacao: "completo",
        completado_em: formatarTimestampLocalSemFuso(new Date(), true),
        completado_por: user.id,
        status: navigator.onLine ? "synced" : "pending_sync",
        atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
        atualizado_por: user.id,
      };

      // Se não tiver forma_solicitacao, definir padrão
      if (!dadosAtualizados.forma_solicitacao) {
        dadosAtualizados.forma_solicitacao = "Diretamente com a ocorrência";
      }

      // Atualizar ocorrência
      const { data, error } = await client
        .from("ocorrencias")
        .update(dadosAtualizados)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ BO Rápido completado:", id);

      // Registrar log
      await authManager.logFinalizarOcorrencia(user.id, id);

      // Registrar log pericial
      await this.registrarLogPericial(
        "COMPLETAR_RAPIDO",
        "ocorrencias",
        id,
        { modo_criacao: "rapido" },
        { modo_criacao: "completo", completado_por: user.id },
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao completar BO Rápido:", error);
      return { success: false, error: error.message };
    }
  }

  async atualizar(id, dados) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      const podeEditar = authManager.podeEditar(ocorrencia);
      if (!podeEditar) {
        return {
          success: false,
          error: "Permissão negada para editar esta ocorrência",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Salvar dados anteriores para log pericial
      const dadosAnteriores = { ...ocorrencia };

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          ...dados,
          atualizado_por: user.id,
          atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Ocorrência atualizada:", id);

      // Registrar log pericial
      await this.registrarLogPericial(
        "ATUALIZAR_OCORRENCIA",
        "ocorrencias",
        id,
        dadosAnteriores,
        data,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao atualizar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔥 ALTERADO: Finalizar ocorrência com data_hora_finalizacao
   */
  async finalizar(id) {
    try {
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      const podeFinalizar = authManager.podeFinalizar(ocorrencia);
      if (!podeFinalizar) {
        return {
          success: false,
          error: "Permissão negada para finalizar esta ocorrência",
        };
      }

      if (ocorrencia.status !== "draft") {
        return {
          success: false,
          error: "Apenas rascunhos podem ser finalizados",
        };
      }

      let numeroOficial = null;
      if (navigator.onLine) {
        const client = supabaseClient.getClient();
        if (client) {
          const ano = new Date().getFullYear();
          const { count } = await client
            .from("ocorrencias")
            .select("*", { count: "exact", head: true })
            .gte("criado_em", `${ano}-01-01`);

          numeroOficial = `${ano}-${String((count || 0) + 1).padStart(6, "0")}`;
        }
      }

      const status = navigator.onLine ? "synced" : "pending_sync";

      const dataEncerramento = globalThis.obterTimestampBrasilSemFuso();
      const dataFinalizacao = globalThis.obterTimestampBrasilSemFuso();

      // Gerar Hash Pericial (SHA-256)
      const conteudoParaHash = `${ocorrencia.tipo_ocorrencia}|${ocorrencia.local_ocorrencia}|${ocorrencia.observacoes}|${dataEncerramento}|${ocorrencia.criado_por}`;
      const msgUint8 = new TextEncoder().encode(conteudoParaHash);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const dadosAnteriores = { ...ocorrencia };

      // 🔥 ALTERADO: Incluir data_hora_finalizacao
      const result = await this.atualizar(id, {
        status: status,
        numero_ocorrencia: numeroOficial,
        data_hora_encerramento: dataEncerramento,
        data_hora_finalizacao: dataFinalizacao,
        esta_ativa: true,
        hash_pericial: hashHex,
      });

      if (result.success) {
        await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);

        // Registrar log pericial
        await this.registrarLogPericial(
          "FINALIZAR_OCORRENCIA",
          "ocorrencias",
          id,
          dadosAnteriores,
          result.data,
        );

        if (
          window.app &&
          typeof window.app.registrarLogPericial === "function"
        ) {
          await window.app.registrarLogPericial(
            "FINALIZACAO_OCORRENCIA",
            "ocorrencias",
            id,
            null,
            {
              numero: numeroOficial,
              hash: hashHex,
              data_hora_finalizacao: dataFinalizacao,
            },
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erro ao finalizar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async cancelar(id, motivo) {
    try {
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error:
            "Permissão negada. Apenas supervisores podem cancelar ocorrências.",
        };
      }

      if (ocorrencia.status === "cancelled") {
        return { success: false, error: "Esta ocorrência já está cancelada" };
      }

      if (!motivo || motivo.trim().length === 0) {
        return {
          success: false,
          error: "Motivo do cancelamento é obrigatório",
        };
      }

      const user = authManager.getUser();

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const dadosAnteriores = { ...ocorrencia };

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: "cancelled",
          cancelado_por: user.id,
          cancelado_em: formatarTimestampLocalSemFuso(new Date(), true),
          motivo_cancelamento: motivo,
          atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
          esta_ativa: false,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Ocorrência cancelada:", id);

      await authManager.logCancelarOcorrencia(user.id, id, motivo);

      // Registrar log pericial
      await this.registrarLogPericial(
        "CANCELAR_OCORRENCIA",
        "ocorrencias",
        id,
        dadosAnteriores,
        data,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao cancelar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // RETIFICAÇÃO - CONFORME SISTEMAS OFICIAIS
  // ============================================

  /**
   * Solicita retificação de uma ocorrência finalizada
   * Apenas campos retificáveis podem ser alterados
   * Data/Hora do fato são IMUTÁVEIS (histórico)
   * NÃO COPIA o número da ocorrência original para evitar duplicidade
   */
  async solicitarRetificacao(id, dados, justificativa) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const { data: original, error: buscaError } = await this.buscar(id);
      if (buscaError || !original) {
        return { success: false, error: "Ocorrência original não encontrada" };
      }

      const podeSolicitar = authManager.podeSolicitarRetificacao(original);
      if (!podeSolicitar) {
        return {
          success: false,
          error: "Permissão negada para solicitar retificação",
        };
      }

      if (!justificativa || justificativa.trim().length < 10) {
        return {
          success: false,
          error: "Justificativa deve ter pelo menos 10 caracteres",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: pendente, error: pendenteError } = await client
        .from("ocorrencias")
        .select("id")
        .eq("ocorrencia_original_id", id)
        .eq("status", "pending_rectification")
        .maybeSingle();

      if (pendenteError) throw pendenteError;

      if (pendente) {
        return {
          success: false,
          error:
            "Já existe um pedido de retificação pendente para esta ocorrência",
        };
      }

      const dadosFiltrados = {};
      const camposAlterados = [];

      for (const campo of this.CAMPOS_RETIFICAVEIS) {
        if (dados[campo] !== undefined && dados[campo] !== null) {
          const valorOriginal = original[campo] || "";
          const valorNovo = dados[campo] || "";

          if (String(valorOriginal).trim() !== String(valorNovo).trim()) {
            dadosFiltrados[campo] = dados[campo];
            camposAlterados.push({
              campo: campo,
              antes: valorOriginal,
              depois: valorNovo,
              label: this.getCampoLabel(campo),
            });
          }
        }
      }

      if (Object.keys(dadosFiltrados).length === 0) {
        return {
          success: false,
          error: "Nenhum campo foi alterado para retificação",
        };
      }

      dadosFiltrados.data_hora_inicio = original.data_hora_inicio;
      dadosFiltrados.data_hora_encerramento = original.data_hora_encerramento;
      dadosFiltrados.forma_solicitacao = original.forma_solicitacao;

      const isSupervisor = authManager.isSupervisor();
      const statusFinal = isSupervisor ? "rectified" : "pending_rectification";

      const dadosRetificados = {
        ...original,
        ...dadosFiltrados,
        id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
        ocorrencia_original_id: id,
        justificativa_retificacao: isSupervisor ? justificativa : null,
        retificado_em: isSupervisor
          ? formatarTimestampLocalSemFuso(new Date(), true)
          : null,
        retificado_por: isSupervisor ? user.id : null,
        solicitacao_retificacao_justificativa: isSupervisor
          ? null
          : justificativa,
        solicitada_em: isSupervisor
          ? null
          : formatarTimestampLocalSemFuso(new Date(), true),
        solicitada_por: isSupervisor ? null : user.id,
        aprovada_em: isSupervisor
          ? formatarTimestampLocalSemFuso(new Date(), true)
          : null,
        aprovada_por: isSupervisor ? user.id : null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        status: statusFinal,
        esta_ativa: isSupervisor ? true : false,
        numero_versao: (original.numero_versao || 1) + 1,
        criado_em: formatarTimestampLocalSemFuso(new Date(), true),
        atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
        numero_ocorrencia: null,
        numero_temporario: `RET-${Date.now()}`,
        criado_por: original.criado_por,
        criado_em: original.criado_em,
        atualizado_por: user.id,
        data_hora_inicio: original.data_hora_inicio,
        data_hora_encerramento: original.data_hora_encerramento,
        forma_solicitacao: original.forma_solicitacao,
        campos_alterados: JSON.stringify(camposAlterados),
        versao_original: JSON.stringify(original),
        // 🔥 NOVO: data_hora_finalizacao permanece null (será preenchido na aprovação)
        data_hora_finalizacao: null,
        // 🔥 NOVO: Assinaturas não são copiadas na retificação
        assinaturas: [],
      };

      delete dadosRetificados.id;

      const dadosAnteriores = { ...original };

      if (isSupervisor) {
        const { error: updateError } = await client
          .from("ocorrencias")
          .update({
            esta_ativa: false,
            atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
          })
          .eq("id", id);

        if (updateError) throw updateError;
      }

      const { data: novaOcorrencia, error: insertError } = await client
        .from("ocorrencias")
        .insert([dadosRetificados])
        .select()
        .single();

      if (insertError) throw insertError;

      // Copiar envolvidos
      const envolvidosResult = await this.listarEnvolvidos(id);
      if (envolvidosResult.success && envolvidosResult.data.length > 0) {
        const novosEnvolvidos = envolvidosResult.data.map((env) => ({
          ...env,
          id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
          ocorrencia_id: novaOcorrencia.id,
          criado_em: formatarTimestampLocalSemFuso(new Date(), true),
        }));

        novosEnvolvidos.forEach((env) => delete env.id);

        const { error: envError } = await client
          .from("envolvidos")
          .insert(novosEnvolvidos);

        if (envError) {
          console.warn("Erro ao copiar envolvidos:", envError);
        }
      }

      // Copiar anexos (apenas anexos reais, não assinaturas)
      const anexosResult = await this.listarAnexos(id);
      if (anexosResult.success && anexosResult.data.length > 0) {
        // 🔥 FILTRAR: Apenas anexos que não são assinaturas
        const anexosReais = anexosResult.data.filter(
          (a) => a.tipo !== "assinatura",
        );
        if (anexosReais.length > 0) {
          const novosAnexos = anexosReais.map((anexo) => ({
            ...anexo,
            id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
            ocorrencia_id: novaOcorrencia.id,
            criado_em: formatarTimestampLocalSemFuso(new Date(), true),
          }));

          novosAnexos.forEach((anexo) => delete anexo.id);

          const { error: anexoError } = await client
            .from("anexos")
            .insert(novosAnexos);

          if (anexoError) {
            console.warn("Erro ao copiar anexos:", anexoError);
          }
        }
      }

      console.log("✅ Retificação criada:", novaOcorrencia.id);

      await authManager.logSolicitarRetificacao(user.id, id);

      // Registrar log pericial
      await this.registrarLogPericial(
        "SOLICITAR_RETIFICACAO",
        "ocorrencias",
        novaOcorrencia.id,
        dadosAnteriores,
        novaOcorrencia,
      );

      return {
        success: true,
        data: novaOcorrencia,
        original_id: id,
        status: statusFinal,
        is_pending: !isSupervisor,
        campos_alterados: camposAlterados,
      };
    } catch (error) {
      console.error("❌ Erro ao criar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  getCampoLabel(campo) {
    const labels = {
      nome_solicitante: "Nome do Solicitante",
      cpf_solicitante: "CPF do Solicitante",
      rg_solicitante: "RG do Solicitante",
      telefone_solicitante: "Telefone do Solicitante",
      endereco_solicitante: "Endereço do Solicitante",
      bairro_solicitante: "Bairro do Solicitante",
      complemento: "Complemento",
      identificacao_adicional: "Identificação Adicional",
      codigo_municipal: "Código Municipal",
      local_ocorrencia: "Local da Ocorrência",
      rodovia: "Rodovia",
      bairro_ocorrencia: "Bairro da Ocorrência",
      referencia: "Referência",
      observacoes: "Observações",
      codigo_operacional: "Código Operacional",
      tipo_ocorrencia: "Tipo de Ocorrência",
      sub_tipo_ocorrencia: "Sub-tipo de Ocorrência",
      gravidade: "Gravidade",
      numero_bo: "Número do BO",
      orgao_bo: "Órgão Registrador",
      data_bo: "Data do BO",
    };
    return labels[campo] || campo;
  }

  async aprovarRetificacao(retificacaoId) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error:
            "Permissão negada. Apenas supervisores podem aprovar retificações.",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: retificacao, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacaoId)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status !== "pending_rectification") {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      const { data: original, error: origError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacao.ocorrencia_original_id)
        .single();

      if (origError || !original) {
        return { success: false, error: "Ocorrência original não encontrada" };
      }

      const numeroOriginal = original.numero_ocorrencia;

      const dadosAnterioresOriginal = { ...original };
      const dadosAnterioresRetificacao = { ...retificacao };

      const { error: updateOrigError } = await client
        .from("ocorrencias")
        .update({
          esta_ativa: false,
          status: "rectified",
          atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
        })
        .eq("id", original.id);

      if (updateOrigError) throw updateOrigError;

      // 🔥 NOVO: Adicionar data_hora_finalizacao na aprovação
      const dataFinalizacao = globalThis.obterTimestampBrasilSemFuso();

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: "rectified",
          esta_ativa: true,
          numero_ocorrencia: numeroOriginal,
          justificativa_retificacao:
            retificacao.solicitacao_retificacao_justificativa,
          retificado_em: formatarTimestampLocalSemFuso(new Date(), true),
          retificado_por: user.id,
          aprovada_em: formatarTimestampLocalSemFuso(new Date(), true),
          aprovada_por: user.id,
          atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
          data_hora_finalizacao: dataFinalizacao,
        })
        .eq("id", retificacaoId)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Retificação aprovada:", retificacaoId);

      await authManager.logAprovarRetificacao(user.id, retificacaoId);

      // Registrar log pericial
      await this.registrarLogPericial(
        "APROVAR_RETIFICACAO",
        "ocorrencias",
        retificacaoId,
        {
          original: dadosAnterioresOriginal,
          retificacao: dadosAnterioresRetificacao,
        },
        data,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao aprovar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  async rejeitarRetificacao(retificacaoId, motivo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error:
            "Permissão negada. Apenas supervisores podem rejeitar retificações.",
        };
      }

      if (!motivo || motivo.trim().length === 0) {
        return { success: false, error: "Motivo da rejeição é obrigatório" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: retificacao, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacaoId)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status !== "pending_rectification") {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      const dadosAnteriores = { ...retificacao };

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: "rectification_rejected",
          esta_ativa: false,
          rejeitada_em: formatarTimestampLocalSemFuso(new Date(), true),
          rejeitada_por: user.id,
          motivo_rejeicao: motivo,
          atualizado_em: formatarTimestampLocalSemFuso(new Date(), true),
        })
        .eq("id", retificacaoId)
        .select()
        .single();

      if (error) throw error;

      console.log("❌ Retificação rejeitada:", retificacaoId);

      await authManager.logRejeitarRetificacao(user.id, retificacaoId);

      // Registrar log pericial
      await this.registrarLogPericial(
        "REJEITAR_RETIFICACAO",
        "ocorrencias",
        retificacaoId,
        dadosAnteriores,
        data,
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao rejeitar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  async buscarRetificacoesPendentes() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error:
            "Permissão negada. Apenas supervisores podem ver pedidos pendentes.",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("*")
        .eq("status", "pending_rectification")
        .order("solicitada_em", { ascending: true });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao buscar retificações pendentes:", error);
      return { success: false, error: error.message };
    }
  }

  async buscarHistorico(id) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: original, error: originalError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", id)
        .single();

      if (originalError) throw originalError;

      const { data: retificacoes, error: retError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("ocorrencia_original_id", id)
        .order("numero_versao", { ascending: true });

      if (retError) throw retError;

      const historico = [
        { ...original, is_original: true },
        ...retificacoes.map((r) => ({ ...r, is_original: false })),
      ];

      return { success: true, data: historico };
    } catch (error) {
      console.error("❌ Erro ao buscar histórico:", error);
      return { success: false, error: error.message };
    }
  }

  async buscarDetalhesAlteracoes(retificacaoId) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: retificacao, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacaoId)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      let camposAlterados = [];
      let versaoOriginal = null;

      if (retificacao.campos_alterados) {
        try {
          camposAlterados = JSON.parse(retificacao.campos_alterados);
        } catch (e) {
          console.warn("Erro ao parsear campos alterados:", e);
        }
      }

      if (retificacao.versao_original) {
        try {
          versaoOriginal = JSON.parse(retificacao.versao_original);
        } catch (e) {
          console.warn("Erro ao parsear versão original:", e);
        }
      }

      return {
        success: true,
        data: {
          campos_alterados: camposAlterados,
          versao_original: versaoOriginal,
          versao_atual: retificacao,
        },
      };
    } catch (error) {
      console.error("❌ Erro ao buscar detalhes das alterações:", error);
      return { success: false, error: error.message };
    }
  }

  async temRetificacoes(id) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return false;

      const { count, error } = await client
        .from("ocorrencias")
        .select("*", { count: "exact", head: true })
        .eq("ocorrencia_original_id", id);

      if (error) throw error;
      return count > 0;
    } catch (error) {
      console.error("❌ Erro ao verificar retificações:", error);
      return false;
    }
  }

  async buscarVersaoAtiva(id) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: ocorrencia, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError) throw buscaError;

      if (ocorrencia.ocorrencia_original_id) {
        const { data: ativa, error: ativaError } = await client
          .from("ocorrencias")
          .select("*")
          .eq("ocorrencia_original_id", ocorrencia.ocorrencia_original_id)
          .eq("esta_ativa", true)
          .maybeSingle();

        if (ativaError && ativaError.code !== "PGRST116") throw ativaError;

        if (!ativa) {
          if (
            ocorrencia.status === "rectified" ||
            ocorrencia.status === "pending_rectification"
          ) {
            return { success: true, data: ocorrencia };
          }
          const { data: original, error: origError } = await client
            .from("ocorrencias")
            .select("*")
            .eq("id", ocorrencia.ocorrencia_original_id)
            .single();
          if (origError) throw origError;
          return { success: true, data: original };
        }
        return { success: true, data: ativa };
      }

      const { data: ativa, error: ativaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("ocorrencia_original_id", id)
        .eq("esta_ativa", true)
        .maybeSingle();

      if (ativaError && ativaError.code !== "PGRST116") throw ativaError;

      if (!ativa) {
        if (ocorrencia.esta_ativa) {
          return { success: true, data: ocorrencia };
        }
        const { data: pendente, error: pendError } = await client
          .from("ocorrencias")
          .select("*")
          .eq("ocorrencia_original_id", id)
          .eq("status", "pending_rectification")
          .maybeSingle();

        if (pendError) throw pendError;
        if (pendente) {
          return { success: true, data: pendente };
        }

        return { success: false, error: "Nenhuma versão ativa encontrada" };
      }

      return { success: true, data: ativa };
    } catch (error) {
      console.error("❌ Erro ao buscar versão ativa:", error);
      return { success: false, error: error.message };
    }
  }

  async buscarOcorrenciasComLocalizacao(filtros = {}) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      let query = client
        .from("ocorrencias")
        .select("*")
        .eq("esta_ativa", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (filtros.data_inicio) {
        query = query.gte("criado_em", filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte("criado_em", filtros.data_fim + "T23:59:59");
      }
      if (filtros.tipo_ocorrencia) {
        query = query.eq("tipo_ocorrencia", filtros.tipo_ocorrencia);
      }
      if (filtros.status) {
        query = query.eq("status", filtros.status);
      }

      query = query.limit(filtros.limit || 500);
      query = query.order("criado_em", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      const ocorrencias = data || [];
      if (ocorrencias.length > 0) {
        const idsCriadores = ocorrencias
          .map((o) => o.criado_por)
          .filter((id) => id);
        const dadosUsuarios =
          await this.buscarDadosUsuariosEmLote(idsCriadores);

        ocorrencias.forEach((ocorrencia) => {
          ocorrencia.criador = dadosUsuarios[ocorrencia.criado_por] || {
            nome_completo: null,
            cpf: null,
          };
        });
      }

      const pontosMapa = ocorrencias.map((occ) => ({
        id: occ.id,
        latitude: occ.latitude,
        longitude: occ.longitude,
        tipo: occ.tipo_ocorrencia,
        status: occ.status,
        local: occ.local_ocorrencia,
        data: occ.criado_em,
        numero: occ.numero_ocorrencia || occ.numero_temporario || "Rascunho",
        criador: occ.criador || { nome_completo: "Desconhecido" },
      }));

      return {
        success: true,
        data: pontosMapa,
        total: pontosMapa.length,
      };
    } catch (error) {
      console.error("❌ Erro ao buscar ocorrências com localização:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // ENVOLVIDOS
  // ============================================

  async adicionarEnvolvido(ocorrenciaId, dados) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const envolvido = {
        ...dados,
        ocorrencia_id: ocorrenciaId,
        criado_por: user.id,
        criado_em: formatarTimestampLocalSemFuso(new Date(), true),
      };

      const { data, error } = await client
        .from("envolvidos")
        .insert([envolvido])
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao adicionar envolvido:", error);
      return { success: false, error: error.message };
    }
  }

  async listarEnvolvidos(ocorrenciaId) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("envolvidos")
        .select("*")
        .eq("ocorrencia_id", ocorrenciaId)
        .order("criado_em", { ascending: true });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar envolvidos:", error);
      return { success: false, error: error.message };
    }
  }

  async removerEnvolvido(id) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { error } = await client.from("envolvidos").delete().eq("id", id);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error("❌ Erro ao remover envolvido:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // ANEXOS - CORRIGIDO E SEM LIMITE
  // ============================================

  /**
   * 🔥 ALTERADO: Removido limite de anexos (MAX_ANEXOS)
   */
  async adicionarAnexo(ocorrenciaId, arquivo, tipo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Comprimir imagem se for imagem
      let arquivoProcessado = arquivo;
      if (arquivo.type.startsWith("image/")) {
        arquivoProcessado = await this.comprimirImagemOtimizada(arquivo);
      }

      // Gerar hash do arquivo
      const hash = await this.gerarHashAnexo(arquivoProcessado);

      const fileExt = arquivoProcessado.name.split(".").pop();
      const fileName = `${authManager.getUserId()}/${ocorrenciaId}/${Date.now()}-${arquivoProcessado.name}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, arquivoProcessado);

      if (uploadError) throw uploadError;


      const anexo = {
        ocorrencia_id: ocorrenciaId,
        nome_arquivo: arquivoProcessado.name,
        tipo_arquivo: tipo || this.determinarTipo(arquivoProcessado),
        tamanho: arquivoProcessado.size,
        url: fileName,
        mime_type: arquivoProcessado.type,
        hash_arquivo: hash,
        metadata: {
          data_hora_upload: globalThis.obterTimestampBrasilSemFuso(),
          tipo_original: arquivo.type,
        },
        criado_por: user.id,
        criado_em: formatarTimestampLocalSemFuso(new Date(), true),
      };

      const { data, error } = await client
        .from("anexos")
        .insert([anexo])
        .select()
        .single();

      if (error) throw error;

      // Registrar log pericial
      await this.registrarLogPericial(
        "ADICIONAR_ANEXO",
        "anexos",
        data.id,
        null,
        { nome: anexo.nome_arquivo, tipo: anexo.tipo_arquivo, hash: hash },
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao adicionar anexo:", error);
      return { success: false, error: error.message };
    }
  }

  async listarAnexos(ocorrenciaId) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("anexos")
        .select("*")
        .eq("ocorrencia_id", ocorrenciaId)
        .order("criado_em", { ascending: false });

      if (error) throw error;

      // A listagem retorna somente metadados/URLs; não faz HEAD por arquivo.
      // Consultas sequenciais por foto atrasavam a abertura do modal quando
      // havia muitos anexos. A disponibilidade é tratada pelo carregamento da imagem.
      const anexos = data || [];
      return { success: true, data: anexos };
    } catch (error) {
      console.error("❌ Erro ao listar anexos:", error);
      return { success: false, error: error.message };
    }
  }

  async removerAnexo(id) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar anexo antes de remover para log
      const { data: anexo, error: buscaError } = await client
        .from("anexos")
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError) throw buscaError;

      const { error } = await client.from("anexos").delete().eq("id", id);

      if (error) throw error;

      // Remover do cache
      delete this.cacheAnexos[id];

      // Registrar log pericial
      await this.registrarLogPericial(
        "REMOVER_ANEXO",
        "anexos",
        id,
        anexo,
        null,
      );

      return { success: true };
    } catch (error) {
      console.error("❌ Erro ao remover anexo:", error);
      return { success: false, error: error.message };
    }
  }

  determinarTipo(arquivo) {
    const type = arquivo.type;
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type === "application/pdf" || type.includes("document"))
      return "document";
    if (type.startsWith("audio/")) return "audio";
    return "document";
  }

  // ============================================
  // 🔥 NOVO: ASSINATURAS COM ENVOLVIDO_ID
  // ============================================

  /**
   * Adiciona uma assinatura à ocorrência vinculada a um envolvido
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {Object} dadosAssinatura - Dados da assinatura
   * @param {string} dadosAssinatura.envolvido_id - ID do envolvido (OBRIGATÓRIO)
   * @param {string} dadosAssinatura.tipo - 'autor', 'vitima', 'testemunha', 'solicitante'
   * @param {string} dadosAssinatura.nome - Nome do signatário
   * @param {string} dadosAssinatura.cpf - CPF do signatário (opcional)
   * @param {string} dadosAssinatura.assinatura_data_url - Data URL da assinatura (base64)
   * @returns {Promise<Object>}
   */
  async adicionarAssinatura(ocorrenciaId, dadosAssinatura) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Validar envolvido_id
      if (!dadosAssinatura.envolvido_id) {
        return {
          success: false,
          error: "envolvido_id é obrigatório para vincular a assinatura",
        };
      }

      // Buscar a ocorrência
      const { data: ocorrencia, error: buscaError } = await client
        .from("ocorrencias")
        .select("assinaturas")
        .eq("id", ocorrenciaId)
        .single();

      if (buscaError) throw buscaError;

      // Obter array atual de assinaturas
      let assinaturas = ocorrencia.assinaturas || [];

      // Verificar se este envolvido já assinou
      const assinaturaExistente = assinaturas.find(
        (a) => a.envolvido_id === dadosAssinatura.envolvido_id,
      );

      if (assinaturaExistente) {
        // Substituir a assinatura existente
        assinaturas = assinaturas.filter(
          (a) => a.envolvido_id !== dadosAssinatura.envolvido_id,
        );
        console.log(
          `🔄 Substituindo assinatura do envolvido ${dadosAssinatura.envolvido_id}`,
        );
      }

      // Criar nova assinatura
      const novaAssinatura = {
        id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
        envolvido_id: dadosAssinatura.envolvido_id,
        tipo: dadosAssinatura.tipo || "outro",
        nome: dadosAssinatura.nome,
        cpf: dadosAssinatura.cpf || null,
        assinatura_data_url: dadosAssinatura.assinatura_data_url,
        assinado_em: globalThis.obterTimestampBrasilSemFuso(),
        assinado_por: user.id,
        nome_guarda: user.nome_completo,
      };

      // Adicionar ao array
      assinaturas.push(novaAssinatura);

      // Atualizar a ocorrência
      const { data, error } = await client
        .from("ocorrencias")
        .update({
          assinaturas: assinaturas,
          atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
          atualizado_por: user.id,
        })
        .eq("id", ocorrenciaId)
        .select()
        .single();

      if (error) throw error;

      console.log(
        "✅ Assinatura adicionada à ocorrência:",
        ocorrenciaId,
        "| Envolvido:",
        dadosAssinatura.envolvido_id,
      );

      // Registrar log pericial
      await this.registrarLogPericial(
        "ADICIONAR_ASSINATURA",
        "ocorrencias",
        ocorrenciaId,
        null,
        {
          assinatura: {
            envolvido_id: novaAssinatura.envolvido_id,
            tipo: novaAssinatura.tipo,
            nome: novaAssinatura.nome,
          },
        },
      );

      return { success: true, data: data, assinatura: novaAssinatura };
    } catch (error) {
      console.error("❌ Erro ao adicionar assinatura:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lista todas as assinaturas de uma ocorrência com dados completos
   * @param {string} ocorrenciaId - ID da ocorrência
   * @returns {Promise<Object>}
   */
  async listarAssinaturas(ocorrenciaId) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("assinaturas")
        .eq("id", ocorrenciaId)
        .single();

      if (error) throw error;

      const assinaturas = data?.assinaturas || [];

      // 🔥 Buscar dados completos dos envolvidos para cada assinatura
      if (assinaturas.length > 0) {
        const idsEnvolvidos = assinaturas
          .map((a) => a.envolvido_id)
          .filter((id) => id);

        if (idsEnvolvidos.length > 0) {
          const { data: envolvidos, error: envError } = await client
            .from("envolvidos")
            .select("id, nome_completo, tipo, cpf, telefone")
            .in("id", idsEnvolvidos);

          if (!envError && envolvidos) {
            const mapaEnvolvidos = {};
            envolvidos.forEach((env) => {
              mapaEnvolvidos[env.id] = env;
            });

            // Enriquecer as assinaturas com dados completos dos envolvidos
            return {
              success: true,
              data: assinaturas.map((ass) => ({
                ...ass,
                envolvido: mapaEnvolvidos[ass.envolvido_id] || null,
              })),
            };
          }
        }
      }

      return { success: true, data: assinaturas };
    } catch (error) {
      console.error("❌ Erro ao listar assinaturas:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove uma assinatura de uma ocorrência
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {string} assinaturaId - ID da assinatura a remover (ou envolvido_id)
   * @param {boolean} porEnvolvido - Se true, busca por envolvido_id em vez de id
   * @returns {Promise<Object>}
   */
  async removerAssinatura(ocorrenciaId, assinaturaId, porEnvolvido = false) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar a ocorrência
      const { data: ocorrencia, error: buscaError } = await client
        .from("ocorrencias")
        .select("assinaturas")
        .eq("id", ocorrenciaId)
        .single();

      if (buscaError) throw buscaError;

      let assinaturas = ocorrencia.assinaturas || [];
      let assinaturaRemovida = null;

      if (porEnvolvido) {
        // Remover por envolvido_id
        assinaturaRemovida = assinaturas.find(
          (a) => a.envolvido_id === assinaturaId,
        );
        assinaturas = assinaturas.filter(
          (a) => a.envolvido_id !== assinaturaId,
        );
      } else {
        // Remover por id da assinatura
        assinaturaRemovida = assinaturas.find((a) => a.id === assinaturaId);
        assinaturas = assinaturas.filter((a) => a.id !== assinaturaId);
      }

      if (!assinaturaRemovida) {
        return {
          success: false,
          error: porEnvolvido
            ? "Assinatura não encontrada para este envolvido"
            : "Assinatura não encontrada",
        };
      }

      // Atualizar a ocorrência
      const { data, error } = await client
        .from("ocorrencias")
        .update({
          assinaturas: assinaturas,
          atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
          atualizado_por: user.id,
        })
        .eq("id", ocorrenciaId)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Assinatura removida da ocorrência:", ocorrenciaId);

      // Registrar log pericial
      await this.registrarLogPericial(
        "REMOVER_ASSINATURA",
        "ocorrencias",
        ocorrenciaId,
        { assinatura: assinaturaRemovida },
        null,
      );

      return { success: true, data: data };
    } catch (error) {
      console.error("❌ Erro ao remover assinatura:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica se um envolvido já possui assinatura em uma ocorrência
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {string} envolvidoId - ID do envolvido
   * @returns {Promise<Object>}
   */
  async verificarAssinaturaExistente(ocorrenciaId, envolvidoId) {
    try {
      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("assinaturas")
        .eq("id", ocorrenciaId)
        .single();

      if (error) throw error;

      const assinaturas = data?.assinaturas || [];
      const existente = assinaturas.find((a) => a.envolvido_id === envolvidoId);

      return {
        success: true,
        data: { existe: !!existente, assinatura: existente || null },
      };
    } catch (error) {
      console.error("❌ Erro ao verificar assinatura existente:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // P3 — EQUIPE OPERACIONAL DA OCORRÊNCIA
  // ============================================

  async listarGuardasDisponiveis() {
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar ao servidor" };
      const { data, error } = await client
        .from("usuarios")
        .select("id, nome_completo, matricula, perfil, status")
        .eq("status", "ativo")
        .in("perfil", ["guarda", "supervisor"])
        .is("deleted_at", null)
        .order("nome_completo", { ascending: true });
      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar guardas disponíveis:", error);
      return { success: false, error: error.message };
    }
  }

  async listarGuardas(ocorrenciaId) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return { success: false, error: "Erro ao conectar ao servidor" };
      const { data, error } = await client
        .from("ocorrencia_guardas")
        .select("*")
        .eq("ocorrencia_id", ocorrenciaId)
        .eq("esta_ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar equipe da ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async salvarGuardas(ocorrenciaId, guardas) {
    const equipe = (guardas || []).filter((g) => g && g.guarda_id && g.papel);
    if (!ocorrenciaId || equipe.length === 0) {
      return { success: false, error: "Equipe da ocorrência incompleta" };
    }

    try {
      const user = authManager.getUser();
      const client = supabaseClient.getClient();
      if (!client || !user) return { success: false, error: "Usuário não autenticado" };

      const atuaisResult = await this.listarGuardas(ocorrenciaId);
      if (!atuaisResult.success) return atuaisResult;
      const atuais = atuaisResult.data || [];
      const desejados = equipe.map((g) => ({
        guarda_id: g.guarda_id,
        papel: g.papel,
      }));
      const chave = (g) => `${g.guarda_id}:${g.papel}`;
      const desejadasChaves = new Set(desejados.map(chave));

      const remover = atuais.filter((g) => !desejadasChaves.has(chave(g)));
      if (remover.length > 0) {
        const ids = remover.map((g) => g.id);
        const { error } = await client
          .from("ocorrencia_guardas")
          .update({
            esta_ativo: false,
            removido_em: globalThis.obterTimestampBrasilSemFuso(),
            removido_por: user.id,
            motivo_remocao: "Substituição da equipe durante edição",
            atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
          })
          .in("id", ids);
        if (error) throw error;
      }

      const atuaisChaves = new Set(atuais.map(chave));
      const novos = equipe
        .filter((g) => !atuaisChaves.has(chave(g)))
        .map((g, index) => ({
          ocorrencia_id: ocorrenciaId,
          guarda_id: g.guarda_id,
          papel: g.papel,
          ordem: g.ordem || index + 1,
          nome_snapshot: g.nome_snapshot || g.nome_completo || "Guarda não informado",
          matricula_snapshot: g.matricula_snapshot || g.matricula || null,
          perfil_snapshot: g.perfil_snapshot || g.perfil || null,
          selecionado_por: g.selecionado_por || user.id,
          esta_ativo: true,
        }));

      if (novos.length > 0) {
        const { error } = await client.from("ocorrencia_guardas").insert(novos);
        if (error) throw error;
      }
      return { success: true };
    } catch (error) {
      console.error("❌ Erro ao salvar equipe da ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // SALVAR EM LOTE - 🔥 ALTERADO (sem limite)
  // ============================================

  async salvarEnvolvidos(ocorrenciaId, envolvidos, preservarIds = false) {
    if (!envolvidos || envolvidos.length === 0) {
      return { success: true };
    }

    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const dadosParaInserir = envolvidos.map((env) => ({
        ...(preservarIds && env.id ? { id: env.id } : {}),
        ocorrencia_id: ocorrenciaId,
        tipo: env.tipo,
        nome_completo: env.nome_completo,
        data_nascimento: env.data_nascimento || null,
        rg: env.rg || null,
        cpf: env.cpf || null,
        telefone: env.telefone || null,
        nome_pai: env.nome_pai || null,
        nome_mae: env.nome_mae || null,
        endereco: env.endereco || null,
        bairro: env.bairro || null,
        cidade: env.cidade || null,
        observacoes: env.observacoes || null,
        criado_por: user.id,
        criado_em: formatarTimestampLocalSemFuso(new Date(), true),
      }));

      const { data, error } = await client
        .from("envolvidos")
        .insert(dadosParaInserir)
        .select();

      if (error) throw error;

      console.log(
        `✅ ${data.length} envolvidos salvos para ocorrência ${ocorrenciaId}`,
      );
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao salvar envolvidos em lote:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔥 ALTERADO: Salvar anexos sem limite de quantidade
   */
  async salvarAnexos(ocorrenciaId, anexos) {
    if (!anexos || anexos.length === 0) {
      return { success: true };
    }

    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const resultados = [];

      for (const anexo of anexos) {
        let urlFinal = anexo.url || null;
        let hash = anexo.hash || null;

        if (anexo.arquivo) {
          // Comprimir se for imagem
          let arquivo = anexo.arquivo;
          if (arquivo.type.startsWith("image/")) {
            arquivo = await this.comprimirImagemOtimizada(arquivo);
          }

          // Gerar hash
          hash = await this.gerarHashAnexo(arquivo);

          const fileExt = arquivo.name.split(".").pop();
          const fileName = `${authManager.getUserId()}/${ocorrenciaId}/${Date.now()}-${arquivo.name}`;

          const { error: uploadError } = await client.storage
            .from("anexos")
            .upload(fileName, arquivo);

          if (uploadError) {
            console.error("Erro no upload do anexo:", uploadError);
            resultados.push({
              nome: anexo.nome,
              success: false,
              error: uploadError.message,
            });
            continue;
          }

          urlFinal = fileName;
        }

        if (urlFinal) {
          const { data, error } = await client
            .from("anexos")
            .insert({
              ocorrencia_id: ocorrenciaId,
              nome_arquivo: anexo.nome || "anexo",
              tipo_arquivo:
                anexo.tipo ||
                this.determinarTipo(anexo.arquivo || { type: "" }),
              tamanho: anexo.tamanho || 0,
              url: urlFinal,
              mime_type: anexo.arquivo?.type || null,
              hash_arquivo: hash,
              metadata: {
                data_hora_upload: globalThis.obterTimestampBrasilSemFuso(),
                ...(anexo.metadata || {}),
              },
              criado_por: user.id,
              criado_em: formatarTimestampLocalSemFuso(new Date(), true),
            })
            .select()
            .single();

          if (error) {
            console.error("Erro ao salvar registro do anexo:", error);
            resultados.push({
              nome: anexo.nome,
              success: false,
              error: error.message,
            });
          } else {
            resultados.push({ nome: anexo.nome, success: true, data });
          }
        }
      }

      const sucessos = resultados.filter((r) => r.success).length;
      const erros = resultados.filter((r) => !r.success);

      if (erros.length > 0) {
        console.warn(`Anexos: ${sucessos} salvos, ${erros.length} com erro`);
        return {
          success: true,
          data: resultados,
          partial: true,
          erros: erros.map((e) => e.error).join(" | "),
        };
      }

      console.log(
        `✅ ${resultados.length} anexos salvos para ocorrência ${ocorrenciaId}`,
      );
      return { success: true, data: resultados };
    } catch (error) {
      console.error("❌ Erro ao salvar anexos:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  async getStats() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("*")
        .eq("esta_ativa", true);

      if (error) throw error;

      const hoje = formatarTimestampLocalSemFuso(new Date(), true).slice(0, 10);

      // Normalizar o campo para tolerar arrays, JSON serializado e formatos legados.
      // Esta conversão é somente em memória para estatísticas; não grava dados.
      const ocorrencias = Array.isArray(data) ? data : [];
      const obterListaAssinaturas = (valor) => {
        let assinaturas = valor;
        if (typeof assinaturas === "string") {
          try {
            assinaturas = JSON.parse(assinaturas);
          } catch {
            return assinaturas.trim() ? [assinaturas] : [];
          }
        }
        if (Array.isArray(assinaturas)) {
          return assinaturas.filter((item) => item != null);
        }
        if (assinaturas && typeof assinaturas === "object") {
          if (Array.isArray(assinaturas.assinaturas)) {
            return assinaturas.assinaturas.filter((item) => item != null);
          }
          const valores = Object.values(assinaturas);
          if (valores.length > 0 && valores.every(Array.isArray)) {
            return valores.flat().filter((item) => item != null);
          }
          if (
            valores.length > 0 &&
            valores.every((item) => item && typeof item === "object")
          ) {
            return valores;
          }
          return Object.keys(assinaturas).length > 0 ? [assinaturas] : [];
        }
        return [];
      };
      const assinaturasPorOcorrencia = ocorrencias.map((ocorrencia) => {
        const normalizada = obterListaAssinaturas(ocorrencia?.assinaturas);
        // Defesa final: nenhum filtro de estatística recebe JSON/object/undefined.
        return Array.isArray(normalizada)
          ? normalizada.filter((assinatura) => assinatura != null)
          : [];
      });
      const totalAssinaturas = assinaturasPorOcorrencia.reduce(
        (total, assinaturas) => total + assinaturas.length,
        0,
      );
      const assinaturasComEnvolvido = assinaturasPorOcorrencia.reduce(
        (total, assinaturas) =>
          total +
          assinaturas.filter(
            (assinatura) =>
              assinatura &&
              typeof assinatura === "object" &&
              assinatura.envolvido_id,
          ).length,
        0,
      );

      const stats = {
        total: ocorrencias.length,
        hoje: ocorrencias.filter((o) => o.criado_em.slice(0, 10) === hoje).length,
        draft: ocorrencias.filter((o) => o.status === "draft").length,
        pending: ocorrencias.filter((o) => o.status === "pending_sync").length,
        synced: ocorrencias.filter((o) => o.status === "synced").length,
        cancelled: ocorrencias.filter((o) => o.status === "cancelled").length,
        rectified: ocorrencias.filter((o) => o.status === "rectified").length,
        pending_rectification: ocorrencias.filter(
          (o) => o.status === "pending_rectification",
        ).length,
        rectification_rejected: ocorrencias.filter(
          (o) => o.status === "rectification_rejected",
        ).length,
        // Estatísticas por modo
        rapido: ocorrencias.filter((o) => o.modo_criacao === "rapido").length,
        completo: ocorrencias.filter((o) => o.modo_criacao === "completo").length,
        rapido_completado: ocorrencias.filter(
          (o) => o.modo_criacao === "rapido" && o.completado_em !== null,
        ).length,
        rapido_pendente: ocorrencias.filter(
          (o) => o.modo_criacao === "rapido" && o.completado_em === null,
        ).length,
        // 🔥 NOVO: Estatísticas de finalização
        finalizados_hoje: ocorrencias.filter(
          (o) =>
            o.data_hora_finalizacao &&
            o.data_hora_finalizacao.slice(0, 10) === hoje,
        ).length,
        com_finalizacao: ocorrencias.filter((o) => o.data_hora_finalizacao !== null)
          .length,
        // 🔥 NOVO: Estatísticas de assinaturas
        com_assinaturas: assinaturasPorOcorrencia.filter(
          (assinaturas) => assinaturas.length > 0,
        ).length,
        total_assinaturas: totalAssinaturas,
        assinaturas_com_envolvido: assinaturasComEnvolvido,
        assinaturas_sem_envolvido: totalAssinaturas - assinaturasComEnvolvido,
      };

      return { success: true, data: stats };
    } catch (error) {
      console.error("❌ Erro ao buscar estatísticas:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // 🔥 NOVO: ATUALIZAR DATA_HORA_FINALIZACAO
  // ============================================

  /**
   * Atualiza a data_hora_finalizacao de uma ocorrência
   * @param {string} id - ID da ocorrência
   * @param {string} dataHora - Data/hora de finalização (opcional, usa agora)
   * @returns {Promise<Object>}
   */
  async atualizarDataHoraFinalizacao(id, dataHora = null) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      // Se já tem data_hora_finalizacao, não sobrescreve
      if (ocorrencia.data_hora_finalizacao) {
        return {
          success: false,
          error: "Esta ocorrência já possui data de finalização",
        };
      }

      const dataFinalizacao = dataHora || globalThis.obterTimestampBrasilSemFuso();

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          data_hora_finalizacao: dataFinalizacao,
          atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
          atualizado_por: user.id,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Data de finalização atualizada para:", dataFinalizacao);

      await this.registrarLogPericial(
        "ATUALIZAR_FINALIZACAO",
        "ocorrencias",
        id,
        { data_hora_finalizacao: null },
        { data_hora_finalizacao: dataFinalizacao },
      );

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao atualizar data de finalização:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // LIMPAR CACHE
  // ============================================

  limparCacheUsuarios() {
    this.cacheUsuarios = {};
    console.log("🧹 Cache de usuários limpo");
  }

  limparCacheAnexos() {
    this.cacheAnexos = {};
    console.log("🧹 Cache de anexos limpo");
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

const ocorrenciaManager = new OcorrenciaManager();
window.ocorrenciaManager = ocorrenciaManager;
console.log("📦 Ocorrência Manager carregado");
