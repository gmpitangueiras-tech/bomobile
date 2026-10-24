/**
 * MÓDULO NOTIFICAÇÕES LISTA
 * Página para visualizar todas as notificações
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de todas as notificações do usuário
 * - Marcar notificações como lidas
 * - Marcar todas como lidas
 * - Filtros por tipo e período
 * - Notificações de retificações (BO e abordagens)
 * - Notificações de novas ocorrências e abordagens
 * - Notificações do mural
 * - Badge de não lidas
 * - Exclusão de notificações
 * - Navegação para o link da notificação
 *
 * MELHORIAS APLICADAS (SEGUNDA RODADA):
 * - Filtros rápidos por categorias já existentes nos tipos emitidos
 * - Tempo relativo com data/hora exatas acessíveis
 * - Prévia detalhada em diálogo, sem perder a posição na lista
 * - Ações explícitas para abrir, marcar como lida e fechar
 * - Resumo compacto no cartão e foco acessível por teclado
 * - Compatibilidade com mobile e preferência por movimento reduzido
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             utils, ui
 */

// ============================================
// CONSTANTES
// ============================================

// 🔥 NOVO: Configuração de tipos de notificação
const TIPOS_NOTIFICACAO_CONFIG = {
  nova_ocorrencia: {
    label: "Nova Ocorrência",
    icon: "fa-file-alt",
    cor: "#003F87",
    bg: "var(--azul-muito-claro)",
    borda: "var(--azul-bandeira)",
    ordem: 1,
  },
  nova_abordagem: {
    label: "Nova Abordagem",
    icon: "fa-search",
    cor: "#00843D",
    bg: "var(--verde-muito-claro)",
    borda: "var(--verde-bandeira)",
    ordem: 2,
  },
  novo_mural: {
    label: "Novo Aviso",
    icon: "fa-bullhorn",
    cor: "#8B5CF6",
    bg: "#ede9fe",
    borda: "#8B5CF6",
    ordem: 3,
  },
  retificacao_pendente: {
    label: "Retificação Pendente",
    icon: "fa-clock",
    cor: "#F59E0B",
    bg: "#fef3c7",
    borda: "var(--aviso)",
    ordem: 4,
  },
  retificacao_aprovada: {
    label: "Retificação Aprovada",
    icon: "fa-check-circle",
    cor: "#00843D",
    bg: "var(--verde-muito-claro)",
    borda: "var(--verde-bandeira)",
    ordem: 5,
  },
  retificacao_rejeitada: {
    label: "Retificação Rejeitada",
    icon: "fa-times-circle",
    cor: "#DC2626",
    bg: "var(--erro-claro)",
    borda: "var(--erro)",
    ordem: 6,
  },
  // 🔥 NOVO: Tipos para retificações de abordagens
  retificacao_abordagem_pendente: {
    label: "Retif. Abordagem Pendente",
    icon: "fa-clock",
    cor: "#F59E0B",
    bg: "#fef3c7",
    borda: "var(--aviso)",
    ordem: 7,
  },
  retificacao_abordagem_aprovada: {
    label: "Retif. Abordagem Aprovada",
    icon: "fa-check-circle",
    cor: "#00843D",
    bg: "var(--verde-muito-claro)",
    borda: "var(--verde-bandeira)",
    ordem: 8,
  },
  retificacao_abordagem_rejeitada: {
    label: "Retif. Abordagem Rejeitada",
    icon: "fa-times-circle",
    cor: "#DC2626",
    bg: "var(--erro-claro)",
    borda: "var(--erro)",
    ordem: 9,
  },
  sistema: {
    label: "Sistema",
    icon: "fa-cog",
    cor: "#6B7280",
    bg: "var(--cinza-claro)",
    borda: "var(--cinza-medio)",
    ordem: 10,
  },
};

// 🔥 NOVO: Opções de filtro por tipo
const TIPOS_FILTRO = [
  { value: "todos", label: "Todos os tipos" },
  { value: "nova_ocorrencia", label: "Nova Ocorrência" },
  { value: "nova_abordagem", label: "Nova Abordagem" },
  { value: "novo_mural", label: "Novo Aviso" },
  { value: "retificacao_pendente", label: "Retificação Pendente" },
  { value: "retificacao_aprovada", label: "Retificação Aprovada" },
  { value: "retificacao_rejeitada", label: "Retificação Rejeitada" },
  // 🔥 NOVO: Filtros para retificações de abordagens
  {
    value: "retificacao_abordagem_pendente",
    label: "Retif. Abordagem Pendente",
  },
  {
    value: "retificacao_abordagem_aprovada",
    label: "Retif. Abordagem Aprovada",
  },
  {
    value: "retificacao_abordagem_rejeitada",
    label: "Retif. Abordagem Rejeitada",
  },
  { value: "sistema", label: "Sistema" },
];

const CATEGORIAS_RAPIDAS = [
  { value: "todas", label: "Todos os assuntos", tipos: [] },
  { value: "ocorrencias", label: "Ocorrências", tipos: ["nova_ocorrencia"] },
  { value: "abordagens", label: "Abordagens", tipos: ["nova_abordagem"] },
  { value: "mural", label: "Mural", tipos: ["novo_mural"] },
  {
    value: "retificacoes",
    label: "Retificações",
    tipos: [
      "retificacao_pendente",
      "retificacao_aprovada",
      "retificacao_rejeitada",
      "retificacao_abordagem_pendente",
      "retificacao_abordagem_aprovada",
      "retificacao_abordagem_rejeitada",
    ],
  },
  { value: "sistema", label: "Sistema", tipos: ["sistema"] },
];

const ITENS_POR_PAGINA = 20;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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

function formatarTempoRelativo(date, referencia = new Date()) {
  if (!date) return "Horário indisponível";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "Horário indisponível";
  const segundos = Math.floor((referencia.getTime() - d.getTime()) / 1000);
  if (segundos < 0) return "Data futura";
  if (segundos < 45) return "agora";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const semanas = Math.floor(dias / 7);
  if (dias < 30) return semanas === 1 ? "há 1 semana" : `há ${semanas} semanas`;
  const meses = Math.floor(dias / 30);
  if (dias < 365) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(dias / 365);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

/**
 * Formata data para agrupamento
 */
function chaveDataSaoPaulo(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "sem-data";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function formatarDataAgrupamento(chave) {
  if (chave === "hoje") return "Hoje";
  if (chave === "ontem") return "Ontem";
  if (chave === "sem-data") return "Data indisponível";
  const data = new Date(`${chave}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return "Data indisponível";
  return data.toLocaleDateString("pt-BR", {
    timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function agruparPorData(notificacoes) {
  const hoje = chaveDataSaoPaulo(new Date());
  const ontemDate = new Date(`${hoje}T12:00:00Z`);
  ontemDate.setUTCDate(ontemDate.getUTCDate() - 1);
  const ontem = ontemDate.toISOString().slice(0, 10);
  const grupos = {};
  notificacoes.forEach((notif) => {
    const chave = chaveDataSaoPaulo(new Date(notif.criado_em));
    const grupo = chave === hoje ? "hoje" : chave === ontem ? "ontem" : chave;
    if (!grupos[grupo]) grupos[grupo] = [];
    grupos[grupo].push(notif);
  });
  const chaves = Object.keys(grupos).sort((a, b) => {
    const ordem = { hoje: 0, ontem: 1 };
    if (a === b) return 0;
    if (a in ordem || b in ordem) return (ordem[a] ?? 2) - (ordem[b] ?? 2);
    if (a === "sem-data") return 1;
    if (b === "sem-data") return -1;
    return b.localeCompare(a);
  });
  return Object.fromEntries(chaves.map((chave) => [chave, grupos[chave]]));
}
// ============================================
// 🔥 CORRIGIDO: OBTENÇÃO DA INSTÂNCIA DE NOTIFICAÇÕES COM FALLBACK
// ============================================

/**
 * Obtém a instância do sistema de notificações com fallback
 * @returns {Object} Instância de notificações
 */
function getNotificacoes() {
  // Verificar se a instância global existe
  if (typeof window.notificacoes !== "undefined" && window.notificacoes) {
    return window.notificacoes;
  }

  // Verificar se a instância local existe
  if (typeof notificacoes !== "undefined" && notificacoes) {
    return notificacoes;
  }

  console.warn("⚠️ Sistema de notificações não encontrado, usando fallback");

  // Fallback: implementação básica usando Supabase diretamente
  return {
    listarNotificacoes: async (filtros = {}) => {
      try {
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        if (!client) return { success: false, error: "Erro ao conectar" };

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        if (!user) return { success: false, error: "Usuário não autenticado" };

        let query = client
          .from("notificacoes")
          .select("*")
          .eq("usuario_id", user.id)
          .order("criado_em", { ascending: false });

        if (filtros.lida !== undefined) {
          query = query.eq("lida", filtros.lida);
        }
        if (filtros.tipo && filtros.tipo !== "todos") {
          query = query.eq("tipo", filtros.tipo);
        }
        if (filtros.limit) {
          query = query.limit(filtros.limit);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data: data || [] };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    marcarTodasComoLidas: async () => {
      try {
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        if (!client) return { success: false, error: "Erro ao conectar" };

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        if (!user) return { success: false, error: "Usuário não autenticado" };

        const { data, error } = await client
          .from("notificacoes")
          .update({ lida: true, lida_em: globalThis.obterTimestampBrasilSemFuso() })
          .eq("usuario_id", user.id)
          .eq("lida", false)
          .select();

        if (error) throw error;
        return { success: true, data: data || [] };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    marcarComoLida: async (id) => {
      try {
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        if (!client) return { success: false, error: "Erro ao conectar" };

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        if (!user) return { success: false, error: "Usuário não autenticado" };

        const { data, error } = await client
          .from("notificacoes")
          .update({ lida: true, lida_em: globalThis.obterTimestampBrasilSemFuso() })
          .eq("id", id)
          .eq("usuario_id", user.id)
          .select()
          .single();

        if (error) throw error;
        return { success: true, data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    excluirNotificacao: async (id) => {
      try {
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        if (!client) return { success: false, error: "Erro ao conectar" };

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        if (!user) return { success: false, error: "Usuário não autenticado" };

        const { error } = await client
          .from("notificacoes")
          .delete()
          .eq("id", id)
          .eq("usuario_id", user.id);

        if (error) throw error;
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    // 🔥 NOVO: Método para buscar estatísticas
    getStats: async () => {
      try {
        const client =
          typeof supabaseClient !== "undefined"
            ? supabaseClient.getClient()
            : null;
        if (!client) return { success: false, error: "Erro ao conectar" };

        const user =
          typeof authManager !== "undefined" ? authManager.getUser() : null;
        if (!user) return { success: false, error: "Usuário não autenticado" };

        const { data, error } = await client
          .from("notificacoes")
          .select("*")
          .eq("usuario_id", user.id);

        if (error) throw error;

        const total = data?.length || 0;
        const naoLidas = data?.filter((n) => !n.lida).length || 0;

        return {
          success: true,
          data: { total, naoLidas, lidas: total - naoLidas },
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  };
}

// 🔥 Criar a instância com fallback
const notif = getNotificacoes();

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  notificacoes: [],
  totalRegistros: 0,
  totalNaoLidas: 0,
  totalPaginas: 1,
  paginaAtual: 1,
  carregando: false,
  erro: null,
  ultimaAtualizacao: null,
  filtros: {
    tipo: "todos",
    categoria: "todas",
    dataInicio: "",
    dataFim: "",
    lida: "todas",
    busca: "",
  },
  filtrosVisiveis: false,
  usuario: null,
  _timeoutBusca: null,
  clickRoot: null,
  clickHandler: null,
  previewFocusReturn: null,
  previewKeyHandler: null,
  previewNavigationHandler: null,
  previewPreviousOverflow: "",

};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export async function renderNotificacoes(container, appInstance) {
  const user = authManager.getUser();
  if (!user) {
    container.innerHTML = `
      <main class="container notif-page">
        <section class="notif-state-card" role="status">
          <div class="notif-state-icon"><i class="fas fa-user-slash" aria-hidden="true"></i></div>
          <h2>Entre para ver suas notificações</h2>
          <p>Faça login para acessar os avisos vinculados à sua conta.</p>
          <button type="button" class="notif-primary-button" onclick="window.app.navigateTo('login')">Fazer login</button>
        </section>
      </main>
    `;
    return;
  }

  estado.usuario = user;
  window._notificacoesMarcarTodas = () => marcarTodasComoLidas(container, appInstance);
  window._notificacoesMarcarUma = (id) => marcarUmaComoLida(id, container, appInstance);
  window._notificacoesExcluir = (id) => excluirNotificacao(id, container, appInstance);
  window._notificacoesAplicarFiltros = () => aplicarFiltros(container, appInstance);
  window._notificacoesLimparFiltros = () => limparFiltros(container, appInstance);
  window._notificacoesToggleFiltros = () => toggleFiltros(container, appInstance);
  window._notificacoesRecarregar = () => renderNotificacoes(container, appInstance);
  window._notificacoesPagina = (pagina) => irParaPagina(pagina, container, appInstance);
  window._notificacoesNavegar = (link, id) => navegarParaLink(link, id, appInstance);
  window._notificacoesCategoria = (categoria) => filtrarPorCategoria(categoria, container, appInstance);
  window._notificacoesBuscar = (termo) => {
    if (estado._timeoutBusca) clearTimeout(estado._timeoutBusca);
    estado.filtros.busca = String(termo || "").trim();
    estado.paginaAtual = 1;
    carregarNotificacoes(1).then(() => renderizarLista(container, appInstance));
  };

  container.innerHTML = `
    <main class="container notif-page">
      <header class="notif-page-header">
        <div>
          <span class="notif-eyebrow">CENTRAL DE AVISOS</span>
          <h1>Notificações</h1>
          <p>Ocorrências, abordagens, avisos e atualizações importantes.</p>
        </div>
        <button type="button" class="notif-icon-button" onclick="window._notificacoesRecarregar()" aria-label="Atualizar notificações" title="Atualizar">
          <i class="fas fa-sync-alt" aria-hidden="true"></i>
        </button>
      </header>
      <section class="notif-loading-block" role="status" aria-live="polite">
        ${renderLoaderCards()}
        <span>Carregando notificações…</span>
      </section>
    </main>
  `;

  try {
    await carregarNotificacoes(estado.paginaAtual || 1);
    renderizarLista(container, appInstance);
  } catch (error) {
    estado.erro = error?.message || "Não foi possível carregar as notificações.";
    estado.carregando = false;
    renderizarLista(container, appInstance);
  }
}
// ============================================
// CARREGAR NOTIFICAÇÕES
// ============================================

async function carregarNotificacoes(pagina = 1) {
  estado.carregando = true;
  estado.erro = null;
  estado.paginaAtual = pagina;
  try {
    const user = authManager.getUser();
    if (!user) throw new Error("Sessão não autenticada.");
    const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) throw new Error("Não foi possível conectar ao servidor.");

    const { tipo, categoria, dataInicio, dataFim, lida, busca } = estado.filtros;
    const offset = (pagina - 1) * ITENS_POR_PAGINA;
    let query = client
      .from("notificacoes")
      .select("*", { count: "exact" })
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false });

    if (tipo !== "todos") query = query.eq("tipo", tipo);
    else if (categoria && categoria !== "todas") {
      const categoriaConfig = CATEGORIAS_RAPIDAS.find((item) => item.value === categoria);
      if (categoriaConfig?.tipos?.length) query = query.in("tipo", categoriaConfig.tipos);
    }
    if (lida === "nao_lidas") query = query.eq("lida", false);
    else if (lida === "lidas") query = query.eq("lida", true);
    if (dataInicio) query = query.gte("criado_em", dataInicio);
    if (dataFim) query = query.lte("criado_em", dataFim + "T23:59:59");
    if (busca) {
      const termo = String(busca).trim()
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      const like = `"%${termo}%"`;
      query = query.or(`titulo.ilike.${like},mensagem.ilike.${like}`);
    }
    query = query.range(offset, offset + ITENS_POR_PAGINA - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    estado.notificacoes = data || [];
    estado.totalRegistros = count ?? estado.notificacoes.length;
    estado.totalPaginas = Math.max(1, Math.ceil(estado.totalRegistros / ITENS_POR_PAGINA));
    estado.ultimaAtualizacao = globalThis.obterTimestampBrasilSemFuso();

    const naoLidas = await atualizarBadgeNotificacoes();
    if (Number.isFinite(naoLidas)) estado.totalNaoLidas = naoLidas;
  } catch (error) {
    console.error("Erro ao carregar notificações:", error);
    estado.notificacoes = [];
    estado.totalRegistros = 0;
    estado.totalPaginas = 1;
    estado.erro = error?.message || "Não foi possível carregar as notificações.";
  } finally {
    estado.carregando = false;
  }
}
// ============================================
// RENDERIZAÇÃO PRINCIPAL (NOVO LAYOUT)
// ============================================

function renderizarLista(container, appInstance) {
  const { notificacoes, totalRegistros, totalPaginas, paginaAtual, filtros } = estado;
  const temFiltros = filtros.categoria !== "todas" || filtros.tipo !== "todos" || filtros.lida !== "todas" || Boolean(filtros.dataInicio || filtros.dataFim || filtros.busca);
  const inicio = totalRegistros > 0 ? (paginaAtual - 1) * ITENS_POR_PAGINA + 1 : 0;
  const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, totalRegistros);
  const naoLidas = Number(estado.totalNaoLidas) || 0;
  const agrupadas = agruparPorData(notificacoes);
  const horaAtualizacao = estado.ultimaAtualizacao
    ? new Date(estado.ultimaAtualizacao).toLocaleTimeString("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "—";

  const categoriasHtml = CATEGORIAS_RAPIDAS.map((categoria) => `
    <button type="button" class="notif-category-button ${filtros.categoria === categoria.value ? "active" : ""}"
      aria-pressed="${filtros.categoria === categoria.value}"
      onclick="window._notificacoesCategoria('${categoria.value}')">${escapeHtml(categoria.label)}</button>
  `).join("");

  let html = `
    <main id="notificacoesPagina" class="container notif-page">
      <header class="notif-page-header">
        <div>
          <span class="notif-eyebrow">CENTRAL DE AVISOS</span>
          <h1>Notificações</h1>
          <p>Ocorrências, abordagens, avisos e atualizações importantes.</p>
        </div>
        <button type="button" class="notif-icon-button" onclick="window._notificacoesRecarregar()" aria-label="Atualizar notificações" title="Atualizar">
          <i class="fas fa-sync-alt" aria-hidden="true"></i>
        </button>
      </header>

      <section class="notif-overview" aria-label="Resumo das notificações">
        <div class="notif-unread-summary">
          <span class="notif-unread-number">${naoLidas}</span>
          <span><strong>${naoLidas === 1 ? "não lida" : "não lidas"}</strong><small>Atualizado às ${horaAtualizacao}</small></span>
        </div>
        ${naoLidas > 0 ? `<button type="button" class="notif-mark-all" onclick="window._notificacoesMarcarTodas()"><i class="fas fa-check-double" aria-hidden="true"></i> Marcar todas como lidas</button>` : `<span class="notif-all-read"><i class="fas fa-check-circle" aria-hidden="true"></i> Você está em dia</span>`}
      </section>

      <form class="notif-search" role="search" onsubmit="event.preventDefault(); window._notificacoesBuscar(document.getElementById('buscaNotificacoes').value)">
        <label class="notif-sr-only" for="buscaNotificacoes">Buscar nas notificações</label>
        <i class="fas fa-search notif-search-icon" aria-hidden="true"></i>
        <input id="buscaNotificacoes" type="search" value="${escapeHtml(filtros.busca)}" placeholder="Buscar por título ou conteúdo…" autocomplete="off">
        ${filtros.busca ? `<button type="button" class="notif-clear-search" onclick="document.getElementById('buscaNotificacoes').value=''; window._notificacoesBuscar('')" aria-label="Limpar busca" title="Limpar busca"><i class="fas fa-times" aria-hidden="true"></i></button>` : ""}
        <button type="submit" class="notif-search-submit">Buscar</button>
      </form>

      <section class="notif-filters" aria-label="Filtros de notificações">
        <div class="notif-filter-topline">
          <div class="notif-status-filters" role="group" aria-label="Filtrar por leitura">
            ${[
              { value: "todas", label: "Todas" },
              { value: "nao_lidas", label: "Não lidas" },
              { value: "lidas", label: "Lidas" },
            ].map((op) => `<button type="button" class="notif-status-button ${filtros.lida === op.value ? "active" : ""}" aria-pressed="${filtros.lida === op.value}" onclick="document.getElementById('filtroLidaNotif').value='${op.value}'; window._notificacoesAplicarFiltros()">${op.label}${op.value === "nao_lidas" ? ` <span>${naoLidas}</span>` : ""}</button>`).join("")}
            <input type="hidden" id="filtroLidaNotif" value="${escapeHtml(filtros.lida)}">
          </div>
          <button type="button" class="notif-filter-toggle" onclick="window._notificacoesToggleFiltros()" aria-expanded="${Boolean(estado.filtrosVisiveis)}" aria-controls="filtrosAvancadosNotif">
            <i class="fas fa-sliders-h" aria-hidden="true"></i> Filtros <i class="fas fa-chevron-${estado.filtrosVisiveis ? "up" : "down"} notif-filter-chevron" aria-hidden="true"></i>
          </button>
        </div>
        <div class="notif-category-row">
          <span class="notif-category-caption">Assunto</span>
          <div class="notif-category-options" role="group" aria-label="Filtrar por assunto">${categoriasHtml}</div>
        </div>
        <div id="filtrosAvancadosNotif" class="notif-advanced-filters" style="display:${estado.filtrosVisiveis ? "grid" : "none"}">
          <label class="notif-filter-field" for="filtroTipoNotif"><span>Tipo específico</span>
            <select id="filtroTipoNotif" onchange="window._notificacoesAplicarFiltros()">
              ${TIPOS_FILTRO.map((op) => `<option value="${escapeHtml(op.value)}" ${filtros.tipo === op.value ? "selected" : ""}>${escapeHtml(op.label)}</option>`).join("")}
            </select>
          </label>
          <label class="notif-filter-field" for="filtroDataInicioNotif"><span>Data inicial</span>
            <input type="date" id="filtroDataInicioNotif" value="${escapeHtml(filtros.dataInicio)}" onchange="window._notificacoesAplicarFiltros()">
          </label>
          <label class="notif-filter-field" for="filtroDataFimNotif"><span>Data final</span>
            <input type="date" id="filtroDataFimNotif" value="${escapeHtml(filtros.dataFim)}" onchange="window._notificacoesAplicarFiltros()">
          </label>
          ${temFiltros ? `<button type="button" class="notif-clear-filters" onclick="window._notificacoesLimparFiltros()"><i class="fas fa-undo" aria-hidden="true"></i> Limpar filtros</button>` : ""}
        </div>
      </section>

      <section class="notif-results" aria-live="polite">
        <div class="notif-results-heading">
          <div><span class="notif-eyebrow">CAIXA DE ENTRADA</span><h2>Mais recentes</h2></div>
          <p>${totalRegistros > 0 ? `Mostrando <strong>${inicio}–${fim}</strong> de <strong>${totalRegistros}</strong>` : "0 notificações"}</p>
        </div>
        <div id="listaNotificacoes" class="notif-list">
          ${estado.carregando ? renderLoaderCards() : estado.erro ? `<section class="notif-state-card notif-error" role="alert"><div class="notif-state-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></div><h3>Não foi possível carregar</h3><p>${escapeHtml(estado.erro)}</p><button type="button" class="notif-primary-button" onclick="window._notificacoesRecarregar()"><i class="fas fa-sync-alt" aria-hidden="true"></i> Tentar novamente</button></section>` : notificacoes.length === 0 ? renderVazio(temFiltros) : Object.entries(agrupadas).map(([data, items]) => `<section class="notif-day-group" aria-label="${escapeHtml(formatarDataAgrupamento(data))}"><h3 class="notif-day-heading">${escapeHtml(formatarDataAgrupamento(data))}</h3><div class="notif-day-items">${items.map((notif) => renderNotificacaoItem(notif)).join("")}</div></section>`).join("")}
        </div>
        ${!estado.erro && !estado.carregando && totalPaginas > 1 ? renderPaginacao(paginaAtual, totalPaginas) : ""}
      </section>
    </main>
  `;
  container.innerHTML = html;
  registrarEventosNotificacoes(container, appInstance);
}
// ============================================
// RENDERIZAÇÃO: NOTIFICAÇÃO ITEM (NOVO LAYOUT)
// ============================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderNotificacaoItem(notif) {
  const isLida = notif.lida === true;
  const tipoConfig = TIPOS_NOTIFICACAO_CONFIG[notif.tipo] || TIPOS_NOTIFICACAO_CONFIG.sistema;
  const dataHora = formatarDataHoraLocal(notif.criado_em) || "Horário indisponível";
  const tempoRelativo = formatarTempoRelativo(notif.criado_em);
  const link = String(notif.link || "#");
  const titulo = escapeHtml(notif.titulo || tipoConfig.label || "Notificação");
  const mensagem = escapeHtml(notif.mensagem || "Sem detalhes adicionais.");
  const id = escapeHtml(notif.id);
  const iconMap = {
    nova_ocorrencia: "fa-file-alt",
    nova_abordagem: "fa-search",
    novo_mural: "fa-bullhorn",
    retificacao_pendente: "fa-clock",
    retificacao_aprovada: "fa-check-circle",
    retificacao_rejeitada: "fa-times-circle",
    retificacao_abordagem_pendente: "fa-clock",
    retificacao_abordagem_aprovada: "fa-check-circle",
    retificacao_abordagem_rejeitada: "fa-times-circle",
    sistema: "fa-cog",
  };
  const icon = iconMap[notif.tipo] || "fa-bell";
  return `
    <article class="notif-card ${isLida ? "is-read" : "is-unread"}" data-notif-id="${id}" data-notif-link="${escapeHtml(link)}">
      <div class="notif-card-icon" aria-hidden="true"><i class="fas ${escapeHtml(icon)}"></i></div>
      <div class="notif-card-content">
        <div class="notif-card-heading">
          <h3>${titulo}</h3>
          <time datetime="${escapeHtml(notif.criado_em || "")}" title="${escapeHtml(dataHora)}" aria-label="Recebida em ${escapeHtml(dataHora)}">${escapeHtml(tempoRelativo)}</time>
        </div>
        <div class="notif-card-message">${mensagem}</div>
        <div class="notif-card-meta"><span class="notif-type-pill">${escapeHtml(tipoConfig.label || "Notificação")}</span>${!isLida ? `<span class="notif-unread-pill"><span aria-hidden="true"></span> Não lida</span>` : ""}</div>
      </div>
      <div class="notif-card-actions">
        <button type="button" class="notif-open-button" data-notif-action="preview" aria-label="Ver detalhes: ${titulo}"><span>Detalhes</span><i class="fas fa-info-circle" aria-hidden="true"></i></button>
        <details class="notif-more-menu">
          <summary aria-label="Mais ações"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></summary>
          <div class="notif-menu-items">
            ${!isLida ? `<button type="button" data-notif-action="read"><i class="fas fa-check" aria-hidden="true"></i> Marcar como lida</button>` : ""}
            <button type="button" class="notif-delete-action" data-notif-action="delete"><i class="fas fa-trash" aria-hidden="true"></i> Excluir</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function renderPreviaNotificacao(notif) {
  const isLida = notif.lida === true;
  const tipoConfig = TIPOS_NOTIFICACAO_CONFIG[notif.tipo] || TIPOS_NOTIFICACAO_CONFIG.sistema;
  const dataHora = formatarDataHoraLocal(notif.criado_em) || "Horário indisponível";
  const link = String(notif.link || "#");
  const titulo = escapeHtml(notif.titulo || tipoConfig.label || "Notificação");
  const mensagem = escapeHtml(notif.mensagem || "Sem detalhes adicionais.").replace(/\r\n|\r|\n/g, "<br>");
  const id = escapeHtml(notif.id);
  const iconMap = {
    nova_ocorrencia: "fa-file-alt",
    nova_abordagem: "fa-search",
    novo_mural: "fa-bullhorn",
    retificacao_pendente: "fa-clock",
    retificacao_aprovada: "fa-check-circle",
    retificacao_rejeitada: "fa-times-circle",
    retificacao_abordagem_pendente: "fa-clock",
    retificacao_abordagem_aprovada: "fa-check-circle",
    retificacao_abordagem_rejeitada: "fa-times-circle",
    sistema: "fa-cog",
  };
  const icon = iconMap[notif.tipo] || "fa-bell";
  return `
    <div class="notif-dialog-backdrop" data-notif-action="close-backdrop" role="presentation">
      <section class="notif-dialog" role="dialog" aria-modal="true" aria-labelledby="notifPreviewTitle" aria-describedby="notifPreviewMessage" tabindex="-1" data-notif-id="${id}" data-notif-link="${escapeHtml(link)}">
        <header class="notif-dialog-header">
          <div class="notif-dialog-type">
            <span class="notif-dialog-icon" style="--notif-accent:${tipoConfig.cor}" aria-hidden="true"><i class="fas ${escapeHtml(icon)}"></i></span>
            <div><span class="notif-eyebrow">DETALHE DA NOTIFICAÇÃO</span><span class="notif-dialog-type-label">${escapeHtml(tipoConfig.label || "Notificação")}</span></div>
          </div>
          <button type="button" class="notif-dialog-close" data-notif-action="close-preview" aria-label="Fechar detalhes"><i class="fas fa-times" aria-hidden="true"></i></button>
        </header>
        <h2 id="notifPreviewTitle">${titulo}</h2>
        <div id="notifPreviewMessage" class="notif-dialog-message">${mensagem}</div>
        <dl class="notif-dialog-facts">
          <div><dt>Recebida</dt><dd><time datetime="${escapeHtml(notif.criado_em || "")}">${escapeHtml(dataHora)}</time></dd></div>
          <div><dt>Status</dt><dd><span class="${isLida ? "notif-dialog-read" : "notif-dialog-unread"}">${isLida ? "Lida" : "Não lida"}</span></dd></div>
        </dl>
        <footer class="notif-dialog-footer">
          <button type="button" class="notif-dialog-secondary" data-notif-action="close-preview">Fechar</button>
          ${!isLida ? `<button type="button" class="notif-dialog-secondary" data-notif-action="read"><i class="fas fa-check" aria-hidden="true"></i> Marcar como lida</button>` : ""}
          ${link && link !== "#" ? `<button type="button" class="notif-dialog-primary" data-notif-action="open"><i class="fas fa-external-link-alt" aria-hidden="true"></i> Abrir no app</button>` : ""}
        </footer>
      </section>
    </div>
  `;
}

function abrirPreviaNotificacao(id, container) {
  const notificacao = estado.notificacoes.find((item) => String(item.id) === String(id));
  if (!notificacao || container.querySelector(".notif-dialog-backdrop")) return;
  estado.previewFocusReturn = document.activeElement;
  estado.previewPreviousOverflow = document.body.style.overflow;
  container.insertAdjacentHTML("beforeend", renderPreviaNotificacao(notificacao));
  document.body.style.overflow = "hidden";
  const dialog = container.querySelector(".notif-dialog");
  estado.previewKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      fecharPreviaNotificacao(container);
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusables = Array.from(dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
    if (!focusables.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", estado.previewKeyHandler);
  estado.previewNavigationHandler = () => fecharPreviaNotificacao(container);
  window.addEventListener("hashchange", estado.previewNavigationHandler);
  window.addEventListener("popstate", estado.previewNavigationHandler);
  dialog?.focus();
}

function fecharPreviaNotificacao(container) {
  const backdrop = container.querySelector(".notif-dialog-backdrop");
  if (!backdrop) return;
  backdrop.remove();
  if (estado.previewKeyHandler) document.removeEventListener("keydown", estado.previewKeyHandler);
  estado.previewKeyHandler = null;
  if (estado.previewNavigationHandler) {
    window.removeEventListener("hashchange", estado.previewNavigationHandler);
    window.removeEventListener("popstate", estado.previewNavigationHandler);
  }
  estado.previewNavigationHandler = null;
  document.body.style.overflow = estado.previewPreviousOverflow || "";
  const focusReturn = estado.previewFocusReturn;
  estado.previewFocusReturn = null;
  if (focusReturn?.isConnected && typeof focusReturn.focus === "function") focusReturn.focus();
}

function registrarEventosNotificacoes(container, appInstance) {
  if (estado.clickRoot && estado.clickHandler) {
    estado.clickRoot.removeEventListener("click", estado.clickHandler);
  }
  estado.clickRoot = container;
  estado.clickHandler = (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const action = target?.closest("[data-notif-action]");
    if (!action || !container.contains(action)) return;
    const actionName = action.dataset.notifAction;
    if (actionName === "close-preview") {
      fecharPreviaNotificacao(container);
      return;
    }
    if (actionName === "close-backdrop") {
      if (event.target === action) fecharPreviaNotificacao(container);
      return;
    }
    const item = action.closest("[data-notif-id]");
    const id = item?.getAttribute("data-notif-id");
    if (!id) return;
    if (actionName === "preview") {
      abrirPreviaNotificacao(id, container);
    } else if (actionName === "open") {
      const link = item.getAttribute("data-notif-link") || "#";
      fecharPreviaNotificacao(container);
      navegarParaLink(link, id, appInstance);
    } else if (actionName === "read") {
      fecharPreviaNotificacao(container);
      marcarUmaComoLida(id, container, appInstance);
    } else if (actionName === "delete") {
      excluirNotificacao(id, container, appInstance);
    }
  };
  container.addEventListener("click", estado.clickHandler);
}
// ============================================
// RENDERIZAÇÃO: LOADER, VAZIO, PAGINAÇÃO
// ============================================

function renderLoaderCards() {
  return Array.from({ length: 3 }, () => `
    <div class="notif-skeleton-card" aria-hidden="true">
      <span class="notif-skeleton-icon"></span>
      <span class="notif-skeleton-lines"><i></i><i></i><i></i></span>
    </div>
  `).join("");
}

function renderVazio(temFiltros) {
  return `
    <section class="notif-state-card" role="status">
      <div class="notif-state-icon"><i class="fas ${temFiltros ? "fa-filter" : "fa-check-circle"}" aria-hidden="true"></i></div>
      <h3>${temFiltros ? "Nenhum resultado encontrado" : "Você está em dia"}</h3>
      <p>${temFiltros ? "Tente ajustar a busca ou os filtros para encontrar outras notificações." : "Não há notificações para exibir no momento."}</p>
      ${temFiltros ? `<button type="button" class="notif-secondary-button" onclick="window._notificacoesLimparFiltros()"><i class="fas fa-undo" aria-hidden="true"></i> Limpar busca e filtros</button>` : ""}
    </section>
  `;
}

function renderPaginacao(atual, total) {
  if (total <= 1) return "";
  const maxVisible = 5;
  let inicio = Math.max(1, atual - Math.floor(maxVisible / 2));
  let fim = Math.min(total, inicio + maxVisible - 1);
  if (fim - inicio < maxVisible - 1) inicio = Math.max(1, fim - maxVisible + 1);
  let pages = "";
  if (inicio > 1) pages += `<button type="button" class="notif-page-number" onclick="window._notificacoesPagina(1)">1</button>${inicio > 2 ? `<span class="notif-page-ellipsis">…</span>` : ""}`;
  for (let page = inicio; page <= fim; page++) {
    pages += `<button type="button" class="notif-page-number ${page === atual ? "active" : ""}" aria-current="${page === atual ? "page" : "false"}" onclick="window._notificacoesPagina(${page})">${page}</button>`;
  }
  if (fim < total) pages += `${fim < total - 1 ? `<span class="notif-page-ellipsis">…</span>` : ""}<button type="button" class="notif-page-number" onclick="window._notificacoesPagina(${total})">${total}</button>`;
  return `
    <nav class="notif-pagination" aria-label="Paginação das notificações">
      <span class="notif-pagination-label">Página ${atual} de ${total}</span>
      <div class="notif-pagination-controls">
        <button type="button" class="notif-page-arrow" aria-label="Página anterior" ${atual <= 1 ? "disabled" : ""} onclick="window._notificacoesPagina(${atual - 1})"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
        ${pages}
        <button type="button" class="notif-page-arrow" aria-label="Próxima página" ${atual >= total ? "disabled" : ""} onclick="window._notificacoesPagina(${atual + 1})"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </div>
    </nav>
  `;
}
// ============================================
// AÇÕES - MARCAR TODAS COMO LIDAS
// ============================================

export async function marcarTodasComoLidas(container, appInstance) {
  try {
    const confirmado = await appInstance.confirmar(
      "Deseja marcar todas as notificações como lidas?",
      "Marcar todas como lidas",
    );

    if (!confirmado) return;

    // 🔥 CORRIGIDO: Usar a instância com fallback
    const result = await notif.marcarTodasComoLidas();

    if (result.success) {
      appInstance.showToast(
        "Todas as notificações marcadas como lidas",
        "success",
      );
      await carregarNotificacoes(estado.paginaAtual);
      renderizarLista(container, appInstance);

      // 🔥 NOVO: Atualizar badge
      await atualizarBadgeNotificacoes();
    } else {
      appInstance.showToast("Erro ao marcar notificações", "error");
    }
  } catch (error) {
    console.error("Erro ao marcar todas como lidas:", error);
    appInstance.showToast("Erro ao marcar notificações", "error");
  }
}

// ============================================
// AÇÕES - MARCAR UMA COMO LIDA
// ============================================

export async function marcarUmaComoLida(id, container, appInstance) {
  try {
    // 🔥 CORRIGIDO: Usar a instância com fallback
    const result = await notif.marcarComoLida(id);

    if (result.success) {
      await carregarNotificacoes(estado.paginaAtual);
      renderizarLista(container, appInstance);

      // 🔥 NOVO: Atualizar badge
      await atualizarBadgeNotificacoes();
    } else {
      appInstance.showToast("Erro ao marcar notificação", "error");
    }
  } catch (error) {
    console.error("Erro ao marcar notificação:", error);
    appInstance.showToast("Erro ao marcar notificação", "error");
  }
}

// ============================================
// AÇÕES - EXCLUIR NOTIFICAÇÃO
// ============================================

export async function excluirNotificacao(id, container, appInstance) {
  try {
    const confirmado = await appInstance.confirmar(
      "Deseja excluir esta notificação?",
      "Excluir notificação",
    );

    if (!confirmado) return;

    // 🔥 CORRIGIDO: Usar a instância com fallback
    const result = await notif.excluirNotificacao(id);

    if (result.success) {
      appInstance.showToast("Notificação excluída", "info");
      await carregarNotificacoes(estado.paginaAtual);
      renderizarLista(container, appInstance);
    } else {
      appInstance.showToast("Erro ao excluir notificação", "error");
    }
  } catch (error) {
    console.error("Erro ao excluir notificação:", error);
    appInstance.showToast("Erro ao excluir notificação", "error");
  }
}

// ============================================
// AÇÕES - NAVEGAR PARA LINK
// ============================================

export function navegarParaLink(link, id, appInstance) {
  if (!link || link === "#") {
    appInstance.showToast("Link não disponível", "info");
    return;
  }
  if (id) {
    void notif.marcarComoLida(id).then((result) => {
      if (!result?.success) return;
      void atualizarBadgeNotificacoes();
    }).catch((error) => console.warn("Não foi possível marcar a notificação como lida:", error));
  }
  try {
    const url = new URL(link, window.location.href);
    const [page, queryInHash = ""] = url.hash.replace(/^#/, "").split("?", 2);
    if (!page || !appInstance.navigateTo) {
      appInstance.showToast("Página não encontrada", "warning");
      return;
    }
    const params = Object.fromEntries(new URLSearchParams(queryInHash || url.search).entries());
    if (params.id && page === "detalhe-ocorrencia") appInstance.navigateTo(page, { id: params.id });
    else appInstance.navigateTo(page);
  } catch (error) {
    console.warn("Destino de notificação inválido:", error);
    appInstance.showToast("Link de notificação inválido", "warning");
  }
}
// ============================================
// FILTROS
// ============================================

function filtrarPorCategoria(categoria, container, appInstance) {
  if (!CATEGORIAS_RAPIDAS.some((item) => item.value === categoria)) return;
  estado.filtros.categoria = categoria;
  estado.filtros.tipo = "todos";
  const tipoInput = document.getElementById("filtroTipoNotif");
  if (tipoInput) tipoInput.value = "todos";
  estado.paginaAtual = 1;
  carregarNotificacoes(1).then(() => renderizarLista(container, appInstance));
}

export function aplicarFiltros(container, appInstance) {
  const tipo = document.getElementById("filtroTipoNotif")?.value || "todos";
  const lida = document.getElementById("filtroLidaNotif")?.value || "todas";
  const dataInicio = document.getElementById("filtroDataInicioNotif")?.value || "";
  const dataFim = document.getElementById("filtroDataFimNotif")?.value || "";
  const busca = document.getElementById("buscaNotificacoes")?.value?.trim() || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    appInstance.showToast("Data final deve ser maior ou igual à data inicial", "warning");
    return;
  }

  const categoria = tipo !== estado.filtros.tipo ? "todas" : estado.filtros.categoria;
  estado.filtros = { tipo, categoria, lida, dataInicio, dataFim, busca };
  estado.paginaAtual = 1;
  carregarNotificacoes(1).then(() => renderizarLista(container, appInstance));
}

export function limparFiltros(container, appInstance) {
  estado.filtros = {
    tipo: "todos",
    categoria: "todas",
    dataInicio: "",
    dataFim: "",
    lida: "todas",
    busca: "",
  };
  estado.paginaAtual = 1;

  const fields = [
    "buscaNotificacoes",
    "filtroTipoNotif",
    "filtroLidaNotif",
    "filtroDataInicioNotif",
    "filtroDataFimNotif",
  ];
  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  carregarNotificacoes(1).then(() => renderizarLista(container, appInstance));
  appInstance.showToast("Filtros removidos", "info");
}

function toggleFiltros(container, appInstance) {
  estado.filtrosVisiveis = !estado.filtrosVisiveis;
  renderizarLista(container, appInstance);
}
// ============================================
// PAGINAÇÃO
// ============================================

function irParaPagina(pagina, container, appInstance) {
  if (
    pagina < 1 ||
    pagina > estado.totalPaginas ||
    pagina === estado.paginaAtual
  )
    return;

  carregarNotificacoes(pagina).then(() => {
    renderizarLista(container, appInstance);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ============================================
// ATUALIZAR BADGE DE NOTIFICAÇÕES
// ============================================

async function atualizarBadgeNotificacoes() {
  try {
    const user = authManager.getUser();
    if (!user) return null;
    const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return null;
    const { count, error } = await client
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id)
      .eq("lida", false);
    if (error) throw error;
    const totalNaoLidas = Number(count) || 0;
    estado.totalNaoLidas = totalNaoLidas;
    const badgeNav = document.getElementById("badge-notificacoes");
    if (badgeNav) {
      badgeNav.textContent = totalNaoLidas > 9 ? "9+" : String(totalNaoLidas);
      badgeNav.style.display = totalNaoLidas > 0 ? "flex" : "none";
    }
    const badgeSheet = document.getElementById("sheetBadgeNotificacoes");
    if (badgeSheet) {
      badgeSheet.textContent = totalNaoLidas > 9 ? "9+" : String(totalNaoLidas);
      badgeSheet.style.display = totalNaoLidas > 0 ? "inline" : "none";
    }
    return totalNaoLidas;
  } catch (error) {
    console.warn("Erro ao atualizar badge de notificações:", error);
    return null;
  }
}
    
// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderNotificacoes,
  marcarTodasComoLidas,
  marcarUmaComoLida,
  excluirNotificacao,
  navegarParaLink,
  aplicarFiltros,
  limparFiltros,
  carregarNotificacoes,
  atualizarBadgeNotificacoes,
};
