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
 * MELHORIAS APLICADAS (NOVO LAYOUT):
 * - 🔥 NOVO: Layout baseado na imagem fornecida
 * - 🔥 NOVO: Header com identificação do usuário
 * - 🔥 NOVO: Badge de contagem (6 notificação(ões) • 6 não lida(s))
 * - 🔥 NOVO: Filtros "Todos os tipos" com dropdown de categorias
 * - 🔥 NOVO: Filtros "Todas / Não lidas / Lidas" (botões)
 * - 🔥 NOVO: Agrupamento por data ("Hoje", "18 de julho de 2026")
 * - 🔥 NOVO: Cards com ícone, título, mensagem, localização e badge
 * - 🔥 NOVO: Ações no card (Marcar como lida, Excluir, Ver detalhes)
 * - 🔥 NOVO: Suporte a retificações de abordagens
 * - 🔥 NOVO: Badge colorido por tipo
 * - 🔥 NOVO: Ícones específicos por tipo
 * - 🔥 NOVO: Notificações com prioridade (destaque visual)
 * - 🔥 CORRIGIDO: Verificação de instância de notificações com fallback
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

const ITENS_POR_PAGINA = 20;

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

/**
 * Formata data para agrupamento
 */
function formatarDataAgrupamento(chave) {
  if (chave === "hoje") return "Hoje";
  if (chave === "ontem") return "Ontem";

  const data = new Date(chave + "T00:00:00");
  if (isNaN(data.getTime())) return chave;

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Agrupa notificações por data
 */
function agruparPorData(notificacoes) {
  const grupos = {};

  notificacoes.forEach((notif) => {
    const data = new Date(notif.criado_em);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    let chave;
    if (data.toDateString() === hoje.toDateString()) {
      chave = "hoje";
    } else if (data.toDateString() === ontem.toDateString()) {
      chave = "ontem";
    } else {
      chave = data.toISOString().slice(0, 10);
    }

    if (!grupos[chave]) {
      grupos[chave] = [];
    }
    grupos[chave].push(notif);
  });

  // Ordenar as chaves
  const ordem = ["hoje", "ontem"];
  const chavesOrdenadas = Object.keys(grupos).sort((a, b) => {
    if (ordem.includes(a) && ordem.includes(b)) {
      return ordem.indexOf(a) - ordem.indexOf(b);
    }
    if (ordem.includes(a)) return -1;
    if (ordem.includes(b)) return 1;
    return b.localeCompare(a);
  });

  const resultado = {};
  chavesOrdenadas.forEach((chave) => {
    resultado[chave] = grupos[chave];
  });

  return resultado;
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
          .update({ lida: true, lida_em: new Date().toISOString() })
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
          .update({ lida: true, lida_em: new Date().toISOString() })
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
  totalPaginas: 0,
  paginaAtual: 1,
  carregando: false,
  filtros: {
    tipo: "todos",
    dataInicio: "",
    dataFim: "",
    lida: "todas", // 'todas', 'nao_lidas', 'lidas'
  },
  filtrosVisiveis: false,
  usuario: null,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export async function renderNotificacoes(container, appInstance) {
  const user = authManager.getUser();
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

  estado.usuario = user;

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="padding-bottom:100px;">
      <div style="text-align:center;padding:40px 20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:12px;color:var(--cinza-medio);">Carregando notificações...</p>
      </div>
    </div>
  `;

  try {
    // Carregar notificações
    await carregarNotificacoes();

    // Renderizar com o novo layout
    renderizarLista(container, appInstance);

    // Registrar funções globais
    window._notificacoesMarcarTodas = () =>
      marcarTodasComoLidas(container, appInstance);
    window._notificacoesMarcarUma = (id) =>
      marcarUmaComoLida(id, container, appInstance);
    window._notificacoesExcluir = (id) =>
      excluirNotificacao(id, container, appInstance);
    window._notificacoesAplicarFiltros = () =>
      aplicarFiltros(container, appInstance);
    window._notificacoesLimparFiltros = () =>
      limparFiltros(container, appInstance);
    window._notificacoesToggleFiltros = () =>
      toggleFiltros(container, appInstance);
    window._notificacoesRecarregar = () =>
      renderNotificacoes(container, appInstance);
    window._notificacoesPagina = (pagina) =>
      irParaPagina(pagina, container, appInstance);
    window._notificacoesNavegar = (link, id) =>
      navegarParaLink(link, id, appInstance);

    // Atualizar badge
    await atualizarBadgeNotificacoes();
  } catch (error) {
    console.error("Erro ao carregar notificações:", error);
    container.innerHTML = `
      <div class="container" style="padding-bottom:100px;">
        <div style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Erro ao carregar notificações</h3>
          <p style="color:var(--cinza-medio);">${error.message}</p>
          <button onclick="window._notificacoesRecarregar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
            Tentar novamente
          </button>
        </div>
      </div>
    `;
  }
}

// ============================================
// CARREGAR NOTIFICAÇÕES
// ============================================

async function carregarNotificacoes(pagina = 1) {
  estado.carregando = true;
  estado.paginaAtual = pagina;

  try {
    const user = authManager.getUser();
    if (!user) {
      estado.notificacoes = [];
      estado.totalRegistros = 0;
      estado.totalPaginas = 1;
      estado.carregando = false;
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.notificacoes = [];
      estado.totalRegistros = 0;
      estado.totalPaginas = 1;
      estado.carregando = false;
      return;
    }

    const { tipo, dataInicio, dataFim, lida } = estado.filtros;
    const offset = (pagina - 1) * ITENS_POR_PAGINA;

    let query = client
      .from("notificacoes")
      .select("*", { count: "exact" })
      .eq("usuario_id", user.id)
      .order("criado_em", { ascending: false });

    // Filtro por tipo
    if (tipo !== "todos") {
      query = query.eq("tipo", tipo);
    }

    // Filtro por status de leitura
    if (lida === "nao_lidas") {
      query = query.eq("lida", false);
    } else if (lida === "lidas") {
      query = query.eq("lida", true);
    }

    // Filtro por data
    if (dataInicio) {
      query = query.gte("criado_em", dataInicio);
    }
    if (dataFim) {
      query = query.lte("criado_em", dataFim + "T23:59:59");
    }

    // Paginação
    query = query.range(offset, offset + ITENS_POR_PAGINA - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    estado.notificacoes = data || [];
    estado.totalRegistros = count || 0;
    estado.totalPaginas = Math.max(
      1,
      Math.ceil(estado.totalRegistros / ITENS_POR_PAGINA),
    );

    // 🔥 NOVO: Atualizar badge de não lidas
    await atualizarBadgeNotificacoes();
  } catch (error) {
    console.error("Erro ao carregar notificações:", error);
    estado.notificacoes = [];
    estado.totalRegistros = 0;
    estado.totalPaginas = 1;
  }

  estado.carregando = false;
}

// ============================================
// RENDERIZAÇÃO PRINCIPAL (NOVO LAYOUT)
// ============================================

function renderizarLista(container, appInstance) {
  const {
    notificacoes,
    totalRegistros,
    totalPaginas,
    paginaAtual,
    filtros,
    usuario,
  } = estado;

  const temFiltros =
    filtros.tipo !== "todos" ||
    filtros.lida !== "todas" ||
    filtros.dataInicio ||
    filtros.dataFim;

  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, totalRegistros);
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  // 🔥 NOVO: Agrupar notificações por data
  const notificacoesAgrupadas = agruparPorData(notificacoes);

  const filtrosAbertos = estado.filtrosVisiveis;

  // 🔥 NOVO: Header com identificação do usuário
  const nomeUsuario = usuario?.nome_completo || "Guarda";
  const inicial = nomeUsuario.charAt(0).toUpperCase();

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <!-- ==========================================
      HEADER - IGUAL À IMAGEM
      ========================================== -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;background:var(--branco);border-radius:var(--border-radius);padding:10px 14px;box-shadow:var(--sombra-suave);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--gradiente-principal);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">
            ${inicial}
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--cinza-escuro);">${nomeUsuario}</div>
            <div style="font-size:11px;color:var(--cinza-medio);">
              <span style="font-weight:600;">${totalRegistros}</span> notificação(ões)
              ${naoLidas > 0 ? `<span style="color:var(--erro);font-weight:600;"> • ${naoLidas} não lida(s)</span>` : ""}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          ${
            naoLidas > 0
              ? `
            <button onclick="window._notificacoesMarcarTodas()" 
              style="padding:6px 12px;font-size:11px;min-height:auto;width:auto;border-radius:20px;background:var(--azul-bandeira);color:white;border:none;cursor:pointer;font-weight:600;">
              <i class="fas fa-check-double" style="margin-right:4px;"></i> 
              Marcar todas
            </button>
          `
              : ""
          }
          <button onclick="window._notificacoesRecarregar()" 
            style="padding:6px 12px;font-size:11px;min-height:auto;width:auto;border-radius:20px;background:var(--cinza-claro);color:var(--cinza-escuro);border:none;cursor:pointer;">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <!-- ==========================================
      FILTROS - IGUAL À IMAGEM
      ========================================== -->
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px 12px;margin-bottom:12px;box-shadow:var(--sombra-suave);">
        
        <!-- Linha 1: Filtro por tipo (Todos os tipos / Todas as categorias) -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
          <div style="flex:1;min-width:100px;">
            <select id="filtroTipoNotif" 
              style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;"
              onchange="window._notificacoesAplicarFiltros()">
              ${TIPOS_FILTRO.map(
                (op) => `
                <option value="${op.value}" ${filtros.tipo === op.value ? "selected" : ""}>
                  ${op.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button onclick="window._notificacoesToggleFiltros()" 
              style="padding:4px 10px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:${filtrosAbertos ? "var(--azul-muito-claro)" : "var(--branco)"};color:${filtrosAbertos ? "var(--azul-bandeira)" : "var(--cinza-medio)"};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
              <i class="fas fa-sliders-h" style="margin-right:4px;"></i>
              ${filtrosAbertos ? "▲" : "▼"}
            </button>
            ${
              temFiltros
                ? `
              <button onclick="window._notificacoesLimparFiltros()" 
                style="padding:4px 8px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:var(--branco);color:var(--azul-bandeira);font-size:11px;font-weight:600;cursor:pointer;">
                <i class="fas fa-times"></i>
              </button>
            `
                : ""
            }
          </div>
        </div>

        <!-- Linha 2: Filtro por status (Todas / Não lidas / Lidas) -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${[
            { value: "todas", label: "Todas" },
            { value: "nao_lidas", label: "Não lidas" },
            { value: "lidas", label: "Lidas" },
          ]
            .map(
              (op) => `
            <button onclick="document.getElementById('filtroLidaNotif').value='${op.value}'; window._notificacoesAplicarFiltros();"
              style="flex:1;padding:4px 6px;border:2px solid ${filtros.lida === op.value ? "var(--azul-bandeira)" : "var(--cinza-claro)"};border-radius:20px;font-size:10px;font-weight:${filtros.lida === op.value ? "700" : "500"};background:${filtros.lida === op.value ? "var(--azul-bandeira)" : "var(--branco)"};color:${filtros.lida === op.value ? "var(--branco)" : "var(--cinza-escuro)"};cursor:pointer;transition:all 0.2s ease;min-height:28px;">
              ${op.label}
              ${op.value === "nao_lidas" && naoLidas > 0 ? ` (${naoLidas})` : ""}
            </button>
          `,
            )
            .join("")}
        </div>

        <!-- Filtros avançados (colapsáveis) -->
        <div id="filtrosAvancadosNotif" style="display:${filtrosAbertos ? "block" : "none"};margin-top:6px;padding-top:6px;border-top:1px solid var(--cinza-claro);">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <div style="flex:1;min-width:100px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Data Início</label>
              <input type="date" id="filtroDataInicioNotif" value="${filtros.dataInicio || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._notificacoesAplicarFiltros()">
            </div>
            <div style="flex:1;min-width:100px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Data Fim</label>
              <input type="date" id="filtroDataFimNotif" value="${filtros.dataFim || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._notificacoesAplicarFiltros()">
            </div>
          </div>
          <input type="hidden" id="filtroLidaNotif" value="${filtros.lida}">
        </div>
      </div>

      <!-- ==========================================
      CONTADOR
      ========================================== -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">
        <span style="font-size:12px;color:var(--cinza-medio);font-weight:500;">
          <i class="fas fa-list" style="margin-right:4px;"></i>
          ${totalRegistros > 0 ? `Mostrando <strong>${inicio}</strong> a <strong>${fim}</strong> de <strong>${totalRegistros}</strong> notificações` : "Nenhuma notificação encontrada"}
          ${temFiltros ? `<span style="color:var(--azul-bandeira);font-weight:600;">(filtrado)</span>` : ""}
        </span>
      </div>

      <!-- ==========================================
      LISTA DE NOTIFICAÇÕES
      ========================================== -->
      <div id="listaNotificacoes">
  `;

  if (estado.carregando) {
    html += renderLoaderCards();
  } else if (notificacoes.length === 0) {
    html += renderVazio(temFiltros);
  } else {
    // 🔥 NOVO: Renderizar agrupado por data
    Object.keys(notificacoesAgrupadas).forEach((data) => {
      const items = notificacoesAgrupadas[data];
      const dataFormatada = formatarDataAgrupamento(data);

      html += `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:600;color:var(--cinza-medio);margin-bottom:6px;padding:4px 8px;background:var(--cinza-claro);border-radius:4px;display:inline-block;">
            ${dataFormatada}
          </div>
          ${items.map((notif) => renderNotificacaoItem(notif, appInstance)).join("")}
        </div>
      `;
    });
  }

  html += `
      </div>

      <!-- Paginação -->
      ${totalPaginas > 1 ? renderPaginacao(paginaAtual, totalPaginas) : ""}

      <!-- Rodapé -->
      <div style="text-align:center;padding:8px 0;color:var(--cinza-medio);font-size:11px;">
        <i class="fas fa-database" style="margin-right:4px;"></i>
        ${totalRegistros > 0 ? `Exibindo ${notificacoes.length} de ${totalRegistros} notificações` : "Nenhuma notificação cadastrada"}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar função de busca com debounce
  window._notificacoesBuscar = (termo) => {
    clearTimeout(estado._timeoutBusca);
    estado._timeoutBusca = setTimeout(() => {
      estado.filtros.busca = termo.trim();
      estado.paginaAtual = 1;
      renderNotificacoes(container, appInstance);
    }, 400);
  };

  // Atualizar badge
  atualizarBadgeNotificacoes();
}

// ============================================
// RENDERIZAÇÃO: NOTIFICAÇÃO ITEM (NOVO LAYOUT)
// ============================================

function renderNotificacaoItem(notif, appInstance) {
  const isLida = notif.lida === true;
  const tipoConfig =
    TIPOS_NOTIFICACAO_CONFIG[notif.tipo] || TIPOS_NOTIFICACAO_CONFIG.sistema;
  const dataHora = formatarDataHoraLocal(notif.criado_em);

  // 🔥 NOVO: Extrair número/identificador da mensagem
  let numero = "";
  let local = "";
  if (notif.mensagem) {
    const matchNumero = notif.mensagem.match(/#(\d+|[A-Z0-9-]+)/);
    if (matchNumero) numero = matchNumero[1];
    const matchLocal = notif.mensagem.match(/Rua\s+[A-Za-zÀ-ÿ\s,]+/i);
    if (matchLocal) local = matchLocal[0];
  }

  // 🔥 NOVO: Verificar se é uma notificação de retificação de abordagem
  const isRetificacaoAbordagem =
    notif.tipo && notif.tipo.startsWith("retificacao_abordagem");

  // 🔥 NOVO: Badge de prioridade (se houver)
  let badgePrioridade = "";
  if (notif.prioridade === "alta") {
    badgePrioridade = `<span class="badge" style="background:var(--erro);color:white;font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;">URGENTE</span>`;
  }

  // 🔥 NOVO: Link para ação
  const link = notif.link || "#";

  // 🔥 NOVO: Ícone do tipo
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
  const label = tipoConfig.label || "Notificação";

  return `
    <div class="notificacao-item ${isLida ? "lida" : "nao-lida"}" 
         data-id="${notif.id}" 
         data-link="${link}"
         style="background:${isLida ? "var(--branco)" : tipoConfig.bg};border-radius:var(--border-radius);padding:12px 14px;margin-bottom:8px;box-shadow:var(--sombra-suave);border-left:4px solid ${isLida ? "var(--cinza-claro)" : tipoConfig.borda};cursor:pointer;transition:all 0.2s ease;position:relative;">
      
      <!-- 🔥 NOVO: Indicador de não lida -->
      ${!isLida ? `<div style="position:absolute;top:12px;right:12px;width:10px;height:10px;border-radius:50%;background:var(--azul-bandeira);"></div>` : ""}
      
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <!-- Ícone -->
        <div style="width:40px;height:40px;border-radius:50%;background:${tipoConfig.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid ${tipoConfig.borda};">
          <i class="fas ${icon}" style="color:${tipoConfig.cor};font-size:16px;"></i>
        </div>
        
        <div style="flex:1;min-width:0;">
          <!-- Título e Data -->
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
              <span style="font-weight:600;font-size:13px;color:${isLida ? "var(--cinza-escuro)" : "var(--azul-bandeira)"};">
                ${notif.titulo}
              </span>
              ${numero ? `<span style="font-weight:700;font-size:12px;color:var(--azul-bandeira);">#${numero}</span>` : ""}
              ${badgePrioridade}
            </div>
            <span style="font-size:10px;color:var(--cinza-medio);flex-shrink:0;">${dataHora}</span>
          </div>
          
          <!-- Mensagem -->
          <div style="font-size:12px;color:var(--cinza-escuro);margin-top:2px;word-break:break-word;">
            ${notif.mensagem}
            ${local ? `<span style="display:block;font-size:11px;color:var(--cinza-medio);margin-top:2px;"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${local}</span>` : ""}
          </div>
          
          <!-- 🔥 NOVO: Tipo da notificação (badge) -->
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            <span style="font-size:8px;color:${tipoConfig.cor};background:${tipoConfig.bg};padding:1px 8px;border-radius:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">
              ${label}
            </span>
            ${isRetificacaoAbordagem ? `<span style="font-size:8px;color:var(--roxo);background:#ede9fe;padding:1px 8px;border-radius:10px;font-weight:600;">🚗 Abordagem</span>` : ""}
            ${!isLida ? `<span style="font-size:8px;color:var(--azul-bandeira);background:var(--azul-muito-claro);padding:1px 8px;border-radius:10px;font-weight:600;">Nova</span>` : ""}
          </div>
        </div>
      </div>
      
      <!-- 🔥 NOVO: Ações da notificação -->
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--cinza-claro);display:flex;gap:4px;flex-wrap:wrap;">
        ${
          !isLida
            ? `
          <button onclick="event.stopPropagation(); window._notificacoesMarcarUma('${notif.id}')" 
            style="flex:1;padding:4px 8px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--azul-muito-claro);color:var(--azul-bandeira);cursor:pointer;font-weight:600;">
            <i class="fas fa-check"></i> Marcar como lida
          </button>
        `
            : ""
        }
        <button onclick="event.stopPropagation(); window._notificacoesExcluir('${notif.id}')" 
          style="flex:1;padding:4px 8px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--erro-claro);color:var(--erro);cursor:pointer;font-weight:600;">
          <i class="fas fa-trash"></i> Excluir
        </button>
        ${
          link && link !== "#"
            ? `
          <button onclick="event.stopPropagation(); window._notificacoesNavegar('${link}', '${notif.id}')" 
            style="flex:1;padding:4px 8px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--verde-muito-claro);color:var(--verde-escuro);cursor:pointer;font-weight:600;">
            <i class="fas fa-arrow-right"></i> Ver detalhes
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: LOADER, VAZIO, PAGINAÇÃO
// ============================================

function renderLoaderCards() {
  let html = "";
  for (let i = 0; i < 3; i++) {
    html += `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;margin-bottom:8px;box-shadow:var(--sombra-suave);opacity:0.6;">
        <div style="display:flex;gap:12px;">
          <div style="width:40px;height:40px;background:var(--cinza-claro);border-radius:50%;flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;">
              <div style="background:var(--cinza-claro);height:14px;width:60%;border-radius:4px;"></div>
              <div style="background:var(--cinza-claro);height:10px;width:30%;border-radius:4px;"></div>
            </div>
            <div style="background:var(--cinza-claro);height:12px;width:90%;border-radius:4px;margin-top:6px;"></div>
            <div style="background:var(--cinza-claro);height:10px;width:70%;border-radius:4px;margin-top:4px;"></div>
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderVazio(temFiltros) {
  return `
    <div style="text-align:center;padding:60px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
      <div style="font-size:64px;color:var(--cinza-claro);margin-bottom:16px;">
        <i class="fas fa-bell-slash"></i>
      </div>
      <h3 style="color:var(--cinza-escuro);">Nenhuma notificação</h3>
      <p style="color:var(--cinza-medio);font-size:14px;">
        ${temFiltros ? "Nenhuma notificação encontrada com os filtros aplicados." : "Você está em dia com todas as novidades!"}
      </p>
      ${
        temFiltros
          ? `
        <button onclick="window._notificacoesLimparFiltros()" class="btn-secondary" style="margin-top:10px;">
          <i class="fas fa-undo"></i> Limpar Filtros
        </button>
      `
          : `
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;border-radius:12px;">
          <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar ao início
        </button>
      `
      }
    </div>
  `;
}

function renderPaginacao(atual, total) {
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;flex-wrap:wrap;gap:6px;">
      <div style="font-size:12px;color:var(--cinza-medio);">
        <i class="fas fa-list"></i> Página ${atual} de ${total}
      </div>
      <div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;">
  `;

  html += `
    <button onclick="window._notificacoesPagina(1)" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-double-left"></i>
    </button>
  `;

  html += `
    <button onclick="window._notificacoesPagina(${atual - 1})" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-left"></i>
    </button>
  `;

  const maxVisible = 5;
  let inicio = Math.max(1, atual - Math.floor(maxVisible / 2));
  let fim = Math.min(total, inicio + maxVisible - 1);

  if (fim - inicio < maxVisible - 1) {
    inicio = Math.max(1, fim - maxVisible + 1);
  }

  if (inicio > 1) {
    html += `<button onclick="window._notificacoesPagina(1)" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">1</button>`;
    if (inicio > 2) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
  }

  for (let i = inicio; i <= fim; i++) {
    html += `
      <button onclick="window._notificacoesPagina(${i})" 
        style="padding:4px 8px;border:1px solid ${i === atual ? "var(--azul-bandeira)" : "var(--cinza-claro)"};border-radius:6px;background:${i === atual ? "var(--azul-bandeira)" : "var(--branco)"};color:${i === atual ? "var(--branco)" : "var(--cinza-escuro)"};font-size:12px;cursor:pointer;min-height:30px;min-width:30px;font-weight:${i === atual ? "700" : "400"};">
        ${i}
      </button>
    `;
  }

  if (fim < total) {
    if (fim < total - 1) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
    html += `<button onclick="window._notificacoesPagina(${total})" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">${total}</button>`;
  }

  html += `
    <button onclick="window._notificacoesPagina(${atual + 1})" ${atual >= total ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual >= total ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-right"></i>
    </button>
  `;

  html += `
    <button onclick="window._notificacoesPagina(${total})" ${atual >= total ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual >= total ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-double-right"></i>
    </button>
  `;

  html += `
      </div>
    </div>
  `;

  return html;
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

  // Marcar como lida ao navegar
  if (id) {
    marcarUmaComoLida(
      id,
      document.getElementById("listaNotificacoes")?.parentElement,
      appInstance,
    );
  }

  // Extrair página do link
  const url = new URL(link, window.location.href);
  const page = url.hash.replace("#", "");

  if (page && appInstance.navigateTo) {
    // Extrair parâmetros
    const params = {};
    if (url.search) {
      const searchParams = new URLSearchParams(url.search);
      searchParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    // Se tiver id, navegar para detalhe
    if (params.id && page === "detalhe-ocorrencia") {
      appInstance.navigateTo(page, { id: params.id });
    } else if (page) {
      appInstance.navigateTo(page);
    } else {
      appInstance.showToast("Página não encontrada", "warning");
    }
  } else {
    appInstance.showToast("Link não disponível", "info");
  }
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltros(container, appInstance) {
  const tipo = document.getElementById("filtroTipoNotif")?.value || "todos";
  const lida = document.getElementById("filtroLidaNotif")?.value || "todas";
  const dataInicio =
    document.getElementById("filtroDataInicioNotif")?.value || "";
  const dataFim = document.getElementById("filtroDataFimNotif")?.value || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    appInstance.showToast(
      "Data final deve ser maior ou igual à data inicial",
      "warning",
    );
    return;
  }

  estado.filtros = { tipo, lida, dataInicio, dataFim };
  estado.paginaAtual = 1;

  carregarNotificacoes(1).then(() => {
    renderizarLista(container, appInstance);
  });
}

export function limparFiltros(container, appInstance) {
  estado.filtros = {
    tipo: "todos",
    dataInicio: "",
    dataFim: "",
    lida: "todas",
  };
  estado.paginaAtual = 1;

  const fields = [
    "filtroTipoNotif",
    "filtroLidaNotif",
    "filtroDataInicioNotif",
    "filtroDataFimNotif",
  ];
  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  carregarNotificacoes(1).then(() => {
    renderizarLista(container, appInstance);
  });

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
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data, error } = await client
      .from("notificacoes")
      .select("id", { count: "exact" })
      .eq("usuario_id", user.id)
      .eq("lida", false);

    if (error) throw error;

    const count = data?.length || 0;

    // Badge no bottom nav
    const badgeNav = document.getElementById("badge-notificacoes");
    if (badgeNav) {
      if (count > 0) {
        badgeNav.textContent = count > 9 ? "9+" : count;
        badgeNav.style.display = "flex";
      } else {
        badgeNav.style.display = "none";
      }
    }

    // Badge no bottom sheet
    const badgeSheet = document.getElementById("sheetBadgeNotificacoes");
    if (badgeSheet) {
      if (count > 0) {
        badgeSheet.textContent = count > 9 ? "9+" : count;
        badgeSheet.style.display = "inline";
      } else {
        badgeSheet.style.display = "none";
      }
    }

    return count;
  } catch (error) {
    console.warn("Erro ao atualizar badge de notificações:", error);
    return 0;
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
