/**
 * MÓDULO RELATÓRIOS - Relatórios Gerenciais (Versão Reformulada)
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia todos os relatórios do sistema com UI/UX melhorada:
 * - Design moderno e responsivo (mobile-first)
 * - Cards informativos com contexto
 * - Explicações para cada métrica e gráfico
 * - Exportação PDF em TODOS os relatórios
 * - Layout profissional para exportação
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), pdfExport (global), utils, ui
 */

// ============================================
// CONSTANTES
// ============================================

const CORES_PIZZA = [
  "#003F87",
  "#00843D",
  "#DC2626",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#14B8A6",
  "#6366F1",
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const TIPOS_OCORRENCIA = [
  { value: "furto", label: "Furto", icon: "fa-hand", cor: "#f97316" },
  { value: "roubo", label: "Roubo", icon: "fa-mask", cor: "#dc2626" },
  {
    value: "vandalismo",
    label: "Vandalismo",
    icon: "fa-hammer",
    cor: "#f97316",
  },
  {
    value: "dano_ao_patrimonio",
    label: "Dano ao Patrimônio",
    icon: "fa-building",
    cor: "#f97316",
  },
  {
    value: "ameaca",
    label: "Ameaça",
    icon: "fa-exclamation-triangle",
    cor: "#dc2626",
  },
  {
    value: "lesao_corporal",
    label: "Lesão Corporal",
    icon: "fa-hospital",
    cor: "#dc2626",
  },
  {
    value: "perturbacao",
    label: "Perturbação",
    icon: "fa-volume-up",
    cor: "#f97316",
  },
  {
    value: "acidente",
    label: "Acidente",
    icon: "fa-car-crash",
    cor: "#eab308",
  },
  { value: "incendio", label: "Incêndio", icon: "fa-fire", cor: "#dc2626" },
  {
    value: "desaparecimento",
    label: "Desaparecimento",
    icon: "fa-search",
    cor: "#8b5cf6",
  },
  {
    value: "atendimento_social",
    label: "Atendimento Social",
    icon: "fa-hand-holding-heart",
    cor: "#06b6d4",
  },
  { value: "outro", label: "Outro", icon: "fa-ellipsis-h", cor: "#6b7280" },
];

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  relatorioAtivo: null,
  filtros: {
    dataInicio: null,
    dataFim: null,
  },
  mapaInstance: null,
  chartInstances: {},
  previsaoCarregando: false,
  dadosCache: null,
  abordagensCache: null,
  isLoading: false,
};

// ============================================
// FUNÇÕES AUXILIARES - FORMATAÇÃO
// ============================================

function formatarData(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
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
  };
  return map[status] || "draft";
}

function getStatusLabel(status) {
  const map = {
    draft: "Rascunho",
    pending_sync: "Pendente",
    synced: "Finalizada",
    cancelled: "Cancelada",
    rectified: "Retificada",
    pending_rectification: "Retificação Pendente",
    rectification_rejected: "Retificação Rejeitada",
  };
  return map[status] || status;
}

function calcularEstatisticas(ocorrencias) {
  return {
    total: ocorrencias.length,
    finalizadas: ocorrencias.filter((o) => o.status === "synced").length,
    pendentes: ocorrencias.filter((o) => o.status === "pending_sync").length,
    canceladas: ocorrencias.filter((o) => o.status === "cancelled").length,
    retificadas: ocorrencias.filter((o) => o.status === "rectified").length,
  };
}

function agruparPorTipo(ocorrencias) {
  const tipos = {};
  const total = ocorrencias.length || 1;

  ocorrencias.forEach((o) => {
    const tipo = o.tipo_ocorrencia || "Não informado";
    if (!tipos[tipo]) {
      tipos[tipo] = { total: 0, finalizadas: 0, pendentes: 0 };
    }
    tipos[tipo].total++;
    if (o.status === "synced") tipos[tipo].finalizadas++;
    if (o.status === "pending_sync") tipos[tipo].pendentes++;
  });

  return Object.keys(tipos)
    .map((key) => ({
      tipo: getTipoLabel(key),
      total: tipos[key].total,
      finalizadas: tipos[key].finalizadas,
      pendentes: tipos[key].pendentes,
      percentual: ((tipos[key].total / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.total - a.total);
}

function agruparPorMes(ocorrencias) {
  const meses = {};
  ocorrencias.forEach((o) => {
    const data = new Date(o.criado_em);
    const mes = `${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
    if (!meses[mes]) meses[mes] = 0;
    meses[mes]++;
  });

  return Object.keys(meses)
    .sort((a, b) => {
      const [mesA, anoA] = a.split("/");
      const [mesB, anoB] = b.split("/");
      return `${anoA}${mesA}`.localeCompare(`${anoB}${mesB}`);
    })
    .map((mes) => ({ label: mes, value: meses[mes] }));
}

function agruparPorBairro(ocorrencias) {
  const bairros = {};
  const total = ocorrencias.length || 1;

  ocorrencias.forEach((o) => {
    const bairro = o.bairro_ocorrencia || "Não informado";
    if (!bairros[bairro]) bairros[bairro] = 0;
    bairros[bairro]++;
  });

  return Object.keys(bairros)
    .map((key) => ({
      bairro: key,
      total: bairros[key],
      percentual: ((bairros[key] / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.total - a.total);
}

function calcularMediaDiaria(ocorrencias, dataInicio, dataFim) {
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  return dias > 0 ? (ocorrencias.length / dias).toFixed(1) : 0;
}

function calcularDiasPeriodo(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  return Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
}

function calcularDataAnterior(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const diff = fim - inicio;
  const data = new Date(inicio);
  data.setTime(data.getTime() - diff);
  return data.toISOString().slice(0, 10);
}

function calcularCentroMapa(dados) {
  if (!dados || dados.length === 0) return [-23.456, -47.123];
  let lat = 0,
    lng = 0;
  let count = 0;
  dados.forEach((p) => {
    if (p.latitude && p.longitude) {
      lat += parseFloat(p.latitude);
      lng += parseFloat(p.longitude);
      count++;
    }
  });
  return count > 0 ? [lat / count, lng / count] : [-23.456, -47.123];
}

// ============================================
// FUNÇÕES DE BUSCA DE DADOS
// ============================================

async function buscarOcorrenciasPeriodo(dataInicio, dataFim) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return [];

    const { data, error } = await client
      .from("ocorrencias")
      .select("*")
      .gte("criado_em", dataInicio)
      .lte("criado_em", dataFim + "T23:59:59");

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Erro ao buscar ocorrências:", error);
    return [];
  }
}

async function buscarAbordagensPeriodo(dataInicio, dataFim) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return { veiculos: [], pessoas: [] };

    const [veiculosResult, pessoasResult] = await Promise.all([
      client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59"),
      client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59"),
    ]);

    return {
      veiculos: veiculosResult.data || [],
      pessoas: pessoasResult.data || [],
    };
  } catch (error) {
    console.error("Erro ao buscar abordagens:", error);
    return { veiculos: [], pessoas: [] };
  }
}

async function buscarDadosUsuariosEmLote(ids) {
  if (!ids || ids.length === 0) return {};
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return {};

    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo")
      .in("id", ids);

    if (error) throw error;
    const resultado = {};
    data.forEach((u) => {
      resultado[u.id] = u;
    });
    return resultado;
  } catch (error) {
    console.warn("Erro ao buscar usuários em lote:", error);
    return {};
  }
}

async function obterPrimeiroDiaMes() {
  const data = new Date();
  data.setDate(1);
  return data.toISOString().slice(0, 10);
}

async function obterDataAtual() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// GRÁFICOS (CHART.JS)
// ============================================

let chartJSCarregado = false;

async function carregarChartJS() {
  return new Promise((resolve) => {
    if (chartJSCarregado || typeof Chart !== "undefined") {
      chartJSCarregado = true;
      resolve();
      return;
    }

    if (document.querySelector('script[src*="chart.js"]')) {
      chartJSCarregado = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = () => {
      chartJSCarregado = true;
      resolve();
    };
    script.onerror = () => {
      console.warn("⚠️ Erro ao carregar Chart.js");
      resolve();
    };
    document.head.appendChild(script);

    setTimeout(resolve, 5000);
  });
}

async function renderizarGraficoPizza(canvasId, dados, cores) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  const defaultCores = [
    "#003F87",
    "#00843D",
    "#DC2626",
    "#F59E0B",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F97316",
    "#14B8A6",
    "#6366F1",
  ];

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: dados.map((d) => d.tipo),
      datasets: [
        {
          data: dados.map((d) => d.total),
          backgroundColor: (cores || defaultCores).slice(0, dados.length),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { size: 10 },
            boxWidth: 10,
            padding: 6,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
      },
    },
  });
}

async function renderizarGraficoBarras(canvasId, dados) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: "Ocorrências",
          data: dados.map((d) => d.value),
          backgroundColor: "rgba(0, 63, 135, 0.7)",
          borderColor: "#003F87",
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 9 } },
        },
      },
    },
  });
}

async function renderizarGraficoLinha(canvasId, dados, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: label || "Projeção",
          data: dados.map((d) => d.value),
          borderColor: "#003F87",
          backgroundColor: "rgba(0, 63, 135, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#003F87",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 8 }, maxTicksLimit: 15 },
        },
      },
    },
  });
}

// ============================================
// FUNÇÃO PRINCIPAL - RENDER RELATÓRIOS
// ============================================

export async function renderRelatorios(container, appInstance) {
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  if (estado.relatorioAtivo) {
    await renderRelatorioDetalhado(
      container,
      estado.relatorioAtivo,
      appInstance,
    );
    return;
  }

  const dataInicio = estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
  const dataFim = estado.filtros.dataFim || (await obterDataAtual());

  const relatorios = [
    {
      id: "executivo",
      nome: "Relatório Executivo",
      descricao: "Visão geral completa das ocorrências",
      icon: "fa-chart-pie",
      cor: "azul",
      destaque: true,
    },
    {
      id: "por-tipo",
      nome: "Ocorrências por Tipo",
      descricao: "Análise detalhada por natureza",
      icon: "fa-tag",
      cor: "verde",
    },
    {
      id: "por-local",
      nome: "Ocorrências por Localidade",
      descricao: "Distribuição geográfica dos eventos",
      icon: "fa-map-marker-alt",
      cor: "vermelho",
    },
    {
      id: "atendimento",
      nome: "Tempo Médio de Atendimento",
      descricao: "Eficiência operacional",
      icon: "fa-clock",
      cor: "amarelo",
    },
    {
      id: "desempenho",
      nome: "Desempenho por Guarda",
      descricao: "Produtividade com ocorrências e abordagens",
      icon: "fa-user-tie",
      cor: "roxo",
    },
    {
      id: "retificacoes",
      nome: "Retificações",
      descricao: "Acompanhamento de correções",
      icon: "fa-sync-alt",
      cor: "azul",
    },
    {
      id: "cancelamentos",
      nome: "Cancelamentos",
      descricao: "Análise de ocorrências canceladas",
      icon: "fa-times-circle",
      cor: "vermelho",
    },
    {
      id: "tendencias",
      nome: "Tendências",
      descricao: "Padrões temporais e sazonalidade",
      icon: "fa-chart-line",
      cor: "verde",
    },
    {
      id: "produtividade",
      nome: "Produtividade",
      descricao: "Eficiência e capacidade",
      icon: "fa-rocket",
      cor: "azul",
    },
    {
      id: "detalhado",
      nome: "Lista Detalhada",
      descricao: "Todas as ocorrências",
      icon: "fa-list-ul",
      cor: "cinza",
    },
    {
      id: "mapa",
      nome: "Mapa de Ocorrências",
      descricao: "Visualização geográfica",
      icon: "fa-map-marked-alt",
      cor: "azul",
    },
    {
      id: "previsao",
      nome: "Previsão",
      descricao: "Projeção baseada em histórico",
      icon: "fa-brain",
      cor: "verde",
    },
    {
      id: "abordagens-veiculos",
      nome: "Abordagens Veículos",
      descricao: "Análise de abordagens de veículos",
      icon: "fa-motorcycle",
      cor: "azul",
    },
    {
      id: "abordagens-pessoas",
      nome: "Abordagens Pessoas",
      descricao: "Análise de abordagens de pessoas",
      icon: "fa-user-friends",
      cor: "verde",
    },
    {
      id: "abordagens-geral",
      nome: "Abordagens Geral",
      descricao: "Consolidado de todas as abordagens",
      icon: "fa-chart-bar",
      cor: "roxo",
    },
    {
      id: "eficiencia",
      nome: "Eficiência Operacional",
      descricao: "Taxa de conversão abordagens em BOs",
      icon: "fa-rocket",
      cor: "amarelo",
    },
  ];

  const coresMap = {
    azul: {
      bg: "var(--azul-muito-claro)",
      color: "var(--azul-bandeira)",
      border: "#003F87",
    },
    verde: {
      bg: "var(--verde-muito-claro)",
      color: "var(--verde-bandeira)",
      border: "#00843D",
    },
    vermelho: {
      bg: "var(--erro-claro)",
      color: "var(--erro)",
      border: "#DC2626",
    },
    amarelo: { bg: "#fef3c7", color: "var(--aviso)", border: "#F59E0B" },
    roxo: { bg: "#ede9fe", color: "#8b5cf6", border: "#8b5cf6" },
    cinza: {
      bg: "var(--cinza-claro)",
      color: "var(--cinza-medio)",
      border: "#94a3b8",
    },
  };

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <!-- Cabeçalho -->
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <h2 style="color:var(--azul-bandeira);margin:0;font-size:20px;font-weight:800;">
              <i class="fas fa-chart-pie" style="margin-right:10px;color:var(--verde-bandeira);"></i>
              Centro de Análise
            </h2>
            <p style="color:var(--cinza-medio);margin:4px 0 0 0;font-size:13px;">
              Relatórios gerenciais para tomada de decisão
            </p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <div style="display:flex;gap:4px;background:var(--branco);padding:4px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
              <input type="date" id="relatorioDataInicio" value="${dataInicio}" 
                style="padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;width:120px;">
              <span style="display:flex;align-items:center;color:var(--cinza-medio);font-size:12px;">→</span>
              <input type="date" id="relatorioDataFim" value="${dataFim}" 
                style="padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;width:120px;">
              <button onclick="window._relatoriosAplicarFiltros()" class="btn-primary" 
                style="padding:4px 10px;font-size:11px;min-height:32px;width:auto;border-radius:8px;background:var(--gradiente-principal);">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Cards de Resumo Rápido -->
      <div id="resumoRapido" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px;">
        <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px 8px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;" id="resumoTotal">-</div>
          <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px 8px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;" id="resumoFinalizadas">-</div>
          <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Finalizadas</div>
        </div>
        <div style="background:var(--aviso);border-radius:var(--border-radius);padding:10px 8px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;" id="resumoPendentes">-</div>
          <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Pendentes</div>
        </div>
        <div style="background:var(--roxo);border-radius:var(--border-radius);padding:10px 8px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;" id="resumoTaxa">-</div>
          <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Resolutividade</div>
        </div>
      </div>

      <!-- Grid de relatórios -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px;">
  `;

  relatorios.forEach((rel) => {
    const cor = coresMap[rel.cor] || coresMap.azul;
    const isDestaque = rel.destaque || false;
    html += `
      <div class="relatorio-card" onclick="window._relatoriosAbrir('${rel.id}')" 
        style="background:var(--branco);border-radius:var(--border-radius);padding:14px 12px;box-shadow:var(--sombra-suave);cursor:pointer;transition:all 0.2s ease;border-left:4px solid ${cor.border};display:flex;flex-direction:column;gap:4px;position:relative;${isDestaque ? "border-top:3px solid var(--azul-bandeira);" : ""}">
        ${isDestaque ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--azul-bandeira);color:white;font-size:8px;padding:2px 10px;border-radius:20px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">Destaque</span>` : ""}
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${cor.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fas ${rel.icon}" style="color:${cor.color};font-size:14px;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;color:var(--cinza-escuro);line-height:1.2;">${rel.nome}</div>
            <div style="font-size:10px;color:var(--cinza-medio);line-height:1.2;">${rel.descricao}</div>
          </div>
          <i class="fas fa-chevron-right" style="color:var(--cinza-claro);font-size:12px;flex-shrink:0;"></i>
        </div>
      </div>
    `;
  });

  html += `
      </div>

      <!-- Rodapé -->
      <div style="text-align:center;padding:16px 0;color:var(--cinza-medio);font-size:10px;margin-top:8px;">
        <i class="fas fa-database" style="margin-right:4px;"></i>
        Dados atualizados em tempo real
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar funções globais
  window._relatoriosVoltar = () => {
    estado.relatorioAtivo = null;
    renderRelatorios(container, appInstance);
  };

  window._relatoriosAbrir = (tipo) => {
    estado.relatorioAtivo = tipo;
    const dataInicio =
      document.getElementById("relatorioDataInicio")?.value ||
      obterPrimeiroDiaMes();
    const dataFim =
      document.getElementById("relatorioDataFim")?.value || obterDataAtual();
    estado.filtros = { dataInicio, dataFim };
    renderRelatorios(container, appInstance);
  };

  window._relatoriosAplicarFiltros = () => {
    const dataInicio = document.getElementById("relatorioDataInicio")?.value;
    const dataFim = document.getElementById("relatorioDataFim")?.value;
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
      dataInicio: dataInicio || obterPrimeiroDiaMes(),
      dataFim: dataFim || obterDataAtual(),
    };
    if (estado.relatorioAtivo) {
      renderRelatorios(container, appInstance);
    } else {
      carregarResumoRapido(appInstance);
    }
  };

  window._relatoriosExportarAtual = () => {
    if (estado.relatorioAtivo) {
      exportarRelatorioPDF(estado.relatorioAtivo, appInstance);
    }
  };

  window._relatoriosVerDetalhes = (id) => {
    if (appInstance && appInstance.navigateTo) {
      appInstance.navigateTo("detalhe-ocorrencia", { id });
    }
  };

  carregarResumoRapido(appInstance);
}

// ============================================
// CARREGAR RESUMO RÁPIDO
// ============================================

async function carregarResumoRapido(appInstance) {
  try {
    const dataInicio =
      estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
    const dataFim = estado.filtros.dataFim || (await obterDataAtual());
    const ocorrencias = await buscarOcorrenciasPeriodo(dataInicio, dataFim);
    const stats = calcularEstatisticas(ocorrencias);
    const total = stats.total || 1;
    const taxa = ((stats.finalizadas / total) * 100).toFixed(1);

    document.getElementById("resumoTotal").textContent = total;
    document.getElementById("resumoFinalizadas").textContent =
      stats.finalizadas;
    document.getElementById("resumoPendentes").textContent = stats.pendentes;
    document.getElementById("resumoTaxa").textContent = `${taxa}%`;
  } catch (error) {
    console.warn("Erro ao carregar resumo rápido:", error);
  }
}

// ============================================
// RENDER LOADER
// ============================================

function renderLoader(mensagem = "Carregando...") {
  return `
    <div class="container" style="text-align:center;padding:60px 20px;">
      <div class="spinner-azul" style="margin:0 auto;width:40px;height:40px;border-width:4px;"></div>
      <p style="margin-top:16px;color:var(--cinza-medio);font-weight:500;">${mensagem}</p>
    </div>
  `;
}

function renderAcessoNegado(appInstance) {
  return `
    <div class="container">
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-lock"></i>
        </div>
        <p style="font-weight:500;">Acesso restrito a supervisores</p>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;border-radius:12px;">
          Voltar
        </button>
      </div>
    </div>
  `;
}

// ============================================
// RENDER RELATÓRIO DETALHADO
// ============================================

export async function renderRelatorioDetalhado(container, tipo, appInstance) {
  const dataInicio = estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
  const dataFim = estado.filtros.dataFim || (await obterDataAtual());

  estado.isLoading = true;
  container.innerHTML = renderLoader("Carregando relatório...");

  try {
    const ocorrencias = await buscarOcorrenciasPeriodo(dataInicio, dataFim);
    const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
    estado.dadosCache = ocorrencias;
    estado.abordagensCache = abordagens;

    const titulos = {
      executivo: {
        nome: "Relatório Executivo",
        icone: "fa-chart-pie",
        cor: "#003F87",
      },
      "por-tipo": {
        nome: "Ocorrências por Tipo",
        icone: "fa-tag",
        cor: "#00843D",
      },
      "por-local": {
        nome: "Ocorrências por Localidade",
        icone: "fa-map-marker-alt",
        cor: "#DC2626",
      },
      atendimento: {
        nome: "Tempo Médio de Atendimento",
        icone: "fa-clock",
        cor: "#F59E0B",
      },
      desempenho: {
        nome: "Desempenho por Guarda",
        icone: "fa-user-tie",
        cor: "#8b5cf6",
      },
      retificacoes: {
        nome: "Relatório de Retificações",
        icone: "fa-sync-alt",
        cor: "#003F87",
      },
      cancelamentos: {
        nome: "Relatório de Cancelamentos",
        icone: "fa-times-circle",
        cor: "#DC2626",
      },
      tendencias: {
        nome: "Tendências e Sazonalidade",
        icone: "fa-chart-line",
        cor: "#00843D",
      },
      produtividade: {
        nome: "Produtividade do Setor",
        icone: "fa-rocket",
        cor: "#003F87",
      },
      detalhado: {
        nome: "Ocorrências Detalhado",
        icone: "fa-list-ul",
        cor: "#6b7280",
      },
      mapa: {
        nome: "Mapa de Ocorrências",
        icone: "fa-map-marked-alt",
        cor: "#003F87",
      },
      "por-guarda": {
        nome: "Ocorrências por Guarda",
        icone: "fa-user-shield",
        cor: "#8b5cf6",
      },
      previsao: {
        nome: "Previsão de Ocorrências",
        icone: "fa-brain",
        cor: "#00843D",
      },
      "abordagens-veiculos": {
        nome: "Abordagens de Veículos",
        icone: "fa-motorcycle",
        cor: "#003F87",
      },
      "abordagens-pessoas": {
        nome: "Abordagens de Pessoas",
        icone: "fa-user-friends",
        cor: "#00843D",
      },
      "abordagens-geral": {
        nome: "Abordagens Geral",
        icone: "fa-chart-bar",
        cor: "#8b5cf6",
      },
      eficiencia: {
        nome: "Eficiência Operacional",
        icone: "fa-rocket",
        cor: "#F59E0B",
      },
    };

    const info = titulos[tipo] || {
      nome: tipo,
      icone: "fa-file-alt",
      cor: "#6b7280",
    };

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <!-- Cabeçalho com botão de exportação -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${info.cor}20;display:flex;align-items:center;justify-content:center;">
              <i class="fas ${info.icone}" style="color:${info.cor};font-size:18px;"></i>
            </div>
            <div>
              <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;font-weight:700;">${info.nome}</h2>
              <p style="color:var(--cinza-medio);margin:0;font-size:12px;">
                <i class="fas fa-calendar" style="margin-right:4px;"></i>
                ${formatarData(dataInicio)} até ${formatarData(dataFim)}
              </p>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button onclick="window._relatoriosExportarAtual()" class="btn-primary" 
              style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--verde-bandeira);">
              <i class="fas fa-file-pdf" style="margin-right:6px;"></i> Exportar PDF
            </button>
            <button onclick="window._relatoriosVoltar()" class="btn-secondary" 
              style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--cinza-claro);color:var(--cinza-escuro);">
              <i class="fas fa-arrow-left"></i> Voltar
            </button>
          </div>
        </div>
    `;

    let conteudo = "";

    switch (tipo) {
      case "executivo":
        conteudo = await renderConteudoExecutivo(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "por-tipo":
        conteudo = await renderConteudoPorTipo(ocorrencias);
        break;
      case "por-local":
        conteudo = await renderConteudoPorLocal(ocorrencias);
        break;
      case "atendimento":
        conteudo = await renderConteudoAtendimento(ocorrencias);
        break;
      case "desempenho":
        conteudo = await renderConteudoDesempenho(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "retificacoes":
        conteudo = await renderConteudoRetificacoes(ocorrencias);
        break;
      case "cancelamentos":
        conteudo = await renderConteudoCancelamentos(ocorrencias);
        break;
      case "tendencias":
        conteudo = await renderConteudoTendencias(ocorrencias);
        break;
      case "produtividade":
        conteudo = await renderConteudoProdutividade(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "detalhado":
        conteudo = await renderConteudoDetalhado(ocorrencias);
        break;
      case "mapa":
        conteudo = await renderConteudoMapa(
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "por-guarda":
        conteudo = await renderConteudoPorGuarda(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "previsao":
        conteudo = await renderConteudoPrevisao(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "abordagens-veiculos":
        conteudo = await renderConteudoAbordagensVeiculos(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "abordagens-pessoas":
        conteudo = await renderConteudoAbordagensPessoas(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "abordagens-geral":
        conteudo = await renderConteudoAbordagensGeral(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "eficiencia":
        conteudo = await renderConteudoEficiencia(
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      default:
        conteudo = `<p style="text-align:center;padding:40px;color:var(--cinza-medio);">Relatório não encontrado</p>`;
    }

    html += conteudo;
    html += `</div>`;
    container.innerHTML = html;

    estado.isLoading = false;

    setTimeout(() => {
      inicializarGraficos(tipo, container);
    }, 300);
  } catch (error) {
    console.error("Erro ao renderizar relatório:", error);
    estado.isLoading = false;
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar relatório</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="window._relatoriosVoltar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
          Voltar
        </button>
      </div>
    `;
  }
}

// ============================================
// CONTEÚDO - RELATÓRIO EXECUTIVO
// ============================================

async function renderConteudoExecutivo(ocorrencias, dataInicio, dataFim) {
  const stats = calcularEstatisticas(ocorrencias);
  const porTipo = agruparPorTipo(ocorrencias);
  const porMes = agruparPorMes(ocorrencias);
  const total = stats.total || 1;
  const taxaResolutividade = ((stats.finalizadas / total) * 100).toFixed(1);
  const mediaDiaria = calcularMediaDiaria(ocorrencias, dataInicio, dataFim);

  const topTipos = porTipo.slice(0, 5);

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:12px 8px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${total}</div>
        <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Total de Ocorrências</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:12px 8px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${stats.finalizadas}</div>
        <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Finalizadas</div>
      </div>
      <div style="background:var(--aviso);border-radius:var(--border-radius);padding:12px 8px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${stats.pendentes}</div>
        <div style="font-size:9px;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px;">Pendentes</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);text-align:center;">
        <div style="font-size:20px;font-weight:800;color:var(--verde-bandeira);">${taxaResolutividade}%</div>
        <div style="font-size:10px;color:var(--cinza-medio);font-weight:500;">Taxa de Resolutividade</div>
        <div style="font-size:9px;color:var(--cinza-medio);margin-top:2px;">
          ${taxaResolutividade >= 70 ? "✅ Excelente" : taxaResolutividade >= 50 ? "⚠️ Moderada" : "❌ Baixa"}
        </div>
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);text-align:center;">
        <div style="font-size:20px;font-weight:800;color:var(--azul-bandeira);">${mediaDiaria}</div>
        <div style="font-size:10px;color:var(--cinza-medio);font-weight:500;">Média Diária</div>
        <div style="font-size:9px;color:var(--cinza-medio);margin-top:2px;">
          ${mediaDiaria > 10 ? "📈 Alta demanda" : mediaDiaria > 5 ? "📊 Demanda média" : "📉 Baixa demanda"}
        </div>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="color:var(--azul-bandeira);margin:0;font-size:13px;font-weight:700;">
          <i class="fas fa-chart-pie" style="margin-right:6px;"></i>
          Distribuição por Tipo
        </h4>
        <span style="font-size:10px;color:var(--cinza-medio);">${porTipo.length} tipos</span>
      </div>
      <p style="font-size:11px;color:var(--cinza-medio);margin-bottom:10px;">
        Os tipos mais frequentes de ocorrências registradas no período.
      </p>
      <div style="height:180px;">
        <canvas id="chartExecutivoPizza"></canvas>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${topTipos
          .map(
            (t) => `
          <span style="background:var(--azul-muito-claro);color:var(--azul-bandeira);padding:2px 10px;border-radius:12px;font-size:9px;font-weight:600;">
            ${t.tipo}: ${t.total} (${t.percentual}%)
          </span>
        `,
          )
          .join("")}
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="color:var(--azul-bandeira);margin:0;font-size:13px;font-weight:700;">
          <i class="fas fa-chart-bar" style="margin-right:6px;"></i>
          Evolução Mensal
        </h4>
        <span style="font-size:10px;color:var(--cinza-medio);">${porMes.length} meses</span>
      </div>
      <p style="font-size:11px;color:var(--cinza-medio);margin-bottom:10px;">
        Tendência de ocorrências ao longo dos meses analisados.
      </p>
      <div style="height:150px;">
        <canvas id="chartExecutivoMensal"></canvas>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-table" style="margin-right:6px;"></i>
        Detalhamento por Tipo
      </h4>
      <div class="table-wrapper" style="max-height:200px;overflow-y:auto;">
        <table style="font-size:12px;width:100%;">
          <thead>
            <tr style="background:var(--cinza-claro);">
              <th style="padding:6px 8px;text-align:left;">Tipo</th>
              <th style="padding:6px 8px;text-align:center;">Total</th>
              <th style="padding:6px 8px;text-align:center;">%</th>
              <th style="padding:6px 8px;text-align:center;">Finalizadas</th>
            </tr>
          </thead>
          <tbody>
            ${porTipo
              .map(
                (t) => `
              <tr style="border-bottom:1px solid var(--cinza-claro);">
                <td style="padding:4px 8px;font-size:11px;">${t.tipo}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:600;">${t.total}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                <td style="padding:4px 8px;text-align:center;color:var(--verde-bandeira);">${t.finalizadas}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO POR TIPO
// ============================================

async function renderConteudoPorTipo(ocorrencias) {
  const porTipo = agruparPorTipo(ocorrencias);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Análise detalhada da distribuição das ocorrências por tipo, mostrando quantitativos e taxas de finalização.
        </p>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
      ${porTipo
        .map(
          (t) => `
        <span style="background:${t.percentual > 20 ? "var(--azul-bandeira)" : "var(--azul-muito-claro)"};color:${t.percentual > 20 ? "white" : "var(--azul-bandeira)"};padding:4px 14px;border-radius:20px;font-size:11px;font-weight:600;">
          ${t.tipo}: ${t.total} (${t.percentual}%)
        </span>
      `,
        )
        .join("")}
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-table" style="margin-right:6px;"></i>
        Detalhamento Completo
      </h4>
      <div class="table-wrapper">
        <table style="font-size:12px;width:100%;">
          <thead>
            <tr style="background:var(--cinza-claro);">
              <th style="padding:6px 8px;text-align:left;">Tipo</th>
              <th style="padding:6px 8px;text-align:center;">Total</th>
              <th style="padding:6px 8px;text-align:center;">%</th>
              <th style="padding:6px 8px;text-align:center;">Finalizadas</th>
              <th style="padding:6px 8px;text-align:center;">Pendentes</th>
              <th style="padding:6px 8px;text-align:center;">Taxa</th>
            </tr>
          </thead>
          <tbody>
            ${porTipo
              .map(
                (t) => `
              <tr style="border-bottom:1px solid var(--cinza-claro);">
                <td style="padding:4px 8px;font-weight:500;">${t.tipo}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:600;">${t.total}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                <td style="padding:4px 8px;text-align:center;color:var(--verde-bandeira);">${t.finalizadas}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--aviso);">${t.pendentes}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:600;color:${(t.finalizadas / t.total) * 100 >= 70 ? "var(--verde-bandeira)" : "var(--aviso)"};">${((t.finalizadas / t.total) * 100).toFixed(0)}%</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO POR LOCAL
// ============================================

async function renderConteudoPorLocal(ocorrencias) {
  const porBairro = agruparPorBairro(ocorrencias);
  const topBairros = porBairro.slice(0, 8);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Distribuição geográfica das ocorrências por bairro/locallidade.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      ${topBairros
        .map(
          (b, index) => `
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-weight:700;color:${index < 3 ? "var(--azul-bandeira)" : "var(--cinza-medio)"};min-width:20px;font-size:12px;">${index + 1}º</span>
            <span style="font-weight:500;font-size:12px;">${b.bairro}</span>
          </div>
          <span style="font-weight:700;color:var(--azul-bandeira);font-size:14px;">${b.total}</span>
        </div>
      `,
        )
        .join("")}
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-chart-bar" style="margin-right:6px;"></i>
        Distribuição por Bairro
      </h4>
      <p style="font-size:11px;color:var(--cinza-medio);margin-bottom:10px;">
        Concentração de ocorrências por localidade.
      </p>
      <div style="height:200px;">
        <canvas id="chartLocalBairros"></canvas>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE ATENDIMENTO
// ============================================

async function renderConteudoAtendimento(ocorrencias) {
  const comTempo = ocorrencias.filter(
    (o) => o.data_hora_inicio && o.data_hora_encerramento,
  );
  const tempos = comTempo
    .map((o) => {
      const inicio = new Date(o.data_hora_inicio);
      const fim = new Date(o.data_hora_encerramento);
      return { ...o, tempoMinutos: (fim - inicio) / (1000 * 60) };
    })
    .filter((t) => t.tempoMinutos > 0);

  const mediaGeral =
    tempos.length > 0
      ? tempos.reduce((s, t) => s + t.tempoMinutos, 0) / tempos.length
      : 0;

  const porTipo = {};
  tempos.forEach((t) => {
    const tipo = t.tipo_ocorrencia || "Não informado";
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(t.tempoMinutos);
  });

  const mediaPorTipo = Object.keys(porTipo)
    .map((key) => ({
      tipo: getTipoLabel(key),
      media: porTipo[key].reduce((s, v) => s + v, 0) / porTipo[key].length,
      total: porTipo[key].length,
      rapido: porTipo[key].filter((t) => t < 15).length,
      lento: porTipo[key].filter((t) => t > 60).length,
    }))
    .sort((a, b) => b.media - a.media);

  const formatarTempo = (minutos) => {
    if (minutos < 1) return "< 1 min";
    if (minutos < 60) return `${Math.round(minutos)} min`;
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return `${horas}h ${mins}min`;
  };

  const rapido = tempos.filter((t) => t.tempoMinutos < 15).length;
  const medio = tempos.filter(
    (t) => t.tempoMinutos >= 15 && t.tempoMinutos <= 45,
  ).length;
  const lento = tempos.filter((t) => t.tempoMinutos > 45).length;

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Análise do tempo médio de atendimento das ocorrências, indicando eficiência operacional.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:18px;font-weight:800;">${formatarTempo(mediaGeral)}</div>
        <div style="font-size:9px;opacity:0.8;">Tempo Médio</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:18px;font-weight:800;">${rapido}</div>
        <div style="font-size:9px;opacity:0.8;">Rápidos (<15min)</div>
      </div>
      <div style="background:var(--erro);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:18px;font-weight:800;">${lento}</div>
        <div style="font-size:9px;opacity:0.8;">Lentos (>45min)</div>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-chart-bar" style="margin-right:6px;"></i>
        Tempo Médio por Tipo
      </h4>
      <div class="table-wrapper">
        <table style="font-size:12px;width:100%;">
          <thead>
            <tr style="background:var(--cinza-claro);">
              <th style="padding:6px 8px;text-align:left;">Tipo</th>
              <th style="padding:6px 8px;text-align:center;">Média</th>
              <th style="padding:6px 8px;text-align:center;">Total</th>
              <th style="padding:6px 8px;text-align:center;">Rápidos</th>
              <th style="padding:6px 8px;text-align:center;">Lentos</th>
            </tr>
          </thead>
          <tbody>
            ${mediaPorTipo
              .map(
                (t) => `
              <tr style="border-bottom:1px solid var(--cinza-claro);">
                <td style="padding:4px 8px;">${t.tipo}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:600;color:var(--azul-bandeira);">${formatarTempo(t.media)}</td>
                <td style="padding:4px 8px;text-align:center;">${t.total}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--verde-bandeira);">${t.rapido}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--erro);">${t.lento}</td>
              </tr>
            `,
              )
              .join("")}
            ${
              mediaPorTipo.length === 0
                ? `
              <tr>
                <td colspan="5" style="text-align:center;color:var(--cinza-medio);padding:16px;">
                  Nenhuma ocorrência com tempo registrado
                </td>
              </tr>
            `
                : ""
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE DESEMPENHO
// ============================================

async function renderConteudoDesempenho(ocorrencias, dataInicio, dataFim) {
  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  let usuarios = [];
  if (client) {
    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo, matricula, perfil")
      .eq("status", "ativo");
    if (!error) usuarios = data || [];
  }

  const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
  const todasAbordagens = [
    ...abordagens.veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
    ...abordagens.pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
  ];

  const desempenho = {};
  usuarios.forEach((u) => {
    desempenho[u.id] = {
      id: u.id,
      nome: u.nome_completo,
      matricula: u.matricula || "-",
      perfil: u.perfil,
      ocorrencias: { total: 0, finalizadas: 0, pendentes: 0, canceladas: 0 },
      abordagens: { total: 0, veiculos: 0, pessoas: 0 },
      taxa_resolucao: 0,
      total_atendimentos: 0,
    };
  });

  ocorrencias.forEach((o) => {
    const id = o.criado_por;
    if (desempenho[id]) {
      desempenho[id].ocorrencias.total++;
      if (o.status === "synced") desempenho[id].ocorrencias.finalizadas++;
      if (o.status === "pending_sync") desempenho[id].ocorrencias.pendentes++;
      if (o.status === "cancelled") desempenho[id].ocorrencias.canceladas++;
    }
  });

  todasAbordagens.forEach((a) => {
    const id = a.criado_por;
    if (desempenho[id]) {
      desempenho[id].abordagens.total++;
      if (a.tipo_abordagem === "veiculo") desempenho[id].abordagens.veiculos++;
      else desempenho[id].abordagens.pessoas++;
    }
  });

  Object.values(desempenho).forEach((d) => {
    d.taxa_resolucao =
      d.ocorrencias.total > 0
        ? ((d.ocorrencias.finalizadas / d.ocorrencias.total) * 100).toFixed(1)
        : 0;
    d.total_atendimentos = d.ocorrencias.total + d.abordagens.total;
  });

  const ranking = Object.values(desempenho).sort(
    (a, b) => b.total_atendimentos - a.total_atendimentos,
  );
  const top5 = ranking.slice(0, 5);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Ranking de desempenho dos guardas, considerando ocorrências e abordagens realizadas.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      ${top5
        .map(
          (d, i) => `
        <div style="background:${i === 0 ? "var(--gradiente-principal)" : i === 1 ? "var(--azul-bandeira)" : "var(--azul-escuro)"};border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}</div>
          <div style="font-size:11px;font-weight:600;margin-top:2px;">${d.nome}</div>
          <div style="font-size:14px;font-weight:800;margin-top:4px;">${d.total_atendimentos}</div>
          <div style="font-size:8px;opacity:0.7;">atendimentos</div>
        </div>
      `,
        )
        .join("")}
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-trophy" style="margin-right:6px;"></i>
        Ranking Completo
      </h4>
      <div class="table-wrapper">
        <table style="font-size:12px;width:100%;">
          <thead>
            <tr style="background:var(--cinza-claro);">
              <th style="padding:6px 8px;text-align:center;">#</th>
              <th style="padding:6px 8px;text-align:left;">Guarda</th>
              <th style="padding:6px 8px;text-align:center;">Ocorr.</th>
              <th style="padding:6px 8px;text-align:center;">Final.</th>
              <th style="padding:6px 8px;text-align:center;">Taxa</th>
              <th style="padding:6px 8px;text-align:center;">Abord.</th>
              <th style="padding:6px 8px;text-align:center;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${ranking
              .map(
                (d, i) => `
              <tr style="border-bottom:1px solid var(--cinza-claro);">
                <td style="padding:4px 8px;text-align:center;font-weight:700;color:${i < 3 ? "var(--azul-bandeira)" : "var(--cinza-medio)"};">${i + 1}</td>
                <td style="padding:4px 8px;font-weight:500;">${d.nome}</td>
                <td style="padding:4px 8px;text-align:center;">${d.ocorrencias.total}</td>
                <td style="padding:4px 8px;text-align:center;color:var(--verde-bandeira);">${d.ocorrencias.finalizadas}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:600;color:${d.taxa_resolucao >= 70 ? "var(--verde-bandeira)" : "var(--aviso)"};">${d.taxa_resolucao}%</td>
                <td style="padding:4px 8px;text-align:center;">${d.abordagens.total}</td>
                <td style="padding:4px 8px;text-align:center;font-weight:700;color:var(--azul-bandeira);">${d.total_atendimentos}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE RETIFICAÇÕES
// ============================================

async function renderConteudoRetificacoes(ocorrencias) {
  const retificacoes = ocorrencias.filter((o) => o.status === "rectified");
  const pendentes = ocorrencias.filter(
    (o) => o.status === "pending_rectification",
  );
  const rejeitadas = ocorrencias.filter(
    (o) => o.status === "rectification_rejected",
  );

  const camposMaisAlterados = {};
  retificacoes.forEach((r) => {
    if (r.campos_alterados) {
      try {
        JSON.parse(r.campos_alterados).forEach((c) => {
          const label = c.label || c.campo;
          if (!camposMaisAlterados[label]) camposMaisAlterados[label] = 0;
          camposMaisAlterados[label]++;
        });
      } catch (e) {}
    }
  });

  const topCampos = Object.keys(camposMaisAlterados)
    .map((key) => ({ campo: key, total: camposMaisAlterados[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Acompanhamento das solicitações de retificação, com status e campos mais alterados.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${retificacoes.length}</div>
        <div style="font-size:9px;opacity:0.8;">Aprovadas</div>
      </div>
      <div style="background:var(--aviso);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${pendentes.length}</div>
        <div style="font-size:9px;opacity:0.8;">Pendentes</div>
      </div>
      <div style="background:var(--erro);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${rejeitadas.length}</div>
        <div style="font-size:9px;opacity:0.8;">Rejeitadas</div>
      </div>
    </div>

    ${
      topCampos.length > 0
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
        <h4 style="color:var(--azul-bandeira);margin:0 0 6px 0;font-size:13px;font-weight:700;">
          <i class="fas fa-edit" style="margin-right:6px;"></i>
          Campos Mais Alterados
        </h4>
        ${topCampos
          .map(
            (c) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
            <span>${c.campo}</span>
            <span style="font-weight:700;color:var(--azul-bandeira);">${c.total} vez(es)</span>
          </div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-list" style="margin-right:6px;"></i>
        Últimas Retificações
      </h4>
      ${retificacoes
        .slice(0, 10)
        .map(
          (r) => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
          <span>#${r.numero_ocorrencia || r.numero_temporario || "N/A"}</span>
          <span style="color:var(--cinza-medio);">${formatarData(r.criado_em)}</span>
          <span style="color:var(--verde-bandeira);font-weight:600;">✓ Aprovada</span>
        </div>
      `,
        )
        .join("")}
      ${
        retificacoes.length === 0
          ? `
        <p style="text-align:center;color:var(--cinza-medio);padding:16px;font-size:13px;">
          Nenhuma retificação no período
        </p>
      `
          : ""
      }
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE CANCELAMENTOS
// ============================================

async function renderConteudoCancelamentos(ocorrencias) {
  const canceladas = ocorrencias.filter((o) => o.status === "cancelled");

  const motivos = {};
  canceladas.forEach((o) => {
    const motivo = o.motivo_cancelamento || "Não informado";
    if (!motivos[motivo]) motivos[motivo] = 0;
    motivos[motivo]++;
  });

  const topMotivos = Object.keys(motivos)
    .map((key) => ({ motivo: key, total: motivos[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Análise das ocorrências canceladas e principais motivos.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--erro);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${canceladas.length}</div>
        <div style="font-size:9px;opacity:0.8;">Total Canceladas</div>
      </div>
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${ocorrencias.length > 0 ? ((canceladas.length / ocorrencias.length) * 100).toFixed(1) : 0}%</div>
        <div style="font-size:9px;opacity:0.8;">Taxa de Cancelamento</div>
      </div>
    </div>

    ${
      topMotivos.length > 0
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 6px 0;font-size:13px;font-weight:700;">
          <i class="fas fa-list" style="margin-right:6px;"></i>
          Principais Motivos
        </h4>
        ${topMotivos
          .map(
            (m) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
            <span>${m.motivo}</span>
            <span style="font-weight:700;color:var(--erro);">${m.total}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE TENDÊNCIAS
// ============================================

async function renderConteudoTendencias(ocorrencias) {
  const porDiaSemana = {};
  const porHora = {};
  const porMes = agruparPorMes(ocorrencias);

  ocorrencias.forEach((o) => {
    const data = new Date(o.criado_em);
    const diaSemana = data.getDay();
    const hora = data.getHours();
    if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = 0;
    porDiaSemana[diaSemana]++;
    if (!porHora[hora]) porHora[hora] = 0;
    porHora[hora]++;
  });

  const dadosDiaSemana = Object.keys(porDiaSemana)
    .map((key) => ({
      dia: DIAS_SEMANA[parseInt(key)],
      total: porDiaSemana[key],
    }))
    .sort((a, b) => DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia));

  const dadosHora = Object.keys(porHora)
    .map((key) => ({ hora: parseInt(key), total: porHora[key] }))
    .sort((a, b) => a.hora - b.hora);

  const diaPico =
    dadosDiaSemana.length > 0
      ? dadosDiaSemana.reduce((a, b) => (a.total > b.total ? a : b))
      : null;
  const horaPico =
    dadosHora.length > 0
      ? dadosHora.reduce((a, b) => (a.total > b.total ? a : b))
      : null;

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Padrões temporais das ocorrências: dias da semana e horários de maior incidência.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:16px;font-weight:800;">${diaPico ? diaPico.dia : "-"}</div>
        <div style="font-size:9px;opacity:0.8;">Dia de Pico</div>
        ${diaPico ? `<div style="font-size:9px;opacity:0.7;">${diaPico.total} ocorrências</div>` : ""}
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:16px;font-weight:800;">${horaPico ? `${String(horaPico.hora).padStart(2, "0")}:00h` : "-"}</div>
        <div style="font-size:9px;opacity:0.8;">Horário de Pico</div>
        ${horaPico ? `<div style="font-size:9px;opacity:0.7;">${horaPico.total} ocorrências</div>` : ""}
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-chart-bar" style="margin-right:6px;"></i>
        Evolução Mensal
      </h4>
      <div style="height:140px;">
        <canvas id="chartTendenciasMensal"></canvas>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:12px;font-weight:700;">
          <i class="fas fa-calendar-week"></i> Dias da Semana
        </h4>
        <div style="height:110px;">
          <canvas id="chartTendenciasDiaSemana"></canvas>
        </div>
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:12px;font-weight:700;">
          <i class="fas fa-clock"></i> Horas do Dia
        </h4>
        <div style="height:110px;">
          <canvas id="chartTendenciasHora"></canvas>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE PRODUTIVIDADE
// ============================================

async function renderConteudoProdutividade(ocorrencias, dataInicio, dataFim) {
  const total = ocorrencias.length;
  const finalizadas = ocorrencias.filter((o) => o.status === "synced").length;
  const totalDias = calcularDiasPeriodo(dataInicio, dataFim);
  const mediaDiaria = totalDias > 0 ? total / totalDias : 0;
  const projecaoMensal = mediaDiaria * 30;

  const dataAnteriorInicio = calcularDataAnterior(dataInicio, dataFim);
  const ocorrenciasAnterior = await buscarOcorrenciasPeriodo(
    dataAnteriorInicio,
    dataInicio,
  );
  const totalAnterior = ocorrenciasAnterior.length;
  const variacao =
    totalAnterior > 0
      ? (((total - totalAnterior) / totalAnterior) * 100).toFixed(1)
      : 0;

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Métricas de produtividade: volume de ocorrências, média diária e projeções.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${total}</div>
        <div style="font-size:9px;opacity:0.8;">Total de Ocorrências</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${mediaDiaria.toFixed(1)}</div>
        <div style="font-size:9px;opacity:0.8;">Média Diária</div>
      </div>
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${projecaoMensal.toFixed(0)}</div>
        <div style="font-size:9px;opacity:0.8;">Projeção Mensal</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);text-align:center;">
        <div style="font-size:18px;font-weight:800;color:${variacao >= 0 ? "var(--verde-bandeira)" : "var(--erro)"};">${variacao >= 0 ? "+" : ""}${variacao}%</div>
        <div style="font-size:10px;color:var(--cinza-medio);">Variação vs Período Anterior</div>
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);text-align:center;">
        <div style="font-size:18px;font-weight:800;color:var(--verde-bandeira);">${totalDias}</div>
        <div style="font-size:10px;color:var(--cinza-medio);">Dias Analisados</div>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-info-circle" style="margin-right:6px;"></i>
        Resumo do Período
      </h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">
        <div><span style="color:var(--cinza-medio);">Finalizadas:</span> <strong>${finalizadas}</strong></div>
        <div><span style="color:var(--cinza-medio);">Pendentes:</span> <strong>${ocorrencias.filter((o) => o.status === "pending_sync").length}</strong></div>
        <div><span style="color:var(--cinza-medio);">Canceladas:</span> <strong>${ocorrencias.filter((o) => o.status === "cancelled").length}</strong></div>
        <div><span style="color:var(--cinza-medio);">Taxa Resolução:</span> <strong>${total > 0 ? ((finalizadas / total) * 100).toFixed(1) : 0}%</strong></div>
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DETALHADO
// ============================================

async function renderConteudoDetalhado(ocorrencias) {
  const porTipo = agruparPorTipo(ocorrencias);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Listagem completa de todas as ocorrências do período, com todos os campos.
        </p>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
      ${porTipo
        .slice(0, 5)
        .map(
          (t) => `
        <span class="badge" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:10px;padding:2px 12px;">
          ${t.tipo}: ${t.total}
        </span>
      `,
        )
        .join("")}
      <span style="font-size:10px;color:var(--cinza-medio);">+ ${porTipo.length - 5} outros tipos</span>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
      <div class="table-wrapper" style="max-height:400px;overflow-y:auto;">
        <table style="font-size:11px;width:100%;">
          <thead>
            <tr style="background:var(--cinza-claro);position:sticky;top:0;z-index:1;">
              <th style="padding:6px 8px;text-align:left;">Nº</th>
              <th style="padding:6px 8px;text-align:left;">Data</th>
              <th style="padding:6px 8px;text-align:left;">Tipo</th>
              <th style="padding:6px 8px;text-align:left;">Local</th>
              <th style="padding:6px 8px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${ocorrencias
              .map(
                (o) => `
              <tr onclick="window._relatoriosVerDetalhes('${o.id}')" style="border-bottom:1px solid var(--cinza-claro);cursor:pointer;">
                <td style="padding:4px 8px;font-weight:600;color:var(--azul-bandeira);">${o.numero_ocorrencia || o.numero_temporario || "Rascunho"}</td>
                <td style="padding:4px 8px;font-size:10px;color:var(--cinza-medio);">${formatarData(o.criado_em)}</td>
                <td style="padding:4px 8px;">${getTipoLabel(o.tipo_ocorrencia)}</td>
                <td style="padding:4px 8px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.local_ocorrencia || "-"}</td>
                <td style="padding:4px 8px;text-align:center;"><span class="badge badge-${getStatusClass(o.status)}" style="font-size:9px;">${getStatusLabel(o.status)}</span></td>
              </tr>
            `,
              )
              .join("")}
            ${
              ocorrencias.length === 0
                ? `
              <tr>
                <td colspan="5" style="text-align:center;color:var(--cinza-medio);padding:20px;">
                  Nenhuma ocorrência no período
                </td>
              </tr>
            `
                : ""
            }
          </tbody>
        </table>
      </div>
      ${
        ocorrencias.length > 0
          ? `
        <div style="padding:8px 0;font-size:11px;color:var(--cinza-medio);text-align:center;">
          Total: ${ocorrencias.length} ocorrência(s)
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO MAPA
// ============================================

async function renderConteudoMapa(
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const dadosMapa = ocorrencias
    .filter((o) => o.latitude && o.longitude)
    .map((o) => ({
      id: o.id,
      latitude: o.latitude,
      longitude: o.longitude,
      tipo: o.tipo_ocorrencia,
      status: o.status,
      local: o.local_ocorrencia,
      data: o.criado_em,
      numero: o.numero_ocorrencia || o.numero_temporario || "Rascunho",
      criador: o.criador || { nome_completo: "Desconhecido" },
    }));

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Visualização geográfica das ocorrências com localização registrada.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${dadosMapa.length}</div>
        <div style="font-size:9px;opacity:0.8;">Com Localização</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${new Set(dadosMapa.map((o) => o.tipo)).size}</div>
        <div style="font-size:9px;opacity:0.8;">Tipos Diferentes</div>
      </div>
    </div>

    <div id="mapaContainer" class="mapa-container" style="width:100%;height:350px;border-radius:var(--border-radius);overflow:hidden;box-shadow:var(--sombra-suave);position:relative;background:#f1f5f9;border:2px solid var(--cinza-claro);">
      ${
        dadosMapa.length === 0
          ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
          <i class="fas fa-map" style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;"></i>
          <p>Nenhuma ocorrência com localização encontrada</p>
        </div>
      `
          : `
        <div class="mapa-loading" id="mapaLoading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--cinza-medio);z-index:1;pointer-events:none;">
          <div class="spinner" style="width:32px;height:32px;border:3px solid var(--cinza-claro);border-top-color:var(--azul-bandeira);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span>Carregando mapa...</span>
        </div>
      `
      }
    </div>

    ${
      dadosMapa.length > 0
        ? `
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding:6px 10px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <span style="font-size:9px;color:var(--cinza-medio);"><i class="fas fa-circle" style="color:#00ff00;"></i> Baixa</span>
        <span style="font-size:9px;color:var(--cinza-medio);"><i class="fas fa-circle" style="color:#ffff00;"></i> Média</span>
        <span style="font-size:9px;color:var(--cinza-medio);"><i class="fas fa-circle" style="color:#ff0000;"></i> Alta</span>
        <span style="font-size:9px;color:var(--cinza-medio);margin-left:auto;">${dadosMapa.length} ocorrências</span>
      </div>
    `
        : ""
    }
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO POR GUARDA
// ============================================

async function renderConteudoPorGuarda(ocorrencias, dataInicio, dataFim) {
  const criadoresIds = [...new Set(ocorrencias.map((o) => o.criado_por))];
  const dadosUsuarios = await buscarDadosUsuariosEmLote(criadoresIds);

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  let abordagens = [];
  if (client) {
    try {
      const [veiculosResult, pessoasResult] = await Promise.all([
        client
          .from("abordagens_veiculos")
          .select("*")
          .gte("criado_em", dataInicio)
          .lte("criado_em", dataFim + "T23:59:59"),
        client
          .from("abordagens_pessoas")
          .select("*")
          .gte("criado_em", dataInicio)
          .lte("criado_em", dataFim + "T23:59:59"),
      ]);
      abordagens = [
        ...(veiculosResult.data || []).map((v) => ({
          ...v,
          tipo_abordagem: "veiculo",
        })),
        ...(pessoasResult.data || []).map((p) => ({
          ...p,
          tipo_abordagem: "pessoa",
        })),
      ];
    } catch (e) {
      console.warn("Erro ao buscar abordagens:", e);
    }
  }

  const agrupado = {};
  ocorrencias.forEach((o) => {
    const id = o.criado_por;
    const nome = dadosUsuarios[id]?.nome_completo || "Usuário não identificado";
    if (!agrupado[id])
      agrupado[id] = { nome, total: 0, tipos: {}, abordagens: 0 };
    agrupado[id].total++;
    const tipo = getTipoLabel(o.tipo_ocorrencia);
    agrupado[id].tipos[tipo] = (agrupado[id].tipos[tipo] || 0) + 1;
  });

  abordagens.forEach((a) => {
    const id = a.criado_por;
    if (agrupado[id]) agrupado[id].abordagens++;
  });

  const ranking = Object.values(agrupado).sort(
    (a, b) => b.total + b.abordagens - (a.total + a.abordagens),
  );
  const top5 = ranking.slice(0, 5);

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Produtividade individual dos guardas, consolidando ocorrências e abordagens.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${ranking.length}</div>
        <div style="font-size:9px;opacity:0.8;">Guardas Ativos</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${ocorrencias.length}</div>
        <div style="font-size:9px;opacity:0.8;">Ocorrências</div>
      </div>
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${abordagens.length}</div>
        <div style="font-size:9px;opacity:0.8;">Abordagens</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      ${top5
        .map(
          (item, i) => `
        <div style="background:${i === 0 ? "var(--gradiente-principal)" : i === 1 ? "var(--azul-bandeira)" : "var(--azul-escuro)"};border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:18px;font-weight:800;">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}</div>
          <div style="font-size:10px;font-weight:600;margin-top:2px;">${item.nome}</div>
          <div style="font-size:14px;font-weight:800;margin-top:4px;">${item.total + item.abordagens}</div>
          <div style="font-size:8px;opacity:0.7;">total</div>
        </div>
      `,
        )
        .join("")}
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-list" style="margin-right:6px;"></i>
        Lista Completa
      </h4>
      ${ranking
        .map(
          (item, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:700;color:${i < 3 ? "var(--azul-bandeira)" : "var(--cinza-medio)"};min-width:20px;">${i + 1}</span>
            <span style="font-weight:500;">${item.nome}</span>
          </div>
          <div style="display:flex;gap:12px;font-size:11px;">
            <span><span style="color:var(--azul-bandeira);">📋 ${item.total}</span></span>
            <span><span style="color:var(--verde-bandeira);">👮 ${item.abordagens}</span></span>
            <span style="font-weight:700;color:var(--roxo);">${item.total + item.abordagens}</span>
          </div>
        </div>
      `,
        )
        .join("")}
      ${
        ranking.length === 0
          ? `
        <p style="text-align:center;color:var(--cinza-medio);padding:16px;">Nenhum guarda com registros no período</p>
      `
          : ""
      }
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE PREVISÃO
// ============================================

async function renderConteudoPrevisao(ocorrencias, dataInicio, dataFim) {
  const total = ocorrencias.length;
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  const mediaDiaria = dias > 0 ? total / dias : 0;
  const projecaoMensal = mediaDiaria * 30;
  const projecaoSemanal = mediaDiaria * 7;

  const porDiaSemana = {};
  const porHora = {};
  ocorrencias.forEach((o) => {
    const data = new Date(o.criado_em);
    const diaSemana = data.getDay();
    const hora = data.getHours();
    if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = 0;
    porDiaSemana[diaSemana]++;
    if (!porHora[hora]) porHora[hora] = 0;
    porHora[hora]++;
  });

  const diasOrdenados = Object.keys(porDiaSemana)
    .map((key) => ({
      dia: DIAS_SEMANA[parseInt(key)],
      total: porDiaSemana[key],
    }))
    .sort((a, b) => b.total - a.total);
  const diaPico = diasOrdenados.length > 0 ? diasOrdenados[0] : null;

  const horasOrdenadas = Object.keys(porHora)
    .map((key) => ({ hora: parseInt(key), total: porHora[key] }))
    .sort((a, b) => b.total - a.total);
  const horaPico = horasOrdenadas.length > 0 ? horasOrdenadas[0] : null;

  const tendencia = mediaDiaria > 0 ? ((mediaDiaria / 30) * 100).toFixed(1) : 0;

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Previsão baseada no histórico de ocorrências, com projeções e identificação de padrões.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${mediaDiaria.toFixed(1)}</div>
        <div style="font-size:9px;opacity:0.8;">Média Diária</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${projecaoSemanal.toFixed(0)}</div>
        <div style="font-size:9px;opacity:0.8;">Projeção Semanal</div>
      </div>
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${projecaoMensal.toFixed(0)}</div>
        <div style="font-size:9px;opacity:0.8;">Projeção Mensal</div>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-lightbulb" style="margin-right:6px;"></i>
        Insights e Padrões
      </h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:var(--azul-muito-claro);border-radius:var(--border-radius);padding:10px;">
          <div style="font-size:10px;color:var(--cinza-medio);">📊 Dia de Pico</div>
          <div style="font-size:18px;font-weight:700;color:var(--azul-bandeira);">${diaPico ? diaPico.dia : "-"}</div>
          <div style="font-size:10px;color:var(--cinza-medio);">${diaPico ? `${diaPico.total} ocorrências` : ""}</div>
        </div>
        <div style="background:var(--verde-muito-claro);border-radius:var(--border-radius);padding:10px;">
          <div style="font-size:10px;color:var(--cinza-medio);">⏰ Horário de Pico</div>
          <div style="font-size:18px;font-weight:700;color:var(--verde-bandeira);">${horaPico ? `${String(horaPico.hora).padStart(2, "0")}:00h` : "-"}</div>
          <div style="font-size:10px;color:var(--cinza-medio);">${horaPico ? `${horaPico.total} ocorrências` : ""}</div>
        </div>
      </div>
      <div style="margin-top:8px;padding:8px 12px;background:var(--cinza-claro);border-radius:var(--border-radius);font-size:12px;color:var(--cinza-escuro);">
        <i class="fas fa-chart-line" style="color:var(--azul-bandeira);margin-right:6px;"></i>
        <strong>Tendência:</strong> ${tendencia >= 0 ? "📈 Crescente" : "📉 Decrescente"} (${Math.abs(tendencia)}% de variação)
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
        <i class="fas fa-chart-line" style="margin-right:6px;"></i>
        Projeção para os Próximos 30 Dias
      </h4>
      <div style="height:150px;">
        <canvas id="chartPrevisao"></canvas>
      </div>
      <div style="margin-top:6px;font-size:10px;color:var(--cinza-medio);text-align:center;">
        Baseado na média diária de ${mediaDiaria.toFixed(1)} ocorrências/dia
      </div>
    </div>
  `;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE ABORDAGENS
// ============================================

async function renderConteudoAbordagens(
  veiculos,
  pessoas,
  dataInicio,
  dataFim,
  tipo,
) {
  const isVeiculos = tipo === "veiculos";
  const isPessoas = tipo === "pessoas";
  const isGeral = tipo === "geral";

  const dados = isVeiculos
    ? veiculos
    : isPessoas
      ? pessoas
      : [...veiculos, ...pessoas];
  const total = dados.length;
  const totalVeiculos = veiculos.length;
  const totalPessoas = pessoas.length;

  const porIdentificador = {};
  const porMotivo = {};
  const porFase = {};

  dados.forEach((item) => {
    const id = isVeiculos
      ? item.placa
      : isPessoas
        ? item.nome
        : item.placa || item.nome || "Não identificado";
    if (!porIdentificador[id]) porIdentificador[id] = 0;
    porIdentificador[id]++;
    const motivo = item.motivo || "Não informado";
    if (!porMotivo[motivo]) porMotivo[motivo] = 0;
    porMotivo[motivo]++;
    const fase = item.fase || "advertencia";
    if (!porFase[fase]) porFase[fase] = 0;
    porFase[fase]++;
  });

  const topIdentificadores = Object.keys(porIdentificador)
    .map((key) => ({ id: key, total: porIdentificador[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const topMotivos = Object.keys(porMotivo)
    .map((key) => ({ motivo: key, total: porMotivo[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let titulo = "";
  let icone = "";
  let cor = "";
  if (isVeiculos) {
    titulo = "Abordagens de Veículos";
    icone = "fa-motorcycle";
    cor = "#003F87";
  } else if (isPessoas) {
    titulo = "Abordagens de Pessoas";
    icone = "fa-user-friends";
    cor = "#00843D";
  } else {
    titulo = "Abordagens Geral";
    icone = "fa-chart-bar";
    cor = "#8b5cf6";
  }

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:${cor};margin-right:4px;"></i>
          ${isGeral ? "Consolidado de todas as abordagens de veículos e pessoas." : isVeiculos ? "Análise detalhada de abordagens de veículos." : "Análise detalhada de abordagens de pessoas."}
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:${cor};border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${total}</div>
        <div style="font-size:9px;opacity:0.8;">Total</div>
      </div>
      ${
        isGeral
          ? `
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;">${totalVeiculos}</div>
          <div style="font-size:9px;opacity:0.8;">Veículos</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;">${totalPessoas}</div>
          <div style="font-size:9px;opacity:0.8;">Pessoas</div>
        </div>
      `
          : `
        <div style="background:${cor === "#003F87" ? "var(--verde-bandeira)" : "var(--azul-bandeira)"};border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;">${porFase.advertencia || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Advertências</div>
        </div>
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:10px;text-align:center;color:white;">
          <div style="font-size:20px;font-weight:800;">${porFase.multa || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Multas</div>
        </div>
      `
      }
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 6px 0;font-size:12px;font-weight:700;">
          <i class="fas fa-trophy"></i> Top 10 ${isVeiculos ? "Placas" : isPessoas ? "Pessoas" : "Identificadores"}
        </h4>
        ${topIdentificadores
          .map(
            (item, i) => `
          <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:11px;">
            <span>${i + 1}. ${item.id}</span>
            <span style="font-weight:600;color:${cor};">${item.total}</span>
          </div>
        `,
          )
          .join("")}
        ${topIdentificadores.length === 0 ? '<p style="font-size:11px;color:var(--cinza-medio);text-align:center;padding:8px;">Nenhum registro</p>' : ""}
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 6px 0;font-size:12px;font-weight:700;">
          <i class="fas fa-list"></i> Principais Motivos
        </h4>
        ${topMotivos
          .map(
            (m) => `
          <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:11px;">
            <span>${m.motivo.length > 30 ? m.motivo.slice(0, 28) + "..." : m.motivo}</span>
            <span style="font-weight:600;color:${cor};">${m.total}</span>
          </div>
        `,
          )
          .join("")}
        ${topMotivos.length === 0 ? '<p style="font-size:11px;color:var(--cinza-medio);text-align:center;padding:8px;">Nenhum motivo registrado</p>' : ""}
      </div>
    </div>

    ${
      !isGeral
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
          <i class="fas fa-chart-bar"></i> Distribuição por Fase
        </h4>
        <div style="height:120px;">
          <canvas id="chartAbordagensFases"></canvas>
        </div>
      </div>
    `
        : `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:13px;font-weight:700;">
          <i class="fas fa-chart-pie"></i> Distribuição por Tipo
        </h4>
        <div style="height:120px;">
          <canvas id="chartAbordagensPizza"></canvas>
        </div>
      </div>
    `
    }
  `;
}

async function renderConteudoAbordagensVeiculos(
  ocorrencias,
  dataInicio,
  dataFim,
) {
  const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens(
    abordagens.veiculos,
    [],
    dataInicio,
    dataFim,
    "veiculos",
  );
}

async function renderConteudoAbordagensPessoas(
  ocorrencias,
  dataInicio,
  dataFim,
) {
  const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens(
    [],
    abordagens.pessoas,
    dataInicio,
    dataFim,
    "pessoas",
  );
}

async function renderConteudoAbordagensGeral(ocorrencias, dataInicio, dataFim) {
  const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens(
    abordagens.veiculos,
    abordagens.pessoas,
    dataInicio,
    dataFim,
    "geral",
  );
}

// ============================================
// CONTEÚDO - EFICIÊNCIA OPERACIONAL
// ============================================

async function renderConteudoEficiencia(ocorrencias, dataInicio, dataFim) {
  const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
  const totalOcorrencias = ocorrencias.length;
  const totalAbordagens =
    abordagens.veiculos.length + abordagens.pessoas.length;

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  let conversoes = 0;
  if (client) {
    try {
      const { data, error } = await client
        .from("ocorrencias")
        .select("id")
        .not("observacoes", "is", null)
        .ilike("observacoes", "%abordagem%")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59");
      if (!error) conversoes = data?.length || 0;
    } catch (e) {
      console.warn("Erro ao buscar conversões:", e);
    }
  }

  const taxaConversao =
    totalAbordagens > 0 ? ((conversoes / totalAbordagens) * 100).toFixed(1) : 0;
  const mediaOcorrencias =
    totalAbordagens > 0 ? (totalOcorrencias / totalAbordagens).toFixed(2) : 0;

  let eficienciaStatus = "";
  let eficienciaCor = "";
  if (taxaConversao >= 30) {
    eficienciaStatus = "✅ Alta eficiência";
    eficienciaCor = "var(--verde-bandeira)";
  } else if (taxaConversao >= 15) {
    eficienciaStatus = "⚠️ Eficiência moderada";
    eficienciaCor = "var(--aviso)";
  } else {
    eficienciaStatus = "❌ Baixa eficiência";
    eficienciaCor = "var(--erro)";
  }

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          Taxa de conversão de abordagens em Boletins de Ocorrência, medindo a eficiência operacional.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${totalAbordagens}</div>
        <div style="font-size:9px;opacity:0.8;">Total de Abordagens</div>
      </div>
      <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${totalOcorrencias}</div>
        <div style="font-size:9px;opacity:0.8;">Total de Ocorrências</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${taxaConversao}%</div>
        <div style="font-size:9px;opacity:0.8;">Taxa de Conversão</div>
      </div>
      <div style="background:var(--aviso);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${conversoes}</div>
        <div style="font-size:9px;opacity:0.8;">Abordagens → BOs</div>
      </div>
      <div style="background:var(--roxo);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:20px;font-weight:800;">${mediaOcorrencias}</div>
        <div style="font-size:9px;opacity:0.8;">Média BOs/Abordagem</div>
      </div>
    </div>

    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);border-left:4px solid ${eficienciaCor};">
      <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:14px;font-weight:700;">
        <i class="fas fa-lightbulb" style="margin-right:6px;"></i>
        Análise de Eficiência
      </h4>
      <div style="font-size:13px;color:var(--cinza-escuro);">
        <p style="margin:4px 0;"><strong>📊 Taxa de Conversão:</strong> ${taxaConversao}% das abordagens geraram Boletins de Ocorrência.</p>
        <p style="margin:4px 0;"><strong>📈 Produtividade:</strong> Cada abordagem gerou em média ${mediaOcorrencias} ocorrências.</p>
        <p style="margin:4px 0;"><strong>🎯 Status:</strong> <span style="color:${eficienciaCor};font-weight:700;">${eficienciaStatus}</span></p>
        ${conversoes > 0 ? `<p style="margin:4px 0;"><strong>📋 Total de conversões:</strong> ${conversoes} abordagens convertidas em BOs.</p>` : '<p style="margin:4px 0;"><strong>📋 Nenhuma conversão identificada neste período.</strong></p>'}
      </div>
    </div>
  `;
}

// ============================================
// INICIALIZAR GRÁFICOS
// ============================================

function inicializarGraficos(tipo, container) {
  setTimeout(() => {
    try {
      switch (tipo) {
        case "executivo":
          inicializarGraficoExecutivo();
          break;
        case "por-local":
          inicializarGraficoLocal();
          break;
        case "tendencias":
          inicializarGraficoTendencias();
          break;
        case "previsao":
          inicializarGraficoPrevisao();
          break;
        case "abordagens-veiculos":
        case "abordagens-pessoas":
          inicializarGraficoAbordagensFases();
          break;
        case "abordagens-geral":
          inicializarGraficoAbordagensPizza();
          break;
        case "mapa":
          inicializarMapa();
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn("Erro ao inicializar gráficos:", error);
    }
  }, 400);
}

async function inicializarGraficoExecutivo() {
  await carregarChartJS();

  const pizzaCanvas = document.getElementById("chartExecutivoPizza");
  if (pizzaCanvas) {
    const dados = await obterDadosGrafico("executivo_pizza");
    if (dados && dados.length > 0) {
      if (estado.chartInstances["executivoPizza"]) {
        estado.chartInstances["executivoPizza"].destroy();
      }
      estado.chartInstances["executivoPizza"] = new Chart(pizzaCanvas, {
        type: "doughnut",
        data: {
          labels: dados.map((d) => d.label),
          datasets: [
            {
              data: dados.map((d) => d.value),
              backgroundColor: CORES_PIZZA.slice(0, dados.length),
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                font: { size: 9 },
                boxWidth: 10,
                padding: 4,
                usePointStyle: true,
                pointStyle: "circle",
              },
            },
          },
        },
      });
    }
  }

  const mensalCanvas = document.getElementById("chartExecutivoMensal");
  if (mensalCanvas) {
    const dados = await obterDadosGrafico("executivo_mensal");
    if (dados && dados.length > 0) {
      if (estado.chartInstances["executivoMensal"]) {
        estado.chartInstances["executivoMensal"].destroy();
      }
      estado.chartInstances["executivoMensal"] = new Chart(mensalCanvas, {
        type: "bar",
        data: {
          labels: dados.map((d) => d.label),
          datasets: [
            {
              label: "Ocorrências",
              data: dados.map((d) => d.value),
              backgroundColor: "rgba(0, 63, 135, 0.7)",
              borderColor: "#003F87",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { size: 9 } },
            },
            x: {
              ticks: { font: { size: 9 } },
            },
          },
        },
      });
    }
  }
}

async function inicializarGraficoLocal() {
  await carregarChartJS();

  const canvas = document.getElementById("chartLocalBairros");
  if (!canvas) return;

  const dados = await obterDadosGrafico("local_bairros");
  if (!dados || dados.length === 0) return;

  if (estado.chartInstances["localBairros"]) {
    estado.chartInstances["localBairros"].destroy();
  }

  const cores = dados.map((_, i) => {
    const coresGrad = [
      "#003F87",
      "#0055A8",
      "#006BC9",
      "#0084E8",
      "#1A9EFF",
      "#4DB8FF",
      "#80D0FF",
      "#B3E8FF",
    ];
    return coresGrad[i % coresGrad.length];
  });

  estado.chartInstances["localBairros"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: "Ocorrências",
          data: dados.map((d) => d.value),
          backgroundColor: cores,
          borderColor: cores.map((c) => c),
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 8 }, maxRotation: 45 },
        },
      },
    },
  });
}

async function inicializarGraficoTendencias() {
  await carregarChartJS();

  const mensalCanvas = document.getElementById("chartTendenciasMensal");
  if (mensalCanvas) {
    const dados = await obterDadosGrafico("tendencias_mensal");
    if (dados && dados.length > 0) {
      if (estado.chartInstances["tendenciasMensal"]) {
        estado.chartInstances["tendenciasMensal"].destroy();
      }
      estado.chartInstances["tendenciasMensal"] = new Chart(mensalCanvas, {
        type: "line",
        data: {
          labels: dados.map((d) => d.label),
          datasets: [
            {
              label: "Ocorrências",
              data: dados.map((d) => d.value),
              borderColor: "#003F87",
              backgroundColor: "rgba(0, 63, 135, 0.1)",
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: "#003F87",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { size: 9 } },
            },
            x: {
              ticks: { font: { size: 8 } },
            },
          },
        },
      });
    }
  }

  const diaCanvas = document.getElementById("chartTendenciasDiaSemana");
  if (diaCanvas) {
    const dados = await obterDadosGrafico("tendencias_dia");
    if (dados && dados.length > 0) {
      if (estado.chartInstances["tendenciasDia"]) {
        estado.chartInstances["tendenciasDia"].destroy();
      }
      estado.chartInstances["tendenciasDia"] = new Chart(diaCanvas, {
        type: "bar",
        data: {
          labels: dados.map((d) => d.label),
          datasets: [
            {
              label: "Ocorrências",
              data: dados.map((d) => d.value),
              backgroundColor: [
                "#003F87",
                "#0055A8",
                "#006BC9",
                "#0084E8",
                "#1A9EFF",
                "#4DB8FF",
                "#80D0FF",
              ],
              borderColor: "#003F87",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { size: 8 } },
            },
            x: {
              ticks: { font: { size: 8 } },
            },
          },
        },
      });
    }
  }

  const horaCanvas = document.getElementById("chartTendenciasHora");
  if (horaCanvas) {
    const dados = await obterDadosGrafico("tendencias_hora");
    if (dados && dados.length > 0) {
      if (estado.chartInstances["tendenciasHora"]) {
        estado.chartInstances["tendenciasHora"].destroy();
      }
      estado.chartInstances["tendenciasHora"] = new Chart(horaCanvas, {
        type: "bar",
        data: {
          labels: dados.map((d) => d.label),
          datasets: [
            {
              label: "Ocorrências",
              data: dados.map((d) => d.value),
              backgroundColor: "rgba(0, 132, 61, 0.7)",
              borderColor: "#00843D",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { size: 8 } },
            },
            x: {
              ticks: { font: { size: 7 }, maxTicksLimit: 12 },
            },
          },
        },
      });
    }
  }
}

async function inicializarGraficoPrevisao() {
  await carregarChartJS();

  const canvas = document.getElementById("chartPrevisao");
  if (!canvas) return;

  const dados = await obterDadosGrafico("previsao");
  if (!dados || dados.length === 0) return;

  if (estado.chartInstances["previsao"]) {
    estado.chartInstances["previsao"].destroy();
  }

  estado.chartInstances["previsao"] = new Chart(canvas, {
    type: "line",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: "Projeção",
          data: dados.map((d) => d.value),
          borderColor: "#003F87",
          backgroundColor: "rgba(0, 63, 135, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#003F87",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 8 } },
        },
        x: {
          ticks: { font: { size: 7 }, maxTicksLimit: 15 },
        },
      },
    },
  });
}

async function inicializarGraficoAbordagensFases() {
  await carregarChartJS();

  const canvas = document.getElementById("chartAbordagensFases");
  if (!canvas) return;

  const dados = await obterDadosGrafico("abordagens_fases");
  if (!dados || dados.length === 0) return;

  if (estado.chartInstances["abordagensFases"]) {
    estado.chartInstances["abordagensFases"].destroy();
  }

  estado.chartInstances["abordagensFases"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: "Abordagens",
          data: dados.map((d) => d.value),
          backgroundColor: ["#F59E0B", "#DC2626"],
          borderColor: ["#F59E0B", "#DC2626"],
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 9 } },
        },
      },
    },
  });
}

async function inicializarGraficoAbordagensPizza() {
  await carregarChartJS();

  const canvas = document.getElementById("chartAbordagensPizza");
  if (!canvas) return;

  const dados = await obterDadosGrafico("abordagens_pizza");
  if (!dados || dados.length === 0) return;

  if (estado.chartInstances["abordagensPizza"]) {
    estado.chartInstances["abordagensPizza"].destroy();
  }

  estado.chartInstances["abordagensPizza"] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          data: dados.map((d) => d.value),
          backgroundColor: ["#003F87", "#00843D"],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { size: 10 },
            boxWidth: 12,
            padding: 6,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
      },
    },
  });
}

// ============================================
// INICIALIZAR MAPA
// ============================================

function inicializarMapa() {
  const mapaContainer = document.getElementById("mapaContainer");
  if (!mapaContainer) return;

  const loading = document.getElementById("mapaLoading");
  if (loading) loading.style.display = "none";

  const dadosMapa =
    estado.dadosCache?.filter((o) => o.latitude && o.longitude) || [];
  if (dadosMapa.length === 0) return;

  if (typeof L === "undefined") {
    console.warn("⚠️ Leaflet não carregado");
    return;
  }

  if (estado.mapaInstance) {
    try {
      estado.mapaInstance.remove();
    } catch (e) {}
    estado.mapaInstance = null;
  }

  try {
    const dadosValidos = dadosMapa.filter(
      (p) =>
        p.latitude &&
        p.longitude &&
        !isNaN(parseFloat(p.latitude)) &&
        !isNaN(parseFloat(p.longitude)),
    );

    if (dadosValidos.length === 0) {
      mapaContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
          <i class="fas fa-map" style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;"></i>
          <p>Nenhuma coordenada válida encontrada</p>
        </div>
      `;
      return;
    }

    const centro = calcularCentroMapa(dadosValidos);
    const map = L.map(mapaContainer, {
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: true,
      zoomAnimation: true,
      center: centro,
      zoom: 13,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers = L.markerClusterGroup({
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = "small";
        let color = "#003F87";
        if (count > 20) {
          size = "large";
          color = "#DC2626";
        } else if (count > 10) {
          size = "medium";
          color = "#F59E0B";
        }
        return L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:${size === "large" ? 40 : size === "medium" ? 34 : 28}px;height:${size === "large" ? 40 : size === "medium" ? 34 : 28}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size === "large" ? 14 : 12}px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
          className: "cluster-marker",
          iconSize: [
            size === "large" ? 40 : size === "medium" ? 34 : 28,
            size === "large" ? 40 : size === "medium" ? 34 : 28,
          ],
        });
      },
    });

    const cores = {
      furto: "#f97316",
      roubo: "#dc2626",
      vandalismo: "#f97316",
      dano_ao_patrimonio: "#f97316",
      ameaca: "#dc2626",
      lesao_corporal: "#dc2626",
      perturbacao: "#f97316",
      acidente: "#eab308",
      incendio: "#dc2626",
      desaparecimento: "#8b5cf6",
      atendimento_social: "#06b6d4",
      outro: "#6b7280",
    };

    dadosValidos.forEach((p) => {
      const tipo = p.tipo_ocorrencia || "outro";
      const cor = cores[tipo] || "#6b7280";

      const icon = L.divIcon({
        className: "marcador-ocorrencia",
        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${cor};display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 4px 20px rgba(0,0,0,0.18);">
          <i class="fas fa-circle" style="transform:rotate(45deg);font-size:10px;color:white;"></i>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      const popupContent = `
        <div style="font-weight:700;font-size:14px;color:#003F87;">#${p.numero_ocorrencia || p.numero_temporario || "Sem número"}</div>
        <div style="display:inline-block;padding:1px 10px;border-radius:9999px;font-size:10px;font-weight:600;text-transform:uppercase;color:#fff;background:${cor};margin-bottom:4px;">
          ${getTipoLabel(tipo)}
        </div>
        <div style="font-size:12px;color:#1e293b;">📍 ${p.local_ocorrencia || "Local não informado"}</div>
        <div style="font-size:11px;color:#94a3b8;">👤 ${p.criador?.nome_completo || "Desconhecido"}</div>
        <div style="margin-top:4px;">
          <button onclick="window._relatoriosVerDetalhes('${p.id}')" style="padding:2px 10px;font-size:11px;border:none;border-radius:4px;background:#e3f2fd;color:#003F87;cursor:pointer;">
            <i class="fas fa-eye"></i> Ver detalhes
          </button>
        </div>
      `;

      const marker = L.marker(
        [parseFloat(p.latitude), parseFloat(p.longitude)],
        { icon },
      );
      marker.bindPopup(popupContent, { maxWidth: 280 });
      markers.addLayer(marker);
    });

    map.addLayer(markers);

    if (dadosValidos.length > 1) {
      const bounds = L.latLngBounds(
        dadosValidos.map((p) => [
          parseFloat(p.latitude),
          parseFloat(p.longitude),
        ]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 500);
    estado.mapaInstance = map;
  } catch (error) {
    console.error("Erro ao inicializar mapa:", error);
    mapaContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
        <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--erro);margin-bottom:12px;"></i>
        <p>Erro ao carregar mapa: ${error.message}</p>
      </div>
    `;
  }
}

// ============================================
// OBTENÇÃO DE DADOS PARA GRÁFICOS
// ============================================

async function obterDadosGrafico(tipo) {
  const ocorrencias = estado.dadosCache || [];
  const abordagens = estado.abordagensCache || { veiculos: [], pessoas: [] };

  switch (tipo) {
    case "executivo_pizza": {
      const porTipo = agruparPorTipo(ocorrencias);
      return porTipo
        .slice(0, 8)
        .map((t) => ({ label: t.tipo, value: t.total }));
    }
    case "executivo_mensal": {
      const porMes = agruparPorMes(ocorrencias);
      return porMes.map((m) => ({ label: m.label, value: m.value }));
    }
    case "local_bairros": {
      const porBairro = agruparPorBairro(ocorrencias);
      return porBairro.slice(0, 10).map((b) => ({
        label: b.bairro.length > 15 ? b.bairro.slice(0, 12) + "..." : b.bairro,
        value: b.total,
      }));
    }
    case "tendencias_mensal": {
      const porMes = agruparPorMes(ocorrencias);
      return porMes.map((m) => ({ label: m.label, value: m.value }));
    }
    case "tendencias_dia": {
      const porDia = {};
      ocorrencias.forEach((o) => {
        const dia = new Date(o.criado_em).getDay();
        const nome = DIAS_SEMANA[dia];
        if (!porDia[nome]) porDia[nome] = 0;
        porDia[nome]++;
      });
      return DIAS_SEMANA.map((d) => ({ label: d, value: porDia[d] || 0 }));
    }
    case "tendencias_hora": {
      const porHora = {};
      ocorrencias.forEach((o) => {
        const hora = new Date(o.criado_em).getHours();
        if (!porHora[hora]) porHora[hora] = 0;
        porHora[hora]++;
      });
      return Array.from({ length: 24 }, (_, i) => ({
        label: String(i).padStart(2, "0") + "h",
        value: porHora[i] || 0,
      }));
    }
    case "previsao": {
      const total = ocorrencias.length;
      const dias = calcularDiasPeriodo(
        estado.filtros.dataInicio || new Date().toISOString().slice(0, 10),
        estado.filtros.dataFim || new Date().toISOString().slice(0, 10),
      );
      const mediaDiaria = dias > 0 ? total / dias : 0;
      return Array.from({ length: 30 }, (_, i) => ({
        label: `Dia ${i + 1}`,
        value: Math.max(
          0,
          mediaDiaria + (Math.random() - 0.5) * mediaDiaria * 0.4,
        ),
      }));
    }
    case "abordagens_fases": {
      const veiculos = abordagens.veiculos || [];
      const pessoas = abordagens.pessoas || [];
      const todas = [...veiculos, ...pessoas];
      const porFase = {};
      todas.forEach((a) => {
        const fase = a.fase || "advertencia";
        const label = fase === "multa" ? "Multa" : "Advertência";
        if (!porFase[label]) porFase[label] = 0;
        porFase[label]++;
      });
      return [
        { label: "Advertência", value: porFase["Advertência"] || 0 },
        { label: "Multa", value: porFase["Multa"] || 0 },
      ];
    }
    case "abordagens_pizza": {
      const veiculos = abordagens.veiculos || [];
      const pessoas = abordagens.pessoas || [];
      return [
        { label: "Veículos", value: veiculos.length },
        { label: "Pessoas", value: pessoas.length },
      ];
    }
    default:
      return [];
  }
}

// ============================================
// EXPORTAÇÃO PDF - RELATÓRIOS
// ============================================

export async function exportarRelatorioPDF(tipo, appInstance) {
  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarRelatorio !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    const dataInicio =
      estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
    const dataFim = estado.filtros.dataFim || (await obterDataAtual());

    let dados = null;
    let titulo = "";
    let descricao = "";
    let tipoExport = "";

    const ocorrencias =
      estado.dadosCache ||
      (await buscarOcorrenciasPeriodo(dataInicio, dataFim));
    const abordagens =
      estado.abordagensCache ||
      (await buscarAbordagensPeriodo(dataInicio, dataFim));

    // Mapear tipos para os suportados pelo pdf-export.js
    const mapeamentoTipos = {
      executivo: "desempenho",
      "por-tipo": "ocorrencias",
      "por-local": "ocorrencias",
      atendimento: "desempenho",
      desempenho: "desempenho",
      retificacoes: "retificacoes",
      cancelamentos: "ocorrencias",
      tendencias: "desempenho",
      produtividade: "desempenho",
      detalhado: "ocorrencias",
      mapa: "ocorrencias",
      "por-guarda": "desempenho",
      previsao: "desempenho",
      "abordagens-veiculos": "abordagens",
      "abordagens-pessoas": "abordagens",
      "abordagens-geral": "abordagens",
      eficiencia: "desempenho",
    };

    tipoExport = mapeamentoTipos[tipo] || "desempenho";

    switch (tipo) {
      case "executivo": {
        const stats = calcularEstatisticas(ocorrencias);
        const porTipo = agruparPorTipo(ocorrencias);
        const porMes = agruparPorMes(ocorrencias);
        const total = stats.total || 1;
        const taxaResolutividade = ((stats.finalizadas / total) * 100).toFixed(
          1,
        );

        // Preparar dados para o formato esperado pelo pdf-export
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: { total: stats.total, finalizadas: stats.finalizadas },
            abordagens: { total: 0 },
            taxa_resolucao: taxaResolutividade,
            total_atendimentos: stats.total,
          },
        ];

        dados = {
          ranking,
          totalOcorrencias: stats.total,
          totalAbordagens: 0,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Relatório Executivo";
        descricao = "Visão geral das ocorrências";
        break;
      }
      case "por-tipo": {
        const porTipo = agruparPorTipo(ocorrencias);
        dados = {
          ocorrencias: ocorrencias.map((o) => ({
            ...o,
            tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
            status: o.status,
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Ocorrências por Tipo";
        descricao = "Análise detalhada por natureza";
        break;
      }
      case "por-local": {
        dados = {
          ocorrencias: ocorrencias.map((o) => ({
            ...o,
            tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
            status: o.status,
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Ocorrências por Localidade";
        descricao = "Distribuição geográfica";
        break;
      }
      case "atendimento": {
        const comTempo = ocorrencias.filter(
          (o) => o.data_hora_inicio && o.data_hora_encerramento,
        );
        const tempos = comTempo
          .map((o) => {
            const inicio = new Date(o.data_hora_inicio);
            const fim = new Date(o.data_hora_encerramento);
            return { ...o, tempoMinutos: (fim - inicio) / (1000 * 60) };
          })
          .filter((t) => t.tempoMinutos > 0);
        const mediaGeral =
          tempos.length > 0
            ? tempos.reduce((s, t) => s + t.tempoMinutos, 0) / tempos.length
            : 0;

        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: {
              total: ocorrencias.length,
              finalizadas: ocorrencias.filter((o) => o.status === "synced")
                .length,
            },
            abordagens: { total: 0 },
            taxa_resolucao:
              ocorrencias.length > 0
                ? (
                    (ocorrencias.filter((o) => o.status === "synced").length /
                      ocorrencias.length) *
                    100
                  ).toFixed(1)
                : 0,
            total_atendimentos: ocorrencias.length,
          },
        ];

        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens: 0,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Tempo Médio de Atendimento";
        descricao = "Análise de eficiência operacional";
        break;
      }
      case "desempenho": {
        // Buscar usuários para o ranking
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        let usuarios = [];
        if (client) {
          const { data, error } = await client
            .from("usuarios")
            .select("id, nome_completo, matricula, perfil")
            .eq("status", "ativo");
          if (!error) usuarios = data || [];
        }

        const todasAbordagens = [
          ...(abordagens.veiculos || []).map((v) => ({
            ...v,
            tipo_abordagem: "veiculo",
          })),
          ...(abordagens.pessoas || []).map((p) => ({
            ...p,
            tipo_abordagem: "pessoa",
          })),
        ];

        const desempenho = {};
        usuarios.forEach((u) => {
          desempenho[u.id] = {
            id: u.id,
            nome: u.nome_completo,
            matricula: u.matricula || "-",
            perfil: u.perfil,
            ocorrencias: {
              total: 0,
              finalizadas: 0,
              pendentes: 0,
              canceladas: 0,
            },
            abordagens: { total: 0, veiculos: 0, pessoas: 0 },
            taxa_resolucao: 0,
            total_atendimentos: 0,
          };
        });

        ocorrencias.forEach((o) => {
          const id = o.criado_por;
          if (desempenho[id]) {
            desempenho[id].ocorrencias.total++;
            if (o.status === "synced") desempenho[id].ocorrencias.finalizadas++;
            if (o.status === "pending_sync")
              desempenho[id].ocorrencias.pendentes++;
            if (o.status === "cancelled")
              desempenho[id].ocorrencias.canceladas++;
          }
        });

        todasAbordagens.forEach((a) => {
          const id = a.criado_por;
          if (desempenho[id]) {
            desempenho[id].abordagens.total++;
            if (a.tipo_abordagem === "veiculo")
              desempenho[id].abordagens.veiculos++;
            else desempenho[id].abordagens.pessoas++;
          }
        });

        Object.values(desempenho).forEach((d) => {
          d.taxa_resolucao =
            d.ocorrencias.total > 0
              ? (
                  (d.ocorrencias.finalizadas / d.ocorrencias.total) *
                  100
                ).toFixed(1)
              : 0;
          d.total_atendimentos = d.ocorrencias.total + d.abordagens.total;
        });

        const ranking = Object.values(desempenho).sort(
          (a, b) => b.total_atendimentos - a.total_atendimentos,
        );

        dados = {
          ranking,
          totalOcorrencias: ranking.reduce(
            (s, d) => s + d.ocorrencias.total,
            0,
          ),
          totalAbordagens: ranking.reduce((s, d) => s + d.abordagens.total, 0),
          totalGuardas: ranking.length,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Desempenho por Guarda";
        descricao = "Produtividade com ocorrências e abordagens";
        break;
      }
      case "retificacoes": {
        const retificacoes = ocorrencias.filter(
          (o) =>
            o.status === "rectified" ||
            o.status === "pending_rectification" ||
            o.status === "rectification_rejected",
        );
        dados = {
          retificacoes: retificacoes.map((r) => ({
            numero: r.numero_ocorrencia || r.numero_temporario || "Sem número",
            tipo: getTipoLabel(r.tipo_ocorrencia),
            data_solicitacao: r.solicitada_em || r.criado_em,
            status: r.status,
            justificativa: r.solicitacao_retificacao_justificativa || "-",
            motivo_rejeicao: r.motivo_rejeicao || "-",
            local: r.local_ocorrencia || "Não informado",
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Relatório de Retificações";
        descricao = "Acompanhamento de correções";
        break;
      }
      case "cancelamentos": {
        const canceladas = ocorrencias.filter((o) => o.status === "cancelled");
        dados = {
          ocorrencias: canceladas.map((o) => ({
            ...o,
            tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
            status: o.status,
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Relatório de Cancelamentos";
        descricao = "Análise de ocorrências canceladas";
        break;
      }
      case "tendencias": {
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: {
              total: ocorrencias.length,
              finalizadas: ocorrencias.filter((o) => o.status === "synced")
                .length,
            },
            abordagens: { total: 0 },
            taxa_resolucao:
              ocorrencias.length > 0
                ? (
                    (ocorrencias.filter((o) => o.status === "synced").length /
                      ocorrencias.length) *
                    100
                  ).toFixed(1)
                : 0,
            total_atendimentos: ocorrencias.length,
          },
        ];
        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens: 0,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Tendências e Sazonalidade";
        descricao = "Padrões temporais das ocorrências";
        break;
      }
      case "produtividade": {
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: {
              total: ocorrencias.length,
              finalizadas: ocorrencias.filter((o) => o.status === "synced")
                .length,
            },
            abordagens: { total: 0 },
            taxa_resolucao:
              ocorrencias.length > 0
                ? (
                    (ocorrencias.filter((o) => o.status === "synced").length /
                      ocorrencias.length) *
                    100
                  ).toFixed(1)
                : 0,
            total_atendimentos: ocorrencias.length,
          },
        ];
        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens: 0,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Produtividade do Setor";
        descricao = "Eficiência e capacidade de atendimento";
        break;
      }
      case "detalhado": {
        dados = {
          ocorrencias: ocorrencias.map((o) => ({
            ...o,
            tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
            status: o.status,
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Ocorrências Detalhado";
        descricao = "Listagem completa com todos os campos";
        break;
      }
      case "mapa": {
        const pontosMapa = ocorrencias.filter((o) => o.latitude && o.longitude);
        dados = {
          ocorrencias: pontosMapa.map((o) => ({
            ...o,
            tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
            status: o.status,
          })),
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Mapa de Ocorrências";
        descricao = "Visualização geográfica com clusters";
        break;
      }
      case "por-guarda": {
        // Mesmo que desempenho
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        let usuarios = [];
        if (client) {
          const { data, error } = await client
            .from("usuarios")
            .select("id, nome_completo, matricula, perfil")
            .eq("status", "ativo");
          if (!error) usuarios = data || [];
        }

        const todasAbordagens = [
          ...(abordagens.veiculos || []).map((v) => ({
            ...v,
            tipo_abordagem: "veiculo",
          })),
          ...(abordagens.pessoas || []).map((p) => ({
            ...p,
            tipo_abordagem: "pessoa",
          })),
        ];

        const desempenho = {};
        usuarios.forEach((u) => {
          desempenho[u.id] = {
            id: u.id,
            nome: u.nome_completo,
            matricula: u.matricula || "-",
            perfil: u.perfil,
            ocorrencias: {
              total: 0,
              finalizadas: 0,
              pendentes: 0,
              canceladas: 0,
            },
            abordagens: { total: 0, veiculos: 0, pessoas: 0 },
            taxa_resolucao: 0,
            total_atendimentos: 0,
          };
        });

        ocorrencias.forEach((o) => {
          const id = o.criado_por;
          if (desempenho[id]) {
            desempenho[id].ocorrencias.total++;
            if (o.status === "synced") desempenho[id].ocorrencias.finalizadas++;
            if (o.status === "pending_sync")
              desempenho[id].ocorrencias.pendentes++;
            if (o.status === "cancelled")
              desempenho[id].ocorrencias.canceladas++;
          }
        });

        todasAbordagens.forEach((a) => {
          const id = a.criado_por;
          if (desempenho[id]) {
            desempenho[id].abordagens.total++;
            if (a.tipo_abordagem === "veiculo")
              desempenho[id].abordagens.veiculos++;
            else desempenho[id].abordagens.pessoas++;
          }
        });

        Object.values(desempenho).forEach((d) => {
          d.taxa_resolucao =
            d.ocorrencias.total > 0
              ? (
                  (d.ocorrencias.finalizadas / d.ocorrencias.total) *
                  100
                ).toFixed(1)
              : 0;
          d.total_atendimentos = d.ocorrencias.total + d.abordagens.total;
        });

        const ranking = Object.values(desempenho).sort(
          (a, b) => b.total_atendimentos - a.total_atendimentos,
        );

        dados = {
          ranking,
          totalOcorrencias: ranking.reduce(
            (s, d) => s + d.ocorrencias.total,
            0,
          ),
          totalAbordagens: ranking.reduce((s, d) => s + d.abordagens.total, 0),
          totalGuardas: ranking.length,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Ocorrências por Guarda";
        descricao = "Produtividade individual com abordagens";
        break;
      }
      case "previsao": {
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: {
              total: ocorrencias.length,
              finalizadas: ocorrencias.filter((o) => o.status === "synced")
                .length,
            },
            abordagens: { total: 0 },
            taxa_resolucao:
              ocorrencias.length > 0
                ? (
                    (ocorrencias.filter((o) => o.status === "synced").length /
                      ocorrencias.length) *
                    100
                  ).toFixed(1)
                : 0,
            total_atendimentos: ocorrencias.length,
          },
        ];
        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens: 0,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Previsão de Ocorrências";
        descricao = "Previsão baseada em histórico";
        break;
      }
      case "abordagens-veiculos": {
        const veiculos = abordagens.veiculos || [];
        const dadosAbordagens = veiculos.map((v) => ({
          placa: v.placa || "N/A",
          marca_modelo: v.marca_modelo || "N/A",
          cor: v.cor || "N/A",
          motivo: v.motivo || "N/A",
          fase: v.fase || "advertencia",
          criado_em: v.criado_em,
          usuarios: v.usuarios,
        }));
        dados = {
          veiculos: dadosAbordagens,
          pessoas: [],
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Abordagens de Veículos";
        descricao = "Análise de abordagens de veículos";
        break;
      }
      case "abordagens-pessoas": {
        const pessoas = abordagens.pessoas || [];
        const dadosAbordagens = pessoas.map((p) => ({
          nome: p.nome || "N/A",
          cpf: p.cpf || "N/A",
          motivo: p.motivo || "N/A",
          fase: p.fase || "advertencia",
          criado_em: p.criado_em,
          usuarios: p.usuarios,
        }));
        dados = {
          veiculos: [],
          pessoas: dadosAbordagens,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Abordagens de Pessoas";
        descricao = "Análise de abordagens de pessoas";
        break;
      }
      case "abordagens-geral": {
        const veiculos = abordagens.veiculos || [];
        const pessoas = abordagens.pessoas || [];
        const dadosVeiculos = veiculos.map((v) => ({
          placa: v.placa || "N/A",
          marca_modelo: v.marca_modelo || "N/A",
          cor: v.cor || "N/A",
          motivo: v.motivo || "N/A",
          fase: v.fase || "advertencia",
          criado_em: v.criado_em,
          usuarios: v.usuarios,
        }));
        const dadosPessoas = pessoas.map((p) => ({
          nome: p.nome || "N/A",
          cpf: p.cpf || "N/A",
          motivo: p.motivo || "N/A",
          fase: p.fase || "advertencia",
          criado_em: p.criado_em,
          usuarios: p.usuarios,
        }));
        dados = {
          veiculos: dadosVeiculos,
          pessoas: dadosPessoas,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Abordagens Geral";
        descricao = "Consolidado de todas as abordagens";
        break;
      }
      case "eficiencia": {
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: {
              total: ocorrencias.length,
              finalizadas: ocorrencias.filter((o) => o.status === "synced")
                .length,
            },
            abordagens: {
              total: abordagens.veiculos.length + abordagens.pessoas.length,
            },
            taxa_resolucao:
              ocorrencias.length > 0
                ? (
                    (ocorrencias.filter((o) => o.status === "synced").length /
                      ocorrencias.length) *
                    100
                  ).toFixed(1)
                : 0,
            total_atendimentos:
              ocorrencias.length +
              abordagens.veiculos.length +
              abordagens.pessoas.length,
          },
        ];
        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens:
            abordagens.veiculos.length + abordagens.pessoas.length,
          totalGuardas: 1,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Eficiência Operacional";
        descricao = "Taxa de conversão abordagens em BOs";
        break;
      }
      default: {
        appInstance.showToast("Tipo de relatório não suportado", "error");
        return;
      }
    }

    if (!dados || (Array.isArray(dados) && dados.length === 0)) {
      appInstance.showToast("Nenhum dado para exportar", "warning");
      return;
    }

    appInstance.showToast(`Gerando PDF: ${titulo}...`, "info");

    // Usar o tipo mapeado para o pdf-export
    const result = await pdfExport.exportarRelatorio(tipoExport, dados, {
      title: `${titulo} - Guarda Municipal`,
      author: "Guarda Municipal de Pitangueiras - PR",
      subject: descricao,
      keywords: `Guarda Municipal, ${titulo}, Relatório`,
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
      },
    });

    if (result.success) {
      appInstance.showToast(`PDF "${titulo}" gerado com sucesso!`, "success");
    } else {
      appInstance.showToast("Erro ao gerar PDF: " + result.error, "error");
    }
  } catch (error) {
    console.error(`Erro ao exportar relatório ${tipo}:`, error);
    appInstance.showToast("Erro ao gerar PDF", "error");
  }
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderRelatorios,
  renderRelatorioDetalhado,
  exportarRelatorioPDF,
};
