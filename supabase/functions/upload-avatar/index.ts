import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "gm-avatars";
const MAX_FILE_BYTES = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ORIGINS = new Set([
  "https://gmpitangueiras-tech.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const CORS_BASE = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function jsonResponse(req: Request, status: number, body: unknown) {
  const headers = new Headers({ ...CORS_BASE, "Content-Type": "application/json; charset=utf-8" });
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("", { status: 403, headers: CORS_BASE });
    const headers = new Headers(CORS_BASE);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { status: 200, headers });
  }
  if (req.method !== "POST") return jsonResponse(req, 405, { success: false, message: "Método não permitido." });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse(req, 403, { success: false, message: "Origem não autorizada." });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES + 64 * 1024) return jsonResponse(req, 413, { success: false, message: "A imagem excede o limite permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse(req, 503, { success: false, message: "Serviço de foto indisponível." });

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token || token.length > 8192) return jsonResponse(req, 401, { success: false, message: "Sessão inválida." });
    const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return jsonResponse(req, 401, { success: false, message: "Sessão inválida." });

    const form = await req.formData();
    const password = form.get("password");
    const file = form.get("avatar");
    if (typeof password !== "string" || password.length < 1 || password.length > 128 || !file || typeof file.arrayBuffer !== "function") {
      return jsonResponse(req, 400, { success: false, message: "Dados do envio inválidos." });
    }
    if (file.size < 16 || file.size > MAX_FILE_BYTES) return jsonResponse(req, 413, { success: false, message: "A imagem deve ter até 1 MiB." });
    if (!ALLOWED_TYPES.has(file.type)) return jsonResponse(req, 415, { success: false, message: "Use uma imagem JPG, PNG ou WebP." });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedType = detectImageType(bytes);
    if (!detectedType || detectedType !== file.type) return jsonResponse(req, 415, { success: false, message: "O arquivo não corresponde a uma imagem permitida." });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: usuario, error: userError } = await admin
      .from("usuarios")
      .select("id,cpf,status,deleted_at")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (userError || !usuario) return jsonResponse(req, 401, { success: false, message: "Conta não autorizada." });
    if (usuario.deleted_at || !["ativo", "primeiro_acesso"].includes(usuario.status)) return jsonResponse(req, 403, { success: false, message: "Conta sem permissão para alterar a foto." });

    const { data: senhaValida, error: verifyError } = await admin.rpc("gm_verify_legacy_password", {
      p_cpf: String(usuario.cpf || "").replace(/\D/g, ""),
      p_password: password,
    });
    if (verifyError) return jsonResponse(req, 503, { success: false, message: "Não foi possível validar a conta agora." });
    if (senhaValida !== true) return jsonResponse(req, 401, { success: false, message: "Senha incorreta." });

    const extension = detectedType === "image/jpeg" ? "jpg" : detectedType === "image/png" ? "png" : "webp";
    const objectPath = `${usuario.id}/avatar.${extension}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(
      objectPath, new Blob([bytes], { type: detectedType }),
      { contentType: detectedType, cacheControl: "60", upsert: true },
    );
    if (uploadError) return jsonResponse(req, 500, { success: false, message: "Não foi possível salvar a foto." });

    const avatarUrl = `${admin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await admin.from("usuarios").update({ foto_url: avatarUrl }).eq("id", usuario.id);
    if (updateError) return jsonResponse(req, 500, { success: false, message: "A foto foi recebida, mas não foi possível atualizar o perfil." });
    return jsonResponse(req, 200, { success: true, avatar_url: avatarUrl });
  } catch (error) {
    console.error("Erro inesperado no endpoint de avatar.", error instanceof Error ? error.name : "unknown");
    return jsonResponse(req, 400, { success: false, message: "Não foi possível processar o envio." });
  }
});
