// Cliente do painel administrativo. Credencial privilegiada existe somente em memória e expira no servidor.
(function () {
  const TOKEN_KEY = "admin_governance_token_v50";
  const URL_KEY = "admin_governance_url_v50";
  let adminToken = "";
  let pendingPasswordPrompt = null;
  try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(URL_KEY); } catch (_) {}

  function endpoint() {
    const base = String(window.CONFIG?.SUPABASE_URL || "").replace(/\/$/, "");
    return `${base}/functions/v1/admin-governance`;
  }

  function getToken() {
    return adminToken;
  }

  function clear() {
    adminToken = "";
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(URL_KEY); } catch (_) {}
  }

  function solicitarSenhaAdmin() {
    if (pendingPasswordPrompt) return pendingPasswordPrompt;

    pendingPasswordPrompt = new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const overlay = document.createElement("div");
      overlay.className = "perfil-upload-overlay admin-session-password-overlay";
      overlay.setAttribute("role", "presentation");
      overlay.innerHTML = `
        <section class="perfil-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="adminSessionPasswordTitle" aria-describedby="adminSessionPasswordHelp">
          <button type="button" class="perfil-upload-close admin-session-password-close" aria-label="Fechar janela">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
          <p class="perfil-eyebrow">Confirmação de segurança</p>
          <h2 id="adminSessionPasswordTitle">Confirmar sua senha</h2>
          <p id="adminSessionPasswordHelp" class="perfil-upload-copy">Para continuar, confirme sua senha atual. Ela será validada pelo servidor e não será armazenada.</p>
          <label for="adminSessionPasswordInput">Senha atual</label>
          <div class="perfil-password-field">
            <input id="adminSessionPasswordInput" type="password" autocomplete="current-password" required>
          </div>
          <p class="perfil-upload-status" role="status" aria-live="polite">A senha será usada somente para confirmar esta operação.</p>
          <div class="perfil-upload-actions">
            <button type="button" class="btn-secondary perfil-button perfil-button-outline admin-session-password-cancel">Cancelar</button>
            <button type="button" class="btn-primary perfil-button perfil-button-primary admin-session-password-submit">
              <i class="fas fa-shield-alt" aria-hidden="true"></i> Confirmar e continuar
            </button>
          </div>
        </section>`;
      document.body.appendChild(overlay);

      const input = overlay.querySelector("#adminSessionPasswordInput");
      const status = overlay.querySelector(".perfil-upload-status");
      const submitButton = overlay.querySelector(".admin-session-password-submit");
      let settled = false;

      const finish = (password) => {
        if (settled) return;
        settled = true;
        input.value = "";
        overlay.remove();
        pendingPasswordPrompt = null;
        if (previousFocus && typeof previousFocus.focus === "function" && previousFocus.isConnected) {
          previousFocus.focus();
        }
        resolve(password);
      };

      const submit = () => {
        if (!input.value) {
          status.textContent = "Digite sua senha atual para continuar.";
          input.focus();
          return;
        }
        finish(input.value);
      };

      overlay.querySelector(".admin-session-password-close").addEventListener("click", () => finish(null));
      overlay.querySelector(".admin-session-password-cancel").addEventListener("click", () => finish(null));
      submitButton.addEventListener("click", submit);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish(null);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key === "Enter" && event.target === input) {
          event.preventDefault();
          submit();
          return;
        }
        if (event.key === "Tab") {
          const focusable = [...overlay.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });
      input.focus();
    });

    return pendingPasswordPrompt;
  }

  async function call(action, payload = {}, options = {}) {
    const headers = { "Content-Type": "application/json", apikey: window.CONFIG?.SUPABASE_ANON_KEY || "" };
    const token = getToken();
    if (token && action !== "issue_session") headers["x-admin-token"] = token;
    const response = await fetch(endpoint(), { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
    const data = await response.json().catch(() => ({ success: false, error: "Resposta inválida do servidor" }));
    if (response.status === 401 && action !== "issue_session") clear();
    if (!response.ok || data.success === false) throw new Error(data.error || "Operação administrativa recusada");
    return data;
  }

  async function ensureSession() {
    if (getToken()) return true;
    const user = window.authManager?.getUser?.();
    if (!user || user.perfil !== "administrador") throw new Error("Acesso restrito ao administrador do sistema.");
    let senha = await solicitarSenhaAdmin();
    if (!senha) throw new Error("É necessário confirmar a senha para continuar.");
    try {
      const data = await call("issue_session", { cpf: window.authManager?.getCPF?.() || user.cpf, senha });
      adminToken = String(data.token || "");
      return true;
    } finally {
      senha = "";
    }
  }

  async function adminCall(action, payload = {}) {
    await ensureSession();
    return call(action, payload);
  }

  window.adminApi = {
    endpoint,
    getToken,
    clear,
    ensureSession,
    call: adminCall,
    summary: () => adminCall("summary"),
    listUsers: (search = "", limit = 50, offset = 0) => adminCall("users", { search, limit, offset }),
    listLogs: (limit = 50, offset = 0) => adminCall("logs", { limit, offset }),
    listErrors: (limit = 50, offset = 0) => adminCall("errors", { limit, offset }),
    listPendingGovernance: (filters = {}, limit = 25, offset = 0) => adminCall("pending_governance", { ...filters, limit, offset }),
    getPendingGovernance: (id, tipo) => adminCall("pending_detail", { id, type: tipo }),
    approveGovernance: (id, tipo, justificativa = "") => adminCall("approve_governance", { id, tipo, justificativa }),
    rejectGovernance: (id, tipo, motivo) => adminCall("reject_governance", { id, tipo, motivo }),
    syncMetrics: (filters = {}) => adminCall("sync_metrics", { filters }),
    createUser: (payload) => adminCall("create_user", payload),
    updateUser: (payload) => adminCall("update_user", payload),
    resetPassword: (id) => adminCall("reset_password", { id }),
  };
})();
