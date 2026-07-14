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
  VERSAO: "1.0.0",

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
  CACHE_VERSION: 3, // Versão do cache (para limpeza)

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
    ICON: "/assets/icons/icon-192x192.png",
    BADGE: "/assets/icons/icon-192x192.png",
    SOUND: "/assets/sounds/notification.mp3",
    VIBRATE_PATTERN: [200, 100, 200],
    REQUIRES_INTERACTION: true,
    TTL: 86400, // 24 horas
    TOPICS: {
      RETIFICACOES: "retificacoes",
      NOVAS_OCORRENCIAS: "novas_ocorrencias",
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
    MAX_ANEXOS: 5,
    MAX_IMAGE_SIZE: 10485760, // 10MB
    MAX_FILE_SIZE: 20971520, // 20MB
    MAX_COMENTARIOS: 100,
    MAX_REACOES: 50,
    MAX_ENVOLVIDOS: 20,
    MAX_OCORRENCIAS_PAGE: 100,
    MAX_ABORDAGENS_PAGE: 50,
    SEARCH_MIN_CHARS: 2,
    REINCIDENCIA_ADVERTENCIA: 2,
    REINCIDENCIA_MULTA: 4,
  },

  // ============================================
  // INTERVALOS DE ATUALIZAÇÃO
  // ============================================
  INTERVALS: {
    DASHBOARD_UPDATE: 60000, // 1 minuto
    MURAL_UPDATE: 300000, // 5 minutos
    CONSULTA_UPDATE: 60000, // 1 minuto
    RELATORIOS_UPDATE: 300000, // 5 minutos
    NOTIFICACOES_CHECK: 60000, // 1 minuto
    GPS_UPDATE: 30000, // 30 segundos
  },

  // ============================================
  // URLs E ENDPOINTS
  // ============================================
  URLS: {
    API_IP: "https://api.ipify.org?format=json",
    TIMEZONE_API: "https://worldtimeapi.org/api/timezone/America/Sao_Paulo",
    STORAGE_BUCKET: "anexos",
    STORAGE_PUBLIC_URL:
      "https://wswezvcxfljzcttpqkch.supabase.co/storage/v1/object/public/anexos",
    MAP_TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    MAP_ATTRIBUTION:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    MAX_ANEXOS: 5,
    MAX_IMAGE_SIZE_MB: 10,
    MAX_FILE_SIZE_MB: 20,
  },
};

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

// Exportar funções auxiliares
if (typeof window !== "undefined") {
  window.getConfig = getConfig;
  window.isDevelopment = isDevelopment;
  window.getStorageUrl = getStorageUrl;
  window.STATUS = STATUS;
  window.PERFIS = PERFIS;
  window.LIMITS = LIMITS;
}

console.log("📋 Configurações auxiliares carregadas");
