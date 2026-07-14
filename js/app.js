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
      relatorios: {
        element: "page-relatorios",
        showHeader: true,
        showNav: true,
      },
      logs: { element: "page-logs", showHeader: true, showNav: true },
      usuarios: { element: "page-usuarios", showHeader: true, showNav: true },
      perfil: { element: "page-perfil", showHeader: true, showNav: true },
      consulta: { element: "page-consulta", showHeader: true, showNav: true },
      mural: { element: "page-mural", showHeader: true, showNav: true },
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
    if (tiposCache) {
      this.TIPOS_OCORRENCIA = tiposCache;
      console.log("✅ Tipos de ocorrência carregados do cache");
    } else {
      // Salvar no cache para uso futuro
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
    if (["relatorios", "usuarios", "retificacoes", "logs"].includes(page)) {
      if (!authManager.isSupervisor()) {
        this.showToast("Acesso restrito a supervisores", "warning");
        page = "dashboard";
      }
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
  }

  updateBottomNav(page) {
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
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

        case "relatorios":
          await relatorios.renderRelatorios(container, this);
          break;

        case "logs":
          await logs.renderLogs(container, this);
          break;

        case "usuarios":
          await usuarios.renderUsuarios(container, this);
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
  // RASCUNHO DE OCORRÊNCIA
  // ============================================

  async carregarRascunho() {
    try {
      const user = authManager.getUser();
      if (!user) return;

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
          observacoes: data.observacoes || "",
          anexos: [],
        };

        // Carregar envolvidos
        const envResult = await ocorrenciaManager.listarEnvolvidos(data.id);
        if (envResult.success) {
          this.dadosRascunho.envolvidos = envResult.data;
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

        console.log("📂 Rascunho carregado:", this.rascunhoId);
        this.alteracoesNaoSalvas = true;
      }
    } catch (error) {
      console.error("❌ Erro ao carregar rascunho:", error);
    }
  }

  async salvarRascunho() {
    try {
      const dados = this.novaOcorrencia?.dados;
      if (!dados) {
        this.showToast("Nenhum dado para salvar como rascunho", "warning");
        return;
      }

      // Verificar se há dados relevantes
      const camposPreenchidos = Object.keys(dados).filter((key) => {
        const valor = dados[key];
        if (key === "envolvidos" || key === "anexos") {
          return valor && valor.length > 0;
        }
        return valor && (typeof valor !== "string" || valor.trim() !== "");
      });

      const camposIgnorados = [
        "data_hora_inicio",
        "data_hora_encerramento",
        "codigo_operacional",
        "tipo_ocorrencia",
      ];
      const temDadosRelevantes = camposPreenchidos.some(
        (key) => !camposIgnorados.includes(key),
      );

      if (
        !temDadosRelevantes &&
        dados.envolvidos.length === 0 &&
        dados.anexos.length === 0
      ) {
        this.showToast("Não há dados para salvar como rascunho", "warning");
        return;
      }

      const user = authManager.getUser();
      if (!user) {
        this.showToast("Usuário não autenticado", "error");
        return;
      }

      const client = supabaseClient.getClient();
      if (!client) {
        this.showToast("Erro ao conectar ao servidor", "error");
        return;
      }

      // Preparar dados para salvar
      const dadosParaSalvar = { ...dados };
      delete dadosParaSalvar.envolvidos;
      delete dadosParaSalvar.anexos;

      // Ajustar data/hora com fuso correto
      if (dadosParaSalvar.data_hora_inicio) {
        try {
          const dateObj = new Date(dadosParaSalvar.data_hora_inicio);
          if (!isNaN(dateObj.getTime())) {
            dadosParaSalvar.data_hora_inicio = dateObj.toISOString();
          } else {
            const agora = await utils.obterDataHoraPrecisa();
            dadosParaSalvar.data_hora_inicio = agora.toISOString();
          }
        } catch (e) {
          const agora = await utils.obterDataHoraPrecisa();
          dadosParaSalvar.data_hora_inicio = agora.toISOString();
        }
      }

      if (dadosParaSalvar.data_hora_encerramento) {
        try {
          const dateObj = new Date(dadosParaSalvar.data_hora_encerramento);
          if (!isNaN(dateObj.getTime())) {
            dadosParaSalvar.data_hora_encerramento = dateObj.toISOString();
          } else {
            dadosParaSalvar.data_hora_encerramento = null;
          }
        } catch (e) {
          dadosParaSalvar.data_hora_encerramento = null;
        }
      } else {
        dadosParaSalvar.data_hora_encerramento = null;
      }

      const ocorrencia = {
        ...dadosParaSalvar,
        status: "draft",
        criado_por: user.id,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        numero_versao: 1,
        esta_ativa: true,
      };

      let result;
      if (this.rascunhoId) {
        const { data, error } = await client
          .from("ocorrencias")
          .update(ocorrencia)
          .eq("id", this.rascunhoId)
          .select()
          .single();
        if (error) throw error;
        result = { data };
      } else {
        const { data, error } = await client
          .from("ocorrencias")
          .insert([ocorrencia])
          .select()
          .single();
        if (error) throw error;
        this.rascunhoId = data.id;
        result = { data };
      }

      // Salvar envolvidos
      if (dados.envolvidos && dados.envolvidos.length > 0) {
        await client
          .from("envolvidos")
          .delete()
          .eq("ocorrencia_id", this.rascunhoId);
        const envResult = await ocorrenciaManager.salvarEnvolvidos(
          this.rascunhoId,
          dados.envolvidos,
        );
        if (!envResult.success) {
          console.warn(
            "Erro ao salvar envolvidos do rascunho:",
            envResult.error,
          );
        }
      }

      // Salvar anexos
      if (dados.anexos && dados.anexos.length > 0) {
        await client
          .from("anexos")
          .delete()
          .eq("ocorrencia_id", this.rascunhoId);
        const anexoResult = await ocorrenciaManager.salvarAnexos(
          this.rascunhoId,
          dados.anexos,
        );
        if (!anexoResult.success) {
          console.warn("Erro ao salvar anexos do rascunho:", anexoResult.error);
        }
      }

      this.alteracoesNaoSalvas = false;
      this.showToast("Rascunho salvo com sucesso!", "success");
      console.log("✅ Rascunho salvo:", this.rascunhoId);
    } catch (error) {
      console.error("❌ Erro ao salvar rascunho:", error);
      this.showToast("Erro ao salvar rascunho: " + error.message, "error");
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
    if (userNameEl) {
      userNameEl.textContent = user.nome_completo || "Guarda";
    }

    const userMatriculaEl = document.getElementById("userMatricula");
    if (userMatriculaEl) {
      userMatriculaEl.textContent = user.matricula
        ? `Mat. ${user.matricula}`
        : "";
    }

    const userAvatarEl = document.getElementById("userAvatar");
    if (userAvatarEl) {
      const inicial = user.nome_completo?.charAt(0) || "G";
      userAvatarEl.innerHTML = `<span style="font-weight:700;font-size:16px;">${inicial.toUpperCase()}</span>`;
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

      this.showToast("Login realizado com sucesso!", "success");
      this.navigateTo("dashboard");
    } catch (error) {
      this.showToast("Erro ao realizar login", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  showPrimeiroAcesso() {
    const container = document.getElementById("page-login");
    container.innerHTML = `
      <div class="login-screen">
        <div class="login-card" style="max-width:400px;">
          <div class="logo-container">
            <div class="logo-wrapper">
              <div style="width:80px;height:80px;border-radius:50%;background:var(--gradiente-principal);display:flex;align-items:center;justify-content:center;margin:0 auto;">
                <i class="fas fa-shield-alt" style="font-size:40px;color:var(--branco);"></i>
              </div>
              <div class="logo-ring"></div>
            </div>
            <h1 style="color:var(--azul-bandeira);">Primeiro Acesso</h1>
            <p style="color:var(--cinza-medio);margin-top:4px;">
              Olá, <strong>${authManager.getNome()}</strong>!
            </p>
            <p style="color:var(--cinza-medio);font-size:14px;">
              Defina sua nova senha para continuar
            </p>
          </div>
          <form id="formPrimeiroAcesso">
            <div class="form-group">
              <label for="novaSenha">
                <i class="fas fa-lock" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                Nova Senha <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <i class="fas fa-key input-icon-left"></i>
                <input type="password" id="novaSenha" placeholder="Digite sua nova senha" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-password" onclick="app.toggleSenha('novaSenha')">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
              <div class="input-hint">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Mínimo 6 caracteres
              </div>
            </div>
            <div class="form-group">
              <label for="confirmarSenha">
                <i class="fas fa-check-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                Confirmar Senha <span class="required">*</span>
              </label>
              <div class="input-wrapper">
                <i class="fas fa-check input-icon-left"></i>
                <input type="password" id="confirmarSenha" placeholder="Digite a senha novamente" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-password" onclick="app.toggleSenha('confirmarSenha')">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            </div>
            <div style="margin-top:24px;">
              <button type="submit" class="btn-primary" id="btnPrimeiroAcesso">
                <i class="fas fa-check-circle" style="margin-right:8px;"></i>
                <span class="btn-text">Definir Nova Senha</span>
                <span class="spinner-small"></span>
              </button>
            </div>
            <div style="margin-top:16px;text-align:center;font-size:13px;color:var(--cinza-medio);">
              <i class="fas fa-shield-alt" style="margin-right:4px;color:var(--verde-bandeira);"></i>
              Senha segura e criptografada
            </div>
          </form>
          <div class="login-footer">
            <span class="version">
              <i class="fas fa-code" style="margin-right:4px;font-size:11px;"></i>
              v${CONFIG.VERSAO}
            </span>
            <span class="separator">•</span>
            <span>
              <i class="fas fa-building" style="margin-right:4px;font-size:11px;"></i>
              Guarda Municipal de Pitangueiras
            </span>
          </div>
        </div>
      </div>
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
    this.route();
    this.showToast("Logout realizado com sucesso!", "info");
  }

  // ============================================
  // TOASTS E MODAIS
  // ============================================

  showToast(message, type = "info", duration = 4000) {
    return ui.showToast(message, type, duration);
  }

  confirmar(mensagem, titulo = "Confirmar") {
    return utils.confirmar(mensagem, titulo);
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
        } else {
          input.type = "password";
          icon.className = "fas fa-eye";
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
        criado_em: new Date().toISOString(),
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
