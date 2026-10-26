/**
 * MÓDULO NOVA OCORRÊNCIA - Formulário de Registro de Ocorrência
 * Guarda Municipal de Pitangueiras - PR
 *
 * Layout com:
 * - Tela de escolha: Modo Rápido vs Modo Completo
 * - Modo Rápido: 5 campos essenciais + fotos
 * - Modo Completo: Formulário completo com 7 etapas
 * - Completar BO Rápido: Adicionar dados faltantes
 * - Rascunho automático
 * - Geolocalização
 * - Hash pericial na finalização
 * - Etapas do Modo Completo organizadas por tarefa: equipe, envolvidos, relato, evidências e revisão
 * - Assinatura manuscrita opcional capturada no cadastro de cada envolvido
 * - Equipe GM separada das pessoas relacionadas ao fato, com papel de apoio editável
 * - Campos complementares da solicitação recolhidos até serem necessários
 * - Salvamento de rascunho com confirmação de estado e preservação dos vínculos
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), utils, ui
 */

// ============================================
// CONSTANTES
// ============================================

const TIPOS_OCORRENCIA = [
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

const FORMAS_SOLICITACAO = [
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

const TIPOS_ENVOLVIDO = [
  { value: "autor", label: "Autor" },
  { value: "vitima", label: "Vítima" },
  { value: "testemunha", label: "Testemunha" },
  { value: "solicitante", label: "Solicitante" },
  { value: "outro", label: "Outro" },
];

const TIPOS_ASSINATURA = [
  { value: "autor", label: "Autor" },
  { value: "vitima", label: "Vítima" },
  { value: "testemunha", label: "Testemunha" },
  { value: "solicitante", label: "Solicitante" },
];

const MODE_RAPIDO = "rapido";
const MODE_COMPLETO = "completo";
const MODE_COMPLETAR = "completar";

// 🔥 ALTERADO: 7 etapas
const TOTAL_ETAPAS = 7;

// ============================================
// FUNÇÃO AUXILIAR - OBTER DATA/HORA LOCAL PARA INPUT
// ============================================

/**
 * 🔥 CORRIGIDO: Obtém a data/hora atual do dispositivo no formato datetime-local
 * SEM ajuste de fuso - usa exatamente o que o dispositivo mostra
 * @returns {string} Data/hora no formato YYYY-MM-DDTHH:mm
 */
function obterDataHoraLocalInput() {
  const agora = new Date();
  const year = agora.getFullYear();
  const month = String(agora.getMonth() + 1).padStart(2, "0");
  const day = String(agora.getDate()).padStart(2, "0");
  const hours = String(agora.getHours()).padStart(2, "0");
  const minutes = String(agora.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  modo: MODE_COMPLETO,
  id: null,
  isCompletando: false,
  etapa: 1,
  dados: {
    // Etapa 1 - Origem da Solicitação
    forma_solicitacao: "",
    nome_solicitante: "",
    cpf_solicitante: "",
    rg_solicitante: "",
    telefone_solicitante: "",
    endereco_solicitante: "",
    codigo_municipal: "",
    complemento: "",
    bairro_solicitante: "",
    identificacao_adicional: "",
    // Etapa 2 - Dados da Ocorrência
    codigo_operacional: "",
    local_ocorrencia: "",
    rodovia: "",
    bairro_ocorrencia: "",
    referencia: "",
    data_hora_inicio: "",
    // 🔥 REMOVIDO: data_hora_encerramento da etapa 2 (movido para etapa 7)
    tipo_ocorrencia: "",
    // Etapa 3 - Equipe operacional e envolvidos civis
    guardasParticipantes: [],
    envolvidos: [],
    // Etapa 4 - Observações
    observacoes: "",
    // Etapa 5 - Anexos
    anexos: [],
    // Etapa 6 - Assinaturas
    assinaturas: [],
    // 🔥 NOVO: Mapeamento de envolvidos para referência
    envolvidosMap: {},
    // Modo de criação
    modo_criacao: MODE_COMPLETO,
    // 🔥 NOVO: Data/hora encerramento (agora na etapa 7)
    data_hora_encerramento: "",
    // 🔥 NOVO: data_hora_finalizacao (preenchido automaticamente)
    data_hora_finalizacao: null,
  },
  dadosOriginais: null,
  audioRecorder: null,
  audioChunks: [],
  isRecording: false,
  sttInicializado: false,
  // P3: catálogo de guardas ativos para seleção rápida
  guardasDisponiveis: [],
  statusRascunho: "nao_salvo",
  // 🔥 NOVO: Estado para o canvas de assinatura
  canvasAssinatura: null,
  assinaturaAtual: null,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  // 🔥 NOVO: Estado para controle de assinaturas
  envolvidoSelecionado: null,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export async function renderNovaOcorrencia(container, appInstance) {
  // Verificar autenticação
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Verificar se é para completar um BO Rápido
  const params = appInstance.currentParams || {};
  const id = params.id;
  const isCompletando = params.action === "completar";

  // Verificar se tem dados do rascunho
  if (appInstance.dadosRascunho && !isCompletando) {
    estado.id = appInstance.rascunhoId;
    estado.statusRascunho = "pendente";
    estado.dados = appInstance.dadosRascunho;
    // 🔥 Garantir que assinaturas exista
    if (!estado.dados.assinaturas) {
      estado.dados.assinaturas = [];
    }
    if (!estado.dados.envolvidosMap) {
      estado.dados.envolvidosMap = {};
    }
    if (!estado.dados.guardasParticipantes) {
      estado.dados.guardasParticipantes = [];
    }
    estado.modo = MODE_COMPLETO;
    estado.isCompletando = false;
    estado.etapa = 1;
    appInstance.alteracoesNaoSalvas = true;
    console.log("📂 Rascunho carregado para edição:", estado.id);
  } else if (isCompletando && id) {
    await carregarParaCompletar(id, appInstance);
  } else {
    resetarEstado();
  }

  // P3: carregar guardas ativos antes de renderizar o seletor de equipe
  await carregarGuardasDisponiveis(appInstance);

  // Renderizar escolha de modo
  renderizarEscolhaModo(container, appInstance);
}

// ============================================
// RESETAR ESTADO
// ============================================

function resetarEstado() {
  estado.id = null;
  estado.statusRascunho = "nao_salvo";
  estado.isCompletando = false;
  estado.etapa = 1;
  estado.modo = MODE_COMPLETO;
  estado.dados = {
    forma_solicitacao: "",
    nome_solicitante: "",
    cpf_solicitante: "",
    rg_solicitante: "",
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
    guardasParticipantes: [],
    envolvidos: [],
    observacoes: "",
    anexos: [],
    assinaturas: [],
    envolvidosMap: {},
    modo_criacao: MODE_COMPLETO,
    data_hora_finalizacao: null,
  };
  estado.dadosOriginais = null;
  estado.sttInicializado = false;
  estado.canvasAssinatura = null;
  estado.assinaturaAtual = null;
  estado.envolvidoSelecionado = null;
  estado.guardasDisponiveis = [];
}

// ============================================
// CARREGAR PARA COMPLETAR
// ============================================

async function carregarParaCompletar(id, appInstance) {
  try {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Ocorrência não encontrada", "error");
      return;
    }

    const occ = result.data;

    if (occ.modo_criacao !== MODE_RAPIDO) {
      appInstance.showToast(
        "Esta ocorrência não está no modo Rápido",
        "warning",
      );
      return;
    }

    if (occ.completado_em) {
      appInstance.showToast("Esta ocorrência já foi completada", "warning");
      return;
    }

    estado.id = id;
    estado.isCompletando = true;
    estado.modo = MODE_COMPLETAR;

    const envResult = await ocorrenciaManager.listarEnvolvidos(id);
    const guardasResult = await ocorrenciaManager.listarGuardas(id);
    const anexosResult = await ocorrenciaManager.listarAnexos(id);

    estado.dados = {
      forma_solicitacao: occ.forma_solicitacao || "",
      nome_solicitante: occ.nome_solicitante || "",
      cpf_solicitante: occ.cpf_solicitante || "",
      rg_solicitante: occ.rg_solicitante || "",
      telefone_solicitante: occ.telefone_solicitante || "",
      endereco_solicitante: occ.endereco_solicitante || "",
      codigo_municipal: occ.codigo_municipal || "",
      complemento: occ.complemento || "",
      bairro_solicitante: occ.bairro_solicitante || "",
      identificacao_adicional: occ.identificacao_adicional || "",
      codigo_operacional: occ.codigo_operacional || "",
      local_ocorrencia: occ.local_ocorrencia || "",
      rodovia: occ.rodovia || "",
      bairro_ocorrencia: occ.bairro_ocorrencia || "",
      referencia: occ.referencia || "",
      data_hora_inicio: occ.data_hora_inicio || "",
      data_hora_encerramento: occ.data_hora_encerramento || "",
      tipo_ocorrencia: occ.tipo_ocorrencia || "",
      guardasParticipantes: guardasResult.success ? guardasResult.data : [],
      envolvidos: envResult.success ? envResult.data : [],
      observacoes: occ.observacoes || "",
      anexos: anexosResult.success ? anexosResult.data : [],
      assinaturas: occ.assinaturas || [],
      envolvidosMap: {},
      modo_criacao: occ.modo_criacao || MODE_RAPIDO,
      data_hora_finalizacao: occ.data_hora_finalizacao || null,
    };

    // 🔥 Construir mapa de envolvidos
    estado.dados.envolvidos.forEach((env) => {
      estado.dados.envolvidosMap[env.id] = env;
    });

    estado.dadosOriginais = JSON.parse(JSON.stringify(estado.dados));
    appInstance.alteracoesNaoSalvas = true;

    console.log("📂 BO Rápido carregado para completar:", id);
  } catch (error) {
    console.error("Erro ao carregar para completar:", error);
    appInstance.showToast("Erro ao carregar dados", "error");
  }
}

// ============================================
// P3 — EQUIPE OPERACIONAL DA OCORRÊNCIA
// ============================================

function escaparHtmlEquipe(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function avatarEquipeMarkup(user, extraClass = "") {
  const nome = user?.nome_completo || user?.nome_snapshot || "GM";
  let foto = "";
  try { const cadastro = (estado.guardasDisponiveis || []).find((item) => item.id === user?.guarda_id); const parsed = new URL(String(user?.foto_url || user?.foto_url_snapshot || cadastro?.foto_url || "")); if (["http:", "https:"].includes(parsed.protocol)) foto = parsed.href; } catch { /* fallback */ }
  const inicial = escaparHtmlEquipe(nome.trim().charAt(0).toUpperCase() || "G");
  return `<span class="bo-team-avatar ${extraClass}">${foto ? `<img class="bo-team-avatar-image" src="${escaparHtmlEquipe(foto)}" alt="Foto de ${escaparHtmlEquipe(nome)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="bo-team-avatar-fallback" hidden>${inicial}</span>` : `<span class="bo-team-avatar-fallback">${inicial}</span>`}</span>`;
}

async function carregarGuardasDisponiveis(appInstance) {
  try {
    const result = await ocorrenciaManager.listarGuardasDisponiveis();
    estado.guardasDisponiveis = result.success ? result.data : [];
    if (!result.success) {
      console.warn("P3: não foi possível carregar guardas ativos:", result.error);
    }
  } catch (error) {
    estado.guardasDisponiveis = [];
    console.warn("P3: erro ao carregar guardas ativos:", error);
  }
}

function garantirResponsavelEquipe(dados) {
  const user = authManager.getUser?.();
  const equipe = (dados.guardasParticipantes || []).filter(
    (g) => g && g.esta_ativo !== false && g.guarda_id !== user?.id,
  );
  if (user?.id) {
    equipe.unshift({
      guarda_id: user.id,
      papel: "responsavel",
      ordem: 1,
      nome_snapshot: user.nome_completo || "Guarda responsável",
      matricula_snapshot: user.matricula || "",
      perfil_snapshot: user.perfil || "guarda",
      esta_ativo: true,
      selecionado_por: user.id,
      foto_url_snapshot: user.foto_url || "",
    });
    dados.guardasParticipantes = equipe;
  } else {
    dados.guardasParticipantes = equipe;
  }
  return equipe;
}

function equipeTemMinima(equipe) {
  const ativas = (equipe || []).filter((g) => g && g.esta_ativo !== false && g.guarda_id);
  const ids = new Set(ativas.map((g) => g.guarda_id));
  return (
    ativas.some((g) => g.papel === "responsavel") &&
    ativas.some((g) => g.papel === "acompanhante") &&
    ids.size >= 2
  );
}

function rotuloPapelEquipe(papel) {
  if (papel === "responsavel") return "Responsável pelo registro";
  if (papel === "acompanhante") return "GM de apoio";
  return "GM de apoio";
}

function renderEquipeGuardas(dados, modo = "completo") {
  const equipe = garantirResponsavelEquipe(dados);
  const responsavel = equipe.find((g) => g.papel === "responsavel");
  const integrantes = equipe
    .filter((g) => g.papel !== "responsavel" && g.esta_ativo !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const disponiveis = (estado.guardasDisponiveis || []).filter(
    (g) => g.id !== responsavel?.guarda_id && g.status === "ativo" && ["guarda", "supervisor"].includes(g.perfil),
  );
  const statusEquipe = equipeTemMinima(equipe);
  const listaIntegrantes = integrantes.length
    ? `<div class="bo-team-members" aria-label="GMs selecionados">${integrantes.map((g) => {
        const nome = g.nome_snapshot || g.nome_completo || "GM cadastrado";
        const papelControle = modo === "completo" ? `<label class="bo-team-role-control"><span>Função</span><select aria-label="Papel operacional de ${escaparHtmlEquipe(nome)}" data-guarda-id="${escaparHtmlEquipe(g.guarda_id)}" onchange="window._novaOcorrenciaAlterarPapelGuarda(this.dataset.guardaId,this.value)"><option value="acompanhante" ${g.papel === "acompanhante" ? "selected" : ""}>GM de apoio</option><option value="apoio" ${g.papel === "apoio" ? "selected" : ""}>Apoio</option></select></label>` : "";
        return `<div class="bo-team-member">${avatarEquipeMarkup(g)}<span class="bo-team-member-copy"><strong>${escaparHtmlEquipe(nome)}</strong><small>${rotuloPapelEquipe(g.papel)}${g.matricula_snapshot || g.matricula ? ` · Mat. ${escaparHtmlEquipe(g.matricula_snapshot || g.matricula)}` : ""}</small></span>${papelControle}<button type="button" class="bo-team-remove" data-guarda-id="${escaparHtmlEquipe(g.guarda_id)}" aria-label="Remover ${escaparHtmlEquipe(nome)} da equipe" onclick="window._novaOcorrenciaRemoverGuarda(this.dataset.guardaId)"><i class="fas fa-times"></i></button></div>`;
      }).join("")}</div>`
    : `<div class="bo-team-empty">Ainda falta selecionar o GM de apoio da ocorrência.</div>`;

  return `
    <section class="bo-team-card ${statusEquipe ? "is-complete" : "is-pending"}" aria-label="Equipe operacional da ocorrência">
      <div class="bo-team-heading">
        <span class="bo-team-icon"><i class="fas fa-user-shield" aria-hidden="true"></i></span>
        <div><span class="bo-section-kicker">EQUIPE OPERACIONAL</span><h3>GMs que atuaram no atendimento</h3><p>Equipe registrada separadamente das pessoas civis envolvidas.</p></div>
      </div>
      <div class="bo-team-lead">
        ${avatarEquipeMarkup(responsavel, "bo-team-avatar-lead")}
        <span class="bo-team-member-copy"><small>GM que registra o BO</small><strong>${escaparHtmlEquipe(responsavel?.nome_snapshot || "Guarda logado")}${responsavel?.matricula_snapshot ? ` · Mat. ${escaparHtmlEquipe(responsavel.matricula_snapshot)}` : ""}</strong></span>
        <span class="bo-team-lock" aria-label="Responsável definido pelo usuário conectado"><i class="fas fa-lock" aria-hidden="true"></i></span>
      </div>
      ${listaIntegrantes}
      <div class="bo-team-search">
        <label for="buscaGuardaEquipe"><i class="fas fa-search" aria-hidden="true"></i> Adicionar GM cadastrado</label>
        <div class="bo-team-search-control"><input id="buscaGuardaEquipe" type="search" autocomplete="off" placeholder="Digite nome ou matrícula" aria-controls="listaSugestoesGuarda" aria-autocomplete="list" oninput="window._novaOcorrenciaBuscarGuardas(this.value)"><span aria-hidden="true"><i class="fas fa-keyboard"></i></span></div>
        <div id="listaSugestoesGuarda" class="bo-team-suggestions" role="listbox" aria-live="polite">Digite ao menos 2 caracteres para buscar entre ${disponiveis.length} GMs ativos.</div>
        <p class="bo-team-hint">${modo === "completo" ? "O primeiro GM entra como GM de apoio; você pode trocar a função na própria lista. Mantenha pelo menos um GM de apoio. Selecione somente quem atuou nesta ocorrência." : "O primeiro GM adicionado será o GM de apoio obrigatório; os demais ficam na equipe. Selecione somente quem atuou nesta ocorrência."}</p>
      </div>
      <div class="bo-team-status ${statusEquipe ? "is-complete" : "is-pending"}" role="status"><i class="fas ${statusEquipe ? "fa-check-circle" : "fa-exclamation-circle"}" aria-hidden="true"></i><span>${statusEquipe ? `${equipe.filter((g) => g.esta_ativo !== false).length} GMs na equipe. Mínimo atendido.` : "Selecione pelo menos um GM de apoio além do responsável."}</span></div>
    </section>
  `;
}

function normalizarBuscaGuarda(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function buscarGuardasEquipe(termo) {
  const target = document.getElementById("listaSugestoesGuarda");
  if (!target) return;
  const query = normalizarBuscaGuarda(termo);
  if (query.length < 2) {
    target.innerHTML = "Digite ao menos 2 caracteres para buscar os GMs cadastrados.";
    return;
  }
  const selecionados = new Set((estado.dados.guardasParticipantes || []).filter((g) => g && g.esta_ativo !== false).map((g) => g.guarda_id));
  const matches = (estado.guardasDisponiveis || []).filter((g) => {
    if (!g || g.status !== "ativo" || !["guarda", "supervisor"].includes(g.perfil) || selecionados.has(g.id)) return false;
    return normalizarBuscaGuarda(`${g.nome_completo || ""} ${g.matricula || ""}`).includes(query);
  }).slice(0, 8);
  target.innerHTML = matches.length
    ? matches.map((g) => `<button type="button" class="bo-team-suggestion" role="option" data-guarda-id="${escaparHtmlEquipe(g.id)}" onclick="window._novaOcorrenciaAdicionarGuarda(this.dataset.guardaId)">${avatarEquipeMarkup(g)}<span><strong>${escaparHtmlEquipe(g.nome_completo)}</strong><small>${g.matricula ? `Matrícula ${escaparHtmlEquipe(g.matricula)}` : (g.perfil === "supervisor" ? "Supervisor cadastrado" : "Guarda cadastrado")}</small></span><i class="fas fa-plus-circle" aria-hidden="true"></i></button>`).join("")
    : `<span class="bo-team-no-results">Nenhum GM ativo encontrado com esse nome ou matrícula.</span>`;
}

function selecionarGuardaEquipe(guardaId, container, appInstance) {
  const guarda = (estado.guardasDisponiveis || []).find((g) => g.id === guardaId && g.status === "ativo" && ["guarda", "supervisor"].includes(g.perfil));
  if (!guarda) {
    appInstance.showToast("Selecione um GM cadastrado e ativo", "warning");
    return;
  }
  const equipe = garantirResponsavelEquipe(estado.dados);
  if (equipe.some((g) => g.guarda_id === guarda.id && g.esta_ativo !== false)) return;
  const acompanhanteExiste = equipe.some((g) => g.papel === "acompanhante" && g.esta_ativo !== false);
  estado.dados.guardasParticipantes.push({
    guarda_id: guarda.id,
    papel: acompanhanteExiste ? "apoio" : "acompanhante",
    ordem: equipe.filter((g) => g.esta_ativo !== false).length + 1,
    nome_snapshot: guarda.nome_completo,
    matricula_snapshot: guarda.matricula || "",
    perfil_snapshot: guarda.perfil || "guarda",
    esta_ativo: true,
    selecionado_por: authManager.getUserId?.(),
    foto_url_snapshot: guarda.foto_url || "",
  });
  if (estado.modo === MODE_COMPLETO && !estado.isCompletando) marcarRascunhoPendente(appInstance);
  else appInstance.alteracoesNaoSalvas = true;
  renderizarEquipeAtual(container, appInstance);
}

function removerGuardaEquipe(guardaId, container, appInstance) {
  const equipe = garantirResponsavelEquipe(estado.dados);
  if (equipe.some((g) => g.guarda_id === guardaId && g.papel === "responsavel")) {
    appInstance.showToast("O responsável pelo registro não pode ser removido da equipe", "warning");
    return;
  }
  estado.dados.guardasParticipantes = equipe.filter((g) => g.guarda_id !== guardaId);
  const semAcompanhante = !estado.dados.guardasParticipantes.some((g) => g.papel === "acompanhante" && g.esta_ativo !== false);
  if (semAcompanhante) {
    const proximo = estado.dados.guardasParticipantes.find((g) => g.papel === "apoio" && g.esta_ativo !== false);
    if (proximo) proximo.papel = "acompanhante";
  }
  estado.dados.guardasParticipantes.forEach((g, index) => { g.ordem = index + 1; });
  if (estado.modo === MODE_COMPLETO && !estado.isCompletando) marcarRascunhoPendente(appInstance);
  else appInstance.alteracoesNaoSalvas = true;
  renderizarEquipeAtual(container, appInstance);
}

function alterarPapelGuarda(guardaId, papel, container, appInstance) {
  if (!["acompanhante", "apoio"].includes(papel)) return;
  const equipe = garantirResponsavelEquipe(estado.dados);
  const alvo = equipe.find((g) => g.guarda_id === guardaId && g.papel !== "responsavel" && g.esta_ativo !== false);
  if (!alvo) return;
  if (papel === "apoio" && alvo.papel === "acompanhante" && !equipe.some((g) => g.guarda_id !== guardaId && g.papel === "acompanhante" && g.esta_ativo !== false)) {
    appInstance.showToast("Mantenha pelo menos um GM de apoio", "warning");
    renderizarFormularioCompleto(container, appInstance);
    return;
  }
  if (papel === "acompanhante") {
    equipe.forEach((g) => { if (g.guarda_id !== guardaId && g.papel === "acompanhante") g.papel = "apoio"; });
  }
  alvo.papel = papel;
  estado.statusRascunho = (appInstance.rascunhoId || estado.id) ? "pendente" : "nao_salvo";
  marcarRascunhoPendente(appInstance);
  renderizarFormularioCompleto(container, appInstance);
}

function renderizarEquipeAtual(container, appInstance) {
  if (estado.isCompletando) {
    renderizarFormularioCompletar(container, appInstance);
  } else if (estado.modo === MODE_RAPIDO) {
    sincronizarDadosRapido(appInstance, false);
    renderizarFormularioRapido(container, appInstance);
  } else {
    renderizarFormularioCompleto(container, appInstance);
  }
}

function selecionarGuardaAcompanhante(guardaId, container, appInstance) {
  const dados = estado.dados;
  const equipe = garantirResponsavelEquipe(dados);
  const responsavel = equipe.find((g) => g.papel === "responsavel");

  if (!guardaId) {
    dados.guardasParticipantes = equipe.filter((g) => g.papel !== "acompanhante");
  } else {
    const guarda = (estado.guardasDisponiveis || []).find((g) => g.id === guardaId);
    if (!guarda || guarda.id === responsavel?.guarda_id) {
      appInstance.showToast("Selecione um GM de apoio válido", "warning");
      return;
    }
    dados.guardasParticipantes = equipe
      .filter((g) => g.papel !== "acompanhante")
      .concat({
        guarda_id: guarda.id,
        papel: "acompanhante",
        ordem: 2,
        nome_snapshot: guarda.nome_completo,
        matricula_snapshot: guarda.matricula || "",
        perfil_snapshot: guarda.perfil || "guarda",
        esta_ativo: true,
        selecionado_por: authManager.getUserId?.(),
      });
  }
  appInstance.alteracoesNaoSalvas = true;
  renderizarEquipeAtual(container, appInstance);
}

function removerGuardaAcompanhante(container, appInstance) {
  estado.dados.guardasParticipantes = garantirResponsavelEquipe(estado.dados).filter(
    (g) => g.papel !== "acompanhante",
  );
  appInstance.alteracoesNaoSalvas = true;
  renderizarEquipeAtual(container, appInstance);
}

// ============================================
// RENDERIZAR ESCOLHA DE MODO
// ============================================

function renderizarEscolhaModo(container, appInstance) {
  if (estado.isCompletando) {
    renderizarFormularioCompletar(container, appInstance);
    return;
  }

  if (estado.id && estado.dados && Object.keys(estado.dados).length > 0) {
    estado.modo = MODE_COMPLETO;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  const html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-plus-circle" style="margin-right:8px;"></i>
          Nova Ocorrência
        </h2>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <p style="color:var(--cinza-medio);font-size:13px;margin-bottom:16px;">
        Como deseja registrar esta ocorrência?
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div onclick="window._novaOcorrenciaSelecionarModo('rapido')" 
          style="background:var(--branco);border-radius:var(--border-radius);padding:16px;box-shadow:var(--sombra-suave);cursor:pointer;border:2px solid var(--cinza-claro);transition:all 0.2s ease;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">⚡</div>
          <h3 style="font-size:14px;font-weight:700;color:var(--cinza-escuro);margin:0 0 4px 0;">Modo Rápido</h3>
          <p style="font-size:12px;color:var(--cinza-medio);margin:0;">Apenas campos essenciais<br>+ Fotos (ilimitadas)</p>
          <div style="margin-top:8px;font-size:10px;color:var(--azul-bandeira);font-weight:600;">⏱️ ~2 minutos</div>
        </div>

        <div onclick="window._novaOcorrenciaSelecionarModo('completo')" 
          style="background:var(--branco);border-radius:var(--border-radius);padding:16px;box-shadow:var(--sombra-suave);cursor:pointer;border:2px solid var(--cinza-claro);transition:all 0.2s ease;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">📋</div>
          <h3 style="font-size:14px;font-weight:700;color:var(--cinza-escuro);margin:0 0 4px 0;">Modo Completo</h3>
          <p style="font-size:12px;color:var(--cinza-medio);margin:0;">7 etapas organizadas<br>+ Envolvidos + Assinaturas integradas<br>+ Fotos (ilimitadas)</p>
          <div style="margin-top:8px;font-size:10px;color:var(--azul-bandeira);font-weight:600;">⏱️ ~5-8 minutos</div>
        </div>
      </div>

      <div style="margin-top:16px;padding:12px;background:var(--azul-muito-claro);border-radius:var(--border-radius);border-left:4px solid var(--azul-bandeira);">
        <p style="font-size:12px;color:var(--cinza-escuro);margin:0;">
          <i class="fas fa-info-circle" style="color:var(--azul-bandeira);margin-right:6px;"></i>
          <strong>Dica:</strong> Use o modo Rápido para emergências e o modo Completo para registros detalhados.
          Você pode completar um BO Rápido depois. Ambos os modos permitem fotos ilimitadas.
        </p>
      </div>
    </div>
  `;

  container.innerHTML = html;

  window._novaOcorrenciaSelecionarModo = (modo) => {
    estado.modo = modo;
    if (modo === MODE_RAPIDO) {
      renderizarFormularioRapido(container, appInstance);
    } else {
      renderizarFormularioCompleto(container, appInstance);
    }
  };

  window._novaOcorrenciaVoltarModos = async () => {
    const dadosAtuais = estado.dados || {};
    const temConteudo = Object.entries(dadosAtuais).some(([chave, valor]) => {
      if (chave === "guardasParticipantes") return Array.isArray(valor) && valor.some((g) => g && g.papel !== "responsavel");
      if (["envolvidos", "anexos", "assinaturas"].includes(chave)) return Array.isArray(valor) && valor.length > 0;
      return chave !== "modo_criacao" && typeof valor === "string" && valor.trim() !== "";
    });
    if (temConteudo) {
      const confirmado = await appInstance.confirmar("Voltar à escolha de modo? O conteúdo ainda não salvo será descartado.");
      if (!confirmado) return;
    }
    resetarEstado();
    renderizarEscolhaModo(container, appInstance);
  };
}

// ============================================
// RENDERIZAR FORMULÁRIO RÁPIDO
// ============================================

function sincronizarDadosRapido(appInstance, marcarAlteracao = false) {
  estado.dados = estado.dados || {};
  const obterValor = (id) => document.getElementById(id)?.value ?? "";
  estado.dados.tipo_ocorrencia = obterValor("rapido_tipo_ocorrencia");
  estado.dados.local_ocorrencia = obterValor("rapido_local_ocorrencia").trim();
  estado.dados.data_hora_inicio = obterValor("rapido_data_hora");
  estado.dados.nome_solicitante = obterValor("rapido_nome_solicitante").trim() || null;
  estado.dados.observacoes = obterValor("rapido_observacoes").trim();
  if (marcarAlteracao && appInstance) appInstance.alteracoesNaoSalvas = true;
  return estado.dados;
}

function renderizarFormularioRapido(container, appInstance) {
  const hoje = obterDataHoraLocalInput();
  const anexos = Array.isArray(estado.dados.anexos) ? estado.dados.anexos : [];
  const solicitante = String(estado.dados.nome_solicitante || "");
  const fotosMarkup = anexos.length
    ? anexos.map((foto, index) => `
        <figure class="quick-photo-item">
          ${foto.url_thumb
            ? `<img src="${escaparHtmlEquipe(foto.url_thumb)}" alt="Foto de apoio ${index + 1}" loading="lazy">`
            : `<div class="quick-photo-placeholder"><i class="fas fa-image" aria-hidden="true"></i></div>`}
          <figcaption title="${escaparHtmlEquipe(foto.nome || `Foto ${index + 1}`)}">${escaparHtmlEquipe(foto.nome || `Foto ${index + 1}`)}</figcaption>
          <button type="button" class="quick-photo-remove" data-index="${index}" aria-label="Remover ${escaparHtmlEquipe(foto.nome || `foto ${index + 1}`)}" onclick="window._novaOcorrenciaRemoverAnexoRapido(this.dataset.index)"><i class="fas fa-times" aria-hidden="true"></i></button>
        </figure>`).join("")
    : `<p class="quick-photo-empty"><i class="fas fa-camera" aria-hidden="true"></i> Nenhuma foto selecionada.</p>`;

  const html = `
    <main class="container quick-bo-shell">
      <header class="quick-bo-heading">
        <div>
          <span class="quick-bo-kicker">REGISTRO ESSENCIAL</span>
          <h2><i class="fas fa-bolt" aria-hidden="true"></i> BO Rápido</h2>
          <p>Registre o essencial agora; os detalhes podem ser complementados depois.</p>
        </div>
        <button type="button" onclick="window._novaOcorrenciaVoltarModos()" class="quick-bo-back" aria-label="Voltar à escolha do modo">
          <i class="fas fa-arrow-left" aria-hidden="true"></i><span>Voltar</span>
        </button>
      </header>

      <form id="formOcorrenciaRapida" class="quick-bo-form" onsubmit="event.preventDefault();">
        <section class="quick-bo-section" aria-labelledby="quick-bo-fact-title">
          <div class="quick-bo-section-heading">
            <span class="quick-bo-section-icon"><i class="fas fa-location-dot" aria-hidden="true"></i></span>
            <div><h3 id="quick-bo-fact-title">Dados do fato</h3><p>O que aconteceu, onde e quando.</p></div>
          </div>
          <div class="quick-bo-field">
            <label for="rapido_tipo_ocorrencia">Tipo de ocorrência <span class="required">*</span></label>
            <select id="rapido_tipo_ocorrencia" class="form-control" required>
              <option value="">Selecione o tipo...</option>
              ${TIPOS_OCORRENCIA.map((op) => `<option value="${escaparHtmlEquipe(op.value)}" ${estado.dados.tipo_ocorrencia === op.value ? "selected" : ""}>${escaparHtmlEquipe(op.label)}</option>`).join("")}
            </select>
          </div>
          <div class="quick-bo-field">
            <label for="rapido_local_ocorrencia">Local da ocorrência <span class="required">*</span></label>
            <input type="text" id="rapido_local_ocorrencia" class="form-control" placeholder="Rua, número e bairro, se souber" autocomplete="street-address" required value="${escaparHtmlEquipe(estado.dados.local_ocorrencia || "")}">
          </div>
          <div class="quick-bo-field">
            <label for="rapido_data_hora">Data e hora do fato <span class="required">*</span></label>
            <div class="quick-bo-date-row">
              <input type="datetime-local" id="rapido_data_hora" class="form-control" required value="${escaparHtmlEquipe(estado.dados.data_hora_inicio || hoje)}">
              <button type="button" class="quick-bo-now" onclick="window._novaOcorrenciaDefinirAgoraRapido()"><i class="fas fa-clock" aria-hidden="true"></i> Agora</button>
            </div>
          </div>
        </section>

        ${renderEquipeGuardas(estado.dados, "compact")}

        <section class="quick-bo-section" aria-labelledby="quick-bo-report-title">
          <div class="quick-bo-section-heading">
            <span class="quick-bo-section-icon"><i class="fas fa-pen" aria-hidden="true"></i></span>
            <div><h3 id="quick-bo-report-title">Relato objetivo</h3><p>Registre apenas o que foi informado, observado e realizado.</p></div>
          </div>
          <div class="quick-bo-field">
            <label for="rapido_observacoes">O que aconteceu? <span class="required">*</span></label>
            <div class="quick-bo-narrative-wrap">
              <textarea id="rapido_observacoes" class="form-control" rows="4" required placeholder="Resuma o fato, o que a equipe constatou, as providências adotadas e o desfecho.">${escaparHtmlEquipe(estado.dados.observacoes || "")}</textarea>
              <button type="button" id="btnSttRapido" class="quick-bo-mic" title="Falar relato" aria-label="Falar relato"><i class="fas fa-microphone" aria-hidden="true"></i></button>
            </div>
            <p class="quick-bo-field-note">Se necessário, o BO poderá ser complementado depois. Evite suposições; descreva fatos e providências.</p>
          </div>
        </section>

        <details class="quick-bo-optional"${solicitante ? " open" : ""}>
          <summary><span><i class="fas fa-user" aria-hidden="true"></i> Identificação do solicitante</span><small>Opcional</small></summary>
          <div class="quick-bo-optional-content">
            <div class="quick-bo-field">
              <label for="rapido_nome_solicitante">Nome do solicitante</label>
              <input type="text" id="rapido_nome_solicitante" class="form-control" placeholder="Nome completo, se informado" autocomplete="name" value="${escaparHtmlEquipe(solicitante)}">
              <p class="quick-bo-field-note">Deixe em branco se não foi informado ou se a pessoa preferiu não se identificar.</p>
            </div>
          </div>
        </details>

        <details class="quick-bo-optional quick-bo-photo-details"${anexos.length ? " open" : ""}>
          <summary><span><i class="fas fa-camera" aria-hidden="true"></i> Fotos de apoio</span><small>${anexos.length ? `${anexos.length} ${anexos.length === 1 ? "foto" : "fotos"}` : "Opcional"}</small></summary>
          <div class="quick-bo-optional-content">
            <input type="file" id="rapido_file_input" accept="image/*" multiple hidden onchange="window._novaOcorrenciaProcessarAnexosRapido(this.files)">
            <button type="button" class="quick-bo-add-photos" onclick="document.getElementById('rapido_file_input').click()"><i class="fas fa-plus" aria-hidden="true"></i> Adicionar fotos</button>
            <div id="rapido_preview_area" class="quick-photo-grid">${fotosMarkup}</div>
            <p class="quick-bo-field-note">Anexe imagens que ajudem a contextualizar o atendimento.</p>
          </div>
        </details>

        <div class="quick-bo-actions" role="group" aria-label="Ações do BO Rápido">
          <button type="button" onclick="window._novaOcorrenciaFinalizarRapido()" class="quick-bo-submit"><i class="fas fa-check-circle" aria-hidden="true"></i> Finalizar BO Rápido</button>
          <button type="button" onclick="window._novaOcorrenciaVoltarModos()" class="quick-bo-cancel">Cancelar</button>
        </div>
      </form>
    </main>
  `;

  container.innerHTML = html;
  window._obterDataHoraLocalInput = obterDataHoraLocalInput;
  window._novaOcorrenciaDefinirAgoraRapido = () => {
    const input = document.getElementById("rapido_data_hora");
    if (input) input.value = obterDataHoraLocalInput();
    sincronizarDadosRapido(appInstance, true);
  };

  ["rapido_tipo_ocorrencia", "rapido_local_ocorrencia", "rapido_data_hora", "rapido_nome_solicitante", "rapido_observacoes"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", () => sincronizarDadosRapido(appInstance, true));
    input.addEventListener("change", () => sincronizarDadosRapido(appInstance, true));
  });

  window._novaOcorrenciaBuscarGuardas = (termo) => buscarGuardasEquipe(termo);
  window._novaOcorrenciaAdicionarGuarda = (id) => selecionarGuardaEquipe(id, container, appInstance);
  window._novaOcorrenciaRemoverGuarda = (id) => removerGuardaEquipe(id, container, appInstance);
  window._novaOcorrenciaAlterarPapelGuarda = (id, papel) => alterarPapelGuarda(id, papel, container, appInstance);
  window._novaOcorrenciaProcessarAnexosRapido = (files) => processarAnexosRapido(files, container, appInstance);
  window._novaOcorrenciaRemoverAnexoRapido = (indice) => {
    const anexosAtuais = Array.isArray(estado.dados.anexos) ? estado.dados.anexos : [];
    const removido = anexosAtuais.splice(Number(indice), 1)[0];
    if (removido?.url_thumb && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(removido.url_thumb);
    estado.dados.anexos = anexosAtuais;
    appInstance.alteracoesNaoSalvas = true;
    renderizarFormularioRapido(container, appInstance);
    appInstance.showToast("Foto removida", "info");
  };
  window._novaOcorrenciaFinalizarRapido = () => finalizarRapido(container, appInstance);

  setTimeout(() => {
    if (window.utils && window.utils.initSpeechToText) {
      window.utils.initSpeechToText("rapido_observacoes", "btnSttRapido", appInstance);
    }
  }, 300);
}// 🔥 ALTERADO E CORRIGIDO: FINALIZAR BO RÁPIDO COM DATA_HORA_FINALIZACAO E SEM FUSO
// ============================================

async function finalizarRapido(container, appInstance) {
  sincronizarDadosRapido(appInstance, false);
  const tipo = document.getElementById("rapido_tipo_ocorrencia")?.value;
  const local = document.getElementById("rapido_local_ocorrencia")?.value;
  const dataHora = document.getElementById("rapido_data_hora")?.value;
  const nomeSolicitante = String(document.getElementById("rapido_nome_solicitante")?.value || "").trim();
  const observacoes = String(document.getElementById("rapido_observacoes")?.value || "").trim();

  if (!tipo || !local || !dataHora || !observacoes) {
    appInstance.showToast("Preencha tipo, local, data/hora e relato para finalizar", "warning");
    return;
  }

  salvarDadosEtapa();
  if (!equipeTemMinima(estado.dados.guardasParticipantes)) {
    appInstance.showToast("Selecione o GM de apoio antes de finalizar", "warning");
    renderizarFormularioRapido(container, appInstance);
    return;
  }

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar este BO Rápido?\n\nVocê poderá completá-lo depois com mais informações.",
  );
  if (!confirmado) return;

  // 🔥 CORRIGIDO: Data/hora de finalização SEM ajuste de fuso
  const agora = new Date();
  const year = agora.getFullYear();
  const month = String(agora.getMonth() + 1).padStart(2, "0");
  const day = String(agora.getDate()).padStart(2, "0");
  const hours = String(agora.getHours()).padStart(2, "0");
  const minutes = String(agora.getMinutes()).padStart(2, "0");
  const seconds = String(agora.getSeconds()).padStart(2, "0");
  const dataFinalizacao = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

  const dados = {
    tipo_ocorrencia: tipo,
    local_ocorrencia: local,
    data_hora_inicio: dataHora,
    nome_solicitante: nomeSolicitante || null,
    observacoes: observacoes,
    forma_solicitacao: "Diretamente com a ocorrência",
    modo_criacao: MODE_RAPIDO,
    status: navigator.onLine ? "synced" : "pending_sync",
    data_hora_finalizacao: dataFinalizacao,
    guardasParticipantes: estado.dados.guardasParticipantes || [],
  };

  const localizacao = await appInstance.obterLocalizacao();
  if (localizacao) {
    dados.latitude = localizacao.latitude;
    dados.longitude = localizacao.longitude;
  }

  const anexos = estado.dados.anexos || [];
  if (anexos.length > 0) {
    dados.anexos = anexos;
  }

  // 🔥 CORRIGIDO: Remover campos que não devem ir para o banco
  delete dados.assinaturas_objeto;

  if (!navigator.onLine) {
    try {
      const user = authManager.getUser();
      const id = crypto.randomUUID();
      const occurrence = { ...dados, id, criado_por: user.id, status: "synced", esta_ativa: true };
      delete occurrence.guardasParticipantes;
      const attachments = anexos.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
      await window.syncManager.saveOccurrenceOffline({
        ocorrencia: occurrence, envolvidos: [], anexos: attachments,
        guardasParticipantes: estado.dados.guardasParticipantes || [], assinaturas: [],
      }, { draft: false });
      appInstance.showToast("BO Rápido cifrado no dispositivo; será sincronizado quando houver conexão autenticada.", "success");
      resetarEstado();
      setTimeout(() => appInstance.navigateTo("ocorrencias"), 1000);
      return;
    } catch (offlineError) {
      appInstance.showToast(offlineError.message || "Não foi possível salvar o BO Rápido offline; mantenha a tela aberta.", "error");
      return;
    }
  }

  const result = await ocorrenciaManager.criar(dados);

  if (!result.success) {
    appInstance.showToast("Erro ao salvar: " + result.error, "error");
    return;
  }

  const guardas = estado.dados.guardasParticipantes || [];
  const errosFilhos = [];
  const guardasResult = await ocorrenciaManager.salvarGuardas(
    result.data.id,
    guardas,
  );
  if (!guardasResult.success) errosFilhos.push("equipe: " + guardasResult.error);

  if (anexos.length > 0) {
    const anexoResult = await ocorrenciaManager.salvarAnexos(
      result.data.id,
      anexos,
    );
    if (!anexoResult.success) errosFilhos.push("anexos: " + anexoResult.error);
  }

  if (errosFilhos.length) {
    const enfileirado = await enfileirarRetentativaOcorrencia(
      result.data, [], anexos, guardas, [],
    );
    appInstance.showToast(
      enfileirado
        ? "BO salvo; equipe/anexos seguem pendentes de sincronização automática."
        : "BO salvo como pendente. Não feche a sessão; a equipe/anexos precisam ser sincronizados.",
      "warning",
    );
    return;
  }

  const finalizacao = await ocorrenciaManager.finalizarPendenteSync(result.data.id);
  if (!finalizacao.success) {
    const enfileirado = await enfileirarRetentativaOcorrencia(
      result.data, [], anexos, guardas, [],
    );
    appInstance.showToast(
      enfileirado ? "BO salvo; finalização será tentada novamente." : "BO salvo, mas permanece pendente de finalização.",
      "warning",
    );
    return;
  }

  appInstance.showToast("BO Rápido finalizado com sucesso! ⚡", "success");
  await authManager.logCriarOcorrencia(authManager.getUserId(), result.data.id);

  resetarEstado();
  setTimeout(() => appInstance.navigateTo("ocorrencias"), 1500);
}

// ============================================
// 🔥 ALTERADO: PROCESSAR ANEXOS RÁPIDO (SEM LIMITE)
// ============================================

async function processarAnexosRapido(files, container, appInstance) {
  sincronizarDadosRapido(appInstance, false);
  const anexos = estado.dados.anexos || [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      appInstance.showToast("Apenas imagens são permitidas", "warning");
      continue;
    }

    try {
      const fotoComprimida = await window.utils.comprimirImagem(file, 800, 0.7);
      const hash = await window.utils.gerarHashArquivo(fotoComprimida);

      anexos.push({
        nome: file.name,
        tipo: "image",
        tamanho: fotoComprimida.size,
        arquivo: fotoComprimida,
        hash_pericial: hash,
        url_thumb: URL.createObjectURL(fotoComprimida),
      });

      appInstance.alteracoesNaoSalvas = true;
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
      appInstance.showToast(`Erro ao processar ${file.name}`, "error");
    }
  }

  estado.dados.anexos = anexos;
  renderizarFormularioRapido(container, appInstance);

  const fileInput = document.getElementById("rapido_file_input");
  if (fileInput) fileInput.value = "";
}

// ============================================
// RENDERIZAR FORMULÁRIO COMPLETO (7 ETAPAS)
// ============================================

function textoStatusRascunho(status) {
  const textos = {
    nao_salvo: "Ainda não salvo",
    pendente: "Alterações aguardando salvamento",
    salvando: "Salvando rascunho…",
    salvo: "Rascunho salvo no sistema",
    falha: "Rascunho não salvo. Tente novamente.",
    offline: "Sem conexão: o rascunho permanece protegido neste dispositivo até sincronizar.",
  };
  return textos[status] || textos.nao_salvo;
}

function atualizarStatusRascunho(status) {
  estado.statusRascunho = status;
  const elemento = document.getElementById("bo-draft-status");
  if (elemento) {
    elemento.textContent = textoStatusRascunho(status);
    elemento.dataset.state = status;
  }
}

function marcarRascunhoPendente(appInstance) {
  if (appInstance) appInstance.alteracoesNaoSalvas = true;
  const existeRascunho = !!(appInstance?.rascunhoId || estado.id);
  atualizarStatusRascunho(existeRascunho ? "pendente" : "nao_salvo");
}

function renderizarFormularioCompleto(container, appInstance) {
  // As transições e o salvamento do rascunho sincronizam o DOM antes de mudar de etapa.
  const etapa = estado.etapa;
  const dados = estado.dados;
  appInstance.novaOcorrencia = { dados };

  const progresso = Math.round((etapa / TOTAL_ETAPAS) * 100);
  let html = `
    <div class="container bo-form-shell">
      <header class="bo-form-heading">
        <div class="bo-form-heading-copy">
          <span class="bo-section-kicker">GUARDA MUNICIPAL · PITANGUEIRAS/PR</span>
          <h2><span class="bo-form-title-icon"><i class="fas fa-file-alt" aria-hidden="true"></i></span>Nova ocorrência</h2>
          <p>Modo completo <span aria-hidden="true">·</span> Registro operacional detalhado</p>
        </div>
        <button type="button" onclick="window._novaOcorrenciaVoltarModos()" class="bo-form-back"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>Voltar</span></button>
      </header>

      <section class="bo-progress-card" aria-label="Progresso do cadastro">
        <div class="bo-progress-copy"><div><span class="bo-step-counter">ETAPA ${etapa} DE ${TOTAL_ETAPAS}</span><h3 class="step-title">${getEtapaTitulo(etapa)}</h3><p class="step-subtitle">${getEtapaSubtitulo(etapa)}</p></div><span class="bo-progress-percent">${progresso}%</span></div>
        <div class="bo-progress-track" role="progressbar" aria-label="Progresso do BO" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progresso}"><span style="width:${progresso}%"></span></div>
        <div class="step-indicator" aria-label="Etapas do BO">${renderSteps(etapa, TOTAL_ETAPAS)}</div>
      </section>


      <form id="formOcorrencia" class="bo-form-panel" onsubmit="event.preventDefault();">
        ${renderEtapaForm(etapa, dados, appInstance)}
      </form>

      <div class="form-actions bo-form-actions bo-form-actions-with-save">
        ${etapa > 1 ? `<button type="button" class="btn-secondary" onclick="window._novaOcorrenciaAnterior()"><i class="fas fa-arrow-left" aria-hidden="true"></i> Voltar</button>` : `<span aria-hidden="true"></span>`}
        <div class="bo-draft-control"><button id="bo-save-draft-button" type="button" class="bo-save-draft" onclick="window._novaOcorrenciaSalvarRascunho()"><i class="fas fa-save" aria-hidden="true"></i> Salvar rascunho</button><span id="bo-draft-status" class="bo-draft-status" role="status" aria-live="polite" data-state="${estado.statusRascunho || "nao_salvo"}">${textoStatusRascunho(estado.statusRascunho || "nao_salvo")}</span></div>
        ${etapa < TOTAL_ETAPAS ? `<button type="button" class="btn-primary" onclick="window._novaOcorrenciaProxima()">Próxima etapa <i class="fas fa-arrow-right" aria-hidden="true"></i></button>` : `<button type="button" class="btn-success" onclick="window._novaOcorrenciaFinalizar()"><i class="fas fa-check-circle" aria-hidden="true"></i> Finalizar ocorrência</button>`}
      </div>
    </div>
  `;

  container.innerHTML = html;

  configurarEventosFormulario(appInstance);

  document
    .querySelectorAll(
      "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
    )
    .forEach((input) => {
      input.addEventListener("change", () => marcarRascunhoPendente(appInstance));
      input.addEventListener("input", () => marcarRascunhoPendente(appInstance));
    });

  if (etapa === 5) {
    setTimeout(() => {
      if (window.utils && window.utils.initSpeechToText) {
        window.utils.initSpeechToText(
          "observacoes",
          "btnSttObservacoes",
          appInstance,
        );
      }
    }, 300);
  }

  window._novaOcorrenciaProxima = () => proximaEtapa(container, appInstance);
  window._novaOcorrenciaAnterior = () => etapaAnterior(container, appInstance);
  window._novaOcorrenciaFinalizar = () =>
    finalizarOcorrencia(container, appInstance);
  window._novaOcorrenciaSalvarRascunho = async () => {
    salvarDadosEtapa();
    appInstance.novaOcorrencia = { dados: estado.dados };
    const botao = document.getElementById("bo-save-draft-button");
    if (botao) botao.disabled = true;
    atualizarStatusRascunho("salvando");
    try {
      const salvo = await appInstance.salvarRascunho();
      if (salvo === true) {
        estado.id = appInstance.rascunhoId || estado.id;
        atualizarStatusRascunho("salvo");
      } else {
        atualizarStatusRascunho(navigator.onLine ? "falha" : "offline");
      }
    } catch (error) {
      atualizarStatusRascunho(navigator.onLine ? "falha" : "offline");
    } finally {
      if (botao) botao.disabled = false;
    }
  };
  window._novaOcorrenciaBuscarGuardas = (termo) => buscarGuardasEquipe(termo);
  window._novaOcorrenciaAdicionarGuarda = (id) =>
    selecionarGuardaEquipe(id, container, appInstance);
  window._novaOcorrenciaRemoverGuarda = (id) =>
    removerGuardaEquipe(id, container, appInstance);
  window._novaOcorrenciaAlterarPapelGuarda = (id, papel) =>
    alterarPapelGuarda(id, papel, container, appInstance);
  window._novaOcorrenciaAlternarAssinaturaEnvolvido = (ativo) => {
    const painel = document.getElementById("env-assinatura-painel");
    if (!painel) return;
    painel.hidden = !ativo;
    if (ativo) setTimeout(() => inicializarCanvasAssinatura(appInstance, "canvasAssinaturaEnvolvido"), 40);
    else limparAssinatura(appInstance, true, "canvasAssinaturaEnvolvido");
  };
  window._novaOcorrenciaLimparAssinaturaEnvolvido = () =>
    limparAssinatura(appInstance, false, "canvasAssinaturaEnvolvido");
  window._novaOcorrenciaAdicionarEnvolvido = () =>
    adicionarEnvolvido(appInstance);
  window._novaOcorrenciaRemoverEnvolvido = (index) =>
    removerEnvolvido(index, appInstance);
  window._novaOcorrenciaProcessarAnexos = (files) =>
    processarAnexos(files, appInstance);
  window._novaOcorrenciaRemoverAnexo = (index) =>
    removerAnexo(index, appInstance);
  // 🔥 NOVO: Funções para assinatura
  window._novaOcorrenciaAdicionarAssinatura = () =>
    adicionarAssinatura(appInstance);
  window._novaOcorrenciaRemoverAssinatura = (chave) =>
    removerAssinatura(chave, appInstance);
  window._novaOcorrenciaLimparAssinatura = () => limparAssinatura(appInstance);
  // 🔥 NOVO: Função para selecionar envolvido na assinatura
  window._novaOcorrenciaSelecionarEnvolvido = () =>
    selecionarEnvolvidoParaAssinatura(appInstance);
}

// ============================================
// RENDER STEPS
// ============================================

function renderSteps(etapaAtual, total) {
  let html = "";
  for (let i = 1; i <= total; i++) {
    const classe = i < etapaAtual ? "done" : i === etapaAtual ? "active" : "";
    const estadoEtapa = i < etapaAtual ? "concluída" : i === etapaAtual ? "atual" : "pendente";
    html += `<div class="step ${classe}" aria-label="Etapa ${i}, ${estadoEtapa}" ${i === etapaAtual ? 'aria-current="step"' : ""}><span class="step-number">${i < etapaAtual ? '<i class="fas fa-check" aria-hidden="true"></i>' : i}</span></div>`;
    if (i < total) {
      const linhaClasse = i < etapaAtual ? "done" : "";
      html += `<div class="line ${linhaClasse}" aria-hidden="true"></div>`;
    }
  }
  return html;
}

// ============================================
// TÍTULOS E SUBTÍTULOS
// ============================================

function getEtapaTitulo(etapa) {
  const titulos = {
    1: "Origem da Solicitação",
    2: "Dados da Ocorrência",
    3: "Equipe operacional",
    4: "Envolvidos no fato",
    5: "Relato dos fatos",
    6: "Anexos e evidências",
    7: "Revisão e Finalização",
  };
  return titulos[etapa] || "";
}

function getEtapaSubtitulo(etapa) {
  const subtitulos = {
    1: "Informe como a solicitação chegou até você",
    2: "Preencha os dados principais da ocorrência",
    3: "Registre os GMs que atuaram e defina quem será o GM de apoio",
    4: "Cadastre cada pessoa envolvida e, se possível, colete sua assinatura opcional",
    5: "Descreva cronologicamente o que foi observado e realizado",
    6: "Adicione fotos, vídeos ou documentos (ilimitado)",
    7: "Revise todos os dados e informe o encerramento",
  };
  return subtitulos[etapa] || "";
}

// ============================================
// RENDER ETAPA FORM
// ============================================

function renderEtapaForm(etapa, dados, appInstance) {
  switch (etapa) {
    case 1:
      return renderEtapa1(dados);
    case 2:
      return renderEtapa2(dados, appInstance);
    case 3:
      return renderEtapa3(dados, appInstance);
    case 4:
      return renderEtapa4(dados, appInstance);
    case 5:
      return renderEtapa5(dados, appInstance);
    case 6:
      return renderEtapa6(dados, appInstance);
    case 7:
      return renderEtapa7(dados, appInstance);
    default:
      return "<p>Etapa não encontrada</p>";
  }
}

// ============================================
// ETAPA 1 - ORIGEM DA SOLICITAÇÃO (MANTIDO)
// ============================================

function renderEtapa1(dados) {
  const complementos = [dados.cpf_solicitante, dados.rg_solicitante, dados.endereco_solicitante, dados.codigo_municipal, dados.complemento, dados.bairro_solicitante, dados.identificacao_adicional];
  const temComplementos = complementos.some((valor) => String(valor || "").trim());
  return `
    <div class="form-group">
      <label for="forma_solicitacao"><i class="fas fa-phone-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>Forma de solicitação <span class="required">*</span></label>
      <div class="input-wrapper"><i class="fas fa-list-ul input-icon-left"></i><select id="forma_solicitacao" class="form-control" required>${FORMAS_SOLICITACAO.map((op) => `<option value="${escaparHtmlEquipe(op.value)}" ${dados.forma_solicitacao === op.value ? "selected" : ""}>${op.label}</option>`).join("")}</select></div>
    </div>
    <div class="form-group">
      <label for="nome_solicitante"><i class="fas fa-user" style="margin-right:6px;color:var(--azul-bandeira);"></i>Nome do solicitante <span class="optional-label">(opcional)</span></label>
      <div class="input-wrapper"><i class="fas fa-user input-icon-left"></i><input type="text" id="nome_solicitante" class="form-control" placeholder="Nome completo (deixe em branco para anônimo)" value="${escaparHtmlEquipe(dados.nome_solicitante)}"></div>
      <div class="input-hint"><i class="fas fa-info-circle" aria-hidden="true"></i>Deixe em branco para registrar solicitação anônima</div>
    </div>
    <div class="form-group">
      <label for="telefone_solicitante"><i class="fas fa-phone" style="margin-right:6px;color:var(--azul-bandeira);"></i>Telefone <span class="optional-label">(opcional)</span></label>
      <div class="input-wrapper"><i class="fas fa-phone input-icon-left"></i><input type="tel" id="telefone_solicitante" class="form-control" placeholder="(44) 99999-9999" value="${escaparHtmlEquipe(dados.telefone_solicitante)}"></div>
    </div>
    <details class="bo-optional-details"${temComplementos ? " open" : ""}>
      <summary><span><i class="fas fa-sliders-h" aria-hidden="true"></i> Dados complementares do solicitante</span><small>Opcionais</small></summary>
      <div class="bo-optional-details-content">
        <div class="form-group"><label for="cpf_solicitante">CPF</label><div class="input-wrapper"><i class="fas fa-id-card input-icon-left"></i><input type="text" id="cpf_solicitante" class="form-control" placeholder="123.456.789-00" value="${escaparHtmlEquipe(dados.cpf_solicitante)}" maxlength="14"></div></div>
        <div class="form-group"><label for="rg_solicitante">RG</label><div class="input-wrapper"><i class="fas fa-address-card input-icon-left"></i><input type="text" id="rg_solicitante" class="form-control" placeholder="RG do solicitante" value="${escaparHtmlEquipe(dados.rg_solicitante)}"></div></div>
        <div class="form-group"><label for="endereco_solicitante">Endereço informado</label><div class="input-wrapper"><i class="fas fa-home input-icon-left"></i><input type="text" id="endereco_solicitante" class="form-control" placeholder="Rua, número" value="${escaparHtmlEquipe(dados.endereco_solicitante)}"></div></div>
        <div class="form-group"><label for="bairro_solicitante">Bairro do solicitante</label><div class="input-wrapper"><i class="fas fa-location-dot input-icon-left"></i><input type="text" id="bairro_solicitante" class="form-control" placeholder="Bairro" value="${escaparHtmlEquipe(dados.bairro_solicitante)}"></div></div>
        <div class="form-group"><label for="codigo_municipal">Código do próprio municipal</label><div class="input-wrapper"><i class="fas fa-hashtag input-icon-left"></i><input type="text" id="codigo_municipal" class="form-control" placeholder="Código do imóvel" value="${escaparHtmlEquipe(dados.codigo_municipal)}"></div></div>
        <div class="form-group"><label for="complemento">Complemento</label><div class="input-wrapper"><i class="fas fa-pen input-icon-left"></i><input type="text" id="complemento" class="form-control" placeholder="Apto, bloco ou ponto de referência" value="${escaparHtmlEquipe(dados.complemento)}"></div></div>
        <div class="form-group"><label for="identificacao_adicional">Identificação adicional</label><textarea id="identificacao_adicional" class="form-control" rows="3" placeholder="Informações adicionais para identificar o solicitante">${escaparHtmlEquipe(dados.identificacao_adicional)}</textarea></div>
      </div>
    </details>
  `;
}


// ============================================
// ETAPA 2 - DADOS DA OCORRÊNCIA (SEM ENCERRAMENTO)
// ============================================

function renderEtapa2(dados, appInstance) {
  const dataHoraAtual = obterDataHoraLocalInput();
  let dataInicio = dados.data_hora_inicio || dataHoraAtual;

  return `
    <div class="form-group">
      <label for="codigo_operacional"><i class="fas fa-barcode" style="margin-right:6px;color:var(--azul-bandeira);"></i>Código operacional</label>
      <div class="input-wrapper">
        <i class="fas fa-barcode input-icon-left"></i>
        <input type="text" id="codigo_operacional" class="form-control" placeholder="Código da ocorrência" value="${dados.codigo_operacional || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="tipo_ocorrencia"><i class="fas fa-tag" style="margin-right:6px;color:var(--azul-bandeira);"></i>Tipo de Ocorrência <span class="required">*</span></label>
      <div class="input-wrapper">
        <i class="fas fa-list input-icon-left"></i>
        <select id="tipo_ocorrencia" class="form-control" required style="min-height:44px;">
          <option value="">Selecione o tipo...</option>
          ${TIPOS_OCORRENCIA.map((op) => `<option value="${op.value}" ${dados.tipo_ocorrencia === op.value ? "selected" : ""}>${op.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="local_ocorrencia"><i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>Local da ocorrência <span class="required">*</span></label>
      <div class="input-wrapper">
        <i class="fas fa-map-marker-alt input-icon-left"></i>
        <input type="text" id="local_ocorrencia" class="form-control" placeholder="Endereço completo" required value="${dados.local_ocorrencia || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="rodovia"><i class="fas fa-road" style="margin-right:6px;color:var(--azul-bandeira);"></i>Rodovia (se aplicável)</label>
      <div class="input-wrapper">
        <i class="fas fa-road input-icon-left"></i>
        <input type="text" id="rodovia" class="form-control" placeholder="BR-123, km 45" value="${dados.rodovia || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="bairro_ocorrencia"><i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>Bairro</label>
      <div class="input-wrapper">
        <i class="fas fa-location-dot input-icon-left"></i>
        <input type="text" id="bairro_ocorrencia" class="form-control" placeholder="Bairro" value="${dados.bairro_ocorrencia || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="referencia"><i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>Referência</label>
      <div class="input-wrapper">
        <i class="fas fa-info-circle input-icon-left"></i>
        <input type="text" id="referencia" class="form-control" placeholder="Ponto de referência próximo" value="${dados.referencia || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="data_hora_inicio"><i class="fas fa-calendar-plus" style="margin-right:6px;color:var(--azul-bandeira);"></i>Data e hora do início <span class="required">*</span></label>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;position:relative;">
          <i class="fas fa-calendar input-icon-left" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:14px;z-index:2;"></i>
          <input type="datetime-local" id="data_hora_inicio" class="form-control" required value="${dataInicio}" style="min-height:44px;padding-left:36px;">
        </div>
        <button type="button" onclick="document.getElementById('data_hora_inicio').value = window._obterDataHoraLocalInput()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
          <i class="fas fa-clock"></i> Agora
        </button>
      </div>
    </div>
    <!-- 🔥 REMOVIDO: Data/Hora Encerramento (movido para etapa 7) -->
  `;
}

// ============================================
// ETAPA 3 — EQUIPE OPERACIONAL
// ============================================
function renderEtapa3(dados) {
  return renderEquipeGuardas(dados, "completo");
}

// ============================================
// ETAPA 4 — ENVOLVIDOS NO FATO
// ============================================
function renderEtapa4(dados) {
  const envolvidos = Array.isArray(dados.envolvidos) ? dados.envolvidos : [];
  const assinaturas = Array.isArray(dados.assinaturas) ? dados.assinaturas : [];
  const cards = envolvidos.length ? envolvidos.map((env, index) => {
    const assinatura = assinaturas.find((item) => item && item.envolvido_id === env.id);
    const assinaturaKey = assinatura ? (assinatura.id || assinatura.envolvido_id || assinatura.tipo) : "";
    const campos = [
      env.cpf ? `<div class="campo"><i class="fas fa-id-card"></i><span class="label">CPF:</span><span class="valor">${escaparHtmlEquipe(env.cpf)}</span></div>` : "",
      env.rg ? `<div class="campo"><i class="fas fa-address-card"></i><span class="label">RG:</span><span class="valor">${escaparHtmlEquipe(env.rg)}</span></div>` : "",
      env.telefone ? `<div class="campo"><i class="fas fa-phone"></i><span class="label">Tel:</span><span class="valor">${escaparHtmlEquipe(env.telefone)}</span></div>` : "",
      env.endereco ? `<div class="campo"><i class="fas fa-map-marker-alt"></i><span class="label">End:</span><span class="valor">${escaparHtmlEquipe(env.endereco)}</span></div>` : "",
      env.bairro ? `<div class="campo"><i class="fas fa-location-dot"></i><span class="label">Bairro:</span><span class="valor">${escaparHtmlEquipe(env.bairro)}</span></div>` : "",
      env.observacoes ? `<div class="campo bo-person-notes"><i class="fas fa-pencil-alt"></i><span class="label">Obs:</span><span class="valor">${escaparHtmlEquipe(env.observacoes)}</span></div>` : "",
    ].filter(Boolean).join("");
    return `<article class="envolvido-item-modern bo-person-card"><div class="bo-person-card-heading"><span class="badge badge-azul"><i class="fas fa-user" aria-hidden="true"></i> ${escaparHtmlEquipe(getTipoEnvolvidoLabel(env.tipo))}</span><strong>${escaparHtmlEquipe(env.nome_completo || "Nome não informado")}</strong><button type="button" class="bo-person-remove" aria-label="Remover ${escaparHtmlEquipe(env.nome_completo || "envolvido")}" onclick="window._novaOcorrenciaRemoverEnvolvido(${index})"><i class="fas fa-trash-alt" aria-hidden="true"></i></button></div>${campos ? `<div class="detalhes-grid">${campos}</div>` : ""}<div class="bo-person-signature-state ${assinatura ? "is-signed" : "is-unsigned"}"><span><i class="fas ${assinatura ? "fa-check-circle" : "fa-pen-nib"}" aria-hidden="true"></i>${assinatura ? "Assinatura coletada" : "Sem assinatura"}</span>${assinatura ? `<button type="button" class="bo-person-signature-remove" data-signature-key="${escaparHtmlEquipe(assinaturaKey)}" onclick="window._novaOcorrenciaRemoverAssinatura(this.dataset.signatureKey)">Remover assinatura</button>` : `<small>A coleta foi opcional</small>`}</div></article>`;
  }).join("") : `<div class="lista-vazia bo-people-empty"><i class="fas fa-users" aria-hidden="true"></i><p>Nenhum envolvido cadastrado</p><p class="sub">Se houver pessoas relacionadas ao fato, cadastre cada uma individualmente.</p></div>`;

  return `<section class="bo-people-section" aria-label="Pessoas envolvidas no fato"><div class="bo-people-intro"><span class="bo-team-icon"><i class="fas fa-users" aria-hidden="true"></i></span><div><span class="bo-section-kicker">ENVOLVIDOS NO FATO</span><h3>Pessoas relacionadas à ocorrência</h3><p>Esta lista é separada da equipe da Guarda. Cadastre uma pessoa por vez; assinatura opcional é oferecida no próprio cadastro.</p></div></div><div class="bo-people-count" role="status">${envolvidos.length} ${envolvidos.length === 1 ? "pessoa cadastrada" : "pessoas cadastradas"}</div><div id="listaEnvolvidos" class="bo-people-list">${cards}</div><button type="button" class="btn-add bo-add-person" onclick="window._novaOcorrenciaAdicionarEnvolvido()"><i class="fas fa-plus-circle" aria-hidden="true"></i> Adicionar envolvido</button></section>`;
}

// ============================================
// ETAPA 5 - RELATO DOS FATOS
// ============================================
// ETAPA 4 - OBSERVAÇÕES (MANTIDO)
// ============================================

function renderEtapa5(dados, appInstance) {
  return `
    <div class="form-group">
      <label for="observacoes"><i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>Observações e Relato dos Fatos <span class="required">*</span></label>
      <div class="stt-container" style="position:relative; width:100%;">
        <textarea id="observacoes" class="form-control" rows="8" placeholder="Descreva detalhadamente o ocorrido..." required style="padding-right: 45px; width:100%;">${dados.observacoes || ""}</textarea>
        <button type="button" id="btnSttObservacoes" class="btn-stt" title="Falar relato" style="position:absolute; right:10px; bottom:10px; width:44px; height:44px; border-radius:50%; background:var(--azul-muito-claro); color:var(--azul-bandeira); border:2px solid var(--azul-claro); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:5; transition:all 0.3s ease;">
          <i class="fas fa-microphone" style="font-size:18px;"></i>
        </button>
      </div>
      <div class="input-hint"><i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>Mínimo 10 caracteres. Use o microfone para falar.</div>
      <div class="bo-authority-hint"><i class="fas fa-landmark" aria-hidden="true"></i><p><strong>Outra autoridade atuou junto?</strong> Registre aqui no relato o órgão/equipe, a providência realizada e o encaminhamento. Não inclua esses agentes como GM na equipe operacional.</p></div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" onclick="document.getElementById('observacoes').value += 'O solicitante informou que...'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">Início padrão</button>
        <button type="button" onclick="document.getElementById('observacoes').value += 'A equipe constatou a situação e orientou as partes envolvidas.'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">Conclusão padrão</button>
      </div>
    </div>
  `;
}

// ============================================
// ETAPA 6 - ANEXOS E EVIDÊNCIAS
// ============================================

function renderEtapa6(dados, appInstance) {
  const anexos = dados.anexos || [];

  return `
    <div style="margin-bottom:16px;">
      <p style="color:var(--cinza-medio);font-size:14px;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Adicione fotos, vídeos ou documentos como evidência.
        <strong>Sem limite de quantidade.</strong>
      </p>
    </div>

    <div style="margin-bottom:16px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-camera"></i> Fotos e Documentos (${anexos.length})
      </h4>
      <div class="file-upload" onclick="document.getElementById('fileInput').click()">
        <div class="icon"><i class="fas fa-cloud-upload-alt"></i></div>
        <div class="text"><strong>Clique para adicionar anexos</strong><br><span style="font-size:13px;color:var(--cinza-medio);">Fotos, vídeos ou documentos - sem limite</span></div>
        <input type="file" id="fileInput" multiple accept="image/*,video/*,application/pdf" style="display:none;" onchange="window._novaOcorrenciaProcessarAnexos(this.files)">
      </div>
      <div id="listaAnexos" style="margin-top:12px;">
        ${
          anexos.length === 0
            ? `<div style="text-align:center;padding:20px;color:var(--cinza-medio);font-size:14px;"><i class="fas fa-paperclip" style="margin-right:4px;"></i>Nenhum anexo adicionado</div>`
            : `<div class="file-list">${anexos
                .map(
                  (anexo, index) => `
            <div class="file-item">
              <div class="file-info">
                <div class="icon"><i class="fas ${getIconAnexo(anexo.tipo)}"></i></div>
                <div><div class="name">${anexo.nome}</div><div class="size">${formatarTamanho(anexo.tamanho)}</div></div>
              </div>
              <div class="file-actions"><button type="button" class="remove-btn" onclick="window._novaOcorrenciaRemoverAnexo(${index})"><i class="fas fa-times"></i></button></div>
            </div>
          `,
                )
                .join("")}</div>`
        }
      </div>
      <button type="button" class="btn-add" onclick="document.getElementById('fileInput').click()" style="margin-top:8px;">
        <i class="fas fa-plus-circle"></i> Adicionar Anexos
      </button>
    </div>
  `;
}

// ============================================
// 🔥 ETAPA 7 - REVISÃO E FINALIZAÇÃO (COM ENCERRAMENTO)
// ============================================

function renderEtapa7(dados, appInstance) {
  const envolvidos = dados.envolvidos || [];
  const anexos = dados.anexos || [];
  const assinaturas = dados.assinaturas || [];
  const equipe = garantirResponsavelEquipe(dados);

  // 🔥 NOVO: Data/hora encerramento com valor atual ou do dispositivo
  const dataEncerramentoAtual =
    dados.data_hora_encerramento || obterDataHoraLocalInput();

  const camposSolicitantePreenchidos = [
    { label: "Forma", valor: dados.forma_solicitacao },
    { label: "Solicitante", valor: dados.nome_solicitante },
    { label: "CPF do Solicitante", valor: dados.cpf_solicitante },
    { label: "RG do Solicitante", valor: dados.rg_solicitante },
    { label: "Telefone", valor: dados.telefone_solicitante },
    { label: "Endereço", valor: dados.endereco_solicitante },
    { label: "Código Municipal", valor: dados.codigo_municipal },
    { label: "Complemento", valor: dados.complemento },
    { label: "Bairro", valor: dados.bairro_solicitante },
    { label: "Identificação Adicional", valor: dados.identificacao_adicional },
  ].filter((c) => c.valor && c.valor.toString().trim() !== "");

  const camposOcorrencia = [
    {
      label: "Tipo",
      valor: dados.tipo_ocorrencia ? getTipoLabel(dados.tipo_ocorrencia) : null,
    },
    { label: "Local", valor: dados.local_ocorrencia },
    { label: "Rodovia", valor: dados.rodovia },
    { label: "Bairro", valor: dados.bairro_ocorrencia },
    { label: "Referência", valor: dados.referencia },
    { label: "Código Operacional", valor: dados.codigo_operacional },
  ].filter((c) => c.valor && c.valor.toString().trim() !== "");

  const dataFinalizacao = dados.data_hora_finalizacao
    ? formatarDataHoraLocal(dados.data_hora_finalizacao)
    : "Será preenchida automaticamente na finalização";

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
        <h4><i class="fas fa-phone-alt"></i> Origem da Solicitação</h4>
        ${camposSolicitantePreenchidos.map((c) => `<div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>`).join("")}
      </div>
    `
        : ""
    }

    ${
      camposOcorrencia.length > 0 || dados.data_hora_inicio
        ? `
      <div class="card-revisao">
        <h4><i class="fas fa-map-marker-alt"></i> Dados da Ocorrência</h4>
        ${camposOcorrencia.map((c) => `<div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>`).join("")}
        <div class="campo"><span class="rotulo">Início:</span><span class="valor">${dados.data_hora_inicio ? formatarDataHoraLocal(dados.data_hora_inicio) : "Não informado"}</span></div>
        <!-- 🔥 NOVO: Data/Hora Encerramento na revisão -->
        <div class="campo" style="background:var(--azul-muito-claro);padding:6px 10px;border-radius:4px;border-left:3px solid var(--azul-bandeira);">
          <span class="rotulo" style="color:var(--azul-bandeira);">📌 Data/Hora Encerramento:</span>
          <div style="display:flex;align-items:center;gap:6px;flex:1;">
            <input type="datetime-local" id="revisao_data_hora_encerramento" 
              value="${dataEncerramentoAtual}"
              style="flex:1;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;">
            <button type="button" onclick="document.getElementById('revisao_data_hora_encerramento').value = window._obterDataHoraLocalInput()" 
              class="btn-secondary" style="padding:4px 10px;font-size:11px;min-height:auto;width:auto;border-radius:6px;white-space:nowrap;">
              <i class="fas fa-clock"></i> Agora
            </button>
          </div>
        </div>
        <div class="campo" style="background:var(--verde-muito-claro);padding:4px 8px;border-radius:4px;">
          <span class="rotulo" style="color:var(--verde-escuro);">✅ Finalização:</span>
          <span class="valor" style="font-weight:500;">${dataFinalizacao}</span>
        </div>
      </div>
    `
        : ""
    }

    <div class="card-revisao">
      <h4><i class="fas fa-users"></i> Envolvidos (${envolvidos.length})</h4>
      ${envolvidos.length === 0 ? `<p style="color:var(--cinza-medio);font-size:14px;">Nenhum envolvido cadastrado</p>` : envolvidos.map((env) => {
        const assinatura = assinaturas.find((ass) => ass && ass.envolvido_id === env.id);
        return `<div class="bo-review-person"><div><span class="badge badge-azul" style="font-size:10px;">${escaparHtmlEquipe(getTipoEnvolvidoLabel(env.tipo))}</span> <strong>${escaparHtmlEquipe(env.nome_completo || "Nome não informado")}</strong>${env.cpf ? `<small>${escaparHtmlEquipe(env.cpf)}</small>` : ""}</div><span class="bo-review-signature ${assinatura ? "is-signed" : "is-unsigned"}"><i class="fas ${assinatura ? "fa-check-circle" : "fa-minus-circle"}" aria-hidden="true"></i>${assinatura ? "Assinatura coletada" : "Sem assinatura"}</span></div>`;
      }).join("")}
    </div>

    <div class="card-revisao bo-review-team">
      <h4><i class="fas fa-user-shield" aria-hidden="true"></i> Equipe operacional (${equipe.filter((g) => g && g.esta_ativo !== false).length})</h4>
      ${equipe.filter((g) => g && g.esta_ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((g) => `<div class="bo-review-team-member"><strong>${escaparHtmlEquipe(g.nome_snapshot || g.nome_completo || "GM cadastrado")}</strong><span>${rotuloPapelEquipe(g.papel)}${g.matricula_snapshot ? ` · Mat. ${escaparHtmlEquipe(g.matricula_snapshot)}` : ""}</span></div>`).join("")}
    </div>

    ${
      dados.observacoes && dados.observacoes.trim() !== ""
        ? `
      <div class="card-revisao">
        <h4><i class="fas fa-pencil-alt"></i> Observações</h4>
        <p style="font-size:14px;white-space:pre-wrap;">${dados.observacoes}</p>
      </div>
    `
        : ""
    }

    <div class="card-revisao">
      <h4><i class="fas fa-paperclip"></i> Anexos</h4>
      <div style="font-size:13px;">
        <div><strong>📎 Anexos:</strong> ${anexos.length} arquivo(s) (ilimitado)</div>
        ${anexos.length > 0 ? `<div style="margin-top:4px;font-size:12px;color:var(--cinza-medio);">${anexos.map((a) => a.nome).join(", ")}</div>` : ""}
      </div>
    </div>

    <div class="alert-finalizar">
      <p><i class="fas fa-info-circle"></i> Ao finalizar, a ocorrência será numerada e não poderá mais ser editada.</p>
      <p style="font-size:12px;margin-top:4px;color:var(--cinza-medio);">
        <i class="fas fa-clock"></i> A data/hora de finalização será registrada automaticamente.
      </p>
      <p style="font-size:12px;margin-top:2px;color:var(--cinza-medio);">
        <i class="fas fa-calendar-check"></i> A data/hora de encerramento foi preenchida acima.
      </p>
    </div>
  `;
}

// ============================================
// 🔥 NOVO: FUNÇÕES PARA ASSINATURA INTEGRADA
// ============================================

/**
 * Atualiza o dropdown de envolvidos na etapa de assinaturas
 */
function atualizarDropdownEnvolvidos() {
  const select = document.getElementById("selectEnvolvidoAssinatura");
  if (!select) return;

  const envolvidos = estado.dados.envolvidos || [];
  const assinaturas = estado.dados.assinaturas || [];

  // Mapear quais envolvidos já assinaram
  const envolvidosAssinados = {};
  assinaturas.forEach((ass) => {
    if (ass.envolvido_id) {
      envolvidosAssinados[ass.envolvido_id] = true;
    }
  });

  let opcoes = `<option value="">-- Selecione um envolvido --</option>`;
  if (envolvidos.length === 0) {
    opcoes = `<option value="">-- Nenhum envolvido cadastrado --</option>`;
  } else {
    envolvidos.forEach((env) => {
      const jaAssinou = envolvidosAssinados[env.id] ? " ✅" : "";
      const disabled = jaAssinou ? "disabled" : "";
      opcoes += `
        <option value="${env.id}" ${disabled}>
          ${env.nome_completo} (${getTipoEnvolvidoLabel(env.tipo)})${jaAssinou}
        </option>
      `;
    });
  }

  select.innerHTML = opcoes;
}

/**
 * Seleciona um envolvido para assinatura (auto-preenchimento)
 */
function selecionarEnvolvidoParaAssinatura(appInstance) {
  const select = document.getElementById("selectEnvolvidoAssinatura");
  if (!select) return;

  const envolvidoId = select.value;
  if (!envolvidoId) {
    document.getElementById("assinaturaNomeAuto").value = "";
    document.getElementById("assinaturaCpfAuto").value = "";
    estado.envolvidoSelecionado = null;
    return;
  }

  const envolvido = estado.dados.envolvidos.find((e) => e.id === envolvidoId);
  if (!envolvido) return;
  if (estado.envolvidoSelecionado?.id !== envolvido.id) limparAssinatura(null, true);

  estado.envolvidoSelecionado = envolvido;
  document.getElementById("assinaturaNomeAuto").value =
    envolvido.nome_completo || "";
  document.getElementById("assinaturaCpfAuto").value = envolvido.cpf || "";
}

/**
 * Inicializa o canvas para captura de assinatura
 */
function inicializarCanvasAssinatura(appInstance, canvasId = "canvasAssinatura") {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas.dataset.initialized === "true") return;
  canvas.dataset.initialized = "true";
  canvas.dataset.hasUserInk = "false";

  estado.canvasAssinatura = canvas;
  const ctx = canvas.getContext("2d");

  // Configurar canvas
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1e293b";

  // Limpar canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Adicionar linha de base
  ctx.beginPath();
  ctx.moveTo(20, canvas.height - 20);
  ctx.lineTo(canvas.width - 20, canvas.height - 20);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2;

  // Eventos para mouse
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    estado.isDrawing = true;
    estado.lastX = (e.clientX - rect.left) * scaleX;
    estado.lastY = (e.clientY - rect.top) * scaleY;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!estado.isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(estado.lastX, estado.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    canvas.dataset.hasUserInk = "true";

    estado.lastX = x;
    estado.lastY = y;
  });

  canvas.addEventListener("mouseup", () => {
    estado.isDrawing = false;
  });

  canvas.addEventListener("mouseleave", () => {
    estado.isDrawing = false;
  });

  // Eventos para touch
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      estado.isDrawing = true;
      estado.lastX = (touch.clientX - rect.left) * scaleX;
      estado.lastY = (touch.clientY - rect.top) * scaleY;
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (!estado.isDrawing) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (touch.clientX - rect.left) * scaleX;
      const y = (touch.clientY - rect.top) * scaleY;

      ctx.beginPath();
      ctx.moveTo(estado.lastX, estado.lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      canvas.dataset.hasUserInk = "true";

      estado.lastX = x;
      estado.lastY = y;
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      estado.isDrawing = false;
    },
    { passive: false },
  );

  console.log("✅ Canvas de assinatura inicializado");
}

/**
 * Limpa o canvas de assinatura
 */
function limparAssinatura(appInstance, silencioso = false, canvasId = "canvasAssinatura") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.dataset.hasUserInk = "false";

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Redesenhar linha de base
  ctx.beginPath();
  ctx.moveTo(20, canvas.height - 20);
  ctx.lineTo(canvas.width - 20, canvas.height - 20);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2;

  if (!silencioso && appInstance && appInstance.showToast) {
    appInstance.showToast("Assinatura limpa", "info");
  }
}

/**
 * 🔥 NOVO: Adiciona uma assinatura vinculada ao envolvido selecionado
 */
async function adicionarAssinatura(appInstance) {
  const canvas = document.getElementById("canvasAssinatura");
  if (!canvas) {
    appInstance.showToast("Canvas de assinatura não encontrado", "error");
    return;
  }

  const envolvido = estado.envolvidoSelecionado;
  if (!envolvido) {
    appInstance.showToast("Selecione um envolvido primeiro", "warning");
    return;
  }

  // Verificar se este envolvido já assinou
  const assinaturaExistente = estado.dados.assinaturas.find(
    (a) => a.envolvido_id === envolvido.id,
  );

  if (assinaturaExistente) {
    const confirmado = await appInstance.confirmar(
      `"${envolvido.nome_completo}" já assinou. Deseja substituir a assinatura?`,
    );
    if (!confirmado) return;
    // Remover assinatura existente
    estado.dados.assinaturas = estado.dados.assinaturas.filter(
      (a) => a.envolvido_id !== envolvido.id,
    );
  }

  // Verificar se a assinatura está vazia
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  let hasDrawing = false;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 255 || pixels[i + 1] < 255 || pixels[i + 2] < 255) {
      hasDrawing = true;
      break;
    }
  }

  if (!hasDrawing) {
    appInstance.showToast("Desenhe a assinatura no campo acima", "warning");
    return;
  }

  // Capturar a assinatura do canvas
  const assinaturaDataUrl = canvas.toDataURL("image/png");

  // Criar objeto da assinatura com vínculo ao envolvido
  const assinatura = {
    id: crypto.randomUUID ? crypto.randomUUID() : gerarUUID(),
    envolvido_id: envolvido.id,
    tipo: envolvido.tipo,
    nome: envolvido.nome_completo,
    cpf: envolvido.cpf || null,
    assinatura_data_url: assinaturaDataUrl,
    assinado_em: globalThis.obterTimestampBrasilSemFuso(),
    assinado_por: authManager.getUserId(),
    nome_guarda: authManager.getUser()?.nome_completo || "Desconhecido",
  };

  // Adicionar ao estado
  estado.dados.assinaturas.push(assinatura);
  appInstance.alteracoesNaoSalvas = true;

  // Limpar canvas
  limparAssinatura(appInstance);

  // Limpar seleção
  const select = document.getElementById("selectEnvolvidoAssinatura");
  if (select) select.value = "";
  document.getElementById("assinaturaNomeAuto").value = "";
  document.getElementById("assinaturaCpfAuto").value = "";
  estado.envolvidoSelecionado = null;

  // Re-renderizar a etapa
  const container = document.getElementById("page-nova-ocorrencia");
  if (container) {
    renderizarFormularioCompleto(container, appInstance);
  }

  appInstance.showToast(
    `Assinatura de ${envolvido.nome_completo} coletada!`,
    "success",
  );
}

/**
 * Remove uma assinatura da ocorrência
 */
async function removerAssinatura(chave, appInstance) {
  const assinaturas = estado.dados.assinaturas || [];
  const indice = assinaturas.findIndex((a) =>
    a.id === chave || a.envolvido_id === chave || (!a.id && !a.envolvido_id && a.tipo === chave),
  );
  if (indice < 0) return;
  const assinatura = assinaturas[indice];
  const confirmado = await appInstance.confirmar(
    `Remover a assinatura de ${assinatura.nome || "este envolvido"}?`,
  );
  if (!confirmado) return;
  estado.dados.assinaturas = assinaturas.filter((_, index) => index !== indice);
  marcarRascunhoPendente(appInstance);
  const container = document.getElementById("page-nova-ocorrencia");
  if (container) {
    renderizarFormularioCompleto(container, appInstance);
  }
  appInstance.showToast("Assinatura removida", "info");
}

/**
 * Retorna o label do tipo de assinatura
 */
function getTipoAssinaturaLabel(tipo) {
  const tipos = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
  };
  return tipos[tipo] || tipo;
}

// ============================================
// CONFIGURAR EVENTOS DO FORMULÁRIO
// ============================================

function configurarEventosFormulario(appInstance) {
  const cpfInput = document.getElementById("cpf_solicitante");
  if (cpfInput) {
    cpfInput.addEventListener("input", function () {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

  const telefoneInput = document.getElementById("telefone_solicitante");
  if (telefoneInput) {
    telefoneInput.addEventListener("input", function () {
      this.value = aplicarMascaraTelefone(this.value);
    });
  }

  // 🔥 NOVO: Máscara para CPF da assinatura (já é automático do envolvido)

  document
    .querySelectorAll(
      "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
    )
    .forEach((input) => {
      input.addEventListener("change", () => salvarDadosEtapa());
      input.addEventListener("input", () => salvarDadosEtapa());
    });

  // 🔥 NOVO: Salvar data/hora encerramento da etapa 7
  const encerramentoInput = document.getElementById(
    "revisao_data_hora_encerramento",
  );
  if (encerramentoInput) {
    encerramentoInput.addEventListener("change", () => {
      estado.dados.data_hora_encerramento = encerramentoInput.value;
    });
  }
}

// ============================================
// SALVAR DADOS DA ETAPA
// ============================================

function salvarDadosEtapa() {
  const etapa = estado.etapa;
  const dados = estado.dados;

  switch (etapa) {
    case 1:
      dados.forma_solicitacao =
        document.getElementById("forma_solicitacao")?.value || "";
      dados.nome_solicitante =
        document.getElementById("nome_solicitante")?.value || "";
      dados.cpf_solicitante =
        document.getElementById("cpf_solicitante")?.value || "";
      dados.rg_solicitante =
        document.getElementById("rg_solicitante")?.value || "";
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
      break;
    case 5:
      dados.observacoes = document.getElementById("observacoes")?.value || "";
      break;
    case 6:
      // Anexos são mantidos no estado do formulário.
      break;
    case 7:
      // Data/hora encerramento é salva via evento change
      const encerramentoInput = document.getElementById(
        "revisao_data_hora_encerramento",
      );
      if (encerramentoInput) {
        dados.data_hora_encerramento = encerramentoInput.value;
      }
      break;
  }
}

// ============================================
// NAVEGAÇÃO ENTRE ETAPAS
// ============================================

function proximaEtapa(container, appInstance) {
  if (!validarEtapa(appInstance)) return;
  salvarDadosEtapa();

  if (estado.etapa < TOTAL_ETAPAS) {
    estado.etapa++;
    renderizarFormularioCompleto(container, appInstance);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function etapaAnterior(container, appInstance) {
  salvarDadosEtapa();
  if (estado.etapa > 1) {
    estado.etapa--;
    renderizarFormularioCompleto(container, appInstance);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================
// VALIDAR ETAPA
// ============================================

function validarEtapa(appInstance) {
  const etapa = estado.etapa;
  let isValid = true;
  let mensagem = "";

  switch (etapa) {
    case 1:
      if (!document.getElementById("forma_solicitacao")?.value) {
        mensagem = "Selecione a forma de solicitação";
        isValid = false;
      }
      break;
    case 2:
      if (!document.getElementById("tipo_ocorrencia")?.value) {
        mensagem = "Selecione o tipo de ocorrência";
        isValid = false;
      } else if (!document.getElementById("local_ocorrencia")?.value) {
        mensagem = "Informe o local da ocorrência";
        isValid = false;
      } else if (!document.getElementById("data_hora_inicio")?.value) {
        mensagem = "Informe a data e hora do início";
        isValid = false;
      }
      break;
    case 3:
      if (!equipeTemMinima(estado.dados.guardasParticipantes)) {
        mensagem = "Inclua o GM responsável e pelo menos um GM de apoio antes de continuar";
        isValid = false;
      }
      break;
    case 5:
      const observacoes = document.getElementById("observacoes")?.value;
      if (!observacoes || observacoes.trim().length < 10) {
        mensagem = "Descreva o ocorrido com pelo menos 10 caracteres";
        isValid = false;
      }
      break;
    case 7:
      // Valida se data/hora encerramento foi preenchida
      const encerramento = document.getElementById(
        "revisao_data_hora_encerramento",
      )?.value;
      if (!encerramento) {
        mensagem = "Informe a data e hora de encerramento";
        isValid = false;
      }
      break;
  }

  if (!isValid) {
    appInstance.showToast(mensagem, "warning");
  }
  return isValid;
}

// ============================================
// ENVOLVIDOS - ADICIONAR (MANTIDO)
// ============================================

function adicionarEnvolvido(appInstance) {
  const assinaturaInlineCompleto = estado.modo === MODE_COMPLETO && !estado.isCompletando;
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
    <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);"><i class="fas fa-user-plus" style="margin-right:8px;"></i>Adicionar Envolvido</div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <form id="formEnvolvido" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_tipo" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">Tipo <span class="required" style="color:var(--erro);">*</span></label>
            <select id="env_tipo" class="form-control" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;min-height:44px;">
              <option value="">Selecione...</option>
              ${TIPOS_ENVOLVIDO.map((op) => `<option value="${op.value}">${op.label}</option>`).join("")}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_nome" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">Nome Completo <span class="required" style="color:var(--erro);">*</span></label>
            <input type="text" id="env_nome" class="form-control" placeholder="Nome completo" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_cpf" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">CPF</label>
            <input type="text" id="env_cpf" class="form-control" placeholder="123.456.789-00" maxlength="14" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_telefone" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">Telefone</label>
            <input type="text" id="env_telefone" class="form-control" placeholder="(44) 99999-9999" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_observacoes" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">Observações</label>
            <textarea id="env_observacoes" class="form-control" rows="2" placeholder="Observações adicionais" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;min-height:50px;resize:vertical;"></textarea>
          </div>
          ${assinaturaInlineCompleto ? `<section class="bo-inline-signature"><label class="bo-inline-signature-toggle"><input type="checkbox" id="env_coletar_assinatura" onchange="window._novaOcorrenciaAlternarAssinaturaEnvolvido(this.checked)"><span><strong>Coletar assinatura agora</strong><small>Opcional — você pode salvar sem coletar.</small></span></label><div id="env-assinatura-painel" class="bo-inline-signature-panel" hidden><p>A imagem será vinculada somente a este cadastro e não indica, por si só, concordância com o relato integral do BO.</p><div class="bo-inline-signature-canvas"><canvas id="canvasAssinaturaEnvolvido" width="400" height="150" aria-label="Área para assinatura manuscrita opcional"></canvas></div><div class="bo-inline-signature-actions"><button type="button" class="btn-secondary" onclick="window._novaOcorrenciaLimparAssinaturaEnvolvido()"><i class="fas fa-undo" aria-hidden="true"></i> Limpar</button></div></div></section>` : ""}
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">Cancelar</button>
        <button type="button" class="btn-primary" onclick="window._novaOcorrenciaSalvarEnvolvido()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);"><i class="fas fa-save" style="margin-right:6px;"></i> Salvar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cpfModal = document.getElementById("env_cpf");
  if (cpfModal) {
    cpfModal.addEventListener("input", function () {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

  const telefoneModal = document.getElementById("env_telefone");
  if (telefoneModal) {
    telefoneModal.addEventListener("input", function () {
      this.value = aplicarMascaraTelefone(this.value);
    });
  }

  window._novaOcorrenciaSalvarEnvolvido = function () {
    const tipo = document.getElementById("env_tipo")?.value;
    const nome = document.getElementById("env_nome")?.value?.trim();
    if (!tipo || !nome) {
      appInstance.showToast("Preencha o tipo e o nome do envolvido", "warning");
      return;
    }

    const envolvido = {
      id: crypto.randomUUID ? crypto.randomUUID() : gerarUUID(),
      tipo,
      nome_completo: nome,
      cpf: document.getElementById("env_cpf")?.value || "",
      telefone: document.getElementById("env_telefone")?.value || "",
      observacoes: document.getElementById("env_observacoes")?.value || "",
    };
    const checkbox = document.getElementById("env_coletar_assinatura");
    const canvas = document.getElementById("canvasAssinaturaEnvolvido");
    let assinatura = null;
    if (checkbox?.checked) {
      if (!canvas || canvas.dataset.hasUserInk !== "true") {
        appInstance.showToast("Desenhe a assinatura ou desmarque a coleta opcional", "warning");
        return;
      }
      assinatura = {
        id: crypto.randomUUID ? crypto.randomUUID() : gerarUUID(),
        envolvido_id: envolvido.id,
        tipo: envolvido.tipo,
        nome: envolvido.nome_completo,
        cpf: envolvido.cpf || null,
        assinatura_data_url: canvas.toDataURL("image/png"),
        assinado_em: globalThis.obterTimestampBrasilSemFuso(),
        assinado_por: authManager.getUserId(),
        nome_guarda: authManager.getUser()?.nome_completo || "Desconhecido",
        metodo: "captura_manuscrita_em_tela",
      };
    }

    estado.dados.envolvidos.push(envolvido);
    estado.dados.envolvidosMap[envolvido.id] = envolvido;
    if (assinatura) estado.dados.assinaturas.push(assinatura);
    marcarRascunhoPendente(appInstance);

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
    const container = document.getElementById("page-nova-ocorrencia");
    if (container) renderizarFormularioCompleto(container, appInstance);
    appInstance.showToast(assinatura ? "Envolvido cadastrado e assinatura vinculada" : "Envolvido adicionado sem assinatura", "success");


  };
}

// ============================================
// ENVOLVIDOS - REMOVER
// ============================================

function removerEnvolvido(index, appInstance) {
  const envolvido = estado.dados.envolvidos[index];
  if (!envolvido) return;

  // Verificar se o envolvido já assinou
  const jaAssinou = estado.dados.assinaturas.some(
    (a) => a.envolvido_id === envolvido.id,
  );

  if (jaAssinou) {
    appInstance.showToast(
      "Este envolvido já assinou. Remova a assinatura primeiro.",
      "warning",
    );
    return;
  }

  estado.dados.envolvidos.splice(index, 1);
  delete estado.dados.envolvidosMap[envolvido.id];
  marcarRascunhoPendente(appInstance);

  const container = document.getElementById("page-nova-ocorrencia");
  if (container) renderizarFormularioCompleto(container, appInstance);
  appInstance.showToast("Envolvido removido", "info");
}

// ============================================
// 🔥 ALTERADO: ANEXOS - PROCESSAR (SEM LIMITE)
// ============================================

async function processarAnexos(files, appInstance) {
  const anexos = estado.dados.anexos || [];

  for (const file of files) {
    try {
      const tipo = determinarTipoAnexo(file);

      if (tipo === "image") {
        appInstance.showToast(`Comprimindo ${file.name}...`, "info");
        const fotoComprimida = await window.utils.comprimirImagem(
          file,
          800,
          0.7,
        );
        const hash = await window.utils.gerarHashArquivo(fotoComprimida);

        anexos.push({
          nome: file.name,
          tipo: tipo,
          tamanho: fotoComprimida.size,
          arquivo: fotoComprimida,
          hash_pericial: hash,
        });
      } else {
        if (file.size > 10485760) {
          appInstance.showToast(`Arquivo ${file.name} excede 10MB`, "warning");
          continue;
        }
        anexos.push({
          nome: file.name,
          tipo: tipo,
          tamanho: file.size,
          arquivo: file,
        });
      }
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
      appInstance.showToast(`Erro ao processar ${file.name}`, "error");
    }
  }

  estado.dados.anexos = anexos;
  if (estado.modo === MODE_COMPLETO && !estado.isCompletando) marcarRascunhoPendente(appInstance);
  else appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("page-nova-ocorrencia");
  if (container) renderizarFormularioCompleto(container, appInstance);
  appInstance.showToast(`${files.length} anexo(s) adicionado(s)`, "success");

  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
}

// ============================================
// ANEXOS - REMOVER
// ============================================

function removerAnexo(index, appInstance) {
  estado.dados.anexos.splice(index, 1);
  if (estado.modo === MODE_COMPLETO && !estado.isCompletando) marcarRascunhoPendente(appInstance);
  else appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("page-nova-ocorrencia");
  if (container) renderizarFormularioCompleto(container, appInstance);
  appInstance.showToast("Anexo removido", "info");
}

// ============================================
// 🔥 CORRIGIDO: FINALIZAR OCORRÊNCIA (COM DATA/HORA ENCERRAMENTO DA ETAPA 7)
// ============================================

async function enfileirarRetentativaOcorrencia(ocorrencia, envolvidos = [], anexos = [], guardasParticipantes = [], assinaturas = []) {
  if (!ocorrencia?.id || !window.syncManager?.addToQueue) return false;
  try {
    const bundle = {
      ocorrencia: { ...ocorrencia, status: "pending_sync" },
      envolvidos,
      anexos,
      guardasParticipantes,
      assinaturas,
    };
    const idempotencyKey = `ocorrencia:${ocorrencia.id}:${ocorrencia.atualizado_em || ocorrencia.criado_em || "pendente"}`;
    await window.syncManager.addToQueue(bundle, "ocorrencia", 0, { idempotencyKey });
    return true;
  } catch (error) {
    console.warn("Não foi possível enfileirar a retentativa da ocorrência:", error?.message || error);
    return false;
  }
}

async function finalizarOcorrencia(container, appInstance) {
  salvarDadosEtapa();

  const dados = estado.dados;

  const idsEnvolvidosAssinaveis = new Set((dados.envolvidos || []).map((env) => env.id));
  const assinaturaSemEnvolvido = (dados.assinaturas || []).some(
    (assinatura) => !assinatura.envolvido_id || !idsEnvolvidosAssinaveis.has(assinatura.envolvido_id),
  );
  if (assinaturaSemEnvolvido) {
    appInstance.showToast("Há uma assinatura sem vínculo válido com um envolvido. Revise a pessoa na etapa de envolvidos; a coleta continua opcional.", "warning");
    estado.etapa = 4;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (!dados.forma_solicitacao) {
    appInstance.showToast("Selecione a forma de solicitação", "warning");
    estado.etapa = 1;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (!dados.tipo_ocorrencia) {
    appInstance.showToast("Selecione o tipo de ocorrência", "warning");
    estado.etapa = 2;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (!dados.local_ocorrencia || dados.local_ocorrencia.trim() === "") {
    appInstance.showToast("Informe o local da ocorrência", "warning");
    estado.etapa = 2;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (!dados.data_hora_inicio || dados.data_hora_inicio === "") {
    appInstance.showToast("Informe a data e hora do início", "warning");
    estado.etapa = 2;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (!dados.observacoes || dados.observacoes.trim().length < 10) {
    appInstance.showToast(
      "Descreva o ocorrido com pelo menos 10 caracteres",
      "warning",
    );
    estado.etapa = 5;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  // 🔥 NOVO: Validar data/hora encerramento da etapa 7
  if (!dados.data_hora_encerramento || dados.data_hora_encerramento === "") {
    // Preencher automaticamente se estiver vazio
    dados.data_hora_encerramento = obterDataHoraLocalInput();
  }

  if (!equipeTemMinima(dados.guardasParticipantes)) {
    appInstance.showToast("A equipe precisa incluir o responsável pelo registro e pelo menos um GM de apoio na etapa de equipe", "warning");
    estado.etapa = 3;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (dados.envolvidos.length === 0) {
    const confirmado = await appInstance.confirmar(
      "Nenhum envolvido cadastrado. Deseja continuar assim?",
    );
    if (!confirmado) {
      estado.etapa = 4;
      renderizarFormularioCompleto(container, appInstance);
      return;
    }
  }

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar esta ocorrência? Após finalizar, não será mais possível editar.",
  );
  if (!confirmado) return;

  const envolvidos = dados.envolvidos || [];
  const guardas = dados.guardasParticipantes || [];
  const anexos = dados.anexos || [];
  const assinaturas = dados.assinaturas || [];

  const dadosParaSalvar = { ...dados };
  delete dadosParaSalvar.guardasParticipantes;
  delete dadosParaSalvar.envolvidos;
  delete dadosParaSalvar.anexos;
  delete dadosParaSalvar.assinaturas_objeto;

  // 🔥 Garantir que assinaturas seja um array com envolvido_id
  dadosParaSalvar.assinaturas = assinaturas || [];

  // 🔥 CORRIGIDO: Usar o valor do dispositivo SEM ajuste de fuso
  if (dadosParaSalvar.data_hora_inicio) {
    try {
      const dateObj = new Date(dadosParaSalvar.data_hora_inicio);
      if (!isNaN(dateObj.getTime())) {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const hours = String(dateObj.getHours()).padStart(2, "0");
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");
        const seconds = String(dateObj.getSeconds()).padStart(2, "0");
        dadosParaSalvar.data_hora_inicio = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      } else {
        const agora = await utils.obterDataHoraInput();
        dadosParaSalvar.data_hora_inicio = agora;
      }
    } catch (e) {
      const agora = await utils.obterDataHoraInput();
      dadosParaSalvar.data_hora_inicio = agora;
    }
  }

  // 🔥 NOVO: Data/hora encerramento da etapa 7
  if (dadosParaSalvar.data_hora_encerramento) {
    try {
      const dateObj = new Date(dadosParaSalvar.data_hora_encerramento);
      if (!isNaN(dateObj.getTime())) {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const hours = String(dateObj.getHours()).padStart(2, "0");
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");
        const seconds = String(dateObj.getSeconds()).padStart(2, "0");
        dadosParaSalvar.data_hora_encerramento = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      }
    } catch (e) {
      dadosParaSalvar.data_hora_encerramento = null;
    }
  }

  // 🔥 NOVO: Data/hora de finalização
  const agora = new Date();
  const year = agora.getFullYear();
  const month = String(agora.getMonth() + 1).padStart(2, "0");
  const day = String(agora.getDate()).padStart(2, "0");
  const hours = String(agora.getHours()).padStart(2, "0");
  const minutes = String(agora.getMinutes()).padStart(2, "0");
  const seconds = String(agora.getSeconds()).padStart(2, "0");
  const dataFinalizacao = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  dadosParaSalvar.data_hora_finalizacao = dataFinalizacao;

  let localizacao = await appInstance.obterLocalizacao({ timeout: 5000 });
  if (
    !localizacao.latitude &&
    window.sessionManager &&
    window.sessionManager.ultimaLocalizacao
  ) {
    localizacao = window.sessionManager.ultimaLocalizacao;
  }

  const result = await ocorrenciaManager.criar({
    ...dadosParaSalvar,
    modo_criacao: MODE_COMPLETO,
    status: navigator.onLine ? "synced" : "pending_sync",
    latitude: localizacao.latitude,
    longitude: localizacao.longitude,
  });

  if (!result.success) {
    appInstance.showToast(
      "Erro ao salvar ocorrência: " + result.error,
      "error",
    );
    return;
  }

  const ocorrenciaId = result.data.id;
  let erros = [];

  const guardasResult = await ocorrenciaManager.salvarGuardas(ocorrenciaId, guardas);
  if (!guardasResult.success) {
    erros.push("Erro ao salvar equipe: " + guardasResult.error);
  }

  if (envolvidos.length > 0) {
    const envResult = await ocorrenciaManager.salvarEnvolvidos(
      ocorrenciaId,
      envolvidos,
      true,
    );
    if (!envResult.success)
      erros.push("Erro ao salvar envolvidos: " + envResult.error);
  }

  if (anexos.length > 0) {
    const anexoResult = await ocorrenciaManager.salvarAnexos(
      ocorrenciaId,
      anexos,
    );
    if (!anexoResult.success)
      erros.push("Erro ao salvar anexos: " + anexoResult.error);
  }

  // 🔥 Assinaturas já foram salvas com a ocorrência (campo assinaturas)

  if (erros.length > 0) {
    const enfileirado = await enfileirarRetentativaOcorrencia(
      result.data, envolvidos, anexos, guardas, assinaturas,
    );
    if (!enfileirado) {
      appInstance.showToast("Ocorrência permanece pendente; falhas: " + erros.join(" | "), "warning");
      return;
    }
    appInstance.showToast("Ocorrência salva; itens complementares pendentes serão sincronizados automaticamente.", "warning");
  } else {
    const finalizacao = await ocorrenciaManager.finalizarPendenteSync(ocorrenciaId);
    if (!finalizacao.success) {
      const enfileirado = await enfileirarRetentativaOcorrencia(
        result.data, envolvidos, anexos, guardas, assinaturas,
      );
      if (!enfileirado) {
        appInstance.showToast("Ocorrência salva, mas permanece pendente de finalização.", "warning");
        return;
      }
      appInstance.showToast("Ocorrência salva; finalização será tentada novamente.", "warning");
    } else {
      appInstance.showToast("Ocorrência finalizada com sucesso!", "success");
    }
  }

  await authManager.logCriarOcorrencia(authManager.getUserId(), ocorrenciaId);

  if (appInstance.rascunhoId) {
    try {
      const client = supabaseClient.getClient();
      if (client) {
        await client
          .from("ocorrencias")
          .delete()
          .eq("id", appInstance.rascunhoId);
        await client
          .from("envolvidos")
          .delete()
          .eq("ocorrencia_id", appInstance.rascunhoId);
        await client
          .from("anexos")
          .delete()
          .eq("ocorrencia_id", appInstance.rascunhoId);
      }
      appInstance.rascunhoId = null;
      appInstance.dadosRascunho = null;
    } catch (e) {
      console.warn("Erro ao limpar rascunho:", e);
    }
  }

  resetarEstado();
  setTimeout(() => appInstance.navigateTo("ocorrencias"), 1500);
}

// ============================================
// FUNÇÕES AUXILIARES (MANTIDAS)
// ============================================

function getTipoEnvolvidoLabel(tipo) {
  const tipos = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
    outro: "Outro",
  };
  return tipos[tipo] || tipo;
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

function getIconAnexo(tipo) {
  const icons = {
    image: "fa-image",
    video: "fa-video",
    document: "fa-file-pdf",
    audio: "fa-music",
  };
  return icons[tipo] || "fa-file";
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatarDataHoraLocal(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aplicarMascaraCPF(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 3) return limpo;
  if (limpo.length <= 6) return limpo.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (limpo.length <= 9)
    return limpo.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

function aplicarMascaraTelefone(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 2) return `(${limpo}`;
  if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
  if (limpo.length <= 10)
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
}

function determinarTipoAnexo(file) {
  const type = file.type;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || type.includes("document"))
    return "document";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

function gerarUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function renderAcessoNegado(appInstance) {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;"><i class="fas fa-user-slash"></i></div>
      <p style="font-weight:500;">Usuário não autenticado</p>
      <button onclick="window.app.navigateTo('login')" class="btn-primary" style="margin-top:16px;max-width:200px;">Fazer Login</button>
    </div>
  `;
}

// ============================================
// RENDERIZAR FORMULÁRIO COMPLETAR (MANTIDO)
// ============================================

async function salvarCompletarRapido(appInstance) {
  const id = estado.id;
  if (!id) {
    appInstance.showToast("ID da ocorrência não encontrado", "error");
    return;
  }

  const guardas = estado.dados.guardasParticipantes || [];
  const dadosAtualizados = {
    forma_solicitacao:
      document.getElementById("completar_forma_solicitacao")?.value || "",
    cpf_solicitante: document.getElementById("completar_cpf")?.value || "",
    telefone_solicitante:
      document.getElementById("completar_telefone")?.value || "",
    endereco_solicitante:
      document.getElementById("completar_endereco")?.value || "",
    bairro_solicitante:
      document.getElementById("completar_bairro")?.value || "",
    rodovia: document.getElementById("completar_rodovia")?.value || "",
    data_hora_encerramento:
      document.getElementById("completar_encerramento")?.value || null,
    envolvidos: estado.dados.envolvidos || [],
    anexos: estado.dados.anexos || [],
    assinaturas: estado.dados.assinaturas || [],
    status: "pending_sync",
  };

  delete dadosAtualizados.envolvidos;
  delete dadosAtualizados.anexos;
  delete dadosAtualizados.guardasParticipantes;
  delete dadosAtualizados.assinaturas_objeto;

  if (estado.dadosOriginais) {
    const dadosComparacao = { ...dadosAtualizados };
    delete dadosComparacao.status;
    const alteracoes = compararObjetos(estado.dadosOriginais, dadosComparacao);
    if (Object.keys(alteracoes).length === 0) {
      appInstance.showToast("Nenhuma alteração detectada", "info");
      return;
    }
  }

  try {
    appInstance.showToast("Salvando alterações...", "info");

    delete dadosAtualizados.guardasParticipantes;
    const result = await ocorrenciaManager.atualizar(id, dadosAtualizados);
    if (!result.success) {
      appInstance.showToast("Erro ao salvar: " + result.error, "error");
      return;
    }

    const envolvidos = estado.dados.envolvidos || [];
    const anexos = estado.dados.anexos || [];
    const errosFilhos = [];
    if (envolvidos.length > 0) {
      const envResult = await ocorrenciaManager.salvarEnvolvidos(id, envolvidos);
      if (!envResult.success) errosFilhos.push("envolvidos: " + envResult.error);
    }
    const guardasResult = await ocorrenciaManager.salvarGuardas(id, guardas);
    if (!guardasResult.success) errosFilhos.push("equipe: " + guardasResult.error);
    if (anexos.length > 0) {
      const anexoResult = await ocorrenciaManager.salvarAnexos(id, anexos);
      if (!anexoResult.success) errosFilhos.push("anexos: " + anexoResult.error);
    }

    const ocorrenciaPendente = result.data || { ...dadosAtualizados, id, criado_por: authManager.getUserId(), status: "pending_sync" };
    if (errosFilhos.length) {
      const enfileirado = await enfileirarRetentativaOcorrencia(ocorrenciaPendente, envolvidos, anexos, guardas, dadosAtualizados.assinaturas || []);
      if (!enfileirado) {
        appInstance.showToast("Alterações permanecem pendentes; falhas: " + errosFilhos.join(" | "), "warning");
        return;
      }
      appInstance.showToast("Alterações salvas; itens complementares pendentes serão sincronizados automaticamente.", "warning");
    } else {
      const finalizacao = await ocorrenciaManager.finalizarPendenteSync(id);
      if (!finalizacao.success) {
        const enfileirado = await enfileirarRetentativaOcorrencia(ocorrenciaPendente, envolvidos, anexos, guardas, dadosAtualizados.assinaturas || []);
        if (!enfileirado) {
          appInstance.showToast("Alterações permanecem pendentes de finalização.", "warning");
          return;
        }
        appInstance.showToast("Alterações salvas; finalização será tentada novamente.", "warning");
      } else {
        appInstance.showToast("Alterações salvas com sucesso!", "success");
      }
    }

    estado.dadosOriginais = JSON.parse(JSON.stringify(estado.dados));
    appInstance.alteracoesNaoSalvas = false;

    const container = document.getElementById("page-nova-ocorrencia");
    if (container) renderizarFormularioCompletar(container, appInstance);
  } catch (error) {
    console.error("Erro ao salvar:", error);
    appInstance.showToast("Erro ao salvar: " + error.message, "error");
  }
}

async function finalizarCompletarRapido(appInstance) {
  const id = estado.id;
  if (!id) {
    appInstance.showToast("ID da ocorrência não encontrado", "error");
    return;
  }

  const forma = document.getElementById("completar_forma_solicitacao")?.value;
  if (!forma) {
    appInstance.showToast("Selecione a forma de solicitação", "warning");
    estado.abaAtiva = "dados";
    const container = document.getElementById("page-nova-ocorrencia");
    if (container) renderizarFormularioCompletar(container, appInstance);
    return;
  }

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar e tornar esta ocorrência COMPLETA?\n\nApós finalizar, só poderá ser editada via retificação.",
  );
  if (!confirmado) return;

  try {
    appInstance.showToast("Finalizando...", "info");

    const agora = new Date();
    const year = agora.getFullYear();
    const month = String(agora.getMonth() + 1).padStart(2, "0");
    const day = String(agora.getDate()).padStart(2, "0");
    const hours = String(agora.getHours()).padStart(2, "0");
    const minutes = String(agora.getMinutes()).padStart(2, "0");
    const seconds = String(agora.getSeconds()).padStart(2, "0");
    const dataFinalizacao = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    const dadosAtualizados = {
      forma_solicitacao:
        document.getElementById("completar_forma_solicitacao")?.value || "",
      cpf_solicitante: document.getElementById("completar_cpf")?.value || "",
      telefone_solicitante:
        document.getElementById("completar_telefone")?.value || "",
      endereco_solicitante:
        document.getElementById("completar_endereco")?.value || "",
      bairro_solicitante:
        document.getElementById("completar_bairro")?.value || "",
      rodovia: document.getElementById("completar_rodovia")?.value || "",
      data_hora_encerramento:
        document.getElementById("completar_encerramento")?.value || null,
      envolvidos: estado.dados.envolvidos || [],
      anexos: estado.dados.anexos || [],
      assinaturas: estado.dados.assinaturas || [],
      modo_criacao: MODE_COMPLETO,
      completado_em: dataFinalizacao,
      completado_por: authManager.getUserId(),
      data_hora_finalizacao: dataFinalizacao,
      status: "pending_sync",
    };

    delete dadosAtualizados.assinaturas_objeto;
    delete dadosAtualizados.envolvidos;
    delete dadosAtualizados.anexos;

    const result = await ocorrenciaManager.atualizar(id, dadosAtualizados);
    if (!result.success) {
      appInstance.showToast("Erro ao finalizar: " + result.error, "error");
      return;
    }

    const envolvidos = estado.dados.envolvidos || [];
    const anexos = estado.dados.anexos || [];
    const guardas = estado.dados.guardasParticipantes || [];
    const errosFilhos = [];
    if (envolvidos.length > 0) {
      const envResult = await ocorrenciaManager.salvarEnvolvidos(id, envolvidos);
      if (!envResult.success) errosFilhos.push("envolvidos: " + envResult.error);
    }
    const guardasResult = await ocorrenciaManager.salvarGuardas(id, guardas);
    if (!guardasResult.success) errosFilhos.push("equipe: " + guardasResult.error);

    if (anexos.length > 0) {
      const anexoResult = await ocorrenciaManager.salvarAnexos(id, anexos);
      if (!anexoResult.success) errosFilhos.push("anexos: " + anexoResult.error);
    }

    const ocorrenciaPendente = result.data || { ...dadosAtualizados, id, criado_por: authManager.getUserId(), status: "pending_sync" };
    let finalizou = false;
    if (errosFilhos.length) {
      const enfileirado = await enfileirarRetentativaOcorrencia(ocorrenciaPendente, envolvidos, anexos, guardas, dadosAtualizados.assinaturas || []);
      if (!enfileirado) {
        appInstance.showToast("Ocorrência permanece pendente; falhas: " + errosFilhos.join(" | "), "warning");
        return;
      }
      appInstance.showToast("Ocorrência salva; itens complementares pendentes serão sincronizados automaticamente.", "warning");
    } else {
      const finalizacao = await ocorrenciaManager.finalizarPendenteSync(id);
      if (!finalizacao.success) {
        const enfileirado = await enfileirarRetentativaOcorrencia(ocorrenciaPendente, envolvidos, anexos, guardas, dadosAtualizados.assinaturas || []);
        if (!enfileirado) {
          appInstance.showToast("Ocorrência salva, mas permanece pendente de finalização.", "warning");
          return;
        }
        appInstance.showToast("Ocorrência salva; finalização será tentada novamente.", "warning");
      } else {
        finalizou = true;
        appInstance.showToast("Ocorrência completada com sucesso! ✅", "success");
      }
    }

    if (finalizou) await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);

    resetarEstado();
    setTimeout(() => appInstance.navigateTo("ocorrencias"), 1500);
  } catch (error) {
    console.error("Erro ao finalizar:", error);
    appInstance.showToast("Erro ao finalizar: " + error.message, "error");
  }
}

function compararObjetos(obj1, obj2) {
  const diff = {};
  for (const key in obj2) {
    if (obj1[key] !== obj2[key]) {
      diff[key] = { before: obj1[key], after: obj2[key] };
    }
  }
  return diff;
}

function renderizarFormularioCompletar(container, appInstance) {
  const dados = estado.dados;

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-edit" style="margin-right:8px;"></i>
            Completar BO Rápido
          </h2>
          <p style="color:var(--cinza-medio);font-size:12px;margin:0;">
            Adicione informações adicionais ao BO Rápido
          </p>
        </div>
        <button onclick="window.app.navigateTo('ocorrencias')" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-media);">
        <form id="formCompletarRapido" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Forma de Solicitação <span class="required">*</span>
            </label>
            <select id="completar_forma_solicitacao" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;">
              ${FORMAS_SOLICITACAO.map((op) => `<option value="${op.value}" ${dados.forma_solicitacao === op.value ? "selected" : ""}>${op.label}</option>`).join("")}
            </select>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-id-card"></i> CPF do Solicitante
            </label>
            <input type="text" id="completar_cpf" placeholder="123.456.789-00" maxlength="14" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.cpf_solicitante || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-phone"></i> Telefone do Solicitante
            </label>
            <input type="text" id="completar_telefone" placeholder="(44) 99999-9999" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.telefone_solicitante || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-home"></i> Endereço do Solicitante
            </label>
            <input type="text" id="completar_endereco" placeholder="Rua, número, bairro" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.endereco_solicitante || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-location-dot"></i> Bairro do Solicitante
            </label>
            <input type="text" id="completar_bairro" placeholder="Bairro" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.bairro_solicitante || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-road"></i> Rodovia (se aplicável)
            </label>
            <input type="text" id="completar_rodovia" placeholder="BR-123, km 45" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.rodovia || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-calendar-check"></i> Data/Hora Encerramento
            </label>
            <input type="datetime-local" id="completar_encerramento" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;min-height:44px;" value="${dados.data_hora_encerramento || ""}">
          </div>

          <div style="margin-top:16px;display:flex;gap:8px;">
            <button type="button" onclick="window._salvarCompletarRapido()" class="btn-primary" style="flex:1;border-radius:12px;min-height:44px;">
              <i class="fas fa-save"></i> Salvar
            </button>
            <button type="button" onclick="window._finalizarCompletarRapido()" class="btn-success" style="flex:1;border-radius:12px;min-height:44px;">
              <i class="fas fa-check-circle"></i> Finalizar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  window._salvarCompletarRapido = () => salvarCompletarRapido(appInstance);
  window._finalizarCompletarRapido = () =>
    finalizarCompletarRapido(appInstance);

  const cpfInput = document.getElementById("completar_cpf");
  if (cpfInput) {
    cpfInput.addEventListener("input", function () {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

  const telefoneInput = document.getElementById("completar_telefone");
  if (telefoneInput) {
    telefoneInput.addEventListener("input", function () {
      this.value = aplicarMascaraTelefone(this.value);
    });
  }
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderNovaOcorrencia,
};
