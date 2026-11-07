/* Observabilidade do front-end — nunca envia senha, token, CPF, payload ou conteúdo de registros. */
(function installClientErrorMonitor() {
  if (window.__clientErrorMonitorInstalled) return;
  window.__clientErrorMonitorInstalled = true;
  const recent = new Map();
  const breadcrumbs = [];
  const pending = [];
  let flushing = false;
  const MAX_TEXT = 1200;

  function redact(value, max = MAX_TEXT) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
      .replace(/(authorization|apikey|token|senha|password|cpf|access_token|refresh_token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
      .replace(/https?:\/\/[^\s]+/gi, (url) => { try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return "[URL_REDACTED]"; } })
      .trim().slice(0, max);
  }
  function route() { try { return `${location.pathname}${String(location.hash || "").split("?")[0]}`.slice(0, 240); } catch { return "unknown"; } }
  function device() { try { return JSON.stringify({ userAgent: redact(navigator.userAgent, 300), platform: redact(navigator.platform, 80), language: navigator.language, screen: `${screen?.width || 0}x${screen?.height || 0}`, viewport: `${innerWidth}x${innerHeight}`, online: navigator.onLine }); } catch { return "unknown"; } }
  function addBreadcrumb(type, value) { breadcrumbs.push({ at: new Date().toISOString(), type, value: redact(value, 300) }); if (breadcrumbs.length > 20) breadcrumbs.shift(); }
  async function fingerprint(input) { try { const bytes = new TextEncoder().encode(input); const hash = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 64); } catch { return redact(input, 160).replace(/[^a-zA-Z0-9_.:-]/g, "_"); } }
  function userId() { try { return window.authManager?.getUser?.()?.id || null; } catch { return null; } }
  function details(extra = {}) { return { ...extra, rota: route(), online: navigator.onLine, visibilidade: document.visibilityState, breadcrumbs: breadcrumbs.slice(-20), captured_at: new Date().toISOString() }; }
  async function enqueue(level, origin, message, extra = {}) {
    const safeMessage = redact(message || "Erro técnico desconhecido");
    const key = `${origin}|${safeMessage}|${route()}`;
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 60_000) return;
    recent.set(key, now);
    const item = { p_usuario_id: userId(), p_nivel: level, p_origem: redact(origin, 80), p_mensagem: safeMessage, p_rota: route(), p_versao: redact(window.CONFIG?.VERSAO || "unknown", 120), p_dispositivo: device(), p_detalhes: details(extra), p_fingerprint: await fingerprint(key) };
    pending.push(item); void flush();
  }
  async function flush() {
    if (flushing || !pending.length) return;
    flushing = true;
    try {
      const client = window.supabaseClient?.getClient?.();
      if (!client) { setTimeout(() => { flushing = false; void flush(); }, 1500); return; }
      while (pending.length) { const item = pending.shift(); try { await client.rpc("gm_record_client_error", item); } catch (_) {} }
    } finally { flushing = false; }
  }
  function errorMessage(reason) { if (reason instanceof Error) return reason.message || reason.name; if (typeof reason === "string") return reason; try { return JSON.stringify(reason); } catch { return String(reason); } }
  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window && (event.target.src || event.target.href)) { const url = String(event.target.src || event.target.href).split("?")[0]; void enqueue("error", "resource", `Falha ao carregar recurso: ${url}`, { recurso: redact(url, 300), tag: event.target.tagName }); return; }
    const err = event.error; void enqueue("error", "window.onerror", event.message || err?.message, { arquivo: redact(event.filename, 240), linha: event.lineno || null, coluna: event.colno || null, stack: redact(err?.stack, 4000), nome: redact(err?.name, 120) });
  }, true);
  window.addEventListener("unhandledrejection", (event) => { const reason = event.reason; void enqueue("error", "unhandledrejection", errorMessage(reason), { stack: redact(reason?.stack, 4000), nome: redact(reason?.name, 120) }); });
  window.addEventListener("online", () => { addBreadcrumb("network", "online"); void enqueue("info", "network", "Conexão restaurada"); });
  window.addEventListener("offline", () => { addBreadcrumb("network", "offline"); void enqueue("warn", "network", "Aplicativo ficou offline"); });
  document.addEventListener("click", (event) => { const el = event.target instanceof Element ? event.target.closest("button,a,[role=button]") : null; if (el) addBreadcrumb("click", `${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || ""}`); }, true);
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => { originalConsoleError(...args); const text = args.map(errorMessage).join(" "); if (!text.includes("client-error-monitor")) void enqueue("error", "console.error", text, { argumentos: args.slice(0, 4).map((value) => redact(errorMessage(value), 400)) }); };
  window.clientErrorMonitor = { report: (message, details = {}) => enqueue("error", "manual", message, details), flush };
  setTimeout(flush, 2500);
})();
