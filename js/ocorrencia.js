/**
 * GERENCIADOR DE OCORRÊNCIAS
 * Guarda Municipal de Pitangueiras - PR
 */

class OcorrenciaManager {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("✅ Ocorrência Manager inicializado");
  }

  // ============================================
  // CRUD OCORRÊNCIAS
  // ============================================

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

      // Gera número temporário se offline
      const numeroTemporario = !navigator.onLine ? `LOCAL-${Date.now()}` : null;

      // GARANTE QUE DATA_HORA_INICIO SEJA VÁLIDA
      let dataHoraInicio = dados.data_hora_inicio;
      // Se for string vazia, undefined ou null, usa a data atual
      if (
        !dataHoraInicio ||
        dataHoraInicio === "" ||
        dataHoraInicio === "null"
      ) {
        dataHoraInicio = new Date().toISOString();
      }

      const ocorrencia = {
        ...dados,
        numero_temporario: numeroTemporario,
        status: dados.status || "draft",
        criado_por: user.id,
        criado_em: new Date().toISOString(),
        data_hora_inicio: dataHoraInicio,
      };

      // Remove campos que não existem na tabela ou são undefined
      delete ocorrencia.envolvidos;
      delete ocorrencia.anexos;

      const { data, error } = await client
        .from("ocorrencias")
        .insert([ocorrencia])
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Ocorrência criada:", data.id);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao criar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async listar(filtros = {}) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      let query = client.from("ocorrencias").select("*");

      // Guarda só vê suas ocorrências
      if (authManager.isGuarda()) {
        query = query.eq("criado_por", user.id);
      }

      // Filtros
      if (filtros.status) {
        query = query.eq("status", filtros.status);
      }
      if (filtros.data_inicio) {
        query = query.gte("criado_em", filtros.data_inicio);
      }
      if (filtros.data_fim) {
        query = query.lte("criado_em", filtros.data_fim);
      }
      if (filtros.search) {
        query = query.or(
          `numero_ocorrencia.ilike.%${filtros.search}%,local_ocorrencia.ilike.%${filtros.search}%`,
        );
      }
      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }

      query = query.order("criado_em", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao listar ocorrências:", error);
      return { success: false, error: error.message };
    }
  }

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

      let query = client.from("ocorrencias").select("*").eq("id", id);

      // Guarda só vê suas ocorrências
      if (authManager.isGuarda()) {
        query = query.eq("criado_por", user.id);
      }

      const { data, error } = await query.single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao buscar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async atualizar(id, dados) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      // Verifica permissão
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      if (!authManager.podeEditar(ocorrencia)) {
        return { success: false, error: "Permissão negada" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          ...dados,
          atualizado_por: user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Ocorrência atualizada:", id);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao atualizar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async finalizar(id) {
    try {
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      if (!authManager.podeFinalizar(ocorrencia)) {
        return { success: false, error: "Permissão negada" };
      }

      // Se online, gera número oficial
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

      return this.atualizar(id, {
        status: status,
        numero_ocorrencia: numeroOficial,
        data_hora_encerramento: new Date().toISOString(),
      });
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

      if (!authManager.podeCancelar(ocorrencia)) {
        return { success: false, error: "Permissão negada" };
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

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: "cancelled",
          cancelado_por: user.id,
          cancelado_em: new Date().toISOString(),
          motivo_cancelamento: motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Ocorrência cancelada:", id);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao cancelar ocorrência:", error);
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
        criado_em: new Date().toISOString(),
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
  // ANEXOS
  // ============================================

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

      // Upload para o Storage
      const fileExt = arquivo.name.split(".").pop();
      const fileName = `${ocorrenciaId}/${Date.now()}-${arquivo.name}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, arquivo);

      if (uploadError) throw uploadError;

      // Obtém URL pública
      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);

      // Salva registro
      const anexo = {
        ocorrencia_id: ocorrenciaId,
        nome_arquivo: arquivo.name,
        tipo_arquivo: tipo || this.determinarTipo(arquivo),
        tamanho: arquivo.size,
        url: urlData.publicUrl,
        mime_type: arquivo.type,
        criado_por: user.id,
        criado_em: new Date().toISOString(),
      };

      const { data, error } = await client
        .from("anexos")
        .insert([anexo])
        .select()
        .single();

      if (error) throw error;

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

      return { success: true, data: data || [] };
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

      const { error } = await client.from("anexos").delete().eq("id", id);

      if (error) throw error;

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
  // SALVAR EM LOTE (PARA FINALIZAÇÃO)
  // ============================================

  /**
   * Salva vários envolvidos de uma só vez
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {Array} envolvidos - Lista de envolvidos
   * @returns {Promise<Object>} Resultado da operação
   */
  async salvarEnvolvidos(ocorrenciaId, envolvidos) {
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

      // Prepara os dados para inserção em lote
      const dadosParaInserir = envolvidos.map((env) => ({
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
        criado_em: new Date().toISOString(),
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
   * Salva vários anexos de uma só vez (com upload para Storage)
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {Array} anexos - Lista de anexos (cada um com {nome, tipo, tamanho, arquivo, url?})
   * @returns {Promise<Object>} Resultado da operação
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

        // Se tem arquivo, faz upload
        if (anexo.arquivo) {
          const fileName = `${ocorrenciaId}/${Date.now()}-${anexo.nome}`;
          const { error: uploadError } = await client.storage
            .from("anexos")
            .upload(fileName, anexo.arquivo);

          if (uploadError) {
            console.error("Erro no upload do anexo:", uploadError);
            // Continua com os próximos, mas registra o erro
            resultados.push({
              nome: anexo.nome,
              success: false,
              error: uploadError.message,
            });
            continue;
          }

          const { data: urlData } = client.storage
            .from("anexos")
            .getPublicUrl(fileName);

          urlFinal = urlData.publicUrl;
        }

        // Insere registro na tabela anexos
        const { data, error } = await client
          .from("anexos")
          .insert({
            ocorrencia_id: ocorrenciaId,
            nome_arquivo: anexo.nome,
            tipo_arquivo: anexo.tipo,
            tamanho: anexo.tamanho || 0,
            url: urlFinal,
            mime_type: anexo.arquivo?.type || null,
            criado_por: user.id,
            criado_em: new Date().toISOString(),
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
      console.error("❌ Erro ao salvar anexos em lote:", error);
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

      let query = client.from("ocorrencias").select("*");

      if (authManager.isGuarda()) {
        query = query.eq("criado_por", user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const hoje = new Date().toISOString().slice(0, 10);
      const stats = {
        total: data.length,
        hoje: data.filter((o) => o.criado_em.slice(0, 10) === hoje).length,
        draft: data.filter((o) => o.status === "draft").length,
        pending: data.filter((o) => o.status === "pending_sync").length,
        synced: data.filter((o) => o.status === "synced").length,
        cancelled: data.filter((o) => o.status === "cancelled").length,
      };

      return { success: true, data: stats };
    } catch (error) {
      console.error("❌ Erro ao buscar estatísticas:", error);
      return { success: false, error: error.message };
    }
  }
}

const ocorrenciaManager = new OcorrenciaManager();
window.ocorrenciaManager = ocorrenciaManager;
console.log("📦 Ocorrência Manager carregado");
