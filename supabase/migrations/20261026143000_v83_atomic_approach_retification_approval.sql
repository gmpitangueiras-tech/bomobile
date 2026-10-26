-- v83: atomically approve vehicle/person approach retifications.
-- The original and replacement are locked and updated in one transaction; any
-- validation or update failure rolls back both changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.gm_approve_approach_retification(
  p_retification_id uuid,
  p_tipo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.gm_current_profile_id();
  v_request jsonb;
  v_original jsonb;
  v_original_id uuid;
  v_creator uuid;
  v_request_status text;
  v_original_active boolean;
  v_now timestamp without time zone := timezone('America/Sao_Paulo', now());
  v_result jsonb;
BEGIN
  IF NOT public.gm_is_active_profile() OR NOT public.gm_is_manager() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'somente supervisor ou administrador ativo pode aprovar retificações de abordagem';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('pessoa','veiculo') THEN
    RAISE EXCEPTION 'tipo de abordagem inválido';
  END IF;

  IF p_tipo = 'veiculo' THEN
    SELECT to_jsonb(a), a.abordagem_original_id, a.criado_por, a.status_retificacao
      INTO v_request, v_original_id, v_creator, v_request_status
    FROM public.abordagens_veiculos AS a
    WHERE a.id = p_retification_id
    FOR UPDATE;
  ELSE
    SELECT to_jsonb(a), a.abordagem_original_id, a.criado_por, a.status_retificacao
      INTO v_request, v_original_id, v_creator, v_request_status
    FROM public.abordagens_pessoas AS a
    WHERE a.id = p_retification_id
    FOR UPDATE;
  END IF;

  IF v_request IS NULL OR v_request_status <> 'pending_rectification' OR v_original_id IS NULL THEN
    RAISE EXCEPTION 'pedido de retificação pendente não encontrado';
  END IF;

  IF p_tipo = 'veiculo' THEN
    SELECT to_jsonb(a), a.esta_ativa INTO v_original, v_original_active
    FROM public.abordagens_veiculos AS a
    WHERE a.id = v_original_id AND a.criado_por = v_creator
      AND a.abordagem_original_id IS NULL
    FOR UPDATE;
  ELSE
    SELECT to_jsonb(a), a.esta_ativa INTO v_original, v_original_active
    FROM public.abordagens_pessoas AS a
    WHERE a.id = v_original_id AND a.criado_por = v_creator
      AND a.abordagem_original_id IS NULL
    FOR UPDATE;
  END IF;

  IF v_original IS NULL THEN
    RAISE EXCEPTION 'abordagem original inválida para este pedido';
  END IF;
  IF v_original_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'a abordagem original não está ativa; atualize e tente novamente';
  END IF;

  IF p_tipo = 'veiculo' THEN
    UPDATE public.abordagens_veiculos
    SET esta_ativa = false,
        status_retificacao = 'rectified',
        atualizado_em = v_now
    WHERE id = v_original_id AND esta_ativa = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'a abordagem original mudou de estado'; END IF;

    UPDATE public.abordagens_veiculos
    SET status_retificacao = 'rectified',
        esta_ativa = true,
        justificativa_retificacao = solicitacao_retificacao_justificativa,
        retificado_em = v_now,
        retificado_por = v_actor,
        aprovada_em = v_now,
        aprovada_por = v_actor,
        atualizado_em = v_now
    WHERE id = p_retification_id AND status_retificacao = 'pending_rectification'
    RETURNING to_jsonb(abordagens_veiculos) INTO v_result;
  ELSE
    UPDATE public.abordagens_pessoas
    SET esta_ativa = false,
        status_retificacao = 'rectified',
        atualizado_em = v_now
    WHERE id = v_original_id AND esta_ativa = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'a abordagem original mudou de estado'; END IF;

    UPDATE public.abordagens_pessoas
    SET status_retificacao = 'rectified',
        esta_ativa = true,
        justificativa_retificacao = solicitacao_retificacao_justificativa,
        retificado_em = v_now,
        retificado_por = v_actor,
        aprovada_em = v_now,
        aprovada_por = v_actor,
        atualizado_em = v_now
    WHERE id = p_retification_id AND status_retificacao = 'pending_rectification'
    RETURNING to_jsonb(abordagens_pessoas) INTO v_result;
  END IF;

  IF v_result IS NULL THEN RAISE EXCEPTION 'o pedido mudou de estado durante a aprovação'; END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gm_approve_approach_retification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_approve_approach_retification(uuid, text) TO authenticated;

COMMIT;
