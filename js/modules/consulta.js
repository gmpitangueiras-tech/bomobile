/**
 * MÓDULO CONSULTA - Consulta Operacional
 * approach-intake-v2: tipo/resultado estruturados, identidade parcial e histórico contextual
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Abordagens de veículos (histórico, busca, registro)
 * - Abordagens de pessoas (histórico, busca, registro)
 * - Ranking de reincidentes
 * - Timeline de abordagens com cards
 * - Reincidência automática (Advertência → Multa)
 * - Conversão de abordagem para BO
 * - Anexos em abordagens (fotos com compressão)
 * - Reconhecimento de placa por foto (Tesseract.js)
 * - GPS contínuo
 * - Filtros por período, guarda e busca
 * - Abas para alternar entre Veículos e Pessoas
 * - Fechamento com confirmação de descarte
 * - Carrossel de fotos com navegação e swipe
 * - VISUALIZAÇÃO AMPLIADA DE IMAGENS NO MODAL
 * - EXPORTAÇÃO EM PDF (lista e individual)
 * - 🔥 NOVO: Anexos sem limite (removido MAX_ANEXOS)
 * - 🔥 NOVO: Data/hora início, encerramento e finalização
 * - 🔥 NOVO: Retificação de abordagens (solicitar, aprovar, rejeitar)
 * - 🔥 NOVO: Notificações para retificações
 * - 🔥 NOVO: Status da abordagem (ativa, encerrada, finalizada, cancelada)
 * - 🔥 NOVO: Função para finalizar abordagem
 * - 🔥 NOVO: Botão de finalizar abordagem nos cards (VERDE)
 * - 🔥 NOVO: Botão de retificar abordagem nos cards (ROXO)
 * - 🔥 CORRIGIDO: Cores diferenciadas para Finalizar (verde) e Retificar (roxo)
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), pdfExport (global)
 */

// ============================================
// CONSTANTES
// ============================================

// 🔥 ALTERADO: Removido MAX_ANEXOS - agora sem limite
// const MAX_ANEXOS = 5; // REMOVIDO

const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
const MAX_IMAGE_WIDTH = 800;
const IMAGE_QUALITY = 0.7;
const REINCIDENCIA_LIMITE_ADVERTENCIA = 2;
const REINCIDENCIA_LIMITE_MULTA = 4;

// ============================================
// FUNÇÕES AUXILIARES - FORMATAÇÃO
// ============================================

/**
 * Formata uma data/hora para exibição no padrão brasileiro
 * @param {string|Date} date - Data a ser formatada
 * @param {boolean} includeSeconds - Incluir segundos?
 * @returns {string}
 */
function formatarDataHoraLocal(date, includeSeconds = false) {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "Data inválida";

    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    if (includeSeconds) options.second = "2-digit";

    return d.toLocaleString("pt-BR", options);
  } catch (e) {
    return String(date);
  }
}

/**
 * Formata tamanho de arquivo
 * @param {number} bytes
 * @returns {string}
 */
function formatarTamanho(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/**
 * Retorna o label do tipo de envolvido
 * @param {string} tipo
 * @returns {string}
 */

function obterRotuloTipoAtendimento(value) {
  return ({
    fiscalizacao_estacionamento: "Fiscalização / estacionamento irregular",
    averiguacao_operacional: "Averiguação / abordagem operacional",
    orientacao: "Orientação",
    outro: "Outro atendimento",
    legado_nao_classificado: "Registro legado · contexto não classificado",
  })[value] || (value ? String(value).replace(/_/g, " ") : "Tipo não informado");
}

function obterRotuloProvidencia(value) {
  return ({
    em_andamento: "Atendimento em andamento",
    orientacao_prestada: "Orientação prestada",
    situacao_regularizada: "Situação regularizada",
    sem_irregularidade: "Nenhuma irregularidade constatada",
    encaminhamento: "Encaminhamento conforme procedimento",
    outra: "Outra providência",
  })[value] || (value ? String(value).replace(/_/g, " ") : "Providência não informada");
}

function obterRotuloIdentificacao(value) {
  return ({
    identificado: "Identificação informada",
    parcial: "Identificação parcial",
    nao_identificado: "Não identificado",
  })[value] || "Situação não informada";
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

/**
 * Retorna o label do tipo de ocorrência
 * @param {string} value
 * @returns {string}
 */
function getTipoLabel(value) {
  const tipos = [
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
  const encontrado = tipos.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

/**
 * Retorna a classe CSS para o status
 * @param {string} status
 * @returns {string}
 */
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

/**
 * Retorna o label amigável para o status
 * @param {string} status
 * @returns {string}
 */
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

/**
 * Retorna o ícone Font Awesome para o tipo de anexo
 * @param {string} tipo
 * @returns {string}
 */
function getIconAnexo(tipo) {
  const icons = {
    image: "fa-image",
    video: "fa-video",
    document: "fa-file-pdf",
    audio: "fa-music",
  };
  return icons[tipo] || "fa-file";
}

/**
 * Gera um UUID v4 (fallback)
 * @returns {string}
 */
function gerarUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  abaAtiva: "todos", // 'todos', 'veiculos', 'pessoas'
  filtros: {
    periodo: "12h",
    dataInicio: "",
    dataFim: "",
    guarda: "",
    busca: "",
    tipoAtendimento: "",
  },
  listaGuardas: [],
  arquivosTemp: [],
  timeoutBusca: null,
  ultimaBusca: "",
  rankingReincidentes: [],
  carregandoRanking: false,
  abordagens: [],
  totalRegistros: 0,
  pagina: 0,
  paginaSize: 10,
  carregandoMais: false,
  temMais: true,
  formularioAberto: false,
  tipoAbordagemAtual: null,
  dadosFormulario: {},
  carrosselData: null,
  // 🔥 NOVO: Estado para retificações
  retificacoesPendentes: [],
  carregandoRetificacoes: false,
  abaRetificacao: "pendentes", // 'pendentes', 'historico'
};

// ============================================
// FUNÇÕES INTERNAS
// ============================================

function obterDataHoraLocalFormatada() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  const segundos = String(agora.getSeconds()).padStart(2, "0");
  return `${ano}-${mes}-${dia} ${horas}:${minutos}:${segundos}`;
}
function obterDataHoraLocalInputAbordagem() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
}

function formatarDataHoraInputLocal(valor) {
  if (!valor) return "";
  const date = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatarTimestampLocalSemFuso(valor) {
  if (!valor) return null;
  const date = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatarDataLocalISO(valor) {
  const date = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function comprimirImagemInterna(
  file,
  maxWidth = MAX_IMAGE_WIDTH,
  quality = IMAGE_QUALITY,
) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    if (file.size < MAX_IMAGE_SIZE && file.type === "image/jpeg") {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function gerarHashArquivoInterna(file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.warn("Erro ao gerar hash do arquivo:", error);
    return null;
  }
}

function obterLocalizacaoInterna() {
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

function aplicarMascaraCPFInterna(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 3) return limpo;
  if (limpo.length <= 6) return limpo.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (limpo.length <= 9)
    return limpo.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

function aplicarMascaraPlacaInterna(value) {
  let upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (upper.length > 7) upper = upper.slice(0, 7);
  if (upper.length === 0) return "";
  if (upper.length <= 3) return upper;
  if (upper.length <= 4) return `${upper.slice(0, 3)}${upper.slice(3)}`;
  if (upper.length <= 6)
    return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4)}`;
  return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4, 5)}${upper.slice(5, 7)}`;
}

// ============================================
// 🔥 NOVO: FUNÇÕES DE RETIFICAÇÃO DE ABORDAGENS
// ============================================

/**
 * Campos que podem ser retificados em abordagens de veículos
 */
const CAMPOS_RETIFICAVEIS_VEICULO = [
  { campo: "placa", label: "Placa", tipo: "text" },
  { campo: "marca_modelo", label: "Marca/Modelo", tipo: "text" },
  { campo: "cor", label: "Cor", tipo: "text" },
  { campo: "condutor_nome", label: "Nome do Condutor", tipo: "text" },
  { campo: "condutor_cpf", label: "CPF do Condutor", tipo: "text" },
  { campo: "local_abordagem", label: "Local da Abordagem", tipo: "text" },
  { campo: "motivo", label: "Motivo", tipo: "textarea" },
  { campo: "observacoes", label: "Observações", tipo: "textarea" },
  { campo: "data_hora_inicio", label: "Data/Hora Início", tipo: "datetime" },
  {
    campo: "data_hora_encerramento",
    label: "Data/Hora Encerramento",
    tipo: "datetime",
  },
];

/**
 * Campos que podem ser retificados em abordagens de pessoas
 */
const CAMPOS_RETIFICAVEIS_PESSOA = [
  { campo: "nome", label: "Nome", tipo: "text" },
  { campo: "alcunha", label: "Alcunha", tipo: "text" },
  { campo: "cpf", label: "CPF", tipo: "text" },
  { campo: "rg", label: "RG", tipo: "text" },
  {
    campo: "caracteristicas_fisicas",
    label: "Características Físicas",
    tipo: "textarea",
  },
  { campo: "vestimentas", label: "Vestimentas", tipo: "textarea" },
  { campo: "local_abordagem", label: "Local da Abordagem", tipo: "text" },
  { campo: "motivo", label: "Motivo", tipo: "textarea" },
  { campo: "observacoes", label: "Observações", tipo: "textarea" },
  { campo: "data_hora_inicio", label: "Data/Hora Início", tipo: "datetime" },
  {
    campo: "data_hora_encerramento",
    label: "Data/Hora Encerramento",
    tipo: "datetime",
  },
];

/**
 * 🔥 NOVO: Abre modal para solicitar retificação de abordagem
 */
export function abrirSolicitarRetificacaoAbordagem(id, tipo, appInstance) {
  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) {
    appInstance.showToast("Erro ao conectar", "error");
    return;
  }

  const tabela =
    tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
  const camposRetificaveis =
    tipo === "veiculo"
      ? CAMPOS_RETIFICAVEIS_VEICULO
      : CAMPOS_RETIFICAVEIS_PESSOA;

  appInstance.showToast("Carregando dados...", "info");

  client
    .from(tabela)
    .select("*")
    .eq("id", id)
    .single()
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data) {
        appInstance.showToast("Abordagem não encontrada", "error");
        return;
      }

      // Verificar se já tem retificação pendente
      if (data.status_retificacao === "pending_rectification") {
        appInstance.showToast(
          "Esta abordagem já possui uma retificação pendente",
          "warning",
        );
        return;
      }

      // Verificar se pode solicitar retificação
      const user = authManager.getUser();
      const isSupervisor = authManager.isSupervisor();
      if (!isSupervisor && data.criado_por !== user.id) {
        appInstance.showToast(
          "Apenas o criador ou supervisor pode solicitar retificação",
          "warning",
        );
        return;
      }

      abrirModalSolicitarRetificacaoAbordagem(
        data,
        tipo,
        camposRetificaveis,
        appInstance,
      );
    })
    .catch((error) => {
      console.error("Erro ao carregar abordagem:", error);
      appInstance.showToast("Erro ao carregar dados", "error");
    });
}

/**
 * 🔥 NOVO: Modal para solicitar retificação de abordagem
 */
function abrirModalSolicitarRetificacaoAbordagem(
  abordagem,
  tipo,
  camposRetificaveis,
  appInstance,
) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    animation: fadeIn 0.25s ease;
  `;

  const isVeiculo = tipo === "veiculo";
  const identificador = isVeiculo ? abordagem.placa : abordagem.nome;

  let camposHTML = camposRetificaveis
    .map((campo) => {
      const valorAtual = abordagem[campo.campo] || "";
      const isDateTime = campo.tipo === "datetime";
      const isTextarea = campo.tipo === "textarea";

      if (isDateTime) {
        const valorFormatado = valorAtual ? formatarDataHoraInputLocal(valorAtual) : "";
        return `
          <div class="form-group" style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:3px;">
              ${campo.label}
            </label>
            <input type="datetime-local" id="retificacao_campo_${campo.campo}" 
              value="${valorFormatado}"
              style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:10px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:38px;">
            <div style="font-size:10px;color:var(--cinza-medio);margin-top:2px;">
              Valor atual: ${valorAtual ? formatarDataHoraLocal(valorAtual) : "Não informado"}
            </div>
          </div>
        `;
      }

      if (isTextarea) {
        return `
          <div class="form-group" style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:3px;">
              ${campo.label}
            </label>
            <textarea id="retificacao_campo_${campo.campo}" rows="2" 
              style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:10px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:50px;resize:vertical;">${valorAtual}</textarea>
            <div style="font-size:10px;color:var(--cinza-medio);margin-top:2px;">
              Valor atual: ${valorAtual || "Não informado"}
            </div>
          </div>
        `;
      }

      return `
        <div class="form-group" style="margin-bottom:10px;">
          <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:3px;">
            ${campo.label}
          </label>
          <input type="text" id="retificacao_campo_${campo.campo}" 
            value="${valorAtual}"
            placeholder="Digite o novo valor"
            style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:10px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:38px;">
          <div style="font-size:10px;color:var(--cinza-medio);margin-top:2px;">
            Valor atual: ${valorAtual || "Não informado"}
            </div>
          </div>
        `;
    })
    .join("");

  overlay.innerHTML = `
    <div class="modal" style="max-width:550px;width:100%;max-height:95vh;overflow-y:auto;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
          Solicitar Retificação - ${isVeiculo ? "Veículo" : "Pessoa"}
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <div style="margin-bottom:12px;padding:8px 12px;background:var(--azul-muito-claro);border-radius:var(--border-radius);border-left:4px solid var(--azul-bandeira);">
          <p style="margin:0;font-size:13px;color:var(--cinza-escuro);">
            <strong>${isVeiculo ? "Veículo:" : "Pessoa:"}</strong> ${identificador}
          </p>
          <p style="margin:4px 0 0 0;font-size:12px;color:var(--cinza-medio);">
            <i class="fas fa-calendar" style="margin-right:4px;"></i>
            Data: ${formatarDataHoraLocal(abordagem.criado_em)}
          </p>
        </div>

        <p style="font-size:13px;color:var(--cinza-medio);margin-bottom:12px;">
          <i class="fas fa-info-circle" style="margin-right:4px;"></i>
          Altere apenas os campos que precisam de correção. Os campos não alterados manterão o valor original.
        </p>

        <form id="formRetificacaoAbordagem" onsubmit="event.preventDefault();">
          ${camposHTML}

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:3px;">
              Justificativa <span class="required" style="color:var(--erro);">*</span>
            </label>
            <textarea id="retificacao_justificativa" rows="3" 
              placeholder="Explique o motivo da retificação (mínimo 10 caracteres)"
              style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:10px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:60px;resize:vertical;"></textarea>
            <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);margin-top:3px;">
              <i class="fas fa-info-circle"></i> Mínimo 10 caracteres
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Cancelar
        </button>
        <button type="button" class="btn-primary" onclick="window._confirmarRetificacaoAbordagem('${abordagem.id}', '${tipo}')" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
          <i class="fas fa-paper-plane" style="margin-right:6px;"></i> Solicitar Retificação
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Registrar função de confirmação
  window._confirmarRetificacaoAbordagem = async function (id, tipo) {
    const camposRetificaveis =
      tipo === "veiculo"
        ? CAMPOS_RETIFICAVEIS_VEICULO
        : CAMPOS_RETIFICAVEIS_PESSOA;
    const dados = {};
    let temAlteracao = false;

    camposRetificaveis.forEach((campo) => {
      const input = document.getElementById(`retificacao_campo_${campo.campo}`);
      if (input) {
        const valor = input.value.trim();
        if (campo.tipo === "datetime" && valor) {
          // Persistir como horário civil sem fuso, igual ao input datetime-local.
          const timestampLocal = formatarTimestampLocalSemFuso(valor);
          if (timestampLocal) dados[campo.campo] = timestampLocal;
        } else if (valor) {
          dados[campo.campo] = valor;
        }
        // Se o campo foi preenchido (mesmo que vazio), considera alteração
        if (input.value !== undefined) {
          temAlteracao = true;
        }
      }
    });

    const justificativa = document
      .getElementById("retificacao_justificativa")
      ?.value?.trim();

    if (!justificativa || justificativa.length < 10) {
      appInstance.showToast(
        "Justificativa deve ter pelo menos 10 caracteres",
        "warning",
      );
      return;
    }

    // Verificar se algum campo foi alterado
    const camposAlterados = [];
    camposRetificaveis.forEach((campo) => {
      const input = document.getElementById(`retificacao_campo_${campo.campo}`);
      if (input) {
        const valorAtual = abordagem[campo.campo] || "";
        const valorNovo = input.value.trim();
        if (String(valorAtual).trim() !== String(valorNovo).trim()) {
          camposAlterados.push({
            campo: campo.campo,
            label: campo.label,
            antes: valorAtual,
            depois: valorNovo,
          });
        }
      }
    });

    if (camposAlterados.length === 0) {
      appInstance.showToast("Nenhum campo foi alterado", "warning");
      return;
    }

    const confirmado = await appInstance.confirmar(
      `Deseja solicitar retificação para esta abordagem?\n\n${camposAlterados.length} campo(s) serão alterados.`,
      "Confirmar Retificação",
    );

    if (!confirmado) return;

    try {
      appInstance.showToast("Solicitando retificação...", "info");

      const client =
        typeof supabaseClient !== "undefined"
          ? supabaseClient.getClient()
          : null;
      if (!client) throw new Error("Erro ao conectar");

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
      const user = authManager.getUser();
      const isSupervisor = authManager.isSupervisor();

      // Preparar dados da retificação
      const dadosRetificados = {
        ...abordagem,
        ...dados,
        id: crypto.randomUUID ? crypto.randomUUID() : gerarUUID(),
        abordagem_original_id: abordagem.id,
        justificativa_retificacao: isSupervisor ? justificativa : null,
        retificado_em: isSupervisor ? globalThis.obterTimestampBrasilSemFuso() : null,
        retificado_por: isSupervisor ? user.id : null,
        solicitacao_retificacao_justificativa: isSupervisor
          ? null
          : justificativa,
        solicitada_em: isSupervisor ? null : globalThis.obterTimestampBrasilSemFuso(),
        solicitada_por: isSupervisor ? null : user.id,
        aprovada_em: isSupervisor ? globalThis.obterTimestampBrasilSemFuso() : null,
        aprovada_por: isSupervisor ? user.id : null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        status_retificacao: isSupervisor
          ? "rectified"
          : "pending_rectification",
        esta_ativa: isSupervisor ? true : false,
        numero_versao: (abordagem.numero_versao || 1) + 1,
        criado_em: globalThis.obterTimestampBrasilSemFuso(),
        atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
        criado_por: abordagem.criado_por,
        campos_alterados: JSON.stringify(camposAlterados),
        versao_original: JSON.stringify(abordagem),
      };

      delete dadosRetificados.id;

      // Se for supervisor, desativa a versão original
      if (isSupervisor) {
        const { error: updateError } = await client
          .from(tabela)
          .update({
            esta_ativa: false,
            atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
          })
          .eq("id", abordagem.id);

        if (updateError) throw updateError;
      }

      // Inserir a retificação
      const { data: novaAbordagem, error: insertError } = await client
        .from(tabela)
        .insert([dadosRetificados])
        .select()
        .single();

      if (insertError) throw insertError;

      // 🔥 NOVO: Registrar log pericial
      await registrarLogPericialAbordagem(
        isSupervisor
          ? "RETIFICAR_ABORDAGEM"
          : "SOLICITAR_RETIFICACAO_ABORDAGEM",
        tabela,
        novaAbordagem.id,
        abordagem,
        novaAbordagem,
      );

      // 🔥 NOVO: Notificar supervisores (se não for supervisor)
      if (!isSupervisor) {
        await notificarSupervisoresRetificacaoAbordagem(novaAbordagem, tipo);
      }

      // 🔥 NOVO: Notificar solicitante (se for supervisor)
      if (isSupervisor) {
        await notificarSolicitanteRetificacaoAbordagem(
          novaAbordagem,
          tipo,
          "aprovada",
        );
      }

      const modal = document.querySelector(".modal-overlay");
      if (modal) modal.remove();

      appInstance.showToast(
        isSupervisor
          ? "✅ Retificação aplicada com sucesso!"
          : "✅ Solicitação de retificação enviada!",
        "success",
      );

      // Recarregar lista de abordagens
      const container = document.getElementById("consultaContainer");
      if (container) {
        await carregarAbordagens(container, appInstance);
      }
    } catch (error) {
      console.error("Erro ao solicitar retificação:", error);
      appInstance.showToast(
        "Erro ao solicitar retificação: " + error.message,
        "error",
      );
    }
  };
}

/**
 * 🔥 NOVO: Registrar log pericial para abordagens
 */
async function registrarLogPericialAbordagem(
  acao,
  tabela,
  registroId,
  dadosAnt,
  dadosNov,
) {
  try {
    const user = authManager.getUser();
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    let ip = null;
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      ip = data.ip;
    } catch (e) {}

    let latitude = null;
    let longitude = null;
    try {
      if (navigator.geolocation) {
        const position = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        });
        if (position) {
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        }
      }
    } catch (e) {}

    const logData = {
      usuario_id: user.id,
      acao: acao,
      tabela_afetada: tabela,
      registro_id: registroId?.toString(),
      dados_anteriores: dadosAnt,
      dados_novos: dadosNov,
      ip_address: ip,
      user_agent: navigator.userAgent,
      latitude: latitude?.toString(),
      longitude: longitude?.toString(),
      criado_em: globalThis.obterTimestampBrasilSemFuso(),
    };

    await client.from("logs_periciais").insert([logData]);
  } catch (error) {
    console.warn("Erro ao registrar log pericial:", error);
  }
}

/**
 * 🔥 NOVO: Notificar supervisores sobre retificação pendente
 */
async function notificarSupervisoresRetificacaoAbordagem(abordagem, tipo) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: supervisores, error } = await client
      .from("usuarios")
      .select("id")
      .eq("perfil", "supervisor")
      .eq("status", "ativo");

    if (error) throw error;
    if (!supervisores || supervisores.length === 0) return;

    const identificador = tipo === "veiculo" ? abordagem.placa : abordagem.nome;

    const notificacoes = supervisores.map((s) => ({
      usuario_id: s.id,
      titulo: `📋 Retificação de Abordagem Pendente`,
      mensagem: `${identificador} (${tipo}) solicitou retificação. Aguarda sua análise.`,
      tipo: "retificacao_pendente",
      link: "#retificacoes-abordagens",
      criado_em: globalThis.obterTimestampBrasilSemFuso(),
    }));

    const batchSize = 50;
    for (let i = 0; i < notificacoes.length; i += batchSize) {
      const batch = notificacoes.slice(i, i + batchSize);
      await client.from("notificacoes").insert(batch);
    }

    console.log(
      `✅ ${notificacoes.length} notificações enviadas para supervisores`,
    );
  } catch (error) {
    console.error("Erro ao notificar supervisores:", error);
  }
}

/**
 * 🔥 NOVO: Notificar solicitante sobre aprovação/rejeição
 */
async function notificarSolicitanteRetificacaoAbordagem(
  abordagem,
  tipo,
  status,
  motivo = null,
) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const solicitanteId = abordagem.solicitada_por;
    if (!solicitanteId) return;

    const identificador = tipo === "veiculo" ? abordagem.placa : abordagem.nome;

    let titulo = "";
    let mensagem = "";

    if (status === "aprovada") {
      titulo = `✅ Retificação Aprovada`;
      mensagem = `Sua retificação de abordagem (${identificador}) foi aprovada pelo supervisor.`;
    } else if (status === "rejeitada") {
      titulo = `❌ Retificação Rejeitada`;
      mensagem = `Sua retificação de abordagem (${identificador}) foi rejeitada. Motivo: ${motivo}`;
    }

    await client.from("notificacoes").insert({
      usuario_id: solicitanteId,
      titulo: titulo,
      mensagem: mensagem,
      tipo:
        status === "aprovada"
          ? "retificacao_aprovada"
          : "retificacao_rejeitada",
      link: "#consulta",
      criado_em: globalThis.obterTimestampBrasilSemFuso(),
    });
  } catch (error) {
    console.error("Erro ao notificar solicitante:", error);
  }
}

// ============================================
// VERIFICAR CAMPOS DO FORMULÁRIO
// ============================================

function verificarCamposPreenchidos() {
  const inputs = document.querySelectorAll(
    "#formAbordagem input, #formAbordagem textarea, #formAbordagem select",
  );
  let preenchido = false;

  inputs.forEach((input) => {
    if (input.type === "file") return;
    if (input.type === "checkbox") {
      if (input.checked) preenchido = true;
      return;
    }
    if (input.value && input.value.trim() !== "") {
      preenchido = true;
    }
  });

  if (estado.arquivosTemp && estado.arquivosTemp.length > 0) {
    preenchido = true;
  }

  return preenchido;
}

// ============================================
// CARROSSEL DE FOTOS
// ============================================

function abrirCarrosselFotos(imagens, indexInicial = 0, appInstance) {
  // Verificar se há imagens
  if (!imagens || imagens.length === 0) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Nenhuma imagem disponível", "info");
    } else {
      console.warn("Nenhuma imagem disponível para o carrossel");
    }
    return;
  }

  // Verificar se o appInstance está disponível
  if (!appInstance) {
    appInstance = window._consultaApp || window.app;
  }

  try {
    // Criar overlay do carrossel
    const overlay = document.createElement("div");
    overlay.className = "carrossel-modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
      touch-action: none;
    `;

    let currentIndex = Math.min(indexInicial, imagens.length - 1);
    if (currentIndex < 0) currentIndex = 0;

    // Criar container do carrossel
    const container = document.createElement("div");
    container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      max-width: 900px;
      max-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      gap: 16px;
    `;

    // Botão fechar
    const closeBtn = document.createElement("button");
    closeBtn.className = "carrossel-close";
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      font-size: 28px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
      z-index: 10;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
    `;
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = function () {
      if (overlay.parentNode) overlay.remove();
      document.body.style.overflow = "";
    };

    // Botão de download
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "carrossel-download";
    downloadBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 80px;
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      font-size: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
      z-index: 10;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
    `;
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.title = "Baixar imagem";
    downloadBtn.onclick = function (e) {
      e.stopPropagation();
      const currentImg = imagens[currentIndex];
      if (currentImg && currentImg.url) {
        const link = document.createElement("a");
        link.href = currentImg.url;
        link.download = currentImg.nome || `imagem_${currentIndex + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    // Slide atual
    const slideContainer = document.createElement("div");
    slideContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      max-height: 70vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex: 1;
    `;

    const imgElement = document.createElement("img");
    imgElement.style.cssText = `
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
      border-radius: 8px;
      transition: opacity 0.3s ease;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    `;
    imgElement.src =
      imagens[currentIndex].url || imagens[currentIndex].url_thumb;
    imgElement.alt = `Foto ${currentIndex + 1}`;
    imgElement.loading = "lazy";

    // Contador
    const counter = document.createElement("div");
    counter.style.cssText = `
      color: rgba(255,255,255,0.8);
      font-size: 14px;
      font-weight: 600;
      background: rgba(0,0,0,0.5);
      padding: 6px 16px;
      border-radius: 20px;
      z-index: 5;
      backdrop-filter: blur(4px);
      user-select: none;
    `;
    counter.textContent = `${currentIndex + 1} / ${imagens.length}`;

    // Informações da imagem
    const infoContainer = document.createElement("div");
    infoContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      padding: 0 16px;
      flex-wrap: wrap;
      justify-content: center;
    `;

    const infoText = document.createElement("span");
    const nomeArquivo =
      imagens[currentIndex]?.nome || `Imagem ${currentIndex + 1}`;
    infoText.textContent = nomeArquivo;
    infoContainer.appendChild(infoText);

    // Informações de tamanho se disponível
    if (imagens[currentIndex]?.tamanho) {
      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = `(${formatarTamanho(imagens[currentIndex].tamanho)})`;
      sizeSpan.style.color = "rgba(255,255,255,0.4)";
      infoContainer.appendChild(sizeSpan);
    }

    slideContainer.appendChild(imgElement);
    container.appendChild(closeBtn);
    container.appendChild(downloadBtn);
    container.appendChild(slideContainer);
    container.appendChild(counter);
    container.appendChild(infoContainer);

    // Função de navegação
    function navegarCarrossel(direcao) {
      let novoIndex = currentIndex + direcao;
      if (novoIndex < 0) novoIndex = imagens.length - 1;
      if (novoIndex >= imagens.length) novoIndex = 0;

      currentIndex = novoIndex;
      const novaSrc =
        imagens[currentIndex].url || imagens[currentIndex].url_thumb;

      // Pré-carregar a imagem antes de trocar
      const tempImg = new Image();
      tempImg.onload = function () {
        imgElement.src = novaSrc;
        counter.textContent = `${currentIndex + 1} / ${imagens.length}`;
        infoText.textContent =
          imagens[currentIndex]?.nome || `Imagem ${currentIndex + 1}`;

        // Atualizar info de tamanho
        const sizeSpan = infoContainer.querySelector("span:last-child");
        if (imagens[currentIndex]?.tamanho) {
          if (sizeSpan) {
            sizeSpan.textContent = `(${formatarTamanho(imagens[currentIndex].tamanho)})`;
          } else {
            const newSizeSpan = document.createElement("span");
            newSizeSpan.textContent = `(${formatarTamanho(imagens[currentIndex].tamanho)})`;
            newSizeSpan.style.color = "rgba(255,255,255,0.4)";
            infoContainer.appendChild(newSizeSpan);
          }
        }

        // Atualizar bordas das miniaturas
        if (thumbnailsContainer) {
          const thumbs = thumbnailsContainer.querySelectorAll("img");
          thumbs.forEach((t, i) => {
            t.style.border =
              i === currentIndex ? "3px solid white" : "2px solid transparent";
            t.style.opacity = i === currentIndex ? "1" : "0.5";
          });
          // Rolar a miniatura para a visualização
          if (thumbs[currentIndex]) {
            thumbs[currentIndex].scrollIntoView({
              behavior: "smooth",
              inline: "center",
              block: "nearest",
            });
          }
        }
      };
      tempImg.src = novaSrc;
    }

    // Botões de navegação (se houver mais de 1 imagem)
    let prevBtn = null;
    let nextBtn = null;
    let thumbnailsContainer = null;

    if (imagens.length > 1) {
      prevBtn = document.createElement("button");
      prevBtn.className = "carrossel-nav carrossel-prev";
      prevBtn.style.cssText = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        left: 10px;
        background: rgba(0,0,0,0.5);
        border: none;
        color: white;
        font-size: 28px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 5;
        touch-action: manipulation;
        backdrop-filter: blur(4px);
      `;
      prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
      prevBtn.onclick = function (e) {
        e.stopPropagation();
        navegarCarrossel(-1);
      };
      prevBtn.onmouseenter = function () {
        this.style.background = "rgba(255,255,255,0.2)";
      };
      prevBtn.onmouseleave = function () {
        this.style.background = "rgba(0,0,0,0.5)";
      };

      nextBtn = document.createElement("button");
      nextBtn.className = "carrossel-nav carrossel-next";
      nextBtn.style.cssText = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        right: 10px;
        background: rgba(0,0,0,0.5);
        border: none;
        color: white;
        font-size: 28px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 5;
        touch-action: manipulation;
        backdrop-filter: blur(4px);
      `;
      nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
      nextBtn.onclick = function (e) {
        e.stopPropagation();
        navegarCarrossel(1);
      };
      nextBtn.onmouseenter = function () {
        this.style.background = "rgba(255,255,255,0.2)";
      };
      nextBtn.onmouseleave = function () {
        this.style.background = "rgba(0,0,0,0.5)";
      };

      container.appendChild(prevBtn);
      container.appendChild(nextBtn);

      // Miniaturas na parte inferior
      thumbnailsContainer = document.createElement("div");
      thumbnailsContainer.style.cssText = `
        display: flex;
        gap: 8px;
        max-width: 90%;
        overflow-x: auto;
        padding: 8px 12px;
        background: rgba(0,0,0,0.5);
        border-radius: 12px;
        z-index: 5;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.3) transparent;
        backdrop-filter: blur(4px);
        width: 100%;
        justify-content: center;
        flex-wrap: nowrap;
      `;

      // Estilizar scrollbar para webkit
      const styleScroll = document.createElement("style");
      styleScroll.textContent = `
        .thumbnails-container::-webkit-scrollbar {
          height: 4px;
        }
        .thumbnails-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .thumbnails-container::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 4px;
        }
      `;
      thumbnailsContainer.appendChild(styleScroll);
      thumbnailsContainer.className = "thumbnails-container";

      imagens.forEach((img, index) => {
        const thumb = document.createElement("img");
        thumb.src = img.url_thumb || img.url;
        thumb.alt = `Miniatura ${index + 1}`;
        thumb.style.cssText = `
          width: 60px;
          height: 60px;
          object-fit: cover;
          border-radius: 8px;
          cursor: pointer;
          border: ${index === currentIndex ? "3px solid white" : "2px solid transparent"};
          transition: all 0.2s ease;
          flex-shrink: 0;
          opacity: ${index === currentIndex ? "1" : "0.5"};
        `;
        thumb.onclick = function () {
          const targetIndex = index;
          const novaSrc =
            imagens[targetIndex].url || imagens[targetIndex].url_thumb;
          const tempImg = new Image();
          tempImg.onload = function () {
            currentIndex = targetIndex;
            imgElement.src = novaSrc;
            counter.textContent = `${currentIndex + 1} / ${imagens.length}`;
            infoText.textContent =
              imagens[currentIndex]?.nome || `Imagem ${currentIndex + 1}`;

            // Atualizar info de tamanho
            const sizeSpan = infoContainer.querySelector("span:last-child");
            if (imagens[currentIndex]?.tamanho) {
              if (sizeSpan) {
                sizeSpan.textContent = `(${formatarTamanho(imagens[currentIndex].tamanho)})`;
              }
            }

            // Atualizar bordas das miniaturas
            const thumbs = thumbnailsContainer.querySelectorAll("img");
            thumbs.forEach((t, i) => {
              t.style.border =
                i === currentIndex
                  ? "3px solid white"
                  : "2px solid transparent";
              t.style.opacity = i === currentIndex ? "1" : "0.5";
            });
            thumb.scrollIntoView({
              behavior: "smooth",
              inline: "center",
              block: "nearest",
            });
          };
          tempImg.src = novaSrc;
        };
        // Tooltip com nome do arquivo
        thumb.title = img.nome || `Imagem ${index + 1}`;
        thumbnailsContainer.appendChild(thumb);
      });

      container.appendChild(thumbnailsContainer);

      // Suporte a swipe no mobile
      let touchStartX = 0;
      let touchStartY = 0;
      let isSwiping = false;

      slideContainer.addEventListener(
        "touchstart",
        function (e) {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
          isSwiping = false;
        },
        { passive: true },
      );

      slideContainer.addEventListener(
        "touchmove",
        function (e) {
          const touchEndX = e.changedTouches[0].screenX;
          const touchEndY = e.changedTouches[0].screenY;
          const diffX = touchEndX - touchStartX;
          const diffY = touchEndY - touchStartY;

          if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 20) {
            isSwiping = true;
            e.preventDefault();
          }
        },
        { passive: false },
      );

      slideContainer.addEventListener(
        "touchend",
        function (e) {
          if (!isSwiping) return;
          const touchEndX = e.changedTouches[0].screenX;
          const diffX = touchEndX - touchStartX;

          if (Math.abs(diffX) > 50) {
            const direcao = diffX < 0 ? 1 : -1;
            navegarCarrossel(direcao);
          }
          isSwiping = false;
        },
        { passive: true },
      );

      // Suporte a teclado
      const keyHandler = function (e) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navegarCarrossel(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          navegarCarrossel(1);
        } else if (e.key === "Escape") {
          if (overlay.parentNode) overlay.remove();
          document.removeEventListener("keydown", keyHandler);
          document.body.style.overflow = "";
        }
      };
      document.addEventListener("keydown", keyHandler);

      // Limpar listener quando fechar
      const originalRemove = overlay.remove;
      overlay.remove = function () {
        document.removeEventListener("keydown", keyHandler);
        document.body.style.overflow = "";
        if (originalRemove) originalRemove.call(this);
      };
    } else {
      // Apenas uma imagem - mostrar botão de download e fechar
      // Ajustar para ocupar mais espaço
      slideContainer.style.maxHeight = "80vh";
      imgElement.style.maxHeight = "80vh";
    }

    overlay.appendChild(container);

    // Fechar ao clicar fora da imagem
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.remove();
        document.body.style.overflow = "";
      }
    });

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    // Pré-carregar imagens adjacentes
    if (imagens.length > 1) {
      const nextIdx = (currentIndex + 1) % imagens.length;
      const prevIdx = (currentIndex - 1 + imagens.length) % imagens.length;
      const nextImg = new Image();
      nextImg.src = imagens[nextIdx].url || imagens[nextIdx].url_thumb;
      const prevImg = new Image();
      prevImg.src = imagens[prevIdx].url || imagens[prevIdx].url_thumb;
    }
  } catch (error) {
    console.error("Erro ao abrir carrossel:", error);
    // Fallback: abrir a imagem em nova aba
    if (imagens && imagens.length > 0) {
      const url = imagens[0].url || imagens[0].url_thumb;
      if (url) {
        window.open(url, "_blank");
      } else if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao abrir imagem", "error");
      }
    }
  }
}

// Expor o visualizador desde a carga do módulo, para que o Dashboard também o use.
if (typeof window !== "undefined") {
  window._consultaAbrirCarrossel = (imagens, index, appInstance) =>
    abrirCarrosselFotos(imagens, index, appInstance);
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

export async function renderConsultaOperacional(container, appInstance) {
  await carregarListaGuardas();
  definirPeriodoPadrao();

  let html = `
    <main class="container consulta-screen" style="padding-bottom:100px;" id="consultaContainer">
      <header class="consulta-hero">
        <div class="consulta-hero-heading">
          <div class="consulta-hero-icon" aria-hidden="true"><i class="fas fa-search"></i></div>
          <div>
            <h2>Consulta Operacional</h2>
            <p>Encontre abordagens anteriores e consulte o contexto registrado.</p>
          </div>
        </div>
        <div class="consulta-hero-actions">
          <button type="button" onclick="window._consultaAbrirFormulario()" class="consulta-new-button">
            <i class="fas fa-plus-circle" aria-hidden="true"></i><span>Nova abordagem</span>
          </button>
          <button type="button" onclick="window._consultaReconhecerPlaca()" class="consulta-secondary-button" aria-label="Reconhecer placa por foto" title="Reconhecer placa por foto">
            <i class="fas fa-camera" aria-hidden="true"></i><span>Foto da placa</span>
          </button>
          <button type="button" onclick="window._consultaExportarPDF()" class="consulta-icon-button" aria-label="Exportar resultados em PDF" title="Exportar PDF">
            <i class="fas fa-file-pdf" aria-hidden="true"></i>
          </button>
          <button type="button" onclick="window._consultaRecarregar()" class="consulta-icon-button" aria-label="Atualizar consulta" title="Atualizar">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <section class="consulta-search-panel" aria-labelledby="consultaBuscaTitulo">
        <div class="consulta-section-heading">
          <div>
            <span class="consulta-eyebrow">LOCALIZAR REGISTRO</span>
            <h3 id="consultaBuscaTitulo">O que deseja consultar?</h3>
          </div>
          <span class="consulta-search-icon" aria-hidden="true"><i class="fas fa-search"></i></span>
        </div>
        <div class="consulta-search-row">
          <label class="sr-only" for="consultaBusca">Pesquisar abordagens por placa, nome, CPF ou RG</label>
          <input type="search" id="consultaBusca" placeholder="Placa, nome, CPF/RG completo, local..."
            value="${estado.filtros.busca || ""}"
            aria-label="Pesquisar registros de abordagens"
            oninput="window._consultaBuscaAutomatica(this.value)"
            onkeydown="if(event.key==='Enter') window._consultaExecutarBusca()">
          <button type="button" onclick="window._consultaExecutarBusca()" class="consulta-search-button"><i class="fas fa-search" aria-hidden="true"></i><span>Buscar</span></button>
          <button type="button" onclick="window._consultaLimparBusca()" class="consulta-clear-button" aria-label="Limpar busca" title="Limpar busca"><i class="fas fa-times" aria-hidden="true"></i></button>
        </div>
        <p class="consulta-search-hint">Nome, placa, motivo e local são pesquisados por texto. Para CPF/RG, informe o identificador completo.</p>
        <p class="consulta-scope-note"><i class="fas fa-info-circle" aria-hidden="true"></i><span>Esta consulta mostra registros de abordagens. BOs não têm placa estruturada para busca por veículo; ausência de resultado não prova que nunca houve ocorrência.</span></p>
      </section>

      <section class="consulta-filter-panel" aria-label="Filtros principais">
        <div class="consulta-quick-filters">
          <label class="consulta-filter-field" for="consultaPeriodo"><span><i class="fas fa-calendar-alt" aria-hidden="true"></i> Período</span>
            <select id="consultaPeriodo" onchange="window._consultaPeriodoChange()">
              <option value="12h" ${estado.filtros.periodo === "12h" ? "selected" : ""}>Últimas 12 horas</option>
              <option value="hoje" ${estado.filtros.periodo === "hoje" ? "selected" : ""}>Hoje</option>
              <option value="semana" ${estado.filtros.periodo === "semana" ? "selected" : ""}>Últimos 7 dias</option>
              <option value="mes" ${estado.filtros.periodo === "mes" ? "selected" : ""}>Últimos 30 dias</option>
              <option value="personalizado" ${estado.filtros.periodo === "personalizado" ? "selected" : ""}>Período personalizado</option>
            </select>
          </label>
          <label class="consulta-filter-field" for="consultaTipoAtendimento"><span><i class="fas fa-clipboard-check" aria-hidden="true"></i> Tipo de atendimento</span>
            <select id="consultaTipoAtendimento">
              <option value="">Todos os tipos</option>
              <option value="fiscalizacao_estacionamento" ${estado.filtros.tipoAtendimento === "fiscalizacao_estacionamento" ? "selected" : ""}>Fiscalização / estacionamento irregular</option>
              <option value="averiguacao_operacional" ${estado.filtros.tipoAtendimento === "averiguacao_operacional" ? "selected" : ""}>Averiguação / abordagem operacional</option>
              <option value="orientacao" ${estado.filtros.tipoAtendimento === "orientacao" ? "selected" : ""}>Orientação</option>
              <option value="outro" ${estado.filtros.tipoAtendimento === "outro" ? "selected" : ""}>Outro atendimento</option>
              <option value="legado_nao_classificado" ${estado.filtros.tipoAtendimento === "legado_nao_classificado" ? "selected" : ""}>Registro legado · não classificado</option>
            </select>
          </label>
        </div>
        <details id="consultaFiltrosAvancados" class="consulta-advanced-filters">
          <summary><span><i class="fas fa-sliders-h" aria-hidden="true"></i> Mais filtros</span><span class="consulta-advanced-caption">Guarda e datas específicas</span></summary>
          <div class="consulta-advanced-body">
            <label class="consulta-filter-field" for="consultaGuarda"><span><i class="fas fa-user-shield" aria-hidden="true"></i> Guarda responsável</span>
              <select id="consultaGuarda"><option value="">Todos os guardas</option>
                ${estado.listaGuardas.map((g) => `<option value="${g.id}" ${estado.filtros.guarda === g.id ? "selected" : ""}>${g.nome_completo}</option>`).join("")}
              </select>
            </label>
            <div id="consultaDatasPersonalizadas" class="consulta-custom-dates" style="display:none;">
              <label class="consulta-filter-field" for="consultaDataInicio"><span>Data inicial</span><input type="date" id="consultaDataInicio" value="${(estado.filtros.dataInicio || "").slice(0, 10)}"></label>
              <label class="consulta-filter-field" for="consultaDataFim"><span>Data final</span><input type="date" id="consultaDataFim" value="${(estado.filtros.dataFim || "").slice(0, 10)}"></label>
            </div>
            <button type="button" onclick="window._consultaAplicarFiltros()" class="consulta-apply-filters"><i class="fas fa-filter" aria-hidden="true"></i> Aplicar filtros</button>
          </div>
        </details>
        <button type="button" onclick="window._consultaAplicarFiltros()" class="consulta-apply-quick"><i class="fas fa-filter" aria-hidden="true"></i> Aplicar filtros</button>
      </section>

      <nav class="consulta-entity-tabs" role="tablist" aria-label="Filtrar por tipo de envolvido">
        <button type="button" onclick="window._consultaMudarAba('todos')" id="tabTodos" class="tab-btn ${estado.abaAtiva === "todos" ? "active" : ""}" role="tab" aria-controls="consultaResultadosArea" aria-selected="${estado.abaAtiva === "todos"}"><i class="fas fa-list" aria-hidden="true"></i><span>Todos</span></button>
        <button type="button" onclick="window._consultaMudarAba('veiculos')" id="tabVeiculos" class="tab-btn ${estado.abaAtiva === "veiculos" ? "active" : ""}" role="tab" aria-controls="consultaResultadosArea" aria-selected="${estado.abaAtiva === "veiculos"}"><i class="fas fa-car" aria-hidden="true"></i><span>Veículos</span></button>
        <button type="button" onclick="window._consultaMudarAba('pessoas')" id="tabPessoas" class="tab-btn ${estado.abaAtiva === "pessoas" ? "active" : ""}" role="tab" aria-controls="consultaResultadosArea" aria-selected="${estado.abaAtiva === "pessoas"}"><i class="fas fa-user" aria-hidden="true"></i><span>Pessoas</span></button>
      </nav>

      <section id="consultaResultadosArea" class="consulta-results-panel" aria-live="polite">
        <div class="consulta-results-heading"><div><span class="consulta-eyebrow">HISTÓRICO</span><h3>Resultados da consulta</h3><p>Mais recentes primeiro · <span id="consultaTotalRegistros">0 carregados</span></p></div></div>
        <div id="consultaListaAbordagens">
          <div class="consulta-loading-state"><div class="spinner-azul" style="margin:0 auto;width:30px;height:30px;border-width:3px;"></div><p>Carregando registros...</p></div>
        </div>
        <div id="consultaLoaderMais" style="display:none;text-align:center;padding:20px;"><div class="spinner-azul" style="margin:0 auto;width:24px;height:24px;border-width:2px;"></div><p style="margin-top:8px;color:var(--cinza-medio);font-size:12px;">Carregando mais...</p></div>
      </section>

      <details id="rankingContainer" class="consulta-repeat-summary">
        <summary><span><i class="fas fa-link" aria-hidden="true"></i> Correspondências exatas entre identificadores</span><i class="fas fa-chevron-down consulta-repeat-chevron" aria-hidden="true"></i></summary>
        <p class="consulta-repeat-note">Resumo limitado a até 1.000 registros ativos por categoria e baseado em igualdade exata de placa/CPF/RG. É apenas uma coincidência entre registros; não avalia risco, autoria ou suspeição. Confirme o histórico e o contexto antes de qualquer conclusão.</p>
        <div id="rankingLista"><div class="consulta-repeat-loading">Carregando resumo...</div></div>
        <button type="button" onclick="window._consultaVerRankingCompleto()" class="consulta-repeat-open">Abrir resumo de correspondências</button>
      </details>
    </main>
  `;
  container.innerHTML = html;

  // Registrar funções globais
  window._consultaMudarAba = (aba) => mudarAba(aba, container, appInstance);
  window._consultaPeriodoChange = consultaPeriodoChange;
  window._consultaAbrirFormulario = () => abrirFormularioAbordagem(appInstance);
  window._consultaReconhecerPlaca = () => reconhecerPlacaPorFoto(appInstance);
  window._consultaAplicarFiltros = () =>
    aplicarFiltrosConsulta(container, appInstance);
  window._consultaExecutarBusca = () =>
    executarBuscaConsulta(container, appInstance);
  window._consultaBuscaAutomatica = (termo) =>
    buscaAutomatica(termo, container, appInstance);
  window._consultaLimparBusca = () => limparBuscaConsulta(container, appInstance);
  window._consultaVerRankingCompleto = () => verRankingCompleto(appInstance);
  window._consultaCarregarMais = () =>
    carregarMaisAbordagens(container, appInstance);
  window._consultaVerAbordagemDetalhe = (id, tipo) =>
    verAbordagemDetalhe(id, tipo, appInstance);
  window._consultaConverterBO = (id, tipo) =>
    converterEmBO(id, tipo, appInstance);
  window._consultaSalvarAbordagem = () => salvarAbordagemComAnexos(appInstance);
  window._consultaBuscarHistorico = () => buscarHistoricoAbordagem(appInstance);
  window._consultaAtualizarIdentificacao = atualizarCamposIdentificacaoAbordagem;
  window._consultaPreviewImagens = (input) =>
    previewMultiplasImagensAbordagem(input);
  window._consultaRemoverImagem = (btn) => removerImagemAbordagemPreview(btn);
  window._consultaAbrirCameraRapida = () => abrirCameraRapida(appInstance);
  window._consultaFecharFormulario = () =>
    fecharFormularioComConfirmacao(container, appInstance);
  window._consultaAbrirCarrossel = (imagens, index, callerAppInstance) =>
    abrirCarrosselFotos(imagens, index, callerAppInstance || appInstance);

  // 🔥 NOVO: Função para solicitar retificação
  window._consultaSolicitarRetificacao = (id, tipo) =>
    abrirSolicitarRetificacaoAbordagem(id, tipo, appInstance);

  // 🔥 NOVO: Função para finalizar abordagem
  window._consultaFinalizarAbordagem = (id, tipo) =>
    finalizarAbordagem(id, tipo, appInstance);

  // Funções de exportação PDF
  window._consultaExportarPDF = () => exportarListaPDF(appInstance);
  window._consultaExportarDetalhePDF = (id, tipo) =>
    exportarDetalhePDF(id, tipo, appInstance);

  // Recarregar
  window._consultaRecarregar = () =>
    renderConsultaOperacional(container, appInstance);

  window._consultaApp = appInstance;

  void carregarRankingReincidentes();
  await carregarAbordagens(container, appInstance);
  configurarScrollInfinito(container, appInstance);
}

function mostrarSeletorTipoAbordagem(area, appInstance, termoPreenchido = "") {
  estado.arquivosTemp = [];
  estado.tipoAbordagemAtual = null;
  estado.formularioAberto = true;
  area.innerHTML = `
    <section aria-labelledby="tituloEscolherTipoAbordagem" style="background:var(--branco);padding:18px 14px;border-radius:16px;box-shadow:var(--sombra-media);margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
        <div style="width:44px;height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:20px;"><i class="fas fa-clipboard-check"></i></div>
        <div><h3 id="tituloEscolherTipoAbordagem" style="font-size:17px;color:var(--azul-bandeira);margin:0 0 4px;">Que tipo de registro deseja fazer?</h3><p style="font-size:13px;line-height:1.4;color:var(--cinza-medio);margin:0;">Escolha uma opção para abrir os campos corretos.</p></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;">
        <button type="button" onclick="window._consultaEscolherTipoAbordagem('veiculo')" style="width:100%;min-height:64px;padding:12px;border:2px solid var(--azul-claro);border-radius:12px;background:var(--branco);color:var(--azul-bandeira);display:flex;align-items:center;gap:12px;text-align:left;font-size:15px;font-weight:700;cursor:pointer;">
          <i class="fas fa-car" style="font-size:22px;width:28px;text-align:center;"></i><span>Abordagem de veículo<small style="display:block;margin-top:3px;font-size:12px;font-weight:400;color:var(--cinza-medio);">Placa, veículo e condutor</small></span><i class="fas fa-chevron-right" style="margin-left:auto;font-size:14px;"></i>
        </button>
        <button type="button" onclick="window._consultaEscolherTipoAbordagem('pessoa')" style="width:100%;min-height:64px;padding:12px;border:2px solid var(--verde-bandeira);border-radius:12px;background:var(--branco);color:var(--verde-escuro);display:flex;align-items:center;gap:12px;text-align:left;font-size:15px;font-weight:700;cursor:pointer;">
          <i class="fas fa-user" style="font-size:22px;width:28px;text-align:center;"></i><span>Abordagem de pessoa<small style="display:block;margin-top:3px;font-size:12px;font-weight:400;color:var(--cinza-medio);">Identificação e características</small></span><i class="fas fa-chevron-right" style="margin-left:auto;font-size:14px;"></i>
        </button>
      </div>
      <button type="button" onclick="window._consultaFecharFormulario()" class="btn-secondary" style="width:100%;min-height:44px;margin-top:14px;border-radius:10px;font-size:14px;">Cancelar</button>
    </section>
  `;
  window._consultaEscolherTipoAbordagem = (tipo) => {
    if (tipo !== "veiculo" && tipo !== "pessoa") return;
    abrirFormularioAbordagem(appInstance, termoPreenchido, tipo);
  };
}

// ============================================
// 🔥 ALTERADO: FORMULÁRIO DE ABORDAGEM COM DATA/HORA
// ============================================

export function abrirFormularioAbordagem(appInstance, termoPreenchido = "", tipoAbordagem = null) {
  const area = document.getElementById("consultaResultadosArea");
  if (!area) return;

  const tipoSelecionado = tipoAbordagem ||
    (estado.abaAtiva === "veiculos" ? "veiculo" :
      estado.abaAtiva === "pessoas" ? "pessoa" : null);
  if (!tipoSelecionado) {
    mostrarSeletorTipoAbordagem(area, appInstance, termoPreenchido);
    return;
  }
  if (tipoSelecionado !== "veiculo" && tipoSelecionado !== "pessoa") return;
  const isVeiculo = tipoSelecionado === "veiculo";
  estado.tipoAbordagemAtual = tipoSelecionado;
  estado.arquivosTemp = [];
  estado.formularioAberto = true;

  const localizacaoAtual =
    typeof window.app !== "undefined"
      ? window.app.obterLocalizacaoAtual()
      : null;

  // Data/hora local para preencher o campo datetime-local sem conversão UTC.
  const dataHoraAtual = obterDataHoraLocalInputAbordagem();
  const dataHoraInicio = dataHoraAtual;

  let html = `
    <div class="approach-form-shell">
      <div class="approach-form-hero">
        <div class="approach-form-hero__copy">
          <span class="approach-form-kicker">REGISTRO OPERACIONAL · ABORDAGEM</span>
          <h3><i class="fas ${isVeiculo ? "fa-car" : "fa-user-shield"}" aria-hidden="true"></i> Nova abordagem de ${isVeiculo ? "veículo" : "pessoa"}</h3>
          <p>Registre o que foi observado, a identificação disponível e a providência adotada.</p>
          <span class="approach-form-scope"><i class="fas fa-circle-info" aria-hidden="true"></i> Esta tela registra abordagens; rondas e BOs não são cadastrados aqui.</span>
        </div>
        <button type="button" aria-label="Fechar formulário" onclick="window._consultaFecharFormulario()" class="btn-secondary approach-form-close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${
        localizacaoAtual
          ? `
        <div style="font-size:12px;color:var(--verde-escuro);margin-bottom:10px;padding:8px 10px;border-radius:8px;background:var(--verde-muito-claro);display:flex;align-items:center;gap:7px;">
          <i class="fas fa-location-dot" aria-hidden="true"></i>
          Localização GPS disponível para o registro
        </div>
      `
          : `<div class="approach-location-note"><i class="fas fa-location-crosshairs" aria-hidden="true"></i><span>GPS indisponível no momento. Informe o local por endereço ou ponto de referência; não perca o relato preenchido.</span></div>`
      }
      <form id="formAbordagem" aria-label="Registro de abordagem" onsubmit="event.preventDefault();">
        <div class="approach-section-heading"><span>01</span><div><h4><i class="fas fa-id-card" aria-hidden="true"></i> Contexto e identificação</h4><p>Selecione o tipo de atendimento e informe somente o que foi possível confirmar.</p></div></div>
        <div class="approach-form-field approach-form-field--wide">
          <label for="formTipoAtendimento">Tipo de atendimento *</label>
          <select id="formTipoAtendimento" required onchange="window._consultaAtualizarTipoAtendimento()">
            <option value="">Selecione o contexto</option>
            ${isVeiculo ? `
              <option value="fiscalizacao_estacionamento">Fiscalização de estacionamento irregular</option>
              <option value="averiguacao_operacional">Abordagem / averiguação de veículo</option>
              <option value="orientacao">Orientação relacionada a veículo</option>
              <option value="outro">Outro atendimento com veículo</option>
            ` : `
              <option value="averiguacao_operacional">Abordagem / averiguação de pessoa</option>
              <option value="orientacao">Orientação relacionada a pessoa</option>
              <option value="outro">Outro atendimento com pessoa</option>
            `}
          </select>
          <small id="approachAtendimentoHint">O tipo contextualiza o atendimento; o campo Motivo registra os fatos observados ou informados.</small>
        </div>
  `;

  if (isVeiculo) {
    html += `
      <div class="approach-form-field">
        <label for="formIdentificacaoStatus">Situação da identificação *</label>
        <select id="formIdentificacaoStatus" onchange="window._consultaAtualizarIdentificacao()" required>
          <option value="identificado">Veículo identificado</option>
          <option value="parcial">Identificação parcial</option>
          <option value="nao_identificado">Placa não identificada</option>
        </select>
      </div>
      <div class="approach-form-field">
        <label for="formPlaca">Placa (se legível)</label>
        <input type="text" id="formPlaca" value="${escapeHtmlAbordagem(termoPreenchido)}" placeholder="ABC1D23" autocomplete="off" autocapitalize="characters" maxlength="8">
        <small>Não estime a placa. Se estiver ausente ou ilegível, registre a situação e descreva apenas o que foi observado.</small>
      </div>
      <button type="button" class="approach-history-trigger" onclick="window._consultaBuscarHistorico()"><i class="fas fa-clock-rotate-left"></i> Consultar registros anteriores pela placa</button>
      <div id="abordagemHistorico" class="approach-history-panel" aria-live="polite"></div>
      <div class="approach-form-grid">
        <div class="approach-form-field">
          <label for="formMarcaModelo">Marca / modelo</label>
          <input type="text" id="formMarcaModelo" placeholder="Ex.: hatch, Honda Civic">
        </div>
        <div class="approach-form-field">
          <label for="formCor">Cor</label>
          <input type="text" id="formCor" placeholder="Ex.: prata">
        </div>
      </div>
      <div class="approach-form-field">
        <label for="formDescricaoIdentificacao">Descrição objetiva do veículo</label>
        <textarea id="formDescricaoIdentificacao" rows="2" placeholder="Características visíveis úteis para identificar o veículo, sem suposições"></textarea>
        <small>Obrigatória quando a placa não estiver identificada.</small>
      </div>
      <details class="approach-optional-section">
        <summary>Dados do condutor (opcionais, se disponíveis)</summary>
        <div class="approach-form-field">
          <label for="formCondutor">Nome do condutor</label>
          <input type="text" id="formCondutor" placeholder="Nome informado/confirmado">
        </div>
        <div class="approach-form-field">
          <label for="formCondutorCpf">CPF do condutor</label>
          <input type="text" id="formCondutorCpf" placeholder="000.000.000-00" inputmode="numeric">
        </div>
      </details>
    `;
  } else {
    html += `
      <div class="approach-form-field">
        <label for="formIdentificacaoStatus">Situação da identificação *</label>
        <select id="formIdentificacaoStatus" onchange="window._consultaAtualizarIdentificacao()" required>
          <option value="identificado">Pessoa identificada</option>
          <option value="parcial">Identificação parcial</option>
          <option value="nao_identificado">Pessoa não identificada</option>
        </select>
      </div>
      <div class="approach-form-field">
        <label for="formNome">Nome <span class="approach-optional-label">(se identificado)</span></label>
        <input type="text" id="formNome" value="${escapeHtmlAbordagem(termoPreenchido)}" placeholder="Nome informado/confirmado" autocomplete="off">
      </div>
      <div class="approach-form-grid">
        <div class="approach-form-field">
          <label for="formCpf">CPF (opcional)</label>
          <input type="text" id="formCpf" placeholder="000.000.000-00" inputmode="numeric" autocomplete="off">
        </div>
        <div class="approach-form-field">
          <label for="formRg">RG (opcional)</label>
          <input type="text" id="formRg" placeholder="00.000.000-0" autocomplete="off">
        </div>
      </div>
      <button type="button" class="approach-history-trigger" onclick="window._consultaBuscarHistorico()"><i class="fas fa-clock-rotate-left"></i> Consultar registros anteriores</button>
      <div id="abordagemHistorico" class="approach-history-panel" aria-live="polite"></div>
      <div class="approach-form-field">
        <label for="formDescricaoIdentificacao">Descrição objetiva (quando necessária)</label>
        <textarea id="formDescricaoIdentificacao" rows="2" placeholder="Características observáveis pertinentes à identificação, sem avaliações subjetivas"></textarea>
        <small>Obrigatória quando a pessoa não estiver plenamente identificada.</small>
      </div>
      <details class="approach-optional-section">
        <summary>Outros dados (opcionais e pertinentes)</summary>
        <div class="approach-form-field">
          <label for="formAlcunha">Alcunha (se informada e pertinente)</label>
          <input type="text" id="formAlcunha" placeholder="Não invente nem deduza apelidos">
        </div>
        <div class="approach-form-field">
          <label for="formCaracteristicas">Características observáveis pertinentes</label>
          <textarea id="formCaracteristicas" rows="2" placeholder="Registre características objetivas e relevantes, se necessário"></textarea>
        </div>
        <div class="approach-form-field">
          <label for="formVestimentas">Vestimentas (se pertinentes ao atendimento)</label>
          <textarea id="formVestimentas" rows="2" placeholder="Descrição objetiva e circunstancial"></textarea>
        </div>
      </details>
    `;
  }

  html += `
    <div class="approach-section-heading"><span>02</span><div><h4><i class="fas fa-map-marker-alt" aria-hidden="true"></i> Onde e quando</h4><p>Confira o horário do atendimento e descreva o local com referência útil.</p></div></div>
    <div class="form-group" style="margin-bottom:10px;">
      <label for="formLocal" style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">Local da abordagem</label>
      <input type="text" id="formLocal" placeholder="Endereço, cruzamento ou ponto de referência" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;min-height:44px;">
      <small class="approach-field-hint">Se o GPS não estiver disponível, registre uma referência que permita localizar o atendimento.</small>
    </div>
    
    <!-- 🔥 NOVO: Data/Hora Início e Encerramento -->
    <div class="approach-form-time-grid">
      <div style="min-width:0;">
        <label style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">Data/Hora Início *</label>
        <input type="datetime-local" id="formDataHoraInicio" value="${dataHoraInicio}" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;min-height:44px;" required>
      </div>
      <div style="min-width:0;">
        <label style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">Data/Hora Encerramento (se já ocorreu)</label>
        <input type="datetime-local" id="formDataHoraEncerramento" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;min-height:44px;">
      </div>
    </div>

    <div class="approach-section-heading"><span>03</span><div><h4><i class="fas fa-clipboard-list" aria-hidden="true"></i> Fatos e providências</h4><p>Separe o motivo observado do que a equipe fez e do resultado.</p></div></div>
    <div class="form-group" style="margin-bottom:10px;">
      <label style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">Motivo da Abordagem</label>
      <textarea id="formMotivo" rows="3" placeholder="Descreva o fato observado ou informado: condição, local e circunstância relevante." required></textarea>
      <small>Use linguagem objetiva e circunstancial. Evite conclusões, suposições ou rótulos sobre a pessoa.</small>
    </div>
    <div class="approach-form-field">
      <label for="formProvidencia">Providência e resultado *</label>
      <select id="formProvidencia" required>
        <option value="em_andamento" selected>Atendimento em andamento</option>
        <option value="orientacao_prestada">Orientação prestada</option>
        <option value="situacao_regularizada">Situação regularizada</option>
        <option value="sem_irregularidade">Nenhuma irregularidade constatada</option>
        <option value="encaminhamento">Encaminhamento conforme procedimento</option>
        <option value="outra">Outra providência</option>
      </select>
    </div>
    <div class="form-group approach-optional-observations" style="margin-bottom:6px;">
      <label style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">Complemento (opcional)</label>
      <textarea id="formObservacoesAbordagem" rows="2" placeholder="Informações complementares..." style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;min-height:44px;resize:vertical;"></textarea>
    </div>

    <details class="approach-optional-section">
      <summary>Fase administrativa e prazo (quando aplicável)</summary>
      <div class="approach-form-field">
        <label for="formFase">Fase</label>
        <select id="formFase">
          <option value="advertencia">Advertência</option>
          <option value="multa">Multa</option>
        </select>
      </div>
      <label class="approach-checkbox-row" for="formTemPrazo">
        <input type="checkbox" id="formTemPrazo" onchange="document.getElementById('formPrazo').disabled = !this.checked">
        <span>Definir prazo para regularização</span>
      </label>
      <div class="approach-form-field">
        <label for="formPrazo">Prazo</label>
        <input type="date" id="formPrazo" disabled>
      </div>
    </details>

    <div class="approach-section-heading"><span>04</span><div><h4><i class="fas fa-camera" aria-hidden="true"></i> Evidências</h4><p>Fotos são opcionais. Confira a prévia antes de salvar.</p></div></div>
    <div class="form-group approach-photo-field" style="margin-bottom:6px;">
      <label style="display:block;font-size:12px;margin-bottom:5px;font-weight:600;">
        <i class="fas fa-camera"></i> Fotos do atendimento
      </label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <input type="file" id="abordagemFileInput" accept="image/*" multiple style="display:none;" onchange="window._consultaPreviewImagens(this)">
        <div style="display:flex;gap:6px;">
          <button type="button" onclick="document.getElementById('abordagemFileInput').click()" class="btn-secondary" style="flex:1;font-size:12px;padding:4px 6px;border-radius:8px;min-height:44px;">
            <i class="fas fa-camera"></i> Selecionar Fotos
          </button>
          <button type="button" onclick="window._consultaAbrirCameraRapida()" class="btn-secondary" style="flex:1;font-size:12px;padding:4px 6px;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);min-height:44px;">
            <i class="fas fa-camera-retro"></i> Tirar Foto
          </button>
        </div>
        <div id="abordagemPreviewArea" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
        <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);">
          <i class="fas fa-info-circle"></i> Anexos opcionais; as imagens são comprimidas antes do envio.
        </div>
      </div>
    </div>

    <div class="approach-form-actions">
      <button type="button" onclick="window._consultaSalvarAbordagem()" class="btn-primary">
        <i class="fas fa-save"></i> Salvar abordagem
      </button>
      <button type="button" onclick="window._consultaFecharFormulario()" class="btn-secondary">Cancelar</button>
    </div>
  `;

  html += `</form></div>`;

  area.innerHTML = html;
  atualizarCamposIdentificacaoAbordagem();

  const cpfInput =
    document.getElementById("formCpf") ||
    document.getElementById("formCondutorCpf");
  if (cpfInput) {
    cpfInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraCPFInterna(this.value);
    });
  }

  const placaInput = document.getElementById("formPlaca");
  if (placaInput) {
    placaInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraPlacaInterna(this.value);
    });
  }
}

// ============================================
// 🔥 ALTERADO: SALVAR ABORDAGEM COM DATA/HORA
// ============================================


function escapeHtmlAbordagem(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

function normalizarPlacaAbordagem(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function atualizarCamposIdentificacaoAbordagem() {
  const status = document.getElementById("formIdentificacaoStatus")?.value || "identificado";
  const isVeiculo = estado.tipoAbordagemAtual === "veiculo";
  const identifierInput = document.getElementById(isVeiculo ? "formPlaca" : "formNome");
  const descriptionInput = document.getElementById("formDescricaoIdentificacao");
  if (identifierInput) {
    identifierInput.required = status === "identificado";
    identifierInput.setAttribute("aria-required", status === "identificado" ? "true" : "false");
    const label = identifierInput.closest(".approach-form-field")?.querySelector("label");
    if (label) label.classList.toggle("is-required", status === "identificado");
  }
  if (descriptionInput) {
    descriptionInput.required = status !== "identificado";
    descriptionInput.setAttribute("aria-required", status !== "identificado" ? "true" : "false");
  }
}

function formatarHistoricoData(value) {
  if (!value) return "Data não informada";
  try { return formatarDataHoraLocal(value); } catch (_) { return "Data não informada"; }
}

function renderHistoricoAbordagem(approaches, boRecords, options = {}) {
  const panel = document.getElementById("abordagemHistorico");
  if (!panel) return;
  const items = [
    ...(approaches || []).map((row) => ({ source: "abordagem", row })),
    ...(boRecords || []).map((row) => ({ source: "bo", row })),
  ].sort((a, b) => {
    const dateA = new Date(a.source === "bo" ? (a.row.ocorrencia?.data_hora_inicio || a.row.criado_em) : (a.row.data_hora_inicio || a.row.criado_em)).getTime() || 0;
    const dateB = new Date(b.source === "bo" ? (b.row.ocorrencia?.data_hora_inicio || b.row.criado_em) : (b.row.data_hora_inicio || b.row.criado_em)).getTime() || 0;
    return dateB - dateA;
  });
  const cards = items.map(({ source, row }) => {
    if (source === "bo") {
      const occ = row.ocorrencia || {};
      const number = occ.numero_ocorrencia || String(occ.id || row.ocorrencia_id || "").slice(0, 8) || "BO";
      const title = occ.tipo_ocorrencia ? getTipoLabel(occ.tipo_ocorrencia) : "Ocorrência registrada";
      const detail = [getTipoEnvolvidoLabel(row.tipo), occ.local_ocorrencia || "Local não informado"].filter(Boolean).join(" · ");
      return `<article class="approach-history-result"><div class="approach-history-result__top"><strong>BO ${escapeHtmlAbordagem(number)}</strong><time>${escapeHtmlAbordagem(formatarHistoricoData(occ.data_hora_inicio || row.criado_em))}</time></div><div class="approach-history-result__title">${escapeHtmlAbordagem(title)}</div><p>${escapeHtmlAbordagem(detail)}</p><small>Registro relacionado por identificador; confira o BO em Ocorrências.</small></article>`;
    }
    const date = formatarHistoricoData(row.data_hora_inicio || row.criado_em);
    const summary = [obterRotuloTipoAtendimento(row.tipo_atendimento), obterRotuloProvidencia(row.providencia), row.local_abordagem || "Local não informado"].filter(Boolean).join(" · ");
    const reason = row.motivo ? String(row.motivo).trim().slice(0, 180) : "Motivo não informado";
    const id = String(row.id || "").replace(/[^a-fA-F0-9-]/g, "");
    const kind = options.isVeiculo ? "Registro de veículo" : "Registro de pessoa";
    return `<article class="approach-history-result"><div class="approach-history-result__top"><strong>${kind}</strong><time>${escapeHtmlAbordagem(date)}</time></div><p>${escapeHtmlAbordagem(summary)}</p><div class="approach-history-result__reason">${escapeHtmlAbordagem(reason)}</div>${id ? `<button type="button" class="approach-history-open" onclick="event.stopPropagation();window._consultaVerAbordagemDetalhe('${id}','${options.isVeiculo ? "veiculo" : "pessoa"}')">Abrir registro</button>` : ""}</article>`;
  }).join("");
  const title = items.length ? `<strong>${items.length} registro(s) localizado(s)</strong>` : `<strong>Nenhum registro localizado com esse identificador</strong>`;
  const notes = [
    options.nameFallback ? "Busca por nome exato: podem existir homônimos; confira o contexto antes de associar." : "A correspondência por placa/CPF/RG é um indício de registro relacionado, não uma conclusão sobre a pessoa ou veículo.",
    options.isVeiculo ? "A busca por placa cobre registros de Abordagem; os BOs atuais não armazenam placa em campo estruturado." : "Busca nos BOs limitada a correspondências por CPF, RG ou nome exato.",
    options.boUnavailable ? "Não foi possível consultar BOs agora; o histórico de Abordagens continua disponível." : "",
  ].filter(Boolean).map((note) => `<p class="approach-history-note">${escapeHtmlAbordagem(note)}</p>`).join("");
  panel.innerHTML = `<div class="approach-history-heading">${title}<span>Dados do app · até 12 resultados</span></div>${cards || `<p class="approach-history-empty">Nenhum registro encontrado nos dados consultados.</p>`}${notes}`;
}

async function buscarHistoricoAbordagem(appInstance) {
  const panel = document.getElementById("abordagemHistorico");
  const user = typeof authManager !== "undefined" ? authManager.getUser() : null;
  const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!panel) return;
  if (!user || !client) {
    panel.innerHTML = `<p class="approach-history-empty">Entre no app para consultar os registros.</p>`;
    return;
  }
  const isVeiculo = estado.tipoAbordagemAtual === "veiculo";
  let approachQuery;
  let boQuery = null;
  let nameFallback = false;
  if (isVeiculo) {
    const rawPlate = document.getElementById("formPlaca")?.value || "";
    const plate = normalizarPlacaAbordagem(rawPlate);
    if (plate.length !== 7) {
      panel.innerHTML = `<p class="approach-history-empty">Informe uma placa completa de 7 caracteres para pesquisar. Placas parciais não são tratadas como correspondência.</p>`;
      return;
    }
    const variants = [...new Set([plate, `${plate.slice(0, 3)}-${plate.slice(3)}`])];
    approachQuery = client.from("abordagens_veiculos")
      .select("id,placa,marca_modelo,cor,motivo,tipo_atendimento,providencia,local_abordagem,data_hora_inicio,criado_em,status_abordagem,esta_ativa")
      .in("placa", variants).eq("esta_ativa", true)
      .order("data_hora_inicio", { ascending: false }).limit(6);
  } else {
    const cpfRaw = document.getElementById("formCpf")?.value || "";
    const cpfDigits = cpfRaw.replace(/\D/g, "");
    const rgRaw = (document.getElementById("formRg")?.value || "").trim();
    const rgDigits = rgRaw.replace(/\D/g, "");
    const name = (document.getElementById("formNome")?.value || "").trim();
    let keyColumn, values;
    if (cpfDigits.length === 11) {
      keyColumn = "cpf";
      values = [...new Set([cpfDigits, aplicarMascaraCPFInterna(cpfDigits)])];
    } else if (rgRaw.length >= 5) {
      keyColumn = "rg";
      values = [...new Set([rgRaw, rgDigits].filter(Boolean))];
    } else if (name.length >= 3) {
      keyColumn = "nome";
      values = [name];
      nameFallback = true;
    } else {
      panel.innerHTML = `<p class="approach-history-empty">Informe CPF, RG ou nome completo (mínimo de 3 caracteres) para pesquisar.</p>`;
      return;
    }
    const cols = "id,nome,cpf,rg,motivo,tipo_atendimento,providencia,local_abordagem,data_hora_inicio,criado_em,status_abordagem,esta_ativa";
    approachQuery = keyColumn === "nome"
      ? client.from("abordagens_pessoas").select(cols).eq("nome", values[0]).eq("esta_ativa", true).order("data_hora_inicio", { ascending: false }).limit(6)
      : client.from("abordagens_pessoas").select(cols).in(keyColumn, values).eq("esta_ativa", true).order("data_hora_inicio", { ascending: false }).limit(6);
    const boCols = "id,tipo,ocorrencia_id,criado_em,ocorrencias!inner(id,numero_ocorrencia,tipo_ocorrencia,local_ocorrencia,data_hora_inicio,status,esta_ativa,deleted_at)";
    boQuery = keyColumn === "nome"
      ? client.from("envolvidos").select(boCols).eq("nome_completo", values[0]).order("criado_em", { ascending: false }).limit(6)
      : client.from("envolvidos").select(boCols).in(keyColumn, values).order("criado_em", { ascending: false }).limit(6);
  }
  panel.innerHTML = `<div class="approach-history-loading"><span class="spinner-azul"></span>Consultando registros anteriores…</div>`;
  try {
    const approachResult = await approachQuery;
    if (approachResult.error) throw approachResult.error;
    const approaches = approachResult.data || [];
    let boRecords = [];
    let boUnavailable = false;
    if (boQuery) {
      const boResult = await boQuery;
      if (boResult.error) {
        console.warn("Consulta de BO relacionada indisponível:", boResult.error);
        boUnavailable = true;
      } else {
        boRecords = (boResult.data || []).map((row) => {
          const raw = row.ocorrencias;
          const ocorrencia = Array.isArray(raw) ? raw[0] : raw;
          return { ...row, ocorrencia };
        }).filter((row) => row.ocorrencia && row.ocorrencia.deleted_at == null && row.ocorrencia.esta_ativa !== false);
      }
    }
    renderHistoricoAbordagem(approaches, boRecords, { isVeiculo, nameFallback, boUnavailable });
  } catch (error) {
    console.error("Erro ao consultar histórico da abordagem:", error);
    panel.innerHTML = `<p class="approach-history-empty">Não foi possível consultar o histórico agora. Tente novamente quando houver conexão.</p>`;
    if (appInstance?.showToast) appInstance.showToast("Falha ao consultar histórico", "warning");
  }
}

export async function salvarAbordagemComAnexos(appInstance) {
  const isVeiculo = estado.tipoAbordagemAtual === "veiculo";
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;

  if (!user) {
    appInstance.showToast("Usuário não autenticado", "error");
    return;
  }

  const identificacaoStatus = document.getElementById("formIdentificacaoStatus")?.value || "identificado";
  const identificador = isVeiculo
    ? document.getElementById("formPlaca")?.value?.toUpperCase()?.trim()
    : document.getElementById("formNome")?.value?.trim();
  const descricaoIdentificacao = document.getElementById("formDescricaoIdentificacao")?.value?.trim() || "";
  const tipoAtendimento = document.getElementById("formTipoAtendimento")?.value || "";
  const motivoAbordagem = document.getElementById("formMotivo")?.value?.trim() || "";
  const providencia = document.getElementById("formProvidencia")?.value || "";

  if (identificacaoStatus === "identificado" && !identificador) {
    appInstance.showToast(isVeiculo ? "Informe a placa ou altere a situação da identificação" : "Informe o nome ou altere a situação da identificação", "warning");
    return;
  }
  if (identificacaoStatus !== "identificado" && !descricaoIdentificacao) {
    appInstance.showToast("Descreva objetivamente o que foi possível observar para registrar a identificação parcial", "warning");
    return;
  }
  if (!tipoAtendimento) {
    appInstance.showToast("Selecione o tipo de atendimento", "warning");
    return;
  }
  if (!motivoAbordagem) {
    appInstance.showToast("Descreva o motivo objetivo do atendimento", "warning");
    document.getElementById("formMotivo")?.focus();
    return;
  }
  if (!providencia) {
    appInstance.showToast("Selecione a providência ou mantenha Atendimento em andamento", "warning");
    return;
  }

  // Validar data/hora início
  const dataHoraInicio = document.getElementById("formDataHoraInicio")?.value;
  if (!dataHoraInicio) {
    appInstance.showToast("Data/Hora Início é obrigatória", "warning");
    return;
  }

  appInstance.showToast("Processando...", "info");

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) throw new Error("Erro ao conectar ao servidor");

    // 🔥 ALTERADO: Removido limite de arquivos
    const files = estado.arquivosTemp || [];
    let anexosUrls = [];

    if (files.length > 0) {
      const anexosProcessados = await processarAnexosAbordagem(files);
      anexosUrls = await uploadAnexosAbordagem(anexosProcessados, isVeiculo);
    }

    let localizacao =
      typeof window.app !== "undefined"
        ? window.app.obterLocalizacaoAtual()
        : null;
    if (!localizacao) {
      localizacao = await obterLocalizacaoInterna();
    }

    const dataHoraFormatada = obterDataHoraLocalFormatada();

    // 🔥 NOVO: Preparar dados com data/hora
    const dados = {
      criado_por: user.id,
      local_abordagem: document.getElementById("formLocal")?.value || "",
      motivo: motivoAbordagem,
      tipo_atendimento: tipoAtendimento,
      providencia,
      identificacao_status: identificacaoStatus,
      descricao_identificacao: descricaoIdentificacao || null,
      observacoes:
        document.getElementById("formObservacoesAbordagem")?.value || "",
      fase: document.getElementById("formFase")?.value || "advertencia",
      anexos: anexosUrls,
      criado_em: dataHoraFormatada,
      atualizado_em: dataHoraFormatada,
      latitude: localizacao?.latitude || null,
      longitude: localizacao?.longitude || null,
      // 🔥 NOVO: Data/hora
      data_hora_inicio: dataHoraInicio,
      data_hora_encerramento:
        document.getElementById("formDataHoraEncerramento")?.value || null,
      data_hora_finalizacao: null, // Só será preenchido na finalização
      status_abordagem: "ativa",
    };

    const temPrazo = document.getElementById("formTemPrazo")?.checked || false;
    if (temPrazo) {
      dados.prazo = document.getElementById("formPrazo")?.value || null;
      dados.tem_prazo = true;
      dados.status_regularizacao = "pendente";
    }

    if (isVeiculo) {
      dados.placa = identificador || null;
      dados.marca_modelo =
        document.getElementById("formMarcaModelo")?.value || "";
      dados.cor = document.getElementById("formCor")?.value || "";
      dados.condutor_nome =
        document.getElementById("formCondutor")?.value || "";
      dados.condutor_cpf =
        document.getElementById("formCondutorCpf")?.value || "";
    } else {
      dados.nome = identificador || null;
      dados.alcunha = document.getElementById("formAlcunha")?.value || "";
      dados.cpf = document.getElementById("formCpf")?.value || "";
      dados.rg = document.getElementById("formRg")?.value || "";
      dados.caracteristicas_fisicas =
        document.getElementById("formCaracteristicas")?.value || "";
      dados.vestimentas =
        document.getElementById("formVestimentas")?.value || "";
    }

    const tabela = isVeiculo ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data, error } = await client.from(tabela).insert([dados]).select();

    if (error) throw error;

    estado.arquivosTemp = [];
    const previewArea = document.getElementById("abordagemPreviewArea");
    if (previewArea) previewArea.innerHTML = "";
    const fileInput = document.getElementById("abordagemFileInput");
    if (fileInput) fileInput.value = "";

    appInstance.showToast("Abordagem registrada com sucesso!", "success");

    const container = document.getElementById("consultaContainer");
    if (container) {
      await carregarAbordagens(container, appInstance);
      await carregarRankingReincidentes();
    }

    const buscaInput = document.getElementById("consultaBusca");
    if (buscaInput) buscaInput.value = "";

    fecharFormulario(container, appInstance);
  } catch (error) {
    console.error("Erro ao salvar abordagem:", error);
    appInstance.showToast("Erro ao salvar: " + error.message, "error");
  }
}

// ============================================
// 🔥 NOVO: FINALIZAR ABORDAGEM
// ============================================

/**
 * Finaliza uma abordagem (ativa → finalizada)
 * @param {string} id - ID da abordagem
 * @param {string} tipo - 'veiculo' ou 'pessoa'
 * @param {Object} appInstance - Instância do app
 */
export async function finalizarAbordagem(id, tipo, appInstance) {
  try {
    const confirmado = await appInstance.confirmar(
      "Deseja finalizar esta abordagem?",
      "Finalizar Abordagem",
    );

    if (!confirmado) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) throw new Error("Erro ao conectar");

    const tabela =
      tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";

    // Buscar a abordagem
    const { data: abordagem, error: buscaError } = await client
      .from(tabela)
      .select("*")
      .eq("id", id)
      .single();

    if (buscaError) throw buscaError;
    if (!abordagem) throw new Error("Abordagem não encontrada");

    // Verificar se já está finalizada
    if (abordagem.status_abordagem === "finalizada") {
      appInstance.showToast("Esta abordagem já está finalizada", "warning");
      return;
    }

    // Verificar se está cancelada
    if (abordagem.status_abordagem === "cancelada") {
      appInstance.showToast(
        "Abordagem cancelada não pode ser finalizada",
        "warning",
      );
      return;
    }

    // 🔥 NOVO: Data/hora de finalização

    const dataFinalizacao = globalThis.obterTimestampBrasilSemFuso();

    // Atualizar status e data de finalização
    const { data, error } = await client
      .from(tabela)
      .update({
        status_abordagem: "finalizada",
        data_hora_finalizacao: dataFinalizacao,
        atualizado_em: globalThis.obterTimestampBrasilSemFuso(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    appInstance.showToast("Abordagem finalizada com sucesso!", "success");

    // 🔥 NOVO: Registrar log pericial
    await registrarLogPericialAbordagem(
      "FINALIZAR_ABORDAGEM",
      tabela,
      id,
      abordagem,
      data,
    );

    // Recarregar lista
    const container = document.getElementById("consultaContainer");
    if (container) {
      await carregarAbordagens(container, appInstance);
    }
  } catch (error) {
    console.error("Erro ao finalizar abordagem:", error);
    appInstance.showToast("Erro ao finalizar: " + error.message, "error");
  }
}

function aplicarBuscaConsultaOperacional(queryVeiculos, queryPessoas, valor) {
  const busca = String(valor || "").trim();
  if (!busca) return { queryVeiculos, queryPessoas };
  const termoLike = busca
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '\\"');
  const ilike = (campo) => `${campo}.ilike."%${termoLike}%"`;
  queryVeiculos = queryVeiculos.or([
    ilike("placa"),
    ilike("condutor_nome"),
    ilike("marca_modelo"),
    ilike("motivo"),
    ilike("local_abordagem"),
  ].join(","));
  const digitos = busca.replace(/\D/g, "");
  const buscaDeDocumento = /^[-0-9.\s\/]+$/.test(busca) && digitos.length >= 5;
  if (buscaDeDocumento) {
    const candidatos = new Set([busca, digitos]);
    if (digitos.length === 11) {
      candidatos.add(`${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`);
    }
    const igualdade = [...candidatos].flatMap((identificador) => {
      const seguro = `"${identificador.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      return [`cpf.eq.${seguro}`, `rg.eq.${seguro}`];
    });
    queryPessoas = queryPessoas.or(igualdade.join(","));
  } else {
    queryPessoas = queryPessoas.or([
      ilike("nome"),
      ilike("alcunha"),
      ilike("motivo"),
      ilike("local_abordagem"),
    ].join(","));
  }
  return { queryVeiculos, queryPessoas };
}

// ============================================
// EXPORTAÇÃO PDF - LISTA DE ABORDAGENS
// ============================================

export async function exportarListaPDF(appInstance) {
  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarRelatorio !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    // Buscar todas as abordagens (não apenas as da página atual)
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    appInstance.showToast("Gerando PDF da lista de abordagens...", "info");

    const { dataInicio, dataFim, guarda, busca, tipoAtendimento, periodo } = estado.filtros;
    const aba = estado.abaAtiva;

    let queryVeiculos = client
      .from("abordagens_veiculos")
      .select("*, usuarios(nome_completo)");
    let queryPessoas = client
      .from("abordagens_pessoas")
      .select("*, usuarios(nome_completo)");

    if (dataInicio) {
      queryVeiculos = queryVeiculos.gte("criado_em", dataInicio);
      queryPessoas = queryPessoas.gte("criado_em", dataInicio);
    }
    if (dataFim) {
      const dataFimCompleta = periodo === "12h" ? dataFim : dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (tipoAtendimento) {
      queryVeiculos = queryVeiculos.eq("tipo_atendimento", tipoAtendimento);
      queryPessoas = queryPessoas.eq("tipo_atendimento", tipoAtendimento);
    }
    if (busca) {
      const consultas = aplicarBuscaConsultaOperacional(queryVeiculos, queryPessoas, busca);
      queryVeiculos = consultas.queryVeiculos;
      queryPessoas = consultas.queryPessoas;
    }

    if (aba === "veiculos") {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.limit(0);
    } else if (aba === "pessoas") {
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
      queryVeiculos = queryVeiculos.limit(0);
    } else {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
    }

    // Buscar todos os registros (sem limite de página)
    const [veiculosResult, pessoasResult] = await Promise.all([
      queryVeiculos,
      queryPessoas,
    ]);

    const veiculos = veiculosResult.data || [];
    const pessoas = pessoasResult.data || [];

    let todasAbordagens = [];

    if (aba === "veiculos") {
      todasAbordagens = veiculos.map((v) => ({
        ...v,
        tipo_abordagem: "veiculo",
      }));
    } else if (aba === "pessoas") {
      todasAbordagens = pessoas.map((p) => ({
        ...p,
        tipo_abordagem: "pessoa",
      }));
    } else {
      todasAbordagens = [
        ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
        ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
      ];
    }

    todasAbordagens.sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

    if (todasAbordagens.length === 0) {
      appInstance.showToast("Nenhuma abordagem para exportar", "warning");
      return;
    }

    // Preparar dados para o relatório
    const formatarDataFiltroPDF = (valor) => {
      const match = String(valor || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
    };
    const periodoRelatorio = dataInicio || dataFim
      ? `${dataInicio ? formatarDataFiltroPDF(dataInicio) : "Início aberto"} a ${dataFim ? formatarDataFiltroPDF(dataFim) : "sem data final"}`
      : "Todos os períodos";
    const dadosRelatorio = {
      veiculos: todasAbordagens.filter((a) => a.tipo_abordagem === "veiculo"),
      pessoas: todasAbordagens.filter((a) => a.tipo_abordagem === "pessoa"),
      dataInicio,
      dataFim,
      periodo: periodoRelatorio,
    };

    // Usar a função de exportação de relatório do pdfExport
    const result = await pdfExport.exportarRelatorio(
      "abordagens",
      dadosRelatorio,
      {
        title: `Relatório de Abordagens - ${estado.abaAtiva.charAt(0).toUpperCase() + estado.abaAtiva.slice(1)}`,
        reportType: aba === "veiculos" ? "abordagens-veiculos" : aba === "pessoas" ? "abordagens-pessoas" : "abordagens-geral",
        author: "Guarda Municipal de Pitangueiras - PR",
        subject: "Lista de abordagens operacionais",
        keywords: "Guarda Municipal, Abordagens, Veículos, Pessoas",
        watermark: {
          text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
          opacity: 0.08,
          fontSize: 32,
          color: "#000000",
          angle: 45,
        },
      },
    );

    if (result.success) {
      appInstance.showToast(
        `PDF gerado com ${todasAbordagens.length} abordagens!`,
        "success",
      );
    } else {
      appInstance.showToast("Erro ao gerar PDF: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao exportar lista PDF:", error);
    appInstance.showToast("Erro ao gerar PDF", "error");
  }
}

// ============================================
// EXPORTAÇÃO PDF - DETALHE DA ABORDAGEM
// ============================================

export async function exportarDetalhePDF(id, tipo, appInstance) {
  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarRelatorio !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    appInstance.showToast("Gerando PDF da abordagem...", "info");

    const tabela =
      tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data, error } = await client
      .from(tabela)
      .select("*, usuarios(nome_completo)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      appInstance.showToast("Abordagem não encontrada", "error");
      return;
    }

    // Criar uma ficha individual com o período visível no cabeçalho institucional.
    const isVeiculo = tipo === "veiculo";
    const dataReferencia = data.data_hora_inicio || data.criado_em;
    const dataReferenciaDate = dataReferencia ? new Date(dataReferencia) : null;
    const periodoRegistro = dataReferenciaDate && !Number.isNaN(dataReferenciaDate.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(dataReferenciaDate)
      : "Registro individual";
    const dadosRelatorio = {
      veiculos: isVeiculo ? [data] : [],
      pessoas: isVeiculo ? [] : [data],
      periodo: periodoRegistro,
    };

    const identificador = isVeiculo ? data.placa : data.nome;

    const result = await pdfExport.exportarRelatorio(
      "abordagens",
      dadosRelatorio,
      {
        title: `Abordagem ${isVeiculo ? "de Veículo" : "de Pessoa"} - ${identificador}`,
        reportType: isVeiculo ? "abordagem-detalhe-veiculo" : "abordagem-detalhe-pessoa",
        author: "Guarda Municipal de Pitangueiras - PR",
        subject: `Detalhes da abordagem ${isVeiculo ? "de veículo" : "de pessoa"}`,
        keywords: `Guarda Municipal, Abordagem, ${isVeiculo ? "Veículo" : "Pessoa"}, ${identificador}`,
        watermark: {
          text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
          opacity: 0.08,
          fontSize: 32,
          color: "#000000",
          angle: 45,
        },
      },
    );

    if (result.success) {
      appInstance.showToast("PDF gerado com sucesso!", "success");
    } else {
      appInstance.showToast("Erro ao gerar PDF: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao exportar detalhe PDF:", error);
    appInstance.showToast("Erro ao gerar PDF", "error");
  }
}

// ============================================
// FECHAR FORMULÁRIO COM CONFIRMAÇÃO
// ============================================

async function fecharFormularioComConfirmacao(container, appInstance) {
  const temDados = verificarCamposPreenchidos();

  if (temDados) {
    const confirmado = await confirmarModal(
      "Você tem dados não salvos. Deseja descartar as alterações?",
      "Descartar Alterações",
    );

    if (!confirmado) {
      return;
    }
  }

  fecharFormulario(container, appInstance);
}

function fecharFormulario(container, appInstance) {
  estado.arquivosTemp = [];
  estado.tipoAbordagemAtual = null;
  estado.formularioAberto = false;

  if (container) {
    carregarAbordagens(container, appInstance);
  } else {
    const containerEl = document.getElementById("consultaContainer");
    if (containerEl) {
      carregarAbordagens(containerEl, appInstance);
    }
  }
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================

function confirmarModal(mensagem, titulo = "Confirmar") {
  return new Promise((resolve) => {
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
      <div class="modal" style="max-width:400px;width:100%;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-question-circle" style="margin-right:8px;color:var(--aviso);"></i>
            ${titulo}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;">
          <p style="font-size:15px;color:var(--cinza-escuro);margin:0;text-align:center;line-height:1.6;">${mensagem}</p>
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:row;gap:10px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Continuar Editando
          </button>
          <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(true);" 
            style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--erro);color:var(--branco);">
            <i class="fas fa-trash" style="margin-right:6px;"></i> Descartar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    window._confirmModalResolve = resolve;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

// ============================================
// ABAS
// ============================================

function mudarAba(aba, container, appInstance) {
  estado.abaAtiva = aba;
  estado.pagina = 0;
  estado.temMais = true;

  const tabs = [
    ["tabTodos", "todos"],
    ["tabVeiculos", "veiculos"],
    ["tabPessoas", "pessoas"],
  ];
  tabs.forEach(([id, value]) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    const ativo = aba === value;
    tab.classList.toggle("active", ativo);
    tab.setAttribute("aria-selected", String(ativo));
  });
  carregarAbordagens(container, appInstance);
}

// ============================================
// PERÍODO
// ============================================

function definirPeriodoPadrao() {
  const agora = new Date();
  const dozeHoras = new Date(agora);
  dozeHoras.setHours(dozeHoras.getHours() - 12);
  estado.filtros.periodo = "12h";
  estado.filtros.dataInicio = globalThis.obterTimestampBrasilSemFuso(dozeHoras);
  estado.filtros.dataFim = globalThis.obterTimestampBrasilSemFuso(agora);
}
function consultaPeriodoChange() {
  const periodo = document.getElementById("consultaPeriodo")?.value || "12h";
  const agora = new Date();
  let dataInicio = "";
  let dataFim = formatarDataLocalISO(agora);
  if (periodo === "personalizado") {
    const filtrosAvancados = document.getElementById("consultaFiltrosAvancados");
    if (filtrosAvancados) filtrosAvancados.open = true;
    const datas = document.getElementById("consultaDatasPersonalizadas");
    if (datas) datas.style.display = "grid";
    return;
  }
  switch (periodo) {
    case "12h": {
      const limite = new Date(agora);
      limite.setHours(limite.getHours() - 12);
      dataInicio = globalThis.obterTimestampBrasilSemFuso(limite);
      dataFim = globalThis.obterTimestampBrasilSemFuso(agora);
      break;
    }
    case "hoje":
      dataInicio = dataFim;
      break;
    case "semana": {
      const limite = new Date(agora);
      limite.setDate(limite.getDate() - 7);
      dataInicio = formatarDataLocalISO(limite);
      break;
    }
    case "mes": {
      const limite = new Date(agora);
      limite.setDate(limite.getDate() - 30);
      dataInicio = formatarDataLocalISO(limite);
      break;
    }
    default:
      dataInicio = estado.filtros.dataInicio || "";
      dataFim = estado.filtros.dataFim || "";
  }
  estado.filtros.periodo = periodo;
  estado.filtros.dataInicio = dataInicio;
  estado.filtros.dataFim = dataFim;
  estado.filtros.guarda = document.getElementById("consultaGuarda")?.value || "";
  estado.filtros.tipoAtendimento = document.getElementById("consultaTipoAtendimento")?.value || "";
  estado.filtros.busca = document.getElementById("consultaBusca")?.value?.trim() || "";
  const datas = document.getElementById("consultaDatasPersonalizadas");
  if (datas) datas.style.display = "none";
  const inicioInput = document.getElementById("consultaDataInicio");
  const fimInput = document.getElementById("consultaDataFim");
  if (inicioInput) inicioInput.value = dataInicio.slice(0, 10);
  if (fimInput) fimInput.value = dataFim.slice(0, 10);
  estado.pagina = 0;
  estado.temMais = true;
  const area = document.getElementById("consultaResultadosArea");
  if (area) carregarAbordagens(area.closest(".container") || area, window._consultaApp);
}
// ============================================
// LISTA DE GUARDAS
// ============================================

async function carregarListaGuardas() {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;
    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo")
      .eq("status", "ativo")
      .order("nome_completo");
    if (error) throw error;
    estado.listaGuardas = data || [];
  } catch (error) {
    console.error("Erro ao carregar lista de guardas:", error);
    estado.listaGuardas = [];
  }
}

// ============================================
// RANKING DE REINCIDENTES
// ============================================

async function carregarRankingReincidentes() {
  try {
    estado.carregandoRanking = true;
    const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;
    const [veiculosResult, pessoasResult] = await Promise.all([
      client.from("abordagens_veiculos").select("placa").eq("esta_ativa", true).limit(1000),
      client.from("abordagens_pessoas").select("cpf,rg").eq("esta_ativa", true).limit(1000),
    ]);
    if (veiculosResult.error) throw veiculosResult.error;
    if (pessoasResult.error) throw pessoasResult.error;
    const counts = new Map();
    for (const row of veiculosResult.data || []) {
      const key = normalizarPlacaAbordagem(row.placa);
      if (key.length === 7) counts.set(`veiculo:${key}`, (counts.get(`veiculo:${key}`) || 0) + 1);
    }
    for (const row of pessoasResult.data || []) {
      const cpf = String(row.cpf || "").replace(/\D/g, "");
      const rg = String(row.rg || "").trim().toUpperCase();
      const key = cpf.length === 11 ? `cpf:${cpf}` : rg.length >= 5 ? `rg:${rg}` : "";
      if (key) counts.set(`pessoa:${key}`, (counts.get(`pessoa:${key}`) || 0) + 1);
    }
    const ranking = [...counts.entries()].filter(([, total]) => total > 1).map(([key, total]) => {
      if (key.startsWith("veiculo:")) return { identificador: key.slice(8), tipo: "veículo", total };
      const identifier = key.slice(7);
      const [kind, value] = identifier.split(":", 2);
      return { identificador: `Pessoa · ${kind.toUpperCase()} final ${value.slice(-4)}`, tipo: "pessoa", total };
    });
    ranking.sort((a, b) => a.tipo.localeCompare(b.tipo, "pt-BR") || a.identificador.localeCompare(b.identificador, "pt-BR"));
    estado.rankingReincidentes = ranking.slice(0, 10);
    renderizarRanking(estado.rankingReincidentes);
  } catch (error) {
    console.error("Erro ao carregar resumo de correspondências:", error);
  } finally {
    estado.carregandoRanking = false;
  }
}

function renderizarRanking(ranking) {
  const lista = document.getElementById("rankingLista");
  if (!lista) return;
  if (!ranking.length) {
    lista.innerHTML = `<div class="consulta-repeat-empty">Nenhuma correspondência exata encontrada no conjunto consultado.</div>`;
    return;
  }
  lista.innerHTML = ranking.slice(0, 10).map((item) => `
    <div class="consulta-repeat-row">
      <span><strong>${item.identificador}</strong><small>${item.tipo === "veículo" ? "Placa" : "Documento parcialmente mascarado"}</small></span>
      <span class="consulta-repeat-count">${item.total} registros</span>
    </div>
  `).join("");
}function verRankingCompleto(appInstance) {
  const ranking = estado.rankingReincidentes;
  if (ranking.length === 0) {
    appInstance.showToast("Nenhum identificador com registros repetidos", "info");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
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
    <div class="modal" style="max-width:400px;width:100%;max-height:80vh;overflow-y:auto;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-link" style="color:#5c7d95;margin-right:8px;"></i>
          Resumo de correspondências exatas
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        ${ranking
          .map(
            (item) => `
          <div class="consulta-repeat-row consulta-repeat-modal-row">
            <span><strong>${item.identificador}</strong><small>${item.tipo === "veículo" ? "Placa" : "Documento parcialmente mascarado"}</small></span>
            <span class="consulta-repeat-count">${item.total} registros</span>
          </div>
        `,
          )
          .join("")}
        <p class="consulta-repeat-note">Correspondências exatas em registros ativos; este resumo não classifica pessoas ou veículos nem indica risco ou autoria.</p>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Fechar
        </button>
      </div>
    </div>
    `;

  document.body.appendChild(overlay);
}

// ============================================
// ABORDAGENS - CARREGAR
// ============================================

async function carregarAbordagens(container, appInstance) {
  const area = document.getElementById("consultaResultadosArea");
  const totalSpan = document.getElementById("consultaTotalRegistros");
  if (!area) return;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      area.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao conectar ao servidor</p>`;
      return;
    }

    const { dataInicio, dataFim, guarda, busca, tipoAtendimento, periodo } = estado.filtros;
    const aba = estado.abaAtiva;

    let queryVeiculos = client
      .from("abordagens_veiculos")
      .select("*, usuarios(nome_completo)");
    let queryPessoas = client
      .from("abordagens_pessoas")
      .select("*, usuarios(nome_completo)");

    if (dataInicio) {
      queryVeiculos = queryVeiculos.gte("criado_em", dataInicio);
      queryPessoas = queryPessoas.gte("criado_em", dataInicio);
    }
    if (dataFim) {
      const dataFimCompleta = periodo === "12h" ? dataFim : dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (tipoAtendimento) {
      queryVeiculos = queryVeiculos.eq("tipo_atendimento", tipoAtendimento);
      queryPessoas = queryPessoas.eq("tipo_atendimento", tipoAtendimento);
    }
    if (busca) {
      const consultas = aplicarBuscaConsultaOperacional(queryVeiculos, queryPessoas, busca);
      queryVeiculos = consultas.queryVeiculos;
      queryPessoas = consultas.queryPessoas;
    }

    if (aba === "veiculos") {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.limit(0);
    } else if (aba === "pessoas") {
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
      queryVeiculos = queryVeiculos.limit(0);
    } else {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
    }

    const limit = estado.paginaSize;
    const offset = estado.pagina * estado.paginaSize;
    queryVeiculos = queryVeiculos.range(offset, offset + limit - 1);
    queryPessoas = queryPessoas.range(offset, offset + limit - 1);

    const [veiculosResult, pessoasResult] = await Promise.all([
      queryVeiculos,
      queryPessoas,
    ]);

    const veiculos = veiculosResult.data || [];
    const pessoas = pessoasResult.data || [];

    let todasAbordagens = [];

    if (aba === "veiculos") {
      todasAbordagens = veiculos.map((v) => ({
        ...v,
        tipo_abordagem: "veiculo",
      }));
    } else if (aba === "pessoas") {
      todasAbordagens = pessoas.map((p) => ({
        ...p,
        tipo_abordagem: "pessoa",
      }));
    } else {
      todasAbordagens = [
        ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
        ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
      ];
    }

    todasAbordagens.sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

    estado.totalRegistros = todasAbordagens.length;
    if (totalSpan) {
      totalSpan.textContent = `${estado.totalRegistros} carregados`;
    }

    if (todasAbordagens.length === 0) {
      area.innerHTML = `
                <div class="consulta-results-heading"><div><span class="consulta-eyebrow">HISTÓRICO</span><h3>Resultados da consulta</h3><p>Mais recentes primeiro · <span id="consultaTotalRegistros">0 carregados</span></p></div></div>
        <p class="consulta-results-note">Os registros representam atendimentos documentados. Uma correspondência de identificador não prova reincidência, autoria ou risco.</p>
        <div style="text-align:center;padding:30px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
          <div style="font-size:36px;color:var(--cinza-claro);margin-bottom:8px;">
            <i class="fas fa-search"></i>
          </div>
          <p style="font-size:14px;color:var(--cinza-medio);">Nenhum registro encontrado com estes filtros</p><p style="font-size:12px;color:var(--cinza-medio);">Tente ampliar o período, alterar o tipo ou limpar a busca.</p>
          
        </div>
      `;
      estado.temMais = false;
      return;
    }

    area.innerHTML = `
              <div class="consulta-results-heading"><div><span class="consulta-eyebrow">HISTÓRICO</span><h3>Resultados da consulta</h3><p>Mais recentes primeiro · <span id="consultaTotalRegistros">${estado.totalRegistros} carregados</span></p></div></div>
        <p class="consulta-results-note">Os registros representam atendimentos documentados. Uma correspondência de identificador não prova reincidência, autoria ou risco.</p>
      <div id="consultaListaAbordagens">
        ${renderAbordagensCards(todasAbordagens, appInstance)}
      </div>
      <div id="consultaLoaderMais" style="display:${estado.temMais ? "block" : "none"};text-align:center;padding:20px;">
        <div class="spinner-azul" style="margin:0 auto;width:24px;height:24px;border-width:2px;"></div>
        <p style="margin-top:8px;color:var(--cinza-medio);font-size:12px;">Carregando mais...</p>
      </div>
    `;

    estado.temMais = todasAbordagens.length >= estado.paginaSize;
  } catch (error) {
    console.error("Erro ao carregar abordagens:", error);
    area.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao carregar: ${error.message}</p>`;
  }
}

// ============================================
// 🔥 ALTERADO: RENDERIZAÇÃO DOS CARDS (COM RETIFICAÇÃO, DATA/HORA E CORES DOS BOTÕES)
// ============================================

function renderAbordagensCards(abordagens, appInstance) {
  if (!abordagens || abordagens.length === 0) {
    return `
      <div style="text-align:center;padding:30px;color:var(--cinza-medio);">
        <i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3;"></i>
        <p>Nenhuma abordagem encontrada</p>
      </div>
    `;
  }

  return abordagens
    .map((ab) => {
      const isVeiculo = ab.tipo_abordagem === "veiculo";
      const data = new Date(ab.criado_em).toLocaleString("pt-BR", {
        timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const guardaNome = ab.usuarios?.nome_completo || "Desconhecido";

      // 🔥 NOVO: Data/hora início e encerramento
      const dataInicio = ab.data_hora_inicio
        ? formatarDataHoraLocal(ab.data_hora_inicio)
        : "Não informado";
      const dataEncerramento = ab.data_hora_encerramento
        ? formatarDataHoraLocal(ab.data_hora_encerramento)
        : "Não encerrado";
      const dataFinalizacao = ab.data_hora_finalizacao
        ? formatarDataHoraLocal(ab.data_hora_finalizacao)
        : null;

      // 🔥 NOVO: Status da abordagem
      const statusAbordagem = ab.status_abordagem || "ativa";
      const statusMeta =
        {
          ativa: { label: "Ativa", tone: "active", icon: "fa-play" },
          encerrada: { label: "Encerrada", tone: "ended", icon: "fa-check" },
          finalizada: { label: "Finalizada", tone: "finished", icon: "fa-check-double" },
          cancelada: { label: "Cancelada", tone: "cancelled", icon: "fa-ban" },
        }[statusAbordagem] || { label: "Ativa", tone: "active", icon: "fa-play" };

      let faseLabel = "Primeira orientação";
      let faseClass = "badge-primeira";
      if (
        ab.fase === "advertencia" &&
        ab.reincidencia_count >= REINCIDENCIA_LIMITE_ADVERTENCIA
      ) {
        faseLabel = "Advertência";
        faseClass = "badge-pending";
      } else if (
        ab.fase === "multa" ||
        ab.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA
      ) {
        faseLabel = "Multa";
        faseClass = "badge-cancelled";
      } else if (ab.fase === "advertencia") {
        faseLabel = "Advertência";
        faseClass = "badge-pending";
      }
      const faseTone =
        faseClass === "badge-pending"
          ? "warning"
          : faseClass === "badge-cancelled"
            ? "danger"
            : "orientation";

      // 🔥 NOVO: Status de retificação
      const statusRetificacao = ab.status_retificacao || "none";
      let badgeRetificacao = "";
      if (statusRetificacao === "pending_rectification") {
        badgeRetificacao = `<span class="consulta-approach-retification is-pending"><i class="fas fa-rotate" aria-hidden="true"></i>Retificação pendente</span>`;
      } else if (statusRetificacao === "rectified") {
        badgeRetificacao = `<span class="consulta-approach-retification is-done"><i class="fas fa-check" aria-hidden="true"></i>Retificada</span>`;
      } else if (statusRetificacao === "rectification_rejected") {
        badgeRetificacao = `<span class="consulta-approach-retification is-rejected"><i class="fas fa-xmark" aria-hidden="true"></i>Retificação rejeitada</span>`;
      }

      let identificador = "";
      let detalhes = "";
      let badgeTipo = "";
      let infoExtra = "";

      if (isVeiculo) {
        identificador = ab.placa || (ab.identificacao_status === "nao_identificado" ? "Veículo sem placa identificada" : "Placa não informada");
        detalhes = ab.marca_modelo || "";
        if (ab.cor) detalhes += ` (${ab.cor})`;
        badgeTipo = "VEÍCULO";
        infoExtra = ab.condutor_nome ? `Condutor: ${ab.condutor_nome}` : "";
      } else {
        identificador = ab.nome || (ab.identificacao_status === "nao_identificado" ? "Pessoa não identificada" : "Nome não informado");
        const alcunha = ab.alcunha ? `(${ab.alcunha})` : "";
        const cpf = ab.cpf ? `CPF: ${ab.cpf}` : "";
        const rg = ab.rg ? `RG: ${ab.rg}` : "";
        detalhes = [alcunha, cpf, rg].filter(Boolean).join(" ");
        badgeTipo = "PESSOA";
        infoExtra = detalhes || ab.descricao_identificacao || "";
      }

      let totalAnexos = 0;
      if (ab.anexos && Array.isArray(ab.anexos)) {
        totalAnexos = ab.anexos.length;
      }

      let resumoMotivo = "";
      if (ab.motivo) {
        const palavras = ab.motivo.split(" ");
        resumoMotivo = palavras.slice(0, 10).join(" ");
        if (palavras.length > 10) resumoMotivo += "...";
      }

      // Extrair imagens dos anexos
      let imagens = [];
      let primeiroAnexo = null;
      if (ab.anexos && Array.isArray(ab.anexos) && ab.anexos.length > 0) {
        imagens = ab.anexos.filter(
          (a) => a.tipo === "image" || a.tipo_arquivo === "image",
        );
        if (imagens.length > 0) {
          primeiroAnexo = imagens[0].url_thumb || imagens[0].url;
        }
      }

      // Criar string JSON segura das imagens
      let imagensJSON = "[]";
      try {
        if (imagens.length > 0) {
          imagensJSON = JSON.stringify(imagens);
        }
      } catch (e) {
        imagensJSON = "[]";
      }

      // 🔥 NOVO: Verificar se pode solicitar retificação
      const user = authManager.getUser();
      const isSupervisor = authManager.isSupervisor();
      const podeSolicitarRetificacao =
        (statusAbordagem === "finalizada" || statusAbordagem === "encerrada") &&
        statusRetificacao !== "pending_rectification" &&
        (isSupervisor || ab.criado_por === user?.id);

      // 🔥 NOVO: Verificar se pode finalizar (apenas se estiver ativa)
      const podeFinalizar = statusAbordagem === "ativa";

      const tipoCard = isVeiculo ? "vehicle" : "person";
      const tipoIcone = isVeiculo ? "fa-car-side" : "fa-user";
      const tipoAcao = isVeiculo ? "veiculo" : "pessoa";
      const idSeguro = String(ab.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const subtituloIdentificacao = isVeiculo
        ? [detalhes, infoExtra].filter(Boolean).join(" · ")
        : detalhes || ab.descricao_identificacao || "";
      const identificacaoStatus =
        ab.identificacao_status && ab.identificacao_status !== "identificado"
          ? `<span class="consulta-approach-identification"><i class="fas fa-circle-info" aria-hidden="true"></i>${escapeHtmlAbordagem(obterRotuloIdentificacao(ab.identificacao_status))}</span>`
          : "";
      const classeIdentificador = isVeiculo
        ? ab.placa
          ? "is-plate"
          : "is-vehicle-generic"
        : ab.identificacao_status === "nao_identificado"
          ? "is-unidentified"
          : "is-person";

      return `
        <article class="abordagem-card consulta-approach-card consulta-approach-card--${tipoCard} consulta-approach-card--compact">
          <header class="consulta-approach-card__header">
            <div class="consulta-approach-card__compact-topline">
              <div class="consulta-approach-card__compact-markers">
                <span class="consulta-approach-card__type"><i class="fas ${tipoIcone}" aria-hidden="true"></i>${badgeTipo}</span>
                <span class="consulta-approach-status is-${statusMeta.tone}"><i class="fas ${statusMeta.icon}" aria-hidden="true"></i>${statusMeta.label}</span>
              </div>
              <time class="consulta-approach-card__registered" aria-label="Data e hora do registro">${escapeHtmlAbordagem(data)}</time>
            </div>
            <div class="consulta-approach-card__compact-heading">
              <div class="consulta-approach-card__identity">
                <h4 class="consulta-approach-card__primary-id ${classeIdentificador}">${escapeHtmlAbordagem(identificador)}</h4>
                ${subtituloIdentificacao ? `<p class="consulta-approach-card__subtitle">${escapeHtmlAbordagem(subtituloIdentificacao)}</p>` : ""}
                ${identificacaoStatus}
                <div class="consulta-approach-card__badges">
                  <span class="consulta-approach-phase is-${faseTone}"><i class="fas fa-layer-group" aria-hidden="true"></i>${escapeHtmlAbordagem(faseLabel)}</span>
                  ${badgeRetificacao}
                </div>
              </div>
              ${primeiroAnexo ? `
                <div class="consulta-approach-card__photo-panel">
                  <button type="button" class="consulta-approach-card__photo-feature" aria-label="Abrir fotos anexadas" title="Abrir fotos anexadas" onclick="event.stopPropagation();window._consultaAbrirCarrossel(${escapeHtmlAbordagem(imagensJSON)},0)">
                    <img src="${escapeHtmlAbordagem(primeiroAnexo)}" alt="Foto anexada à abordagem" loading="lazy">
                    ${imagens.length > 1 ? `<span class="consulta-approach-card__photo-more">+${imagens.length - 1}</span>` : ""}
                  </button>
                  <span class="consulta-approach-card__attachment-count"><i class="fas fa-paperclip" aria-hidden="true"></i>${totalAnexos} ${totalAnexos === 1 ? "anexo" : "anexos"}</span>
                </div>
              ` : totalAnexos > 0 ? `
                <span class="consulta-approach-card__attachment-only"><i class="fas fa-paperclip" aria-hidden="true"></i>${totalAnexos} ${totalAnexos === 1 ? "anexo" : "anexos"}</span>
              ` : ""}
            </div>
          </header>

          <div class="consulta-approach-card__compact-meta">
            <span class="consulta-approach-card__compact-location" title="${escapeHtmlAbordagem(ab.local_abordagem || "Local não informado")}"><i class="fas fa-location-dot" aria-hidden="true"></i><span>${escapeHtmlAbordagem(ab.local_abordagem || "Local não informado")}</span></span>
            <span class="consulta-approach-card__compact-guard" title="${escapeHtmlAbordagem(guardaNome)}"><i class="fas fa-user-shield" aria-hidden="true"></i><span>${escapeHtmlAbordagem(guardaNome)}</span></span>
          </div>

          <div class="consulta-approach-card__compact-times">
            <span><b>Início</b><time>${escapeHtmlAbordagem(dataInicio)}</time></span>
            <span><b>Enc.</b><time>${escapeHtmlAbordagem(dataEncerramento)}</time></span>
            ${dataFinalizacao ? `<span><b>Fin.</b><time>${escapeHtmlAbordagem(dataFinalizacao)}</time></span>` : ""}
          </div>

          ${ab.tipo_atendimento || ab.providencia ? `
            <div class="consulta-approach-card__compact-classification" aria-label="Atendimento e providência">
              <i class="fas fa-clipboard-check" aria-hidden="true"></i>
              <div class="consulta-approach-card__tags">
                ${ab.tipo_atendimento ? `<span>${escapeHtmlAbordagem(obterRotuloTipoAtendimento(ab.tipo_atendimento))}</span>` : ""}
                ${ab.providencia ? `<span>${escapeHtmlAbordagem(obterRotuloProvidencia(ab.providencia))}</span>` : ""}
              </div>
            </div>
          ` : ""}

          ${resumoMotivo ? `
            <section class="consulta-approach-card__compact-reason" aria-label="Motivo da abordagem">
              <span><i class="fas fa-comment-dots" aria-hidden="true"></i>Motivo</span>
              <p>${escapeHtmlAbordagem(resumoMotivo)}</p>
            </section>
          ` : ""}

          <div class="consulta-approach-card__actions">
            <button type="button" class="consulta-approach-action is-details" aria-label="Ver detalhes da abordagem" onclick="event.stopPropagation();window._consultaVerAbordagemDetalhe('${idSeguro}','${tipoAcao}')">
              <i class="fas fa-eye" aria-hidden="true"></i><span>Detalhes</span>
            </button>
            ${podeFinalizar ? `
              <button type="button" class="consulta-approach-action is-finish" aria-label="Finalizar abordagem" onclick="event.stopPropagation();window._consultaFinalizarAbordagem('${idSeguro}','${tipoAcao}')">
                <i class="fas fa-check" aria-hidden="true"></i><span>Finalizar</span>
              </button>
            ` : ""}
            ${podeSolicitarRetificacao ? `
              <button type="button" class="consulta-approach-action is-rectify" aria-label="Solicitar retificação" onclick="event.stopPropagation();window._consultaSolicitarRetificacao('${idSeguro}','${tipoAcao}')">
                <i class="fas fa-rotate" aria-hidden="true"></i><span>Retificar</span>
              </button>
            ` : ""}
            <button type="button" class="consulta-approach-action is-pdf" aria-label="Exportar ficha da abordagem em PDF" onclick="event.stopPropagation();window._consultaExportarDetalhePDF('${idSeguro}','${tipoAcao}')">
              <i class="fas fa-file-pdf" aria-hidden="true"></i><span>PDF</span>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

// ============================================
// CARREGAR MAIS ABORDAGENS (INFINITE SCROLL)
// ============================================

async function carregarMaisAbordagens(container, appInstance) {
  if (estado.carregandoMais || !estado.temMais) return;

  estado.carregandoMais = true;
  estado.pagina++;

  const loaderMais = document.getElementById("consultaLoaderMais");
  if (loaderMais) loaderMais.style.display = "block";

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.carregandoMais = false;
      return;
    }

    const { dataInicio, dataFim, guarda, busca, tipoAtendimento, periodo } = estado.filtros;
    const aba = estado.abaAtiva;

    let queryVeiculos = client
      .from("abordagens_veiculos")
      .select("*, usuarios(nome_completo)");
    let queryPessoas = client
      .from("abordagens_pessoas")
      .select("*, usuarios(nome_completo)");

    if (dataInicio) {
      queryVeiculos = queryVeiculos.gte("criado_em", dataInicio);
      queryPessoas = queryPessoas.gte("criado_em", dataInicio);
    }
    if (dataFim) {
      const dataFimCompleta = periodo === "12h" ? dataFim : dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (tipoAtendimento) {
      queryVeiculos = queryVeiculos.eq("tipo_atendimento", tipoAtendimento);
      queryPessoas = queryPessoas.eq("tipo_atendimento", tipoAtendimento);
    }
    if (busca) {
      const consultas = aplicarBuscaConsultaOperacional(queryVeiculos, queryPessoas, busca);
      queryVeiculos = consultas.queryVeiculos;
      queryPessoas = consultas.queryPessoas;
    }

    if (aba === "veiculos") {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.limit(0);
    } else if (aba === "pessoas") {
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
      queryVeiculos = queryVeiculos.limit(0);
    } else {
      queryVeiculos = queryVeiculos.order("criado_em", { ascending: false });
      queryPessoas = queryPessoas.order("criado_em", { ascending: false });
    }

    const limit = estado.paginaSize;
    const offset = estado.pagina * estado.paginaSize;
    queryVeiculos = queryVeiculos.range(offset, offset + limit - 1);
    queryPessoas = queryPessoas.range(offset, offset + limit - 1);

    const [veiculosResult, pessoasResult] = await Promise.all([
      queryVeiculos,
      queryPessoas,
    ]);

    const veiculos = veiculosResult.data || [];
    const pessoas = pessoasResult.data || [];

    let novasAbordagens = [];

    if (aba === "veiculos") {
      novasAbordagens = veiculos.map((v) => ({
        ...v,
        tipo_abordagem: "veiculo",
      }));
    } else if (aba === "pessoas") {
      novasAbordagens = pessoas.map((p) => ({
        ...p,
        tipo_abordagem: "pessoa",
      }));
    } else {
      novasAbordagens = [
        ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
        ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
      ];
    }

    novasAbordagens.sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

    if (novasAbordagens.length === 0) {
      estado.temMais = false;
      if (loaderMais) {
        loaderMais.innerHTML = `
          <p style="color:var(--cinza-medio);font-size:12px;padding:8px;">
            <i class="fas fa-check-circle" style="color:var(--verde-bandeira);"></i>
            Você chegou ao fim
          </p>
        `;
      }
      estado.carregandoMais = false;
      return;
    }

    const area = document.getElementById("consultaListaAbordagens");
    if (area) {
      const novosCards = renderAbordagensCards(novasAbordagens, appInstance);
      area.insertAdjacentHTML("beforeend", novosCards);
    }

    estado.totalRegistros += novasAbordagens.length;
    const totalSpan = document.getElementById("consultaTotalRegistros");
    if (totalSpan) {
      totalSpan.textContent = `${estado.totalRegistros} carregados`;
    }

    estado.temMais = novasAbordagens.length >= estado.paginaSize;
    if (loaderMais) {
      loaderMais.style.display = estado.temMais ? "block" : "none";
    }
  } catch (error) {
    console.error("Erro ao carregar mais abordagens:", error);
  } finally {
    estado.carregandoMais = false;
  }
}

function configurarScrollInfinito(container, appInstance) {
  const loaderMais = document.getElementById("consultaLoaderMais");
  if (!loaderMais) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const target = entries[0];
      if (target.isIntersecting && !estado.carregandoMais && estado.temMais) {
        carregarMaisAbordagens(container, appInstance);
      }
    },
    { rootMargin: "100px", threshold: 0.1 },
  );

  observer.observe(loaderMais);
  estado.scrollObserver = observer;
}

// ============================================
// FILTROS
// ============================================

function aplicarFiltrosConsulta(container, appInstance) {
  const periodo = document.getElementById("consultaPeriodo")?.value || "12h";
  const guarda = document.getElementById("consultaGuarda")?.value || "";
  const busca = document.getElementById("consultaBusca")?.value || "";
  const dataInicio = document.getElementById("consultaDataInicio")?.value || "";
  const dataFim = document.getElementById("consultaDataFim")?.value || "";

  if (periodo === "personalizado") {
    if (dataInicio && dataFim && dataFim < dataInicio) {
      appInstance.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
      return;
    }
    estado.filtros.dataInicio = dataInicio;
    estado.filtros.dataFim = dataFim;
  }

  estado.filtros.periodo = periodo;
  estado.filtros.guarda = guarda;
  estado.filtros.busca = busca.trim();
  estado.filtros.tipoAtendimento = document.getElementById("consultaTipoAtendimento")?.value || "";
  estado.pagina = 0;
  estado.temMais = true;

  carregarAbordagens(container, appInstance);
  carregarRankingReincidentes();

  appInstance.showToast("Filtros aplicados", "success");
}

function executarBuscaConsulta(container, appInstance) {
  const busca = document.getElementById("consultaBusca")?.value || "";
  estado.filtros.busca = busca.trim();
  estado.filtros.tipoAtendimento = document.getElementById("consultaTipoAtendimento")?.value || "";
  estado.pagina = 0;
  estado.temMais = true;
  carregarAbordagens(container, appInstance);
}
function limparBuscaConsulta(container, appInstance) {
  if (estado.timeoutBusca) clearTimeout(estado.timeoutBusca);
  const campo = document.getElementById("consultaBusca");
  if (campo) {
    campo.value = "";
    campo.focus();
  }
  estado.filtros.busca = "";
  estado.pagina = 0;
  estado.temMais = true;
  carregarAbordagens(container, appInstance);
}
function buscaAutomatica(termo, container, appInstance) {
  if (estado.timeoutBusca) clearTimeout(estado.timeoutBusca);
  const busca = String(termo || "").trim();
  if (busca.length >= 2 || busca.length === 0) {
    estado.timeoutBusca = setTimeout(() => {
      executarBuscaConsulta(container, appInstance);
    }, busca.length === 0 ? 250 : 500);
  }
}
// ============================================
// RECONHECIMENTO DE PLACA
// ============================================

export async function reconhecerPlacaPorFoto(appInstance) {
  try {
    if (typeof Tesseract === "undefined") {
      appInstance.showToast(
        "Carregando biblioteca de reconhecimento...",
        "info",
      );
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => {
        script.onload = resolve;
        script.onerror = resolve;
        setTimeout(resolve, 5000);
      });
      if (typeof Tesseract === "undefined") {
        appInstance.showToast(
          "Erro ao carregar biblioteca de reconhecimento",
          "error",
        );
        return;
      }
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      appInstance.showToast("Reconhecendo placa...", "info");

      try {
        const imageUrl = URL.createObjectURL(file);
        const result = await Tesseract.recognize(imageUrl, "por", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              console.log("Reconhecendo:", m.progress);
            }
          },
        });

        const text = result.data.text || "";
        console.log("Texto reconhecido:", text);

        const placaRegex = /[A-Z]{3}[0-9][A-Z]{2}[0-9]/g;
        const matches = text.match(placaRegex);

        if (matches && matches.length > 0) {
          const placa = matches[0];
          const inputBusca = document.getElementById("consultaBusca");
          if (inputBusca) {
            inputBusca.value = placa;
            estado.filtros.busca = placa;
            estado.pagina = 0;
            estado.temMais = true;
            const container = document.getElementById("consultaResultadosArea");
            if (container) {
              carregarAbordagens(
                container.closest(".container") || container,
                appInstance,
              );
            }
          }
          appInstance.showToast(`Placa reconhecida: ${placa}`, "success");
        } else {
          appInstance.showToast(
            "Nenhuma placa reconhecida na imagem",
            "warning",
          );
        }

        URL.revokeObjectURL(imageUrl);
      } catch (error) {
        console.error("Erro no reconhecimento:", error);
        appInstance.showToast("Erro ao reconhecer placa", "error");
      }
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  } catch (error) {
    console.error("Erro ao abrir câmera:", error);
    appInstance.showToast("Erro ao abrir câmera", "error");
  }
}

// ============================================
// VER DETALHES DA ABORDAGEM (MODAL)
// ============================================

function escapeConsultaDetailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function safeConsultaDetailUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.href);
    return ["https:", "http:", "blob:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function isConsultaDetailImage(anexo) {
  if (!anexo || typeof anexo !== "object") return false;
  const tipo = String(anexo.tipo || anexo.tipo_arquivo || "").trim().toLowerCase();
  const mime = String(anexo.mime_type || anexo.mimeType || "").trim().toLowerCase();
  if (tipo === "image" || tipo.startsWith("image/") || mime.startsWith("image/")) return true;
  const url = String(anexo.url || anexo.url_thumb || "").split(/[?#]/, 1)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(url);
}

function renderConsultaDetailInfo(label, value, icon, wide = false) {
  const texto = value === null || value === undefined || value === "" ? "Não informado" : value;
  return `
    <div class="dashboard-detail-info${wide ? " dashboard-detail-info--wide" : ""}">
      <span class="dashboard-detail-info__label"><i class="fas ${icon}" aria-hidden="true"></i>${escapeConsultaDetailHtml(label)}</span>
      <strong class="dashboard-detail-info__value">${escapeConsultaDetailHtml(texto)}</strong>
    </div>
  `;
}

async function verAbordagemDetalhe(id, tipo, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

    const tabela = tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data, error } = await client
      .from(tabela)
      .select("*, usuarios(nome_completo)")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      appInstance.showToast("Abordagem não encontrada", "error");
      return;
    }

    const isVeiculo = tipo === "veiculo";
    const guardaNome = data.usuarios?.nome_completo || "Desconhecido";
    const dataFormatada = new Date(data.criado_em).toLocaleString("pt-BR", {
      timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const dataInicio = data.data_hora_inicio ? formatarDataHoraLocal(data.data_hora_inicio) : "Não informado";
    const dataEncerramento = data.data_hora_encerramento ? formatarDataHoraLocal(data.data_hora_encerramento) : "Não encerrado";
    const dataFinalizacao = data.data_hora_finalizacao ? formatarDataHoraLocal(data.data_hora_finalizacao) : "";

    const statusAbordagem = data.status_abordagem || "ativa";
    const statusMeta = {
      ativa: { label: "Ativa", tone: "success" },
      encerrada: { label: "Encerrada", tone: "warning" },
      finalizada: { label: "Finalizada", tone: "info" },
      cancelada: { label: "Cancelada", tone: "danger" },
    }[statusAbordagem] || { label: "Ativa", tone: "success" };

    let faseLabel = "Primeira orientação";
    let faseTone = "info";
    if (data.fase === "advertencia" && data.reincidencia_count >= REINCIDENCIA_LIMITE_ADVERTENCIA) {
      faseLabel = "Advertência";
      faseTone = "warning";
    } else if (data.fase === "multa" || data.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA) {
      faseLabel = "Multa";
      faseTone = "danger";
    } else if (data.fase === "advertencia") {
      faseLabel = "Advertência";
      faseTone = "warning";
    }

    const statusRetificacao = data.status_retificacao || "none";
    const retificacaoMeta = {
      pending_rectification: { label: "Retificação pendente", tone: "warning" },
      rectified: { label: "Retificada", tone: "success" },
      rectification_rejected: { label: "Retificação rejeitada", tone: "danger" },
    }[statusRetificacao] || null;

    const identificador = isVeiculo
      ? data.placa || (data.identificacao_status === "nao_identificado" ? "Veículo sem placa identificada" : "Placa não informada")
      : data.nome || (data.identificacao_status === "nao_identificado" ? "Pessoa não identificada" : "Nome não informado");
    const tipoAtendimentoLabel = obterRotuloTipoAtendimento(data.tipo_atendimento);
    const providenciaLabel = obterRotuloProvidencia(data.providencia);
    const identificacaoLabel = obterRotuloIdentificacao(data.identificacao_status);
    const detalhes = isVeiculo
      ? `${data.marca_modelo || ""}${data.cor ? ` · ${data.cor}` : ""}`.trim()
      : [data.alcunha ? `Alcunha: ${data.alcunha}` : "", data.cpf ? `CPF: ${data.cpf}` : "", data.rg ? `RG: ${data.rg}` : ""]
          .filter(Boolean)
          .join(" · ");

    const imagensProcessadas = (Array.isArray(data.anexos) ? data.anexos : [])
      .filter(isConsultaDetailImage)
      .map((img, index) => ({
        url: safeConsultaDetailUrl(img.url || img.url_thumb),
        url_thumb: safeConsultaDetailUrl(img.url_thumb || img.url),
        nome: img.nome || img.nome_arquivo || `Foto ${index + 1}`,
        tamanho: img.tamanho || 0,
        tipo: img.tipo || img.tipo_arquivo || "image",
      }))
      .filter((img) => img.url && img.url_thumb);

    estado._imagensModal = estado._imagensModal || {};
    estado._imagensModal[id] = imagensProcessadas;

    const imagensGrid = imagensProcessadas.slice(0, 4).map((img, index) => `
      <button type="button" class="dashboard-detail-photo" data-photo-index="${index}" aria-label="Abrir ${escapeConsultaDetailHtml(img.nome)}">
        <img src="${escapeConsultaDetailHtml(img.url_thumb)}" data-fallback="${escapeConsultaDetailHtml(img.url)}" alt="${escapeConsultaDetailHtml(img.nome)}" loading="lazy" decoding="async" fetchpriority="low" width="240" height="180">
        <span class="dashboard-detail-photo__zoom" aria-hidden="true"><i class="fas fa-expand-alt"></i></span>
        <span class="dashboard-detail-photo__index">${index + 1}</span>
      </button>
    `).join("");

    const imagensHTML = imagensProcessadas.length ? `
      <section class="dashboard-detail-section" aria-label="Fotos da abordagem">
        <div class="dashboard-detail-section__heading">
          <div><span class="dashboard-detail-eyebrow">REGISTRO VISUAL</span><h3>Fotos</h3></div>
          <span class="dashboard-detail-count">${imagensProcessadas.length}</span>
        </div>
        <div class="dashboard-detail-gallery">${imagensGrid}</div>
        ${imagensProcessadas.length > 4 ? `<button type="button" class="dashboard-detail-gallery-more" data-show-all><i class="fas fa-images" aria-hidden="true"></i>Ver todas as ${imagensProcessadas.length} fotos</button>` : ""}
      </section>
    ` : "";

    const prazo = data.prazo ? new Date(data.prazo).toLocaleDateString("pt-BR") : "";
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dashboard-detail-overlay dashboard-detail-overlay--approach dashboard-detail-overlay--consultation";
    overlay.id = `modal-${String(id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    overlay.innerHTML = `
      <section class="dashboard-detail-modal" role="dialog" aria-modal="true" aria-labelledby="consultaApproachDetailTitle">
        <header class="dashboard-detail-modal__header">
          <div class="dashboard-detail-modal__title-group">
            <span class="dashboard-detail-eyebrow">CONSULTA OPERACIONAL · ABORDAGEM</span>
            <h2 id="consultaApproachDetailTitle">${escapeConsultaDetailHtml(identificador)}</h2>
            ${detalhes ? `<p class="dashboard-detail-modal__subtitle">${escapeConsultaDetailHtml(detalhes)}</p>` : ""}
          </div>
          <div class="dashboard-detail-modal__header-actions">
            <span class="dashboard-detail-badge dashboard-detail-badge--${isVeiculo ? "info" : "success"}"><i class="fas ${isVeiculo ? "fa-car-side" : "fa-user"}" aria-hidden="true"></i>${isVeiculo ? "Veículo" : "Pessoa"}</span>
            <button type="button" class="dashboard-detail-close" data-detail-close aria-label="Fechar detalhes"><i class="fas fa-times" aria-hidden="true"></i></button>
          </div>
        </header>
        <div class="dashboard-detail-modal__body">
          <div class="dashboard-detail-badges">
            <span class="dashboard-detail-badge dashboard-detail-badge--${statusMeta.tone}">Status: ${escapeConsultaDetailHtml(statusMeta.label)}</span>
            <span class="dashboard-detail-badge dashboard-detail-badge--${faseTone}">Fase: ${escapeConsultaDetailHtml(faseLabel)}</span>
            ${retificacaoMeta ? `<span class="dashboard-detail-badge dashboard-detail-badge--${retificacaoMeta.tone}">${escapeConsultaDetailHtml(retificacaoMeta.label)}</span>` : ""}
          </div>

          <div class="dashboard-detail-grid">
            ${renderConsultaDetailInfo("Data do registro", dataFormatada, "fa-clock")}
            ${renderConsultaDetailInfo("Guarda responsável", guardaNome, "fa-user-shield")}
            ${renderConsultaDetailInfo("Início", dataInicio, "fa-play")}
            ${renderConsultaDetailInfo("Encerramento", dataEncerramento, "fa-stop")}
            ${dataFinalizacao ? renderConsultaDetailInfo("Finalização", dataFinalizacao, "fa-check", true) : ""}
            ${renderConsultaDetailInfo("Local", data.local_abordagem || "Não informado", "fa-location-dot", true)}
            ${renderConsultaDetailInfo("Tipo de atendimento", tipoAtendimentoLabel, "fa-list-check", true)}
            ${renderConsultaDetailInfo("Providência / resultado", providenciaLabel, "fa-clipboard-check", true)}
            ${renderConsultaDetailInfo("Identificação", identificacaoLabel, "fa-id-card", true)}
          </div>

          ${data.descricao_identificacao ? `
            <section class="dashboard-detail-section">
              <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">IDENTIFICAÇÃO</span><h3>Descrição observável</h3></div></div>
              <p class="dashboard-detail-text">${escapeConsultaDetailHtml(data.descricao_identificacao)}</p>
            </section>
          ` : ""}

          ${data.motivo ? `
            <section class="dashboard-detail-section">
              <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">REGISTRO DA ABORDAGEM</span><h3>Motivo</h3></div></div>
              <p class="dashboard-detail-text">${escapeConsultaDetailHtml(data.motivo)}</p>
            </section>
          ` : ""}

          ${data.observacoes ? `
            <section class="dashboard-detail-section">
              <div class="dashboard-detail-section__heading"><div><span class="dashboard-detail-eyebrow">ANOTAÇÕES</span><h3>Observações</h3></div></div>
              <p class="dashboard-detail-text">${escapeConsultaDetailHtml(data.observacoes)}</p>
            </section>
          ` : ""}

          ${prazo ? `
            <section class="dashboard-detail-notice">
              <span class="dashboard-detail-notice__icon"><i class="fas fa-calendar-check" aria-hidden="true"></i></span>
              <div><span class="dashboard-detail-eyebrow">REGULARIZAÇÃO</span><strong>Prazo: ${escapeConsultaDetailHtml(prazo)}</strong>${data.status_regularizacao ? `<small>Status: ${escapeConsultaDetailHtml(data.status_regularizacao)}</small>` : ""}</div>
            </section>
          ` : ""}

          ${imagensHTML}
        </div>
        <footer class="dashboard-detail-modal__footer">
          <button type="button" class="dashboard-detail-action dashboard-detail-action--secondary" data-detail-close>Fechar</button>
          <button type="button" class="dashboard-detail-action dashboard-detail-action--secondary" data-action="pdf"><i class="fas fa-file-pdf" aria-hidden="true"></i>PDF</button>
          <button type="button" class="dashboard-detail-action dashboard-detail-action--primary" data-action="convert"><i class="fas fa-file-export" aria-hidden="true"></i>Converter em BO</button>
        </footer>
      </section>
    `;

    const closeModal = () => {
      document.removeEventListener("keydown", onEscape);
      overlay.remove();
    };
    const onEscape = (event) => { if (event.key === "Escape") closeModal(); };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeModal(); });
    overlay.querySelectorAll("[data-detail-close]").forEach((button) => button.addEventListener("click", closeModal));
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onEscape);
    overlay.querySelector(".dashboard-detail-close")?.focus({ preventScroll: true });

    overlay.querySelectorAll(".dashboard-detail-photo img").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallback;
        if (fallback && image.src !== fallback) {
          image.dataset.fallback = "";
          image.src = fallback;
        } else {
          image.closest(".dashboard-detail-photo")?.classList.add("is-broken");
        }
      });
    });

    overlay.querySelectorAll("[data-photo-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.photoIndex) || 0;
        if (typeof window._consultaAbrirCarrossel === "function") {
          window._consultaAbrirCarrossel(imagensProcessadas, index, appInstance);
        }
      });
    });
    window._consultaAbrirCarrosselPorId = function (abordagemId) {
      const imagens = estado._imagensModal && estado._imagensModal[abordagemId];
      if (imagens && imagens.length > 0 && typeof window._consultaAbrirCarrossel === "function") {
        window._consultaAbrirCarrossel(imagens, 0, appInstance);
      } else if (appInstance && appInstance.showToast) {
        appInstance.showToast("Nenhuma imagem disponível", "info");
      }
    };
    overlay.querySelector("[data-show-all]")?.addEventListener("click", () => {
      window._consultaAbrirCarrosselPorId(id);
    });

    overlay.querySelector('[data-action="pdf"]')?.addEventListener("click", () => {
      closeModal();
      if (typeof window._consultaExportarDetalhePDF === "function") {
        window._consultaExportarDetalhePDF(id, tipo);
      }
    });
    overlay.querySelector('[data-action="convert"]')?.addEventListener("click", () => {
      closeModal();
      if (typeof window._consultaConverterBO === "function") {
        window._consultaConverterBO(id, tipo);
      }
    });
  } catch (error) {
    console.error("Erro ao buscar abordagem:", error);
    appInstance.showToast("Erro ao carregar detalhes da abordagem", "error");
  }
}

// ============================================
// CONVERTER ABORDAGEM EM BO
// ============================================

function converterEmBO(id, tipo, appInstance) {
  appInstance.showToast("Abrindo nova ocorrência...", "info");
  const modal = document.querySelector(".modal-overlay");
  if (modal) modal.remove();

  appInstance.navigateTo("nova-ocorrencia");
  setTimeout(async () => {
    try {
      const client =
        typeof supabaseClient !== "undefined"
          ? supabaseClient.getClient()
          : null;
      if (!client) return;

      const tabela =
        tipo === "veiculo" ? "abordagens_veiculos" : "abordagens_pessoas";
      const { data, error } = await client
        .from(tabela)
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) return;

      const dadosBO = {
        tipo_abordagem: tipo,
        dados: data,
      };

      sessionStorage.setItem("abordagem_para_bo", JSON.stringify(dadosBO));
      appInstance.showToast("Dados da abordagem importados!", "success");
    } catch (error) {
      console.error("Erro ao importar dados da abordagem:", error);
    }
  }, 1000);
}

// ============================================
// PREVIEW DE IMAGENS
// ============================================

export function previewMultiplasImagensAbordagem(input) {
  const area = document.getElementById("abordagemPreviewArea");
  if (!area) return;

  // 🔥 ALTERADO: Removido limite de quantidade
  const files = input.files;
  // if (files.length > MAX_ANEXOS) { ... } // REMOVIDO

  area.innerHTML = "";
  const imagensData = [];

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      if (window._consultaApp && window._consultaApp.showToast) {
        window._consultaApp.showToast(
          `Arquivo ${file.name} excede 10MB`,
          "warning",
        );
      }
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.style.cssText =
        "position:relative;width:65px;height:65px;border-radius:8px;overflow:hidden;border:2px solid var(--cinza-claro);";
      div.innerHTML = `
        <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">
        <button type="button" onclick="window._consultaRemoverImagem(this)" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.8);color:white;border:none;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;">
          <i class="fas fa-times"></i>
        </button>
      `;
      area.appendChild(div);
      imagensData.push(file);
    };
    reader.readAsDataURL(file);
  }

  estado.arquivosTemp = imagensData;
}

export function removerImagemAbordagemPreview(btn) {
  const div = btn.closest("div");
  div.remove();

  const files = estado.arquivosTemp || [];
  const img = div.querySelector("img");
  if (img) {
    const index = files.findIndex(
      (f) => f.name === img.alt || f.name === img.src.split("/").pop(),
    );
    if (index > -1) {
      files.splice(index, 1);
      estado.arquivosTemp = files;
    }
  }
}

function abrirCameraRapida(appInstance) {
  const fileInput = document.getElementById("abordagemFileInput");
  if (fileInput) {
    fileInput.setAttribute("capture", "environment");
    fileInput.click();
  }
}

// ============================================
// PROCESSAR E UPLOAD ANEXOS
// ============================================

async function processarAnexosAbordagem(files) {
  const anexos = [];
  // 🔥 ALTERADO: Removido limite de arquivos
  const filesToProcess = Array.from(files); // Removido .slice(0, MAX_ANEXOS)

  for (const file of filesToProcess) {
    try {
      let fileProcessado = await comprimirImagemInterna(
        file,
        MAX_IMAGE_WIDTH,
        IMAGE_QUALITY,
      );
      if (fileProcessado.size > MAX_IMAGE_SIZE) {
        fileProcessado = await comprimirImagemInterna(file, 600, 0.6);
        if (fileProcessado.size > MAX_IMAGE_SIZE) {
          if (window._consultaApp && window._consultaApp.showToast) {
            window._consultaApp.showToast(
              `Arquivo ${file.name} excede 1MB`,
              "warning",
            );
          }
          continue;
        }
      }
      let hash = null;
      try {
        hash = await gerarHashArquivoInterna(fileProcessado);
      } catch (e) {}
      anexos.push({
        nome: file.name,
        tipo: "image",
        tamanho: fileProcessado.size,
        arquivo: fileProcessado,
        hash: hash,
        url: null,
      });
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
    }
  }

  return anexos;
}

async function uploadAnexosAbordagem(anexos, isVeiculo) {
  if (!anexos || anexos.length === 0) return [];

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) return [];

  const prefix = isVeiculo ? "abordagens_veiculos" : "abordagens_pessoas";
  const timestamp = Date.now();
  const resultados = [];

  for (const anexo of anexos) {
    try {
      const fileExt = anexo.arquivo.name.split(".").pop();
      const fileName = `${prefix}/${timestamp}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, anexo.arquivo);
      if (uploadError) throw uploadError;
      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);
      resultados.push({
        url: urlData.publicUrl,
        nome: anexo.nome,
        tipo: anexo.tipo,
        tamanho: anexo.tamanho,
        hash: anexo.hash,
      });
    } catch (error) {
      console.error("Erro no upload do anexo:", error);
    }
  }

  return resultados;
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderConsultaOperacional,
  carregarRankingReincidentes,
  abrirFormularioAbordagem,
  salvarAbordagemComAnexos,
  previewMultiplasImagensAbordagem,
  removerImagemAbordagemPreview,
  reconhecerPlacaPorFoto,
  converterEmBO,
  verAbordagemDetalhe,
  fecharFormulario,
  abrirCarrosselFotos,
  // 🔥 NOVO: Retificação
  abrirSolicitarRetificacaoAbordagem,
  // 🔥 NOVO: Finalizar abordagem
  finalizarAbordagem,
  // Funções de exportação PDF
  exportarListaPDF,
  exportarDetalhePDF,
  // Função para visualização ampliada
  verImagemAmpliada: (url, nome, todasImagens, index) => {
    if (todasImagens && todasImagens.length > 0) {
      abrirCarrosselFotos(todasImagens, index || 0, window._consultaApp);
    } else if (url) {
      window.open(url, "_blank");
    }
  },
};
