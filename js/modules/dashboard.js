/**
 * MÓDULO DASHBOARD - Página Inicial
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Estatísticas gerais do sistema
 * - Cards agrupados (Ocorrências e Abordagens)
 * - Últimas 3 ocorrências com miniaturas
 * - Últimas 3 abordagens
 * - Detalhes de abordagens via modal
 * - Briefing do turno (últimas 12 horas)
 * - Navegação para outras páginas
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
  abordagensData: { veiculos: [], pessoas: [] },
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
    window._dashboardVerAbordagem = (id, tipo) =>
      verAbordagem(id, tipo, appInstance);
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
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.ocorrenciasData = [];
      return;
    }

    const user = authManager.getUser();
    if (!user) {
      estado.ocorrenciasData = [];
      return;
    }

    // Buscar ocorrências - CORRIGIDO
    const { data: ocorrencias, error } = await client
      .from("ocorrencias")
      .select(
        `
                *,
                usuarios!ocorrencias_criado_por_fkey(nome_completo, cpf)
            `,
      )
      .eq("criado_por", user.id)
      .eq("esta_ativa", true)
      .order("criado_em", { ascending: false })
      .limit(10);

    if (error) throw error;

    // Buscar anexos para cada ocorrência
    const ocorrenciasComAnexos = await Promise.all(
      (ocorrencias || []).map(async (occ) => {
        try {
          const { data: anexos } = await client
            .from("anexos")
            .select("id, nome_arquivo, tipo_arquivo, url, url_thumb")
            .eq("ocorrencia_id", occ.id)
            .order("criado_em", { ascending: true })
            .limit(5);

          return {
            ...occ,
            anexos: anexos || [],
          };
        } catch (e) {
          return { ...occ, anexos: [] };
        }
      }),
    );

    estado.ocorrenciasData = ocorrenciasComAnexos || [];
    setCachedData(CACHE_KEY_OCORRENCIAS, estado.ocorrenciasData);
  } catch (error) {
    console.warn("Erro ao carregar ocorrências:", error);
    estado.ocorrenciasData = [];
  }
}

async function carregarAbordagens() {
  const cachedAbordagens = getCachedData(CACHE_KEY_ABORDAGENS);
  if (cachedAbordagens) {
    estado.abordagensData = cachedAbordagens;
    console.log("📋 Abordagens carregadas do cache");
    return;
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.abordagensData = { veiculos: [], pessoas: [] };
      return;
    }

    const user = authManager.getUser();
    if (!user) {
      estado.abordagensData = { veiculos: [], pessoas: [] };
      return;
    }

    const [veiculosResult, pessoasResult] = await Promise.all([
      client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .eq("criado_por", user.id)
        .order("criado_em", { ascending: false })
        .limit(3),
      client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .eq("criado_por", user.id)
        .order("criado_em", { ascending: false })
        .limit(3),
    ]);

    const abordagens = {
      veiculos: veiculosResult.data || [],
      pessoas: pessoasResult.data || [],
    };

    estado.abordagensData = abordagens;
    setCachedData(CACHE_KEY_ABORDAGENS, abordagens);
  } catch (error) {
    console.warn("Erro ao carregar abordagens:", error);
    estado.abordagensData = { veiculos: [], pessoas: [] };
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
  const ocorrencias = estado.ocorrenciasData.slice(0, 3);
  const abordagens = estado.abordagensData;
  const briefings = estado.briefingsData;
  const pendentesCount = estado.pendentesRetificacoes?.length || 0;
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();

  const temNovidades =
    briefings?.ocorrencias?.length > 0 || briefings?.avisos?.length > 0;

  const totalAbordagens =
    (abordagens.veiculos || []).length + (abordagens.pessoas || []).length;

  let html = `
        <div class="container" style="padding-bottom:100px;" id="dashboardContainer">
            ${temNovidades ? renderBriefing(briefings) : ""}

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div>
                    <h2 style="margin-bottom:2px;color:var(--azul-bandeira);font-size:18px;">
                        Olá, ${user?.nome_completo || "Guarda"}! 👋
                    </h2>
                    <p style="color:var(--cinza-medio);font-size:12px;margin:0;">
                        ${new Date().toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                    </p>
                </div>
                <button onclick="window._dashboardRefrescar()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:auto;width:auto;border-radius:30px;">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>

            <!-- Cards de Estatísticas Agrupados -->
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;color:var(--cinza-medio);margin:0 0 8px 0;font-weight:600;">
                    <i class="fas fa-chart-simple"></i> Estatísticas
                </h3>
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
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:4px;">
                    <div class="stat-card" style="border-left:3px solid var(--azul-bandeira);background:var(--azul-muito-claro);padding:8px;min-height:50px;cursor:pointer;" onclick="window._dashboardFiltrarStatus('rectified')">
                        <div class="icon"><i class="fas fa-sync-alt" style="color:var(--azul-bandeira);"></i></div>
                        <div class="value" style="font-size:14px;color:var(--azul-bandeira);">${stats?.rectified || 0}</div>
                        <div class="label" style="font-size:7px;color:var(--azul-bandeira);">Retificadas</div>
                    </div>
                    <div class="stat-card" style="border-left:3px solid var(--aviso);background:#fef3c7;padding:8px;min-height:50px;cursor:pointer;" onclick="window._dashboardFiltrarStatus('pending_rectification')">
                        <div class="icon"><i class="fas fa-clock" style="color:#92400e;"></i></div>
                        <div class="value" style="font-size:14px;color:#92400e;">${stats?.pending_rectification || 0}</div>
                        <div class="label" style="font-size:7px;color:#92400e;">Retif. Pendente</div>
                    </div>
                    <div class="stat-card vermelho" onclick="window._dashboardFiltrarStatus('cancelled')" style="cursor:pointer;padding:8px;min-height:50px;">
                        <div class="icon"><i class="fas fa-times-circle"></i></div>
                        <div class="value" style="font-size:14px;">${stats?.cancelled || 0}</div>
                        <div class="label" style="font-size:7px;">Canceladas</div>
                    </div>
                </div>
            </div>

            ${isSupervisor ? renderRetificacoesPendentes(pendentesCount, appInstance) : ""}

            <!-- Últimas Ocorrências -->
            <div style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <h3 style="font-size:14px;font-weight:700;margin:0;color:var(--azul-bandeira);">
                        <i class="fas fa-file-alt" style="margin-right:6px;"></i>
                        Últimas Ocorrências
                    </h3>
                    <button onclick="window.app.navigateTo('ocorrencias')" class="btn-secondary" style="padding:4px 12px;font-size:10px;min-height:auto;width:auto;border-radius:30px;">
                        Ver todas <i class="fas fa-arrow-right" style="margin-left:4px;font-size:8px;"></i>
                    </button>
                </div>
                ${renderOcorrenciasLista(ocorrencias, appInstance)}
            </div>

            <!-- Últimas Abordagens -->
            <div style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <h3 style="font-size:14px;font-weight:700;margin:0;color:var(--verde-bandeira);">
                        <i class="fas fa-handshake" style="margin-right:6px;"></i>
                        Últimas Abordagens (${totalAbordagens})
                    </h3>
                    <button onclick="window.app.navigateTo('consulta')" class="btn-secondary" style="padding:4px 12px;font-size:10px;min-height:auto;width:auto;border-radius:30px;">
                        Ver todas <i class="fas fa-arrow-right" style="margin-left:4px;font-size:8px;"></i>
                    </button>
                </div>
                ${renderAbordagensLista(abordagens, appInstance)}
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
// RENDERIZAÇÃO: BRIEFING
// ============================================

function renderBriefing(briefings) {
  const ocorrencias = briefings?.ocorrencias || [];
  const avisos = briefings?.avisos || [];

  if (ocorrencias.length === 0 && avisos.length === 0) return "";

  return `
        <div id="briefing-container" style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:14px;margin-bottom:16px;color:white;box-shadow:var(--sombra-media);animation:slideUp 0.5s ease-out;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h3 style="margin:0;font-size:14px;">
                    <i class="fas fa-bolt" style="margin-right:6px;"></i>
                    Briefing do Turno
                </h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:white;opacity:0.7;font-size:16px;cursor:pointer;padding:0 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <p style="font-size:11px;opacity:0.9;margin-bottom:8px;">
                Veja o que aconteceu nas últimas 12 horas:
            </p>
            <div style="display:flex;flex-direction:column;gap:4px;">
                ${ocorrencias
                  .map(
                    (o) => `
                    <div style="background:rgba(255,255,255,0.12);padding:6px 10px;border-radius:6px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;" onclick="window._dashboardVerDetalhes('${o.id}')">
                        <i class="fas fa-file-alt" style="font-size:12px;"></i>
                        <span>Nova Ocorrência: <b>${o.tipo_ocorrencia || "Sem tipo"}</b></span>
                    </div>
                `,
                  )
                  .join("")}
                ${avisos
                  .map(
                    (a) => `
                    <div style="background:rgba(255,255,255,0.12);padding:6px 10px;border-radius:6px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;" onclick="window.app.navigateTo('mural')">
                        <i class="fas fa-bullhorn" style="font-size:12px;"></i>
                        <span>Mural: <b>${a.titulo}</b></span>
                    </div>
                `,
                  )
                  .join("")}
            </div>
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
            <div>
                <span style="font-weight:600;font-size:13px;">
                    <i class="fas fa-sync-alt" style="color:var(--aviso);margin-right:6px;"></i>
                    Solicitações de Retificação Pendentes
                </span>
                <span style="font-size:11px;color:var(--cinza-medio);margin-left:6px;">
                    Aguardando sua análise
                </span>
            </div>
            <span class="badge badge-pending" style="font-size:13px;padding:4px 14px;">
                ${count}
            </span>
        </div>
    `;
}

// ============================================
// RENDERIZAÇÃO: OCORRÊNCIAS (COM MINIATURAS)
// ============================================

function renderOcorrenciasLista(ocorrencias, appInstance) {
  if (!ocorrencias || ocorrencias.length === 0) {
    return `
            <div style="text-align:center;padding:20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
                <i class="fas fa-inbox" style="font-size:24px;color:var(--cinza-claro);margin-bottom:6px;display:block;"></i>
                <p style="color:var(--cinza-medio);font-size:13px;margin:0;">Nenhuma ocorrência recente</p>
                <button onclick="window.app.navigateTo('nova-ocorrencia')" class="btn-primary" style="margin-top:8px;padding:8px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;">
                    <i class="fas fa-plus"></i> Nova Ocorrência
                </button>
            </div>
        `;
  }

  return ocorrencias
    .map((occ) => {
      const numero =
        occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
      const statusClass = getStatusClass(occ.status);
      const statusLabel = getStatusLabel(occ.status);
      const data = formatarDataHoraLocal(occ.criado_em);
      const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
      const guardaNome = occ.criador?.nome_completo || "Desconhecido";

      // Verificar se tem anexos com imagens
      let temImagem = false;
      let imagemUrl = null;
      let totalAnexos = 0;

      if (occ.anexos && occ.anexos.length > 0) {
        totalAnexos = occ.anexos.length;
        // Procurar primeira imagem
        const imagem = occ.anexos.find(
          (a) => a.tipo_arquivo === "image" || a.tipo === "image",
        );
        if (imagem) {
          temImagem = true;
          imagemUrl = imagem.url || imagem.url_thumb;
        }
      }

      // Badge de anexos
      let anexosBadge = "";
      if (totalAnexos > 0) {
        anexosBadge = `<span style="font-size:9px;color:var(--cinza-medio);background:var(--cinza-claro);padding:2px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px;">📎 ${totalAnexos}</span>`;
      }

      // Badge de versão (retificação)
      const versaoBadge =
        occ.status === "rectified" && occ.numero_versao > 1
          ? `<span style="font-size:8px;color:var(--azul-bandeira);background:var(--azul-muito-claro);padding:1px 6px;border-radius:4px;border:1px solid var(--azul-bandeira);">v${occ.numero_versao}</span>`
          : "";

      // Preview da observação
      const previewObs = occ.observacoes
        ? occ.observacoes.substring(0, 60) +
          (occ.observacoes.length > 60 ? "..." : "")
        : "";

      return `
            <div class="ocorrencia-item status-${occ.status}" onclick="window._dashboardVerDetalhes('${occ.id}')" style="margin-bottom:6px;padding:8px 10px;display:flex;gap:10px;align-items:flex-start;">
                <!-- Miniatura da imagem -->
                ${
                  temImagem
                    ? `
                    <div style="width:60px;height:60px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--cinza-claro);position:relative;">
                        <img src="${imagemUrl}" alt="Miniatura" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);font-size:20px;\\'><i class=\\'fas fa-file-alt\\'></i></div>'">
                        ${totalAnexos > 1 ? `<span style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.7);color:white;font-size:8px;padding:1px 6px;border-radius:8px;">+${totalAnexos - 1}</span>` : ""}
                    </div>
                `
                    : `
                    <div style="width:60px;height:60px;border-radius:8px;flex-shrink:0;background:var(--azul-muito-claro);display:flex;align-items:center;justify-content:center;color:var(--azul-bandeira);font-size:20px;border:1px solid var(--cinza-claro);">
                        <i class="fas fa-file-alt"></i>
                    </div>
                `
                }
                
                <!-- Conteúdo -->
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
                        <div style="min-width:0;">
                            <div style="font-size:13px;font-weight:700;color:var(--azul-bandeira);display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                                #${numero}
                                <span class="badge badge-tipo badge-tipo-${occ.tipo_ocorrencia}" style="font-size:8px;padding:1px 8px;">${tipoLabel}</span>
                                ${versaoBadge}
                            </div>
                            <div style="font-size:10px;color:var(--cinza-medio);margin-top:1px;">
                                <i class="fas fa-calendar-alt" style="margin-right:3px;"></i>${data}
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
                            <span class="badge badge-${statusClass}" style="font-size:9px;padding:2px 10px;">${statusLabel}</span>
                            ${anexosBadge}
                        </div>
                    </div>
                    <div style="font-size:12px;color:var(--cinza-escuro);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--cinza-medio);font-size:10px;"></i>
                        ${occ.local_ocorrencia || "Local não informado"}
                    </div>
                    <div style="font-size:10px;color:var(--cinza-medio);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">
                        <span><i class="fas fa-user" style="margin-right:3px;"></i>${guardaNome}</span>
                        ${occ.hash_pericial ? `<span title="Hash Pericial" style="font-family:monospace;font-size:8px;cursor:help;">🔒 ${occ.hash_pericial.substring(0, 8)}...</span>` : ""}
                    </div>
                    ${
                      previewObs
                        ? `
                        <div style="font-size:11px;color:var(--cinza-medio);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.7;">
                            ${previewObs}
                        </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `;
    })
    .join("");
}

// ============================================
// RENDERIZAÇÃO: ABORDAGENS
// ============================================

function renderAbordagensLista(abordagens, appInstance) {
  const veiculos = abordagens.veiculos || [];
  const pessoas = abordagens.pessoas || [];

  const todasAbordagens = [
    ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
    ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
  ]
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .slice(0, 3);

  if (todasAbordagens.length === 0) {
    return `
            <div style="text-align:center;padding:20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
                <i class="fas fa-handshake" style="font-size:24px;color:var(--cinza-claro);margin-bottom:6px;display:block;"></i>
                <p style="color:var(--cinza-medio);font-size:13px;margin:0;">Nenhuma abordagem recente</p>
                <button onclick="window._consultaAbrirFormulario()" class="btn-secondary" style="margin-top:8px;padding:8px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--verde-bandeira);color:white;">
                    <i class="fas fa-plus"></i> Nova Abordagem
                </button>
            </div>
        `;
  }

  return todasAbordagens
    .map((item) => {
      const isVeiculo = item.tipo_abordagem === "veiculo";
      const data = formatarDataHoraLocal(item.criado_em);
      const guardaNome = item.usuarios?.nome_completo || "Desconhecido";

      let identificador, icone, badgeColor, detalhes;
      if (isVeiculo) {
        identificador = item.placa || "Placa não informada";
        icone = "fa-motorcycle";
        badgeColor = "badge-veiculo";
        detalhes =
          `${item.marca_modelo || ""} (${item.cor || "cor não informada"})`.trim();
      } else {
        identificador = item.nome || "Nome não informado";
        icone = "fa-user";
        badgeColor = "badge-pessoa";
        detalhes = item.alcunha ? `(${item.alcunha})` : "";
        if (item.cpf) detalhes += ` - CPF: ${item.cpf}`;
      }

      const fase = item.fase || "advertencia";
      const faseLabel = fase === "multa" ? "💰 Multa" : "⚠️ Advertência";
      const faseColor = fase === "multa" ? "var(--erro)" : "var(--aviso)";

      return `
            <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px 12px;margin-bottom:6px;box-shadow:var(--sombra-suave);border-left:4px solid ${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};cursor:pointer;" onclick="window._dashboardVerAbordagem('${item.id}', '${item.tipo_abordagem}')">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span class="badge ${badgeColor}" style="font-size:8px;padding:1px 8px;">
                                ${isVeiculo ? "🚗 Veículo" : "👤 Pessoa"}
                            </span>
                            <i class="fas ${icone}" style="color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};font-size:12px;"></i>
                            <span style="font-weight:600;font-size:13px;color:var(--cinza-escuro);">${identificador}</span>
                            ${detalhes ? `<span style="font-size:10px;color:var(--cinza-medio);">${detalhes}</span>` : ""}
                        </div>
                        <div style="font-size:10px;color:var(--cinza-medio);margin-top:2px;">
                            <i class="fas fa-calendar-alt" style="margin-right:4px;"></i>${data}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;">
                        <span style="font-size:9px;color:${faseColor};font-weight:600;">${faseLabel}</span>
                        <span style="font-size:9px;color:var(--cinza-medio);">
                            <i class="fas fa-user-shield"></i> ${guardaNome}
                        </span>
                    </div>
                </div>
                ${
                  item.motivo
                    ? `
                    <div style="font-size:11px;color:var(--cinza-escuro);margin-top:4px;background:var(--cinza-claro);padding:4px 8px;border-radius:4px;opacity:0.8;">
                        <strong>Motivo:</strong> ${item.motivo}
                    </div>
                `
                    : ""
                }
                <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
                    ${item.observacoes ? `<span style="font-size:9px;color:var(--cinza-medio);background:var(--azul-muito-claro);padding:2px 8px;border-radius:4px;">📝 Obs</span>` : ""}
                    ${item.anexos && item.anexos.length > 0 ? `<span style="font-size:9px;color:var(--cinza-medio);background:var(--verde-muito-claro);padding:2px 8px;border-radius:4px;">📎 ${item.anexos.length} anexo(s)</span>` : ""}
                    ${item.prazo ? `<span style="font-size:9px;color:var(--aviso);background:#fef3c7;padding:2px 8px;border-radius:4px;">📅 Prazo: ${new Date(item.prazo).toLocaleDateString("pt-BR")}</span>` : ""}
                </div>
            </div>
        `;
    })
    .join("");
}

// ============================================
// VER DETALHES DA ABORDAGEM (MODAL)
// ============================================

export async function verAbordagem(id, tipo, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    const tabela =
      tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data: abordagem, error } = await client
      .from(tabela)
      .select("*, usuarios(nome_completo)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!abordagem) {
      appInstance.showToast("Abordagem não encontrada", "error");
      return;
    }

    const isVeiculo = tipo === "veiculo";
    const data = formatarDataHoraLocal(abordagem.criado_em);
    const guardaNome = abordagem.usuarios?.nome_completo || "Desconhecido";
    const fase = abordagem.fase || "advertencia";
    const faseLabel = fase === "multa" ? "💰 Multa" : "⚠️ Advertência";

    // Montar HTML do modal
    let html = `
            <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
                    <div class="title" style="font-size:16px;font-weight:700;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">
                        <i class="fas ${isVeiculo ? "fa-motorcycle" : "fa-user"}" style="margin-right:8px;"></i>
                        Detalhes da Abordagem
                    </div>
                    <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
                        style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:70vh;overflow-y:auto;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                        <div>
                            <h3 style="margin:0;font-size:15px;color:var(--cinza-escuro);">
                                ${isVeiculo ? "🚗 Veículo" : "👤 Pessoa"}
                                <span style="font-size:13px;font-weight:400;color:var(--cinza-medio);margin-left:6px;">
                                    ${isVeiculo ? abordagem.placa : abordagem.nome}
                                </span>
                            </h3>
                            <p style="margin:2px 0 0 0;font-size:11px;color:var(--cinza-medio);">
                                <i class="fas fa-calendar-alt" style="margin-right:4px;"></i>${data}
                            </p>
                        </div>
                        <span style="font-size:12px;font-weight:600;color:${fase === "multa" ? "var(--erro)" : "var(--aviso)"};">
                            ${faseLabel}
                        </span>
                    </div>

                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:10px;margin-bottom:10px;">
                        <p style="font-size:12px;font-weight:600;color:var(--cinza-escuro);margin:0 0 6px 0;">
                            <i class="fas fa-user-shield" style="margin-right:4px;"></i>
                            Guarda Responsável
                        </p>
                        <p style="font-size:13px;margin:0;color:var(--cinza-escuro);">${guardaNome}</p>
                    </div>
        `;

    // Dados específicos
    if (isVeiculo) {
      html += `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Placa</p>
                        <p style="font-size:14px;font-weight:700;color:var(--azul-bandeira);margin:0;">${abordagem.placa || "N/A"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Marca/Modelo</p>
                        <p style="font-size:13px;margin:0;">${abordagem.marca_modelo || "Não informado"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Cor</p>
                        <p style="font-size:13px;margin:0;">${abordagem.cor || "Não informado"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Condutor</p>
                        <p style="font-size:13px;margin:0;">${abordagem.condutor_nome || "Não informado"}</p>
                    </div>
                </div>
            `;
    } else {
      html += `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Nome</p>
                        <p style="font-size:14px;font-weight:700;color:var(--verde-bandeira);margin:0;">${abordagem.nome || "N/A"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Alcunha</p>
                        <p style="font-size:13px;margin:0;">${abordagem.alcunha || "Nenhuma"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">CPF</p>
                        <p style="font-size:13px;margin:0;">${abordagem.cpf || "Não informado"}</p>
                    </div>
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">RG</p>
                        <p style="font-size:13px;margin:0;">${abordagem.rg || "Não informado"}</p>
                    </div>
                </div>
                ${
                  abordagem.caracteristicas_fisicas
                    ? `
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Características Físicas</p>
                        <p style="font-size:13px;margin:0;">${abordagem.caracteristicas_fisicas}</p>
                    </div>
                `
                    : ""
                }
                ${
                  abordagem.vestimentas
                    ? `
                    <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                        <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Vestimentas</p>
                        <p style="font-size:13px;margin:0;">${abordagem.vestimentas}</p>
                    </div>
                `
                    : ""
                }
            `;
    }

    // Campos comuns
    html += `
            <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Local da Abordagem</p>
                <p style="font-size:13px;margin:0;">${abordagem.local_abordagem || "Não informado"}</p>
                ${
                  abordagem.latitude && abordagem.longitude
                    ? `
                    <p style="font-size:11px;color:var(--cinza-medio);margin:2px 0 0 0;">
                        📍 ${parseFloat(abordagem.latitude).toFixed(6)}, ${parseFloat(abordagem.longitude).toFixed(6)}
                    </p>
                `
                    : ""
                }
            </div>

            <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Motivo</p>
                <p style="font-size:13px;margin:0;">${abordagem.motivo || "Não informado"}</p>
            </div>

            ${
              abordagem.observacoes
                ? `
                <div style="background:var(--azul-muito-claro);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                    <p style="font-size:10px;color:var(--cinza-medio);margin:0 0 2px 0;font-weight:600;">Observações</p>
                    <p style="font-size:13px;margin:0;white-space:pre-wrap;">${abordagem.observacoes}</p>
                </div>
            `
                : ""
            }

            ${
              abordagem.prazo
                ? `
                <div style="background:#fef3c7;border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                    <p style="font-size:10px;color:#92400e;margin:0 0 2px 0;font-weight:600;">📅 Prazo para Regularização</p>
                    <p style="font-size:13px;margin:0;color:#92400e;">
                        ${new Date(abordagem.prazo).toLocaleDateString("pt-BR")}
                        ${new Date(abordagem.prazo) < new Date() ? " (Vencido)" : ""}
                    </p>
                </div>
            `
                : ""
            }

            ${
              abordagem.anexos && abordagem.anexos.length > 0
                ? `
                <div style="background:var(--verde-muito-claro);border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                    <p style="font-size:10px;color:var(--verde-escuro);margin:0 0 4px 0;font-weight:600;">📎 Anexos (${abordagem.anexos.length})</p>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${abordagem.anexos
                          .map(
                            (a, i) => `
                            <a href="${a.url}" target="_blank" style="font-size:11px;color:var(--azul-bandeira);padding:2px 8px;background:white;border-radius:4px;text-decoration:none;border:1px solid var(--cinza-claro);">
                                ${a.nome || `Anexo ${i + 1}`}
                            </a>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            `
                : ""
            }

            ${
              abordagem.reincidencia_count > 0
                ? `
                <div style="background:#fee2e2;border-radius:var(--border-radius);padding:8px;margin-bottom:10px;">
                    <p style="font-size:12px;margin:0;color:#991b1b;">
                        <i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>
                        ⚠️ Reincidente - ${abordagem.reincidencia_count} abordagem(ns) anterior(es)
                    </p>
                </div>
            `
                : ""
            }
        `;

    html += `
                </div>
                <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
                    <button type="button" onclick="window._consultaConverterBO('${tipo}', '${btoa(JSON.stringify(abordagem))}')" class="btn-primary" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;">
                        <i class="fas fa-file-export" style="margin-right:6px;"></i> Converter em BO
                    </button>
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
                        style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
                        Fechar
                    </button>
                </div>
            </div>
        `;

    // Criar overlay e exibir modal
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
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  } catch (error) {
    console.error("Erro ao carregar detalhes da abordagem:", error);
    appInstance.showToast("Erro ao carregar detalhes", "error");
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
  verAbordagem,
  carregarStats,
  carregarOcorrencias,
  carregarAbordagens,
  carregarBriefings,
  refreshDashboard,
};
