-- v77: allow the author to complete an explicitly incomplete Quick BO once,
-- while keeping ordinary synchronized occurrence data immutable.
BEGIN;

CREATE OR REPLACE FUNCTION public.gm_guard_occurrence_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text := public.gm_current_role();
  v_actor uuid := public.gm_current_profile_id();
  v_sync_metadata text[] := ARRAY[
    'atualizado_em','atualizado_por','sincronizado_em','sincronizado_por',
    'sync_attempts','ultimo_erro_sync'
  ];
  v_quick_completion_fields text[] := ARRAY[
    'status','modo_criacao','completado_em','completado_por',
    'forma_solicitacao','cpf_solicitante','telefone_solicitante',
    'endereco_solicitante','bairro_solicitante','rodovia',
    'data_hora_encerramento','data_hora_finalizacao','assinaturas'
  ];
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'autor imutável';
  END IF;
  IF NEW.ocorrencia_original_id IS DISTINCT FROM OLD.ocorrencia_original_id THEN
    RAISE EXCEPTION 'vínculo original imutável';
  END IF;
  IF OLD.solicitada_por IS NOT NULL AND NEW.solicitada_por IS DISTINCT FROM OLD.solicitada_por THEN
    RAISE EXCEPTION 'solicitante imutável';
  END IF;
  IF NEW.atualizado_por IS DISTINCT FROM OLD.atualizado_por
     AND NEW.atualizado_por IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'atualizador inválido';
  END IF;

  IF v_role IN ('supervisor','administrador') THEN
    IF (NEW.cancelado_por IS DISTINCT FROM OLD.cancelado_por AND NEW.cancelado_por IS DISTINCT FROM v_actor)
       OR (NEW.aprovada_por IS DISTINCT FROM OLD.aprovada_por AND NEW.aprovada_por IS DISTINCT FROM v_actor)
       OR (NEW.rejeitada_por IS DISTINCT FROM OLD.rejeitada_por AND NEW.rejeitada_por IS DISTINCT FROM v_actor)
       OR (NEW.retificado_por IS DISTINCT FROM OLD.retificado_por AND NEW.retificado_por IS DISTINCT FROM v_actor) THEN
      RAISE EXCEPTION 'ator da decisão inválido';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND ((NEW.status='rectified' AND NEW.aprovada_por IS DISTINCT FROM v_actor)
         OR (NEW.status='rectification_rejected' AND NEW.rejeitada_por IS DISTINCT FROM v_actor)
         OR (NEW.status='cancelled' AND NEW.cancelado_por IS DISTINCT FROM v_actor)) THEN
      RAISE EXCEPTION 'decisão sem ator autorizado';
    END IF;
    RETURN NEW;
  END IF;

  IF v_actor IS NULL
     OR OLD.criado_por IS DISTINCT FROM v_actor
     OR OLD.ocorrencia_original_id IS NOT NULL
     OR NEW.ocorrencia_original_id IS NOT NULL THEN
    RAISE EXCEPTION 'somente o autor pode alterar rascunho próprio; retificações exigem supervisão';
  END IF;

  -- Exception only for the incomplete Quick BO completion screen. The caller
  -- moves synced -> pending_sync, writes the related rows, then finalizes it.
  IF OLD.status = 'synced'
     AND OLD.modo_criacao = 'rapido'
     AND OLD.completado_em IS NULL
     AND NEW.status = 'pending_sync'
     AND (
       (NEW.modo_criacao = 'rapido' AND NEW.completado_em IS NULL
         AND NEW.completado_por IS NOT DISTINCT FROM OLD.completado_por)
       OR
       (NEW.modo_criacao = 'completo' AND NEW.completado_em IS NOT NULL
         AND NEW.completado_por = v_actor)
     )
     AND (to_jsonb(NEW) - v_sync_metadata - v_quick_completion_fields)
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - v_sync_metadata - v_quick_completion_fields) THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'synced' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR (to_jsonb(NEW) - v_sync_metadata) IS DISTINCT FROM (to_jsonb(OLD) - v_sync_metadata) THEN
      RAISE EXCEPTION 'ocorrência sincronizada exige solicitação de retificação e aceite da supervisão';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft','pending_sync','synced') THEN
    RAISE EXCEPTION 'transição de rascunho não permitida';
  END IF;
  IF OLD.status = 'pending_sync' AND NEW.status NOT IN ('pending_sync','synced') THEN
    RAISE EXCEPTION 'transição de sincronização não permitida';
  END IF;
  IF OLD.status NOT IN ('draft','pending_sync') THEN
    RAISE EXCEPTION 'registro finalizado exige retificação aprovada';
  END IF;

  IF NEW.cancelado_por IS DISTINCT FROM OLD.cancelado_por
     OR NEW.cancelado_em IS DISTINCT FROM OLD.cancelado_em
     OR NEW.motivo_cancelamento IS DISTINCT FROM OLD.motivo_cancelamento
     OR NEW.aprovada_por IS DISTINCT FROM OLD.aprovada_por
     OR NEW.aprovada_em IS DISTINCT FROM OLD.aprovada_em
     OR NEW.rejeitada_por IS DISTINCT FROM OLD.rejeitada_por
     OR NEW.rejeitada_em IS DISTINCT FROM OLD.rejeitada_em
     OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao
     OR NEW.retificado_por IS DISTINCT FROM OLD.retificado_por
     OR NEW.retificado_em IS DISTINCT FROM OLD.retificado_em THEN
    RAISE EXCEPTION 'campo reservado à supervisão';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
