-- v114: Require and persist a GM of support on new approaches, enforce two-person
-- occurrence teams when synchronization is completed, and notify each recipient.
-- Historical records remain readable and are not backfilled with invented support links.

ALTER TABLE public.abordagens_pessoas
  ADD COLUMN IF NOT EXISTS guarda_apoio_id uuid
  REFERENCES public.usuarios(id) ON DELETE RESTRICT;

ALTER TABLE public.abordagens_veiculos
  ADD COLUMN IF NOT EXISTS guarda_apoio_id uuid
  REFERENCES public.usuarios(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS abordagens_pessoas_guarda_apoio_idx
  ON public.abordagens_pessoas (guarda_apoio_id) WHERE guarda_apoio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS abordagens_veiculos_guarda_apoio_idx
  ON public.abordagens_veiculos (guarda_apoio_id) WHERE guarda_apoio_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ocorrencia_tem_equipe_minima(p_ocorrencia_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.ocorrencia_guardas AS responsavel
    JOIN public.ocorrencia_guardas AS apoio
      ON apoio.ocorrencia_id = responsavel.ocorrencia_id
     AND apoio.guarda_id <> responsavel.guarda_id
    WHERE responsavel.ocorrencia_id = p_ocorrencia_id
      AND responsavel.esta_ativo IS TRUE
      AND responsavel.papel = 'responsavel'
      AND apoio.esta_ativo IS TRUE
      AND apoio.papel = 'acompanhante'
  );
$function$;

CREATE OR REPLACE FUNCTION public.gm_enforce_occurrence_team_minimum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.ocorrencia_original_id IS NULL
     AND NEW.status = 'synced'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'synced')
     AND NOT public.ocorrencia_tem_equipe_minima(NEW.id) THEN
    RAISE EXCEPTION 'A ocorrência precisa ter um GM responsável e um GM de apoio antes de ser sincronizada.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gm_occurrence_team_minimum ON public.ocorrencias;
CREATE TRIGGER gm_occurrence_team_minimum
BEFORE INSERT OR UPDATE OF status ON public.ocorrencias
FOR EACH ROW EXECUTE FUNCTION public.gm_enforce_occurrence_team_minimum();

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
BEGIN
  v_occurrence_id := OLD.ocorrencia_id;
  SELECT o.status INTO v_status
  FROM public.ocorrencias AS o
  WHERE o.id = v_occurrence_id AND o.ocorrencia_original_id IS NULL;

  IF v_status = 'synced' AND OLD.esta_ativo IS TRUE THEN
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
    IF NOT v_has_team THEN
      RAISE EXCEPTION 'Não é permitido deixar uma ocorrência sincronizada sem responsável e GM de apoio.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS gm_protect_synced_occurrence_team ON public.ocorrencia_guardas;
CREATE TRIGGER gm_protect_synced_occurrence_team
BEFORE UPDATE OF esta_ativo, papel OR DELETE ON public.ocorrencia_guardas
FOR EACH ROW EXECUTE FUNCTION public.gm_protect_synced_occurrence_team();

CREATE OR REPLACE FUNCTION public.gm_enforce_approach_support()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_original_support uuid;
BEGIN
  IF NEW.abordagem_original_id IS NOT NULL THEN
    IF NEW.guarda_apoio_id IS NULL THEN
      IF TG_TABLE_NAME = 'abordagens_pessoas' THEN
        SELECT a.guarda_apoio_id INTO v_original_support
        FROM public.abordagens_pessoas AS a WHERE a.id = NEW.abordagem_original_id;
      ELSE
        SELECT a.guarda_apoio_id INTO v_original_support
        FROM public.abordagens_veiculos AS a WHERE a.id = NEW.abordagem_original_id;
      END IF;
      NEW.guarda_apoio_id := v_original_support;
    END IF;
    -- A versão retificada herda o apoio; versões históricas sem esse dado continuam válidas.
    IF NEW.guarda_apoio_id IS NULL THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.guarda_apoio_id IS NULL AND NEW.guarda_apoio_id IS NULL THEN
    -- Não bloquear edições de registros anteriores à adoção deste campo.
    RETURN NEW;
  ELSIF NEW.guarda_apoio_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um GM de apoio para registrar a abordagem.';
  END IF;

  IF NEW.guarda_apoio_id = NEW.criado_por THEN
    RAISE EXCEPTION 'O GM de apoio deve ser diferente do GM responsável pelo registro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    WHERE u.id = NEW.guarda_apoio_id
      AND u.status = 'ativo'
      AND u.deleted_at IS NULL
      AND u.perfil IN ('guarda','supervisor')
  ) THEN
    RAISE EXCEPTION 'Selecione um GM de apoio cadastrado e ativo.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gm_enforce_approach_support ON public.abordagens_pessoas;
CREATE TRIGGER gm_enforce_approach_support
BEFORE INSERT OR UPDATE ON public.abordagens_pessoas
FOR EACH ROW EXECUTE FUNCTION public.gm_enforce_approach_support();

DROP TRIGGER IF EXISTS gm_enforce_approach_support ON public.abordagens_veiculos;
CREATE TRIGGER gm_enforce_approach_support
BEFORE INSERT OR UPDATE ON public.abordagens_veiculos
FOR EACH ROW EXECUTE FUNCTION public.gm_enforce_approach_support();

CREATE OR REPLACE FUNCTION public.gm_notify_new_approach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_kind text;
  v_entity text;
BEGIN
  IF NEW.abordagem_original_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.guarda_apoio_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível notificar: GM de apoio não informado.';
  END IF;
  v_kind := CASE WHEN TG_TABLE_NAME = 'abordagens_veiculos' THEN 'veículo' ELSE 'pessoa' END;
  v_entity := CASE WHEN TG_TABLE_NAME = 'abordagens_veiculos' THEN 'veiculo' ELSE 'pessoa' END;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  VALUES (NEW.guarda_apoio_id,'Você foi marcado como GM de apoio',
    'Você foi selecionado como GM de apoio em uma nova abordagem de '||v_kind||'.',
    'nova_abordagem_apoio','#consulta',now(),
    'approach:support:'||v_entity||':'||NEW.id::text||':'||NEW.guarda_apoio_id::text)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  SELECT u.id,'Nova abordagem',
    'Uma nova abordagem de '||v_kind||' foi registrada pela equipe.',
    'nova_abordagem','#consulta',now(),
    'approach:new:'||v_entity||':'||NEW.id::text||':'||u.id::text
  FROM public.usuarios AS u
  WHERE u.status='ativo' AND u.deleted_at IS NULL
    AND u.perfil IN ('guarda','supervisor','administrador')
    AND u.id <> NEW.criado_por AND u.id <> NEW.guarda_apoio_id
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gm_notify_new_approach ON public.abordagens_pessoas;
CREATE TRIGGER gm_notify_new_approach
AFTER INSERT ON public.abordagens_pessoas
FOR EACH ROW EXECUTE FUNCTION public.gm_notify_new_approach();

DROP TRIGGER IF EXISTS gm_notify_new_approach ON public.abordagens_veiculos;
CREATE TRIGGER gm_notify_new_approach
AFTER INSERT ON public.abordagens_veiculos
FOR EACH ROW EXECUTE FUNCTION public.gm_notify_new_approach();

CREATE OR REPLACE FUNCTION public.gm_notify_occurrence_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_created_by uuid;
  v_label text;
BEGIN
  IF NEW.papel <> 'acompanhante' OR NEW.esta_ativo IS DISTINCT FROM true THEN RETURN NEW; END IF;
  SELECT o.criado_por,
         coalesce(nullif(o.numero_ocorrencia,''),nullif(o.numero_temporario,''),o.id::text)
    INTO v_created_by,v_label
  FROM public.ocorrencias AS o
  WHERE o.id=NEW.ocorrencia_id AND o.ocorrencia_original_id IS NULL;
  IF NOT FOUND OR NEW.guarda_id = v_created_by THEN RETURN NEW; END IF;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  VALUES (NEW.guarda_id,'Você foi marcado como GM de apoio',
    'Você foi selecionado como GM de apoio na ocorrência '||left(coalesce(v_label,'sem número'),80)||'.',
    'apoio_ocorrencia','#detalhe-ocorrencia?id='||NEW.ocorrencia_id::text,now(),
    'occurrence:support:'||NEW.ocorrencia_id::text||':'||NEW.guarda_id::text)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  SELECT u.id,'Nova ocorrência',
    'Uma nova ocorrência ('||left(coalesce(v_label,'sem número'),80)||') foi registrada pela equipe.',
    'nova_ocorrencia','#detalhe-ocorrencia?id='||NEW.ocorrencia_id::text,now(),
    'occurrence:new:'||NEW.ocorrencia_id::text||':'||u.id::text
  FROM public.usuarios AS u
  WHERE u.status='ativo' AND u.deleted_at IS NULL
    AND u.perfil IN ('guarda','supervisor','administrador')
    AND u.id <> v_created_by AND u.id <> NEW.guarda_id
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_notificar_nova_ocorrencia ON public.ocorrencias;
DROP TRIGGER IF EXISTS gm_notify_occurrence_team ON public.ocorrencia_guardas;
CREATE TRIGGER gm_notify_occurrence_team
AFTER INSERT OR UPDATE ON public.ocorrencia_guardas
FOR EACH ROW EXECUTE FUNCTION public.gm_notify_occurrence_team();

REVOKE ALL ON FUNCTION public.gm_enforce_occurrence_team_minimum() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_protect_synced_occurrence_team() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_enforce_approach_support() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_notify_new_approach() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_notify_occurrence_team() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ocorrencia_tem_equipe_minima(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
