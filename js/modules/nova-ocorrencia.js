/**
 * MÓDULO NOVA OCORRÊNCIA - Formulário de Registro de Ocorrência
 * Guarda Municipal de Pitangueiras - PR
 *
 * Layout com:
 * - Tela de escolha: Modo Rápido vs Modo Completo
 * - Modo Rápido: 5 campos essenciais + fotos
 * - Modo Completo: Formulário completo com todas as funcionalidades
 * - Completar BO Rápido: Adicionar dados faltantes
 * - Rascunho automático
 * - Geolocalização
 * - Hash pericial na finalização
 * - 🔥 NOVO: Assinaturas na etapa 5 (separadas dos anexos)
 * - 🔥 NOVO: Canvas para captura de assinatura
 * - 🔥 NOVO: Assinaturas NÃO aparecem na galeria de anexos
 * - 🔥 CORRIGIDO: Removido campo assinaturas_objeto do envio para o banco
 *
 * MELHORIAS APLICADAS:
 * - 🔥 ALTERADO: Anexos sem limite (removido MAX_ANEXOS)
 * - 🔥 NOVO: data_hora_finalizacao automática na finalização
 * - 🔥 NOVO: Validação de anexos sem limite de quantidade
 * - 🔥 NOVO: Campo data_hora_finalizacao no resumo
 * - 🔥 NOVO: Informação de finalização no modo rápido
 * - 🔥 NOVO: Assinaturas com canvas touch
 * - 🔥 NOVO: Separação entre anexos e assinaturas
 * - 🔥 CORRIGIDO: Data/Hora agora usa APENAS o horário do dispositivo, SEM ajuste de fuso
 * - 🔥 CORRIGIDO: Preenchimento automático do campo data/hora no modo rápido agora usa horário LOCAL do dispositivo
 * - 🔥 CORRIGIDO: Removido assinaturas_objeto do envio para o banco
 *
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

const TOTAL_ETAPAS = 6;

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
    assinaturas: [], // 🔥 NOVO: Array de assinaturas
    modo_criacao: MODE_COMPLETO,
    data_hora_finalizacao: null,
  },
  dadosOriginais: null,
  audioRecorder: null,
  audioChunks: [],
  isRecording: false,
  sttInicializado: false,
  modeloSelecionado: "",
  // 🔥 NOVO: Estado para o canvas de assinatura
  canvasAssinatura: null,
  assinaturaAtual: null,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
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
    estado.dados = appInstance.dadosRascunho;
    // 🔥 Garantir que assinaturas exista
    if (!estado.dados.assinaturas) {
      estado.dados.assinaturas = [];
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

  // Renderizar escolha de modo
  renderizarEscolhaModo(container, appInstance);
}

// ============================================
// RESETAR ESTADO
// ============================================

function resetarEstado() {
  estado.id = null;
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
    envolvidos: [],
    observacoes: "",
    anexos: [],
    assinaturas: [],
    modo_criacao: MODE_COMPLETO,
    data_hora_finalizacao: null,
  };
  estado.dadosOriginais = null;
  estado.sttInicializado = false;
  estado.modeloSelecionado = "";
  estado.canvasAssinatura = null;
  estado.assinaturaAtual = null;
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
      envolvidos: envResult.success ? envResult.data : [],
      observacoes: occ.observacoes || "",
      anexos: anexosResult.success ? anexosResult.data : [],
      assinaturas: occ.assinaturas || [],
      modo_criacao: occ.modo_criacao || MODE_RAPIDO,
      data_hora_finalizacao: occ.data_hora_finalizacao || null,
    };

    estado.dadosOriginais = JSON.parse(JSON.stringify(estado.dados));
    appInstance.alteracoesNaoSalvas = true;

    console.log("📂 BO Rápido carregado para completar:", id);
  } catch (error) {
    console.error("Erro ao carregar para completar:", error);
    appInstance.showToast("Erro ao carregar dados", "error");
  }
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
          <p style="font-size:12px;color:var(--cinza-medio);margin:0;">Todos os campos<br>+ Envolvidos + Assinaturas<br>+ Fotos (ilimitadas)</p>
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

  window._novaOcorrenciaVoltarModos = () => {
    resetarEstado();
    renderizarEscolhaModo(container, appInstance);
  };
}

// ============================================
// RENDERIZAR FORMULÁRIO RÁPIDO
// ============================================

function renderizarFormularioRapido(container, appInstance) {
  // 🔥 CORRIGIDO: Usar a função auxiliar que retorna o horário LOCAL do dispositivo
  const hoje = obterDataHoraLocalInput();

  const html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-bolt" style="margin-right:8px;color:var(--aviso);"></i>
            Modo Rápido ⚡
          </h2>
          <p style="color:var(--cinza-medio);font-size:12px;margin:0;">Preencha apenas os campos essenciais</p>
        </div>
        <button onclick="window._novaOcorrenciaVoltarModos()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:14px;box-shadow:var(--sombra-media);">
        <form id="formOcorrenciaRapida" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-tag" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Tipo de Ocorrência <span class="required" style="color:var(--erro);">*</span>
            </label>
            <select id="rapido_tipo_ocorrencia" class="form-control" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;">
              <option value="">Selecione...</option>
              ${TIPOS_OCORRENCIA.map((op) => `<option value="${op.value}" ${estado.dados.tipo_ocorrencia === op.value ? "selected" : ""}>${op.label}</option>`).join("")}
            </select>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Local da Ocorrência <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="rapido_local_ocorrencia" class="form-control" placeholder="Endereço completo" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;" value="${estado.dados.local_ocorrencia || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-calendar" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Data/Hora <span class="required" style="color:var(--erro);">*</span>
            </label>
            <div style="display:flex;gap:8px;">
              <div style="flex:1;position:relative;">
                <input type="datetime-local" id="rapido_data_hora" class="form-control" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;" value="${estado.dados.data_hora_inicio || hoje}">
              </div>
              <button type="button" onclick="document.getElementById('rapido_data_hora').value = window._obterDataHoraLocalInput()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
                <i class="fas fa-clock"></i> Agora
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-user" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Solicitante <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="rapido_nome_solicitante" class="form-control" placeholder="Nome completo" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:44px;" value="${estado.dados.nome_solicitante || ""}">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Relato dos Fatos <span class="required" style="color:var(--erro);">*</span>
            </label>
            <div style="position:relative;">
              <textarea id="rapido_observacoes" class="form-control" rows="4" placeholder="Descreva resumidamente o ocorrido..." required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco);color:var(--cinza-escuro);min-height:80px;resize:vertical;padding-right:45px;">${estado.dados.observacoes || ""}</textarea>
              <button type="button" id="btnSttRapido" class="btn-stt" title="Falar relato" style="position:absolute;right:10px;bottom:10px;width:44px;height:44px;border-radius:50%;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:2px solid var(--azul-claro);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5;transition:all 0.3s ease;">
                <i class="fas fa-microphone" style="font-size:18px;"></i>
              </button>
            </div>
          </div>

          <!-- 🔥 ALTERADO: Fotos - ilimitado -->
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-camera" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Fotos (opcional - ilimitado) 🔥
            </label>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <input type="file" id="rapido_file_input" accept="image/*" multiple style="display:none;" onchange="window._novaOcorrenciaProcessarAnexosRapido(this.files)">
              <button type="button" onclick="document.getElementById('rapido_file_input').click()" class="btn-secondary" style="width:100%;font-size:12px;padding:8px;border-radius:var(--border-radius);min-height:40px;">
                <i class="fas fa-camera"></i> Selecionar Fotos
              </button>
              <div id="rapido_preview_area" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
              <div class="input-hint" style="font-size:10px;color:var(--cinza-medio);">
                <i class="fas fa-info-circle"></i> Sem limite de quantidade. Cada imagem será comprimida para até 1MB.
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:16px;">
            <button type="button" onclick="window._novaOcorrenciaFinalizarRapido()" class="btn-success" style="flex:2;border-radius:12px;min-height:44px;">
              <i class="fas fa-check-circle"></i> Finalizar BO Rápido
            </button>
            <button type="button" onclick="window._novaOcorrenciaVoltarModos()" class="btn-secondary" style="flex:1;border-radius:12px;min-height:44px;">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 🔥 CORRIGIDO: Registrar função global para obter data/hora local
  window._obterDataHoraLocalInput = obterDataHoraLocalInput;

  window._novaOcorrenciaProcessarAnexosRapido = (files) => {
    processarAnexosRapido(files, container, appInstance);
  };

  window._novaOcorrenciaFinalizarRapido = () => {
    finalizarRapido(container, appInstance);
  };

  setTimeout(() => {
    if (window.utils && window.utils.initSpeechToText) {
      window.utils.initSpeechToText(
        "rapido_observacoes",
        "btnSttRapido",
        appInstance,
      );
    }
  }, 300);
}

// ============================================
// 🔥 ALTERADO E CORRIGIDO: FINALIZAR BO RÁPIDO COM DATA_HORA_FINALIZACAO E SEM FUSO
// ============================================

async function finalizarRapido(container, appInstance) {
  const tipo = document.getElementById("rapido_tipo_ocorrencia")?.value;
  const local = document.getElementById("rapido_local_ocorrencia")?.value;
  const dataHora = document.getElementById("rapido_data_hora")?.value;
  const nomeSolicitante = document.getElementById(
    "rapido_nome_solicitante",
  )?.value;
  const observacoes = document.getElementById("rapido_observacoes")?.value;

  if (!tipo || !local || !dataHora || !nomeSolicitante || !observacoes) {
    appInstance.showToast("Preencha todos os campos obrigatórios", "warning");
    return;
  }

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar este BO Rápido?\n\nVocê poderá completá-lo depois com mais informações.",
  );
  if (!confirmado) return;

  // 🔥 CORRIGIDO: Data/hora de finalização SEM ajuste de fuso
  // ✅ Usar data do dispositivo SEM ajuste, construindo a string manualmente
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
    nome_solicitante: nomeSolicitante,
    observacoes: observacoes,
    forma_solicitacao: "Diretamente com a ocorrência",
    modo_criacao: MODE_RAPIDO,
    status: navigator.onLine ? "synced" : "pending_sync",
    data_hora_finalizacao: dataFinalizacao,
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

  const result = await ocorrenciaManager.criar(dados);

  if (!result.success) {
    appInstance.showToast("Erro ao salvar: " + result.error, "error");
    return;
  }

  if (anexos.length > 0) {
    const anexoResult = await ocorrenciaManager.salvarAnexos(
      result.data.id,
      anexos,
    );
    if (!anexoResult.success) {
      console.warn("Erro ao salvar anexos:", anexoResult.error);
    }
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
  const anexos = estado.dados.anexos || [];
  // 🔥 ALTERADO: Removido limite MAX_ANEXOS

  for (const file of files) {
    // 🔥 ALTERADO: Removida verificação de limite

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
// RENDERIZAR FORMULÁRIO COMPLETO (ORIGINAL MELHORADO)
// ============================================

function renderizarFormularioCompleto(container, appInstance) {
  // Salvar dados atuais no estado antes de renderizar
  salvarDadosEtapa();

  const etapa = estado.etapa;
  const dados = estado.dados;

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-file-alt" style="margin-right:8px;"></i>
            Nova Ocorrência - Modo Completo
          </h2>
          <p style="color:var(--cinza-medio);font-size:12px;margin:0;">Preencha todos os dados da ocorrência</p>
        </div>
        <button onclick="window._novaOcorrenciaVoltarModos()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
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
        ${etapa > 1 ? `<button type="button" class="btn-secondary" onclick="window._novaOcorrenciaAnterior()"><i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar</button>` : ""}
        ${etapa < TOTAL_ETAPAS ? `<button type="button" class="btn-primary" onclick="window._novaOcorrenciaProxima()">Próximo <i class="fas fa-arrow-right" style="margin-left:6px;"></i></button>` : `<button type="button" class="btn-success" onclick="window._novaOcorrenciaFinalizar()"><i class="fas fa-check-circle" style="margin-right:6px;"></i> Finalizar Ocorrência</button>`}
      </div>

      <div style="margin-top:12px;">
        <button type="button" class="btn-secondary" onclick="window._novaOcorrenciaSalvarRascunho()" style="width:100%;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);">
          <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Rascunho
        </button>
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
      input.addEventListener("change", () => {
        appInstance.alteracoesNaoSalvas = true;
      });
      input.addEventListener("input", () => {
        appInstance.alteracoesNaoSalvas = true;
      });
    });

  if (etapa === 4) {
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

  // 🔥 NOVO: Inicializar canvas de assinatura se estiver na etapa 5
  if (etapa === 5) {
    setTimeout(() => {
      inicializarCanvasAssinatura(appInstance);
    }, 500);
  }

  window._novaOcorrenciaProxima = () => proximaEtapa(container, appInstance);
  window._novaOcorrenciaAnterior = () => etapaAnterior(container, appInstance);
  window._novaOcorrenciaFinalizar = () =>
    finalizarOcorrencia(container, appInstance);
  window._novaOcorrenciaSalvarRascunho = () => appInstance.salvarRascunho();
  window._novaOcorrenciaAplicarModelo = (tipo) =>
    aplicarModeloOcorrencia(tipo, container, appInstance);
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
  window._novaOcorrenciaRemoverAssinatura = (tipo) =>
    removerAssinatura(tipo, appInstance);
  window._novaOcorrenciaLimparAssinatura = () =>
    limparAssinatura(appInstance);
}

// ============================================
// RENDER STEPS
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
    5: "Anexos e Assinaturas",
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
    5: "Adicione fotos, documentos e assinaturas (ilimitado)",
    6: "Revise todos os dados antes de finalizar",
  };
  return subtitulos[etapa] || "";
}

// ============================================
// MODELOS DE OCORRÊNCIA
// ============================================

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

function aplicarModeloOcorrencia(tipo, container, appInstance) {
  const modelo = MODELOS_OCORRENCIA[tipo];
  if (!modelo) return;

  estado.modeloSelecionado = tipo;
  estado.dados.tipo_ocorrencia = tipo;
  estado.dados.observacoes = modelo.observacoes;

  const tipoSelect = document.getElementById("tipo_ocorrencia");
  if (tipoSelect) tipoSelect.value = tipo;

  const observacoesText = document.getElementById("observacoes");
  if (observacoesText) observacoesText.value = modelo.observacoes;

  estado.etapa = 4;
  appInstance.alteracoesNaoSalvas = true;
  renderizarFormularioCompleto(container, appInstance);
  appInstance.showToast(`Modelo "${modelo.titulo}" aplicado!`, "success");
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
      <label for="forma_solicitacao"><i class="fas fa-phone-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>Forma de solicitação <span class="required">*</span></label>
      <div class="input-wrapper">
        <i class="fas fa-list-ul input-icon-left"></i>
        <select id="forma_solicitacao" class="form-control" required>
          ${FORMAS_SOLICITACAO.map((op) => `<option value="${op.value}" ${dados.forma_solicitacao === op.value ? "selected" : ""}>${op.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="nome_solicitante"><i class="fas fa-user" style="margin-right:6px;color:var(--azul-bandeira);"></i>Nome do solicitante</label>
      <div class="input-wrapper">
        <i class="fas fa-user input-icon-left"></i>
        <input type="text" id="nome_solicitante" class="form-control" placeholder="Nome completo (deixe em branco para anônimo)" value="${dados.nome_solicitante || ""}" style="min-height:44px;">
      </div>
      <div class="input-hint"><i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>Deixe em branco para registrar ocorrência anônima</div>
    </div>
    <div class="form-group">
      <label for="cpf_solicitante"><i class="fas fa-id-card" style="margin-right:6px;color:var(--azul-bandeira);"></i>CPF do Solicitante</label>
      <div class="input-wrapper">
        <i class="fas fa-id-card input-icon-left"></i>
        <input type="text" id="cpf_solicitante" class="form-control" placeholder="123.456.789-00" value="${dados.cpf_solicitante || ""}" maxlength="14" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="rg_solicitante"><i class="fas fa-address-card" style="margin-right:6px;color:var(--azul-bandeira);"></i>RG do Solicitante</label>
      <div class="input-wrapper">
        <i class="fas fa-address-card input-icon-left"></i>
        <input type="text" id="rg_solicitante" class="form-control" placeholder="RG do solicitante" value="${dados.rg_solicitante || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="telefone_solicitante"><i class="fas fa-phone" style="margin-right:6px;color:var(--azul-bandeira);"></i>Telefone do solicitante</label>
      <div class="input-wrapper">
        <i class="fas fa-phone input-icon-left"></i>
        <input type="tel" id="telefone_solicitante" class="form-control" placeholder="(44) 99999-9999" value="${dados.telefone_solicitante || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="endereco_solicitante"><i class="fas fa-home" style="margin-right:6px;color:var(--azul-bandeira);"></i>Endereço informado pelo solicitante</label>
      <div class="input-wrapper">
        <i class="fas fa-map-marker-alt input-icon-left"></i>
        <input type="text" id="endereco_solicitante" class="form-control" placeholder="Rua, número, bairro" value="${dados.endereco_solicitante || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="codigo_municipal"><i class="fas fa-hashtag" style="margin-right:6px;color:var(--azul-bandeira);"></i>Código do próprio municipal</label>
      <div class="input-wrapper">
        <i class="fas fa-hashtag input-icon-left"></i>
        <input type="text" id="codigo_municipal" class="form-control" placeholder="Código do imóvel" value="${dados.codigo_municipal || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="complemento"><i class="fas fa-pen" style="margin-right:6px;color:var(--azul-bandeira);"></i>Complemento</label>
      <div class="input-wrapper">
        <i class="fas fa-pen input-icon-left"></i>
        <input type="text" id="complemento" class="form-control" placeholder="Apto, bloco, ponto de referência" value="${dados.complemento || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="bairro_solicitante"><i class="fas fa-location-dot" style="margin-right:6px;color:var(--azul-bandeira);"></i>Bairro</label>
      <div class="input-wrapper">
        <i class="fas fa-location-dot input-icon-left"></i>
        <input type="text" id="bairro_solicitante" class="form-control" placeholder="Bairro" value="${dados.bairro_solicitante || ""}" style="min-height:44px;">
      </div>
    </div>
    <div class="form-group">
      <label for="identificacao_adicional"><i class="fas fa-info-circle" style="margin-right:6px;color:var(--azul-bandeira);"></i>Identificação adicional do solicitante</label>
      <textarea id="identificacao_adicional" class="form-control" rows="3" placeholder="Informações adicionais para identificar o solicitante">${dados.identificacao_adicional || ""}</textarea>
    </div>
  `;
}

// ============================================
// ETAPA 2 - DADOS DA OCORRÊNCIA
// ============================================

function renderEtapa2(dados, appInstance) {
  // 🔥 CORRIGIDO: Usar a função auxiliar que retorna o horário LOCAL do dispositivo
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
    <div class="form-group">
      <label for="data_hora_encerramento"><i class="fas fa-calendar-check" style="margin-right:6px;color:var(--azul-bandeira);"></i>Data e hora do encerramento</label>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;position:relative;">
          <i class="fas fa-calendar-check input-icon-left" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:14px;z-index:2;"></i>
          <input type="datetime-local" id="data_hora_encerramento" class="form-control" value="${dados.data_hora_encerramento || ""}" style="min-height:44px;padding-left:36px;">
        </div>
        <button type="button" onclick="document.getElementById('data_hora_encerramento').value = window._obterDataHoraLocalInput()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;white-space:nowrap;">
          <i class="fas fa-clock"></i> Agora
        </button>
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
            <span class="badge badge-azul"><i class="fas fa-user" style="margin-right:4px;"></i>${getTipoEnvolvidoLabel(env.tipo)}</span>
            <span class="nome">${env.nome_completo || "Nome não informado"}</span>
            <button type="button" class="remove-btn" onclick="window._novaOcorrenciaRemoverEnvolvido(${index})" style="margin-left:auto;background:none;border:none;color:var(--erro);font-size:16px;cursor:pointer;padding:4px 8px;border-radius:50%;transition:all 0.3s ease;"><i class="fas fa-trash-alt"></i></button>
          </div>
          <div class="detalhes-grid">
            ${env.cpf ? `<div class="campo"><i class="fas fa-id-card"></i><span class="label">CPF:</span><span class="valor">${env.cpf}</span></div>` : ""}
            ${env.rg ? `<div class="campo"><i class="fas fa-address-card"></i><span class="label">RG:</span><span class="valor">${env.rg}</span></div>` : ""}
            ${env.telefone ? `<div class="campo"><i class="fas fa-phone"></i><span class="label">Tel:</span><span class="valor">${env.telefone}</span></div>` : ""}
            ${env.data_nascimento ? `<div class="campo"><i class="fas fa-calendar-alt"></i><span class="label">Nasc:</span><span class="valor">${new Date(env.data_nascimento).toLocaleDateString("pt-BR")}</span></div>` : ""}
            ${env.endereco ? `<div class="campo"><i class="fas fa-map-marker-alt"></i><span class="label">End:</span><span class="valor">${env.endereco}</span></div>` : ""}
            ${env.bairro ? `<div class="campo"><i class="fas fa-location-dot"></i><span class="label">Bairro:</span><span class="valor">${env.bairro}</span></div>` : ""}
            ${env.cidade ? `<div class="campo"><i class="fas fa-city"></i><span class="label">Cidade:</span><span class="valor">${env.cidade}</span></div>` : ""}
            ${env.observacoes ? `<div class="campo" style="grid-column: 1 / -1;"><i class="fas fa-pencil-alt"></i><span class="label">Obs:</span><span class="valor">${env.observacoes}</span></div>` : ""}
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
      <label for="observacoes"><i class="fas fa-pencil-alt" style="margin-right:6px;color:var(--azul-bandeira);"></i>Observações e Relato dos Fatos <span class="required">*</span></label>
      <div class="stt-container" style="position:relative; width:100%;">
        <textarea id="observacoes" class="form-control" rows="8" placeholder="Descreva detalhadamente o ocorrido..." required style="padding-right: 45px; width:100%;">${dados.observacoes || ""}</textarea>
        <button type="button" id="btnSttObservacoes" class="btn-stt" title="Falar relato" style="position:absolute; right:10px; bottom:10px; width:44px; height:44px; border-radius:50%; background:var(--azul-muito-claro); color:var(--azul-bandeira); border:2px solid var(--azul-claro); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:5; transition:all 0.3s ease;">
          <i class="fas fa-microphone" style="font-size:18px;"></i>
        </button>
      </div>
      <div class="input-hint"><i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>Mínimo 10 caracteres. Use o microfone para falar.</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" onclick="document.getElementById('observacoes').value += 'O solicitante informou que...'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">Início padrão</button>
        <button type="button" onclick="document.getElementById('observacoes').value += 'A equipe constatou a situação e orientou as partes envolvidas.'" class="btn-secondary" style="padding:4px 10px;font-size:10px;min-height:auto;width:auto;border-radius:12px;">Conclusão padrão</button>
      </div>
    </div>
  `;
}

// ============================================
// 🔥 ALTERADO E CORRIGIDO: ETAPA 5 - ANEXOS E ASSINATURAS (SEM LIMITE)
// ============================================

function renderEtapa5(dados, appInstance) {
  const anexos = dados.anexos || [];
  const assinaturas = dados.assinaturas || [];

  // Mapear quais tipos já têm assinatura
  const tiposAssinados = {};
  assinaturas.forEach((ass) => {
    tiposAssinados[ass.tipo] = true;
  });

  let html = `
    <div style="margin-bottom:16px;">
      <p style="color:var(--cinza-medio);font-size:14px;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Adicione fotos, documentos e assinaturas como evidência.
        <strong>Sem limite de quantidade.</strong>
      </p>
    </div>

    <!-- ========================================== -->
    <!-- SEÇÃO: ANEXOS REAIS (Fotos e Documentos)    -->
    <!-- ========================================== -->
    <div style="margin-bottom:20px;">
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

    <!-- ========================================== -->
    <!-- SEÇÃO: ASSINATURAS                          -->
    <!-- ========================================== -->
    <div style="margin-top:20px;border-top:2px solid var(--cinza-claro);padding-top:16px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-pen-fancy"></i> Assinaturas (${assinaturas.length})
      </h4>
      <p style="font-size:12px;color:var(--cinza-medio);margin-bottom:12px;">
        Colete a assinatura dos envolvidos diretamente na tela do celular.
        As assinaturas são armazenadas separadamente e NÃO aparecem na galeria de anexos.
      </p>

      <!-- Formulário para adicionar assinatura -->
      <div style="background:var(--branco-fumaca);border-radius:var(--border-radius);padding:14px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:11px;font-weight:600;color:var(--cinza-escuro);display:block;margin-bottom:2px;">Papel *</label>
            <select id="assinatura_tipo" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;min-height:36px;">
              <option value="">Selecione...</option>
              ${TIPOS_ASSINATURA.map(
                (op) => `
                <option value="${op.value}" ${tiposAssinados[op.value] ? "disabled" : ""}>
                  ${op.label} ${tiposAssinados[op.value] ? "✅" : ""}
                </option>
              `,
              ).join("")}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:11px;font-weight:600;color:var(--cinza-escuro);display:block;margin-bottom:2px;">Nome *</label>
            <input type="text" id="assinatura_nome" placeholder="Nome completo" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;min-height:36px;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:11px;font-weight:600;color:var(--cinza-escuro);display:block;margin-bottom:2px;">CPF</label>
            <input type="text" id="assinatura_cpf" placeholder="123.456.789-00" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;min-height:36px;">
          </div>
        </div>

        <!-- Canvas para assinatura -->
        <div style="margin-top:8px;">
          <label style="font-size:11px;font-weight:600;color:var(--cinza-escuro);display:block;margin-bottom:4px;">Assinatura *</label>
          <div style="border:2px solid var(--cinza-claro);border-radius:8px;overflow:hidden;background:white;touch-action:none;">
            <canvas id="canvasAssinatura" width="400" height="150" style="width:100%;height:150px;touch-action:none;cursor:crosshair;"></canvas>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button type="button" onclick="window._novaOcorrenciaLimparAssinatura()" class="btn-secondary" style="flex:1;padding:4px 8px;font-size:11px;min-height:auto;width:auto;border-radius:6px;">
              <i class="fas fa-undo"></i> Limpar
            </button>
            <button type="button" onclick="window._novaOcorrenciaAdicionarAssinatura()" class="btn-primary" style="flex:2;padding:4px 8px;font-size:11px;min-height:auto;width:auto;border-radius:6px;">
              <i class="fas fa-save"></i> Adicionar Assinatura
            </button>
          </div>
        </div>
      </div>

      <!-- Lista de assinaturas salvas -->
      <div id="listaAssinaturas">
        ${
          assinaturas.length === 0
            ? `<div style="text-align:center;padding:16px;color:var(--cinza-medio);font-size:13px;background:var(--branco);border-radius:var(--border-radius);border:1px dashed var(--cinza-claro);">
                <i class="fas fa-pen" style="font-size:24px;display:block;margin-bottom:4px;opacity:0.3;"></i>
                Nenhuma assinatura adicionada
               </div>`
            : assinaturas
                .map(
                  (ass, index) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--branco);border-radius:var(--border-radius);border:1px solid var(--cinza-claro);margin-bottom:4px;">
              <span class="badge badge-azul" style="font-size:9px;padding:2px 10px;">${getTipoAssinaturaLabel(ass.tipo)}</span>
              <span style="font-weight:600;font-size:12px;flex:1;">${ass.nome}</span>
              ${ass.cpf ? `<span style="font-size:11px;color:var(--cinza-medio);">${ass.cpf}</span>` : ""}
              <span style="font-size:9px;color:var(--cinza-medio);">${new Date(ass.assinado_em).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <button type="button" onclick="window._novaOcorrenciaRemoverAssinatura('${ass.tipo}')" class="remove-btn" style="background:none;border:none;color:var(--erro);cursor:pointer;padding:2px 6px;font-size:14px;">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `,
                )
                .join("")
        }
      </div>
    </div>
  `;

  return html;
}

// ============================================
// 🔥 NOVO: FUNÇÕES PARA ASSINATURA
// ============================================

/**
 * Inicializa o canvas para captura de assinatura
 */
function inicializarCanvasAssinatura(appInstance) {
  const canvas = document.getElementById("canvasAssinatura");
  if (!canvas) return;

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
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    estado.isDrawing = true;
    estado.lastX = (touch.clientX - rect.left) * scaleX;
    estado.lastY = (touch.clientY - rect.top) * scaleY;
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
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

    estado.lastX = x;
    estado.lastY = y;
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    estado.isDrawing = false;
  }, { passive: false });

  console.log("✅ Canvas de assinatura inicializado");
}

/**
 * Limpa o canvas de assinatura
 */
function limparAssinatura(appInstance) {
  const canvas = document.getElementById("canvasAssinatura");
  if (!canvas) return;

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

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Assinatura limpa", "info");
  }
}

/**
 * Adiciona uma assinatura à ocorrência
 */
async function adicionarAssinatura(appInstance) {
  const canvas = document.getElementById("canvasAssinatura");
  if (!canvas) {
    appInstance.showToast("Canvas de assinatura não encontrado", "error");
    return;
  }

  const tipo = document.getElementById("assinatura_tipo")?.value;
  const nome = document.getElementById("assinatura_nome")?.value?.trim();
  const cpf = document.getElementById("assinatura_cpf")?.value?.trim();

  if (!tipo) {
    appInstance.showToast("Selecione o papel do signatário", "warning");
    return;
  }

  if (!nome) {
    appInstance.showToast("Informe o nome do signatário", "warning");
    return;
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

  // 🔥 CORRIGIDO: Verificar se já existe assinatura para este tipo
  const assinaturaExistente = estado.dados.assinaturas.find(
    (a) => a.tipo === tipo
  );

  if (assinaturaExistente) {
    const confirmado = await appInstance.confirmar(
      `Já existe uma assinatura para "${getTipoAssinaturaLabel(tipo)}". Deseja substituir?`,
    );
    if (!confirmado) return;
    // Remover assinatura existente
    estado.dados.assinaturas = estado.dados.assinaturas.filter(
      (a) => a.tipo !== tipo,
    );
  }

  // Capturar a assinatura do canvas
  const assinaturaDataUrl = canvas.toDataURL("image/png");

  // Criar objeto da assinatura
  const assinatura = {
    id: crypto.randomUUID ? crypto.randomUUID() : gerarUUID(),
    tipo: tipo,
    nome: nome,
    cpf: cpf || null,
    assinatura_data_url: assinaturaDataUrl,
    assinado_em: new Date().toISOString(),
    assinado_por: authManager.getUserId(),
    nome_guarda: authManager.getUser()?.nome_completo || "Desconhecido",
  };

  // Adicionar ao estado
  estado.dados.assinaturas.push(assinatura);
  appInstance.alteracoesNaoSalvas = true;

  // Limpar canvas
  limparAssinatura(appInstance);

  // Limpar campos
  document.getElementById("assinatura_tipo").value = "";
  document.getElementById("assinatura_nome").value = "";
  document.getElementById("assinatura_cpf").value = "";

  // Re-renderizar a etapa
  const container = document.getElementById("page-nova-ocorrencia");
  if (container) {
    renderizarFormularioCompleto(container, appInstance);
  }

  appInstance.showToast("Assinatura adicionada com sucesso!", "success");
}

/**
 * Remove uma assinatura da ocorrência
 */
function removerAssinatura(tipo, appInstance) {
  if (!tipo) return;

  estado.dados.assinaturas = estado.dados.assinaturas.filter(
    (a) => a.tipo !== tipo,
  );
  appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("page-nova-ocorrencia");
  if (container) {
    renderizarFormularioCompleto(container, appInstance);
  }

  appInstance.showToast(
    `Assinatura de ${getTipoAssinaturaLabel(tipo)} removida`,
    "info",
  );
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
// ETAPA 6 - REVISÃO (COM DATA_HORA_FINALIZACAO E ASSINATURAS)
// ============================================

function renderEtapa6(dados, appInstance) {
  const envolvidos = dados.envolvidos || [];
  const anexos = dados.anexos || [];
  const assinaturas = dados.assinaturas || [];
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

  // 🔥 NOVO: Mostrar data_hora_finalizacao se já estiver definida
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
        ${dados.data_hora_encerramento ? `<div class="campo"><span class="rotulo">Encerramento:</span><span class="valor">${formatarDataHoraLocal(dados.data_hora_encerramento)}</span></div>` : ""}
        <!-- 🔥 NOVO: Data de finalização -->
        <div class="campo" style="background:var(--azul-muito-claro);padding:4px 8px;border-radius:4px;">
          <span class="rotulo" style="color:var(--azul-bandeira);">📌 Finalização:</span>
          <span class="valor" style="font-weight:500;">${dataFinalizacao}</span>
        </div>
      </div>
    `
        : ""
    }

    <div class="card-revisao">
      <h4><i class="fas fa-users"></i> Envolvidos (${envolvidos.length})</h4>
      ${
        envolvidos.length === 0
          ? `<p style="color:var(--cinza-medio);font-size:14px;">Nenhum envolvido cadastrado</p>`
          : envolvidos
              .map(
                (env) =>
                  `<div class="envolvido-item"><span class="badge badge-azul" style="font-size:10px;">${getTipoEnvolvidoLabel(env.tipo)}</span> <strong>${env.nome_completo}</strong> ${env.cpf ? `<span style="color:var(--cinza-medio);font-size:12px;"> - ${env.cpf}</span>` : ""}</div>`,
              )
              .join("")
      }
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

    <!-- 🔥 ALTERADO: Anexos reais (sem assinaturas) -->
    <div class="card-revisao">
      <h4><i class="fas fa-paperclip"></i> Anexos</h4>
      <div style="font-size:13px;">
        <div><strong>📎 Anexos:</strong> ${anexos.length} arquivo(s) (ilimitado)</div>
        ${anexos.length > 0 ? `<div style="margin-top:4px;font-size:12px;color:var(--cinza-medio);">${anexos.map((a) => a.nome).join(", ")}</div>` : ""}
      </div>
    </div>

    <!-- 🔥 NOVO: Assinaturas -->
    <div class="card-revisao">
      <h4><i class="fas fa-pen-fancy"></i> Assinaturas (${assinaturas.length})</h4>
      ${
        assinaturas.length === 0
          ? `<p style="color:var(--cinza-medio);font-size:13px;">Nenhuma assinatura coletada</p>`
          : assinaturas
              .map(
                (ass) => `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);">
              <span class="badge badge-azul" style="font-size:9px;padding:2px 10px;">${getTipoAssinaturaLabel(ass.tipo)}</span>
              <span style="font-weight:600;font-size:13px;">${ass.nome}</span>
              ${ass.cpf ? `<span style="font-size:11px;color:var(--cinza-medio);">${ass.cpf}</span>` : ""}
              <span style="font-size:10px;color:var(--cinza-medio);margin-left:auto;">${new Date(ass.assinado_em).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          `,
              )
              .join("")
      }
    </div>

    <div class="alert-finalizar">
      <p><i class="fas fa-info-circle"></i> Ao finalizar, a ocorrência será numerada e não poderá mais ser editada.</p>
      <p style="font-size:12px;margin-top:4px;color:var(--cinza-medio);">
        <i class="fas fa-clock"></i> A data/hora de finalização será registrada automaticamente.
      </p>
    </div>
  `;
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

  // 🔥 NOVO: Máscara para CPF da assinatura
  const assinaturaCpf = document.getElementById("assinatura_cpf");
  if (assinaturaCpf) {
    assinaturaCpf.addEventListener("input", function () {
      this.value = aplicarMascaraCPF(this.value);
    });
  }

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
      if (!document.getElementById("local_ocorrencia")?.value) {
        mensagem = "Informe o local da ocorrência";
        isValid = false;
      } else if (!document.getElementById("data_hora_inicio")?.value) {
        mensagem = "Informe a data e hora do início";
        isValid = false;
      } else if (!document.getElementById("tipo_ocorrencia")?.value) {
        mensagem = "Selecione o tipo de ocorrência";
        isValid = false;
      }
      break;
    case 4:
      const observacoes = document.getElementById("observacoes")?.value;
      if (!observacoes || observacoes.trim().length < 10) {
        mensagem = "Descreva o ocorrido com pelo menos 10 caracteres";
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
// ENVOLVIDOS - ADICIONAR
// ============================================

function adicionarEnvolvido(appInstance) {
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
      observacoes: document.getElementById("env_observacoes")?.value || "",
    };

    estado.dados.envolvidos.push(envolvido);
    appInstance.alteracoesNaoSalvas = true;

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    const container = document.getElementById("page-nova-ocorrencia");
    if (container) renderizarFormularioCompleto(container, appInstance);
    appInstance.showToast("Envolvido adicionado com sucesso!", "success");
  };
}

// ============================================
// ENVOLVIDOS - REMOVER
// ============================================

function removerEnvolvido(index, appInstance) {
  estado.dados.envolvidos.splice(index, 1);
  appInstance.alteracoesNaoSalvas = true;

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
  appInstance.alteracoesNaoSalvas = true;

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
  appInstance.alteracoesNaoSalvas = true;

  const container = document.getElementById("page-nova-ocorrencia");
  if (container) renderizarFormularioCompleto(container, appInstance);
  appInstance.showToast("Anexo removido", "info");
}

// ============================================
// 🔥 CORRIGIDO: FINALIZAR OCORRÊNCIA (COM DATA_HORA_FINALIZACAO E SEM FUSO)
// ============================================

async function finalizarOcorrencia(container, appInstance) {
  salvarDadosEtapa();

  const dados = estado.dados;

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
    estado.etapa = 4;
    renderizarFormularioCompleto(container, appInstance);
    return;
  }

  if (dados.envolvidos.length === 0) {
    const confirmado = await appInstance.confirmar(
      "Nenhum envolvido cadastrado. Deseja continuar assim?",
    );
    if (!confirmado) {
      estado.etapa = 3;
      renderizarFormularioCompleto(container, appInstance);
      return;
    }
  }

  const confirmado = await appInstance.confirmar(
    "Deseja finalizar esta ocorrência? Após finalizar, não será mais possível editar.",
  );
  if (!confirmado) return;

  const envolvidos = dados.envolvidos || [];
  const anexos = dados.anexos || [];
  const assinaturas = dados.assinaturas || [];

  const dadosParaSalvar = { ...dados };
  delete dadosParaSalvar.envolvidos;
  delete dadosParaSalvar.anexos;
  // 🔥 CORRIGIDO: Remover assinaturas_objeto (não existe no banco)
  delete dadosParaSalvar.assinaturas_objeto;
  // 🔥 Manter assinaturas no objeto

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
      } else {
        dadosParaSalvar.data_hora_encerramento = null;
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

  // 🔥 Garantir que assinaturas seja um array
  dadosParaSalvar.assinaturas = assinaturas || [];

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

  if (envolvidos.length > 0) {
    const envResult = await ocorrenciaManager.salvarEnvolvidos(
      ocorrenciaId,
      envolvidos,
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
    appInstance.showToast(
      "Ocorrência salva, mas com erros: " + erros.join(" | "),
      "warning",
    );
  } else {
    appInstance.showToast("Ocorrência finalizada com sucesso!", "success");
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
// RENDERIZAR FORMULÁRIO COMPLETAR (continuação)
// ============================================

async function salvarCompletarRapido(appInstance) {
  const id = estado.id;
  if (!id) {
    appInstance.showToast("ID da ocorrência não encontrado", "error");
    return;
  }

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
  };

  // 🔥 CORRIGIDO: Remover campos que não existem no banco
  delete dadosAtualizados.assinaturas_objeto;

  if (estado.dadosOriginais) {
    const alteracoes = compararObjetos(estado.dadosOriginais, dadosAtualizados);
    if (Object.keys(alteracoes).length === 0) {
      appInstance.showToast("Nenhuma alteração detectada", "info");
      return;
    }
  }

  try {
    appInstance.showToast("Salvando alterações...", "info");

    const result = await ocorrenciaManager.atualizar(id, dadosAtualizados);
    if (!result.success) {
      appInstance.showToast("Erro ao salvar: " + result.error, "error");
      return;
    }

    const envolvidos = estado.dados.envolvidos || [];
    if (envolvidos.length > 0) {
      await ocorrenciaManager.salvarEnvolvidos(id, envolvidos);
    }

    const anexos = estado.dados.anexos || [];
    if (anexos.length > 0) {
      await ocorrenciaManager.salvarAnexos(id, anexos);
    }

    estado.dadosOriginais = JSON.parse(JSON.stringify(estado.dados));
    appInstance.showToast("Alterações salvas com sucesso!", "success");
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
      status: "synced",
    };

    // 🔥 CORRIGIDO: Remover campos que não existem no banco
    delete dadosAtualizados.assinaturas_objeto;

    const result = await ocorrenciaManager.atualizar(id, dadosAtualizados);
    if (!result.success) {
      appInstance.showToast("Erro ao finalizar: " + result.error, "error");
      return;
    }

    const envolvidos = estado.dados.envolvidos || [];
    if (envolvidos.length > 0) {
      await ocorrenciaManager.salvarEnvolvidos(id, envolvidos);
    }

    const anexos = estado.dados.anexos || [];
    if (anexos.length > 0) {
      await ocorrenciaManager.salvarAnexos(id, anexos);
    }

    await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);
    appInstance.showToast("Ocorrência completada com sucesso! ✅", "success");

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

// ============================================
// RENDERIZAR FORMULÁRIO COMPLETAR
// ============================================

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
