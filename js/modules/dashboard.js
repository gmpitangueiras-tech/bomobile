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
const CACHE_KEY_OCORRENCIAS = "dashboard_ocorrencias";
const CACHE_KEY_ABORDAGENS = "dashboard_abordagens";
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

    await carregarStats();
    await carregarBriefings();
    await carregarOcorrencias();
    await carregarAbordagens();

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

    const dozeHorasAtras = new Date(
      Date.now() - 12 * 60 * 60 * 1000,
    ).toISOString();

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

async function carregarOcorrencias() {
  const cachedOcorrencias = getCachedData(CACHE_KEY_OCORRENCIAS);
  if (cachedOcorrencias) {
    estado.ocorrenciasData = cachedOcorrencias;
    console.log("📋 Ocorrências carregadas do cache");
    return;
  }

  try {
    const filtros = { limit: estado.filtroStatusAtual ? 100 : 5 };
    if (estado.filtroStatusAtual) {
      filtros.status = estado.filtroStatusAtual;
    }

    const result = await ocorrenciaManager.listar(filtros);
    if (result.success) {
      estado.ocorrenciasData = result.data || [];
      setCachedData(CACHE_KEY_OCORRENCIAS, result.data);
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

// ============================================
// CACHE DE DADOS
// ============================================

function setCachedData(key, data) {
  try {
    const cacheData = {
      data: data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn("Erro ao salvar cache:", error);
  }
}

function getCachedData(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    const now = Date.now();

    if (now - cacheData.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }

    return cacheData.data;
  } catch (error) {
    console.warn("Erro ao recuperar cache:", error);
    return null;
  }
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

  let html = `
    <div class="container" style="padding-bottom:100px;" id="dashboardContainer">
      ${temNovidades ? renderBriefing(briefings) : ""}

      <!-- Saudação -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:2px;">
        <h2 style="margin:0;color:var(--azul-bandeira);font-size:18px;display:flex;align-items:center;gap:8px;">
          Olá, ${user?.nome_completo || "Guarda"}! 🎉
        </h2>
        <span style="font-size:11px;color:var(--cinza-medio);">
          ${new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:14px;font-size:13px;">
        Resumo das últimas 12 horas
      </p>

      <!-- Cards de Estatísticas em linha -->
      ${renderStatsCards(stats)}

      <!-- Cards de Acesso Rápido -->
      ${renderAcessoRapido(appInstance)}

      ${isSupervisor ? renderRetificacoesPendentes(pendentesCount, appInstance) : ""}

      <!-- Estatísticas adicionais para supervisor -->
      ${isSupervisor ? renderStatsAdicionais(stats) : ""}

      <!-- Lista de Ocorrências -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--cinza-escuro);">
          <i class="fas fa-list-ul" style="margin-right:8px;color:var(--azul-bandeira);"></i>
          ${filtroAtivo ? `Ocorrências - ${tituloFiltro}` : "Últimas Ocorrências"}
        </h3>
        <button onclick="window.app.navigateTo('ocorrencias')" class="btn-secondary" style="padding:4px 12px;font-size:11px;min-height:auto;width:auto;border-radius:8px;background:transparent;color:var(--azul-bandeira);border:none;font-weight:600;cursor:pointer;">
          Ver todas <i class="fas fa-arrow-right" style="margin-left:4px;font-size:10px;"></i>
        </button>
      </div>

      <div id="listaOcorrenciasContainer">
        ${renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance)}
      </div>

      <!-- Últimas Abordagens -->
      <div style="margin-top:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--cinza-escuro);">
            <i class="fas fa-search" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Últimas Abordagens
          </h3>
          <button onclick="window.app.navigateTo('consulta')" class="btn-secondary" style="padding:4px 12px;font-size:11px;min-height:auto;width:auto;border-radius:8px;background:transparent;color:var(--azul-bandeira);border:none;font-weight:600;cursor:pointer;">
            Ver todas <i class="fas fa-arrow-right" style="margin-left:4px;font-size:10px;"></i>
          </button>
        </div>
        <div id="listaAbordagensContainer">
          ${renderAbordagensLista(abordagens, appInstance)}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const indicator = container.querySelector(".pull-refresh-indicator");
  if (indicator) {
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 500);
  }
}

// ============================================
// RENDERIZAÇÃO: CARDS DE ESTATÍSTICAS
// ============================================

function renderStatsCards(stats) {
  return `
    <div class="stats-container" style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding:2px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
      <style>
        .stats-container::-webkit-scrollbar { height: 2px; }
        .stats-container::-webkit-scrollbar-thumb { background: var(--cinza-claro); border-radius: 10px; }
      </style>
      
      <!-- Total - Destaque -->
      <div class="stat-card-destaque" style="flex:1;min-width:70px;background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px 6px;text-align:center;color:white;box-shadow:0 2px 12px rgba(0,63,135,0.3);cursor:pointer;transition:transform 0.2s ease;" onclick="window._dashboardFiltrarStatus(null)">
        <div style="font-size:20px;font-weight:800;">${stats?.total || 0}</div>
        <div style="font-size:8px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Total</div>
      </div>
      
      <!-- Pendentes -->
      <div class="stat-card-mini" style="flex:1;min-width:60px;background:var(--branco);border-radius:var(--border-radius);padding:10px 6px;text-align:center;border-top:3px solid var(--aviso);box-shadow:var(--sombra-suave);cursor:pointer;transition:transform 0.2s ease;" onclick="window._dashboardFiltrarStatus('pending_sync')">
        <div style="font-size:18px;font-weight:800;color:var(--aviso);">${stats?.pending || 0}</div>
        <div style="font-size:7px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Pendentes</div>
      </div>
      
      <!-- Finalizadas -->
      <div class="stat-card-mini" style="flex:1;min-width:60px;background:var(--branco);border-radius:var(--border-radius);padding:10px 6px;text-align:center;border-top:3px solid var(--verde-bandeira);box-shadow:var(--sombra-suave);cursor:pointer;transition:transform 0.2s ease;" onclick="window._dashboardFiltrarStatus('synced')">
        <div style="font-size:18px;font-weight:800;color:var(--verde-bandeira);">${stats?.synced || 0}</div>
        <div style="font-size:7px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Finalizadas</div>
      </div>
      
      <!-- Retificação Pendente -->
      <div class="stat-card-mini" style="flex:1;min-width:60px;background:var(--branco);border-radius:var(--border-radius);padding:10px 6px;text-align:center;border-top:3px solid #92400e;box-shadow:var(--sombra-suave);cursor:pointer;transition:transform 0.2s ease;" onclick="window._dashboardFiltrarStatus('pending_rectification')">
        <div style="font-size:18px;font-weight:800;color:#92400e;">${stats?.pending_rectification || 0}</div>
        <div style="font-size:7px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Retif. Pend.</div>
      </div>
      
      <!-- Canceladas -->
      <div class="stat-card-mini" style="flex:1;min-width:60px;background:var(--branco);border-radius:var(--border-radius);padding:10px 6px;text-align:center;border-top:3px solid var(--erro);box-shadow:var(--sombra-suave);cursor:pointer;transition:transform 0.2s ease;" onclick="window._dashboardFiltrarStatus('cancelled')">
        <div style="font-size:18px;font-weight:800;color:var(--erro);">${stats?.cancelled || 0}</div>
        <div style="font-size:7px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Canceladas</div>
      </div>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: ACESSO RÁPIDO (COM ÍCONES)
// ============================================

function renderAcessoRapido(appInstance) {
  return `
    <div class="acesso-rapido" style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding:2px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
      <style>
        .acesso-rapido::-webkit-scrollbar { height: 2px; }
        .acesso-rapido::-webkit-scrollbar-thumb { background: var(--cinza-claro); border-radius: 10px; }
        .card-rapido { transition: all 0.2s ease; border-radius: var(--border-radius); padding:12px 8px; text-align:center; border:2px solid transparent; cursor:pointer; box-shadow: var(--sombra-suave); flex:1; min-width:70px; }
        .card-rapido:active { transform: scale(0.95); }
        .card-rapido:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
        .card-rapido .icon { font-size:22px; display:block; margin-bottom:4px; }
        .card-rapido .label { font-size:9px; font-weight:600; color:var(--cinza-escuro); line-height:1.2; }
        .card-rapido.azul { background:var(--azul-muito-claro); }
        .card-rapido.azul .icon { color:var(--azul-bandeira); }
        .card-rapido.verde { background:var(--verde-muito-claro); }
        .card-rapido.verde .icon { color:var(--verde-bandeira); }
        .card-rapido.roxo { background:#ede9fe; }
        .card-rapido.roxo .icon { color:#8b5cf6; }
        .card-rapido.laranja { background:#fef3c7; }
        .card-rapido.laranja .icon { color:#d97706; }
      </style>
      
      <!-- Nova Ocorrência -->
      <button onclick="window._dashboardNovaOcorrencia()" 
        class="card-rapido azul">
        <span class="icon"><i class="fas fa-file-alt"></i></span>
        <span class="label">Nova Ocorrência</span>
      </button>
      
      <!-- Nova Abordagem -->
      <button onclick="window._dashboardNovaAbordagem()" 
        class="card-rapido verde">
        <span class="icon"><i class="fas fa-search"></i></span>
        <span class="label">Nova Abordagem</span>
      </button>
      
      <!-- Buscar BO -->
      <button onclick="window._dashboardBuscarBO()" 
        class="card-rapido roxo">
        <span class="icon"><i class="fas fa-file-invoice"></i></span>
        <span class="label">Buscar BO</span>
      </button>
      
      <!-- Busca Profunda -->
      <button onclick="window._dashboardBuscaProfunda()" 
        class="card-rapido laranja">
        <span class="icon"><i class="fas fa-search"></i></span>
        <span class="label">Busca Profunda</span>
      </button>
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
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;margin-bottom:12px;">
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:6px;text-align:center;box-shadow:var(--sombra-suave);">
        <div style="font-size:14px;font-weight:700;color:var(--verde-bandeira);">${taxa}%</div>
        <div style="font-size:8px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Resolutividade</div>
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:6px;text-align:center;box-shadow:var(--sombra-suave);">
        <div style="font-size:14px;font-weight:700;color:var(--azul-bandeira);">${stats?.hoje || 0}</div>
        <div style="font-size:8px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Hoje</div>
      </div>
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:6px;text-align:center;box-shadow:var(--sombra-suave);">
        <div style="font-size:14px;font-weight:700;color:var(--roxo);">${stats?.draft || 0}</div>
        <div style="font-size:8px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Rascunhos</div>
      </div>
    </div>
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
    <div id="briefing-container" style="background:var(--gradiente-principal); border-radius:var(--border-radius); padding:14px 16px; margin-bottom:16px; color:white; box-shadow:var(--sombra-media); animation: slideUp 0.5s ease-out;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="margin:0; font-size:14px; font-weight:700;">
          <i class="fas fa-bolt" style="margin-right:6px;"></i>
          Briefing do Turno
        </h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:white; opacity:0.7; font-size:16px; cursor:pointer; padding:4px 8px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <p style="font-size:11px; opacity:0.9; margin-bottom:8px;">
        Veja o que aconteceu nas últimas 12 horas:
      </p>
      <div style="display:flex; flex-direction:column; gap:4px;">
        ${ocorrencias
          .map(
            (o) => `
          <div style="background:rgba(255,255,255,0.12); padding:6px 10px; border-radius:6px; display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px;" onclick="window._dashboardVerDetalhes('${o.id}')">
            <i class="fas fa-file-alt" style="font-size:12px; flex-shrink:0;"></i>
            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <b>${o.tipo_ocorrencia || "Ocorrência"}</b>
              ${o.local_ocorrencia ? ` - ${o.local_ocorrencia}` : ""}
            </span>
            <span style="font-size:9px; opacity:0.7; flex-shrink:0;">
              ${o.criado_em ? new Date(o.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
          </div>
        `,
          )
          .join("")}
        ${avisos
          .map(
            (a) => `
          <div style="background:rgba(255,255,255,0.12); padding:6px 10px; border-radius:6px; display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px;" onclick="window.app.navigateTo('mural')">
            <i class="fas fa-bullhorn" style="font-size:12px; flex-shrink:0;"></i>
            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <b>${a.titulo}</b>
            </span>
            <span style="font-size:9px; opacity:0.7; flex-shrink:0;">
              ${a.criado_em ? new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
          </div>
        `,
          )
          .join("")}
      </div>
      <button onclick="window.app.navigateTo('mural')" style="width:100%; margin-top:8px; background:white; color:var(--azul-bandeira); border:none; padding:6px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer;">
        VER TUDO
      </button>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: RETIFICAÇÕES PENDENTES
// ============================================

function renderRetificacoesPendentes(count, appInstance) {
  if (count === 0) return "";

  return `
    <div style="margin-bottom:12px;background:var(--branco);border-radius:var(--border-radius);padding:10px 14px;box-shadow:var(--sombra-suave);border-left:4px solid var(--aviso);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="window.app.navigateTo('retificacoes')">
      <div style="display:flex;align-items:center;gap:10px;">
        <i class="fas fa-sync-alt" style="color:var(--aviso);font-size:18px;"></i>
        <div>
          <span style="font-weight:600;font-size:13px;color:var(--cinza-escuro);">
            Solicitações de Retificação
          </span>
          <span style="font-size:11px;color:var(--cinza-medio);margin-left:6px;">
            Aguardando sua análise
          </span>
        </div>
      </div>
      <span class="badge badge-pending" style="font-size:13px;padding:4px 14px;font-weight:700;">
        ${count}
      </span>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: LISTA DE OCORRÊNCIAS (COM MINIATURAS)
// ============================================

function renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance) {
  if (!ocorrencias || ocorrencias.length === 0) {
    const mensagem = filtroAtivo
      ? `Nenhuma ocorrência com status "${getStatusLabel(filtroAtivo)}" encontrada`
      : "Nenhuma ocorrência encontrada";

    return `
      <div style="text-align:center;padding:30px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:40px;color:var(--cinza-claro);margin-bottom:8px;">
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

    // Resumo do relato (primeiras 12 palavras)
    let resumo = "";
    if (occ.observacoes) {
      const palavras = occ.observacoes.split(" ");
      resumo = palavras.slice(0, 12).join(" ");
      if (palavras.length > 12) resumo += "...";
    }

    // Buscar miniaturas dos anexos
    let primeiroAnexo = null;
    let totalAnexos = 0;
    let anexosInfo = "";

    if (occ.anexos && Array.isArray(occ.anexos) && occ.anexos.length > 0) {
      totalAnexos = occ.anexos.length;
      const imagens = occ.anexos.filter(
        (a) => a.tipo_arquivo === "image" || a.tipo === "image",
      );
      if (imagens.length > 0) {
        primeiroAnexo = imagens[0].url_thumb || imagens[0].url;
        if (imagens.length > 1) {
          anexosInfo = `+${imagens.length - 1}`;
        }
      }
    }

    html += `
      <div class="ocorrencia-item status-${occ.status}" onclick="window._dashboardVerBORapido('${occ.id}')" style="cursor:pointer;transition:transform 0.15s ease;padding:10px 12px;margin-bottom:8px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);border-left:4px solid ${occ.status === "synced" ? "var(--verde-bandeira)" : occ.status === "pending_sync" ? "var(--aviso)" : "var(--azul-bandeira)"};display:flex;gap:12px;align-items:center;">
        <!-- Miniatura -->
        <div style="flex-shrink:0;width:55px;height:55px;border-radius:8px;overflow:hidden;background:var(--cinza-claro);position:relative;">
          ${
            primeiroAnexo
              ? `
            <img src="${primeiroAnexo}" alt="Anexo" style="width:100%;height:100%;object-fit:cover;">
            ${anexosInfo ? `<span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:9px;font-weight:700;padding:0 6px;border-radius:4px;">${anexosInfo}</span>` : ""}
          `
              : `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:20px;">
              <i class="fas fa-file-alt"></i>
            </div>
          `
          }
        </div>
        
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:2px;">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
              <span style="font-weight:700;font-size:14px;color:var(--azul-bandeira);">#${numero}</span>
              <span class="badge badge-tipo badge-tipo-${occ.tipo_ocorrencia || "outro"}" style="font-size:9px;padding:2px 10px;font-weight:700;">${tipoLabel}</span>
              ${occ.status === "rectified" && occ.numero_versao > 1 ? `<span class="badge badge-rectified" style="font-size:8px;padding:1px 6px;">v${occ.numero_versao}</span>` : ""}
            </div>
            <span style="font-size:11px;color:var(--cinza-medio);"><i class="fas fa-calendar" style="margin-right:4px;"></i>${data}</span>
          </div>
          <div style="font-size:13px;color:var(--cinza-escuro);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--cinza-medio);font-size:11px;"></i>
            ${local}
          </div>
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;font-size:11px;color:var(--cinza-medio);">
            <span><i class="fas fa-user" style="margin-right:4px;"></i>${guardaNome}</span>
            <span class="badge badge-${statusClass}" style="font-size:9px;padding:1px 10px;">${statusLabel}</span>
          </div>
          ${
            resumo
              ? `
            <div style="font-size:12px;color:var(--cinza-escuro);margin-top:4px;padding-top:4px;border-top:1px solid var(--cinza-claro);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
              ${resumo}
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  });

  if (!filtroAtivo) {
    html += `
      <button class="btn-secondary" style="width:100%;padding:10px;border:none;border-radius:var(--border-radius);font-weight:600;cursor:pointer;background:var(--cinza-claro);color:var(--cinza-escuro);font-size:13px;margin-top:4px;" onclick="window.app.navigateTo('ocorrencias')">
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
      <div style="text-align:center;padding:20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:32px;color:var(--cinza-claro);margin-bottom:8px;">
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
    const faseLabel = ab.fase === "multa" ? "💰 Multa" : "⚠️ Advertência";
    const faseClass = ab.fase === "multa" ? "badge-cancelled" : "badge-pending";

    let identificador = "";
    let detalhes = "";
    if (isVeiculo) {
      identificador = ab.placa || "Placa não informada";
      detalhes = ab.marca_modelo || "";
      if (ab.cor) detalhes += ` (${ab.cor})`;
    } else {
      identificador = ab.nome || "Nome não informado";
      detalhes = ab.alcunha ? `(${ab.alcunha})` : "";
    }

    // Buscar miniaturas dos anexos
    let primeiroAnexo = null;
    let totalAnexos = 0;
    let anexosInfo = "";

    if (ab.anexos && Array.isArray(ab.anexos) && ab.anexos.length > 0) {
      totalAnexos = ab.anexos.length;
      const imagens = ab.anexos.filter(
        (a) => a.tipo === "image" || a.tipo_arquivo === "image",
      );
      if (imagens.length > 0) {
        primeiroAnexo = imagens[0].url_thumb || imagens[0].url;
        if (imagens.length > 1) {
          anexosInfo = `+${imagens.length - 1}`;
        }
      }
    }

    // Resumo do motivo
    let resumoMotivo = "";
    if (ab.motivo) {
      const palavras = ab.motivo.split(" ");
      resumoMotivo = palavras.slice(0, 15).join(" ");
      if (palavras.length > 15) resumoMotivo += "...";
    }

    html += `
      <div class="abordagem-item" onclick="window._dashboardVerAbordagem('${ab.id}', '${ab.tipo_abordagem}')" style="cursor:pointer;transition:transform 0.15s ease;padding:10px 12px;margin-bottom:8px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);border-left:4px solid ${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};display:flex;gap:12px;align-items:center;">
        <!-- Miniatura -->
        <div style="flex-shrink:0;width:55px;height:55px;border-radius:8px;overflow:hidden;background:var(--cinza-claro);position:relative;">
          ${
            primeiroAnexo
              ? `
            <img src="${primeiroAnexo}" alt="Anexo" style="width:100%;height:100%;object-fit:cover;">
            ${anexosInfo ? `<span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:9px;font-weight:700;padding:0 6px;border-radius:4px;">${anexosInfo}</span>` : ""}
          `
              : `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${isVeiculo ? "var(--azul-muito-claro)" : "var(--verde-muito-claro)"};color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};font-size:20px;">
              <i class="fas ${isVeiculo ? "fa-motorcycle" : "fa-user"}"></i>
            </div>
          `
          }
        </div>
        
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:2px;">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
              <span class="badge ${isVeiculo ? "badge-azul" : "badge-verde"}" style="font-size:9px;padding:2px 10px;font-weight:700;">${isVeiculo ? "VEÍCULO" : "PESSOA"}</span>
              <span style="font-weight:700;font-size:14px;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">${identificador}</span>
              ${detalhes ? `<span style="font-size:12px;color:var(--cinza-medio);">${detalhes}</span>` : ""}
            </div>
            <span style="font-size:11px;color:var(--cinza-medio);"><i class="fas fa-calendar" style="margin-right:4px;"></i>${data}</span>
          </div>
          <div style="font-size:13px;color:var(--cinza-escuro);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <i class="fas fa-user" style="margin-right:4px;color:var(--cinza-medio);font-size:11px;"></i>
            ${guardaNome}
          </div>
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;font-size:11px;color:var(--cinza-medio);">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>${resumoMotivo || "Motivo não informado"}</span>
            <span class="badge ${faseClass}" style="font-size:9px;padding:1px 10px;">${faseLabel}</span>
          </div>
          ${
            totalAnexos > 0
              ? `
            <div style="font-size:11px;color:var(--cinza-medio);margin-top:4px;padding-top:4px;border-top:1px solid var(--cinza-claro);">
              <i class="fas fa-paperclip" style="margin-right:4px;"></i> ${totalAnexos} anexo(s)
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  });

  return html;
}

// ============================================
// MODAL: VER DETALHES DA ABORDAGEM
// ============================================

export async function verAbordagemDetalhe(id, tipo, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    const tabela =
      tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
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

    // Criar modal
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      animation: fadeIn 0.25s ease;
    `;

    const isVeiculo = tipo === "veiculo";
    const guardaNome = data.usuarios?.nome_completo || "Desconhecido";
    const dataFormatada = formatarDataHoraLocal(data.criado_em);
    const faseLabel = data.fase === "multa" ? "💰 Multa" : "⚠️ Advertência";
    const faseClass =
      data.fase === "multa" ? "badge-cancelled" : "badge-pending";

    let identificador = "";
    let detalhes = "";
    if (isVeiculo) {
      identificador = data.placa || "Placa não informada";
      detalhes =
        `${data.marca_modelo || ""} ${data.cor ? `(${data.cor})` : ""}`.trim();
    } else {
      identificador = data.nome || "Nome não informado";
      detalhes =
        `${data.alcunha ? `(${data.alcunha})` : ""} ${data.cpf ? `CPF: ${data.cpf}` : ""} ${data.rg ? `RG: ${data.rg}` : ""}`.trim();
    }

    // Anexos
    let anexosHTML = "";
    if (data.anexos && Array.isArray(data.anexos) && data.anexos.length > 0) {
      const imagens = data.anexos.filter(
        (a) => a.tipo === "image" || a.tipo_arquivo === "image",
      );
      if (imagens.length > 0) {
        anexosHTML = `
          <div style="margin-top:12px;">
            <p style="font-weight:600;margin:0 0 8px 0;font-size:13px;color:var(--cinza-escuro);">
              <i class="fas fa-camera"></i> Fotos (${imagens.length})
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${imagens
                .map(
                  (img) => `
                <img src="${img.url_thumb || img.url}" alt="Anexo" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid var(--cinza-claro);" onclick="window.open('${img.url}', '_blank')">
              `,
                )
                .join("")}
            </div>
          </div>
        `;
      }
    }

    overlay.innerHTML = `
      <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px 20px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:17px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas ${isVeiculo ? "fa-motorcycle" : "fa-user"}" style="margin-right:8px;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};"></i>
            ${isVeiculo ? "Abordagem de Veículo" : "Abordagem de Pessoa"}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
            style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:16px 20px 20px 20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
              <div style="font-size:18px;font-weight:700;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">${identificador}</div>
              ${detalhes ? `<div style="font-size:13px;color:var(--cinza-medio);margin-top:2px;">${detalhes}</div>` : ""}
            </div>
            <span class="badge ${faseClass}" style="font-size:12px;padding:4px 14px;">${faseLabel}</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;background:var(--branco-fumaca);padding:12px;border-radius:var(--border-radius);margin-bottom:12px;">
            <div><span style="color:var(--cinza-medio);">Data:</span> <strong>${dataFormatada}</strong></div>
            <div><span style="color:var(--cinza-medio);">Guarda:</span> <strong>${guardaNome}</strong></div>
            <div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Local:</span> <strong>${data.local_abordagem || "Não informado"}</strong></div>
          </div>

          <div style="margin-bottom:12px;">
            <p style="font-weight:600;margin:0 0 4px 0;font-size:13px;color:var(--cinza-escuro);"><i class="fas fa-info-circle"></i> Motivo</p>
            <p style="font-size:14px;color:var(--cinza-escuro);margin:0;background:var(--branco-fumaca);padding:8px 12px;border-radius:var(--border-radius);">${data.motivo || "Não informado"}</p>
          </div>

          ${
            data.observacoes
              ? `
            <div style="margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 4px 0;font-size:13px;color:var(--cinza-escuro);"><i class="fas fa-pencil-alt"></i> Observações</p>
              <p style="font-size:14px;color:var(--cinza-escuro);margin:0;background:var(--branco-fumaca);padding:8px 12px;border-radius:var(--border-radius);">${data.observacoes}</p>
            </div>
          `
              : ""
          }

          ${
            data.prazo
              ? `
            <div style="margin-bottom:12px;padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);border-left:4px solid var(--aviso);">
              <p style="margin:0;font-size:13px;color:#92400e;">
                <i class="fas fa-calendar-check" style="margin-right:6px;"></i>
                <strong>Prazo:</strong> ${new Date(data.prazo).toLocaleDateString("pt-BR")}
                ${data.status_regularizacao ? ` - <strong>Status:</strong> ${data.status_regularizacao}` : ""}
              </p>
            </div>
          `
              : ""
          }

          ${anexosHTML}

          <div style="margin-top:16px;display:flex;gap:8px;">
            <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--cinza-claro);color:var(--cinza-escuro);border:none;cursor:pointer;">
              Fechar
            </button>
            <button onclick="this.closest('.modal-overlay').remove(); window._dashboardNovaOcorrencia()" class="btn-primary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--gradiente-principal);color:var(--branco);border:none;cursor:pointer;">
              <i class="fas fa-file-export" style="margin-right:6px;"></i> Converter em BO
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
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

    // Buscar envolvidos
    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    // Buscar anexos
    const anexosResult = await ocorrenciaManager.listarAnexos(id);
    const anexos = anexosResult.success ? anexosResult.data : [];

    // Criar modal
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      animation: fadeIn 0.25s ease;
    `;

    const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
    const statusClass = getStatusClass(occ.status);
    const statusLabel = getStatusLabel(occ.status);
    const dataCriacao = formatarDataHoraLocal(occ.criado_em);
    const dataInicio = occ.data_hora_inicio
      ? formatarDataHoraLocal(occ.data_hora_inicio)
      : "Não informado";
    const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);

    // Anexos
    let anexosHTML = "";
    if (anexos && anexos.length > 0) {
      const imagens = anexos.filter(
        (a) => a.tipo_arquivo === "image" || a.tipo === "image",
      );
      if (imagens.length > 0) {
        anexosHTML = `
          <div style="margin-top:12px;">
            <p style="font-weight:600;margin:0 0 8px 0;font-size:13px;color:var(--cinza-escuro);">
              <i class="fas fa-camera"></i> Fotos (${imagens.length})
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${imagens
                .map(
                  (img) => `
                <img src="${img.url_thumb || img.url}" alt="Anexo" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid var(--cinza-claro);" onclick="window.open('${img.url}', '_blank')">
              `,
                )
                .join("")}
            </div>
          </div>
        `;
      }
    }

    // Envolvidos
    let envolvidosHTML = "";
    if (envolvidos && envolvidos.length > 0) {
      envolvidosHTML = `
        <div style="margin-top:12px;">
          <p style="font-weight:600;margin:0 0 8px 0;font-size:13px;color:var(--cinza-escuro);">
            <i class="fas fa-users"></i> Envolvidos (${envolvidos.length})
          </p>
          ${envolvidos
            .map(
              (env) => `
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--branco-fumaca);border-radius:6px;margin-bottom:4px;font-size:13px;">
              <span><span class="badge badge-azul" style="font-size:9px;padding:1px 8px;">${getTipoEnvolvidoLabel(env.tipo)}</span> <strong>${env.nome_completo}</strong></span>
              ${env.cpf ? `<span style="color:var(--cinza-medio);font-size:12px;">${env.cpf}</span>` : ""}
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="modal" style="max-width:550px;width:100%;max-height:95vh;overflow-y:auto;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px 20px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:17px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-file-alt" style="margin-right:8px;"></i>
            #${numero}
            <span class="badge badge-${statusClass}" style="font-size:11px;margin-left:8px;">${statusLabel}</span>
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
            style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:16px 20px 20px 20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;background:var(--branco-fumaca);padding:12px;border-radius:var(--border-radius);margin-bottom:12px;">
            <div><span style="color:var(--cinza-medio);">Tipo:</span> <strong>${tipoLabel}</strong></div>
            <div><span style="color:var(--cinza-medio);">Data:</span> <strong>${dataCriacao}</strong></div>
            <div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Local:</span> <strong>${occ.local_ocorrencia || "Não informado"}</strong></div>
            <div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Data/Hora Início:</span> <strong>${dataInicio}</strong></div>
            ${occ.nome_solicitante ? `<div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Solicitante:</span> <strong>${occ.nome_solicitante}</strong></div>` : ""}
          </div>

          ${
            occ.observacoes
              ? `
            <div style="margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 4px 0;font-size:13px;color:var(--cinza-escuro);"><i class="fas fa-pencil-alt"></i> Observações</p>
              <p style="font-size:14px;color:var(--cinza-escuro);margin:0;background:var(--branco-fumaca);padding:8px 12px;border-radius:var(--border-radius);max-height:120px;overflow-y:auto;">${occ.observacoes}</p>
            </div>
          `
              : ""
          }

          ${envolvidosHTML}
          ${anexosHTML}

          <div style="margin-top:16px;display:flex;gap:8px;">
            <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--cinza-claro);color:var(--cinza-escuro);border:none;cursor:pointer;">
              Fechar
            </button>
            <button onclick="this.closest('.modal-overlay').remove(); window._dashboardVerDetalhes('${id}')" class="btn-primary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--gradiente-principal);color:var(--branco);border:none;cursor:pointer;">
              <i class="fas fa-eye" style="margin-right:6px;"></i> Ver BO Completo
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
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
