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
type UserRecord = Record<string, unknown>;

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
      .select("id,perfil,status,nome_completo,matricula,deleted_at")
      .eq("id", payload.sub)
      .is("deleted_at", null)
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

function maskCpf(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : (digits ? `***${digits.slice(-2)}` : null);
}

function maskPhone(value: unknown) {
  const text = cleanText(value, 40);
  const digits = text.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : (text ? "***" : null);
}

function maskEmail(value: unknown) {
  const text = cleanText(value, 160);
  const at = text.indexOf("@");
  if (at <= 0) return text ? "***" : null;
  return `${text[0]}***${text.slice(at)}`;
}

function isMaskedValue(value: unknown) {
  const text = String(value ?? "");
  return text.includes("***");
}

function publicUser(user: UserRecord | null | undefined) {
  if (!user) return user;
  return { ...user, cpf: maskCpf(user.cpf), telefone: maskPhone(user.telefone), email: maskEmail(user.email) };
}

function auditSafe(value: unknown) {
  if (!value || typeof value !== "object") return value ?? null;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (["senha", "senha_hash", "password", "password_hash", "cpf", "cpf_completo"].includes(key)) continue;
    result[key] = item;
  }
  return result;
}

async function writeAudit(admin: AdminUser, action: string, entity: string, entityId: string | null, before: unknown, after: unknown, justification?: unknown) {
  const safeAfter = auditSafe(after) as Record<string, unknown> | null;
  const dadosNovos = { ...(safeAfter ?? {}), ...(justification ? { justificativa: cleanText(justification, 500) } : {}) };
  const { error } = await adminClient.from("logs_auditoria").insert([{
    usuario_id: admin.id, usuario_matricula: admin.matricula ?? null, usuario_nome: admin.nome_completo ?? null,
    acao: action, entidade: entity, entidade_id: entityId, dados_anteriores: auditSafe(before), dados_novos: dadosNovos,
  }]);
  if (error) console.error("audit log write failed", error.message);
}

function pageParams(body: Record<string, unknown>) {
  const limit = Math.max(1, Math.min(Number(body.limit) || 50, 200));
  const offset = Math.max(0, Math.min(Number(body.offset) || 0, 100_000));
  return { limit, offset };
}

const GOVERNANCE_TYPES = ["ocorrencia", "pessoa", "veiculo"] as const;
type GovernanceType = typeof GOVERNANCE_TYPES[number];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_GOVERNANCE_KEYS = new Set([
  "cpf", "cpf_completo", "senha", "senha_hash", "password", "password_hash", "anexos",
  "narrativa", "observacoes", "descricao", "latitude", "longitude", "coordenadas", "geometria",
]);

function governanceType(value: unknown): GovernanceType | null {
  const type = cleanText(value, 20).toLowerCase() as GovernanceType;
  return GOVERNANCE_TYPES.includes(type) ? type : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function safeChangedFields(value: unknown) {
  if (Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const key = cleanText(entry.campo ?? entry.field ?? entry.nome, 80);
      if (!key || SENSITIVE_GOVERNANCE_KEYS.has(key.toLowerCase())) continue;
      result[key] = entry.depois ?? entry.after ?? entry.valor ?? null;
    }
    return result;
  }
  const source = parseJsonObject(value);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (SENSITIVE_GOVERNANCE_KEYS.has(key.toLowerCase())) continue;
    result[cleanText(key, 80)] = typeof item === "string" ? cleanText(item, 500) : item;
  }
  return result;
}

function governanceSummary(value: unknown) {
  const text = cleanText(value, 240);
  return text ? text : null;
}

function governanceRequesterId(row: UserRecord) {
  return String(row.solicitada_por ?? "");
}

function governanceAgeHours(value: unknown) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000)) : null;
}

function governanceItem(row: UserRecord, type: GovernanceType, requester?: UserRecord | null) {
  const requestedAt = row.solicitada_em ?? row.criado_em ?? null;
  const status = type === "ocorrencia" ? row.status : row.status_retificacao;
  const changed = safeChangedFields(row.campos_alterados);
  return {
    id: row.id,
    tipo: type,
    entidade_id: row.ocorrencia_original_id ?? row.abordagem_original_id ?? row.id,
    status,
    solicitada_em: requestedAt,
    solicitante: requester ? { nome: requester.nome_completo ?? null, matricula: requester.matricula ?? null } : null,
    idade_horas: governanceAgeHours(requestedAt),
    campos_alterados_count: Object.keys(changed).length,
    justificativa: governanceSummary(row.solicitacao_retificacao_justificativa ?? row.justificativa_retificacao),
    atualizado_em: row.atualizado_em ?? null,
  };
}

function governanceDetail(row: UserRecord, type: GovernanceType, requester?: UserRecord | null) {
  const changed = safeChangedFields(row.campos_alterados);
  const original = parseJsonObject(row.versao_original);
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  for (const key of Object.keys(changed)) {
    if (Object.prototype.hasOwnProperty.call(original, key) && !SENSITIVE_GOVERNANCE_KEYS.has(key.toLowerCase())) antes[key] = original[key];
    depois[key] = changed[key];
  }
  return {
    ...governanceItem(row, type, requester),
    antes,
    depois,
    solicitacao: governanceSummary(row.solicitacao_retificacao_justificativa ?? row.justificativa_retificacao),
  };
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
        .is("deleted_at", null)
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

    if (action === "pending_governance") {
      const typeFilter = cleanText(body?.type, 20).toLowerCase();
      const requestedType = body?.type === undefined || !typeFilter || typeFilter === "abordagem" || typeFilter === "retificacao" ? null : governanceType(body.type);
      if (body?.type !== undefined && !requestedType) return response(req, { success: false, error: "Tipo inválido" }, 400);
      const requestedStatus = body?.status === undefined || body.status === "pending" ? "pending_rectification" : body.status === "all" ? null : cleanText(body.status, 40);
      const { limit, offset } = pageParams(body);
      const fetchSize = Math.min(5_000, offset + limit);
      const occurrenceSelect = "id,status,ocorrencia_original_id,solicitada_em,solicitada_por,criado_em,atualizado_em,campos_alterados,versao_original,solicitacao_retificacao_justificativa,justificativa_retificacao";
      const approachSelect = "id,status_retificacao,abordagem_original_id,solicitada_em,solicitada_por,criado_em,atualizado_em,campos_alterados,versao_original,solicitacao_retificacao_justificativa,justificativa_retificacao,nome,placa";
      let occurrenceQuery = adminClient.from("ocorrencias").select(occurrenceSelect).not("ocorrencia_original_id", "is", null).order("solicitada_em", { ascending: false }).range(0, Math.max(0, fetchSize - 1));
      let peopleQuery = adminClient.from("abordagens_pessoas").select(approachSelect).not("abordagem_original_id", "is", null).order("solicitada_em", { ascending: false }).range(0, Math.max(0, fetchSize - 1));
      let vehiclesQuery = adminClient.from("abordagens_veiculos").select(approachSelect).not("abordagem_original_id", "is", null).order("solicitada_em", { ascending: false }).range(0, Math.max(0, fetchSize - 1));
      if (requestedStatus) {
        occurrenceQuery = occurrenceQuery.eq("status", requestedStatus);
        peopleQuery = peopleQuery.eq("status_retificacao", requestedStatus);
        vehiclesQuery = vehiclesQuery.eq("status_retificacao", requestedStatus);
      }
      const [occurrences, people, vehicles] = await Promise.all([
        !requestedType || requestedType === "ocorrencia"
          ? occurrenceQuery
          : Promise.resolve({ data: [], error: null }),
        !requestedType || requestedType === "pessoa"
          ? peopleQuery
          : Promise.resolve({ data: [], error: null }),
        !requestedType || requestedType === "veiculo"
          ? vehiclesQuery
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (occurrences.error || people.error || vehicles.error) throw new Error("governance_queue_query_failed");
      const merged = [
        ...(occurrences.data ?? []).map((row: UserRecord) => ({ row, type: "ocorrencia" as GovernanceType })),
        ...(people.data ?? []).map((row: UserRecord) => ({ row, type: "pessoa" as GovernanceType })),
        ...(vehicles.data ?? []).map((row: UserRecord) => ({ row, type: "veiculo" as GovernanceType })),
      ].sort((a, b) => Date.parse(String(b.row.solicitada_em ?? b.row.criado_em ?? "")) - Date.parse(String(a.row.solicitada_em ?? a.row.criado_em ?? "")));
      const requesterIds = [...new Set(merged.map(({ row }) => governanceRequesterId(row)).filter(Boolean))];
      const requesterMap = new Map<string, UserRecord>();
      if (requesterIds.length) {
        const { data, error } = await adminClient.from("usuarios").select("id,nome_completo,matricula").in("id", requesterIds);
        if (error) throw new Error("governance_requester_query_failed");
        (data ?? []).forEach((user: UserRecord) => requesterMap.set(String(user.id), user));
      }
      const requesterFilter = safeSearch(body?.solicitante);
      const minAge = Math.max(0, Number(body?.idade_min) || 0);
      const filtered = merged.filter(({ row }) => {
        const requester = requesterMap.get(governanceRequesterId(row));
        const name = `${requester?.nome_completo ?? ""} ${requester?.matricula ?? ""}`;
        const age = governanceAgeHours(row.solicitada_em ?? row.criado_em) ?? 0;
        return (!requesterFilter || safeSearch(name).toLowerCase().includes(requesterFilter.toLowerCase())) && age >= minAge * 24;
      });
      const page = filtered.slice(offset, offset + limit).map(({ row, type }) => governanceItem(row, type, requesterMap.get(governanceRequesterId(row))));
      const ages = filtered.map(({ row }) => governanceAgeHours(row.solicitada_em ?? row.criado_em)).filter((age): age is number => age !== null).sort((a, b) => a - b);
      const p95Index = ages.length ? Math.min(ages.length - 1, Math.ceil(ages.length * 0.95) - 1) : -1;
      return response(req, { success: true, data: page, count: filtered.length, limit, offset, has_more: offset + page.length < filtered.length, metrics: { total: filtered.length, idade_p95: p95Index >= 0 ? ages[p95Index] / 24 : null } });
    }

    if (action === "pending_detail") {
      const type = governanceType(body?.type);
      const id = cleanText(body?.id, 80);
      if (!type || !UUID_RE.test(id)) return response(req, { success: false, error: "Tipo ou identificador inválido" }, 400);
      const table = type === "ocorrencia" ? "ocorrencias" : type === "pessoa" ? "abordagens_pessoas" : "abordagens_veiculos";
      const statusColumn = type === "ocorrencia" ? "status" : "status_retificacao";
      const detailSelect = type === "ocorrencia"
        ? "id,status,ocorrencia_original_id,solicitada_em,solicitada_por,criado_em,atualizado_em,campos_alterados,versao_original,solicitacao_retificacao_justificativa,justificativa_retificacao"
        : "id,status_retificacao,abordagem_original_id,solicitada_em,solicitada_por,criado_em,atualizado_em,campos_alterados,versao_original,solicitacao_retificacao_justificativa,justificativa_retificacao,nome,placa";
      const { data: row, error } = await adminClient.from(table).select(detailSelect).eq("id", id).eq(statusColumn, "pending_rectification").maybeSingle();
      if (error) throw new Error("governance_detail_query_failed");
      if (!row) return response(req, { success: false, error: "Item pendente não encontrado" }, 404);
      let requester: UserRecord | null = null;
      if (row.solicitada_por) {
        const result = await adminClient.from("usuarios").select("id,nome_completo,matricula").eq("id", row.solicitada_por).maybeSingle();
        if (result.error) throw new Error("governance_requester_query_failed");
        requester = result.data as UserRecord | null;
      }
      return response(req, { success: true, data: governanceDetail(row as UserRecord, type, requester) });
    }

    if (action === "approve_governance") {
      const type = governanceType(body?.type);
      const id = cleanText(body?.id, 80);
      if (!type || !UUID_RE.test(id)) return response(req, { success: false, error: "Tipo ou identificador inválido" }, 400);
      const rpc = "gm_admin_approve_governance";
      const args = { p_retification_id: id, p_tipo: type, p_actor_id: admin.id };
      const { data, error } = await adminClient.rpc(rpc, args);
      if (error) return response(req, { success: false, error: "Não foi possível aprovar a retificação" }, 409);
      const entity = type === "ocorrencia" ? "ocorrencias" : type === "pessoa" ? "abordagens_pessoas" : "abordagens_veiculos";
      await writeAudit(admin, "approve_governance", entity, id, null, { id, tipo: type, status: "rectified" }, body?.justificativa);
      return response(req, { success: true, data: { id, tipo: type, status: "rectified", resultado: data } });
    }

    if (action === "reject_governance") {
      const type = governanceType(body?.type);
      const id = cleanText(body?.id, 80);
      const reason = cleanText(body?.motivo ?? body?.motivo_rejeicao, 1_000);
      if (!type || !UUID_RE.test(id)) return response(req, { success: false, error: "Tipo ou identificador inválido" }, 400);
      if (reason.length < 10) return response(req, { success: false, error: "O motivo deve ter ao menos 10 caracteres" }, 400);
      const table = type === "ocorrencia" ? "ocorrencias" : type === "pessoa" ? "abordagens_pessoas" : "abordagens_veiculos";
      const statusColumn = type === "ocorrencia" ? "status" : "status_retificacao";
      const { data: before, error: beforeError } = await adminClient.from(table).select("id,status,status_retificacao,esta_ativa,solicitada_por,solicitada_em,campos_alterados").eq("id", id).eq(statusColumn, "pending_rectification").maybeSingle();
      if (beforeError) throw new Error("governance_reject_lookup_failed");
      if (!before) return response(req, { success: false, error: "Item pendente não encontrado" }, 409);
      const { data: after, error } = await adminClient.rpc("gm_admin_reject_governance", { p_retification_id: id, p_tipo: type, p_motivo: reason, p_actor_id: admin.id });
      if (error || !after) return response(req, { success: false, error: "O item mudou de estado; atualize a fila" }, 409);
      await writeAudit(admin, "reject_governance", table, id, before, { id, tipo: type, status: "rectification_rejected", rejeitada_em: (after as UserRecord).rejeitada_em }, reason);
      return response(req, { success: true, data: { id, tipo: type, status: "rectification_rejected", rejeitada_em: (after as UserRecord).rejeitada_em } });
    }

    if (action === "sync_metrics") {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
      const [sync, occurrences, people, vehicles] = await Promise.all([
        adminClient.from("sincronizacao").select("id,status,origem,atualizado_em,criado_em").gte("atualizado_em", since).order("atualizado_em", { ascending: false }).limit(5_000),
        adminClient.from("ocorrencias").select("id,status,origem,atualizado_em").gte("atualizado_em", since).limit(5_000),
        adminClient.from("abordagens_pessoas").select("id,status_abordagem,origem,atualizado_em").gte("atualizado_em", since).limit(5_000),
        adminClient.from("abordagens_veiculos").select("id,status_abordagem,origem,atualizado_em").gte("atualizado_em", since).limit(5_000),
      ]);
      if (sync.error || occurrences.error || people.error || vehicles.error) return response(req, { success: true, data: null, status: "indisponivel" });
      const rows = [...(sync.data ?? []), ...(occurrences.data ?? []), ...(people.data ?? []), ...(vehicles.data ?? [])] as UserRecord[];
      const buckets = new Map<string, UserRecord>();
      for (const row of rows) {
        const origin = cleanText(row.origem, 80) || "desconhecida";
        const key = `${origin}|${String(row.atualizado_em ?? row.criado_em ?? "")}`;
        const bucket = buckets.get(key) ?? { origem: origin, atualizado_em: row.atualizado_em ?? row.criado_em ?? null, pending: 0, success: 0, error: 0, conflict: 0 };
        const status = String(row.status ?? row.status_abordagem ?? "").toLowerCase();
        if (["pending", "pending_sync", "processing"].includes(status)) bucket.pending = Number(bucket.pending) + 1;
        else if (["success", "synced", "completed"].includes(status)) bucket.success = Number(bucket.success) + 1;
        else if (["conflict", "conflito"].includes(status)) bucket.conflict = Number(bucket.conflict) + 1;
        else if (["error", "erro", "failed"].includes(status)) bucket.error = Number(bucket.error) + 1;
        buckets.set(key, bucket);
      }
      const itens = [...buckets.values()];
      const totals = itens.reduce((result, item) => {
        for (const key of ["pending", "success", "error", "conflict"]) result[key] += Number(item[key] ?? 0);
        return result;
      }, { pending: 0, success: 0, error: 0, conflict: 0 });
      const decided = totals.success + totals.error + totals.conflict;
      return response(req, { success: true, data: {
        estado: "disponivel",
        desde: since,
        pendentes: totals.pending,
        conflitos: totals.conflict,
        sucesso: totals.success,
        erros: totals.error,
        taxa: decided ? (totals.success / decided) * 100 : null,
        ultima_sincronizacao: itens[0]?.atualizado_em ?? null,
        itens,
      } });
    }

    if (action === "summary") {
      const profileNames = ["guarda", "supervisor", "administrador"] as const;
      const [users, activeUsers, inactiveUsers, ...profileResults] = await Promise.all([
        adminClient.from("usuarios").select("id", { count: "exact", head: true }).is("deleted_at", null),
        adminClient.from("usuarios").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "ativo"),
        adminClient.from("usuarios").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "ativo"),
        ...profileNames.map((perfil) => adminClient.from("usuarios").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("perfil", perfil)),
        adminClient.from("logs_acesso").select("id", { count: "exact", head: true }),
        adminClient.from("sistema_erros").select("id", { count: "exact", head: true }).eq("resolvido", false),
        adminClient.from("logs_acesso").select("data_hora,usuario_id,acao").eq("acao", "login")
          .order("data_hora", { ascending: false }).limit(1),
      ]);
      const logs = profileResults[3];
      const errors = profileResults[4];
      const lastLogin = profileResults[5];
      if (users.error || activeUsers.error || inactiveUsers.error || profileResults.some((result: { error?: unknown }) => result.error) || logs.error || errors.error || lastLogin.error) throw new Error("summary_query_failed");
      const perfis: Record<string, number> = {};
      profileNames.forEach((perfil, index) => perfis[perfil] = profileResults[index].count ?? 0);
      return response(req, {
        success: true,
        data: {
          usuarios: {
            total: users.count ?? 0,
            ativos: activeUsers.count ?? 0,
            inativos: inactiveUsers.count ?? 0,
            perfis,
          },
          logs: logs.count ?? 0,
          erros_abertos: errors.count ?? 0,
          ultimo_login: lastLogin.data?.[0] ?? null,
          versao: "v85",
          fuso_operacional: "America/Sao_Paulo",
        },
      });
    }

    if (action === "users") {
      const search = safeSearch(body?.search);
      const { limit, offset } = pageParams(body);
      let query = adminClient.from("usuarios")
        .select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso,ultimo_login,criado_em,atualizado_em", { count: "exact" })
        .is("deleted_at", null).order("nome_completo").range(offset, offset + limit - 1);
      if (search) query = query.or(`nome_completo.ilike.%${search}%,cpf.ilike.%${search}%,matricula.ilike.%${search}%`);
      const { data, error, count } = await query;
      if (error) throw new Error("users_query_failed");
      return response(req, { success: true, data: (data ?? []).map((user: UserRecord) => publicUser(user)), count: count ?? 0, limit, offset });
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
      const { limit, offset } = pageParams(body);
      const { data, error, count } = await adminClient.from("sistema_erros")
        .select("id,criado_em,nivel,origem,mensagem,rota,versao,dispositivo,resolvido", { count: "exact" })
        .order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw new Error("errors_query_failed");
      return response(req, { success: true, data: data ?? [], count: count ?? 0, limit, offset });
    }

    if (action === "audit_logs") {
      const { limit, offset } = pageParams(body);
      let query = adminClient.from("logs_auditoria").select(
        "id,criado_em,usuario_id,usuario_matricula,usuario_nome,acao,entidade,entidade_id,dados_anteriores,dados_novos",
        { count: "exact" },
      ).order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
      const acao = safeSearch(body?.acao);
      const entidade = safeSearch(body?.entidade);
      const usuarioId = cleanText(body?.usuario_id, 80);
      if (acao) query = query.eq("acao", acao);
      if (entidade) query = query.eq("entidade", entidade);
      if (usuarioId) query = query.eq("usuario_id", usuarioId);
      const { data, error, count } = await query;
      if (error) throw new Error("audit_logs_query_failed");
      return response(req, { success: true, data: data ?? [], count: count ?? 0, limit, offset });
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
      const newId = crypto.randomUUID();
      const { data, error } = await adminClient.from("usuarios").insert([{
        id: newId,
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
      await writeAudit(admin, "create_user", "usuarios", newId, null, { nome_completo: nome, perfil, status: "primeiro_acesso", matricula: cleanText(body?.matricula, 40) || null }, body?.justificativa);
      return response(req, { success: true, data: publicUser(data as UserRecord), senha_temporaria: password });
    }

    if (action === "update_user") {
      const id = cleanText(body?.id, 80);
      if (!id) return response(req, { success: false, error: "Usuário inválido" }, 400);
      const { data: before, error: beforeError } = await adminClient.from("usuarios")
        .select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso").eq("id", id).is("deleted_at", null).maybeSingle();
      if (beforeError) throw new Error("user_lookup_failed");
      if (!before) return response(req, { success: false, error: "Usuário não encontrado" }, 404);
      const patch: Record<string, unknown> = { atualizado_por: admin.id, atualizado_em: new Date().toISOString() };
      for (const key of ["nome_completo", "email", "telefone", "matricula"] as const) {
        if (body?.[key] !== undefined && (!(["email", "telefone"].includes(key)) || !isMaskedValue(body[key]))) {
          patch[key] = cleanText(body[key], 160) || null;
        }
      }
      if (body?.perfil !== undefined && ["guarda", "supervisor", "administrador"].includes(body.perfil)) patch.perfil = body.perfil;
      if (body?.status !== undefined && ["ativo", "inativo", "bloqueado", "primeiro_acesso"].includes(body.status)) patch.status = body.status;
      if (id === admin.id && (patch.status && patch.status !== "ativo" || patch.perfil && patch.perfil !== "administrador")) {
        return response(req, { success: false, error: "Não é permitido desativar ou rebaixar a própria conta" }, 400);
      }
      const resultingStatus = String(patch.status ?? before.status);
      const resultingPerfil = String(patch.perfil ?? before.perfil);
      if (before.perfil === "administrador" && before.status === "ativo" && (resultingStatus !== "ativo" || resultingPerfil !== "administrador")) {
        const { count, error: countError } = await adminClient.from("usuarios").select("id", { count: "exact", head: true })
          .eq("perfil", "administrador").eq("status", "ativo").is("deleted_at", null);
        if (countError) throw new Error("admin_count_failed");
        if ((count ?? 0) <= 1) return response(req, { success: false, error: "Não é permitido desativar ou rebaixar o último administrador ativo" }, 409);
      }
      const { data, error } = await adminClient.from("usuarios").update(patch).eq("id", id).is("deleted_at", null)
        .select("id,nome_completo,cpf,matricula,email,telefone,perfil,status,primeiro_acesso").single();
      if (error) throw new Error("user_update_failed");
      await writeAudit(admin, "update_user", "usuarios", id, before, data, body?.justificativa);
      return response(req, { success: true, data: publicUser(data as UserRecord) });
    }

    if (action === "reset_password") {
      const id = cleanText(body?.id, 80);
      if (!id || id === admin.id) return response(req, { success: false, error: "Use a troca de senha do próprio perfil" }, 400);
      const password = temporaryPassword();
      const { data: hash, error: hashError } = await adminClient.rpc("criar_hash_senha", { p_senha: password });
      if (hashError) throw new Error("password_hash_failed");
      const { data: target, error: targetError } = await adminClient.from("usuarios").select("id,nome_completo,perfil,status")
        .eq("id", id).is("deleted_at", null).maybeSingle();
      if (targetError) throw new Error("user_lookup_failed");
      if (!target) return response(req, { success: false, error: "Usuário não encontrado" }, 404);
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
      await writeAudit(admin, "reset_password", "usuarios", id, target, { status: "primeiro_acesso", primeiro_acesso: true });
      return response(req, { success: true, senha_temporaria: password });
    }

    return response(req, { success: false, error: "Ação não reconhecida" }, 400);
  } catch (error) {
    console.error("admin-governance failed", error instanceof Error ? error.name : "unknown");
    return response(req, { success: false, error: "Erro interno no módulo administrativo" }, 500);
  }
});
