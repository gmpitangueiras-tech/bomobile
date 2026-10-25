-- v80: atomically approve a submitted retification and retire its original version.
BEGIN;

CREATE OR REPLACE FUNCTION public.gm_approve_occurrence_retification(p_retification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.gm_current_profile_id();
  v_request public.ocorrencias%ROWTYPE;
  v_original public.ocorrencias%ROWTYPE;
  v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
  v_result jsonb;
BEGIN
  IF NOT public.gm_is_active_profile() OR NOT public.gm_is_manager() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'somente supervisor ou administrador ativo pode aprovar retificações';
  END IF;

  SELECT * INTO v_request
  FROM public.ocorrencias
  WHERE id = p_retification_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending_rectification'
     OR v_request.ocorrencia_original_id IS NULL
     OR v_request.solicitada_por IS NULL THEN
    RAISE EXCEPTION 'pedido de retificação pendente não encontrado';
  END IF;

  SELECT * INTO v_original
  FROM public.ocorrencias
  WHERE id = v_request.ocorrencia_original_id
  FOR UPDATE;
  IF NOT FOUND OR v_original.ocorrencia_original_id IS NOT NULL
     OR v_original.criado_por IS DISTINCT FROM v_request.criado_por THEN
    RAISE EXCEPTION 'ocorrência original inválida para este pedido';
  END IF;

  IF v_original.status = 'synced' AND v_original.esta_ativa = true THEN
    UPDATE public.ocorrencias
    SET esta_ativa = false,
        status = 'rectified',
        atualizado_em = v_now,
        atualizado_por = v_actor
    WHERE id = v_original.id
      AND status = 'synced'
      AND esta_ativa = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a ocorrência original mudou de estado; atualize e tente novamente';
    END IF;
  ELSIF v_original.status <> 'rectified' OR v_original.esta_ativa IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ocorrência original não está em um estado aprovável';
  END IF;

  UPDATE public.ocorrencias AS r
  SET status = 'rectified',
      esta_ativa = true,
      numero_ocorrencia = v_original.numero_ocorrencia,
      justificativa_retificacao = r.solicitacao_retificacao_justificativa,
      retificado_em = v_now,
      retificado_por = v_actor,
      aprovada_em = v_now,
      aprovada_por = v_actor,
      atualizado_em = v_now,
      atualizado_por = v_actor,
      data_hora_finalizacao = v_now
  WHERE r.id = p_retification_id
    AND r.status = 'pending_rectification'
  RETURNING to_jsonb(r) INTO v_result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'o pedido mudou de estado durante a aprovação';
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.gm_approve_occurrence_retification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_approve_occurrence_retification(uuid) TO authenticated;

COMMIT;
