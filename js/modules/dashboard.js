/**
 * MÓDULO DASHBOARD - Página Inicial
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Estatísticas gerais do sistema
 * - Briefing do turno (últimas 12 horas)
 * - Lista de ocorrências com filtro por status
 * - Cards de status (total, pendentes, finalizadas, etc.)
 * - Badge de retificações pendentes (para supervisor)
 * - Navegação para outras páginas
 * - Últimas abordagens com modal
 *
 * MELHORIAS APLICADAS:
 * - Pull-to-refresh (recarregar puxando para baixo)
 * - Dashboards personalizados (guarda vê suas ocorrências, supervisor vê geral)
 * - Cache de estatísticas
 * - Otimização de carregamento
 * - Animações suaves
 * - Cards em linha com 5 estatísticas
 * - Cards de acesso rápido com ícones (Nova Ocorrência, Nova Abordagem, Buscar BO, Busca Profunda)
 * - Miniaturas de imagens em ocorrências e abordagens
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

const CACHE_KEY_STATS = "dashboard_stats";
const CACHE_KEY_OCORRENCIAS = "dashboard_ocorrencias_com_fotos_v2";
const CACHE_KEY_ABORDAGENS = "dashboard_abordagens";
const CACHE_KEY_ABORDAGENS_HOJE = "dashboard_abordagens_hoje";
const CACHE_EXPIRY = 30000; // 30 segundos de cache
const PULL_REFRESH_THRESHOLD = 80;

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtroStatusAtual: null,
  statsData: null,
  ocorrenciasData: [],
  abordagensData: [],
  abordagensHoje: null,
  briefingsData: null,
  pendentesRetificacoes: [],
  isRefreshing: false,
  touchStartY: 0,
  touchCurrentY: 0,
  isPulling: false,
  pullProgress: 0,
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página de dashboard
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderDashboard(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;

  if (!user) {
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

  // Mostrar loader com animação
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;animation: spin 0.8s linear infinite;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando dashboard...</p>
    </div>
  `;

  try {
    // Carregar dados com cache
    await carregarStats();
    await carregarBriefings();
    await carregarOcorrencias();
    await carregarAbordagens();
    await carregarAbordagensHoje();

    renderizarDashboard(container, appInstance);

    // Configurar pull-to-refresh
    configurarPullToRefresh(container, appInstance);

    // Registrar funções no escopo global
    window._dashboardFiltrarStatus = (status) =>
      filtrarPorStatus(status, container, appInstance);
    window._dashboardVerDetalhes = (id) => verDetalhes(id, appInstance);
    window._dashboardRecarregar = () => renderDashboard(container, appInstance);
    window._dashboardRefrescar = () => refreshDashboard(container, appInstance);
    window._dashboardNovaOcorrencia = () =>
      appInstance.navigateTo("nova-ocorrencia");
    window._dashboardNovaAbordagem = () => novaAbordagemRapida(appInstance);
    window._dashboardBuscarBO = () => buscarBORapido(appInstance);
    window._dashboardBuscaProfunda = () => buscaProfundaRapida(appInstance);
    window._dashboardVerAbordagem = (id, tipo) =>
      verAbordagemDetalhe(id, tipo, appInstance);
    window._dashboardVerBORapido = (id) => verBORapido(id, appInstance);
  } catch (error) {
    console.error("Erro ao renderizar dashboard:", error);
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar dashboard</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="window._dashboardRecarregar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// PULL-TO-REFRESH
// ============================================

function configurarPullToRefresh(container, appInstance) {
  const dashboardContent = container.querySelector(".container");
  if (!dashboardContent) return;

  dashboardContent.removeEventListener("touchstart", handleTouchStart);
  dashboardContent.removeEventListener("touchmove", handleTouchMove);
  dashboardContent.removeEventListener("touchend", handleTouchEnd);

  dashboardContent.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });
  dashboardContent.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  dashboardContent.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });

  dashboardContent._pullRefreshApp = appInstance;
  dashboardContent._pullRefreshContainer = container;
}

function handleTouchStart(e) {
  const container = this;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;

  if (scrollTop <= 0) {
    estado.touchStartY = e.touches[0].clientY;
    estado.isPulling = true;
    estado.pullProgress = 0;
    estado.touchCurrentY = estado.touchStartY;
  } else {
    estado.isPulling = false;
  }
}

function handleTouchMove(e) {
  if (!estado.isPulling) return;

  const touchY = e.touches[0].clientY;
  const diff = touchY - estado.touchStartY;

  if (diff > 0) {
    estado.touchCurrentY = touchY;
    estado.pullProgress = Math.min(diff / PULL_REFRESH_THRESHOLD, 1);

    mostrarIndicadorPullRefresh(this, estado.pullProgress);

    if (estado.pullProgress > 0.1) {
      e.preventDefault();
    }
  }
}

function handleTouchEnd(e) {
  if (!estado.isPulling) return;

  const container = this;
  const appInstance = container._pullRefreshApp;
  const dashboardContainer = container._pullRefreshContainer;

  if (estado.pullProgress >= 1) {
    mostrarIndicadorPullRefresh(container, 1, true);
    refreshDashboard(dashboardContainer, appInstance);
  } else {
    removerIndicadorPullRefresh(container);
  }

  estado.isPulling = false;
  estado.pullProgress = 0;
  estado.touchStartY = 0;
  estado.touchCurrentY = 0;
}

function mostrarIndicadorPullRefresh(container, progress, loading = false) {
  let indicator = container.querySelector(".pull-refresh-indicator");

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "pull-refresh-indicator";
    indicator.style.cssText = `
      position: sticky;
      top: 0;
      z-index: 10;
      text-align: center;
      padding: 8px;
      font-size: 12px;
      color: var(--cinza-medio);
      background: var(--branco);
      transform: translateY(-100%);
      transition: transform 0.2s ease;
      border-bottom: 1px solid var(--cinza-claro);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    container.parentNode.insertBefore(indicator, container);
  }

  if (loading) {
    indicator.innerHTML = `
      <div class="spinner-small" style="width:16px;height:16px;border:2px solid var(--cinza-claro);border-top-color:var(--azul-bandeira);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <span>Atualizando...</span>
    `;
    indicator.style.transform = "translateY(0)";
    indicator.style.background = "var(--azul-muito-claro)";
    indicator.style.color = "var(--azul-bandeira)";
    return;
  }

  const percentual = Math.round(progress * 100);
  const texto =
    percentual >= 100
      ? "🔄 Solte para atualizar"
      : `⬇️ Puxe para atualizar (${percentual}%)`;
  const cor =
    percentual >= 100 ? "var(--verde-bandeira)" : "var(--cinza-medio)";

  indicator.innerHTML = `<span style="color:${cor}">${texto}</span>`;
  indicator.style.transform = `translateY(${-100 + progress * 100}%)`;
  indicator.style.background =
    progress >= 1 ? "var(--verde-muito-claro)" : "var(--branco)";
}

function removerIndicadorPullRefresh(container) {
  const indicator = container.querySelector(".pull-refresh-indicator");
  if (indicator) {
    indicator.style.transform = "translateY(-100%)";
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 300);
  }
}

// ============================================
// REFRESH DASHBOARD
// ============================================

async function refreshDashboard(container, appInstance) {
  if (estado.isRefreshing) return;

  estado.isRefreshing = true;

  try {
    localStorage.removeItem(CACHE_KEY_STATS);
    localStorage.removeItem(CACHE_KEY_OCORRENCIAS);
    localStorage.removeItem(CACHE_KEY_ABORDAGENS);
    localStorage.removeItem(CACHE_KEY_ABORDAGENS_HOJE);

    await carregarStats();
    await carregarBriefings();
    await carregarOcorrencias();
    await carregarAbordagens();
    await carregarAbordagensHoje();

    renderizarDashboard(container, appInstance);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Dashboard atualizado!", "success");
    }
  } catch (error) {
    console.error("Erro ao atualizar dashboard:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao atualizar", "error");
    }
  } finally {
    estado.isRefreshing = false;
    const indicator = container.querySelector(".pull-refresh-indicator");
    if (indicator) {
      indicator.style.transform = "translateY(-100%)";
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.remove();
        }
      }, 300);
    }
  }
}

// ============================================
// AÇÕES RÁPIDAS
// ============================================

function novaAbordagemRapida(appInstance) {
  if (appInstance) {
    appInstance.navigateTo("consulta");
    setTimeout(() => {
      if (typeof window._consultaAbrirFormulario === "function") {
        window._consultaAbrirFormulario();
      } else {
        setTimeout(() => {
          if (typeof window._consultaAbrirFormulario === "function") {
            window._consultaAbrirFormulario();
          } else {
            appInstance.showToast("Abrindo consulta operacional...", "info");
          }
        }, 500);
      }
    }, 400);
  }
}

function buscarBORapido(appInstance) {
  // Abrir o modal de busca profunda focado em BOs
  if (typeof window._abrirBuscaProfunda === "function") {
    window._abrirBuscaProfunda();
    return;
  }

  import("./busca-profunda.js")
    .then((module) => {
      if (module.abrirBuscaProfunda) {
        module.abrirBuscaProfunda(appInstance);
        window._abrirBuscaProfunda = () =>
          module.abrirBuscaProfunda(appInstance);
      } else {
        appInstance.showToast("Módulo de busca não disponível", "warning");
      }
    })
    .catch((error) => {
      console.error("Erro ao carregar busca:", error);
      appInstance.showToast("Erro ao carregar busca", "error");
    });
}

function buscaProfundaRapida(appInstance) {
  // Verificar se o módulo de busca profunda está disponível
  if (typeof window._abrirBuscaProfunda === "function") {
    window._abrirBuscaProfunda();
    return;
  }

  // Importar dinamicamente o módulo de busca profunda
  import("./busca-profunda.js")
    .then((module) => {
      if (module.abrirBuscaProfunda) {
        module.abrirBuscaProfunda(appInstance);
        // Registrar globalmente para uso futuro
        window._abrirBuscaProfunda = () =>
          module.abrirBuscaProfunda(appInstance);
      } else {
        appInstance.showToast(
          "Módulo de busca profunda não disponível",
          "warning",
        );
      }
    })
    .catch((error) => {
      console.error("Erro ao carregar busca profunda:", error);
      appInstance.showToast("Erro ao carregar busca profunda", "error");
    });
}

// ============================================
// CARREGAR DADOS COM CACHE
// ============================================

async function carregarStats() {
  const cachedStats = getCachedData(CACHE_KEY_STATS);
  if (cachedStats) {
    estado.statsData = cachedStats;
    console.log("📊 Estatísticas carregadas do cache");
    return;
  }

  try {
    const result = await ocorrenciaManager.getStats();
    if (result.success) {
      estado.statsData = result.data;
      setCachedData(CACHE_KEY_STATS, result.data);
    } else {
      estado.statsData = {
        total: 0,
        hoje: 0,
        draft: 0,
        pending: 0,
        synced: 0,
        cancelled: 0,
        rectified: 0,
        pending_rectification: 0,
      };
    }
  } catch (error) {
    console.warn("Erro ao carregar estatísticas:", error);
    estado.statsData = {
      total: 0,
      hoje: 0,
      draft: 0,
      pending: 0,
      synced: 0,
      cancelled: 0,
      rectified: 0,
      pending_rectification: 0,
    };
  }

  if (typeof authManager !== "undefined" && authManager.isSupervisor()) {
    try {
      const result = await ocorrenciaManager.buscarRetificacoesPendentes();
      if (result.success) {
        estado.pendentesRetificacoes = result.data || [];
      } else {
        estado.pendentesRetificacoes = [];
      }
    } catch (error) {
      console.warn("Erro ao carregar retificações pendentes:", error);
      estado.pendentesRetificacoes = [];
    }
  } else {
    estado.pendentesRetificacoes = [];
  }
}

async function carregarBriefings() {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.briefingsData = { ocorrencias: [], avisos: [] };
      return;
    }

    const dozeHorasAtras = globalThis.obterTimestampBrasilSemFuso(new Date(Date.now() - 12 * 60 * 60 * 1000));

    const { data: novasOcorrencias, error: occError } = await client
      .from("ocorrencias")
      .select("id, tipo_ocorrencia, criado_em, local_ocorrencia")
      .gte("criado_em", dozeHorasAtras)
      .eq("esta_ativa", true)
      .limit(5);

    if (occError) throw occError;

    const { data: novosAvisos, error: avisoError } = await client
      .from("mural_avisos")
      .select("id, titulo, tipo, criado_em")
      .gte("criado_em", dozeHorasAtras)
      .limit(5);

    if (avisoError) throw avisoError;

    const ocorrenciasComNomes = await Promise.all(
      (novasOcorrencias || []).map(async (occ) => {
        let nomeCriador = "Desconhecido";
        if (occ.criado_por) {
          try {
            const { data: usuario } = await client
              .from("usuarios")
              .select("nome_completo")
              .eq("id", occ.criado_por)
              .single();
            if (usuario) nomeCriador = usuario.nome_completo;
          } catch (e) {}
        }
        return { ...occ, criador: { nome_completo: nomeCriador } };
      }),
    );

    estado.briefingsData = {
      ocorrencias: ocorrenciasComNomes || [],
      avisos: novosAvisos || [],
    };
  } catch (error) {
    console.warn("Erro ao carregar briefings:", error);
    estado.briefingsData = { ocorrencias: [], avisos: [] };
  }
}

async function associarAnexosOcorrenciasDashboard(ocorrencias) {
  const lista = Array.isArray(ocorrencias) ? ocorrencias : [];
  const ids = lista.map((ocorrencia) => ocorrencia?.id).filter(Boolean);
  if (ids.length === 0) return;

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) {
    lista.forEach((ocorrencia) => { ocorrencia.anexos = []; });
    return;
  }

  const { data, error } = await client
    .from("anexos")
    .select("id,ocorrencia_id,tipo_arquivo,url,mime_type,criado_em")
    .in("ocorrencia_id", ids)
    .order("criado_em", { ascending: false });

  if (error) throw error;

  const anexosPorOcorrencia = new Map(ids.map((id) => [String(id), []]));
  (data || []).forEach((anexo) => {
    const chave = String(anexo.ocorrencia_id || "");
    if (!anexosPorOcorrencia.has(chave)) anexosPorOcorrencia.set(chave, []);
    anexosPorOcorrencia.get(chave).push(anexo);
  });

  lista.forEach((ocorrencia) => {
    ocorrencia.anexos = anexosPorOcorrencia.get(String(ocorrencia.id)) || [];
  });
}

function isDashboardImageAttachment(anexo) {
  if (!anexo || typeof anexo !== "object") return false;
  const tipo = String(anexo.tipo_arquivo || anexo.tipo || "").trim().toLowerCase();
  const mime = String(anexo.mime_type || anexo.mimeType || "").trim().toLowerCase();
  if (tipo === "image" || tipo.startsWith("image/") || mime.startsWith("image/")) return true;
  const url = String(anexo.url || anexo.url_thumb || "").split(/[?#]/, 1)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(url);
}

async function carregarOcorrencias() {
  const cachedOcorrencias = getCachedData(CACHE_KEY_OCORRENCIAS);
  if (cachedOcorrencias) {
    estado.ocorrenciasData = cachedOcorrencias;
    console.log("📋 Ocorrências e fotos carregadas do cache");
    return;
  }

  try {
    const filtros = { limit: estado.filtroStatusAtual ? 100 : 5 };
    if (estado.filtroStatusAtual) {
      filtros.status = estado.filtroStatusAtual;
    }

    const result = await ocorrenciaManager.listar(filtros);
    if (result.success) {
      const ocorrencias = result.data || [];
      try {
        await associarAnexosOcorrenciasDashboard(ocorrencias);
      } catch (anexoError) {
        console.warn("Não foi possível carregar miniaturas das ocorrências:", anexoError);
        ocorrencias.forEach((ocorrencia) => { ocorrencia.anexos = []; });
      }
      estado.ocorrenciasData = ocorrencias;
      setCachedData(CACHE_KEY_OCORRENCIAS, ocorrencias);
    } else {
      estado.ocorrenciasData = [];
    }
  } catch (error) {
    console.warn("Erro ao carregar ocorrências:", error);
    estado.ocorrenciasData = [];
  }
}

async function carregarAbordagens() {
  const cachedAbordagens = getCachedData(CACHE_KEY_ABORDAGENS);
  if (cachedAbordagens) {
    estado.abordagensData = cachedAbordagens;
    console.log("🚗 Abordagens carregadas do cache");
    return;
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.abordagensData = [];
      return;
    }

    const [veiculosResult, pessoasResult] = await Promise.all([
      client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .order("criado_em", { ascending: false })
        .limit(5),
      client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .order("criado_em", { ascending: false })
        .limit(5),
    ]);

    const veiculos = veiculosResult.data || [];
    const pessoas = pessoasResult.data || [];

    const todasAbordagens = [
      ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
      ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
    ];

    todasAbordagens.sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

    estado.abordagensData = todasAbordagens.slice(0, 5);
    setCachedData(CACHE_KEY_ABORDAGENS, estado.abordagensData);
  } catch (error) {
    console.warn("Erro ao carregar abordagens:", error);
    estado.abordagensData = [];
  }
}

async function carregarAbordagensHoje() {
  const cachedCount = getCachedData(CACHE_KEY_ABORDAGENS_HOJE);
  if (cachedCount !== null && cachedCount !== undefined && Number.isFinite(Number(cachedCount))) {
    estado.abordagensHoje = Number(cachedCount);
    return;
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.abordagensHoje = null;
      return;
    }

    // As colunas criado_em são timestamp sem fuso; use limites no horário local
    // e intervalo semiaberto para contar o dia civil sem deslocar a meia-noite.
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioAmanha = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate() + 1,
    );
    const formatarTimestampLocal = (data) => {
      const pad = (valor) => String(valor).padStart(2, "0");
      return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`;
    };
    const inicio = formatarTimestampLocal(inicioHoje);
    const fim = formatarTimestampLocal(inicioAmanha);

    const [veiculos, pessoas] = await Promise.all([
      client
        .from("abordagens_veiculos")
        .select("id", { count: "exact", head: true })
        .eq("esta_ativa", true)
        .gte("criado_em", inicio)
        .lt("criado_em", fim),
      client
        .from("abordagens_pessoas")
        .select("id", { count: "exact", head: true })
        .eq("esta_ativa", true)
        .gte("criado_em", inicio)
        .lt("criado_em", fim),
    ]);

    if (veiculos.error) throw veiculos.error;
    if (pessoas.error) throw pessoas.error;

    estado.abordagensHoje = (veiculos.count || 0) + (pessoas.count || 0);
    setCachedData(CACHE_KEY_ABORDAGENS_HOJE, estado.abordagensHoje);
  } catch (error) {
    console.warn("Erro ao contar abordagens de hoje:", error);
    // Não exibir zero quando a consulta falhar: o travessão sinaliza indisponibilidade.
    estado.abordagensHoje = null;
  }
}

// ============================================
// CACHE DE DADOS
// ============================================

const dashboardMemoryCache = new Map();
function setCachedData(key, data) {
  dashboardMemoryCache.set(key, { data, timestamp: Date.now() });
}
function getCachedData(key) {
  const cached = dashboardMemoryCache.get(key);
  if (!cached || Date.now() - cached.timestamp > CACHE_EXPIRY) {
    dashboardMemoryCache.delete(key);
    return null;
  }
  return cached.data;
}

// ============================================
// RENDERIZAÇÃO PRINCIPAL
// ============================================

function renderizarDashboard(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;
  const stats = estado.statsData;
  const ocorrencias = estado.ocorrenciasData;
  const abordagens = estado.abordagensData;
  const briefings = estado.briefingsData;
  const pendentesCount = estado.pendentesRetificacoes?.length || 0;
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  const filtroAtivo = estado.filtroStatusAtual;
  const temNovidades =
    briefings?.ocorrencias?.length > 0 || briefings?.avisos?.length > 0;
  const tituloFiltro = filtroAtivo ? getStatusLabel(filtroAtivo) : "Todas";
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const perfilLabel = isSupervisor ? "PAINEL DA SUPERVISÃO" : "PAINEL OPERACIONAL";
  const mensagemInicial = isSupervisor
    ? "Acompanhe a movimentação recente e as solicitações que aguardam análise."
    : "Acesse os registros, as novidades e os atalhos do atendimento.";

  container.innerHTML = `
    <div class="container dashboard-shell" id="dashboardContainer">
      <header class="dashboard-welcome" aria-labelledby="dashboardTitle">
        <div class="dashboard-welcome__copy">
          <span class="dashboard-eyebrow">${perfilLabel}</span>
          <h1 id="dashboardTitle">Bem-vindo, ${user?.nome_completo || "Guarda"}</h1>
          <p>${mensagemInicial}</p>
        </div>
        <div class="dashboard-date-card">
          <span>HOJE</span>
          <strong>${dataHoje}</strong>
        </div>
      </header>

      ${renderPrioridades(stats, pendentesCount, isSupervisor)}
      ${renderResumoHoje(stats, estado.abordagensHoje)}
      ${temNovidades ? renderBriefing(briefings) : ""}

      <section class="dashboard-section dashboard-actions-section" aria-labelledby="dashboardActionsTitle">
        <div class="dashboard-section-heading">
          <div>
            <span class="dashboard-eyebrow">ATENDIMENTO</span>
            <h2 id="dashboardActionsTitle">O que você precisa fazer agora?</h2>
          </div>
        </div>
        ${renderAcessoRapido(appInstance)}
      </section>

      <section class="dashboard-section dashboard-status-section" aria-labelledby="dashboardStatusTitle">
        <div class="dashboard-section-heading">
          <div>
            <span class="dashboard-eyebrow">ACOMPANHAMENTO</span>
            <h2 id="dashboardStatusTitle">Situação dos registros</h2>
            <p>Indicadores dos registros ativos. Toque em um cartão para filtrar.</p>
          </div>
        </div>
        ${renderStatsCards(stats, isSupervisor)}
        ${isSupervisor ? renderStatsAdicionais(stats) : ""}
      </section>

      <div class="dashboard-activity-grid">
        <section class="dashboard-section dashboard-activity-section" aria-labelledby="dashboardOccurrencesTitle">
          <div class="dashboard-section-heading dashboard-section-heading--compact">
            <div>
              <span class="dashboard-eyebrow">BOLETINS</span>
              <h2 id="dashboardOccurrencesTitle">${filtroAtivo ? `Ocorrências — ${tituloFiltro}` : "Ocorrências recentes"}</h2>
            </div>
            <button onclick="window.app.navigateTo('ocorrencias')" class="dashboard-text-action">
              Ver todas <i class="fas fa-arrow-right" aria-hidden="true"></i>
            </button>
          </div>
          <div id="listaOcorrenciasContainer" class="dashboard-record-list">
            ${renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance)}
          </div>
        </section>

        <section class="dashboard-section dashboard-activity-section" aria-labelledby="dashboardApproachesTitle">
          <div class="dashboard-section-heading dashboard-section-heading--compact">
            <div>
              <span class="dashboard-eyebrow">ABORDAGENS</span>
              <h2 id="dashboardApproachesTitle">Abordagens recentes</h2>
            </div>
            <button onclick="window.app.navigateTo('consulta')" class="dashboard-text-action">
              Ver todas <i class="fas fa-arrow-right" aria-hidden="true"></i>
            </button>
          </div>
          <div id="listaAbordagensContainer" class="dashboard-record-list">
            ${renderAbordagensLista(abordagens, appInstance)}
          </div>
        </section>
      </div>
    </div>
  `;

  const indicator = container.querySelector(".pull-refresh-indicator");
  if (indicator) {
    setTimeout(() => {
      if (indicator.parentNode) indicator.remove();
    }, 500);
  }
}


// ============================================
// RENDERIZAÇÃO: CARDS DE ESTATÍSTICAS
// ============================================

function renderResumoHoje(stats, abordagensHoje) {
  const quantidadeAbordagens =
    abordagensHoje === null || abordagensHoje === undefined
      ? "—"
      : Number(abordagensHoje) || 0;
  const cards = [
    {
      key: "started",
      value: stats?.hoje ?? 0,
      label: "BOs iniciados",
      icon: "fa-file-circle-plus",
    },
    {
      key: "finalized",
      value: stats?.finalizados_hoje ?? 0,
      label: "BOs finalizados",
      icon: "fa-circle-check",
    },
    {
      key: "approaches",
      value: quantidadeAbordagens,
      label: "Abordagens",
      icon: "fa-user-shield",
    },
  ];

  return `
    <section class="dashboard-section dashboard-today-summary" aria-labelledby="dashboardTodayTitle">
      <div class="dashboard-section-heading">
        <div>
          <span class="dashboard-eyebrow">MOVIMENTO OPERACIONAL</span>
          <h2 id="dashboardTodayTitle">Resumo de hoje</h2>
        </div>
      </div>
      <div class="dashboard-today-grid" aria-label="Resumo de hoje">
        ${cards
          .map(
            (card) => `
          <div class="dashboard-today-card dashboard-today-card--${card.key}">
            <span class="dashboard-today-card__icon"><i class="fas ${card.icon}" aria-hidden="true"></i></span>
            <span class="dashboard-today-card__copy">
              <strong class="dashboard-today-card__value">${card.value}</strong>
              <span class="dashboard-today-card__label">${card.label}</span>
            </span>
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderStatsCards(stats, isSupervisor) {
  const cards = [
    {
      key: "total",
      value: stats?.total || 0,
      label: "Total ativo",
      icon: "fa-file-alt",
      aria: "Filtrar todas as ocorrências",
      status: "null",
    },
    {
      key: "pending",
      value: stats?.pending || 0,
      label: "Aguardando sincronização",
      icon: "fa-cloud-arrow-up",
      aria: "Filtrar ocorrências aguardando sincronização",
      status: "'pending_sync'",
    },
    {
      key: "synced",
      value: stats?.synced || 0,
      label: "Finalizadas",
      icon: "fa-check-circle",
      aria: "Filtrar ocorrências finalizadas",
      status: "'synced'",
    },
  ];

  if (!isSupervisor) {
    cards.push({
      key: "draft",
      value: stats?.draft || 0,
      label: "Rascunhos",
      icon: "fa-file-pen",
      aria: "Filtrar rascunhos",
      status: "'draft'",
    });
  }

  cards.push(
    {
      key: "rectification",
      value: stats?.pending_rectification || 0,
      label: "Retificações pendentes",
      icon: "fa-rotate",
      aria: "Filtrar retificações pendentes",
      status: "'pending_rectification'",
    },
    {
      key: "cancelled",
      value: stats?.cancelled || 0,
      label: "Canceladas",
      icon: "fa-ban",
      aria: "Filtrar ocorrências canceladas",
      status: "'cancelled'",
    },
  );

  return `
    <div class="dashboard-metrics" aria-label="Indicadores de ocorrências">
      ${cards
        .map(
          (card) => `
        <button type="button" class="dashboard-metric dashboard-metric--${card.key}" onclick="window._dashboardFiltrarStatus(${card.status})" aria-label="${card.aria}">
          <span class="dashboard-metric__icon"><i class="fas ${card.icon}" aria-hidden="true"></i></span>
          <span class="dashboard-metric__value">${card.value}</span>
          <span class="dashboard-metric__label">${card.label}</span>
        </button>
      `,
        )
        .join("")}
    </div>
  `;
}


// ============================================
// RENDERIZAÇÃO: ACESSO RÁPIDO (COM ÍCONES)
// ============================================

function renderAcessoRapido(appInstance) {
  return `
    <div class="dashboard-actions-layout">
      <div class="dashboard-primary-actions" aria-label="Ações principais">
        <button type="button" onclick="window._dashboardNovaOcorrencia()" class="dashboard-action dashboard-action--primary">
          <span class="dashboard-action__icon"><i class="fas fa-file-circle-plus" aria-hidden="true"></i></span>
          <span class="dashboard-action__title">Nova ocorrência</span>
          <span class="dashboard-action__description">Registrar um novo atendimento.</span>
          <span class="dashboard-action__link">Iniciar registro <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
        <button type="button" onclick="window._dashboardNovaAbordagem()" class="dashboard-action dashboard-action--primary">
          <span class="dashboard-action__icon"><i class="fas fa-user-shield" aria-hidden="true"></i></span>
          <span class="dashboard-action__title">Nova abordagem</span>
          <span class="dashboard-action__description">Registrar abordagem de pessoa ou veículo.</span>
          <span class="dashboard-action__link">Iniciar registro <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
      </div>

      <section class="dashboard-consultations" aria-labelledby="dashboardConsultationsTitle">
        <div class="dashboard-consultations__heading">
          <span class="dashboard-eyebrow">CONSULTAS</span>
          <h3 id="dashboardConsultationsTitle">Localizar um registro</h3>
        </div>
        <div class="dashboard-consultation-links">
          <button type="button" onclick="window._dashboardBuscarBO()" class="dashboard-consultation-button">
            <span class="dashboard-consultation-button__icon"><i class="fas fa-file-invoice" aria-hidden="true"></i></span>
            <span><strong>Buscar BO</strong><small>Consulta direta</small></span>
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </button>
          <button type="button" onclick="window._dashboardBuscaProfunda()" class="dashboard-consultation-button">
            <span class="dashboard-consultation-button__icon"><i class="fas fa-magnifying-glass-plus" aria-hidden="true"></i></span>
            <span><strong>Busca profunda</strong><small>Mais critérios</small></span>
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </section>
    </div>
  `;
}


// ============================================
// RENDERIZAÇÃO: ESTATÍSTICAS ADICIONAIS
// ============================================

function renderStatsAdicionais(stats) {
  const total = stats?.total || 1;
  const finalizadas = stats?.synced || 0;
  const taxa = ((finalizadas / total) * 100).toFixed(1);

  return `
    <section class="dashboard-supervisor-metrics" aria-label="Indicadores complementares">
      <div class="dashboard-supervisor-metric">
        <span class="dashboard-supervisor-metric__value dashboard-value--green">${taxa}%</span>
        <span class="dashboard-supervisor-metric__label">Resolutividade</span>
      </div>
      <div class="dashboard-supervisor-metric">
        <span class="dashboard-supervisor-metric__value">${stats?.draft || 0}</span>
        <span class="dashboard-supervisor-metric__label">Rascunhos</span>
      </div>
    </section>
  `;
}


// ============================================
// RENDERIZAÇÃO: BRIEFING
// ============================================

function renderBriefing(briefings) {
  const ocorrencias = briefings?.ocorrencias || [];
  const avisos = briefings?.avisos || [];

  if (ocorrencias.length === 0 && avisos.length === 0) return "";

  return `
    <section id="briefing-container" class="dashboard-briefing" aria-labelledby="dashboardBriefingTitle">
      <div class="dashboard-briefing__header">
        <div class="dashboard-briefing__heading">
          <span class="dashboard-briefing__icon"><i class="fas fa-bell" aria-hidden="true"></i></span>
          <div>
            <span class="dashboard-eyebrow">INFORMAÇÃO RECENTE</span>
            <h2 id="dashboardBriefingTitle">Novidades recentes</h2>
          </div>
        </div>
        <button type="button" class="dashboard-briefing__close" aria-label="Dispensar novidades" onclick="this.closest('#briefing-container').remove()">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <p class="dashboard-briefing__description">Ocorrências e comunicados registrados nas últimas 12 horas.</p>
      <div class="dashboard-briefing__items">
        ${ocorrencias
          .map(
            (o) => `
          <button type="button" class="dashboard-briefing__item" onclick="window._dashboardVerDetalhes('${o.id}')">
            <i class="fas fa-file-alt" aria-hidden="true"></i>
            <span><strong>${o.tipo_ocorrencia || "Ocorrência"}</strong>${o.local_ocorrencia ? ` — ${o.local_ocorrencia}` : ""}</span>
            <time>${o.criado_em ? new Date(o.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
          </button>
        `,
          )
          .join("")}
        ${avisos
          .map(
            (a) => `
          <button type="button" class="dashboard-briefing__item" onclick="window.app.navigateTo('mural')">
            <i class="fas fa-bullhorn" aria-hidden="true"></i>
            <span><strong>${a.titulo}</strong></span>
            <time>${a.criado_em ? new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</time>
          </button>
        `,
          )
          .join("")}
      </div>
      ${avisos.length ? '<button type="button" onclick="window.app.navigateTo(\'mural\')" class="dashboard-briefing__link">Ver comunicados <i class="fas fa-arrow-right" aria-hidden="true"></i></button>' : ""}
    </section>
  `;
}

function renderPrioridades(stats, pendingReviewCount, isSupervisor) {
  const cards = [];
  const pendingSyncCount = stats?.pending || 0;
  const draftCount = stats?.draft || 0;

  if (isSupervisor && pendingReviewCount > 0) {
    cards.push(`
      <button type="button" class="dashboard-priority-item dashboard-priority-item--review" onclick="window.app.navigateTo('retificacoes')">
        <span class="dashboard-priority-item__icon"><i class="fas fa-clipboard-check" aria-hidden="true"></i></span>
        <span class="dashboard-priority-item__copy"><strong>Retificações para analisar</strong><small>Solicitações aguardando a supervisão</small></span>
        <span class="dashboard-priority-item__count">${pendingReviewCount}</span>
        <i class="fas fa-arrow-right dashboard-priority-item__arrow" aria-hidden="true"></i>
      </button>
    `);
  }

  if (pendingSyncCount > 0) {
    cards.push(`
      <button type="button" class="dashboard-priority-item dashboard-priority-item--sync" onclick="window._dashboardFiltrarStatus('pending_sync')">
        <span class="dashboard-priority-item__icon"><i class="fas fa-cloud-arrow-up" aria-hidden="true"></i></span>
        <span class="dashboard-priority-item__copy"><strong>Aguardando sincronização</strong><small>Registros que ainda não foram enviados</small></span>
        <span class="dashboard-priority-item__count">${pendingSyncCount}</span>
        <i class="fas fa-arrow-right dashboard-priority-item__arrow" aria-hidden="true"></i>
      </button>
    `);
  }

  if (!isSupervisor && draftCount > 0) {
    cards.push(`
      <button type="button" class="dashboard-priority-item dashboard-priority-item--draft" onclick="window._dashboardFiltrarStatus('draft')">
        <span class="dashboard-priority-item__icon"><i class="fas fa-file-pen" aria-hidden="true"></i></span>
        <span class="dashboard-priority-item__copy"><strong>Rascunhos em aberto</strong><small>Registros salvos como rascunho</small></span>
        <span class="dashboard-priority-item__count">${draftCount}</span>
        <i class="fas fa-arrow-right dashboard-priority-item__arrow" aria-hidden="true"></i>
      </button>
    `);
  }

  if (cards.length === 0) return "";

  return `
    <section class="dashboard-priorities" aria-labelledby="dashboardPrioritiesTitle">
      <div class="dashboard-priorities__heading">
        <span class="dashboard-eyebrow">PENDÊNCIAS</span>
        <h2 id="dashboardPrioritiesTitle">Atenção necessária</h2>
      </div>
      <div class="dashboard-priority-grid">${cards.join("")}</div>
    </section>
  `;
}


// ============================================
// RENDERIZAÇÃO: LISTA DE OCORRÊNCIAS (COM MINIATURAS)
// ============================================

function renderRecordThumbnail(src, alt, fallbackIcon, tone, extraPhotos) {
  const safeSrc = safeDashboardMediaUrl(src);
  const safeAlt = escapeDashboardHtml(alt);
  if (safeSrc) {
    return `
      <div class="dashboard-record-thumb dashboard-record-thumb--photo">
        <img src="${escapeDashboardHtml(safeSrc)}" alt="${safeAlt}" loading="lazy" decoding="async" fetchpriority="low" width="160" height="120" onerror="this.parentElement.classList.add('is-broken')">
        <span class="dashboard-record-thumb__fallback" aria-hidden="true"><i class="fas ${fallbackIcon}"></i></span>
        ${extraPhotos > 0 ? `<span class="dashboard-record-photo-count" aria-label="Mais ${extraPhotos} fotos"><i class="fas fa-images" aria-hidden="true"></i>+${extraPhotos}</span>` : ""}
      </div>
    `;
  }
  return `
    <div class="dashboard-record-thumb dashboard-record-thumb--empty dashboard-record-thumb--${tone}" aria-hidden="true">
      <i class="fas ${fallbackIcon}"></i>
    </div>
  `;
}

function renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance) {
  if (!ocorrencias || ocorrencias.length === 0) {
    const mensagem = filtroAtivo
      ? `Nenhuma ocorrência com status "${getStatusLabel(filtroAtivo)}" encontrada`
      : "Nenhuma ocorrência encontrada";

    return `
      <div class="dashboard-empty-state">
        <div class="dashboard-empty-state__icon">
          <i class="fas fa-inbox"></i>
        </div>
        <p style="font-weight:500;font-size:14px;">${mensagem}</p>
        ${!filtroAtivo ? '<p style="font-size:12px;">Clique em "Nova Ocorrência" para criar sua primeira ocorrência</p>' : ""}
        ${
          filtroAtivo
            ? `
          <button onclick="window._dashboardFiltrarStatus(null)" class="btn-secondary" style="margin-top:10px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-arrow-left" style="margin-right:6px;"></i>
            Ver todas
          </button>
        `
            : ""
        }
      </div>
    `;
  }

  let html = "";

  ocorrencias.forEach((occ) => {
    const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
    const statusClass = getStatusClass(occ.status);
    const statusLabel = getStatusLabel(occ.status);
    const data = formatarDataHoraLocal(occ.criado_em);
    const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
    const guardaNome = occ.criador?.nome_completo || "Desconhecido";
    const local = occ.local_ocorrencia || "Local não informado";

    let resumo = "";
    if (occ.observacoes) {
      const palavras = occ.observacoes.split(/\s+/).filter(Boolean);
      resumo = palavras.slice(0, 18).join(" ");
      if (palavras.length > 18) resumo += "…";
    }

    const anexos = Array.isArray(occ.anexos) ? occ.anexos : [];
    const imagens = anexos.filter(isDashboardImageAttachment);
    const primeiroAnexo = imagens[0]?.url_thumb || imagens[0]?.url || null;
    const totalAnexos = anexos.length;
    const extraPhotos = Math.max(0, imagens.length - 1);
    const attachmentLabel = totalAnexos === 1 ? "anexo" : "anexos";

    html += `
      <div class="ocorrencia-item dashboard-record-card dashboard-record-card--occurrence status-${occ.status}" onclick="window._dashboardVerBORapido('${occ.id}')">
        ${renderRecordThumbnail(primeiroAnexo, `Foto da ocorrência ${numero}`, "fa-file-lines", "occurrence", extraPhotos)}
        <div class="dashboard-record-content">
          <div class="dashboard-record-heading">
            <div class="dashboard-record-heading__lead">
              <span class="dashboard-record-number">#${numero}</span>
              <span class="dashboard-record-type">${tipoLabel}</span>
              ${occ.status === "rectified" && occ.numero_versao > 1 ? `<span class="dashboard-record-version">v${occ.numero_versao}</span>` : ""}
            </div>
            <span class="badge badge-${statusClass} dashboard-record-status">${statusLabel}</span>
          </div>
          <div class="dashboard-record-location">
            <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
            <span>${local}</span>
          </div>
          ${resumo ? `<div class="dashboard-record-summary">${resumo}</div>` : ""}
          <div class="dashboard-record-meta">
            <span class="dashboard-record-meta__item dashboard-record-meta__creator"><i class="fas fa-user" aria-hidden="true"></i>${guardaNome}</span>
            <span class="dashboard-record-meta__item"><i class="fas fa-clock" aria-hidden="true"></i>${data}</span>
            ${totalAnexos > 0 ? `<span class="dashboard-record-meta__item dashboard-record-meta__attachments"><i class="fas fa-paperclip" aria-hidden="true"></i>${totalAnexos} ${attachmentLabel}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  });

  if (!filtroAtivo) {
    html += `
      <button class="dashboard-list-more" onclick="window.app.navigateTo('ocorrencias')">
        <i class="fas fa-arrow-right" style="margin-right:6px;"></i>
        Ver todas as ocorrências
      </button>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:8px;color:var(--cinza-medio);font-size:12px;">
        <i class="fas fa-filter" style="margin-right:4px;"></i>
        ${ocorrencias.length} ocorrência(s) encontrada(s)
      </div>
    `;
  }

  return html;
}

// ============================================
// RENDERIZAÇÃO: LISTA DE ABORDAGENS (COM MINIATURAS)
// ============================================

function renderAbordagensLista(abordagens, appInstance) {
  if (!abordagens || abordagens.length === 0) {
    return `
      <div class="dashboard-empty-state dashboard-empty-state--compact">
        <div class="dashboard-empty-state__icon dashboard-empty-state__icon--small">
          <i class="fas fa-search"></i>
        </div>
        <p style="font-size:13px;">Nenhuma abordagem recente</p>
        <button onclick="window._dashboardNovaAbordagem()" class="btn-secondary" style="margin-top:8px;padding:4px 16px;font-size:12px;min-height:auto;width:auto;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
          <i class="fas fa-plus" style="margin-right:4px;"></i> Nova Abordagem
        </button>
      </div>
    `;
  }

  let html = "";

  abordagens.forEach((ab) => {
    const isVeiculo = ab.tipo_abordagem === "veiculo";
    const data = formatarDataHoraLocal(ab.criado_em);
    const guardaNome = ab.usuarios?.nome_completo || "Desconhecido";
    const faseLabel = ab.fase === "multa" ? "Multa" : "Advertência";
    const faseClass = ab.fase === "multa" ? "dashboard-record-phase--fine" : "dashboard-record-phase--warning";

    let identificador = "";
    let detalhes = "";
    if (isVeiculo) {
      identificador = ab.placa || "Placa não informada";
      detalhes = ab.marca_modelo || "";
      if (ab.cor) detalhes += `${detalhes ? " · " : ""}${ab.cor}`;
    } else {
      identificador = ab.nome || "Nome não informado";
      detalhes = ab.alcunha ? `Alcunha: ${ab.alcunha}` : "";
    }

    const anexos = Array.isArray(ab.anexos) ? ab.anexos : [];
    const imagens = anexos.filter(
      isDashboardImageAttachment,
    );
    const primeiroAnexo = imagens[0]?.url_thumb || imagens[0]?.url || null;
    const totalAnexos = anexos.length;
    const extraPhotos = Math.max(0, imagens.length - 1);
    const attachmentLabel = totalAnexos === 1 ? "anexo" : "anexos";

    let resumoMotivo = "";
    if (ab.motivo) {
      const palavras = ab.motivo.split(/\s+/).filter(Boolean);
      resumoMotivo = palavras.slice(0, 18).join(" ");
      if (palavras.length > 18) resumoMotivo += "…";
    }

    html += `
      <div class="abordagem-item dashboard-record-card dashboard-record-card--approach ${isVeiculo ? "dashboard-approach--vehicle" : "dashboard-approach--person"}" onclick="window._dashboardVerAbordagem('${ab.id}', '${ab.tipo_abordagem}')">
        ${renderRecordThumbnail(primeiroAnexo, `Foto da abordagem de ${isVeiculo ? "veículo" : "pessoa"} ${identificador}`, isVeiculo ? "fa-car" : "fa-user", isVeiculo ? "vehicle" : "person", extraPhotos)}
        <div class="dashboard-record-content">
          <div class="dashboard-record-heading dashboard-record-heading--approach">
            <span class="dashboard-approach-kind ${isVeiculo ? "dashboard-approach-kind--vehicle" : "dashboard-approach-kind--person"}">
              <i class="fas ${isVeiculo ? "fa-car" : "fa-user"}" aria-hidden="true"></i>${isVeiculo ? "Veículo" : "Pessoa"}
            </span>
            <span class="dashboard-record-date"><i class="fas fa-clock" aria-hidden="true"></i>${data}</span>
          </div>
          <div class="dashboard-record-approach-title">
            <div class="dashboard-record-identifier-wrap">
              <strong class="dashboard-record-identifier ${isVeiculo ? "dashboard-record-identifier--plate" : "dashboard-record-identifier--person"}">${identificador}</strong>
              ${detalhes ? `<span class="dashboard-record-identifier-detail">${detalhes}</span>` : ""}
            </div>
            <span class="dashboard-record-phase ${faseClass}">${faseLabel}</span>
          </div>
          <div class="dashboard-record-summary dashboard-record-summary--reason">
            <i class="fas fa-circle-info" aria-hidden="true"></i>
            <span>${resumoMotivo || "Motivo não informado"}</span>
          </div>
          <div class="dashboard-record-meta">
            <span class="dashboard-record-meta__item dashboard-record-meta__creator"><i class="fas fa-user" aria-hidden="true"></i>${guardaNome}</span>
            ${totalAnexos > 0 ? `<span class="dashboard-record-meta__item dashboard-record-meta__attachments"><i class="fas fa-paperclip" aria-hidden="true"></i>${totalAnexos} ${attachmentLabel}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  });

  return html;
}

// ============================================
// MODAL: VER DETALHES DA ABORDAGEM
// ============================================

function escapeDashboardHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function safeDashboardMediaUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.href);
    return ["https:", "http:", "blob:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function renderDashboardDetailField(label, value, icon, wide = false) {
  const text = value === null || value === undefined || value === "" ? "Não informado" : value;
  return `
    <div class="dashboard-detail-info${wide ? " dashboard-detail-info--wide" : ""}">
      <span class="dashboard-detail-info__label"><i class="fas ${icon}" aria-hidden="true"></i>${escapeDashboardHtml(label)}</span>
      <strong class="dashboard-detail-info__value">${escapeDashboardHtml(text)}</strong>
    </div>
  `;
}

function renderDashboardDetailGallery(anexos) {
  const fotos = (Array.isArray(anexos) ? anexos : [])
    .filter(isDashboardImageAttachment)
    .map((anexo, index) => {
      const original = safeDashboardMediaUrl(anexo.url || anexo.url_thumb);
      const thumb = safeDashboardMediaUrl(anexo.url_thumb || anexo.url);
      return { original, thumb, label: anexo.nome_arquivo || anexo.nome || `Foto ${index + 1}` };
    })
    .filter((foto) => foto.original && foto.thumb);

  if (fotos.length === 0) return "";
  return `
    <section class="dashboard-detail-section" aria-label="Fotos anexadas">
      <div class="dashboard-detail-section__heading">
        <div><span class="dashboard-detail-eyebrow">REGISTRO VISUAL</span><h3>Fotos</h3></div>
        <span class="dashboard-detail-count">${fotos.length}</span>
      </div>
      <div class="dashboard-detail-gallery">
        ${fotos.map((foto, index) => `
          <button type="button" class="dashboard-detail-photo" data-photo-index="${index}" data-photo-url="${escapeDashboardHtml(foto.original)}" data-photo-thumb="${escapeDashboardHtml(foto.thumb)}" data-photo-name="${escapeDashboardHtml(foto.label)}" aria-label="Ver foto ${index + 1} de ${fotos.length}: ${escapeDashboardHtml(foto.label)}">
            <img src="${escapeDashboardHtml(foto.thumb)}" data-fallback="${escapeDashboardHtml(foto.original)}" alt="${escapeDashboardHtml(foto.label)}" loading="lazy" decoding="async" fetchpriority="low" width="240" height="180">
            <span class="dashboard-detail-photo__zoom" aria-hidden="true"><i class="fas fa-expand-alt"></i></span>
            <span class="dashboard-detail-photo__index">${index + 1}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function mountDashboardDetailModal(overlay, appInstance) {
  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape" && document.querySelector(".carrossel-modal-overlay")) return;
    if (event.key === "Escape") close();
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelectorAll("[data-detail-close]").forEach((button) => {
    button.addEventListener("click", close);
  });
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeyDown);

  const photoButtons = Array.from(overlay.querySelectorAll(".dashboard-detail-photo[data-photo-index]"));
  const carouselPhotos = photoButtons.map((button, index) => ({
    url: button.dataset.photoUrl || "",
    url_thumb: button.dataset.photoThumb || "",
    nome: button.dataset.photoName || `Foto ${index + 1}`,
  }));
  photoButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.photoIndex) || 0;
      if (typeof window._consultaAbrirCarrossel === "function") {
        window._consultaAbrirCarrossel(carouselPhotos, index, appInstance);
      } else if (appInstance && appInstance.showToast) {
        appInstance.showToast("Visualizador de fotos indisponível. Recarregue o app.", "error");
      }
    });
  });

  overlay.querySelectorAll(".dashboard-detail-photo img").forEach((image) => {
    image.addEventListener("error", () => {
      const fallback = image.dataset.fallback;
      if (fallback && image.src !== fallback) {
        image.dataset.fallback = "";
        image.src = fallback;
      } else {
        image.closest(".dashboard-detail-photo")?.classList.add("is-broken");
      }
    });
  });

  overlay.querySelector(".dashboard-detail-close")?.focus({ preventScroll: true });
  return close;
}

export async function verAbordagemDetalhe(id, tipo, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    const tabela = tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data, error } = await client
      .from(tabela)
      .select("*, usuarios(nome_completo)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      appInstance.showToast("Abordagem não encontrada", "error");
      return;
    }

    const isVeiculo = tipo === "veiculo";
    const guardaNome = data.usuarios?.nome_completo || "Desconhecido";
    const dataFormatada = formatarDataHoraLocal(data.criado_em);
    const faseLabel = data.fase === "multa" ? "Multa" : "Advertência";
    const faseTone = data.fase === "multa" ? "danger" : "warning";
    const identificador = isVeiculo
      ? data.placa || "Placa não informada"
      : data.nome || "Nome não informado";
    const detalhes = isVeiculo
      ? `${data.marca_modelo || ""}${data.cor ? ` · ${data.cor}` : ""}`.trim()
      : [data.alcunha ? `Alcunha: ${data.alcunha}` : "", data.cpf ? `CPF: ${data.cpf}` : "", data.rg ? `RG: ${data.rg}` : ""]
          .filter(Boolean)
          .join(" · ");
    const local = data.local_abordagem || "Não informado";
    const prazo = data.prazo ? new Date(data.prazo).toLocaleDateString("pt-BR") : "";
    const prazoStatus = data.status_regularizacao || "";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dashboard-detail-overlay dashboard-detail-overlay--approach";
    overlay.innerHTML = `
      <section class="dashboard-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dashboardApproachDetailTitle">
        <header class="dashboard-detail-modal__header">
          <div class="dashboard-detail-modal__title-group">
            <span class="dashboard-detail-eyebrow">DETALHES DA ABORDAGEM</span>
            <h2 id="dashboardApproachDetailTitle">${escapeDashboardHtml(identificador)}</h2>
            ${detalhes ? `<p class="dashboard-detail-modal__subtitle">${escapeDashboardHtml(detalhes)}</p>` : ""}
          </div>
          <div class="dashboard-detail-modal__header-actions">
            <span class="dashboard-detail-badge dashboard-detail-badge--${isVeiculo ? "info" : "success"}"><i class="fas ${isVeiculo ? "fa-car-side" : "fa-user"}" aria-hidden="true"></i>${isVeiculo ? "Veículo" : "Pessoa"}</span>
            <span class="dashboard-detail-badge dashboard-detail-badge--${faseTone}">${escapeDashboardHtml(faseLabel)}</span>
            <button type="button" class="dashboard-detail-close" data-detail-close aria-label="Fechar detalhes"><i class="fas fa-times" aria-hidden="true"></i></button>
          </div>
        </header>
        <div class="dashboard-detail-modal__body">
          <section class="dashboard-detail-hero dashboard-detail-hero--${isVeiculo ? "vehicle" : "person"}">
            <span class="dashboard-detail-hero__icon"><i class="fas ${isVeiculo ? "fa-car-side" : "fa-user-shield"}" aria-hidden="true"></i></span>
            <div class="dashboard-detail-hero__copy">
              <span class="dashboard-detail-eyebrow">${isVeiculo ? "IDENTIFICAÇÃO DO VEÍCULO" : "IDENTIFICAÇÃO DA PESSOA"}</span>
              <strong>${escapeDashboardHtml(identificador)}</strong>
              <p><i class="fas fa-map-marker-alt" aria-hidden="true"></i>${escapeDashboardHtml(local)}</p>
            </div>
          </section>

          <div class="dashboard-detail-grid">
            ${renderDashboardDetailField("Data e hora", dataFormatada, "fa-clock")}
            ${renderDashboardDetailField("Guarda responsável", guardaNome, "fa-user-shield")}
            ${renderDashboardDetailField("Local", local, "fa-location-dot", true)}
          </div>

          <section class="dashboard-detail-section">
            <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">REGISTRO DA ABORDAGEM</span><h3>Motivo</h3></div></div>
            <p class="dashboard-detail-text">${escapeDashboardHtml(data.motivo || "Não informado")}</p>
          </section>

          ${data.observacoes ? `
            <section class="dashboard-detail-section">
              <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">ANOTAÇÕES</span><h3>Observações</h3></div></div>
              <p class="dashboard-detail-text">${escapeDashboardHtml(data.observacoes)}</p>
            </section>
          ` : ""}

          ${prazo ? `
            <section class="dashboard-detail-notice">
              <span class="dashboard-detail-notice__icon"><i class="fas fa-calendar-check" aria-hidden="true"></i></span>
              <div><span class="dashboard-detail-eyebrow">REGULARIZAÇÃO</span><strong>Prazo: ${escapeDashboardHtml(prazo)}</strong>${prazoStatus ? `<small>Status: ${escapeDashboardHtml(prazoStatus)}</small>` : ""}</div>
            </section>
          ` : ""}

          ${renderDashboardDetailGallery(data.anexos)}
        </div>
        <footer class="dashboard-detail-modal__footer">
          <button type="button" class="dashboard-detail-action dashboard-detail-action--secondary" data-detail-close>Fechar</button>
          <button type="button" class="dashboard-detail-action dashboard-detail-action--primary" data-action="convert"><i class="fas fa-file-export" aria-hidden="true"></i>Converter em BO</button>
        </footer>
      </section>
    `;

    const closeModal = mountDashboardDetailModal(overlay, appInstance);
    overlay.querySelector('[data-action="convert"]')?.addEventListener("click", () => {
      closeModal();
      if (typeof window._dashboardNovaOcorrencia === "function") window._dashboardNovaOcorrencia();
    });
  } catch (error) {
    console.error("Erro ao buscar abordagem:", error);
    appInstance.showToast("Erro ao carregar detalhes da abordagem", "error");
  }
}

// ============================================
// MODAL: VER BO RÁPIDO
// ============================================

export async function verBORapido(id, appInstance) {
  try {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Ocorrência não encontrada", "error");
      return;
    }

    const occ = result.data;
    const [envolvidosResult, anexosResult] = await Promise.all([
      ocorrenciaManager.listarEnvolvidos(id),
      ocorrenciaManager.listarAnexos(id),
    ]);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data || [] : [];
    const anexos = anexosResult.success ? anexosResult.data || [] : [];

    const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
    const statusClass = getStatusClass(occ.status);
    const statusLabel = getStatusLabel(occ.status);
    const toneByStatus = {
      synced: "success",
      pending: "warning",
      pending_rectification: "warning",
      rectified: "info",
      cancelled: "danger",
      rectification_rejected: "danger",
      error: "danger",
      draft: "neutral",
    };
    const statusTone = toneByStatus[statusClass] || "neutral";
    const dataCriacao = formatarDataHoraLocal(occ.criado_em);
    const dataInicio = occ.data_hora_inicio ? formatarDataHoraLocal(occ.data_hora_inicio) : "Não informado";
    const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
    const envolvidosHTML = envolvidos.length
      ? envolvidos.map((env) => `
          <div class="dashboard-detail-person">
            <span class="dashboard-detail-person__type">${escapeDashboardHtml(getTipoEnvolvidoLabel(env.tipo))}</span>
            <div class="dashboard-detail-person__copy"><strong>${escapeDashboardHtml(env.nome_completo || "Nome não informado")}</strong>${env.cpf ? `<small>CPF: ${escapeDashboardHtml(env.cpf)}</small>` : ""}</div>
          </div>
        `).join("")
      : `<p class="dashboard-detail-empty-note">Nenhum envolvido informado.</p>`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dashboard-detail-overlay dashboard-detail-overlay--bo";
    overlay.innerHTML = `
      <section class="dashboard-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dashboardBODetailTitle">
        <header class="dashboard-detail-modal__header">
          <div class="dashboard-detail-modal__title-group">
            <span class="dashboard-detail-eyebrow">BOLETIM DE OCORRÊNCIA</span>
            <h2 id="dashboardBODetailTitle">#${escapeDashboardHtml(numero)}</h2>
            <p class="dashboard-detail-modal__subtitle">Resumo do registro operacional</p>
          </div>
          <div class="dashboard-detail-modal__header-actions">
            <span class="dashboard-detail-badge dashboard-detail-badge--${statusTone}">${escapeDashboardHtml(statusLabel)}</span>
            <button type="button" class="dashboard-detail-close" data-detail-close aria-label="Fechar detalhes"><i class="fas fa-times" aria-hidden="true"></i></button>
          </div>
        </header>
        <div class="dashboard-detail-modal__body">
          <section class="dashboard-detail-hero dashboard-detail-hero--occurrence">
            <span class="dashboard-detail-hero__icon"><i class="fas fa-file-lines" aria-hidden="true"></i></span>
            <div class="dashboard-detail-hero__copy">
              <span class="dashboard-detail-eyebrow">TIPO DE OCORRÊNCIA</span>
              <strong>${escapeDashboardHtml(tipoLabel)}</strong>
              <p><i class="fas fa-map-marker-alt" aria-hidden="true"></i>${escapeDashboardHtml(occ.local_ocorrencia || "Local não informado")}</p>
            </div>
          </section>

          <div class="dashboard-detail-grid">
            ${renderDashboardDetailField("Data do registro", dataCriacao, "fa-clock")}
            ${renderDashboardDetailField("Início da ocorrência", dataInicio, "fa-play")}
            ${occ.nome_solicitante ? renderDashboardDetailField("Solicitante", occ.nome_solicitante, "fa-user", true) : ""}
          </div>

          ${occ.observacoes ? `
            <section class="dashboard-detail-section">
              <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">RELATO</span><h3>Observações</h3></div></div>
              <p class="dashboard-detail-text">${escapeDashboardHtml(occ.observacoes)}</p>
            </section>
          ` : ""}

          <section class="dashboard-detail-section">
            <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">PESSOAS RELACIONADAS</span><h3>Envolvidos</h3></div><span class="dashboard-detail-count">${envolvidos.length}</span></div>
            <div class="dashboard-detail-people">${envolvidosHTML}</div>
          </section>

          ${renderDashboardDetailGallery(anexos)}
        </div>
        <footer class="dashboard-detail-modal__footer">
          <button type="button" class="dashboard-detail-action dashboard-detail-action--secondary" data-detail-close>Fechar</button>
          <button type="button" class="dashboard-detail-action dashboard-detail-action--primary" data-action="open-full"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>Ver BO completo</button>
        </footer>
      </section>
    `;

    const closeModal = mountDashboardDetailModal(overlay, appInstance);
    overlay.querySelector('[data-action="open-full"]')?.addEventListener("click", () => {
      closeModal();
      if (typeof window._dashboardVerDetalhes === "function") window._dashboardVerDetalhes(id);
    });
  } catch (error) {
    console.error("Erro ao buscar ocorrência:", error);
    appInstance.showToast("Erro ao carregar detalhes da ocorrência", "error");
  }
}

// ============================================
// INTERAÇÕES
// ============================================

export function filtrarPorStatus(status, container, appInstance) {
  if (estado.filtroStatusAtual === status && status !== null) {
    estado.filtroStatusAtual = null;
  } else {
    estado.filtroStatusAtual = status;
  }
  renderDashboard(container, appInstance);
}

export function verDetalhes(ocorrenciaId, appInstance) {
  if (appInstance && appInstance.navigateTo) {
    appInstance.navigateTo("detalhe-ocorrencia", { id: ocorrenciaId });
  } else {
    console.warn("⚠️ appInstance.navigateTo não disponível");
  }
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
  const tipos = [
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
    { value: "flagrante", label: "Flagrante" },
    { value: "outro", label: "Outro" },
  ];
  const encontrado = tipos.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

function getTipoEnvolvidoLabel(tipo) {
  const map = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
    outro: "Outro",
  };
  return map[tipo] || tipo;
}

function formatarDataHoraLocal(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
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
  renderDashboard,
  filtrarPorStatus,
  verDetalhes,
  verAbordagemDetalhe,
  verBORapido,
  carregarStats,
  carregarOcorrencias,
  carregarBriefings,
  carregarAbordagens,
  refreshDashboard,
  novaAbordagemRapida,
  buscarBORapido,
  buscaProfundaRapida,
};
