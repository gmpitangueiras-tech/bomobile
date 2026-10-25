/* Cofre local cifrado da Guarda Municipal.
 * Não guarda senha nem chave. AES-256-GCM + PBKDF2-SHA-256; payloads privados
 * ficam cifrados em IndexedDB. Metadados mínimos de fila ficam em claro para
 * indexação (usuário, tipo, estado e datas), nunca o conteúdo ou erro do servidor.
 */
(function (root) {
  "use strict";

  const DB_NAME = "GMPitangueirasOfflineVault";
  const DB_VERSION = 1;
  const LEGACY_DB = "GuardaMunicipalDB";
  const ITERATIONS = 310000;
  const FORMAT = 1;
  const MAX_ENCRYPTED_PAYLOAD_BYTES = 20 * 1024 * 1024;
  const STORE = { accounts: "accounts", records: "records", queue: "queue", queueData: "queueData" };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToB64(bytes) {
    let out = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) out += String.fromCharCode(...arr.subarray(i, i + 0x8000));
    return btoa(out);
  }
  function b64ToBytes(value) {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    return [...b].map((v, i) => `${[4, 6, 8, 10].includes(i) ? "-" : ""}${v.toString(16).padStart(2, "0")}`).join("");
  }
  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Falha no IndexedDB"));
    });
  }
  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Transação IndexedDB interrompida"));
    });
  }
  function openNamed(name, version, upgrade) {
    return new Promise((resolve, reject) => {
      const request = version ? indexedDB.open(name, version) : indexedDB.open(name);
      request.onupgradeneeded = (event) => { if (upgrade) upgrade(request.result, event); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o IndexedDB"));
      request.onblocked = () => reject(new Error("Feche as outras abas do app e tente novamente."));
    });
  }
  function deleteNamed(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Não foi possível remover dados legados"));
      request.onblocked = () => reject(new Error("Há outra aba usando dados locais antigos. Feche as outras abas para concluir a migração segura."));
    });
  }

  function encodeValue(value, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") return value;
    if (typeof Blob !== "undefined" && value instanceof Blob) return value.arrayBuffer().then((buffer) => ({
      __gm_vault_type: (typeof File !== "undefined" && value instanceof File) ? "file" : "blob",
      mime: value.type || "application/octet-stream",
      name: (typeof File !== "undefined" && value instanceof File) ? value.name : null,
      lastModified: (typeof File !== "undefined" && value instanceof File) ? value.lastModified : null,
      bytes: bytesToB64(new Uint8Array(buffer)),
    }));
    if (value instanceof ArrayBuffer) return { __gm_vault_type: "arraybuffer", bytes: bytesToB64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) return { __gm_vault_type: "typedarray", name: value.constructor.name, bytes: bytesToB64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (seen.has(value)) throw new Error("Não é possível cifrar um objeto circular.");
    seen.add(value);
    if (Array.isArray(value)) return Promise.all(value.map((item) => encodeValue(item, seen))).finally(() => seen.delete(value));
    const entries = Object.entries(value).map(async ([key, item]) => [key, await encodeValue(item, seen)]);
    return Promise.all(entries).then((pairs) => Object.fromEntries(pairs)).finally(() => seen.delete(value));
  }
  function decodeValue(value) {
    if (!value || typeof value !== "object") return value;
    if (value.__gm_vault_type === "blob" || value.__gm_vault_type === "file") {
      const blob = new Blob([b64ToBytes(value.bytes)], { type: value.mime });
      if (value.__gm_vault_type === "file" && typeof File !== "undefined") return new File([blob], value.name || "anexo", { type: value.mime, lastModified: value.lastModified || Date.now() });
      return blob;
    }
    if (value.__gm_vault_type === "arraybuffer") return b64ToBytes(value.bytes).buffer;
    if (value.__gm_vault_type === "typedarray") {
      const bytes = b64ToBytes(value.bytes);
      const Ctor = ({ Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array })[value.name] || Uint8Array;
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
    if (Array.isArray(value)) return value.map(decodeValue);
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = decodeValue(item);
    return out;
  }
  async function canonicalize(value) {
    return JSON.stringify(await encodeValue(value));
  }

  class OfflineVault {
    constructor() {
      this.db = null;
      this.userId = null;
      this.aesKey = null;
      this.proofKey = null;
      this.unlocked = false;
      this.ready = false;
      this.migrating = false;
    }

    async open() {
      if (this.db) return this.db;
      if (!root.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") throw new Error("O cofre exige HTTPS ou localhost.");
      if (!crypto?.subtle || !indexedDB) throw new Error("Este navegador não oferece criptografia segura e IndexedDB.");
      this.db = await openNamed(DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(STORE.accounts)) db.createObjectStore(STORE.accounts, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORE.records)) {
          const store = db.createObjectStore(STORE.records, { keyPath: "key" });
          store.createIndex("by_user", "userId", { unique: false });
          store.createIndex("by_user_type", ["userId", "type"], { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE.queue)) {
          const store = db.createObjectStore(STORE.queue, { keyPath: "id" });
          store.createIndex("by_user_status", ["userId", "status"], { unique: false });
          store.createIndex("by_user_idempotency", ["userId", "idempotencyKey"], { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE.queueData)) db.createObjectStore(STORE.queueData, { keyPath: "key" });
      });
      this.db.onversionchange = () => { this.lock(); this.db?.close(); this.db = null; };
      return this.db;
    }

    async derive(password, salt) {
      const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, 512));
      const aesKey = await crypto.subtle.importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      const proofKey = await crypto.subtle.importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
      bits.fill(0);
      return { aesKey, proofKey };
    }

    aad(userId, type, id) { return encoder.encode(`gmp-vault|${FORMAT}|${userId}|${type}|${id}`); }

    async encrypt(userId, type, id, value) {
      const normalized = await encodeValue(value);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = encoder.encode(JSON.stringify(normalized));
      if (plaintext.byteLength > MAX_ENCRYPTED_PAYLOAD_BYTES) throw new Error("O pacote offline excede 20 MB. Reduza a quantidade/tamanho de anexos e tente novamente.");
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: this.aad(userId, type, id), tagLength: 128 }, this.aesKey, plaintext);
      plaintext.fill(0);
      return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(ciphertext)), format: FORMAT };
    }

    async decrypt(userId, type, id, envelope) {
      if (!envelope || envelope.format !== FORMAT) throw new Error("Formato de dado local não reconhecido.");
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(envelope.iv), additionalData: this.aad(userId, type, id), tagLength: 128 }, this.aesKey, b64ToBytes(envelope.ciphertext));
      const text = decoder.decode(plaintext);
      new Uint8Array(plaintext).fill(0);
      return decodeValue(JSON.parse(text));
    }

    async accountMeta(userId) { return req(this.db.transaction(STORE.accounts, "readonly").objectStore(STORE.accounts).get(`account:${userId}`)); }

    async unlock(userId, password, profile = null, cpf = null) {
      if (!userId || !password) throw new Error("Usuário e senha são necessários para abrir o cofre.");
      await this.open();
      try { this.persistentStorage = navigator.storage?.persist ? await navigator.storage.persist() : false; }
      catch (_) { this.persistentStorage = false; }
      if (this.unlocked && this.userId !== userId) this.lock();
      const key = `account:${userId}`;
      let meta = await this.accountMeta(userId);
      if (!meta) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const derived = await this.derive(password, salt);
        this.userId = userId; this.aesKey = derived.aesKey; this.proofKey = derived.proofKey;
        this.unlocked = true;
        const check = await this.encrypt(userId, "check", "vault-check", { value: `gmp-vault-ready:${userId}` });
        meta = { key, userId, salt: bytesToB64(salt), iterations: ITERATIONS, check, version: FORMAT, createdAt: new Date().toISOString() };
        const tx = this.db.transaction(STORE.accounts, "readwrite");
        tx.objectStore(STORE.accounts).add(meta);
        await txDone(tx);
      } else {
        const derived = await this.derive(password, b64ToBytes(meta.salt));
        this.userId = userId; this.aesKey = derived.aesKey; this.proofKey = derived.proofKey;
        try {
          const check = await this.decrypt(userId, "check", "vault-check", meta.check);
          if (check.value !== `gmp-vault-ready:${userId}`) throw new Error("Senha incompatível com este cofre.");
          this.unlocked = true;
        } catch (error) {
          this.lock();
          throw new Error("Não foi possível abrir os dados locais com esta senha. Os dados existentes foram preservados; não foi criado um cofre vazio.");
        }
      }
      this.unlocked = true;
      if (profile) await this.putRecord("profile", userId, profile, { status: "current" });
      if (cpf) await this.saveCpfProof(cpf);
      await this.migrateLegacyDatabase();
      this.clearLegacyPlaintextCaches();
      this.ready = true;
      return true;
    }

    async saveCpfProof(cpf) {
      const normalized = String(cpf || "").replace(/\D/g, "");
      const signature = await crypto.subtle.sign("HMAC", this.proofKey, encoder.encode(`cpf:${normalized}`));
      const meta = await this.accountMeta(this.userId);
      meta.cpfProof = bytesToB64(new Uint8Array(signature));
      const tx = this.db.transaction(STORE.accounts, "readwrite");
      tx.objectStore(STORE.accounts).put(meta);
      await txDone(tx);
    }

    async tryOfflineLogin(cpf, password) {
      await this.open();
      const metas = await req(this.db.transaction(STORE.accounts, "readonly").objectStore(STORE.accounts).getAll());
      const normalized = String(cpf || "").replace(/\D/g, "");
      if (normalized.length !== 11 || !password) throw new Error("CPF ou senha inválidos.");
      for (const meta of metas) {
        if (!meta.userId || !meta.salt || !meta.check || !meta.cpfProof) continue;
        let candidate;
        try {
          candidate = await this.derive(password, b64ToBytes(meta.salt));
          this.userId = meta.userId; this.aesKey = candidate.aesKey; this.proofKey = candidate.proofKey;
          const check = await this.decrypt(meta.userId, "check", "vault-check", meta.check);
          if (check.value !== `gmp-vault-ready:${meta.userId}`) continue;
          const validCpf = await crypto.subtle.verify("HMAC", candidate.proofKey, b64ToBytes(meta.cpfProof), encoder.encode(`cpf:${normalized}`));
          if (!validCpf) continue;
          this.unlocked = true;
          const profile = await this.getRecord("profile", meta.userId);
          if (!profile) throw new Error("Perfil local indisponível.");
          await this.migrateLegacyDatabase();
          this.clearLegacyPlaintextCaches();
          this.ready = true;
          return { userId: meta.userId, profile };
        } catch (_) {
          this.lock();
        }
      }
      this.lock();
      throw new Error("Não foi possível autenticar offline. Conecte-se à rede e entre com sua conta.");
    }

    clearLegacyPlaintextCaches() {
      const fixedKeys = new Set([
        "encryption_key", "guarda_logs", "dashboard_stats",
        "dashboard_ocorrencias_com_fotos_v2", "dashboard_abordagens",
        "dashboard_abordagens_hoje", "notificacoes_nao_lidas",
        "auth_user", "auth_session", "sb-auth-token", "session_state",
      ]);
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (fixedKeys.has(key) || key?.startsWith("guarda_cache_") || (/^sb-.*-auth-token$/.test(key || ""))) localStorage.removeItem(key);
        }
      } catch (_) {}
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (["abordagem_para_bo", "admin_governance_token_v50", "admin_governance_url_v50"].includes(key)) sessionStorage.removeItem(key);
        }
      } catch (_) {}
    }

    requireUnlocked(userId = this.userId) {
      if (!this.unlocked || !this.aesKey || !userId || userId !== this.userId) throw new Error("Cofre local bloqueado ou pertencente a outra conta.");
    }

    async putRecord(type, id, data, metadata = {}) {
      this.requireUnlocked();
      const key = `${this.userId}:${type}:${id}`;
      const envelope = await this.encrypt(this.userId, type, String(id), data);
      const row = { key, userId: this.userId, type, recordId: String(id), ...envelope, status: metadata.status || "saved", createdAt: metadata.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      const tx = this.db.transaction(STORE.records, "readwrite");
      tx.objectStore(STORE.records).put(row);
      await txDone(tx);
      return { key, id: String(id), type };
    }

    async getRecord(type, id) {
      this.requireUnlocked();
      const key = `${this.userId}:${type}:${id}`;
      const row = await req(this.db.transaction(STORE.records, "readonly").objectStore(STORE.records).get(key));
      return row ? this.decrypt(this.userId, type, String(id), row) : null;
    }

    async listRecords(type = null, status = null) {
      this.requireUnlocked();
      const store = this.db.transaction(STORE.records, "readonly").objectStore(STORE.records);
      const rows = type ? await req(store.index("by_user_type").getAll(IDBKeyRange.only([this.userId, type]))) : await req(store.index("by_user").getAll(IDBKeyRange.only(this.userId)));
      const out = [];
      for (const row of rows) {
        if (status && row.status !== status) continue;
        out.push({ id: row.recordId, type: row.type, status: row.status, data: await this.decrypt(this.userId, row.type, row.recordId, row) });
      }
      return out;
    }

    async deleteRecord(type, id) {
      this.requireUnlocked();
      const tx = this.db.transaction(STORE.records, "readwrite");
      tx.objectStore(STORE.records).delete(`${this.userId}:${type}:${id}`);
      await txDone(tx);
    }

    async enqueue(type, payload, options = {}) {
      this.requireUnlocked();
      const idempotencyKey = String(options.idempotencyKey || `${type}:${payload?.id || randomId()}`);
      const id = randomId();
      const dataKey = `${this.userId}:${id}`;
      const encrypted = await this.encrypt(this.userId, "queue", id, payload);
      const row = { id, userId: this.userId, type, idempotencyKey, priority: Number(options.priority ?? 1), status: "pending", created_at: new Date().toISOString(), attempts: 0, last_attempt: null, errorCode: null, dataKey };
      const tx = this.db.transaction([STORE.queue, STORE.queueData], "readwrite");
      const index = tx.objectStore(STORE.queue).index("by_user_idempotency");
      const existing = index.get([this.userId, idempotencyKey]);
      existing.onsuccess = () => {
        if (existing.result) return;
        tx.objectStore(STORE.queue).add(row);
        tx.objectStore(STORE.queueData).put({ key: dataKey, userId: this.userId, ...encrypted });
      };
      await txDone(tx);
      const saved = await req(this.db.transaction(STORE.queue, "readonly").objectStore(STORE.queue).index("by_user_idempotency").get([this.userId, idempotencyKey]));
      return this.readQueueRow(saved);
    }

    async readQueueRow(row) {
      if (!row) return null;
      this.requireUnlocked(row.userId);
      const envelope = await req(this.db.transaction(STORE.queueData, "readonly").objectStore(STORE.queueData).get(row.dataKey));
      if (!envelope) throw new Error("Payload cifrado da fila não encontrado; item preservado para inspeção.");
      const dados = await this.decrypt(row.userId, "queue", row.id, envelope);
      return { id: row.id, tipo: row.type, dados, prioridade: row.priority, status: row.status, created_at: row.created_at, attempts: row.attempts, tentativas: row.attempts, ultimo_erro: row.errorCode, idempotencyKey: row.idempotencyKey };
    }

    async listQueue(status = "pending") {
      this.requireUnlocked();
      const rows = await req(this.db.transaction(STORE.queue, "readonly").objectStore(STORE.queue).index("by_user_status").getAll(IDBKeyRange.only([this.userId, status])));
      const items = [];
      for (const row of rows) items.push(await this.readQueueRow(row));
      return items;
    }

    async updateQueue(id, status, errorCode = null, attempts = null) {
      this.requireUnlocked();
      const tx = this.db.transaction(STORE.queue, "readwrite");
      const store = tx.objectStore(STORE.queue);
      const row = await req(store.get(id));
      if (!row || row.userId !== this.userId) { tx.abort(); return false; }
      row.status = status;
      row.last_attempt = new Date().toISOString();
      row.errorCode = errorCode ? String(errorCode).replace(/[^A-Z0-9_-]/gi, "").slice(0, 40) || "SYNC_ERROR" : null;
      if (attempts !== null) row.attempts = Number(attempts) || 0;
      store.put(row);
      await txDone(tx);
      return true;
    }

    async updateQueuePayload(id, payload) {
      this.requireUnlocked();
      const row = await req(this.db.transaction(STORE.queue, "readonly").objectStore(STORE.queue).get(id));
      if (!row || row.userId !== this.userId) return false;
      const encrypted = await this.encrypt(this.userId, "queue", id, payload);
      let updated = false;
      const tx = this.db.transaction([STORE.queue, STORE.queueData], "readwrite");
      const queueStore = tx.objectStore(STORE.queue);
      const request = queueStore.get(id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.userId !== this.userId) return;
        tx.objectStore(STORE.queueData).put({ key: current.dataKey, userId: this.userId, ...encrypted });
        updated = true;
      };
      await txDone(tx);
      return updated;
    }

    async removeQueue(id) {
      this.requireUnlocked();
      const tx = this.db.transaction([STORE.queue, STORE.queueData], "readwrite");
      const store = tx.objectStore(STORE.queue);
      const row = await req(store.get(id));
      if (row && row.userId === this.userId) { store.delete(id); tx.objectStore(STORE.queueData).delete(row.dataKey); }
      await txDone(tx);
    }

    async migrateLegacyDatabase() {
      if (this.migrating) return;
      this.migrating = true;
      let legacy;
      try {
        legacy = await openNamed(LEGACY_DB, null, (db, event) => {
          if (event.oldVersion === 0) db.createObjectStore("__empty_probe__");
        });
        const names = [...legacy.objectStoreNames];
        if (names.length === 1 && names[0] === "__empty_probe__") {
          legacy.close();
          await deleteNamed(LEGACY_DB);
          return;
        }
        if (!names.length) { legacy.close(); return; }
        const snapshots = {};
        for (const name of names) {
          if (name === "__empty_probe__") continue;
          snapshots[name] = await req(legacy.transaction(name, "readonly").objectStore(name).getAll());
        }
        for (const [name, rows] of Object.entries(snapshots)) {
          for (const row of rows) {
            const id = String(row?.id ?? row?.chave ?? randomId());
            const owner = row?.criado_por || row?.usuario_id || row?.user_id || row?.dados?.criado_por || row?.dados?.usuario_id || null;
            if (owner && owner !== this.userId) throw new Error("Dados locais antigos pertencem a outra conta. A base original foi mantida sem alteração.");
            await this.putRecord(`legacy:${name}`, id, row, { status: "migrated" });
            const copied = await this.getRecord(`legacy:${name}`, id);
            if (await canonicalize(copied) !== await canonicalize(row)) throw new Error("Falha de validação na cópia cifrada; a base original foi mantida.");
          }
        }
        legacy.close();
        await deleteNamed(LEGACY_DB);
      } finally {
        if (legacy) try { legacy.close(); } catch (_) {}
        this.migrating = false;
      }
    }

    async rekey(newPassword, cpf) {
      this.requireUnlocked();
      if (!newPassword || !String(cpf || "").replace(/\D/g, "")) throw new Error("Senha e CPF são necessários para reconfigurar o cofre.");
      const userId = this.userId;
      const oldAes = this.aesKey;
      const oldProof = this.proofKey;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const next = await this.derive(newPassword, salt);
      let committed = false;
      try {
      const records = await req(this.db.transaction(STORE.records, "readonly").objectStore(STORE.records).index("by_user").getAll(IDBKeyRange.only(userId)));
      const queueData = await req(this.db.transaction(STORE.queueData, "readonly").objectStore(STORE.queueData).getAll());
      const ownQueueData = queueData.filter((row) => row.userId === userId);
      const stagedRecords = [];
      const stagedQueueData = [];
      this.aesKey = oldAes;
      for (const row of records) {
        const value = await this.decrypt(userId, row.type, row.recordId, row);
        this.aesKey = next.aesKey;
        stagedRecords.push({ ...row, ...(await this.encrypt(userId, row.type, row.recordId, value)), updatedAt: new Date().toISOString() });
        this.aesKey = oldAes;
      }
      for (const row of ownQueueData) {
        const value = await this.decrypt(userId, "queue", row.key.split(":").pop(), row);
        const queueId = row.key.slice(`${userId}:`.length);
        this.aesKey = next.aesKey;
        stagedQueueData.push({ ...row, ...(await this.encrypt(userId, "queue", queueId, value)) });
        this.aesKey = oldAes;
      }
      this.aesKey = next.aesKey;
      const check = await this.encrypt(userId, "check", "vault-check", { value: `gmp-vault-ready:${userId}` });
      const cpfSignature = await crypto.subtle.sign("HMAC", next.proofKey, encoder.encode(`cpf:${String(cpf).replace(/\D/g, "")}`));
      this.aesKey = oldAes;
      const meta = await this.accountMeta(userId);
      meta.salt = bytesToB64(salt); meta.iterations = ITERATIONS; meta.check = check;
      meta.cpfProof = bytesToB64(new Uint8Array(cpfSignature)); meta.version = FORMAT; meta.updatedAt = new Date().toISOString();
      const tx = this.db.transaction([STORE.accounts, STORE.records, STORE.queueData], "readwrite");
      tx.objectStore(STORE.accounts).put(meta);
      stagedRecords.forEach((row) => tx.objectStore(STORE.records).put(row));
      stagedQueueData.forEach((row) => tx.objectStore(STORE.queueData).put(row));
      await txDone(tx);
      this.aesKey = next.aesKey; this.proofKey = next.proofKey; this.userId = userId;
      committed = true;
      return true;
      } finally {
        if (!committed) { this.aesKey = oldAes; this.proofKey = oldProof; this.userId = userId; this.unlocked = true; }
      }
    }

    lock() {
      this.aesKey = null; this.proofKey = null; this.userId = null; this.unlocked = false; this.ready = false;
    }
  }

  root.offlineVault = new OfflineVault();
})(window);
