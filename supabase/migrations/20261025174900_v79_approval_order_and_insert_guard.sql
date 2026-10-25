-- v79: require a submitted pending version and the original's decision transition
-- before a supervisor can mark the replacement as rectified.
BEGIN;

-- The supported UI flow updates an existing pending request. No client should
-- insert a pre-approved 'rectified' version directly.
DROP POLICY IF EXISTS ocorrencias_no_direct_rectified_insert ON public.ocorrencias;
CREATE POLICY ocorrencias_no_direct_rectified_insert
  ON public.ocorrencias AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (status IS DISTINCT FROM 'rectified');

CREATE OR REPLACE FUNCTION public.gm_guard_retification_approval_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.gm_current_profile_id();
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_rectification' AND NEW.status = 'rectified' THEN
    IF NOT public.gm_is_manager()
       OR OLD.solicitada_por IS NULL
       OR NEW.aprovada_por IS DISTINCT FROM v_actor
       OR NEW.retificado_por IS DISTINCT FROM v_actor
       OR NEW.aprovada_em IS NULL
       OR NEW.retificado_em IS NULL THEN
      RAISE EXCEPTION 'somente supervisor pode aprovar uma retificação pendente';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ocorrencias AS o
      WHERE o.id = OLD.ocorrencia_original_id
        AND o.status = 'rectified'
        AND o.esta_ativa = false
    ) THEN
      RAISE EXCEPTION 'a ocorrência original precisa ser desativada no mesmo fluxo de aprovação';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gm_guard_retification_approval_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_guard_retification_approval_order() TO authenticated;

DROP TRIGGER IF EXISTS gm_occurrence_approval_order_guard ON public.ocorrencias;
CREATE TRIGGER gm_occurrence_approval_order_guard
  BEFORE UPDATE OF status ON public.ocorrencias
  FOR EACH ROW
  WHEN (OLD.status = 'pending_rectification' AND NEW.status = 'rectified')
  EXECUTE FUNCTION public.gm_guard_retification_approval_order();

COMMIT;
