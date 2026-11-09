import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@guardamunicipal.pitangueiras.pr.gov.br";
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-webhook-secret") !== webhookSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  try {
    const payload = await req.json();
    const record = payload.record || payload;
    if (!record?.id || !record?.usuario_id) throw new Error("notificacao inválida");
    const { data: subs, error } = await supabase.from("push_subscriptions").select("id,usuario_id,endpoint,p256dh,auth").eq("usuario_id", record.usuario_id).eq("ativo", true).limit(50);
    if (error) throw error;
    let sent = 0;
    for (const sub of subs || []) {
      const body = JSON.stringify({ title: record.titulo || "Guarda Municipal", body: record.mensagem || "Você tem uma nova notificação", icon: "/bomobile/assets/icons/icon-192x192.png", badge: "/bomobile/assets/icons/icon-72x72.png", tag: `notif-${record.id}`, data: { link: record.link || "/bomobile/#notificacoes", notificationId: record.id, type: record.tipo || "sistema" } });
      try {
        const result = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 86400, urgency: record.tipo === "nova_ocorrencia" ? "high" : "normal" });
        await supabase.from("push_subscriptions").update({ ultimo_envio_em: new Date().toISOString(), ultimo_erro: null, atualizado_em: new Date().toISOString() }).eq("id", sub.id);
        await supabase.from("push_delivery_logs").insert({ notificacao_id: record.id, subscription_id: sub.id, usuario_id: sub.usuario_id, status: "sent", http_status: result.statusCode || 201 });
        sent++;
      } catch (error) {
        const status = error?.statusCode || null;
        const expired = status === 404 || status === 410;
        await supabase.from("push_subscriptions").update({ ativo: !expired, ultimo_erro: String(error?.message || error).slice(0, 500), atualizado_em: new Date().toISOString() }).eq("id", sub.id);
        await supabase.from("push_delivery_logs").insert({ notificacao_id: record.id, subscription_id: sub.id, usuario_id: sub.usuario_id, status: expired ? "expired" : "failed", http_status: status, erro: String(error?.message || error).slice(0, 500) });
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, subscriptions: subs?.length || 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
