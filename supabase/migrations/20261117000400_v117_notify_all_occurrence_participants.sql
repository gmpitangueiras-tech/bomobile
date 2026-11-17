-- v117: Notify every participating GM individually, not only the primary support role.
CREATE OR REPLACE FUNCTION public.gm_notify_occurrence_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created_by uuid;
  v_support record;
  v_label text;
  v_link text;
BEGIN
  IF NEW.status <> 'synced'
     OR OLD.status = 'synced'
     OR NEW.ocorrencia_original_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_created_by := NEW.criado_por;
  v_label := coalesce(nullif(NEW.numero_ocorrencia,''),nullif(NEW.numero_temporario,''),NEW.id::text);
  v_link := '#detalhe-ocorrencia?id='||NEW.id::text;

  FOR v_support IN
    SELECT DISTINCT g.guarda_id
    FROM public.ocorrencia_guardas AS g
    WHERE g.ocorrencia_id = NEW.id
      AND g.esta_ativo IS TRUE
      AND g.papel <> 'responsavel'
      AND g.guarda_id <> v_created_by
  LOOP
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    VALUES (v_support.guarda_id,'Você foi marcado como participante da ocorrência',
      'Você foi registrado como GM de apoio nesta ocorrência ('||left(v_label,80)||').',
      'nova_ocorrencia',v_link,now(),
      'occurrence:support:'||NEW.id::text||':'||v_support.guarda_id::text)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  SELECT u.id,'Nova ocorrência',
    'Uma nova ocorrência ('||left(v_label,80)||') foi sincronizada pela equipe.',
    'nova_ocorrencia',v_link,now(),
    'occurrence:new:'||NEW.id::text||':'||u.id::text
  FROM public.usuarios AS u
  WHERE u.status='ativo' AND u.deleted_at IS NULL
    AND u.perfil IN ('guarda','supervisor','administrador')
    AND u.id <> v_created_by
    AND NOT EXISTS (
      SELECT 1 FROM public.ocorrencia_guardas AS team
      WHERE team.ocorrencia_id=NEW.id
        AND team.esta_ativo IS TRUE
        AND team.guarda_id=u.id
    )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gm_notify_occurrence_team() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
