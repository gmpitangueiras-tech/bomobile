// Cliente do painel administrativo v50. O token fica apenas em sessionStorage e expira em 30 minutos.
(function () {
  const TOKEN_KEY = "admin_governance_token_v50";
  const URL_KEY = "admin_governance_url_v50";

  function endpoint() {
    const base = String(window.CONFIG?.SUPABASE_URL || "").replace(/\/$/, "");
    return `${base}/functions/v1/admin-governance`;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function clear() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(URL_KEY);
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
    const senha = window.prompt("Confirme sua senha para abrir o painel administrativo.\nA senha não será armazenada.");
    if (!senha) throw new Error("É necessário confirmar a senha para abrir o painel.");
    const data = await call("issue_session", { cpf: user.cpf, senha });
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(URL_KEY, endpoint());
    return true;
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
    listUsers: (search = "") => adminCall("users", { search }),
    listLogs: (limit = 50, offset = 0) => adminCall("logs", { limit, offset }),
    listErrors: () => adminCall("errors"),
    createUser: (payload) => adminCall("create_user", payload),
    updateUser: (payload) => adminCall("update_user", payload),
    resetPassword: (id) => adminCall("reset_password", { id }),
  };
})();
