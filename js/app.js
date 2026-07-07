/**
 * APLICAÇÃO PRINCIPAL
 * Guarda Municipal de Pitangueiras - PR
 */

class App {
  constructor() {
    this.currentPage = "login";
    this.initialized = false;
    this.filtroStatusAtual = null;
    this.paginaDestino = null;
    this.paramsDestino = null;
    this.relatorioAtivo = null;
    this.relatorioFiltros = {
      dataInicio: null,
      dataFim: null,
    };
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
      "detalhe-ocorrencia": {
        element: "page-detalhe-ocorrencia",
        showHeader: true,
        showFab: false,
      },
      retificacoes: {
        element: "page-retificacoes",
        showHeader: true,
        showFab: false,
      },
      relatorios: {
        element: "page-relatorios",
        showHeader: true,
        showFab: false,
      },
      logs: {
        element: "page-logs",
        showHeader: true,
        showFab: false,
      },
      usuarios: { element: "page-usuarios", showHeader: true, showFab: false },
      perfil: { element: "page-perfil", showHeader: true, showFab: false },
    };
    this.rascunhoId = null;
    this.dadosRascunho = null;
    this.alteracoesNaoSalvas = false;
    this.filtrosOcorrencias = {
      status: "",
      dataInicio: "",
      dataFim: "",
    };
    this.filtrosLogs = {};
  }

  // ============================================
  // CONSTANTES - TIPOS DE OCORRÊNCIA
  // ============================================

  get TIPOS_OCORRENCIA() {
    return [
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
  }

  // ============================================
  // FUNÇÕES DE FUSO HORÁRIO (BRASÍLIA - UTC-3)
  // ============================================

  obterDataHoraBrasilia() {
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const localOffset = now.getTimezoneOffset();
    const diff = brasiliaOffset - localOffset;
    return new Date(now.getTime() + diff * 60 * 1000);
  }

  formatarDataHoraLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // ============================================
  // UTILITÁRIOS - MASCARAR CPF (LGPD)
  // ============================================

  formatarCPFSeguro(cpf) {
    if (!cpf) return "***.***.***-**";

    const cpfLimpo = cpf.replace(/\D/g, "");

    if (authManager.isSupervisor()) {
      return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }

    if (cpfLimpo.length === 11) {
      const parte2 = cpfLimpo.substring(3, 6);
      const parte4 = cpfLimpo.substring(9, 11);
      return `***.${parte2}.***-${parte4}`;
    }

    return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.***-$4");
  }

  // ============================================
  // CAPTURAR GEOLOCALIZAÇÃO
  // ============================================

  obterLocalizacao() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          resolve({ latitude: null, longitude: null });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        },
      );
    });
  }

  // ============================================
  // CONFIRMAÇÃO PERSONALIZADA (MODAL)
  // ============================================

  confirmar(mensagem, titulo = "Confirmar") {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal" style="max-width:400px;">
          <div class="modal-header">
            <div class="title">
              <i class="fas fa-question-circle" style="margin-right:8px;color:var(--azul-bandeira);"></i>
              ${titulo}
            </div>
            <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <p style="font-size:16px;color:var(--cinza-escuro);margin:0;text-align:center;line-height:1.6;">
              ${mensagem}
            </p>
          </div>
          <div class="modal-footer" style="flex-direction:row;gap:10px;">
            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._confirmResolve(false);" style="flex:1;">
              Cancelar
            </button>
            <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove(); window._confirmResolve(true);" style="flex:1;">
              <i class="fas fa-check" style="margin-right:6px;"></i> Confirmar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      window._confirmResolve = resolve;
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  // ============================================
  // MODAL DE INPUT PERSONALIZADO (para motivo da rejeição)
  // ============================================

  inputModal(
    mensagem,
    titulo = "Informe o motivo",
    placeholder = "Digite o motivo...",
  ) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal" style="max-width:450px;">
          <div class="modal-header">
            <div class="title">
              <i class="fas fa-pencil-alt" style="margin-right:8px;color:var(--azul-bandeira);"></i>
              ${titulo}
            </div>
            <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._inputResolve(null);">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <p style="font-size:14px;color:var(--cinza-escuro);margin-bottom:12px;">
              ${mensagem}
            </p>
            <div class="form-group">
              <label for="inputMotivo">Motivo <span class="required">*</span></label>
              <textarea id="inputMotivo" class="form-control" rows="3" placeholder="${placeholder}" required></textarea>
              <div class="input-hint">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Mínimo 5 caracteres
              </div>
            </div>
          </div>
          <div class="modal-footer" style="flex-direction:row;gap:10px;">
            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._inputResolve(null);" style="flex:1;">
              Cancelar
            </button>
            <button type="button" class="btn-primary" onclick="app.confirmarInputModal();" style="flex:1;">
              <i class="fas fa-check" style="margin-right:6px;"></i> Confirmar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      window._inputResolve = resolve;

      setTimeout(() => {
        const textarea = document.getElementById("inputMotivo");
        if (textarea) textarea.focus();
      }, 300);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      });

      document.addEventListener("keydown", function handler(e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          app.confirmarInputModal();
        }
      });
    });
  }

  confirmarInputModal() {
    const textarea = document.getElementById("inputMotivo");
    if (!textarea) return;

    const valor = textarea.value.trim();
    if (valor.length < 5) {
      this.showToast("O motivo deve ter pelo menos 5 caracteres", "warning");
      return;
    }

    const overlay = textarea.closest(".modal-overlay");
    if (overlay) {
      window._inputResolve(valor);
      overlay.remove();
    }
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

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

      if (authManager.isLoggedIn()) {
        this.atualizarHeader();
        await this.carregarRascunho();
      }

      await this.route();

      this.initialized = true;
      console.log("✅ Aplicação inicializada com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao iniciar:", error);
      this.mostrarErro(error.message);
    }
  }

  // ============================================
  // RASCUNHO
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

        const envResult = await ocorrenciaManager.listarEnvolvidos(data.id);
        if (envResult.success) {
          this.dadosRascunho.envolvidos = envResult.data;
        }

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

      const dadosParaSalvar = { ...dados };
      delete dadosParaSalvar.envolvidos;
      delete dadosParaSalvar.anexos;

      if (
        !dadosParaSalvar.data_hora_inicio ||
        dadosParaSalvar.data_hora_inicio === ""
      ) {
        dadosParaSalvar.data_hora_inicio = null;
      } else {
        try {
          const dateObj = new Date(dadosParaSalvar.data_hora_inicio);
          if (!isNaN(dateObj.getTime())) {
            dadosParaSalvar.data_hora_inicio = dateObj.toISOString();
          } else {
            dadosParaSalvar.data_hora_inicio = null;
          }
        } catch (e) {
          dadosParaSalvar.data_hora_inicio = null;
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

  // ============================================
  // PERGUNTAR SALVAR RASCUNHO
  // ============================================

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
  // ATUALIZAR HEADER
  // ============================================

  atualizarHeader() {
    const user = authManager.getUser();
    if (!user) {
      console.warn("⚠️ Nenhum usuário logado para atualizar o header");
      return;
    }

    console.log("📝 Atualizando header com usuário:", user.nome_completo);

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

    const menuNomeEl = document.getElementById("menuNome");
    if (menuNomeEl) {
      menuNomeEl.textContent = user.nome_completo || "Carregando...";
    }

    const menuMatriculaEl = document.getElementById("menuMatricula");
    if (menuMatriculaEl) {
      menuMatriculaEl.textContent = user.matricula
        ? `Mat. ${user.matricula}`
        : "";
    }

    const menuAvatarEl = document.getElementById("menuAvatar");
    if (menuAvatarEl) {
      const inicial = user.nome_completo?.charAt(0) || "G";
      menuAvatarEl.innerHTML = `<span style="font-weight:700;font-size:28px;">${inicial.toUpperCase()}</span>`;
    }

    const menuPerfilEl = document.getElementById("menuPerfil");
    if (menuPerfilEl) {
      const perfilMap = {
        supervisor: "Supervisor",
        guarda: "Guarda",
        admin: "Administrador",
      };
      menuPerfilEl.textContent =
        perfilMap[user.perfil] || user.perfil || "Guarda";
    }

    const menuRelatorios = document.getElementById("menuRelatorios");
    const menuUsuarios = document.getElementById("menuUsuarios");
    const menuRetificacoes = document.getElementById("menuRetificacoes");
    const menuLogs = document.getElementById("menuLogs");

    if (menuRelatorios) {
      menuRelatorios.style.display = authManager.isSupervisor()
        ? "flex"
        : "none";
    }
    if (menuUsuarios) {
      menuUsuarios.style.display = authManager.isSupervisor() ? "flex" : "none";
    }
    if (menuRetificacoes) {
      menuRetificacoes.style.display = authManager.isSupervisor()
        ? "flex"
        : "none";
    }
    if (menuLogs) {
      menuLogs.style.display = authManager.isSupervisor() ? "flex" : "none";
    }
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
    if (this.currentPage === "nova-ocorrencia" && this.alteracoesNaoSalvas) {
      this.paginaDestino = page;
      this.paramsDestino = params;
      this.perguntarSalvarRascunho(page);
      return;
    }

    this.executarNavegacao(page, params);
  }

  executarNavegacao(page, params = null) {
    if (!authManager.isLoggedIn() && page !== "login") {
      this.showPage("login");
      return;
    }

    if (!this.pages[page]) page = "dashboard";

    if (params) {
      this.currentParams = params;
    } else {
      this.currentParams = null;
    }

    if (page !== "dashboard") {
      this.filtroStatusAtual = null;
    }

    if (
      page === "relatorios" ||
      page === "usuarios" ||
      page === "retificacoes" ||
      page === "logs"
    ) {
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
        case "detalhe-ocorrencia":
          await this.renderDetalheOcorrencia(container);
          break;
        case "retificacoes":
          await this.renderRetificacoes(container);
          break;
        case "relatorios":
          await this.renderRelatorios(container);
          break;
        case "logs":
          await this.renderLogs(container);
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

  // ============================================
  // RENDERIZAÇÃO - DASHBOARD
  // ============================================

  async renderDashboard(container) {
    const user = authManager.getUser();
    const stats = await ocorrenciaManager.getStats();
    const statsData = stats.success
      ? stats.data
      : {
          total: 0,
          hoje: 0,
          draft: 0,
          pending: 0,
          synced: 0,
          cancelled: 0,
          rectified: 0,
          pending_rectification: 0,
        };

    let pendentesCount = 0;
    let pendentesData = [];
    if (authManager.isSupervisor()) {
      const pendentesResult =
        await ocorrenciaManager.buscarRetificacoesPendentes();
      console.log(
        "📋 Dashboard - Resultado da busca de retificações:",
        pendentesResult,
      );
      if (pendentesResult.success) {
        pendentesData = pendentesResult.data || [];
        pendentesCount = pendentesData.length;
        console.log(`📋 Dashboard - Retificações pendentes: ${pendentesCount}`);
      }
    }

    const filtroAtivo = this.filtroStatusAtual;
    const tituloFiltro = filtroAtivo
      ? this.getStatusLabel(filtroAtivo)
      : "Todas";

    container.innerHTML = `
            <div class="container">
                <h2 style="margin-bottom:4px;color:var(--azul-bandeira);">
                    Olá, ${user?.nome_completo || "Guarda"}!
                </h2>
                <p style="color:var(--cinza-medio);margin-bottom:16px;">
                    ${authManager.isSupervisor() ? "Visão geral do sistema" : "Suas ocorrências"}
                </p>

                <div class="stats-grid">
                    <div class="stat-card" onclick="app.filtrarPorStatus(null)" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-tasks"></i></div>
                        <div class="value">${statsData.total}</div>
                        <div class="label">Total</div>
                    </div>
                    <div class="stat-card amarelo" onclick="app.filtrarPorStatus('pending_sync')" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-clock"></i></div>
                        <div class="value">${statsData.pending}</div>
                        <div class="label">Pendentes</div>
                    </div>
                    <div class="stat-card verde" onclick="app.filtrarPorStatus('synced')" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-check-circle"></i></div>
                        <div class="value">${statsData.synced}</div>
                        <div class="label">Finalizadas</div>
                    </div>
                    <div class="stat-card" style="border-left:3px solid var(--azul-bandeira);background:var(--azul-muito-claro);" onclick="app.filtrarPorStatus('rectified')" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-sync-alt" style="color:var(--azul-bandeira);"></i></div>
                        <div class="value" style="color:var(--azul-bandeira);">${statsData.rectified || 0}</div>
                        <div class="label" style="color:var(--azul-bandeira);">Retificadas</div>
                    </div>
                    <div class="stat-card" style="border-left:3px solid var(--aviso);background:#fef3c7;" onclick="app.filtrarPorStatus('pending_rectification')" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-clock" style="color:#92400e;"></i></div>
                        <div class="value" style="color:#92400e;">${statsData.pending_rectification || 0}</div>
                        <div class="label" style="color:#92400e;">Retif. Pendente</div>
                    </div>
                    <div class="stat-card vermelho" onclick="app.filtrarPorStatus('cancelled')" style="cursor:pointer;">
                        <div class="icon"><i class="fas fa-times-circle"></i></div>
                        <div class="value">${statsData.cancelled}</div>
                        <div class="label">Canceladas</div>
                    </div>
                </div>

                ${
                  authManager.isSupervisor()
                    ? `
                <div style="margin-top:12px;background:var(--branco);border-radius:var(--border-radius);padding:12px 16px;box-shadow:var(--sombra-suave);border-left:4px solid var(--azul-bandeira);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="app.navigateTo('retificacoes')">
                  <div>
                    <span style="font-weight:600;font-size:14px;">
                      <i class="fas fa-sync-alt" style="color:var(--azul-bandeira);margin-right:8px;"></i>
                      Solicitações de Retificação Pendentes
                    </span>
                    <span style="font-size:12px;color:var(--cinza-medio);margin-left:8px;">
                      Aguardando sua análise
                    </span>
                  </div>
                  <span class="badge badge-pending" style="font-size:14px;padding:6px 14px;">
                    ${pendentesCount}
                  </span>
                </div>
                `
                    : ""
                }

                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
                    <h3 style="font-size:16px;font-weight:700;margin:0;">
                        <i class="fas fa-list-ul" style="margin-right:8px;"></i>
                        ${filtroAtivo ? `Ocorrências - ${tituloFiltro}` : "Últimas Ocorrências"}
                    </h3>
                    ${
                      filtroAtivo
                        ? `
                        <button class="btn-secondary" onclick="app.filtrarPorStatus(null)" style="padding:4px 12px;font-size:12px;min-height:auto;">
                            <i class="fas fa-times" style="margin-right:4px;"></i> Limpar Filtro
                        </button>
                    `
                        : ""
                    }
                </div>

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
      this.filtroStatusAtual,
    );
  }

  filtrarPorStatus(status) {
    if (this.filtroStatusAtual === status && status !== null) {
      this.filtroStatusAtual = null;
    } else {
      this.filtroStatusAtual = status;
    }
    this.loadPageContent("dashboard");
  }

  // ============================================
  // RENDERIZAÇÃO - LISTA DE OCORRÊNCIAS
  // ============================================

  async renderOcorrenciasLista(container, statusFilter = null) {
    const filtros = { limit: statusFilter ? 100 : 5 };
    if (statusFilter) {
      filtros.status = statusFilter;
    }

    const result = await ocorrenciaManager.listar(filtros);

    if (!result.success || result.data.length === 0) {
      const mensagem = statusFilter
        ? `Nenhuma ocorrência com status "${this.getStatusLabel(statusFilter)}" encontrada`
        : "Nenhuma ocorrência encontrada";
      container.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
                    <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                        <i class="fas fa-inbox"></i>
                    </div>
                    <p style="font-weight:500;">${mensagem}</p>
                    ${!statusFilter ? '<p style="font-size:13px;">Clique em "+" para criar sua primeira ocorrência</p>' : ""}
                    ${
                      statusFilter
                        ? `
                        <button onclick="app.filtrarPorStatus(null)" class="btn-secondary" style="margin-top:12px;">
                            <i class="fas fa-arrow-left" style="margin-right:6px;"></i>
                            Ver todas
                        </button>
                    `
                        : ""
                    }
                </div>
            `;
      return;
    }

    let html = ``;

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

      const tipoLabel = this.getTipoLabel(occ.tipo_ocorrencia);
      const tipoBadge = occ.tipo_ocorrencia
        ? `<span class="badge badge-tipo badge-tipo-${occ.tipo_ocorrencia}">${tipoLabel}</span>`
        : "";

      const versaoBadge =
        occ.status === "rectified" && occ.numero_versao > 1
          ? ` <span class="badge badge-rectified" style="font-size:9px;padding:1px 8px;">v${occ.numero_versao}</span>`
          : "";

      const guardaNome = occ.criador?.nome_completo || "Desconhecido";
      const guardaCPF = occ.criador?.cpf || "";
      const cpfExibido = this.formatarCPFSeguro(guardaCPF);

      html += `
                <div class="ocorrencia-item status-${occ.status}" onclick="app.verDetalhes('${occ.id}')">
                    <div class="header">
                        <div>
                            <div class="numero">#${numero} ${tipoBadge} ${versaoBadge}</div>
                            <div class="data">${data} ${hora}</div>
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
                    </div>
                </div>
            `;
    });

    if (!statusFilter) {
      html += `<button class="btn-secondary" style="width:100%;padding:12px;border:none;border-radius:var(--border-radius);font-weight:600;cursor:pointer;background:var(--cinza-claro);color:var(--cinza-escuro);" onclick="app.navigateTo('ocorrencias')">
                    <i class="fas fa-arrow-right" style="margin-right:6px;"></i>
                    Ver todas as ocorrências
                </button>`;
    } else {
      html += `<div style="text-align:center;padding:12px;color:var(--cinza-medio);font-size:13px;">
                    <i class="fas fa-filter" style="margin-right:4px;"></i>
                    ${result.data.length} ocorrência(s) encontrada(s)
                </div>`;
    }

    container.innerHTML = html;
  }

  // ============================================
  // RENDERIZAÇÃO - OCORRÊNCIAS
  // ============================================

  async renderOcorrencias(container) {
    const filtros = {};
    if (this.filtrosOcorrencias.status) {
      filtros.status = this.filtrosOcorrencias.status;
    }
    if (this.filtrosOcorrencias.dataInicio) {
      filtros.data_inicio = this.filtrosOcorrencias.dataInicio;
    }
    if (this.filtrosOcorrencias.dataFim) {
      filtros.data_fim = this.filtrosOcorrencias.dataFim;
    }

    const result = await ocorrenciaManager.listar(filtros);

    const opcoesStatus = [
      { value: "", label: "Todos os status" },
      { value: "draft", label: "Rascunho" },
      { value: "pending_sync", label: "Pendente" },
      { value: "synced", label: "Finalizada" },
      { value: "rectified", label: "Retificada" },
      { value: "pending_rectification", label: "Retificação Pendente" },
      { value: "cancelled", label: "Cancelada" },
    ];

    const hoje = new Date().toISOString().slice(0, 10);
    const dataInicioFiltro = this.filtrosOcorrencias.dataInicio || "";
    const dataFimFiltro = this.filtrosOcorrencias.dataFim || "";

    let html = `
      <div class="container">
        <h2 style="color:var(--azul-bandeira);margin-bottom:8px;">
          <i class="fas fa-file-alt" style="margin-right:8px;"></i>
          Minhas Ocorrências
        </h2>
        <p style="color:var(--cinza-medio);margin-bottom:16px;font-size:14px;">
          <i class="fas fa-filter" style="margin-right:4px;"></i>
          Filtre suas ocorrências por período e status
        </p>

        <div class="filtros-container">
          <div class="filtros-row">
            <div class="filtro-group">
              <label><i class="fas fa-tag" style="margin-right:4px;"></i> Status</label>
              <select id="filtroStatus">
                ${opcoesStatus
                  .map(
                    (op) => `
                  <option value="${op.value}" ${this.filtrosOcorrencias.status === op.value ? "selected" : ""}>
                    ${op.label}
                  </option>
                `,
                  )
                  .join("")}
              </select>
            </div>
            <div class="filtro-group">
              <label><i class="fas fa-calendar-alt" style="margin-right:4px;"></i> Data Início</label>
              <input type="date" id="filtroDataInicio" value="${dataInicioFiltro}">
            </div>
            <div class="filtro-group">
              <label><i class="fas fa-calendar-alt" style="margin-right:4px;"></i> Data Fim</label>
              <input type="date" id="filtroDataFim" value="${dataFimFiltro}">
            </div>
            <div class="filtros-actions">
              <button onclick="app.aplicarFiltrosOcorrencias()" class="btn-primary" style="padding:6px 14px;font-size:12px;min-height:36px;width:auto;">
                <i class="fas fa-search" style="margin-right:6px;"></i> Filtrar
              </button>
              <button onclick="app.limparFiltrosOcorrencias()" class="btn-secondary" style="padding:6px 14px;font-size:12px;min-height:36px;width:auto;">
                <i class="fas fa-undo" style="margin-right:6px;"></i> Limpar
              </button>
            </div>
          </div>
          <div class="filtros-info">
            <span>
              <i class="fas fa-info-circle" style="margin-right:4px;"></i>
              ${result.success ? `${result.data.length} ocorrência(s) encontrada(s)` : "Carregando..."}
            </span>
            ${
              this.filtrosOcorrencias.status ||
              this.filtrosOcorrencias.dataInicio ||
              this.filtrosOcorrencias.dataFim
                ? `
              <span style="color:var(--azul-bandeira);">
                <i class="fas fa-filter" style="margin-right:4px;"></i> Filtro ativo
              </span>
            `
                : ""
            }
          </div>
        </div>
    `;

    if (!result.success) {
      html += `<p style="color:var(--erro);">Erro ao carregar: ${result.error}</p>`;
      html += `</div>`;
      container.innerHTML = html;
      return;
    }

    if (result.data.length === 0) {
      html += `
        <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
          <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
            <i class="fas fa-inbox"></i>
          </div>
          <p style="font-weight:500;">Nenhuma ocorrência encontrada</p>
          <p style="font-size:13px;">${this.filtrosOcorrencias.status || this.filtrosOcorrencias.dataInicio || this.filtrosOcorrencias.dataFim ? "Tente ajustar os filtros aplicados" : 'Clique em "+" para criar sua primeira ocorrência'}</p>
          ${
            this.filtrosOcorrencias.status ||
            this.filtrosOcorrencias.dataInicio ||
            this.filtrosOcorrencias.dataFim
              ? `
            <button onclick="app.limparFiltrosOcorrencias()" class="btn-secondary" style="margin-top:12px;">
              <i class="fas fa-undo" style="margin-right:6px;"></i>
              Limpar Filtros
            </button>
          `
              : `
            <button onclick="app.navigateTo('nova-ocorrencia')" class="btn-primary" style="margin-top:16px;max-width:200px;">
              <i class="fas fa-plus" style="margin-right:6px;"></i>
              Nova Ocorrência
            </button>
          `
          }
        </div>
      `;
      html += `</div>`;
      container.innerHTML = html;
      return;
    }

    html += `<div style="margin-top:8px;">`;

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

      const tipoLabel = this.getTipoLabel(occ.tipo_ocorrencia);
      const tipoBadge = occ.tipo_ocorrencia
        ? `<span class="badge badge-tipo badge-tipo-${occ.tipo_ocorrencia}">${tipoLabel}</span>`
        : "";

      const versaoBadge =
        occ.status === "rectified" && occ.numero_versao > 1
          ? ` <span class="badge badge-rectified" style="font-size:9px;padding:1px 8px;">v${occ.numero_versao}</span>`
          : "";

      const guardaNome = occ.criador?.nome_completo || "Desconhecido";
      const guardaCPF = occ.criador?.cpf || "";
      const cpfExibido = this.formatarCPFSeguro(guardaCPF);

      html += `
        <div class="ocorrencia-item status-${occ.status}" onclick="app.verDetalhes('${occ.id}')">
          <div class="header">
            <div>
              <div class="numero">#${numero} ${tipoBadge} ${versaoBadge}</div>
              <div class="data">${data} ${hora}</div>
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
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    container.innerHTML = html;
  }

  // ============================================
  // FILTROS - OCORRÊNCIAS
  // ============================================

  aplicarFiltrosOcorrencias() {
    const status = document.getElementById("filtroStatus")?.value || "";
    const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
    const dataFim = document.getElementById("filtroDataFim")?.value || "";

    if (dataInicio && dataFim && dataFim < dataInicio) {
      this.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
      return;
    }

    this.filtrosOcorrencias = {
      status: status,
      dataInicio: dataInicio,
      dataFim: dataFim,
    };

    this.loadPageContent("ocorrencias");
  }

  limparFiltrosOcorrencias() {
    this.filtrosOcorrencias = {
      status: "",
      dataInicio: "",
      dataFim: "",
    };
    this.loadPageContent("ocorrencias");
    this.showToast("Filtros removidos", "info");
  }

  // ============================================
  // DETALHES DA OCORRÊNCIA
  // ============================================

  verDetalhes(ocorrenciaId) {
    this.navigateTo("detalhe-ocorrencia", { id: ocorrenciaId });
  }

  async renderDetalheOcorrencia(container) {
    const id = this.currentParams?.id;
    if (!id) {
      container.innerHTML = `
                <div class="container" style="text-align:center;padding:40px 20px;">
                    <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Ocorrência não encontrada</h3>
                    <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;">
                        Voltar
                    </button>
                </div>
            `;
      return;
    }

    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      container.innerHTML = `
                <div class="container" style="text-align:center;padding:40px 20px;">
                    <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Ocorrência não encontrada</h3>
                    <p style="color:var(--cinza-medio);">${result.error || "ID inválido"}</p>
                    <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;">
                        Voltar
                    </button>
                </div>
            `;
      return;
    }

    const occ = result.data;
    const isRetificacao = occ.ocorrencia_original_id !== null;

    let original = null;
    let camposAlterados = [];
    if (isRetificacao) {
      const origResult = await ocorrenciaManager.buscar(
        occ.ocorrencia_original_id,
      );
      if (origResult.success) {
        original = origResult.data;
      }
      if (occ.campos_alterados) {
        try {
          camposAlterados = JSON.parse(occ.campos_alterados);
        } catch (e) {}
      }
    }

    const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
    const statusClass = this.getStatusClass(occ.status);
    const statusLabel = this.getStatusLabel(occ.status);
    const dataCriacao = new Date(occ.criado_em).toLocaleString("pt-BR");
    const dataInicio = occ.data_hora_inicio
      ? new Date(occ.data_hora_inicio).toLocaleString("pt-BR")
      : "Não informado";
    const dataEncerramento = occ.data_hora_encerramento
      ? new Date(occ.data_hora_encerramento).toLocaleString("pt-BR")
      : "Não informado";

    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    const anexosResult = await ocorrenciaManager.listarAnexos(id);
    const anexos = anexosResult.success ? anexosResult.data : [];

    const podeEditar = authManager.podeEditar(occ);
    const podeCancelar = authManager.podeCancelar(occ);
    const podeFinalizar = authManager.podeFinalizar(occ);
    const podeRetificar = authManager.podeSolicitarRetificacao(occ);
    const podeVerHistorico = authManager.podeVerHistorico(occ);
    const temRetificacoes = await ocorrenciaManager.temRetificacoes(id);
    const isAtiva = occ.esta_ativa !== false;
    const versaoInfo = isRetificacao
      ? `Retificação v${occ.numero_versao || 1}`
      : temRetificacoes
        ? "Versão Original (substituída)"
        : "";
    const isPending = occ.status === "pending_rectification";

    // Buscar dados do criador
    let criadorNome = "Desconhecido";
    let criadorCPF = "";
    if (occ.criado_por) {
      try {
        const client = supabaseClient.getClient();
        if (client) {
          const { data: criador } = await client
            .from("usuarios")
            .select("nome_completo, cpf")
            .eq("id", occ.criado_por)
            .single();
          if (criador) {
            criadorNome = criador.nome_completo;
            criadorCPF = criador.cpf;
          }
        }
      } catch (error) {
        console.warn("Erro ao buscar dados do criador:", error);
      }
    }

    const cpfExibido = this.formatarCPFSeguro(criadorCPF);

    let html = `
            <div class="container" style="padding-bottom:120px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;flex-wrap:wrap;gap:8px;">
                    <div>
                        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
                            <i class="fas fa-file-alt" style="margin-right:8px;"></i>
                            #${numero}
                        </h2>
                        <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;display:flex;flex-wrap:wrap;gap:12px;">
                            <span><i class="fas fa-user" style="margin-right:4px;"></i>
                                <strong>${criadorNome}</strong>
                            </span>
                            <span><i class="fas fa-shield-alt" style="margin-right:4px;"></i>${cpfExibido}</span>
                            ${occ.latitude && occ.longitude ? `<span><i class="fas fa-map-pin" style="margin-right:4px;"></i>📍 ${occ.latitude.toFixed(6)}, ${occ.longitude.toFixed(6)}</span>` : ""}
                        </div>
                        <div style="font-size:11px;color:var(--cinza-medio);margin-top:2px;">
                            <i class="fas fa-calendar" style="margin-right:4px;"></i>
                            Criado em ${dataCriacao}
                        </div>
                    </div>
                    <span class="badge badge-${statusClass}" style="font-size:13px;padding:4px 16px;white-space:nowrap;">
                        ${statusLabel}
                    </span>
                </div>
    `;

    if (isRetificacao && occ.justificativa_retificacao) {
      html += `
        <div style="background:var(--azul-muito-claro);padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--azul-bandeira);margin-bottom:16px;">
          <p style="font-size:13px;font-weight:600;margin:0 0 4px 0;color:var(--azul-bandeira);">
            <i class="fas fa-quote-left" style="margin-right:6px;"></i>
            Justificativa da Retificação
          </p>
          <p style="font-size:14px;color:var(--cinza-escuro);margin:0;">
            ${occ.justificativa_retificacao}
          </p>
        </div>
      `;
    }

    if (
      occ.status === "pending_rectification" &&
      occ.solicitacao_retificacao_justificativa
    ) {
      html += `
        <div style="background:#fef3c7;padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--aviso);margin-bottom:16px;">
          <p style="font-size:13px;font-weight:600;margin:0 0 4px 0;color:#92400e;">
            <i class="fas fa-clock" style="margin-right:6px;"></i>
            Solicitação de Retificação Pendente
          </p>
          <p style="font-size:14px;color:#92400e;margin:0;">
            ${occ.solicitacao_retificacao_justificativa}
          </p>
        </div>
      `;
    }

    if (isRetificacao && original) {
      html += `
        <div style="background:var(--verde-muito-claro);padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--verde-bandeira);margin-bottom:16px;">
          <p style="font-size:14px;font-weight:600;margin:0 0 6px 0;color:var(--verde-escuro);">
            <i class="fas fa-code-branch" style="margin-right:6px;"></i>
            Esta é uma retificação da ocorrência #${original.numero_ocorrencia || original.numero_temporario || "original"}
          </p>
          <p style="font-size:13px;color:var(--cinza-escuro);margin:0;">
            Status: ${statusLabel} ${occ.status === "pending_rectification" ? "⏳ Aguardando aprovação" : occ.status === "rectified" ? "✅ Aprovada" : ""}
          </p>
        </div>
      `;

      if (camposAlterados.length > 0) {
        html += `
          <div style="margin-bottom:16px;">
            <h4 style="color:var(--azul-bandeira);"><i class="fas fa-edit"></i> Campos Alterados</h4>
            <div style="background:var(--branco);border-radius:var(--border-radius);overflow:hidden;box-shadow:var(--sombra-suave);">
        `;
        camposAlterados.forEach((campo) => {
          html += `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px 12px;border-bottom:1px solid var(--cinza-claro);">
              <div style="font-weight:600;color:var(--cinza-escuro);font-size:13px;">
                ${campo.label || campo.campo}
              </div>
              <div style="display:flex;gap:8px;align-items:center;font-size:13px;flex-wrap:wrap;">
                <span style="color:var(--cinza-medio);text-decoration:line-through;font-size:12px;">
                  ${campo.antes || "(vazio)"}
                </span>
                <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:10px;"></i>
                <span style="color:var(--verde-bandeira);font-weight:500;">
                  ${campo.depois || "(vazio)"}
                </span>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      html += `
        <div class="card-revisao" style="margin-bottom:12px;opacity:0.8;">
          <h4><i class="fas fa-history"></i> Versão Original (para referência)</h4>
          <div class="campo"><span class="rotulo">Local:</span><span class="valor">${original.local_ocorrencia || "Não informado"}</span></div>
          <div class="campo"><span class="rotulo">Data/Hora Início:</span><span class="valor">${original.data_hora_inicio ? new Date(original.data_hora_inicio).toLocaleString("pt-BR") : "Não informado"}</span></div>
          <div class="campo"><span class="rotulo">Observações:</span><span class="valor" style="white-space:pre-wrap;">${original.observacoes || "Nenhuma"}</span></div>
          <button class="btn-secondary" style="margin-top:6px;padding:4px 12px;font-size:12px;min-height:auto;width:auto;" onclick="app.navigateTo('detalhe-ocorrencia', {id: '${original.id}'})">
            <i class="fas fa-eye"></i> Ver versão original completa
          </button>
        </div>
      `;
    }

    const camposGerais = [
      {
        chave: "local_ocorrencia",
        label: "Local",
        valor: occ.local_ocorrencia,
      },
      { chave: "rodovia", label: "Rodovia", valor: occ.rodovia },
      {
        chave: "bairro_ocorrencia",
        label: "Bairro da Ocorrência",
        valor: occ.bairro_ocorrencia,
      },
      { chave: "referencia", label: "Referência", valor: occ.referencia },
      {
        chave: "codigo_operacional",
        label: "Código Operacional",
        valor: occ.codigo_operacional,
      },
      {
        chave: "tipo_ocorrencia",
        label: "Tipo de Ocorrência",
        valor: occ.tipo_ocorrencia
          ? this.getTipoLabel(occ.tipo_ocorrencia)
          : null,
      },
      {
        chave: "codigo_municipal",
        label: "Código Municipal",
        valor: occ.codigo_municipal,
      },
      { chave: "complemento", label: "Complemento", valor: occ.complemento },
      {
        chave: "identificacao_adicional",
        label: "Identificação Adicional",
        valor: occ.identificacao_adicional,
      },
      { chave: "numero_versao", label: "Versão", valor: occ.numero_versao },
    ];

    const camposGeraisPreenchidos = camposGerais.filter(
      (c) => c.valor && c.valor.toString().trim() !== "",
    );

    if (
      camposGeraisPreenchidos.length > 0 ||
      dataInicio ||
      dataEncerramento ||
      versaoInfo
    ) {
      html += `
        <div class="card-revisao">
          <h4><i class="fas fa-info-circle"></i> Informações Gerais</h4>
          ${camposGeraisPreenchidos
            .map(
              (c) => `
            <div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>
          `,
            )
            .join("")}
          <div class="campo"><span class="rotulo">Data/Hora Início:</span><span class="valor">${dataInicio}</span></div>
          ${dataEncerramento ? `<div class="campo"><span class="rotulo">Data/Hora Encerramento:</span><span class="valor">${dataEncerramento}</span></div>` : ""}
          ${versaoInfo ? `<div class="campo"><span class="rotulo">Status da Versão:</span><span class="valor">${versaoInfo}</span></div>` : ""}
        </div>
      `;
    }

    const camposSolicitante = [
      {
        chave: "forma_solicitacao",
        label: "Forma",
        valor: occ.forma_solicitacao,
      },
      {
        chave: "nome_solicitante",
        label: "Solicitante",
        valor: occ.nome_solicitante,
      },
      {
        chave: "telefone_solicitante",
        label: "Telefone",
        valor: occ.telefone_solicitante,
      },
      {
        chave: "endereco_solicitante",
        label: "Endereço",
        valor: occ.endereco_solicitante,
      },
      {
        chave: "bairro_solicitante",
        label: "Bairro",
        valor: occ.bairro_solicitante,
      },
    ];

    const camposSolicitantePreenchidos = camposSolicitante.filter(
      (c) => c.valor && c.valor.toString().trim() !== "",
    );

    if (camposSolicitantePreenchidos.length > 0) {
      html += `
        <div class="card-revisao">
          <h4><i class="fas fa-phone-alt"></i> Origem da Solicitação</h4>
          ${camposSolicitantePreenchidos
            .map(
              (c) => `
            <div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>
          `,
            )
            .join("")}
        </div>
      `;
    }

    html += `
      <div class="card-revisao">
        <h4><i class="fas fa-users"></i> Envolvidos (${envolvidos.length})</h4>
        ${
          envolvidos.length === 0
            ? '<p style="color:var(--cinza-medio);font-size:14px;">Nenhum envolvido cadastrado</p>'
            : envolvidos
                .map(
                  (env) => `
            <div class="envolvido-item">
              <span class="badge badge-azul" style="font-size:10px;">${this.getTipoEnvolvidoLabel(env.tipo)}</span>
              <strong>${env.nome_completo}</strong>
              ${env.cpf ? `<span style="color:var(--cinza-medio);font-size:12px;"> - CPF: ${env.cpf}</span>` : ""}
              ${env.telefone ? `<span style="color:var(--cinza-medio);font-size:12px;"> - Tel: ${env.telefone}</span>` : ""}
            </div>
          `,
                )
                .join("")
        }
      </div>
    `;

    if (occ.observacoes && occ.observacoes.trim() !== "") {
      html += `
        <div class="card-revisao">
          <h4><i class="fas fa-pencil-alt"></i> Observações</h4>
          <p style="font-size:14px;white-space:pre-wrap;margin:0;">${occ.observacoes}</p>
        </div>
      `;
    }

    html += `
      <div class="card-revisao">
        <h4><i class="fas fa-paperclip"></i> Anexos (${anexos.length})</h4>
        ${
          anexos.length === 0
            ? '<p style="color:var(--cinza-medio);font-size:14px;">Nenhum anexo adicionado</p>'
            : anexos
                .map(
                  (anexo) => `
            <div style="font-size:14px;padding:6px 0;border-bottom:1px solid var(--cinza-claro);display:flex;align-items:center;gap:10px;">
              <i class="fas ${this.getIconAnexo(anexo.tipo_arquivo)}" style="color:var(--azul-bandeira);font-size:18px;"></i>
              <span style="flex:1;">${anexo.nome_arquivo}</span>
              <span style="color:var(--cinza-medio);font-size:12px;">${this.formatarTamanho(anexo.tamanho || 0)}</span>
              ${anexo.url ? `<a href="${anexo.url}" target="_blank" style="color:var(--azul-bandeira);"><i class="fas fa-external-link-alt"></i></a>` : ""}
            </div>
          `,
                )
                .join("")
        }
      </div>
    `;

    html += `
      <div style="margin-top:24px;display:flex;flex-direction:column;gap:10px;">
    `;

    if (authManager.isSupervisor() && occ.status === "pending_rectification") {
      html += `
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-success" onclick="app.aprovarRetificacao('${occ.id}')" style="flex:1;min-width:120px;">
            <i class="fas fa-check" style="margin-right:6px;"></i> Aprovar Retificação
          </button>
          <button class="btn-danger" onclick="app.rejeitarRetificacao('${occ.id}')" style="flex:1;min-width:120px;">
            <i class="fas fa-times" style="margin-right:6px;"></i> Rejeitar Retificação
          </button>
        </div>
      `;
    }

    if (podeFinalizar) {
      html += `<button class="btn-success" onclick="app.finalizarOcorrenciaExistente('${occ.id}')"><i class="fas fa-check-circle" style="margin-right:6px;"></i> Finalizar Ocorrência</button>`;
    }
    if (podeRetificar && occ.status === "synced") {
      html += `<button class="btn-primary" onclick="app.solicitarRetificacao('${occ.id}')" style="background:var(--azul-bandeira);"><i class="fas fa-sync-alt" style="margin-right:6px;"></i> Solicitar Retificação</button>`;
    }
    if (podeEditar && occ.status === "draft") {
      html += `<button class="btn-primary" onclick="app.editarOcorrencia('${occ.id}')"><i class="fas fa-edit" style="margin-right:6px;"></i> Editar Ocorrência</button>`;
    }
    if (podeCancelar) {
      html += `<button class="btn-danger" onclick="app.cancelarOcorrencia('${occ.id}')"><i class="fas fa-times-circle" style="margin-right:6px;"></i> Cancelar Ocorrência</button>`;
    }
    if (podeVerHistorico) {
      const temRet = await ocorrenciaManager.temRetificacoes(id);
      if (temRet || isRetificacao) {
        html += `<button class="btn-secondary" onclick="app.verHistorico('${occ.id}')" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);"><i class="fas fa-history" style="margin-right:6px;"></i> Ver Histórico</button>`;
      }
    }
    html += `
        <button class="btn-secondary" onclick="app.navigateTo('dashboard')" style="width:100%;"><i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar</button>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RETIFICAÇÃO
  // ============================================

  async solicitarRetificacao(id) {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      this.showToast("Ocorrência não encontrada", "error");
      return;
    }

    const occ = result.data;

    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    const dataInicio = occ.data_hora_inicio
      ? new Date(occ.data_hora_inicio).toLocaleString("pt-BR")
      : "Não informado";
    const dataEncerramento = occ.data_hora_encerramento
      ? new Date(occ.data_hora_encerramento).toLocaleString("pt-BR")
      : "Não informado";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:650px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-sync-alt" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Solicitar Retificação
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <p style="color:var(--cinza-medio);font-size:14px;margin-bottom:16px;">
            Preencha apenas os campos que precisam ser corrigidos. 
            <strong>Campos imutáveis</strong> (data/hora, número, forma de solicitação) não podem ser alterados.
          </p>
          
          <div style="background:var(--verde-muito-claro);padding:12px;border-radius:var(--border-radius);margin-bottom:16px;border-left:4px solid var(--verde-bandeira);">
            <p style="font-size:13px;color:var(--verde-escuro);margin:0;">
              <i class="fas fa-info-circle" style="margin-right:6px;"></i>
              A retificação criará uma nova versão da ocorrência. A versão original será mantida como histórico.
              <br><strong>Data/Hora do fato não podem ser alteradas</strong> - são registros históricos.
            </p>
          </div>

          <div style="background:var(--cinza-claro);padding:12px;border-radius:var(--border-radius);margin-bottom:16px;opacity:0.7;">
            <p style="font-weight:600;font-size:13px;color:var(--cinza-escuro);margin-bottom:8px;">
              <i class="fas fa-lock" style="margin-right:6px;"></i>
              Dados Imutáveis (apenas para referência)
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
              <div><strong>Número:</strong> ${occ.numero_ocorrencia || occ.numero_temporario || "Rascunho"}</div>
              <div><strong>Forma de Solicitação:</strong> ${occ.forma_solicitacao || "Não informado"}</div>
              <div><strong>Data/Hora Início:</strong> ${dataInicio}</div>
              <div><strong>Data/Hora Encerramento:</strong> ${dataEncerramento}</div>
              <div><strong>Criado por:</strong> ${occ.criado_por || "Não informado"}</div>
              <div><strong>Criado em:</strong> ${new Date(occ.criado_em).toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <form id="formRetificacao">
            <div class="form-group">
              <label for="ret_justificativa">
                <i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                Justificativa da Retificação <span class="required">*</span>
              </label>
              <textarea id="ret_justificativa" class="form-control" rows="3" placeholder="Explique o motivo da correção..." required></textarea>
              <div class="input-hint">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Mínimo 10 caracteres
              </div>
            </div>

            <div style="border-top:1px solid var(--cinza-claro);padding-top:16px;margin-top:8px;">
              <p style="font-weight:600;font-size:14px;color:var(--cinza-escuro);margin-bottom:12px;">
                <i class="fas fa-edit" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                Dados que podem ser corrigidos
              </p>
              <p style="font-size:12px;color:var(--cinza-medio);margin-bottom:12px;">
                Deixe em branco os campos que NÃO precisam ser alterados
              </p>
              
              <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
                <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                  <i class="fas fa-user" style="margin-right:6px;"></i>
                  Dados do Solicitante
                </p>
                <div class="form-group">
                  <label for="ret_nome_solicitante">Nome do Solicitante</label>
                  <input type="text" id="ret_nome_solicitante" class="form-control" value="${occ.nome_solicitante || ""}" placeholder="Nome completo">
                </div>
                <div class="form-group">
                  <label for="ret_telefone_solicitante">Telefone do Solicitante</label>
                  <input type="text" id="ret_telefone_solicitante" class="form-control" value="${occ.telefone_solicitante || ""}" placeholder="(44) 99999-9999">
                </div>
                <div class="form-group">
                  <label for="ret_endereco_solicitante">Endereço do Solicitante</label>
                  <input type="text" id="ret_endereco_solicitante" class="form-control" value="${occ.endereco_solicitante || ""}" placeholder="Rua, número, bairro">
                </div>
                <div class="form-group">
                  <label for="ret_bairro_solicitante">Bairro do Solicitante</label>
                  <input type="text" id="ret_bairro_solicitante" class="form-control" value="${occ.bairro_solicitante || ""}" placeholder="Bairro">
                </div>
                <div class="form-group">
                  <label for="ret_complemento">Complemento</label>
                  <input type="text" id="ret_complemento" class="form-control" value="${occ.complemento || ""}" placeholder="Apto, bloco, ponto de referência">
                </div>
                <div class="form-group">
                  <label for="ret_identificacao_adicional">Identificação Adicional</label>
                  <input type="text" id="ret_identificacao_adicional" class="form-control" value="${occ.identificacao_adicional || ""}" placeholder="Informações adicionais">
                </div>
                <div class="form-group">
                  <label for="ret_codigo_municipal">Código Municipal</label>
                  <input type="text" id="ret_codigo_municipal" class="form-control" value="${occ.codigo_municipal || ""}" placeholder="Código do imóvel">
                </div>
              </div>

              <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
                <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                  <i class="fas fa-map-marker-alt" style="margin-right:6px;"></i>
                  Dados do Local
                </p>
                <div class="form-group">
                  <label for="ret_local_ocorrencia">Local da Ocorrência</label>
                  <input type="text" id="ret_local_ocorrencia" class="form-control" value="${occ.local_ocorrencia || ""}" placeholder="Endereço completo">
                </div>
                <div class="form-group">
                  <label for="ret_rodovia">Rodovia</label>
                  <input type="text" id="ret_rodovia" class="form-control" value="${occ.rodovia || ""}" placeholder="BR-123, km 45">
                </div>
                <div class="form-group">
                  <label for="ret_bairro_ocorrencia">Bairro da Ocorrência</label>
                  <input type="text" id="ret_bairro_ocorrencia" class="form-control" value="${occ.bairro_ocorrencia || ""}" placeholder="Bairro">
                </div>
                <div class="form-group">
                  <label for="ret_referencia">Referência</label>
                  <input type="text" id="ret_referencia" class="form-control" value="${occ.referencia || ""}" placeholder="Ponto de referência próximo">
                </div>
              </div>

              <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
                <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                  <i class="fas fa-pencil-alt" style="margin-right:6px;"></i>
                  Observações
                </p>
                <div class="form-group">
                  <label for="ret_observacoes">Observações</label>
                  <textarea id="ret_observacoes" class="form-control" rows="4" placeholder="Complemente as informações da ocorrência">${occ.observacoes || ""}</textarea>
                </div>
              </div>

              <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
                <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                  <i class="fas fa-barcode" style="margin-right:6px;"></i>
                  Dados Operacionais
                </p>
                <div class="form-group">
                  <label for="ret_codigo_operacional">Código Operacional</label>
                  <input type="text" id="ret_codigo_operacional" class="form-control" value="${occ.codigo_operacional || ""}" placeholder="Código da ocorrência">
                </div>
              </div>

              <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
                <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                  <i class="fas fa-tag" style="margin-right:6px;"></i>
                  Tipo de Ocorrência
                </p>
                <div class="form-group">
                  <label for="ret_tipo_ocorrencia">Tipo de Ocorrência</label>
                  <select id="ret_tipo_ocorrencia" class="form-control">
                    <option value="">Selecione o tipo...</option>
                    ${this.TIPOS_OCORRENCIA.map(
                      (op) =>
                        `<option value="${op.value}" ${occ.tipo_ocorrencia === op.value ? "selected" : ""}>${op.label}</option>`,
                    ).join("")}
                  </select>
                </div>
              </div>

              <div style="background:var(--cinza-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;opacity:0.7;">
                <p style="font-weight:600;font-size:13px;color:var(--cinza-escuro);margin-bottom:8px;">
                  <i class="fas fa-users" style="margin-right:6px;"></i>
                  Envolvidos (${envolvidos.length}) - Não podem ser alterados na retificação
                </p>
                ${
                  envolvidos.length === 0
                    ? `
                  <p style="font-size:13px;color:var(--cinza-medio);">Nenhum envolvido cadastrado</p>
                `
                    : `
                  ${envolvidos
                    .map(
                      (env) => `
                    <div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);">
                      <span class="badge badge-azul" style="font-size:10px;">${this.getTipoEnvolvidoLabel(env.tipo)}</span>
                      <strong>${env.nome_completo}</strong>
                      ${env.cpf ? ` - ${env.cpf}` : ""}
                    </div>
                  `,
                    )
                    .join("")}
                `
                }
                <p style="font-size:12px;color:var(--cinza-medio);margin-top:6px;">
                  <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                  Para alterar envolvidos, crie uma nova ocorrência
                </p>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="app.confirmarRetificacao('${id}')">
            <i class="fas fa-check-circle" style="margin-right:6px;"></i> Solicitar Retificação
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async confirmarRetificacao(id) {
    const justificativa = document.getElementById("ret_justificativa")?.value;
    if (!justificativa || justificativa.trim().length < 10) {
      this.showToast(
        "Justificativa deve ter pelo menos 10 caracteres",
        "warning",
      );
      return;
    }

    const dadosCorrigidos = {};

    const nome_solicitante = document.getElementById(
      "ret_nome_solicitante",
    )?.value;
    if (nome_solicitante && nome_solicitante.trim() !== "") {
      dadosCorrigidos.nome_solicitante = nome_solicitante.trim();
    }

    const telefone_solicitante = document.getElementById(
      "ret_telefone_solicitante",
    )?.value;
    if (telefone_solicitante && telefone_solicitante.trim() !== "") {
      dadosCorrigidos.telefone_solicitante = telefone_solicitante.trim();
    }

    const endereco_solicitante = document.getElementById(
      "ret_endereco_solicitante",
    )?.value;
    if (endereco_solicitante && endereco_solicitante.trim() !== "") {
      dadosCorrigidos.endereco_solicitante = endereco_solicitante.trim();
    }

    const bairro_solicitante = document.getElementById(
      "ret_bairro_solicitante",
    )?.value;
    if (bairro_solicitante && bairro_solicitante.trim() !== "") {
      dadosCorrigidos.bairro_solicitante = bairro_solicitante.trim();
    }

    const complemento = document.getElementById("ret_complemento")?.value;
    if (complemento && complemento.trim() !== "") {
      dadosCorrigidos.complemento = complemento.trim();
    }

    const identificacao_adicional = document.getElementById(
      "ret_identificacao_adicional",
    )?.value;
    if (identificacao_adicional && identificacao_adicional.trim() !== "") {
      dadosCorrigidos.identificacao_adicional = identificacao_adicional.trim();
    }

    const codigo_municipal = document.getElementById(
      "ret_codigo_municipal",
    )?.value;
    if (codigo_municipal && codigo_municipal.trim() !== "") {
      dadosCorrigidos.codigo_municipal = codigo_municipal.trim();
    }

    const local_ocorrencia = document.getElementById(
      "ret_local_ocorrencia",
    )?.value;
    if (local_ocorrencia && local_ocorrencia.trim() !== "") {
      dadosCorrigidos.local_ocorrencia = local_ocorrencia.trim();
    }

    const rodovia = document.getElementById("ret_rodovia")?.value;
    if (rodovia && rodovia.trim() !== "") {
      dadosCorrigidos.rodovia = rodovia.trim();
    }

    const bairro_ocorrencia = document.getElementById(
      "ret_bairro_ocorrencia",
    )?.value;
    if (bairro_ocorrencia && bairro_ocorrencia.trim() !== "") {
      dadosCorrigidos.bairro_ocorrencia = bairro_ocorrencia.trim();
    }

    const referencia = document.getElementById("ret_referencia")?.value;
    if (referencia && referencia.trim() !== "") {
      dadosCorrigidos.referencia = referencia.trim();
    }

    const observacoes = document.getElementById("ret_observacoes")?.value;
    if (observacoes && observacoes.trim() !== "") {
      dadosCorrigidos.observacoes = observacoes.trim();
    }

    const codigo_operacional = document.getElementById(
      "ret_codigo_operacional",
    )?.value;
    if (codigo_operacional && codigo_operacional.trim() !== "") {
      dadosCorrigidos.codigo_operacional = codigo_operacional.trim();
    }

    const tipo_ocorrencia = document.getElementById(
      "ret_tipo_ocorrencia",
    )?.value;
    if (tipo_ocorrencia && tipo_ocorrencia.trim() !== "") {
      dadosCorrigidos.tipo_ocorrencia = tipo_ocorrencia.trim();
    }

    if (Object.keys(dadosCorrigidos).length === 0) {
      this.showToast("Nenhum campo foi preenchido para retificação", "warning");
      return;
    }

    const confirmado = await this.confirmar(
      "Confirma a retificação desta ocorrência? Os dados alterados serão revisados por um supervisor.",
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.solicitarRetificacao(
      id,
      dadosCorrigidos,
      justificativa,
    );

    if (!result.success) {
      this.showToast("Erro ao solicitar retificação: " + result.error, "error");
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    if (result.is_pending) {
      this.showToast(
        "Retificação solicitada com sucesso! Aguarde aprovação do supervisor.",
        "success",
      );
    } else {
      this.showToast("Retificação criada com sucesso!", "success");
    }

    await authManager.logSolicitarRetificacao(authManager.getUserId(), id);

    setTimeout(
      () => this.navigateTo("detalhe-ocorrencia", { id: result.data.id }),
      1500,
    );
  }

  // ============================================
  // APROVAR RETIFICAÇÃO
  // ============================================

  async aprovarRetificacao(id) {
    const confirmado = await this.confirmar(
      "Confirma a aprovação desta retificação? A versão original será substituída.",
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.aprovarRetificacao(id);
    if (result.success) {
      this.showToast("Retificação aprovada com sucesso!", "success");

      await authManager.logAprovarRetificacao(authManager.getUserId(), id);

      const paginaAtual = this.currentPage;

      if (paginaAtual === "detalhe-ocorrencia") {
        this.loadPageContent("detalhe-ocorrencia");
      }

      if (paginaAtual === "retificacoes") {
        this.loadPageContent("retificacoes");
      }

      if (paginaAtual === "dashboard") {
        this.loadPageContent("dashboard");
      }

      if (paginaAtual === "ocorrencias") {
        this.loadPageContent("ocorrencias");
      }
    } else {
      this.showToast("Erro ao aprovar retificação: " + result.error, "error");
    }
  }

  // ============================================
  // REJEITAR RETIFICAÇÃO
  // ============================================

  async rejeitarRetificacao(id) {
    const motivo = await this.inputModal(
      "Informe o motivo da rejeição da retificação:",
      "Rejeitar Retificação",
      "Digite o motivo da rejeição...",
    );

    if (!motivo) {
      this.showToast("Operação cancelada", "info");
      return;
    }

    const confirmado = await this.confirmar(
      `Confirma a rejeição desta retificação?\n\nMotivo: ${motivo}`,
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.rejeitarRetificacao(id, motivo);
    if (result.success) {
      this.showToast("Retificação rejeitada", "info");

      await authManager.logRejeitarRetificacao(authManager.getUserId(), id);

      const paginaAtual = this.currentPage;

      if (paginaAtual === "detalhe-ocorrencia") {
        this.loadPageContent("detalhe-ocorrencia");
      }

      if (paginaAtual === "retificacoes") {
        this.loadPageContent("retificacoes");
      }

      if (paginaAtual === "dashboard") {
        this.loadPageContent("dashboard");
      }

      if (paginaAtual === "ocorrencias") {
        this.loadPageContent("ocorrencias");
      }
    } else {
      this.showToast("Erro ao rejeitar retificação: " + result.error, "error");
    }
  }

  async verHistorico(id) {
    const result = await ocorrenciaManager.buscarHistorico(id);
    if (!result.success) {
      this.showToast("Erro ao carregar histórico", "error");
      return;
    }

    const historico = result.data;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    let html = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-history" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Histórico da Ocorrência
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
    `;

    historico.forEach((item) => {
      const isOriginal = item.is_original;
      const isAtiva = item.esta_ativa !== false;
      const statusClass = this.getStatusClass(item.status);
      const statusLabel = this.getStatusLabel(item.status);
      const data = new Date(item.criado_em).toLocaleString("pt-BR");
      const numero =
        item.numero_ocorrencia || item.numero_temporario || "Rascunho";

      let camposAlterados = [];
      if (item.campos_alterados) {
        try {
          camposAlterados = JSON.parse(item.campos_alterados);
        } catch (e) {}
      }

      html += `
        <div style="border-left:4px solid ${isAtiva ? "var(--verde-bandeira)" : "var(--cinza-medio)"};padding-left:12px;margin-bottom:16px;background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-weight:700;color:var(--azul-bandeira);">
                ${isOriginal ? "📄 Versão Original" : `🔄 Retificação v${item.numero_versao || 1}`}
              </span>
              ${isAtiva ? ' <span class="badge badge-synced" style="font-size:10px;">✅ Ativa</span>' : ' <span class="badge badge-draft" style="font-size:10px;">📜 Substituída</span>'}
              ${item.status === "pending_rectification" ? ' <span class="badge badge-pending" style="font-size:10px;">⏳ Pendente</span>' : ""}
              ${item.status === "rectification_rejected" ? ' <span class="badge badge-cancelled" style="font-size:10px;">❌ Rejeitada</span>' : ""}
            </div>
            <span class="badge badge-${statusClass}" style="font-size:10px;">${statusLabel}</span>
          </div>
          <div style="font-size:13px;color:var(--cinza-medio);margin-top:4px;">
            <i class="fas fa-calendar" style="margin-right:4px;"></i> ${data}
            <span style="margin-left:12px;"><i class="fas fa-hashtag" style="margin-right:4px;"></i>#${numero}</span>
            ${
              item.justificativa_retificacao
                ? `
              <div style="margin-top:6px;padding:8px 12px;background:var(--azul-muito-claro);border-radius:var(--border-radius);font-size:13px;color:var(--cinza-escuro);border-left:3px solid var(--azul-bandeira);">
                <i class="fas fa-quote-left" style="color:var(--azul-bandeira);margin-right:4px;"></i>
                ${item.justificativa_retificacao}
              </div>
            `
                : ""
            }
            ${
              item.solicitacao_retificacao_justificativa &&
              item.status === "pending_rectification"
                ? `
              <div style="margin-top:6px;padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);font-size:13px;color:#92400e;border-left:3px solid var(--aviso);">
                <i class="fas fa-clock" style="color:var(--aviso);margin-right:4px;"></i>
                Solicitação: ${item.solicitacao_retificacao_justificativa}
              </div>
            `
                : ""
            }
            ${
              item.motivo_rejeicao
                ? `
              <div style="margin-top:6px;padding:8px 12px;background:#fee2e2;border-radius:var(--border-radius);font-size:13px;color:#991b1b;border-left:3px solid var(--erro);">
                <i class="fas fa-times-circle" style="color:var(--erro);margin-right:4px;"></i>
                Motivo da rejeição: ${item.motivo_rejeicao}
              </div>
            `
                : ""
            }
            ${
              camposAlterados.length > 0
                ? `
              <div style="margin-top:6px;padding:8px 12px;background:var(--verde-muito-claro);border-radius:var(--border-radius);font-size:13px;color:var(--verde-escuro);border-left:3px solid var(--verde-bandeira);">
                <strong><i class="fas fa-edit" style="margin-right:4px;"></i> Campos Alterados:</strong>
                ${camposAlterados
                  .map(
                    (c) => `
                  <div style="margin-top:4px;font-size:12px;padding:4px 8px;background:var(--branco);border-radius:4px;">
                    <strong>${c.label || c.campo}:</strong> 
                    <span style="color:var(--cinza-medio);text-decoration:line-through;">${c.antes || "(vazio)"}</span> 
                    → 
                    <span style="color:var(--verde-bandeira);">${c.depois || "(vazio)"}</span>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
          <div style="margin-top:6px;font-size:13px;">
            <strong>Local:</strong> ${item.local_ocorrencia || "Não informado"}
          </div>
          ${
            !isOriginal && item.retificado_por
              ? `
            <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
              <i class="fas fa-user" style="margin-right:4px;"></i>
              Retificado por: Supervisor
            </div>
          `
              : ""
          }
          ${
            !isOriginal && item.solicitada_por
              ? `
            <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
              <i class="fas fa-user" style="margin-right:4px;"></i>
              Solicitado por: Guarda
            </div>
          `
              : ""
          }
          <button onclick="app.navigateTo('detalhe-ocorrencia', { id: '${item.id}' })" class="btn-secondary" style="margin-top:8px;padding:4px 12px;font-size:12px;min-height:auto;width:auto;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
            <i class="fas fa-eye" style="margin-right:4px;"></i> Ver Versão
          </button>
        </div>
      `;
    });

    html += `
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Fechar
          </button>
        </div>
      </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
  }

  // ============================================
  // AÇÕES DA OCORRÊNCIA
  // ============================================

  async finalizarOcorrenciaExistente(id) {
    const confirmado = await this.confirmar(
      "Deseja finalizar esta ocorrência?",
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.finalizar(id);
    if (result.success) {
      this.showToast("Ocorrência finalizada com sucesso!", "success");

      await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);

      if (this.filtroStatusAtual) {
        this.loadPageContent("dashboard");
      }
      setTimeout(() => this.navigateTo("detalhe-ocorrencia", { id }), 1000);
    } else {
      this.showToast("Erro ao finalizar: " + result.error, "error");
    }
  }

  async cancelarOcorrencia(id) {
    const motivo = await this.inputModal(
      "Informe o motivo do cancelamento:",
      "Cancelar Ocorrência",
      "Digite o motivo do cancelamento...",
    );

    if (!motivo) {
      this.showToast("Operação cancelada", "info");
      return;
    }

    const confirmado = await this.confirmar(
      `Deseja realmente cancelar esta ocorrência?\n\nMotivo: ${motivo}`,
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.cancelar(id, motivo);
    if (result.success) {
      this.showToast("Ocorrência cancelada com sucesso!", "success");

      await authManager.logCancelarOcorrencia(
        authManager.getUserId(),
        id,
        motivo,
      );

      if (this.filtroStatusAtual) {
        this.loadPageContent("dashboard");
      }
      setTimeout(() => this.navigateTo("detalhe-ocorrencia", { id }), 1000);
    } else {
      this.showToast("Erro ao cancelar: " + result.error, "error");
    }
  }

  async editarOcorrencia(id) {
    this.showToast("Funcionalidade de edição em desenvolvimento", "info");
  }

  // ============================================
  // UTILITÁRIOS DE STATUS
  // ============================================

  getStatusClass(status) {
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

  getStatusLabel(status) {
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
  // UTILITÁRIOS - TIPO DE OCORRÊNCIA
  // ============================================

  getTipoLabel(value) {
    const tipo = this.TIPOS_OCORRENCIA.find((t) => t.value === value);
    return tipo ? tipo.label : value || "Não informado";
  }

  // ============================================
  // PÁGINA DE RETIFICAÇÕES PENDENTES
  // ============================================

  async renderRetificacoes(container) {
    console.log("🔍 renderRetificacoes CHAMADO!");

    if (!authManager.isSupervisor()) {
      container.innerHTML = `
        <div class="container">
          <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
            <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
              <i class="fas fa-lock"></i>
            </div>
            <p style="font-weight:500;">Acesso restrito a supervisores</p>
            <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
              Voltar
            </button>
          </div>
        </div>
      `;
      return;
    }

    console.log("📋 Renderizando página de retificações pendentes...");
    const result = await ocorrenciaManager.buscarRetificacoesPendentes();
    console.log("📋 Resultado da busca:", result);
    console.log("📋 Data recebida:", result.data);

    if (!result.success) {
      container.innerHTML = `
        <div class="container">
          <h2 style="color:var(--azul-bandeira);">
            <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
            Solicitações de Retificação
          </h2>
          <p style="color:var(--erro);">Erro ao carregar: ${result.error}</p>
          <button onclick="app.loadPageContent('retificacoes')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Tentar novamente
          </button>
        </div>
      `;
      return;
    }

    const pendentes = result.data || [];
    console.log(`📋 Total de pendentes para renderizar: ${pendentes.length}`);

    let html = `
      <div class="container">
        <h2 style="color:var(--azul-bandeira);">
          <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
          Solicitações de Retificação Pendentes
        </h2>
        <p style="color:var(--cinza-medio);margin-bottom:16px;">
          ${pendentes.length} solicitação(ões) aguardando sua análise
        </p>
    `;

    if (pendentes.length === 0) {
      html += `
        <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
          <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
            <i class="fas fa-check-circle" style="color:var(--verde-bandeira);"></i>
          </div>
          <p style="font-weight:500;">Nenhuma solicitação pendente</p>
          <p style="font-size:13px;">Todas as retificações foram analisadas</p>
          <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Voltar ao início
          </button>
        </div>
      `;
    } else {
      const sorted = [...pendentes].sort((a, b) => {
        const dateA = a.solicitada_em || a.criado_em || "";
        const dateB = b.solicitada_em || b.criado_em || "";
        return dateB.localeCompare(dateA);
      });

      sorted.forEach((ret) => {
        const dataSolicitacao = ret.solicitada_em
          ? new Date(ret.solicitada_em).toLocaleString("pt-BR")
          : ret.criado_em
            ? new Date(ret.criado_em).toLocaleString("pt-BR")
            : "Data desconhecida";

        const numeroOriginal =
          ret.numero_ocorrencia || ret.numero_temporario || "Sem número";
        const tipoLabel = this.getTipoLabel(ret.tipo_ocorrencia);
        const tipoBadge = ret.tipo_ocorrencia
          ? `<span class="badge badge-tipo badge-tipo-${ret.tipo_ocorrencia}" style="font-size:10px;">${tipoLabel}</span>`
          : "";

        html += `
          <div class="card-revisao" style="margin-bottom:12px;border-left:4px solid var(--aviso);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:15px;color:var(--azul-bandeira);">
                  <i class="fas fa-file-alt"></i> #${numeroOriginal} ${tipoBadge}
                </strong>
                <span style="font-size:13px;color:var(--cinza-medio);margin-left:8px;">
                  <i class="fas fa-calendar"></i> ${dataSolicitacao}
                </span>
              </div>
              <span class="badge badge-pending" style="font-size:12px;">Pendente</span>
            </div>
            <div style="margin-top:6px;font-size:14px;">
              <strong>Justificativa:</strong> ${ret.solicitacao_retificacao_justificativa || "Não informada"}
            </div>
            <div style="margin-top:4px;font-size:13px;color:var(--cinza-medio);">
              <i class="fas fa-map-marker-alt"></i> ${ret.local_ocorrencia || "Local não informado"}
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-primary" style="padding:6px 14px;font-size:13px;min-height:auto;width:auto;background:var(--verde-bandeira);" onclick="app.aprovarRetificacao('${ret.id}')">
                <i class="fas fa-check"></i> Aprovar
              </button>
              <button class="btn-danger" style="padding:6px 14px;font-size:13px;min-height:auto;width:auto;" onclick="app.rejeitarRetificacao('${ret.id}')">
                <i class="fas fa-times"></i> Rejeitar
              </button>
              <button class="btn-secondary" style="padding:6px 14px;font-size:13px;min-height:auto;width:auto;background:var(--azul-muito-claro);" onclick="app.navigateTo('detalhe-ocorrencia', {id: '${ret.id}'})">
                <i class="fas fa-eye"></i> Ver detalhes
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIOS - MÓDULO COMPLETO
  // ============================================

  async renderRelatorios(container) {
    if (!authManager.isSupervisor()) {
      container.innerHTML = `
        <div class="container">
          <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
            <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
              <i class="fas fa-lock"></i>
            </div>
            <p style="font-weight:500;">Acesso restrito a supervisores</p>
            <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
              Voltar
            </button>
          </div>
        </div>
      `;
      return;
    }

    if (this.relatorioAtivo) {
      await this.renderRelatorioDetalhado(container, this.relatorioAtivo);
      return;
    }

    const relatorios = [
      {
        id: "executivo",
        nome: "Relatório Executivo",
        descricao: "Visão geral das ocorrências",
        icon: "fa-chart-pie",
        cor: "azul",
      },
      {
        id: "por-tipo",
        nome: "Ocorrências por Tipo",
        descricao: "Análise detalhada por natureza da ocorrência",
        icon: "fa-tag",
        cor: "verde",
      },
      {
        id: "por-local",
        nome: "Ocorrências por Localidade",
        descricao: "Distribuição geográfica das ocorrências",
        icon: "fa-map-marker-alt",
        cor: "vermelho",
      },
      {
        id: "atendimento",
        nome: "Tempo Médio de Atendimento",
        descricao: "Análise de eficiência operacional",
        icon: "fa-clock",
        cor: "amarelo",
      },
      {
        id: "desempenho",
        nome: "Desempenho por Guarda",
        descricao: "Avaliação individual dos agentes",
        icon: "fa-user-tie",
        cor: "roxo",
      },
      {
        id: "retificacoes",
        nome: "Relatório de Retificações",
        descricao: "Acompanhamento de correções de ocorrências",
        icon: "fa-sync-alt",
        cor: "azul",
      },
      {
        id: "cancelamentos",
        nome: "Relatório de Cancelamentos",
        descricao: "Análise de ocorrências canceladas",
        icon: "fa-times-circle",
        cor: "vermelho",
      },
      {
        id: "tendencias",
        nome: "Tendências e Sazonalidade",
        descricao: "Padrões temporais das ocorrências",
        icon: "fa-chart-line",
        cor: "verde",
      },
      {
        id: "produtividade",
        nome: "Produtividade do Setor",
        descricao: "Eficiência e capacidade de atendimento",
        icon: "fa-rocket",
        cor: "azul",
      },
      {
        id: "detalhado",
        nome: "Ocorrências Detalhado",
        descricao: "Listagem completa com todos os campos",
        icon: "fa-list-ul",
        cor: "cinza",
      },
    ];

    const dataInicio =
      this.relatorioFiltros?.dataInicio || this.obterPrimeiroDiaMes();
    const dataFim = this.relatorioFiltros?.dataFim || this.obterDataAtual();

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;">
            <i class="fas fa-chart-bar" style="margin-right:8px;"></i>
            Relatórios
          </h2>
          <button onclick="app.navigateTo('dashboard')" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i> Voltar
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:16px;font-size:13px;">
          Selecione um relatório para visualizar
        </p>

        <div class="filtros-container" style="margin-bottom:16px;">
          <div class="filtros-row">
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-calendar-alt"></i> Data Início</label>
              <input type="date" id="relatorioDataInicio" value="${dataInicio}">
            </div>
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
              <input type="date" id="relatorioDataFim" value="${dataFim}">
            </div>
            <div class="filtros-actions">
              <button onclick="app.aplicarFiltrosRelatorios()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    `;

    relatorios.forEach((rel) => {
      const corMap = {
        azul: "var(--azul-bandeira)",
        verde: "var(--verde-bandeira)",
        vermelho: "var(--erro)",
        amarelo: "var(--aviso)",
        roxo: "#8b5cf6",
        cinza: "var(--cinza-medio)",
      };

      const bgMap = {
        azul: "var(--azul-muito-claro)",
        verde: "var(--verde-muito-claro)",
        vermelho: "var(--erro-claro)",
        amarelo: "#fef3c7",
        roxo: "#ede9fe",
        cinza: "var(--cinza-claro)",
      };

      html += `
        <div class="relatorio-card" onclick="app.abrirRelatorio('${rel.id}')" style="
          background:var(--branco);
          border-radius:var(--border-radius);
          padding:12px;
          box-shadow:var(--sombra-suave);
          cursor:pointer;
          transition:all 0.15s ease;
          border-left:3px solid ${corMap[rel.cor]};
          display:flex;
          flex-direction:column;
          align-items:center;
          text-align:center;
          gap:6px;
        " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--sombra-media)'" onmouseout="this.style.transform='none';this.style.boxShadow='var(--sombra-suave)'">
          <div style="
            width:40px;
            height:40px;
            border-radius:50%;
            background:${bgMap[rel.cor]};
            display:flex;
            align-items:center;
            justify-content:center;
            flex-shrink:0;
          ">
            <i class="fas ${rel.icon}" style="color:${corMap[rel.cor]};font-size:18px;"></i>
          </div>
          <div style="font-weight:600;font-size:12px;line-height:1.2;">${rel.nome}</div>
          <div style="font-size:10px;color:var(--cinza-medio);line-height:1.2;">${rel.descricao}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  async abrirRelatorio(tipo) {
    this.relatorioAtivo = tipo;

    const dataInicio =
      document.getElementById("relatorioDataInicio")?.value ||
      this.obterPrimeiroDiaMes();
    const dataFim =
      document.getElementById("relatorioDataFim")?.value ||
      this.obterDataAtual();

    this.relatorioFiltros = {
      dataInicio: dataInicio,
      dataFim: dataFim,
    };

    this.loadPageContent("relatorios");
  }

  voltarRelatorios() {
    this.relatorioAtivo = null;
    this.loadPageContent("relatorios");
  }

  aplicarFiltrosRelatorios() {
    const dataInicio = document.getElementById("relatorioDataInicio")?.value;
    const dataFim = document.getElementById("relatorioDataFim")?.value;

    if (dataInicio && dataFim && dataFim < dataInicio) {
      this.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
      return;
    }

    this.relatorioFiltros = {
      dataInicio: dataInicio || this.obterPrimeiroDiaMes(),
      dataFim: dataFim || this.obterDataAtual(),
    };

    if (this.relatorioAtivo) {
      this.loadPageContent("relatorios");
    }
  }

  obterPrimeiroDiaMes() {
    const data = new Date();
    data.setDate(1);
    return data.toISOString().slice(0, 10);
  }

  obterDataAtual() {
    return new Date().toISOString().slice(0, 10);
  }

  async renderRelatorioDetalhado(container, tipo) {
    const dataInicio =
      this.relatorioFiltros?.dataInicio || this.obterPrimeiroDiaMes();
    const dataFim = this.relatorioFiltros?.dataFim || this.obterDataAtual();

    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div class="spinner-azul" style="margin:0 auto;"></div>
        <p style="margin-top:12px;color:var(--cinza-medio);">Carregando relatório...</p>
      </div>
    `;

    const ocorrencias = await this.buscarOcorrenciasPeriodo(
      dataInicio,
      dataFim,
    );

    switch (tipo) {
      case "executivo":
        await this.renderRelatorioExecutivo(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "por-tipo":
        await this.renderRelatorioPorTipo(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "por-local":
        await this.renderRelatorioPorLocal(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "atendimento":
        await this.renderRelatorioAtendimento(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "desempenho":
        await this.renderRelatorioDesempenho(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "retificacoes":
        await this.renderRelatorioRetificacoes(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "cancelamentos":
        await this.renderRelatorioCancelamentos(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "tendencias":
        await this.renderRelatorioTendencias(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "produtividade":
        await this.renderRelatorioProdutividade(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      case "detalhado":
        await this.renderRelatorioDetalhadoLista(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
        );
        break;
      default:
        container.innerHTML = `<p>Relatório não encontrado</p>`;
    }
  }

  async buscarOcorrenciasPeriodo(dataInicio, dataFim) {
    const client = supabaseClient.getClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from("ocorrencias")
        .select("*")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59");

      if (error) throw error;

      console.log(`📊 Buscou ${data?.length || 0} ocorrências no período`);
      return data || [];
    } catch (error) {
      console.error("❌ Erro ao buscar ocorrências:", error);
      return [];
    }
  }

  // ============================================
  // RELATÓRIO EXECUTIVO
  // ============================================

  async renderRelatorioExecutivo(container, ocorrencias, dataInicio, dataFim) {
    const stats = this.calcularEstatisticas(ocorrencias);
    const porTipo = this.agruparPorTipo(ocorrencias);
    const porMes = this.agruparPorMes(ocorrencias);

    const total = stats.total || 1;
    const taxaResolutividade = ((stats.finalizadas / total) * 100).toFixed(1);
    const mediaDiaria = this.calcularMediaDiaria(
      ocorrencias,
      dataInicio,
      dataFim,
    );

    const coresPizza = [
      "#003F87",
      "#00843D",
      "#DC2626",
      "#F59E0B",
      "#8B5CF6",
      "#EC4899",
      "#06B6D4",
      "#F97316",
      "#14B8A6",
      "#6366F1",
    ];

    const html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-chart-pie" style="margin-right:8px;"></i>
            Relatório Executivo
          </h2>
          <div style="display:flex;gap:4px;">
            <button class="btn-secondary" onclick="app.exportarRelatorioPDF()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
              <i class="fas fa-file-pdf"></i>
            </button>
            <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
              <i class="fas fa-arrow-left"></i>
            </button>
          </div>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${total}</div>
            <div style="font-size:9px;opacity:0.8;">Total</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${stats.finalizadas}</div>
            <div style="font-size:9px;opacity:0.8;">Finalizadas</div>
          </div>
          <div style="background:var(--aviso);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${stats.pendentes}</div>
            <div style="font-size:9px;opacity:0.8;">Pendentes</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
            <div style="font-size:16px;font-weight:800;color:var(--verde-bandeira);">${taxaResolutividade}%</div>
            <div style="font-size:9px;color:var(--cinza-medio);">Resolutividade</div>
          </div>
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
            <div style="font-size:16px;font-weight:800;color:var(--azul-bandeira);">${mediaDiaria}</div>
            <div style="font-size:9px;color:var(--cinza-medio);">Média Diária</div>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-pie" style="margin-right:4px;"></i>
            Tipos de Ocorrência
          </h4>
          <div style="height:200px;position:relative;">
            <canvas id="chartRelatorioPizza"></canvas>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
            Evolução Mensal
          </h4>
          <div style="height:150px;position:relative;">
            <canvas id="chartRelatorioMensal"></canvas>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-table" style="margin-right:4px;"></i>
            Detalhamento por Tipo
          </h4>
          <div class="table-wrapper">
            <table style="font-size:12px;">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th style="text-align:center;">Total</th>
                  <th style="text-align:center;">%</th>
                </tr>
              </thead>
              <tbody>
                ${porTipo
                  .slice(0, 8)
                  .map(
                    (t) => `
                  <tr>
                    <td style="font-size:11px;">${t.tipo}</td>
                    <td style="text-align:center;font-weight:600;">${t.total}</td>
                    <td style="text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                  </tr>
                `,
                  )
                  .join("")}
                ${
                  porTipo.length > 8
                    ? `
                  <tr>
                    <td colspan="3" style="text-align:center;color:var(--cinza-medio);font-size:11px;">
                      + ${porTipo.length - 8} outros tipos
                    </td>
                  </tr>
                `
                    : ""
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    await this.renderizarGraficoPizza(
      "chartRelatorioPizza",
      porTipo.slice(0, 8),
      coresPizza,
    );
    await this.renderizarGraficoBarras("chartRelatorioMensal", porMes);
  }

  // ============================================
  // RELATÓRIO OCORRÊNCIAS POR TIPO
  // ============================================

  async renderRelatorioPorTipo(container, ocorrencias, dataInicio, dataFim) {
    const porTipo = this.agruparPorTipo(ocorrencias);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-tag" style="margin-right:8px;"></i>
            Ocorrências por Tipo
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
          ${porTipo
            .map(
              (t) => `
            <span class="badge" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:11px;padding:4px 12px;">
              ${t.tipo}: ${t.total}
            </span>
          `,
            )
            .join("")}
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <div class="table-wrapper">
            <table style="font-size:12px;">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th style="text-align:center;">Total</th>
                  <th style="text-align:center;">%</th>
                  <th style="text-align:center;">Finalizadas</th>
                  <th style="text-align:center;">Pendentes</th>
                </tr>
              </thead>
              <tbody>
                ${porTipo
                  .map(
                    (t) => `
                  <tr>
                    <td>${t.tipo}</td>
                    <td style="text-align:center;font-weight:600;">${t.total}</td>
                    <td style="text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                    <td style="text-align:center;color:var(--verde-bandeira);">${t.finalizadas}</td>
                    <td style="text-align:center;color:var(--aviso);">${t.pendentes}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO OCORRÊNCIAS POR LOCAL
  // ============================================

  async renderRelatorioPorLocal(container, ocorrencias, dataInicio, dataFim) {
    const porBairro = this.agruparPorBairro(ocorrencias);
    const topBairros = porBairro.slice(0, 10);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-map-marker-alt" style="margin-right:8px;"></i>
            Ocorrências por Localidade
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-trophy" style="margin-right:4px;"></i>
            Top 10 Bairros
          </h4>
          ${topBairros
            .map(
              (b, index) => `
            <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
              <span style="font-weight:700;color:var(--cinza-medio);min-width:20px;font-size:12px;">${index + 1}º</span>
              <span style="flex:1;font-weight:500;">${b.bairro}</span>
              <span style="font-weight:700;color:var(--azul-bandeira);">${b.total}</span>
              <span style="font-size:11px;color:var(--cinza-medio);">(${b.percentual}%)</span>
            </div>
          `,
            )
            .join("")}
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
            Distribuição por Bairro
          </h4>
          <div style="height:200px;">
            <canvas id="chartRelatorioBairros"></canvas>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    await this.renderizarGraficoBarras(
      "chartRelatorioBairros",
      topBairros.map((b) => ({
        label: b.bairro.length > 15 ? b.bairro.slice(0, 12) + "..." : b.bairro,
        value: b.total,
      })),
    );
  }

  // ============================================
  // RELATÓRIO TEMPO MÉDIO DE ATENDIMENTO
  // ============================================

  async renderRelatorioAtendimento(
    container,
    ocorrencias,
    dataInicio,
    dataFim,
  ) {
    const comTempo = ocorrencias.filter(
      (o) => o.data_hora_inicio && o.data_hora_encerramento,
    );
    const tempos = comTempo
      .map((o) => {
        const inicio = new Date(o.data_hora_inicio);
        const fim = new Date(o.data_hora_encerramento);
        const diff = (fim - inicio) / (1000 * 60);
        return { ...o, tempoMinutos: diff };
      })
      .filter((t) => t.tempoMinutos > 0);

    const mediaGeral =
      tempos.length > 0
        ? tempos.reduce((s, t) => s + t.tempoMinutos, 0) / tempos.length
        : 0;
    const maisRapida =
      tempos.length > 0
        ? tempos.reduce((a, b) => (a.tempoMinutos < b.tempoMinutos ? a : b))
        : null;
    const maisLenta =
      tempos.length > 0
        ? tempos.reduce((a, b) => (a.tempoMinutos > b.tempoMinutos ? a : b))
        : null;

    const porTipo = {};
    tempos.forEach((t) => {
      const tipo = t.tipo_ocorrencia || "Não informado";
      if (!porTipo[tipo]) porTipo[tipo] = [];
      porTipo[tipo].push(t.tempoMinutos);
    });

    const mediaPorTipo = Object.keys(porTipo)
      .map((key) => ({
        tipo: this.getTipoLabel(key),
        media: porTipo[key].reduce((s, v) => s + v, 0) / porTipo[key].length,
        total: porTipo[key].length,
      }))
      .sort((a, b) => b.media - a.media);

    const formatarTempo = (minutos) => {
      if (minutos < 1) return "< 1 min";
      if (minutos < 60) return `${Math.round(minutos)} min`;
      const horas = Math.floor(minutos / 60);
      const mins = Math.round(minutos % 60);
      return `${horas}h ${mins}min`;
    };

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-clock" style="margin-right:8px;"></i>
            Tempo Médio de Atendimento
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${formatarTempo(mediaGeral)}</div>
            <div style="font-size:9px;opacity:0.8;">Média Geral</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${maisRapida ? formatarTempo(maisRapida.tempoMinutos) : "-"}</div>
            <div style="font-size:9px;opacity:0.8;">Mais Rápida</div>
          </div>
          <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${maisLenta ? formatarTempo(maisLenta.tempoMinutos) : "-"}</div>
            <div style="font-size:9px;opacity:0.8;">Mais Lenta</div>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
            Tempo Médio por Tipo
          </h4>
          <div class="table-wrapper">
            <table style="font-size:12px;">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th style="text-align:center;">Média</th>
                  <th style="text-align:center;">Ocorrências</th>
                </tr>
              </thead>
              <tbody>
                ${mediaPorTipo
                  .map(
                    (t) => `
                  <tr>
                    <td>${t.tipo}</td>
                    <td style="text-align:center;font-weight:600;color:var(--azul-bandeira);">${formatarTempo(t.media)}</td>
                    <td style="text-align:center;color:var(--cinza-medio);">${t.total}</td>
                  </tr>
                `,
                  )
                  .join("")}
                ${
                  mediaPorTipo.length === 0
                    ? `
                  <tr>
                    <td colspan="3" style="text-align:center;color:var(--cinza-medio);padding:16px;">
                      Nenhuma ocorrência com tempo registrado
                    </td>
                  </tr>
                `
                    : ""
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO DESEMPENHO POR GUARDA
  // ============================================

  async renderRelatorioDesempenho(container, ocorrencias, dataInicio, dataFim) {
    const client = supabaseClient.getClient();
    const { data: usuarios } = await client
      .from("usuarios")
      .select("id, nome_completo")
      .eq("status", "ativo");

    const mapaUsuarios = {};
    usuarios?.forEach((u) => (mapaUsuarios[u.id] = u.nome_completo));

    const porGuarda = {};
    ocorrencias.forEach((o) => {
      const guardaId = o.criado_por;
      const nome = mapaUsuarios[guardaId] || "Desconhecido";
      if (!porGuarda[guardaId]) {
        porGuarda[guardaId] = {
          nome,
          total: 0,
          finalizadas: 0,
          pendentes: 0,
          canceladas: 0,
          retificadas: 0,
        };
      }
      porGuarda[guardaId].total++;
      if (o.status === "synced") porGuarda[guardaId].finalizadas++;
      if (o.status === "pending_sync") porGuarda[guardaId].pendentes++;
      if (o.status === "cancelled") porGuarda[guardaId].canceladas++;
      if (o.status === "rectified") porGuarda[guardaId].retificadas++;
    });

    const ranking = Object.values(porGuarda)
      .map((g) => ({
        ...g,
        taxa: g.total > 0 ? ((g.finalizadas / g.total) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-user-tie" style="margin-right:8px;"></i>
            Desempenho por Guarda
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <div class="table-wrapper">
            <table style="font-size:12px;">
              <thead>
                <tr>
                  <th>Guarda</th>
                  <th style="text-align:center;">Total</th>
                  <th style="text-align:center;">Finalizadas</th>
                  <th style="text-align:center;">Taxa</th>
                </tr>
              </thead>
              <tbody>
                ${ranking
                  .map(
                    (g, i) => `
                  <tr>
                    <td>
                      <span style="font-weight:600;">${g.nome}</span>
                      ${i === 0 ? ' <span style="font-size:10px;">🏆</span>' : ""}
                    </td>
                    <td style="text-align:center;font-weight:600;">${g.total}</td>
                    <td style="text-align:center;color:var(--verde-bandeira);">${g.finalizadas}</td>
                    <td style="text-align:center;font-weight:600;color:${g.taxa >= 70 ? "var(--verde-bandeira)" : g.taxa >= 50 ? "var(--aviso)" : "var(--erro)"};">${g.taxa}%</td>
                  </tr>
                `,
                  )
                  .join("")}
                ${
                  ranking.length === 0
                    ? `
                  <tr>
                    <td colspan="4" style="text-align:center;color:var(--cinza-medio);padding:16px;">
                      Nenhuma ocorrência no período
                    </td>
                  </tr>
                `
                    : ""
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO DE RETIFICAÇÕES
  // ============================================

  async renderRelatorioRetificacoes(
    container,
    ocorrencias,
    dataInicio,
    dataFim,
  ) {
    const retificacoes = ocorrencias.filter((o) => o.status === "rectified");
    const pendentes = ocorrencias.filter(
      (o) => o.status === "pending_rectification",
    );
    const rejeitadas = ocorrencias.filter(
      (o) => o.status === "rectification_rejected",
    );

    const client = supabaseClient.getClient();
    const { data: usuarios } = await client
      .from("usuarios")
      .select("id, nome_completo");

    const mapaUsuarios = {};
    usuarios?.forEach((u) => (mapaUsuarios[u.id] = u.nome_completo));

    const camposMaisAlterados = {};
    retificacoes.forEach((r) => {
      if (r.campos_alterados) {
        try {
          const campos = JSON.parse(r.campos_alterados);
          campos.forEach((c) => {
            const label = c.label || c.campo;
            if (!camposMaisAlterados[label]) camposMaisAlterados[label] = 0;
            camposMaisAlterados[label]++;
          });
        } catch (e) {}
      }
    });

    const topCampos = Object.keys(camposMaisAlterados)
      .map((key) => ({ campo: key, total: camposMaisAlterados[key] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
            Relatório de Retificações
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${retificacoes.length}</div>
            <div style="font-size:9px;opacity:0.8;">Aprovadas</div>
          </div>
          <div style="background:var(--aviso);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${pendentes.length}</div>
            <div style="font-size:9px;opacity:0.8;">Pendentes</div>
          </div>
          <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${rejeitadas.length}</div>
            <div style="font-size:9px;opacity:0.8;">Rejeitadas</div>
          </div>
        </div>

        ${
          topCampos.length > 0
            ? `
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
            <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
              <i class="fas fa-edit" style="margin-right:4px;"></i>
              Campos Mais Alterados
            </h4>
            ${topCampos
              .map(
                (c) => `
              <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
                <span style="flex:1;">${c.campo}</span>
                <span style="font-weight:700;color:var(--azul-bandeira);">${c.total}</span>
                <span style="font-size:11px;color:var(--cinza-medio);">vezes</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-list" style="margin-right:4px;"></i>
            Últimas Retificações
          </h4>
          ${retificacoes
            .slice(0, 10)
            .map(
              (r) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>#${r.numero_ocorrencia || r.numero_temporario || "N/A"}</span>
              <span style="color:var(--cinza-medio);">${new Date(r.criado_em).toLocaleDateString("pt-BR")}</span>
            </div>
          `,
            )
            .join("")}
          ${
            retificacoes.length === 0
              ? `
            <p style="text-align:center;color:var(--cinza-medio);padding:12px;font-size:13px;">
              Nenhuma retificação no período
            </p>
          `
              : ""
          }
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO DE CANCELAMENTOS
  // ============================================

  async renderRelatorioCancelamentos(
    container,
    ocorrencias,
    dataInicio,
    dataFim,
  ) {
    const canceladas = ocorrencias.filter((o) => o.status === "cancelled");

    const motivos = {};
    canceladas.forEach((o) => {
      const motivo = o.motivo_cancelamento || "Não informado";
      if (!motivos[motivo]) motivos[motivo] = 0;
      motivos[motivo]++;
    });

    const topMotivos = Object.keys(motivos)
      .map((key) => ({ motivo: key, total: motivos[key] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-times-circle" style="margin-right:8px;"></i>
            Relatório de Cancelamentos
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${canceladas.length}</div>
            <div style="font-size:9px;opacity:0.8;">Total Canceladas</div>
          </div>
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${ocorrencias.length > 0 ? ((canceladas.length / ocorrencias.length) * 100).toFixed(1) : 0}%</div>
            <div style="font-size:9px;opacity:0.8;">Taxa de Cancelamento</div>
          </div>
        </div>

        ${
          topMotivos.length > 0
            ? `
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
            <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
              <i class="fas fa-list" style="margin-right:4px;"></i>
              Principais Motivos
            </h4>
            ${topMotivos
              .map(
                (m) => `
              <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
                <span style="flex:1;">${m.motivo}</span>
                <span style="font-weight:700;color:var(--erro);">${m.total}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO DE TENDÊNCIAS E SAZONALIDADE
  // ============================================

  async renderRelatorioTendencias(container, ocorrencias, dataInicio, dataFim) {
    const porDiaSemana = {};
    const porHora = {};
    const porMes = this.agruparPorMes(ocorrencias);

    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    ocorrencias.forEach((o) => {
      const data = new Date(o.criado_em);
      const diaSemana = data.getDay();
      const hora = data.getHours();

      if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = 0;
      porDiaSemana[diaSemana]++;

      if (!porHora[hora]) porHora[hora] = 0;
      porHora[hora]++;
    });

    const dadosDiaSemana = Object.keys(porDiaSemana)
      .map((key) => ({
        dia: diasSemana[parseInt(key)],
        total: porDiaSemana[key],
      }))
      .sort((a, b) => diasSemana.indexOf(a.dia) - diasSemana.indexOf(b.dia));

    const dadosHora = Object.keys(porHora)
      .map((key) => ({ hora: parseInt(key), total: porHora[key] }))
      .sort((a, b) => a.hora - b.hora);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-chart-line" style="margin-right:8px;"></i>
            Tendências e Sazonalidade
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
            Evolução Mensal
          </h4>
          <div style="height:150px;">
            <canvas id="chartTendenciasMensal"></canvas>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-calendar-week" style="margin-right:4px;"></i>
            Ocorrências por Dia da Semana
          </h4>
          <div style="height:120px;">
            <canvas id="chartTendenciasDiaSemana"></canvas>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-clock" style="margin-right:4px;"></i>
            Ocorrências por Hora do Dia
          </h4>
          <div style="height:120px;">
            <canvas id="chartTendenciasHora"></canvas>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    await this.renderizarGraficoBarras("chartTendenciasMensal", porMes);
    await this.renderizarGraficoBarras(
      "chartTendenciasDiaSemana",
      dadosDiaSemana.map((d) => ({ label: d.dia, value: d.total })),
    );
    await this.renderizarGraficoBarras(
      "chartTendenciasHora",
      dadosHora.map((d) => ({
        label: String(d.hora).padStart(2, "0") + "h",
        value: d.total,
      })),
    );
  }

  // ============================================
  // RELATÓRIO DE PRODUTIVIDADE
  // ============================================

  async renderRelatorioProdutividade(
    container,
    ocorrencias,
    dataInicio,
    dataFim,
  ) {
    const total = ocorrencias.length;
    const finalizadas = ocorrencias.filter((o) => o.status === "synced").length;
    const pendentes = ocorrencias.filter(
      (o) => o.status === "pending_sync",
    ).length;
    const totalDias = this.calcularDiasPeriodo(dataInicio, dataFim);
    const mediaDiaria = totalDias > 0 ? (total / totalDias).toFixed(1) : 0;
    const projecao = mediaDiaria * 30;

    const dataAnteriorInicio = this.calcularDataAnterior(dataInicio, dataFim);
    const dataAnteriorFim = dataInicio;
    const ocorrenciasAnterior = await this.buscarOcorrenciasPeriodo(
      dataAnteriorInicio,
      dataAnteriorFim,
    );
    const totalAnterior = ocorrenciasAnterior.length;
    const variacao =
      totalAnterior > 0
        ? (((total - totalAnterior) / totalAnterior) * 100).toFixed(1)
        : 0;

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-rocket" style="margin-right:8px;"></i>
            Produtividade do Setor
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${total}</div>
            <div style="font-size:9px;opacity:0.8;">Ocorrências</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
            <div style="font-size:16px;font-weight:800;">${mediaDiaria}</div>
            <div style="font-size:9px;opacity:0.8;">Média Diária</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
            <div style="font-size:16px;font-weight:800;color:var(--cinza-escuro);">${projecao}</div>
            <div style="font-size:9px;color:var(--cinza-medio);">Projeção Mensal</div>
          </div>
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
            <div style="font-size:16px;font-weight:800;color:${variacao >= 0 ? "var(--verde-bandeira)" : "var(--erro)"};">${variacao >= 0 ? "+" : ""}${variacao}%</div>
            <div style="font-size:9px;color:var(--cinza-medio);">Variação vs Período Anterior</div>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-info-circle" style="margin-right:4px;"></i>
            Resumo do Período
          </h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">
            <div><span style="color:var(--cinza-medio);">Finalizadas:</span> <strong>${finalizadas}</strong></div>
            <div><span style="color:var(--cinza-medio);">Pendentes:</span> <strong>${pendentes}</strong></div>
            <div><span style="color:var(--cinza-medio);">Dias no período:</span> <strong>${totalDias}</strong></div>
            <div><span style="color:var(--cinza-medio);">Taxa resolução:</span> <strong>${total > 0 ? ((finalizadas / total) * 100).toFixed(1) : 0}%</strong></div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // RELATÓRIO DETALHADO (LISTA COMPLETA)
  // ============================================

  async renderRelatorioDetalhadoLista(
    container,
    ocorrencias,
    dataInicio,
    dataFim,
  ) {
    const porTipo = this.agruparPorTipo(ocorrencias);

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-list-ul" style="margin-right:8px;"></i>
            Ocorrências Detalhado
          </h2>
          <button class="btn-secondary" onclick="app.voltarRelatorios()" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${new Date(dataInicio).toLocaleDateString("pt-BR")} até ${new Date(dataFim).toLocaleDateString("pt-BR")}
          <span style="margin-left:8px;font-weight:600;">${ocorrencias.length} ocorrências</span>
        </p>

        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
          ${porTipo
            .slice(0, 5)
            .map(
              (t) => `
            <span class="badge" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:10px;padding:2px 10px;">
              ${t.tipo}: ${t.total}
            </span>
          `,
            )
            .join("")}
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <div class="table-wrapper">
            <table style="font-size:11px;">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Local</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${ocorrencias
                  .slice(0, 50)
                  .map(
                    (o) => `
                  <tr onclick="app.verDetalhes('${o.id}')" style="cursor:pointer;">
                    <td style="font-weight:600;color:var(--azul-bandeira);">${o.numero_ocorrencia || o.numero_temporario || "Rascunho"}</td>
                    <td style="font-size:10px;color:var(--cinza-medio);">${new Date(o.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td>${this.getTipoLabel(o.tipo_ocorrencia)}</td>
                    <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.local_ocorrencia || "-"}</td>
                    <td><span class="badge badge-${this.getStatusClass(o.status)}" style="font-size:9px;">${this.getStatusLabel(o.status)}</span></td>
                  </tr>
                `,
                  )
                  .join("")}
                ${
                  ocorrencias.length > 50
                    ? `
                  <tr>
                    <td colspan="5" style="text-align:center;color:var(--cinza-medio);font-size:12px;padding:12px;">
                      + ${ocorrencias.length - 50} outras ocorrências
                    </td>
                  </tr>
                `
                    : ""
                }
                ${
                  ocorrencias.length === 0
                    ? `
                  <tr>
                    <td colspan="5" style="text-align:center;color:var(--cinza-medio);padding:20px;font-size:13px;">
                      Nenhuma ocorrência no período
                    </td>
                  </tr>
                `
                    : ""
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // FUNÇÕES AUXILIARES PARA RELATÓRIOS
  // ============================================

  calcularEstatisticas(ocorrencias) {
    return {
      total: ocorrencias.length,
      finalizadas: ocorrencias.filter((o) => o.status === "synced").length,
      pendentes: ocorrencias.filter((o) => o.status === "pending_sync").length,
      canceladas: ocorrencias.filter((o) => o.status === "cancelled").length,
      retificadas: ocorrencias.filter((o) => o.status === "rectified").length,
    };
  }

  agruparPorTipo(ocorrencias) {
    const tipos = {};
    const total = ocorrencias.length || 1;

    ocorrencias.forEach((o) => {
      const tipo = o.tipo_ocorrencia || "Não informado";
      if (!tipos[tipo]) {
        tipos[tipo] = { total: 0, finalizadas: 0, pendentes: 0 };
      }
      tipos[tipo].total++;
      if (o.status === "synced") tipos[tipo].finalizadas++;
      if (o.status === "pending_sync") tipos[tipo].pendentes++;
    });

    return Object.keys(tipos)
      .map((key) => ({
        tipo: this.getTipoLabel(key),
        total: tipos[key].total,
        finalizadas: tipos[key].finalizadas,
        pendentes: tipos[key].pendentes,
        percentual: ((tipos[key].total / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.total - a.total);
  }

  agruparPorMes(ocorrencias) {
    const meses = {};
    ocorrencias.forEach((o) => {
      const data = new Date(o.criado_em);
      const mes = `${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
      if (!meses[mes]) meses[mes] = 0;
      meses[mes]++;
    });

    return Object.keys(meses)
      .sort((a, b) => {
        const [mesA, anoA] = a.split("/");
        const [mesB, anoB] = b.split("/");
        return `${anoA}${mesA}`.localeCompare(`${anoB}${mesB}`);
      })
      .map((mes) => ({
        label: mes,
        value: meses[mes],
      }));
  }

  agruparPorBairro(ocorrencias) {
    const bairros = {};
    const total = ocorrencias.length || 1;

    ocorrencias.forEach((o) => {
      const bairro = o.bairro_ocorrencia || "Não informado";
      if (!bairros[bairro]) bairros[bairro] = 0;
      bairros[bairro]++;
    });

    return Object.keys(bairros)
      .map((key) => ({
        bairro: key,
        total: bairros[key],
        percentual: ((bairros[key] / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.total - a.total);
  }

  calcularMediaDiaria(ocorrencias, dataInicio, dataFim) {
    const dias = this.calcularDiasPeriodo(dataInicio, dataFim);
    return dias > 0 ? (ocorrencias.length / dias).toFixed(1) : 0;
  }

  calcularDiasPeriodo(dataInicio, dataFim) {
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    return Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
  }

  calcularDataAnterior(dataInicio, dataFim) {
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const diff = fim - inicio;
    const data = new Date(inicio);
    data.setTime(data.getTime() - diff);
    return data.toISOString().slice(0, 10);
  }

  // ============================================
  // RENDERIZAÇÃO DE GRÁFICOS (Chart.js)
  // ============================================

  async renderizarGraficoPizza(canvasId, dados, cores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (typeof Chart === "undefined") {
      await this.carregarChartJS();
    }

    const defaultCores = [
      "#003F87",
      "#00843D",
      "#DC2626",
      "#F59E0B",
      "#8B5CF6",
      "#EC4899",
      "#06B6D4",
      "#F97316",
      "#14B8A6",
      "#6366F1",
    ];

    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: dados.map((d) => d.tipo),
        datasets: [
          {
            data: dados.map((d) => d.total),
            backgroundColor: (cores || defaultCores).slice(0, dados.length),
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              font: { size: 10 },
              boxWidth: 10,
              padding: 6,
            },
          },
        },
      },
    });
  }

  async renderizarGraficoBarras(canvasId, dados) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (typeof Chart === "undefined") {
      await this.carregarChartJS();
    }

    new Chart(canvas, {
      type: "bar",
      data: {
        labels: dados.map((d) => d.label),
        datasets: [
          {
            label: "Ocorrências",
            data: dados.map((d) => d.value),
            backgroundColor: "rgba(0, 63, 135, 0.7)",
            borderColor: "#003F87",
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 9 } },
          },
          x: {
            ticks: { font: { size: 9 } },
          },
        },
      },
    });
  }

  carregarChartJS() {
    return new Promise((resolve) => {
      if (document.querySelector('script[src*="chart.js"]')) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  async exportarRelatorioPDF() {
    this.showToast("Exportação para PDF em desenvolvimento", "info");
  }

  async exportarRelatorioCSV() {
    this.showToast("Exportação para CSV em desenvolvimento", "info");
  }

  // ============================================
  // PÁGINA DE LOGS DO SISTEMA
  // ============================================

  async renderLogs(container) {
    if (!authManager.isSupervisor()) {
      container.innerHTML = `
        <div class="container">
          <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
            <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
              <i class="fas fa-lock"></i>
            </div>
            <p style="font-weight:500;">Acesso restrito a supervisores</p>
            <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
              Voltar
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Carregar dados
    const result = await authManager.listarLogsAcesso({ limit: 200 });
    if (!result.success) {
      container.innerHTML = `
        <div class="container">
          <p style="color:var(--erro);">Erro ao carregar logs: ${result.error}</p>
          <button onclick="app.loadPageContent('logs')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Tentar novamente
          </button>
        </div>
      `;
      return;
    }

    const logs = result.data || [];
    const stats = await authManager.getLogStats();

    // Obter lista de usuários para o filtro
    const usuariosResult = await authManager.listarUsuarios();
    const usuarios = usuariosResult.success ? usuariosResult.data : [];

    // Opções de ações para o filtro
    const acoes = [
      { value: "", label: "Todas" },
      { value: "login", label: "Login" },
      { value: "logout", label: "Logout" },
      { value: "primeiro_acesso", label: "Primeiro Acesso" },
      { value: "criar_ocorrencia", label: "Criar Ocorrência" },
      { value: "finalizar_ocorrencia", label: "Finalizar Ocorrência" },
      { value: "cancelar_ocorrencia", label: "Cancelar Ocorrência" },
      { value: "solicitar_retificacao", label: "Solicitar Retificação" },
      { value: "aprovar_retificacao", label: "Aprovar Retificação" },
      { value: "rejeitar_retificacao", label: "Rejeitar Retificação" },
      { value: "criar_usuario", label: "Criar Usuário" },
      { value: "editar_usuario", label: "Editar Usuário" },
      { value: "resetar_senha", label: "Resetar Senha" },
      { value: "ativar_desativar_usuario", label: "Ativar/Desativar Usuário" },
    ];

    const html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;">
            <i class="fas fa-history" style="margin-right:8px;"></i>
            Logs do Sistema
          </h2>
          <button onclick="app.navigateTo('dashboard')" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;">
            <i class="fas fa-arrow-left"></i> Voltar
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:13px;">
          ${logs.length} registros encontrados
        </p>

        <!-- Estatísticas rápidas -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${logs.length}</div>
            <div style="font-size:9px;opacity:0.8;">Total</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${logs.filter((l) => l.acao === "login").length}</div>
            <div style="font-size:9px;opacity:0.8;">Logins</div>
          </div>
          <div style="background:var(--aviso);border-radius:var(--border-radius);padding:6px;text-align:center;color:var(--branco);">
            <div style="font-size:18px;font-weight:800;">${logs.filter((l) => l.acao === "criar_ocorrencia").length}</div>
            <div style="font-size:9px;opacity:0.8;">Ocorrências</div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="filtros-container" style="margin-bottom:12px;">
          <div class="filtros-row">
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-user"></i> Usuário</label>
              <select id="filtroLogUsuario">
                <option value="">Todos</option>
                ${usuarios
                  .map(
                    (u) => `
                  <option value="${u.id}">${u.nome_completo}</option>
                `,
                  )
                  .join("")}
              </select>
            </div>
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-tag"></i> Ação</label>
              <select id="filtroLogAcao">
                ${acoes
                  .map(
                    (a) => `
                  <option value="${a.value}">${a.label}</option>
                `,
                  )
                  .join("")}
              </select>
            </div>
            <div class="filtros-actions">
              <button onclick="app.aplicarFiltrosLogs()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;">
                <i class="fas fa-search"></i>
              </button>
              <button onclick="app.limparFiltrosLogs()" class="btn-secondary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;">
                <i class="fas fa-undo"></i>
              </button>
            </div>
          </div>
          <div class="filtros-row" style="margin-top:6px;">
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-calendar-alt"></i> Data Início</label>
              <input type="date" id="filtroLogDataInicio">
            </div>
            <div class="filtro-group" style="flex:1;">
              <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
              <input type="date" id="filtroLogDataFim">
            </div>
          </div>
        </div>

        <!-- Tabela de Logs -->
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <div class="table-wrapper">
            <table style="font-size:12px;">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>IP</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length === 0
                    ? `
                  <tr>
                    <td colspan="5" style="text-align:center;padding:20px;color:var(--cinza-medio);">
                      Nenhum log encontrado
                    </td>
                  </tr>
                `
                    : `
                  ${logs
                    .map((log) => {
                      let detalhesDisplay = log.entidade || "-";
                      if (log.detalhes) {
                        try {
                          const parsed = JSON.parse(log.detalhes);
                          if (parsed.dispositivo || parsed.navegador) {
                            const deviceInfo = [];
                            if (parsed.dispositivo)
                              deviceInfo.push(parsed.dispositivo);
                            if (parsed.navegador)
                              deviceInfo.push(parsed.navegador);
                            if (deviceInfo.length > 0) {
                              detalhesDisplay = deviceInfo.join(" • ");
                            }
                          }
                        } catch (e) {}
                      }
                      return `
                      <tr>
                        <td style="font-size:11px;color:var(--cinza-medio);">
                          ${new Date(log.data_hora).toLocaleString("pt-BR")}
                        </td>
                        <td>${log.usuarios?.nome_completo || "Desconhecido"}</td>
                        <td>
                          <span class="badge ${this.getLogBadgeClass(log.acao)}" style="font-size:10px;">
                            ${this.getLogLabel(log.acao)}
                          </span>
                        </td>
                        <td style="font-size:11px;color:var(--cinza-medio);">${log.ip || "-"}</td>
                        <td style="font-size:11px;color:var(--cinza-medio);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${detalhesDisplay}
                        </td>
                      </tr>
                    `;
                    })
                    .join("")}
                `
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // FUNÇÕES AUXILIARES PARA LOGS
  // ============================================

  getLogBadgeClass(acao) {
    const map = {
      login: "badge-synced",
      logout: "badge-draft",
      primeiro_acesso: "badge-pending",
      criar_ocorrencia: "badge-azul",
      finalizar_ocorrencia: "badge-verde",
      cancelar_ocorrencia: "badge-cancelled",
      solicitar_retificacao: "badge-pending",
      aprovar_retificacao: "badge-synced",
      rejeitar_retificacao: "badge-cancelled",
      criar_usuario: "badge-azul",
      editar_usuario: "badge-azul",
      resetar_senha: "badge-pending",
      ativar_desativar_usuario: "badge-azul",
    };
    return map[acao] || "badge-draft";
  }

  getLogLabel(acao) {
    const map = {
      login: "Login",
      logout: "Logout",
      primeiro_acesso: "Primeiro Acesso",
      criar_ocorrencia: "Criar Ocorrência",
      finalizar_ocorrencia: "Finalizar Ocorrência",
      cancelar_ocorrencia: "Cancelar Ocorrência",
      solicitar_retificacao: "Solicitar Retificação",
      aprovar_retificacao: "Aprovar Retificação",
      rejeitar_retificacao: "Rejeitar Retificação",
      criar_usuario: "Criar Usuário",
      editar_usuario: "Editar Usuário",
      resetar_senha: "Resetar Senha",
      ativar_desativar_usuario: "Ativar/Desativar Usuário",
    };
    return map[acao] || acao;
  }

  // ============================================
  // FILTROS PARA LOGS
  // ============================================

  async aplicarFiltrosLogs() {
    const usuarioId = document.getElementById("filtroLogUsuario")?.value || "";
    const acao = document.getElementById("filtroLogAcao")?.value || "";
    const dataInicio =
      document.getElementById("filtroLogDataInicio")?.value || "";
    const dataFim = document.getElementById("filtroLogDataFim")?.value || "";

    if (dataInicio && dataFim && dataFim < dataInicio) {
      this.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
      return;
    }

    const filtros = {
      limit: 200,
    };
    if (usuarioId) filtros.usuario_id = usuarioId;
    if (acao) filtros.acao = acao;
    if (dataInicio) filtros.data_inicio = dataInicio;
    if (dataFim) filtros.data_fim = dataFim + "T23:59:59";

    const result = await authManager.listarLogsAcesso(filtros);
    if (!result.success) {
      this.showToast("Erro ao filtrar logs: " + result.error, "error");
      return;
    }

    // Atualizar a tabela com os logs filtrados
    const container = document.getElementById("logsContent");
    if (container) {
      this.filtrosLogs = filtros;
      await this.renderLogs(container);
    }
  }

  async limparFiltrosLogs() {
    const usuarioSelect = document.getElementById("filtroLogUsuario");
    const acaoSelect = document.getElementById("filtroLogAcao");
    const dataInicioInput = document.getElementById("filtroLogDataInicio");
    const dataFimInput = document.getElementById("filtroLogDataFim");

    if (usuarioSelect) usuarioSelect.value = "";
    if (acaoSelect) acaoSelect.value = "";
    if (dataInicioInput) dataInicioInput.value = "";
    if (dataFimInput) dataFimInput.value = "";

    this.filtrosLogs = {};
    this.loadPageContent("logs");
  }

  // ============================================
  // NOVA OCORRÊNCIA
  // ============================================

  async renderNovaOcorrencia(container) {
    if (this.dadosRascunho) {
      this.novaOcorrencia = {
        etapa: 1,
        id: this.rascunhoId,
        dados: this.dadosRascunho,
      };
      this.alteracoesNaoSalvas = true;
      console.log("📂 Rascunho carregado para edição:", this.rascunhoId);
    } else {
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
          tipo_ocorrencia: "",
          envolvidos: [],
          observacoes: "",
          anexos: [],
        },
      };
      this.alteracoesNaoSalvas = false;
    }

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

                <div style="margin-top:12px;">
                    <button type="button" class="btn-secondary" onclick="app.salvarRascunho()" style="width:100%;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);">
                        <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Rascunho
                    </button>
                </div>
            </div>
        `;

    container.innerHTML = html;
    this.configurarEventosFormulario();

    document
      .querySelectorAll(
        "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
      )
      .forEach((input) => {
        input.addEventListener("change", () => {
          this.alteracoesNaoSalvas = true;
        });
        input.addEventListener("input", () => {
          this.alteracoesNaoSalvas = true;
        });
      });
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
    const brasiliaNow = this.obterDataHoraBrasilia();
    let dataInicio = dados.data_hora_inicio;
    if (!dataInicio || dataInicio === "") {
      dataInicio = this.formatarDataHoraLocal(brasiliaNow);
    } else {
      try {
        const dateObj = new Date(dataInicio);
        if (!isNaN(dateObj.getTime())) {
          dataInicio = this.formatarDataHoraLocal(dateObj);
        } else {
          dataInicio = this.formatarDataHoraLocal(brasiliaNow);
        }
      } catch (e) {
        dataInicio = this.formatarDataHoraLocal(brasiliaNow);
      }
    }

    const dataFim = dados.data_hora_encerramento || "";

    const tipoOptions = this.TIPOS_OCORRENCIA.map(
      (op) =>
        `<option value="${op.value}" ${dados.tipo_ocorrencia === op.value ? "selected" : ""}>${op.label}</option>`,
    ).join("");

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
                <label for="tipo_ocorrencia">
                    <i class="fas fa-tag" style="margin-right:6px;color:var(--azul-bandeira);"></i>
                    Tipo de Ocorrência <span class="required">*</span>
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-list input-icon-left"></i>
                    <select id="tipo_ocorrencia" class="form-control" required>
                        <option value="">Selecione o tipo...</option>
                        ${tipoOptions}
                    </select>
                </div>
                <div class="input-hint">
                    <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                    Classifique a natureza da ocorrência
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
                    Data e hora do início (Horário de Brasília) <span class="required">*</span>
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-calendar input-icon-left"></i>
                    <input type="datetime-local" id="data_hora_inicio" class="form-control" required value="${dataInicio}">
                </div>
                <div class="input-hint">
                    <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                    Fuso horário: Brasília (UTC-3) - Preenchido automaticamente
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
                <div class="input-hint">
                    <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                    Deixe em branco se ainda não encerrou
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
                    <div class="lista-vazia">
                        <i class="fas fa-users"></i>
                        <p>Nenhum envolvido cadastrado</p>
                        <p class="sub">Clique no botão abaixo para adicionar</p>
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
                            <div class="envolvido-detalhes">
                                ${env.cpf ? `<span><i class="fas fa-id-card"></i> ${env.cpf}</span>` : ""}
                                ${env.telefone ? `<span><i class="fas fa-phone"></i> ${env.telefone}</span>` : ""}
                            </div>
                        </div>
                    `,
                      )
                      .join("")}
                `
                }
            </div>

            <button type="button" class="btn-add" onclick="app.adicionarEnvolvido()">
                <i class="fas fa-plus-circle"></i> Adicionar Envolvido
            </button>
        `;

    return html;
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

            <button type="button" class="btn-add" onclick="document.getElementById('fileInput').click()">
                <i class="fas fa-plus-circle"></i> Adicionar Anexos
            </button>
        `;
  }

  // ============================================
  // ETAPA 6 - REVISÃO E FINALIZAÇÃO
  // ============================================
  renderEtapa6(dados) {
    const envolvidos = dados.envolvidos || [];
    const anexos = dados.anexos || [];

    const camposSolicitante = [
      { label: "Forma", valor: dados.forma_solicitacao },
      { label: "Solicitante", valor: dados.nome_solicitante },
      { label: "Telefone", valor: dados.telefone_solicitante },
      { label: "Endereço", valor: dados.endereco_solicitante },
      { label: "Código Municipal", valor: dados.codigo_municipal },
      { label: "Complemento", valor: dados.complemento },
      { label: "Bairro", valor: dados.bairro_solicitante },
      {
        label: "Identificação Adicional",
        valor: dados.identificacao_adicional,
      },
    ];

    const camposOcorrencia = [
      {
        label: "Tipo",
        valor: dados.tipo_ocorrencia
          ? this.getTipoLabel(dados.tipo_ocorrencia)
          : null,
      },
      { label: "Local", valor: dados.local_ocorrencia },
      { label: "Rodovia", valor: dados.rodovia },
      { label: "Bairro", valor: dados.bairro_ocorrencia },
      { label: "Referência", valor: dados.referencia },
      { label: "Código Operacional", valor: dados.codigo_operacional },
    ];

    const camposSolicitantePreenchidos = camposSolicitante.filter(
      (c) => c.valor && c.valor.toString().trim() !== "",
    );
    const camposOcorrenciaPreenchidos = camposOcorrencia.filter(
      (c) => c.valor && c.valor.toString().trim() !== "",
    );

    return `
            <div style="margin-bottom:16px;">
                <p style="color:var(--cinza-medio);font-size:14px;">
                    <i class="fas fa-check-circle" style="color:var(--verde-bandeira);"></i>
                    Revise todos os dados antes de finalizar a ocorrência.
                </p>
            </div>

            ${
              camposSolicitantePreenchidos.length > 0
                ? `
            <div class="card-revisao">
                <h4>
                    <i class="fas fa-phone-alt"></i>
                    Origem da Solicitação
                </h4>
                ${camposSolicitantePreenchidos
                  .map(
                    (c) => `
                    <div class="campo">
                        <span class="rotulo">${c.label}:</span>
                        <span class="valor">${c.valor}</span>
                    </div>
                  `,
                  )
                  .join("")}
            </div>
            `
                : ""
            }

            ${
              camposOcorrenciaPreenchidos.length > 0 || dados.data_hora_inicio
                ? `
            <div class="card-revisao">
                <h4>
                    <i class="fas fa-map-marker-alt"></i>
                    Dados da Ocorrência
                </h4>
                ${camposOcorrenciaPreenchidos
                  .map(
                    (c) => `
                    <div class="campo">
                        <span class="rotulo">${c.label}:</span>
                        <span class="valor">${c.valor}</span>
                    </div>
                  `,
                  )
                  .join("")}
                <div class="campo">
                    <span class="rotulo">Início:</span>
                    <span class="valor">${dados.data_hora_inicio ? new Date(dados.data_hora_inicio).toLocaleString("pt-BR") : "Não informado"}</span>
                </div>
                ${
                  dados.data_hora_encerramento
                    ? `
                <div class="campo">
                    <span class="rotulo">Encerramento:</span>
                    <span class="valor">${new Date(dados.data_hora_encerramento).toLocaleString("pt-BR")}</span>
                </div>`
                    : ""
                }
            </div>
            `
                : ""
            }

            <div class="card-revisao">
                <h4>
                    <i class="fas fa-users"></i>
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
                        <div class="envolvido-item">
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

            ${
              dados.observacoes && dados.observacoes.trim() !== ""
                ? `
            <div class="card-revisao">
                <h4>
                    <i class="fas fa-pencil-alt"></i>
                    Observações
                </h4>
                <p style="font-size:14px;white-space:pre-wrap;">${dados.observacoes}</p>
            </div>
            `
                : ""
            }

            <div class="card-revisao">
                <h4>
                    <i class="fas fa-paperclip"></i>
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

            <div class="alert-finalizar">
                <p>
                    <i class="fas fa-info-circle"></i>
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
        dados.tipo_ocorrencia =
          document.getElementById("tipo_ocorrencia")?.value || "";
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

    this.salvarDadosEtapa();

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
        const tipo = document.getElementById("tipo_ocorrencia")?.value;
        if (!local) {
          mensagem = "Informe o local da ocorrência";
          isValid = false;
        } else if (!dataInicio) {
          mensagem = "Informe a data e hora do início";
          isValid = false;
        } else if (!tipo) {
          mensagem = "Selecione o tipo de ocorrência";
          isValid = false;
        }
        break;
      case 3:
        break;
      case 4:
        const observacoes = document.getElementById("observacoes")?.value;
        if (!observacoes || observacoes.trim().length < 10) {
          mensagem = "Descreva o ocorrido com pelo menos 10 caracteres";
          isValid = false;
        }
        break;
      case 5:
        break;
      case 6:
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
                        <i class="fas fa-user-plus"></i>
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
      this.showToast("Selecione a forma de solicitação", "warning");
      this.novaOcorrencia.etapa = 1;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.tipo_ocorrencia) {
      this.showToast("Selecione o tipo de ocorrência", "warning");
      this.novaOcorrencia.etapa = 2;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.local_ocorrencia || dados.local_ocorrencia.trim() === "") {
      this.showToast("Informe o local da ocorrência", "warning");
      this.novaOcorrencia.etapa = 2;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (!dados.data_hora_inicio || dados.data_hora_inicio === "") {
      this.showToast("Informe a data e hora do início", "warning");
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

    try {
      const dateObj = new Date(dados.data_hora_inicio);
      if (isNaN(dateObj.getTime())) {
        this.showToast("Data e hora de início inválida", "warning");
        this.novaOcorrencia.etapa = 2;
        this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
        return;
      }
    } catch (e) {
      this.showToast("Data e hora de início inválida", "warning");
      this.novaOcorrencia.etapa = 2;
      this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
      return;
    }

    if (dados.data_hora_encerramento) {
      try {
        const dateObj = new Date(dados.data_hora_encerramento);
        if (isNaN(dateObj.getTime())) {
          this.showToast("Data e hora de encerramento inválida", "warning");
          this.novaOcorrencia.etapa = 2;
          this.renderizarEtapa(
            document.getElementById("novaOcorrenciaContent"),
          );
          return;
        }
        const inicio = new Date(dados.data_hora_inicio);
        const fim = new Date(dados.data_hora_encerramento);
        if (fim < inicio) {
          this.showToast(
            "Data de encerramento deve ser posterior ao início",
            "warning",
          );
          this.novaOcorrencia.etapa = 2;
          this.renderizarEtapa(
            document.getElementById("novaOcorrenciaContent"),
          );
          return;
        }
      } catch (e) {
        this.showToast("Data e hora de encerramento inválida", "warning");
        this.novaOcorrencia.etapa = 2;
        this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
        return;
      }
    }

    if (dados.envolvidos.length === 0) {
      if (!confirm("Nenhum envolvido cadastrado. Deseja continuar assim?")) {
        this.novaOcorrencia.etapa = 3;
        this.renderizarEtapa(document.getElementById("novaOcorrenciaContent"));
        return;
      }
    }

    const confirmado = await this.confirmar(
      "Deseja finalizar esta ocorrência? Após finalizar, não será mais possível editar.",
    );
    if (!confirmado) return;

    const envolvidos = dados.envolvidos || [];
    const anexos = dados.anexos || [];

    const dadosParaSalvar = { ...dados };
    delete dadosParaSalvar.envolvidos;
    delete dadosParaSalvar.anexos;

    if (dadosParaSalvar.data_hora_inicio) {
      try {
        const dateObj = new Date(dadosParaSalvar.data_hora_inicio);
        if (!isNaN(dateObj.getTime())) {
          dadosParaSalvar.data_hora_inicio = dateObj.toISOString();
        } else {
          const brasiliaNow = this.obterDataHoraBrasilia();
          dadosParaSalvar.data_hora_inicio = brasiliaNow.toISOString();
        }
      } catch (e) {
        const brasiliaNow = this.obterDataHoraBrasilia();
        dadosParaSalvar.data_hora_inicio = brasiliaNow.toISOString();
      }
    } else {
      const brasiliaNow = this.obterDataHoraBrasilia();
      dadosParaSalvar.data_hora_inicio = brasiliaNow.toISOString();
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

    // ===== CAPTURAR GEOLOCALIZAÇÃO =====
    const localizacao = await this.obterLocalizacao();

    const result = await ocorrenciaManager.criar({
      ...dadosParaSalvar,
      status: navigator.onLine ? "synced" : "pending_sync",
      latitude: localizacao.latitude,
      longitude: localizacao.longitude,
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

    await authManager.logCriarOcorrencia(authManager.getUserId(), ocorrenciaId);

    if (this.rascunhoId) {
      try {
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
      } catch (e) {
        console.warn("Erro ao limpar rascunho:", e);
      }
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
        tipo_ocorrencia: "",
        envolvidos: [],
        observacoes: "",
        anexos: [],
      },
    };
    this.alteracoesNaoSalvas = false;

    setTimeout(() => this.navigateTo("dashboard"), 1500);
  }

  // ============================================
  // RENDERIZAÇÃO - USUÁRIOS
  // ============================================

  async renderUsuarios(container) {
    if (!authManager.isSupervisor()) {
      container.innerHTML = `
                <div class="container">
                    <h2 style="color:var(--azul-bandeira);"><i class="fas fa-users" style="margin-right:8px;"></i>Gerenciar Usuários</h2>
                    <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
                        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
                            <i class="fas fa-lock"></i>
                        </div>
                        <p style="font-weight:500;">Acesso restrito a supervisores</p>
                        <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
                            Voltar
                        </button>
                    </div>
                </div>
            `;
      return;
    }

    const result = await authManager.listarUsuarios();
    if (!result.success) {
      container.innerHTML = `
                <div class="container">
                    <h2 style="color:var(--azul-bandeira);"><i class="fas fa-users" style="margin-right:8px;"></i>Gerenciar Usuários</h2>
                    <p style="color:var(--erro);">Erro ao carregar usuários: ${result.error}</p>
                    <button onclick="app.loadPageContent('usuarios')" class="btn-primary" style="margin-top:16px;max-width:200px;">
                        Tentar novamente
                    </button>
                </div>
            `;
      return;
    }

    const usuarios = result.data || [];

    let html = `
            <div class="container">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="color:var(--azul-bandeira);margin:0;">
                        <i class="fas fa-users" style="margin-right:8px;"></i>Gerenciar Usuários
                    </h2>
                    <button class="btn-primary" onclick="app.modalCriarUsuario()" style="padding:8px 16px;font-size:13px;min-height:auto;width:auto;">
                        <i class="fas fa-plus" style="margin-right:4px;"></i> Novo
                    </button>
                </div>
                <p style="color:var(--cinza-medio);margin-bottom:16px;font-size:14px;">
                    ${usuarios.length} usuário(s) cadastrado(s)
                </p>

                <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                    <input type="text" id="filtroSearchUser" placeholder="Buscar por nome, CPF ou matrícula..." style="flex:1;min-width:150px;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco-fumaca);">
                    <button class="btn-secondary" onclick="app.filtrarUsuarios()" style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;">
                        <i class="fas fa-search"></i>
                    </button>
                    <button class="btn-secondary" onclick="app.limparFiltroUsuarios()" style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;">
                        <i class="fas fa-undo"></i>
                    </button>
                </div>

                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Matrícula</th>
                                <th>Perfil</th>
                                <th>Status</th>
                                <th style="text-align:center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
    `;

    if (usuarios.length === 0) {
      html += `
                            <tr>
                                <td colspan="5" style="padding:20px;text-align:center;color:var(--cinza-medio);">
                                    Nenhum usuário encontrado
                                </td>
                            </tr>
                        `;
    } else {
      usuarios.forEach((user) => {
        const statusClass =
          user.status === "ativo"
            ? "synced"
            : user.status === "inativo"
              ? "cancelled"
              : "draft";
        const statusLabel =
          user.status === "ativo"
            ? "Ativo"
            : user.status === "inativo"
              ? "Inativo"
              : user.status === "bloqueado"
                ? "Bloqueado"
                : user.status;
        const perfilLabel =
          user.perfil === "supervisor"
            ? "Supervisor"
            : user.perfil === "guarda"
              ? "Guarda"
              : user.perfil;
        const ehAtual = user.id === authManager.getUserId();
        const cpfExibido = this.formatarCPFSeguro(user.cpf);

        html += `
                            <tr>
                                <td>
                                    <div style="font-weight:500;">${user.nome_completo}</div>
                                    <div style="font-size:10px;color:var(--cinza-medio);">${cpfExibido}</div>
                                </td>
                                <td>${user.matricula || "-"}</td>
                                <td><span class="badge ${user.perfil === "supervisor" ? "badge-azul" : "badge-verde"}">${perfilLabel}</span></td>
                                <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
                                <td>
                                    <div class="acoes">
                                        <button class="btn-secondary info" onclick="app.modalEditarUsuario('${user.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-secondary ${user.status === "ativo" ? "danger" : "success"}" onclick="app.toggleStatusUsuario('${user.id}')" title="${user.status === "ativo" ? "Desativar" : "Ativar"}">
                                            <i class="fas ${user.status === "ativo" ? "fa-user-slash" : "fa-user-check"}"></i>
                                        </button>
                                        ${
                                          !ehAtual
                                            ? `
                                            <button class="btn-secondary warning" onclick="app.resetarSenhaUsuario('${user.id}')" title="Resetar senha">
                                                <i class="fas fa-key"></i>
                                            </button>
                                        `
                                            : ""
                                        }
                                        <button class="btn-secondary info" onclick="app.verLogsUsuario('${user.id}')" title="Ver logs">
                                            <i class="fas fa-history"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
      });
    }

    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    container.innerHTML = html;
  }

  async filtrarUsuarios() {
    const search = document.getElementById("filtroSearchUser")?.value || "";
    const result = await authManager.listarUsuarios({ search });
    if (!result.success) {
      this.showToast("Erro ao filtrar usuários", "error");
      return;
    }
    this.renderUsuarios(document.getElementById("page-usuarios"));
  }

  async limparFiltroUsuarios() {
    const input = document.getElementById("filtroSearchUser");
    if (input) input.value = "";
    this.renderUsuarios(document.getElementById("page-usuarios"));
  }

  // ============================================
  // MODAL - CRIAR USUÁRIO
  // ============================================

  modalCriarUsuario() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-user-plus" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Criar Usuário
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="formCriarUsuario">
            <div class="form-group">
              <label for="new_nome">Nome Completo <span class="required">*</span></label>
              <input type="text" id="new_nome" class="form-control" placeholder="Nome completo" required>
            </div>
            <div class="form-group">
              <label for="new_cpf">CPF <span class="required">*</span></label>
              <input type="text" id="new_cpf" class="form-control" placeholder="123.456.789-00" required maxlength="14">
            </div>
            <div class="form-group">
              <label for="new_matricula">Matrícula</label>
              <input type="text" id="new_matricula" class="form-control" placeholder="Matrícula">
            </div>
            <div class="form-group">
              <label for="new_email">Email</label>
              <input type="email" id="new_email" class="form-control" placeholder="email@exemplo.com">
            </div>
            <div class="form-group">
              <label for="new_telefone">Telefone</label>
              <input type="text" id="new_telefone" class="form-control" placeholder="(44) 99999-9999">
            </div>
            <div class="form-group">
              <label for="new_perfil">Perfil <span class="required">*</span></label>
              <select id="new_perfil" class="form-control" required>
                <option value="guarda">Guarda</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <div class="form-group">
              <label for="new_senha">Senha (opcional)</label>
              <input type="text" id="new_senha" class="form-control" placeholder="Deixe em branco para gerar automática">
              <div class="input-hint">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Se não preencher, uma senha temporária será gerada
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button type="button" class="btn-primary" onclick="app.confirmarCriarUsuario()">
            <i class="fas fa-save" style="margin-right:6px;"></i> Criar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cpfInput = document.getElementById("new_cpf");
    if (cpfInput) {
      cpfInput.addEventListener("input", function (e) {
        let value = this.value.replace(/\D/g, "");
        if (value.length > 11) value = value.slice(0, 11);
        let formatted = "";
        if (value.length > 0)
          formatted = value.replace(
            /(\d{3})(\d{3})(\d{3})(\d{2})/,
            "$1.$2.$3-$4",
          );
        if (value.length <= 3) formatted = value;
        else if (value.length <= 6)
          formatted = value.replace(/(\d{3})(\d{1,3})/, "$1.$2");
        else if (value.length <= 9)
          formatted = value.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
        this.value = formatted;
      });
    }
  }

  async confirmarCriarUsuario() {
    const nome = document.getElementById("new_nome")?.value?.trim();
    const cpf = document.getElementById("new_cpf")?.value?.trim();
    const matricula = document.getElementById("new_matricula")?.value?.trim();
    const email = document.getElementById("new_email")?.value?.trim();
    const telefone = document.getElementById("new_telefone")?.value?.trim();
    const perfil = document.getElementById("new_perfil")?.value;
    const senha = document.getElementById("new_senha")?.value?.trim();

    if (!nome || !cpf) {
      this.showToast("Preencha nome e CPF", "warning");
      return;
    }

    const result = await authManager.criarUsuario({
      nome,
      cpf,
      matricula,
      email,
      telefone,
      perfil,
      senha: senha || undefined,
    });

    if (!result.success) {
      this.showToast("Erro ao criar usuário: " + result.error, "error");
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    let msg = "Usuário criado com sucesso!";
    if (result.senha_temporaria) {
      msg += ` Senha temporária: ${result.senha_temporaria}`;
    }
    this.showToast(msg, "success");
    this.loadPageContent("usuarios");
  }

  // ============================================
  // MODAL - EDITAR USUÁRIO
  // ============================================

  async modalEditarUsuario(id) {
    const result = await authManager.listarUsuarios({ search: "" });
    if (!result.success) {
      this.showToast("Erro ao carregar dados do usuário", "error");
      return;
    }
    const user = result.data.find((u) => u.id === id);
    if (!user) {
      this.showToast("Usuário não encontrado", "error");
      return;
    }

    const isSelf = user.id === authManager.getUserId();
    const isSupervisor = authManager.isSupervisor();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-user-edit" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Editar Usuário
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="formEditarUsuario">
            <div class="form-group">
              <label for="edit_nome">Nome Completo <span class="required">*</span></label>
              <input type="text" id="edit_nome" class="form-control" value="${user.nome_completo || ""}" required>
            </div>
            <div class="form-group">
              <label for="edit_cpf">CPF</label>
              <input type="text" id="edit_cpf" class="form-control" value="${user.cpf || ""}" disabled style="opacity:0.7;">
            </div>
            ${
              isSupervisor
                ? `
              <div class="form-group">
                <label for="edit_matricula">Matrícula</label>
                <input type="text" id="edit_matricula" class="form-control" value="${user.matricula || ""}">
              </div>
              <div class="form-group">
                <label for="edit_perfil">Perfil</label>
                <select id="edit_perfil" class="form-control">
                  <option value="guarda" ${user.perfil === "guarda" ? "selected" : ""}>Guarda</option>
                  <option value="supervisor" ${user.perfil === "supervisor" ? "selected" : ""}>Supervisor</option>
                </select>
              </div>
            `
                : `
              <div class="form-group">
                <label>Matrícula</label>
                <input type="text" class="form-control" value="${user.matricula || ""}" disabled style="opacity:0.7;">
              </div>
              <div class="form-group">
                <label>Perfil</label>
                <input type="text" class="form-control" value="${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}" disabled style="opacity:0.7;">
              </div>
            `
            }
            <div class="form-group">
              <label for="edit_email">Email</label>
              <input type="email" id="edit_email" class="form-control" value="${user.email || ""}">
            </div>
            <div class="form-group">
              <label for="edit_telefone">Telefone</label>
              <input type="text" id="edit_telefone" class="form-control" value="${user.telefone || ""}">
            </div>
            ${
              isSupervisor && !isSelf
                ? `
              <div class="form-group">
                <label for="edit_status">Status</label>
                <select id="edit_status" class="form-control">
                  <option value="ativo" ${user.status === "ativo" ? "selected" : ""}>Ativo</option>
                  <option value="inativo" ${user.status === "inativo" ? "selected" : ""}>Inativo</option>
                  <option value="bloqueado" ${user.status === "bloqueado" ? "selected" : ""}>Bloqueado</option>
                </select>
              </div>
            `
                : `
              <div class="form-group">
                <label>Status</label>
                <input type="text" class="form-control" value="${user.status === "ativo" ? "Ativo" : user.status === "inativo" ? "Inativo" : user.status === "bloqueado" ? "Bloqueado" : user.status}" disabled style="opacity:0.7;">
              </div>
            `
            }
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button type="button" class="btn-primary" onclick="app.confirmarEditarUsuario('${id}')">
            <i class="fas fa-save" style="margin-right:6px;"></i> Salvar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async confirmarEditarUsuario(id) {
    const nome = document.getElementById("edit_nome")?.value?.trim();
    const email = document.getElementById("edit_email")?.value?.trim();
    const telefone = document.getElementById("edit_telefone")?.value?.trim();

    if (!nome) {
      this.showToast("Nome é obrigatório", "warning");
      return;
    }

    const dados = { nome_completo: nome };
    if (email !== undefined) dados.email = email;
    if (telefone !== undefined) dados.telefone = telefone;

    if (authManager.isSupervisor() && id !== authManager.getUserId()) {
      const matricula = document
        .getElementById("edit_matricula")
        ?.value?.trim();
      const perfil = document.getElementById("edit_perfil")?.value;
      const status = document.getElementById("edit_status")?.value;
      if (matricula !== undefined) dados.matricula = matricula;
      if (perfil !== undefined) dados.perfil = perfil;
      if (status !== undefined) dados.status = status;
    }

    const result = await authManager.atualizarUsuario(id, dados);
    if (!result.success) {
      this.showToast("Erro ao atualizar: " + result.error, "error");
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    this.showToast("Usuário atualizado com sucesso!", "success");
    if (id === authManager.getUserId()) {
      this.atualizarHeader();
    }
    this.loadPageContent("usuarios");
  }

  // ============================================
  // TOGGLE STATUS - USUÁRIO
  // ============================================

  async toggleStatusUsuario(id) {
    const result = await authManager.listarUsuarios({ search: "" });
    if (!result.success) {
      this.showToast("Erro ao carregar dados", "error");
      return;
    }
    const user = result.data.find((u) => u.id === id);
    if (!user) return;

    const novoStatus = user.status === "ativo" ? "inativo" : "ativo";
    const confirmado = await this.confirmar(
      `Deseja ${novoStatus === "ativo" ? "ativar" : "desativar"} o usuário ${user.nome_completo}?`,
    );
    if (!confirmado) return;

    const res = await authManager.ativarDesativarUsuario(id, novoStatus);
    if (!res.success) {
      this.showToast("Erro: " + res.error, "error");
      return;
    }
    this.showToast(
      `Usuário ${novoStatus === "ativo" ? "ativado" : "desativado"} com sucesso!`,
      "success",
    );
    this.loadPageContent("usuarios");
  }

  // ============================================
  // RESETAR SENHA - USUÁRIO
  // ============================================

  async resetarSenhaUsuario(id) {
    const confirmado = await this.confirmar(
      "Deseja resetar a senha deste usuário? Uma nova senha temporária será gerada.",
    );
    if (!confirmado) return;

    const result = await authManager.resetarSenha(id);
    if (!result.success) {
      this.showToast("Erro ao resetar senha: " + result.error, "error");
      return;
    }
    this.showToast(
      `Senha resetada! Senha temporária: ${result.senha_temporaria}`,
      "success",
    );
    this.loadPageContent("usuarios");
  }

  // ============================================
  // VER LOGS - USUÁRIO
  // ============================================

  async verLogsUsuario(id) {
    const result = await authManager.listarLogsAcesso({
      usuario_id: id,
      limit: 50,
    });
    if (!result.success) {
      this.showToast("Erro ao carregar logs", "error");
      return;
    }

    const logs = result.data || [];

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-history" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Logs de Acesso
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
          ${
            logs.length === 0
              ? `
            <p style="color:var(--cinza-medio);text-align:center;padding:20px;">Nenhum log encontrado</p>
          `
              : `
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:var(--cinza-claro);">
                  <th style="padding:6px 8px;text-align:left;">Data/Hora</th>
                  <th style="padding:6px 8px;text-align:left;">Ação</th>
                  <th style="padding:6px 8px;text-align:left;">IP</th>
                </tr>
              </thead>
              <tbody>
                ${logs
                  .map(
                    (log) => `
                  <tr style="border-bottom:1px solid var(--cinza-claro);">
                    <td style="padding:6px 8px;">${new Date(log.data_hora).toLocaleString("pt-BR")}</td>
                    <td style="padding:6px 8px;">${log.acao || "login"}</td>
                    <td style="padding:6px 8px;">${log.ip || "-"}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          `
          }
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // ============================================
  // RENDERIZAÇÃO - PERFIL
  // ============================================

  async renderPerfil(container) {
    const user = authManager.getUser();
    if (!user) {
      container.innerHTML = `<p>Usuário não encontrado</p>`;
      return;
    }

    const isSupervisor = authManager.isSupervisor();
    const podeEditarMatricula = isSupervisor;

    container.innerHTML = `
            <div class="container">
                <h2 style="color:var(--azul-bandeira);"><i class="fas fa-user" style="margin-right:8px;"></i>Meu Perfil</h2>

                <div class="card" style="margin-bottom:16px;">
                    <div style="text-align:center;padding:16px;">
                        <div class="avatar" style="width:72px;height:72px;border-radius:50%;background:var(--gradiente-principal);color:var(--branco);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;margin:0 auto 12px;">
                            ${user.nome_completo?.charAt(0) || "U"}
                        </div>
                        <h3 style="margin:0;">${user.nome_completo}</h3>
                        <p style="color:var(--cinza-medio);font-size:14px;">${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}</p>
                        <p style="color:var(--cinza-medio);font-size:13px;">
                            <i class="fas fa-id-card"></i> ${user.matricula || "Sem matrícula"}
                        </p>
                    </div>
                </div>

                <form id="formPerfil" style="margin-top:8px;">
                    <div class="form-group">
                        <label for="perfil_nome">Nome Completo <span class="required">*</span></label>
                        <input type="text" id="perfil_nome" class="form-control" value="${user.nome_completo || ""}" required>
                    </div>
                    <div class="form-group">
                        <label for="perfil_cpf">CPF</label>
                        <input type="text" id="perfil_cpf" class="form-control" value="${user.cpf || ""}" disabled style="opacity:0.7;">
                    </div>
                    <div class="form-group">
                        <label for="perfil_matricula">Matrícula</label>
                        <input type="text" id="perfil_matricula" class="form-control" value="${user.matricula || ""}" ${podeEditarMatricula ? "" : 'disabled style="opacity:0.7;"'}>
                    </div>
                    <div class="form-group">
                        <label for="perfil_email">Email</label>
                        <input type="email" id="perfil_email" class="form-control" value="${user.email || ""}">
                    </div>
                    <div class="form-group">
                        <label for="perfil_telefone">Telefone</label>
                        <input type="text" id="perfil_telefone" class="form-control" value="${user.telefone || ""}">
                    </div>
                    <div class="form-group">
                        <label for="perfil_perfil">Perfil</label>
                        <input type="text" id="perfil_perfil" class="form-control" value="${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}" disabled style="opacity:0.7;">
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
                        <button type="button" class="btn-primary" onclick="app.salvarPerfil()" style="flex:1;">
                            <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Alterações
                        </button>
                        <button type="button" class="btn-secondary" onclick="app.modalAlterarSenha()" style="flex:1;">
                            <i class="fas fa-key" style="margin-right:6px;"></i> Alterar Senha
                        </button>
                    </div>
                </form>
            </div>
        `;
  }

  async salvarPerfil() {
    const nome = document.getElementById("perfil_nome")?.value?.trim();
    const email = document.getElementById("perfil_email")?.value?.trim();
    const telefone = document.getElementById("perfil_telefone")?.value?.trim();
    const matricula = document
      .getElementById("perfil_matricula")
      ?.value?.trim();

    if (!nome) {
      this.showToast("Nome é obrigatório", "warning");
      return;
    }

    const dados = { nome_completo: nome };
    if (email !== undefined) dados.email = email;
    if (telefone !== undefined) dados.telefone = telefone;
    if (authManager.isSupervisor() && matricula !== undefined) {
      dados.matricula = matricula;
    }

    const result = await authManager.atualizarUsuario(
      authManager.getUserId(),
      dados,
    );
    if (!result.success) {
      this.showToast("Erro ao atualizar perfil: " + result.error, "error");
      return;
    }

    this.showToast("Perfil atualizado com sucesso!", "success");
    this.atualizarHeader();
    this.loadPageContent("perfil");
  }

  // ============================================
  // MODAL - ALTERAR SENHA
  // ============================================

  modalAlterarSenha() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="title">
            <i class="fas fa-key" style="margin-right:8px;color:var(--azul-bandeira);"></i>
            Alterar Senha
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="formAlterarSenha">
            <div class="form-group">
              <label for="senha_atual">Senha Atual <span class="required">*</span></label>
              <input type="password" id="senha_atual" class="form-control" placeholder="Digite sua senha atual" required>
            </div>
            <div class="form-group">
              <label for="nova_senha">Nova Senha <span class="required">*</span></label>
              <input type="password" id="nova_senha" class="form-control" placeholder="Nova senha" required minlength="6">
            </div>
            <div class="form-group">
              <label for="confirmar_senha">Confirmar Nova Senha <span class="required">*</span></label>
              <input type="password" id="confirmar_senha" class="form-control" placeholder="Confirme a nova senha" required>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
          <button type="button" class="btn-primary" onclick="app.confirmarAlterarSenha()">
            <i class="fas fa-check" style="margin-right:6px;"></i> Alterar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async confirmarAlterarSenha() {
    const senhaAtual = document.getElementById("senha_atual")?.value;
    const novaSenha = document.getElementById("nova_senha")?.value;
    const confirmarSenha = document.getElementById("confirmar_senha")?.value;

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      this.showToast("Preencha todos os campos", "warning");
      return;
    }

    if (novaSenha.length < 6) {
      this.showToast(
        "A nova senha deve ter pelo menos 6 caracteres",
        "warning",
      );
      return;
    }

    if (novaSenha !== confirmarSenha) {
      this.showToast("As senhas não coincidem", "warning");
      return;
    }

    const user = authManager.getUser();
    const client = supabaseClient.getClient();
    if (!client) {
      this.showToast("Erro ao conectar", "error");
      return;
    }

    const { data: senhaValida } = await client.rpc("verificar_senha", {
      p_cpf: user.cpf,
      p_senha: senhaAtual,
    });

    if (!senhaValida) {
      this.showToast("Senha atual incorreta", "warning");
      return;
    }

    const { data: hashData } = await client.rpc("criar_hash_senha", {
      p_senha: novaSenha,
    });

    const result = await authManager.atualizarUsuario(user.id, {
      senha_hash: hashData,
    });

    if (!result.success) {
      this.showToast("Erro ao alterar senha: " + result.error, "error");
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    this.showToast("Senha alterada com sucesso!", "success");
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
    authManager.onAuthChange((event, data) => {
      console.log("🔄 Evento de autenticação:", event);
      if (event === "login") {
        this.atualizarHeader();
        this.carregarRascunho();
        this.route();
      } else if (event === "logout") {
        this.route();
      }
    });

    document
      .getElementById("menuToggle")
      ?.addEventListener("click", () => this.toggleMenu());
    document
      .getElementById("menuOverlay")
      ?.addEventListener("click", () => this.closeMenu());

    document.querySelectorAll(".menu-item[data-page]").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (!authManager.isLoggedIn()) {
          this.closeMenu();
          this.navigateTo("login");
          return;
        }

        const page = item.dataset.page;
        if (
          this.currentPage === "nova-ocorrencia" &&
          this.alteracoesNaoSalvas
        ) {
          e.preventDefault();
          this.paginaDestino = page;
          this.paramsDestino = null;
          this.perguntarSalvarRascunho(page);
        } else {
          this.navigateTo(page);
        }
        this.closeMenu();
      });
    });

    document
      .getElementById("btnLogout")
      ?.addEventListener("click", async () => {
        this.closeMenu();

        if (
          this.currentPage === "nova-ocorrencia" &&
          this.alteracoesNaoSalvas
        ) {
          this.paginaDestino = "login";
          this.paramsDestino = null;
          this.perguntarSalvarRascunho("login", async () => {
            await authManager.logout();
            this.route();
            this.showToast("Logout realizado", "info");
          });
        } else {
          await authManager.logout();
          this.route();
          this.showToast("Logout realizado", "info");
        }
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

    window.addEventListener("beforeunload", (e) => {
      if (this.currentPage === "nova-ocorrencia" && this.alteracoesNaoSalvas) {
        e.preventDefault();
        e.returnValue =
          "Você tem alterações não salvas. Deseja realmente sair?";
        return e.returnValue;
      }
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

      this.atualizarHeader();
      await this.carregarRascunho();

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
