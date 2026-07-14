/**
 * MÓDULO RETIFICAÇÕES - Gerenciamento de Retificações Pendentes
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de retificações pendentes (apenas supervisor)
 * - Visualização detalhada de cada solicitação
 * - Aprovação de retificações
 * - Rejeição de retificações com motivo
 * - Histórico de alterações
 * - Badge de notificação
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient, ocorrenciaManager)

// ============================================
// CONSTANTES
// ============================================

const TIPOS_OCORRENCIA = [
  { value: "furto", label: "Furto" },
  { value: "roubo", label: "Roubo" },
  { value: "vandalismo", label: "Vandalismo" },
  { value: "dano_ao_patrimonio", label: "Dano ao Patrimônio" },
  { value: "ameaca", label: "Ameaça" },
  { value: "lesao_corporal", label: "Lesão Corporal" },
  { value: "perturbacao", label: "Perturbação" },
  { value: "acidente", label: "Acidente" },
  { value: "incendio", label: "Incêndio" },
  { value: "desaparecimento", label: "Desaparecimento" },
  { value: "atendimento_social", label: "Atendimento Social" },
  { value: "outro", label: "Outro" },
];

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  retificacoes: [],
  carregando: false,
  total: 0,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página de retificações pendentes
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderRetificacoes(container, appInstance) {
  // Verificar permissão (apenas supervisor)
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando retificações...</p>
    </div>
  `;

  try {
    // Carregar retificações
    await carregarRetificacoes();

    // Renderizar
    renderizarLista(container, appInstance);

    // Registrar funções globais
    window._retificacoesAprovar = (id) =>
      aprovarRetificacao(id, container, appInstance);
    window._retificacoesRejeitar = (id) =>
      rejeitarRetificacao(id, container, appInstance);
    window._retificacoesVerDetalhes = (id) =>
      verDetalhesRetificacao(id, appInstance);
    window._retificacoesRecarregar = () =>
      renderRetificacoes(container, appInstance);
  } catch (error) {
    console.error("❌ Erro ao renderizar retificações:", error);
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar retificações</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="window._retificacoesRecarregar()" class="btn-primary" style="margin-top:16px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// CARREGAR RETIFICAÇÕES
// ============================================

async function carregarRetificacoes() {
  estado.carregando = true;

  try {
    const result = await ocorrenciaManager.buscarRetificacoesPendentes();

    if (result.success) {
      estado.retificacoes = result.data || [];
      estado.total = estado.retificacoes.length;
    } else {
      estado.retificacoes = [];
      estado.total = 0;
      console.warn("Erro ao carregar retificações:", result.error);
    }
  } catch (error) {
    console.error("Erro ao carregar retificações:", error);
    estado.retificacoes = [];
    estado.total = 0;
  }

  estado.carregando = false;
}

// ============================================
// RENDERIZAÇÃO
// ============================================

function renderizarLista(container, appInstance) {
  const retificacoes = estado.retificacoes;
  const total = estado.total;

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <!-- Cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;">
            <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
            Solicitações de Retificação Pendentes
          </h2>
          <p style="color:var(--cinza-medio);margin-top:4px;font-size:14px;">
            ${total} solicitação(ões) aguardando sua análise
          </p>
        </div>
        <button onclick="window._retificacoesRecarregar()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-sync-alt"></i> Atualizar
        </button>
      </div>

      <!-- Lista de retificações -->
      <div id="listaRetificacoes">
  `;

  if (estado.carregando) {
    html += `
      <div style="text-align:center;padding:20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:8px;color:var(--cinza-medio);">Carregando...</p>
      </div>
    `;
  } else if (retificacoes.length === 0) {
    html += `
      <div style="text-align:center;padding:60px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:64px;color:var(--verde-bandeira);margin-bottom:16px;">
          <i class="fas fa-check-circle"></i>
        </div>
        <h3 style="color:var(--cinza-escuro);">Tudo em ordem!</h3>
        <p style="color:var(--cinza-medio);font-size:14px;">
          Não há solicitações de retificação pendentes no momento.
        </p>
        <p style="color:var(--cinza-medio);font-size:13px;margin-top:4px;">
          Todas as retificações foram analisadas.
        </p>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
          <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar ao início
        </button>
      </div>
    `;
  } else {
    // Ordenar por data (mais antiga primeiro)
    const sorted = [...retificacoes].sort((a, b) => {
      const dateA = a.solicitada_em || a.criado_em || "";
      const dateB = b.solicitada_em || b.criado_em || "";
      return dateA.localeCompare(dateB);
    });

    sorted.forEach((ret) => {
      html += renderRetificacaoItem(ret, appInstance);
    });
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RENDERIZAÇÃO DE ITEM
// ============================================

function renderRetificacaoItem(ret, appInstance) {
  const dataSolicitacao = ret.solicitada_em
    ? formatarDataHoraLocal(ret.solicitada_em)
    : ret.criado_em
      ? formatarDataHoraLocal(ret.criado_em)
      : "Data desconhecida";

  const numeroOriginal =
    ret.numero_ocorrencia || ret.numero_temporario || "Sem número";
  const tipoLabel = getTipoLabel(ret.tipo_ocorrencia);
  const tipoBadge = ret.tipo_ocorrencia
    ? `<span class="badge badge-tipo badge-tipo-${ret.tipo_ocorrencia}" style="font-size:10px;">${tipoLabel}</span>`
    : "";

  // Verificar se tem campos alterados
  let camposAlterados = [];
  if (ret.campos_alterados) {
    try {
      camposAlterados = JSON.parse(ret.campos_alterados);
    } catch (e) {
      console.warn("Erro ao parsear campos alterados:", e);
    }
  }

  // Buscar nome do solicitante
  let nomeSolicitante = "Desconhecido";
  if (ret.solicitada_por) {
    // Tentar buscar do cache ou fazer uma consulta
    nomeSolicitante = ret.solicitante_nome || "Guarda Municipal";
  }

  // Buscar nome do criador original
  let nomeCriador = "Desconhecido";
  if (ret.criado_por) {
    nomeCriador = ret.criador?.nome_completo || "Desconhecido";
  }

  // Contar campos alterados
  const totalCampos = camposAlterados.length;

  return `
    <div class="card-revisao" style="margin-bottom:16px;border-left:4px solid var(--aviso);position:relative;">
      ${ret.prioridade ? `<div style="position:absolute;top:-8px;right:12px;background:var(--erro);color:white;padding:2px 12px;border-radius:12px;font-size:9px;font-weight:700;text-transform:uppercase;">Urgente</div>` : ""}
      
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-size:15px;color:var(--azul-bandeira);">
            <i class="fas fa-file-alt"></i> #${numeroOriginal} ${tipoBadge}
          </strong>
          <span style="font-size:13px;color:var(--cinza-medio);margin-left:8px;">
            <i class="fas fa-calendar"></i> ${dataSolicitacao}
          </span>
        </div>
        <span class="badge badge-pending" style="font-size:12px;padding:4px 14px;">
          ⏳ Pendente
        </span>
      </div>

      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:13px;">
        <div>
          <span style="color:var(--cinza-medio);">Solicitante:</span>
          <strong>${nomeSolicitante}</strong>
        </div>
        <div>
          <span style="color:var(--cinza-medio);">Criador original:</span>
          <strong>${nomeCriador}</strong>
        </div>
        <div style="grid-column: span 2;">
          <span style="color:var(--cinza-medio);">Local:</span>
          <strong>${ret.local_ocorrencia || "Não informado"}</strong>
        </div>
      </div>

      <div style="margin-top:8px;padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);font-size:13px;color:#92400e;border-left:3px solid var(--aviso);">
        <i class="fas fa-quote-left" style="color:var(--aviso);margin-right:4px;"></i>
        <strong>Justificativa da retificação:</strong>
        <span>${ret.solicitacao_retificacao_justificativa || "Não informada"}</span>
      </div>

      ${
        totalCampos > 0
          ? `
        <div style="margin-top:8px;">
          <details style="cursor:pointer;">
            <summary style="font-size:13px;font-weight:600;color:var(--azul-bandeira);">
              <i class="fas fa-edit"></i> 
              ${totalCampos} campo(s) alterado(s) 
              <span style="font-size:11px;color:var(--cinza-medio);font-weight:400;">(clique para expandir)</span>
            </summary>
            <div style="margin-top:6px;padding:8px;background:var(--branco-fumaca);border-radius:var(--border-radius);">
              ${camposAlterados
                .map(
                  (campo) => `
                <div style="display:grid;grid-template-columns:1fr 2fr;gap:4px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
                  <div style="font-weight:600;color:var(--cinza-escuro);">
                    ${campo.label || campo.campo}:
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span style="color:var(--cinza-medio);text-decoration:line-through;font-size:12px;">
                      ${campo.antes || "(vazio)"}
                    </span>
                    <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:10px;"></i>
                    <span style="color:var(--verde-bandeira);font-weight:500;">
                      ${campo.depois || "(vazio)"}
                    </span>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </details>
        </div>
      `
          : ""
      }

      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--cinza-claro);padding-top:12px;">
        <button class="btn-success" onclick="window._retificacoesAprovar('${ret.id}')" 
          style="padding:8px 20px;font-size:13px;min-height:auto;width:auto;border-radius:8px;flex:1;">
          <i class="fas fa-check"></i> Aprovar
        </button>
        <button class="btn-danger" onclick="window._retificacoesRejeitar('${ret.id}')" 
          style="padding:8px 20px;font-size:13px;min-height:auto;width:auto;border-radius:8px;flex:1;">
          <i class="fas fa-times"></i> Rejeitar
        </button>
        <button class="btn-secondary" onclick="window._retificacoesVerDetalhes('${ret.id}')" 
          style="padding:8px 16px;font-size:13px;min-height:auto;width:auto;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
          <i class="fas fa-eye"></i> Ver completa
        </button>
      </div>
    </div>
  `;
}

// ============================================
// AÇÕES - APROVAR
// ============================================

export async function aprovarRetificacao(id, container, appInstance) {
  try {
    // Buscar dados da retificação para mostrar confirmação
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Retificação não encontrada", "error");
      return;
    }

    const ret = result.data;
    const numero =
      ret.numero_ocorrencia || ret.numero_temporario || "Sem número";

    const confirmado = await appInstance.confirmar(
      `Confirma a aprovação da retificação #${numero}?\n\nA versão original será substituída pela versão corrigida.`,
      "Aprovar Retificação",
    );

    if (!confirmado) return;

    const aprovarResult = await ocorrenciaManager.aprovarRetificacao(id);

    if (aprovarResult.success) {
      appInstance.showToast("Retificação aprovada com sucesso!", "success");
      await authManager.logAprovarRetificacao(authManager.getUserId(), id);

      // Recarregar lista
      await carregarRetificacoes();
      renderizarLista(container, appInstance);

      // Atualizar badge
      if (typeof ui !== "undefined" && ui.atualizarBadgeRetificacoes) {
        await ui.atualizarBadgeRetificacoes();
      }
    } else {
      appInstance.showToast(
        "Erro ao aprovar retificação: " + aprovarResult.error,
        "error",
      );
    }
  } catch (error) {
    console.error("Erro ao aprovar retificação:", error);
    appInstance.showToast("Erro ao aprovar retificação", "error");
  }
}

// ============================================
// AÇÕES - REJEITAR
// ============================================

export async function rejeitarRetificacao(id, container, appInstance) {
  try {
    // Buscar dados da retificação
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Retificação não encontrada", "error");
      return;
    }

    const ret = result.data;
    const numero =
      ret.numero_ocorrencia || ret.numero_temporario || "Sem número";

    // Solicitar motivo
    const motivo = await appInstance.inputModal(
      `Informe o motivo da rejeição da retificação #${numero}:`,
      "Rejeitar Retificação",
      "Digite o motivo da rejeição...",
    );

    if (!motivo) {
      appInstance.showToast("Operação cancelada", "info");
      return;
    }

    const confirmado = await appInstance.confirmar(
      `Confirma a rejeição da retificação #${numero}?\n\nMotivo: ${motivo}`,
      "Rejeitar Retificação",
    );

    if (!confirmado) return;

    const rejeitarResult = await ocorrenciaManager.rejeitarRetificacao(
      id,
      motivo,
    );

    if (rejeitarResult.success) {
      appInstance.showToast("Retificação rejeitada", "info");
      await authManager.logRejeitarRetificacao(authManager.getUserId(), id);

      // Recarregar lista
      await carregarRetificacoes();
      renderizarLista(container, appInstance);

      // Atualizar badge
      if (typeof ui !== "undefined" && ui.atualizarBadgeRetificacoes) {
        await ui.atualizarBadgeRetificacoes();
      }
    } else {
      appInstance.showToast(
        "Erro ao rejeitar retificação: " + rejeitarResult.error,
        "error",
      );
    }
  } catch (error) {
    console.error("Erro ao rejeitar retificação:", error);
    appInstance.showToast("Erro ao rejeitar retificação", "error");
  }
}

// ============================================
// AÇÕES - VER DETALHES
// ============================================

export async function verDetalhesRetificacao(id, appInstance) {
  try {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Retificação não encontrada", "error");
      return;
    }

    const ret = result.data;

    // Buscar a ocorrência original
    let original = null;
    if (ret.ocorrencia_original_id) {
      const origResult = await ocorrenciaManager.buscar(
        ret.ocorrencia_original_id,
      );
      if (origResult.success) {
        original = origResult.data;
      }
    }

    // Buscar envolvidos
    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    // Buscar anexos
    const anexosResult = await ocorrenciaManager.listarAnexos(id);
    const anexos = anexosResult.success ? anexosResult.data : [];

    // Parsear campos alterados
    let camposAlterados = [];
    if (ret.campos_alterados) {
      try {
        camposAlterados = JSON.parse(ret.campos_alterados);
      } catch (e) {}
    }

    // Criar modal
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      animation: fadeIn 0.25s ease;
    `;

    const numero =
      ret.numero_ocorrencia || ret.numero_temporario || "Sem número";
    const dataSolicitacao = ret.solicitada_em
      ? formatarDataHoraLocal(ret.solicitada_em)
      : ret.criado_em
        ? formatarDataHoraLocal(ret.criado_em)
        : "Data desconhecida";

    const tipoLabel = getTipoLabel(ret.tipo_ocorrencia);

    let html = `
      <div class="modal" style="max-width:650px;width:100%;max-height:95vh;overflow-y:auto;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
            Detalhes da Retificação
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:70vh;overflow-y:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
              <h3 style="margin:0;color:var(--azul-bandeira);font-size:16px;">
                #${numero} - ${tipoLabel}
              </h3>
              <p style="margin:4px 0 0 0;font-size:12px;color:var(--cinza-medio);">
                <i class="fas fa-calendar"></i> Solicitado em: ${dataSolicitacao}
              </p>
            </div>
            <span class="badge badge-pending" style="font-size:12px;">⏳ Pendente</span>
          </div>

          ${
            ret.solicitacao_retificacao_justificativa
              ? `
            <div style="padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);font-size:13px;color:#92400e;border-left:3px solid var(--aviso);margin-bottom:12px;">
              <i class="fas fa-quote-left" style="color:var(--aviso);margin-right:4px;"></i>
              <strong>Justificativa:</strong>
              <span>${ret.solicitacao_retificacao_justificativa}</span>
            </div>
          `
              : ""
          }

          ${
            original
              ? `
            <div style="background:var(--verde-muito-claro);padding:10px 12px;border-radius:var(--border-radius);margin-bottom:12px;border-left:4px solid var(--verde-bandeira);">
              <p style="font-size:13px;font-weight:600;margin:0 0 4px 0;color:var(--verde-escuro);">
                <i class="fas fa-code-branch"></i> Ocorrência Original
              </p>
              <p style="font-size:13px;margin:0;color:var(--cinza-escuro);">
                #${original.numero_ocorrencia || original.numero_temporario || "Sem número"}
                <span style="color:var(--cinza-medio);font-size:12px;margin-left:8px;">
                  ${formatarDataHoraLocal(original.criado_em)}
                </span>
              </p>
              <p style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
                Local: ${original.local_ocorrencia || "Não informado"}
              </p>
            </div>
          `
              : ""
          }

          ${
            camposAlterados.length > 0
              ? `
            <div style="margin-bottom:12px;">
              <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
                <i class="fas fa-edit"></i> Campos Alterados (${camposAlterados.length})
              </h4>
              <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                ${camposAlterados
                  .map(
                    (campo) => `
                  <div style="display:grid;grid-template-columns:1fr 2fr;gap:4px;padding:6px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
                    <div style="font-weight:600;color:var(--cinza-escuro);">
                      ${campo.label || campo.campo}:
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                      <span style="color:var(--cinza-medio);text-decoration:line-through;font-size:12px;">
                        ${campo.antes || "(vazio)"}
                      </span>
                      <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:10px;"></i>
                      <span style="color:var(--verde-bandeira);font-weight:500;">
                        ${campo.depois || "(vazio)"}
                      </span>
                    </div>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `
              : ""
          }

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;background:var(--branco);padding:8px 12px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);margin-bottom:12px;">
            <div>
              <span style="color:var(--cinza-medio);">Local:</span>
              <strong>${ret.local_ocorrencia || "Não informado"}</strong>
            </div>
            <div>
              <span style="color:var(--cinza-medio);">Data/Hora Início:</span>
              <strong>${ret.data_hora_inicio ? formatarDataHoraLocal(ret.data_hora_inicio) : "Não informado"}</strong>
            </div>
            <div style="grid-column: span 2;">
              <span style="color:var(--cinza-medio);">Observações:</span>
              <div style="font-size:12px;color:var(--cinza-escuro);margin-top:2px;white-space:pre-wrap;">
                ${ret.observacoes || "Nenhuma observação"}
              </div>
            </div>
          </div>

          ${
            envolvidos.length > 0
              ? `
            <div style="font-size:13px;background:var(--branco);padding:8px 12px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 6px 0;color:var(--azul-bandeira);">
                <i class="fas fa-users"></i> Envolvidos (${envolvidos.length})
              </p>
              ${envolvidos
                .map(
                  (env) => `
                <div style="padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
                  <span class="badge badge-azul" style="font-size:9px;">${getTipoEnvolvidoLabel(env.tipo)}</span>
                  <strong>${env.nome_completo}</strong>
                  ${env.cpf ? ` - ${env.cpf}` : ""}
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }

          ${
            anexos.length > 0
              ? `
            <div style="font-size:13px;background:var(--branco);padding:8px 12px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 6px 0;color:var(--azul-bandeira);">
                <i class="fas fa-paperclip"></i> Anexos (${anexos.length})
              </p>
              ${anexos
                .map(
                  (anexo) => `
                <div style="padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;display:flex;align-items:center;gap:8px;">
                  <i class="fas ${getIconAnexo(anexo.tipo_arquivo)}" style="color:var(--azul-bandeira);"></i>
                  <span>${anexo.nome_arquivo}</span>
                  ${anexo.url ? `<a href="${anexo.url}" target="_blank" style="color:var(--azul-bandeira);font-size:12px;"><i class="fas fa-external-link-alt"></i></a>` : ""}
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
          <div style="display:flex;gap:8px;">
            <button onclick="window._retificacoesAprovar('${ret.id}')" class="btn-success" style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;">
              <i class="fas fa-check" style="margin-right:6px;"></i> Aprovar
            </button>
            <button onclick="window._retificacoesRejeitar('${ret.id}')" class="btn-danger" style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;">
              <i class="fas fa-times" style="margin-right:6px;"></i> Rejeitar
            </button>
          </div>
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
            style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Fechar
          </button>
        </div>
      </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Registrar funções de aprovação/rejeição dentro do modal
    // As funções globais já estão registradas
  } catch (error) {
    console.error("Erro ao ver detalhes da retificação:", error);
    appInstance.showToast("Erro ao carregar detalhes", "error");
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function renderAcessoNegado(appInstance) {
  return `
    <div class="container">
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-lock"></i>
        </div>
        <p style="font-weight:500;">Acesso restrito a supervisores</p>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
          Voltar
        </button>
      </div>
    </div>
  `;
}

function getStatusClass(status) {
  const map = {
    draft: "draft",
    pending_sync: "pending",
    synced: "synced",
    cancelled: "cancelled",
    rectified: "rectified",
    pending_rectification: "pending_rectification",
    rectification_rejected: "rectification_rejected",
    sync_error: "error",
  };
  return map[status] || "draft";
}

function getStatusLabel(status) {
  const map = {
    draft: "Rascunho",
    pending_sync: "Pendente",
    syncing: "Sincronizando",
    synced: "Finalizada",
    cancelled: "Cancelada",
    rectified: "Retificada",
    pending_rectification: "Retificação Pendente",
    rectification_rejected: "Retificação Rejeitada",
    sync_error: "Erro",
  };
  return map[status] || status;
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

function getTipoEnvolvidoLabel(tipo) {
  const tipos = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
    outro: "Outro",
  };
  return tipos[tipo] || tipo;
}

function getIconAnexo(tipo) {
  const icons = {
    image: "fa-image",
    video: "fa-video",
    document: "fa-file-pdf",
    audio: "fa-music",
  };
  return icons[tipo] || "fa-file";
}

function formatarDataHoraLocal(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderRetificacoes,
  aprovarRetificacao,
  rejeitarRetificacao,
  verDetalhesRetificacao,
  carregarRetificacoes,
};
