/**
 * ============================================
 * GERENCIADOR DE BANCO DE DADOS LOCAL (IndexedDB)
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbName = CONFIG.DB_NAME || "guarda_pitangueiras_db";
    this.dbVersion = CONFIG.DB_VERSION || 1;
    this.initialized = false;
    this.stores = {
      ocorrencias: "++id, numero_ocorrencia, status, criado_em",
      envolvidos: "++id, ocorrencia_id",
      anexos: "++id, ocorrencia_id",
      sincronizacao: "++id, ocorrencia_id, status",
    };
  }

  async init() {
    if (this.initialized) return true;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Cria stores
        for (const [storeName, keyPath] of Object.entries(this.stores)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: "id",
              autoIncrement: true,
            });
            // Cria índices
            const indices = keyPath.split(", ");
            indices.forEach((index) => {
              if (index !== "++id") {
                store.createIndex(index, index);
              }
            });
            console.log(`📁 Store criada: ${storeName}`);
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.initialized = true;
        console.log("✅ Database local inicializado");
        resolve(true);
      };

      request.onerror = (event) => {
        console.error("❌ Erro ao abrir database:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  async salvar(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async buscar(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async listar(storeName, index = null, query = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      let request;

      if (index && query !== null) {
        const idx = store.index(index);
        request = idx.getAll(query);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async remover(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    const stores = Object.keys(this.stores);
    for (const store of stores) {
      await this.limparStore(store);
    }
  }

  async limparStore(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

const dbManager = new DatabaseManager();
window.dbManager = dbManager;
console.log("📦 Database Manager carregado");
