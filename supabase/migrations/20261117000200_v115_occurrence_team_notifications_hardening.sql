-- v115: Refine team edits and defer occurrence notices until the full record is synced.

CREATE OR REPLACE FUNCTION public.gm_validate_occurrence_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created_by uuid;
BEGIN
  IF NEW.esta_ativo IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.usuarios AS u
      WHERE u.id = NEW.guarda_id
        AND u.status = 'ativo'
        AND u.deleted_at IS NULL
        AND u.perfil IN ('guarda','supervisor')
    ) THEN
      RAISE EXCEPTION 'O integrante da equipe deve ser um GM cadastrado e ativo.';
    END IF;
    IF NEW.papel = 'acompanhante' THEN
      SELECT o.criado_por INTO v_created_by
      FROM public.ocorrencias AS o
      WHERE o.id = NEW.ocorrencia_id AND o.ocorrencia_original_id IS NULL;
      IF v_created_by IS NOT NULL AND NEW.guarda_id = v_created_by THEN
        RAISE EXCEPTION 'O GM de apoio deve ser diferente do GM responsável pela ocorrência.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gm_validate_occurrence_guard ON public.ocorrencia_guardas;
CREATE TRIGGER gm_validate_occurrence_guard
BEFORE INSERT OR UPDATE ON public.ocorrencia_guardas
FOR EACH ROW EXECUTE FUNCTION public.gm_validate_occurrence_guard();

CREATE OR REPLACE FUNCTION public.gm_protect_synced_occurrence_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_has_team boolean;
  v_occurrence_id uuid;
  v_team_changed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.esta_ativo IS TRUE
     AND (NEW.ocorrencia_id IS DISTINCT FROM OLD.ocorrencia_id
          OR NEW.guarda_id IS DISTINCT FROM OLD.guarda_id) THEN
    RAISE EXCEPTION 'Para trocar um integrante, encerre o vínculo atual e crie um novo vínculo de equipe.';
  END IF;
  v_occurrence_id := OLD.ocorrencia_id;
  SELECT o.status INTO v_status
  FROM public.ocorrencias AS o
  WHERE o.id = v_occurrence_id AND o.ocorrencia_original_id IS NULL;

  IF TG_OP = 'DELETE' THEN
    v_team_changed := true;
  ELSE
    v_team_changed := NEW.esta_ativo IS DISTINCT FROM OLD.esta_ativo
      OR NEW.papel IS DISTINCT FROM OLD.papel;
  END IF;

  IF v_status = 'synced' AND OLD.esta_ativo IS TRUE AND v_team_changed THEN
    IF TG_OP = 'DELETE' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.ocorrencia_guardas AS r
        JOIN public.ocorrencia_guardas AS a
          ON a.ocorrencia_id = r.ocorrencia_id
         AND a.guarda_id <> r.guarda_id
        WHERE r.ocorrencia_id = v_occurrence_id
          AND r.id <> OLD.id AND r.esta_ativo IS TRUE AND r.papel = 'responsavel'
          AND a.id <> OLD.id AND a.esta_ativo IS TRUE AND a.papel = 'acompanhante'
      ) INTO v_has_team;
    ELSE
      WITH equipe AS (
        SELECT g.id,g.guarda_id,g.papel,g.esta_ativo
        FROM public.ocorrencia_guardas AS g
        WHERE g.ocorrencia_id = v_occurrence_id AND g.id <> OLD.id AND g.esta_ativo IS TRUE
        UNION ALL
        SELECT NEW.id,NEW.guarda_id,NEW.papel,NEW.esta_ativo
        WHERE NEW.esta_ativo IS TRUE
      )
      SELECT EXISTS (
        SELECT 1 FROM equipe AS r JOIN equipe AS a
          ON a.guarda_id <> r.guarda_id
        WHERE r.esta_ativo IS TRUE AND r.papel = 'responsavel'
          AND a.esta_ativo IS TRUE AND a.papel = 'acompanhante'
      ) INTO v_has_team;
    END IF;
    IF NOT v_has_team THEN
      RAISE EXCEPTION 'Não é permitido deixar uma ocorrência sincronizada sem responsável e GM de apoio.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gm_protect_synced_occurrence_team ON public.ocorrencia_guardas;
CREATE TRIGGER gm_protect_synced_occurrence_team
BEFORE UPDATE OF esta_ativo, papel, guarda_id, ocorrencia_id OR DELETE ON public.ocorrencia_guardas
FOR EACH ROW EXECUTE FUNCTION public.gm_protect_synced_occurrence_team();

CREATE OR REPLACE FUNCTION public.gm_notify_occurrence_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created_by uuid;
  v_support record;
BEGIN
  IF NEW.status <> 'synced'
     OR OLD.status = 'synced'
     OR NEW.ocorrencia_original_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_created_by := NEW.criado_por;

  FOR v_support IN
    SELECT DISTINCT g.guarda_id
    FROM public.ocorrencia_guardas AS g
    WHERE g.ocorrencia_id = NEW.id
      AND g.esta_ativo IS TRUE
      AND g.papel = 'acompanhante'
      AND g.guarda_id <> v_created_by
  LOOP
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    VALUES (v_support.guarda_id,'Você foi marcado como GM de apoio',
      'Você foi selecionado como GM de apoio em uma nova ocorrência.',
      'nova_ocorrencia','#ocorrencias',now(),
      'occurrence:support:'||NEW.id::text||':'||v_support.guarda_id::text)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  SELECT u.id,'Nova ocorrência',
    'Uma nova ocorrência foi sincronizada pela equipe.',
    'nova_ocorrencia','#ocorrencias',now(),
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

DROP TRIGGER IF EXISTS gm_notify_occurrence_team ON public.ocorrencia_guardas;
DROP TRIGGER IF EXISTS gm_notify_synced_occurrence ON public.ocorrencias;
CREATE TRIGGER gm_notify_synced_occurrence
AFTER UPDATE OF status ON public.ocorrencias
FOR EACH ROW EXECUTE FUNCTION public.gm_notify_occurrence_team();

REVOKE ALL ON FUNCTION public.gm_validate_occurrence_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_protect_synced_occurrence_team() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_notify_occurrence_team() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
