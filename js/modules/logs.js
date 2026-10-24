/**
 * MÓDULO LOGS — Visualização de logs de acesso
 * Guarda Municipal de Pitangueiras - PR
 *
 * Escopo: logs_acesso. A trilha de auditoria detalhada não é exposta aqui
 * até que a autorização de acesso no banco seja revisada e homologada.
 */

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_ROWS = 5000;
const TZ_OPERACIONAL = globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo";

let estado = {
  filtros: {
    usuario_id: "",
    acao: "",
    data_inicio: "",
    data_fim: "",
    busca: "",
    limit: PAGE_SIZE,
  },
  pagina: 0,
  logsCache: [],
  usuariosCache: [],
  usuariosCarregados: false,
  usuariosErro: false,
  total: 0,
  statsCache: null,
  statsErro: false,
  erro: null,
  atualizadoEm: null,
  requestId: 0,
  exportando: false,
};

const TIPOS_ACAO = [
  { value: "", label: "Todas as ações" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "primeiro_acesso", label: "Primeiro acesso" },
  { value: "criar_ocorrencia", label: "Criar ocorrência" },
  { value: "finalizar_ocorrencia", label: "Finalizar ocorrência" },
  { value: "cancelar_ocorrencia", label: "Cancelar ocorrência" },
  { value: "solicitar_retificacao", label: "Solicitar retificação" },
  { value: "aprovar_retificacao", label: "Aprovar retificação" },
  { value: "rejeitar_retificacao", label: "Rejeitar retificação" },
  { value: "criar_usuario", label: "Criar usuário" },
  { value: "editar_usuario", label: "Editar usuário" },
  { value: "resetar_senha", label: "Resetar senha" },
  { value: "ativar_desativar_usuario", label: "Ativar/desativar usuário" },
];

const ACAO_LABELS = Object.fromEntries(
  TIPOS_ACAO.filter((item) => item.value).map((item) => [item.value, item.label]),
);

const ENTIDADE_LABELS = {
  ocorrencia: "Ocorrência",
  ocorrencias: "Ocorrência",
  usuario: "Usuário",
  usuarios: "Usuário",
  retificacao: "Retificação",
  retificacoes: "Retificação",
};

export async function renderLogs(container, appInstance) {
  if (typeof authManager === "undefined" || !authManager.isAdministrador()) {
    container.innerHTML = renderAcessoNegado();
    return;
  }

  const requestId = ++estado.requestId;
  estado.erro = null;
  container.innerHTML = renderCarregando();

  try {
    if (!estado.usuariosCarregados) await carregarUsuarios();

    const filtrosConsulta = {
      ...estado.filtros,
      offset: estado.pagina * estado.filtros.limit,
    };
    const [listaResult, statsResult] = await Promise.allSettled([
      authManager.listarLogsAcesso(filtrosConsulta),
      authManager.getLogStats({
        data_inicio: estado.filtros.data_inicio,
        data_fim: estado.filtros.data_fim,
      }),
    ]);

    if (requestId !== estado.requestId) return;
    if (listaResult.status === "rejected") throw listaResult.reason;
    const lista = listaResult.value;
    if (!lista?.success) throw new Error(lista?.error || "Falha ao consultar os logs.");

    estado.logsCache = Array.isArray(lista.data) ? lista.data : [];
    estado.total = lista.count !== null && lista.count !== undefined && Number.isFinite(Number(lista.count))
      ? Number(lista.count)
      : estado.logsCache.length;
    estado.atualizadoEm = new Date();

    if (statsResult.status === "fulfilled" && statsResult.value?.success) {
      estado.statsCache = statsResult.value.data || null;
      estado.statsErro = false;
    } else {
      estado.statsCache = null;
      estado.statsErro = true;
    }

    const ultimaPagina = Math.max(0, Math.ceil(estado.total / estado.filtros.limit) - 1);
    if (estado.pagina > ultimaPagina) {
      estado.pagina = ultimaPagina;
      return renderLogs(container, appInstance);
    }

    renderizarLogs(container, appInstance);
    vincularEventos(container, appInstance);
  } catch (error) {
    if (requestId !== estado.requestId) return;
    console.error("Erro ao carregar logs de acesso:", error);
    estado.erro = error?.message || "Não foi possível carregar os logs.";
    estado.logsCache = [];
    estado.total = 0;
    container.innerHTML = renderErro(estado.erro);
    container.querySelector("[data-logs-action='retry']")?.addEventListener("click", () => renderLogs(container, appInstance));
  }
}

async function carregarUsuarios() {
  try {
    const result = await authManager.listarUsuariosParaLogs();
    if (!result?.success) throw new Error(result?.error || "Não foi possível carregar usuários.");
    estado.usuariosCache = Array.isArray(result.data) ? result.data : [];
    estado.usuariosErro = false;
  } catch (error) {
    console.warn("Não foi possível carregar a lista de usuários dos logs:", error);
    estado.usuariosCache = [];
    estado.usuariosErro = true;
  } finally {
    estado.usuariosCarregados = true;
  }
}

function renderizarLogs(container, appInstance) {
  const logs = estado.logsCache;
  const stats = estado.statsCache;
  const inicio = estado.total === 0 ? 0 : estado.pagina * estado.filtros.limit + 1;
  const fim = Math.min(estado.pagina * estado.filtros.limit + logs.length, estado.total);
  const totalPaginas = Math.max(1, Math.ceil(estado.total / estado.filtros.limit));
  const filtrosAtivos = contarFiltrosAtivos(estado.filtros);

  container.innerHTML = `
    <main class="container logs-page">
      <header class="logs-header">
        <div class="logs-heading">
          <span class="logs-heading-icon" aria-hidden="true"><i class="fas fa-history"></i></span>
          <div>
            <p class="logs-eyebrow">ADMINISTRAÇÃO DO SISTEMA</p>
            <h1>Logs de acesso</h1>
            <p class="logs-subtitle">Histórico de entradas e ações registradas no aplicativo.</p>
          </div>
        </div>
        <div class="logs-header-actions">
          <button type="button" class="btn-secondary logs-icon-button" data-logs-action="refresh" aria-label="Atualizar logs" title="Atualizar">
            <i class="fas fa-sync-alt" aria-hidden="true"></i><span>Atualizar</span>
          </button>
          <button type="button" class="btn-secondary logs-icon-button" data-logs-action="export" aria-label="Exportar resultados filtrados para CSV" title="Exportar CSV" ${estado.exportando ? "disabled" : ""}>
            <i class="fas fa-file-csv" aria-hidden="true"></i><span>${estado.exportando ? "Preparando…" : "Exportar CSV"}</span>
          </button>
          <button type="button" class="btn-secondary logs-icon-button" data-logs-action="back" aria-label="Voltar ao painel">
            <i class="fas fa-arrow-left" aria-hidden="true"></i><span>Painel</span>
          </button>
        </div>
      </header>

      <div class="logs-scope-note" role="note">
        <i class="fas fa-info-circle" aria-hidden="true"></i>
        <span>Esta tela mostra <strong>logs de acesso</strong>. A trilha detalhada de auditoria permanece separada e não é exibida nesta versão de homologação.</span>
      </div>

      <section class="logs-summary-section" aria-labelledby="logs-summary-title">
        <div class="logs-section-heading">
          <div><h2 id="logs-summary-title">Resumo do período</h2><p>Os cartões consideram as datas selecionadas; os demais filtros refinam a lista abaixo.</p></div>
        </div>
        <div class="logs-summary-grid">
          ${renderStatCard("fa-list", "Eventos de acesso", stats?.total, "No período", "blue")}
          ${renderStatCard("fa-sign-in-alt", "Logins", stats?.logins, "No período", "green")}
          ${renderStatCard("fa-file-alt", "Ações em ocorrências", stats?.acoes_ocorrencia, "No período", "amber")}
        </div>
        ${estado.statsErro ? `<p class="logs-inline-warning"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> Não foi possível calcular os indicadores. A lista de eventos continua disponível.</p>` : ""}
      </section>

      <section class="logs-filters-card" aria-labelledby="logs-filters-title">
        <div class="logs-section-heading logs-filter-heading">
          <div><h2 id="logs-filters-title">Filtros</h2><p>Pesquise por ação, entidade, IP ou detalhes do evento.</p></div>
          ${filtrosAtivos ? `<span class="logs-filter-count">${filtrosAtivos} filtro(s) ativo(s)</span>` : ""}
        </div>
        ${estado.usuariosErro ? `<p class="logs-inline-warning"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> A lista de usuários não carregou; os demais filtros continuam funcionando.</p>` : ""}
        <form class="logs-filter-form" id="logsFilterForm">
          <div class="logs-filter-grid">
            <div class="logs-field logs-search-field">
              <label for="filtroLogBusca">Busca</label>
              <div class="logs-input-icon"><i class="fas fa-search" aria-hidden="true"></i><input type="search" id="filtroLogBusca" maxlength="80" value="${escapeHtml(estado.filtros.busca)}" placeholder="Ação, entidade, IP ou detalhes"></div>
            </div>
            <div class="logs-field">
              <label for="filtroLogUsuario">Usuário</label>
              <select id="filtroLogUsuario">
                <option value="">Todos os usuários</option>
                ${estado.usuariosCache.map((u) => `<option value="${escapeHtml(u.id)}" ${String(estado.filtros.usuario_id) === String(u.id) ? "selected" : ""}>${escapeHtml(u.nome_completo || "Usuário sem nome")}${u.matricula ? ` — ${escapeHtml(u.matricula)}` : ""}</option>`).join("")}
              </select>
            </div>
            <div class="logs-field">
              <label for="filtroLogAcao">Ação</label>
              <select id="filtroLogAcao">
                ${TIPOS_ACAO.map((acao) => `<option value="${escapeHtml(acao.value)}" ${estado.filtros.acao === acao.value ? "selected" : ""}>${escapeHtml(acao.label)}</option>`).join("")}
              </select>
            </div>
            <div class="logs-field">
              <label for="filtroLogDataInicio">Data inicial</label>
              <input type="date" id="filtroLogDataInicio" value="${escapeHtml(estado.filtros.data_inicio)}">
            </div>
            <div class="logs-field">
              <label for="filtroLogDataFim">Data final</label>
              <input type="date" id="filtroLogDataFim" value="${escapeHtml(estado.filtros.data_fim)}">
            </div>
            <div class="logs-filter-actions">
              <button type="submit" class="btn-primary"><i class="fas fa-filter" aria-hidden="true"></i> Aplicar</button>
              <button type="button" class="btn-secondary" data-logs-action="clear"><i class="fas fa-undo" aria-hidden="true"></i> Limpar</button>
            </div>
          </div>
        </form>
      </section>

      <section class="logs-results-card" aria-labelledby="logs-results-title">
        <div class="logs-results-heading">
          <div>
            <h2 id="logs-results-title">Eventos registrados</h2>
            <p>${inicio}–${fim} de ${estado.total} resultado(s) após os filtros <span class="logs-timezone">· Horários em São Paulo</span></p>
          </div>
          ${estado.atualizadoEm ? `<span class="logs-updated"><i class="fas fa-clock" aria-hidden="true"></i> Atualizado às ${escapeHtml(formatarHora(estado.atualizadoEm))}</span>` : ""}
        </div>
        <div class="logs-table-scroll" role="region" aria-label="Tabela de logs de acesso" tabindex="0">
          <table class="logs-table">
            <thead><tr><th scope="col">Data e hora</th><th scope="col">Usuário</th><th scope="col">Ação</th><th scope="col">Registro / dispositivo</th><th scope="col">IP</th></tr></thead>
            <tbody>
              ${logs.length ? logs.map(renderLogRow).join("") : `<tr><td colspan="5"><div class="logs-empty"><i class="fas fa-inbox" aria-hidden="true"></i><strong>Nenhum evento encontrado</strong><span>Revise os filtros ou tente outro período.</span></div></td></tr>`}
            </tbody>
          </table>
        </div>
        <nav class="logs-pagination" aria-label="Paginação dos logs">
          <span>Página ${estado.pagina + 1} de ${totalPaginas}</span>
          <div class="logs-pagination-actions">
            <button type="button" class="btn-secondary" data-logs-action="previous" ${estado.pagina <= 0 ? "disabled" : ""}><i class="fas fa-chevron-left" aria-hidden="true"></i> Anterior</button>
            <button type="button" class="btn-secondary" data-logs-action="next" ${fim >= estado.total ? "disabled" : ""}>Próxima <i class="fas fa-chevron-right" aria-hidden="true"></i></button>
          </div>
        </nav>
      </section>
    </main>
  `;
}

function renderStatCard(icon, label, value, note, color) {
  const display = value === undefined || value === null ? "—" : Number(value).toLocaleString("pt-BR");
  return `<article class="logs-stat-card logs-stat-${color}"><span class="logs-stat-icon"><i class="fas ${icon}" aria-hidden="true"></i></span><div class="logs-stat-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong><small>${escapeHtml(note)}</small></div></article>`;
}

function renderLogRow(log) {
  const nome = log.usuarios?.nome_completo || "Usuário indisponível";
  const matricula = log.usuarios?.matricula || "";
  const acao = ACAO_LABELS[log.acao] || log.acao || "Ação registrada";
  const badge = acaoBadgeClass(log.acao);
  const contexto = formatarContexto(log);
  return `<tr>
    <td class="logs-date-cell"><time datetime="${escapeHtml(normalizarDataIso(log.data_hora))}">${escapeHtml(formatarDataHoraLocal(log.data_hora))}</time></td>
    <td><span class="logs-user-name">${escapeHtml(nome)}</span>${matricula ? `<span class="logs-user-matricula">Matrícula ${escapeHtml(matricula)}</span>` : ""}</td>
    <td><span class="logs-action-pill ${badge}">${escapeHtml(acao)}</span></td>
    <td class="logs-context-cell">${escapeHtml(contexto)}</td>
    <td class="logs-ip-cell">${escapeHtml(log.ip || "—")}</td>
  </tr>`;
}

function formatarContexto(log) {
  const partes = [];
  if (log.entidade) partes.push(ENTIDADE_LABELS[log.entidade] || log.entidade);
  const dados = parseDetalhes(log.detalhes);
  const ids = [
    ["ocorrencia_id", "Ocorrência"],
    ["retificacao_id", "Retificação"],
    ["usuario_id", "Usuário"],
  ];
  for (const [campo, rotulo] of ids) {
    if (dados[campo]) {
      partes.push(`${rotulo}: ${dados[campo]}`);
      break;
    }
  }
  const dispositivo = [dados.dispositivo, dados.navegador].filter(Boolean).join(" · ");
  if (dispositivo) partes.push(dispositivo);
  return partes.join(" · ") || "—";
}

function parseDetalhes(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function acaoBadgeClass(acao) {
  if (acao === "login" || acao === "aprovar_retificacao") return "logs-action-positive";
  if (acao === "logout" || acao === "primeiro_acesso") return "logs-action-neutral";
  if (["cancelar_ocorrencia", "rejeitar_retificacao", "resetar_senha"].includes(acao)) return "logs-action-attention";
  return "logs-action-default";
}

function vincularEventos(container, appInstance) {
  container.querySelector("#logsFilterForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    aplicarFiltrosLogs(container, appInstance);
  });
  container.querySelector("[data-logs-action='clear']")?.addEventListener("click", () => limparFiltrosLogs(container, appInstance));
  container.querySelector("[data-logs-action='refresh']")?.addEventListener("click", () => renderLogs(container, appInstance));
  container.querySelector("[data-logs-action='export']")?.addEventListener("click", () => exportarLogsCSV(appInstance, container));
  container.querySelector("[data-logs-action='back']")?.addEventListener("click", () => appInstance?.navigateTo?.("dashboard"));
  container.querySelector("[data-logs-action='previous']")?.addEventListener("click", () => mudarPagina(-1, container, appInstance));
  container.querySelector("[data-logs-action='next']")?.addEventListener("click", () => mudarPagina(1, container, appInstance));
}

function mudarPagina(delta, container, appInstance) {
  const novaPagina = estado.pagina + delta;
  const ultimaPagina = Math.max(0, Math.ceil(estado.total / estado.filtros.limit) - 1);
  if (novaPagina < 0 || novaPagina > ultimaPagina) return;
  estado.pagina = novaPagina;
  return renderLogs(container, appInstance);
}

export function aplicarFiltrosLogs(container, appInstance) {
  const dataInicio = container.querySelector("#filtroLogDataInicio")?.value || "";
  const dataFim = container.querySelector("#filtroLogDataFim")?.value || "";
  if (dataInicio && dataFim && dataFim < dataInicio) {
    appInstance?.showToast?.("A data final deve ser igual ou posterior à inicial.", "warning");
    return;
  }
  estado.filtros = {
    usuario_id: container.querySelector("#filtroLogUsuario")?.value || "",
    acao: container.querySelector("#filtroLogAcao")?.value || "",
    data_inicio: dataInicio,
    data_fim: dataFim,
    busca: container.querySelector("#filtroLogBusca")?.value || "",
    limit: PAGE_SIZE,
  };
  estado.pagina = 0;
  return renderLogs(container, appInstance);
}

export function limparFiltrosLogs(container, appInstance) {
  estado.filtros = { usuario_id: "", acao: "", data_inicio: "", data_fim: "", busca: "", limit: PAGE_SIZE };
  estado.pagina = 0;
  return renderLogs(container, appInstance);
}

export async function exportarLogsCSV(appInstance, container = document.querySelector("#page-logs")) {
  if (estado.exportando) return;
  const filtros = { ...estado.filtros, offset: 0, limit: EXPORT_PAGE_SIZE };
  estado.exportando = true;
  const botao = container?.querySelector("[data-logs-action='export']");
  if (botao) { botao.disabled = true; botao.textContent = "Preparando…"; }

  try {
    const primeiro = await authManager.listarLogsAcesso(filtros);
    if (!primeiro?.success) throw new Error(primeiro?.error || "Falha ao consultar os logs para exportação.");
    const total = Number(primeiro.count) || 0;
    if (total === 0) {
      appInstance?.showToast?.("Não há eventos para exportar com estes filtros.", "warning");
      return;
    }
    if (total > EXPORT_MAX_ROWS) {
      appInstance?.showToast?.(`A exportação encontrou ${total.toLocaleString("pt-BR")} registros. Refine os filtros para exportar até ${EXPORT_MAX_ROWS.toLocaleString("pt-BR")} por arquivo.`, "warning");
      return;
    }

    const registros = [...(primeiro.data || [])];
    for (let offset = registros.length; offset < total; offset += EXPORT_PAGE_SIZE) {
      const pagina = await authManager.listarLogsAcesso({ ...filtros, offset });
      if (!pagina?.success) throw new Error(pagina?.error || "Falha ao concluir a exportação.");
      registros.push(...(pagina.data || []));
      if (!pagina.data?.length) break;
    }
    if (registros.length !== total) throw new Error("A consulta mudou durante a exportação. Reaplique os filtros e tente novamente.");

    const cabecalhos = ["Data/Hora (America/Sao_Paulo)", "Usuário", "Matrícula", "Ação", "Entidade/Referência", "IP", "Dispositivo/Navegador"];
    const linhas = registros.map((log) => {
      const dados = parseDetalhes(log.detalhes);
      const dispositivo = [dados.dispositivo, dados.navegador].filter(Boolean).join(" / ");
      return [
        formatarDataHoraLocal(log.data_hora),
        log.usuarios?.nome_completo || "Usuário indisponível",
        log.usuarios?.matricula || "",
        ACAO_LABELS[log.acao] || log.acao || "Ação registrada",
        formatarContexto(log),
        log.ip || "",
        dispositivo,
      ];
    });
    const csv = "\uFEFF" + [cabecalhos, ...linhas].map((linha) => linha.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs_acesso_${dataLocalParaNomeArquivo(new Date())}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    appInstance?.showToast?.(`${registros.length.toLocaleString("pt-BR")} evento(s) exportado(s).`, "success");
  } catch (error) {
    console.error("Erro ao exportar logs:", error);
    appInstance?.showToast?.("Não foi possível concluir a exportação. Verifique os filtros e tente novamente.", "error");
  } finally {
    estado.exportando = false;
    if (botao) { botao.disabled = false; botao.innerHTML = `<i class="fas fa-file-csv" aria-hidden="true"></i><span>Exportar CSV</span>`; }
  }
}

function renderCarregando() {
  return `<div class="container logs-page"><div class="logs-loading" role="status" aria-live="polite"><span class="spinner-azul"></span><p>Carregando logs de acesso…</p></div></div>`;
}

function renderErro(mensagem) {
  return `<main class="container logs-page"><header class="logs-header"><div class="logs-heading"><span class="logs-heading-icon"><i class="fas fa-history" aria-hidden="true"></i></span><div><p class="logs-eyebrow">ADMINISTRAÇÃO DO SISTEMA</p><h1>Logs de acesso</h1></div></div></header><section class="logs-error-card" role="alert"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i><div><strong>Não foi possível carregar os logs</strong><p>${escapeHtml(mensagem)}</p><button type="button" class="btn-primary" data-logs-action="retry"><i class="fas fa-sync-alt" aria-hidden="true"></i> Tentar novamente</button></div></section></main>`;
}

function renderAcessoNegado() {
  return `<main class="container logs-page"><section class="logs-error-card" role="alert"><i class="fas fa-lock" aria-hidden="true"></i><div><strong>Acesso restrito</strong><p>Esta tela está disponível apenas para supervisores.</p></div></section></main>`;
}

function contarFiltrosAtivos(filtros) {
  return [filtros.usuario_id, filtros.acao, filtros.data_inicio, filtros.data_fim, filtros.busca].filter(Boolean).length;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function csvCell(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizarDataIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) return `${text.replace(" ", "T")}Z`;
  return text;
}

function formatarDataHoraLocal(value) {
  const date = new Date(normalizarDataIso(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    timeZone: TZ_OPERACIONAL,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatarHora(date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: TZ_OPERACIONAL, hour: "2-digit", minute: "2-digit" });
}

function dataLocalParaNomeArquivo(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ_OPERACIONAL, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export { escapeHtml, csvCell, formatarDataHoraLocal };

export default {
  renderLogs,
  aplicarFiltrosLogs,
  limparFiltrosLogs,
  exportarLogsCSV,
};
