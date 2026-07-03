/**
 * APLICAÇÃO PRINCIPAL
 * Guarda Municipal de Pitangueiras - PR
 */

class App {
  constructor() {
    this.currentPage = "login";
    this.initialized = false;
    this.pages = {
      login: { element: "page-login", showHeader: false, showFab: false },
      dashboard: { element: "page-dashboard", showHeader: true, showFab: true },
      ocorrencias: {
        element: "page-ocorrencias",
        showHeader: true,
        showFab: false,
      },
      "nova-ocorrencia": {
        element: "page-nova-ocorrencia",
        showHeader: true,
        showFab: false,
      },
      relatorios: {
        element: "page-relatorios",
        showHeader: true,
        showFab: false,
      },
      usuarios: { element: "page-usuarios", showHeader: true, showFab: false },
      perfil: { element: "page-perfil", showHeader: true, showFab: false },
    };
  }

  async init() {
    if (this.initialized) return;
    console.log("🚀 Iniciando aplicação...");

    try {
      if (typeof authManager === "undefined") {
        throw new Error("authManager não definido!");
      }

      if (typeof authManager.isLoggedIn !== "function") {
        console.error("❌ authManager.isLoggedIn não é uma função!");
        console.log("🔍 authManager atual:", authManager);
        throw new Error("authManager incompleto!");
      }

      await supabaseClient.init();
      console.log("✅ Supabase inicializado");

      await authManager.init();
      console.log("✅ AuthManager inicializado");

      await ocorrenciaManager.init();
      console.log("✅ Ocorrência Manager inicializado");

      this.setupListeners();
      this.setupConnectionMonitor();
      await this.route();

      this.initialized = true;
      console.log("✅ Aplicação inicializada com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao iniciar:", error);
      this.mostrarErro(error.message);
    }
  }

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
    if (!this.pages[page]) page = "dashboard";

    if (page === "relatorios" || page === "usuarios") {
      if (!authManager.isSupervisor()) {
        this.showToast("Acesso restrito a supervisores", "warning");
        page = "dashboard";
      }
    }

    this.currentPage = page;
    window.location.hash = page;
    this.showPage(page);
    this.updateMenu(page);
    this.updateFab(page);
    this.loadPageContent(page);
  }

  showPage(page) {
    document.querySelectorAll(".page").forEach((el) => {
      el.classList.remove("active");
      el.style.display = "none";
    });

    const pageId = this.pages[page]?.element || `page-${page}`;
    const element = document.getElementById(pageId);
    if (element) {
      element.style.display = "block";
      void element.offsetWidth;
      element.classList.add("active");
    }

    const header = document.getElementById("app-header");
    const fab = document.getElementById("fab");
    const config = this.pages[page];

    if (config) {
      header.style.display = config.showHeader ? "flex" : "none";
      fab.style.display = config.showFab ? "flex" : "none";
    }
  }

  updateMenu(page) {
    document.querySelectorAll(".menu-item[data-page]").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });
  }

  updateFab(page) {
    const fab = document.getElementById("fab");
    fab.style.display = page === "dashboard" ? "flex" : "none";
  }

  async loadPageContent(page) {
    const containerId = this.pages[page]?.element || `page-${page}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
            <div class="container" style="text-align:center;padding:40px 20px;">
                <div class="spinner-azul" style="margin:0 auto;"></div>
                <p style="margin-top:12px;color:var(--cinza-medio);">Carregando...</p>
            </div>
        `;

    try {
      switch (page) {
        case "dashboard":
          await this.renderDashboard(container);
          break;
        case "ocorrencias":
          await this.renderOcorrencias(container);
          break;
        case "nova-ocorrencia":
          await this.renderNovaOcorrencia(container);
          break;
        case "relatorios":
          await this.renderRelatorios(container);
          break;
        case "usuarios":
          await this.renderUsuarios(container);
          break;
        case "perfil":
          await this.renderPerfil(container);
          break;
        default:
          container.innerHTML = "<p>Página em construção</p>";
      }
    } catch (error) {
      container.innerHTML = `
                <div class="container" style="text-align:center;padding:40px 20px;">
                    <div style="font-size:48px;">⚠️</div>
                    <h3>Erro ao carregar</h3>
                    <p style="color:var(--cinza-medio);">${error.message}</p>
                    <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
                        Voltar
                    </button>
                </div>
            `;
    }
  }

  // ========== RENDERIZAÇÃO ==========

  async renderDashboard(container) {
    const user = authManager.getUser();
    const stats = await ocorrenciaManager.getStats();
    const statsData = stats.success
      ? stats.data
      : { total: 0, hoje: 0, draft: 0, pending: 0, synced: 0 };

    container.innerHTML = `
            <div class="container">
                <h2 style="margin-bottom:4px;color:var(--azul-bandeira);">
                    Olá, ${user?.nome_completo || "Guarda"}!
                </h2>
                <p style="color:var(--cinza-medio);margin-bottom:16px;">
                    ${authManager.isSupervisor() ? "Visão geral do sistema" : "Suas ocorrências"}
                </p>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="icon"><i class="fas fa-clipboard-list"></i></div>
                        <div class="value">${statsData.total}</div>
                        <div class="label">Total</div>
                    </div>
                    <div class="stat-card verde">
                        <div class="icon"><i class="fas fa-check-circle"></i></div>
                        <div class="value">${statsData.synced}</div>
                        <div class="label">Finalizadas</div>
                    </div>
                    <div class="stat-card amarelo">
                        <div class="icon"><i class="fas fa-clock"></i></div>
                        <div class="value">${statsData.pending}</div>
                        <div class="label">Pendentes</div>
                    </div>
                    <div class="stat-card vermelho">
                        <div class="icon"><i class="fas fa-times-circle"></i></div>
                        <div class="value">${statsData.cancelled}</div>
                        <div class="label">Canceladas</div>
                    </div>
                </div>

                ${authManager.isSupervisor() ? this.renderSupervisorStats() : ""}

                <div id="listaOcorrenciasContainer">
                    <div style="text-align:center;padding:20px;">
                        <div class="spinner-azul" style="margin:0 auto;"></div>
                        <p style="margin-top:8px;color:var(--cinza-medio);">Carregando ocorrências...</p>
                    </div>
                </div>
            </div>
        `;

    await this.renderOcorrenciasLista(
      document.getElementById("listaOcorrenciasContainer"),
    );
  }

  renderSupervisorStats() {
    return `
            <div class="stats-grid" style="margin-top:8px;">
                <div class="stat-card roxo">
                    <div class="icon"><i class="fas fa-users"></i></div>
                    <div class="value" id="totalUsuarios">-</div>
                    <div class="label">Usuários</div>
                </div>
                <div class="stat-card verde">
                    <div class="icon"><i class="fas fa-chart-line"></i></div>
                    <div class="value" id="taxaSucesso">-</div>
                    <div class="label">Taxa de Sucesso</div>
                </div>
            </div>
        `;
  }

  async renderOcorrenciasLista(container) {
    const result = await ocorrenciaManager.listar({ limit: 5 });

    if (!result.success || result.data.length === 0) {
      container.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
                    <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                        <i class="fas fa-inbox"></i>
                    </div>
                    <p style="font-weight:500;">Nenhuma ocorrência encontrada</p>
                    <p style="font-size:13px;">Clique em "+" para criar sua primeira ocorrência</p>
                </div>
            `;
      return;
    }

    let html = `<div style="margin-top:16px;"><h3 style="font-size:16px;font-weight:700;margin-bottom:12px;"><i class="fas fa-list-ul" style="margin-right:8px;"></i>Últimas Ocorrências</h3>`;

    result.data.forEach((occ) => {
      const numero =
        occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
      const statusClass = this.getStatusClass(occ.status);
      const statusLabel = this.getStatusLabel(occ.status);
      const data = new Date(occ.criado_em).toLocaleDateString("pt-BR");
      const hora = new Date(occ.criado_em).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      html += `
                <div class="ocorrencia-item status-${occ.status}">
                    <div class="header">
                        <div>
                            <div class="numero">#${numero}</div>
                            <div class="data">${data} ${hora}</div>
                        </div>
                        <span class="badge badge-${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="local">
                        <i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--cinza-medio);"></i>
                        ${occ.local_ocorrencia || "Local não informado"}
                    </div>
                </div>
            `;
    });

    html += `<button class="btn-secondary" style="width:100%;padding:12px;border:none;border-radius:var(--border-radius);font-weight:600;cursor:pointer;background:var(--cinza-claro);color:var(--cinza-escuro);" onclick="app.navigateTo('ocorrencias')">
                    <i class="fas fa-arrow-right" style="margin-right:6px;"></i>
                    Ver todas as ocorrências
                </button></div>`;

    container.innerHTML = html;
  }

  async renderOcorrencias(container) {
    const result = await ocorrenciaManager.listar();

    if (!result.success) {
      container.innerHTML = `<p>Erro ao carregar: ${result.error}</p>`;
      return;
    }

    if (result.data.length === 0) {
      container.innerHTML = `
                <div class="container">
                    <h2 style="color:var(--azul-bandeira);"><i class="fas fa-list" style="margin-right:8px;"></i>Minhas Ocorrências</h2>
                    <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
                        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                            <i class="fas fa-inbox"></i>
                        </div>
                        <p style="font-weight:500;">Nenhuma ocorrência cadastrada</p>
                        <button onclick="app.navigateTo('nova-ocorrencia')" class="btn-primary" style="margin-top:16px;max-width:200px;">
                            <i class="fas fa-plus" style="margin-right:6px;"></i>
                            Nova Ocorrência
                        </button>
                    </div>
                </div>
            `;
      return;
    }

    let html = `<div class="container">
                        <h2 style="color:var(--azul-bandeira);margin-bottom:16px;">
                            <i class="fas fa-list" style="margin-right:8px;"></i>
                            Minhas Ocorrências
                        </h2>
                        <p style="color:var(--cinza-medio);margin-bottom:16px;">
                            <i class="fas fa-file-alt" style="margin-right:4px;"></i>
                            ${result.data.length} ocorrências encontradas
                        </p>`;

    result.data.forEach((occ) => {
      const numero =
        occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
      const statusClass = this.getStatusClass(occ.status);
      const statusLabel = this.getStatusLabel(occ.status);
      const data = new Date(occ.criado_em).toLocaleDateString("pt-BR");
      const hora = new Date(occ.criado_em).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      html += `
                <div class="ocorrencia-item status-${occ.status}">
                    <div class="header">
                        <div>
                            <div class="numero">#${numero}</div>
                            <div class="data">${data} ${hora}</div>
                        </div>
                        <span class="badge badge-${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="local">
                        <i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--cinza-medio);"></i>
                        ${occ.local_ocorrencia || "Local não informado"}
                    </div>
                </div>
            `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  getStatusClass(status) {
    const map = {
      draft: "draft",
      pending_sync: "pending",
      synced: "synced",
      cancelled: "cancelled",
      sync_error: "error",
    };
    return map[status] || "draft";
  }

  getStatusLabel(status) {
    const map = {
      draft: "Rascunho",
      pending_sync: "Pendente",
      syncing: "Sincronizando",
      synced: "Finalizada",
      cancelled: "Cancelada",
      sync_error: "Erro",
    };
    return map[status] || status;
  }

  // ============================================
  // NOVA OCORRÊNCIA
  // ============================================

  async renderNovaOcorrencia(container) {
    if (!this.novaOcorrencia) {
      this.novaOcorrencia = {
        etapa: 1,
        id: null,
        dados: {
          forma_solicitacao: "",
          nome_solicitante: "",
          telefone_solicitante: "",
          endereco_solicitante: "",
          codigo_municipal: "",
          complemento: "",
          bairro_solicitante: "",
          identificacao_adicional: "",
          codigo_operacional: "",
          local_ocorrencia: "",
          rodovia: "",
          bairro_ocorrencia: "",
          referencia: "",
          data_hora_inicio: "",
          data_hora_encerramento: "",
          envolvidos: [],
          observacoes: "",
          anexos: [],
        },
      };
    } else {
      this.novaOcorrencia.etapa = 1;
    }

    // Cria o container interno que será usado para navegação entre etapas
    container.innerHTML = '<div id="novaOcorrenciaContent"></div>';
    const contentContainer = document.getElementById("novaOcorrenciaContent");
    this.renderizarEtapa(contentContainer);
  }

  renderizarEtapa(container) {
    const etapa = this.novaOcorrencia.etapa;
    const dados = this.novaOcorrencia.dados;
    const totalEtapas = 6;

    console.log(`📌 Renderizando etapa ${etapa} de ${totalEtapas}`);

    let html = `
            <div class="container" style="padding-bottom:100px;">
                <div class="step-indicator">
                    ${this.renderSteps(etapa, totalEtapas)}
                </div>

                <div class="step-title">${this.getEtapaTitulo(etapa)}</div>
                <div class="step-subtitle">${this.getEtapaSubtitulo(etapa)}</div>

                <form id="formOcorrencia" style="margin-top:16px;">
                    ${this.renderEtapaForm(etapa, dados)}
                </form>

                <div class="form-actions">
                    ${
                      etapa > 1
                        ? `<button type="button" class="btn-secondary" onclick="app.etapaAnterior()">
                        <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar
                    </button>`
                        : ""
                    }
                    
                    ${
                      etapa < totalEtapas
                        ? `<button type="button" class="btn-primary" onclick="app.proximaEtapa()">
                        Próximo <i class="fas fa-arrow-right" style="margin-left:6px;"></i>
                    </button>`
                        : `
                        <button type="button" class="btn-success" onclick="app.finalizarOcorrencia()">
                            <i class="fas fa-check-circle" style="margin-right:6px;"></i> Finalizar Ocorrência
                        </button>
                    `
                    }
                </div>
            </div>
        `;

    container.innerHTML = html;
    this.configurarEventosFormulario();
  }

  renderSteps(etapaAtual, total) {
    let html = "";
    for (let i = 1; i <= total; i++) {
      const classe = i < etapaAtual ? "done" : i === etapaAtual ? "active" : "";
      html += `<div class="step ${classe}"><span class="step-number">${i}</span></div>`;
      if (i < total) {
        const linhaClasse =
          i < etapaAtual ? "done" : i === etapaAtual ? "active" : "";
        html += `<div class="line ${linhaClasse}"></div>`;
      }
    }
    return html;
  }

  getEtapaTitulo(etapa) {
    const titulos = {
      1: "Origem da Solicitação",
      2: "Dados da Ocorrência",
      3: "Qualificação dos Envolvidos",
      4: "Observações e Relato dos Fatos",
      5: "Anexos",
      6: "Revisão e Finalização",
    };
    return titulos[etapa] || "";
  }

  getEtapaSubtitulo(etapa) {
    const subtitulos = {
      1: "Informe como a solicitação chegou até você",
      2: "Preencha os dados principais da ocorrência",
      3: "Cadastre os envolvidos (autores, vítimas, testemunhas)",
      4: "Descreva detalhadamente o ocorrido",
      5: "Adicione fotos, vídeos ou documentos",
      6: "Revise todos os dados antes de finalizar",
    };
    return subtitulos[etapa] || "";
  }

  renderEtapaForm(etapa, dados) {
    switch (etapa) {
      case 1:
        return this.renderEtapa1(dados);
      case 2:
        return this.renderEtapa2(dados);
      case 3:
        return this.renderEtapa3(dados);
      case 4:
        return this.renderEtapa4(dados);
      case 5:
        return this.renderEtapa5(dados);
      case 6:
        return this.renderEtapa6(dados);
      default:
        return "<p>Etapa não encontrada</p>";
    }
  }

  // ============================================
  // ETAPA 1 - ORIGEM DA SOLICITAÇÃO
  // ============================================
  renderEtapa1(dados) {
    const opcoesForma = [
      { value: "", label: "Selecione..." },
      { value: "Via CCO", label: "Via CCO" },
      {
        value: "Diretamente com a Guarda Municipal",
        label: "Diretamente com a Guarda Municipal",
      },
      {
        value: "Diretamente com a ocorrência",
        label: "Diretamente com a ocorrência",
      },
    ];

    return `
            <div class="form-group">
                <label for="forma_solicitacao">
                    <i class="fas fa-phone-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Forma de solicitação <span class="required">*</span>
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-list-ul input-icon-left"></i>
                    <select id="forma_solicitacao" class="form-control" required>
                        ${opcoesForma
                          .map(
                            (op) => `
                            <option value="${op.value}" ${dados.forma_solicitacao === op.value ? "selected" : ""}>
                                ${op.label}
                            </option>
                        `,
                          )
                          .join("")}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="nome_solicitante">
                    <i class="fas fa-user" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Nome do solicitante
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-user input-icon-left"></i>
                    <input type="text" id="nome_solicitante" class="form-control" placeholder="Nome completo" value="${dados.nome_solicitante || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="telefone_solicitante">
                    <i class="fas fa-phone" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Telefone do solicitante
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-phone input-icon-left"></i>
                    <input type="tel" id="telefone_solicitante" class="form-control" placeholder="(44) 99999-9999" value="${dados.telefone_solicitante || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="endereco_solicitante">
                    <i class="fas fa-home" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Endereço informado pelo solicitante
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-map-marker-alt input-icon-left"></i>
                    <input type="text" id="endereco_solicitante" class="form-control" placeholder="Rua, número, bairro" value="${dados.endereco_solicitante || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="codigo_municipal">
                    <i class="fas fa-hashtag" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Código do próprio municipal
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-hashtag input-icon-left"></i>
                    <input type="text" id="codigo_municipal" class="form-control" placeholder="Código do imóvel" value="${dados.codigo_municipal || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="complemento">
                    <i class="fas fa-pen" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Complemento
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-pen input-icon-left"></i>
                    <input type="text" id="complemento" class="form-control" placeholder="Apto, bloco, ponto de referência" value="${dados.complemento || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="bairro_solicitante">
                    <i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Bairro
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-location-dot input-icon-left"></i>
                    <input type="text" id="bairro_solicitante" class="form-control" placeholder="Bairro" value="${dados.bairro_solicitante || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="identificacao_adicional">
                    <i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Identificação adicional do solicitante
                </label>
                <textarea id="identificacao_adicional" class="form-control" rows="3" placeholder="Informações adicionais para identificar o solicitante">${dados.identificacao_adicional || ""}</textarea>
            </div>
        `;
  }

  // ============================================
  // ETAPA 2 - DADOS DA OCORRÊNCIA
  // ============================================
  renderEtapa2(dados) {
    const now = new Date().toISOString().slice(0, 16);
    const dataInicio = dados.data_hora_inicio || now;
    const dataFim = dados.data_hora_encerramento || "";

    return `
            <div class="form-group">
                <label for="codigo_operacional">
                    <i class="fas fa-barcode" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Código operacional
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-barcode input-icon-left"></i>
                    <input type="text" id="codigo_operacional" class="form-control" placeholder="Código da ocorrência" value="${dados.codigo_operacional || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="local_ocorrencia">
                    <i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Local da ocorrência <span class="required">*</span>
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-map-marker-alt input-icon-left"></i>
                    <input type="text" id="local_ocorrencia" class="form-control" placeholder="Endereço completo" required value="${dados.local_ocorrencia || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="rodovia">
                    <i class="fas fa-road" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Rodovia (se aplicável)
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-road input-icon-left"></i>
                    <input type="text" id="rodovia" class="form-control" placeholder="BR-123, km 45" value="${dados.rodovia || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="bairro_ocorrencia">
                    <i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Bairro
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-location-dot input-icon-left"></i>
                    <input type="text" id="bairro_ocorrencia" class="form-control" placeholder="Bairro" value="${dados.bairro_ocorrencia || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="referencia">
                    <i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Referência
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-info-circle input-icon-left"></i>
                    <input type="text" id="referencia" class="form-control" placeholder="Ponto de referência próximo" value="${dados.referencia || ""}">
                </div>
            </div>

            <div class="form-group">
                <label for="data_hora_inicio">
                    <i class="fas fa-calendar-plus" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Data e hora do início <span class="required">*</span>
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-calendar input-icon-left"></i>
                    <input type="datetime-local" id="data_hora_inicio" class="form-control" required value="${dataInicio}">
                </div>
            </div>

            <div class="form-group">
                <label for="data_hora_encerramento">
                    <i class="fas fa-calendar-check" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Data e hora do encerramento
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-calendar-check input-icon-left"></i>
                    <input type="datetime-local" id="data_hora_encerramento" class="form-control" value="${dataFim}">
                </div>
            </div>
        `;
  }

  // ============================================
  // ETAPA 3 - QUALIFICAÇÃO DOS ENVOLVIDOS
  // ============================================
  renderEtapa3(dados) {
    const envolvidos = dados.envolvidos || [];

    let html = `
            <div style="margin-bottom:16px;">
                <p style="color:var(--cinza-medio);font-size:14px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    Cadastre os envolvidos na ocorrência. Você pode adicionar quantos forem necessários.
                </p>
            </div>

            <div id="listaEnvolvidos">
                ${
                  envolvidos.length === 0
                    ? `
                    <div style="text-align:center;padding:30px 20px;color:var(--cinza-medio);border:2px dashed var(--cinza-claro);border-radius:var(--border-radius);">
                        <i class="fas fa-users" style="font-size:32px;display:block;margin-bottom:8px;color:var(--cinza-claro);"></i>
                        <p>Nenhum envolvido cadastrado</p>
                        <p style="font-size:13px;">Clique no botão abaixo para adicionar</p>
                    </div>
                `
                    : `
                    ${envolvidos
                      .map(
                        (env, index) => `
                        <div class="envolvido-card">
                            <div class="envolvido-header">
                                <div>
                                    <span class="badge badge-azul">
                                        <i class="fas fa-user"></i> ${this.getTipoEnvolvidoLabel(env.tipo)}
                                    </span>
                                    <span style="font-weight:600;margin-left:8px;">${env.nome_completo || "Nome não informado"}</span>
                                </div>
                                <button type="button" class="remove-btn" onclick="app.removerEnvolvido(${index})">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div style="font-size:13px;color:var(--cinza-medio);">
                                ${env.cpf ? `<span><i class="fas fa-id-card"></i> ${env.cpf}</span>` : ""}
                                ${env.telefone ? `<span style="margin-left:12px;"><i class="fas fa-phone"></i> ${env.telefone}</span>` : ""}
                            </div>
                        </div>
                    `,
                      )
                      .join("")}
                `
                }
            </div>

            <button type="button" class="btn-secondary" onclick="app.adicionarEnvolvido()" style="width:100%;">
                <i class="fas fa-plus-circle" style="margin-right:6px;"></i> Adicionar Envolvido
            </button>
        `;

    return html;
  }

  getTipoEnvolvidoLabel(tipo) {
    const tipos = {
      autor: "Autor",
      vitima: "Vítima",
      testemunha: "Testemunha",
      solicitante: "Solicitante",
      outro: "Outro",
    };
    return tipos[tipo] || tipo;
  }

  // ============================================
  // ETAPA 4 - OBSERVAÇÕES E RELATO DOS FATOS
  // ============================================
  renderEtapa4(dados) {
    return `
            <div class="form-group">
                <label for="observacoes">
                    <i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Observações e Relato dos Fatos <span class="required">*</span>
                </label>
                <textarea id="observacoes" class="form-control" rows="8" placeholder="Descreva detalhadamente o ocorrido..." required>${dados.observacoes || ""}</textarea>
                <div class="input-hint">
                    <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                    Seja o mais detalhado possível
                </div>
            </div>
        `;
  }

  // ============================================
  // ETAPA 5 - ANEXOS
  // ============================================
  renderEtapa5(dados) {
    const anexos = dados.anexos || [];

    return `
            <div style="margin-bottom:16px;">
                <p style="color:var(--cinza-medio);font-size:14px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    Adicione fotos, vídeos ou documentos como evidência.
                </p>
            </div>

            <div class="file-upload" onclick="document.getElementById('fileInput').click()">
                <div class="icon">
                    <i class="fas fa-cloud-upload-alt"></i>
                </div>
                <div class="text">
                    <strong>Clique para adicionar anexos</strong><br>
                    <span style="font-size:13px;color:var(--cinza-medio);">Fotos, vídeos ou documentos</span>
                </div>
                <input type="file" id="fileInput" multiple accept="image/*,video/*,application/pdf" style="display:none;">
            </div>

            <div id="listaAnexos" style="margin-top:12px;">
                ${
                  anexos.length === 0
                    ? `
                    <div style="text-align:center;padding:20px;color:var(--cinza-medio);font-size:14px;">
                        <i class="fas fa-paperclip" style="margin-right:4px;"></i>
                        Nenhum anexo adicionado
                    </div>
                `
                    : `
                    <div class="file-list">
                        ${anexos
                          .map(
                            (anexo, index) => `
                            <div class="file-item">
                                <div class="file-info">
                                    <div class="icon">
                                        <i class="fas ${this.getIconAnexo(anexo.tipo)}"></i>
                                    </div>
                                    <div>
                                        <div class="name">${anexo.nome}</div>
                                        <div class="size">${this.formatarTamanho(anexo.tamanho)}</div>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <button type="button" class="remove-btn" onclick="app.removerAnexo(${index})">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        `,
                          )
                          .join("")}
                    </div>
                `
                }
            </div>
        `;
  }

  getIconAnexo(tipo) {
    const icons = {
      image: "fa-image",
      video: "fa-video",
      document: "fa-file-pdf",
      audio: "fa-music",
    };
    return icons[tipo] || "fa-file";
  }

  formatarTamanho(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  // ============================================
  // ETAPA 6 - REVISÃO E FINALIZAÇÃO
  // ============================================
  renderEtapa6(dados) {
    const envolvidos = dados.envolvidos || [];
    const anexos = dados.anexos || [];

    return `
            <div style="margin-bottom:16px;">
                <p style="color:var(--cinza-medio);font-size:14px;">
                    <i class="fas fa-check-circle" style="color:var(--verde-bandeira);"></i>
                    Revise todos os dados antes de finalizar a ocorrência.
                </p>
            </div>

            <div class="card">
                <h4 style="margin-bottom:8px;color:var(--azul-bandeira);">
                    <i class="fas fa-phone-alt" style="margin-right:6px;"></i>
                    Origem da Solicitação
                </h4>
                <div style="font-size:14px;">
                    <p><strong>Forma:</strong> ${dados.forma_solicitacao || "Não informado"}</p>
                    <p><strong>Solicitante:</strong> ${dados.nome_solicitante || "Não informado"}</p>
                    ${dados.telefone_solicitante ? `<p><strong>Telefone:</strong> ${dados.telefone_solicitante}</p>` : ""}
                    ${dados.endereco_solicitante ? `<p><strong>Endereço:</strong> ${dados.endereco_solicitante}</p>` : ""}
                </div>
            </div>

            <div class="card">
                <h4 style="margin-bottom:8px;color:var(--azul-bandeira);">
                    <i class="fas fa-map-marker-alt" style="margin-right:6px;"></i>
                    Dados da Ocorrência
                </h4>
                <div style="font-size:14px;">
                    <p><strong>Local:</strong> ${dados.local_ocorrencia || "Não informado"}</p>
                    ${dados.rodovia ? `<p><strong>Rodovia:</strong> ${dados.rodovia}</p>` : ""}
                    ${dados.bairro_ocorrencia ? `<p><strong>Bairro:</strong> ${dados.bairro_ocorrencia}</p>` : ""}
                    <p><strong>Início:</strong> ${dados.data_hora_inicio ? new Date(dados.data_hora_inicio).toLocaleString("pt-BR") : "Não informado"}</p>
                    ${dados.data_hora_encerramento ? `<p><strong>Encerramento:</strong> ${new Date(dados.data_hora_encerramento).toLocaleString("pt-BR")}</p>` : ""}
                </div>
            </div>

            <div class="card">
                <h4 style="margin-bottom:8px;color:var(--azul-bandeira);">
                    <i class="fas fa-users" style="margin-right:6px;"></i>
                    Envolvidos (${envolvidos.length})
                </h4>
                ${
                  envolvidos.length === 0
                    ? `
                    <p style="color:var(--cinza-medio);font-size:14px;">Nenhum envolvido cadastrado</p>
                `
                    : `
                    ${envolvidos
                      .map(
                        (env) => `
                        <div style="font-size:14px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);">
                            <span class="badge badge-azul" style="font-size:10px;">${this.getTipoEnvolvidoLabel(env.tipo)}</span>
                            <strong>${env.nome_completo}</strong>
                            ${env.cpf ? `<span style="color:var(--cinza-medio);font-size:12px;"> - ${env.cpf}</span>` : ""}
                        </div>
                    `,
                      )
                      .join("")}
                `
                }
            </div>

            <div class="card">
                <h4 style="margin-bottom:8px;color:var(--azul-bandeira);">
                    <i class="fas fa-pencil-alt" style="margin-right:6px;"></i>
                    Observações
                </h4>
                <p style="font-size:14px;white-space:pre-wrap;">${dados.observacoes || "Nenhuma observação registrada"}</p>
            </div>

            <div class="card">
                <h4 style="margin-bottom:8px;color:var(--azul-bandeira);">
                    <i class="fas fa-paperclip" style="margin-right:6px;"></i>
                    Anexos (${anexos.length})
                </h4>
                ${
                  anexos.length === 0
                    ? `
                    <p style="color:var(--cinza-medio);font-size:14px;">Nenhum anexo adicionado</p>
                `
                    : `
                    ${anexos
                      .map(
                        (anexo) => `
                        <div style="font-size:14px;padding:4px 0;">
                            <i class="fas ${this.getIconAnexo(anexo.tipo)}" style="color:var(--azul-bandeira);"></i>
                            ${anexo.nome} (${this.formatarTamanho(anexo.tamanho)})
                        </div>
                    `,
                      )
                      .join("")}
                `
                }
            </div>

            <div style="margin-top:16px;padding:12px;background:var(--verde-muito-claro);border-radius:var(--border-radius);border-left:4px solid var(--verde-bandeira);">
                <p style="font-size:13px;color:var(--verde-escuro);">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    Ao finalizar, a ocorrência será numerada e não poderá mais ser editada.
                </p>
            </div>
        `;
  }

  // ============================================
  // NAVEGAÇÃO DO FORMULÁRIO
  // ============================================

  configurarEventosFormulario() {
    document
      .querySelectorAll(
        "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
      )
      .forEach((input) => {
        input.addEventListener("change", () => {
          this.salvarDadosEtapa();
        });
        input.addEventListener("input", () => {
          this.salvarDadosEtapa();
        });
      });

    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        this.processarAnexos(e.target.files);
        fileInput.value = "";
      });
    }
  }

  salvarDadosEtapa() {
    const etapa = this.novaOcorrencia.etapa;
    const dados = this.novaOcorrencia.dados;

    switch (etapa) {
      case 1:
        dados.forma_solicitacao =
          document.getElementById("forma_solicitacao")?.value || "";
        dados.nome_solicitante =
          document.getElementById("nome_solicitante")?.value || "";
        dados.telefone_solicitante =
          document.getElementById("telefone_solicitante")?.value || "";
        dados.endereco_solicitante =
          document.getElementById("endereco_solicitante")?.value || "";
        dados.codigo_municipal =
          document.getElementById("codigo_municipal")?.value || "";
        dados.complemento = document.getElementById("complemento")?.value || "";
        dados.bairro_solicitante =
          document.getElementById("bairro_solicitante")?.value || "";
        dados.identificacao_adicional =
          document.getElementById("identificacao_adicional")?.value || "";
        break;
      case 2:
        dados.codigo_operacional =
          document.getElementById("codigo_operacional")?.value || "";
        dados.local_ocorrencia =
          document.getElementById("local_ocorrencia")?.value || "";
        dados.rodovia = document.getElementById("rodovia")?.value || "";
        dados.bairro_ocorrencia =
          document.getElementById("bairro_ocorrencia")?.value || "";
        dados.referencia = document.getElementById("referencia")?.value || "";
        dados.data_hora_inicio =
          document.getElementById("data_hora_inicio")?.value || "";
        dados.data_hora_encerramento =
          document.getElementById("data_hora_encerramento")?.value || "";
        break;
      case 4:
        dados.observacoes = document.getElementById("observacoes")?.value || "";
        break;
    }
  }

  proximaEtapa() {
    console.log("🔄 Tentando avançar da etapa:", this.novaOcorrencia.etapa);

    if (!this.validarEtapa()) {
      return;
    }

    // Salva os dados do formulário na memória (não no banco)
    this.salvarDadosEtapa();

    // Avança para a próxima etapa (SEM SALVAR NO BANCO)
    if (this.novaOcorrencia.etapa < 6) {
      this.novaOcorrencia.etapa++;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  etapaAnterior() {
    this.salvarDadosEtapa();
    if (this.novaOcorrencia.etapa > 1) {
      this.novaOcorrencia.etapa--;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  validarEtapa() {
    const etapa = this.novaOcorrencia.etapa;
    let isValid = true;
    let mensagem = "";

    console.log("🔍 Validando etapa:", etapa);

    switch (etapa) {
      case 1:
        const forma = document.getElementById("forma_solicitacao")?.value;
        if (!forma) {
          mensagem = "Selecione a forma de solicitação";
          isValid = false;
        }
        break;
      case 2:
        const local = document.getElementById("local_ocorrencia")?.value;
        const dataInicio = document.getElementById("data_hora_inicio")?.value;
        if (!local) {
          mensagem = "Informe o local da ocorrência";
          isValid = false;
        } else if (!dataInicio) {
          mensagem = "Informe a data e hora do início";
          isValid = false;
        }
        break;
      case 3:
        // Validação da etapa 3 (envolvidos) - opcional
        break;
      case 4:
        const observacoes = document.getElementById("observacoes")?.value;
        if (!observacoes || observacoes.trim().length < 10) {
          mensagem = "Descreva o ocorrido com pelo menos 10 caracteres";
          isValid = false;
        }
        break;
      case 5:
        // Validação da etapa 5 (anexos) - opcional
        break;
      case 6:
        // Validação da etapa 6 (revisão) - opcional
        break;
      default:
        break;
    }

    if (!isValid) {
      this.showToast(mensagem, "warning");
    }

    return isValid;
  }

  // ============================================
  // ENVOLVIDOS
  // ============================================

  adicionarEnvolvido() {
    const container = document.getElementById("novaOcorrenciaContent");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <div class="title">
                        <i class="fas fa-user-plus" style="margin-right:8px;color:var(--azul-bandeira);"></i>
                        Adicionar Envolvido
                    </div>
                    <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="formEnvolvido">
                        <div class="form-group">
                            <label for="env_tipo">Tipo <span class="required">*</span></label>
                            <select id="env_tipo" class="form-control" required>
                                <option value="">Selecione...</option>
                                <option value="autor">Autor</option>
                                <option value="vitima">Vítima</option>
                                <option value="testemunha">Testemunha</option>
                                <option value="solicitante">Solicitante</option>
                                <option value="outro">Outro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="env_nome">Nome Completo <span class="required">*</span></label>
                            <input type="text" id="env_nome" class="form-control" placeholder="Nome completo" required>
                        </div>
                        <div class="form-group">
                            <label for="env_cpf">CPF</label>
                            <input type="text" id="env_cpf" class="form-control" placeholder="123.456.789-00">
                        </div>
                        <div class="form-group">
                            <label for="env_telefone">Telefone</label>
                            <input type="text" id="env_telefone" class="form-control" placeholder="(44) 99999-9999">
                        </div>
                        <div class="form-group">
                            <label for="env_rg">RG</label>
                            <input type="text" id="env_rg" class="form-control" placeholder="RG">
                        </div>
                        <div class="form-group">
                            <label for="env_data_nascimento">Data de Nascimento</label>
                            <input type="date" id="env_data_nascimento" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="env_endereco">Endereço</label>
                            <input type="text" id="env_endereco" class="form-control" placeholder="Endereço">
                        </div>
                        <div class="form-group">
                            <label for="env_bairro">Bairro</label>
                            <input type="text" id="env_bairro" class="form-control" placeholder="Bairro">
                        </div>
                        <div class="form-group">
                            <label for="env_cidade">Cidade</label>
                            <input type="text" id="env_cidade" class="form-control" placeholder="Cidade">
                        </div>
                        <div class="form-group">
                            <label for="env_nome_pai">Nome do Pai</label>
                            <input type="text" id="env_nome_pai" class="form-control" placeholder="Nome do pai">
                        </div>
                        <div class="form-group">
                            <label for="env_nome_mae">Nome da Mãe</label>
                            <input type="text" id="env_nome_mae" class="form-control" placeholder="Nome da mãe">
                        </div>
                        <div class="form-group">
                            <label for="env_observacoes">Observações</label>
                            <textarea id="env_observacoes" class="form-control" rows="2" placeholder="Observações adicionais"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        Cancelar
                    </button>
                    <button type="button" class="btn-primary" onclick="app.salvarEnvolvido()">
                        <i class="fas fa-save" style="margin-right:6px;"></i> Salvar
                    </button>
                </div>
            </div>
        `;
    container.appendChild(overlay);
  }

  salvarEnvolvido() {
    const tipo = document.getElementById("env_tipo")?.value;
    const nome = document.getElementById("env_nome")?.value;

    if (!tipo || !nome) {
      this.showToast("Preencha o tipo e o nome do envolvido", "warning");
      return;
    }

    const envolvido = {
      tipo: tipo,
      nome_completo: nome,
      cpf: document.getElementById("env_cpf")?.value || "",
      telefone: document.getElementById("env_telefone")?.value || "",
      rg: document.getElementById("env_rg")?.value || "",
      data_nascimento:
        document.getElementById("env_data_nascimento")?.value || "",
      endereco: document.getElementById("env_endereco")?.value || "",
      bairro: document.getElementById("env_bairro")?.value || "",
      cidade: document.getElementById("env_cidade")?.value || "",
      nome_pai: document.getElementById("env_nome_pai")?.value || "",
      nome_mae: document.getElementById("env_nome_mae")?.value || "",
      observacoes: document.getElementById("env_observacoes")?.value || "",
    };

    this.novaOcorrencia.dados.envolvidos.push(envolvido);

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
    this.showToast("Envolvido adicionado com sucesso!", "success");
  }

  removerEnvolvido(index) {
    this.novaOcorrencia.dados.envolvidos.splice(index, 1);
    this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
    this.showToast("Envolvido removido", "info");
  }

  // ============================================
  // ANEXOS
  // ============================================

  processarAnexos(files) {
    const anexos = this.novaOcorrencia.dados.anexos || [];

    for (const file of files) {
      if (file.size > 10485760) {
        this.showToast(`Arquivo ${file.name} excede 10MB`, "warning");
        continue;
      }

      const tipo = this.determinarTipoAnexo(file);
      anexos.push({
        nome: file.name,
        tipo: tipo,
        tamanho: file.size,
        arquivo: file,
      });
    }

    this.novaOcorrencia.dados.anexos = anexos;
    this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
    this.showToast(`${files.length} anexo(s) adicionado(s)`, "success");
  }

  determinarTipoAnexo(file) {
    const type = file.type;
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type === "application/pdf" || type.includes("document"))
      return "document";
    if (type.startsWith("audio/")) return "audio";
    return "document";
  }

  removerAnexo(index) {
    this.novaOcorrencia.dados.anexos.splice(index, 1);
    this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
    this.showToast("Anexo removido", "info");
  }

  // ============================================
  // FINALIZAR OCORRÊNCIA
  // ============================================

  async finalizarOcorrencia() {
    this.salvarDadosEtapa();

    const dados = this.novaOcorrencia.dados;

    if (!dados.forma_solicitacao) {
      this.showToast("Preencha a forma de solicitação", "warning");
      this.novaOcorrencia.etapa = 1;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.local_ocorrencia) {
      this.showToast("Preencha o local da ocorrência", "warning");
      this.novaOcorrencia.etapa = 2;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.data_hora_inicio || dados.data_hora_inicio === "") {
      this.showToast("Preencha a data e hora do início", "warning");
      this.novaOcorrencia.etapa = 2;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.observacoes || dados.observacoes.trim().length < 10) {
      this.showToast(
        "Descreva o ocorrido com pelo menos 10 caracteres",
        "warning",
      );
      this.novaOcorrencia.etapa = 4;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (
      !confirm(
        "Deseja finalizar esta ocorrência? Após finalizar, não será mais possível editar.",
      )
    ) {
      return;
    }

    const envolvidos = dados.envolvidos || [];
    const anexos = dados.anexos || [];

    const dadosParaSalvar = { ...dados };
    delete dadosParaSalvar.envolvidos;
    delete dadosParaSalvar.anexos;

    if (
      !dadosParaSalvar.data_hora_inicio ||
      dadosParaSalvar.data_hora_inicio === ""
    ) {
      dadosParaSalvar.data_hora_inicio = new Date().toISOString();
    }

    const result = await ocorrenciaManager.criar({
      ...dadosParaSalvar,
      status: navigator.onLine ? "synced" : "pending_sync",
    });

    if (!result.success) {
      this.showToast("Erro ao salvar ocorrência: " + result.error, "error");
      return;
    }

    const ocorrenciaId = result.data.id;
    let erros = [];

    if (envolvidos.length > 0) {
      const envResult = await ocorrenciaManager.salvarEnvolvidos(
        ocorrenciaId,
        envolvidos,
      );
      if (!envResult.success) {
        erros.push("Erro ao salvar envolvidos: " + envResult.error);
      }
    }

    if (anexos.length > 0) {
      const anexoResult = await ocorrenciaManager.salvarAnexos(
        ocorrenciaId,
        anexos,
      );
      if (!anexoResult.success) {
        erros.push("Erro ao salvar anexos: " + anexoResult.error);
      }
    }

    if (erros.length > 0) {
      this.showToast(
        "Ocorrência salva, mas com erros: " + erros.join(" | "),
        "warning",
      );
    } else {
      this.showToast("Ocorrência finalizada com sucesso!", "success");
    }

    this.novaOcorrencia = {
      etapa: 1,
      id: null,
      dados: {
        forma_solicitacao: "",
        nome_solicitante: "",
        telefone_solicitante: "",
        endereco_solicitante: "",
        codigo_municipal: "",
        complemento: "",
        bairro_solicitante: "",
        identificacao_adicional: "",
        codigo_operacional: "",
        local_ocorrencia: "",
        rodovia: "",
        bairro_ocorrencia: "",
        referencia: "",
        data_hora_inicio: "",
        data_hora_encerramento: "",
        envolvidos: [],
        observacoes: "",
        anexos: [],
      },
    };

    setTimeout(() => this.navigateTo("dashboard"), 1500);
  }

  // ============================================
  // PRIMEIRO ACESSO
  // ============================================

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
  // LOGIN
  // ============================================

  setupListeners() {
    authManager.onAuthChange((event) => {
      if (event === "login" || event === "logout") this.route();
    });

    document
      .getElementById("menuToggle")
      ?.addEventListener("click", () => this.toggleMenu());
    document
      .getElementById("menuOverlay")
      ?.addEventListener("click", () => this.closeMenu());

    document.querySelectorAll(".menu-item[data-page]").forEach((item) => {
      item.addEventListener("click", () => {
        this.navigateTo(item.dataset.page);
        this.closeMenu();
      });
    });

    document
      .getElementById("btnLogout")
      ?.addEventListener("click", async () => {
        await authManager.logout();
        this.route();
        this.showToast("Logout realizado", "info");
      });

    document
      .getElementById("loginForm")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });

    document
      .querySelector(".toggle-password")
      ?.addEventListener("click", (e) => {
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

    document.getElementById("fab")?.addEventListener("click", () => {
      this.navigateTo("nova-ocorrencia");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeMenu();
    });
  }

  toggleMenu() {
    document.getElementById("sideMenu").classList.toggle("open");
    document.getElementById("menuOverlay").classList.toggle("active");
  }

  closeMenu() {
    document.getElementById("sideMenu").classList.remove("open");
    document.getElementById("menuOverlay").classList.remove("active");
  }

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

  // ============================================
  // CONEXÃO
  // ============================================

  setupConnectionMonitor() {
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      const statusEl = document.getElementById("connectionStatus");
      if (statusEl) {
        statusEl.className = `connection-status ${isOnline ? "online" : "offline"}`;
        const text = statusEl.querySelector(".status-text");
        if (text) text.textContent = isOnline ? "Online" : "Offline";
      }
    };

    window.addEventListener("online", () => {
      updateStatus();
      this.showToast("Conexão restaurada", "success");
    });

    window.addEventListener("offline", () => {
      updateStatus();
      this.showToast("Modo offline ativado", "warning");
    });

    updateStatus();
  }

  // ============================================
  // TOAST
  // ============================================

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const iconMap = {
      success: "fas fa-check-circle",
      error: "fas fa-exclamation-circle",
      warning: "fas fa-exclamation-triangle",
      info: "fas fa-info-circle",
    };

    toast.innerHTML = `<i class="${iconMap[type] || iconMap.info}" style="margin-right:8px;"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("out");
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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
}

// ============================================
// INICIALIZAÇÃO
// ============================================

const app = new App();
window.app = app;

function iniciarApp() {
  console.log("🚀 Iniciando app...");
  console.log("🔍 Verificando authManager global:");
  console.log("  - authManager existe?", typeof authManager !== "undefined");
  console.log("  - authManager.isLoggedIn?", typeof authManager?.isLoggedIn);

  if (typeof authManager === "undefined") {
    console.error("❌ authManager não definido!");
    setTimeout(iniciarApp, 500);
    return;
  }

  if (typeof authManager.isLoggedIn !== "function") {
    console.error("❌ authManager.isLoggedIn não é uma função!");
    console.log("🔍 authManager:", authManager);
    setTimeout(iniciarApp, 500);
    return;
  }

  app.init();
}

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
