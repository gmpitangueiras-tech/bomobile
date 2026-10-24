/**
 * MÓDULO DETALHE OCORRÊNCIA - Visualização completa com abas
 * Guarda Municipal de Pitangueiras - PR
 *
 * Layout com:
 * - Cabeçalho com número, status, dados do guarda, localização e data
 * - Abas: Detalhes, Anexos, Histórico, Gerar PDF
 * - Seções organizadas com cards modernos
 * - Galeria de imagens com carrossel
 * - Timeline de histórico de versões
 * - Exportação de PDF com opções
 * - Barra de ações no final da página
 * - 🔥 NOVO: Aba de Assinaturas separada
 * - 🔥 NOVO: Visualização de assinaturas em cards
 * - 🔥 NOVO: Assinaturas NÃO aparecem na galeria de anexos
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), pdfExport (global), utils, ui
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

const STATUS_ICONS = {
  draft: "📝",
  pending_sync: "⏳",
  synced: "✅",
  cancelled: "❌",
  rectified: "🔄",
  pending_rectification: "⏳",
  rectification_rejected: "❌",
};

const TIPO_CORES = {
  roubo: "badge-tipo-roubo",
  ameaca: "badge-tipo-ameaca",
  lesao_corporal: "badge-tipo-lesao_corporal",
  incendio: "badge-tipo-incendio",
  furto: "badge-tipo-furto",
  vandalismo: "badge-tipo-vandalismo",
  dano_ao_patrimonio: "badge-tipo-dano_ao_patrimonio",
  perturbacao: "badge-tipo-perturbacao",
  acidente: "badge-tipo-acidente",
  desaparecimento: "badge-tipo-desaparecimento",
  atendimento_social: "badge-tipo-atendimento_social",
  flagrante: "badge-tipo-flagrante",
  outro: "badge-tipo-outro",
};

// 🔥 NOVO: Labels para tipos de assinatura
const TIPOS_ASSINATURA_LABELS = {
  autor: "Autor",
  vitima: "Vítima",
  testemunha: "Testemunha",
  solicitante: "Solicitante",
};

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  abaAtiva: "detalhes", // 'detalhes', 'anexos', 'assinaturas', 'historico', 'pdf'
  ocorrencia: null,
  original: null,
  envolvidos: [],
  anexos: [],
  assinaturas: [], // 🔥 NOVO: Array de assinaturas
  camposAlterados: [],
  historico: [],
  carregando: false,
  isRetificacao: false,
  temRetificacoes: false,
  imagensGaleria: [],
  pdfOptions: {
    incluirDados: true,
    incluirEnvolvidos: true,
    incluirObservacoes: true,
    incluirAnexos: true,
    incluirAssinaturas: true, // 🔥 NOVO: Opção para incluir assinaturas no PDF
    incluirHash: true,
    incluirVersoes: true,
    incluirAssinatura: true,
  },
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página de detalhe da ocorrência com layout moderno
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderDetalheOcorrencia(container, appInstance) {
  const id = appInstance.currentParams?.id;

  if (!id) {
    container.innerHTML = renderOcorrenciaNaoEncontrada(appInstance);
    return;
  }

  // Iniciar cada novo acesso no resumo; a aba escolhida não vaza para outro BO.
  estado.abaAtiva = "detalhes";

  // Mostrar loader
  container.innerHTML = renderLoader();

  try {
    estado.carregando = true;

    // Buscar ocorrência
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      container.innerHTML = renderOcorrenciaNaoEncontrada(
        appInstance,
        result.error,
      );
      return;
    }

    estado.ocorrencia = result.data;

    // Buscar envolvidos
    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    estado.envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    // Buscar anexos
    const anexosResult = await ocorrenciaManager.listarAnexos(id);
    estado.anexos = anexosResult.success ? anexosResult.data : [];

    // 🔥 NOVO: Buscar assinaturas (separadas dos anexos)
    const assinaturasResult = await ocorrenciaManager.listarAssinaturas(id);
    estado.assinaturas = assinaturasResult.success
      ? normalizarListaAssinaturas(assinaturasResult.data)
      : [];

    // 🔥 FILTRAR: Processar imagens apenas dos anexos reais (sem assinaturas)
    const anexosReais = estado.anexos.filter((a) => a.tipo !== "assinatura");
    estado.imagensGaleria = anexosReais.filter(
      (a) => a.tipo_arquivo === "image" || a.tipo === "image",
    );

    // Verificar se é retificação
    estado.isRetificacao = estado.ocorrencia.ocorrencia_original_id !== null;
    estado.original = null;

    if (estado.isRetificacao) {
      const origResult = await ocorrenciaManager.buscar(
        estado.ocorrencia.ocorrencia_original_id,
      );
      if (origResult.success) {
        estado.original = origResult.data;
      }
      if (estado.ocorrencia.campos_alterados) {
        try {
          estado.camposAlterados = JSON.parse(
            estado.ocorrencia.campos_alterados,
          );
        } catch (e) {
          estado.camposAlterados = [];
        }
      }
    }

    // Verificar se tem retificações
    estado.temRetificacoes = await ocorrenciaManager.temRetificacoes(id);

    // Buscar histórico completo
    const historicoResult = await ocorrenciaManager.buscarHistorico(id);
    estado.historico = historicoResult.success ? historicoResult.data : [];

    // Buscar dados do criador
    let criadorNome = "Desconhecido";
    let criadorCPF = "";
    if (estado.ocorrencia.criado_por) {
      try {
        const client = supabaseClient.getClient();
        if (client) {
          const { data: criador } = await client
            .from("usuarios")
            .select("nome_completo, cpf")
            .eq("id", estado.ocorrencia.criado_por)
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

    estado.criadorNome = criadorNome;
    estado.criadorCPF = criadorCPF;

    estado.carregando = false;

    // Renderizar
    renderizarDetalhe(container, appInstance);

    // Registrar funções globais
    window._detalheMudarAba = (aba) => mudarAba(aba, container, appInstance);
    window._detalheFinalizar = () => finalizarOcorrencia(appInstance);
    window._detalheCancelar = () => cancelarOcorrencia(appInstance);
    window._detalheSolicitarRetificacao = () =>
      solicitarRetificacao(appInstance);
    window._detalheAprovarRetificacao = () => aprovarRetificacao(appInstance);
    window._detalheRejeitarRetificacao = () => rejeitarRetificacao(appInstance);
    window._detalheEditar = () => editarOcorrencia(appInstance);
    window._detalheGerarPDF = () => gerarPDFCompleto(appInstance);
    window._detalheVoltar = () => appInstance.navigateTo("ocorrencias");
    window._detalheVerImagem = (index) => verImagemGaleria(index, appInstance);
    window._detalheBaixarAnexo = (url, nome) => baixarAnexo(url, nome);
    window._detalheTogglePDFOption = (option) =>
      togglePDFOption(option, container, appInstance);
    // 🔥 NOVO: Função para ver assinatura ampliada
    window._detalheVerAssinatura = (index) =>
      verAssinaturaAmpliada(index, appInstance);
  } catch (error) {
    console.error("❌ Erro ao carregar detalhe:", error);
    estado.carregando = false;
    container.innerHTML = renderErro(error, appInstance);
  }
}

// ============================================
// RENDERIZAÇÃO PRINCIPAL
// ============================================

function renderizarDetalhe(container, appInstance) {
  const occ = estado.ocorrencia;
  if (!occ) {
    container.innerHTML = renderOcorrenciaNaoEncontrada(appInstance);
    return;
  }

  const numero = escapeDetalheHTML(occ.numero_ocorrencia || occ.numero_temporario || "Rascunho");
  const statusClass = getStatusClass(occ.status);
  const statusLabel = escapeDetalheHTML(getStatusLabel(occ.status));
  const tipoLabel = escapeDetalheHTML(getTipoLabel(occ.tipo_ocorrencia));
  const tipoClass = TIPO_CORES[occ.tipo_ocorrencia] || "badge-tipo-outro";
  const dataCriacao = formatarDataHoraLocal(occ.criado_em) || "Não informada";
  const dataInicio = occ.data_hora_inicio ? formatarDataHoraLocal(occ.data_hora_inicio) : "Não informada";
  const dataEncerramento = occ.data_hora_encerramento ? formatarDataHoraLocal(occ.data_hora_encerramento) : "";
  const local = escapeDetalheHTML(occ.local_ocorrencia || "Local não informado");
  const bairro = escapeDetalheHTML(occ.bairro_ocorrencia || "");
  const gravidade = escapeDetalheHTML(occ.gravidade || "");
  const nomeGuarda = escapeDetalheHTML(estado.criadorNome || "Não identificado");
  const coords = occ.latitude !== null && occ.latitude !== undefined && occ.longitude !== null && occ.longitude !== undefined
    ? `${parseFloat(occ.latitude).toFixed(6)}, ${parseFloat(occ.longitude).toFixed(6)}`
    : "";
  const isSupervisor = authManager.isSupervisor();
  const isDraft = occ.status === "draft";
  const isPending = occ.status === "pending_rectification";
  const isSynced = occ.status === "synced";
  const isCancelled = occ.status === "cancelled";
  const podeEditar = authManager.podeEditar(occ);
  const podeFinalizar = authManager.podeFinalizar(occ);
  const podeCancelar = authManager.podeCancelar(occ);
  const podeRetificar = authManager.podeSolicitarRetificacao(occ);
  const totalAnexos = estado.anexos.filter((a) => a.tipo !== "assinatura").length;
  estado.assinaturas = normalizarListaAssinaturas(estado.assinaturas);
  const totalAssinaturas = estado.assinaturas.length;
  const isRapido = occ.modo_criacao === "rapido";

  container.innerHTML = `
    <div class="container bo-detail-page" id="detalheContainer" data-active-tab="${escapeDetalheHTML(estado.abaAtiva)}">
      <header class="bo-detail-backline">
        <button type="button" class="bo-detail-back" onclick="window._detalheVoltar()">
          <i class="fas fa-arrow-left" aria-hidden="true"></i><span>Voltar às ocorrências</span>
        </button>
        <span class="bo-detail-backline__label">DETALHES DO BO</span>
      </header>

      <section class="bo-detail-summary" aria-labelledby="boDetailTitle">
        <div class="bo-detail-summary__heading">
          <div class="bo-detail-summary__identity">
            <span class="bo-detail-eyebrow">BOLETIM DE OCORRÊNCIA</span>
            <h1 id="boDetailTitle">BO #${numero}</h1>
            <div class="bo-detail-summary__badges">
              <span class="badge ${tipoClass} bo-detail-summary__type">${tipoLabel}</span>
              <span class="badge badge-${statusClass} bo-detail-summary__status">${statusLabel}</span>
              ${isRapido ? `<span class="bo-detail-mode"><i class="fas fa-bolt" aria-hidden="true"></i> Modo rápido</span>` : occ.modo_criacao === "completo" ? `<span class="bo-detail-mode bo-detail-mode--complete"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Modo completo</span>` : ""}
              ${occ.numero_versao > 1 ? `<span class="bo-detail-version">Versão ${escapeDetalheHTML(occ.numero_versao)}</span>` : ""}
            </div>
          </div>
          <div class="bo-detail-summary__stamp" aria-hidden="true"><i class="fas fa-file-alt"></i></div>
        </div>

        <div class="bo-detail-summary__facts">
          <div class="bo-detail-fact bo-detail-fact--time">
            <span><i class="fas fa-clock" aria-hidden="true"></i> Data e hora do fato</span>
            <strong>${escapeDetalheHTML(dataInicio)}</strong>
          </div>
          <div class="bo-detail-fact bo-detail-fact--location">
            <span><i class="fas fa-map-marker-alt" aria-hidden="true"></i> Local do fato</span>
            <strong>${local}</strong>
            ${bairro ? `<small>${bairro}</small>` : ""}
          </div>
          ${gravidade ? `<div class="bo-detail-fact"><span><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Gravidade</span><strong>${gravidade}</strong></div>` : ""}
        </div>

        <div class="bo-detail-summary__context">
          <span><i class="fas fa-user-shield" aria-hidden="true"></i><strong>${nomeGuarda}</strong><small>Responsável pelo registro</small></span>
          <span><i class="fas fa-calendar-plus" aria-hidden="true"></i><strong>${escapeDetalheHTML(dataCriacao)}</strong><small>Data do cadastro</small></span>
          ${dataEncerramento ? `<span><i class="fas fa-check-circle" aria-hidden="true"></i><strong>${escapeDetalheHTML(dataEncerramento)}</strong><small>Encerramento</small></span>` : ""}
        </div>
      </section>

      ${isRapido && !occ.completado_em && !isCancelled ? `
        <aside class="bo-detail-notice" role="status">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          <span><strong>Registro em Modo Rápido.</strong> As informações complementares podem estar pendentes.</span>
        </aside>` : ""}

      <nav class="bo-detail-tabs" role="tablist" aria-label="Seções do boletim">
        ${renderAbas(totalAnexos, totalAssinaturas)}
      </nav>

      <main id="abaConteudo" class="bo-detail-tab-content" role="tabpanel">
        ${renderConteudoAba(appInstance)}
      </main>

      ${renderBotoesAcao(occ, { podeEditar, podeFinalizar, podeCancelar, podeRetificar, isSupervisor, isDraft, isPending, isSynced, isCancelled }, appInstance)}
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: ABAS
// ============================================

function renderAbas(totalAnexos, totalAssinaturas) {
  const aba = estado.abaAtiva;
  const abas = [
    { id: "detalhes", label: "Resumo", icon: "fa-file-alt" },
    { id: "anexos", label: `Anexos (${totalAnexos})`, icon: "fa-paperclip" },
    { id: "assinaturas", label: `Assinaturas (${totalAssinaturas})`, icon: "fa-pen-fancy" },
    { id: "historico", label: "Histórico", icon: "fa-history" },
    { id: "pdf", label: "PDF", icon: "fa-file-pdf" },
  ];

  return abas.map((a) => `
    <button type="button" role="tab" aria-selected="${aba === a.id}" aria-controls="abaConteudo"
      onclick="window._detalheMudarAba('${a.id}')" class="aba-btn${aba === a.id ? " is-active" : ""}">
      <i class="fas ${a.icon}" aria-hidden="true"></i><span>${a.label}</span>
    </button>
  `).join("");
}

// ============================================
// RENDERIZAÇÃO: CONTEÚDO DAS ABAS
// ============================================

function renderConteudoAba(appInstance) {
  switch (estado.abaAtiva) {
    case "detalhes":
      return renderAbaDetalhes(appInstance);
    case "anexos":
      return renderAbaAnexos(appInstance);
    case "assinaturas": // 🔥 NOVO: Aba de Assinaturas
      return renderAbaAssinaturas(appInstance);
    case "historico":
      return renderAbaHistorico(appInstance);
    case "pdf":
      return renderAbaPDF(appInstance);
    default:
      return renderAbaDetalhes(appInstance);
  }
}

// ============================================
// BOTÕES DE AÇÃO - IGUAL À IMAGEM
// ============================================

function renderBotoesAcao(occ, perms, appInstance) {
  const { podeEditar, podeFinalizar, podeCancelar, podeRetificar, isSupervisor, isDraft, isPending, isSynced, isCancelled } = perms;
  const principais = [];
  const secundarias = [];

  if (isDraft && podeEditar) {
    const label = occ.modo_criacao === "rapido" && !occ.completado_em ? "Continuar BO" : "Editar ocorrência";
    principais.push({ label, icon: "fa-edit", tone: "primary", action: "window._detalheEditar()" });
  }
  if (isDraft && podeFinalizar) {
    principais.push({ label: "Finalizar BO", icon: "fa-check-circle", tone: "success", action: "window._detalheFinalizar()" });
  }
  if (isPending && isSupervisor) {
    principais.push({ label: "Aprovar retificação", icon: "fa-check", tone: "success", action: "window._detalheAprovarRetificacao()" });
    principais.push({ label: "Rejeitar", icon: "fa-times", tone: "danger", action: "window._detalheRejeitarRetificacao()" });
  }
  if (isSynced && podeRetificar) {
    principais.push({ label: "Solicitar retificação", icon: "fa-sync-alt", tone: "primary", action: "window._detalheSolicitarRetificacao()" });
  }

  if (!isCancelled && podeCancelar) {
    secundarias.push({ label: "Cancelar ocorrência", icon: "fa-times-circle", tone: "danger", action: "window._detalheCancelar()" });
  }

  const botaoPDF = { label: "Gerar PDF", icon: "fa-file-pdf", tone: "secondary", action: "window._detalheGerarPDF()" };
  if (principais.length === 0) principais.push(botaoPDF);
  else secundarias.push(botaoPDF);

  return `
    <section class="bo-detail-actionbar" aria-label="Ações da ocorrência">
      <div class="bo-detail-actionbar__primary">
        ${principais.map((btn) => `
          <button type="button" class="bo-detail-action bo-detail-action--${btn.tone}" onclick="${btn.action}">
            <i class="fas ${btn.icon}" aria-hidden="true"></i><span>${btn.label}</span>
          </button>
        `).join("")}
      </div>
      ${secundarias.length ? `
        <details class="bo-detail-actionbar__more">
          <summary aria-label="Mais ações" title="Mais ações"><i class="fas fa-ellipsis-v" aria-hidden="true"></i><span>Mais</span></summary>
          <div class="bo-detail-actionbar__menu">
            ${secundarias.map((btn) => `
              <button type="button" class="${btn.tone === "danger" ? "is-danger" : ""}" onclick="${btn.action}">
                <i class="fas ${btn.icon}" aria-hidden="true"></i><span>${btn.label}</span>
              </button>
            `).join("")}
          </div>
        </details>` : ""}
    </section>
  `;
}

// ============================================
// ABA: DETALHES
// ============================================

function escapeDetalheHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function safeDetalheImageUrl(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.href);
    return ["https:", "http:", "blob:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function renderCamposDetalhe(campos) {
  const preenchidos = campos.filter((campo) => campo.valor !== null && campo.valor !== undefined && String(campo.valor).trim() !== "");
  if (!preenchidos.length) return `<p class="bo-detail-muted">Nenhum dado complementar informado.</p>`;
  return `<div class="bo-detail-field-grid">${preenchidos.map((campo) => `
    <div class="bo-detail-field"><span>${escapeDetalheHTML(campo.label)}</span><strong>${escapeDetalheHTML(campo.valor)}</strong></div>
  `).join("")}</div>`;
}

function renderAbaDetalhes(appInstance) {
  const occ = estado.ocorrencia;
  if (!occ) return "";

  const obs = String(occ.observacoes || "").trim();
  const dataInicio = occ.data_hora_inicio ? formatarDataHoraLocal(occ.data_hora_inicio) : "";
  const dataEncerramento = occ.data_hora_encerramento ? formatarDataHoraLocal(occ.data_hora_encerramento) : "";
  const dataCadastro = occ.criado_em ? formatarDataHoraLocal(occ.criado_em) : "";
  const coords = occ.latitude !== null && occ.latitude !== undefined && occ.longitude !== null && occ.longitude !== undefined
    ? `${parseFloat(occ.latitude).toFixed(6)}, ${parseFloat(occ.longitude).toFixed(6)}`
    : "";
  const anexosReais = estado.anexos.filter((a) => a.tipo !== "assinatura");
  const imagens = estado.imagensGaleria;
  const documentos = anexosReais.filter((a) => a.tipo_arquivo !== "image" && a.tipo !== "image");

  const camposSolicitacao = [
    { label: "Forma de solicitação", valor: occ.forma_solicitacao },
    { label: "Nome do solicitante", valor: occ.nome_solicitante },
    { label: "CPF do solicitante", valor: occ.cpf_solicitante },
    { label: "RG do solicitante", valor: occ.rg_solicitante },
    { label: "Telefone do solicitante", valor: occ.telefone_solicitante },
    { label: "Endereço do solicitante", valor: occ.endereco_solicitante },
    { label: "Bairro do solicitante", valor: occ.bairro_solicitante },
    { label: "Complemento", valor: occ.complemento },
    { label: "Código municipal", valor: occ.codigo_municipal },
    { label: "Identificação adicional", valor: occ.identificacao_adicional },
  ];
  const camposRegistro = [
    { label: "Tipo de ocorrência", valor: getTipoLabel(occ.tipo_ocorrencia) },
    { label: "Local da ocorrência", valor: occ.local_ocorrencia },
    { label: "Rodovia", valor: occ.rodovia },
    { label: "Bairro da ocorrência", valor: occ.bairro_ocorrencia },
    { label: "Ponto de referência", valor: occ.referencia },
    { label: "Código operacional", valor: occ.codigo_operacional },
    { label: "Data e hora do fato", valor: dataInicio },
    { label: "Data e hora do encerramento", valor: dataEncerramento },
    { label: "Data do cadastro", valor: dataCadastro },
    { label: "Coordenadas", valor: coords },
  ];

  const envolvidos = estado.envolvidos || [];
  const htmlEnvolvidos = envolvidos.length ? envolvidos.map((env) => {
    const tipo = String(env.tipo || "");
    const dados = [
      { label: "CPF", valor: env.cpf },
      { label: "Telefone", valor: env.telefone },
      { label: "RG", valor: env.rg },
      { label: "Nascimento", valor: env.data_nascimento ? new Date(env.data_nascimento).toLocaleDateString("pt-BR") : "" },
    ].filter((item) => item.valor);
    return `
      <article class="bo-detail-person" data-role="${escapeDetalheHTML(tipo)}">
        <div class="bo-detail-person__heading">
          <span class="bo-detail-person__role">${escapeDetalheHTML(getTipoEnvolvidoLabel(tipo))}</span>
          <strong>${escapeDetalheHTML(env.nome_completo || "Nome não informado")}</strong>
        </div>
        ${dados.length ? `<div class="bo-detail-person__facts">${dados.map((item) => `<span><small>${escapeDetalheHTML(item.label)}</small>${escapeDetalheHTML(item.valor)}</span>`).join("")}</div>` : ""}
        ${env.observacoes ? `<p class="bo-detail-person__note">${escapeDetalheHTML(env.observacoes)}</p>` : ""}
      </article>`;
  }).join("") : `<div class="bo-detail-empty"><i class="fas fa-user-group" aria-hidden="true"></i><span>Nenhum envolvido informado neste BO.</span></div>`;

  const htmlImagens = imagens.length ? `
    <div class="bo-detail-evidence__gallery" aria-label="Prévia das fotos do BO">
      ${imagens.slice(0, 3).map((img, index) => {
        const url = safeDetalheImageUrl(img.url_thumb || img.url);
        return `<button type="button" class="bo-detail-evidence__photo" onclick="window._detalheVerImagem(${index})" aria-label="Abrir foto ${index + 1} de ${imagens.length}">
          ${url ? `<img src="${escapeDetalheHTML(url)}" alt="Foto ${index + 1} do BO" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}
          <span class="bo-detail-evidence__placeholder" ${url ? "hidden" : ""}><i class="fas fa-image" aria-hidden="true"></i></span>
          ${index === 2 && imagens.length > 3 ? `<span class="bo-detail-evidence__overflow">+${imagens.length - 3}</span>` : ""}
        </button>`;
      }).join("")}
    </div>
    <div class="bo-detail-evidence__actions">
      <button type="button" onclick="window._detalheVerImagem(0)"><i class="fas fa-expand" aria-hidden="true"></i> Ver todas as fotos (${imagens.length})</button>
      <button type="button" onclick="window._detalheMudarAba('anexos')"><i class="fas fa-paperclip" aria-hidden="true"></i> Anexos${documentos.length ? ` e documentos (${documentos.length})` : ""}</button>
    </div>
  ` : `
    <div class="bo-detail-empty"><i class="fas fa-paperclip" aria-hidden="true"></i><span>${anexosReais.length ? `${anexosReais.length} anexo(s), sem fotos.` : "Nenhuma evidência anexada."}</span></div>
    <div class="bo-detail-evidence__actions"><button type="button" onclick="window._detalheMudarAba('anexos')"><i class="fas fa-paperclip" aria-hidden="true"></i> Abrir anexos${documentos.length ? ` (${documentos.length})` : ""}</button></div>
  `;

  let html = `
    <div class="bo-detail-read-flow">
      <section class="bo-detail-section bo-detail-narrative" aria-labelledby="boNarrativeTitle">
        <div class="bo-detail-section__heading"><span class="bo-detail-section__icon"><i class="fas fa-align-left" aria-hidden="true"></i></span><div><h2 id="boNarrativeTitle">Relato da ocorrência</h2><p>Descrição registrada no boletim</p></div></div>
        ${obs ? `<div class="bo-detail-narrative__text">${escapeDetalheHTML(obs)}</div>` : `<div class="bo-detail-empty"><i class="fas fa-file-lines" aria-hidden="true"></i><span>Não há observações adicionais neste registro.</span></div>`}
      </section>

      <section class="bo-detail-section" aria-labelledby="boPeopleTitle">
        <div class="bo-detail-section__heading"><span class="bo-detail-section__icon bo-detail-section__icon--green"><i class="fas fa-users" aria-hidden="true"></i></span><div><h2 id="boPeopleTitle">Pessoas envolvidas <span class="bo-detail-count">${envolvidos.length}</span></h2><p>Identificação por papel na ocorrência</p></div></div>
        <div class="bo-detail-people">${htmlEnvolvidos}</div>
      </section>

      <section class="bo-detail-section bo-detail-evidence" aria-labelledby="boEvidenceTitle">
        <div class="bo-detail-section__heading"><span class="bo-detail-section__icon"><i class="fas fa-images" aria-hidden="true"></i></span><div><h2 id="boEvidenceTitle">Evidências <span class="bo-detail-count">${anexosReais.length}</span></h2><p>${imagens.length} ${imagens.length === 1 ? "foto" : "fotos"}${documentos.length ? ` · ${documentos.length} ${documentos.length === 1 ? "documento" : "documentos"}` : ""}</p></div></div>
        ${htmlImagens}
      </section>

      <details class="bo-detail-section bo-detail-complementary">
        <summary><span class="bo-detail-section__icon"><i class="fas fa-list-check" aria-hidden="true"></i></span><span class="bo-detail-complementary__label"><strong>Dados complementares</strong><small>Solicitação, localização e registro</small></span><i class="fas fa-chevron-down bo-detail-complementary__chevron" aria-hidden="true"></i></summary>
        <div class="bo-detail-complementary__content">
          ${camposSolicitacao.some((c) => c.valor !== null && c.valor !== undefined && String(c.valor).trim() !== "") ? `<section><h3>Dados da solicitação</h3>${renderCamposDetalhe(camposSolicitacao)}</section>` : ""}
          <section><h3>Dados técnicos e de localização</h3>${renderCamposDetalhe(camposRegistro)}</section>
          ${occ.hash_pericial ? `<section class="bo-detail-integrity"><h3><i class="fas fa-fingerprint" aria-hidden="true"></i> Integridade do registro</h3><code title="Hash SHA-256 completo">SHA-256 · ${escapeDetalheHTML(occ.hash_pericial)}</code></section>` : ""}
        </div>
      </details>

      ${estado.isRetificacao && estado.camposAlterados.length ? `
        <section class="bo-detail-section bo-detail-amendment" aria-labelledby="boAmendmentTitle">
          <div class="bo-detail-section__heading"><span class="bo-detail-section__icon bo-detail-section__icon--amber"><i class="fas fa-sync-alt" aria-hidden="true"></i></span><div><h2 id="boAmendmentTitle">Alterações da retificação</h2><p>Comparação com os dados anteriores</p></div></div>
          <div class="bo-detail-amendment__list">${estado.camposAlterados.map((campo) => `
            <div class="bo-detail-amendment__row"><strong>${escapeDetalheHTML(campo.label || campo.campo)}</strong><div><span>${escapeDetalheHTML(campo.antes || "(vazio)")}</span><i class="fas fa-arrow-right" aria-hidden="true"></i><b>${escapeDetalheHTML(campo.depois || "(vazio)")}</b></div></div>
          `).join("")}</div>
          ${occ.justificativa_retificacao ? `<p class="bo-detail-amendment__reason"><strong>Justificativa:</strong> ${escapeDetalheHTML(occ.justificativa_retificacao)}</p>` : ""}
        </section>` : ""}
    </div>
  `;
  return html;
}

// ============================================
// 🔥 NOVO: ABA: ASSINATURAS
// ============================================

function normalizarListaAssinaturas(valor) {
  let lista = valor;
  if (typeof lista === "string") {
    const texto = lista.trim();
    if (!texto) return [];
    try {
      lista = JSON.parse(texto);
    } catch (error) {
      return [];
    }
  }

  const isRegistroAssinatura = (item) => item && typeof item === "object" && !Array.isArray(item) && (
    "assinatura_data_url" in item || "signature_data_url" in item || "envolvido_id" in item ||
    ("nome" in item && "assinado_em" in item)
  );

  if (Array.isArray(lista)) return lista.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  if (!lista || typeof lista !== "object") return [];

  for (const chave of ["assinaturas", "data", "items", "registros"]) {
    if (Object.prototype.hasOwnProperty.call(lista, chave) && lista[chave] !== lista) {
      const normalizadas = normalizarListaAssinaturas(lista[chave]);
      if (normalizadas.length || Array.isArray(lista[chave]) || typeof lista[chave] === "string") return normalizadas;
    }
  }

  if (isRegistroAssinatura(lista)) return [lista];
  const valores = Object.values(lista);
  if (valores.length && valores.every(isRegistroAssinatura)) return valores;
  return [];
}

function renderAbaAssinaturas(appInstance) {
  const assinaturas = normalizarListaAssinaturas(estado.assinaturas);
  estado.assinaturas = assinaturas;

  if (assinaturas.length === 0) {
    return `
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:8px;">
          <i class="fas fa-pen-fancy"></i>
        </div>
        <p style="font-weight:500;">Nenhuma assinatura coletada</p>
        <p style="font-size:12px;">Esta ocorrência não possui assinaturas registradas.</p>
      </div>
    `;
  }

  let html = `
    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
      <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-pen-fancy" style="font-size:14px;"></i>
        Assinaturas (${assinaturas.length})
      </h4>
      <p style="font-size:12px;color:var(--cinza-medio);margin-bottom:12px;">
        Assinaturas coletadas dos envolvidos durante o registro da ocorrência.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  `;

  assinaturas.forEach((ass, index) => {
    const tipoLabel = TIPOS_ASSINATURA_LABELS[ass.tipo] || ass.tipo;
    const dataAssinatura = ass.assinado_em
      ? formatarDataHoraLocal(ass.assinado_em)
      : "Data não informada";
    const nomeGuarda = ass.nome_guarda || "Desconhecido";

    html += `
      <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:12px;border:1px solid var(--cinza-claro);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="badge badge-azul" style="font-size:10px;padding:2px 12px;">${tipoLabel}</span>
          <span style="font-size:10px;color:var(--cinza-medio);">${dataAssinatura}</span>
        </div>
        <div style="font-weight:600;font-size:14px;color:var(--cinza-escuro);">${ass.nome}</div>
        ${ass.cpf ? `<div style="font-size:12px;color:var(--cinza-medio);">${ass.cpf}</div>` : ""}
        <div style="font-size:10px;color:var(--cinza-medio);margin-top:4px;">
          <i class="fas fa-user-shield"></i> Coletada por: ${nomeGuarda}
        </div>
        <div style="margin-top:8px;border-top:1px solid var(--cinza-claro);padding-top:8px;text-align:center;">
          <img src="${ass.assinatura_data_url}" alt="Assinatura de ${ass.nome}" 
            style="max-width:100%;max-height:80px;border:1px solid var(--cinza-claro);border-radius:4px;cursor:pointer;"
            onclick="window._detalheVerAssinatura(${index})">
          <div style="font-size:9px;color:var(--cinza-medio);margin-top:2px;">
            <i class="fas fa-hand-pointer"></i> Clique para ampliar
          </div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

// ============================================
// 🔥 NOVO: VER ASSINATURA AMPLIADA
// ============================================

function verAssinaturaAmpliada(index, appInstance) {
  const assinaturas = normalizarListaAssinaturas(estado.assinaturas);
  estado.assinaturas = assinaturas;
  if (index < 0 || index >= assinaturas.length) {
    appInstance.showToast("Assinatura não encontrada", "error");
    return;
  }

  const ass = assinaturas[index];
  const tipoLabel = TIPOS_ASSINATURA_LABELS[ass.tipo] || ass.tipo;
  const dataAssinatura = ass.assinado_em
    ? formatarDataHoraLocal(ass.assinado_em)
    : "Data não informada";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.25s ease;
  `;

  overlay.innerHTML = `
    <div style="background:var(--branco);border-radius:var(--border-radius-lg);padding:20px;max-width:500px;width:100%;max-height:95vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <span class="badge badge-azul" style="font-size:12px;padding:4px 16px;">${tipoLabel}</span>
          <h3 style="margin:6px 0 0 0;font-size:16px;color:var(--cinza-escuro);">${ass.nome}</h3>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${ass.cpf ? `<div style="font-size:13px;color:var(--cinza-medio);margin-bottom:8px;">CPF: ${ass.cpf}</div>` : ""}
      <div style="font-size:11px;color:var(--cinza-medio);margin-bottom:12px;">
        <i class="fas fa-calendar"></i> ${dataAssinatura} 
        <span style="margin-left:12px;"><i class="fas fa-user-shield"></i> Coletada por: ${ass.nome_guarda || "Desconhecido"}</span>
      </div>
      <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:20px;border:2px solid var(--cinza-claro);text-align:center;">
        <img src="${ass.assinatura_data_url}" alt="Assinatura de ${ass.nome}" 
          style="max-width:100%;max-height:300px;border:1px solid var(--cinza-claro);border-radius:4px;">
      </div>
      <div style="margin-top:12px;text-align:center;font-size:11px;color:var(--cinza-medio);">
        <i class="fas fa-info-circle"></i> Assinatura digital coletada em dispositivo móvel
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" 
        class="btn-secondary" style="width:100%;margin-top:12px;border-radius:12px;min-height:44px;">
        Fechar
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// ============================================
// ABA: ANEXOS (FILTRADO - SEM ASSINATURAS)
// ============================================

function renderAbaAnexos(appInstance) {
  // 🔥 FILTRAR: Remover assinaturas dos anexos
  const anexosReais = estado.anexos.filter((a) => a.tipo !== "assinatura");
  const imagens = anexosReais.filter(
    (a) => a.tipo_arquivo === "image" || a.tipo === "image",
  );
  const documentos = anexosReais.filter(
    (a) => a.tipo_arquivo !== "image" && a.tipo !== "image",
  );

  let html = "";

  // Galeria de imagens
  if (imagens.length > 0) {
    html += `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-images" style="font-size:14px;"></i>
          Fotos (${imagens.length})
        </h4>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;">
          ${imagens
            .map(
              (img, index) => `
            <div onclick="window._detalheVerImagem(${index})" 
              style="aspect-ratio:1;border-radius:var(--border-radius);overflow:hidden;cursor:pointer;background:var(--cinza-claro);position:relative;border:2px solid var(--cinza-claro);">
              <img src="${img.url_thumb || img.url}" alt="Anexo ${index + 1}" 
                style="width:100%;height:100%;object-fit:cover;"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:24px;">
                <i class="fas fa-image"></i>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        ${
          imagens.length > 3
            ? `
          <button onclick="window._detalheVerImagem(0)" 
            style="width:100%;margin-top:8px;padding:6px;border:none;border-radius:var(--border-radius);background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:12px;font-weight:600;cursor:pointer;">
            <i class="fas fa-expand"></i> Ver todas as imagens
          </button>
        `
            : ""
        }
      </div>
    `;
  }

  // Documentos
  if (documentos.length > 0) {
    html += `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-file-alt" style="font-size:14px;"></i>
          Documentos (${documentos.length})
        </h4>
        ${documentos
          .map(
            (doc) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--cinza-claro);">
            <i class="fas ${getIconAnexo(doc.tipo_arquivo)}" style="color:var(--azul-bandeira);font-size:18px;"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:500;word-break:break-word;">${doc.nome_arquivo}</div>
              <div style="font-size:11px;color:var(--cinza-medio);">${formatarTamanho(doc.tamanho || 0)}</div>
            </div>
            ${
              doc.url
                ? `
              <button onclick="window._detalheBaixarAnexo('${doc.url}', '${doc.nome_arquivo}')" 
                style="padding:6px 10px;border:none;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);cursor:pointer;font-size:12px;min-height:32px;">
                <i class="fas fa-download"></i>
              </button>
            `
                : ""
            }
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  if (anexosReais.length === 0) {
    html += `
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:8px;">
          <i class="fas fa-paperclip"></i>
        </div>
        <p style="font-weight:500;">Nenhum anexo adicionado</p>
        <p style="font-size:12px;">Esta ocorrência não possui anexos.</p>
      </div>
    `;
  }

  return html;
}

// ============================================
// ABA: HISTÓRICO
// ============================================

function renderAbaHistorico(appInstance) {
  const historico = estado.historico;

  if (historico.length === 0) {
    return `
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:8px;">
          <i class="fas fa-history"></i>
        </div>
        <p style="font-weight:500;">Nenhum histórico disponível</p>
        <p style="font-size:12px;">Esta ocorrência não possui versões anteriores.</p>
      </div>
    `;
  }

  // Ordenar do mais recente para o mais antigo
  const sorted = [...historico].sort((a, b) => {
    const dateA = new Date(a.criado_em);
    const dateB = new Date(b.criado_em);
    return dateB - dateA;
  });

  let html = `
    <div style="position:relative;padding-left:20px;">
      <div style="position:absolute;left:4px;top:4px;bottom:4px;width:2px;background:var(--cinza-claro);"></div>
  `;

  sorted.forEach((item, index) => {
    const isOriginal = item.is_original;
    const isAtiva = item.esta_ativa !== false;
    const statusClass = getStatusClass(item.status);
    const statusLabel = getStatusLabel(item.status);
    const data = formatarDataHoraLocal(item.criado_em);
    const numero =
      item.numero_ocorrencia || item.numero_temporario || "Rascunho";
    const isLast = index === sorted.length - 1;

    // Extrair campos alterados
    let camposAlterados = [];
    if (item.campos_alterados) {
      try {
        camposAlterados = JSON.parse(item.campos_alterados);
      } catch (e) {}
    }

    const isActiveVersion =
      isAtiva && (isOriginal || item.status === "rectified");

    html += `
      <div style="position:relative;padding-bottom:${isLast ? "0" : "16px"};${!isLast ? "border-left: none;" : ""}">
        <div style="position:absolute;left:-16px;top:4px;width:12px;height:12px;border-radius:50%;background:${isActiveVersion ? "var(--verde-bandeira)" : "var(--cinza-medio)"};border:2px solid var(--branco);box-shadow:0 0 0 2px ${isActiveVersion ? "var(--verde-bandeira)" : "var(--cinza-medio)"};"></div>
        
        <div style="background:${isActiveVersion ? "var(--verde-muito-claro)" : "var(--branco)"};border-radius:var(--border-radius);padding:12px;margin-left:12px;box-shadow:var(--sombra-suave);border-left:3px solid ${isActiveVersion ? "var(--verde-bandeira)" : "var(--cinza-claro)"};">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-weight:700;font-size:13px;color:${isActiveVersion ? "var(--verde-escuro)" : "var(--cinza-escuro)"};">
                ${isOriginal ? "📄 Versão Original" : `🔄 Retificação v${item.numero_versao || 1}`}
              </span>
              ${isActiveVersion ? `<span class="badge badge-synced" style="font-size:9px;padding:1px 8px;">✅ Ativa</span>` : `<span class="badge badge-draft" style="font-size:9px;padding:1px 8px;">📜 Substituída</span>`}
              <span class="badge badge-${statusClass}" style="font-size:9px;padding:1px 8px;">${statusLabel}</span>
            </div>
            <span style="font-size:11px;color:var(--cinza-medio);">#${numero}</span>
          </div>
          
          <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
            <i class="fas fa-calendar" style="margin-right:4px;"></i> ${data}
          </div>

          ${
            item.justificativa_retificacao
              ? `
            <div style="margin-top:6px;padding:6px 10px;background:#fef3c7;border-radius:var(--border-radius);font-size:12px;color:#92400e;border-left:3px solid var(--aviso);">
              <i class="fas fa-quote-left" style="color:var(--aviso);margin-right:4px;"></i>
              ${item.justificativa_retificacao}
            </div>
          `
              : ""
          }

          ${
            camposAlterados.length > 0
              ? `
            <div style="margin-top:6px;font-size:12px;">
              <details style="cursor:pointer;">
                <summary style="font-weight:600;color:var(--azul-bandeira);">
                  <i class="fas fa-edit"></i> ${camposAlterados.length} campo(s) alterado(s)
                </summary>
                <div style="margin-top:4px;padding:6px 8px;background:var(--branco-fumaca);border-radius:var(--border-radius);">
                  ${camposAlterados
                    .map(
                      (c) => `
                    <div style="display:grid;grid-template-columns:1fr 2fr;gap:4px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:11px;">
                      <span style="font-weight:600;">${c.label || c.campo}:</span>
                      <span style="display:flex;gap:4px;flex-wrap:wrap;">
                        <span style="color:var(--cinza-medio);text-decoration:line-through;">${c.antes || "(vazio)"}</span>
                        <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:8px;"></i>
                        <span style="color:var(--verde-bandeira);">${c.depois || "(vazio)"}</span>
                      </span>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              </details>
            </div>
          `
              : ""
          }

          <button onclick="window.app.navigateTo('detalhe-ocorrencia', { id: '${item.id}' })" 
            style="margin-top:6px;padding:4px 12px;border:none;border-radius:6px;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:11px;cursor:pointer;font-weight:600;min-height:28px;">
            <i class="fas fa-eye" style="margin-right:4px;"></i> Ver versão
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

// ============================================
// ABA: GERAR PDF (COM OPÇÃO DE ASSINATURAS)
// ============================================

function renderAbaPDF(appInstance) {
  const occ = estado.ocorrencia;
  if (!occ) return "";

  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
  const options = estado.pdfOptions;
  const temHistorico = estado.historico && estado.historico.length > 1;
  const temAssinaturas = normalizarListaAssinaturas(estado.assinaturas).length > 0;

  return `
    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
      <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-file-pdf" style="font-size:14px;"></i>
        Exportar PDF - #${numero}
      </h4>
      
      <p style="font-size:12px;color:var(--cinza-medio);margin-bottom:12px;">
        Selecione os conteúdos que deseja incluir no PDF:
      </p>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
          <input type="checkbox" ${options.incluirDados ? "checked" : ""} 
            onchange="window._detalheTogglePDFOption('incluirDados')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
          <span>📋 Dados da ocorrência</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
          <input type="checkbox" ${options.incluirEnvolvidos ? "checked" : ""} 
            onchange="window._detalheTogglePDFOption('incluirEnvolvidos')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
          <span>👤 Envolvidos (${estado.envolvidos.length})</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
          <input type="checkbox" ${options.incluirObservacoes ? "checked" : ""} 
            onchange="window._detalheTogglePDFOption('incluirObservacoes')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
          <span>📝 Observações</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
          <input type="checkbox" ${options.incluirAnexos ? "checked" : ""} 
            onchange="window._detalheTogglePDFOption('incluirAnexos')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
          <span>📎 Anexos (${estado.anexos.filter((a) => a.tipo !== "assinatura").length})</span>
        </label>
        ${
          temAssinaturas
            ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" ${options.incluirAssinaturas ? "checked" : ""} 
              onchange="window._detalheTogglePDFOption('incluirAssinaturas')"
              style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
            <span>✍️ Assinaturas (${normalizarListaAssinaturas(estado.assinaturas).length})</span>
          </label>
        `
            : ""
        }
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
          <input type="checkbox" ${options.incluirHash ? "checked" : ""} 
            onchange="window._detalheTogglePDFOption('incluirHash')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
          <span>🔒 Hash de integridade</span>
        </label>
        ${
          temHistorico
            ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" ${options.incluirVersoes ? "checked" : ""} 
              onchange="window._detalheTogglePDFOption('incluirVersoes')"
              style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
            <span>📜 Histórico de versões (${estado.historico.length})</span>
          </label>
        `
            : ""
        }
        ${
          estado.ocorrencia.assinatura
            ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0;">
            <input type="checkbox" ${options.incluirAssinatura ? "checked" : ""} 
              onchange="window._detalheTogglePDFOption('incluirAssinatura')"
              style="width:18px;height:18px;accent-color:var(--azul-bandeira);">
            <span>✍️ Assinatura</span>
          </label>
        `
            : ""
        }
      </div>

      <button onclick="window._detalheGerarPDF()" 
        class="btn-primary" style="border-radius:12px;min-height:44px;gap:8px;">
        <i class="fas fa-file-pdf" style="font-size:18px;"></i>
        Baixar PDF
      </button>

      <div style="margin-top:8px;font-size:11px;color:var(--cinza-medio);text-align:center;">
        <i class="fas fa-info-circle"></i>
        O PDF será gerado com os dados selecionados
      </div>
    </div>
  `;
}

// ============================================
// BARRA DE AÇÕES
// ============================================

function renderBarraAcoes(occ, perms, appInstance) {
  const {
    podeEditar,
    podeFinalizar,
    podeCancelar,
    podeRetificar,
    isSupervisor,
    isDraft,
    isPending,
    isSynced,
    isCancelled,
  } = perms;

  const botoes = [];

  // Editar (apenas rascunho)
  if (isDraft && podeEditar) {
    botoes.push({
      label: "Editar",
      icon: "fa-edit",
      class: "btn-primary",
      action: "window._detalheEditar()",
    });
  }

  // Finalizar (apenas rascunho)
  if (isDraft && podeFinalizar) {
    botoes.push({
      label: "Finalizar",
      icon: "fa-check-circle",
      class: "btn-success",
      action: "window._detalheFinalizar()",
    });
  }

  // Aprovar/Rejeitar retificação (apenas supervisor)
  if (isPending && isSupervisor) {
    botoes.push({
      label: "Aprovar",
      icon: "fa-check",
      class: "btn-success",
      action: "window._detalheAprovarRetificacao()",
    });
    botoes.push({
      label: "Rejeitar",
      icon: "fa-times",
      class: "btn-danger",
      action: "window._detalheRejeitarRetificacao()",
    });
  }

  // Solicitar retificação (apenas finalizada)
  if (isSynced && podeRetificar) {
    botoes.push({
      label: "Solicitar Retificação",
      icon: "fa-sync-alt",
      class: "btn-primary",
      action: "window._detalheSolicitarRetificacao()",
    });
  }

  // Cancelar
  if (!isCancelled && podeCancelar) {
    botoes.push({
      label: "Cancelar Ocorrência",
      icon: "fa-times-circle",
      class: "btn-danger",
      action: "window._detalheCancelar()",
    });
  }

  // Gerar PDF (sempre)
  botoes.push({
    label: "Gerar PDF",
    icon: "fa-file-pdf",
    class: "btn-secondary",
    action: "window._detalheGerarPDF()",
    style: "background:var(--azul-muito-claro);color:var(--azul-bandeira);",
  });

  if (botoes.length === 0) {
    return `
      <div style="margin-top:16px;padding:12px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);text-align:center;">
        <p style="color:var(--cinza-medio);font-size:13px;margin:0;">
          <i class="fas fa-info-circle"></i>
          Nenhuma ação disponível para esta ocorrência.
        </p>
      </div>
    `;
  }

  return `
    <div style="margin-top:16px;padding:12px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-media);">
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${botoes
          .map(
            (btn) => `
          <button onclick="${btn.action}" 
            class="${btn.class}" 
            style="width:100%;border-radius:12px;min-height:44px;gap:6px;${btn.style || ""}">
            <i class="fas ${btn.icon}" style="font-size:14px;"></i>
            ${btn.label}
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

// ============================================
// MUDAR ABA
// ============================================

function mudarAba(aba, container, appInstance) {
  estado.abaAtiva = aba;
  renderizarDetalhe(container, appInstance);
}

// ============================================
// AÇÕES
// ============================================

export async function finalizarOcorrencia(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar esta ocorrência?",
  );
  if (!confirmado) return;

  const agora = new Date();
  const timezoneOffset = agora.getTimezoneOffset();
  const adjustedDate = new Date(agora.getTime() - timezoneOffset * 60000);
  const dataEncerramento = adjustedDate.toISOString();

  const result = await ocorrenciaManager.atualizar(id, {
    status: "synced",
    data_hora_encerramento: dataEncerramento,
  });

  if (result.success) {
    appInstance.showToast("Ocorrência finalizada com sucesso!", "success");
    await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);
    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast("Erro ao finalizar: " + result.error, "error");
  }
}

export async function cancelarOcorrencia(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  const motivo = await appInstance.inputModal(
    "Informe o motivo do cancelamento:",
    "Cancelar Ocorrência",
    "Digite o motivo do cancelamento...",
    5,
  );

  if (!motivo) {
    appInstance.showToast("Operação cancelada", "info");
    return;
  }

  const confirmado = await appInstance.confirmar(
    `Deseja realmente cancelar esta ocorrência?\n\nMotivo: ${motivo}`,
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.cancelar(id, motivo);

  if (result.success) {
    appInstance.showToast("Ocorrência cancelada com sucesso!", "success");
    await authManager.logCancelarOcorrencia(
      authManager.getUserId(),
      id,
      motivo,
    );
    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast("Erro ao cancelar: " + result.error, "error");
  }
}

export async function solicitarRetificacao(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  // Navegar para o formulário de retificação
  appInstance.navigateTo("detalhe-ocorrencia", { id, action: "retificar" });
}

export async function aprovarRetificacao(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  const confirmado = await appInstance.confirmar(
    "Confirma a aprovação desta retificação? A versão original será substituída.",
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.aprovarRetificacao(id);
  if (result.success) {
    appInstance.showToast("Retificação aprovada com sucesso!", "success");
    await authManager.logAprovarRetificacao(authManager.getUserId(), id);
    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast(
      "Erro ao aprovar retificação: " + result.error,
      "error",
    );
  }
}

export async function rejeitarRetificacao(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  const motivo = await appInstance.inputModal(
    "Informe o motivo da rejeição da retificação:",
    "Rejeitar Retificação",
    "Digite o motivo da rejeição...",
    5,
  );

  if (!motivo) {
    appInstance.showToast("Operação cancelada", "info");
    return;
  }

  const confirmado = await appInstance.confirmar(
    `Confirma a rejeição desta retificação?\n\nMotivo: ${motivo}`,
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.rejeitarRetificacao(id, motivo);
  if (result.success) {
    appInstance.showToast("Retificação rejeitada", "info");
    await authManager.logRejeitarRetificacao(authManager.getUserId(), id);
    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast(
      "Erro ao rejeitar retificação: " + result.error,
      "error",
    );
  }
}

export function editarOcorrencia(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;
  appInstance.navigateTo("nova-ocorrencia", { id });
}

export async function gerarPDFCompleto(appInstance) {
  const id = estado.ocorrencia?.id;
  if (!id) return;

  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarOcorrencia !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    appInstance.showToast("Gerando PDF...", "info");

    // Preparar opções com base nas seleções do usuário
    const options = {
      sections: {
        dados: estado.pdfOptions.incluirDados,
        envolvidos: estado.pdfOptions.incluirEnvolvidos,
        observacoes: estado.pdfOptions.incluirObservacoes,
        anexos: estado.pdfOptions.incluirAnexos,
        assinaturas: estado.pdfOptions.incluirAssinaturas, // 🔥 NOVO
        assinatura: estado.pdfOptions.incluirAssinatura,
      },
      integrity: {
        showHash: estado.pdfOptions.incluirHash,
        showVersion: true,
      },
      footer: {
        show: true,
        includePageNumbers: true,
        includeDate: true,
        includeHash: estado.pdfOptions.incluirHash,
      },
      header: {
        show: true,
        includeDate: true,
        includeUser: true,
        includeVersion: true,
      },
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
      },
    };

    // Se o usuário desabilitou o hash, não incluir no rodapé
    if (!estado.pdfOptions.incluirHash) {
      options.footer.includeHash = false;
    }

    const result = await pdfExport.exportarOcorrencia(id, options);

    if (result.success) {
      appInstance.showToast("PDF gerado com sucesso!", "success");
    } else {
      appInstance.showToast("Erro ao gerar PDF: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    appInstance.showToast("Erro ao gerar PDF", "error");
  }
}

// ============================================
// IMAGENS E ANEXOS
// ============================================

export function verImagemGaleria(index, appInstance) {
  const imagens = estado.imagensGaleria;
  if (imagens.length === 0) {
    appInstance.showToast("Nenhuma imagem disponível", "info");
    return;
  }

  // Abrir carrossel
  if (typeof window._consultaAbrirCarrossel === "function") {
    window._consultaAbrirCarrossel(imagens, index, appInstance);
  } else {
    window.open(imagens[index]?.url, "_blank");
  }
}

export function baixarAnexo(url, nome) {
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================
// PDF OPTIONS
// ============================================

function togglePDFOption(option, container, appInstance) {
  estado.pdfOptions[option] = !estado.pdfOptions[option];
  if (container) {
    renderizarDetalhe(container, appInstance);
  } else {
    const containerEl = document.getElementById("detalheOcorrenciaContent");
    if (containerEl) {
      renderizarDetalhe(containerEl, appInstance);
    }
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
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

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
// RENDERIZAÇÃO: LOADER, ERRO, NÃO ENCONTRADO
// ============================================

function renderLoader() {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando ocorrência...</p>
    </div>
  `;
}

function renderOcorrenciaNaoEncontrada(appInstance, error = null) {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Ocorrência não encontrada</h3>
      <p style="color:var(--cinza-medio);">${error || "ID inválido ou ocorrência não existe."}</p>
      <button onclick="window.app.navigateTo('ocorrencias')" class="btn-primary" style="margin-top:16px;border-radius:12px;">
        <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar para lista
      </button>
    </div>
  `;
}

function renderErro(error, appInstance) {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Erro ao carregar ocorrência</h3>
      <p style="color:var(--cinza-medio);">${error.message}</p>
      <button onclick="window._detalheVoltar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
        <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar
      </button>
    </div>
  `;
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderDetalheOcorrencia,
  finalizarOcorrencia,
  cancelarOcorrencia,
  solicitarRetificacao,
  aprovarRetificacao,
  rejeitarRetificacao,
  editarOcorrencia,
  gerarPDFCompleto,
  verImagemGaleria,
  baixarAnexo,
};
