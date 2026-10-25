-- v81: enforce the application's one-pending-request-per-original invariant in the database.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS ocorrencias_one_pending_retification_per_original_uidx
  ON public.ocorrencias (ocorrencia_original_id)
  WHERE status = 'pending_rectification'
    AND ocorrencia_original_id IS NOT NULL;
COMMIT;
