-- v88 P4-GOV / LGPD lifecycle. Metadata and controlled workflow only.
-- No records are deleted by this migration.

CREATE TABLE IF NOT EXISTS public.governance_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE,
  descricao text NOT NULL,
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias >= 0),
  status text NOT NULL DEFAULT 'pendente_aprovacao' CHECK (status IN ('pendente_aprovacao','aprovada','suspensa')),
  base_legal_revisada boolean NOT NULL DEFAULT false,
  ultima_revisao_em timestamptz,
  revisada_por uuid REFERENCES public.usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.governance_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitado_por uuid NOT NULL REFERENCES public.usuarios(id),
  escopo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','em_processamento','concluida','expirada','cancelada','erro')),
  objeto_path text,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  expira_em timestamptz,
  erro_codigo text
);

CREATE TABLE IF NOT EXISTS public.governance_attachment_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acessado_por uuid NOT NULL REFERENCES public.usuarios(id),
  entidade text NOT NULL,
  entidade_id uuid,
  objeto_id text,
  finalidade text NOT NULL,
  acessado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.governance_permission_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revisado_por uuid NOT NULL REFERENCES public.usuarios(id),
  usuario_id uuid REFERENCES public.usuarios(id),
  resultado text NOT NULL CHECK (resultado IN ('mantido','alterado','suspenso','pendente')),
  justificativa text NOT NULL,
  revisado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.governance_retention_policies (categoria, descricao)
VALUES
  ('rascunhos', 'Rascunhos e dados locais pendentes de finalização'),
  ('registros_finalizados', 'Registros operacionais finalizados'),
  ('retificacoes', 'Versões de retificação e decisões administrativas'),
  ('logs_auditoria', 'Trilha de auditoria administrativa'),
  ('anexos', 'Anexos e objetos de Storage'),
  ('exportacoes', 'Arquivos de exportação gerados pelo sistema')
ON CONFLICT (categoria) DO NOTHING;

CREATE INDEX IF NOT EXISTS governance_retention_status_idx ON public.governance_retention_policies (status, categoria);
CREATE INDEX IF NOT EXISTS governance_export_requests_user_idx ON public.governance_export_requests (solicitado_por, solicitado_em DESC, status);
CREATE INDEX IF NOT EXISTS governance_attachment_access_time_idx ON public.governance_attachment_access (acessado_em DESC, entidade, acessado_por);
CREATE INDEX IF NOT EXISTS governance_permission_reviews_time_idx ON public.governance_permission_reviews (revisado_em DESC, usuario_id, resultado);

ALTER TABLE public.governance_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_attachment_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_permission_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.governance_retention_policies, public.governance_export_requests, public.governance_attachment_access, public.governance_permission_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.governance_retention_policies TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.governance_export_requests TO service_role;
GRANT SELECT, INSERT ON public.governance_attachment_access TO service_role;
GRANT SELECT, INSERT ON public.governance_permission_reviews TO service_role;
