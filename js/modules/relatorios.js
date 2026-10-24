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
  { value: "flagrante", label: "Flagrante", icon: "fa-eye", cor: "#1d4ed8" },
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
    tipoOcorrencia: null,
  },
  mapaInstance: null,
  chartInstances: {},
  previsaoCarregando: false,
  dadosCache: null,
  abordagensCache: null,
  comparacaoCache: null,
  isLoading: false,
};

// ============================================
// FUNÇÕES AUXILIARES - FORMATAÇÃO
// ============================================

function obterPartesDataSP(valor = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(valor);
  return Object.fromEntries(partes.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}

function criarDateBanco(valor) {
  if (!valor) return new Date(NaN);
  if (valor instanceof Date) return new Date(valor.getTime());
  const raw = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) {
    return new Date(`${raw.replace(' ', 'T')}Z`);
  }
  return new Date(raw);
}

function formatarData(date) {
  if (!date) return "";
  const raw = String(date);
  const somenteData = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (somenteData) return `${somenteData[3]}/${somenteData[2]}/${somenteData[1]}`;
  const d = criarDateBanco(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo" }).format(d);
}

function formatarDataHoraSP(valor) {
  const d = criarDateBanco(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(d);
}


function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caractere]);
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
    retificacoesPendentes: ocorrencias.filter((o) => o.status === "pending_rectification").length,
    retificacoesRejeitadas: ocorrencias.filter((o) => o.status === "rectification_rejected").length,
  };
}


function agruparPorTipo(ocorrencias) {
  const tipos = Object.create(null);
  const total = ocorrencias.length;
  ocorrencias.forEach((o) => {
    const tipo = o.tipo_ocorrencia || "Não informado";
    if (!tipos[tipo]) tipos[tipo] = {
      total: 0, finalizadas: 0, pendentes: 0, canceladas: 0,
      retificadas: 0, retificacoesPendentes: 0, retificacoesRejeitadas: 0,
    };
    const item = tipos[tipo];
    item.total++;
    if (o.status === "synced") item.finalizadas++;
    if (o.status === "pending_sync") item.pendentes++;
    if (o.status === "cancelled") item.canceladas++;
    if (o.status === "rectified") item.retificadas++;
    if (o.status === "pending_rectification") item.retificacoesPendentes++;
    if (o.status === "rectification_rejected") item.retificacoesRejeitadas++;
  });
  return Object.keys(tipos).map((key) => ({
    tipo: getTipoLabel(key), ...tipos[key],
    outros: Math.max(0, tipos[key].total - tipos[key].finalizadas - tipos[key].pendentes - tipos[key].canceladas - tipos[key].retificadas - tipos[key].retificacoesPendentes - tipos[key].retificacoesRejeitadas),
    percentual: (total > 0 ? (tipos[key].total / total) * 100 : 0).toFixed(1),
  })).sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "pt-BR"));
}


function renderTabelasPorTipoHTML(porTipo, incluirTaxa = false) {
  const th = (label) => `<th>${label}</th>`;
  const statusHeaders = ["Tipo", "Total", "% do total", "Sincronizadas", "Pend. sincronização", "Canceladas", "Rascunhos / outros"];
  if (incluirTaxa) statusHeaders.push("Taxa de sincronização");
  const statusRows = porTipo.map((t) => `<tr><td>${escaparHTML(t.tipo)}</td><td>${t.total}</td><td>${t.percentual}%</td><td>${t.finalizadas}</td><td>${t.pendentes}</td><td>${t.canceladas}</td><td>${t.outros}</td>${incluirTaxa ? `<td>${t.total ? `${(t.finalizadas / t.total * 100).toFixed(1)}%` : "—"}</td>` : ""}</tr>`).join("");
  const rectRows = porTipo.map((t) => `<tr><td>${escaparHTML(t.tipo)}</td><td>${t.retificadas}</td><td>${t.retificacoesPendentes}</td><td>${t.retificacoesRejeitadas}</td></tr>`).join("");
  const emptyStatus = incluirTaxa ? 8 : 7;
  return `
    <div class="report-content-card"><h3>Distribuição, sincronização e cancelamentos</h3>
      <div class="table-wrapper report-table-wide"><table><thead><tr>${statusHeaders.map(th).join("")}</tr></thead><tbody>${statusRows || `<tr><td colspan="${emptyStatus}">Nenhum registro no período.</td></tr>`}</tbody></table></div>
    </div>
    <div class="report-content-card"><h3>Retificações por tipo</h3>
      <div class="table-wrapper"><table><thead><tr><th>Tipo</th><th>Aplicadas</th><th>Pendentes</th><th>Rejeitadas</th></tr></thead><tbody>${rectRows || `<tr><td colspan="4">Nenhuma retificação no período.</td></tr>`}</tbody></table></div>
    </div>
  `;
}

function agruparPorMes(ocorrencias, dataInicio, dataFim) {
  const meses = new Map();
  ocorrencias.forEach((o) => {
    const d = obterPartesDataSP(criarDateBanco(o.criado_em));
    if (!Number.isFinite(d.year) || !Number.isFinite(d.month)) return;
    const chave = `${d.year}-${String(d.month).padStart(2, "0")}`;
    meses.set(chave, (meses.get(chave) || 0) + 1);
  });
  const inicio = dataISOValida(dataInicio), fim = dataISOValida(dataFim);
  if (inicio && fim && fim.utc >= inicio.utc) {
    let year = inicio.y, month = inicio.mes;
    const endKey = fim.y * 12 + (fim.mes - 1);
    while (year * 12 + (month - 1) <= endKey) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!meses.has(key)) meses.set(key, 0);
      month++;
      if (month > 12) { month = 1; year++; }
    }
  }
  return [...meses.entries()].sort(([a],[b]) => a.localeCompare(b))
    .map(([key, value]) => ({ label: `${key.slice(5,7)}/${key.slice(0,4)}`, value }));
}

function medianaNumerica(valores) {
  const ordenados = valores.filter(Number.isFinite).sort((a,b) => a-b);
  if (!ordenados.length) return null;
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}


function agruparPorBairro(ocorrencias) {
  const bairros = {};
  const total = ocorrencias.length;

  ocorrencias.forEach((o) => {
    const bairro = o.bairro_ocorrencia || o.local_ocorrencia || "Não informado";
    if (!bairros[bairro]) bairros[bairro] = 0;
    bairros[bairro]++;
  });

  return Object.keys(bairros)
    .map((key) => ({
      bairro: key,
      total: bairros[key],
      percentual: (total > 0 ? (bairros[key] / total) * 100 : 0).toFixed(1),
    }))
    .sort((a, b) => b.total - a.total);
}

function calcularMediaDiaria(ocorrencias, dataInicio, dataFim) {
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  return dias > 0 ? (ocorrencias.length / dias).toFixed(1) : 0;
}

function dataISOValida(valor) {
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const t = Date.UTC(y, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return { y, mes, dia, utc: t };
}

function calcularDiasPeriodo(dataInicio, dataFim) {
  const inicio = dataISOValida(dataInicio);
  const fim = dataISOValida(dataFim);
  if (!inicio || !fim || fim.utc < inicio.utc) return 0;
  return Math.floor((fim.utc - inicio.utc) / 86400000) + 1;
}

function dataCalendarioISO(utc) {
  return new Date(utc).toISOString().slice(0, 10);
}

function calcularDataAnterior(dataInicio, dataFim) {
  const inicio = dataISOValida(dataInicio);
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  if (!inicio || !dias) return null;
  const fimAnterior = inicio.utc - 86400000;
  const inicioAnterior = fimAnterior - (dias - 1) * 86400000;
  return { dataInicio: dataCalendarioISO(inicioAnterior), dataFim: dataCalendarioISO(fimAnterior) };
}

function dataLocalSPParaISO(valor, fimDoDia = false) {
  const data = dataISOValida(valor);
  if (!data) throw new Error(`Data inválida no filtro: ${valor || "vazia"}`);
  const hora = fimDoDia ? 23 : 0;
  const minuto = fimDoDia ? 59 : 0;
  const segundo = fimDoDia ? 59 : 0;
  const milissegundo = fimDoDia ? 999 : 0;
  const alvoUTC = Date.UTC(data.y, data.mes - 1, data.dia, hora, minuto, segundo, milissegundo);
  let candidato = alvoUTC;
  for (let i = 0; i < 3; i++) {
    const partes = obterPartesDataSP(new Date(candidato));
    const localComoUTC = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second, new Date(candidato).getUTCMilliseconds());
    const ajuste = alvoUTC - localComoUTC;
    if (!ajuste) break;
    candidato += ajuste;
  }
  return globalThis.obterTimestampBrasilSemFuso(new Date(candidato));
}


function coordenadaValida(latitude, longitude) {
  if (latitude === null || latitude === undefined || String(latitude).trim() === "" ||
      longitude === null || longitude === undefined || String(longitude).trim() === "") return false;
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function calcularCentroMapa(dados) {
  if (!dados || dados.length === 0) return [-23.456, -47.123];
  let lat = 0, lng = 0, count = 0;
  dados.forEach((p) => {
    if (!coordenadaValida(p.latitude, p.longitude)) return;
    lat += Number(p.latitude);
    lng += Number(p.longitude);
    count++;
  });
  return count > 0 ? [lat / count, lng / count] : [-23.456, -47.123];
}

// ============================================
// FUNÇÕES DE BUSCA DE DADOS
// ============================================

const TAMANHO_PAGINA_RELATORIOS = 1000;

async function buscarTodasPaginasRelatorio(criarConsulta, descricao) {
  const acumulado = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA_RELATORIOS) {
    const { data, error } = await criarConsulta().range(inicio, inicio + TAMANHO_PAGINA_RELATORIOS - 1);
    if (error) throw new Error(`Falha ao consultar ${descricao}: ${error.message || "erro de comunicação"}`);
    const pagina = Array.isArray(data) ? data : [];
    acumulado.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_RELATORIOS) return acumulado;
  }
}

function limitesPeriodoSP(dataInicio, dataFim) {
  if (!dataISOValida(dataInicio) || !dataISOValida(dataFim) || dataFim < dataInicio) {
    throw new Error("Período inválido: confira as datas inicial e final.");
  }
  // As colunas consultadas são timestamp without time zone; a sessão do banco é UTC.
  // Mantemos os componentes UTC correspondentes ao instante de São Paulo, sem sufixo Z,
  // para o PostgREST não interpretar um fuso sobre uma coluna sem fuso.
  return {
    inicio: dataLocalSPParaISO(dataInicio, false).replace(/Z$/, ""),
    fim: dataLocalSPParaISO(dataFim, true).replace(/Z$/, ""),
  };
}

function obterEscopoRelatorio() {
  const perfil = authManager?.user?.perfil;
  if (perfil === "guarda") return authManager?.user?.id || null;
  return null; // supervisor e administrador veem o escopo operacional completo
}
function obterTipoRelatorioSelecionado() {
  const tipo = estado.filtros?.tipoOcorrencia;
  return tipo && TIPOS_OCORRENCIA.some((item) => item.value === tipo) ? tipo : null;
}
async function buscarOcorrenciasPeriodo(dataInicio, dataFim) {
  const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) throw new Error("Cliente de dados indisponível; não foi possível consultar ocorrências.");
  const limites = limitesPeriodoSP(dataInicio, dataFim);
  try {
    const criarConsulta = () => {
      let consulta = client
        .from("ocorrencias")
        .select("*")
        .is("deleted_at", null)
        .gte("criado_em", limites.inicio)
        .lte("criado_em", limites.fim);
      const escopo = obterEscopoRelatorio();
      const tipo = obterTipoRelatorioSelecionado();
      if (escopo) consulta = consulta.eq("criado_por", escopo);
      if (tipo) consulta = consulta.eq("tipo_ocorrencia", tipo);
      return consulta.order("criado_em", { ascending: true }).order("id", { ascending: true });
    };
    const rows = await buscarTodasPaginasRelatorio(criarConsulta, "ocorrências");
    return rows.filter((o) => o.deleted_at == null && o.esta_ativa !== false
      && (!obterEscopoRelatorio() || o.criado_por === obterEscopoRelatorio())
      && (!obterTipoRelatorioSelecionado() || o.tipo_ocorrencia === obterTipoRelatorioSelecionado()));
  } catch (error) {
    console.error("Erro ao buscar ocorrências:", error);
    throw error;
  }
}


function obterDataEventoRetificacao(o) {
  if (o.status === "pending_rectification") return o.solicitada_em || o.criado_em || null;
  if (o.status === "rectified") return o.retificado_em || o.aprovada_em || o.solicitada_em || o.criado_em || null;
  if (o.status === "rectification_rejected") return o.rejeitada_em || o.solicitada_em || o.criado_em || null;
  return null;
}

function dentroDoPeriodoBanco(valor, limites) {
  const instante = criarDateBanco(valor).getTime();
  return Number.isFinite(instante) && instante >= criarDateBanco(limites.inicio).getTime() && instante <= criarDateBanco(limites.fim).getTime();
}

function normalizarCamposAlterados(valor) {
  let campos = valor;
  if (typeof campos === "string") {
    try { campos = JSON.parse(campos); } catch (e) { return []; }
  }
  if (Array.isArray(campos)) return campos;
  if (campos && typeof campos === "object") {
    return Object.entries(campos).map(([campo, detalhe]) => ({
      campo,
      label: detalhe && typeof detalhe === "object" ? detalhe.label : undefined,
    }));
  }
  return [];
}

async function buscarRetificacoesPeriodo(dataInicio, dataFim) {
  const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) throw new Error("Cliente de dados indisponível; não foi possível consultar retificações.");
  const limites = limitesPeriodoSP(dataInicio, dataFim);
  const status = ["pending_rectification", "rectified", "rectification_rejected"];
  const camposEvento = ["solicitada_em", "retificado_em", "aprovada_em", "rejeitada_em", "criado_em"];
  const paginas = await Promise.all(camposEvento.map((campo) => buscarTodasPaginasRelatorio(() => {
    let consulta = client.from("ocorrencias").select("*").is("deleted_at", null).in("status", status)
      .gte(campo, limites.inicio).lte(campo, limites.fim);
    const escopo = obterEscopoRelatorio();
    const tipo = obterTipoRelatorioSelecionado();
    if (escopo) consulta = consulta.eq("criado_por", escopo);
    if (tipo) consulta = consulta.eq("tipo_ocorrencia", tipo);
    return consulta.order(campo, { ascending: true }).order("id", { ascending: true });
  }, `retificações por ${campo}`)));
  const unicos = new Map();
  paginas.flat().forEach((o) => { if (o?.id) unicos.set(o.id, o); });
  return [...unicos.values()]
    .filter((o) => o.deleted_at == null && o.esta_ativa !== false)
    .filter((o) => dentroDoPeriodoBanco(obterDataEventoRetificacao(o), limites))
    .filter((o) => !obterEscopoRelatorio() || o.criado_por === obterEscopoRelatorio())
    .filter((o) => !obterTipoRelatorioSelecionado() || o.tipo_ocorrencia === obterTipoRelatorioSelecionado())
    .sort((a, b) => criarDateBanco(obterDataEventoRetificacao(b)) - criarDateBanco(obterDataEventoRetificacao(a)));
}

async function buscarAbordagensPeriodo(dataInicio, dataFim) {
  const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) throw new Error("Cliente de dados indisponível; não foi possível consultar abordagens.");
  const limites = limitesPeriodoSP(dataInicio, dataFim);
  const criarConsultaAbordagens = (tabela) => {
    let consulta = client.from(tabela).select("*, usuarios(nome_completo)")
      .is("deleted_at", null).gte("criado_em", limites.inicio).lte("criado_em", limites.fim);
    const escopo = obterEscopoRelatorio();
    if (escopo) consulta = consulta.eq("criado_por", escopo);
    return consulta.order("criado_em", { ascending: true }).order("id", { ascending: true });
  };
  try {
    const [veiculos, pessoas] = await Promise.all([
      buscarTodasPaginasRelatorio(() => criarConsultaAbordagens("abordagens_veiculos"), "abordagens de veículos"),
      buscarTodasPaginasRelatorio(() => criarConsultaAbordagens("abordagens_pessoas"), "abordagens de pessoas"),
    ]);
    const somenteAtivas = (rows) => rows.filter((a) => a.esta_ativa !== false && (!obterEscopoRelatorio() || a.criado_por === obterEscopoRelatorio()));
    return { veiculos: somenteAtivas(veiculos), pessoas: somenteAtivas(pessoas) };
  } catch (error) {
    console.error("Erro ao buscar abordagens:", error);
    throw error;
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

function obterDataAtual() {
  const p = obterPartesDataSP();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function obterPrimeiroDiaMes() {
  return `${obterDataAtual().slice(0, 7)}-01`;
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
  if (typeof authManager === "undefined" || !authManager.podeAcessarRelatorios?.()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  if (estado.relatorioAtivo === "produtividade") estado.relatorioAtivo = "executivo";
  if (estado.relatorioAtivo === "por-guarda") estado.relatorioAtivo = "desempenho";
  if (["eficiencia", "previsao"].includes(estado.relatorioAtivo)) estado.relatorioAtivo = null;

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
  const tipoOcorrencia = obterTipoRelatorioSelecionado() || "";
  const perfilRelatorio = authManager?.user?.perfil || "usuário";
  const escopoDescricao = perfilRelatorio === "guarda"
    ? "Você vê somente registros cadastrados por você."
    : "Supervisores e administradores veem o escopo operacional completo.";

  const relatorios = [
    { id: "executivo", grupo: "visao", nome: "Resumo executivo", descricao: "Volume, situação, média diária e comparação com período equivalente", icon: "fa-chart-pie", cor: "azul", destaque: true },
    { id: "tendencias", grupo: "visao", nome: "Tendências observadas", descricao: "Distribuição histórica por mês, dia da semana e hora", icon: "fa-chart-line", cor: "verde" },
    { id: "atendimento", grupo: "visao", nome: "Tempo de atendimento", descricao: "Tempos válidos entre início e encerramento registrados", icon: "fa-clock", cor: "amarelo" },
    { id: "por-tipo", grupo: "ocorrencias", nome: "Ocorrências por tipo", descricao: "Contagens e situação por natureza registrada", icon: "fa-tag", cor: "verde" },
    { id: "por-local", grupo: "ocorrencias", nome: "Ocorrências por localidade", descricao: "Distribuição por bairro ou localidade informada", icon: "fa-map-marker-alt", cor: "vermelho" },
    { id: "cancelamentos", grupo: "ocorrencias", nome: "Cancelamentos", descricao: "Registros cancelados e motivos informados", icon: "fa-times-circle", cor: "vermelho" },
    { id: "retificacoes", grupo: "ocorrencias", nome: "Retificações", descricao: "Solicitações, decisões e justificativas registradas", icon: "fa-sync-alt", cor: "azul" },
    { id: "detalhado", grupo: "ocorrencias", nome: "Lista detalhada", descricao: "Registros individuais do período selecionado", icon: "fa-list-ul", cor: "cinza" },
    { id: "mapa", grupo: "ocorrencias", nome: "Mapa de ocorrências", descricao: "Registros com coordenadas disponíveis", icon: "fa-map-marked-alt", cor: "azul" },
    { id: "desempenho", grupo: "equipe", nome: "Registros por responsável pelo cadastro", descricao: "Contagens de ocorrências e abordagens pelo usuário que cadastrou; não medem participação ou qualidade individual", icon: "fa-user-tie", cor: "roxo" },
    { id: "abordagens-geral", grupo: "abordagens", nome: "Abordagens — visão geral", descricao: "Totais separados de abordagens de pessoas e veículos", icon: "fa-chart-bar", cor: "roxo" },
    { id: "abordagens-veiculos", grupo: "abordagens", nome: "Abordagens de veículos", descricao: "Registros, motivos e fases informadas para veículos", icon: "fa-motorcycle", cor: "azul" },
    { id: "abordagens-pessoas", grupo: "abordagens", nome: "Abordagens de pessoas", descricao: "Registros, motivos e fases informadas para pessoas", icon: "fa-user-friends", cor: "verde" },
  ];

  const gruposRelatorios = [
    { id: "visao", titulo: "Visão geral", descricao: "Indicadores agregados e padrões observados." },
    { id: "ocorrencias", titulo: "Ocorrências", descricao: "Distribuições, situação e consulta dos registros." },
    { id: "equipe", titulo: "Atividade da equipe", descricao: "Volume por usuário responsável pelo cadastro, sem ranking de desempenho." },
    { id: "abordagens", titulo: "Abordagens", descricao: "Registros de pessoas e veículos; sem inferir vínculo com BO." },
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
    <div class="container report-page" style="padding-bottom:120px;">
      <header class="report-page-header">
        <div>
          <p class="report-eyebrow">GUARDA MUNICIPAL · PITANGUEIRAS/PR</p>
          <h2><i class="fas fa-chart-pie" aria-hidden="true"></i> Relatórios</h2>
          <p class="report-page-subtitle">Consulte registros por período e tipo. Os indicadores descrevem dados registrados e não substituem avaliação operacional.</p>
          <p class="report-data-note"><i class="fas fa-user-shield" aria-hidden="true"></i> ${escopoDescricao}</p>
        </div>
        <div class="report-period-panel" aria-label="Período e tipo do relatório">
          <div class="report-period-field">
            <label for="relatorioDataInicio">De</label>
            <input type="date" id="relatorioDataInicio" value="${dataInicio}">
          </div>
          <span class="report-period-separator" aria-hidden="true">até</span>
          <div class="report-period-field">
            <label for="relatorioDataFim">Até</label>
            <input type="date" id="relatorioDataFim" value="${dataFim}">
          </div>
          <div class="report-period-field">
            <label for="relatorioTipoOcorrencia">Tipo de ocorrência</label>
            <select id="relatorioTipoOcorrencia">
              <option value="">Todos os tipos</option>
              ${TIPOS_OCORRENCIA.map((item) => `<option value="${item.value}" ${item.value === tipoOcorrencia ? "selected" : ""}>${escaparHTML(item.label)}</option>`).join("")}
            </select>
          </div>
          <button type="button" onclick="window._relatoriosAplicarFiltros()" class="btn-primary" aria-label="Aplicar período" title="Aplicar período">
            <i class="fas fa-filter" aria-hidden="true"></i><span>Aplicar</span>
          </button>
        </div>
      </header>

      <section class="report-summary" aria-label="Resumo do período selecionado" aria-live="polite">
        <div class="report-summary-card"><span class="report-summary-label">Registros</span><strong id="resumoTotal">—</strong></div>
        <div class="report-summary-card"><span class="report-summary-label">Sincronizadas</span><strong id="resumoFinalizadas">—</strong></div>
        <div class="report-summary-card"><span class="report-summary-label">Pendentes</span><strong id="resumoPendentes">—</strong></div>
        <div class="report-summary-card"><span class="report-summary-label">Taxa de sincronização</span><strong id="resumoTaxa">—</strong></div>
      </section>
      <p id="resumoErro" class="report-summary-error" role="status" aria-live="polite"></p>
  `;

  for (const grupo of gruposRelatorios) {
    const itens = relatorios.filter((rel) => rel.grupo === grupo.id);
    html += `
      <section class="report-group" aria-labelledby="grupo-rel-${grupo.id}">
        <header class="report-group-heading">
          <div><h3 id="grupo-rel-${grupo.id}">${grupo.titulo}</h3><p>${grupo.descricao}</p></div>
          <span class="report-group-count">${itens.length} ${itens.length === 1 ? "relatório" : "relatórios"}</span>
        </header>
        <div class="report-grid">
    `;
    for (const rel of itens) {
      const cor = coresMap[rel.cor] || coresMap.azul;
      html += `
        <button type="button" class="relatorio-card report-catalog-card" onclick="window._relatoriosAbrir('${rel.id}')">
          <span class="report-card-icon" style="background:${cor.bg};color:${cor.color}"><i class="fas ${rel.icon}" aria-hidden="true"></i></span>
          <span class="report-card-copy"><strong>${rel.nome}</strong><span>${rel.descricao}</span></span>
          <i class="fas fa-chevron-right report-card-arrow" aria-hidden="true"></i>
        </button>
      `;
    }
    html += `</div></section>`;
  }

  html += `
      <p class="report-data-note"><i class="fas fa-info-circle" aria-hidden="true"></i> Resumo calculado para registros criados no período exibido; problemas de consulta são informados separadamente de períodos sem registros.</p>
    </div>
  `;

  container.innerHTML = html;

  // Registrar funções globais
  window._relatoriosVoltar = () => {
    estado.relatorioAtivo = null;
    renderRelatorios(container, appInstance);
  };

  window._relatoriosAbrir = async (tipo) => {
    if (tipo === "eficiencia") {
      appInstance?.showToast?.("A conversão abordagem→BO foi suspensa: não há vínculo verificável entre os registros.", "warning");
      return;
    }
    if (tipo === "previsao") {
      appInstance?.showToast?.("O catálogo apresenta dados observados; a projeção linear não é uma previsão validada.", "warning");
      return;
    }
    const aliases = { produtividade: "executivo", "por-guarda": "desempenho" };
    tipo = aliases[tipo] || tipo;
    estado.relatorioAtivo = tipo;
    const dataInicio = document.getElementById("relatorioDataInicio")?.value || await obterPrimeiroDiaMes();
    const dataFim = document.getElementById("relatorioDataFim")?.value || await obterDataAtual();
    const tipoOcorrencia = document.getElementById("relatorioTipoOcorrencia")?.value || null;
    estado.filtros = { dataInicio, dataFim, tipoOcorrencia };
    await renderRelatorios(container, appInstance);
  };

  window._relatoriosAplicarFiltros = async () => {
    const dataInicio = document.getElementById("relatorioDataInicio")?.value || await obterPrimeiroDiaMes();
    const dataFim = document.getElementById("relatorioDataFim")?.value || await obterDataAtual();
    const tipoOcorrencia = document.getElementById("relatorioTipoOcorrencia")?.value || null;
    if (dataFim < dataInicio) {
      appInstance?.showToast?.("Data final deve ser maior ou igual à data inicial", "warning");
      return;
    }
    estado.filtros = { dataInicio, dataFim, tipoOcorrencia };
    if (estado.relatorioAtivo) await renderRelatorios(container, appInstance);
    else await carregarResumoRapido(appInstance);
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
  const ids = ["resumoTotal", "resumoFinalizadas", "resumoPendentes", "resumoTaxa"];
  const erroEl = document.getElementById("resumoErro");
  if (erroEl) erroEl.textContent = "";
  try {
    const dataInicio = estado.filtros.dataInicio || await obterPrimeiroDiaMes();
    const dataFim = estado.filtros.dataFim || await obterDataAtual();
    const ocorrencias = await buscarOcorrenciasPeriodo(dataInicio, dataFim);
    const stats = calcularEstatisticas(ocorrencias);
    const taxa = stats.total > 0 ? ((stats.finalizadas / stats.total) * 100).toFixed(1) : "—";
    document.getElementById("resumoTotal").textContent = String(stats.total);
    document.getElementById("resumoFinalizadas").textContent = String(stats.finalizadas);
    document.getElementById("resumoPendentes").textContent = String(stats.pendentes);
    document.getElementById("resumoTaxa").textContent = taxa === "—" ? "—" : `${taxa}%`;
  } catch (error) {
    console.warn("Erro ao carregar resumo rápido:", error);
    ids.forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
    if (erroEl) erroEl.textContent = "Resumo indisponível: falha ao consultar os dados. Tente novamente ou ajuste o período.";
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
        <p style="font-weight:500;">Acesso restrito a usuários autenticados</p>
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
  if (tipo === "produtividade") tipo = "executivo";
  if (tipo === "por-guarda") tipo = "desempenho";
  // Eficiência e previsão permanecem consultáveis/exportáveis, mas sem métricas inventadas.
  const dataInicio = estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
  const dataFim = estado.filtros.dataFim || (await obterDataAtual());

  estado.isLoading = true;
  estado.dadosCache = null;
  estado.abordagensCache = null;
  container.innerHTML = renderLoader("Carregando relatório...");

  try {
    const ocorrencias = tipo === "retificacoes"
      ? await buscarRetificacoesPeriodo(dataInicio, dataFim)
      : await buscarOcorrenciasPeriodo(dataInicio, dataFim);
    estado.comparacaoCache = null;
    const precisaAbordagens = tipo === "desempenho" || tipo === "eficiencia" || tipo.startsWith("abordagens-");
    const abordagens = precisaAbordagens ? await buscarAbordagensPeriodo(dataInicio, dataFim) : { veiculos: [], pessoas: [] };
    estado.dadosCache = ocorrencias;
    estado.abordagensCache = precisaAbordagens ? abordagens : null;

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
        nome: "Registros por Responsável pelo Cadastro",
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
        nome: "Projeção de Ocorrências (indisponível)",
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
        nome: "Conversão abordagem → BO (não calculada)",
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
      <div class="container report-detail-page" style="padding-bottom:120px;">
        <header class="report-detail-header">
          <div class="report-detail-heading">
            <span class="report-detail-icon" style="--report-accent:${escaparHTML(info.cor)}"><i class="fas ${escaparHTML(info.icone)}"></i></span>
            <div class="report-detail-copy">
              <h2>${escaparHTML(info.nome)}</h2>
              <p><i class="fas fa-calendar" aria-hidden="true"></i> ${escaparHTML(formatarData(dataInicio))} até ${escaparHTML(formatarData(dataFim))}</p>
            </div>
          </div>
          <div class="report-detail-actions">
            <button onclick="window._relatoriosVoltar()" class="btn-secondary report-back-button"><i class="fas fa-arrow-left" aria-hidden="true"></i> Voltar</button>
          </div>
        </header>
        <section class="report-detail-period-block" aria-labelledby="relatorioPeriodoDetalheTitulo">
          <div class="report-detail-period-heading">
            <h3 id="relatorioPeriodoDetalheTitulo"><i class="fas fa-calendar-alt" aria-hidden="true"></i> Período do relatório</h3>
            <p>Escolha as datas que serão consultadas e incluídas no PDF. O intervalo é aplicado automaticamente ao exportar.</p>
          </div>
          <div class="report-period-panel report-detail-period-panel" role="group" aria-label="Selecionar período personalizado">
            <div class="report-period-field">
              <label for="relatorioDetalheDataInicio">De</label>
              <input type="date" id="relatorioDetalheDataInicio" value="${escaparHTML(dataInicio)}">
            </div>
            <span class="report-period-separator" aria-hidden="true">até</span>
            <div class="report-period-field">
              <label for="relatorioDetalheDataFim">Até</label>
              <input type="date" id="relatorioDetalheDataFim" value="${escaparHTML(dataFim)}">
            </div>
            <button type="button" onclick="window._relatoriosAplicarPeriodoDetalhe()" class="btn-primary" aria-label="Aplicar período personalizado">
              <i class="fas fa-filter" aria-hidden="true"></i><span>Aplicar período</span>
            </button>
          </div>
          <div class="report-detail-period-actions">
            <p id="relatorioPeriodoDetalheStatus" role="status" aria-live="polite">Se alterar as datas, clique em “Aplicar período” para atualizar os dados; a exportação também aplica as alterações pendentes.</p>
            <button type="button" onclick="window._relatoriosExportarAtual()" class="btn-primary report-export-button"><i class="fas fa-file-pdf" aria-hidden="true"></i> Exportar PDF</button>
          </div>
        </section>
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
          abordagens,
        );
        break;
      case "retificacoes":
        conteudo = await renderConteudoRetificacoes(ocorrencias);
        break;
      case "cancelamentos":
        conteudo = await renderConteudoCancelamentos(ocorrencias);
        break;
      case "tendencias":
        conteudo = await renderConteudoTendencias(ocorrencias, dataInicio, dataFim);
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
          ocorrencias, dataInicio, dataFim, abordagens,
        );
        break;
      case "abordagens-pessoas":
        conteudo = await renderConteudoAbordagensPessoas(
          ocorrencias, dataInicio, dataFim, abordagens,
        );
        break;
      case "abordagens-geral":
        conteudo = await renderConteudoAbordagensGeral(
          ocorrencias, dataInicio, dataFim, abordagens,
        );
        break;
      case "eficiencia":
        conteudo = await renderConteudoEficiencia(ocorrencias, abordagens);
        break;
      default:
        conteudo = `<p style="text-align:center;padding:40px;color:var(--cinza-medio);">Relatório não encontrado</p>`;
    }

    html += conteudo;
    html += `</div>`;
    container.innerHTML = html;

    const aplicarPeriodoDetalhe = async ({ forcarAtualizacao = false } = {}) => {
      const novaDataInicio = document.getElementById("relatorioDetalheDataInicio")?.value || "";
      const novaDataFim = document.getElementById("relatorioDetalheDataFim")?.value || "";
      const statusEl = document.getElementById("relatorioPeriodoDetalheStatus");
      const informarErro = (mensagem, focoId) => {
        if (statusEl) statusEl.textContent = mensagem;
        appInstance?.showToast?.(mensagem, "warning");
        document.getElementById(focoId)?.focus?.();
        return false;
      };

      if (!dataISOValida(novaDataInicio)) {
        return informarErro("Informe uma data inicial válida para o relatório.", "relatorioDetalheDataInicio");
      }
      if (!dataISOValida(novaDataFim)) {
        return informarErro("Informe uma data final válida para o relatório.", "relatorioDetalheDataFim");
      }
      if (novaDataFim < novaDataInicio) {
        return informarErro("A data final deve ser igual ou posterior à data inicial.", "relatorioDetalheDataFim");
      }

      const periodoMudou = estado.filtros.dataInicio !== novaDataInicio || estado.filtros.dataFim !== novaDataFim;
      estado.filtros = { dataInicio: novaDataInicio, dataFim: novaDataFim };
      if (statusEl) statusEl.textContent = "Período válido. Atualizando os dados do relatório…";

      if (periodoMudou || forcarAtualizacao) {
        await renderRelatorios(container, appInstance);
        return estado.dadosCache !== null;
      }
      if (statusEl) statusEl.textContent = "Período aplicado. O PDF usará os dados exibidos.";
      return true;
    };

    window._relatoriosAplicarPeriodoDetalhe = () => aplicarPeriodoDetalhe({ forcarAtualizacao: true });
    window._relatoriosExportarAtual = async () => {
      const periodoValido = await aplicarPeriodoDetalhe();
      if (!periodoValido || estado.dadosCache === null) return;
      await exportarRelatorioPDF(tipo, appInstance);
    };
    window._relatoriosVoltar = () => {
      estado.relatorioAtivo = null;
      renderRelatorios(container, appInstance);
    };

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
        <p style="color:var(--cinza-medio);">${escaparHTML(error?.message || "Falha de comunicação com o serviço de dados.")}</p>
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
  const porMes = agruparPorMes(ocorrencias, dataInicio, dataFim);
  const taxaSincronizacao = stats.total > 0 ? ((stats.finalizadas / stats.total) * 100).toFixed(1) : "—";
  const mediaDiaria = calcularMediaDiaria(ocorrencias, dataInicio, dataFim);
  const periodoAnterior = calcularDataAnterior(dataInicio, dataFim);
  let anteriores = [];
  let comparacaoDisponivel = Boolean(periodoAnterior);
  if (periodoAnterior) {
    try { anteriores = await buscarOcorrenciasPeriodo(periodoAnterior.dataInicio, periodoAnterior.dataFim); }
    catch (error) { comparacaoDisponivel = false; console.warn("Comparação com o período anterior indisponível:", error); }
  }
  const variacao = comparacaoDisponivel && anteriores.length > 0 ? ((stats.total - anteriores.length) / anteriores.length * 100).toFixed(1) : null;
  estado.comparacaoCache = {
    dataInicio, dataFim, atual: stats.total, anterior: anteriores.length,
    dias: calcularDiasPeriodo(dataInicio, dataFim),
    status: !comparacaoDisponivel ? "unavailable" : anteriores.length ? "available" : "no-base",
  };
  const variacaoTexto = !comparacaoDisponivel
    ? "Comparação indisponível: falha ao consultar o período anterior."
    : variacao === null
      ? `Sem base comparável (${anteriores.length} registros no período anterior).`
      : `${variacao > 0 ? "+" : ""}${variacao}% (${stats.total} agora; ${anteriores.length} no período anterior)`;
  return `
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${stats.total}</strong><span>Registros no período</span></div>
      <div class="report-kpi"><strong>${stats.finalizadas}</strong><span>Sincronizadas no sistema</span></div>
      <div class="report-kpi"><strong>${stats.pendentes}</strong><span>Pendentes de sincronização</span></div>
      <div class="report-kpi"><strong>${stats.canceladas}</strong><span>Canceladas</span></div>
      <div class="report-kpi"><strong>${taxaSincronizacao === "—" ? "—" : `${taxaSincronizacao}%`}</strong><span>Taxa de sincronização</span></div>
      <div class="report-kpi"><strong>${mediaDiaria}</strong><span>Média registrada por dia</span></div>
      <div class="report-kpi report-kpi-wide"><strong>${variacao === null ? "—" : `${variacao > 0 ? "+" : ""}${variacao}%`}</strong><span>Variação em relação aos ${calcularDiasPeriodo(dataInicio, dataFim)} dias equivalentes anteriores</span><small>${variacaoTexto}</small></div>
    </div>
    <p class="report-method-note">“Sincronizadas” indica que o registro foi enviado ao sistema; não significa encerramento, qualidade do atendimento ou desfecho da ocorrência. A taxa usa todos os registros retornados no período como denominador; se não houver registros, é “—”.</p>
    ${renderTabelasPorTipoHTML(porTipo, true)}
    <div class="report-content-card"><h3>Evolução mensal observada</h3><div class="report-chart-wrap"><canvas id="chartExecutivoMensal"></canvas></div></div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO POR TIPO
// ============================================

async function renderConteudoPorTipo(ocorrencias) {
  const porTipo = agruparPorTipo(ocorrencias);
  return `
    <p class="report-method-note">Percentuais usam todos os registros válidos no período. “Sincronizada” descreve o envio ao sistema, não o encerramento do atendimento. “Rascunhos / outros” reúne estados não listados; retificações aparecem em quadro separado para facilitar conferência.</p>
    <div class="report-kpi-grid report-kpi-grid-compact">
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Registros no período</span></div>
      <div class="report-kpi"><strong>${porTipo.length}</strong><span>Tipos observados</span></div>
      <div class="report-kpi"><strong>${porTipo.reduce((sum, t) => sum + t.retificadas + t.retificacoesPendentes + t.retificacoesRejeitadas, 0)}</strong><span>Eventos de retificação</span></div>
    </div>
    ${renderTabelasPorTipoHTML(porTipo, true)}
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO POR LOCAL
// ============================================

async function renderConteudoPorLocal(ocorrencias) {
  const porBairro = agruparPorBairro(ocorrencias);
  const topBairros = porBairro.slice(0, 8);
  const semLocal = ocorrencias.filter((o) => !(o.bairro_ocorrencia || o.local_ocorrencia)).length;
  const primeiro = porBairro[0];
  return `
    <p class="report-method-note">Agrupamento prioriza bairro/localidade e usa o campo de local como alternativa. Registros sem ambos os campos permanecem em “Não informado”; percentuais usam todos os registros no período.</p>
    <div class="report-kpi-grid report-kpi-grid-compact">
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Registros no período</span></div>
      <div class="report-kpi"><strong>${porBairro.length}</strong><span>Localidades agrupadas</span></div>
      <div class="report-kpi"><strong>${semLocal}</strong><span>Sem local informado</span></div>
      <div class="report-kpi"><strong>${primeiro ? primeiro.total : "—"}</strong><span>${primeiro ? `Maior volume: ${escaparHTML(primeiro.bairro)}` : "Sem registros"}</span></div>
    </div>
    <div class="report-content-card"><h3>Distribuição por localidade</h3>
      <div class="report-chart-wrap"><canvas id="chartLocalBairros"></canvas></div>
    </div>
    <div class="report-content-card"><h3>Todas as localidades</h3>
      <div class="table-wrapper"><table><thead><tr><th>Localidade</th><th>Registros</th><th>% do período</th></tr></thead><tbody>
      ${porBairro.map((b) => `<tr><td>${escaparHTML(b.bairro)}</td><td>${b.total}</td><td>${b.percentual}%</td></tr>`).join("") || `<tr><td colspan="3">Nenhum registro no período.</td></tr>`}
      </tbody></table></div>
    </div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DE ATENDIMENTO
// ============================================

async function renderConteudoAtendimento(ocorrencias) {
  const tempos = ocorrencias.map((o) => {
    const inicio = criarDateBanco(o.data_hora_inicio);
    const fim = criarDateBanco(o.data_hora_encerramento || o.data_hora_finalizacao);
    const minutos = Number.isFinite(inicio.getTime()) && Number.isFinite(fim.getTime())
      ? (fim - inicio) / 60000 : NaN;
    return { ...o, tempoMinutos: minutos };
  }).filter((o) => Number.isFinite(o.tempoMinutos) && o.tempoMinutos > 0);
  const mediaGeral = tempos.length ? tempos.reduce((s, t) => s + t.tempoMinutos, 0) / tempos.length : NaN;
  const formatarTempo = (minutos) => {
    if (!Number.isFinite(minutos)) return "—";
    if (minutos < 1) return "< 1 min";
    if (minutos < 60) return `${Math.round(minutos)} min`;
    const horas = Math.floor(minutos / 60), mins = Math.round(minutos % 60);
    return `${horas}h ${mins}min`;
  };
  const porTipo = new Map();
  tempos.forEach((t) => {
    const key = t.tipo_ocorrencia || "Não informado";
    if (!porTipo.has(key)) porTipo.set(key, []);
    porTipo.get(key).push(t.tempoMinutos);
  });
  const mediaPorTipo = [...porTipo.entries()].map(([key, valores]) => ({
    tipo: getTipoLabel(key),
    media: valores.reduce((s,v) => s+v, 0) / valores.length,
    mediana: medianaNumerica(valores), total: valores.length,
    rapido: valores.filter((v) => v < 15).length,
    lento: valores.filter((v) => v > 45).length,
  })).sort((a,b) => b.media-a.media);
  const rapido = tempos.filter((t) => t.tempoMinutos < 15).length;
  const lento = tempos.filter((t) => t.tempoMinutos > 45).length;
  const semDuracao = ocorrencias.length - tempos.length;
  return `
    <p class="report-method-note">Tempo entre início e encerramento. Quando o encerramento não foi informado, usa-se a finalização registrada. ${tempos.length} amostra(s) positiva(s) e válida(s); ${semDuracao} registro(s) sem duração válida. Tempos não positivos são excluídos; faixas: rápido &lt; 15 min, lento &gt; 45 min.</p>
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${formatarTempo(mediaGeral)}</strong><span>Média das durações válidas</span></div>
      <div class="report-kpi"><strong>${rapido}</strong><span>Atendimentos abaixo de 15 min</span></div>
      <div class="report-kpi"><strong>${lento}</strong><span>Atendimentos acima de 45 min</span></div>
    </div>
    <div class="report-content-card"><h3>Tempo por tipo de ocorrência</h3>
      <div class="table-wrapper"><table><thead><tr><th>Tipo</th><th>Amostras</th><th>Média</th><th>Mediana</th><th>Rápidos (&lt; 15 min)</th><th>Lentos (&gt; 45 min)</th></tr></thead><tbody>
      ${mediaPorTipo.map((t) => `<tr><td>${escaparHTML(t.tipo)}</td><td>${t.total}</td><td>${escaparHTML(formatarTempo(t.media))}</td><td>${escaparHTML(formatarTempo(t.mediana))}</td><td>${t.rapido}</td><td>${t.lento}</td></tr>`).join("") || `<tr><td colspan="6">Nenhuma duração válida no período.</td></tr>`}
      </tbody></table></div>
    </div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DE DESEMPENHO
// ============================================

async function renderConteudoDesempenho(ocorrencias, dataInicio, dataFim, abordagensDados = null) {
  const abordagens = abordagensDados || estado.abordagensCache || await buscarAbordagensPeriodo(dataInicio, dataFim);
  const ids = [...new Set([
    ...ocorrencias.map((o) => o.criado_por).filter(Boolean),
    ...(abordagens.veiculos || []).map((a) => a.criado_por).filter(Boolean),
    ...(abordagens.pessoas || []).map((a) => a.criado_por).filter(Boolean),
  ])];
  const usuarios = await buscarDadosUsuariosEmLote(ids);
  const porResponsavel = new Map();
  const garantir = (id, nestedName = "") => {
    const key = id || "sem-identificador";
    if (!porResponsavel.has(key)) porResponsavel.set(key, {
      nome: usuarios[id]?.nome_completo || nestedName || (id ? `Usuário ${String(id).slice(0, 8)}` : "Usuário não identificado"),
      ocorrencias: 0, finalizadas: 0, pendentes: 0, canceladas: 0, abordagensVeiculos: 0, abordagensPessoas: 0,
    });
    return porResponsavel.get(key);
  };
  ocorrencias.forEach((o) => {
    const item = garantir(o.criado_por);
    item.ocorrencias++;
    if (o.status === "synced") item.finalizadas++;
    if (o.status === "pending_sync") item.pendentes++;
    if (o.status === "cancelled") item.canceladas++;
  });
  (abordagens.veiculos || []).forEach((a) => garantir(a.criado_por, a.usuarios?.nome_completo).abordagensVeiculos++);
  (abordagens.pessoas || []).forEach((a) => garantir(a.criado_por, a.usuarios?.nome_completo).abordagensPessoas++);
  const linhas = [...porResponsavel.values()].map((item) => ({
    ...item, total: item.ocorrencias + item.abordagensVeiculos + item.abordagensPessoas,
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const totalRegistros = linhas.reduce((soma, item) => soma + item.total, 0);
  return `
    <p class="report-method-note">Contagem pelo usuário que cadastrou o registro. Não identifica todos os participantes da ocorrência nem mede escala, esforço, qualidade ou resultado individual.</p>
    <div class="report-kpi-grid report-kpi-grid-compact">
      <div class="report-kpi"><strong>${linhas.length}</strong><span>Responsáveis com registros</span></div>
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Ocorrências cadastradas</span></div>
      <div class="report-kpi"><strong>${(abordagens.veiculos || []).length + (abordagens.pessoas || []).length}</strong><span>Abordagens cadastradas</span></div>
      <div class="report-kpi"><strong>${totalRegistros}</strong><span>Total de registros listados</span></div>
    </div>
    <div class="report-content-card"><h3>Contagem por responsável pelo cadastro</h3>
      <div class="table-wrapper"><table><thead><tr><th>Usuário</th><th>Ocorrências</th><th>Sincronizadas</th><th>Pendentes</th><th>Canceladas</th><th>Abord. veículos</th><th>Abord. pessoas</th><th>Total</th></tr></thead><tbody>
      ${linhas.map((item) => `<tr><td>${escaparHTML(item.nome)}</td><td>${item.ocorrencias}</td><td>${item.finalizadas}</td><td>${item.pendentes}</td><td>${item.canceladas}</td><td>${item.abordagensVeiculos}</td><td>${item.abordagensPessoas}</td><td>${item.total}</td></tr>`).join("") || `<tr><td colspan="8">Nenhum registro no período.</td></tr>`}
      </tbody></table></div>
    </div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DE RETIFICAÇÕES
// ============================================

async function renderConteudoRetificacoes(ocorrencias) {
  const retificacoes = ocorrencias
    .filter((o) => ["rectified", "pending_rectification", "rectification_rejected"].includes(o.status))
    .sort((a, b) => criarDateBanco(obterDataEventoRetificacao(b)) - criarDateBanco(obterDataEventoRetificacao(a)));
  const aplicadas = retificacoes.filter((o) => o.status === "rectified");
  const pendentes = retificacoes.filter((o) => o.status === "pending_rectification");
  const rejeitadas = retificacoes.filter((o) => o.status === "rectification_rejected");
  const contagemCampos = new Map();
  aplicadas.forEach((r) => normalizarCamposAlterados(r.campos_alterados).forEach((campo) => {
    const label = campo?.label || campo?.campo || campo?.name;
    if (label) contagemCampos.set(String(label), (contagemCampos.get(String(label)) || 0) + 1);
  }));
  const topCampos = [...contagemCampos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rotuloStatus = {
    rectified: "Aplicada", pending_rectification: "Pendente", rectification_rejected: "Rejeitada",
  };
  const classeStatus = (status) => `report-status-pill report-status-${getStatusClass(status)}`;
  return `
    <p class="report-method-note">O período considera o evento vigente: solicitação pendente, aplicação ou rejeição. Registros legados sem data específica usam a data de criação como aproximação.</p>
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${aplicadas.length}</strong><span>Retificações aplicadas</span></div>
      <div class="report-kpi"><strong>${pendentes.length}</strong><span>Solicitações pendentes</span></div>
      <div class="report-kpi"><strong>${rejeitadas.length}</strong><span>Solicitações rejeitadas</span></div>
    </div>
    ${topCampos.length ? `<div class="report-content-card"><h3>Campos alterados nas retificações aplicadas</h3>${topCampos.map(([campo, total]) => `<div class="report-inline-stat"><span>${escaparHTML(campo)}</span><strong>${total}</strong></div>`).join("")}</div>` : ""}
    <div class="report-content-card"><h3>Eventos de retificação</h3>
      <div class="table-wrapper"><table><thead><tr><th>Nº GM</th><th>Data do evento</th><th>Tipo</th><th>Situação atual</th><th>Justificativa</th><th>Motivo de rejeição</th></tr></thead><tbody>
        ${retificacoes.slice(0, 100).map((r) => `<tr><td>${escaparHTML(r.numero_ocorrencia || r.numero_temporario || "Sem número")}</td><td>${escaparHTML(formatarDataHoraSP(obterDataEventoRetificacao(r)))}</td><td>${escaparHTML(getTipoLabel(r.tipo_ocorrencia))}</td><td><span class="${classeStatus(r.status)}">${rotuloStatus[r.status] || "Não informado"}</span></td><td>${escaparHTML(r.solicitacao_retificacao_justificativa || r.justificativa_retificacao || "—")}</td><td>${escaparHTML(r.motivo_rejeicao || "—")}</td></tr>`).join("") || `<tr><td colspan="6">Nenhum evento de retificação no período.</td></tr>`}
      </tbody></table></div>
      ${retificacoes.length > 100 ? `<p>Mostrando os 100 eventos mais recentes de ${retificacoes.length}; o PDF exporta o conjunto completo filtrado.</p>` : ""}
    </div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DE CANCELAMENTOS
// ============================================

async function renderConteudoCancelamentos(ocorrencias) {
  const canceladas = ocorrencias.filter((o) => o.status === "cancelled");

  const motivos = Object.create(null);
  canceladas.forEach((o) => {
    const motivo = o.motivo_cancelamento || "Não informado";
    motivos[motivo] = (motivos[motivo] || 0) + 1;
  });

  const topMotivos = Object.keys(motivos)
    .map((key) => ({ motivo: key, total: motivos[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const taxaCancelamento = ocorrencias.length > 0
    ? `${((canceladas.length / ocorrencias.length) * 100).toFixed(1)}%`
    : "—";

  return `
    <div style="margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <p style="font-size:12px;color:var(--cinza-medio);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:4px;"></i>
          O período considera a data de criação da ocorrência: o schema não possui timestamp de cancelamento. A proporção é canceladas ÷ total de ocorrências consultadas no intervalo (inclusive canceladas); sem base, exibimos “—”.
        </p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--erro);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${canceladas.length}</div>
        <div style="font-size:9px;opacity:0.8;">Ocorrências canceladas</div>
      </div>
      <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:12px;text-align:center;color:white;">
        <div style="font-size:22px;font-weight:800;">${taxaCancelamento}</div>
        <div style="font-size:9px;opacity:0.8;">Proporção cancelada do total</div>
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
            <span>${escaparHTML(m.motivo)}</span>
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

async function renderConteudoTendencias(ocorrencias, dataInicio, dataFim) {
  const porDiaSemana = Object.fromEntries(DIAS_SEMANA.map((_, index) => [index, 0]));
  const porHora = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [index, 0]));
  ocorrencias.forEach((o) => {
    const instante = criarDateBanco(o.criado_em);
    if (Number.isNaN(instante.getTime())) return;
    const data = obterPartesDataSP(instante);
    const diaSemana = new Date(Date.UTC(data.year, data.month - 1, data.day)).getUTCDay();
    if (diaSemana >= 0 && diaSemana < 7) porDiaSemana[diaSemana]++;
    if (data.hour >= 0 && data.hour < 24) porHora[data.hour]++;
  });
  const dadosDiaSemana = DIAS_SEMANA.map((dia, index) => ({ dia, total: porDiaSemana[index] }));
  const dadosHora = Array.from({ length: 24 }, (_, hora) => ({ hora, total: porHora[hora] }));
  const dadosMes = agruparPorMes(ocorrencias, dataInicio, dataFim);
  const diaPico = ocorrencias.length ? dadosDiaSemana.reduce((a,b) => a.total > b.total ? a : b) : null;
  const horaPico = ocorrencias.length ? dadosHora.reduce((a,b) => a.total > b.total ? a : b) : null;
  return `
    <p class="report-method-note">Distribuição usa o instante de criação convertido para America/Sao_Paulo. Dias da semana e horas incluem categorias com zero registros; os meses seguem o intervalo selecionado.</p>
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${diaPico ? escaparHTML(diaPico.dia) : "—"}</strong><span>Dia mais frequente</span><small>${diaPico ? `${diaPico.total} registro(s)` : "Sem registros no período"}</small></div>
      <div class="report-kpi"><strong>${horaPico ? `${String(horaPico.hora).padStart(2, "0")}:00` : "—"}</strong><span>Faixa horária mais frequente</span><small>${horaPico ? `${horaPico.total} registro(s)` : "Sem registros no período"}</small></div>
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Registros observados</span></div>
    </div>
    <div class="report-content-card"><h3>Evolução mensal observada</h3><div class="report-chart-wrap"><canvas id="chartTendenciasMensal"></canvas></div></div>
    <div class="report-kpi-grid report-kpi-grid-compact">
      <div class="report-content-card"><h3>Distribuição por dia da semana</h3><div class="report-chart-wrap"><canvas id="chartTendenciasDiaSemana"></canvas></div></div>
      <div class="report-content-card"><h3>Distribuição por hora local</h3><div class="report-chart-wrap"><canvas id="chartTendenciasHora"></canvas></div></div>
    </div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DE PRODUTIVIDADE
// ============================================

async function renderConteudoProdutividade(ocorrencias, dataInicio, dataFim) {
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  const media = dias ? ocorrencias.length / dias : null;
  const porDia = new Map();
  ocorrencias.forEach((o) => {
    const d = obterPartesDataSP(criarDateBanco(o.criado_em));
    if (!Number.isFinite(d.year) || !Number.isFinite(d.month) || !Number.isFinite(d.day)) return;
    const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    porDia.set(key, (porDia.get(key) || 0) + 1);
  });
  const diasAtivos = porDia.size;
  const topDias = [...porDia.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  const maiorDia = topDias[0];
  const porMes = agruparPorMes(ocorrencias, dataInicio, dataFim);
  return `
    <p class="report-method-note">Este relatório mede volume de registros criados no período — não produtividade individual, esforço operacional, qualidade ou resultado. A média diária divide o total por todos os dias corridos do intervalo, inclusive dias sem registro. Datas convertidas para America/Sao_Paulo.</p>
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Registros criados</span></div>
      <div class="report-kpi"><strong>${media === null ? "—" : media.toFixed(1)}</strong><span>Média por dia corrido</span></div>
      <div class="report-kpi"><strong>${diasAtivos}</strong><span>Dias com ao menos um registro</span></div>
      <div class="report-kpi"><strong>${maiorDia ? maiorDia[1] : "—"}</strong><span>${maiorDia ? `Maior volume em ${formatarData(maiorDia[0])}` : "Sem registros no período"}</span></div>
    </div>
    <div class="report-content-card"><h3>Volume mensal observado</h3><div class="table-wrapper"><table><thead><tr><th>Mês</th><th>Registros criados</th></tr></thead><tbody>${porMes.map((m) => `<tr><td>${escaparHTML(m.label)}</td><td>${m.value}</td></tr>`).join("") || `<tr><td colspan="2">Nenhum registro no período.</td></tr>`}</tbody></table></div></div>
    <div class="report-content-card"><h3>Dias com maior volume de registros</h3><div class="table-wrapper"><table><thead><tr><th>Data local</th><th>Registros</th></tr></thead><tbody>${topDias.map(([date,count]) => `<tr><td>${escaparHTML(formatarData(date))}</td><td>${count}</td></tr>`).join("") || `<tr><td colspan="2">Nenhum registro no período.</td></tr>`}</tbody></table></div></div>
  `;
}


// ============================================
// CONTEÚDO - RELATÓRIO DETALHADO
// ============================================

async function renderConteudoDetalhado(ocorrencias) {
  const porTipo = agruparPorTipo(ocorrencias);
  const tiposResumo = porTipo.slice(0, 5);
  const restantes = Math.max(0, porTipo.length - tiposResumo.length);
  return `
    <p class="report-method-note">Lista dos principais campos operacionais. Selecione uma linha para abrir o registro completo; o número do BO externo é separado do número interno GM.</p>
    ${tiposResumo.length ? `<div class="report-type-chips">${tiposResumo.map((t) => `<span class="report-type-chip">${escaparHTML(t.tipo)}: ${t.total}</span>`).join("")}${restantes ? `<span class="report-type-chip report-type-chip-muted">+ ${restantes} outros tipos</span>` : ""}</div>` : ""}
    <div class="report-content-card"><h3>Registros do período (${ocorrencias.length})</h3>
      <div class="table-wrapper report-detail-table-wrap"><table><thead><tr><th>Nº GM</th><th>BO externo</th><th>Data/hora</th><th>Tipo</th><th>Gravidade</th><th>Localidade</th><th>Situação</th></tr></thead><tbody>
        ${ocorrencias.map((o) => `<tr data-relatorio-id="${escaparHTML(o.id)}" onclick="window._relatoriosVerDetalhes(this.dataset.relatorioId)" tabindex="0" role="button" aria-label="Abrir ocorrência ${escaparHTML(o.numero_ocorrencia || o.numero_temporario || "sem número")}"><td>${escaparHTML(o.numero_ocorrencia || o.numero_temporario || "Rascunho")}</td><td>${escaparHTML(o.numero_bo || "—")}</td><td>${escaparHTML(formatarDataHoraSP(o.criado_em))}</td><td>${escaparHTML(getTipoLabel(o.tipo_ocorrencia))}</td><td>${escaparHTML(o.gravidade || "—")}</td><td>${escaparHTML(o.bairro_ocorrencia || o.local_ocorrencia || "—")}</td><td><span class="badge badge-${getStatusClass(o.status)}">${escaparHTML(getStatusLabel(o.status))}</span></td></tr>`).join("") || `<tr><td colspan="7">Nenhuma ocorrência no período.</td></tr>`}
      </tbody></table></div>
      <p class="report-table-footnote">Total: ${ocorrencias.length} registro(s). Role horizontalmente para consultar todas as colunas em telas estreitas.</p>
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
    .filter((o) => coordenadaValida(o.latitude, o.longitude))
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
        <span style="font-size:9px;color:var(--cinza-medio);">Marcadores: cor por tipo. Clusters: azul (até 10), âmbar (11–20), vermelho (acima de 20).</span>
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

async function renderConteudoPrevisao() {
  return `<div class="report-method-note">Projeção indisponível: extrapolação linear não é uma previsão validada. Use o relatório de tendências observadas para consultar contagens históricas.</div>`;
}

// ============================================
// CONTEÚDO - RELATÓRIO DE ABORDAGENS
// ============================================

async function renderConteudoAbordagens(veiculos, pessoas, dataInicio, dataFim, tipo) {
  const incluiVeiculos = tipo !== "pessoas";
  const incluiPessoas = tipo !== "veiculos";
  const listaVeiculos = incluiVeiculos ? (veiculos || []) : [];
  const listaPessoas = incluiPessoas ? (pessoas || []) : [];
  const total = listaVeiculos.length + listaPessoas.length;
  const naoClassificados = [...listaVeiculos, ...listaPessoas]
    .filter((item) => item.tipo_atendimento === "legado_nao_classificado").length;
  const esc = (valor) => escaparHTML(valor === null || valor === undefined || String(valor).trim() === "" ? "—" : String(valor));
  const dataHora = (valor) => valor ? esc(formatarDataHoraSP(valor)) : "—";
  const faseLabel = (valor) => ({ advertencia: "Advertência", multa: "Multa" }[valor] || esc(valor));
  const statusLabel = (valor) => ({ ativa: "Ativa", encerrada: "Encerrada", finalizada: "Finalizada", cancelada: "Cancelada" }[valor] || esc(valor));
  const atendimentoLabel = (valor) => valor === "legado_nao_classificado" ? "Legado — contexto não classificado" : esc(valor);
  const agruparMotivos = (lista) => {
    const contagem = new Map();
    lista.forEach((item) => {
      const motivo = String(item.motivo || "Não informado");
      contagem.set(motivo, (contagem.get(motivo) || 0) + 1);
    });
    return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  };
  const tabelaMotivos = (titulo, lista) => {
    const motivos = agruparMotivos(lista);
    return `<section class="report-content-card"><h3>${titulo}</h3><div class="table-wrapper"><table><thead><tr><th>Motivo informado</th><th>Registros</th><th>% do grupo</th></tr></thead><tbody>${motivos.map(([motivo, quantidade]) => `<tr><td>${esc(motivo)}</td><td>${quantidade}</td><td>${lista.length ? ((quantidade / lista.length) * 100).toFixed(1) + "%" : "—"}</td></tr>`).join("") || `<tr><td colspan="3">Nenhum motivo registrado no período.</td></tr>`}</tbody></table></div></section>`;
  };

  let html = `<p class="report-method-note">Contagem de abordagens registradas no período selecionado. Pessoas e veículos permanecem em grupos separados; este relatório não infere vínculo entre abordagem e boletim de ocorrência. ${naoClassificados} registro(s) legado(s) sem classificação de atendimento.</p>
    <div class="report-kpi-grid report-kpi-grid-compact">
      <div class="report-kpi"><strong>${total}</strong><span>Total de abordagens</span></div>
      ${incluiVeiculos ? `<div class="report-kpi"><strong>${listaVeiculos.length}</strong><span>Abordagens de veículos</span></div>` : ""}
      ${incluiPessoas ? `<div class="report-kpi"><strong>${listaPessoas.length}</strong><span>Abordagens de pessoas</span></div>` : ""}
      <div class="report-kpi"><strong>${naoClassificados}</strong><span>Legado sem classificação</span></div>
    </div>`;

  if (incluiVeiculos) {
    html += tabelaMotivos("Motivos informados — veículos", listaVeiculos);
    html += `<section class="report-content-card"><h3>Veículos — identificação e local</h3><div class="table-wrapper"><table><thead><tr><th>Data</th><th>Placa / descrição</th><th>Marca / modelo / cor</th><th>Identificação</th><th>Local</th></tr></thead><tbody>${listaVeiculos.map((v) => `<tr><td>${dataHora(v.criado_em)}</td><td>${esc(v.placa || v.descricao_identificacao)}</td><td>${esc([v.marca_modelo, v.cor].filter(Boolean).join(" / "))}</td><td>${esc(v.identificacao_status)}</td><td>${esc(v.local_abordagem)}</td></tr>`).join("") || `<tr><td colspan="5">Nenhuma abordagem de veículo no período.</td></tr>`}</tbody></table></div></section>`;
    html += `<section class="report-content-card"><h3>Veículos — contexto e providências</h3><div class="table-wrapper"><table><thead><tr><th>Data</th><th>Tipo de atendimento</th><th>Motivo</th><th>Providência</th><th>Fase</th><th>Situação</th><th>Responsável pelo cadastro</th></tr></thead><tbody>${listaVeiculos.map((v) => `<tr><td>${dataHora(v.criado_em)}</td><td>${atendimentoLabel(v.tipo_atendimento)}</td><td>${esc(v.motivo)}</td><td>${esc(v.providencia)}</td><td>${faseLabel(v.fase)}</td><td>${statusLabel(v.status_abordagem)}</td><td>${esc(v.usuarios?.nome_completo)}</td></tr>`).join("") || `<tr><td colspan="7">Nenhuma abordagem de veículo no período.</td></tr>`}</tbody></table></div></section>`;
  }

  if (incluiPessoas) {
    html += tabelaMotivos("Motivos informados — pessoas", listaPessoas);
    html += `<section class="report-content-card"><h3>Pessoas — identificação e local</h3><div class="table-wrapper"><table><thead><tr><th>Data</th><th>Nome / alcunha</th><th>RG</th><th>CPF</th><th>Local</th><th>Reincidências registradas</th></tr></thead><tbody>${listaPessoas.map((p) => `<tr><td>${dataHora(p.criado_em)}</td><td>${esc([p.nome, p.alcunha].filter(Boolean).join(" / "))}</td><td>${esc(p.rg)}</td><td>${esc(p.cpf)}</td><td>${esc(p.local_abordagem)}</td><td>${esc(p.reincidencia_count)}</td></tr>`).join("") || `<tr><td colspan="6">Nenhuma abordagem de pessoa no período.</td></tr>`}</tbody></table></div></section>`;
    html += `<section class="report-content-card"><h3>Pessoas — contexto e providências</h3><div class="table-wrapper"><table><thead><tr><th>Data</th><th>Tipo de atendimento</th><th>Motivo</th><th>Providência</th><th>Fase</th><th>Situação / regularização</th><th>Prazo</th><th>Responsável pelo cadastro</th></tr></thead><tbody>${listaPessoas.map((p) => `<tr><td>${dataHora(p.criado_em)}</td><td>${atendimentoLabel(p.tipo_atendimento)}</td><td>${esc(p.motivo)}</td><td>${esc(p.providencia)}</td><td>${faseLabel(p.fase)}</td><td>${esc([statusLabel(p.status_abordagem), p.status_regularizacao].filter(Boolean).join(" / "))}</td><td>${p.prazo_data || p.prazo ? esc(formatarData(p.prazo_data || p.prazo)) : "—"}</td><td>${esc(p.usuarios?.nome_completo)}</td></tr>`).join("") || `<tr><td colspan="8">Nenhuma abordagem de pessoa no período.</td></tr>`}</tbody></table></div></section>`;
  }

  return html;
}
async function renderConteudoAbordagensVeiculos(ocorrencias, dataInicio, dataFim, abordagensDados = null) {
  const abordagens = abordagensDados || estado.abordagensCache || await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens(abordagens.veiculos || [], [], dataInicio, dataFim, "veiculos");
}

async function renderConteudoAbordagensPessoas(ocorrencias, dataInicio, dataFim, abordagensDados = null) {
  const abordagens = abordagensDados || estado.abordagensCache || await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens([], abordagens.pessoas || [], dataInicio, dataFim, "pessoas");
}

async function renderConteudoAbordagensGeral(ocorrencias, dataInicio, dataFim, abordagensDados = null) {
  const abordagens = abordagensDados || estado.abordagensCache || await buscarAbordagensPeriodo(dataInicio, dataFim);
  return renderConteudoAbordagens(abordagens.veiculos || [], abordagens.pessoas || [], dataInicio, dataFim, "geral");
}


// ============================================
// CONTEÚDO - EFICIÊNCIA OPERACIONAL
// ============================================

async function renderConteudoEficiencia(ocorrencias = [], abordagens = { veiculos: [], pessoas: [] }) {
  const veiculos = abordagens?.veiculos || [];
  const pessoas = abordagens?.pessoas || [];
  return `
    <p class="report-method-note">A taxa de conversão abordagem → BO não é calculada: não há vínculo verificável entre uma abordagem específica e um boletim. Abaixo, BOs e abordagens são contagens independentes no mesmo período; não representam conversão nem eficiência individual.</p>
    <div class="report-kpi-grid">
      <div class="report-kpi"><strong>${ocorrencias.length}</strong><span>Ocorrências ativas criadas</span></div>
      <div class="report-kpi"><strong>${veiculos.length}</strong><span>Abordagens de veículos ativas</span></div>
      <div class="report-kpi"><strong>${pessoas.length}</strong><span>Abordagens de pessoas ativas</span></div>
    </div>
    <div class="report-content-card"><h3>Conversão não calculada</h3><p>Sem relação de dados que permita comprovar qual abordagem originou qual BO, qualquer percentual seria enganoso.</p></div>
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
    estado.dadosCache?.filter((o) => coordenadaValida(o.latitude, o.longitude)) || [];
  if (dadosMapa.length === 0) return;

  if (typeof L === "undefined") {
    console.warn("Leaflet não carregado");
    mapaContainer.innerHTML = `<div class="report-map-error" role="alert"><strong>Mapa indisponível</strong><span>Não foi possível carregar a biblioteca cartográfica. Confira a conexão e reabra o relatório.</span></div>`;
    return;
  }

  if (estado.mapaInstance) {
    try {
      estado.mapaInstance.remove();
    } catch (e) {}
    estado.mapaInstance = null;
  }

  try {
    const dadosValidos = dadosMapa.filter((p) => coordenadaValida(p.latitude, p.longitude));

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
        <div style="font-weight:700;font-size:14px;color:#003F87;">#${escaparHTML(p.numero_ocorrencia || p.numero_temporario || "Sem número")}</div>
        <div style="display:inline-block;padding:1px 10px;border-radius:9999px;font-size:10px;font-weight:600;text-transform:uppercase;color:#fff;background:${cor};margin-bottom:4px;">
          ${escaparHTML(getTipoLabel(tipo))}
        </div>
        <div style="font-size:12px;color:#1e293b;"><i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${escaparHTML(p.local_ocorrencia || "Local não informado")}</div>
        <div style="font-size:11px;color:#64748b;"><i class="fas fa-user" aria-hidden="true"></i> ${escaparHTML(p.criador?.nome_completo || "Desconhecido")}</div>
        <div style="margin-top:4px;">
          <button data-relatorio-id="${escaparHTML(p.id)}" onclick="window._relatoriosVerDetalhes(this.dataset.relatorioId)" style="padding:2px 10px;font-size:11px;border:none;border-radius:4px;background:#e3f2fd;color:#003F87;cursor:pointer;">
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
        <p>Erro ao carregar mapa: ${escaparHTML(error?.message || "Falha não identificada")}</p>
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
        const partes = obterPartesDataSP(criarDateBanco(o.criado_em));
        const dia = new Date(Date.UTC(partes.year, partes.month - 1, partes.day)).getUTCDay();
        const nome = DIAS_SEMANA[dia];
        if (!porDia[nome]) porDia[nome] = 0;
        porDia[nome]++;
      });
      return DIAS_SEMANA.map((d) => ({ label: d, value: porDia[d] || 0 }));
    }
    case "tendencias_hora": {
      const porHora = {};
      ocorrencias.forEach((o) => {
        const hora = obterPartesDataSP(criarDateBanco(o.criado_em)).hour;
        if (!porHora[hora]) porHora[hora] = 0;
        porHora[hora]++;
      });
      return Array.from({ length: 24 }, (_, i) => ({
        label: String(i).padStart(2, "0") + "h",
        value: porHora[i] || 0,
      }));
    }
    case "previsao":
      return [];
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
  if (tipo === "produtividade") tipo = "executivo";
  if (tipo === "por-guarda") tipo = "desempenho";
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
    let tipoExport = "relatorio";

    const ocorrencias =
      estado.dadosCache ||
      (await buscarOcorrenciasPeriodo(dataInicio, dataFim));
    const usaAbordagens = tipo === "desempenho" || tipo === "eficiencia" || tipo.startsWith("abordagens-");
    const abordagens = usaAbordagens
      ? (estado.abordagensCache || await buscarAbordagensPeriodo(dataInicio, dataFim))
      : { veiculos: [], pessoas: [] };

    // O tipo original é mantido para que cada PDF contenha a análise correspondente.
    switch (tipo) {
      case "executivo": {
        const stats = calcularEstatisticas(ocorrencias);
        const porTipo = agruparPorTipo(ocorrencias);
        const porMes = agruparPorMes(ocorrencias);
        const total = stats.total;
        const taxaFinalizacao = total > 0 ? ((stats.finalizadas / total) * 100).toFixed(1) : "0.0";

        // Preparar dados para o formato esperado pelo pdf-export
        const ranking = [
          {
            nome: "Geral",
            matricula: "-",
            ocorrencias: { total: stats.total, finalizadas: stats.finalizadas },
            abordagens: { total: 0 },
            taxa_finalizacao: taxaFinalizacao,
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
        const todasAbordagens = [
          ...(abordagens.veiculos || []).map((a) => ({ ...a, tipo_abordagem: "veiculo" })),
          ...(abordagens.pessoas || []).map((a) => ({ ...a, tipo_abordagem: "pessoa" })),
        ];
        const ids = [...new Set([
          ...ocorrencias.map((o) => o.criado_por).filter(Boolean),
          ...todasAbordagens.map((a) => a.criado_por).filter(Boolean),
        ])];
        const usuarios = await buscarDadosUsuariosEmLote(ids);
        const atividade = new Map();
        const garantir = (id) => {
          const key = id || "sem-identificador";
          if (!atividade.has(key)) atividade.set(key, {
            id: key,
            nome: usuarios[id]?.nome_completo || (id ? `Usuário ${String(id).slice(0, 8)}` : "Usuário não identificado"),
            ocorrencias: { total: 0, finalizadas: 0, pendentes: 0, canceladas: 0 },
            abordagens: { total: 0, veiculos: 0, pessoas: 0 },
            total_atendimentos: 0,
          });
          return atividade.get(key);
        };
        ocorrencias.forEach((o) => {
          const item = garantir(o.criado_por);
          item.ocorrencias.total++;
          if (o.status === "synced") item.ocorrencias.finalizadas++;
          if (o.status === "pending_sync") item.ocorrencias.pendentes++;
          if (o.status === "cancelled") item.ocorrencias.canceladas++;
        });
        todasAbordagens.forEach((a) => {
          const item = garantir(a.criado_por);
          item.abordagens.total++;
          if (a.tipo_abordagem === "veiculo") item.abordagens.veiculos++;
          else item.abordagens.pessoas++;
        });
        const ranking = [...atividade.values()].map((item) => ({
          ...item,
          total_atendimentos: item.ocorrencias.total + item.abordagens.total,
          taxa_resolucao: item.ocorrencias.total ? ((item.ocorrencias.finalizadas / item.ocorrencias.total) * 100).toFixed(1) : null,
        })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        dados = {
          ranking,
          totalOcorrencias: ocorrencias.length,
          totalAbordagens: todasAbordagens.length,
          totalGuardas: ranking.length,
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Registros por Responsável pelo Cadastro";
        descricao = "Contagens por autor do cadastro; não representam participação operacional ou desempenho";
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
            ...r,
            numero: r.numero_ocorrencia || r.numero_temporario || "Sem número",
            tipo: getTipoLabel(r.tipo_ocorrencia),
            tipo_ocorrencia: getTipoLabel(r.tipo_ocorrencia),
            data_evento: obterDataEventoRetificacao(r),
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
          totalRegistrosPeriodo: ocorrencias.length,
          notaMetodologica: "O período considera a data de criação da ocorrência. O schema não possui timestamp de cancelamento; proporção = ocorrências canceladas ÷ total de ocorrências consultadas no intervalo, inclusive canceladas.",
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
        dados = { totalRegistrosPeriodo: ocorrencias.length, periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}` };
        titulo = "Produtividade do Setor — volume registrado";
        descricao = "Contagem de registros por período; não mede desempenho individual";
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
        titulo = "Ocorrências — campos principais";
        descricao = "Lista dos principais campos operacionais; o registro individual contém os demais detalhes";
        break;
      }
      case "mapa": {
        const pontosMapa = ocorrencias.filter((o) => coordenadaValida(o.latitude, o.longitude));
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
        titulo = "Registros por Responsável pelo Cadastro";
        descricao = "Contagens por autor do cadastro; não representam participação operacional ou desempenho";
        break;
      }
      case "previsao": {
        dados = {
          totalRegistrosPeriodo: ocorrencias.length,
          notaMetodologica: "Nenhuma projeção é gerada: não há método preditivo validado. Consulte as tendências históricas observadas; a quantidade histórica deste período não é uma previsão.",
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Projeção de Ocorrências — indisponível";
        descricao = "Projeção não calculada por ausência de método validado";
        break;
      }


      case "abordagens-veiculos": {
        const veiculos = abordagens.veiculos || [];
        const dadosAbordagens = veiculos.map((v) => ({
          ...v,
          placa: v.placa || "Não informado",
          marca_modelo: v.marca_modelo || "Não informado",
          cor: v.cor || "Não informado",
          motivo: v.motivo || "Não informado",
          fase: v.fase || "advertencia",
          tipo_atendimento: v.tipo_atendimento || "legado_nao_classificado",
          local_abordagem: v.local_abordagem || "Não informado",
          descricao_identificacao: v.descricao_identificacao || "Não informado",
          identificacao_status: v.identificacao_status || "Não informado",
          providencia: v.providencia || "Não informado",
          status_abordagem: v.status_abordagem || "Não informado",
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
          ...p,
          nome: p.nome || "Não informado",
          alcunha: p.alcunha || "Não informado",
          cpf: p.cpf || "Não informado",
          rg: p.rg || "Não informado",
          motivo: p.motivo || "Não informado",
          fase: p.fase || "advertencia",
          tipo_atendimento: p.tipo_atendimento || "legado_nao_classificado",
          local_abordagem: p.local_abordagem || "Não informado",
          providencia: p.providencia || "Não informado",
          status_abordagem: p.status_abordagem || "Não informado",
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
          ...v,
          placa: v.placa || "Não informado",
          marca_modelo: v.marca_modelo || "Não informado",
          cor: v.cor || "Não informado",
          motivo: v.motivo || "Não informado",
          fase: v.fase || "advertencia",
          tipo_atendimento: v.tipo_atendimento || "legado_nao_classificado",
          local_abordagem: v.local_abordagem || "Não informado",
          descricao_identificacao: v.descricao_identificacao || "Não informado",
          identificacao_status: v.identificacao_status || "Não informado",
          providencia: v.providencia || "Não informado",
          status_abordagem: v.status_abordagem || "Não informado",
          criado_em: v.criado_em,
          usuarios: v.usuarios,
        }));
        const dadosPessoas = pessoas.map((p) => ({
          ...p,
          nome: p.nome || "Não informado",
          alcunha: p.alcunha || "Não informado",
          cpf: p.cpf || "Não informado",
          rg: p.rg || "Não informado",
          motivo: p.motivo || "Não informado",
          fase: p.fase || "advertencia",
          tipo_atendimento: p.tipo_atendimento || "legado_nao_classificado",
          local_abordagem: p.local_abordagem || "Não informado",
          providencia: p.providencia || "Não informado",
          status_abordagem: p.status_abordagem || "Não informado",
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
        dados = {
          totalRegistrosPeriodo: ocorrencias.length,
          totalOcorrencias: ocorrencias.length,
          abordagensVeiculos: abordagens.veiculos.length,
          abordagensPessoas: abordagens.pessoas.length,
          totalAbordagens: abordagens.veiculos.length + abordagens.pessoas.length,
          notaMetodologica: "A taxa de conversão abordagem → BO não é calculada porque não há vínculo verificável entre uma abordagem específica e um boletim. As contagens de ocorrências e de abordagens são independentes.",
          periodo: `${formatarData(dataInicio)} até ${formatarData(dataFim)}`,
        };
        titulo = "Conversão abordagem → BO — não calculada";
        descricao = "Contagens independentes; sem relação verificável entre abordagem e BO";
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

    dados.tipoRelatorio = tipo;
    dados.titulo = titulo;
    dados.dataInicio = dataInicio;
    dados.dataFim = dataFim;
    dados.periodo = `${formatarData(dataInicio)} até ${formatarData(dataFim)}`;
    if (["executivo", "atendimento", "tendencias", "produtividade", "previsao", "eficiencia"].includes(tipo)) dados.ocorrencias = ocorrencias;
    if (tipo === "desempenho") dados.ocorrencias = ocorrencias;
    if (tipo === "retificacoes") dados.ocorrencias = ocorrencias.filter((o) => ["rectified", "pending_rectification", "rectification_rejected"].includes(o.status));
    if (tipo === "executivo") {
      const cache = estado.comparacaoCache;
      if (cache && cache.dataInicio === dataInicio && cache.dataFim === dataFim) {
        dados.comparacaoPeriodo = { ...cache };
      } else {
        const anterior = calcularDataAnterior(dataInicio, dataFim);
        if (!anterior) {
          dados.comparacaoPeriodo = { atual: ocorrencias.length, anterior: 0, dias: 0, status: "unavailable" };
        } else {
          try {
            const registrosAnteriores = await buscarOcorrenciasPeriodo(anterior.dataInicio, anterior.dataFim);
            dados.comparacaoPeriodo = {
              atual: ocorrencias.length,
              anterior: registrosAnteriores.length,
              dias: calcularDiasPeriodo(dataInicio, dataFim),
              status: registrosAnteriores.length ? "available" : "no-base",
            };
          } catch (error) {
            dados.comparacaoPeriodo = { atual: ocorrencias.length, anterior: 0, dias: calcularDiasPeriodo(dataInicio, dataFim), status: "unavailable" };
            appInstance?.showToast?.("Comparação com o período anterior indisponível; o relatório atual será mantido.", "warning");
            console.warn("Falha na comparação anterior para PDF:", error);
          }
        }
      }
    }

    appInstance.showToast(`Gerando PDF: ${titulo}...`, "info");

    const result = await pdfExport.exportarRelatorio(tipoExport, dados, {
      title: titulo,
      reportType: tipo,
      author: "Guarda Municipal de Pitangueiras - PR",
      subject: descricao,
      keywords: `Guarda Municipal, ${titulo}, Relatório`,
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
