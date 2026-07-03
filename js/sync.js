/**
 * SYNC MANAGER - Sincronização
 * Placeholder - Será implementado para o modo offline
 */

class SyncManager {
  constructor() {
    this.initialized = false;
    this.isSyncing = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("🔄 Sync Manager (placeholder) inicializado");
    return true;
  }

  async sincronizar() {
    if (this.isSyncing) {
      console.log("⏳ Sincronização já em andamento");
      return;
    }

    if (!navigator.onLine) {
      console.log("📴 Offline - Sincronização adiada");
      return;
    }

    this.isSyncing = true;
    console.log("🔄 [PLACEHOLDER] Sincronizando...");

    // Simula sincronização
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.isSyncing = false;
    console.log("✅ [PLACEHOLDER] Sincronização concluída");
    return true;
  }

  async getPendentes() {
    return [];
  }
}

const syncManager = new SyncManager();
window.syncManager = syncManager;
