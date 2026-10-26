/**
 * APP - Orquestrador Principal
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este é o ponto de entrada da aplicação. Ele gerencia:
 * - Inicialização do sistema
 * - Roteamento entre páginas
 * - Estado global da aplicação
 * - Eventos principais (login, logout, navegação)
 * - Integração com todos os módulos
 *
 * MELHORIAS APLICADAS:
 * - Fuso horário corrigido (prioridade: internet > dispositivo)
 * - Logs periciais automáticos em ações críticas
 * - Cache de dados estáticos em localStorage
 * - GPS contínuo para localização automática
 * - Debounce em buscas e eventos
 * - Gestos de deslize entre abas (mobile)
 * - 🔥 NOVO: Página de Notificações
 * - 🔥 NOVO: Roteamento para novas páginas
 * - 🔥 NOVO: Badge de notificações no bottom nav
 * - 🔥 REMOVIDO: FAB Contextual (botão flutuante removido)
 * - 🔥 CORRIGIDO: Data/Hora agora usa APENAS o horário do dispositivo, SEM ajuste de fuso
 *
 * Depende de: authManager, supabaseClient, ocorrenciaManager,
 *             sessionManager e todos os módulos em /modules/
 */

// ============================================
// IMPORTAÇÕES DOS MÓDULOS
// ============================================

import * as ui from "./modules/ui.js";
import * as utils from "./modules/utils.js";
import * as dashboard from "./modules/dashboard.js";
import * as consulta from "./modules/consulta.js";
import * as mural from "./modules/mural.js";
import * as relatorios from "./modules/relatorios.js";
import * as usuarios from "./modules/usuarios.js";
import * as perfil from "./modules/perfil.js";
import * as logs from "./modules/logs.js";
import * as adminGovernanca from "./modules/admin-governanca.js";
// A importação do busca-profunda.js é feita dinamicamente pelo dashboard.js

// ============================================
// CONSTANTES
// ============================================

const CACHE_KEYS = {
  TIPOS_OCORRENCIA: "tipos_ocorrencia",
  USUARIOS: "usuarios",
  CONFIGURACOES: "configuracoes",
  STATS: "stats",
};

const CACHE_EXPIRY = 3600000; // 1 hora

function sincronizarTemaSistema() {
  const media = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  if (!media || !document.body) return;

  const aplicarTema = (evento) => {
    document.body.classList.toggle("dark-mode", Boolean(evento.matches));
  };
  aplicarTema(media);

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", aplicarTema);
  } else if (typeof media.addListener === "function") {
    media.addListener(aplicarTema);
  }
}

// ============================================
// CLASSE APP
// ============================================

class App {
  constructor() {
    this.currentPage = "login";
    this.initialized = false;
    this.currentParams = null;
    this.paginaDestino = null;
    this.paramsDestino = null;
    this.gpsWatchId = null;
    this.ultimaLocalizacao = null;

    sincronizarTemaSistema();

    // Estado para nova ocorrência
    this.novaOcorrencia = null;
    this.rascunhoId = null;
    this.dadosRascunho = null;
    this.alteracoesNaoSalvas = false;

    // Estado para filtros
    this.filtroStatusAtual = null;
    this.filtrosOcorrencias = { status: "", dataInicio: "", dataFim: "" };
    this.filtrosMural = {
      busca: "",
      tipo: "todos",
      dataInicio: "",
      dataFim: "",
    };
    this.filtrosConsulta = {
      dataInicio: "",
      dataFim: "",
      guarda: "",
      tipo: "todos",
    };
    this.filtrosLogs = {};

    // Mapeamento de páginas
    this.pages = {
      login: { element: "page-login", showHeader: false, showNav: false },
      dashboard: { element: "page-dashboard", showHeader: true, showNav: true },
      ocorrencias: {
        element: "page-ocorrencias",
        showHeader: true,
        showNav: true,
      },
      "nova-ocorrencia": {
        element: "page-nova-ocorrencia",
        showHeader: true,
        showNav: true,
      },
      "detalhe-ocorrencia": {
        element: "page-detalhe-ocorrencia",
        showHeader: true,
        showNav: true,
      },
      retificacoes: {
        element: "page-retificacoes",
        showHeader: true,
        showNav: true,
      },
      // 🔥 NOVO: Retificações de Abordagens
      "retificacoes-abordagens": {
        element: "page-retificacoes",
        showHeader: true,
        showNav: true,
      },
      relatorios: {
        element: "page-relatorios",
        showHeader: true,
        showNav: true,
      },
      logs: { element: "page-logs", showHeader: true, showNav: true },
      usuarios: { element: "page-usuarios", showHeader: true, showNav: true },
      "admin-governanca": { element: "page-admin-governanca", showHeader: true, showNav: true },
      perfil: { element: "page-perfil", showHeader: true, showNav: true },
      consulta: { element: "page-consulta", showHeader: true, showNav: true },
      mural: { element: "page-mural", showHeader: true, showNav: true },
      // 🔥 NOVO: Notificações
      notificacoes: {
        element: "page-notificacoes",
        showHeader: true,
        showNav: true,
      },
    };

    // Tipos de ocorrência (usado em várias partes)
    this.TIPOS_OCORRENCIA = [
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

    // Debounced functions
    this.debouncedBuscar = utils.debounce(this.executarBusca.bind(this), 500);
    this.debouncedSalvarRascunho = utils.debounce(
      this.salvarRascunho.bind(this),
      1000,
    );
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return;

    console.log("🚀 Iniciando aplicação...");

    try {
      // Verificar dependências
      if (typeof authManager === "undefined") {
        throw new Error("authManager não definido!");
      }
      if (typeof authManager.isLoggedIn !== "function") {
        throw new Error("authManager.isLoggedIn não é uma função!");
      }

      // Inicializar serviços
      await supabaseClient.init();
      console.log("✅ Supabase inicializado");

      await authManager.init();
      console.log("✅ AuthManager inicializado");

      await ocorrenciaManager.init();
      console.log("✅ Ocorrência Manager inicializado");

      // Inicializar UI
      ui.initUI();
      console.log("✅ UI inicializado");

      // Inicializar sessão
      sessionManager.init(30);
      console.log("✅ Session Manager inicializado");

      // Carregar cache de dados estáticos
      this.carregarDadosEstaticos();

      // Iniciar GPS contínuo
      this.iniciarGPS();

      // Configurar listeners
      this.setupListeners();

      // Se já estiver logado, atualizar header e carregar rascunho
      if (authManager.isLoggedIn()) {
        this.atualizarHeader();
        await this.carregarRascunho();
        sessionManager.resetSession();
        await ui.atualizarBadgeMural();
      }

      // Roteamento inicial
      await this.route();

      this.initialized = true;
      console.log("✅ Aplicação inicializada com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao iniciar:", error);
      this.mostrarErro(error.message);
    }
  }

  // ============================================
  // CACHE DE DADOS ESTÁTICOS
  // ============================================

  carregarDadosEstaticos() {
    console.log("📦 Carregando dados estáticos do cache...");

    // Carregar tipos de ocorrência do cache
    const tiposCache = utils.getCachedData(CACHE_KEYS.TIPOS_OCORRENCIA);
    if (Array.isArray(tiposCache)) {
      const tiposAtualizados = tiposCache.map((tipo) =>
        tipo?.value === "flagrante" ? { ...tipo, label: "Flagrante" } : tipo,
      );
      if (!tiposAtualizados.some((tipo) => tipo?.value === "flagrante")) {
        tiposAtualizados.push({ value: "flagrante", label: "Flagrante" });
      }
      this.TIPOS_OCORRENCIA = tiposAtualizados;
      utils.setCachedData(CACHE_KEYS.TIPOS_OCORRENCIA, tiposAtualizados);
      console.log("✅ Tipos de ocorrência carregados do cache");
    } else {
      // Salvar no cache para uso futuro; não altera outros dados locais.
      utils.setCachedData(CACHE_KEYS.TIPOS_OCORRENCIA, this.TIPOS_OCORRENCIA);
    }
  }

  // ============================================
  // GPS CONTÍNUO
  // ============================================

  iniciarGPS() {
    console.log("📍 Iniciando GPS contínuo...");

    if (!navigator.geolocation) {
      console.warn("⚠️ Geolocalização não disponível");
      return;
    }

    // Opções do GPS
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    };

    // Iniciar watchPosition
    this.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.ultimaLocalizacao = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        // Notificar outros módulos se necessário
        this.notificarMudancaLocalizacao(this.ultimaLocalizacao);
      },
      (error) => {
        console.warn("⚠️ Erro no GPS:", error.message);
      },
      options,
    );

    console.log("✅ GPS contínuo iniciado");
  }

  notificarMudancaLocalizacao(localizacao) {
    // Emitir evento para outros módulos
    const event = new CustomEvent("localizacao_atualizada", {
      detail: localizacao,
    });
    document.dispatchEvent(event);

    // Atualizar sessão se houver movimento significativo (estender sessão)
    if (this.ultimaLocalizacao && localizacao) {
      const distancia = utils.calcularDistancia(
        this.ultimaLocalizacao.latitude,
        this.ultimaLocalizacao.longitude,
        localizacao.latitude,
        localizacao.longitude,
      );
      // Se moveu mais de 100 metros, estender sessão
      if (distancia > 100) {
        sessionManager.resetSession();
        console.log("🔄 Sessão estendida devido a movimento detectado");
      }
    }
  }

  obterLocalizacaoAtual() {
    return this.ultimaLocalizacao || null;
  }

  // ============================================
  // ROTEAMENTO
  // ============================================

  async route() {
    if (
      typeof authManager === "undefined" ||
      typeof authManager.isLoggedIn !== "function"
    ) {
      console.error("❌ AuthManager inválido para roteamento");
      this.showPage("login");
      return;
    }

    const isLoggedIn = authManager.isLoggedIn();

    if (!isLoggedIn) {
      this.showPage("login");
      return;
    }

    if (authManager.isPrimeiroAcesso()) {
      this.showPrimeiroAcesso();
      return;
    }

    const page = this.getCurrentPageFromURL();
    this.navigateTo(page);
  }

  getCurrentPageFromURL() {
    const hash = window.location.hash.replace("#", "");
    return this.pages[hash] ? hash : "dashboard";
  }

  navigateTo(page, params = null) {
    // Se estiver na página de nova ocorrência com alterações não salvas
    if (this.currentPage === "nova-ocorrencia" && this.alteracoesNaoSalvas) {
      this.paginaDestino = page;
      this.paramsDestino = params;
      this.perguntarSalvarRascunho(page);
      return;
    }

    this.executarNavegacao(page, params);
  }

  executarNavegacao(page, params = null) {
    // Verificar autenticação
    if (!authManager.isLoggedIn() && page !== "login") {
      this.showPage("login");
      return;
    }

    // Validar página
    if (!this.pages[page]) page = "dashboard";

    // Salvar parâmetros
    if (params) {
      this.currentParams = params;
    } else {
      this.currentParams = null;
    }

    // Limpar filtro de status se não for dashboard
    if (page !== "dashboard") {
      this.filtroStatusAtual = null;
    }

    // Verificar permissões para páginas restritas
    if (["usuarios", "logs", "admin-governanca"].includes(page) && !authManager.isAdministrador()) {
      this.showToast("Acesso restrito ao administrador do sistema", "warning");
      page = "dashboard";
    }
    if (["relatorios"].includes(page) && !authManager.podeAcessarRelatorios()) {
      this.showToast("Acesso restrito a usuários autenticados", "warning");
      page = "dashboard";
    }
    if (["retificacoes", "retificacoes-abordagens"].includes(page) && !authManager.isSupervisor()) {
      this.showToast("Acesso restrito ao supervisor operacional", "warning");
      page = "dashboard";
    }

    this.currentPage = page;
    window.location.hash = page;
    this.showPage(page);
    this.updateBottomNav(page);
    this.loadPageContent(page);
  }

  showPage(page) {
    // Ocultar todas as páginas
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.remove("active");
      el.style.display = "none";
    });

    // Mostrar a página solicitada
    const pageId = this.pages[page]?.element || `page-${page}`;
    const element = document.getElementById(pageId);
    if (element) {
      element.style.display = "block";
      void element.offsetWidth; // Trigger reflow
      element.classList.add("active");
    }

    // Atualizar header e bottom nav
    const header = document.getElementById("app-header");
    const bottomNav = document.getElementById("bottom-nav");
    const config = this.pages[page];

    if (config) {
      header.style.display = config.showHeader ? "flex" : "none";
      header.classList.toggle("active", config.showHeader);
      bottomNav.style.display = config.showNav ? "flex" : "none";
      bottomNav.classList.toggle("active", config.showNav);
    }

    // Fechar bottom sheet
    ui.closeBottomSheet();

    // 🔥 REMOVIDO: FAB Contextual (botão flutuante removido)
    // ui.atualizarFAB(page);
  }

  updateBottomNav(page) {
    const sectionByPage = {
      dashboard: "home",
      ocorrencias: "occurrences",
      "nova-ocorrencia": "occurrences",
      "detalhe-ocorrencia": "occurrences",
      consulta: "approaches",
      "retificacoes": "more",
      "retificacoes-abordagens": "more",
      mural: "more",
      notificacoes: "more",
      relatorios: "more",
      logs: "more",
      usuarios: "more",
      "admin-governanca": "more",
      perfil: "more",
    };
    const activeSection = sectionByPage[page] || "home";
    document.querySelectorAll(".nav-item[data-nav-section]").forEach((item) => {
      const isActive = item.dataset.navSection === activeSection;
      item.classList.toggle("active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  async loadPageContent(page) {
    const containerId = this.pages[page]?.element || `page-${page}`;
    const container = document.getElementById(containerId);

    if (!container) return;

    // Mostrar loader
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:12px;color:var(--cinza-medio);">Carregando...</p>
      </div>
    `;

    try {
      switch (page) {
        case "dashboard":
          await dashboard.renderDashboard(container, this);
          break;

        case "ocorrencias":
          await this.renderOcorrencias(container);
          break;

        case "nova-ocorrencia":
          await this.renderNovaOcorrencia(container);
          break;

        case "detalhe-ocorrencia":
          await this.renderDetalheOcorrencia(container);
          break;

        case "retificacoes":
          await this.renderRetificacoes(container);
          break;

        // 🔥 NOVO: Retificações de Abordagens
        case "retificacoes-abordagens":
          await this.renderRetificacoesAbordagens(container);
          break;

        case "relatorios":
          await relatorios.renderRelatorios(container, this);
          break;

        case "logs":
          await adminGovernanca.renderAdminGovernanca(container, this);
          break;

        case "usuarios":
          await adminGovernanca.renderAdminGovernanca(container, this);
          break;

        case "admin-governanca":
          await adminGovernanca.renderAdminGovernanca(container, this);
          break;

        case "perfil":
          await perfil.renderPerfil(container, this);
          break;

        case "consulta":
          await consulta.renderConsultaOperacional(container, this);
          break;

        case "mural":
          await mural.renderMural(container, this);
          break;

        // 🔥 NOVO: Notificações
        case "notificacoes":
          await this.renderNotificacoes(container);
          break;

        default:
          container.innerHTML = `<h2>Página ${page} em desenvolvimento</h2>`;
      }
    } catch (error) {
      console.error(`❌ Erro ao carregar página ${page}:`, error);
      container.innerHTML = `
        <div class="container" style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Erro ao carregar</h3>
          <p style="color:var(--cinza-medio);">${error.message}</p>
          <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Voltar
          </button>
        </div>
      `;
    }
  }

  // ============================================
  // 🔥 NOVO: RENDER NOTIFICAÇÕES
  // ============================================

  async renderNotificacoes(container) {
    try {
      const { renderNotificacoes } =
        await import("./modules/notificacoes-lista.js");
      await renderNotificacoes(container, this);
    } catch (error) {
      console.error("❌ Erro ao carregar notificações:", error);
      container.innerHTML = `
        <div class="container" style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Erro ao carregar notificações</h3>
          <p style="color:var(--cinza-medio);">${error.message}</p>
          <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Voltar
          </button>
        </div>
      `;
    }
  }

  // ============================================
  // 🔥 NOVO: RENDER RETIFICAÇÕES DE ABORDAGENS
  // ============================================

  async renderRetificacoesAbordagens(container) {
    try {
      // Importar o módulo de retificações (já atualizado)
      const { renderRetificacoes } = await import("./modules/retificacoes.js");
      // A mesma função renderiza todos os tipos, com filtro por tipo
      await renderRetificacoes(container, this);
    } catch (error) {
      console.error("❌ Erro ao carregar retificações de abordagens:", error);
      container.innerHTML = `
        <div class="container" style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Erro ao carregar retificações</h3>
          <p style="color:var(--cinza-medio);">${error.message}</p>
          <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Voltar
          </button>
        </div>
      `;
    }
  }

  // ============================================
  // RASCUNHO DE OCORRÊNCIA
  // ============================================

  async carregarRascunhoLocal() {
    const user = authManager.getUser();
    if (!user || !window.offlineVault?.unlocked || window.offlineVault.userId !== user.id) return false;
    const rows = await window.offlineVault.listRecords("draft");
    const latest = rows.sort((a, b) => String(b.data?.ocorrencia?.atualizado_em || "").localeCompare(String(a.data?.ocorrencia?.atualizado_em || "")))[0];
    if (!latest?.data?.ocorrencia) return false;
    const bundle = latest.data;
    this.rascunhoId = bundle.ocorrencia.id;
    this.dadosRascunho = {
      ...bundle.ocorrencia,
      envolvidos: bundle.envolvidos || [],
      envolvidosMap: (bundle.envolvidos || []).reduce((map, env) => { map[env.id] = env; return map; }, {}),
      guardasParticipantes: bundle.guardasParticipantes || [],
      assinaturas: bundle.assinaturas || [],
      anexos: bundle.anexos || [],
    };
    this.alteracoesNaoSalvas = true;
    return true;
  }

  async carregarRascunho() {
    try {
      const user = authManager.getUser();
      if (!user) return;
      if (window.offlineVault?.unlocked && await this.carregarRascunhoLocal()) return;
      if (!navigator.onLine) return;

      const client = supabaseClient.getClient();
      if (!client) return;

      const { data, error } = await client
        .from("ocorrencias")
        .select("*")
        .eq("criado_por", user.id)
        .eq("status", "draft")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        this.rascunhoId = data.id;
        this.dadosRascunho = {
          forma_solicitacao: data.forma_solicitacao || "",
          nome_solicitante: data.nome_solicitante || "",
          cpf_solicitante: data.cpf_solicitante || "",
          rg_solicitante: data.rg_solicitante || "",
          telefone_solicitante: data.telefone_solicitante || "",
          endereco_solicitante: data.endereco_solicitante || "",
          codigo_municipal: data.codigo_municipal || "",
          complemento: data.complemento || "",
          bairro_solicitante: data.bairro_solicitante || "",
          identificacao_adicional: data.identificacao_adicional || "",
          codigo_operacional: data.codigo_operacional || "",
          local_ocorrencia: data.local_ocorrencia || "",
          rodovia: data.rodovia || "",
          bairro_ocorrencia: data.bairro_ocorrencia || "",
          referencia: data.referencia || "",
          data_hora_inicio: data.data_hora_inicio || "",
          data_hora_encerramento: data.data_hora_encerramento || "",
          tipo_ocorrencia: data.tipo_ocorrencia || "",
          envolvidos: [],
          envolvidosMap: {},
          guardasParticipantes: [],
          assinaturas: Array.isArray(data.assinaturas) ? data.assinaturas : (typeof data.assinaturas === "string" ? (() => { try { const value = JSON.parse(data.assinaturas); return Array.isArray(value) ? value : []; } catch (e) { return []; } })() : []),
          observacoes: data.observacoes || "",
          anexos: [],
        };

        // Carregar envolvidos
        const envResult = await ocorrenciaManager.listarEnvolvidos(data.id);
        if (envResult.success) {
          this.dadosRascunho.envolvidos = envResult.data;
          this.dadosRascunho.envolvidosMap = (envResult.data || []).reduce((map, env) => { map[env.id] = env; return map; }, {});
        }

        // Carregar anexos
        const anexosResult = await ocorrenciaManager.listarAnexos(data.id);
        if (anexosResult.success) {
          this.dadosRascunho.anexos = anexosResult.data.map((a) => ({
            nome: a.nome_arquivo,
            tipo: a.tipo_arquivo,
            tamanho: a.tamanho,
            url: a.url,
          }));
        }

        const guardasResult = await ocorrenciaManager.listarGuardas(data.id);
        if (guardasResult.success) this.dadosRascunho.guardasParticipantes = guardasResult.data || [];
        const idsEnvolvidos = new Set(this.dadosRascunho.envolvidos.map((env) => env.id));
        const digitos = (valor) => String(valor || "").replace(/\D/g, "");
        this.dadosRascunho.assinaturas = (this.dadosRascunho.assinaturas || []).map((assinatura) => {
          if (!assinatura || idsEnvolvidos.has(assinatura.envolvido_id)) return assinatura;
          const nome = String(assinatura.nome || "").trim().toLocaleLowerCase("pt-BR");
          const cpf = digitos(assinatura.cpf);
          const correspondentes = this.dadosRascunho.envolvidos.filter((env) => cpf ? digitos(env.cpf) === cpf : (!env.cpf && String(env.nome_completo || "").trim().toLocaleLowerCase("pt-BR") === nome));
          return correspondentes.length === 1 ? { ...assinatura, envolvido_id: correspondentes[0].id } : assinatura;
        });

        console.log("📂 Rascunho carregado:", this.rascunhoId);
        this.alteracoesNaoSalvas = true;
      }
    } catch (error) {
      console.warn("Falha ao carregar rascunho remoto; tentando a cópia local cifrada.");
      try { await this.carregarRascunhoLocal(); } catch (_) { /* mantém o erro remoto fora da UI */ }
    }
  }

  async salvarRascunhoOffline(dados, user) {
    if (!window.offlineVault?.unlocked || window.offlineVault.userId !== user?.id) {
      throw new Error("Entre com sua senha para desbloquear o cofre local antes de salvar offline.");
    }
    const id = this.rascunhoId || dados.id || crypto.randomUUID();
    const agora = globalThis.obterTimestampBrasilSemFuso();
    const ocorrencia = { ...dados, id, status: "draft", criado_por: user.id, criado_em: dados.criado_em || agora, atualizado_em: agora, esta_ativa: true };
    const envolvidos = (Array.isArray(dados.envolvidos) ? dados.envolvidos : []).map((env) => ({ ...env, id: env.id || crypto.randomUUID() }));
    const anexos = (Array.isArray(dados.anexos) ? dados.anexos : []).map((anexo) => {
      const copy = { ...anexo, id: anexo.id || crypto.randomUUID() };
      delete copy.url_thumb;
      if (typeof copy.url === "string" && /^(blob:|data:)/i.test(copy.url)) delete copy.url;
      return copy;
    });
    const bundle = {
      ocorrencia,
      envolvidos,
      anexos,
      guardasParticipantes: Array.isArray(dados.guardasParticipantes) ? dados.guardasParticipantes : [],
      assinaturas: Array.isArray(dados.assinaturas) ? dados.assinaturas : [],
    };
    delete bundle.ocorrencia.envolvidos; delete bundle.ocorrencia.anexos;
    delete bundle.ocorrencia.envolvidosMap; delete bundle.ocorrencia.guardasParticipantes;
    delete bundle.ocorrencia.assinaturas; delete bundle.ocorrencia.assinaturas_objeto;
    await window.offlineVault.putRecord("draft", id, bundle, { status: "pending", createdAt: ocorrencia.criado_em });
    await window.syncManager.addToQueue(bundle, "ocorrencia", 0, { idempotencyKey: `ocorrencia:${id}:${ocorrencia.atualizado_em}` });
    this.rascunhoId = id;
    this.dadosRascunho = { ...ocorrencia, envolvidos, envolvidosMap: Object.fromEntries(envolvidos.map((env) => [env.id, env])), anexos, guardasParticipantes: bundle.guardasParticipantes, assinaturas: bundle.assinaturas };
    this.alteracoesNaoSalvas = false;
    this.showToast("Rascunho cifrado salvo neste dispositivo; aguardando conexão para sincronizar.", "success");
    return true;
  }

  /**
   * 🔥 CORRIGIDO: Salva rascunho SEM ajuste de fuso horário
   * Agora usa APENAS o horário do dispositivo
   */
  async salvarRascunho() {
    try {
      const dados = this.novaOcorrencia?.dados;
      if (!dados) {
        this.showToast("Nenhum dado para salvar como rascunho", "warning");
        return false;
      }

      const envolvidos = Array.isArray(dados.envolvidos) ? dados.envolvidos : [];
      const anexos = Array.isArray(dados.anexos) ? dados.anexos : [];
      const equipe = Array.isArray(dados.guardasParticipantes) ? dados.guardasParticipantes : [];
      const assinaturas = Array.isArray(dados.assinaturas) ? dados.assinaturas : [];
      const camposIgnorados = ["data_hora_inicio", "data_hora_encerramento", "codigo_operacional", "tipo_ocorrencia", "envolvidos", "anexos", "guardasParticipantes", "assinaturas", "envolvidosMap", "modo_criacao", "data_hora_finalizacao"];
      const temDadosRelevantes = Object.keys(dados).some((key) => {
        if (camposIgnorados.includes(key)) return false;
        const valor = dados[key];
        return typeof valor === "string" ? valor.trim() !== "" : valor != null && valor !== false;
      });
      if (!temDadosRelevantes && envolvidos.length === 0 && anexos.length === 0 && equipe.length === 0 && assinaturas.length === 0) {
        this.showToast("Não há dados para salvar como rascunho", "warning");
        return false;
      }

      const user = authManager.getUser();
      if (!user) {
        this.showToast("Usuário não autenticado", "error");
        return false;
      }
      if (!navigator.onLine) return await this.salvarRascunhoOffline(dados, user);
      const client = supabaseClient.getClient();
      if (!client) return await this.salvarRascunhoOffline(dados, user);

      const dadosParaSalvar = { ...dados };
      delete dadosParaSalvar.envolvidos;
      delete dadosParaSalvar.anexos;
      delete dadosParaSalvar.guardasParticipantes;
      delete dadosParaSalvar.envolvidosMap;
      delete dadosParaSalvar.assinaturas_objeto;

      const normalizarDataLocal = async (valor) => {
        if (!valor) return null;
        try {
          const dateObj = new Date(valor);
          if (!isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, "0");
            const day = String(dateObj.getDate()).padStart(2, "0");
            const hours = String(dateObj.getHours()).padStart(2, "0");
            const minutes = String(dateObj.getMinutes()).padStart(2, "0");
            const seconds = String(dateObj.getSeconds()).padStart(2, "0");
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
          }
        } catch (e) {}
        return null;
      };
      if (dadosParaSalvar.data_hora_inicio) {
        dadosParaSalvar.data_hora_inicio = await normalizarDataLocal(dadosParaSalvar.data_hora_inicio) || await utils.obterDataHoraInput();
      }
      dadosParaSalvar.data_hora_encerramento = await normalizarDataLocal(dadosParaSalvar.data_hora_encerramento);

      const agora = globalThis.obterTimestampBrasilSemFuso();
      const ocorrencia = {
        ...dadosParaSalvar,
        modo_criacao: dados.modo_criacao || "completo",
        status: "draft",
        criado_por: user.id,
        atualizado_em: agora,
        esta_ativa: true,
      };
      if (!this.rascunhoId) {
        ocorrencia.criado_em = agora;
        ocorrencia.numero_versao = 1;
      }
      const novoRascunho = !this.rascunhoId;
      ocorrencia.id = this.rascunhoId || crypto.randomUUID();
      this.rascunhoId = ocorrencia.id;
      const backupCifrado = { ocorrencia, envolvidos, anexos, guardasParticipantes: equipe, assinaturas };
      if (window.offlineVault?.unlocked && window.offlineVault.userId === user.id) {
        await window.offlineVault.putRecord("draft", ocorrencia.id, backupCifrado, { status: "saved", createdAt: ocorrencia.criado_em });
      }

      if (!novoRascunho) {
        const { error } = await client.from("ocorrencias").update(ocorrencia).eq("id", this.rascunhoId).select().single();
        if (error) throw error;
      } else {
        const { data, error } = await client.from("ocorrencias").insert([ocorrencia]).select().single();
        if (error) throw error;
        this.rascunhoId = data.id;
      }

      const { error: erroExcluirEnvolvidos } = await client.from("envolvidos").delete().eq("ocorrencia_id", this.rascunhoId);
      if (erroExcluirEnvolvidos) throw erroExcluirEnvolvidos;
      if (envolvidos.length > 0) {
        const resultadoEnvolvidos = await ocorrenciaManager.salvarEnvolvidos(this.rascunhoId, envolvidos, true);
        if (!resultadoEnvolvidos.success) throw new Error(resultadoEnvolvidos.error || "Falha ao salvar envolvidos");
      }

      if (equipe.length > 0) {
        const resultadoEquipe = await ocorrenciaManager.salvarGuardas(this.rascunhoId, equipe);
        if (!resultadoEquipe.success) throw new Error(resultadoEquipe.error || "Falha ao salvar equipe operacional");
      }

      const { error: erroExcluirAnexos } = await client.from("anexos").delete().eq("ocorrencia_id", this.rascunhoId);
      if (erroExcluirAnexos) throw erroExcluirAnexos;
      if (anexos.length > 0) {
        const resultadoAnexos = await ocorrenciaManager.salvarAnexos(this.rascunhoId, anexos);
        if (!resultadoAnexos.success) throw new Error(resultadoAnexos.error || "Falha ao salvar anexos");
      }

      if (window.offlineVault?.unlocked && window.offlineVault.userId === user.id) {
        await window.offlineVault.putRecord("draft", this.rascunhoId, backupCifrado, { status: "synced", createdAt: ocorrencia.criado_em });
        const oldQueue = await window.offlineVault.listQueue("pending");
        for (const queued of oldQueue) if (queued.tipo === "ocorrencia" && queued.dados?.ocorrencia?.id === this.rascunhoId) await window.offlineVault.removeQueue(queued.id);
      }
      this.alteracoesNaoSalvas = false;
      this.showToast("Rascunho salvo com segurança neste dispositivo e no sistema.", "success");
      console.log("✅ Rascunho salvo:", this.rascunhoId);
      return true;
    } catch (error) {
      if (!navigator.onLine && window.offlineVault?.unlocked) {
        try { return await this.salvarRascunhoOffline(this.novaOcorrencia?.dados || {}, authManager.getUser()); }
        catch (vaultError) { this.showToast(vaultError.message, "error"); return false; }
      }
      console.error("❌ Erro ao salvar rascunho:", error?.code || "SYNC_ERROR");
      this.showToast("Não foi possível salvar o rascunho no servidor. Os dados não foram descartados.", "error");
      return false;
    }
  }


  async descartarRascunho() {
    try {
      if (this.rascunhoId) {
        const client = supabaseClient.getClient();
        if (client) {
          await client.from("ocorrencias").delete().eq("id", this.rascunhoId);
          await client
            .from("envolvidos")
            .delete()
            .eq("ocorrencia_id", this.rascunhoId);
          await client
            .from("anexos")
            .delete()
            .eq("ocorrencia_id", this.rascunhoId);
        }
        this.rascunhoId = null;
        this.dadosRascunho = null;
        this.alteracoesNaoSalvas = false;
        this.showToast("Rascunho descartado", "info");
      }
    } catch (error) {
      console.error("❌ Erro ao descartar rascunho:", error);
    }
  }

  perguntarSalvarRascunho(pageDestino, callback) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-save" style="margin-right:8px;"></i>
            Salvar Rascunho
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size:16px;margin-bottom:8px;">Você tem alterações não salvas.</p>
          <p style="color:var(--cinza-medio);font-size:14px;">Deseja salvar como rascunho ou descartar?</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="app.descartarRascunho(); this.closest('.modal-overlay').remove(); app.executarNavegacao('${pageDestino}', null)">
            <i class="fas fa-trash-alt" style="margin-right:6px;"></i> Descartar
          </button>
          <button type="button" class="btn-primary" onclick="app.salvarRascunho(); this.closest('.modal-overlay').remove(); app.executarNavegacao('${pageDestino}', null)">
            <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Rascunho
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        if (callback) callback();
      }
    });
  }

  // ============================================
  // NOVA OCORRÊNCIA
  // ============================================

  async renderNovaOcorrencia(container) {
    const { renderNovaOcorrencia } =
      await import("./modules/nova-ocorrencia.js");
    await renderNovaOcorrencia(container, this);
  }

  // ============================================
  // DETALHE DA OCORRÊNCIA
  // ============================================

  async renderDetalheOcorrencia(container) {
    const { renderDetalheOcorrencia } =
      await import("./modules/detalhe-ocorrencia.js");
    await renderDetalheOcorrencia(container, this);
  }

  // ============================================
  // OCORRÊNCIAS (LISTA)
  // ============================================

  async renderOcorrencias(container) {
    const { renderOcorrencias } =
      await import("./modules/ocorrencias-lista.js");
    await renderOcorrencias(container, this);
  }

  // ============================================
  // RETIFICAÇÕES
  // ============================================

  async renderRetificacoes(container) {
    const { renderRetificacoes } = await import("./modules/retificacoes.js");
    await renderRetificacoes(container, this);
  }

  // ============================================
  // HEADER
  // ============================================

  atualizarHeader() {
    const user = authManager.getUser();
    if (!user) return;

    const userNameEl = document.getElementById("userName");
    const apelido = String(user.apelido || "").trim().replace(/^GM\s+/i, "").replace(/\s+/g, " ");
    const nomeExibido = apelido ? `GM ${apelido}` : (user.nome_completo || "Guarda");
    if (userNameEl) {
      userNameEl.textContent = nomeExibido;
    }

    const userMatriculaEl = document.getElementById("userMatricula");
    if (userMatriculaEl) {
      userMatriculaEl.textContent = user.matricula
        ? `Mat. ${user.matricula}`
        : "";
    }

    const userAvatarEl = document.getElementById("userAvatar");
    if (userAvatarEl) {
      const inicial = (apelido || user.nome_completo || "G").trim().charAt(0).toLocaleUpperCase("pt-BR");
      const initialsEl = document.createElement("span");
      initialsEl.style.fontWeight = "700";
      initialsEl.style.fontSize = "16px";
      initialsEl.textContent = inicial;
      userAvatarEl.replaceChildren(initialsEl);
    }
  }

  // ============================================
  // LOGIN
  // ============================================

  async handleLogin() {
    const cpf = document.getElementById("loginCpf").value.trim();
    const senha = document.getElementById("loginSenha").value;
    const btn = document.getElementById("loginBtn");
    const errorEl = document.getElementById("loginError");

    if (!cpf || !senha) {
      this.showToast("Preencha todos os campos", "warning");
      return;
    }

    btn.disabled = true;
    btn.classList.add("loading");
    errorEl.style.display = "none";

    try {
      const result = await authManager.login(cpf, senha);

      if (!result.success) {
        errorEl.style.display = "block";
        errorEl.textContent = result.error;
        this.showToast(result.error, "error");
        return;
      }

      this.atualizarHeader();
      await window.syncManager?.init?.();
      await this.carregarRascunho();
      sessionManager.resetSession();

      // Registrar log pericial de login
      await this.registrarLogPericial(
        "LOGIN",
        "usuarios",
        authManager.getUserId(),
      );

      if (result.primeiro_acesso) {
        this.showPrimeiroAcesso();
        this.showToast("Primeiro acesso! Defina sua nova senha.", "warning");
        return;
      }

      this.showToast(result.offline ? "Acesso offline liberado; sincronização aguarda conexão e JWT válido." : "Login realizado com sucesso!", result.offline ? "info" : "success");
      this.navigateTo("dashboard");
    } catch (error) {
      this.showToast("Erro ao realizar login", "error");
    } finally {
      const passwordInput = document.getElementById("loginSenha");
      if (passwordInput) passwordInput.value = "";
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  showPrimeiroAcesso() {
    const container = document.getElementById("page-login");
    container.innerHTML = `
      <section class="login-screen" aria-labelledby="firstAccessTitle">
        <div class="login-card login-card--first-access">
          <div class="login-brand">
            <div class="login-crest">
              <img
                src="assets/images/logo-guarda.png"
                alt="Brasão da Guarda Municipal de Pitangueiras"
                width="68"
                height="68"
              />
            </div>
            <div class="login-brand-copy">
              <span class="login-eyebrow">GUARDA MUNICIPAL · PARANÁ</span>
              <h1>Guarda Municipal</h1>
              <p>Pitangueiras · PR</p>
            </div>
          </div>

          <div class="login-intro login-intro--first-access">
            <span class="login-intro-label">
              <i class="fas fa-lock" aria-hidden="true"></i>
              Primeiro acesso obrigatório
            </span>
            <h2 id="firstAccessTitle">Defina sua nova senha</h2>
            <p>Olá, <strong>${authManager.getNome()}</strong>. Crie uma senha segura para continuar.</p>
          </div>

          <form id="formPrimeiroAcesso" class="first-access-form">
            <div class="form-group login-form-group">
              <label for="novaSenha">Nova senha <span class="required">*</span></label>
              <div class="input-wrapper login-input-wrapper">
                <i class="fas fa-key input-icon-left" aria-hidden="true"></i>
                <input type="password" id="novaSenha" placeholder="Digite sua nova senha" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-password" onclick="app.toggleSenha('novaSenha')" aria-label="Mostrar nova senha" aria-controls="novaSenha">
                  <i class="fas fa-eye" aria-hidden="true"></i>
                </button>
              </div>
              <div class="input-hint first-access-hint">
                <i class="fas fa-info-circle" aria-hidden="true"></i>
                Mínimo de 6 caracteres
              </div>
            </div>
            <div class="form-group login-form-group">
              <label for="confirmarSenha">Confirmar senha <span class="required">*</span></label>
              <div class="input-wrapper login-input-wrapper">
                <i class="fas fa-check input-icon-left" aria-hidden="true"></i>
                <input type="password" id="confirmarSenha" placeholder="Digite a senha novamente" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-password" onclick="app.toggleSenha('confirmarSenha')" aria-label="Mostrar confirmação de senha" aria-controls="confirmarSenha">
                  <i class="fas fa-eye" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <button type="submit" class="btn-primary login-submit" id="btnPrimeiroAcesso">
              <i class="fas fa-check-circle" aria-hidden="true"></i>
              <span class="btn-text">Definir nova senha</span>
              <span class="spinner-small"></span>
            </button>
            <p class="login-security-note first-access-security-note">
              <i class="fas fa-shield-alt" aria-hidden="true"></i>
              Senha segura e criptografada
            </p>
          </form>

          <div class="login-footer">
            <span class="version"><i class="fas fa-code" aria-hidden="true"></i>v${CONFIG.VERSAO}</span>
            <span class="separator" aria-hidden="true">•</span>
            <span><i class="fas fa-building" aria-hidden="true"></i>Guarda Municipal de Pitangueiras</span>
          </div>
        </div>
      </section>
    `;

    document
      .getElementById("formPrimeiroAcesso")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handlePrimeiroAcesso();
      });

    this.showPage("login");
  }

  toggleSenha(id) {
    const input = document.getElementById(id);
    const btn = input.parentElement.querySelector(".toggle-password");
    const icon = btn.querySelector("i");

    if (input.type === "password") {
      input.type = "text";
      icon.className = "fas fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fas fa-eye";
    }
  }

  async handlePrimeiroAcesso() {
    const novaSenha = document.getElementById("novaSenha").value;
    const confirmar = document.getElementById("confirmarSenha").value;
    const btn = document.getElementById("btnPrimeiroAcesso");

    if (novaSenha.length < 6) {
      this.showToast("A senha deve ter pelo menos 6 caracteres", "warning");
      return;
    }

    if (novaSenha !== confirmar) {
      this.showToast("As senhas não coincidem", "warning");
      return;
    }

    btn.disabled = true;
    btn.classList.add("loading");

    try {
      const result = await authManager.primeiroAcesso(novaSenha);

      if (!result.success) {
        this.showToast(result.error, "error");
        return;
      }

      // Registrar log pericial de primeiro acesso
      await this.registrarLogPericial(
        "PRIMEIRO_ACESSO",
        "usuarios",
        authManager.getUserId(),
      );

      this.showToast("Senha definida com sucesso!", "success");
      setTimeout(() => this.navigateTo("dashboard"), 1500);
    } catch (error) {
      this.showToast("Erro ao definir senha", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  // ============================================
  // LOGOUT
  // ============================================

  async handleLogout() {
    const confirmado = await utils.confirmar(
      "Deseja realmente sair do sistema?",
    );
    if (!confirmado) return;

    // Registrar log pericial de logout
    if (authManager.isLoggedIn()) {
      await this.registrarLogPericial(
        "LOGOUT",
        "usuarios",
        authManager.getUserId(),
      );
    }

    await authManager.logout();
    this.novaOcorrencia = null;
    this.dadosRascunho = null;
    this.rascunhoId = null;
    this.alteracoesNaoSalvas = false;
    this.route();
    this.showToast("Logout realizado com sucesso!", "info");
  }

  // ============================================
  // TOASTS E MODAIS
  // ============================================

  showToast(message, type = "info", duration = 4000) {
    return ui.showToast(message, type, duration);
  }

  confirmar(mensagem, titulo = "Confirmar", opcoes = {}) {
    return utils.confirmar(mensagem, titulo, opcoes);
  }

  inputModal(
    mensagem,
    titulo = "Informe o motivo",
    placeholder = "Digite o motivo...",
  ) {
    return utils.inputModal(mensagem, titulo, placeholder);
  }

  confirmarInputModal() {
    return utils.confirmarInputModal();
  }

  mostrarErro(mensagem) {
    const container = document.getElementById("page-login");
    if (!container) return;

    container.innerHTML = `
      <div class="login-screen">
        <div class="login-card" style="max-width:400px;">
          <div class="logo-container">
            <div style="width:80px;height:80px;border-radius:50%;background:var(--gradiente-principal);display:flex;align-items:center;justify-content:center;margin:0 auto;">
              <i class="fas fa-exclamation-triangle" style="font-size:40px;color:var(--branco);"></i>
            </div>
            <h1 style="color:var(--azul-bandeira);text-align:center;margin-top:12px;">Erro ao Carregar</h1>
            <p style="text-align:center;color:var(--cinza-escuro);">${mensagem}</p>
          </div>
          <button onclick="location.reload()" class="btn-primary">
            <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
            Tentar Novamente
          </button>
        </div>
      </div>
    `;

    this.showPage("login");
  }

  // ============================================
  // LISTENERS
  // ============================================

  setupListeners() {
    // Auth listeners
    authManager.onAuthChange((event, data) => {
      console.log("🔄 Evento de autenticação:", event);
      if (event === "login") {
        this.atualizarHeader();
        this.carregarRascunho();
        sessionManager.resetSession();
        this.route();
      } else if (event === "logout") {
        this.route();
      }
    });

    // Bottom nav listeners
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.addEventListener("click", () => {
        const page = item.dataset.page;

        if (page === "nova-ocorrencia") {
          if (this.currentPage === "nova-ocorrencia") {
            this.showToast("Você já está na página de nova ocorrência", "info");
            return;
          }
        }

        if (
          this.currentPage === "nova-ocorrencia" &&
          this.alteracoesNaoSalvas
        ) {
          this.paginaDestino = page;
          this.paramsDestino = null;
          this.perguntarSalvarRascunho(page);
        } else {
          this.navigateTo(page);
        }
      });
    });

    // Bottom sheet
    const navMais = document.getElementById("navMais");
    if (navMais) {
      navMais.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.toggleBottomSheet();
      });
    }

    // Login form
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    // Toggle password
    const toggleBtn = document.querySelector(".toggle-password");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        const input = document.getElementById("loginSenha");
        const icon = e.currentTarget.querySelector("i");

        if (input.type === "password") {
          input.type = "text";
          icon.className = "fas fa-eye-slash";
          toggleBtn.setAttribute("aria-label", "Ocultar senha");
        } else {
          input.type = "password";
          icon.className = "fas fa-eye";
          toggleBtn.setAttribute("aria-label", "Mostrar senha");
        }
      });
    }

    // Gestos de deslize (swipe) para mobile
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    document.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = false;
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Verificar se é um swipe horizontal (mais horizontal que vertical)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
          isSwiping = true;
          // Impedir scroll durante swipe
          e.preventDefault();
        }
      },
      { passive: false },
    );

    document.addEventListener(
      "touchend",
      (e) => {
        if (!isSwiping) return;

        const touchEndX = e.changedTouches[0].screenX;
        const diffX = touchEndX - touchStartX;

        // Swipe para esquerda (próxima página)
        if (diffX < -50) {
          this.handleSwipeLeft();
        }
        // Swipe para direita (página anterior)
        else if (diffX > 50) {
          this.handleSwipeRight();
        }

        isSwiping = false;
      },
      { passive: true },
    );

    // Before unload - avisar sobre alterações não salvas
    window.addEventListener("beforeunload", (e) => {
      if (this.currentPage === "nova-ocorrencia" && this.alteracoesNaoSalvas) {
        e.preventDefault();
        e.returnValue =
          "Você tem alterações não salvas. Deseja realmente sair?";
        return e.returnValue;
      }
    });

    // Escape para fechar bottom sheet
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") ui.closeBottomSheet();
    });

    // Evento de localização atualizada
    document.addEventListener("localizacao_atualizada", (e) => {
      // Atualizar interfaces que dependem de localização
      this.atualizarLocalizacaoUI(e.detail);
    });

    // 🔥 NOVO: Evento para atualizar badge de notificações via UI
    document.addEventListener("badge_notificacoes_atualizado", (e) => {
      console.log(`🔔 Badge de notificações atualizado: ${e.detail.count}`);
    });
  }

  // ============================================
  // GESTOS DE DESLIZE (SWIPE)
  // ============================================

  handleSwipeLeft() {
    // Navegar para a próxima aba (apenas em páginas com tabs)
    const currentPage = this.currentPage;
    const swipePages = ["consulta", "mural", "ocorrencias"];

    if (!swipePages.includes(currentPage)) return;

    const pageOrder = ["consulta", "mural", "ocorrencias"];
    const currentIndex = pageOrder.indexOf(currentPage);

    if (currentIndex < pageOrder.length - 1) {
      const nextPage = pageOrder[currentIndex + 1];
      this.navigateTo(nextPage);
      this.showToast(`→ ${this.getPageLabel(nextPage)}`, "info");
    }
  }

  handleSwipeRight() {
    // Navegar para a aba anterior
    const currentPage = this.currentPage;
    const swipePages = ["consulta", "mural", "ocorrencias"];

    if (!swipePages.includes(currentPage)) return;

    const pageOrder = ["consulta", "mural", "ocorrencias"];
    const currentIndex = pageOrder.indexOf(currentPage);

    if (currentIndex > 0) {
      const prevPage = pageOrder[currentIndex - 1];
      this.navigateTo(prevPage);
      this.showToast(`← ${this.getPageLabel(prevPage)}`, "info");
    }
  }

  getPageLabel(page) {
    const labels = {
      consulta: "Consulta Operacional",
      mural: "Mural",
      ocorrencias: "Ocorrências",
    };
    return labels[page] || page;
  }

  // ============================================
  // GEOLOCALIZAÇÃO
  // ============================================

  obterLocalizacao() {
    return utils.obterLocalizacao();
  }

  obterIP() {
    return utils.obterIP();
  }

  obterLocalizacaoAtual() {
    return this.ultimaLocalizacao || null;
  }

  atualizarLocalizacaoUI(localizacao) {
    // Atualizar elementos que mostram localização
    const elementos = document.querySelectorAll("[data-localizacao]");
    elementos.forEach((el) => {
      if (localizacao) {
        el.textContent = `${localizacao.latitude.toFixed(6)}, ${localizacao.longitude.toFixed(6)}`;
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    });
  }

  // ============================================
  // DATA/HORA COM FUSO CORRIGIDO
  // ============================================

  async obterDataHoraPrecisa(forceRefresh = false) {
    return utils.obterDataHoraPrecisa(forceRefresh);
  }

  async obterDataHoraBrasiliaISO(forceRefresh = false) {
    return utils.obterDataHoraBrasiliaISO(forceRefresh);
  }

  async obterDataAtualISO(forceRefresh = false) {
    return utils.obterDataAtualISO(forceRefresh);
  }

  async obterDataHoraInput(forceRefresh = false) {
    return utils.obterDataHoraInput(forceRefresh);
  }

  // ============================================
  // REGISTRO DE LOGS PERICIAIS
  // ============================================

  async registrarLogPericial(
    acao,
    tabela = null,
    registroId = null,
    dadosAnt = null,
    dadosNov = null,
  ) {
    try {
      const user = authManager.getUser();
      const loc =
        this.obterLocalizacaoAtual() || (await this.obterLocalizacao());
      const client = supabaseClient.getClient();

      if (!client) return;

      const logData = {
        usuario_id: user?.id,
        acao: acao,
        tabela_afetada: tabela,
        registro_id: registroId?.toString(),
        dados_anteriores: dadosAnt,
        dados_novos: dadosNov,
        ip_address: await this.obterIP(),
        user_agent: navigator.userAgent,
        latitude: loc?.latitude?.toString(),
        longitude: loc?.longitude?.toString(),
        criado_em: globalThis.obterTimestampBrasilSemFuso(),
      };

      const { error } = await client.from("logs_periciais").insert([logData]);
      if (error) {
        console.warn("Erro ao registrar log pericial:", error);
      }
    } catch (error) {
      console.error("Erro ao registrar log pericial:", error);
    }
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================

  formatarDataHoraLocal(date) {
    return utils.formatarDataHoraLocal(date);
  }

  formatarCPFSeguro(cpf) {
    return utils.formatarCPFSeguro(cpf);
  }

  /**
   * @deprecated Use obterDataHoraPrecisa() em vez deste método
   */
  obterDataHoraBrasilia() {
    return utils.obterDataHoraPrecisa();
  }

  getStatusClass(status) {
    return utils.getStatusClass(status);
  }

  getStatusLabel(status) {
    return utils.getStatusLabel(status);
  }

  getTipoLabel(value) {
    return utils.getTipoLabel(value, this.TIPOS_OCORRENCIA);
  }

  getTipoEnvolvidoLabel(tipo) {
    return utils.getTipoEnvolvidoLabel(tipo);
  }

  getIconAnexo(tipo) {
    return utils.getIconAnexo(tipo);
  }

  formatarTamanho(bytes) {
    return utils.formatarTamanho(bytes);
  }

  // ============================================
  // BUSCA COM DEBOUNCE
  // ============================================

  executarBusca(termo, tipo) {
    // Implementação da busca com debounce
    // Pode ser sobrescrita pelos módulos específicos
    console.log(`🔍 Buscando "${termo}" em ${tipo}...`);

    // Disparar evento de busca
    const event = new CustomEvent("busca_executada", {
      detail: { termo, tipo },
    });
    document.dispatchEvent(event);
  }

  // ============================================
  // DESTRUIÇÃO
  // ============================================

  destroy() {
    // Parar GPS
    if (this.gpsWatchId) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    // Limpar cache
    // utils.clearAllCache(); // Opcional

    console.log("🧹 App destruído");
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

const app = new App();
window.app = app;

// ============================================
// INICIALIZAÇÃO
// ============================================

function iniciarApp() {
  console.log("🚀 Iniciando app...");

  if (typeof authManager === "undefined") {
    console.error("❌ authManager não definido!");
    setTimeout(iniciarApp, 500);
    return;
  }

  if (typeof authManager.isLoggedIn !== "function") {
    console.error("❌ authManager.isLoggedIn não é uma função!");
    setTimeout(iniciarApp, 500);
    return;
  }

  app.init();
}

// Aguardar DOM carregar
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(iniciarApp, 200);
} else {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(iniciarApp, 200);
  });
}

console.log("📦 App principal carregado");
console.log(`📍 ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}`);
console.log(`📌 Versão: ${CONFIG.VERSAO}`);
