/**
 * ============================================
 * GERENCIADOR DE SINCRONIZAÇÃO
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

class SyncManager {
  constructor() {
    this.initialized = false;
    this.syncInProgress = false;
    this.pendingItems = [];
    this.syncCallbacks = [];
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("✅ Sync Manager inicializado");
  }

  async getPendentes() {
    // Retorna lista de itens pendentes do IndexedDB
    try {
      if (dbManager && dbManager.initialized) {
        const items = await dbManager.listar(
          "sincronizacao",
          "status",
          "pending",
        );
        return items || [];
      }
      return [];
    } catch (error) {
      console.error("❌ Erro ao buscar pendentes:", error);
      return [];
    }
  }

  async sincronizarAutomaticamente() {
    if (this.syncInProgress) {
      console.log("⏳ Sincronização já em andamento");
      return;
    }

    if (!navigator.onLine) {
      console.log("📴 Offline - Sincronização adiada");
      return;
    }

    this.syncInProgress = true;
    console.log("🔄 Iniciando sincronização automática...");

    try {
      const pendentes = await this.getPendentes();

      if (pendentes.length === 0) {
        console.log("✅ Nenhum item pendente");
        this.syncInProgress = false;
        return;
      }

      console.log(`📤 ${pendentes.length} itens para sincronizar`);

      for (const item of pendentes) {
        try {
          await this.sincronizarItem(item);
        } catch (error) {
          console.error("❌ Erro ao sincronizar item:", error);
        }
      }

      console.log("✅ Sincronização concluída");
    } catch (error) {
      console.error("❌ Erro na sincronização:", error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async sincronizarItem(item) {
    // Simula sincronização
    console.log(`📤 Sincronizando item ${item.id}...`);

    // Atualiza status
    if (dbManager && dbManager.initialized) {
      item.status = "synced";
      await dbManager.salvar("sincronizacao", item);
    }

    return true;
  }

  onSync(callback) {
    if (typeof callback === "function") {
      this.syncCallbacks.push(callback);
    }
  }
}

const syncManager = new SyncManager();
window.syncManager = syncManager;
console.log("📦 Sync Manager carregado");
