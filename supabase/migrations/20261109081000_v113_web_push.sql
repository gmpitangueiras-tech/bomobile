BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  plataforma text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_envio_em timestamp without time zone,
  ultimo_erro text,
  criado_em timestamp without time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_usuario_ativo_idx
  ON public.push_subscriptions (usuario_id, ativo);

CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id uuid REFERENCES public.notificacoes(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('sent','failed','expired')),
  http_status integer,
  erro text,
  criado_em timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_delivery_logs_notificacao_idx
  ON public.push_delivery_logs (notificacao_id, criado_em DESC);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_self_read ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_read ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (usuario_id = public.gm_current_profile_id());

DROP POLICY IF EXISTS push_subscriptions_self_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = public.gm_current_profile_id());

DROP POLICY IF EXISTS push_subscriptions_self_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (usuario_id = public.gm_current_profile_id())
  WITH CHECK (usuario_id = public.gm_current_profile_id());

DROP POLICY IF EXISTS push_subscriptions_self_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (usuario_id = public.gm_current_profile_id());

REVOKE ALL ON public.push_delivery_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions, public.push_delivery_logs TO service_role;

COMMIT;
