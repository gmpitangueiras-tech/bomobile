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
 *
 * MELHORIAS APLICADAS:
 * - Pull-to-refresh (recarregar puxando para baixo)
 * - Dashboards personalizados (guarda vê suas ocorrências, supervisor vê geral)
 * - Cache de estatísticas
 * - Otimização de carregamento
 * - Animações suaves
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
const CACHE_EXPIRY = 30000; // 30 segundos de cache
const PULL_REFRESH_THRESHOLD = 80;

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtroStatusAtual: null,
  statsData: null,
  ocorrenciasData: [],
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

    renderizarDashboard(container, appInstance);

    // Configurar pull-to-refresh
    configurarPullToRefresh(container, appInstance);

    // Registrar funções no escopo global
    window._dashboardFiltrarStatus = (status) =>
      filtrarPorStatus(status, container, appInstance);
    window._dashboardVerDetalhes = (id) => verDetalhes(id, appInstance);
    window._dashboardRecarregar = () => renderDashboard(container, appInstance);
    window._dashboardRefrescar = () => refreshDashboard(container, appInstance);
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

  // Remover listeners anteriores
  dashboardContent.removeEventListener("touchstart", handleTouchStart);
  dashboardContent.removeEventListener("touchmove", handleTouchMove);
  dashboardContent.removeEventListener("touchend", handleTouchEnd);

  // Adicionar novos listeners
  dashboardContent.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });
  dashboardContent.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  dashboardContent.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });

  // Armazenar referências
  dashboardContent._pullRefreshApp = appInstance;
  dashboardContent._pullRefreshContainer = container;
}

function handleTouchStart(e) {
  const container = this;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;

  // Só ativa pull-to-refresh se estiver no topo da página
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

    // Mostrar indicador visual
    mostrarIndicadorPullRefresh(this, estado.pullProgress);

    // Prevenir scroll durante o pull
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

  // Se o pull atingiu o threshold, recarregar
  if (estado.pullProgress >= 1) {
    // Mostrar loading
    mostrarIndicadorPullRefresh(container, 1, true);

    // Recarregar dados
    refreshDashboard(dashboardContainer, appInstance);
  } else {
    // Resetar indicador
    removerIndicadorPullRefresh(container);
  }

  estado.isPulling = false;
  estado.pullProgress = 0;
  estado.touchStartY = 0;
  estado.touchCurrentY = 0;
}

function mostrarIndicadorPullRefresh(container, progress, loading = false) {
  // Verificar se já existe indicador
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
    // Limpar cache
    localStorage.removeItem(CACHE_KEY_STATS);
    localStorage.removeItem(CACHE_KEY_OCORRENCIAS);

    // Recarregar dados
    await carregarStats();
    await carregarBriefings();
    await carregarOcorrencias();

    // Re-renderizar
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
    // Remover indicador
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
// CARREGAR DADOS COM CACHE
// ============================================

async function carregarStats() {
  // Tentar carregar do cache
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

  // Carregar retificações pendentes (apenas supervisor)
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

    // Buscar novas ocorrências (sem JOIN)
    const { data: novasOcorrencias, error: occError } = await client
      .from("ocorrencias")
      .select("id, tipo_ocorrencia, criado_em, local_ocorrencia")
      .gte("criado_em", dozeHorasAtras)
      .eq("esta_ativa", true)
      .limit(5);

    if (occError) throw occError;

    // Buscar novos avisos
    const { data: novosAvisos, error: avisoError } = await client
      .from("mural_avisos")
      .select("id, titulo, tipo, criado_em")
      .gte("criado_em", dozeHorasAtras)
      .limit(5);

    if (avisoError) throw avisoError;

    // Buscar nomes dos criadores separadamente
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
  // Tentar carregar do cache
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
// RENDERIZAÇÃO
// ============================================

function renderizarDashboard(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;
  const stats = estado.statsData;
  const ocorrencias = estado.ocorrenciasData;
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

      <h2 style="margin-bottom:4px;color:var(--azul-bandeira);">
        Olá, ${user?.nome_completo || "Guarda"}!
      </h2>
      <p style="color:var(--cinza-medio);margin-bottom:16px;font-size:13px;">
        ${isSupervisor ? "👑 Visão geral do sistema" : "📋 Suas ocorrências"}
        <span style="font-size:11px;color:var(--cinza-medio);margin-left:8px;">
          (${new Date().toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })})
        </span>
      </p>

      <!-- Cards de Estatísticas -->
      <div class="stats-grid">
        <div class="stat-card" onclick="window._dashboardFiltrarStatus(null)" style="cursor:pointer;">
          <div class="icon"><i class="fas fa-tasks"></i></div>
          <div class="value">${stats?.total || 0}</div>
          <div class="label">Total</div>
        </div>
        <div class="stat-card amarelo" onclick="window._dashboardFiltrarStatus('pending_sync')" style="cursor:pointer;">
          <div class="icon"><i class="fas fa-clock"></i></div>
          <div class="value">${stats?.pending || 0}</div>
          <div class="label">Pendentes</div>
        </div>
        <div class="stat-card verde" onclick="window._dashboardFiltrarStatus('synced')" style="cursor:pointer;">
          <div class="icon"><i class="fas fa-check-circle"></i></div>
          <div class="value">${stats?.synced || 0}</div>
          <div class="label">Finalizadas</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--azul-bandeira);background:var(--azul-muito-claro);" onclick="window._dashboardFiltrarStatus('rectified')">
          <div class="icon"><i class="fas fa-sync-alt" style="color:var(--azul-bandeira);"></i></div>
          <div class="value" style="color:var(--azul-bandeira);">${stats?.rectified || 0}</div>
          <div class="label" style="color:var(--azul-bandeira);">Retificadas</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--aviso);background:#fef3c7;" onclick="window._dashboardFiltrarStatus('pending_rectification')">
          <div class="icon"><i class="fas fa-clock" style="color:#92400e;"></i></div>
          <div class="value" style="color:#92400e;">${stats?.pending_rectification || 0}</div>
          <div class="label" style="color:#92400e;">Retif. Pendente</div>
        </div>
        <div class="stat-card vermelho" onclick="window._dashboardFiltrarStatus('cancelled')" style="cursor:pointer;">
          <div class="icon"><i class="fas fa-times-circle"></i></div>
          <div class="value">${stats?.cancelled || 0}</div>
          <div class="label">Canceladas</div>
        </div>
      </div>

      ${isSupervisor ? renderRetificacoesPendentes(pendentesCount, appInstance) : ""}

      <!-- Estatísticas adicionais para supervisor -->
      ${isSupervisor ? renderStatsAdicionais(stats) : ""}

      <!-- Lista de Ocorrências -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
        <h3 style="font-size:16px;font-weight:700;margin:0;">
          <i class="fas fa-list-ul" style="margin-right:8px;"></i>
          ${filtroAtivo ? `Ocorrências - ${tituloFiltro}` : "Últimas Ocorrências"}
        </h3>
        ${
          filtroAtivo
            ? `
          <button onclick="window._dashboardFiltrarStatus(null)" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-times" style="margin-right:4px;"></i> Limpar Filtro
          </button>
        `
            : ""
        }
      </div>

      <div id="listaOcorrenciasContainer">
        ${renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance)}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Verificar se há indicador de pull-refresh e remover após renderização
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
// RENDERIZAÇÃO: ESTATÍSTICAS ADICIONAIS
// ============================================

function renderStatsAdicionais(stats) {
  const total = stats?.total || 1;
  const finalizadas = stats?.synced || 0;
  const taxa = ((finalizadas / total) * 100).toFixed(1);

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;">
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
    <div id="briefing-container" style="background:var(--gradiente-principal); border-radius:var(--border-radius); padding:16px; margin-bottom:20px; color:white; box-shadow:var(--sombra-media); animation: slideUp 0.5s ease-out;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px;">
          <i class="fas fa-bolt" style="margin-right:8px;"></i>
          Briefing do Turno
        </h3>
        <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:white; opacity:0.7; font-size:18px; cursor:pointer;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <p style="font-size:12px; opacity:0.9; margin-bottom:12px;">
        Veja o que aconteceu nas últimas 12 horas:
      </p>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${ocorrencias
          .map(
            (o) => `
          <div style="background:rgba(255,255,255,0.15); padding:8px 12px; border-radius:8px; display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window._dashboardVerDetalhes('${o.id}')">
            <i class="fas fa-file-alt" style="font-size:14px;"></i>
            <span style="font-size:13px;">
              Nova Ocorrência: <b>${o.tipo_ocorrencia || "Sem tipo"}</b>
              ${o.local_ocorrencia ? ` - ${o.local_ocorrencia}` : ""}
            </span>
          </div>
        `,
          )
          .join("")}
        ${avisos
          .map(
            (a) => `
          <div style="background:rgba(255,255,255,0.15); padding:8px 12px; border-radius:8px; display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="window.app.navigateTo('mural')">
            <i class="fas fa-bullhorn" style="font-size:14px;"></i>
            <span style="font-size:13px;">
              Mural: <b>${a.titulo}</b>
            </span>
          </div>
        `,
          )
          .join("")}
      </div>
      <button onclick="window.app.navigateTo('mural')" style="width:100%; margin-top:12px; background:white; color:var(--azul-bandeira); border:none; padding:8px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
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
    <div style="margin-top:12px;background:var(--branco);border-radius:var(--border-radius);padding:12px 16px;box-shadow:var(--sombra-suave);border-left:4px solid var(--aviso);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="window.app.navigateTo('retificacoes')">
      <div>
        <span style="font-weight:600;font-size:14px;">
          <i class="fas fa-sync-alt" style="color:var(--aviso);margin-right:8px;"></i>
          Solicitações de Retificação Pendentes
        </span>
        <span style="font-size:12px;color:var(--cinza-medio);margin-left:8px;">
          Aguardando sua análise
        </span>
      </div>
      <span class="badge badge-pending" style="font-size:14px;padding:6px 14px;">
        ${count}
      </span>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: LISTA DE OCORRÊNCIAS
// ============================================

function renderOcorrenciasLista(ocorrencias, filtroAtivo, appInstance) {
  if (!ocorrencias || ocorrencias.length === 0) {
    const mensagem = filtroAtivo
      ? `Nenhuma ocorrência com status "${getStatusLabel(filtroAtivo)}" encontrada`
      : "Nenhuma ocorrência encontrada";

    return `
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-inbox"></i>
        </div>
        <p style="font-weight:500;">${mensagem}</p>
        ${!filtroAtivo ? '<p style="font-size:13px;">Clique em "+" para criar sua primeira ocorrência</p>' : ""}
        ${
          filtroAtivo
            ? `
          <button onclick="window._dashboardFiltrarStatus(null)" class="btn-secondary" style="margin-top:12px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
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

    html += `
      <div class="ocorrencia-item status-${occ.status}" onclick="window._dashboardVerDetalhes('${occ.id}')">
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
  });

  if (!filtroAtivo) {
    html += `
      <button class="btn-secondary" style="width:100%;padding:12px;border:none;border-radius:var(--border-radius);font-weight:600;cursor:pointer;background:var(--cinza-claro);color:var(--cinza-escuro);" onclick="window.app.navigateTo('ocorrencias')">
        <i class="fas fa-arrow-right" style="margin-right:6px;"></i>
        Ver todas as ocorrências
      </button>
    `;
  } else {
    html += `
      <div style="text-align:center;padding:12px;color:var(--cinza-medio);font-size:13px;">
        <i class="fas fa-filter" style="margin-right:4px;"></i>
        ${ocorrencias.length} ocorrência(s) encontrada(s)
      </div>
    `;
  }

  return html;
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
  carregarStats,
  carregarOcorrencias,
  carregarBriefings,
  refreshDashboard,
};
