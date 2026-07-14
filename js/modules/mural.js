/**
 * MÓDULO MURAL - Mural de Avisos
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de avisos com filtros
 * - Criação de novos avisos (supervisor)
 * - Edição e exclusão de avisos (supervisor)
 * - Comentários em avisos
 * - Reações (like, olhos, alerta, ok, duvida)
 * - Carrossel de imagens
 * - Badge de não lidos
 * - Notificações de novos avisos
 *
 * MELHORIAS APLICADAS:
 * - Pull-to-refresh (recarregar puxando para baixo)
 * - Lazy loading de imagens (carregar apenas visíveis)
 * - Cache de avisos para carregamento mais rápido
 * - Otimização de renderização
 * - Indicador de carregamento
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient)

// ============================================
// CONSTANTES
// ============================================

const REACOES_EMOJIS = {
  like: "👍",
  olhos: "👀",
  alerta: "🚨",
  ok: "✅",
  duvida: "❓",
};

const TIPOS_AVISO = {
  noticia: { label: "Notícia", icon: "📢", badge: "noticia" },
  procurado: { label: "Procurado", icon: "🔍", badge: "procurado" },
  desaparecido: { label: "Desaparecido", icon: "🆘", badge: "desaparecido" },
  ordem_servico: {
    label: "Ordem de Serviço",
    icon: "📋",
    badge: "ordem_servico",
  },
};

const CACHE_KEY_MURAL = "mural_avisos_cache";
const CACHE_EXPIRY = 60000; // 1 minuto
const PULL_REFRESH_THRESHOLD = 80;
const LAZY_LOAD_THRESHOLD = 200;

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtros: {
    busca: "",
    tipo: "todos",
    dataInicio: "",
    dataFim: "",
  },
  carrosselData: null,
  avisosCache: [],
  isRefreshing: false,
  touchStartY: 0,
  touchCurrentY: 0,
  isPulling: false,
  pullProgress: 0,
  isLoadingMore: false,
  hasMoreItems: true,
  page: 0,
  pageSize: 10,
  lazyLoadObserver: null,
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página do mural de avisos
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderMural(container, appInstance) {
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();

  // Marcar como lido ao entrar
  await marcarMuralComoLido();

  // Tentar carregar do cache
  const cachedAvisos = getCachedData(CACHE_KEY_MURAL);
  if (cachedAvisos) {
    estado.avisosCache = cachedAvisos;
    console.log("📦 Avisos carregados do cache");
  }

  let html = `
    <div class="container" style="padding-bottom:100px;" id="muralContainer">
      ${
        isSupervisor
          ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-bullhorn" style="margin-right:8px;"></i>
            Mural de Avisos
          </h2>
          <div style="display:flex;gap:8px;">
            <button id="btnNovoAvisoMural" class="btn-primary" style="padding:8px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;font-weight:700;box-shadow:0 2px 12px rgba(0,63,135,0.25);">
              <i class="fas fa-plus"></i> Novo Aviso
            </button>
          </div>
        </div>
      `
          : `
        <h2 style="color:var(--azul-bandeira);margin-bottom:16px;font-size:18px;">
          <i class="fas fa-bullhorn" style="margin-right:8px;"></i>
          Mural de Avisos
        </h2>
      `
      }

      <!-- Filtros -->
      <div class="filtros-container" style="margin-bottom:12px;border-radius:16px;padding:12px;">
        <div class="filtros-row">
          <div class="filtro-group" style="flex:2;">
            <label><i class="fas fa-search"></i> Buscar</label>
            <input type="text" id="muralBusca" placeholder="Buscar por título ou conteúdo..." 
              value="${estado.filtros.busca || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);min-height:44px;"
              onkeydown="if(event.key==='Enter') window._muralAplicarFiltros()">
          </div>
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-tag"></i> Categoria</label>
            <select id="muralFiltroTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);min-height:44px;">
              <option value="todos" ${estado.filtros.tipo === "todos" ? "selected" : ""}>Todos</option>
              <option value="noticia" ${estado.filtros.tipo === "noticia" ? "selected" : ""}>📢 Notícias</option>
              <option value="procurado" ${estado.filtros.tipo === "procurado" ? "selected" : ""}>🔍 Procurados</option>
              <option value="desaparecido" ${estado.filtros.tipo === "desaparecido" ? "selected" : ""}>🆘 Desaparecidos</option>
              <option value="ordem_servico" ${estado.filtros.tipo === "ordem_servico" ? "selected" : ""}>📋 O.S.</option>
            </select>
          </div>
        </div>
        <div class="filtros-row" style="margin-top:6px;">
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Início</label>
            <input type="date" id="muralDataInicio" value="${estado.filtros.dataInicio || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);min-height:44px;">
          </div>
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
            <input type="date" id="muralDataFim" value="${estado.filtros.dataFim || ""}" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco-fumaca);min-height:44px;">
          </div>
          <div class="filtros-actions">
            <button onclick="window._muralAplicarFiltros()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-search"></i>
            </button>
            <button onclick="window._muralLimparFiltros()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:12px;">
              <i class="fas fa-undo"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Lista de avisos -->
      <div id="muralListaArea">
        ${
          estado.avisosCache.length > 0
            ? renderAvisos(estado.avisosCache, isSupervisor, appInstance)
            : `
          <div style="text-align:center;padding:20px;">
            <div class="spinner-azul" style="margin:0 auto;"></div>
            <p style="margin-top:8px;color:var(--cinza-medio);">Carregando avisos...</p>
          </div>
        `
        }
      </div>

      <!-- Loader de mais itens -->
      <div id="muralLoaderMore" style="display:none;text-align:center;padding:20px;">
        <div class="spinner-azul" style="margin:0 auto;width:24px;height:24px;border-width:2px;"></div>
        <p style="margin-top:8px;color:var(--cinza-medio);font-size:12px;">Carregando mais...</p>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar funções no escopo global
  window._muralAplicarFiltros = () =>
    aplicarFiltrosMural(container, appInstance);
  window._muralLimparFiltros = () => limparFiltrosMural(container, appInstance);
  window._muralNovoAviso = () => abrirFormularioMural(container, appInstance);
  window._muralEditar = (id) => editarAvisoMural(id, container, appInstance);
  window._muralDeletar = (id) => deletarAvisoMural(id, container, appInstance);
  window._muralExpandir = (id) => expandirConteudoMural(id);
  window._muralReagir = (id, tipo) =>
    toggleReacao(id, tipo, container, appInstance);
  window._muralComentar = (id) =>
    adicionarComentario(id, container, appInstance);
  window._muralVerComentarios = (id) => verTodosComentarios(id, appInstance);
  window._muralAbrirCarrossel = (id) => abrirCarrossel(id, appInstance);
  window._muralRecarregar = () => carregarAvisosMural(container, appInstance);

  // Evento do botão novo aviso
  const btnNovo = document.getElementById("btnNovoAvisoMural");
  if (btnNovo) {
    btnNovo.addEventListener("click", () =>
      abrirFormularioMural(container, appInstance),
    );
  }

  // Carregar avisos (se não houver cache ou se o cache estiver vazio)
  if (estado.avisosCache.length === 0) {
    await carregarAvisosMural(container, appInstance);
  } else {
    // Configurar lazy loading para imagens existentes
    setTimeout(() => configurarLazyLoading(container), 100);
    // Atualizar em background
    carregarAvisosMural(container, appInstance);
  }

  // Configurar pull-to-refresh
  configurarPullToRefresh(container, appInstance);

  // Configurar lazy loading
  configurarLazyLoading(container);

  // Atualizar badge
  await atualizarBadgeMural();

  // Configurar scroll infinito
  configurarScrollInfinito(container, appInstance);
}

// ============================================
// PULL-TO-REFRESH
// ============================================

function configurarPullToRefresh(container, appInstance) {
  const muralContainer = document.getElementById("muralContainer");
  if (!muralContainer) return;

  muralContainer.removeEventListener("touchstart", handleTouchStart);
  muralContainer.removeEventListener("touchmove", handleTouchMove);
  muralContainer.removeEventListener("touchend", handleTouchEnd);

  muralContainer.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });
  muralContainer.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  muralContainer.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });

  muralContainer._pullRefreshApp = appInstance;
  muralContainer._pullRefreshContainer = container;
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
  const muralContainer = container._pullRefreshContainer;

  if (estado.pullProgress >= 1) {
    mostrarIndicadorPullRefresh(container, 1, true);
    refreshMural(muralContainer, appInstance);
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
      <span>Atualizando mural...</span>
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

async function refreshMural(container, appInstance) {
  if (estado.isRefreshing) return;

  estado.isRefreshing = true;

  try {
    // Limpar cache
    localStorage.removeItem(CACHE_KEY_MURAL);
    estado.avisosCache = [];
    estado.page = 0;
    estado.hasMoreItems = true;

    await carregarAvisosMural(container, appInstance);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Mural atualizado!", "success");
    }
  } catch (error) {
    console.error("Erro ao atualizar mural:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao atualizar mural", "error");
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
// SCROLL INFINITO
// ============================================

function configurarScrollInfinito(container, appInstance) {
  const listaArea = document.getElementById("muralListaArea");
  if (!listaArea) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const target = entries[0];
      if (
        target.isIntersecting &&
        !estado.isLoadingMore &&
        estado.hasMoreItems
      ) {
        carregarMaisAvisos(container, appInstance);
      }
    },
    {
      rootMargin: "100px",
      threshold: 0.1,
    },
  );

  // Observar o loader de mais itens
  const loaderMore = document.getElementById("muralLoaderMore");
  if (loaderMore) {
    observer.observe(loaderMore);
  }

  // Guardar referência para limpeza
  estado.scrollObserver = observer;
}

async function carregarMaisAvisos(container, appInstance) {
  if (estado.isLoadingMore || !estado.hasMoreItems) return;

  estado.isLoadingMore = true;
  estado.page++;

  const loaderMore = document.getElementById("muralLoaderMore");
  if (loaderMore) loaderMore.style.display = "block";

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    let query = client.from("mural_avisos").select("*");

    if (estado.filtros.tipo !== "todos") {
      query = query.eq("tipo", estado.filtros.tipo);
    }

    if (estado.filtros.busca && estado.filtros.busca.trim() !== "") {
      const termo = `%${estado.filtros.busca.trim()}%`;
      query = query.or(`titulo.ilike.${termo},conteudo.ilike.${termo}`);
    }

    if (estado.filtros.dataInicio) {
      query = query.gte("criado_em", estado.filtros.dataInicio);
    }

    if (estado.filtros.dataFim) {
      query = query.lte("criado_em", estado.filtros.dataFim + "T23:59:59");
    }

    query = query
      .order("prioridade", { ascending: false })
      .order("criado_em", { ascending: false })
      .range(
        estado.page * estado.pageSize,
        (estado.page + 1) * estado.pageSize - 1,
      );

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      estado.hasMoreItems = false;
      if (loaderMore) {
        loaderMore.innerHTML = `
          <p style="color:var(--cinza-medio);font-size:12px;padding:8px;">
            <i class="fas fa-check-circle" style="color:var(--verde-bandeira);"></i>
            Você chegou ao fim
          </p>
        `;
      }
      return;
    }

    // Buscar comentários e reações
    const avisosComDados = await Promise.all(
      data.map(async (aviso) => {
        const { data: comentarios } = await client
          .from("mural_comentarios")
          .select("*, usuarios(nome_completo)")
          .eq("aviso_id", aviso.id)
          .order("criado_em", { ascending: true });

        const { data: reacoes } = await client
          .from("mural_reações")
          .select("*")
          .eq("aviso_id", aviso.id);

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        const reacaoUsuario = reacoes?.find((r) => r.usuario_id === user?.id);

        return {
          ...aviso,
          comentarios: comentarios || [],
          reacoes: reacoes || [],
          reacao_usuario: reacaoUsuario,
          total_reacoes: reacoes?.length || 0,
          anexos: aviso.anexos || [],
        };
      }),
    );

    // Adicionar ao cache
    estado.avisosCache = [...estado.avisosCache, ...avisosComDados];
    setCachedData(CACHE_KEY_MURAL, estado.avisosCache);

    // Renderizar novos avisos
    const isSupervisor =
      typeof authManager !== "undefined" && authManager.isSupervisor();
    const novosAvisosHTML = avisosComDados
      .map((aviso) => renderAvisoItem(aviso, isSupervisor, appInstance))
      .join("");

    const listaArea = document.getElementById("muralListaArea");
    if (listaArea) {
      listaArea.insertAdjacentHTML("beforeend", novosAvisosHTML);
    }

    if (loaderMore) loaderMore.style.display = "none";

    // Configurar lazy loading para novas imagens
    setTimeout(() => configurarLazyLoading(container), 200);
  } catch (error) {
    console.error("Erro ao carregar mais avisos:", error);
    if (loaderMore) loaderMore.style.display = "none";
  } finally {
    estado.isLoadingMore = false;
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
// LAZY LOADING DE IMAGENS
// ============================================

function configurarLazyLoading(container) {
  // Remover observer antigo
  if (estado.lazyLoadObserver) {
    estado.lazyLoadObserver.disconnect();
  }

  const images = container.querySelectorAll("img[data-src]");
  if (images.length === 0) return;

  const imageObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.getAttribute("data-src");
          if (src) {
            img.src = src;
            img.removeAttribute("data-src");
            img.style.opacity = "0";
            img.style.transition = "opacity 0.3s ease";
            setTimeout(() => {
              img.style.opacity = "1";
            }, 50);
          }
          observer.unobserve(img);
        }
      });
    },
    {
      rootMargin: "50px",
      threshold: 0.01,
    },
  );

  images.forEach((img) => imageObserver.observe(img));
  estado.lazyLoadObserver = imageObserver;

  // Também observar imagens que podem ser adicionadas depois
  const observer = new MutationObserver(() => {
    const newImages = container.querySelectorAll("img[data-src]");
    newImages.forEach((img) => {
      if (!estado.lazyLoadObserver?.observing?.(img)) {
        estado.lazyLoadObserver?.observe(img);
      }
    });
  });

  observer.observe(container, { childList: true, subtree: true });
}

// ============================================
// CARREGAR AVISOS
// ============================================

export async function carregarAvisosMural(container, appInstance) {
  const area = document.getElementById("muralListaArea");
  if (!area) return;

  // Mostrar loader se não houver dados em cache
  if (estado.avisosCache.length === 0) {
    area.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:8px;color:var(--cinza-medio);">Carregando avisos...</p>
      </div>
    `;
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      area.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao conectar ao servidor</p>`;
      return;
    }

    let query = client.from("mural_avisos").select("*");

    if (estado.filtros.tipo !== "todos") {
      query = query.eq("tipo", estado.filtros.tipo);
    }

    if (estado.filtros.busca && estado.filtros.busca.trim() !== "") {
      const termo = `%${estado.filtros.busca.trim()}%`;
      query = query.or(`titulo.ilike.${termo},conteudo.ilike.${termo}`);
    }

    if (estado.filtros.dataInicio) {
      query = query.gte("criado_em", estado.filtros.dataInicio);
    }

    if (estado.filtros.dataFim) {
      query = query.lte("criado_em", estado.filtros.dataFim + "T23:59:59");
    }

    query = query
      .order("prioridade", { ascending: false })
      .order("criado_em", { ascending: false });

    // Limitar para primeira página
    query = query.range(0, estado.pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;

    estado.avisosCache = data || [];
    estado.page = 0;
    estado.hasMoreItems = true;

    // Salvar no cache
    setCachedData(CACHE_KEY_MURAL, estado.avisosCache);

    if (data.length === 0) {
      area.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--cinza-medio);">
          <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:12px;color:var(--cinza-claro);"></i>
          <p>Nenhum aviso encontrado</p>
          ${
            estado.filtros.busca ||
            estado.filtros.tipo !== "todos" ||
            estado.filtros.dataInicio ||
            estado.filtros.dataFim
              ? '<button onclick="window._muralLimparFiltros()" class="btn-secondary" style="margin-top:12px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:12px;">Limpar Filtros</button>'
              : typeof authManager !== "undefined" && authManager.isSupervisor()
                ? '<button onclick="window._muralNovoAviso()" class="btn-primary" style="margin-top:16px;padding:8px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;">Criar Primeiro Aviso</button>'
                : ""
          }
        </div>
      `;
      return;
    }

    // Buscar comentários e reações para cada aviso
    const avisosComDados = await Promise.all(
      data.map(async (aviso) => {
        const { data: comentarios } = await client
          .from("mural_comentarios")
          .select("*, usuarios(nome_completo)")
          .eq("aviso_id", aviso.id)
          .order("criado_em", { ascending: true });

        const { data: reacoes } = await client
          .from("mural_reações")
          .select("*")
          .eq("aviso_id", aviso.id);

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        const reacaoUsuario = reacoes?.find((r) => r.usuario_id === user?.id);

        return {
          ...aviso,
          comentarios: comentarios || [],
          reacoes: reacoes || [],
          reacao_usuario: reacaoUsuario,
          total_reacoes: reacoes?.length || 0,
          anexos: aviso.anexos || [],
        };
      }),
    );

    estado.avisosCache = avisosComDados;
    setCachedData(CACHE_KEY_MURAL, avisosComDados);

    // Renderizar avisos
    const isSupervisor =
      typeof authManager !== "undefined" && authManager.isSupervisor();
    area.innerHTML = renderAvisos(avisosComDados, isSupervisor, appInstance);

    // Configurar lazy loading
    setTimeout(() => configurarLazyLoading(container), 200);
  } catch (error) {
    console.error("Erro ao carregar mural:", error);
    area.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao carregar avisos: ${error.message}</p>`;
  }
}

// ============================================
// RENDERIZAÇÃO DE AVISOS
// ============================================

function renderAvisos(avisos, isSupervisor, appInstance) {
  if (!avisos || avisos.length === 0) {
    return `
      <div style="text-align:center;padding:40px;color:var(--cinza-medio);">
        <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:12px;color:var(--cinza-claro);"></i>
        <p>Nenhum aviso encontrado</p>
      </div>
    `;
  }

  // Injetar estilos do carrossel se ainda não existir
  injetarEstilosCarrossel();

  return avisos
    .map((aviso) => renderAvisoItem(aviso, isSupervisor, appInstance))
    .join("");
}

function renderAvisoItem(aviso, isSupervisor, appInstance) {
  const temAnexos = aviso.anexos && aviso.anexos.length > 0;
  const primeiraImagem = temAnexos ? aviso.anexos[0] : null;
  const temMultiplas = temAnexos && aviso.anexos.length > 1;
  const temVideo = temAnexos && aviso.anexos.some((a) => a.tipo === "video");
  const tipoInfo = TIPOS_AVISO[aviso.tipo] || TIPOS_AVISO.noticia;
  const conteudoLongo = aviso.conteudo && aviso.conteudo.length > 150;

  // Lazy loading: usar data-src para imagens
  const imageSrc = primeiraImagem ? primeiraImagem.url : "";

  return `
    <div class="mural-card" id="mural-card-${aviso.id}">
      ${aviso.prioridade ? `<div class="urgent-badge">🚨 Urgente</div>` : ""}
      <div class="card-header">
        <span class="card-badge ${tipoInfo.badge}">
          ${tipoInfo.icon} ${tipoInfo.label}
        </span>
        <span class="card-date">
          <i class="fas fa-clock"></i>
          ${formatarDataHoraLocal(aviso.criado_em)}
        </span>
      </div>

      ${
        temAnexos
          ? `
        <div class="card-image-wrapper" onclick="window._muralAbrirCarrossel('${aviso.id}')" style="cursor:pointer;position:relative;">
          <img data-src="${imageSrc}" alt="${aviso.titulo}" loading="lazy" style="width:100%;height:100%;object-fit:cover;background:var(--cinza-claro);">
          ${temMultiplas ? `<span class="media-count">+${aviso.anexos.length - 1}</span>` : ""}
          ${temVideo ? `<span class="media-play"><i class="fas fa-play"></i></span>` : ""}
        </div>
      `
          : `
        <div class="card-image-placeholder">
          <i class="fas ${tipoInfo.icon === "📢" ? "fa-bullhorn" : tipoInfo.icon === "🔍" ? "fa-search" : tipoInfo.icon === "🆘" ? "fa-life-ring" : "fa-clipboard-list"}" style="font-size:48px;opacity:0.3;"></i>
        </div>
      `
      }

      <div class="card-content-wrapper">
        <h3 class="card-title">${aviso.titulo}</h3>
        <p class="card-content" id="conteudo_${aviso.id}">${aviso.conteudo}</p>
        ${
          conteudoLongo
            ? `
          <button class="btn-ver-mais" onclick="window._muralExpandir('${aviso.id}')">
            <span id="expandBtn_${aviso.id}">Ver mais</span> 
            <i class="fas fa-chevron-down" id="expandIcon_${aviso.id}"></i>
          </button>
        `
            : ""
        }
      </div>

      <!-- Reações -->
      <div class="reacoes">
        ${Object.entries(REACOES_EMOJIS)
          .map(([key, emoji]) => {
            const count = aviso.reacoes.filter((r) => r.tipo === key).length;
            const isUserReacted = aviso.reacao_usuario?.tipo === key;
            return `
            <button onclick="window._muralReagir('${aviso.id}', '${key}')" 
              class="reacao-btn ${isUserReacted ? "ativo" : ""}">
              ${emoji}
              <span class="count">${count}</span>
            </button>
          `;
          })
          .join("")}
      </div>

      <!-- Comentários -->
      <div class="comentarios">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="text" id="comentarioInput_${aviso.id}" 
            placeholder="Escreva um comentário..." 
            style="flex:1;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:12px;background:var(--branco-fumaca);min-height:44px;"
            onkeydown="if(event.key==='Enter') window._muralComentar('${aviso.id}')">
          <button onclick="window._muralComentar('${aviso.id}')" class="btn-primary" style="padding:4px 14px;font-size:12px;min-height:auto;width:auto;border-radius:12px;">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>

        ${aviso.comentarios
          .slice(0, 3)
          .map(
            (c) => `
          <div class="comentario-item">
            <div class="comentario-avatar">${c.usuarios?.nome_completo?.charAt(0)?.toUpperCase() || "U"}</div>
            <div class="comentario-body">
              <div>
                <span class="comentario-nome">${c.usuarios?.nome_completo || "Usuário"}</span>
                <span class="comentario-data">${formatarHora(c.criado_em)}</span>
              </div>
              <div class="comentario-texto">${c.comentario}</div>
            </div>
          </div>
        `,
          )
          .join("")}

        ${
          aviso.comentarios.length > 3
            ? `
          <div style="text-align:center;padding:4px 0;">
            <button onclick="window._muralVerComentarios('${aviso.id}')" 
              class="btn-secondary" style="padding:4px 14px;font-size:11px;min-height:auto;width:auto;border-radius:12px;">
              Ver todos (${aviso.comentarios.length})
            </button>
          </div>
        `
            : ""
        }
      </div>

      <!-- Ações (apenas supervisor) -->
      ${
        isSupervisor
          ? `
        <div style="padding:0 16px 12px 16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="window._muralEditar('${aviso.id}')" 
            class="btn-secondary" style="padding:4px 14px;font-size:11px;min-height:auto;width:auto;border-radius:12px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button onclick="window._muralDeletar('${aviso.id}')" 
            style="padding:4px 14px;font-size:11px;min-height:auto;width:auto;border-radius:12px;background:var(--erro-claro);color:var(--erro);border:none;cursor:pointer;">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltrosMural(container, appInstance) {
  const busca = document.getElementById("muralBusca")?.value || "";
  const tipo = document.getElementById("muralFiltroTipo")?.value || "todos";
  const dataInicio = document.getElementById("muralDataInicio")?.value || "";
  const dataFim = document.getElementById("muralDataFim")?.value || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
    }
    return;
  }

  estado.filtros = { busca, tipo, dataInicio, dataFim };
  estado.page = 0;
  estado.hasMoreItems = true;
  carregarAvisosMural(container, appInstance);
}

export function limparFiltrosMural(container, appInstance) {
  estado.filtros = { busca: "", tipo: "todos", dataInicio: "", dataFim: "" };

  const buscaInput = document.getElementById("muralBusca");
  const tipoSelect = document.getElementById("muralFiltroTipo");
  const dataInicioInput = document.getElementById("muralDataInicio");
  const dataFimInput = document.getElementById("muralDataFim");

  if (buscaInput) buscaInput.value = "";
  if (tipoSelect) tipoSelect.value = "todos";
  if (dataInicioInput) dataInicioInput.value = "";
  if (dataFimInput) dataFimInput.value = "";

  estado.page = 0;
  estado.hasMoreItems = true;
  carregarAvisosMural(container, appInstance);

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Filtros removidos", "info");
  }
}

// ============================================
// EXPANDIR CONTEÚDO
// ============================================

export function expandirConteudoMural(id) {
  const conteudo = document.getElementById(`conteudo_${id}`);
  const btn = document.getElementById(`expandBtn_${id}`);
  const icon = document.getElementById(`expandIcon_${id}`);

  if (!conteudo) return;

  if (conteudo.classList.contains("expanded")) {
    conteudo.classList.remove("expanded");
    btn.textContent = "Ver mais";
    icon.className = "fas fa-chevron-down";
  } else {
    conteudo.classList.add("expanded");
    btn.textContent = "Ver menos";
    icon.className = "fas fa-chevron-up";
  }
}

// ============================================
// REAÇÕES
// ============================================

export async function toggleReacao(avisoId, tipo, container, appInstance) {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não autenticado", "error");
      }
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: reacoesExistentes, error: checkError } = await client
      .from("mural_reações")
      .select("*")
      .eq("aviso_id", avisoId)
      .eq("usuario_id", user.id);

    if (checkError) {
      console.error("Erro ao verificar reações:", checkError);
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao processar reação", "error");
      }
      return;
    }

    const reacaoExistente = reacoesExistentes?.find((r) => r.tipo === tipo);

    if (reacaoExistente) {
      const { error } = await client
        .from("mural_reações")
        .delete()
        .eq("id", reacaoExistente.id);

      if (error) throw error;
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Reação removida", "info");
      }
    } else {
      if (reacoesExistentes && reacoesExistentes.length > 0) {
        const idsParaRemover = reacoesExistentes.map((r) => r.id);
        const { error: deleteError } = await client
          .from("mural_reações")
          .delete()
          .in("id", idsParaRemover);

        if (deleteError) throw deleteError;
      }

      const { error: insertError } = await client.from("mural_reações").insert({
        aviso_id: avisoId,
        usuario_id: user.id,
        tipo: tipo,
        criado_em: new Date().toISOString(),
      });

      if (insertError) throw insertError;
      if (appInstance && appInstance.showToast) {
        appInstance.showToast(
          `Reação ${REACOES_EMOJIS[tipo] || ""} adicionada!`,
          "success",
        );
      }
    }

    await carregarAvisosMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao alternar reação:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao processar reação", "error");
    }
  }
}

// ============================================
// COMENTÁRIOS
// ============================================

export async function adicionarComentario(avisoId, container, appInstance) {
  const input = document.getElementById(`comentarioInput_${avisoId}`);
  if (!input) return;

  const comentario = input.value.trim();
  if (!comentario) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Digite um comentário", "warning");
    }
    return;
  }

  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não autenticado", "error");
      }
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data, error } = await client
      .from("mural_comentarios")
      .insert({
        aviso_id: avisoId,
        usuario_id: user.id,
        comentario: comentario,
        criado_em: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error("Erro ao adicionar comentário:", error);
      if (appInstance && appInstance.showToast) {
        appInstance.showToast(
          "Erro ao adicionar comentário: " + error.message,
          "error",
        );
      }
      return;
    }

    input.value = "";
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Comentário adicionado!", "success");
    }

    await carregarAvisosMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao adicionar comentário:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao adicionar comentário", "error");
    }
  }
}

export async function verTodosComentarios(avisoId, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: comentarios, error } = await client
      .from("mural_comentarios")
      .select("*, usuarios(nome_completo)")
      .eq("aviso_id", avisoId)
      .order("criado_em", { ascending: true });

    if (error) throw error;

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

    overlay.innerHTML = `
      <div class="modal" style="max-width:500px;width:100%;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-comments" style="margin-right:8px;"></i>
            Todos os Comentários
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:60vh;overflow-y:auto;">
          ${
            comentarios.length === 0
              ? `
            <p style="text-align:center;color:var(--cinza-medio);padding:20px;">Nenhum comentário ainda</p>
          `
              : `
            ${comentarios
              .map(
                (c) => `
              <div style="padding:8px 0;border-bottom:1px solid var(--cinza-claro);">
                <div style="display:flex;justify-content:space-between;">
                  <strong style="color:var(--azul-bandeira);font-size:13px;">${c.usuarios?.nome_completo || "Usuário"}</strong>
                  <span style="color:var(--cinza-medio);font-size:10px;">${formatarDataHoraLocal(c.criado_em)}</span>
                </div>
                <div style="font-size:13px;margin-top:4px;">${c.comentario}</div>
              </div>
            `,
              )
              .join("")}
          `
          }
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } catch (error) {
    console.error("Erro ao carregar comentários:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar comentários", "error");
    }
  }
}

// ============================================
// FORMULÁRIO DE NOVO AVISO
// ============================================

export function abrirFormularioMural(container, appInstance) {
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  if (!isSupervisor) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Apenas supervisores podem criar avisos",
        "warning",
      );
    }
    return;
  }

  window._muralArquivosTemp = [];

  container.innerHTML = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-plus-circle" style="margin-right:8px;"></i>
          Novo Aviso no Mural
        </h2>
        <button onclick="window._muralVoltar()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <div style="background:var(--branco);padding:16px;border-radius:20px;box-shadow:var(--sombra-media);">
        <form id="formNovoAviso" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Título do Aviso <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="muralTitulo" placeholder="Ex: Atenção: Veículo Suspeito" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:44px;">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Tipo de Aviso <span class="required" style="color:var(--erro);">*</span>
            </label>
            <select id="muralTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:44px;">
              <option value="noticia">📢 Notícia</option>
              <option value="procurado">🔍 Procurado</option>
              <option value="desaparecido">🆘 Desaparecido</option>
              <option value="ordem_servico">📋 Ordem de Serviço</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Conteúdo/Descrição <span class="required" style="color:var(--erro);">*</span>
            </label>
            <textarea id="muralConteudo" rows="4" placeholder="Descreva os detalhes do aviso..." 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:100px;resize:vertical;"></textarea>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              <i class="fas fa-camera"></i> Fotos (máx 3)
            </label>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <input type="file" id="muralArquivo" accept="image/*" multiple style="display:none;" 
                onchange="window._muralPreviewImagens(this)">
              <button type="button" onclick="document.getElementById('muralArquivo').click()" 
                class="btn-secondary" style="width:100%;font-size:12px;padding:8px;border-radius:12px;min-height:44px;">
                <i class="fas fa-camera"></i> Selecionar Fotos (máx 3)
              </button>
              <div id="muralPreviewArea" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
              <div class="input-hint">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Máximo 3 imagens. Cada imagem será comprimida para até 1MB.
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="muralPrioridade" style="width:18px;height:18px;accent-color:var(--erro);">
            <label style="font-size:12px;font-weight:700;color:var(--erro);">🚨 Aviso Prioritário (Urgente)</label>
          </div>

          <div style="display:flex;gap:8px;margin-top:20px;">
            <button type="button" onclick="window._muralSalvar()" class="btn-primary" style="flex:2;border-radius:12px;min-height:48px;">
              <i class="fas fa-paper-plane"></i> Publicar no Mural
            </button>
            <button type="button" onclick="window._muralVoltar()" class="btn-secondary" style="flex:1;border-radius:12px;min-height:48px;">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  window._muralVoltar = () => renderMural(container, appInstance);
  window._muralSalvar = () => salvarAvisoMural(container, appInstance);
  window._muralPreviewImagens = (input) => previewMultiplasImagensMural(input);
  window._muralRemoverImagem = (btn) => removerImagemMuralPreview(btn);

  window._muralArquivosTemp = [];
}

// ============================================
// PREVIEW DE IMAGENS (MURAL)
// ============================================

export function previewMultiplasImagensMural(input) {
  const area = document.getElementById("muralPreviewArea");
  if (!area) return;

  const files = input.files;
  if (files.length > 3) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Máximo 3 imagens permitidas", "warning");
    } else {
      showToast("Máximo 3 imagens permitidas", "warning");
    }
    input.value = "";
    return;
  }

  area.innerHTML = "";
  const imagensData = [];

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      if (typeof window.app !== "undefined" && window.app.showToast) {
        window.app.showToast(`Arquivo ${file.name} excede 10MB`, "warning");
      } else {
        showToast(`Arquivo ${file.name} excede 10MB`, "warning");
      }
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.style.cssText =
        "position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--cinza-claro);";
      div.innerHTML = `
        <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">
        <button type="button" onclick="window._muralRemoverImagem(this)" 
          style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.8);color:white;border:none;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
          <i class="fas fa-times"></i>
        </button>
      `;
      area.appendChild(div);
      imagensData.push(file);
    };
    reader.readAsDataURL(file);
  }

  window._muralArquivosTemp = imagensData;
}

export function removerImagemMuralPreview(btn) {
  const div = btn.closest("div");
  div.remove();

  const files = window._muralArquivosTemp || [];
  const img = div.querySelector("img");
  if (img) {
    const index = files.findIndex(
      (f) => f.name === img.alt || f.name === img.src.split("/").pop(),
    );
    if (index > -1) {
      files.splice(index, 1);
      window._muralArquivosTemp = files;
    }
  }
}

// ============================================
// SALVAR AVISO
// ============================================

export async function salvarAvisoMural(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;
  if (!user) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Usuário não autenticado", "error");
    }
    return;
  }

  const titulo = document.getElementById("muralTitulo")?.value?.trim();
  const conteudo = document.getElementById("muralConteudo")?.value?.trim();
  const prioridade =
    document.getElementById("muralPrioridade")?.checked || false;
  const tipo = document.getElementById("muralTipo")?.value || "noticia";

  if (!titulo || !conteudo) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Título e conteúdo são obrigatórios", "warning");
    }
    return;
  }

  const files = window._muralArquivosTemp || [];
  if (files.length > 3) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Máximo 3 imagens permitidas", "warning");
    }
    return;
  }

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Processando...", "info");
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    let anexosUrls = [];
    if (files.length > 0) {
      const anexosProcessados = await processarAnexosMural(files);
      anexosUrls = await uploadAnexosMural(anexosProcessados);
    }

    const dados = {
      titulo,
      tipo,
      conteudo,
      prioridade,
      criado_por: user.id,
      criado_em: new Date().toISOString(),
      anexos: anexosUrls,
    };

    const { data: aviso, error } = await client
      .from("mural_avisos")
      .insert([dados])
      .select()
      .single();

    if (error) throw error;

    window._muralArquivosTemp = [];
    const previewArea = document.getElementById("muralPreviewArea");
    if (previewArea) previewArea.innerHTML = "";
    const fileInput = document.getElementById("muralArquivo");
    if (fileInput) fileInput.value = "";

    await notificarNovoAviso(aviso);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Aviso publicado com sucesso!", "success");
    }

    await renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao salvar aviso:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao publicar: " + error.message, "error");
    }
  }
}

// ============================================
// ANEXOS - PROCESSAMENTO E UPLOAD
// ============================================

async function processarAnexosMural(files) {
  const maxFiles = 3;
  const maxSize = 1 * 1024 * 1024;
  const anexos = [];
  const filesToProcess = Array.from(files).slice(0, maxFiles);

  for (const file of filesToProcess) {
    try {
      let fileProcessado = await comprimirImagem(file, 800, 0.8);

      if (fileProcessado.size > maxSize) {
        fileProcessado = await comprimirImagem(file, 600, 0.6);
        if (fileProcessado.size > maxSize) {
          if (typeof window.app !== "undefined" && window.app.showToast) {
            window.app.showToast(`Arquivo ${file.name} excede 1MB`, "warning");
          } else {
            showToast(`Arquivo ${file.name} excede 1MB`, "warning");
          }
          continue;
        }
      }

      anexos.push({
        nome: file.name,
        tipo: "image",
        tamanho: fileProcessado.size,
        arquivo: fileProcessado,
        url: null,
      });
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
    }
  }

  return anexos;
}

async function uploadAnexosMural(anexos) {
  if (!anexos || anexos.length === 0) return [];

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) return [];

  const timestamp = Date.now();
  const resultados = [];

  for (const anexo of anexos) {
    try {
      const fileExt = anexo.arquivo.name.split(".").pop();
      const fileName = `mural/${timestamp}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, anexo.arquivo);

      if (uploadError) throw uploadError;

      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);

      resultados.push({
        url: urlData.publicUrl,
        nome: anexo.nome,
        tipo: anexo.tipo,
        tamanho: anexo.tamanho,
      });
    } catch (error) {
      console.error("Erro no upload do anexo:", error);
    }
  }

  return resultados;
}

// ============================================
// NOTIFICAR NOVO AVISO
// ============================================

async function notificarNovoAviso(aviso) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: usuarios, error } = await client
      .from("usuarios")
      .select("id")
      .eq("status", "ativo")
      .neq("id", aviso.criado_por);

    if (error) throw error;
    if (usuarios.length === 0) return;

    const notificacoes = usuarios.map((u) => ({
      usuario_id: u.id,
      titulo: `📢 Novo aviso: ${aviso.titulo}`,
      mensagem: `Um novo aviso "${aviso.titulo}" foi publicado no mural.`,
      tipo: "sistema",
      link: "#mural",
      criado_em: new Date().toISOString(),
    }));

    const batchSize = 50;
    for (let i = 0; i < notificacoes.length; i += batchSize) {
      const batch = notificacoes.slice(i, i + batchSize);
      const { error: insertError } = await client
        .from("notificacoes")
        .insert(batch);
      if (insertError) {
        console.warn("Erro ao inserir notificações em lote:", insertError);
      }
    }

    console.log(
      `✅ ${notificacoes.length} notificações enviadas para o novo aviso`,
    );
  } catch (error) {
    console.error("Erro ao enviar notificações:", error);
  }
}

// ============================================
// EDITAR AVISO
// ============================================

export async function editarAvisoMural(id, container, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: aviso, error } = await client
      .from("mural_avisos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    container.innerHTML = `
      <div class="container" style="padding-bottom:100px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-edit" style="margin-right:8px;"></i>
            Editar Aviso
          </h2>
          <button onclick="window._muralVoltar()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-arrow-left"></i> Voltar
          </button>
        </div>

        <div style="background:var(--branco);padding:16px;border-radius:20px;box-shadow:var(--sombra-media);">
          <form id="formEditarAviso" onsubmit="event.preventDefault();">
            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Título do Aviso <span class="required" style="color:var(--erro);">*</span>
              </label>
              <input type="text" id="muralTitulo" value="${aviso.titulo}" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:44px;">
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Tipo de Aviso <span class="required" style="color:var(--erro);">*</span>
              </label>
              <select id="muralTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:44px;">
                <option value="noticia" ${aviso.tipo === "noticia" ? "selected" : ""}>📢 Notícia</option>
                <option value="procurado" ${aviso.tipo === "procurado" ? "selected" : ""}>🔍 Procurado</option>
                <option value="desaparecido" ${aviso.tipo === "desaparecido" ? "selected" : ""}>🆘 Desaparecido</option>
                <option value="ordem_servico" ${aviso.tipo === "ordem_servico" ? "selected" : ""}>📋 Ordem de Serviço</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Conteúdo/Descrição <span class="required" style="color:var(--erro);">*</span>
              </label>
              <textarea id="muralConteudo" rows="4" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:100px;resize:vertical;">${aviso.conteudo}</textarea>
            </div>

            <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="muralPrioridade" ${aviso.prioridade ? "checked" : ""} 
                style="width:18px;height:18px;accent-color:var(--erro);">
              <label style="font-size:12px;font-weight:700;color:var(--erro);">🚨 Aviso Prioritário (Urgente)</label>
            </div>

            <div style="display:flex;gap:8px;margin-top:20px;">
              <button type="button" onclick="window._muralSalvarEdicao('${id}')" class="btn-primary" style="flex:2;border-radius:12px;min-height:48px;">
                <i class="fas fa-save"></i> Salvar Alterações
              </button>
              <button type="button" onclick="window._muralVoltar()" class="btn-secondary" style="flex:1;border-radius:12px;min-height:48px;">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    window._muralSalvarEdicao = async (editId) => {
      const titulo = document.getElementById("muralTitulo")?.value?.trim();
      const tipo = document.getElementById("muralTipo")?.value;
      const conteudo = document.getElementById("muralConteudo")?.value?.trim();
      const prioridade =
        document.getElementById("muralPrioridade")?.checked || false;

      if (!titulo || !conteudo) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast(
            "Título e conteúdo são obrigatórios",
            "warning",
          );
        }
        return;
      }

      try {
        const { error } = await client
          .from("mural_avisos")
          .update({
            titulo,
            tipo,
            conteudo,
            prioridade,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", editId);

        if (error) throw error;

        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Aviso atualizado com sucesso!", "success");
        }

        await renderMural(container, appInstance);
      } catch (error) {
        console.error("Erro ao salvar edição:", error);
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Erro ao salvar: " + error.message, "error");
        }
      }
    };

    window._muralVoltar = () => renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao carregar aviso para edição:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar aviso", "error");
    }
  }
}

// ============================================
// DELETAR AVISO
// ============================================

export async function deletarAvisoMural(id, container, appInstance) {
  const confirmado = await confirmarModal(
    "Tem certeza que deseja excluir este aviso?\n\nEsta ação não pode ser desfeita.",
    "Confirmar Exclusão",
  );

  if (!confirmado) return;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { error } = await client.from("mural_avisos").delete().eq("id", id);

    if (error) throw error;

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Aviso excluído com sucesso!", "success");
    }

    await carregarAvisosMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao excluir aviso:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao excluir aviso: " + error.message, "error");
    }
  }
}

// ============================================
// CARROSSEL DE IMAGENS
// ============================================

export async function abrirCarrossel(avisoId, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: aviso, error } = await client
      .from("mural_avisos")
      .select("anexos")
      .eq("id", avisoId)
      .single();

    if (error) throw error;

    const anexos = aviso?.anexos || [];
    if (anexos.length === 0) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Nenhuma imagem disponível", "info");
      }
      return;
    }

    const imagens = anexos.filter((a) => a.tipo === "image");
    if (imagens.length === 0) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Nenhuma imagem disponível", "info");
      }
      return;
    }

    let indexAtual = 0;

    const overlay = document.createElement("div");
    overlay.className = "carrossel-modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    overlay.innerHTML = `
      <button class="carrossel-close" onclick="this.closest('.carrossel-modal-overlay').remove()"
        style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:28px;width:48px;height:48px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease;z-index:10;">
        <i class="fas fa-times"></i>
      </button>
      <div class="carrossel-container" style="position:relative;width:90%;max-width:800px;max-height:90vh;">
        <div class="carrossel-slide" id="carrosselSlide" style="position:relative;width:100%;height:100%;min-height:300px;display:flex;align-items:center;justify-content:center;">
          ${imagens
            .map(
              (item, i) => `
            <div class="carrossel-item ${i === 0 ? "active" : ""}" data-index="${i}" 
              style="display:${i === 0 ? "block" : "none"};width:100%;height:100%;max-height:80vh;text-align:center;">
              <img src="${item.url}" alt="Imagem ${i + 1}" loading="lazy" 
                style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:8px;">
            </div>
          `,
            )
            .join("")}
        </div>

        ${
          imagens.length > 1
            ? `
          <button class="carrossel-nav carrossel-prev" onclick="window._carrosselNavegar(-1)"
            style="position:absolute;top:50%;transform:translateY(-50%);left:10px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:24px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease;z-index:5;">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button class="carrossel-nav carrossel-next" onclick="window._carrosselNavegar(1)"
            style="position:absolute;top:50%;transform:translateY(-50%);right:10px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:24px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease;z-index:5;">
            <i class="fas fa-chevron-right"></i>
          </button>
          <div class="carrossel-dots" style="position:absolute;bottom:-40px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:5;">
            ${imagens
              .map(
                (_, i) => `
              <span class="carrossel-dot ${i === 0 ? "active" : ""}" onclick="window._carrosselIrPara(${i})"
                style="width:10px;height:10px;border-radius:50%;background:${i === 0 ? "white" : "rgba(255,255,255,0.3)"};cursor:pointer;transition:background 0.2s ease;"></span>
            `,
              )
              .join("")}
          </div>
          <div class="carrossel-counter" style="position:absolute;bottom:-40px;right:0;color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;z-index:5;">
            1 / ${imagens.length}
          </div>
        `
            : ""
        }
      </div>
    `;

    document.body.appendChild(overlay);

    estado.carrosselData = {
      total: imagens.length,
      currentIndex: 0,
      overlay: overlay,
      imagens: imagens,
    };

    window._carrosselNavegar = (direcao) => {
      const data = estado.carrosselData;
      if (!data) return;

      const novoIndex = data.currentIndex + direcao;
      if (novoIndex < 0 || novoIndex >= data.total) return;

      data.currentIndex = novoIndex;
      atualizarCarrosselUI();
    };

    window._carrosselIrPara = (index) => {
      const data = estado.carrosselData;
      if (!data || index < 0 || index >= data.total) return;

      data.currentIndex = index;
      atualizarCarrosselUI();
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        estado.carrosselData = null;
      }
    });

    document.addEventListener("keydown", function handler(e) {
      if (e.key === "ArrowLeft") {
        window._carrosselNavegar(-1);
      } else if (e.key === "ArrowRight") {
        window._carrosselNavegar(1);
      } else if (e.key === "Escape") {
        if (estado.carrosselData?.overlay) {
          estado.carrosselData.overlay.remove();
          estado.carrosselData = null;
          document.removeEventListener("keydown", handler);
        }
      }
    });
  } catch (error) {
    console.error("Erro ao abrir carrossel:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar imagens", "error");
    }
  }
}

function atualizarCarrosselUI() {
  const data = estado.carrosselData;
  if (!data) return;

  const slides = data.overlay.querySelectorAll(".carrossel-item");
  slides.forEach((slide, i) => {
    slide.style.display = i === data.currentIndex ? "block" : "none";
    slide.classList.toggle("active", i === data.currentIndex);
  });

  const dots = data.overlay.querySelectorAll(".carrossel-dot");
  dots.forEach((dot, i) => {
    dot.style.background =
      i === data.currentIndex ? "white" : "rgba(255,255,255,0.3)";
  });

  const counter = data.overlay.querySelector(".carrossel-counter");
  if (counter) {
    counter.textContent = `${data.currentIndex + 1} / ${data.total}`;
  }
}

// ============================================
// BADGE DE NÃO LIDOS
// ============================================

export async function atualizarBadgeMural() {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: leitura, error: leituraError } = await client
      .from("mural_leituras")
      .select("ultimo_aviso_lido_id, lido_em")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (leituraError && leituraError.code !== "PGRST116") {
      console.error("Erro ao buscar leitura:", leituraError);
      return;
    }

    const { data: avisos, error: avisosError } = await client
      .from("mural_avisos")
      .select("id, criado_em")
      .order("criado_em", { ascending: false });

    if (avisosError) {
      console.error("Erro ao buscar avisos:", avisosError);
      return;
    }

    if (!avisos || avisos.length === 0) {
      _atualizarBadgeMuralUI(0);
      return;
    }

    if (!leitura) {
      _atualizarBadgeMuralUI(avisos.length);
      return;
    }

    const dataUltimaLeitura = new Date(leitura.lido_em);
    const naoLidos = avisos.filter((a) => {
      const dataAviso = new Date(a.criado_em);
      return dataAviso > dataUltimaLeitura;
    });

    _atualizarBadgeMuralUI(naoLidos.length);
  } catch (error) {
    console.error("Erro ao atualizar badge do mural:", error);
  }
}

function _atualizarBadgeMuralUI(count) {
  const badge = document.getElementById("badge-mural");
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
}

export async function marcarMuralComoLido() {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: ultimoAviso, error } = await client
      .from("mural_avisos")
      .select("id")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar último aviso:", error);
      return;
    }

    await client.from("mural_leituras").upsert(
      {
        usuario_id: user.id,
        ultimo_aviso_lido_id: ultimoAviso?.id || null,
        lido_em: new Date().toISOString(),
      },
      { onConflict: "usuario_id" },
    );

    await atualizarBadgeMural();
  } catch (error) {
    console.error("Erro ao marcar mural como lido:", error);
  }
}

// ============================================
// ESTILOS DO CARROSSEL
// ============================================

function injetarEstilosCarrossel() {
  if (document.getElementById("carrossel-styles")) return;

  const styles = document.createElement("style");
  styles.id = "carrossel-styles";
  styles.textContent = `
    .carrossel-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    }

    .carrossel-close:hover {
      background: rgba(255,255,255,0.3);
    }

    .carrossel-item {
      display: none;
      width: 100%;
      height: 100%;
      max-height: 80vh;
      text-align: center;
    }

    .carrossel-item.active {
      display: block;
      animation: fadeIn 0.3s ease;
    }

    .carrossel-item img {
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 8px;
    }

    .carrossel-item video {
      max-width: 100%;
      max-height: 80vh;
      border-radius: 8px;
    }

    .carrossel-nav:hover {
      background: rgba(255,255,255,0.3);
    }

    .media-count {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 12px;
    }

    .media-play {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 48px;
      height: 48px;
      background: rgba(0,0,0,0.6);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 20px;
    }

    @media (max-width: 480px) {
      .carrossel-nav {
        width: 36px;
        height: 36px;
        font-size: 18px;
      }
      .carrossel-prev {
        left: 4px;
      }
      .carrossel-next {
        right: 4px;
      }
      .carrossel-container {
        width: 95%;
      }
      .carrossel-dots {
        bottom: -32px;
      }
      .carrossel-counter {
        bottom: -32px;
      }
    }
  `;

  document.head.appendChild(styles);
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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

function formatarHora(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function comprimirImagem(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function confirmarModal(mensagem, titulo = "Confirmar") {
  return new Promise((resolve) => {
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

    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;width:100%;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-question-circle" style="margin-right:8px;"></i>
            ${titulo}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;">
          <p style="font-size:15px;color:var(--cinza-escuro);margin:0;text-align:center;line-height:1.6;white-space:pre-wrap;">${mensagem}</p>
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:row;gap:10px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(true);" 
            style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
            <i class="fas fa-check" style="margin-right:6px;"></i> Confirmar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    window._confirmModalResolve = resolve;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

function showToast(message, type = "info") {
  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast(message, type);
    return;
  }

  const container = document.getElementById("toastContainer");
  if (!container) {
    console.log(`${type}: ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const cores = {
    success: "var(--verde-bandeira)",
    error: "var(--erro)",
    warning: "var(--aviso)",
    info: "var(--azul-bandeira)",
  };
  toast.style.background = cores[type] || cores.info;
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderMural,
  carregarAvisosMural,
  aplicarFiltrosMural,
  limparFiltrosMural,
  abrirFormularioMural,
  salvarAvisoMural,
  editarAvisoMural,
  deletarAvisoMural,
  expandirConteudoMural,
  toggleReacao,
  adicionarComentario,
  verTodosComentarios,
  abrirCarrossel,
  atualizarBadgeMural,
  marcarMuralComoLido,
};
