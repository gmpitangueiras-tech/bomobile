/**
 * MÓDULO LOGS - Visualização de Logs do Sistema
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de logs de acesso
 * - Filtros por usuário, ação e período
 * - Estatísticas de logs
 * - Visualização detalhada de logs
 * - Exportação de logs
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient)
// e funções dos módulos utils e ui

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtros: {
    usuario_id: "",
    acao: "",
    data_inicio: "",
    data_fim: "",
    limit: 200,
  },
  logsCache: [],
  usuariosCache: [],
  statsCache: null,
};

// ============================================
// CONSTANTES
// ============================================

const TIPOS_ACAO = [
  { value: "", label: "Todas" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "primeiro_acesso", label: "Primeiro Acesso" },
  { value: "criar_ocorrencia", label: "Criar Ocorrência" },
  { value: "finalizar_ocorrencia", label: "Finalizar Ocorrência" },
  { value: "cancelar_ocorrencia", label: "Cancelar Ocorrência" },
  { value: "solicitar_retificacao", label: "Solicitar Retificação" },
  { value: "aprovar_retificacao", label: "Aprovar Retificação" },
  { value: "rejeitar_retificacao", label: "Rejeitar Retificação" },
  { value: "criar_usuario", label: "Criar Usuário" },
  { value: "editar_usuario", label: "Editar Usuário" },
  { value: "resetar_senha", label: "Resetar Senha" },
  { value: "ativar_desativar_usuario", label: "Ativar/Desativar Usuário" },
];

const BADGE_CLASSES = {
  login: "badge-synced",
  logout: "badge-draft",
  primeiro_acesso: "badge-pending",
  criar_ocorrencia: "badge-azul",
  finalizar_ocorrencia: "badge-verde",
  cancelar_ocorrencia: "badge-cancelled",
  solicitar_retificacao: "badge-pending",
  aprovar_retificacao: "badge-synced",
  rejeitar_retificacao: "badge-cancelled",
  criar_usuario: "badge-azul",
  editar_usuario: "badge-azul",
  resetar_senha: "badge-pending",
  ativar_desativar_usuario: "badge-azul",
};

const ACAO_LABELS = {
  login: "Login",
  logout: "Logout",
  primeiro_acesso: "Primeiro Acesso",
  criar_ocorrencia: "Criar Ocorrência",
  finalizar_ocorrencia: "Finalizar Ocorrência",
  cancelar_ocorrencia: "Cancelar Ocorrência",
  solicitar_retificacao: "Solicitar Retificação",
  aprovar_retificacao: "Aprovar Retificação",
  rejeitar_retificacao: "Rejeitar Retificação",
  criar_usuario: "Criar Usuário",
  editar_usuario: "Editar Usuário",
  resetar_senha: "Resetar Senha",
  ativar_desativar_usuario: "Ativar/Desativar Usuário",
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página de logs do sistema
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderLogs(container, appInstance) {
  // Verificar permissão
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando logs...</p>
    </div>
  `;

  try {
    // Carregar dados
    await carregarUsuarios();
    await carregarLogs();

    renderizarLogs(container, appInstance);

    // Registrar funções no escopo global
    window._logsAplicarFiltros = () =>
      aplicarFiltrosLogs(container, appInstance);
    window._logsLimparFiltros = () => limparFiltrosLogs(container, appInstance);
    window._logsExportar = () => exportarLogsCSV(appInstance);
    window._logsRecarregar = () => renderLogs(container, appInstance);
  } catch (error) {
    console.error("Erro ao renderizar logs:", error);
    container.innerHTML = `
      <div class="container">
        <h2 style="color:var(--azul-bandeira);">
          <i class="fas fa-history" style="margin-right:8px;"></i>
          Logs do Sistema
        </h2>
        <p style="color:var(--erro);">Erro ao carregar logs: ${error.message}</p>
        <button onclick="window._logsRecarregar()" class="btn-primary" style="margin-top:16px;max-width:200px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// CARREGAR DADOS
// ============================================

async function carregarUsuarios() {
  try {
    const result = await authManager.listarUsuarios();
    if (result.success) {
      estado.usuariosCache = result.data || [];
    }
  } catch (error) {
    console.warn("Erro ao carregar usuários:", error);
    estado.usuariosCache = [];
  }
}

async function carregarLogs() {
  try {
    const result = await authManager.listarLogsAcesso(estado.filtros);
    if (result.success) {
      estado.logsCache = result.data || [];
    } else {
      estado.logsCache = [];
    }

    // Carregar estatísticas
    const statsResult = await authManager.getLogStats({
      data_inicio: estado.filtros.data_inicio,
      data_fim: estado.filtros.data_fim,
    });
    if (statsResult.success) {
      estado.statsCache = statsResult.data;
    } else {
      estado.statsCache = null;
    }
  } catch (error) {
    console.warn("Erro ao carregar logs:", error);
    estado.logsCache = [];
  }
}

// ============================================
// RENDERIZAÇÃO
// ============================================

function renderizarLogs(container, appInstance) {
  const logs = estado.logsCache;
  const stats = estado.statsCache;
  const usuarios = estado.usuariosCache;

  // Calcular estatísticas básicas
  const totalLogs = logs.length;
  const totalLogins = logs.filter((l) => l.acao === "login").length;
  const totalOcorrencias = logs.filter(
    (l) => l.acao === "criar_ocorrencia",
  ).length;

  const html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;">
          <i class="fas fa-history" style="margin-right:8px;"></i>
          Logs do Sistema
        </h2>
        <div style="display:flex;gap:4px;">
          <button onclick="window._logsExportar()" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;" title="Exportar CSV">
            <i class="fas fa-file-csv"></i>
          </button>
          <button onclick="window._logsRecarregar()" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;" title="Recarregar">
            <i class="fas fa-sync-alt"></i>
          </button>
          <button onclick="window.app.navigateTo('dashboard')" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:13px;">
        ${totalLogs} registro(s) encontrado(s)
      </p>

      <!-- Cards de Estatísticas -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${totalLogs}</div>
          <div style="font-size:9px;opacity:0.8;">Total</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${totalLogins}</div>
          <div style="font-size:9px;opacity:0.8;">Logins</div>
        </div>
        <div style="background:var(--aviso);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${totalOcorrencias}</div>
          <div style="font-size:9px;opacity:0.8;">Ocorrências</div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filtros-container" style="margin-bottom:12px;border-radius:16px;padding:12px;">
        <div class="filtros-row">
          <div class="filtro-group" style="flex:1.5;">
            <label><i class="fas fa-user"></i> Usuário</label>
            <select id="filtroLogUsuario" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
              <option value="">Todos</option>
              ${usuarios
                .map(
                  (u) => `
                <option value="${u.id}" ${estado.filtros.usuario_id === u.id ? "selected" : ""}>
                  ${u.nome_completo} (${u.matricula || "Sem matrícula"})
                </option>
              `,
                )
                .join("")}
            </select>
          </div>
          <div class="filtro-group" style="flex:1.5;">
            <label><i class="fas fa-tag"></i> Ação</label>
            <select id="filtroLogAcao" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
              ${TIPOS_ACAO.map(
                (a) => `
                <option value="${a.value}" ${estado.filtros.acao === a.value ? "selected" : ""}>
                  ${a.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
        </div>
        <div class="filtros-row" style="margin-top:6px;">
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Início</label>
            <input type="date" id="filtroLogDataInicio" value="${estado.filtros.data_inicio || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
          </div>
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
            <input type="date" id="filtroLogDataFim" value="${estado.filtros.data_fim || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
          </div>
          <div class="filtros-actions">
            <button onclick="window._logsAplicarFiltros()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-search"></i>
            </button>
            <button onclick="window._logsLimparFiltros()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-undo"></i>
            </button>
          </div>
        </div>
        <div class="filtros-info" style="margin-top:6px;font-size:11px;color:var(--cinza-medio);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
          <span>
            <i class="fas fa-info-circle" style="margin-right:4px;"></i>
            ${totalLogs} registro(s) encontrado(s)
          </span>
          ${
            estado.filtros.usuario_id ||
            estado.filtros.acao ||
            estado.filtros.data_inicio ||
            estado.filtros.data_fim
              ? `
            <span style="color:var(--azul-bandeira);">
              <i class="fas fa-filter" style="margin-right:4px;"></i> Filtro ativo
            </span>
          `
              : ""
          }
        </div>
      </div>

      <!-- Tabela de Logs -->
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);overflow-x:auto;">
        <div class="table-wrapper">
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--cinza-claro);">
                <th style="padding:8px 10px;text-align:left;">Data/Hora</th>
                <th style="padding:8px 10px;text-align:left;">Usuário</th>
                <th style="padding:8px 10px;text-align:center;">Ação</th>
                <th style="padding:8px 10px;text-align:center;">IP</th>
                <th style="padding:8px 10px;text-align:left;">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              ${
                logs.length === 0
                  ? `
                <tr>
                  <td colspan="5" style="padding:30px;text-align:center;color:var(--cinza-medio);">
                    <i class="fas fa-search" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>
                    Nenhum log encontrado
                  </td>
                </tr>
              `
                  : `
                ${logs
                  .map((log) => {
                    const usuarioNome =
                      log.usuarios?.nome_completo || "Desconhecido";
                    const badgeClass = getBadgeClass(log.acao);
                    const label = getAcaoLabel(log.acao);

                    // Parsear detalhes
                    let detalhesDisplay = log.entidade || "-";
                    if (log.detalhes) {
                      try {
                        const parsed = JSON.parse(log.detalhes);
                        if (parsed.dispositivo || parsed.navegador) {
                          const deviceInfo = [];
                          if (parsed.dispositivo)
                            deviceInfo.push(parsed.dispositivo);
                          if (parsed.navegador)
                            deviceInfo.push(parsed.navegador);
                          if (deviceInfo.length > 0) {
                            detalhesDisplay = deviceInfo.join(" • ");
                          }
                        }
                      } catch (e) {}
                    }

                    return `
                    <tr style="border-bottom:1px solid var(--cinza-claro);">
                      <td style="padding:8px 10px;font-size:11px;color:var(--cinza-medio);">
                        ${formatarDataHoraLocal(log.data_hora)}
                      </td>
                      <td style="padding:8px 10px;font-weight:500;">
                        ${usuarioNome}
                        ${log.usuarios?.matricula ? `<span style="font-size:10px;color:var(--cinza-medio);display:block;">Mat: ${log.usuarios.matricula}</span>` : ""}
                      </td>
                      <td style="padding:8px 10px;text-align:center;">
                        <span class="badge ${badgeClass}" style="font-size:10px;padding:3px 12px;">
                          ${label}
                        </span>
                      </td>
                      <td style="padding:8px 10px;text-align:center;font-size:11px;color:var(--cinza-medio);">
                        ${log.ip || "-"}
                      </td>
                      <td style="padding:8px 10px;font-size:11px;color:var(--cinza-medio);">
                        ${detalhesDisplay}
                      </td>
                    </tr>
                  `;
                  })
                  .join("")}
              `
              }
            </tbody>
          </table>
        </div>
      </div>

      ${
        logs.length > 0
          ? `
        <div style="margin-top:8px;text-align:right;font-size:11px;color:var(--cinza-medio);">
          <i class="fas fa-clock"></i> Última atualização: ${new Date().toLocaleString("pt-BR")}
          ${logs.length >= estado.filtros.limit ? ` (limitado a ${estado.filtros.limit} registros)` : ""}
        </div>
      `
          : ""
      }
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltrosLogs(container, appInstance) {
  const usuarioId = document.getElementById("filtroLogUsuario")?.value || "";
  const acao = document.getElementById("filtroLogAcao")?.value || "";
  const dataInicio =
    document.getElementById("filtroLogDataInicio")?.value || "";
  const dataFim = document.getElementById("filtroLogDataFim")?.value || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
    }
    return;
  }

  estado.filtros = {
    usuario_id: usuarioId,
    acao: acao,
    data_inicio: dataInicio,
    data_fim: dataFim,
    limit: 200,
  };

  renderLogs(container, appInstance);
}

export function limparFiltrosLogs(container, appInstance) {
  estado.filtros = {
    usuario_id: "",
    acao: "",
    data_inicio: "",
    data_fim: "",
    limit: 200,
  };

  const usuarioSelect = document.getElementById("filtroLogUsuario");
  const acaoSelect = document.getElementById("filtroLogAcao");
  const dataInicioInput = document.getElementById("filtroLogDataInicio");
  const dataFimInput = document.getElementById("filtroLogDataFim");

  if (usuarioSelect) usuarioSelect.value = "";
  if (acaoSelect) acaoSelect.value = "";
  if (dataInicioInput) dataInicioInput.value = "";
  if (dataFimInput) dataFimInput.value = "";

  renderLogs(container, appInstance);

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Filtros removidos", "info");
  }
}

// ============================================
// EXPORTAÇÃO CSV
// ============================================

export function exportarLogsCSV(appInstance) {
  const logs = estado.logsCache;
  if (logs.length === 0) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Nenhum log para exportar", "warning");
    }
    return;
  }

  try {
    // Cabeçalhos
    const headers = [
      "Data/Hora",
      "Usuário",
      "Matrícula",
      "Ação",
      "IP",
      "Detalhes",
    ];
    const rows = logs.map((log) => {
      const usuarioNome = log.usuarios?.nome_completo || "Desconhecido";
      const usuarioMatricula = log.usuarios?.matricula || "";
      const label = getAcaoLabel(log.acao);

      let detalhesDisplay = log.entidade || "";
      if (log.detalhes) {
        try {
          const parsed = JSON.parse(log.detalhes);
          if (parsed.dispositivo || parsed.navegador) {
            const deviceInfo = [];
            if (parsed.dispositivo) deviceInfo.push(parsed.dispositivo);
            if (parsed.navegador) deviceInfo.push(parsed.navegador);
            if (deviceInfo.length > 0) {
              detalhesDisplay = deviceInfo.join(" • ");
            }
          }
        } catch (e) {}
      }

      return [
        formatarDataHoraLocal(log.data_hora),
        usuarioNome,
        usuarioMatricula,
        label,
        log.ip || "-",
        detalhesDisplay,
      ];
    });

    // Montar CSV
    let csv = headers.join(",") + "\n";
    rows.forEach((row) => {
      csv +=
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",") +
        "\n";
    });

    // Baixar arquivo
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `logs_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Logs exportados com sucesso!", "success");
    }
  } catch (error) {
    console.error("Erro ao exportar logs:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao exportar logs", "error");
    }
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

function getBadgeClass(acao) {
  return BADGE_CLASSES[acao] || "badge-draft";
}

function getAcaoLabel(acao) {
  return ACAO_LABELS[acao] || acao;
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
  renderLogs,
  aplicarFiltrosLogs,
  limparFiltrosLogs,
  exportarLogsCSV,
};
