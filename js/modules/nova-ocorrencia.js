/**
 * MÓDULO NOVA OCORRÊNCIA - Formulário de Registro de Ocorrência
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Formulário em 6 etapas para criação de ocorrência
 * - Dados da solicitação (forma, solicitante, CPF, RG, telefone, endereço)
 * - Dados da ocorrência (tipo, local, data/hora, bairro, referência)
 * - Envolvidos (autor, vítima, testemunha, solicitante, outro)
 * - Observações e relato dos fatos
 * - Anexos (fotos, vídeos, documentos)
 * - Revisão e finalização
 * - Rascunho automático
 * - Geolocalização
 * - Hash pericial na finalização
 * - Logs periciais
 *
 * MELHORIAS APLICADAS:
 * - BO Rápido (modo simplificado com campos obrigatórios)
 * - Modelos de Ocorrência (pré-definidos para agilizar)
 * - Registro de Áudio (gravar relato do solicitante)
 * - Assinatura Digital (coletar assinatura com toque na tela)
 * - Câmera Rápida (capture="environment")
 * - Botão "Agora" para preenchimento rápido de data/hora
 * - Máscaras automáticas (CPF, telefone)
 * - Validação otimizada
 * - Speech-to-Text com inicialização garantida
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient, ocorrenciaManager)
// e funções dos módulos utils e ui

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

const TOTAL_ETAPAS = 6;
const MODE_NORMAL = "normal";
const MODE_RAPIDO = "rapido";

const MODELOS_OCORRENCIA = {
  furto: {
    titulo: "Furto",
    observacoes:
      "O solicitante informou que teve seu(s) pertences(s) subtraídos(s) no local informado. Segundo relato, o(s) objeto(s) estava(m) em sua posse e foram levados sem sua autorização. O solicitante não soube informar detalhes sobre o(s) autor(es). Foi orientado a registrar BO na delegacia de polícia para fins de investigação.",
  },
  roubo: {
    titulo: "Roubo",
    observacoes:
      "O solicitante informou que foi vítima de roubo no local informado. Segundo relato, o(s) autor(es) mediante ameaça ou violência, subtraiu(ram) seus pertences. O solicitante descreveu o(s) autor(es) como [descrever características]. Foi orientado a registrar BO na delegacia de polícia.",
  },
  perturbacao: {
    titulo: "Perturbação do Sossego",
    observacoes:
      "O solicitante informou que está sofrendo com perturbação do sossego no local informado. Segundo relato, há excesso de barulho, confusão ou desordem que está afetando a tranquilidade do local. A equipe realizou orientação aos envolvidos e constatou a situação.",
  },
  acidente: {
    titulo: "Acidente de Trânsito",
    observacoes:
      "O solicitante informou que houve um acidente de trânsito no local informado. Segundo relato, [descrever dinâmica do acidente]. Não houve vítimas com ferimentos graves. A via foi sinalizada e o trânsito foi normalizado após a remoção dos veículos.",
  },
  ameaca: {
    titulo: "Ameaça",
    observacoes:
      "O solicitante informou que está sofrendo ameaças no local informado. Segundo relato, [descrever ameaça]. O solicitante demonstrou receio quanto à sua integridade física. Foi orientado a procurar a delegacia de polícia para registro de ocorrência.",
  },
};

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  etapa: 1,
  id: null,
  modo: MODE_NORMAL,
  dados: {
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
    envolvidos: [],
    observacoes: "",
    anexos: [],
    assinatura: null,
    audio: null,
  },
  modeloSelecionado: "",
  audioRecorder: null,
  audioChunks: [],
  isRecording: false,
  assinaturaCanvas: null,
  assinaturaCtx: null,
  isDrawing: false,
  sttInicializado: false,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza o formulário de nova ocorrência
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderNovaOcorrencia(container, appInstance) {
  // Verificar autenticação
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
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

  // Verificar se tem dados do rascunho
  if (appInstance.dadosRascunho) {
    estado.id = appInstance.rascunhoId;
    estado.dados = appInstance.dadosRascunho;
    estado.modo = MODE_NORMAL;
    appInstance.alteracoesNaoSalvas = true;
    console.log("📂 Rascunho carregado para edição:", estado.id);
  } else {
    // Resetar estado
    estado.etapa = 1;
    estado.id = null;
    estado.modo = MODE_NORMAL;
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
      envolvidos: [],
      observacoes: "",
      anexos: [],
      assinatura: null,
      audio: null,
    };
    estado.modeloSelecionado = "";
    appInstance.alteracoesNaoSalvas = false;
    estado.sttInicializado = false;
  }

  // Renderizar modo de entrada (normal ou rápido)
  renderizarModoEntrada(container, appInstance);

  // Registrar funções globais
  window._novaOcorrenciaProxima = () => proximaEtapa(appInstance);
  window._novaOcorrenciaAnterior = () => etapaAnterior(appInstance);
  window._novaOcorrenciaFinalizar = () => finalizarOcorrencia(appInstance);
  window._novaOcorrenciaSalvarRascunho = () => appInstance.salvarRascunho();
  window._novaOcorrenciaAdicionarEnvolvido = () =>
    adicionarEnvolvido(appInstance);
  window._novaOcorrenciaRemoverEnvolvido = (index) =>
    removerEnvolvido(index, appInstance);
  window._novaOcorrenciaRemoverAnexo = (index) =>
    removerAnexo(index, appInstance);
  window._novaOcorrenciaProcessarAnexos = (files) =>
    processarAnexos(files, appInstance);
  window._novaOcorrenciaSalvarEnvolvido = () => salvarEnvolvido(appInstance);
  window._novaOcorrenciaConfirmarInput = () => confirmarInputModal(appInstance);
  window._novaOcorrenciaAplicarModelo = (tipo) =>
    aplicarModeloOcorrencia(tipo, appInstance);
  window._novaOcorrenciaGravarAudio = () => toggleGravacaoAudio(appInstance);
  window._novaOcorrenciaAssinar = () => iniciarAssinatura(appInstance);
  window._novaOcorrenciaCameraRapida = () => abrirCameraRapida(appInstance);
  window._novaOcorrenciaModoNormal = () => setModo(MODE_NORMAL, appInstance);
  window._novaOcorrenciaModoRapido = () => setModo(MODE_RAPIDO, appInstance);
  window._novaOcorrenciaRemoverAudio = () => removerAudio(appInstance);
  window._novaOcorrenciaRemoverAssinatura = () =>
    removerAssinatura(appInstance);
}

// ============================================
// MODO DE ENTRADA
// ============================================

function renderizarModoEntrada(container, appInstance) {
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

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <button onclick="window._novaOcorrenciaModoNormal()" 
          class="btn-primary" 
          style="padding:12px;border-radius:12px;font-size:14px;background:${estado.modo === MODE_NORMAL ? "var(--gradiente-principal)" : "var(--cinza-claro)"};color:${estado.modo === MODE_NORMAL ? "var(--branco)" : "var(--cinza-escuro)"};">
          <i class="fas fa-file-alt"></i> Modo Normal
        </button>
        <button onclick="window._novaOcorrenciaModoRapido()" 
          class="btn-primary" 
          style="padding:12px;border-radius:12px;font-size:14px;background:${estado.modo === MODE_RAPIDO ? "var(--gradiente-principal)" : "var(--cinza-claro)"};color:${estado.modo === MODE_RAPIDO ? "var(--branco)" : "var(--cinza-escuro)"};">
          <i class="fas fa-bolt"></i> Modo Rápido ⚡
        </button>
      </div>

      ${estado.modo === MODE_RAPIDO ? renderizarModoRapido(appInstance) : ""}
      ${estado.modo === MODE_NORMAL ? renderizarModoNormal(appInstance) : ""}
    </div>
  `;

  container.innerHTML = html;
}

function renderizarModoRapido(appInstance) {
  const hoje = new Date().toISOString().slice(0, 16);

  return `
    <div style="background:var(--branco);border-radius:var(--border-radius);padding:16px;box-shadow:var(--sombra-media);">
      <h3 style="color:var(--azul-bandeira);margin:0 0 12px 0;font-size:15px;">
        <i class="fas fa-bolt" style="color:var(--aviso);"></i> 
        BO Rápido - Apenas campos essenciais
      </h3>
      <p style="color:var(--cinza-medio);font-size:13px;margin-bottom:16px;">
        Preencha apenas os campos obrigatórios para agilizar o registro.
        Você pode complementar depois.
      </p>

      <form id="formOcorrenciaRapida" onsubmit="event.preventDefault();">
        <div class="form-group" style="margin-bottom:12px;">
          <label for="rapido_tipo_ocorrencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
            Tipo de Ocorrência <span class="required">*</span>
          </label>
          <div class="input-wrapper">
            <i class="fas fa-list input-icon-left"></i>
            <select id="rapido_tipo_ocorrencia" class="form-control" required style="width:100%;padding:10px 12px 10px 36px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;">
              <option value="">Selecione...</option>
              ${TIPOS_OCORRENCIA.map(
                (op) => `
                <option value="${op.value}">${op.label}</option>
              `,
              ).join("")}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label for="rapido_local_ocorrencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
            Local da Ocorrência <span class="required">*</span>
          </label>
          <div class="input-wrapper">
            <i class="fas fa-map-marker-alt input-icon-left"></i>
            <input type="text" id="rapido_local_ocorrencia" class="form-control" placeholder="Endereço completo" required style="width:100%;padding:10px 12px 10px 36px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label for="rapido_data_hora" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
            Data/Hora <span class="required">*</span>
          </label>
          <div style="display:flex;gap:8px;">
            <div style="flex:1;position:relative;">
              <i class="fas fa-calendar input-icon-left" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:14px;z-index:2;"></i>
              <input type="datetime-local" id="rapido_data_hora" class="form-control" required style="width:100%;padding:10px 12px 10px 36px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;" value="${hoje}">
            </div>
            <button type="button" onclick="document.getElementById('rapido_data_hora').value = '${new Date().toISOString().slice(0, 16)}'" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
              <i class="fas fa-clock"></i> Agora
            </button>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label for="rapido_nome_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
            Nome do Solicitante
          </label>
          <div class="input-wrapper">
            <i class="fas fa-user input-icon-left"></i>
            <input type="text" id="rapido_nome_solicitante" class="form-control" placeholder="Nome (deixe em branco para anônimo)" style="width:100%;padding:10px 12px 10px 36px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label for="rapido_observacoes" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
            Relato dos Fatos <span class="required">*</span>
          </label>
          <div style="position:relative;">
            <textarea id="rapido_observacoes" class="form-control" rows="4" placeholder="Descreva resumidamente o ocorrido..." required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:80px;resize:vertical;padding-right:45px;"></textarea>
            <button type="button" id="btnSttRapido" class="btn-stt" title="Falar relato" style="position:absolute; right:10px; bottom:10px; width:44px; height:44px; border-radius:50%; background:var(--azul-muito-claro); color:var(--azul-bandeira); border:2px solid var(--azul-claro); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:5; transition:all 0.3s ease;">
              <i class="fas fa-microphone" style="font-size:18px;"></i>
            </button>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:16px;">
          <button type="button" onclick="window._novaOcorrenciaFinalizarRapido()" class="btn-success" style="flex:2;border-radius:12px;">
            <i class="fas fa-check-circle"></i> Finalizar BO Rápido
          </button>
          <button type="button" onclick="window._novaOcorrenciaModoNormal()" class="btn-secondary" style="flex:1;border-radius:12px;">
            <i class="fas fa-edit"></i> Completar
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderizarModoNormal(appInstance) {
  // Renderizar etapa atual
  const container = document.createElement("div");
  container.id = "novaOcorrenciaContent";
  renderizarEtapa(container, appInstance);
  return container.outerHTML;
}

// ============================================
// FINALIZAR BO RÁPIDO
// ============================================

window._novaOcorrenciaFinalizarRapido = async function () {
  const appInstance = window._novaOcorrenciaAppInstance || window.app;

  const tipo = document.getElementById("rapido_tipo_ocorrencia")?.value;
  const local = document.getElementById("rapido_local_ocorrencia")?.value;
  const dataHora = document.getElementById("rapido_data_hora")?.value;
  const observacoes = document.getElementById("rapido_observacoes")?.value;
  const nomeSolicitante = document.getElementById(
    "rapido_nome_solicitante",
  )?.value;

  if (!tipo || !local || !dataHora || !observacoes) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Preencha todos os campos obrigatórios", "warning");
    }
    return;
  }

  // Confirmar finalização
  const confirmado = await appInstance.confirmar(
    "Deseja finalizar este BO rápido? Os dados poderão ser complementados depois.",
  );
  if (!confirmado) return;

  // Preparar dados
  const dados = {
    tipo_ocorrencia: tipo,
    local_ocorrencia: local,
    data_hora_inicio: dataHora,
    observacoes: observacoes,
    nome_solicitante: nomeSolicitante || "",
    forma_solicitacao: "Diretamente com a ocorrência",
    status: navigator.onLine ? "synced" : "pending_sync",
  };

  // Obter localização
  const localizacao = await appInstance.obterLocalizacao();
  if (localizacao) {
    dados.latitude = localizacao.latitude;
    dados.longitude = localizacao.longitude;
  }

  // Criar ocorrência
  const result = await ocorrenciaManager.criar(dados);

  if (!result.success) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao salvar: " + result.error, "error");
    }
    return;
  }

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("BO Rápido finalizado com sucesso!", "success");
  }

  // Logs
  await authManager.logCriarOcorrencia(authManager.getUserId(), result.data.id);

  // Resetar estado
  estado.etapa = 1;
  estado.id = null;
  estado.modo = MODE_NORMAL;
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
    envolvidos: [],
    observacoes: "",
    anexos: [],
    assinatura: null,
    audio: null,
  };
  estado.sttInicializado = false;

  setTimeout(() => appInstance.navigateTo("dashboard"), 1500);
};

// ============================================
// SET MODO
// ============================================

function setModo(modo, appInstance) {
  estado.modo = modo;
  const container =
    document.getElementById("page-nova-ocorrencia") ||
    document.getElementById("novaOcorrenciaContent");
  if (container) {
    renderizarModoEntrada(container, appInstance);
  }
}

// ============================================
// MODELOS DE OCORRÊNCIA
// ============================================

function aplicarModeloOcorrencia(tipo, appInstance) {
  const modelo = MODELOS_OCORRENCIA[tipo];
  if (!modelo) return;

  estado.modeloSelecionado = tipo;
  estado.dados.tipo_ocorrencia = tipo;
  estado.dados.observacoes = modelo.observacoes;

  // Atualizar campos
  const tipoSelect = document.getElementById("tipo_ocorrencia");
  if (tipoSelect) tipoSelect.value = tipo;

  const observacoesText = document.getElementById("observacoes");
  if (observacoesText) observacoesText.value = modelo.observacoes;

  // Ir para etapa 4 (observações)
  estado.etapa = 4;
  const container = document.getElementById("novaOcorrenciaContent");
  if (container) renderizarEtapa(container, appInstance);

  if (appInstance && appInstance.showToast) {
    appInstance.showToast(`Modelo "${modelo.titulo}" aplicado!`, "success");
  }

  appInstance.alteracoesNaoSalvas = true;
}

// ============================================
// ÁUDIO - GRAVAÇÃO
// ============================================

async function toggleGravacaoAudio(appInstance) {
  if (estado.isRecording) {
    // Parar gravação
    if (estado.audioRecorder) {
      estado.audioRecorder.stop();
      estado.isRecording = false;
      estado.audioRecorder = null;

      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Gravação finalizada", "info");
      }

      // Atualizar UI do botão
      const btnAudio = document.getElementById("btnGravarAudio");
      if (btnAudio) {
        btnAudio.innerHTML = '<i class="fas fa-microphone"></i> Gravar Áudio';
        btnAudio.style.background = "var(--cinza-claro)";
        btnAudio.style.color = "var(--cinza-escuro)";
      }
    }
    return;
  }

  // Iniciar gravação
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    estado.audioRecorder = mediaRecorder;
    estado.audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        estado.audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(estado.audioChunks, { type: "audio/webm" });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Salvar áudio
      estado.dados.audio = {
        blob: audioBlob,
        url: audioUrl,
        nome: `audio_${Date.now()}.webm`,
        tamanho: audioBlob.size,
      };

      // Mostrar preview
      const previewArea = document.getElementById("audioPreviewArea");
      if (previewArea) {
        previewArea.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--branco-fumaca);border-radius:var(--border-radius);border:1px solid var(--cinza-claro);">
            <i class="fas fa-file-audio" style="color:var(--azul-bandeira);font-size:20px;"></i>
            <span style="flex:1;font-size:13px;">Áudio gravado (${(audioBlob.size / 1024).toFixed(1)} KB)</span>
            <audio controls style="height:30px;max-width:120px;">
              <source src="${audioUrl}" type="audio/webm">
            </audio>
            <button type="button" onclick="window._novaOcorrenciaRemoverAudio()" style="background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;
      }

      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Áudio gravado com sucesso!", "success");
      }

      appInstance.alteracoesNaoSalvas = true;
    };

    mediaRecorder.start();
    estado.isRecording = true;

    // Atualizar UI do botão
    const btnAudio = document.getElementById("btnGravarAudio");
    if (btnAudio) {
      btnAudio.innerHTML = '<i class="fas fa-stop-circle"></i> Parar Gravação';
      btnAudio.style.background = "var(--erro)";
      btnAudio.style.color = "var(--branco)";
    }

    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        'Gravando... Clique em "Parar" para finalizar',
        "info",
      );
    }
  } catch (error) {
    console.error("Erro ao acessar microfone:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Erro ao acessar microfone: " + error.message,
        "error",
      );
    }
  }
}

function removerAudio(appInstance) {
  estado.dados.audio = null;
  const previewArea = document.getElementById("audioPreviewArea");
  if (previewArea) {
    previewArea.innerHTML = "";
  }
  if (appInstance) appInstance.alteracoesNaoSalvas = true;
}

function removerAssinatura(appInstance) {
  estado.dados.assinatura = null;
  const previewArea = document.getElementById("assinaturaPreviewArea");
  if (previewArea) {
    previewArea.innerHTML = "";
  }
  if (appInstance) appInstance.alteracoesNaoSalvas = true;
}

// ============================================
// ASSINATURA DIGITAL
// ============================================

function iniciarAssinatura(appInstance) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
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
    <div class="modal" style="max-width:500px;width:100%;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-pen" style="margin-right:8px;"></i>
          Assinatura Digital do Solicitante
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <p style="font-size:13px;color:var(--cinza-medio);margin-bottom:12px;text-align:center;">
          Assine abaixo com o dedo ou mouse
        </p>
        <div style="border:2px solid var(--cinza-claro);border-radius:var(--border-radius);overflow:hidden;background:white;touch-action:none;position:relative;">
          <canvas id="canvasAssinatura" style="width:100%;height:180px;display:block;cursor:crosshair;touch-action:none;"></canvas>
          <div style="position:absolute;bottom:8px;right:8px;font-size:10px;color:var(--cinza-medio);opacity:0.5;">
            <i class="fas fa-pen"></i> Assine aqui
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="button" onclick="window._limparAssinatura()" class="btn-secondary" style="flex:1;padding:8px;font-size:12px;min-height:auto;border-radius:8px;">
            <i class="fas fa-undo"></i> Limpar
          </button>
          <button type="button" onclick="window._confirmarAssinatura()" class="btn-primary" style="flex:2;padding:8px;font-size:12px;min-height:auto;border-radius:8px;">
            <i class="fas fa-check"></i> Confirmar Assinatura
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Inicializar canvas
  setTimeout(() => {
    const canvas = document.getElementById("canvasAssinatura");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = "100%";
    canvas.style.height = "180px";

    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.strokeStyle = "#003F87";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    estado.assinaturaCanvas = canvas;
    estado.assinaturaCtx = ctx;
    estado.isDrawing = false;

    // Eventos para mouse
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
      estado.isDrawing = true;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!estado.isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    canvas.addEventListener("mouseup", () => {
      estado.isDrawing = false;
      ctx.closePath();
    });

    canvas.addEventListener("mouseleave", () => {
      estado.isDrawing = false;
      ctx.closePath();
    });

    // Eventos para touch
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
      estado.isDrawing = true;
    });

    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (!estado.isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      estado.isDrawing = false;
      ctx.closePath();
    });

    // Funções globais
    window._limparAssinatura = function () {
      const canvas = document.getElementById("canvasAssinatura");
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    window._confirmarAssinatura = function () {
      const canvas = document.getElementById("canvasAssinatura");
      if (!canvas) return;

      // Verificar se há algo desenhado
      const dataUrl = canvas.toDataURL("image/png");
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(img, 0, 0);
        const imageData = tempCtx.getImageData(
          0,
          0,
          tempCanvas.width,
          tempCanvas.height,
        );
        const data = imageData.data;

        let hasDrawing = false;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            hasDrawing = true;
            break;
          }
        }

        if (!hasDrawing) {
          if (appInstance && appInstance.showToast) {
            appInstance.showToast("Por favor, faça uma assinatura", "warning");
          }
          return;
        }

        // Salvar assinatura
        estado.dados.assinatura = {
          dataUrl: dataUrl,
          nome: `assinatura_${Date.now()}.png`,
        };

        const overlay = document.querySelector(".modal-overlay");
        if (overlay) overlay.remove();

        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Assinatura coletada com sucesso!", "success");
        }
        appInstance.alteracoesNaoSalvas = true;

        // Mostrar preview
        const previewArea = document.getElementById("assinaturaPreviewArea");
        if (previewArea) {
          previewArea.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--branco-fumaca);border-radius:var(--border-radius);border:1px solid var(--cinza-claro);">
              <i class="fas fa-file-signature" style="color:var(--azul-bandeira);font-size:20px;"></i>
              <span style="flex:1;font-size:13px;">Assinatura coletada</span>
              <img src="${dataUrl}" style="height:40px;border:1px solid var(--cinza-claro);border-radius:4px;object-fit:contain;">
              <button type="button" onclick="window._novaOcorrenciaRemoverAssinatura()" style="background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px;">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
        }
      };
      img.src = dataUrl;
    };
  }, 100);
}

// ============================================
// CÂMERA RÁPIDA
// ============================================

function abrirCameraRapida(appInstance) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";
  input.style.display = "none";

  input.onchange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processarAnexos(files, appInstance);
    }
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ============================================
// RENDERIZAÇÃO DE ETAPA
// ============================================

function renderizarEtapa(container, appInstance) {
  const etapa = estado.etapa;
  const dados = estado.dados;

  console.log(`📌 Renderizando etapa ${etapa} de ${TOTAL_ETAPAS}`);

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-file-alt" style="margin-right:8px;"></i>
          Nova Ocorrência
        </h2>
        <button onclick="window._novaOcorrenciaModoRapido()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;background:var(--aviso);color:white;">
          <i class="fas fa-bolt"></i> Modo Rápido
        </button>
      </div>
      <div class="step-indicator">
        ${renderSteps(etapa, TOTAL_ETAPAS)}
      </div>
      <div class="step-title">${getEtapaTitulo(etapa)}</div>
      <div class="step-subtitle">${getEtapaSubtitulo(etapa)}</div>

      ${etapa === 2 ? renderModelosOcorrencia(appInstance) : ""}

      <form id="formOcorrencia" style="margin-top:16px;" onsubmit="event.preventDefault();">
        ${renderEtapaForm(etapa, dados, appInstance)}
      </form>
      <div class="form-actions">
        ${
          etapa > 1
            ? `
          <button type="button" class="btn-secondary" onclick="window._novaOcorrenciaAnterior()">
            <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar
          </button>
        `
            : ""
        }
        ${
          etapa < TOTAL_ETAPAS
            ? `
          <button type="button" class="btn-primary" onclick="window._novaOcorrenciaProxima()">
            Próximo <i class="fas fa-arrow-right" style="margin-left:6px;"></i>
          </button>
        `
            : `
          <button type="button" class="btn-success" onclick="window._novaOcorrenciaFinalizar()">
            <i class="fas fa-check-circle" style="margin-right:6px;"></i> Finalizar Ocorrência
          </button>
        `
        }
      </div>
      <div style="margin-top:12px;">
        <button type="button" class="btn-secondary" onclick="window._novaOcorrenciaSalvarRascunho()" 
          style="width:100%;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);">
          <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Rascunho
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Configurar eventos de formulário
  configurarEventosFormulario(appInstance);

  // Adicionar listeners para detectar alterações
  document
    .querySelectorAll(
      "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
    )
    .forEach((input) => {
      input.addEventListener("change", () => {
        appInstance.alteracoesNaoSalvas = true;
      });
      input.addEventListener("input", () => {
        appInstance.alteracoesNaoSalvas = true;
      });
    });

  // Registrar funções para botões da etapa atual
  if (etapa === 5) {
    window._novaOcorrenciaRemoverAudio = () => removerAudio(appInstance);
    window._novaOcorrenciaRemoverAssinatura = () =>
      removerAssinatura(appInstance);
  }

  // Inicializar Speech-to-Text quando estiver na etapa 4 ou modo rápido
  if (etapa === 4) {
    setTimeout(() => {
      inicializarSpeechToText(appInstance);
    }, 300);
  }

  // Inicializar Speech-to-Text no modo rápido
  if (estado.modo === MODE_RAPIDO) {
    setTimeout(() => {
      inicializarSpeechToTextRapido(appInstance);
    }, 500);
  }
}

// ============================================
// INICIALIZAR SPEECH-TO-TEXT
// ============================================

function inicializarSpeechToText(appInstance) {
  if (estado.sttInicializado) {
    console.log("ℹ️ STT já inicializado para esta etapa");
    return;
  }

  if (window.utils && window.utils.initSpeechToText) {
    console.log("🎤 Inicializando Speech-to-Text para observações");
    window.utils.initSpeechToText(
      "observacoes",
      "btnSttObservacoes",
      appInstance,
    );
    estado.sttInicializado = true;
  } else {
    console.warn("⚠️ utils.initSpeechToText não disponível");
  }
}

function inicializarSpeechToTextRapido(appInstance) {
  if (window.utils && window.utils.initSpeechToText) {
    console.log("🎤 Inicializando Speech-to-Text para modo rápido");
    window.utils.initSpeechToText(
      "rapido_observacoes",
      "btnSttRapido",
      appInstance,
    );
  } else {
    console.warn("⚠️ utils.initSpeechToText não disponível para modo rápido");
  }
}

// ============================================
// MODELOS DE OCORRÊNCIA (BANNER)
// ============================================

function renderModelosOcorrencia(appInstance) {
  return `
    <div style="margin-bottom:16px;background:var(--azul-muito-claro);border-radius:var(--border-radius);padding:12px;">
      <p style="font-size:12px;color:var(--azul-bandeira);font-weight:600;margin:0 0 8px 0;">
        <i class="fas fa-copy" style="margin-right:6px;"></i>
        Modelos Rápidos (clique para aplicar)
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${Object.keys(MODELOS_OCORRENCIA)
          .map(
            (key) => `
          <button onclick="window._novaOcorrenciaAplicarModelo('${key}')" 
            class="btn-secondary" 
            style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:20px;background:${estado.modeloSelecionado === key ? "var(--azul-bandeira)" : "var(--branco)"};color:${estado.modeloSelecionado === key ? "var(--branco)" : "var(--cinza-escuro)"};">
            ${MODELOS_OCORRENCIA[key].titulo}
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO DE STEPS
// ============================================

function renderSteps(etapaAtual, total) {
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

// ============================================
// TÍTULOS E SUBTÍTULOS
// ============================================

function getEtapaTitulo(etapa) {
  const titulos = {
    1: "Origem da Solicitação",
    2: "Dados da Ocorrência",
    3: "Qualificação dos Envolvidos",
    4: "Observações e Relato dos Fatos",
    5: "Anexos e Evidências",
    6: "Revisão e Finalização",
  };
  return titulos[etapa] || "";
}

function getEtapaSubtitulo(etapa) {
  const subtitulos = {
    1: "Informe como a solicitação chegou até você",
    2: "Preencha os dados principais da ocorrência",
    3: "Cadastre os envolvidos (autores, vítimas, testemunhas)",
    4: "Descreva detalhadamente o ocorrido",
    5: "Adicione fotos, áudios, assinatura ou documentos",
    6: "Revise todos os dados antes de finalizar",
  };
  return subtitulos[etapa] || "";
}

// ============================================
// RENDERIZAÇÃO DE FORMULÁRIO POR ETAPA
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
    default:
      return "<p>Etapa não encontrada</p>";
  }
}

// ============================================
// ETAPA 1 - ORIGEM DA SOLICITAÇÃO
// ============================================

function renderEtapa1(dados) {
  return `
    <div class="form-group">
      <label for="forma_solicitacao">
        <i class="fas fa-phone-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Forma de solicitação <span class="required">*</span>
      </label>
      <div class="input-wrapper">
        <i class="fas fa-list-ul input-icon-left"></i>
        <select id="forma_solicitacao" class="form-control" required>
          ${FORMAS_SOLICITACAO.map(
            (op) => `
            <option value="${op.value}" ${dados.forma_solicitacao === op.value ? "selected" : ""}>
              ${op.label}
            </option>
          `,
          ).join("")}
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
        <input type="text" id="nome_solicitante" class="form-control" 
          placeholder="Nome completo (deixe em branco para anônimo)" 
          value="${dados.nome_solicitante || ""}"
          style="min-height:44px;">
      </div>
      <div class="input-hint">
        <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
        Deixe em branco para registrar ocorrência anônima
      </div>
    </div>

    <div class="form-group">
      <label for="cpf_solicitante">
        <i class="fas fa-id-card" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        CPF do Solicitante
      </label>
      <div class="input-wrapper">
        <i class="fas fa-id-card input-icon-left"></i>
        <input type="text" id="cpf_solicitante" class="form-control" 
          placeholder="123.456.789-00" 
          value="${dados.cpf_solicitante || ""}"
          maxlength="14"
          style="min-height:44px;">
      </div>
      <div class="input-hint">
        <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
        Opcional - para identificação do solicitante
      </div>
    </div>

    <div class="form-group">
      <label for="rg_solicitante">
        <i class="fas fa-address-card" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        RG do Solicitante
      </label>
      <div class="input-wrapper">
        <i class="fas fa-address-card input-icon-left"></i>
        <input type="text" id="rg_solicitante" class="form-control" 
          placeholder="RG do solicitante" 
          value="${dados.rg_solicitante || ""}"
          style="min-height:44px;">
      </div>
      <div class="input-hint">
        <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
        Opcional - apenas se informado pelo solicitante
      </div>
    </div>

    <div class="form-group">
      <label for="telefone_solicitante">
        <i class="fas fa-phone" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Telefone do solicitante
      </label>
      <div class="input-wrapper">
        <i class="fas fa-phone input-icon-left"></i>
        <input type="tel" id="telefone_solicitante" class="form-control" 
          placeholder="(44) 99999-9999" 
          value="${dados.telefone_solicitante || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="endereco_solicitante">
        <i class="fas fa-home" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Endereço informado pelo solicitante
      </label>
      <div class="input-wrapper">
        <i class="fas fa-map-marker-alt input-icon-left"></i>
        <input type="text" id="endereco_solicitante" class="form-control" 
          placeholder="Rua, número, bairro" 
          value="${dados.endereco_solicitante || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="codigo_municipal">
        <i class="fas fa-hashtag" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Código do próprio municipal
      </label>
      <div class="input-wrapper">
        <i class="fas fa-hashtag input-icon-left"></i>
        <input type="text" id="codigo_municipal" class="form-control" 
          placeholder="Código do imóvel" 
          value="${dados.codigo_municipal || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="complemento">
        <i class="fas fa-pen" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Complemento
      </label>
      <div class="input-wrapper">
        <i class="fas fa-pen input-icon-left"></i>
        <input type="text" id="complemento" class="form-control" 
          placeholder="Apto, bloco, ponto de referência" 
          value="${dados.complemento || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="bairro_solicitante">
        <i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Bairro
      </label>
      <div class="input-wrapper">
        <i class="fas fa-location-dot input-icon-left"></i>
        <input type="text" id="bairro_solicitante" class="form-control" 
          placeholder="Bairro" 
          value="${dados.bairro_solicitante || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="identificacao_adicional">
        <i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Identificação adicional do solicitante
      </label>
      <textarea id="identificacao_adicional" class="form-control" rows="3" 
        placeholder="Informações adicionais para identificar o solicitante">${dados.identificacao_adicional || ""}</textarea>
    </div>
  `;
}

// ============================================
// ETAPA 2 - DADOS DA OCORRÊNCIA
// ============================================

function renderEtapa2(dados, appInstance) {
  // Obter data/hora atual
  const agora = new Date();
  const timezoneOffset = agora.getTimezoneOffset();
  const adjustedDate = new Date(agora.getTime() - timezoneOffset * 60000);
  const dataHoraAtual = adjustedDate.toISOString().slice(0, 16);

  let dataInicio = dados.data_hora_inicio;
  if (!dataInicio || dataInicio === "") {
    dataInicio = dataHoraAtual;
  } else {
    try {
      const dateObj = new Date(dataInicio);
      if (!isNaN(dateObj.getTime())) {
        const offset = dateObj.getTimezoneOffset();
        const adjusted = new Date(dateObj.getTime() - offset * 60000);
        dataInicio = adjusted.toISOString().slice(0, 16);
      } else {
        dataInicio = dataHoraAtual;
      }
    } catch (e) {
      dataInicio = dataHoraAtual;
    }
  }

  const dataFim = dados.data_hora_encerramento || "";

  return `
    <div class="form-group">
      <label for="codigo_operacional">
        <i class="fas fa-barcode" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Código operacional
      </label>
      <div class="input-wrapper">
        <i class="fas fa-barcode input-icon-left"></i>
        <input type="text" id="codigo_operacional" class="form-control" 
          placeholder="Código da ocorrência" 
          value="${dados.codigo_operacional || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="tipo_ocorrencia">
        <i class="fas fa-tag" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Tipo de Ocorrência <span class="required">*</span>
      </label>
      <div class="input-wrapper">
        <i class="fas fa-list input-icon-left"></i>
        <select id="tipo_ocorrencia" class="form-control" required style="min-height:44px;">
          <option value="">Selecione o tipo...</option>
          ${TIPOS_OCORRENCIA.map(
            (op) => `
            <option value="${op.value}" ${dados.tipo_ocorrencia === op.value ? "selected" : ""}>
              ${op.label}
            </option>
          `,
          ).join("")}
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
        <input type="text" id="local_ocorrencia" class="form-control" 
          placeholder="Endereço completo" required 
          value="${dados.local_ocorrencia || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="rodovia">
        <i class="fas fa-road" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Rodovia (se aplicável)
      </label>
      <div class="input-wrapper">
        <i class="fas fa-road input-icon-left"></i>
        <input type="text" id="rodovia" class="form-control" 
          placeholder="BR-123, km 45" 
          value="${dados.rodovia || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="bairro_ocorrencia">
        <i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Bairro
      </label>
      <div class="input-wrapper">
        <i class="fas fa-location-dot input-icon-left"></i>
        <input type="text" id="bairro_ocorrencia" class="form-control" 
          placeholder="Bairro" 
          value="${dados.bairro_ocorrencia || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="referencia">
        <i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Referência
      </label>
      <div class="input-wrapper">
        <i class="fas fa-info-circle input-icon-left"></i>
        <input type="text" id="referencia" class="form-control" 
          placeholder="Ponto de referência próximo" 
          value="${dados.referencia || ""}"
          style="min-height:44px;">
      </div>
    </div>

    <div class="form-group">
      <label for="data_hora_inicio">
        <i class="fas fa-calendar-plus" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Data e hora do início (Horário de Brasília) <span class="required">*</span>
      </label>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;position:relative;">
          <i class="fas fa-calendar input-icon-left" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:14px;z-index:2;"></i>
          <input type="datetime-local" id="data_hora_inicio" class="form-control" required 
            value="${dataInicio}"
            style="min-height:44px;padding-left:36px;">
        </div>
        <button type="button" onclick="document.getElementById('data_hora_inicio').value = '${dataHoraAtual}'" 
          class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
          <i class="fas fa-clock"></i> Agora
        </button>
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
      <div style="display:flex;gap:8px;">
        <div style="flex:1;position:relative;">
          <i class="fas fa-calendar-check input-icon-left" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:14px;z-index:2;"></i>
          <input type="datetime-local" id="data_hora_encerramento" class="form-control" 
            value="${dataFim}"
            style="min-height:44px;padding-left:36px;">
        </div>
        <button type="button" onclick="document.getElementById('data_hora_encerramento').value = '${dataHoraAtual}'" 
          class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
          <i class="fas fa-clock"></i> Agora
        </button>
      </div>
      <div class="input-hint">
        <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
        Deixe em branco se ainda não encerrou
      </div>
    </div>
  `;
}

// ============================================
// ETAPA 3 - ENVOLVIDOS
// ============================================

function renderEtapa3(dados, appInstance) {
  const envolvidos = dados.envolvidos || [];

  let html = `
    <div style="margin-bottom:16px;">
      <p style="color:var(--cinza-medio);font-size:14px;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Cadastre os envolvidos na ocorrência. Você pode adicionar quantos forem necessários.
      </p>
    </div>
    <div id="listaEnvolvidos">
  `;

  if (envolvidos.length === 0) {
    html += `
      <div class="lista-vazia">
        <i class="fas fa-users"></i>
        <p>Nenhum envolvido cadastrado</p>
        <p class="sub">Clique no botão abaixo para adicionar</p>
      </div>
    `;
  } else {
    envolvidos.forEach((env, index) => {
      html += `
        <div class="envolvido-item-modern">
          <div class="header">
            <span class="badge badge-azul">
              <i class="fas fa-user" style="margin-right:4px;"></i>
              ${getTipoEnvolvidoLabel(env.tipo)}
            </span>
            <span class="nome">${env.nome_completo || "Nome não informado"}</span>
            <button type="button" class="remove-btn" onclick="window._novaOcorrenciaRemoverEnvolvido(${index})" 
              style="margin-left:auto;background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
          <div class="detalhes-grid">
            ${
              env.cpf
                ? `
              <div class="campo">
                <i class="fas fa-id-card"></i>
                <span class="label">CPF:</span>
                <span class="valor">${env.cpf}</span>
              </div>
            `
                : ""
            }
            ${
              env.rg
                ? `
              <div class="campo">
                <i class="fas fa-address-card"></i>
                <span class="label">RG:</span>
                <span class="valor">${env.rg}</span>
              </div>
            `
                : ""
            }
            ${
              env.telefone
                ? `
              <div class="campo">
                <i class="fas fa-phone"></i>
                <span class="label">Tel:</span>
                <span class="valor">${env.telefone}</span>
              </div>
            `
                : ""
            }
            ${
              env.data_nascimento
                ? `
              <div class="campo">
                <i class="fas fa-calendar-alt"></i>
                <span class="label">Nasc:</span>
                <span class="valor">${new Date(env.data_nascimento).toLocaleDateString("pt-BR")}</span>
              </div>
            `
                : ""
            }
            ${
              env.endereco
                ? `
              <div class="campo">
                <i class="fas fa-map-marker-alt"></i>
                <span class="label">End:</span>
                <span class="valor">${env.endereco}</span>
              </div>
            `
                : ""
            }
            ${
              env.bairro
                ? `
              <div class="campo">
                <i class="fas fa-location-dot"></i>
                <span class="label">Bairro:</span>
                <span class="valor">${env.bairro}</span>
              </div>
            `
                : ""
            }
            ${
              env.cidade
                ? `
              <div class="campo">
                <i class="fas fa-city"></i>
                <span class="label">Cidade:</span>
                <span class="valor">${env.cidade}</span>
              </div>
            `
                : ""
            }
            ${
              env.observacoes
                ? `
              <div class="campo" style="grid-column: 1 / -1;">
                <i class="fas fa-pencil-alt"></i>
                <span class="label">Obs:</span>
                <span class="valor">${env.observacoes}</span>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    });
  }

  html += `
    </div>
    <button type="button" class="btn-add" onclick="window._novaOcorrenciaAdicionarEnvolvido()">
      <i class="fas fa-plus-circle"></i> Adicionar Envolvido
    </button>
  `;

  return html;
}

// ============================================
// ETAPA 4 - OBSERVAÇÕES
// ============================================

function renderEtapa4(dados, appInstance) {
  return `
    <div class="form-group">
      <label for="observacoes">
        <i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
        Observações e Relato dos Fatos <span class="required">*</span>
      </label>
      <div class="stt-container" style="position:relative; width:100%;">
        <textarea id="observacoes" class="form-control" rows="8" 
          placeholder="Descreva detalhadamente o ocorrido..." required style="padding-right: 45px; width:100%;">${dados.observacoes || ""}</textarea>
        <button type="button" id="btnSttObservacoes" class="btn-stt" title="Falar relato" style="position:absolute; right:10px; bottom:10px; width:44px; height:44px; border-radius:50%; background:var(--azul-muito-claro); color:var(--azul-bandeira); border:2px solid var(--azul-claro); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:5; transition:all 0.3s ease;">
          <i class="fas fa-microphone" style="font-size:18px;"></i>
        </button>
      </div>
      <div class="input-hint">
        <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
        Mínimo 10 caracteres. Use o microfone para falar.
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" onclick="document.getElementById('observacoes').value += 'O solicitante informou que...'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">
          Início padrão
        </button>
        <button type="button" onclick="document.getElementById('observacoes').value += 'A equipe constatou a situação e orientou as partes envolvidas.'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">
          Conclusão padrão
        </button>
      </div>
    </div>
  `;
}

// ============================================
// ETAPA 5 - ANEXOS E EVIDÊNCIAS
// ============================================

function renderEtapa5(dados, appInstance) {
  const anexos = dados.anexos || [];
  const temAssinatura = dados.assinatura !== null;
  const temAudio = dados.audio !== null;

  return `
    <div style="margin-bottom:16px;">
      <p style="color:var(--cinza-medio);font-size:14px;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Adicione fotos, áudios, assinatura ou documentos como evidência.
      </p>
    </div>

    <!-- Fotos e Documentos -->
    <div style="margin-bottom:16px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-camera"></i> Fotos e Documentos (${anexos.length})
      </h4>
      <div class="file-upload" onclick="document.getElementById('fileInput').click()">
        <div class="icon">
          <i class="fas fa-cloud-upload-alt"></i>
        </div>
        <div class="text">
          <strong>Clique para adicionar anexos</strong><br>
          <span style="font-size:13px;color:var(--cinza-medio);">Fotos, vídeos ou documentos</span>
        </div>
        <input type="file" id="fileInput" multiple accept="image/*,video/*,application/pdf" style="display:none;" 
          onchange="window._novaOcorrenciaProcessarAnexos(this.files)">
      </div>
      <div style="margin-top:4px;">
        <button type="button" onclick="window._novaOcorrenciaCameraRapida()" class="btn-secondary" style="width:100%;font-size:12px;padding:6px;border-radius:var(--border-radius);background:var(--azul-muito-claro);color:var(--azul-bandeira);">
          <i class="fas fa-camera-retro"></i> Tirar Foto Agora
        </button>
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
                    <i class="fas ${getIconAnexo(anexo.tipo)}"></i>
                  </div>
                  <div>
                    <div class="name">${anexo.nome}</div>
                    <div class="size">${formatarTamanho(anexo.tamanho)}</div>
                  </div>
                </div>
                <div class="file-actions">
                  <button type="button" class="remove-btn" onclick="window._novaOcorrenciaRemoverAnexo(${index})">
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
    </div>

    <!-- Áudio -->
    <div style="margin-bottom:16px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-microphone"></i> Áudio
      </h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" id="btnGravarAudio" onclick="window._novaOcorrenciaGravarAudio()" 
          class="btn-secondary" style="padding:8px 16px;font-size:12px;min-height:auto;border-radius:8px;background:${estado.isRecording ? "var(--erro)" : "var(--cinza-claro)"};color:${estado.isRecording ? "var(--branco)" : "var(--cinza-escuro)"};">
          <i class="fas fa-microphone"></i> ${estado.isRecording ? "Parar Gravação" : "Gravar Áudio"}
        </button>
        <span style="font-size:11px;color:var(--cinza-medio);align-self:center;">
          ${estado.isRecording ? "🔴 Gravando..." : "Grave o relato do solicitante"}
        </span>
      </div>
      <div id="audioPreviewArea" style="margin-top:8px;">
        ${
          temAudio
            ? `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--branco-fumaca);border-radius:var(--border-radius);border:1px solid var(--cinza-claro);">
            <i class="fas fa-file-audio" style="color:var(--azul-bandeira);font-size:20px;"></i>
            <span style="flex:1;font-size:13px;">Áudio gravado (${(dados.audio.tamanho / 1024).toFixed(1)} KB)</span>
            <audio controls style="height:30px;max-width:120px;">
              <source src="${dados.audio.url}" type="audio/webm">
            </audio>
            <button type="button" onclick="window._novaOcorrenciaRemoverAudio()" style="background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `
            : ""
        }
      </div>
    </div>

    <!-- Assinatura -->
    <div style="margin-bottom:16px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-file-signature"></i> Assinatura Digital
      </h4>
      <div style="display:flex;gap:8px;">
        <button type="button" onclick="window._novaOcorrenciaAssinar()" 
          class="btn-primary" style="padding:8px 16px;font-size:12px;min-height:auto;border-radius:8px;flex:1;">
          <i class="fas fa-pen"></i> Coletar Assinatura
        </button>
        <span style="font-size:11px;color:var(--cinza-medio);align-self:center;">
          ${temAssinatura ? "✅ Assinatura coletada" : "Solicite a assinatura do cidadão"}
        </span>
      </div>
      <div id="assinaturaPreviewArea" style="margin-top:8px;">
        ${
          temAssinatura
            ? `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--branco-fumaca);border-radius:var(--border-radius);border:1px solid var(--cinza-claro);">
            <i class="fas fa-file-signature" style="color:var(--azul-bandeira);font-size:20px;"></i>
            <span style="flex:1;font-size:13px;">Assinatura coletada</span>
            <img src="${dados.assinatura.dataUrl}" style="height:40px;border:1px solid var(--cinza-claro);border-radius:4px;object-fit:contain;">
            <button type="button" onclick="window._novaOcorrenciaRemoverAssinatura()" style="background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `
            : ""
        }
      </div>
    </div>

    <button type="button" class="btn-add" onclick="document.getElementById('fileInput').click()">
      <i class="fas fa-plus-circle"></i> Adicionar Anexos
    </button>
  `;
}

// ============================================
// ETAPA 6 - REVISÃO E FINALIZAÇÃO
// ============================================

function renderEtapa6(dados, appInstance) {
  const envolvidos = dados.envolvidos || [];
  const anexos = dados.anexos || [];
  const temAssinatura = dados.assinatura !== null;
  const temAudio = dados.audio !== null;

  const camposSolicitante = [
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
  ];

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
          </div>
        `
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
            <span class="badge badge-azul" style="font-size:10px;">${getTipoEnvolvidoLabel(env.tipo)}</span>
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
        Evidências
      </h4>
      <div style="font-size:13px;">
        <div><strong>📎 Anexos:</strong> ${anexos.length} arquivo(s)</div>
        <div><strong>🎤 Áudio:</strong> ${temAudio ? "✅ Gravado" : "❌ Não gravado"}</div>
        <div><strong>✍️ Assinatura:</strong> ${temAssinatura ? "✅ Coletada" : "❌ Não coletada"}</div>
      </div>
      ${
        anexos.length > 0
          ? `
        <div style="margin-top:4px;font-size:12px;color:var(--cinza-medio);">
          ${anexos.map((a) => a.nome).join(", ")}
        </div>
      `
          : ""
      }
      ${
        temAssinatura
          ? `
        <div style="margin-top:4px;">
          <img src="${dados.assinatura.dataUrl}" style="height:40px;border:1px solid var(--cinza-claro);border-radius:4px;object-fit:contain;">
        </div>
      `
          : ""
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
// CONFIGURAR EVENTOS DO FORMULÁRIO
// ============================================

function configurarEventosFormulario(appInstance) {
  // Máscara de CPF
  const cpfInput = document.getElementById("cpf_solicitante");
  if (cpfInput) {
    cpfInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

  // Máscara de telefone
  const telefoneInput = document.getElementById("telefone_solicitante");
  if (telefoneInput) {
    telefoneInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraTelefone(this.value);
    });
  }

  // Salvar dados ao mudar campos
  document
    .querySelectorAll(
      "#formOcorrencia input, #formOcorrencia select, #formOcorrencia textarea",
    )
    .forEach((input) => {
      input.addEventListener("change", () => salvarDadosEtapa());
      input.addEventListener("input", () => salvarDadosEtapa());
    });
}

// ============================================
// SALVAR DADOS DA ETAPA ATUAL
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
      dados.data_hora_encerramento =
        document.getElementById("data_hora_encerramento")?.value || "";
      break;

    case 4:
      dados.observacoes = document.getElementById("observacoes")?.value || "";
      break;
  }
}

// ============================================
// NAVEGAÇÃO ENTRE ETAPAS
// ============================================

function proximaEtapa(appInstance) {
  console.log("🔄 Tentando avançar da etapa:", estado.etapa);

  if (!validarEtapa(appInstance)) {
    return;
  }

  salvarDadosEtapa();

  if (estado.etapa < TOTAL_ETAPAS) {
    estado.etapa++;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function etapaAnterior(appInstance) {
  salvarDadosEtapa();

  if (estado.etapa > 1) {
    estado.etapa--;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================
// VALIDAÇÃO DE ETAPA
// ============================================

function validarEtapa(appInstance) {
  const etapa = estado.etapa;
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
    appInstance.showToast(mensagem, "warning");
  }

  return isValid;
}

// ============================================
// ENVOLVIDOS - ADICIONAR
// ============================================

function adicionarEnvolvido(appInstance) {
  const container = document.getElementById("novaOcorrenciaContent");
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
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-user-plus" style="margin-right:8px;"></i>
          Adicionar Envolvido
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <form id="formEnvolvido" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_tipo" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Tipo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <select id="env_tipo" class="form-control" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758B' d='M6 8L1 3h10z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;cursor:pointer;min-height:44px;">
              <option value="">Selecione...</option>
              <option value="autor">Autor</option>
              <option value="vitima">Vítima</option>
              <option value="testemunha">Testemunha</option>
              <option value="solicitante">Solicitante</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_nome" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nome Completo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="env_nome" class="form-control" placeholder="Nome completo" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_cpf" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              CPF
            </label>
            <input type="text" id="env_cpf" class="form-control" placeholder="123.456.789-00" maxlength="14" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_telefone" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Telefone
            </label>
            <input type="text" id="env_telefone" class="form-control" placeholder="(44) 99999-9999" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_rg" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              RG
            </label>
            <input type="text" id="env_rg" class="form-control" placeholder="RG" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_data_nascimento" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Data de Nascimento
            </label>
            <input type="date" id="env_data_nascimento" class="form-control" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_endereco" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Endereço
            </label>
            <input type="text" id="env_endereco" class="form-control" placeholder="Endereço" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_bairro" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Bairro
            </label>
            <input type="text" id="env_bairro" class="form-control" placeholder="Bairro" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_cidade" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Cidade
            </label>
            <input type="text" id="env_cidade" class="form-control" placeholder="Cidade" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_nome_pai" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nome do Pai
            </label>
            <input type="text" id="env_nome_pai" class="form-control" placeholder="Nome do pai" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_nome_mae" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nome da Mãe
            </label>
            <input type="text" id="env_nome_mae" class="form-control" placeholder="Nome da mãe" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:44px;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="env_observacoes" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Observações
            </label>
            <textarea id="env_observacoes" class="form-control" rows="2" placeholder="Observações adicionais" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:50px;resize:vertical;"></textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Cancelar
        </button>
        <button type="button" class="btn-primary" onclick="window._novaOcorrenciaSalvarEnvolvido()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
          <i class="fas fa-save" style="margin-right:6px;"></i> Salvar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Máscara de CPF no modal
  const cpfModal = document.getElementById("env_cpf");
  if (cpfModal) {
    cpfModal.addEventListener("input", function (e) {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

  // Máscara de telefone no modal
  const telefoneModal = document.getElementById("env_telefone");
  if (telefoneModal) {
    telefoneModal.addEventListener("input", function (e) {
      this.value = aplicarMascaraTelefone(this.value);
    });
  }
}

// ============================================
// ENVOLVIDOS - SALVAR
// ============================================

function salvarEnvolvido(appInstance) {
  const tipo = document.getElementById("env_tipo")?.value;
  const nome = document.getElementById("env_nome")?.value;

  if (!tipo || !nome) {
    appInstance.showToast("Preencha o tipo e o nome do envolvido", "warning");
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

  estado.dados.envolvidos.push(envolvido);
  appInstance.alteracoesNaoSalvas = true;

  const modal = document.querySelector(".modal-overlay");
  if (modal) modal.remove();

  const container = document.getElementById("novaOcorrenciaContent");
  if (container) renderizarEtapa(container, appInstance);

  appInstance.showToast("Envolvido adicionado com sucesso!", "success");
}

// ============================================
// ENVOLVIDOS - REMOVER
// ============================================

function removerEnvolvido(index, appInstance) {
  estado.dados.envolvidos.splice(index, 1);
  appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("novaOcorrenciaContent");
  if (container) renderizarEtapa(container, appInstance);

  appInstance.showToast("Envolvido removido", "info");
}

// ============================================
// ANEXOS - PROCESSAR
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
  appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("novaOcorrenciaContent");
  if (container) renderizarEtapa(container, appInstance);

  appInstance.showToast(`${files.length} anexo(s) adicionado(s)`, "success");

  // Limpar input
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
}

// ============================================
// ANEXOS - REMOVER
// ============================================

function removerAnexo(index, appInstance) {
  estado.dados.anexos.splice(index, 1);
  appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("novaOcorrenciaContent");
  if (container) renderizarEtapa(container, appInstance);

  appInstance.showToast("Anexo removido", "info");
}

// ============================================
// FINALIZAR OCORRÊNCIA
// ============================================

async function finalizarOcorrencia(appInstance) {
  salvarDadosEtapa();

  const dados = estado.dados;

  // Validações finais
  if (!dados.forma_solicitacao) {
    appInstance.showToast("Selecione a forma de solicitação", "warning");
    estado.etapa = 1;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  if (!dados.tipo_ocorrencia) {
    appInstance.showToast("Selecione o tipo de ocorrência", "warning");
    estado.etapa = 2;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  if (!dados.local_ocorrencia || dados.local_ocorrencia.trim() === "") {
    appInstance.showToast("Informe o local da ocorrência", "warning");
    estado.etapa = 2;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  if (!dados.data_hora_inicio || dados.data_hora_inicio === "") {
    appInstance.showToast("Informe a data e hora do início", "warning");
    estado.etapa = 2;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  if (!dados.observacoes || dados.observacoes.trim().length < 10) {
    appInstance.showToast(
      "Descreva o ocorrido com pelo menos 10 caracteres",
      "warning",
    );
    estado.etapa = 4;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  // Validar data/hora
  try {
    const dateObj = new Date(dados.data_hora_inicio);
    if (isNaN(dateObj.getTime())) {
      appInstance.showToast("Data e hora de início inválida", "warning");
      estado.etapa = 2;
      const container = document.getElementById("novaOcorrenciaContent");
      if (container) renderizarEtapa(container, appInstance);
      return;
    }
  } catch (e) {
    appInstance.showToast("Data e hora de início inválida", "warning");
    estado.etapa = 2;
    const container = document.getElementById("novaOcorrenciaContent");
    if (container) renderizarEtapa(container, appInstance);
    return;
  }

  if (dados.data_hora_encerramento) {
    try {
      const dateObj = new Date(dados.data_hora_encerramento);
      if (isNaN(dateObj.getTime())) {
        appInstance.showToast(
          "Data e hora de encerramento inválida",
          "warning",
        );
        estado.etapa = 2;
        const container = document.getElementById("novaOcorrenciaContent");
        if (container) renderizarEtapa(container, appInstance);
        return;
      }
      const inicio = new Date(dados.data_hora_inicio);
      const fim = new Date(dados.data_hora_encerramento);
      if (fim < inicio) {
        appInstance.showToast(
          "Data de encerramento deve ser posterior ao início",
          "warning",
        );
        estado.etapa = 2;
        const container = document.getElementById("novaOcorrenciaContent");
        if (container) renderizarEtapa(container, appInstance);
        return;
      }
    } catch (e) {
      appInstance.showToast("Data e hora de encerramento inválida", "warning");
      estado.etapa = 2;
      const container = document.getElementById("novaOcorrenciaContent");
      if (container) renderizarEtapa(container, appInstance);
      return;
    }
  }

  // Confirmar se não tem envolvidos
  if (dados.envolvidos.length === 0) {
    const confirmado = await appInstance.confirmar(
      "Nenhum envolvido cadastrado. Deseja continuar assim?",
    );
    if (!confirmado) {
      estado.etapa = 3;
      const container = document.getElementById("novaOcorrenciaContent");
      if (container) renderizarEtapa(container, appInstance);
      return;
    }
  }

  // Confirmar finalização
  const confirmado = await appInstance.confirmar(
    "Deseja finalizar esta ocorrência? Após finalizar, não será mais possível editar.",
  );
  if (!confirmado) return;

  // Preparar dados para salvar
  const envolvidos = dados.envolvidos || [];
  const anexos = dados.anexos || [];
  const assinatura = dados.assinatura;
  const audio = dados.audio;

  const dadosParaSalvar = { ...dados };
  delete dadosParaSalvar.envolvidos;
  delete dadosParaSalvar.anexos;
  delete dadosParaSalvar.assinatura;
  delete dadosParaSalvar.audio;

  // Ajustar datas
  if (dadosParaSalvar.data_hora_inicio) {
    try {
      const dateObj = new Date(dadosParaSalvar.data_hora_inicio);
      if (!isNaN(dateObj.getTime())) {
        const timezoneOffset = dateObj.getTimezoneOffset();
        const adjustedDate = new Date(
          dateObj.getTime() - timezoneOffset * 60000,
        );
        dadosParaSalvar.data_hora_inicio = adjustedDate.toISOString();
      }
    } catch (e) {
      const agora = await appInstance.obterDataHoraPrecisa();
      dadosParaSalvar.data_hora_inicio = agora.toISOString();
    }
  } else {
    const agora = await appInstance.obterDataHoraPrecisa();
    dadosParaSalvar.data_hora_inicio = agora.toISOString();
  }

  if (dadosParaSalvar.data_hora_encerramento) {
    try {
      const dateObj = new Date(dadosParaSalvar.data_hora_encerramento);
      if (!isNaN(dateObj.getTime())) {
        const timezoneOffset = dateObj.getTimezoneOffset();
        const adjustedDate = new Date(
          dateObj.getTime() - timezoneOffset * 60000,
        );
        dadosParaSalvar.data_hora_encerramento = adjustedDate.toISOString();
      } else {
        dadosParaSalvar.data_hora_encerramento = null;
      }
    } catch (e) {
      dadosParaSalvar.data_hora_encerramento = null;
    }
  } else {
    dadosParaSalvar.data_hora_encerramento = null;
  }

  // Obter localização com fallback
  let localizacao = await appInstance.obterLocalizacao({ timeout: 5000 });

  if (
    !localizacao.latitude &&
    window.sessionManager &&
    window.sessionManager.ultimaLocalizacao
  ) {
    console.log("📍 Usando última localização conhecida como fallback");
    localizacao = window.sessionManager.ultimaLocalizacao;
    appInstance.showToast(
      "GPS instável. Usando última posição conhecida.",
      "info",
    );
  }

  // Criar ocorrência
  const result = await ocorrenciaManager.criar({
    ...dadosParaSalvar,
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

  // Salvar envolvidos
  if (envolvidos.length > 0) {
    const envResult = await ocorrenciaManager.salvarEnvolvidos(
      ocorrenciaId,
      envolvidos,
    );
    if (!envResult.success) {
      erros.push("Erro ao salvar envolvidos: " + envResult.error);
    }
  }

  // Salvar anexos
  if (anexos.length > 0) {
    const anexoResult = await ocorrenciaManager.salvarAnexos(
      ocorrenciaId,
      anexos,
    );
    if (!anexoResult.success) {
      erros.push("Erro ao salvar anexos: " + anexoResult.error);
    }
  }

  // Salvar assinatura (como anexo especial)
  if (assinatura) {
    try {
      // Converter dataUrl para Blob
      const response = await fetch(assinatura.dataUrl);
      const blob = await response.blob();
      const file = new File([blob], assinatura.nome, { type: "image/png" });

      const anexoResult = await ocorrenciaManager.adicionarAnexo(
        ocorrenciaId,
        file,
        "image",
      );
      if (!anexoResult.success) {
        erros.push("Erro ao salvar assinatura: " + anexoResult.error);
      }
    } catch (e) {
      erros.push("Erro ao processar assinatura: " + e.message);
    }
  }

  // Salvar áudio
  if (audio) {
    try {
      const file = new File([audio.blob], audio.nome, { type: "audio/webm" });
      const anexoResult = await ocorrenciaManager.adicionarAnexo(
        ocorrenciaId,
        file,
        "audio",
      );
      if (!anexoResult.success) {
        erros.push("Erro ao salvar áudio: " + anexoResult.error);
      }
    } catch (e) {
      erros.push("Erro ao processar áudio: " + e.message);
    }
  }

  if (erros.length > 0) {
    appInstance.showToast(
      "Ocorrência salva, mas com erros: " + erros.join(" | "),
      "warning",
    );
  } else {
    appInstance.showToast("Ocorrência finalizada com sucesso!", "success");
  }

  // Logs
  await authManager.logCriarOcorrencia(authManager.getUserId(), ocorrenciaId);

  // Limpar rascunho
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

  // Resetar estado
  estado.etapa = 1;
  estado.id = null;
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
    envolvidos: [],
    observacoes: "",
    anexos: [],
    assinatura: null,
    audio: null,
  };
  estado.modeloSelecionado = "";
  estado.sttInicializado = false;
  appInstance.alteracoesNaoSalvas = false;

  setTimeout(() => appInstance.navigateTo("dashboard"), 1500);
}

// ============================================
// FUNÇÕES AUXILIARES
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

function determinarTipoAnexo(file) {
  const type = file.type;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || type.includes("document"))
    return "document";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

function confirmarInputModal(appInstance) {
  const textarea = document.getElementById("inputModalMotivo");
  if (!textarea) return;

  const valor = textarea.value.trim();
  if (valor.length < 5) {
    appInstance.showToast(
      "O motivo deve ter pelo menos 5 caracteres",
      "warning",
    );
    return;
  }

  const overlay = textarea.closest(".modal-overlay");
  if (overlay) {
    window._inputResolve(valor);
    overlay.remove();
  }
}

// Importar funções de máscara do utils
const { aplicarMascaraCPF, aplicarMascaraTelefone } = window.utils || {};

// Fallback para máscaras
function aplicarMascaraCPFFallback(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 3) return limpo;
  if (limpo.length <= 6) return limpo.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (limpo.length <= 9)
    return limpo.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

function aplicarMascaraTelefoneFallback(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 2) return `(${limpo}`;
  if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
  if (limpo.length <= 10)
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
}

const aplicarMascaraCPFSafe =
  window.utils?.aplicarMascaraCPF || aplicarMascaraCPFFallback;
const aplicarMascaraTelefoneSafe =
  window.utils?.aplicarMascaraTelefone || aplicarMascaraTelefoneFallback;

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderNovaOcorrencia,
  salvarDadosEtapa,
  validarEtapa,
  proximaEtapa,
  etapaAnterior,
  finalizarOcorrencia,
  setModo,
};
