// database.js - Serviço de banco de dados com suporte offline

import { supabase } from "./supabase-client.js";

const DB_NAME = "GuardaMunicipalDB";
const DB_VERSION = 1;

export class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.stores = {
      ocorrencias: "ocorrencias",
      envolvidos: "envolvidos",
      anexos: "anexos",
      syncQueue: "syncQueue",
    };
  }

  async init() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Erro ao abrir banco de dados:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store de ocorrências
        if (!db.objectStoreNames.contains("ocorrencias")) {
          const store = db.createObjectStore("ocorrencias", { keyPath: "id" });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("usuario_id", "usuario_id", { unique: false });
          store.createIndex("data_criacao", "data_criacao", { unique: false });
        }

        // Store de envolvidos
        if (!db.objectStoreNames.contains("envolvidos")) {
          const store = db.createObjectStore("envolvidos", { keyPath: "id" });
          store.createIndex("ocorrencia_id", "ocorrencia_id", {
            unique: false,
          });
        }

        // Store de anexos
        if (!db.objectStoreNames.contains("anexos")) {
          const store = db.createObjectStore("anexos", { keyPath: "id" });
          store.createIndex("ocorrencia_id", "ocorrencia_id", {
            unique: false,
          });
        }

        // Store de fila de sincronização
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("created_at", "created_at", { unique: false });
        }
      };
    });
  }

  // Métodos genéricos CRUD
  async save(storeName, data) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName, index = null, value = null) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      let request;

      if (index && value !== null) {
        const idx = store.index(index);
        request = idx.getAll(value);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Métodos específicos para ocorrências
  async saveOcorrencia(ocorrencia) {
    // Adicionar timestamp se necessário
    if (!ocorrencia.data_criacao) {
      ocorrencia.data_criacao = new Date().toISOString();
    }
    if (!ocorrencia.data_atualizacao) {
      ocorrencia.data_atualizacao = new Date().toISOString();
    }

    // Gerar ID local se for novo
    if (!ocorrencia.id) {
      ocorrencia.id = crypto.randomUUID();
    }

    // Gerar número local se offline
    if (!ocorrencia.numero_oficial && !ocorrencia.numero_local) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      ocorrencia.numero_local = `LOCAL-${dateStr}-${random}`;
    }

    return this.save("ocorrencias", ocorrencia);
  }

  async getOcorrencias(usuarioId = null, status = null) {
    let ocorrencias = await this.getAll("ocorrencias");

    if (usuarioId) {
      ocorrencias = ocorrencias.filter((o) => o.usuario_id === usuarioId);
    }

    if (status) {
      ocorrencias = ocorrencias.filter((o) => o.status === status);
    }

    // Ordenar por data de criação (mais recente primeiro)
    return ocorrencias.sort(
      (a, b) => new Date(b.data_criacao) - new Date(a.data_criacao),
    );
  }

  async getOcorrencia(id) {
    return this.get("ocorrencias", id);
  }

  // Métodos para envolvidos
  async saveEnvolvido(envolvido) {
    if (!envolvido.id) {
      envolvido.id = crypto.randomUUID();
    }
    return this.save("envolvidos", envolvido);
  }

  async getEnvolvidos(ocorrenciaId) {
    const all = await this.getAll("envolvidos");
    return all
      .filter((e) => e.ocorrencia_id === ocorrenciaId)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }

  async deleteEnvolvido(id) {
    return this.delete("envolvidos", id);
  }

  // Métodos para anexos
  async saveAnexo(anexo) {
    if (!anexo.id) {
      anexo.id = crypto.randomUUID();
    }
    return this.save("anexos", anexo);
  }

  async getAnexos(ocorrenciaId) {
    const all = await this.getAll("anexos");
    return all.filter((a) => a.ocorrencia_id === ocorrenciaId);
  }

  async deleteAnexo(id) {
    return this.delete("anexos", id);
  }

  // Fila de sincronização
  async addToSyncQueue(data) {
    const item = {
      ...data,
      status: "pending",
      created_at: new Date().toISOString(),
      attempts: 0,
    };
    return this.save("syncQueue", item);
  }

  async getSyncQueue() {
    return this.getAll("syncQueue");
  }

  async updateSyncStatus(id, status, error = null) {
    const item = await this.get("syncQueue", id);
    if (item) {
      item.status = status;
      item.last_attempt = new Date().toISOString();
      if (error) item.error = error;
      if (status === "completed") {
        item.completed_at = new Date().toISOString();
      }
      return this.save("syncQueue", item);
    }
  }

  // Limpeza de dados antigos
  async cleanup() {
    const syncItems = await this.getAll("syncQueue");
    const completedItems = syncItems.filter(
      (item) =>
        item.status === "completed" &&
        new Date(item.completed_at) <
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    );

    for (const item of completedItems) {
      await this.delete("syncQueue", item.id);
    }
  }

  // Exportação/Importação de dados
  async exportData() {
    const data = {
      ocorrencias: await this.getAll("ocorrencias"),
      envolvidos: await this.getAll("envolvidos"),
      anexos: await this.getAll("anexos"),
      syncQueue: await this.getAll("syncQueue"),
      exported_at: new Date().toISOString(),
    };
    return JSON.stringify(data);
  }

  async importData(jsonData) {
    const data = JSON.parse(jsonData);
    await this.deleteAll("ocorrencias");
    await this.deleteAll("envolvidos");
    await this.deleteAll("anexos");
    await this.deleteAll("syncQueue");

    for (const ocorrencia of data.ocorrencias) {
      await this.save("ocorrencias", ocorrencia);
    }
    for (const envolvido of data.envolvidos) {
      await this.save("envolvidos", envolvido);
    }
    for (const anexo of data.anexos) {
      await this.save("anexos", anexo);
    }
    for (const item of data.syncQueue) {
      await this.save("syncQueue", item);
    }
  }
}
