/**
 * CONFIGURAÇÕES DO SISTEMA
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este arquivo contém todas as configurações centralizadas do sistema:
 * - Supabase (URL e chave anônima)
 * - Dados da Guarda Municipal
 * - Versão do sistema
 * - Configurações de sincronização
 * - Configurações de cache
 * - Timeouts e intervalos
 * - Configurações de notificações push
 * - Configurações de fuso horário
 * - Limites e thresholds
 *
 * MELHORIAS APLICADAS:
 * - Configurações de notificações push (VAPID, URL, ícones)
 * - Configurações de fuso horário (timezone, offset)
 * - Configurações de cache (tempo, tamanho)
 * - Configurações de sync (intervalo, retry)
 * - Configurações de performance (debounce, throttle)
 * - Configurações de geolocalização (precisão, timeout)
 * - Configurações de segurança (criptografia, tentativas)
 * - Constantes centralizadas para facilitar manutenção
 * - 🔥 ALTERADO: Removido MAX_ANEXOS (agora ilimitado)
 * - 🔥 NOVO: Configurações para retificações de abordagens
 * - 🔥 NOVO: Configurações para notificações
 * - 🔥 NOVO: Configurações de limites para abordagens
 * - 🔥 NOVO: Configurações para data/hora finalização
 */

// ============================================
// CONFIGURAÇÕES PRINCIPAIS
// ============================================

const CONFIG = {
  // ============================================
  // SUPABASE
  // ============================================
  SUPABASE_URL: "https://wswezvcxfljzcttpqkch.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_7sjVXv2VD1D2kQ7kHOraYg_KVVC7Tiy",

  // ============================================
  // DADOS DA GUARDA MUNICIPAL
  // ============================================
  MUNICIPIO: "Pitangueiras",
  ESTADO: "Paraná",
  GUARDA_NOME: "Guarda Municipal de Pitangueiras",
  VERSAO: "1.0.0-v90",
  BUILD: "v90-avatar-global",

  // ============================================
  // SINCERONIZAÇÃO (SYNC)
  // ============================================
  SYNC_INTERVAL: 300000, // 5 minutos em milissegundos
  SYNC_RETRY_DELAY: 30000, // 30 segundos entre tentativas
  SYNC_MAX_RETRIES: 5, // Máximo de tentativas de sincronização
  SYNC_BATCH_SIZE: 50, // Quantos registros por lote

  // ============================================
  // CACHE
  // ============================================
  CACHE_EXPIRY: 60000, // 1 minuto para dados dinâmicos
  CACHE_STATIC_EXPIRY: 3600000, // 1 hora para dados estáticos
  CACHE_MAX_ITEMS: 100, // Máximo de itens em cache
  CACHE_VERSION: 4, // Versão do cache (para limpeza)

  // ============================================
  // SESSÃO
  // ============================================
  SESSION_TIMEOUT: 30, // 30 minutos
  SESSION_MIN_TIMEOUT: 5, // Mínimo 5 minutos
  SESSION_MAX_TIMEOUT: 120, // Máximo 2 horas
  SESSION_WARNING_5MIN: 300000, // 5 minutos
  SESSION_WARNING_1MIN: 60000, // 1 minuto
  SESSION_CHECK_INTERVAL: 30000, // 30 segundos

  // ============================================
  // GPS E GEOLOCALIZAÇÃO
  // ============================================
  GPS_ENABLE_HIGH_ACCURACY: true,
  GPS_TIMEOUT: 15000, // 15 segundos
  GPS_MAXIMUM_AGE: 60000, // 1 minuto
  GPS_MOVEMENT_THRESHOLD: 100, // 100 metros para detectar movimento
  GPS_WATCH_INTERVAL: 30000, // 30 segundos entre atualizações

  // ============================================
  // FUSO HORÁRIO
  // ============================================
  TIMEZONE: "America/Sao_Paulo",
  TIMEZONE_OFFSET: -3, // UTC-3
  TIMEZONE_API: "https://worldtimeapi.org/api/timezone/America/Sao_Paulo",
  TIMEZONE_CACHE_DURATION: 60000, // 1 minuto

  // ============================================
  // NOTIFICAÇÕES PUSH
  // ============================================
  PUSH: {
    VAPID_PUBLIC_KEY:
      "BEl62iU3gU0tG3tW5x8vK6oQ3pM1N7oK2lN9sP0rS5tV6wX9yZ4aB7cD8eF0gH1iJ2kL3mN4oP5qR6sT7uV8wX9yZ0",
    VAPID_PRIVATE_KEY: "", // Mantido em segredo no servidor
    APPLICATION_SERVER_KEY:
      "BEl62iU3gU0tG3tW5x8vK6oQ3pM1N7oK2lN9sP0rS5tV6wX9yZ4aB7cD8eF0gH1iJ2kL3mN4oP5qR6sT7uV8wX9yZ0",
    ICON: "/assets/icons/icon-192x192.ico",
    BADGE: "/assets/icons/icon-192x192.ico",
    SOUND: "/assets/sounds/notification.mp3",
    VIBRATE_PATTERN: [200, 100, 200],
    REQUIRES_INTERACTION: true,
    TTL: 86400, // 24 horas
    TOPICS: {
      RETIFICACOES: "retificacoes",
      RETIFICACOES_ABORDAGENS: "retificacoes_abordagens",
      NOVAS_OCORRENCIAS: "novas_ocorrencias",
      NOVAS_ABORDAGENS: "novas_abordagens",
      MURAL: "mural",
      SISTEMA: "sistema",
    },
  },

  // ============================================
  // SEGURANÇA
  // ============================================
  SECURITY: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 900000, // 15 minutos
    ENCRYPTION_ALGORITHM: "AES-GCM",
    ENCRYPTION_KEY_LENGTH: 256,
    SALT_ROUNDS: 10,
    SESSION_COOKIE_SECURE: true,
    CSP_POLICY:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://wswezvcxfljzcttpqkch.supabase.co; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://wswezvcxfljzcttpqkch.supabase.co; connect-src 'self' https://wswezvcxfljzcttpqkch.supabase.co https://api.ipify.org https://worldtimeapi.org; font-src 'self' https://cdnjs.cloudflare.com;",
  },

  // ============================================
  // PERFORMANCE
  // ============================================
  PERFORMANCE: {
    DEBOUNCE_DELAY: 300, // ms para debounce de buscas
    THROTTLE_DELAY: 300, // ms para throttle de eventos
    LAZY_LOAD_THRESHOLD: 200, // px para lazy loading
    PULL_REFRESH_THRESHOLD: 80, // px para pull-to-refresh
    MAX_CONCURRENT_REQUESTS: 6,
    ENABLE_WEB_WORKERS: true,
    ENABLE_LAZY_LOADING: true,
    ENABLE_IMAGE_COMPRESSION: true,
    IMAGE_QUALITY: 0.7,
    IMAGE_MAX_WIDTH: 800,
    IMAGE_MAX_SIZE: 1048576, // 1MB
  },

  // ============================================
  // LIMITES E THRESHOLDS
  // ============================================
  LIMITS: {
    // 🔥 ALTERADO: MAX_ANEXOS removido - agora ilimitado
    // MAX_ANEXOS: 5, // REMOVIDO - Substituído por ANEXOS_ILIMITADO: true
    ANEXOS_ILIMITADO: true, // 🔥 NOVO: Indica que anexos são ilimitados
    MAX_IMAGE_SIZE: 10485760, // 10MB (mantido para controle de tamanho individual)
    MAX_FILE_SIZE: 20971520, // 20MB (mantido para controle de tamanho individual)
    MAX_COMENTARIOS: 100,
    MAX_REACOES: 50,
    MAX_ENVOLVIDOS: 20,
    MAX_OCORRENCIAS_PAGE: 100,
    MAX_ABORDAGENS_PAGE: 50,
    SEARCH_MIN_CHARS: 2,
    REINCIDENCIA_ADVERTENCIA: 2,
    REINCIDENCIA_MULTA: 4,
    // 🔥 NOVO: Limites para abordagens
    ABORDAGENS: {
      MAX_FOTOS: null, // null = ilimitado
      MAX_TAMANHO_TOTAL_MB: 50, // 50MB total
      MAX_TAMANHO_ARQUIVO_MB: 10, // 10MB por arquivo
      PRAZO_MAXIMO_DIAS: 180, // 180 dias
    },
    // 🔥 NOVO: Limites para retificações
    RETIFICACOES: {
      JUSTIFICATIVA_MIN_CARACTERES: 10,
      MAX_CAMPOS_ALTERADOS: 20,
      PRAZO_MAXIMO_DIAS: 30, // 30 dias para retificação
    },
    // 🔥 NOVO: Limites para notificações
    NOTIFICACOES: {
      MAX_POR_USUARIO: 100,
      RETENCAO_DIAS: 30, // 30 dias
      INTERVALO_VERIFICACAO: 30000, // 30 segundos
      MAX_BADGE: 99,
    },
  },

  // ============================================
  // INTERVALOS DE ATUALIZAÇÃO
  // ============================================
  INTERVALS: {
    DASHBOARD_UPDATE: 60000, // 1 minuto
    MURAL_UPDATE: 300000, // 5 minutos
    CONSULTA_UPDATE: 60000, // 1 minuto
    RELATORIOS_UPDATE: 300000, // 5 minutos
    NOTIFICACOES_CHECK: 30000, // 30 segundos 🔥 ALTERADO (era 60000)
    GPS_UPDATE: 30000, // 30 segundos
    RETIFICACOES_CHECK: 60000, // 1 minuto 🔥 NOVO
    ABORDAGENS_CHECK: 60000, // 1 minuto 🔥 NOVO
  },

  // ============================================
  // URLs E ENDPOINTS
  // ============================================
  URLS: {
    API_IP: "https://api.ipify.org?format=json",
    TIMEZONE_API: "https://worldtimeapi.org/api/timezone/America/Sao_Paulo",
    STORAGE_BUCKET: "anexos",
    MAP_TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    MAP_ATTRIBUTION:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    // 🔥 NOVO: URLs para notificações
    NOTIFICACOES_ICON: "/assets/icons/icon-192x192.png",
    NOTIFICACOES_BADGE: "/assets/icons/icon-192x192.png",
  },

  // ============================================
  // LABELS E MAPEAMENTOS
  // ============================================
  STATUS: {
    DRAFT: "draft",
    PENDING_SYNC: "pending_sync",
    SYNCED: "synced",
    CANCELLED: "cancelled",
    RECTIFIED: "rectified",
    PENDING_RECTIFICATION: "pending_rectification",
    RECTIFICATION_REJECTED: "rectification_rejected",
    // 🔥 NOVO: Status para abordagens
    ABORDAGEM_ATIVA: "ativa",
    ABORDAGEM_ENCERRADA: "encerrada",
    ABORDAGEM_FINALIZADA: "finalizada",
    ABORDAGEM_CANCELADA: "cancelada",
    // 🔥 NOVO: Status para retificações de abordagens
    RETIFICACAO_ABORDAGEM_PENDENTE: "pending_rectification",
    RETIFICACAO_ABORDAGEM_APROVADA: "rectified",
    RETIFICACAO_ABORDAGEM_REJEITADA: "rectification_rejected",
  },

  PERFIS: {
    GUARDA: "guarda",
    SUPERVISOR: "supervisor",
  },

  // ============================================
  // TEXTOS E MENSAGENS
  // ============================================
  MESSAGES: {
    LOGIN_SUCCESS: "Login realizado com sucesso!",
    LOGIN_ERROR: "Erro ao realizar login. Verifique suas credenciais.",
    LOGOUT_SUCCESS: "Logout realizado com sucesso!",
    SESSION_EXPIRED: "Sessão expirada. Faça login novamente.",
    SESSION_WARNING_5MIN: "Sua sessão expirará em 5 minutos por inatividade.",
    SESSION_WARNING_1MIN: "Sua sessão expirará em 1 minuto!",
    OFFLINE_MODE:
      "Modo offline ativado. Os dados serão sincronizados quando a conexão for restaurada.",
    ONLINE_MODE: "Conexão restaurada. Sincronizando dados...",
    SYNC_SUCCESS: "Dados sincronizados com sucesso!",
    SYNC_ERROR: "Erro ao sincronizar dados. Tentando novamente...",
    NO_INTERNET:
      "Sem conexão com a internet. Algumas funcionalidades podem estar limitadas.",
    // 🔥 NOVO: Mensagens para retificações
    RETIFICACAO_SOLICITADA: "Solicitação de retificação enviada com sucesso!",
    RETIFICACAO_APROVADA: "Retificação aprovada com sucesso!",
    RETIFICACAO_REJEITADA: "Retificação rejeitada.",
    RETIFICACAO_PENDENTE: "Aguardando análise do supervisor.",
    // 🔥 NOVO: Mensagens para abordagens
    ABORDAGEM_SALVA: "Abordagem registrada com sucesso!",
    ABORDAGEM_FINALIZADA: "Abordagem finalizada com sucesso!",
    ABORDAGEM_ENCERRADA: "Abordagem encerrada com sucesso!",
    ABORDAGEM_CANCELADA: "Abordagem cancelada.",
    // 🔥 NOVO: Mensagens para notificações
    NOTIFICACOES_MARCADAS: "Todas as notificações marcadas como lidas.",
    NOTIFICACOES_VAZIAS: "Nenhuma notificação encontrada.",
    NOTIFICACAO_NOVA: "🔔 Nova notificação!",
    NOTIFICACOES_NAO_LIDAS: (n) =>
      `Você tem ${n} notificação(ões) não lida(s).`,
  },

  // ============================================
  // CHAVES DE CACHE
  // ============================================
  CACHE_KEYS: {
    TIPOS_OCORRENCIA: "tipos_ocorrencia",
    USUARIOS: "usuarios",
    CONFIGURACOES: "configuracoes",
    STATS: "stats",
    MURAL_AVISOS: "mural_avisos_cache",
    DASHBOARD_STATS: "dashboard_stats",
    DASHBOARD_OCORRENCIAS: "dashboard_ocorrencias",
    SESSION_STATE: "session_state",
    ENCRYPTION_KEY: "encryption_key",
    // 🔥 NOVO: Chaves para notificações
    NOTIFICACOES_NAO_LIDAS: "notificacoes_nao_lidas",
    NOTIFICACOES_ULTIMA_VERIFICACAO: "notificacoes_ultima_verificacao",
    // 🔥 NOVO: Chaves para abordagens
    ABORDAGENS_CACHE: "abordagens_cache",
    ABORDAGENS_STATS: "abordagens_stats",
    // 🔥 NOVO: Chaves para retificações de abordagens
    RETIFICACOES_ABORDAGENS_CACHE: "retificacoes_abordagens_cache",
  },

  // ============================================
  // TEMAS E CORES
  // ============================================
  THEME: {
    PRIMARY: "#003F87",
    SECONDARY: "#00843D",
    SUCCESS: "#00843D",
    ERROR: "#DC2626",
    WARNING: "#F59E0B",
    INFO: "#003F87",
    DARK: "#1E293B",
    LIGHT: "#F1F5F9",
    // 🔥 NOVO: Cores para tipos de retificação
    RETIFICACAO_BO: "#003F87",
    RETIFICACAO_VEICULO: "#00843D",
    RETIFICACAO_PESSOA: "#8B5CF6",
    // 🔥 NOVO: Cores para status de abordagem
    ABORDAGEM_ATIVA_COLOR: "#00843D",
    ABORDAGEM_ENCERRADA_COLOR: "#F59E0B",
    ABORDAGEM_FINALIZADA_COLOR: "#003F87",
    ABORDAGEM_CANCELADA_COLOR: "#DC2626",
    GRADIENT_PRIMARY: "linear-gradient(135deg, #003F87 0%, #00843D 100%)",
    GRADIENT_HEADER: "linear-gradient(90deg, #002D62 0%, #006B31 100%)",
  },

  // ============================================
  // UNIDADES DE MEDIDA
  // ============================================
  UNITS: {
    METERS_TO_MOVE: 100,
    TIMEOUT_SECONDS: 30,
    RETRY_DELAY_SECONDS: 30,
    MAX_RETRIES: 5,
    BATCH_SIZE: 50,
    MAX_ITEMS_CACHE: 100,
    // 🔥 ALTERADO: MAX_ANEXOS removido
    // MAX_ANEXOS: 5, // REMOVIDO
    MAX_IMAGE_SIZE_MB: 10,
    MAX_FILE_SIZE_MB: 20,
    // 🔥 NOVO: Unidades para notificações
    NOTIFICACOES_RETENCAO_DIAS: 30,
    NOTIFICACOES_INTERVALO_VERIFICACAO: 30, // segundos
    // 🔥 NOVO: Unidades para retificações
    RETIFICACAO_JUSTIFICATIVA_MIN: 10, // caracteres
    RETIFICACAO_PRAZO_MAXIMO_DIAS: 30,
    // 🔥 NOVO: Unidades para abordagens
    ABORDAGEM_PRAZO_MAXIMO_DIAS: 180,
    ABORDAGEM_MAX_TAMANHO_TOTAL_MB: 50,
    ABORDAGEM_MAX_TAMANHO_ARQUIVO_MB: 10,
  },

  // ============================================
  // 🔥 NOVO: CONFIGURAÇÕES PARA RETIFICAÇÕES DE ABORDAGENS
  // ============================================
  RETIFICACOES_ABORDAGENS: {
    CAMPOS_RETIFICAVEIS_VEICULO: [
      "placa",
      "marca_modelo",
      "cor",
      "condutor_nome",
      "condutor_cpf",
      "local_abordagem",
      "motivo",
      "observacoes",
      "data_hora_inicio",
      "data_hora_encerramento",
    ],
    CAMPOS_RETIFICAVEIS_PESSOA: [
      "nome",
      "alcunha",
      "cpf",
      "rg",
      "caracteristicas_fisicas",
      "vestimentas",
      "local_abordagem",
      "motivo",
      "observacoes",
      "data_hora_inicio",
      "data_hora_encerramento",
    ],
    LABELS_VEICULO: {
      placa: "Placa",
      marca_modelo: "Marca/Modelo",
      cor: "Cor",
      condutor_nome: "Nome do Condutor",
      condutor_cpf: "CPF do Condutor",
      local_abordagem: "Local da Abordagem",
      motivo: "Motivo",
      observacoes: "Observações",
      data_hora_inicio: "Data/Hora Início",
      data_hora_encerramento: "Data/Hora Encerramento",
    },
    LABELS_PESSOA: {
      nome: "Nome",
      alcunha: "Alcunha",
      cpf: "CPF",
      rg: "RG",
      caracteristicas_fisicas: "Características Físicas",
      vestimentas: "Vestimentas",
      local_abordagem: "Local da Abordagem",
      motivo: "Motivo",
      observacoes: "Observações",
      data_hora_inicio: "Data/Hora Início",
      data_hora_encerramento: "Data/Hora Encerramento",
    },
  },

  // ============================================
  // 🔥 NOVO: CONFIGURAÇÕES PARA NOTIFICAÇÕES
  // ============================================
  NOTIFICACOES_CONFIG: {
    TIPOS: {
      NOVA_OCORRENCIA: {
        label: "Nova Ocorrência",
        icon: "fa-file-alt",
        cor: "#003F87",
        som: "notification.mp3",
      },
      NOVA_ABORDAGEM: {
        label: "Nova Abordagem",
        icon: "fa-search",
        cor: "#00843D",
        som: "notification.mp3",
      },
      NOVO_MURAL: {
        label: "Novo Aviso",
        icon: "fa-bullhorn",
        cor: "#8B5CF6",
        som: "notification.mp3",
      },
      RETIFICACAO_PENDENTE: {
        label: "Retificação Pendente",
        icon: "fa-clock",
        cor: "#F59E0B",
        som: "notification.mp3",
      },
      RETIFICACAO_APROVADA: {
        label: "Retificação Aprovada",
        icon: "fa-check-circle",
        cor: "#00843D",
        som: "notification.mp3",
      },
      RETIFICACAO_REJEITADA: {
        label: "Retificação Rejeitada",
        icon: "fa-times-circle",
        cor: "#DC2626",
        som: "notification.mp3",
      },
      RETIFICACAO_ABORDAGEM_PENDENTE: {
        label: "Retificação de Abordagem Pendente",
        icon: "fa-clock",
        cor: "#F59E0B",
        som: "notification.mp3",
      },
      RETIFICACAO_ABORDAGEM_APROVADA: {
        label: "Retificação de Abordagem Aprovada",
        icon: "fa-check-circle",
        cor: "#00843D",
        som: "notification.mp3",
      },
      RETIFICACAO_ABORDAGEM_REJEITADA: {
        label: "Retificação de Abordagem Rejeitada",
        icon: "fa-times-circle",
        cor: "#DC2626",
        som: "notification.mp3",
      },
      SISTEMA: {
        label: "Sistema",
        icon: "fa-cog",
        cor: "#6B7280",
        som: "notification.mp3",
      },
    },
    PRIORIDADES: {
      ALTA: "alta",
      MEDIA: "media",
      BAIXA: "baixa",
    },
    DURACOES: {
      TOAST: 4000, // 4 segundos
      PUSH_TTL: 86400, // 24 horas
    },
  },

  // ============================================
  // 🔥 NOVO: CONFIGURAÇÕES PARA DATA/HORA FINALIZAÇÃO
  // ============================================
  FINALIZACAO: {
    // Se true, data_hora_finalizacao é preenchida automaticamente
    AUTO_PREENCHE: true,
    // Campos que recebem data_hora_finalizacao
    TABELAS: ["ocorrencias", "abordagens_veiculos", "abordagens_pessoas"],
    // Status que disparam a finalização
    STATUS_FINALIZACAO: ["synced", "finalizada", "rectified"],
  },
};

// ============================================
// POLÍTICA TEMPORAL v47 — HORÁRIO CIVIL DO BRASIL
// ============================================
// Os campos operacionais do banco são timestamp sem fuso. O valor enviado
// deve ser a hora civil de America/Sao_Paulo, sem Z e sem offset, mesmo que o
// aparelho esteja com outro fuso configurado.
function obterPartesHorarioBrasil(valor = new Date()) {
  const date = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(date.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const out = {};
  for (const parte of partes) if (parte.type !== "literal") out[parte.type] = parte.value;
  return out;
}

function obterTimestampBrasilSemFuso(valor = new Date(), incluirSegundos = true) {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = typeof valor === "string" ? valor.trim() : "";
  // datetime-local já representa a hora civil brasileira: não reinterpretar.
  const local = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (local && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(texto)) {
    const base = `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}`;
    return incluirSegundos ? `${base}:${local[6] || "00"}` : base;
  }
  const partes = obterPartesHorarioBrasil(valor);
  if (!partes) return null;
  const base = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
  return incluirSegundos ? `${base}:${partes.second}` : base;
}

function obterDataHoraInputBrasil() {
  return obterTimestampBrasilSemFuso(new Date(), false);
}

globalThis.obterPartesHorarioBrasil = obterPartesHorarioBrasil;
globalThis.obterTimestampBrasilSemFuso = obterTimestampBrasilSemFuso;
globalThis.obterDataHoraInputBrasil = obterDataHoraInputBrasil;

// ============================================
// FREEZE E EXPORTAÇÃO
// ============================================

// Congelar o objeto para evitar modificações acidentais
Object.freeze(CONFIG);
Object.freeze(CONFIG.SECURITY);
Object.freeze(CONFIG.PERFORMANCE);
Object.freeze(CONFIG.LIMITS);
Object.freeze(CONFIG.INTERVALS);
Object.freeze(CONFIG.URLS);
Object.freeze(CONFIG.STATUS);
Object.freeze(CONFIG.PERFIS);
Object.freeze(CONFIG.MESSAGES);
Object.freeze(CONFIG.CACHE_KEYS);
Object.freeze(CONFIG.THEME);
Object.freeze(CONFIG.UNITS);
// 🔥 NOVO: Congelar novas configurações
Object.freeze(CONFIG.RETIFICACOES_ABORDAGENS);
Object.freeze(CONFIG.NOTIFICACOES_CONFIG);
Object.freeze(CONFIG.FINALIZACAO);

console.log("📋 CONFIG carregado e congelado");
console.log(`📍 ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}`);
console.log(`📌 Versão: ${CONFIG.VERSAO}`);
console.log(
  `🕐 Fuso horário: ${CONFIG.TIMEZONE} (UTC${CONFIG.TIMEZONE_OFFSET >= 0 ? "+" : ""}${CONFIG.TIMEZONE_OFFSET})`,
);
console.log(`🔄 Sync interval: ${CONFIG.SYNC_INTERVAL / 60000} minutos`);
console.log(`⏰ Sessão timeout: ${CONFIG.SESSION_TIMEOUT} minutos`);
console.log(
  `🔔 Notificações: ${CONFIG.PUSH.VAPID_PUBLIC_KEY ? "Ativadas" : "Desativadas"}`,
);
// 🔥 NOVO: Log das novas configurações
console.log(
  `📎 Anexos: ${CONFIG.LIMITS.ANEXOS_ILIMITADO ? "Ilimitados" : "Limitados"}`,
);
console.log(
  `📋 Retificações de abordagens: ${Object.keys(CONFIG.RETIFICACOES_ABORDAGENS.CAMPOS_RETIFICAVEIS_VEICULO).length} campos (veículos), ${Object.keys(CONFIG.RETIFICACOES_ABORDAGENS.CAMPOS_RETIFICAVEIS_PESSOA).length} campos (pessoas)`,
);
console.log(
  `🔄 Notificações: ${Object.keys(CONFIG.NOTIFICACOES_CONFIG.TIPOS).length} tipos configurados`,
);
console.log(
  `✅ Finalização automática: ${CONFIG.FINALIZACAO.AUTO_PREENCHE ? "Ativada" : "Desativada"}`,
);

// ============================================
// EXPORTAÇÃO (para módulos ES6)
// ============================================

// Se estiver usando módulos ES6, exportar
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}

// Se estiver no navegador, disponibilizar globalmente
if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}

// ============================================
// CONSTANTES DERIVADAS (para facilitar uso)
// ============================================

// Constantes para status
const STATUS = CONFIG.STATUS;
const PERFIS = CONFIG.PERFIS;
const LIMITS = CONFIG.LIMITS;

// 🔥 NOVO: Constantes para retificações de abordagens
const RETIFICACOES_ABORDAGENS = CONFIG.RETIFICACOES_ABORDAGENS;
const CAMPOS_RETIFICAVEIS_VEICULO =
  RETIFICACOES_ABORDAGENS.CAMPOS_RETIFICAVEIS_VEICULO;
const CAMPOS_RETIFICAVEIS_PESSOA =
  RETIFICACOES_ABORDAGENS.CAMPOS_RETIFICAVEIS_PESSOA;
const LABELS_RETIFICACAO_VEICULO = RETIFICACOES_ABORDAGENS.LABELS_VEICULO;
const LABELS_RETIFICACAO_PESSOA = RETIFICACOES_ABORDAGENS.LABELS_PESSOA;

// 🔥 NOVO: Constantes para notificações
const NOTIFICACOES_TIPOS = CONFIG.NOTIFICACOES_CONFIG.TIPOS;
const NOTIFICACOES_PRIORIDADES = CONFIG.NOTIFICACOES_CONFIG.PRIORIDADES;

// 🔥 NOVO: Constantes para finalização
const FINALIZACAO = CONFIG.FINALIZACAO;

// Função auxiliar para obter configuração por chave
function getConfig(key, defaultValue = null) {
  const keys = key.split(".");
  let value = CONFIG;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  return value;
}

// Função auxiliar para verificar se está em modo desenvolvimento
function isDevelopment() {
  return CONFIG.VERSAO.includes("dev") || CONFIG.VERSAO.includes("beta");
}

// Função auxiliar para obter URL do storage
function getStorageUrl(path) {
  return `${CONFIG.URLS.STORAGE_PUBLIC_URL}/${path}`;
}

// 🔥 NOVO: Função auxiliar para verificar se anexos são ilimitados
function anexosIlimitados() {
  return CONFIG.LIMITS.ANEXOS_ILIMITADO === true;
}

// 🔥 NOVO: Função auxiliar para obter limite de anexos (null = ilimitado)
function getLimiteAnexos() {
  return CONFIG.LIMITS.ANEXOS_ILIMITADO
    ? null
    : CONFIG.LIMITS.MAX_ANEXOS || 999;
}

// 🔥 NOVO: Função auxiliar para obter campos retificáveis por tipo
function getCamposRetificaveis(tipo) {
  if (tipo === "veiculo") {
    return CAMPOS_RETIFICAVEIS_VEICULO;
  }
  if (tipo === "pessoa") {
    return CAMPOS_RETIFICAVEIS_PESSOA;
  }
  return [];
}

// 🔥 NOVO: Função auxiliar para obter label de campo retificável
function getLabelCampoRetificavel(tipo, campo) {
  const labels =
    tipo === "veiculo" ? LABELS_RETIFICACAO_VEICULO : LABELS_RETIFICACAO_PESSOA;
  return labels[campo] || campo;
}

// 🔥 NOVO: Função auxiliar para verificar se um campo é retificável
function isCampoRetificavel(tipo, campo) {
  const campos = getCamposRetificaveis(tipo);
  return campos.includes(campo);
}

// 🔥 NOVO: Função auxiliar para obter tipo de notificação
function getTipoNotificacao(tipo) {
  return NOTIFICACOES_TIPOS[tipo] || null;
}

// Exportar funções auxiliares
if (typeof window !== "undefined") {
  window.getConfig = getConfig;
  window.isDevelopment = isDevelopment;
  window.getStorageUrl = getStorageUrl;
  window.STATUS = STATUS;
  window.PERFIS = PERFIS;
  window.LIMITS = LIMITS;
  // 🔥 NOVO: Exportar novas funções auxiliares
  window.anexosIlimitados = anexosIlimitados;
  window.getLimiteAnexos = getLimiteAnexos;
  window.getCamposRetificaveis = getCamposRetificaveis;
  window.getLabelCampoRetificavel = getLabelCampoRetificavel;
  window.isCampoRetificavel = isCampoRetificavel;
  window.getTipoNotificacao = getTipoNotificacao;
  window.RETIFICACOES_ABORDAGENS = RETIFICACOES_ABORDAGENS;
  window.NOTIFICACOES_TIPOS = NOTIFICACOES_TIPOS;
  window.FINALIZACAO = FINALIZACAO;
  window.CAMPOS_RETIFICAVEIS_VEICULO = CAMPOS_RETIFICAVEIS_VEICULO;
  window.CAMPOS_RETIFICAVEIS_PESSOA = CAMPOS_RETIFICAVEIS_PESSOA;
}

console.log("📋 Configurações auxiliares carregadas");
