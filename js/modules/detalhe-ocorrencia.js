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
      ? assinaturasResult.data
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

  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
  const statusClass = getStatusClass(occ.status);
  const statusLabel = getStatusLabel(occ.status);
  const statusIcon = STATUS_ICONS[occ.status] || "📌";
  const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
  const tipoClass = TIPO_CORES[occ.tipo_ocorrencia] || "badge-tipo-outro";
  const dataCriacao = formatarDataHoraLocal(occ.criado_em);
  const dataInicio = occ.data_hora_inicio
    ? formatarDataHoraLocal(occ.data_hora_inicio)
    : "Não informado";
  const dataEncerramento = occ.data_hora_encerramento
    ? formatarDataHoraLocal(occ.data_hora_encerramento)
    : "Não encerrado";
  const cpfExibido = formatarCPFSeguro(estado.criadorCPF);

  const coords =
    occ.latitude && occ.longitude
      ? `${parseFloat(occ.latitude).toFixed(6)}, ${parseFloat(occ.longitude).toFixed(6)}`
      : "Localização não disponível";

  const isSupervisor = authManager.isSupervisor();
  const isDraft = occ.status === "draft";
  const isPending = occ.status === "pending_rectification";
  const isSynced = occ.status === "synced";
  const isCancelled = occ.status === "cancelled";

  // Verificar permissões
  const podeEditar = authManager.podeEditar(occ);
  const podeFinalizar = authManager.podeFinalizar(occ);
  const podeCancelar = authManager.podeCancelar(occ);
  const podeRetificar = authManager.podeSolicitarRetificacao(occ);

  const temImagens = estado.imagensGaleria.length > 0;
  const totalAnexos = estado.anexos.filter(
    (a) => a.tipo !== "assinatura",
  ).length;
  const totalAssinaturas = estado.assinaturas.length;

  let html = `
  <div class="container" style="padding-bottom:100px;" id="detalheContainer">
    <!-- Cabeçalho: Voltar + Status -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <button onclick="window._detalheVoltar()" 
        style="background:none;border:none;color:var(--azul-bandeira);font-size:15px;cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:4px;font-weight:600;">
        <i class="fas fa-arrow-left" style="font-size:14px;"></i> Voltar
      </button>
      <span class="badge badge-${statusClass}" style="font-size:12px;padding:6px 16px;font-weight:700;border-radius:30px;display:flex;align-items:center;gap:4px;">
        ${statusIcon} ${statusLabel}
      </span>
    </div>

    <!-- Card do cabeçalho principal -->
    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px 16px;box-shadow:var(--sombra-media);margin-bottom:12px;">
      <!-- Linha 1: Número + Tipo + Versão -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="font-weight:800;font-size:20px;color:var(--azul-bandeira);letter-spacing:-0.5px;">
          #${numero}
        </span>
        <span class="badge ${tipoClass}" style="font-size:10px;padding:2px 12px;font-weight:700;">
          ${tipoLabel}
        </span>
        ${occ.numero_versao > 1 ? `<span class="badge badge-rectified" style="font-size:9px;padding:1px 8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">v${occ.numero_versao}</span>` : ""}
      </div>

      <!-- Linha 2: Guarda e CPF -->
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;color:var(--cinza-escuro);padding:4px 0;border-top:1px solid var(--cinza-claro);">
        <i class="fas fa-user-circle" style="color:var(--azul-bandeira);font-size:16px;"></i>
        <span style="font-weight:600;">${estado.criadorNome}</span>
        <span style="color:var(--cinza-medio);">·</span>
        <span style="color:var(--cinza-medio);font-size:13px;">${cpfExibido}</span>
      </div>

      <!-- Linha 3: Localização e Data -->
      <div style="display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--cinza-medio);padding:3px 0;border-top:1px solid var(--cinza-claro);">
        <div style="display:flex;align-items:center;gap:4px;">
          <i class="fas fa-map-pin" style="color:var(--verde-bandeira);font-size:12px;"></i>
          <span>${coords}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <i class="fas fa-calendar" style="color:var(--azul-bandeira);font-size:12px;"></i>
          <span>${dataCriacao}</span>
        </div>
        ${
          occ.data_hora_encerramento
            ? `
          <div style="display:flex;align-items:center;gap:4px;">
            <i class="fas fa-check-circle" style="color:var(--verde-bandeira);font-size:12px;"></i>
            <span>Encerrado: ${dataEncerramento}</span>
          </div>
        `
            : ""
        }
      </div>

      <!-- Linha 4: Hash de integridade (se houver) -->
      ${
        occ.hash_pericial
          ? `
        <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--verde-bandeira);padding:3px 0;border-top:1px solid var(--cinza-claro);font-family:monospace;">
          <i class="fas fa-fingerprint" style="font-size:11px;"></i>
          <span>Hash: ${occ.hash_pericial.substring(0, 16)}...</span>
          <span style="font-size:9px;color:var(--cinza-medio);font-weight:400;cursor:help;" title="Hash SHA-256 de integridade">🔒</span>
        </div>
      `
          : ""
      }
    </div>

    <!-- Abas -->
    <div style="display:flex;gap:2px;margin-bottom:14px;background:var(--branco);border-radius:var(--border-radius);padding:4px;box-shadow:var(--sombra-suave);overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;">
      ${renderAbas(totalAnexos, totalAssinaturas)}
    </div>

    <!-- Conteúdo da aba ativa -->
    <div id="abaConteudo">
      ${renderConteudoAba(appInstance)}
    </div>

    <!-- Botões de ação no final -->
    <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
      ${renderBotoesAcao(occ, { podeEditar, podeFinalizar, podeCancelar, podeRetificar, isSupervisor, isDraft, isPending, isSynced, isCancelled }, appInstance)}
    </div>
  </div>
`;

  container.innerHTML = html;
}

// ============================================
// RENDERIZAÇÃO: ABAS
// ============================================

function renderAbas(totalAnexos, totalAssinaturas) {
  const aba = estado.abaAtiva;

  const abas = [
    { id: "detalhes", label: "Detalhes", icon: "fa-file-alt" },
    { id: "anexos", label: `Anexos (${totalAnexos})`, icon: "fa-paperclip" },
    // 🔥 NOVO: Aba de Assinaturas
    {
      id: "assinaturas",
      label: `Assinaturas (${totalAssinaturas})`,
      icon: "fa-pen-fancy",
    },
    { id: "historico", label: "Histórico", icon: "fa-history" },
    { id: "pdf", label: "Gerar PDF", icon: "fa-file-pdf" },
  ];

  return abas
    .map(
      (a) => `
      <button onclick="window._detalheMudarAba('${a.id}')" 
        class="aba-btn"
        style="
          flex:1;
          padding:8px 4px;
          border:none;
          border-radius:var(--border-radius);
          font-size:11px;
          font-weight:${aba === a.id ? "700" : "500"};
          cursor:pointer;
          transition:all 0.2s ease;
          background:${aba === a.id ? "var(--azul-bandeira)" : "transparent"};
          color:${aba === a.id ? "var(--branco)" : "var(--cinza-medio)"};
          white-space:nowrap;
          min-height:36px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:4px;
        "
      >
        <i class="fas ${a.icon}" style="font-size:12px;"></i>
        <span>${a.label}</span>
      </button>
    `,
    )
    .join("");
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
      label: "EDITAR OCORRÊNCIA",
      icon: "fa-edit",
      class: "btn-primary",
      action: "window._detalheEditar()",
    });
  }

  // Finalizar (apenas rascunho)
  if (isDraft && podeFinalizar) {
    botoes.push({
      label: "FINALIZAR OCORRÊNCIA",
      icon: "fa-check-circle",
      class: "btn-success",
      action: "window._detalheFinalizar()",
    });
  }

  // Aprovar/Rejeitar retificação (apenas supervisor)
  if (isPending && isSupervisor) {
    botoes.push({
      label: "APROVAR RETIFICAÇÃO",
      icon: "fa-check",
      class: "btn-success",
      action: "window._detalheAprovarRetificacao()",
    });
    botoes.push({
      label: "REJEITAR RETIFICAÇÃO",
      icon: "fa-times",
      class: "btn-danger",
      action: "window._detalheRejeitarRetificacao()",
    });
  }

  // Solicitar retificação (apenas finalizada)
  if (isSynced && podeRetificar) {
    botoes.push({
      label: "SOLICITAR RETIFICAÇÃO",
      icon: "fa-sync-alt",
      class: "btn-primary",
      action: "window._detalheSolicitarRetificacao()",
    });
  }

  // Cancelar
  if (!isCancelled && podeCancelar) {
    botoes.push({
      label: "CANCELAR OCORRÊNCIA",
      icon: "fa-times-circle",
      class: "btn-danger",
      action: "window._detalheCancelar()",
    });
  }

  // Gerar PDF (sempre) - aparece como botão adicional
  if (botoes.length > 0) {
    botoes.push({
      label: "GERAR PDF",
      icon: "fa-file-pdf",
      class: "btn-secondary",
      action: "window._detalheGerarPDF()",
      style:
        "background:var(--azul-muito-claro);color:var(--azul-bandeira);border:2px solid var(--azul-bandeira);",
    });
  }

  if (botoes.length === 0) {
    return `
      <div style="padding:12px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);text-align:center;">
        <p style="color:var(--cinza-medio);font-size:13px;margin:0;">
          <i class="fas fa-info-circle"></i>
          Nenhuma ação disponível.
        </p>
      </div>
    `;
  }

  return botoes
    .map(
      (btn) => `
    <button onclick="${btn.action}" 
      class="${btn.class}" 
      style="width:100%;border-radius:12px;min-height:48px;gap:8px;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;${btn.style || ""}">
      <i class="fas ${btn.icon}" style="font-size:14px;"></i>
      ${btn.label}
    </button>
  `,
    )
    .join("");
}

// ============================================
// ABA: DETALHES
// ============================================

function renderAbaDetalhes(appInstance) {
  const occ = estado.ocorrencia;
  if (!occ) return "";

  // Dados da Solicitação
  const camposSolicitacao = [
    { label: "Forma de Solicitação", valor: occ.forma_solicitacao },
    { label: "Nome do Solicitante", valor: occ.nome_solicitante || "Anônimo" },
    {
      label: "CPF do Solicitante",
      valor: occ.cpf_solicitante || "Não informado",
    },
    {
      label: "RG do Solicitante",
      valor: occ.rg_solicitante || "Não informado",
    },
    {
      label: "Telefone do Solicitante",
      valor: occ.telefone_solicitante || "Não informado",
    },
    {
      label: "Endereço do Solicitante",
      valor: occ.endereco_solicitante || "Não informado",
    },
    {
      label: "Bairro do Solicitante",
      valor: occ.bairro_solicitante || "Não informado",
    },
    { label: "Complemento", valor: occ.complemento || "Não informado" },
    {
      label: "Código Municipal",
      valor: occ.codigo_municipal || "Não informado",
    },
    {
      label: "Identificação Adicional",
      valor: occ.identificacao_adicional || "Não informado",
    },
  ];

  const camposSolicitacaoPreenchidos = camposSolicitacao.filter(
    (c) => c.valor && c.valor !== "Não informado" && c.valor !== "Anônimo",
  );

  // Dados da Ocorrência
  const dataInicio = occ.data_hora_inicio
    ? formatarDataHoraLocal(occ.data_hora_inicio)
    : "Não informado";
  const dataEncerramento = occ.data_hora_encerramento
    ? formatarDataHoraLocal(occ.data_hora_encerramento)
    : "Não encerrado";

  const camposOcorrencia = [
    {
      label: "Tipo de Ocorrência",
      valor: occ.tipo_ocorrencia
        ? getTipoLabel(occ.tipo_ocorrencia)
        : "Não informado",
    },
    {
      label: "Local da Ocorrência",
      valor: occ.local_ocorrencia || "Não informado",
    },
    { label: "Rodovia", valor: occ.rodovia || "Não informado" },
    {
      label: "Bairro da Ocorrência",
      valor: occ.bairro_ocorrencia || "Não informado",
    },
    { label: "Referência", valor: occ.referencia || "Não informado" },
    {
      label: "Código Operacional",
      valor: occ.codigo_operacional || "Não informado",
    },
    { label: "Data/Hora Início", valor: dataInicio },
    { label: "Data/Hora Encerramento", valor: dataEncerramento },
  ];

  // Verificar se é retificação
  let isRetificacao = estado.isRetificacao;
  let camposAlterados = estado.camposAlterados;

  let html = `
    <!-- Seção: Dados da Solicitação -->
    ${
      camposSolicitacaoPreenchidos.length > 0
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-phone-alt" style="font-size:14px;"></i>
          Dados da Solicitação
        </h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
          ${camposSolicitacaoPreenchidos
            .map(
              (c) => `
            <div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);display:flex;flex-direction:column;">
              <span style="color:var(--cinza-medio);font-size:10px;text-transform:uppercase;letter-spacing:0.3px;">${c.label}</span>
              <span style="color:var(--cinza-escuro);font-weight:500;word-break:break-word;">${c.valor}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `
        : ""
    }

    <!-- Seção: Dados da Ocorrência -->
    <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
      <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-map-marker-alt" style="font-size:14px;"></i>
        Dados da Ocorrência
      </h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
        ${camposOcorrencia
          .map(
            (c) => `
          <div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);display:flex;flex-direction:column;">
            <span style="color:var(--cinza-medio);font-size:10px;text-transform:uppercase;letter-spacing:0.3px;">${c.label}</span>
            <span style="color:var(--cinza-escuro);font-weight:500;word-break:break-word;">${c.valor}</span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>

    <!-- Seção: Observações -->
    ${
      occ.observacoes && occ.observacoes.trim() !== ""
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-pencil-alt" style="font-size:14px;"></i>
          Observações
        </h4>
        <div style="font-size:13px;color:var(--cinza-escuro);line-height:1.6;white-space:pre-wrap;word-break:break-word;background:var(--branco-fumaca);padding:10px;border-radius:var(--border-radius);">
          ${occ.observacoes}
        </div>
      </div>
    `
        : ""
    }

    <!-- Seção: Envolvidos -->
    ${
      estado.envolvidos.length > 0
        ? `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-users" style="font-size:14px;"></i>
          Envolvidos (${estado.envolvidos.length})
        </h4>
        ${estado.envolvidos
          .map(
            (env) => `
          <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:10px;margin-bottom:6px;border-left:3px solid ${env.tipo === "autor" ? "var(--erro)" : env.tipo === "vitima" ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge badge-azul" style="font-size:9px;padding:1px 10px;">${getTipoEnvolvidoLabel(env.tipo)}</span>
              <span style="font-weight:600;font-size:13px;">${env.nome_completo}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:11px;color:var(--cinza-medio);margin-top:4px;">
              ${env.cpf ? `<div><span style="color:var(--cinza-medio);">CPF:</span> ${env.cpf}</div>` : ""}
              ${env.telefone ? `<div><span style="color:var(--cinza-medio);">Tel:</span> ${env.telefone}</div>` : ""}
              ${env.rg ? `<div><span style="color:var(--cinza-medio);">RG:</span> ${env.rg}</div>` : ""}
              ${env.data_nascimento ? `<div><span style="color:var(--cinza-medio);">Nasc:</span> ${new Date(env.data_nascimento).toLocaleDateString("pt-BR")}</div>` : ""}
            </div>
            ${env.observacoes ? `<div style="font-size:11px;color:var(--cinza-escuro);margin-top:4px;padding-top:4px;border-top:1px solid var(--cinza-claro);">${env.observacoes}</div>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }

    <!-- Seção: Retificação (se aplicável) -->
    ${
      isRetificacao && camposAlterados.length > 0
        ? `
      <div style="background:#fef3c7;border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-suave);margin-bottom:10px;border-left:4px solid var(--aviso);">
        <h4 style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 8px 0;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-sync-alt" style="font-size:14px;"></i>
          Campos Retificados
        </h4>
        ${camposAlterados
          .map(
            (campo) => `
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:4px;padding:4px 0;border-bottom:1px solid #fde68a;font-size:12px;">
            <div style="font-weight:600;color:#92400e;">${campo.label || campo.campo}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span style="color:var(--cinza-medio);text-decoration:line-through;font-size:11px;">${campo.antes || "(vazio)"}</span>
              <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:9px;"></i>
              <span style="color:var(--verde-bandeira);font-weight:500;">${campo.depois || "(vazio)"}</span>
            </div>
          </div>
        `,
          )
          .join("")}
        ${
          occ.justificativa_retificacao
            ? `
          <div style="margin-top:8px;padding:8px 10px;background:var(--branco);border-radius:var(--border-radius);font-size:12px;color:var(--cinza-escuro);">
            <strong>Justificativa:</strong> ${occ.justificativa_retificacao}
          </div>
        `
            : ""
        }
      </div>
    `
        : ""
    }
  `;

  return html;
}

// ============================================
// 🔥 NOVO: ABA: ASSINATURAS
// ============================================

function renderAbaAssinaturas(appInstance) {
  const assinaturas = estado.assinaturas || [];

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
  const assinaturas = estado.assinaturas || [];
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
  const temAssinaturas = estado.assinaturas && estado.assinaturas.length > 0;

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
            <span>✍️ Assinaturas (${estado.assinaturas.length})</span>
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
