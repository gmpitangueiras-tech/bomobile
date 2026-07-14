/**
 * MÓDULO UTILS - Funções auxiliares
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo contém funções de formatação, validação, data/hora,
 * geolocalização, compressão de imagens e utilitários gerais.
 * É independente e pode ser usado por qualquer outro módulo.
 *
 * MELHORIAS APLICADAS:
 * - Fuso horário com cache e fallback
 * - Máscaras para CPF, placa e telefone
 * - Hash SHA-256 para imagens
 * - Debounce e Throttle
 * - Cache de dados estáticos em localStorage
 * - Compressão otimizada de imagens
 */

// ============================================
// CONSTANTES
// ============================================

const FUSO_BRASILIA = "America/Sao_Paulo";
const TIMEZONE_OFFSET_BRASILIA = -3; // UTC-3 em horas
const CACHE_DURATION_MS = 60000; // 1 minuto de cache para o horário
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const CACHE_PREFIX = "guarda_cache_";
const CACHE_EXPIRY_MS = 3600000; // 1 hora para cache de dados estáticos
const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
const MAX_IMAGE_WIDTH = 800;
const IMAGE_QUALITY = 0.7;

// ============================================
// CACHE DE HORÁRIO
// ============================================

let horarioCache = {
  data: null,
  timestamp: 0,
  fonte: "none",
};

// ============================================
// DATA E HORA - FUSO HORÁRIO CONFIÁVEL
// ============================================

/**
 * Obtém a data/hora atual do dispositivo SEM ajuste de fuso
 * Prioridade: horário da internet (worldtimeapi) > horário do dispositivo
 * Com cache para evitar múltiplas requisições
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<Date>}
 */
export async function obterDataHoraPrecisa(forceRefresh = false) {
  // Verificar cache
  const now = Date.now();
  if (
    !forceRefresh &&
    horarioCache.data &&
    now - horarioCache.timestamp < CACHE_DURATION_MS
  ) {
    console.log("📅 Usando horário em cache (fonte:", horarioCache.fonte, ")");
    return new Date(horarioCache.data);
  }

  console.log("🔄 Obtendo horário preciso...");

  // Tentativas de obter horário da internet
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
    try {
      console.log(
        `🌐 Tentativa ${tentativa}/${MAX_RETRIES} - Obtendo horário da internet...`,
      );

      const response = await fetch(
        "https://worldtimeapi.org/api/timezone/America/Sao_Paulo",
        {
          signal: AbortSignal.timeout(5000),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const dataHora = new Date(data.datetime);

        if (!isNaN(dataHora.getTime())) {
          console.log("✅ Horário obtido da internet:", dataHora.toISOString());
          horarioCache = {
            data: dataHora.getTime(),
            timestamp: now,
            fonte: "internet",
          };
          return dataHora;
        }
        throw new Error("Data inválida recebida da API");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      console.warn(`⚠️ Tentativa ${tentativa} falhou:`, error.message);
      ultimoErro = error;
      if (tentativa < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // Fallback: usar a data do dispositivo SEM ajuste
  console.warn("⚠️ Falha ao obter horário da internet, usando dispositivo");
  const agora = new Date();

  // Verificar se a data é válida
  if (isNaN(agora.getTime())) {
    console.error("❌ Data do dispositivo inválida, usando timestamp atual");
    const timestamp = Date.now();
    const emergencyDate = new Date(timestamp);
    horarioCache = {
      data: timestamp,
      timestamp: now,
      fonte: "emergencia",
    };
    return emergencyDate;
  }

  horarioCache = {
    data: agora.getTime(),
    timestamp: now,
    fonte: "dispositivo",
  };

  return agora;
}

/**
 * Obtém data/hora atual no formato ISO (data do dispositivo SEM ajuste)
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterDataHoraBrasiliaISO(forceRefresh = false) {
  const date = await obterDataHoraPrecisa(forceRefresh);
  if (isNaN(date.getTime())) {
    console.warn("⚠️ Data inválida, usando fallback");
    return new Date().toISOString();
  }
  // Retornar a data exata do dispositivo, sem conversão
  return date.toISOString();
}

/**
 * Obtém a data atual no formato YYYY-MM-DD (data do dispositivo SEM ajuste)
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterDataAtualISO(forceRefresh = false) {
  const date = await obterDataHoraPrecisa(forceRefresh);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Obtém a hora atual formatada (HH:mm) (hora do dispositivo SEM ajuste)
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterHoraAtual(forceRefresh = false) {
  const date = await obterDataHoraPrecisa(forceRefresh);
  if (isNaN(date.getTime())) {
    return new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Obtém a data/hora atual para input datetime-local (data do dispositivo SEM ajuste)
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterDataHoraInput(forceRefresh = false) {
  const date = await obterDataHoraPrecisa(forceRefresh);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }
  return date.toISOString().slice(0, 16);
}

/**
 * Formata uma data/hora para exibição no padrão brasileiro
 * @param {string|Date} date - Data a ser formatada
 * @param {boolean} includeSeconds - Incluir segundos?
 * @returns {string}
 */
export function formatarDataHoraLocal(date, includeSeconds = false) {
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
 * Formata uma data para input date (YYYY-MM-DD)
 * @param {string|Date} date - Data a ser formatada
 * @returns {string}
 */
export function formatarDataInput(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Formata uma data para input datetime-local (YYYY-MM-DDTHH:mm)
 * @param {string|Date} date - Data a ser formatada
 * @returns {string}
 */
export function formatarDataHoraInput(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset();
  const adjusted = new Date(d.getTime() - offset * 60000);
  return adjusted.toISOString().slice(0, 16);
}

/**
 * Calcula a diferença em minutos entre duas datas
 * @param {string|Date} dataInicio - Data de início
 * @param {string|Date} dataFim - Data de fim
 * @returns {number}
 */
export function calcularDiferencaMinutos(dataInicio, dataFim) {
  const inicio = typeof dataInicio === "string" ? new Date(dataInicio) : dataInicio;
  const fim = typeof dataFim === "string" ? new Date(dataFim) : dataFim;
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return 0;
  return (fim.getTime() - inicio.getTime()) / (1000 * 60);
}

/**
 * Formata minutos em horas e minutos
 * @param {number} minutos - Total de minutos
 * @returns {string}
 */
export function formatarMinutos(minutos) {
  if (minutos < 1) return "< 1 min";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  const mins = Math.round(minutos % 60);
  return `${horas}h ${mins}min`;
}

// ============================================
// MÁSCARAS DE FORMATAÇÃO
// ============================================

/**
 * Aplica máscara de CPF enquanto o usuário digita
 * @param {string} value - Valor atual do campo
 * @returns {string} Valor com máscara aplicada
 */
export function aplicarMascaraCPF(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 3) return limpo;
  if (limpo.length <= 6) return limpo.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (limpo.length <= 9) return limpo.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

/**
 * Aplica máscara de telefone enquanto o usuário digita
 * @param {string} value - Valor atual do campo
 * @returns {string} Valor com máscara aplicada
 */
export function aplicarMascaraTelefone(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 2) return `(${limpo}`;
  if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
  if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
}

/**
 * Aplica máscara de placa de veículo (formato Mercosul ou antigo)
 * @param {string} value - Valor atual do campo
 * @returns {string} Valor com máscara aplicada (uppercase)
 */
export function aplicarMascaraPlaca(value) {
  let upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (upper.length > 7) upper = upper.slice(0, 7);
  if (upper.length === 0) return "";
  if (upper.length <= 3) return upper;
  if (upper.length <= 4) return `${upper.slice(0, 3)}${upper.slice(3)}`;
  if (upper.length <= 6) return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4)}`;
  return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4, 5)}${upper.slice(5, 7)}`;
}

/**
 * Formata CPF com máscara, e oculta parcialmente para não-supervisores
 * @param {string} cpf - CPF (pode vir com ou sem formatação)
 * @param {boolean} forceFull - Forçar exibição completa
 * @returns {string}
 */
export function formatarCPFSeguro(cpf, forceFull = false) {
  if (!cpf) return "***.***.***-**";
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;

  const isSupervisor = typeof authManager !== "undefined" && authManager.isSupervisor();
  if (isSupervisor || forceFull) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return `***.${limpo.substring(3, 6)}.***-${limpo.substring(9, 11)}`;
}

// ============================================
// FORMATAÇÃO DE TAMANHO DE ARQUIVO
// ============================================

/**
 * Formata bytes em KB ou MB
 * @param {number} bytes
 * @returns {string}
 */
export function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ============================================
// LABELS E MAPEAMENTOS
// ============================================

/**
 * Retorna a classe CSS para o status da ocorrência
 * @param {string} status
 * @returns {string}
 */
export function getStatusClass(status) {
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
export function getStatusLabel(status) {
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
 * Retorna o label do tipo de ocorrência
 * @param {string} value
 * @param {Array} tiposList - Lista de opções {value, label}
 * @returns {string}
 */
export function getTipoLabel(value, tiposList = []) {
  if (!value) return "Não informado";
  const found = tiposList.find((t) => t.value === value);
  return found ? found.label : value;
}

/**
 * Retorna o label do tipo de envolvido
 * @param {string} tipo
 * @returns {string}
 */
export function getTipoEnvolvidoLabel(tipo) {
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
 * Retorna o ícone Font Awesome para o tipo de anexo
 * @param {string} tipo
 * @returns {string}
 */
export function getIconAnexo(tipo) {
  const icons = {
    image: "fa-image",
    video: "fa-video",
    document: "fa-file-pdf",
    audio: "fa-music",
  };
  return icons[tipo] || "fa-file";
}

// ============================================
// GEOLOCALIZAÇÃO
// ============================================

/**
 * Obtém a localização atual do dispositivo via GPS
 * @param {Object} options - Opções do geolocation
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export function obterLocalizacao(options = {}) {
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
        ...options,
      },
    );
  });
}

/**
 * Calcula a distância entre dois pontos em metros (fórmula de Haversine)
 * @param {number} lat1 - Latitude do ponto 1
 * @param {number} lon1 - Longitude do ponto 1
 * @param {number} lat2 - Latitude do ponto 2
 * @param {number} lon2 - Longitude do ponto 2
 * @returns {number} Distância em metros
 */
export function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================
// OBTENÇÃO DE IP PÚBLICO
// ============================================

/**
 * Obtém o IP público do usuário
 * @returns {Promise<string|null>}
 */
export async function obterIP() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn("⚠️ Erro ao obter IP:", error);
    return null;
  }
}

// ============================================
// GERADOR DE UUID
// ============================================

/**
 * Gera um UUID v4
 * @returns {string}
 */
export function gerarUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================
// COMPRESSÃO DE IMAGEM E HASH
// ============================================

/**
 * Comprime uma imagem para reduzir tamanho e dimensões
 * @param {File} file - Arquivo de imagem
 * @param {number} maxWidth - Largura máxima (padrão: 800)
 * @param {number} quality - Qualidade JPEG (0-1, padrão: 0.7)
 * @param {string} outputType - Tipo de saída ('image/jpeg' ou 'image/webp')
 * @returns {Promise<File>}
 */
export function comprimirImagem(
  file,
  maxWidth = MAX_IMAGE_WIDTH,
  quality = IMAGE_QUALITY,
  outputType = "image/jpeg",
) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    // Se o arquivo já é pequeno, não comprime
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
                type: outputType,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          outputType,
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

/**
 * Gera um hash SHA-256 de um arquivo
 * @param {File|Blob} file - Arquivo para gerar hash
 * @returns {Promise<string|null>}
 */
export async function gerarHashArquivo(file) {
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

// ============================================
// CACHE DE DADOS ESTÁTICOS (localStorage)
// ============================================

/**
 * Salva dados em cache no localStorage
 * @param {string} key - Chave do cache
 * @param {any} data - Dados a serem armazenados
 * @param {number} expiryMs - Tempo de expiração em ms (padrão: 1 hora)
 */
export function setCachedData(key, data, expiryMs = CACHE_EXPIRY_MS) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cacheData = {
      data: data,
      timestamp: Date.now(),
      expiry: expiryMs,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn("Erro ao salvar cache:", error);
  }
}

/**
 * Recupera dados do cache
 * @param {string} key - Chave do cache
 * @param {any} defaultValue - Valor padrão se não encontrar
 * @returns {any} Dados do cache ou valor padrão
 */
export function getCachedData(key, defaultValue = null) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return defaultValue;

    const cacheData = JSON.parse(cached);
    const now = Date.now();

    if (now - cacheData.timestamp > cacheData.expiry) {
      localStorage.removeItem(cacheKey);
      return defaultValue;
    }

    return cacheData.data;
  } catch (error) {
    console.warn("Erro ao recuperar cache:", error);
    return defaultValue;
  }
}

/**
 * Limpa um item do cache
 * @param {string} key - Chave do cache
 */
export function clearCachedData(key) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn("Erro ao limpar cache:", error);
  }
}

/**
 * Limpa todo o cache do sistema
 */
export function clearAllCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("Erro ao limpar todo o cache:", error);
  }
}

// ============================================
// DEBOUNCE E THROTTLE
// ============================================

/**
 * Cria uma função com debounce (atrasa a execução)
 * @param {Function} func - Função a ser executada
 * @param {number} delay - Delay em ms (padrão: 300)
 * @returns {Function} Função com debounce
 */
export function debounce(func, delay = 300) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Cria uma função com throttle (limita a execução)
 * @param {Function} func - Função a ser executada
 * @param {number} limit - Limite em ms (padrão: 300)
 * @returns {Function} Função com throttle
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================
// DIALOGOS DE CONFIRMAÇÃO E INPUT
// ============================================

/**
 * Exibe um modal de confirmação (Sim/Não)
 * @param {string} mensagem - Texto da confirmação
 * @param {string} titulo - Título do modal
 * @returns {Promise<boolean>}
 */
export function confirmar(mensagem, titulo = "Confirmar") {
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
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._confirmResolve(false);">
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

/**
 * Exibe um modal com um campo de texto para entrada
 * @param {string} mensagem - Texto explicativo
 * @param {string} titulo - Título do modal
 * @param {string} placeholder - Placeholder do textarea
 * @param {number} minLength - Tamanho mínimo (padrão: 5)
 * @returns {Promise<string|null>}
 */
export function inputModal(
  mensagem,
  titulo = "Informe o motivo",
  placeholder = "Digite o motivo...",
  minLength = 5,
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
            <label for="inputModalMotivo">Motivo <span class="required">*</span></label>
            <textarea id="inputModalMotivo" class="form-control" rows="3" placeholder="${placeholder}" required></textarea>
            <div class="input-hint">
              <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
              Mínimo ${minLength} caracteres
            </div>
          </div>
        </div>
        <div class="modal-footer" style="flex-direction:row;gap:10px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._inputResolve(null);" style="flex:1;">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="window._confirmarInputModal()" style="flex:1;">
            <i class="fas fa-check" style="margin-right:6px;"></i> Confirmar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    window._inputResolve = resolve;

    setTimeout(() => {
      const textarea = document.getElementById("inputModalMotivo");
      if (textarea) textarea.focus();
    }, 300);

    window._confirmarInputModal = function() {
      const textarea = document.getElementById("inputModalMotivo");
      if (!textarea) return;
      const valor = textarea.value.trim();
      if (valor.length < minLength) {
        if (window.app && typeof window.app.showToast === "function") {
          window.app.showToast(
            `O motivo deve ter pelo menos ${minLength} caracteres`,
            "warning",
          );
        } else {
          alert(`O motivo deve ter pelo menos ${minLength} caracteres`);
        }
        return;
      }
      const overlayEl = textarea.closest(".modal-overlay");
      if (overlayEl) {
        window._inputResolve(valor);
        overlayEl.remove();
      }
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });

    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (window._confirmarInputModal) window._confirmarInputModal();
      }
    });
  });
}

// ============================================
// FUNÇÕES DE APOIO PARA RELATÓRIOS
// ============================================

/**
 * Calcula o número de dias entre duas datas
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @returns {number}
 */
export function calcularDiasPeriodo(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  return Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Retorna a data anterior a um período (mesmo intervalo)
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @returns {string}
 */
export function calcularDataAnterior(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const diff = fim - inicio;
  const data = new Date(inicio);
  data.setTime(data.getTime() - diff);
  return data.toISOString().slice(0, 10);
}

/**
 * Obtém o primeiro dia do mês atual no formato YYYY-MM-DD
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterPrimeiroDiaMes(forceRefresh = false) {
  const date = await obterDataHoraPrecisa(forceRefresh);
  if (isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setDate(1);
    return fallback.toISOString().slice(0, 10);
  }
  const data = new Date(date);
  data.setDate(1);
  return data.toISOString().slice(0, 10);
}

/**
 * Obtém a data atual no formato YYYY-MM-DD
 * @param {boolean} forceRefresh - Forçar atualização do cache
 * @returns {Promise<string>}
 */
export async function obterDataAtual(forceRefresh = false) {
  return obterDataAtualISO(forceRefresh);
}

// ============================================
// VALIDAÇÕES
// ============================================

/**
 * Valida se um CPF é válido
 * @param {string} cpf - CPF com ou sem máscara
 * @returns {boolean}
 */
export function validarCPF(cpf) {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let digito1 = resto >= 10 ? 0 : resto;
  if (digito1 !== parseInt(limpo.charAt(9))) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let digito2 = resto >= 10 ? 0 : resto;
  return digito2 === parseInt(limpo.charAt(10));
}

/**
 * Valida se um email é válido
 * @param {string} email - Email a ser validado
 * @returns {boolean}
 */
export function validarEmail(email) {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valida se uma placa é válida (formato Mercosul ou antigo)
 * @param {string} placa - Placa a ser validada
 * @returns {boolean}
 */
export function validarPlaca(placa) {
  const limpo = placa.replace(/[^A-Z0-9]/g, "").toUpperCase();
  if (limpo.length !== 7) return false;
  const mercosul = /^[A-Z]{3}[0-9][A-Z]{2}[0-9]$/;
  const antigo = /^[A-Z]{3}[0-9]{4}$/;
  return mercosul.test(limpo) || antigo.test(limpo);
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  // Data/Hora
  obterDataHoraPrecisa,
  obterDataHoraBrasiliaISO,
  obterDataAtualISO,
  obterHoraAtual,
  obterDataHoraInput,
  formatarDataHoraLocal,
  formatarDataInput,
  formatarDataHoraInput,
  calcularDiferencaMinutos,
  formatarMinutos,

  // Máscaras
  formatarCPFSeguro,
  aplicarMascaraCPF,
  aplicarMascaraTelefone,
  aplicarMascaraPlaca,

  // Formatação
  formatarTamanho,

  // Labels
  getStatusClass,
  getStatusLabel,
  getTipoLabel,
  getTipoEnvolvidoLabel,
  getIconAnexo,

  // Geolocalização
  obterLocalizacao,
  calcularDistancia,

  // IP
  obterIP,

  // UUID
  gerarUUID,

  // Imagens
  comprimirImagem,
  gerarHashArquivo,

  // Cache
  setCachedData,
  getCachedData,
  clearCachedData,
  clearAllCache,

  // Modais
  confirmar,
  inputModal,

  // Relatórios
  calcularDiasPeriodo,
  calcularDataAnterior,
  obterPrimeiroDiaMes,
  obterDataAtual,

  // Validações
  validarCPF,
  validarEmail,
  validarPlaca,

  // Utilitários
  debounce,
  throttle,
};
