/**
 * MÓDULO RETIFICAÇÃO DE ABORDAGENS
 * Guarda Municipal de Pitangueiras - PR
 *
 * Gerencia o fluxo de retificação para abordagens de veículos e pessoas
 */

// ============================================
// CONSTANTES
// ============================================

const CAMPOS_RETIFICAVEIS_VEICULO = [
  "placa",
  "marca_modelo",
  "cor",
  "condutor_nome",
  "condutor_cpf",
  "local_abordagem",
  "motivo",
  "observacoes",
];

const CAMPOS_RETIFICAVEIS_PESSOA = [
  "nome",
  "alcunha",
  "cpf",
  "rg",
  "caracteristicas_fisicas",
  "vestimentas",
  "local_abordagem",
  "motivo",
  "observacoes",
];

// ============================================
// CLASSE RETIFICACAO_ABORDAGENS
// ============================================

class RetificacaoAbordagens {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("✅ Retificação de Abordagens inicializado");
  }

  // ============================================
  // CAMPOS RETIFICÁVEIS
  // ============================================

  getCamposRetificaveis(tipo) {
    return tipo === "veiculo"
      ? CAMPOS_RETIFICAVEIS_VEICULO
      : CAMPOS_RETIFICAVEIS_PESSOA;
  }

  getCampoLabel(tipo, campo) {
    const labels = {
      veiculo: {
        placa: "Placa",
        marca_modelo: "Marca/Modelo",
        cor: "Cor",
        condutor_nome: "Nome do Condutor",
        condutor_cpf: "CPF do Condutor",
        local_abordagem: "Local da Abordagem",
        motivo: "Motivo",
        observacoes: "Observações",
      },
      pessoa: {
        nome: "Nome",
        alcunha: "Alcunha",
        cpf: "CPF",
        rg: "RG",
        caracteristicas_fisicas: "Características Físicas",
        vestimentas: "Vestimentas",
        local_abordagem: "Local da Abordagem",
        motivo: "Motivo",
        observacoes: "Observações",
      },
    };
    return labels[tipo]?.[campo] || campo;
  }

  // ============================================
  // SOLICITAR RETIFICAÇÃO
  // ============================================

  async solicitarRetificacao(id, tipo, dados, justificativa) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";

      // Buscar a abordagem original
      const { data: original, error: buscaError } = await client
        .from(tabela)
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError || !original) {
        return { success: false, error: "Abordagem original não encontrada" };
      }

      // Verificar se já existe uma retificação pendente
      const { data: pendente, error: pendenteError } = await client
        .from(tabela)
        .select("id")
        .eq("abordagem_original_id", id)
        .eq("status_retificacao", "pending_rectification")
        .maybeSingle();

      if (pendente) {
        return {
          success: false,
          error:
            "Já existe um pedido de retificação pendente para esta abordagem",
        };
      }

      // Verificar se o usuário tem permissão
      const isSupervisor = authManager.isSupervisor();
      if (!isSupervisor && original.criado_por !== user.id) {
        return {
          success: false,
          error:
            "Apenas o criador da abordagem ou um supervisor pode solicitar retificação",
        };
      }

      // Filtrar apenas campos alterados
      const camposAlterados = [];
      const dadosFiltrados = {};
      const camposRetificaveis = this.getCamposRetificaveis(tipo);

      for (const campo of camposRetificaveis) {
        if (dados[campo] !== undefined && dados[campo] !== null) {
          const valorOriginal = original[campo] || "";
          const valorNovo = dados[campo] || "";

          if (String(valorOriginal).trim() !== String(valorNovo).trim()) {
            dadosFiltrados[campo] = dados[campo];
            camposAlterados.push({
              campo: campo,
              antes: valorOriginal,
              depois: valorNovo,
              label: this.getCampoLabel(tipo, campo),
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

      // Preparar dados da retificação
      const statusFinal = isSupervisor ? "rectified" : "pending_rectification";
      const estaAtiva = isSupervisor ? true : false;

      const dadosRetificados = {
        ...original,
        ...dadosFiltrados,
        id: crypto.randomUUID ? crypto.randomUUID() : this.gerarUUID(),
        abordagem_original_id: id,
        justificativa_retificacao: isSupervisor ? justificativa : null,
        retificado_em: isSupervisor ? new Date().toISOString() : null,
        retificado_por: isSupervisor ? user.id : null,
        solicitacao_retificacao_justificativa: isSupervisor
          ? null
          : justificativa,
        solicitada_em: isSupervisor ? null : new Date().toISOString(),
        solicitada_por: isSupervisor ? null : user.id,
        aprovada_em: isSupervisor ? new Date().toISOString() : null,
        aprovada_por: isSupervisor ? user.id : null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        status_retificacao: statusFinal,
        esta_ativa: estaAtiva,
        numero_versao: (original.numero_versao || 1) + 1,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        criado_por: original.criado_por,
        campos_alterados: JSON.stringify(camposAlterados),
        versao_original: JSON.stringify(original),
      };

      delete dadosRetificados.id;

      // Se for supervisor, desativa a versão original
      if (isSupervisor) {
        const { error: updateError } = await client
          .from(tabela)
          .update({
            esta_ativa: false,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) throw updateError;
      }

      // Inserir a retificação
      const { data: novaAbordagem, error: insertError } = await client
        .from(tabela)
        .insert([dadosRetificados])
        .select()
        .single();

      if (insertError) throw insertError;

      console.log(`✅ Retificação de ${tipo} criada:`, novaAbordagem.id);

      // Registrar log
      await this.registrarLogPericial(
        "SOLICITAR_RETIFICACAO_ABORDAGEM",
        tabela,
        novaAbordagem.id,
        original,
        novaAbordagem,
      );

      // Notificar supervisor (se não for supervisor)
      if (!isSupervisor) {
        await this.notificarSupervisores(novaAbordagem, tipo);
      }

      return {
        success: true,
        data: novaAbordagem,
        original_id: id,
        status: statusFinal,
        is_pending: !isSupervisor,
        campos_alterados: camposAlterados,
      };
    } catch (error) {
      console.error("❌ Erro ao criar retificação de abordagem:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // APROVAR RETIFICAÇÃO
  // ============================================

  async aprovarRetificacao(id, tipo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error: "Apenas supervisores podem aprovar retificações",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";

      // Buscar a retificação
      const { data: retificacao, error: buscaError } = await client
        .from(tabela)
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status_retificacao !== "pending_rectification") {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      // Buscar a abordagem original
      const { data: original, error: origError } = await client
        .from(tabela)
        .select("*")
        .eq("id", retificacao.abordagem_original_id)
        .single();

      if (origError || !original) {
        return { success: false, error: "Abordagem original não encontrada" };
      }

      // Desativar a versão original
      const { error: updateOrigError } = await client
        .from(tabela)
        .update({
          esta_ativa: false,
          status_retificacao: "rectified",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", original.id);

      if (updateOrigError) throw updateOrigError;

      // Ativar a retificação
      const { data, error } = await client
        .from(tabela)
        .update({
          status_retificacao: "rectified",
          esta_ativa: true,
          justificativa_retificacao:
            retificacao.solicitacao_retificacao_justificativa,
          retificado_em: new Date().toISOString(),
          retificado_por: user.id,
          aprovada_em: new Date().toISOString(),
          aprovada_por: user.id,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", retificacao.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Retificação de ${tipo} aprovada:`, id);

      await this.registrarLogPericial(
        "APROVAR_RETIFICACAO_ABORDAGEM",
        tabela,
        id,
        retificacao,
        data,
      );

      // Notificar o solicitante
      await this.notificarSolicitante(data, tipo, "aprovada");

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao aprovar retificação de abordagem:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // REJEITAR RETIFICAÇÃO
  // ============================================

  async rejeitarRetificacao(id, tipo, motivo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error: "Apenas supervisores podem rejeitar retificações",
        };
      }

      if (!motivo || motivo.trim().length === 0) {
        return { success: false, error: "Motivo da rejeição é obrigatório" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";

      // Buscar a retificação
      const { data: retificacao, error: buscaError } = await client
        .from(tabela)
        .select("*")
        .eq("id", id)
        .single();

      if (buscaError || !retificacao) {
        return { success: false, error: "Retificação não encontrada" };
      }

      if (retificacao.status_retificacao !== "pending_rectification") {
        return { success: false, error: "Esta retificação não está pendente" };
      }

      const dadosAnteriores = { ...retificacao };

      // Atualizar status para rejeitada
      const { data, error } = await client
        .from(tabela)
        .update({
          status_retificacao: "rectification_rejected",
          esta_ativa: false,
          rejeitada_em: new Date().toISOString(),
          rejeitada_por: user.id,
          motivo_rejeicao: motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      console.log(`❌ Retificação de ${tipo} rejeitada:`, id);

      await this.registrarLogPericial(
        "REJEITAR_RETIFICACAO_ABORDAGEM",
        tabela,
        id,
        dadosAnteriores,
        data,
      );

      // Notificar o solicitante
      await this.notificarSolicitante(data, tipo, "rejeitada", motivo);

      return { success: true, data };
    } catch (error) {
      console.error("❌ Erro ao rejeitar retificação de abordagem:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // BUSCAR RETIFICAÇÕES PENDENTES
  // ============================================

  async buscarRetificacoesPendentes() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      if (!authManager.isSupervisor()) {
        return {
          success: false,
          error: "Apenas supervisores podem ver pedidos pendentes",
        };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      // Buscar retificações pendentes de veículos
      const { data: veiculos, error: veicError } = await client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .eq("status_retificacao", "pending_rectification")
        .order("solicitada_em", { ascending: true });

      if (veicError) throw veicError;

      // Buscar retificações pendentes de pessoas
      const { data: pessoas, error: pesError } = await client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .eq("status_retificacao", "pending_rectification")
        .order("solicitada_em", { ascending: true });

      if (pesError) throw pesError;

      // Adicionar tipo a cada registro
      const veiculosComTipo = (veiculos || []).map((v) => ({
        ...v,
        tipo_abordagem: "veiculo",
      }));
      const pessoasComTipo = (pessoas || []).map((p) => ({
        ...p,
        tipo_abordagem: "pessoa",
      }));

      return {
        success: true,
        data: [...veiculosComTipo, ...pessoasComTipo],
      };
    } catch (error) {
      console.error("❌ Erro ao buscar retificações pendentes:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // BUSCAR HISTÓRICO DA ABORDAGEM
  // ============================================

  async buscarHistorico(id, tipo) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";

      // Buscar a abordagem original
      const { data: original, error: originalError } = await client
        .from(tabela)
        .select("*")
        .eq("id", id)
        .single();

      if (originalError) throw originalError;

      // Buscar todas as retificações
      const { data: retificacoes, error: retError } = await client
        .from(tabela)
        .select("*")
        .eq("abordagem_original_id", id)
        .order("numero_versao", { ascending: true });

      if (retError) throw retError;

      const historico = [
        { ...original, is_original: true },
        ...(retificacoes || []).map((r) => ({ ...r, is_original: false })),
      ];

      return { success: true, data: historico };
    } catch (error) {
      console.error("❌ Erro ao buscar histórico:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // NOTIFICAÇÕES
  // ============================================

  async notificarSupervisores(abordagem, tipo) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return;

      // Buscar todos os supervisores
      const { data: supervisores, error } = await client
        .from("usuarios")
        .select("id")
        .eq("perfil", "supervisor")
        .eq("status", "ativo");

      if (error) throw error;
      if (!supervisores || supervisores.length === 0) return;

      const identificador =
        tipo === "veiculo" ? abordagem.placa : abordagem.nome;

      const notificacoes = supervisores.map((s) => ({
        usuario_id: s.id,
        titulo: `📋 Retificação de Abordagem Pendente`,
        mensagem: `${identificador} solicitou retificação de ${tipo === "veiculo" ? "veículo" : "pessoa"}. Aguarda sua análise.`,
        tipo: "retificacao_pendente",
        link: "#retificacoes-abordagens",
        criado_em: new Date().toISOString(),
      }));

      // Inserir em lote
      const batchSize = 50;
      for (let i = 0; i < notificacoes.length; i += batchSize) {
        const batch = notificacoes.slice(i, i + batchSize);
        await client.from("notificacoes").insert(batch);
      }

      console.log(
        `✅ ${notificacoes.length} notificações enviadas para supervisores`,
      );
    } catch (error) {
      console.error("Erro ao notificar supervisores:", error);
    }
  }

  async notificarSolicitante(abordagem, tipo, status, motivo = null) {
    try {
      const client = supabaseClient.getClient();
      if (!client) return;

      const solicitanteId = abordagem.solicitada_por;
      if (!solicitanteId) return;

      const identificador =
        tipo === "veiculo" ? abordagem.placa : abordagem.nome;

      let titulo = "";
      let mensagem = "";

      if (status === "aprovada") {
        titulo = `✅ Retificação Aprovada`;
        mensagem = `Sua retificação de abordagem (${identificador}) foi aprovada pelo supervisor.`;
      } else if (status === "rejeitada") {
        titulo = `❌ Retificação Rejeitada`;
        mensagem = `Sua retificação de abordagem (${identificador}) foi rejeitada. Motivo: ${motivo}`;
      }

      await client.from("notificacoes").insert({
        usuario_id: solicitanteId,
        titulo: titulo,
        mensagem: mensagem,
        tipo:
          status === "aprovada"
            ? "retificacao_aprovada"
            : "retificacao_rejeitada",
        link: "#consulta",
        criado_em: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro ao notificar solicitante:", error);
    }
  }

  // ============================================
  // LOG PERICIAL
  // ============================================

  async registrarLogPericial(acao, tabela, registroId, dadosAnt, dadosNov) {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      let ip = null;
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        ip = data.ip;
      } catch (e) {}

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
        criado_em: new Date().toISOString(),
      };

      await client.from("logs_periciais").insert([logData]);
    } catch (error) {
      console.warn("Erro ao registrar log pericial:", error);
    }
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
// INSTÂNCIA GLOBAL
// ============================================

const retificacaoAbordagens = new RetificacaoAbordagens();
window.retificacaoAbordagens = retificacaoAbordagens;

console.log("📋 Retificação de Abordagens carregado");
