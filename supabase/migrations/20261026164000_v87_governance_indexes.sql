-- v87 P4-GOV: read-path indexes only. No data mutation, deletion, or policy change.

CREATE INDEX IF NOT EXISTS ocorrencias_governance_queue_idx
  ON public.ocorrencias (status, solicitada_em DESC, solicitada_por)
  WHERE ocorrencia_original_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS abordagens_pessoas_governance_queue_idx
  ON public.abordagens_pessoas (status_retificacao, solicitada_em DESC, solicitada_por)
  WHERE abordagem_original_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS abordagens_veiculos_governance_queue_idx
  ON public.abordagens_veiculos (status_retificacao, solicitada_em DESC, solicitada_por)
  WHERE abordagem_original_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS logs_auditoria_governance_filter_idx
  ON public.logs_auditoria (criado_em DESC, acao, entidade, usuario_id);

CREATE INDEX IF NOT EXISTS sistema_erros_governance_triage_idx
  ON public.sistema_erros (resolvido, criado_em DESC);
