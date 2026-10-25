-- v78: close remaining final-record write paths while preserving explicit governance decisions.
BEGIN;

-- Managers may help with editable drafts/sync-pending records, but must not edit
-- child rows of a finalized original or of a pending request they did not submit.
CREATE OR REPLACE FUNCTION public.gm_can_edit_occurrence_payload(p_occurrence_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.gm_is_active_profile() AND (
    EXISTS (
      SELECT 1
      FROM public.ocorrencias AS o
      WHERE o.id = p_occurrence_id
        AND o.ocorrencia_original_id IS NULL
        AND o.status IN ('draft','pending_sync')
        AND (
          public.gm_is_manager()
          OR o.criado_por = public.gm_current_profile_id()
          OR EXISTS (
            SELECT 1 FROM public.ocorrencia_guardas AS g
            WHERE g.ocorrencia_id = o.id
              AND g.guarda_id = public.gm_current_profile_id()
              AND g.esta_ativo = true
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.ocorrencias AS r
      WHERE r.id = p_occurrence_id
        AND r.ocorrencia_original_id IS NOT NULL
        AND r.status = 'pending_rectification'
        AND r.solicitada_por = public.gm_current_profile_id()
    )
  );
$$;
REVOKE ALL ON FUNCTION public.gm_can_edit_occurrence_payload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_can_edit_occurrence_payload(uuid) TO authenticated;

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
  v_manager_retification_fields text[] := ARRAY[
    'status','esta_ativa','aprovada_em','aprovada_por','rejeitada_em','rejeitada_por',
    'motivo_rejeicao','retificado_em','retificado_por','numero_ocorrencia',
    'justificativa_retificacao','data_hora_finalizacao'
  ];
  v_manager_original_fields text[] := ARRAY['status','esta_ativa'];
  v_manager_cancel_fields text[] := ARRAY[
    'status','esta_ativa','cancelado_por','cancelado_em','motivo_cancelamento'
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

    IF OLD.status IN ('draft','pending_sync') THEN
      IF NEW.status IN ('draft','pending_sync','synced') THEN
        RETURN NEW;
      END IF;
      IF NEW.status = 'cancelled' AND NEW.esta_ativa = false
         AND NEW.cancelado_por = v_actor AND NEW.cancelado_em IS NOT NULL
         AND length(btrim(coalesce(NEW.motivo_cancelamento,''))) > 0
         AND (to_jsonb(NEW) - v_sync_metadata - v_manager_cancel_fields)
             IS NOT DISTINCT FROM
             (to_jsonb(OLD) - v_sync_metadata - v_manager_cancel_fields) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'transição gerencial não permitida para rascunho/sync pendente';
    END IF;

    -- Approval/rejection may change only decision metadata on the submitted version.
    IF OLD.status = 'pending_rectification'
       AND NEW.status = 'rectified'
       AND NEW.esta_ativa = true
       AND NEW.aprovada_por = v_actor AND NEW.retificado_por = v_actor
       AND NEW.aprovada_em IS NOT NULL AND NEW.retificado_em IS NOT NULL
       AND NEW.rejeitada_por IS NULL AND NEW.cancelado_por IS NULL
       AND (to_jsonb(NEW) - v_sync_metadata - v_manager_retification_fields)
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - v_sync_metadata - v_manager_retification_fields) THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'pending_rectification'
       AND NEW.status = 'rectification_rejected'
       AND NEW.esta_ativa = false
       AND NEW.rejeitada_por = v_actor AND NEW.rejeitada_em IS NOT NULL
       AND length(btrim(coalesce(NEW.motivo_rejeicao,''))) > 0
       AND NEW.aprovada_por IS NULL AND NEW.retificado_por IS NULL
       AND (to_jsonb(NEW) - v_sync_metadata - v_manager_retification_fields)
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - v_sync_metadata - v_manager_retification_fields) THEN
      RETURN NEW;
    END IF;

    -- The original may be marked inactive/rectified only while a pending version exists.
    IF OLD.status = 'synced'
       AND OLD.ocorrencia_original_id IS NULL
       AND NEW.status = 'rectified' AND NEW.esta_ativa = false
       AND EXISTS (
         SELECT 1 FROM public.ocorrencias AS r
         WHERE r.ocorrencia_original_id = OLD.id AND r.status = 'pending_rectification'
       )
       AND (to_jsonb(NEW) - v_sync_metadata - v_manager_original_fields)
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - v_sync_metadata - v_manager_original_fields) THEN
      RETURN NEW;
    END IF;

    -- Cancellation is a separate, attributable governance decision; content stays unchanged.
    IF OLD.status = 'synced'
       AND NEW.status = 'cancelled' AND NEW.esta_ativa = false
       AND NEW.cancelado_por = v_actor AND NEW.cancelado_em IS NOT NULL
       AND length(btrim(coalesce(NEW.motivo_cancelamento,''))) > 0
       AND (to_jsonb(NEW) - v_sync_metadata - v_manager_cancel_fields)
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - v_sync_metadata - v_manager_cancel_fields) THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'synced' AND NEW.status = OLD.status
       AND (to_jsonb(NEW) - v_sync_metadata) IS NOT DISTINCT FROM
           (to_jsonb(OLD) - v_sync_metadata) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'registro finalizado exige retificação aprovada ou decisão gerencial explícita';
  END IF;

  IF v_actor IS NULL
     OR OLD.criado_por IS DISTINCT FROM v_actor
     OR OLD.ocorrencia_original_id IS NOT NULL
     OR NEW.ocorrencia_original_id IS NOT NULL THEN
    RAISE EXCEPTION 'somente o autor pode alterar rascunho próprio; retificações exigem supervisão';
  END IF;

  -- Exception only for the incomplete Quick BO completion screen. The caller
  -- moves synced -> pending_sync, writes related rows, then finalizes it.
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

-- Assignment rows are editable only while the parent/version is open. This prevents
-- a guard from adding themself to a final record to gain retification eligibility.
ALTER POLICY ocorrencia_guardas_assign_insert ON public.ocorrencia_guardas
  WITH CHECK (
    public.gm_can_edit_occurrence_payload(ocorrencia_id)
    AND coalesce(selecionado_por, public.gm_current_profile_id()) = public.gm_current_profile_id()
  );
ALTER POLICY ocorrencia_guardas_assign_update ON public.ocorrencia_guardas
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id))
  WITH CHECK (public.gm_can_edit_occurrence_payload(ocorrencia_id));
ALTER POLICY ocorrencia_guardas_assign_delete ON public.ocorrencia_guardas
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id));

-- Keep active-user reads of the private bucket, but permit object writes only while
-- the referenced occurrence/version remains editable. Paths are profile/occurrence/file.
ALTER POLICY anexos_owner_insert ON storage.objects
  WITH CHECK (
    bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.gm_can_edit_occurrence_payload(split_part(name,'/',2)::uuid)
    AND name !~ '(^|/)\.\.(/|$)'
  );
ALTER POLICY anexos_owner_update ON storage.objects
  USING (
    bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.gm_can_edit_occurrence_payload(split_part(name,'/',2)::uuid)
  )
  WITH CHECK (
    bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.gm_can_edit_occurrence_payload(split_part(name,'/',2)::uuid)
    AND name !~ '(^|/)\.\.(/|$)'
  );
ALTER POLICY anexos_owner_delete ON storage.objects
  USING (
    bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.gm_can_edit_occurrence_payload(split_part(name,'/',2)::uuid)
  );

COMMIT;
