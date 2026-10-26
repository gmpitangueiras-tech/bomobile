-- v85: allow the custom admin-governance session to use the existing atomic
-- retification RPCs without bypassing actor/profile validation.

CREATE OR REPLACE FUNCTION public.gm_admin_approve_governance(
  p_retification_id uuid,
  p_tipo text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_ok boolean;
  result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios
     WHERE id = p_actor_id
       AND perfil IN ('supervisor', 'administrador')
       AND status = 'ativo'
       AND deleted_at IS NULL
  ) INTO actor_ok;

  IF NOT actor_ok THEN
    RAISE EXCEPTION 'Ator administrativo inválido ou inativo';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);

  IF p_tipo = 'ocorrencia' THEN
    SELECT public.gm_approve_occurrence_retification(p_retification_id) INTO result;
  ELSIF p_tipo IN ('pessoa', 'veiculo') THEN
    SELECT public.gm_approve_approach_retification(p_retification_id, p_tipo) INTO result;
  ELSE
    RAISE EXCEPTION 'Tipo de retificação inválido';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_admin_reject_governance(
  p_retification_id uuid,
  p_tipo text,
  p_motivo text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_ok boolean;
  result jsonb;
  now_sp timestamp := timezone('America/Sao_Paulo', now());
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios
     WHERE id = p_actor_id
       AND perfil IN ('supervisor', 'administrador')
       AND status = 'ativo'
       AND deleted_at IS NULL
  ) INTO actor_ok;

  IF NOT actor_ok THEN
    RAISE EXCEPTION 'Ator administrativo inválido ou inativo';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'O motivo deve ter ao menos 10 caracteres';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);

  IF p_tipo = 'ocorrencia' THEN
    UPDATE public.ocorrencias
       SET status = 'rectification_rejected',
           esta_ativa = false,
           rejeitada_por = p_actor_id,
           rejeitada_em = now_sp,
           motivo_rejeicao = btrim(p_motivo)
     WHERE id = p_retification_id
       AND status = 'pending_rectification'
     RETURNING to_jsonb(ocorrencias.*) INTO result;
  ELSIF p_tipo = 'pessoa' THEN
    UPDATE public.abordagens_pessoas
       SET status_retificacao = 'rectification_rejected',
           esta_ativa = false,
           rejeitada_por = p_actor_id,
           rejeitada_em = now_sp,
           motivo_rejeicao = btrim(p_motivo)
     WHERE id = p_retification_id
       AND status_retificacao = 'pending_rectification'
     RETURNING to_jsonb(abordagens_pessoas.*) INTO result;
  ELSIF p_tipo = 'veiculo' THEN
    UPDATE public.abordagens_veiculos
       SET status_retificacao = 'rectification_rejected',
           esta_ativa = false,
           rejeitada_por = p_actor_id,
           rejeitada_em = now_sp,
           motivo_rejeicao = btrim(p_motivo)
     WHERE id = p_retification_id
       AND status_retificacao = 'pending_rectification'
     RETURNING to_jsonb(abordagens_veiculos.*) INTO result;
  ELSE
    RAISE EXCEPTION 'Tipo de retificação inválido';
  END IF;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Item pendente não encontrado ou já decidido';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.gm_admin_approve_governance(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_admin_reject_governance(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_admin_approve_governance(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_admin_reject_governance(uuid, text, text, uuid) TO service_role;
