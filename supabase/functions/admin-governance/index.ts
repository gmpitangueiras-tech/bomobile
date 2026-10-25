import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = new Set([
  "https://gmpitangueiras-tech.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const CORS_BASE = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};
const encoder = new TextEncoder();
const tokenSecret = encoder.encode(SERVICE_ROLE_KEY);
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AdminUser = { id: string; perfil: string; status: string; nome_completo?: string; matricula?: string };

function response(req: Request, data: unknown, status = 200) {
  const headers = new Headers({ ...CORS_BASE, "Content-Type": "application/json; charset=utf-8" });
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(data), { status, headers });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw", tokenSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function fingerprint(value: string) {
  const bytes = await hmac(`admin-login:${value}`);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function issueToken(userId: string) {
  const payload = { sub: userId, exp: Date.now() + 30 * 60 * 1000, scope: "admin-governance" };
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64Url(await hmac(body))}`;
}

async function verifyToken(token: string | null): Promise<AdminUser | null> {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    const expected = await hmac(body);
    const actual = fromBase64Url(signature);
    if (actual.length !== expected.length || !actual.every((value, index) => value === expected[index])) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (payload.scope !== "admin-governance" || !payload.sub || Number(payload.exp) < Date.now()) return null;
    const { data, error } = await adminClient
      .from("usuarios")
      .select("id,perfil,status,nome_completo,matricula")
      .eq("id", payload.sub)
      .maybeSingle();
    if (error || data?.perfil !== "administrador" || data.status !== "ativo") return null;
    return data as AdminUser;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function safeSearch(value: unknown) {
  return cleanText(value, 80).normalize("NFC").replace(/[^\p{L}\p{M}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim();
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `Temp${base64Url(bytes).slice(0, 16)}!9a`;
}

async function recordLoginAttempts(cpf: string, req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const ip = forwarded.split(",")[0].trim().slice(0, 80);
  const cpfKey = await fingerprint(`cpf:${cpf}`);
  const ipKey = await fingerprint(`ip:${ip}`);
  const [cpfResult, ipResult] = await Promise.all([
    adminClient.rpc("gm_record_login_attempt", { p_attempt_key: cpfKey }),
    adminClient.rpc("gm_record_login_attempt", { p_attempt_key: ipKey }),
  ]);
  if (cpfResult.error || ipResult.error) return { cpfKey, ipKey, allowed: false, failed: true };
  return { cpfKey, ipKey, allowed: cpfResult.data === true && ipResult.data === true, failed: false };
}

async function clearLoginAttempts(cpfKey: string, ipKey: string) {
  await Promise.all([
    adminClient.rpc("gm_clear_login_attempt", { p_attempt_key: cpfKey }),
    adminClient.rpc("gm_clear_login_attempt", { p_attempt_key: ipKey }),
  ]);
}

async function parseBody(req: Request) {
  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > 16_384) throw new Error("body_too_large");
  const text = await req.text();
  if (text.length > 16_384) throw new Error("body_too_large");
  return JSON.parse(text);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("", { status: 403, headers: CORS_BASE });
    const headers = new Headers(CORS_BASE);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { status: 200, headers });
  }
  if (req.method !== "POST") return response(req, { success: false, error: "Método não permitido" }, 405);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(req, { success: false, error: "Origem não autorizada" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response(req, { success: false, error: "Serviço indisponível" }, 503);

  try {
    const body = await parseBody(req);
    const action = cleanText(body?.action, 40);

    if (action === "issue_session") {
      const cpf = cleanText(body?.cpf, 20).replace(/\D/g, "");
      const password = typeof body?.senha === "string" ? body.senha : "";
      if (cpf.length !== 11 || password.length < 1 || password.length > 128) {
        return response(req, { success: false, error: "Credenciais inválidas" }, 401);
      }
      const attempts = await recordLoginAttempts(cpf, req);
      if (attempts.failed) return response(req, { success: false, error: "Não foi possível autenticar agora" }, 503);
      if (!attempts.allowed) return response(req, { success: false, error: "Aguarde antes de tentar novamente" }, 429);

      const { data: valid, error: verifyError } = await adminClient.rpc("gm_verify_legacy_password", {
        p_cpf: cpf,
        p_password: password,
      });
      if (verifyError) return response(req, { success: false, error: "Não foi possível autenticar agora" }, 503);
      if (valid !== true) return response(req, { success: false, error: "Credenciais inválidas" }, 401);

      const { data: user, error: profileError } = await adminClient
        .from("usuarios")
        .select("id,nome_completo,matricula,perfil,status")
        .eq("cpf", cpf)
        .maybeSingle();
      if (profileError) return response(req, { success: false, error: "Não foi possível autenticar agora" }, 503);
      if (!user || user.perfil !== "administrador" || user.status !== "ativo") {
        return response(req, { success: false, error: "Acesso administrativo não autorizado" }, 403);
      }
      await clearLoginAttempts(attempts.cpfKey, attempts.ipKey);
      return response(req, {
        success: true,
        token: await issueToken(user.id),
        expires_in: 1800,
        usuario: user,
      });
    }

    const admin = await verifyToken(req.headers.get("x-admin-token"));
    if (!admin) return response(req, { success: false, error: "Sessão administrativa inválida ou expirada" }, 401);

    if (action === "summary") {
      const [users, logs, errors, lastLogin] = await Promise.all([
        adminClient.from("usuarios").select("id", { count: "exact", head: true }),
        adminClient.from("logs_acesso").select("id", { count: "exact", head: true }),
        adminClient.from("sistema_erros").select("id", { count: "exact", head: true }).eq("resolvido", false),
        adminClient.from("logs_acesso").select("data_hora,usuario_id,acao").eq("acao", "login")
          .order("data_hora", { ascending: false }).limit(1),
      ]);
      if (users.error || logs.error || errors.error || lastLogin.error) throw new Error("summary_query_failed");
      return response(req, {
        success: true,
        data: {
          usuarios: users.count ?? 0,
          logs: logs.count ?? 0,
          erros_abertos: errors.count ?? 0,
          ultimo_login: lastLogin.data?.[0] ?? null,
          versao: "v74",
          fuso_operacional: "America/Sao_Paulo",
        },
      });
    }

    if (action === "users") {
      const search = safeSearch(body?.search);
      let query = adminClient.from("usuarios")
        .select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso,ultimo_login,criado_em,atualizado_em")
        .order("nome_completo").limit(200);
      if (search) query = query.or(`nome_completo.ilike.%${search}%,cpf.ilike.%${search}%,matricula.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw new Error("users_query_failed");
      return response(req, { success: true, data: data ?? [] });
    }

    if (action === "logs") {
      const limit = Math.max(1, Math.min(Number(body?.limit) || 50, 200));
      const offset = Math.max(0, Math.min(Number(body?.offset) || 0, 100_000));
      const { data, error, count } = await adminClient.from("logs_acesso")
        .select("id,data_hora,usuario_id,acao,entidade,detalhes,ip,usuarios(nome_completo,matricula)", { count: "exact" })
        .order("data_hora", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error("logs_query_failed");
      return response(req, { success: true, data: data ?? [], count: count ?? 0, limit, offset });
    }

    if (action === "errors") {
      const { data, error } = await adminClient.from("sistema_erros")
        .select("id,criado_em,nivel,origem,mensagem,rota,versao,dispositivo,resolvido")
        .order("criado_em", { ascending: false }).limit(100);
      if (error) throw new Error("errors_query_failed");
      return response(req, { success: true, data: data ?? [] });
    }

    if (action === "create_user") {
      const nome = cleanText(body?.nome, 160);
      const cpf = cleanText(body?.cpf, 20).replace(/\D/g, "");
      const perfil = cleanText(body?.perfil, 30);
      if (!nome || cpf.length !== 11 || !["guarda", "supervisor", "administrador"].includes(perfil)) {
        return response(req, { success: false, error: "Dados inválidos" }, 400);
      }
      const password = typeof body?.senha === "string" && body.senha.length ? body.senha : temporaryPassword();
      if (password.length > 128) return response(req, { success: false, error: "Senha inválida" }, 400);
      const { data: hash, error: hashError } = await adminClient.rpc("criar_hash_senha", { p_senha: password });
      if (hashError) throw new Error("password_hash_failed");
      const { data, error } = await adminClient.from("usuarios").insert([{
        id: crypto.randomUUID(),
        nome_completo: nome,
        cpf,
        matricula: cleanText(body?.matricula, 40) || null,
        email: cleanText(body?.email, 160) || null,
        telefone: cleanText(body?.telefone, 40) || null,
        perfil,
        status: "primeiro_acesso",
        primeiro_acesso: true,
        senha_hash: hash,
        criado_por: admin.id,
        atualizado_por: admin.id,
      }]).select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso").single();
      if (error) throw new Error("user_create_failed");
      return response(req, { success: true, data, senha_temporaria: password });
    }

    if (action === "update_user") {
      const id = cleanText(body?.id, 80);
      if (!id) return response(req, { success: false, error: "Usuário inválido" }, 400);
      const patch: Record<string, unknown> = { atualizado_por: admin.id, atualizado_em: new Date().toISOString() };
      for (const key of ["nome_completo", "email", "telefone", "matricula"] as const) {
        if (body?.[key] !== undefined) patch[key] = cleanText(body[key], 160) || null;
      }
      if (body?.perfil !== undefined && ["guarda", "supervisor", "administrador"].includes(body.perfil)) patch.perfil = body.perfil;
      if (body?.status !== undefined && ["ativo", "inativo", "bloqueado", "primeiro_acesso"].includes(body.status)) patch.status = body.status;
      if (id === admin.id && (patch.status && patch.status !== "ativo" || patch.perfil && patch.perfil !== "administrador")) {
        return response(req, { success: false, error: "Não é permitido desativar ou rebaixar a própria conta" }, 400);
      }
      const { data, error } = await adminClient.from("usuarios").update(patch).eq("id", id)
        .select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso").single();
      if (error) throw new Error("user_update_failed");
      return response(req, { success: true, data });
    }

    if (action === "reset_password") {
      const id = cleanText(body?.id, 80);
      if (!id || id === admin.id) return response(req, { success: false, error: "Use a troca de senha do próprio perfil" }, 400);
      const password = temporaryPassword();
      const { data: hash, error: hashError } = await adminClient.rpc("criar_hash_senha", { p_senha: password });
      if (hashError) throw new Error("password_hash_failed");
      const { error } = await adminClient.from("usuarios").update({
        senha_hash: hash,
        status: "primeiro_acesso",
        primeiro_acesso: true,
        atualizado_por: admin.id,
        atualizado_em: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error("password_reset_failed");
      await adminClient.from("logs_acesso").insert([{
        usuario_id: admin.id,
        acao: "resetar_senha",
        entidade: "usuario",
        detalhes: JSON.stringify({ usuario_id: id, senha_exibida_uma_vez: true }),
      }]);
      return response(req, { success: true, senha_temporaria: password });
    }

    return response(req, { success: false, error: "Ação não reconhecida" }, 400);
  } catch (error) {
    console.error("admin-governance failed", error instanceof Error ? error.name : "unknown");
    return response(req, { success: false, error: "Erro interno no módulo administrativo" }, 500);
  }
});
