-- v76: scope occurrence child-table writes to editable records and pending retifications.
-- All active users retain read access; managers retain their governance access.
BEGIN;

CREATE OR REPLACE FUNCTION public.gm_can_edit_occurrence_payload(p_occurrence_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.gm_is_active_profile() AND (
    public.gm_is_manager()
    OR EXISTS (
      SELECT 1
      FROM public.ocorrencias AS o
      WHERE o.id = p_occurrence_id
        AND o.ocorrencia_original_id IS NULL
        AND o.status IN ('draft','pending_sync')
        AND (
          o.criado_por = public.gm_current_profile_id()
          OR EXISTS (
            SELECT 1
            FROM public.ocorrencia_guardas AS g
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

-- Existing policies now call a status-aware helper. A requestor can populate or
-- revise only the pending retification version, never the finalized original.
ALTER POLICY envolvidos_managed_insert ON public.envolvidos
  WITH CHECK (
    public.gm_can_edit_occurrence_payload(ocorrencia_id)
    AND criado_por = public.gm_current_profile_id()
  );
ALTER POLICY envolvidos_managed_update ON public.envolvidos
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id))
  WITH CHECK (public.gm_can_edit_occurrence_payload(ocorrencia_id));
ALTER POLICY envolvidos_managed_delete ON public.envolvidos
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id));

ALTER POLICY anexos_managed_insert ON public.anexos
  WITH CHECK (
    public.gm_can_edit_occurrence_payload(ocorrencia_id)
    AND coalesce(criado_por, public.gm_current_profile_id()) = public.gm_current_profile_id()
  );
ALTER POLICY anexos_managed_update ON public.anexos
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id))
  WITH CHECK (public.gm_can_edit_occurrence_payload(ocorrencia_id));
ALTER POLICY anexos_managed_delete ON public.anexos
  USING (public.gm_can_edit_occurrence_payload(ocorrencia_id));

COMMIT;
