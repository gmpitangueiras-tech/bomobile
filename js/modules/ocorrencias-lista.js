/**
 * MÓDULO OCORRÊNCIAS LISTA - Listagem de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de ocorrências com filtros
 * - Filtros por status, período e busca
 * - Visualização de detalhes
 * - Exportação de lista
 * - Navegação para nova ocorrência
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

const STATUS_OPCOES = [
  { value: "", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "pending_sync", label: "Pendente" },
  { value: "synced", label: "Finalizada" },
  { value: "rectified", label: "Retificada" },
  { value: "pending_rectification", label: "Retificação Pendente" },
  { value: "cancelled", label: "Cancelada" },
];

const TIPOS_OCORRENCIA = [
  { value: "", label: "Todos os tipos" },
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
  filtros: {
    status: "",
    dataInicio: "",
    dataFim: "",
    tipo: "",
    search: "",
  },
  ocorrencias: [],
  total: 0,
  carregando: false,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página de listagem de ocorrências
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderOcorrencias(container, appInstance) {
  // Verificar autenticação
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-user-slash"></i>
        </div>
        <p style="font-weight:500;">Usuário não autenticado</p>
        <button onclick="window.app.navigateTo('login')" class="btn-primary" style="margin-top:16px;max-width:200px;">
          Fazer Login
        </button>
      </div>
    `;
    return;
  }

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando ocorrências...</p>
    </div>
  `;

  try {
    // Carregar ocorrências
    await carregarOcorrencias();

    // Renderizar
    renderizarLista(container, appInstance);

    // Registrar funções globais
    window._ocorrenciasAplicarFiltros = () =>
      aplicarFiltros(container, appInstance);
    window._ocorrenciasLimparFiltros = () =>
      limparFiltros(container, appInstance);
    window._ocorrenciasVerDetalhes = (id) => verDetalhes(id, appInstance);
    window._ocorrenciasNova = () => appInstance.navigateTo("nova-ocorrencia");
    window._ocorrenciasRecarregar = () =>
      renderOcorrencias(container, appInstance);
  } catch (error) {
    console.error("❌ Erro ao renderizar ocorrências:", error);
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar ocorrências</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="window._ocorrenciasRecarregar()" class="btn-primary" style="margin-top:16px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// CARREGAR OCORRÊNCIAS
// ============================================

async function carregarOcorrencias() {
  estado.carregando = true;

  try {
    const filtros = {};

    if (estado.filtros.status) {
      filtros.status = estado.filtros.status;
    }
    if (estado.filtros.dataInicio) {
      filtros.data_inicio = estado.filtros.dataInicio;
    }
    if (estado.filtros.dataFim) {
      filtros.data_fim = estado.filtros.dataFim;
    }
    if (estado.filtros.tipo) {
      filtros.tipo_ocorrencia = estado.filtros.tipo;
    }
    if (estado.filtros.search) {
      filtros.search = estado.filtros.search;
    }

    // Limitar para performance
    filtros.limit = 200;

    const result = await ocorrenciaManager.listar(filtros);

    if (result.success) {
      estado.ocorrencias = result.data || [];
      estado.total = estado.ocorrencias.length;
    } else {
      estado.ocorrencias = [];
      estado.total = 0;
      console.warn("Erro ao carregar ocorrências:", result.error);
    }
  } catch (error) {
    console.error("Erro ao carregar ocorrências:", error);
    estado.ocorrencias = [];
    estado.total = 0;
  }

  estado.carregando = false;
}

// ============================================
// RENDERIZAÇÃO
// ============================================

function renderizarLista(container, appInstance) {
  const ocorrencias = estado.ocorrencias;
  const total = estado.total;

  // Verificar se há filtros ativos
  const temFiltros =
    estado.filtros.status ||
    estado.filtros.dataInicio ||
    estado.filtros.dataFim ||
    estado.filtros.tipo ||
    estado.filtros.search;

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <!-- Cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;">
            <i class="fas fa-file-alt" style="margin-right:8px;"></i>
            Minhas Ocorrências
          </h2>
          <p style="color:var(--cinza-medio);margin-top:4px;font-size:14px;">
            ${total} ocorrência(s) encontrada(s)
            ${temFiltros ? ' <span style="color:var(--azul-bandeira);font-weight:600;">(filtro ativo)</span>' : ""}
          </p>
        </div>
        <button onclick="window._ocorrenciasNova()" class="btn-primary" style="padding:8px 16px;font-size:13px;min-height:auto;width:auto;border-radius:12px;">
          <i class="fas fa-plus" style="margin-right:4px;"></i> Nova
        </button>
      </div>

      <!-- Filtros -->
      <div class="filtros-container" style="margin-bottom:12px;border-radius:16px;padding:12px;">
        <div class="filtros-row">
          <div class="filtro-group" style="flex:1.5;">
            <label><i class="fas fa-tag"></i> Status</label>
            <select id="filtroStatus" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
              ${STATUS_OPCOES.map(
                (op) => `
                <option value="${op.value}" ${estado.filtros.status === op.value ? "selected" : ""}>
                  ${op.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
          <div class="filtro-group" style="flex:1.5;">
            <label><i class="fas fa-tag"></i> Tipo</label>
            <select id="filtroTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
              ${TIPOS_OCORRENCIA.map(
                (op) => `
                <option value="${op.value}" ${estado.filtros.tipo === op.value ? "selected" : ""}>
                  ${op.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
        </div>
        <div class="filtros-row" style="margin-top:6px;">
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Início</label>
            <input type="date" id="filtroDataInicio" value="${estado.filtros.dataInicio || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
          </div>
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
            <input type="date" id="filtroDataFim" value="${estado.filtros.dataFim || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);">
          </div>
          <div class="filtros-actions">
            <button onclick="window._ocorrenciasAplicarFiltros()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-search"></i>
            </button>
            <button onclick="window._ocorrenciasLimparFiltros()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-undo"></i>
            </button>
          </div>
        </div>
        <div class="filtros-row" style="margin-top:6px;">
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-search"></i> Buscar</label>
            <input type="text" id="filtroSearch" placeholder="Buscar por número ou local..." 
              value="${estado.filtros.search || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);"
              onkeydown="if(event.key==='Enter') window._ocorrenciasAplicarFiltros()">
          </div>
        </div>
        <div class="filtros-info" style="margin-top:6px;font-size:11px;color:var(--cinza-medio);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
          <span>
            <i class="fas fa-info-circle" style="margin-right:4px;"></i>
            ${total} ocorrência(s) encontrada(s)
          </span>
          ${
            temFiltros
              ? `
            <span style="color:var(--azul-bandeira);">
              <i class="fas fa-filter" style="margin-right:4px;"></i> Filtro ativo
            </span>
          `
              : ""
          }
        </div>
      </div>

      <!-- Lista de ocorrências -->
      <div id="listaOcorrencias">
  `;

  if (estado.carregando) {
    html += `
      <div style="text-align:center;padding:20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:8px;color:var(--cinza-medio);">Carregando...</p>
      </div>
    `;
  } else if (ocorrencias.length === 0) {
    html += `
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-inbox"></i>
        </div>
        <p style="font-weight:500;">Nenhuma ocorrência encontrada</p>
        ${
          temFiltros
            ? `
          <p style="font-size:13px;">Tente ajustar os filtros aplicados</p>
          <button onclick="window._ocorrenciasLimparFiltros()" class="btn-secondary" style="margin-top:12px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-undo" style="margin-right:6px;"></i>
            Limpar Filtros
          </button>
        `
            : `
          <p style="font-size:13px;">Clique em "Nova" para criar sua primeira ocorrência</p>
        `
        }
      </div>
    `;
  } else {
    ocorrencias.forEach((occ) => {
      html += renderOcorrenciaItem(occ);
    });

    // Botão para criar nova
    html += `
      <button onclick="window._ocorrenciasNova()" class="btn-add" style="margin-top:8px;">
        <i class="fas fa-plus-circle"></i> Nova Ocorrência
      </button>
    `;
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

function renderOcorrenciaItem(occ) {
  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
  const statusClass = getStatusClass(occ.status);
  const statusLabel = getStatusLabel(occ.status);
  const data = formatarDataHoraLocal(occ.criado_em);
  const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
  const tipoBadge = occ.tipo_ocorrencia
    ? `<span class="badge badge-tipo badge-tipo-${occ.tipo_ocorrencia}">${tipoLabel}</span>`
    : "";
  const versaoBadge =
    occ.status === "rectified" && occ.numero_versao > 1
      ? ` <span class="badge badge-rectified" style="font-size:9px;padding:1px 8px;">v${occ.numero_versao}</span>`
      : "";
  const guardaNome = occ.criador?.nome_completo || "Desconhecido";
  const guardaCPF = occ.criador?.cpf || "";
  const cpfExibido = formatarCPFSeguro(guardaCPF);

  return `
    <div class="ocorrencia-item status-${occ.status}" onclick="window._ocorrenciasVerDetalhes('${occ.id}')">
      <div class="header">
        <div>
          <div class="numero">#${numero} ${tipoBadge} ${versaoBadge}</div>
          <div class="data">${data}</div>
        </div>
        <span class="badge badge-${statusClass}">${statusLabel}</span>
      </div>
      <div class="local">
        <i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--cinza-medio);"></i>
        ${occ.local_ocorrencia || "Local não informado"}
      </div>
      <div class="guarda" style="font-size:11px;color:var(--cinza-medio);margin-top:2px;display:flex;gap:12px;flex-wrap:wrap;">
        <span><i class="fas fa-user" style="margin-right:4px;"></i>${guardaNome}</span>
        <span><i class="fas fa-shield-alt" style="margin-right:4px;"></i>${cpfExibido}</span>
        ${
          occ.hash_pericial
            ? `
          <span title="Hash Pericial" style="cursor:help;font-family:monospace;font-size:9px;">
            🔒 ${occ.hash_pericial.substring(0, 12)}...
          </span>
        `
            : ""
        }
      </div>
    </div>
  `;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltros(container, appInstance) {
  const status = document.getElementById("filtroStatus")?.value || "";
  const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
  const dataFim = document.getElementById("filtroDataFim")?.value || "";
  const tipo = document.getElementById("filtroTipo")?.value || "";
  const search = document.getElementById("filtroSearch")?.value || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    appInstance.showToast(
      "Data final deve ser maior ou igual à data inicial",
      "warning",
    );
    return;
  }

  estado.filtros = {
    status,
    dataInicio,
    dataFim,
    tipo,
    search,
  };

  renderOcorrencias(container, appInstance);
}

export function limparFiltros(container, appInstance) {
  estado.filtros = {
    status: "",
    dataInicio: "",
    dataFim: "",
    tipo: "",
    search: "",
  };

  const statusSelect = document.getElementById("filtroStatus");
  const dataInicioInput = document.getElementById("filtroDataInicio");
  const dataFimInput = document.getElementById("filtroDataFim");
  const tipoSelect = document.getElementById("filtroTipo");
  const searchInput = document.getElementById("filtroSearch");

  if (statusSelect) statusSelect.value = "";
  if (dataInicioInput) dataInicioInput.value = "";
  if (dataFimInput) dataFimInput.value = "";
  if (tipoSelect) tipoSelect.value = "";
  if (searchInput) searchInput.value = "";

  renderOcorrencias(container, appInstance);

  appInstance.showToast("Filtros removidos", "info");
}

// ============================================
// AÇÕES
// ============================================

export function verDetalhes(id, appInstance) {
  appInstance.navigateTo("detalhe-ocorrencia", { id });
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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

function formatarCPFSeguro(cpf) {
  if (!cpf) return "***.***.***-**";
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;

  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  if (isSupervisor) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return `***.${limpo.substring(3, 6)}.***-${limpo.substring(9, 11)}`;
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderOcorrencias,
  aplicarFiltros,
  limparFiltros,
  verDetalhes,
  carregarOcorrencias,
};
