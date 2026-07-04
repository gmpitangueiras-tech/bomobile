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
 * - Na listagem, apenas ocorrências raiz (ocorrencia_original_id IS NULL) são exibidas
 * - Ao aprovar retificação, mantém o mesmo número da ocorrência original
 */

class OcorrenciaManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * CAMPOS QUE PODEM SER RETIFICADOS
   * Baseado em sistemas policiais oficiais
   * Permite: correção cadastral, correção de endereço, complementação de informações
   */
  get CAMPOS_RETIFICAVEIS() {
    return [
      // Dados do Solicitante (correção cadastral)
      'nome_solicitante',
      'telefone_solicitante',
      'endereco_solicitante',
      'bairro_solicitante',
      'complemento',
      'identificacao_adicional',
      'codigo_municipal',
      
      // Dados do Local (correção de endereço)
      'local_ocorrencia',
      'rodovia',
      'bairro_ocorrencia',
      'referencia',
      
      // Descrição (complementação de informações)
      'observacoes',
      
      // Dados Operacionais (correção de digitação)
      'codigo_operacional',
    ];
  }

  /**
   * CAMPOS QUE NUNCA PODEM SER ALTERADOS
   * Data/Hora do fato é HISTÓRICO e IMUTÁVEL
   * Número da ocorrência é identificador único
   */
  get CAMPOS_IMUTAVEIS() {
    return [
      'numero_ocorrencia',
      'numero_temporario',
      'criado_por',
      'criado_em',
      'data_hora_inicio',        // DATA DO FATO É IMUTÁVEL!
      'data_hora_encerramento',   // DATA DO FATO É IMUTÁVEL!
      'status',
      'numero_versao',
      'ocorrencia_original_id',
      'forma_solicitacao',        // Forma de solicitação é fixa
      'criado_em'                 // Data de criação do registro é imutável
    ];
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

      let dataHoraInicio = dados.data_hora_inicio;
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
        numero_versao: 1,
        esta_ativa: true,
        // Campos para retificação
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

      // ===== NOVA REGRA: Mostrar apenas ocorrências raiz (não retificações) =====
      // Isso impede que pedidos de retificação (pending_rectification, rectification_rejected)
      // apareçam na lista principal
      query = query.is("ocorrencia_original_id", null);
      // ===========================================================================

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

      // Buscar ocorrência para verificar permissões
      const { data: ocorrencia, error: buscaError } = await this.buscar(id);
      if (buscaError || !ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      // Verifica permissão: apenas o criador (se for rascunho) ou supervisor
      const podeEditar = authManager.podeEditar(ocorrencia);
      if (!podeEditar) {
        return { success: false, error: "Permissão negada para editar esta ocorrência" };
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

      // Verifica permissão
      const podeFinalizar = authManager.podeFinalizar(ocorrencia);
      if (!podeFinalizar) {
        return { success: false, error: "Permissão negada para finalizar esta ocorrência" };
      }

      // Apenas rascunhos podem ser finalizados
      if (ocorrencia.status !== 'draft') {
        return { success: false, error: "Apenas rascunhos podem ser finalizados" };
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

      return this.atualizar(id, {
        status: status,
        numero_ocorrencia: numeroOficial,
        data_hora_encerramento: new Date().toISOString(),
        esta_ativa: true,
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

      // Apenas supervisor pode cancelar
      if (!authManager.isSupervisor()) {
        return { success: false, error: "Permissão negada. Apenas supervisores podem cancelar ocorrências." };
      }

      if (ocorrencia.status === 'cancelled') {
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

      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: "cancelled",
          cancelado_por: user.id,
          cancelado_em: new Date().toISOString(),
          motivo_cancelamento: motivo,
          atualizado_em: new Date().toISOString(),
          esta_ativa: false,
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
  // RETIFICAÇÃO - CONFORME SISTEMAS OFICIAIS
  // ============================================

  /**
   * Solicita retificação de uma ocorrência finalizada
   * Apenas campos retificáveis podem ser alterados
   * Data/Hora do fato são IMUTÁVEIS (histórico)
   * NÃO COPIA o número da ocorrência original para evitar duplicidade
   * @param {string} id - ID da ocorrência original
   * @param {object} dados - Dados corrigidos (apenas campos retificáveis)
   * @param {string} justificativa - Motivo da retificação
   * @returns {Promise<Object>}
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
        return { success: false, error: "Permissão negada para solicitar retificação" };
      }

      if (!justificativa || justificativa.trim().length < 10) {
        return { success: false, error: "Justificativa deve ter pelo menos 10 caracteres" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Verificar se já existe um pedido de retificação pendente para esta ocorrência
      const { data: pendente, error: pendenteError } = await client
        .from("ocorrencias")
        .select("id")
        .eq("ocorrencia_original_id", id)
        .eq("status", "pending_rectification")
        .maybeSingle();

      if (pendenteError) throw pendenteError;

      if (pendente) {
        return { success: false, error: "Já existe um pedido de retificação pendente para esta ocorrência" };
      }

      // FILTRAR APENAS CAMPOS RETIFICÁVEIS
      const dadosFiltrados = {};
      const camposAlterados = [];
      
      for (const campo of this.CAMPOS_RETIFICAVEIS) {
        if (dados[campo] !== undefined && dados[campo] !== null) {
          const valorOriginal = original[campo] || '';
          const valorNovo = dados[campo] || '';
          
          if (String(valorOriginal).trim() !== String(valorNovo).trim()) {
            dadosFiltrados[campo] = dados[campo];
            camposAlterados.push({
              campo: campo,
              antes: valorOriginal,
              depois: valorNovo,
              label: this.getCampoLabel(campo)
            });
          }
        }
      }

      // Verifica se algum campo foi alterado
      if (Object.keys(dadosFiltrados).length === 0) {
        return { success: false, error: "Nenhum campo foi alterado para retificação" };
      }

      // ⚠️ GARANTE QUE DATA/HORA NÃO SEJAM ALTERADAS
      // Preserva as datas originais - NUNCA ALTERAR! (conforme sistemas oficiais)
      dadosFiltrados.data_hora_inicio = original.data_hora_inicio;
      dadosFiltrados.data_hora_encerramento = original.data_hora_encerramento;
      dadosFiltrados.forma_solicitacao = original.forma_solicitacao;

      const isSupervisor = authManager.isSupervisor();
      const statusFinal = isSupervisor ? "rectified" : "pending_rectification";

      // Preparar dados para a nova ocorrência (retificação)
      const dadosRetificados = {
        ...original,
        ...dadosFiltrados,
        id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
        ocorrencia_original_id: id,
        justificativa_retificacao: isSupervisor ? justificativa : null,
        retificado_em: isSupervisor ? new Date().toISOString() : null,
        retificado_por: isSupervisor ? user.id : null,
        solicitacao_retificacao_justificativa: isSupervisor ? null : justificativa,
        solicitada_em: isSupervisor ? null : new Date().toISOString(),
        solicitada_por: isSupervisor ? null : user.id,
        aprovada_em: isSupervisor ? new Date().toISOString() : null,
        aprovada_por: isSupervisor ? user.id : null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        status: statusFinal,
        esta_ativa: isSupervisor ? true : false,
        numero_versao: (original.numero_versao || 1) + 1,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        // ===== CORREÇÃO: NÃO COPIA O NÚMERO DA OCORRÊNCIA =====
        // Isso evita violação da constraint unique
        numero_ocorrencia: null, // ← Gera novo número na aprovação
        numero_temporario: `RET-${Date.now()}`,
        // =======================================================
        // CAMPOS IMUTÁVEIS - PRESERVADOS (conforme sistemas oficiais)
        criado_por: original.criado_por,
        criado_em: original.criado_em,
        data_hora_inicio: original.data_hora_inicio,     // ← PRESERVADO - IMUTÁVEL
        data_hora_encerramento: original.data_hora_encerramento, // ← PRESERVADO - IMUTÁVEL
        forma_solicitacao: original.forma_solicitacao,    // ← PRESERVADO - IMUTÁVEL
        // Salvar quais campos foram alterados (para exibir no histórico)
        campos_alterados: JSON.stringify(camposAlterados),
        versao_original: JSON.stringify(original)
      };

      // Remove campos que não devem ser inseridos
      delete dadosRetificados.id;

      // Se for supervisor, desativa a original imediatamente
      if (isSupervisor) {
        const { error: updateError } = await client
          .from("ocorrencias")
          .update({
            esta_ativa: false,
            atualizado_em: new Date().toISOString()
          })
          .eq("id", id);

        if (updateError) throw updateError;
      }

      // Insere a nova ocorrência
      const { data: novaOcorrencia, error: insertError } = await client
        .from("ocorrencias")
        .insert([dadosRetificados])
        .select()
        .single();

      if (insertError) throw insertError;

      // Copiar envolvidos da original para a retificação
      const envolvidosResult = await this.listarEnvolvidos(id);
      if (envolvidosResult.success && envolvidosResult.data.length > 0) {
        const novosEnvolvidos = envolvidosResult.data.map(env => ({
          ...env,
          id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
          ocorrencia_id: novaOcorrencia.id,
          criado_em: new Date().toISOString()
        }));
        
        novosEnvolvidos.forEach(env => delete env.id);
        
        const { error: envError } = await client
          .from("envolvidos")
          .insert(novosEnvolvidos);
        
        if (envError) {
          console.warn("Erro ao copiar envolvidos:", envError);
        }
      }

      // Copiar anexos da original para a retificação
      const anexosResult = await this.listarAnexos(id);
      if (anexosResult.success && anexosResult.data.length > 0) {
        const novosAnexos = anexosResult.data.map(anexo => ({
          ...anexo,
          id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
          ocorrencia_id: novaOcorrencia.id,
          criado_em: new Date().toISOString()
        }));
        
        novosAnexos.forEach(anexo => delete anexo.id);
        
        const { error: anexoError } = await client
          .from("anexos")
          .insert(novosAnexos);
        
        if (anexoError) {
          console.warn("Erro ao copiar anexos:", anexoError);
        }
      }

      console.log("✅ Retificação criada:", novaOcorrencia.id);
      return { 
        success: true, 
        data: novaOcorrencia, 
        original_id: id,
        status: statusFinal,
        is_pending: !isSupervisor,
        campos_alterados: camposAlterados
      };
    } catch (error) {
      console.error("❌ Erro ao criar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retorna o label amigável para um campo
   * @param {string} campo - Nome do campo
   * @returns {string} Label amigável
   */
  getCampoLabel(campo) {
    const labels = {
      'nome_solicitante': 'Nome do Solicitante',
      'telefone_solicitante': 'Telefone do Solicitante',
      'endereco_solicitante': 'Endereço do Solicitante',
      'bairro_solicitante': 'Bairro do Solicitante',
      'complemento': 'Complemento',
      'identificacao_adicional': 'Identificação Adicional',
      'codigo_municipal': 'Código Municipal',
      'local_ocorrencia': 'Local da Ocorrência',
      'rodovia': 'Rodovia',
      'bairro_ocorrencia': 'Bairro da Ocorrência',
      'referencia': 'Referência',
      'observacoes': 'Observações',
      'codigo_operacional': 'Código Operacional'
    };
    return labels[campo] || campo;
  }

  /**
   * Aprova uma retificação pendente (apenas supervisor)
   * ===== CORREÇÃO: Mantém o mesmo número da ocorrência original =====
   * Isso alinha com sistemas oficiais onde o número da ocorrência é único e permanente
   * @param {string} retificacaoId - ID da ocorrência de retificação pendente
   * @returns {Promise<Object>}
   */
  async aprovarRetificacao(retificacaoId) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return { success: false, error: "Permissão negada. Apenas supervisores podem aprovar retificações." };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar a retificação pendente
      const { data: retificacao, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacaoId)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status !== 'pending_rectification') {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      // Buscar a ocorrência original
      const { data: original, error: origError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacao.ocorrencia_original_id)
        .single();

      if (origError || !original) {
        return { success: false, error: "Ocorrência original não encontrada" };
      }

      // ===== CORREÇÃO: Manter o mesmo número da original =====
      const numeroOriginal = original.numero_ocorrencia;
      // ======================================================

      // Desativar a original e marcar como retificada
      const { error: updateOrigError } = await client
        .from("ocorrencias")
        .update({
          esta_ativa: false,
          status: 'rectified',  // ← Muda o status da original para "Retificada"
          atualizado_em: new Date().toISOString()
        })
        .eq("id", original.id);

      if (updateOrigError) throw updateOrigError;

      // Atualizar a retificação para aprovada com o MESMO número da original
      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: 'rectified',
          esta_ativa: true,
          numero_ocorrencia: numeroOriginal, // ← MANTÉM O MESMO NÚMERO!
          justificativa_retificacao: retificacao.solicitacao_retificacao_justificativa,
          retificado_em: new Date().toISOString(),
          retificado_por: user.id,
          aprovada_em: new Date().toISOString(),
          aprovada_por: user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", retificacaoId)
        .select()
        .single();

      if (error) throw error;

      console.log("✅ Retificação aprovada:", retificacaoId);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao aprovar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Rejeita uma retificação pendente (apenas supervisor)
   * @param {string} retificacaoId - ID da ocorrência de retificação pendente
   * @param {string} motivo - Motivo da rejeição
   * @returns {Promise<Object>}
   */
  async rejeitarRetificacao(retificacaoId, motivo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return { success: false, error: "Permissão negada. Apenas supervisores podem rejeitar retificações." };
      }

      if (!motivo || motivo.trim().length === 0) {
        return { success: false, error: "Motivo da rejeição é obrigatório" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar a retificação pendente
      const { data: retificacao, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", retificacaoId)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status !== 'pending_rectification') {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      // Atualizar a retificação para rejeitada
      const { data, error } = await client
        .from("ocorrencias")
        .update({
          status: 'rectification_rejected',
          esta_ativa: false,
          rejeitada_em: new Date().toISOString(),
          rejeitada_por: user.id,
          motivo_rejeicao: motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", retificacaoId)
        .select()
        .single();

      if (error) throw error;

      console.log("❌ Retificação rejeitada:", retificacaoId);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao rejeitar retificação:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca pedidos de retificação pendentes (para supervisor)
   * @returns {Promise<Object>}
   */
  async buscarRetificacoesPendentes() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return { success: false, error: "Permissão negada. Apenas supervisores podem ver pedidos pendentes." };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("ocorrencias")
        .select("*, usuarios(nome_completo)")
        .eq("status", "pending_rectification")
        .order("solicitada_em", { ascending: true });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("❌ Erro ao buscar retificações pendentes:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca histórico de retificações de uma ocorrência
   * @param {string} id - ID da ocorrência
   * @returns {Promise<Object>}
   */
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

      // Busca a ocorrência original
      const { data: original, error: originalError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", id)
        .single();

      if (originalError) throw originalError;

      // Busca todas as retificações vinculadas a esta ocorrência
      const { data: retificacoes, error: retError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("ocorrencia_original_id", id)
        .order("numero_versao", { ascending: true });

      if (retError) throw retError;

      // Monta o histórico completo
      const historico = [
        { ...original, is_original: true },
        ...retificacoes.map(r => ({ ...r, is_original: false }))
      ];

      return { success: true, data: historico };
    } catch (error) {
      console.error("❌ Erro ao buscar histórico:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca detalhes das alterações de uma retificação
   * @param {string} retificacaoId - ID da retificação
   * @returns {Promise<Object>}
   */
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

      // Parse dos campos alterados
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
          versao_atual: retificacao
        }
      };
    } catch (error) {
      console.error("❌ Erro ao buscar detalhes das alterações:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica se uma ocorrência tem retificações
   * @param {string} id - ID da ocorrência
   * @returns {Promise<boolean>}
   */
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

  /**
   * Busca a versão ativa de uma ocorrência
   * @param {string} id - ID da ocorrência original ou retificação
   * @returns {Promise<Object>}
   */
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

      // Busca a ocorrência
      const { data: ocorrencia, error: buscaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError) throw buscaError;

      // Se for uma retificação, busca a versão ativa
      if (ocorrencia.ocorrencia_original_id) {
        const { data: ativa, error: ativaError } = await client
          .from("ocorrencias")
          .select("*")
          .eq("ocorrencia_original_id", ocorrencia.ocorrencia_original_id)
          .eq("esta_ativa", true)
          .maybeSingle();

        if (ativaError && ativaError.code !== 'PGRST116') throw ativaError;

        if (!ativa) {
          if (ocorrencia.status === 'rectified' || ocorrencia.status === 'pending_rectification') {
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

      // Se for original, busca a versão ativa
      const { data: ativa, error: ativaError } = await client
        .from("ocorrencias")
        .select("*")
        .eq("ocorrencia_original_id", id)
        .eq("esta_ativa", true)
        .maybeSingle();

      if (ativaError && ativaError.code !== 'PGRST116') throw ativaError;

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

      const fileExt = arquivo.name.split(".").pop();
      const fileName = `${ocorrenciaId}/${Date.now()}-${arquivo.name}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, arquivo);

      if (uploadError) throw uploadError;

      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);

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

        if (anexo.arquivo) {
          const fileName = `${ocorrenciaId}/${Date.now()}-${anexo.nome}`;
          const { error: uploadError } = await client.storage
            .from("anexos")
            .upload(fileName, anexo.arquivo);

          if (uploadError) {
            console.error("Erro no upload do anexo:", uploadError);
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

      const { data, error } = await client
        .from("ocorrencias")
        .select("*");

      if (error) throw error;

      const hoje = new Date().toISOString().slice(0, 10);
      const stats = {
        total: data.length,
        hoje: data.filter((o) => o.criado_em.slice(0, 10) === hoje).length,
        draft: data.filter((o) => o.status === "draft").length,
        pending: data.filter((o) => o.status === "pending_sync").length,
        synced: data.filter((o) => o.status === "synced").length,
        cancelled: data.filter((o) => o.status === "cancelled").length,
        rectified: data.filter((o) => o.status === "rectified").length,
        pending_rectification: data.filter((o) => o.status === "pending_rectification").length,
        rectification_rejected: data.filter((o) => o.status === "rectification_rejected").length,
      };

      return { success: true, data: stats };
    } catch (error) {
      console.error("❌ Erro ao buscar estatísticas:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================

  gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

const ocorrenciaManager = new OcorrenciaManager();
window.ocorrenciaManager = ocorrenciaManager;
console.log("📦 Ocorrência Manager carregado");
