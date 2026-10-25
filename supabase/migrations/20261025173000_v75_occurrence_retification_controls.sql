-- v75: protect finalized occurrence data and make retification requests reviewable.
-- Active authenticated users keep broad SELECT access. Guards may request a new
-- retification version only for an occurrence they authored or are actively assigned to.
-- Supervisors/administrators retain manager workflow decisions.
BEGIN;

-- A guard may update only their own original draft/pending-sync record. A synced
-- record may receive an idempotent sync retry that changes sync metadata only;
-- the trigger below rejects changes to occurrence content without an approved version.
DROP POLICY IF EXISTS ocorrencias_author_team_manager_update ON public.ocorrencias;
DROP POLICY IF EXISTS ocorrencias_author_draft_manager_update ON public.ocorrencias;
CREATE POLICY ocorrencias_author_draft_manager_update ON public.ocorrencias
  FOR UPDATE TO authenticated
  USING (
    public.gm_is_active_profile()
    AND (
      public.gm_is_manager()
      OR (
        criado_por = public.gm_current_profile_id()
        AND ocorrencia_original_id IS NULL
        AND status IN ('draft','pending_sync','synced')
      )
    )
  )
  WITH CHECK (
    public.gm_is_active_profile()
    AND (
      public.gm_is_manager()
      OR (
        criado_por = public.gm_current_profile_id()
        AND ocorrencia_original_id IS NULL
        AND status IN ('draft','pending_sync','synced')
      )
    )
  );

-- A pending retification must point to an active, synchronized original. The
-- gm_can_manage_occurrence helper authorizes only its author, active assigned
-- guards, or a manager; solicitada_por binds the request to the current actor.
DROP POLICY IF EXISTS ocorrencias_author_insert ON public.ocorrencias;
CREATE POLICY ocorrencias_author_insert ON public.ocorrencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.gm_is_active_profile()
    AND coalesce(atualizado_por, public.gm_current_profile_id()) = public.gm_current_profile_id()
    AND (
      (
        ocorrencia_original_id IS NULL
        AND criado_por = public.gm_current_profile_id()
        AND status IN ('draft','pending_sync','synced')
        AND solicitada_por IS NULL
        AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
        AND cancelado_por IS NULL AND aprovada_em IS NULL AND rejeitada_em IS NULL
        AND retificado_em IS NULL AND cancelado_em IS NULL
        AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL
      )
      OR (
        ocorrencia_original_id IS NOT NULL
        AND public.gm_can_manage_occurrence(ocorrencia_original_id)
        AND EXISTS (
          SELECT 1
          FROM public.ocorrencias AS original
          WHERE original.id = ocorrencias.ocorrencia_original_id
            AND original.criado_por = ocorrencias.criado_por
            AND original.ocorrencia_original_id IS NULL
            AND original.status = 'synced'
        )
        AND (
          (
            status = 'pending_rectification'
            AND solicitada_por = public.gm_current_profile_id()
            AND length(btrim(coalesce(solicitacao_retificacao_justificativa,''))) >= 10
            AND EXISTS (
              SELECT 1
              FROM public.ocorrencias AS original
              WHERE original.id = ocorrencias.ocorrencia_original_id
                AND original.esta_ativa = true
            )
            AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
            AND cancelado_por IS NULL AND aprovada_em IS NULL AND rejeitada_em IS NULL
            AND retificado_em IS NULL AND cancelado_em IS NULL
            AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL
          )
          OR (
            public.gm_is_manager()
            AND status = 'rectified'
            AND aprovada_por = public.gm_current_profile_id()
            AND retificado_por = public.gm_current_profile_id()
            AND aprovada_em IS NOT NULL AND retificado_em IS NOT NULL
            AND rejeitada_por IS NULL AND cancelado_por IS NULL
            AND rejeitada_em IS NULL AND cancelado_em IS NULL
            AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL
            AND solicitada_por IS NULL
          )
        )
      )
    )
  );

-- Keep manager-only decisions. Non-manager writes are limited to their own
-- original drafts/pending sync rows; finalized originals and pending retification
-- versions are immutable to guards. A retry against a synced row is accepted only
-- if every non-sync field is unchanged.
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
