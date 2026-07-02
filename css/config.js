/**
 * ============================================
 * CONFIGURAÇÕES DO SISTEMA
 * Pitangueiras/PR - Guarda Municipal
 * ============================================
 */

const CONFIG = {
  // Supabase
  SUPABASE_URL: "https://wswezvcxfljzcttpqkch.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_7sjVXv2VD1D2kQ7kHOraYg_KVVC7Tiy",

  // Informações do Município
  MUNICIPIO: "Pitangueiras",
  ESTADO: "Paraná",
  GUARDA_NOME: "Guarda Municipal de Pitangueiras",

  // Configurações do Sistema
  PREFIXO_MATRICULA: "GM",
  VERSAO: "1.0.0",

  // Offline
  DB_NAME: "guarda_pitangueiras_db",
  DB_VERSION: 1,

  // Sincronização
  SYNC_INTERVAL: 300000, // 5 minutos
  MAX_SYNC_RETRIES: 3,

  // Anexos
  MAX_ANEXOS: 10,
  MAX_FILE_SIZE: 10485760, // 10MB
  TIPOS_PERMITIDOS: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "video/mp4",
    "application/pdf",
  ],

  // Cache
  CACHE_VERSION: "v1",
  CACHE_URLS: [
    "/",
    "/index.html",
    "/css/style.css",
    "/css/cores-pitangueiras.css",
    "/css/components.css",
    "/js/app.js",
    "/js/auth.js",
    "/js/supabase-client.js",
    "/js/config.js",
    "/js/db.js",
    "/manifest.json",
  ],
};

// Bloquear alterações nas configurações
Object.freeze(CONFIG);
