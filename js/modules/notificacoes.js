/**
 * MÓDULO NOTIFICAÇÕES
 * Guarda Municipal de Pitangueiras - PR
 *
 * Sistema completo de notificações para:
 * - Nova ocorrência
 * - Nova abordagem
 * - Novo aviso no mural
 * - Retificações (para supervisor)
 * - Retificações de abordagens (para supervisor) 🔥 NOVO
 * - Resultados de notificações para o GM
 *
 * MELHORIAS APLICADAS:
 * - 🔥 NOVO: Suporte a retificações de abordagens
 * - 🔥 NOVO: Notificações para retificações de abordagens pendentes
 * - 🔥 NOVO: Notificações para aprovação/rejeição de retificações de abordagens
 * - 🔥 NOVO: Método listarNotificacoes com suporte a filtros
 * - 🔥 NOVO: Método getStats para estatísticas de notificações
 * - 🔥 NOVO: Cache de notificações não lidas
 * - 🔥 NOVO: Verificação periódica de notificações
 * - 🔥 CORRIGIDO: Instância global com fallback
 *
 * Depende de: authManager (global), supabaseClient (global)
 */

// ============================================
// CONSTANTES
// ============================================

const TIPOS_NOTIFICACAO = {
  NOVA_OCORRENCIA: "nova_ocorrencia",
  NOVA_ABORDAGEM: "nova_abordagem",
  NOVO_MURAL: "novo_mural",
  RETIFICACAO_PENDENTE: "retificacao_pendente",
  RETIFICACAO_APROVADA: "retificacao_aprovada",
  RETIFICACAO_REJEITADA: "retificacao_rejeitada",
  // 🔥 NOVO: Tipos para retificações de abordagens
  RETIFICACAO_ABORDAGEM_PENDENTE: "retificacao_abordagem_pendente",
  RETIFICACAO_ABORDAGEM_APROVADA: "retificacao_abordagem_aprovada",
  RETIFICACAO_ABORDAGEM_REJEITADA: "retificacao_abordagem_rejeitada",
  SISTEMA: "sistema",
};

// 🔥 NOVO: Configuração de tipos para exibição
const TIPOS_CONFIG = {
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

const PRIORIDADES = {
  ALTA: "alta",
  MEDIA: "media",
  BAIXA: "baixa",
};

const NOTIFICACOES_CACHE_KEY = "notificacoes_nao_lidas";
const NOTIFICACOES_CACHE_EXPIRY = 60000; // 1 minuto
const NOTIFICACOES_VERIFICACAO_INTERVALO = 30000; // 30 segundos

// ============================================
// CLASSE NOTIFICACOES
// ============================================

class Notificacoes {
  constructor() {
    this.initialized = false;
    this.notificacoesNaoLidas = 0;
    this.ultimaVerificacao = null;
    this.intervalo = null;
    this.callbacks = [];
    this.cache = {
      naoLidas: 0,
      ultimaAtualizacao: 0,
    };
    this.tiposConfig = TIPOS_CONFIG;
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return;

    this.initialized = true;
    this.ultimaVerificacao = new Date();

    // Carregar notificações não lidas
    await this.carregarNaoLidas();

    // Iniciar verificação periódica (a cada 30 segundos)
    this.intervalo = setInterval(() => {
      this.verificarNovasNotificacoes();
    }, NOTIFICACOES_VERIFICACAO_INTERVALO);

    // Configurar listeners para eventos em tempo real (via Service Worker)
    this.configurarListeners();

    console.log("✅ Sistema de Notificações inicializado");
  }

  // ============================================
  // CARREGAR NOTIFICAÇÕES NÃO LIDAS
  // ============================================

  async carregarNaoLidas() {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      // Verificar cache primeiro
      const agora = Date.now();
      if (
        this.cache.naoLidas > 0 &&
        agora - this.cache.ultimaAtualizacao < NOTIFICACOES_CACHE_EXPIRY
      ) {
        this.notificacoesNaoLidas = this.cache.naoLidas;
        this.atualizarBadge();
        return;
      }

      const { data, error } = await client
        .from("notificacoes")
        .select("id")
        .eq("usuario_id", user.id)
        .eq("lida", false);

      if (error) throw error;

      this.notificacoesNaoLidas = data?.length || 0;
      this.cache.naoLidas = this.notificacoesNaoLidas;
      this.cache.ultimaAtualizacao = agora;

      // Salvar no localStorage
      try {
        // Contagem mantida apenas em memória; não persistir atividade do usuário.
      } catch (e) {}

      this.atualizarBadge();
    } catch (error) {
      console.warn("Erro ao carregar notificações não lidas:", error);

      // Tentar recuperar do localStorage
      try {
        localStorage.removeItem(NOTIFICACOES_CACHE_KEY);
      } catch (e) {}
    }
  }

  // ============================================
  // VERIFICAR NOVAS NOTIFICAÇÕES
  // ============================================

  async verificarNovasNotificacoes() {
    try {
      const user = authManager.getUser();
      if (!user) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      const { data, error } = await client
        .from("notificacoes")
        .select("id")
        .eq("usuario_id", user.id)
        .eq("lida", false)
        .gt(
          "criado_em",
          globalThis.obterTimestampBrasilSemFuso(this.ultimaVerificacao) || new Date(0).toISOString(),
        );

      if (error) throw error;

      if (data && data.length > 0) {
        this.notificacoesNaoLidas += data.length;
        this.cache.naoLidas = this.notificacoesNaoLidas;
        this.cache.ultimaAtualizacao = Date.now();

        // Atualizar localStorage
        try {
          localStorage.removeItem(NOTIFICACOES_CACHE_KEY);
        } catch (e) {}

        this.atualizarBadge();

        // Notificar o usuário
        this.notificarUsuario(data.length);
      }

      this.ultimaVerificacao = new Date();
    } catch (error) {
      console.warn("Erro ao verificar novas notificações:", error);
    }
  }

  // ============================================
  // NOTIFICAR NOVA OCORRÊNCIA
  // ============================================

  async notificarNovaOcorrencia(ocorrencia) {
    try {
      const client = supabaseClient.getClient();
      if (!client || !ocorrencia?.id || ocorrencia.ocorrencia_original_id) return;
      const { error } = await client.rpc("gm_emit_notification", {
        p_event: "new_occurrence",
        p_record_id: ocorrencia.id,
        p_entity: null,
      });
      if (error) console.warn("Erro ao emitir notificação de ocorrência:", error);
    } catch (error) {
      console.warn("Erro ao emitir notificação de ocorrência:", error);
    }
  }

  // ============================================
  // NOTIFICAR NOVA ABORDAGEM
  // ============================================

  async notificarNovaAbordagem(abordagem, tipo) {
    try {
      const client = supabaseClient.getClient();
      if (!client || !abordagem?.id || abordagem.abordagem_original_id || !["veiculo", "pessoa"].includes(tipo)) return;
      const { error } = await client.rpc("gm_emit_notification", {
        p_event: "new_approach",
        p_record_id: abordagem.id,
        p_entity: tipo,
      });
      if (error) console.warn("Erro ao emitir notificação de abordagem:", error);
    } catch (error) {
      console.warn("Erro ao emitir notificação de abordagem:", error);
    }
  }

  // ============================================
  // NOTIFICAR NOVO AVISO NO MURAL
  // ============================================

  async notificarNovoMural(aviso) {
    try {
      const client = supabaseClient.getClient();
      if (!client || !aviso?.id) return;
      const { error } = await client.rpc("gm_emit_notification", {
        p_event: "new_mural",
        p_record_id: aviso.id,
        p_entity: null,
      });
      if (error) console.warn("Erro ao emitir notificação do mural:", error);
    } catch (error) {
      console.warn("Erro ao emitir notificação do mural:", error);
    }
  }

  // ============================================
  // NOTIFICAR RETIFICAÇÃO (BO)
  // ============================================

  async notificarRetificacao(retificacao, tipo, entidade) {
    try {
      const client = supabaseClient.getClient();
      if (!client || !retificacao?.id) return;
      const pendente = tipo === "pendente";
      const { error } = await client.rpc("gm_emit_notification", {
        p_event: pendente ? "occurrence_retification_pending" : "occurrence_retification_decided",
        p_record_id: retificacao.id,
        p_entity: null,
      });
      if (error) console.warn("Erro ao emitir notificação de retificação:", error);
    } catch (error) {
      console.warn("Erro ao emitir notificação de retificação:", error);
    }
  }

  // ============================================
  // 🔥 NOVO: NOTIFICAR RETIFICAÇÃO DE ABORDAGEM
  // ============================================

  async notificarRetificacaoAbordagem(retificacao, tipo, entidade) {
    try {
      const client = supabaseClient.getClient();
      if (!client || !retificacao?.id || !["veiculo", "pessoa"].includes(entidade)) return;
      const { error } = await client.rpc("gm_emit_notification", {
        p_event: tipo === "pendente" ? "approach_retification_pending" : "approach_retification_decided",
        p_record_id: retificacao.id,
        p_entity: entidade,
      });
      if (error) console.warn("Erro ao emitir notificação de retificação de abordagem:", error);
    } catch (error) {
      console.warn("Erro ao emitir notificação de retificação de abordagem:", error);
    }
  }

  // ============================================
  // 🔥 NOVO: LISTAR NOTIFICAÇÕES COM FILTROS
  // ============================================

  async listarNotificacoes(filtros = {}) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

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

      if (filtros.data_inicio) {
        query = query.gte("criado_em", filtros.data_inicio);
      }

      if (filtros.data_fim) {
        query = query.lte("criado_em", filtros.data_fim + "T23:59:59");
      }

      if (filtros.limit) {
        query = query.limit(filtros.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Erro ao listar notificações:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // MARCAR NOTIFICAÇÃO COMO LIDA
  // ============================================

  async marcarComoLida(id) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("notificacoes")
        .update({
          lida: true,
          lida_em: globalThis.obterTimestampBrasilSemFuso(),
        })
        .eq("id", id)
        .eq("usuario_id", user.id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar contador
      this.notificacoesNaoLidas = Math.max(0, this.notificacoesNaoLidas - 1);
      this.cache.naoLidas = this.notificacoesNaoLidas;
      this.cache.ultimaAtualizacao = Date.now();

      // Atualizar localStorage
      try {
        localStorage.removeItem(NOTIFICACOES_CACHE_KEY);
      } catch (e) {}

      this.atualizarBadge();

      return { success: true, data };
    } catch (error) {
      console.error("Erro ao marcar notificação como lida:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // MARCAR TODAS COMO LIDAS
  // ============================================

  async marcarTodasComoLidas() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { data, error } = await client
        .from("notificacoes")
        .update({
          lida: true,
          lida_em: globalThis.obterTimestampBrasilSemFuso(),
        })
        .eq("usuario_id", user.id)
        .eq("lida", false)
        .select();

      if (error) throw error;

      this.notificacoesNaoLidas = 0;
      this.cache.naoLidas = 0;
      this.cache.ultimaAtualizacao = Date.now();

      // Contagem de notificações permanece somente em memória.

      this.atualizarBadge();

      return { success: true, data: data || [] };
    } catch (error) {
      console.error("Erro ao marcar todas notificações como lidas:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // EXCLUIR NOTIFICAÇÃO
  // ============================================

  async excluirNotificacao(id) {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar ao servidor" };
      }

      const { error } = await client
        .from("notificacoes")
        .delete()
        .eq("id", id)
        .eq("usuario_id", user.id);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error("Erro ao excluir notificação:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // 🔥 NOVO: OBTÉM ESTATÍSTICAS DE NOTIFICAÇÕES
  // ============================================

  async getStats() {
    try {
      const user = authManager.getUser();
      if (!user) {
        return { success: false, error: "Usuário não autenticado" };
      }

      const client = supabaseClient.getClient();
      if (!client) {
        return { success: false, error: "Erro ao conectar" };
      }

      const { data, error } = await client
        .from("notificacoes")
        .select("*")
        .eq("usuario_id", user.id);

      if (error) throw error;

      const total = data?.length || 0;
      const naoLidas = data?.filter((n) => !n.lida).length || 0;
      const lidas = total - naoLidas;

      // Agrupar por tipo
      const porTipo = {};
      data?.forEach((n) => {
        if (!porTipo[n.tipo]) porTipo[n.tipo] = 0;
        porTipo[n.tipo]++;
      });

      // 🔥 NOVO: Agrupar por data (últimos 30 dias)
      const porData = {};
      const trintaDias = new Date();
      trintaDias.setDate(trintaDias.getDate() - 30);
      const dataLimite = globalThis.obterTimestampBrasilSemFuso(trintaDias);

      data?.forEach((n) => {
        if (n.criado_em >= dataLimite) {
          const dataKey = n.criado_em.slice(0, 10);
          if (!porData[dataKey]) porData[dataKey] = 0;
          porData[dataKey]++;
        }
      });

      return {
        success: true,
        data: {
          total,
          naoLidas,
          lidas,
          porTipo,
          porData,
          ultimaNotificacao: data?.length > 0 ? data[0].criado_em : null,
        },
      };
    } catch (error) {
      console.error("Erro ao obter stats de notificações:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // 🔥 NOVO: OBTÉM CONFIGURAÇÃO DE TIPO
  // ============================================

  getTipoConfig(tipo) {
    return this.tiposConfig[tipo] || this.tiposConfig.sistema;
  }

  // ============================================
  // BADGE - ATUALIZAR
  // ============================================

  atualizarBadge() {
    // Badge no bottom nav
    const badgeNav = document.getElementById("badge-notificacoes");
    if (badgeNav) {
      if (this.notificacoesNaoLidas > 0) {
        badgeNav.textContent =
          this.notificacoesNaoLidas > 9 ? "9+" : this.notificacoesNaoLidas;
        badgeNav.style.display = "flex";
      } else {
        badgeNav.style.display = "none";
      }
    }

    // Badge no bottom sheet
    const badgeSheet = document.getElementById("sheetBadgeNotificacoes");
    if (badgeSheet) {
      if (this.notificacoesNaoLidas > 0) {
        badgeSheet.textContent =
          this.notificacoesNaoLidas > 9 ? "9+" : this.notificacoesNaoLidas;
        badgeSheet.style.display = "inline";
      } else {
        badgeSheet.style.display = "none";
      }
    }

    // Atualizar favicon badge (opcional)
    this.atualizarFaviconBadge();

    // Notificar listeners
    this.notifyListeners("badge_update", {
      count: this.notificacoesNaoLidas,
    });
  }

  // ============================================
  // FAVICON BADGE (Opcional)
  // ============================================

  atualizarFaviconBadge() {
    // Este é um recurso opcional e avançado
    // Pode ser implementado com canvas para desenhar o badge no favicon
  }

  // ============================================
  // NOTIFICAR USUÁRIO (Toast)
  // ============================================

  notificarUsuario(quantidade) {
    if (window.app && window.app.showToast) {
      window.app.showToast(`🔔 ${quantidade} nova(s) notificação(ões)`, "info");
    }
  }

  // ============================================
  // NOTIFICAÇÃO PUSH (via Service Worker)
  // ============================================

  enviarPushNotificacao(titulo, mensagem) {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      // Verifica se o navegador suporta notificações push
      if (!registration.pushManager) return;

      registration.showNotification(titulo, {
        body: mensagem,
        icon: "/assets/icons/icon-192x192.png",
        badge: "/assets/icons/icon-192x192.png",
        vibrate: [200, 100, 200],
        data: {
          date: globalThis.obterTimestampBrasilSemFuso(),
        },
        actions: [
          {
            action: "open",
            title: "Abrir",
          },
          {
            action: "dismiss",
            title: "Dispensar",
          },
        ],
      });
    });
  }

  // ============================================
  // LISTENERS
  // ============================================

  configurarListeners() {
    // Listener para mensagens do Service Worker
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data && event.data.type === "NOTIFICATION") {
        this.notificacoesNaoLidas++;
        this.cache.naoLidas = this.notificacoesNaoLidas;
        this.cache.ultimaAtualizacao = Date.now();
        this.atualizarBadge();
        this.notificarUsuario(1);
      }
    });

    // Listener para quando o usuário clica em uma notificação
    document.addEventListener("click", (e) => {
      const notifItem = e.target.closest(".notificacao-item");
      if (notifItem) {
        const id = notifItem.dataset.id;
        const link = notifItem.dataset.link;
        if (id) {
          this.marcarComoLida(id);
        }
        if (link && window.app) {
          // Navegar para o link
          const url = new URL(link, window.location.href);
          window.app.navigateTo(url.hash.replace("#", ""));
        }
      }
    });

    // Listener para mudanças de conexão
    window.addEventListener("online", () => {
      console.log("🌐 Conexão restaurada, verificando notificações...");
      this.verificarNovasNotificacoes();
    });

    // Listener para mudanças no auth
    if (typeof authManager !== "undefined") {
      authManager.onAuthChange((event) => {
        if (event === "login") {
          this.carregarNaoLidas();
        } else if (event === "logout") {
          this.notificacoesNaoLidas = 0;
          this.cache.naoLidas = 0;
          this.atualizarBadge();
        }
      });
    }
  }

  // ============================================
  // 🔥 NOVO: ADICIONAR LISTENER
  // ============================================

  addListener(callback) {
    if (typeof callback === "function") {
      this.callbacks.push(callback);
    }
  }

  // ============================================
  // 🔥 NOVO: NOTIFICAR LISTENERS
  // ============================================

  notifyListeners(event, data) {
    this.callbacks.forEach((cb) => {
      try {
        cb(event, data);
      } catch (e) {
        console.warn("Erro no listener:", e);
      }
    });
  }

  // ============================================
  // DESTROY
  // ============================================

  destroy() {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
    this.initialized = false;
    this.callbacks = [];
    console.log("🧹 Sistema de Notificações destruído");
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

let notificacoesInstance = null;

function getNotificacoesInstance() {
  if (!notificacoesInstance) {
    notificacoesInstance = new Notificacoes();
  }
  return notificacoesInstance;
}

// 🔥 Criar a instância global
const notificacoes = getNotificacoesInstance();

// Expor globalmente
if (typeof window !== "undefined") {
  window.notificacoes = notificacoes;
  window.Notificacoes = Notificacoes;
}

console.log("🔔 Sistema de Notificações carregado");
console.log(
  `📊 Notificações não lidas: ${notificacoes.notificacoesNaoLidas || 0}`,
);

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA (se authManager já estiver disponível)
// ============================================

if (typeof authManager !== "undefined" && authManager.isLoggedIn()) {
  setTimeout(() => {
    notificacoes.init();
  }, 1000);
}

// ============================================
// EXPORTAÇÕES (para módulos ES6)
// ============================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Notificacoes, notificacoes, TIPOS_CONFIG };
}

// ============================================
// EXPORTAÇÕES PARA WINDOW (para uso em scripts não-module)
// ============================================

if (typeof window !== "undefined") {
  window.TIPOS_NOTIFICACAO_CONFIG = TIPOS_CONFIG;
  window.getNotificacoes = getNotificacoesInstance;
}

console.log("📋 Notificacoes.js carregado com sucesso");
console.log(
  `🔔 Tipos de notificação configurados: ${Object.keys(TIPOS_CONFIG).length}`,
);
