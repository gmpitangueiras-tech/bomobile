/**
 * MÓDULO CONSULTA - Consulta Operacional
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
        const valorFormatado = valorAtual
          ? new Date(valorAtual).toISOString().slice(0, 16)
          : "";
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
          // Converter para ISO
          const date = new Date(valor);
          if (!isNaN(date.getTime())) {
            dados[campo.campo] = date.toISOString();
          }
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
        retificado_em: isSupervisor ? new Date().toISOString() : null,
        retificado_por: isSupervisor ? user.id : null,
        solicitacao_retificacao_justificativa: isSupervisor
          ? null
          : justificativa,
        solicitada_em: isSupervisor ? null : new Date().toISOString(),
        solicitada_por: isSupervisor ? null : user.id,
        aprovada_em: isSupervisor ? new Date().toISOString() : null,
        aprovada_por: isSupervisor ? user.id : null,
        rejeitada_em: null,
        rejeitada_por: null,
        motivo_rejeicao: null,
        status_retificacao: isSupervisor
          ? "rectified"
          : "pending_rectification",
        esta_ativa: isSupervisor ? true : false,
        numero_versao: (abordagem.numero_versao || 1) + 1,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
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
            atualizado_em: new Date().toISOString(),
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
      criado_em: new Date().toISOString(),
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
      criado_em: new Date().toISOString(),
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
      criado_em: new Date().toISOString(),
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

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

export async function renderConsultaOperacional(container, appInstance) {
  await carregarListaGuardas();
  definirPeriodoPadrao();

  let html = `
    <div class="container" style="padding-bottom:100px;" id="consultaContainer">
      <!-- Cabeçalho -->
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <div>
            <h2 style="color:var(--azul-bandeira);margin:0 0 2px 0;font-size:18px;">
              <i class="fas fa-search" style="margin-right:8px;"></i>
              Consulta Operacional
            </h2>
            <p style="color:var(--cinza-medio);font-size:13px;margin:0;">
              Pesquise e acompanhe abordagens e orientações.
            </p>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button onclick="window._consultaExportarPDF()" class="btn-secondary" 
              style="padding:4px 12px;font-size:11px;min-height:auto;width:auto;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);">
              <i class="fas fa-file-pdf" style="margin-right:4px;"></i> Exportar PDF
            </button>
            <button onclick="window._consultaRecarregar()" class="btn-secondary" 
              style="padding:4px 12px;font-size:11px;min-height:auto;width:auto;border-radius:8px;">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Ranking + Ações Rápidas -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <!-- Ranking de Reincidentes -->
        <div id="rankingContainer" style="background:var(--azul-escuro);border-radius:var(--border-radius);padding:10px 12px;box-shadow:var(--sombra-suave);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <h4 style="font-size:12px;color:var(--branco);margin:0;font-weight:600;opacity:0.9;">
              <i class="fas fa-trophy" style="color:#fbbf24;margin-right:4px;"></i>
              Ranking de Reincidentes
            </h4>
            <button onclick="window._consultaVerRankingCompleto()" style="background:rgba(255,255,255,0.15);border:none;color:var(--branco);font-size:10px;font-weight:600;cursor:pointer;padding:2px 10px;border-radius:12px;">
              Ver todos <i class="fas fa-arrow-right" style="font-size:8px;margin-left:2px;"></i>
            </button>
          </div>
          <div id="rankingLista" style="max-height:140px;overflow-y:auto;">
            <div style="text-align:center;padding:10px;color:rgba(255,255,255,0.6);font-size:11px;">
              Carregando ranking...
            </div>
          </div>
        </div>

        <!-- Ações Rápidas -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button onclick="window._consultaAbrirFormulario()" 
            class="btn-primary" 
            style="padding:8px 10px;border-radius:var(--border-radius);font-size:12px;font-weight:600;background:var(--azul-bandeira);color:white;border:none;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;box-shadow:var(--sombra-suave);min-height:44px;">
            <i class="fas fa-plus-circle" style="font-size:16px;"></i>
            <div>
              <div style="font-weight:700;font-size:12px;">Nova Abordagem</div>
              <div style="font-size:9px;font-weight:400;opacity:0.8;">Registre uma nova abordagem de veículo ou pessoa</div>
            </div>
          </button>
          <button onclick="window._consultaReconhecerPlaca()" 
            class="btn-primary" 
            style="padding:8px 10px;border-radius:var(--border-radius);font-size:12px;font-weight:600;background:#8b5cf6;color:white;border:none;cursor:pointer;text-align:left;display:flex;align-items:center;gap:8px;box-shadow:var(--sombra-suave);min-height:44px;">
            <i class="fas fa-camera" style="font-size:16px;"></i>
            <div>
              <div style="font-weight:700;font-size:12px;">Reconhecer Placa</div>
              <div style="font-size:9px;font-weight:400;opacity:0.8;">Faça o reconhecimento da placa por foto</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Abas: Todos | Veículos | Pessoas -->
      <div style="display:flex;gap:4px;margin-bottom:12px;background:var(--cinza-claro);padding:4px;border-radius:var(--border-radius);">
        <button onclick="window._consultaMudarAba('todos')" id="tabTodos" class="tab-btn" style="flex:1;padding:8px 4px;border:none;border-radius:var(--border-radius);font-weight:600;font-size:12px;cursor:pointer;background:${estado.abaAtiva === "todos" ? "var(--branco)" : "none"};color:${estado.abaAtiva === "todos" ? "var(--cinza-escuro)" : "var(--cinza-medio)"};transition:all 0.2s;">
            <i class="fas fa-list"></i> Todos
          </button>
        <button onclick="window._consultaMudarAba('veiculos')" id="tabVeiculos" class="tab-btn" style="flex:1;padding:8px 4px;border:none;border-radius:var(--border-radius);font-weight:600;font-size:12px;cursor:pointer;background:${estado.abaAtiva === "veiculos" ? "var(--branco)" : "none"};color:${estado.abaAtiva === "veiculos" ? "var(--cinza-escuro)" : "var(--cinza-medio)"};transition:all 0.2s;">
            <i class="fas fa-motorcycle"></i> Veículos
          </button>
        <button onclick="window._consultaMudarAba('pessoas')" id="tabPessoas" class="tab-btn" style="flex:1;padding:8px 4px;border:none;border-radius:var(--border-radius);font-weight:600;font-size:12px;cursor:pointer;background:${estado.abaAtiva === "pessoas" ? "var(--branco)" : "none"};color:${estado.abaAtiva === "pessoas" ? "var(--cinza-escuro)" : "var(--cinza-medio)"};transition:all 0.2s;">
            <i class="fas fa-user-friends"></i> Pessoas
          </button>
      </div>

      <!-- Filtros -->
      <div class="filtros-consulta" style="background:var(--branco);border-radius:var(--border-radius);padding:10px 12px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <div style="flex:1;min-width:100px;">
            <label style="font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:1px;">
              <i class="fas fa-calendar-alt" style="margin-right:4px;"></i> Período
            </label>
            <select id="consultaPeriodo" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;" onchange="window._consultaPeriodoChange()">
              <option value="12h" ${estado.filtros.periodo === "12h" ? "selected" : ""}>Últimas 12 horas</option>
              <option value="hoje" ${estado.filtros.periodo === "hoje" ? "selected" : ""}>Hoje</option>
              <option value="semana" ${estado.filtros.periodo === "semana" ? "selected" : ""}>Esta semana</option>
              <option value="mes" ${estado.filtros.periodo === "mes" ? "selected" : ""}>Este mês</option>
              <option value="personalizado" ${estado.filtros.periodo === "personalizado" ? "selected" : ""}>Personalizado</option>
            </select>
          </div>
          <div style="flex:1;min-width:100px;">
            <label style="font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:1px;">
              <i class="fas fa-user-shield" style="margin-right:4px;"></i> Guarda
            </label>
            <select id="consultaGuarda" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;">
              <option value="">Todos</option>
              ${estado.listaGuardas
                .map(
                  (g) => `
                <option value="${g.id}" ${estado.filtros.guarda === g.id ? "selected" : ""}>${g.nome_completo}</option>
              `,
                )
                .join("")}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <div style="flex:1;position:relative;">
            <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:13px;z-index:2;"></i>
            <input type="text" id="consultaBusca" placeholder="Pesquisar por placa, nome, motivo, local..." 
              value="${estado.filtros.busca || ""}" 
              style="width:100%;padding:8px 10px 8px 32px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;"
              oninput="window._consultaBuscaAutomatica(this.value)"
              onkeydown="if(event.key==='Enter') window._consultaExecutarBusca()">
          </div>
          <button onclick="window._consultaAplicarFiltros()" class="btn-primary" style="padding:6px 12px;font-size:13px;min-height:36px;width:auto;border-radius:8px;white-space:nowrap;">
            <i class="fas fa-search"></i>
          </button>
        </div>
        <div id="consultaDatasPersonalizadas" style="display:none;margin-top:6px;gap:6px;flex-wrap:wrap;">
          <div style="flex:1;min-width:100px;">
            <label style="font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:1px;">Data Início</label>
            <input type="date" id="consultaDataInicio" value="${estado.filtros.dataInicio || ""}" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;">
          </div>
          <div style="flex:1;min-width:100px;">
            <label style="font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.3px;display:block;margin-bottom:1px;">Data Fim</label>
            <input type="date" id="consultaDataFim" value="${estado.filtros.dataFim || ""}" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:36px;">
          </div>
        </div>
      </div>

      <!-- Resultados -->
      <div id="consultaResultadosArea">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:14px;color:var(--cinza-escuro);margin:0;font-weight:600;">
            <i class="fas fa-clock" style="margin-right:6px;color:var(--azul-bandeira);"></i>
            Últimas Abordagens/Orientações
          </h3>
          <span id="consultaTotalRegistros" style="font-size:11px;color:var(--cinza-medio);">0 registros</span>
        </div>
        <div id="consultaListaAbordagens">
          <div style="text-align:center;padding:30px;">
            <div class="spinner-azul" style="margin:0 auto;width:30px;height:30px;border-width:3px;"></div>
            <p style="margin-top:10px;color:var(--cinza-medio);font-size:13px;">Carregando abordagens...</p>
          </div>
        </div>
        <div id="consultaLoaderMais" style="display:none;text-align:center;padding:20px;">
          <div class="spinner-azul" style="margin:0 auto;width:24px;height:24px;border-width:2px;"></div>
          <p style="margin-top:8px;color:var(--cinza-medio);font-size:12px;">Carregando mais...</p>
        </div>
      </div>
    </div>
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
  window._consultaVerRankingCompleto = () => verRankingCompleto(appInstance);
  window._consultaCarregarMais = () =>
    carregarMaisAbordagens(container, appInstance);
  window._consultaVerAbordagemDetalhe = (id, tipo) =>
    verAbordagemDetalhe(id, tipo, appInstance);
  window._consultaConverterBO = (id, tipo) =>
    converterEmBO(id, tipo, appInstance);
  window._consultaSalvarAbordagem = () => salvarAbordagemComAnexos(appInstance);
  window._consultaPreviewImagens = (input) =>
    previewMultiplasImagensAbordagem(input);
  window._consultaRemoverImagem = (btn) => removerImagemAbordagemPreview(btn);
  window._consultaAbrirCameraRapida = () => abrirCameraRapida(appInstance);
  window._consultaFecharFormulario = () =>
    fecharFormularioComConfirmacao(container, appInstance);
  window._consultaAbrirCarrossel = (imagens, index) =>
    abrirCarrosselFotos(imagens, index, appInstance);

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

  await carregarRankingReincidentes();
  await carregarAbordagens(container, appInstance);
  configurarScrollInfinito(container, appInstance);
}

// ============================================
// 🔥 ALTERADO: FORMULÁRIO DE ABORDAGEM COM DATA/HORA
// ============================================

export function abrirFormularioAbordagem(appInstance, termoPreenchido = "") {
  const area = document.getElementById("consultaResultadosArea");
  if (!area) return;

  const isVeiculo =
    estado.abaAtiva === "veiculos" || estado.abaAtiva === "todos";
  estado.arquivosTemp = [];
  estado.formularioAberto = true;

  const localizacaoAtual =
    typeof window.app !== "undefined"
      ? window.app.obterLocalizacaoAtual()
      : null;

  // 🔥 NOVO: Data/hora atual para os campos
  const agora = new Date();
  const dataHoraAtual = agora.toISOString().slice(0, 16);
  const dataHoraInicio = dataHoraAtual;

  let html = `
    <div style="background:var(--branco);padding:12px 14px;border-radius:var(--border-radius);box-shadow:var(--sombra-media);margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;color:var(--azul-bandeira);margin:0;">
          <i class="fas fa-plus-circle" style="margin-right:6px;"></i> Nova Abordagem/Orientação
        </h3>
        <button onclick="window._consultaFecharFormulario()" class="btn-secondary" style="padding:4px 10px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${
        localizacaoAtual
          ? `
        <div style="font-size:10px;color:var(--cinza-medio);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-map-pin" style="color:var(--verde-bandeira);"></i>
          📍 GPS: ${localizacaoAtual.latitude.toFixed(6)}, ${localizacaoAtual.longitude.toFixed(6)}
        </div>
      `
          : ""
      }
      <form id="formAbordagem" onsubmit="event.preventDefault();">
  `;

  if (isVeiculo) {
    html += `
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Placa *</label>
        <input type="text" id="formPlaca" value="${termoPreenchido}" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;text-transform:uppercase;font-size:13px;min-height:36px;" required>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <div style="flex:1;">
          <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Marca/Modelo</label>
          <input type="text" id="formMarcaModelo" placeholder="Ex: Honda Civic" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Cor</label>
          <input type="text" id="formCor" placeholder="Ex: Prata" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Condutor (Nome)</label>
        <input type="text" id="formCondutor" placeholder="Nome completo" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">CPF do Condutor</label>
        <input type="text" id="formCondutorCpf" placeholder="000.000.000-00" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
      </div>
    `;
  } else {
    html += `
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Nome Completo *</label>
        <input type="text" id="formNome" value="${termoPreenchido}" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;" required>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Alcunha (Apelido)</label>
        <input type="text" id="formAlcunha" placeholder="Ex: 'Neguinho', 'Magrão'" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <div style="flex:1;">
          <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">CPF</label>
          <input type="text" id="formCpf" placeholder="000.000.000-00" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">RG</label>
          <input type="text" id="formRg" placeholder="00.000.000-0" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Características Físicas</label>
        <textarea id="formCaracteristicas" rows="2" placeholder="Altura, peso, tatuagens, cicatrizes..." style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;resize:vertical;"></textarea>
      </div>
      <div class="form-group" style="margin-bottom:6px;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Vestimentas</label>
        <textarea id="formVestimentas" rows="2" placeholder="Roupas, calçados, acessórios..." style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;resize:vertical;"></textarea>
      </div>
    `;
  }

  html += `
    <div class="form-group" style="margin-bottom:6px;">
      <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Local da Abordagem</label>
      <input type="text" id="formLocal" placeholder="Endereço ou Ponto de Referência" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
    </div>
    
    <!-- 🔥 NOVO: Data/Hora Início e Encerramento -->
    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <div style="flex:1;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Data/Hora Início *</label>
        <input type="datetime-local" id="formDataHoraInicio" value="${dataHoraInicio}" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;" required>
      </div>
      <div style="flex:1;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Data/Hora Encerramento</label>
        <input type="datetime-local" id="formDataHoraEncerramento" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
      </div>
    </div>

    <div class="form-group" style="margin-bottom:6px;">
      <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Motivo da Abordagem</label>
      <textarea id="formMotivo" rows="3" placeholder="Descreva o que motivou a orientação..." style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;resize:vertical;"></textarea>
    </div>
    <div class="form-group" style="margin-bottom:6px;">
      <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Observações Adicionais</label>
      <textarea id="formObservacoesAbordagem" rows="2" placeholder="Informações complementares..." style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;resize:vertical;"></textarea>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <div style="flex:1;">
        <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">Fase da Abordagem</label>
        <select id="formFase" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;">
          <option value="advertencia">⚠️ Advertência</option>
          <option value="multa">💰 Multa</option>
        </select>
      </div>
      <div style="flex:1;display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="formTemPrazo" style="width:16px;height:16px;accent-color:var(--azul-bandeira);" onchange="document.getElementById('formPrazo').disabled = !this.checked">
        <label style="font-size:11px;font-weight:600;">📅 Prazo</label>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:6px;">
      <input type="date" id="formPrazo" style="width:100%;padding:6px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:13px;min-height:36px;" disabled>
    </div>

    <div class="form-group" style="margin-bottom:6px;">
      <label style="display:block;font-size:11px;margin-bottom:2px;font-weight:600;">
        <i class="fas fa-camera"></i> Fotos (sem limite de quantidade)
      </label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <input type="file" id="abordagemFileInput" accept="image/*" multiple style="display:none;" onchange="window._consultaPreviewImagens(this)">
        <div style="display:flex;gap:6px;">
          <button type="button" onclick="document.getElementById('abordagemFileInput').click()" class="btn-secondary" style="flex:1;font-size:12px;padding:4px 6px;border-radius:8px;min-height:36px;">
            <i class="fas fa-camera"></i> Selecionar Fotos
          </button>
          <button type="button" onclick="window._consultaAbrirCameraRapida()" class="btn-secondary" style="flex:1;font-size:12px;padding:4px 6px;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);min-height:36px;">
            <i class="fas fa-camera-retro"></i> Tirar Foto
          </button>
        </div>
        <div id="abordagemPreviewArea" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
        <div class="input-hint" style="font-size:10px;color:var(--cinza-medio);">
          <i class="fas fa-info-circle"></i> Sem limite de quantidade. Cada imagem será comprimida para até 1MB.
        </div>
      </div>
    </div>

    <div style="display:flex;gap:6px;margin-top:12px;">
      <button type="button" onclick="window._consultaSalvarAbordagem()" class="btn-primary" style="flex:2;padding:8px 10px;border-radius:8px;font-size:14px;font-weight:600;min-height:40px;">
        <i class="fas fa-save"></i> Salvar Orientação
      </button>
      <button type="button" onclick="window._consultaFecharFormulario()" class="btn-secondary" style="flex:1;padding:8px 10px;border-radius:8px;font-size:14px;font-weight:600;min-height:40px;">
        Cancelar
      </button>
    </div>
  `;

  html += `</form></div>`;

  area.innerHTML = html;

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

export async function salvarAbordagemComAnexos(appInstance) {
  const isVeiculo =
    estado.abaAtiva === "veiculos" || estado.abaAtiva === "todos";
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;

  if (!user) {
    appInstance.showToast("Usuário não autenticado", "error");
    return;
  }

  const identificador = isVeiculo
    ? document.getElementById("formPlaca")?.value?.toUpperCase()?.trim()
    : document.getElementById("formNome")?.value?.trim();

  if (!identificador) {
    appInstance.showToast(
      isVeiculo ? "Placa é obrigatória" : "Nome é obrigatório",
      "warning",
    );
    return;
  }

  // 🔥 NOVO: Validar data/hora início
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
      motivo: document.getElementById("formMotivo")?.value || "",
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
      dados.placa = identificador;
      dados.marca_modelo =
        document.getElementById("formMarcaModelo")?.value || "";
      dados.cor = document.getElementById("formCor")?.value || "";
      dados.condutor_nome =
        document.getElementById("formCondutor")?.value || "";
      dados.condutor_cpf =
        document.getElementById("formCondutorCpf")?.value || "";
    } else {
      dados.nome = identificador;
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

    const dataFinalizacao = new Date().toISOString();

    // Atualizar status e data de finalização
    const { data, error } = await client
      .from(tabela)
      .update({
        status_abordagem: "finalizada",
        data_hora_finalizacao: dataFinalizacao,
        atualizado_em: new Date().toISOString(),
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

    const { dataInicio, dataFim, guarda, busca } = estado.filtros;
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
      const dataFimCompleta = dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (busca) {
      const termo = `%${busca}%`;
      queryVeiculos = queryVeiculos.or(
        `placa.ilike.${termo},condutor_nome.ilike.${termo},marca_modelo.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
      queryPessoas = queryPessoas.or(
        `nome.ilike.${termo},cpf.ilike.${termo},rg.ilike.${termo},alcunha.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
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
    const dadosRelatorio = {
      veiculos: todasAbordagens.filter((a) => a.tipo_abordagem === "veiculo"),
      pessoas: todasAbordagens.filter((a) => a.tipo_abordagem === "pessoa"),
    };

    // Usar a função de exportação de relatório do pdfExport
    const result = await pdfExport.exportarRelatorio(
      "abordagens",
      dadosRelatorio,
      {
        title: `Relatório de Abordagens - ${estado.abaAtiva.charAt(0).toUpperCase() + estado.abaAtiva.slice(1)}`,
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

    // Criar um relatório com uma única abordagem
    const dadosRelatorio = {
      veiculos: tipo === "veiculo" ? [data] : [],
      pessoas: tipo === "pessoa" ? [data] : [],
    };

    const isVeiculo = tipo === "veiculo";
    const identificador = isVeiculo ? data.placa : data.nome;

    const result = await pdfExport.exportarRelatorio(
      "abordagens",
      dadosRelatorio,
      {
        title: `Abordagem ${isVeiculo ? "de Veículo" : "de Pessoa"} - ${identificador}`,
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

  const tabTodos = document.getElementById("tabTodos");
  const tabVeiculos = document.getElementById("tabVeiculos");
  const tabPessoas = document.getElementById("tabPessoas");

  if (tabTodos) {
    tabTodos.style.background = aba === "todos" ? "var(--branco)" : "none";
    tabTodos.style.color =
      aba === "todos" ? "var(--cinza-escuro)" : "var(--cinza-medio)";
  }
  if (tabVeiculos) {
    tabVeiculos.style.background =
      aba === "veiculos" ? "var(--branco)" : "none";
    tabVeiculos.style.color =
      aba === "veiculos" ? "var(--cinza-escuro)" : "var(--cinza-medio)";
  }
  if (tabPessoas) {
    tabPessoas.style.background = aba === "pessoas" ? "var(--branco)" : "none";
    tabPessoas.style.color =
      aba === "pessoas" ? "var(--cinza-escuro)" : "var(--cinza-medio)";
  }

  carregarAbordagens(container, appInstance);
}

// ============================================
// PERÍODO
// ============================================

function definirPeriodoPadrao() {
  const agora = new Date();
  const dataFim = agora.toISOString().slice(0, 10);
  const dozeHoras = new Date(agora);
  dozeHoras.setHours(dozeHoras.getHours() - 12);
  const dataInicio = dozeHoras.toISOString().slice(0, 10);

  estado.filtros.dataInicio = dataInicio;
  estado.filtros.dataFim = dataFim;
}

function consultaPeriodoChange() {
  const periodo = document.getElementById("consultaPeriodo")?.value || "12h";
  const agora = new Date();
  let dataInicio = "";
  let dataFim = agora.toISOString().slice(0, 10);

  switch (periodo) {
    case "12h": {
      const dozeHoras = new Date(agora);
      dozeHoras.setHours(dozeHoras.getHours() - 12);
      dataInicio = dozeHoras.toISOString().slice(0, 10);
      break;
    }
    case "hoje": {
      dataInicio = dataFim;
      break;
    }
    case "semana": {
      const semana = new Date(agora);
      semana.setDate(semana.getDate() - 7);
      dataInicio = semana.toISOString().slice(0, 10);
      break;
    }
    case "mes": {
      const mes = new Date(agora);
      mes.setMonth(mes.getMonth() - 1);
      dataInicio = mes.toISOString().slice(0, 10);
      break;
    }
    case "personalizado": {
      document.getElementById("consultaDatasPersonalizadas").style.display =
        "flex";
      return;
    }
    default: {
      dataInicio = estado.filtros.dataInicio || "";
      dataFim = estado.filtros.dataFim || "";
    }
  }

  estado.filtros.periodo = periodo;
  estado.filtros.dataInicio = dataInicio;
  estado.filtros.dataFim = dataFim;

  document.getElementById("consultaDatasPersonalizadas").style.display = "none";
  const dataInicioInput = document.getElementById("consultaDataInicio");
  const dataFimInput = document.getElementById("consultaDataFim");
  if (dataInicioInput) dataInicioInput.value = dataInicio;
  if (dataFimInput) dataFimInput.value = dataFim;

  const container = document.getElementById("consultaResultadosArea");
  if (container) {
    const app = window._consultaApp;
    carregarAbordagens(container.closest(".container") || container, app);
  }
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
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: veiculos, error: veicError } = await client
      .from("abordagens_veiculos")
      .select("placa, criado_em")
      .order("criado_em", { ascending: false });
    if (veicError) throw veicError;

    const { data: pessoas, error: pesError } = await client
      .from("abordagens_pessoas")
      .select("nome, cpf, criado_em")
      .order("criado_em", { ascending: false });
    if (pesError) throw pesError;

    const veiculosCount = {};
    if (veiculos) {
      veiculos.forEach((v) => {
        const placa = v.placa || "Sem placa";
        if (!veiculosCount[placa]) veiculosCount[placa] = 0;
        veiculosCount[placa]++;
      });
    }

    const pessoasCount = {};
    if (pessoas) {
      pessoas.forEach((p) => {
        const nome = p.nome || "Sem nome";
        if (!pessoasCount[nome]) pessoasCount[nome] = 0;
        pessoasCount[nome]++;
        if (p.cpf) {
          if (!pessoasCount[p.cpf]) pessoasCount[p.cpf] = 0;
          pessoasCount[p.cpf]++;
        }
      });
    }

    const ranking = [];
    Object.keys(veiculosCount).forEach((key) => {
      ranking.push({
        identificador: key,
        tipo: "veiculo",
        total: veiculosCount[key],
        label: "🚗 " + key,
      });
    });
    Object.keys(pessoasCount).forEach((key) => {
      const isCpf = /^\d{11}$/.test(key.replace(/\D/g, ""));
      ranking.push({
        identificador: key,
        tipo: "pessoa",
        total: pessoasCount[key],
        label: "👤 " + (isCpf ? `CPF: ${key}` : key),
      });
    });

    ranking.sort((a, b) => b.total - a.total);
    estado.rankingReincidentes = ranking.slice(0, 10);
    renderizarRanking(estado.rankingReincidentes);
  } catch (error) {
    console.error("Erro ao carregar ranking:", error);
  } finally {
    estado.carregandoRanking = false;
  }
}

function renderizarRanking(ranking) {
  const lista = document.getElementById("rankingLista");
  if (!lista) return;

  if (ranking.length === 0) {
    lista.innerHTML = `
      <div style="text-align:center;padding:10px;color:rgba(255,255,255,0.6);font-size:11px;">
        Nenhum reincidente encontrado
      </div>
    `;
    return;
  }

  const top5 = ranking.slice(0, 5);
  const emojis = ["🥇", "🥈", "🥉", "4º", "5º"];

  lista.innerHTML = top5
    .map((item, index) => {
      const emoji = emojis[index] || `${index + 1}º`;
      return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:11px;">
        <span style="display:flex;align-items:center;gap:4px;">
          <span style="font-weight:700;color:rgba(255,255,255,0.7);min-width:28px;font-size:11px;">${emoji}</span>
          <span style="font-weight:500;color:var(--branco);">${item.identificador}</span>
        </span>
        <span style="font-weight:600;color:#fbbf24;font-size:11px;">
          ${item.total}${item.total === 1 ? "x" : "x"}
        </span>
      </div>
    `;
    })
    .join("");
}

function verRankingCompleto(appInstance) {
  const ranking = estado.rankingReincidentes;
  if (ranking.length === 0) {
    appInstance.showToast("Nenhum reincidente encontrado", "info");
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
          <i class="fas fa-trophy" style="color:#fbbf24;margin-right:8px;"></i>
          Ranking Completo
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        ${ranking
          .map(
            (item, index) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
            <span style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:700;color:${index < 3 ? "var(--azul-bandeira)" : "var(--cinza-medio)"};min-width:30px;">${index + 1}º</span>
              <span>${item.identificador}</span>
              <span style="font-size:10px;color:var(--cinza-medio);background:var(--cinza-claro);padding:1px 8px;border-radius:10px;">${item.tipo}</span>
            </span>
            <span style="font-weight:700;color:var(--azul-bandeira);">${item.total}x</span>
          </div>
        `,
          )
          .join("")}
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

    const { dataInicio, dataFim, guarda, busca } = estado.filtros;
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
      const dataFimCompleta = dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (busca) {
      const termo = `%${busca}%`;
      queryVeiculos = queryVeiculos.or(
        `placa.ilike.${termo},condutor_nome.ilike.${termo},marca_modelo.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
      queryPessoas = queryPessoas.or(
        `nome.ilike.${termo},cpf.ilike.${termo},rg.ilike.${termo},alcunha.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
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
      totalSpan.textContent = `${estado.totalRegistros} registro(s)`;
    }

    if (todasAbordagens.length === 0) {
      area.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:14px;color:var(--cinza-escuro);margin:0;font-weight:600;">
            <i class="fas fa-clock" style="margin-right:6px;color:var(--azul-bandeira);"></i>
            Últimas Abordagens/Orientações
          </h3>
          <span id="consultaTotalRegistros" style="font-size:11px;color:var(--cinza-medio);">0 registros</span>
        </div>
        <div style="text-align:center;padding:30px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
          <div style="font-size:36px;color:var(--cinza-claro);margin-bottom:8px;">
            <i class="fas fa-search"></i>
          </div>
          <p style="font-size:14px;color:var(--cinza-medio);">Nenhuma abordagem encontrada</p>
          <button onclick="window._consultaAbrirFormulario()" class="btn-primary" style="margin-top:12px;padding:8px 20px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-plus"></i> Nova Abordagem
          </button>
        </div>
      `;
      estado.temMais = false;
      return;
    }

    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:14px;color:var(--cinza-escuro);margin:0;font-weight:600;">
          <i class="fas fa-clock" style="margin-right:6px;color:var(--azul-bandeira);"></i>
          Últimas Abordagens/Orientações
        </h3>
        <span id="consultaTotalRegistros" style="font-size:11px;color:var(--cinza-medio);">${estado.totalRegistros} registros</span>
      </div>
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
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
      const statusLabel =
        {
          ativa: "🟢 Ativa",
          encerrada: "🟡 Encerrada",
          finalizada: "✅ Finalizada",
          cancelada: "❌ Cancelada",
        }[statusAbordagem] || "🟢 Ativa";

      const statusClass =
        {
          ativa: "badge-synced",
          encerrada: "badge-pending",
          finalizada: "badge-verde",
          cancelada: "badge-cancelled",
        }[statusAbordagem] || "badge-synced";

      let faseLabel = "PRIMEIRA ORIENTAÇÃO";
      let faseClass = "badge-primeira";
      if (
        ab.fase === "advertencia" &&
        ab.reincidencia_count >= REINCIDENCIA_LIMITE_ADVERTENCIA
      ) {
        faseLabel = "ADVERTÊNCIA";
        faseClass = "badge-pending";
      } else if (
        ab.fase === "multa" ||
        ab.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA
      ) {
        faseLabel = "MULTA";
        faseClass = "badge-cancelled";
      } else if (ab.fase === "advertencia") {
        faseLabel = "ADVERTÊNCIA";
        faseClass = "badge-pending";
      }

      // 🔥 NOVO: Status de retificação
      const statusRetificacao = ab.status_retificacao || "none";
      let badgeRetificacao = "";
      if (statusRetificacao === "pending_rectification") {
        badgeRetificacao = `<span class="badge badge-pending" style="font-size:8px;padding:1px 8px;background:#fef3c7;color:#92400e;">⏳ Retificação Pendente</span>`;
      } else if (statusRetificacao === "rectified") {
        badgeRetificacao = `<span class="badge badge-synced" style="font-size:8px;padding:1px 8px;background:#d1fae5;color:#065f46;">✅ Retificada</span>`;
      } else if (statusRetificacao === "rectification_rejected") {
        badgeRetificacao = `<span class="badge badge-cancelled" style="font-size:8px;padding:1px 8px;background:#fee2e2;color:#991b1b;">❌ Retificação Rejeitada</span>`;
      }

      let identificador = "";
      let detalhes = "";
      let badgeTipo = "";
      let badgeCor = "";
      let infoExtra = "";

      if (isVeiculo) {
        identificador = ab.placa || "Placa não informada";
        detalhes = ab.marca_modelo || "";
        if (ab.cor) detalhes += ` (${ab.cor})`;
        badgeTipo = "VEÍCULO";
        badgeCor = "badge-azul";
        infoExtra = ab.condutor_nome ? `Condutor: ${ab.condutor_nome}` : "";
      } else {
        identificador = ab.nome || "Nome não informado";
        const alcunha = ab.alcunha ? `(${ab.alcunha})` : "";
        const cpf = ab.cpf ? `CPF: ${ab.cpf}` : "";
        const rg = ab.rg ? `RG: ${ab.rg}` : "";
        detalhes = [alcunha, cpf, rg].filter(Boolean).join(" ");
        badgeTipo = "PESSOA";
        badgeCor = "badge-verde";
        infoExtra = detalhes;
      }

      let totalAnexos = 0;
      if (ab.anexos && Array.isArray(ab.anexos)) {
        totalAnexos = ab.anexos.length;
      }

      let resumoMotivo = "";
      if (ab.motivo) {
        const palavras = ab.motivo.split(" ");
        resumoMotivo = palavras.slice(0, 12).join(" ");
        if (palavras.length > 12) resumoMotivo += "...";
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

      return `
        <div class="abordagem-card" style="background:var(--branco);border-radius:var(--border-radius);padding:10px 12px;margin-bottom:10px;box-shadow:var(--sombra-suave);border-left:4px solid ${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};cursor:pointer;transition:transform 0.15s ease;">
          
          <!-- Cabeçalho do Card -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;flex-wrap:wrap;gap:4px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="badge ${badgeCor}" style="font-size:9px;padding:2px 10px;font-weight:700;">${badgeTipo}</span>
              <span style="font-weight:700;font-size:14px;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">${identificador}</span>
              ${infoExtra ? `<span style="font-size:11px;color:var(--cinza-medio);word-break:break-word;">${infoExtra}</span>` : ""}
              ${badgeRetificacao}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              <span class="badge ${statusClass}" style="font-size:9px;padding:2px 10px;white-space:nowrap;">${statusLabel}</span>
              <span class="badge ${faseClass}" style="font-size:9px;padding:2px 10px;white-space:nowrap;">${faseLabel}</span>
              ${totalAnexos > 0 ? `<span style="font-size:11px;color:var(--cinza-medio);background:var(--cinza-claro);padding:1px 8px;border-radius:10px;white-space:nowrap;">+${totalAnexos}</span>` : ""}
            </div>
          </div>

          <!-- 🔥 NOVO: Data/Hora -->
          <div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;color:var(--cinza-medio);margin-bottom:2px;background:var(--branco-fumaca);padding:4px 8px;border-radius:4px;">
            <span><i class="fas fa-play" style="margin-right:2px;"></i>Início: ${dataInicio}</span>
            <span><i class="fas fa-stop" style="margin-right:2px;"></i>Encerramento: ${dataEncerramento}</span>
            ${dataFinalizacao ? `<span><i class="fas fa-check-circle" style="margin-right:2px;color:var(--verde-bandeira);"></i>Finalização: ${dataFinalizacao}</span>` : ""}
            <span><i class="fas fa-calendar" style="margin-right:2px;"></i>Registro: ${data}</span>
          </div>

          <!-- Detalhes -->
          <div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--cinza-medio);margin-bottom:2px;">
            <span><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${ab.local_abordagem || "Local não informado"}</span>
            <span><i class="fas fa-user" style="margin-right:4px;"></i>${guardaNome}</span>
          </div>

          <!-- Motivo -->
          ${
            resumoMotivo
              ? `
            <div style="font-size:12px;color:var(--cinza-escuro);margin-top:4px;padding-top:4px;border-top:1px solid var(--cinza-claro);word-break:break-word;">
              <strong>Motivo:</strong> ${resumoMotivo}
            </div>
          `
              : ""
          }

          <!-- Miniaturas de anexos com clique para abrir carrossel -->
          ${
            primeiroAnexo
              ? `
            <div style="margin-top:6px;display:flex;gap:4px;cursor:pointer;" onclick="event.stopPropagation(); window._consultaAbrirCarrossel(${imagensJSON}, 0)">
              <img src="${primeiroAnexo}" alt="Anexo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--cinza-claro);">
              ${totalAnexos > 1 ? `<span style="font-size:10px;color:var(--cinza-medio);display:flex;align-items:center;padding:0 4px;">+${totalAnexos - 1}</span>` : ""}
            </div>
          `
              : ""
          }

          <!-- Badge de reincidência -->
          ${
            ab.reincidencia_count > 0
              ? `
            <div style="margin-top:4px;">
              <span class="badge ${ab.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA ? "reincidencia-alta" : "reincidencia-media"}" style="font-size:9px;padding:1px 10px;">
                ${ab.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA ? "🔴" : "🟡"} Reincidente (${ab.reincidencia_count + 1}x)
              </span>
            </div>
          `
              : ""
          }
          
          <!-- 🔥 CORRIGIDO: Botões de ação com cores diferenciadas -->
          <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
            <button onclick="event.stopPropagation(); window._consultaVerAbordagemDetalhe('${ab.id}', '${ab.tipo_abordagem}')" 
              style="flex:1;padding:2px 10px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--azul-muito-claro);color:var(--azul-bandeira);cursor:pointer;">
              <i class="fas fa-eye"></i> Ver
            </button>
            
            ${
              podeFinalizar
                ? `
              <button onclick="event.stopPropagation(); window._consultaFinalizarAbordagem('${ab.id}', '${ab.tipo_abordagem}')" 
                style="flex:1;padding:2px 10px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--verde-muito-claro);color:var(--verde-escuro);cursor:pointer;">
                <i class="fas fa-check-circle"></i> Finalizar
              </button>
            `
                : ""
            }
            
            ${
              podeSolicitarRetificacao
                ? `
              <button onclick="event.stopPropagation(); window._consultaSolicitarRetificacao('${ab.id}', '${ab.tipo_abordagem}')" 
                style="flex:1;padding:2px 10px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:#ede9fe;color:#6d28d9;cursor:pointer;">
                <i class="fas fa-sync-alt"></i> Retificar
              </button>
            `
                : ""
            }
            
            <button onclick="event.stopPropagation(); window._consultaExportarDetalhePDF('${ab.id}', '${ab.tipo_abordagem}')" 
              style="flex:1;padding:2px 10px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--azul-muito-claro);color:var(--azul-bandeira);cursor:pointer;">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
          </div>
        </div>
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

    const { dataInicio, dataFim, guarda, busca } = estado.filtros;
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
      const dataFimCompleta = dataFim + "T23:59:59";
      queryVeiculos = queryVeiculos.lte("criado_em", dataFimCompleta);
      queryPessoas = queryPessoas.lte("criado_em", dataFimCompleta);
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }
    if (busca) {
      const termo = `%${busca}%`;
      queryVeiculos = queryVeiculos.or(
        `placa.ilike.${termo},condutor_nome.ilike.${termo},marca_modelo.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
      queryPessoas = queryPessoas.or(
        `nome.ilike.${termo},cpf.ilike.${termo},rg.ilike.${termo},alcunha.ilike.${termo},motivo.ilike.${termo},local_abordagem.ilike.${termo}`,
      );
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
      totalSpan.textContent = `${estado.totalRegistros} registro(s)`;
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
  estado.filtros.busca = busca;
  estado.pagina = 0;
  estado.temMais = true;

  carregarAbordagens(container, appInstance);
  carregarRankingReincidentes();

  appInstance.showToast("Filtros aplicados", "success");
}

function executarBuscaConsulta(container, appInstance) {
  const busca = document.getElementById("consultaBusca")?.value || "";
  estado.filtros.busca = busca;
  estado.pagina = 0;
  estado.temMais = true;
  carregarAbordagens(container, appInstance);
}

function buscaAutomatica(termo, container, appInstance) {
  if (termo && termo.length >= 2) {
    if (estado.timeoutBusca) {
      clearTimeout(estado.timeoutBusca);
    }
    estado.timeoutBusca = setTimeout(() => {
      executarBuscaConsulta(container, appInstance);
    }, 500);
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

async function verAbordagemDetalhe(id, tipo, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      appInstance.showToast("Erro ao conectar", "error");
      return;
    }

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

    const isVeiculo = tipo === "veiculo";
    const guardaNome = data.usuarios?.nome_completo || "Desconhecido";
    const dataFormatada = new Date(data.criado_em).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // 🔥 NOVO: Data/hora início e encerramento
    const dataInicio = data.data_hora_inicio
      ? formatarDataHoraLocal(data.data_hora_inicio)
      : "Não informado";
    const dataEncerramento = data.data_hora_encerramento
      ? formatarDataHoraLocal(data.data_hora_encerramento)
      : "Não encerrado";
    const dataFinalizacao = data.data_hora_finalizacao
      ? formatarDataHoraLocal(data.data_hora_finalizacao)
      : null;

    // 🔥 NOVO: Status da abordagem
    const statusAbordagem = data.status_abordagem || "ativa";
    const statusLabel =
      {
        ativa: "🟢 Ativa",
        encerrada: "🟡 Encerrada",
        finalizada: "✅ Finalizada",
        cancelada: "❌ Cancelada",
      }[statusAbordagem] || "🟢 Ativa";

    const statusClass =
      {
        ativa: "badge-synced",
        encerrada: "badge-pending",
        finalizada: "badge-verde",
        cancelada: "badge-cancelled",
      }[statusAbordagem] || "badge-synced";

    let faseLabel = "PRIMEIRA ORIENTAÇÃO";
    let faseClass = "badge-primeira";
    if (
      data.fase === "advertencia" &&
      data.reincidencia_count >= REINCIDENCIA_LIMITE_ADVERTENCIA
    ) {
      faseLabel = "ADVERTÊNCIA";
      faseClass = "badge-pending";
    } else if (
      data.fase === "multa" ||
      data.reincidencia_count >= REINCIDENCIA_LIMITE_MULTA
    ) {
      faseLabel = "MULTA";
      faseClass = "badge-cancelled";
    } else if (data.fase === "advertencia") {
      faseLabel = "ADVERTÊNCIA";
      faseClass = "badge-pending";
    }

    // 🔥 NOVO: Status de retificação
    const statusRetificacao = data.status_retificacao || "none";
    let badgeRetificacao = "";
    if (statusRetificacao === "pending_rectification") {
      badgeRetificacao = `<span class="badge badge-pending" style="font-size:10px;padding:2px 12px;background:#fef3c7;color:#92400e;">⏳ Retificação Pendente</span>`;
    } else if (statusRetificacao === "rectified") {
      badgeRetificacao = `<span class="badge badge-synced" style="font-size:10px;padding:2px 12px;background:#d1fae5;color:#065f46;">✅ Retificada</span>`;
    } else if (statusRetificacao === "rectification_rejected") {
      badgeRetificacao = `<span class="badge badge-cancelled" style="font-size:10px;padding:2px 12px;background:#fee2e2;color:#991b1b;">❌ Retificação Rejeitada</span>`;
    }

    let identificador = "";
    let detalhes = "";
    let badgeTipo = "";
    let badgeCor = "";
    if (isVeiculo) {
      identificador = data.placa || "Placa não informada";
      detalhes =
        `${data.marca_modelo || ""} ${data.cor ? `(${data.cor})` : ""}`.trim();
      badgeTipo = "VEÍCULO";
      badgeCor = "badge-azul";
    } else {
      identificador = data.nome || "Nome não informado";
      detalhes =
        `${data.alcunha ? `(${data.alcunha})` : ""} ${data.cpf ? `CPF: ${data.cpf}` : ""} ${data.rg ? `RG: ${data.rg}` : ""}`.trim();
      badgeTipo = "PESSOA";
      badgeCor = "badge-verde";
    }

    // Processar anexos/imagens
    let anexosHTML = "";
    let imagens = [];
    let imagensProcessadas = [];

    if (data.anexos && Array.isArray(data.anexos) && data.anexos.length > 0) {
      imagens = data.anexos.filter(
        (a) => a.tipo === "image" || a.tipo_arquivo === "image",
      );

      imagensProcessadas = imagens.map((img) => ({
        url: img.url || "",
        url_thumb: img.url_thumb || img.url || "",
        nome: img.nome || img.nome_arquivo || "Imagem",
        tamanho: img.tamanho || 0,
        tipo: img.tipo || img.tipo_arquivo || "image",
      }));

      if (imagensProcessadas.length > 0) {
        const cols = Math.min(imagensProcessadas.length, 4);
        const imagensGrid = imagensProcessadas
          .map(
            (img, index) => `
          <div class="consulta-imagem-thumb" 
               data-url="${img.url}" 
               data-url-thumb="${img.url_thumb}" 
               data-nome="${img.nome}" 
               data-index="${index}"
               data-total="${imagensProcessadas.length}"
               data-imagens='${JSON.stringify(imagensProcessadas).replace(/'/g, "\\'")}'
               style="aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:var(--cinza-claro);border:2px solid var(--cinza-claro);position:relative;">
            <img src="${img.url_thumb || img.url}" alt="${img.nome}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
            <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:white;font-size:9px;padding:2px 8px;border-radius:4px;">
              <i class="fas fa-expand"></i>
            </div>
          </div>
        `,
          )
          .join("");

        anexosHTML = `
          <div style="margin-top:12px;">
            <p style="font-weight:600;margin:0 0 8px 0;font-size:13px;color:var(--cinza-escuro);">
              <i class="fas fa-camera"></i> Fotos (${imagensProcessadas.length})
            </p>
            <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:8px;" id="galeria-imagens-${id}">
              ${imagensGrid}
            </div>
            ${
              imagensProcessadas.length > 4
                ? `
              <button onclick="window._consultaAbrirCarrosselPorId('${id}')" 
                style="width:100%;margin-top:6px;padding:4px;border:none;border-radius:6px;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:11px;font-weight:600;cursor:pointer;">
                <i class="fas fa-images"></i> Ver todas (${imagensProcessadas.length})
              </button>
            `
                : ""
            }
          </div>
        `;

        // Registrar as imagens no estado para acesso posterior
        estado._imagensModal = estado._imagensModal || {};
        estado._imagensModal[id] = imagensProcessadas;
      }
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = `modal-${id}`;
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
      <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;background:var(--branco);border-radius:20px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas ${isVeiculo ? "fa-motorcycle" : "fa-user"}" style="margin-right:8px;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};"></i>
            Detalhes da Abordagem
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap;">
                <span class="badge ${badgeCor}" style="font-size:10px;padding:2px 12px;font-weight:700;">${badgeTipo}</span>
                <span style="font-size:18px;font-weight:700;color:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};word-break:break-word;">${identificador}</span>
                ${badgeRetificacao}
              </div>
              ${detalhes ? `<div style="font-size:13px;color:var(--cinza-medio);word-break:break-word;">${detalhes}</div>` : ""}
            </div>
            <span class="badge ${faseClass}" style="font-size:12px;padding:4px 14px;white-space:nowrap;">${faseLabel}</span>
          </div>

          <!-- 🔥 NOVO: Status e Data/Hora -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;background:var(--branco-fumaca);padding:8px 10px;border-radius:var(--border-radius);margin-bottom:8px;">
            <div><span style="color:var(--cinza-medio);">Status:</span> <span class="badge ${statusClass}" style="font-size:10px;">${statusLabel}</span></div>
            <div><span style="color:var(--cinza-medio);">Fase:</span> <strong>${faseLabel}</strong></div>
            <div><span style="color:var(--cinza-medio);">Início:</span> <strong>${dataInicio}</strong></div>
            <div><span style="color:var(--cinza-medio);">Encerramento:</span> <strong>${dataEncerramento}</strong></div>
            ${dataFinalizacao ? `<div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Finalização:</span> <strong>${dataFinalizacao}</strong></div>` : ""}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;background:var(--branco-fumaca);padding:10px 12px;border-radius:var(--border-radius);margin-bottom:12px;">
            <div><span style="color:var(--cinza-medio);">Data:</span> <strong>${dataFormatada}</strong></div>
            <div><span style="color:var(--cinza-medio);">Guarda:</span> <strong>${guardaNome}</strong></div>
            <div style="grid-column:span 2;"><span style="color:var(--cinza-medio);">Local:</span> <strong>${data.local_abordagem || "Não informado"}</strong></div>
          </div>

          ${
            data.motivo
              ? `
            <div style="margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 4px 0;font-size:13px;color:var(--cinza-escuro);"><i class="fas fa-info-circle"></i> Motivo</p>
              <p style="font-size:14px;color:var(--cinza-escuro);margin:0;background:var(--branco-fumaca);padding:8px 12px;border-radius:var(--border-radius);word-break:break-word;">${data.motivo}</p>
            </div>
          `
              : ""
          }

          ${
            data.observacoes
              ? `
            <div style="margin-bottom:12px;">
              <p style="font-weight:600;margin:0 0 4px 0;font-size:13px;color:var(--cinza-escuro);"><i class="fas fa-pencil-alt"></i> Observações</p>
              <p style="font-size:14px;color:var(--cinza-escuro);margin:0;background:var(--branco-fumaca);padding:8px 12px;border-radius:var(--border-radius);word-break:break-word;">${data.observacoes}</p>
            </div>
          `
              : ""
          }

          ${
            data.prazo
              ? `
            <div style="margin-bottom:12px;padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);border-left:4px solid var(--aviso);">
              <p style="margin:0;font-size:13px;color:#92400e;">
                <i class="fas fa-calendar-check" style="margin-right:6px;"></i>
                <strong>Prazo:</strong> ${new Date(data.prazo).toLocaleDateString("pt-BR")}
                ${data.status_regularizacao ? ` - <strong>Status:</strong> ${data.status_regularizacao}` : ""}
              </p>
            </div>
          `
              : ""
          }

          ${
            data.reincidencia_count > 0
              ? `
            <div style="margin-bottom:12px;padding:6px 12px;background:#fef3c7;border-radius:var(--border-radius);">
              <p style="margin:0;font-size:13px;color:#92400e;">
                <i class="fas fa-exclamation-triangle" style="color:var(--aviso);margin-right:6px;"></i>
                <strong>Reincidência:</strong> ${data.reincidencia_count + 1}ª abordagem
              </p>
            </div>
          `
              : ""
          }

          ${anexosHTML}

          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--cinza-claro);color:var(--cinza-escuro);border:none;cursor:pointer;min-width:80px;">
              Fechar
            </button>
            <button onclick="this.closest('.modal-overlay').remove(); window._consultaExportarDetalhePDF('${id}', '${tipo}')" class="btn-primary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);cursor:pointer;min-width:80px;">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
            <button onclick="this.closest('.modal-overlay').remove(); window._consultaConverterBO('${id}', '${tipo}')" class="btn-primary" style="flex:1;padding:10px;border-radius:12px;font-size:14px;font-weight:600;background:var(--gradiente-principal);color:var(--branco);border:none;cursor:pointer;min-width:80px;">
              <i class="fas fa-file-export" style="margin-right:6px;"></i> Converter em BO
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Adicionar event listeners para as imagens
    setTimeout(() => {
      const container = document.getElementById(`galeria-imagens-${id}`);
      if (container) {
        container.addEventListener("click", function (e) {
          const thumb = e.target.closest(".consulta-imagem-thumb");
          if (thumb) {
            const url = thumb.dataset.url;
            const nome = thumb.dataset.nome || "Imagem";
            const imagensData = thumb.dataset.imagens;

            try {
              if (imagensData) {
                const imagens = JSON.parse(imagensData);
                const index = parseInt(thumb.dataset.index) || 0;
                window._consultaAbrirCarrossel(imagens, index, appInstance);
              } else if (url) {
                window.open(url, "_blank");
              }
            } catch (error) {
              console.error("Erro ao abrir imagem:", error);
              if (url) {
                window.open(url, "_blank");
              }
            }
          }
        });
      }
    }, 100);

    // Registrar função para abrir carrossel por ID
    window._consultaAbrirCarrosselPorId = function (avisoId) {
      const imagens = estado._imagensModal && estado._imagensModal[avisoId];
      if (imagens && imagens.length > 0) {
        window._consultaAbrirCarrossel(imagens, 0, appInstance);
      } else if (appInstance && appInstance.showToast) {
        appInstance.showToast("Nenhuma imagem disponível", "info");
      }
    };
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
