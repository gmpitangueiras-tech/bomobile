class SupabaseClient {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.client;

    try {
      let tentativas = 0;
      while (typeof supabase === "undefined" && tentativas < 20) {
        await new Promise((r) => setTimeout(r, 500));
        tentativas++;
      }

      if (typeof supabase === "undefined") {
        throw new Error("Supabase não carregado");
      }

      const { createClient } = supabase;
      this.client = createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      );

      this.initialized = true;
      console.log("✅ Supabase Client inicializado");
      return this.client;
    } catch (error) {
      console.error("❌ Erro ao inicializar Supabase:", error);
      return null;
    }
  }

  getClient() {
    return this.client;
  }
  isInitialized() {
    return this.initialized && this.client !== null;
  }
}

const supabaseClient = new SupabaseClient();
window.supabaseClient = supabaseClient;

const signedAnexoUrls = new Map();

/** Resolve um object path ou URL pública legada do bucket privado anexos. */
async function resolverUrlAnexo(valor, opcoes = {}) {
  if (!valor || typeof valor !== "string") return null;
  try {
    let path = valor.trim();
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/anexos\/(.+)$/i);
      if (!match) return null;
      path = match[1];
    } else {
      path = path.replace(/^\/+/, "");
      if (path.startsWith("anexos/")) path = path.slice("anexos/".length);
      if (path.startsWith("storage/v1/object/")) {
        const match = path.match(/^storage\/v1\/object\/(?:public|sign|authenticated)\/anexos\/(.+)$/i);
        if (!match) return null;
        path = match[1];
      }
    }
    path = decodeURIComponent(path.split(/[?#]/, 1)[0]).replace(/^\/+|\/+$/g, "");
    if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) return null;

    const download = opcoes?.download || undefined;
    const cacheKey = `${path}\u0000${download || ""}`;
    const cached = signedAnexoUrls.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 20_000) return cached.url;

    const client = window.supabaseClient?.getClient();
    if (!client) return null;
    const storage = client.storage.from("anexos");
    const { data, error } = download
      ? await storage.createSignedUrl(path, 900, { download })
      : await storage.createSignedUrl(path, 900);
    const signedUrl = error ? null : data?.signedUrl || null;
    if (signedUrl) signedAnexoUrls.set(cacheKey, { url: signedUrl, expiresAt: Date.now() + 14 * 60_000 });
    return signedUrl;
  } catch (_) {
    return null;
  }
}
window.resolverUrlAnexo = resolverUrlAnexo;

/** Abre um anexo usando uma janela criada sincronicamente durante o gesto do usuário. */
window.abrirUrlAnexo = async (valor, download) => {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  const signedUrl = await resolverUrlAnexo(valor, { download });
  if (signedUrl && popup) popup.location.replace(signedUrl);
  else if (popup) popup.close();
  else if (signedUrl) window.location.assign(signedUrl);
  return signedUrl;
};

// Assina recursos do bucket privado em imagens, documentos, mídia e links.
(function observarAnexosPrivados() {
  const linkOriginal = new WeakMap();
  const signedPattern = /\/storage\/v1\/object\/(?:sign|authenticated)\/anexos\//i;
  const isSignedAttachment = (value) => typeof value === "string" && signedPattern.test(value);
  const isPrivateAttachment = (value) => {
    if (!value) return false;
    const text = String(value).trim();
    if (!text || /^(?:data|blob|javascript):/i.test(text) || isSignedAttachment(text)) return false;
    if (/^https?:\/\//i.test(text)) return /\/storage\/v1\/object\/public\/anexos\//i.test(text);
    const path = text.split(/[?#]/, 1)[0].replace(/^\/+/, "");
    return /^storage\/v1\/object\/public\/anexos\//i.test(path)
      || /^anexos\//i.test(path)
      || /^[0-9a-f-]{36}\//i.test(path)
      || /^(?:ocorrencias?|abordagens?|mural)\//i.test(path);
  };
  const attributes = ["src", "data-fallback", "href", "poster", "data"];
  const selector = "img[src],img[data-fallback],a[href],video[src],video[poster],audio[src],source[src],iframe[src],embed[src],object[data]";

  const signAttribute = async (element, attribute) => {
    const raw = element.getAttribute(attribute);
    if (!raw) return;
    if (attribute === "href" && element instanceof HTMLAnchorElement) {
      if (isPrivateAttachment(raw)) linkOriginal.set(element, raw);
      else if (!isSignedAttachment(raw)) linkOriginal.delete(element);
    }
    if (!isPrivateAttachment(raw)) return;

    const marker = `signed${attribute.replace(/[^a-z0-9]/gi, "")}`;
    if (element.dataset[marker] === raw) return;
    element.dataset[marker] = raw;
    const download = attribute === "href" && element instanceof HTMLAnchorElement && element.hasAttribute("download")
      ? (element.getAttribute("download") || true)
      : undefined;
    const signedUrl = await resolverUrlAnexo(raw, { download });
    if (signedUrl && element.isConnected && element.getAttribute(attribute) === raw) {
      if (attribute === "href" && element instanceof HTMLAnchorElement) linkOriginal.set(element, raw);
      element.setAttribute(attribute, signedUrl);
      delete element.dataset[marker];
    } else if (element.dataset[marker] === raw) {
      delete element.dataset[marker];
    }
  };

  const scan = (root) => {
    if (!(root instanceof Element || root instanceof Document)) return;
    const nodes = new Set();
    if (root instanceof Element && root.matches(selector)) nodes.add(root);
    root.querySelectorAll?.(selector).forEach((node) => nodes.add(node));
    nodes.forEach((element) => attributes.forEach((attribute) => {
      if (element.hasAttribute(attribute)) void signAttribute(element, attribute);
    }));
  };

  if (typeof document !== "undefined" && document.documentElement) {
    scan(document);
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = link.getAttribute("href") || "";
      const source = isPrivateAttachment(href) ? href : isSignedAttachment(href) ? linkOriginal.get(link) : null;
      if (!source) return;
      event.preventDefault();
      const download = link.hasAttribute("download") ? (link.getAttribute("download") || true) : undefined;
      void window.abrirUrlAnexo(source, download);
    }, true);

    new MutationObserver((records) => records.forEach((record) => {
      if (record.type === "attributes") scan(record.target);
      record.addedNodes.forEach(scan);
    })).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "data-fallback", "href", "poster", "data"],
    });
  }
})();
