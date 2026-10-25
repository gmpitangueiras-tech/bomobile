-- Security hardening for the main Supabase project.
-- Data-preserving: no application rows are deleted or rewritten. The anexos bucket
-- is made private; gm-avatars is intentionally left unchanged/public.

BEGIN;

-- 1) Replace every existing public-schema table policy on the exposed app tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'abordagens_pessoas','abordagens_veiculos','anexos','configuracoes',
        'envolvidos','gm_auth_login_attempts','historico_fases','historico_status',
        'logs_acesso','logs_auditoria','logs_periciais','mural_avisos',
        'mural_comentarios','mural_leituras','mural_reações','notificacoes',
        'notificacoes_prazos','ocorrencia_guardas','ocorrencias','sincronizacao',
        'sistema_erros','usuarios','visualizacoes_ocorrencias'
      ])
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

-- 2) Replace Storage policies which mention anexos only; do not change gm-avatars.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') ILIKE '%anexos%' OR coalesce(with_check, '') ILIKE '%anexos%')
      AND coalesce(qual, '') NOT ILIKE '%gm-avatars%'
      AND coalesce(with_check, '') NOT ILIKE '%gm-avatars%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END;
$$;

-- 3) Small, non-recursive identity/authorization helpers. First-access accounts
-- can read only their own profile until they complete activation.
CREATE OR REPLACE FUNCTION public.gm_current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid()
    AND u.status IN ('ativo','primeiro_acesso')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gm_current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.perfil::text
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid() AND u.status = 'ativo'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gm_is_active_profile()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    WHERE u.auth_user_id = auth.uid() AND u.status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.gm_is_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(public.gm_current_role() IN ('supervisor','administrador'), false);
$$;

CREATE OR REPLACE FUNCTION public.gm_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(public.gm_current_role() = 'administrador', false);
$$;

CREATE OR REPLACE FUNCTION public.gm_can_manage_occurrence(p_occurrence_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.gm_is_active_profile() AND (
    public.gm_is_manager()
    OR EXISTS (
      SELECT 1 FROM public.ocorrencias AS o
      WHERE o.id = p_occurrence_id AND o.criado_por = public.gm_current_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.ocorrencia_guardas AS g
      WHERE g.ocorrencia_id = p_occurrence_id
        AND g.guarda_id = public.gm_current_profile_id()
        AND g.esta_ativo = true
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.gm_can_assign_occurrence(p_occurrence_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.gm_is_active_profile() AND (
    public.gm_is_manager()
    OR EXISTS (
      SELECT 1 FROM public.ocorrencias AS o
      WHERE o.id = p_occurrence_id AND o.criado_por = public.gm_current_profile_id()
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.gm_my_profile()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'nome_completo', u.nome_completo,
    'matricula', u.matricula,
    'apelido', u.apelido,
    'email', u.email,
    'telefone', u.telefone,
    'perfil', u.perfil,
    'status', u.status,
    'primeiro_acesso', u.primeiro_acesso,
    'foto_url', u.foto_url
  )
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid() AND u.status IN ('ativo','primeiro_acesso')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gm_verify_my_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_hash text;
BEGIN
  IF auth.uid() IS NULL OR p_password IS NULL OR length(p_password) > 128 THEN
    RETURN false;
  END IF;
  SELECT u.senha_hash INTO v_hash
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid() AND u.status = 'ativo';
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = extensions.crypt(p_password, v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_update_my_password(p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR p_password_hash IS NULL
     OR p_password_hash !~ '^\$2[abxy]\$[0-9]{2}\$'
     OR length(p_password_hash) < 55 OR length(p_password_hash) > 80 THEN
    RAISE EXCEPTION 'hash de senha inválido';
  END IF;
  UPDATE public.usuarios
  SET senha_hash = p_password_hash,
      atualizado_em = now()
  WHERE auth_user_id = auth.uid() AND status = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'perfil ativo não encontrado'; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_complete_first_access(
  p_password_hash text,
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_profile public.usuarios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR p_password_hash IS NULL
     OR p_password_hash !~ '^\$2[abxy]\$[0-9]{2}\$'
     OR length(p_password_hash) < 55 OR length(p_password_hash) > 80 THEN
    RAISE EXCEPTION 'dados de primeiro acesso inválidos';
  END IF;
  UPDATE public.usuarios AS u
  SET senha_hash = p_password_hash,
      email = CASE WHEN p_email IS NULL THEN u.email ELSE left(trim(p_email),160) END,
      telefone = CASE WHEN p_telefone IS NULL THEN u.telefone ELSE left(trim(p_telefone),40) END,
      primeiro_acesso = false,
      status = 'ativo',
      atualizado_em = now()
  WHERE u.auth_user_id = auth.uid()
    AND u.status = 'primeiro_acesso'
    AND coalesce(u.primeiro_acesso, true) = true
  RETURNING u.* INTO v_profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'primeiro acesso não permitido'; END IF;
  RETURN jsonb_build_object(
    'success', true,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'nome_completo', v_profile.nome_completo,
      'matricula', v_profile.matricula,
      'apelido', v_profile.apelido,
      'email', v_profile.email,
      'telefone', v_profile.telefone,
      'perfil', v_profile.perfil,
      'status', v_profile.status,
      'primeiro_acesso', v_profile.primeiro_acesso,
      'foto_url', v_profile.foto_url
    )
  );
END;
$$;

-- Authenticated event emitter: no caller-supplied recipient, link, title or body.
CREATE OR REPLACE FUNCTION public.gm_emit_notification(
  p_event text,
  p_record_id uuid,
  p_entity text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.gm_current_profile_id();
  v_owner uuid;
  v_recipient uuid;
  v_status text;
  v_label text;
  v_message text;
  v_count integer := 0;
  v_entity text := lower(coalesce(p_entity,''));
BEGIN
  IF NOT public.gm_is_active_profile() OR v_actor IS NULL OR p_record_id IS NULL THEN
    RAISE EXCEPTION 'notificação não autorizada';
  END IF;

  IF p_event = 'new_occurrence' THEN
    SELECT o.criado_por, coalesce(nullif(o.numero_ocorrencia,''),nullif(o.numero_temporario,''),o.id::text)
      INTO v_owner,v_label FROM public.ocorrencias AS o WHERE o.id=p_record_id AND o.ocorrencia_original_id IS NULL;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'evento não autorizado'; END IF;
    v_message := 'Nova ocorrência registrada: ' || left(coalesce(v_label,'sem número'),100) || '.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Nova ocorrência',v_message,'nova_ocorrencia','#detalhe-ocorrencia?id='||p_record_id::text,now(),
           'occurrence:new:'||p_record_id::text||':'||u.id::text
    FROM public.usuarios AS u
    WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador') AND u.id<>v_actor
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'new_approach' AND v_entity IN ('veiculo','pessoa') THEN
    IF v_entity='veiculo' THEN
      SELECT a.criado_por,coalesce(nullif(a.placa,''),'veículo sem placa'),a.status_retificacao
        INTO v_owner,v_label,v_status FROM public.abordagens_veiculos AS a WHERE a.id=p_record_id AND a.abordagem_original_id IS NULL;
    ELSE
      SELECT a.criado_por,coalesce(nullif(a.nome,''),'pessoa sem nome'),a.status_retificacao
        INTO v_owner,v_label,v_status FROM public.abordagens_pessoas AS a WHERE a.id=p_record_id AND a.abordagem_original_id IS NULL;
    END IF;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor OR coalesce(v_status,'normal') NOT IN ('normal','') THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    v_message := 'Nova abordagem registrada: ' || left(v_label,100) || '.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Nova abordagem',v_message,'nova_abordagem','#consulta',now(),
           'approach:new:'||v_entity||':'||p_record_id::text||':'||u.id::text
    FROM public.usuarios AS u
    WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador') AND u.id<>v_actor
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'new_mural' THEN
    SELECT m.criado_por,m.titulo INTO v_owner,v_label
    FROM public.mural_avisos AS m WHERE m.id=p_record_id;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor OR NOT public.gm_is_manager() THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    v_message := 'Um novo aviso foi publicado no mural: ' || left(coalesce(v_label,'aviso'),120) || '.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Novo aviso no mural',v_message,'sistema','#mural',now(),
           'mural:new:'||p_record_id::text||':'||u.id::text
    FROM public.usuarios AS u WHERE u.status='ativo' AND u.id<>v_actor
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'occurrence_retification_pending' THEN
    SELECT o.solicitada_por,coalesce(nullif(o.numero_ocorrencia,''),nullif(o.numero_temporario,''),o.id::text),o.status
      INTO v_owner,v_label,v_status FROM public.ocorrencias AS o WHERE o.id=p_record_id;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor OR v_status<>'pending_rectification' THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    v_message := 'Solicitação de retificação da ocorrência '||left(coalesce(v_label,'sem número'),100)||' aguarda análise.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Retificação pendente',v_message,'retificacao_pendente','#retificacoes',now(),
           'occurrence:retification:pending:'||p_record_id::text||':'||u.id::text
    FROM public.usuarios AS u WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador') AND u.id<>v_actor
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'occurrence_retification_decided' THEN
    SELECT coalesce(o.solicitada_por,original.criado_por),o.status,
           coalesce(nullif(o.numero_ocorrencia,''),nullif(o.numero_temporario,''),o.id::text)
      INTO v_recipient,v_status,v_label
    FROM public.ocorrencias AS o
    LEFT JOIN public.ocorrencias AS original ON original.id=o.ocorrencia_original_id
    WHERE o.id=p_record_id;
    IF NOT FOUND OR NOT public.gm_is_manager() OR v_status NOT IN ('rectified','rectification_rejected') THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    IF v_status='rectified' THEN
      SELECT o.aprovada_por INTO v_owner FROM public.ocorrencias AS o WHERE o.id=p_record_id;
    ELSE
      SELECT o.rejeitada_por INTO v_owner FROM public.ocorrencias AS o WHERE o.id=p_record_id;
    END IF;
    IF v_owner IS DISTINCT FROM v_actor OR v_recipient IS NULL THEN RAISE EXCEPTION 'evento não autorizado'; END IF;
    v_message := CASE WHEN v_status='rectified' THEN 'Retificação aprovada para a ocorrência ' ELSE 'Retificação rejeitada para a ocorrência ' END
      ||left(coalesce(v_label,'sem número'),100)||'.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    VALUES (v_recipient,CASE WHEN v_status='rectified' THEN 'Retificação aprovada' ELSE 'Retificação rejeitada' END,
      v_message,CASE WHEN v_status='rectified' THEN 'retificacao_aprovada' ELSE 'retificacao_rejeitada' END,
      '#detalhe-ocorrencia?id='||p_record_id::text,now(),
      'occurrence:retification:decision:'||p_record_id::text||':'||v_recipient::text)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'approach_retification_pending' AND v_entity IN ('veiculo','pessoa') THEN
    IF v_entity='veiculo' THEN
      SELECT a.solicitada_por,coalesce(nullif(a.placa,''),'veículo'),a.status_retificacao
        INTO v_owner,v_label,v_status FROM public.abordagens_veiculos AS a WHERE a.id=p_record_id;
    ELSE
      SELECT a.solicitada_por,coalesce(nullif(a.nome,''),'pessoa'),a.status_retificacao
        INTO v_owner,v_label,v_status FROM public.abordagens_pessoas AS a WHERE a.id=p_record_id;
    END IF;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor OR v_status<>'pending_rectification' THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    v_message := 'Retificação pendente para '||left(v_label,100)||'.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Retificação de abordagem pendente',v_message,'retificacao_pendente','#retificacoes-abordagens',now(),
           'approach:retification:pending:'||v_entity||':'||p_record_id::text||':'||u.id::text
    FROM public.usuarios AS u WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador') AND u.id<>v_actor
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  ELSIF p_event = 'approach_retification_decided' AND v_entity IN ('veiculo','pessoa') THEN
    IF v_entity='veiculo' THEN
      SELECT a.solicitada_por,coalesce(nullif(a.placa,''),'veículo'),a.status_retificacao,
             CASE WHEN a.status_retificacao='rectified' THEN a.aprovada_por ELSE a.rejeitada_por END
        INTO v_recipient,v_label,v_status,v_owner FROM public.abordagens_veiculos AS a WHERE a.id=p_record_id;
    ELSE
      SELECT a.solicitada_por,coalesce(nullif(a.nome,''),'pessoa'),a.status_retificacao,
             CASE WHEN a.status_retificacao='rectified' THEN a.aprovada_por ELSE a.rejeitada_por END
        INTO v_recipient,v_label,v_status,v_owner FROM public.abordagens_pessoas AS a WHERE a.id=p_record_id;
    END IF;
    IF NOT FOUND OR NOT public.gm_is_manager()
       OR v_status NOT IN ('rectified','rectification_rejected')
       OR v_owner IS DISTINCT FROM v_actor OR v_recipient IS NULL THEN
      RAISE EXCEPTION 'evento não autorizado';
    END IF;
    v_message := CASE WHEN v_status='rectified' THEN 'Retificação aprovada para ' ELSE 'Retificação rejeitada para ' END||left(v_label,100)||'.';
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    VALUES (v_recipient,CASE WHEN v_status='rectified' THEN 'Retificação aprovada' ELSE 'Retificação rejeitada' END,
      v_message,CASE WHEN v_status='rectified' THEN 'retificacao_aprovada' ELSE 'retificacao_rejeitada' END,
      '#consulta',now(),'approach:retification:decision:'||v_entity||':'||p_record_id::text||':'||v_recipient::text)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  ELSE
    RAISE EXCEPTION 'tipo de notificação não autorizado';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4) Trigger functions stay server-side and continue to write audit/history/notifications
-- after authenticated table grants are narrowed.
CREATE OR REPLACE FUNCTION public.log_auditoria()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_actor uuid;
  v_entity_id uuid;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := coalesce(v_new,v_old);
  IF v_row ? 'criado_por' THEN
    BEGIN v_actor := nullif(v_row->>'criado_por','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_actor := NULL; END;
  END IF;
  IF v_actor IS NULL AND v_row ? 'atualizado_por' THEN
    BEGIN v_actor := nullif(v_row->>'atualizado_por','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_actor := NULL; END;
  END IF;
  IF v_actor IS NULL AND v_row ? 'cancelado_por' THEN
    BEGIN v_actor := nullif(v_row->>'cancelado_por','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_actor := NULL; END;
  END IF;
  IF v_actor IS NULL AND v_row ? 'sincronizado_por' THEN
    BEGIN v_actor := nullif(v_row->>'sincronizado_por','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_actor := NULL; END;
  END IF;
  v_actor := coalesce(public.gm_current_profile_id(),v_actor);
  BEGIN v_entity_id := nullif(v_row->>'id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_entity_id := NULL; END;
  INSERT INTO public.logs_auditoria (
    usuario_id,usuario_matricula,usuario_nome,acao,entidade,entidade_id,dados_anteriores,dados_novos
  ) VALUES (
    v_actor,
    (SELECT u.matricula FROM public.usuarios AS u WHERE u.id=v_actor),
    (SELECT u.nome_completo FROM public.usuarios AS u WHERE u.id=v_actor),
    TG_OP,TG_TABLE_NAME,v_entity_id,
    CASE WHEN v_old IS NULL THEN NULL ELSE v_old - ARRAY['cpf','cpf_solicitante','cpf_encrypted','cpf_hash','senha_hash','telefone','telefone_solicitante','telefone_encrypted','telefone_hash','email','auth_user_id','rg','endereco','nome_pai','nome_mae'] END,
    CASE WHEN v_new IS NULL THEN NULL ELSE v_new - ARRAY['cpf','cpf_solicitante','cpf_encrypted','cpf_hash','senha_hash','telefone','telefone_solicitante','telefone_encrypted','telefone_hash','email','auth_user_id','rg','endereco','nome_pai','nome_mae'] END
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_historico_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_status (ocorrencia_id,status_anterior,status_novo,alterado_por,observacao)
    VALUES (NEW.id,OLD.status,NEW.status,coalesce(public.gm_current_profile_id(),NEW.atualizado_por),
      CASE WHEN NEW.status='cancelled' THEN NEW.motivo_cancelamento ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_nova_ocorrencia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_label text;
BEGIN
  IF NEW.ocorrencia_original_id IS NOT NULL THEN RETURN NEW; END IF;
  v_label := coalesce(nullif(NEW.numero_ocorrencia,''),nullif(NEW.numero_temporario,''),NEW.id::text);
  INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
  SELECT u.id,'Nova ocorrência','Nova ocorrência registrada: '||left(v_label,100)||'.','nova_ocorrencia',
         '#detalhe-ocorrencia?id='||NEW.id::text,now(),'occurrence:new:'||NEW.id::text||':'||u.id::text
  FROM public.usuarios AS u
  WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador') AND u.id<>NEW.criado_por
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_solicitacao_retificacao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_label text;
BEGIN
  IF NEW.status='pending_rectification' AND NEW.ocorrencia_original_id IS NOT NULL THEN
    v_label := coalesce(nullif(NEW.numero_ocorrencia,''),nullif(NEW.numero_temporario,''),NEW.id::text);
    INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
    SELECT u.id,'Retificação pendente','Solicitação de retificação da ocorrência '||left(v_label,100)||' aguarda análise.',
           'retificacao_pendente','#retificacoes',now(),'occurrence:retification:pending:'||NEW.id::text||':'||u.id::text
    FROM public.usuarios AS u WHERE u.status='ativo' AND u.perfil IN ('supervisor','administrador')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_resposta_retificacao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_recipient uuid;
BEGIN
  IF OLD.status='pending_rectification' AND NEW.status IN ('rectified','rectification_rejected') THEN
    SELECT coalesce(NEW.solicitada_por,o.criado_por) INTO v_recipient
    FROM public.ocorrencias AS o WHERE o.id=NEW.ocorrencia_original_id;
    IF v_recipient IS NOT NULL THEN
      INSERT INTO public.notificacoes (usuario_id,titulo,mensagem,tipo,link,criado_em,dedupe_key)
      VALUES (v_recipient,
        CASE WHEN NEW.status='rectified' THEN 'Retificação aprovada' ELSE 'Retificação rejeitada' END,
        CASE WHEN NEW.status='rectified' THEN 'Sua solicitação de retificação foi aprovada.'
             ELSE 'Sua solicitação de retificação foi rejeitada. Motivo: '||left(coalesce(NEW.motivo_rejeicao,'sem justificativa'),200) END,
        CASE WHEN NEW.status='rectified' THEN 'retificacao_aprovada' ELSE 'retificacao_rejeitada' END,
        '#detalhe-ocorrencia?id='||NEW.id::text,now(),
        'occurrence:retification:decision:'||NEW.id::text||':'||v_recipient::text)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5) Private attachment bucket with active-user read and owner-prefix writes.
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_dedupe_key_uidx
  ON public.notificacoes (dedupe_key) WHERE dedupe_key IS NOT NULL;
UPDATE storage.buckets SET public = false WHERE id = 'anexos';

CREATE POLICY anexos_active_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='anexos' AND public.gm_is_active_profile());
CREATE POLICY anexos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND name !~ '(^|/)\.\.(/|$)');
CREATE POLICY anexos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text)
  WITH CHECK (bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text
    AND name !~ '(^|/)\.\.(/|$)');
CREATE POLICY anexos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id='anexos' AND public.gm_is_active_profile()
    AND split_part(name,'/',1)=public.gm_current_profile_id()::text);

-- 6) Enable and force RLS on every exposed public table; remove broad grants.
ALTER TABLE public.abordagens_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abordagens_pessoas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.abordagens_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abordagens_veiculos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.envolvidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envolvidos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gm_auth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gm_auth_login_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.historico_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_fases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.historico_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_status FORCE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso FORCE ROW LEVEL SECURITY;
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_auditoria FORCE ROW LEVEL SECURITY;
ALTER TABLE public.logs_periciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_periciais FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mural_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_avisos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mural_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_comentarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mural_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_leituras FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mural_reações" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mural_reações" FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_prazos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_prazos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencia_guardas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencia_guardas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sincronizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sincronizacao FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_erros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_erros FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.visualizacoes_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visualizacoes_ocorrencias FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.abordagens_pessoas,public.abordagens_veiculos,public.anexos,public.configuracoes,
  public.envolvidos,public.gm_auth_login_attempts,public.historico_fases,public.historico_status,
  public.logs_acesso,public.logs_auditoria,public.logs_periciais,public.mural_avisos,
  public.mural_comentarios,public.mural_leituras,public."mural_reações",public.notificacoes,
  public.notificacoes_prazos,public.ocorrencia_guardas,public.ocorrencias,public.sincronizacao,
  public.sistema_erros,public.usuarios,public.visualizacoes_ocorrencias
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.view_acessos_ultimos_7_dias,public.view_estatisticas_diarias,public.view_ocorrencias_por_bairro,
  public.view_ocorrencias_por_guarda,public.view_ocorrencias_por_status,public.view_tendencias_mensais
FROM PUBLIC, anon, authenticated;
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT table_schema,table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY (ARRAY[
      'abordagens_pessoas','abordagens_veiculos','anexos','configuracoes','envolvidos',
      'gm_auth_login_attempts','historico_fases','historico_status','logs_acesso','logs_auditoria',
      'logs_periciais','mural_avisos','mural_comentarios','mural_leituras','mural_reações',
      'notificacoes','notificacoes_prazos','ocorrencia_guardas','ocorrencias','sincronizacao',
      'sistema_erros','usuarios','visualizacoes_ocorrencias','view_acessos_ultimos_7_dias',
      'view_estatisticas_diarias','view_ocorrencias_por_bairro','view_ocorrencias_por_guarda',
      'view_ocorrencias_por_status','view_tendencias_mensais'
    ])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      c.column_name,c.table_schema,c.table_name);
  END LOOP;
END;
$$;
ALTER VIEW public.view_acessos_ultimos_7_dias SET (security_invoker=true);
ALTER VIEW public.view_estatisticas_diarias SET (security_invoker=true);
ALTER VIEW public.view_ocorrencias_por_bairro SET (security_invoker=true);
ALTER VIEW public.view_ocorrencias_por_guarda SET (security_invoker=true);
ALTER VIEW public.view_ocorrencias_por_status SET (security_invoker=true);
ALTER VIEW public.view_tendencias_mensais SET (security_invoker=true);
GRANT SELECT ON TABLE public.view_acessos_ultimos_7_dias,public.view_estatisticas_diarias,
  public.view_ocorrencias_por_bairro,public.view_ocorrencias_por_guarda,
  public.view_ocorrencias_por_status,public.view_tendencias_mensais TO authenticated;

-- Explicit grants; RLS determines which rows each active user may access.
GRANT SELECT ON TABLE public.abordagens_pessoas,public.abordagens_veiculos,public.anexos,
  public.envolvidos,public.historico_status,public.mural_avisos,public.mural_comentarios,
  public.mural_leituras,public."mural_reações",public.notificacoes,public.ocorrencia_guardas,
  public.ocorrencias,public.visualizacoes_ocorrencias TO authenticated;
GRANT INSERT,UPDATE,DELETE ON TABLE public.abordagens_pessoas,public.abordagens_veiculos TO authenticated;
GRANT INSERT,UPDATE,DELETE ON TABLE public.envolvidos,public.anexos,public.ocorrencia_guardas TO authenticated;
GRANT INSERT,UPDATE ON TABLE public.ocorrencias TO authenticated;
GRANT INSERT,UPDATE,DELETE ON TABLE public.mural_avisos,public.mural_comentarios TO authenticated;
GRANT INSERT,DELETE ON TABLE public."mural_reações" TO authenticated;
GRANT INSERT,UPDATE,DELETE ON TABLE public.mural_leituras TO authenticated;
GRANT INSERT,UPDATE,DELETE ON TABLE public.visualizacoes_ocorrencias TO authenticated;
GRANT SELECT,INSERT ON TABLE public.logs_acesso,public.logs_periciais TO authenticated;
GRANT SELECT ON TABLE public.logs_auditoria TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.sincronizacao TO authenticated;
GRANT SELECT (id,nome_completo,matricula,apelido,perfil,status,foto_url) ON public.usuarios TO authenticated;
GRANT UPDATE (nome_completo,apelido,email,telefone) ON public.usuarios TO authenticated;
GRANT UPDATE (lida,lida_em) ON public.notificacoes TO authenticated;

-- User profile: safe directory fields only; private contact data comes from gm_my_profile for self.
CREATE POLICY usuarios_active_directory_read ON public.usuarios
  FOR SELECT TO authenticated
  USING ((public.gm_is_active_profile() AND status='ativo')
    OR (id=public.gm_current_profile_id() AND status='primeiro_acesso'));
CREATE POLICY usuarios_self_profile_update ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.gm_is_active_profile() AND id=public.gm_current_profile_id())
  WITH CHECK (public.gm_is_active_profile() AND id=public.gm_current_profile_id() AND status='ativo');

-- Occurrences: every active user can read every occurrence; write is by author/team/manager.
CREATE POLICY ocorrencias_active_read ON public.ocorrencias
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY ocorrencias_author_insert ON public.ocorrencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.gm_is_active_profile()
    AND coalesce(atualizado_por,public.gm_current_profile_id())=public.gm_current_profile_id()
    AND ((ocorrencia_original_id IS NULL AND criado_por=public.gm_current_profile_id())
      OR (ocorrencia_original_id IS NOT NULL AND public.gm_can_manage_occurrence(ocorrencia_original_id)
        AND EXISTS (SELECT 1 FROM public.ocorrencias AS o
          WHERE o.id=ocorrencia_original_id AND o.criado_por=ocorrencias.criado_por)))
    AND (
      (ocorrencia_original_id IS NULL AND status IN ('draft','pending_sync','synced') AND solicitada_por IS NULL
        AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL AND cancelado_por IS NULL
        AND aprovada_em IS NULL AND rejeitada_em IS NULL AND retificado_em IS NULL AND cancelado_em IS NULL
        AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL)
      OR (status='pending_rectification' AND ocorrencia_original_id IS NOT NULL
        AND solicitada_por=public.gm_current_profile_id() AND aprovada_por IS NULL AND rejeitada_por IS NULL
        AND retificado_por IS NULL AND cancelado_por IS NULL AND aprovada_em IS NULL AND rejeitada_em IS NULL
        AND retificado_em IS NULL AND cancelado_em IS NULL AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL)
      OR (public.gm_is_manager() AND status='rectified' AND ocorrencia_original_id IS NOT NULL
        AND aprovada_por=public.gm_current_profile_id() AND retificado_por=public.gm_current_profile_id()
        AND aprovada_em IS NOT NULL AND retificado_em IS NOT NULL AND rejeitada_por IS NULL
        AND cancelado_por IS NULL AND rejeitada_em IS NULL AND cancelado_em IS NULL
        AND motivo_rejeicao IS NULL AND motivo_cancelamento IS NULL AND solicitada_por IS NULL)
    )
  );
CREATE POLICY ocorrencias_author_team_manager_update ON public.ocorrencias
  FOR UPDATE TO authenticated
  USING (public.gm_can_manage_occurrence(id))
  WITH CHECK (public.gm_can_manage_occurrence(id));

CREATE POLICY envolvidos_active_read ON public.envolvidos
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY envolvidos_managed_insert ON public.envolvidos
  FOR INSERT TO authenticated WITH CHECK (public.gm_can_manage_occurrence(ocorrencia_id)
    AND criado_por=public.gm_current_profile_id());
CREATE POLICY envolvidos_managed_update ON public.envolvidos
  FOR UPDATE TO authenticated USING (public.gm_can_manage_occurrence(ocorrencia_id))
  WITH CHECK (public.gm_can_manage_occurrence(ocorrencia_id));
CREATE POLICY envolvidos_managed_delete ON public.envolvidos
  FOR DELETE TO authenticated USING (public.gm_can_manage_occurrence(ocorrencia_id));

CREATE POLICY anexos_active_read ON public.anexos
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY anexos_managed_insert ON public.anexos
  FOR INSERT TO authenticated WITH CHECK (public.gm_can_manage_occurrence(ocorrencia_id)
    AND coalesce(criado_por,public.gm_current_profile_id())=public.gm_current_profile_id());
CREATE POLICY anexos_managed_update ON public.anexos
  FOR UPDATE TO authenticated USING (public.gm_can_manage_occurrence(ocorrencia_id))
  WITH CHECK (public.gm_can_manage_occurrence(ocorrencia_id));
CREATE POLICY anexos_managed_delete ON public.anexos
  FOR DELETE TO authenticated USING (public.gm_can_manage_occurrence(ocorrencia_id));

CREATE POLICY abordagens_pessoas_active_read ON public.abordagens_pessoas
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY abordagens_pessoas_insert_owner ON public.abordagens_pessoas
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND (
    (abordagem_original_id IS NULL AND criado_por=public.gm_current_profile_id()
      AND coalesce(status_retificacao,'normal')='normal' AND solicitada_por IS NULL
      AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
      AND aprovada_em IS NULL AND rejeitada_em IS NULL AND retificado_em IS NULL AND motivo_rejeicao IS NULL)
    OR (abordagem_original_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.abordagens_pessoas AS o
      WHERE o.id=abordagem_original_id AND o.criado_por=abordagens_pessoas.criado_por)
      AND ((status_retificacao='pending_rectification' AND solicitada_por=public.gm_current_profile_id()
          AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager())
          AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
          AND aprovada_em IS NULL AND rejeitada_em IS NULL AND retificado_em IS NULL AND motivo_rejeicao IS NULL)
        OR (public.gm_is_manager() AND status_retificacao='rectified'
          AND aprovada_por=public.gm_current_profile_id() AND retificado_por=public.gm_current_profile_id()
          AND aprovada_em IS NOT NULL AND retificado_em IS NOT NULL AND rejeitada_por IS NULL
          AND rejeitada_em IS NULL AND motivo_rejeicao IS NULL AND solicitada_por IS NULL)))
  ));
CREATE POLICY abordagens_pessoas_update_owner_manager ON public.abordagens_pessoas
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()))
  WITH CHECK (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()));
CREATE POLICY abordagens_pessoas_delete_owner_manager ON public.abordagens_pessoas
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()));

CREATE POLICY abordagens_veiculos_active_read ON public.abordagens_veiculos
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY abordagens_veiculos_insert_owner ON public.abordagens_veiculos
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND (
    (abordagem_original_id IS NULL AND criado_por=public.gm_current_profile_id()
      AND coalesce(status_retificacao,'normal')='normal' AND solicitada_por IS NULL
      AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
      AND aprovada_em IS NULL AND rejeitada_em IS NULL AND retificado_em IS NULL AND motivo_rejeicao IS NULL)
    OR (abordagem_original_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.abordagens_veiculos AS o
      WHERE o.id=abordagem_original_id AND o.criado_por=abordagens_veiculos.criado_por)
      AND ((status_retificacao='pending_rectification' AND solicitada_por=public.gm_current_profile_id()
          AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager())
          AND aprovada_por IS NULL AND rejeitada_por IS NULL AND retificado_por IS NULL
          AND aprovada_em IS NULL AND rejeitada_em IS NULL AND retificado_em IS NULL AND motivo_rejeicao IS NULL)
        OR (public.gm_is_manager() AND status_retificacao='rectified'
          AND aprovada_por=public.gm_current_profile_id() AND retificado_por=public.gm_current_profile_id()
          AND aprovada_em IS NOT NULL AND retificado_em IS NOT NULL AND rejeitada_por IS NULL
          AND rejeitada_em IS NULL AND motivo_rejeicao IS NULL AND solicitada_por IS NULL)))
  ));
CREATE POLICY abordagens_veiculos_update_owner_manager ON public.abordagens_veiculos
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()))
  WITH CHECK (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()));
CREATE POLICY abordagens_veiculos_delete_owner_manager ON public.abordagens_veiculos
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND (criado_por=public.gm_current_profile_id() OR public.gm_is_manager()));

CREATE POLICY ocorrencia_guardas_active_read ON public.ocorrencia_guardas
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY ocorrencia_guardas_assign_insert ON public.ocorrencia_guardas
  FOR INSERT TO authenticated WITH CHECK (public.gm_can_assign_occurrence(ocorrencia_id)
    AND coalesce(selecionado_por,public.gm_current_profile_id())=public.gm_current_profile_id());
CREATE POLICY ocorrencia_guardas_assign_update ON public.ocorrencia_guardas
  FOR UPDATE TO authenticated USING (public.gm_can_assign_occurrence(ocorrencia_id))
  WITH CHECK (public.gm_can_assign_occurrence(ocorrencia_id));
CREATE POLICY ocorrencia_guardas_assign_delete ON public.ocorrencia_guardas
  FOR DELETE TO authenticated USING (public.gm_can_assign_occurrence(ocorrencia_id));

CREATE POLICY visualizacoes_self_read ON public.visualizacoes_ocorrencias
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY visualizacoes_self_insert ON public.visualizacoes_ocorrencias
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY visualizacoes_self_update ON public.visualizacoes_ocorrencias
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id())
  WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY visualizacoes_self_delete ON public.visualizacoes_ocorrencias
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());

CREATE POLICY historico_status_active_read ON public.historico_status
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());

CREATE POLICY sincronizacao_self_read ON public.sincronizacao
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY sincronizacao_self_insert ON public.sincronizacao
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id()
    AND public.gm_can_manage_occurrence(ocorrencia_id));
CREATE POLICY sincronizacao_self_update ON public.sincronizacao
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id())
  WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id()
    AND public.gm_can_manage_occurrence(ocorrencia_id));

CREATE POLICY mural_avisos_active_read ON public.mural_avisos
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY mural_avisos_manager_insert ON public.mural_avisos
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_manager() AND criado_por=public.gm_current_profile_id());
CREATE POLICY mural_avisos_manager_update ON public.mural_avisos
  FOR UPDATE TO authenticated USING (public.gm_is_manager()) WITH CHECK (public.gm_is_manager());
CREATE POLICY mural_avisos_manager_delete ON public.mural_avisos
  FOR DELETE TO authenticated USING (public.gm_is_manager());

CREATE POLICY mural_comentarios_active_read ON public.mural_comentarios
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY mural_comentarios_self_insert ON public.mural_comentarios
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY mural_comentarios_self_update ON public.mural_comentarios
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND (usuario_id=public.gm_current_profile_id() OR public.gm_is_manager()))
  WITH CHECK (public.gm_is_active_profile() AND (usuario_id=public.gm_current_profile_id() OR public.gm_is_manager()));
CREATE POLICY mural_comentarios_self_delete ON public.mural_comentarios
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND (usuario_id=public.gm_current_profile_id() OR public.gm_is_manager()));

CREATE POLICY mural_reacoes_active_read ON public."mural_reações"
  FOR SELECT TO authenticated USING (public.gm_is_active_profile());
CREATE POLICY mural_reacoes_self_insert ON public."mural_reações"
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY mural_reacoes_self_delete ON public."mural_reações"
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());

CREATE POLICY mural_leituras_self_read ON public.mural_leituras
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY mural_leituras_self_insert ON public.mural_leituras
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY mural_leituras_self_update ON public.mural_leituras
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id())
  WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY mural_leituras_self_delete ON public.mural_leituras
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());

CREATE POLICY notificacoes_self_read ON public.notificacoes
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY notificacoes_self_update ON public.notificacoes
  FOR UPDATE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id())
  WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY notificacoes_self_delete ON public.notificacoes
  FOR DELETE TO authenticated USING (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());

CREATE POLICY logs_acesso_self_or_manager_read ON public.logs_acesso
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND (usuario_id=public.gm_current_profile_id() OR public.gm_is_manager()));
CREATE POLICY logs_acesso_self_insert ON public.logs_acesso
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY logs_periciais_manager_read ON public.logs_periciais
  FOR SELECT TO authenticated USING (public.gm_is_active_profile()
    AND (usuario_id=public.gm_current_profile_id() OR public.gm_is_manager()));
CREATE POLICY logs_periciais_self_insert ON public.logs_periciais
  FOR INSERT TO authenticated WITH CHECK (public.gm_is_active_profile() AND usuario_id=public.gm_current_profile_id());
CREATE POLICY logs_auditoria_manager_read ON public.logs_auditoria
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND public.gm_is_manager());

-- Managers/admins receive read access to operational deadline tables; no direct writes.
GRANT SELECT ON TABLE public.notificacoes_prazos TO authenticated;
CREATE POLICY notificacoes_prazos_manager_read ON public.notificacoes_prazos
  FOR SELECT TO authenticated USING (public.gm_is_active_profile() AND public.gm_is_manager());

-- 7) Guard immutable creator and manager-only workflow decisions on occurrence rows.
CREATE OR REPLACE FUNCTION public.gm_guard_occurrence_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text := public.gm_current_role();
  v_actor uuid := public.gm_current_profile_id();
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN RAISE EXCEPTION 'autor imutável'; END IF;
  IF NEW.ocorrencia_original_id IS DISTINCT FROM OLD.ocorrencia_original_id THEN RAISE EXCEPTION 'vínculo original imutável'; END IF;
  IF OLD.solicitada_por IS NOT NULL AND NEW.solicitada_por IS DISTINCT FROM OLD.solicitada_por THEN
    RAISE EXCEPTION 'solicitante imutável';
  END IF;
  IF NEW.atualizado_por IS DISTINCT FROM OLD.atualizado_por
     AND NEW.atualizado_por IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'atualizador inválido'; END IF;
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
    RETURN NEW;
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
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft','pending_sync','synced','pending_rectification') THEN
    RAISE EXCEPTION 'transição de status reservada à supervisão';
  END IF;
  IF NEW.status='pending_rectification'
     AND (NEW.solicitada_por IS DISTINCT FROM v_actor OR NEW.ocorrencia_original_id IS NULL) THEN
    RAISE EXCEPTION 'solicitação de retificação inválida';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gm_guard_occurrence_update ON public.ocorrencias;
CREATE TRIGGER gm_guard_occurrence_update BEFORE UPDATE ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.gm_guard_occurrence_update();

CREATE OR REPLACE FUNCTION public.gm_guard_approach_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role text := public.gm_current_role();
  v_actor uuid := public.gm_current_profile_id();
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN RAISE EXCEPTION 'autor imutável'; END IF;
  IF NEW.abordagem_original_id IS DISTINCT FROM OLD.abordagem_original_id THEN RAISE EXCEPTION 'vínculo original imutável'; END IF;
  IF OLD.solicitada_por IS NOT NULL AND NEW.solicitada_por IS DISTINCT FROM OLD.solicitada_por THEN
    RAISE EXCEPTION 'solicitante imutável';
  END IF;
  IF v_role IN ('supervisor','administrador') THEN
    IF (NEW.aprovada_por IS DISTINCT FROM OLD.aprovada_por AND NEW.aprovada_por IS DISTINCT FROM v_actor)
       OR (NEW.rejeitada_por IS DISTINCT FROM OLD.rejeitada_por AND NEW.rejeitada_por IS DISTINCT FROM v_actor)
       OR (NEW.retificado_por IS DISTINCT FROM OLD.retificado_por AND NEW.retificado_por IS DISTINCT FROM v_actor) THEN
      RAISE EXCEPTION 'ator da decisão inválido';
    END IF;
    IF NEW.status_retificacao IS DISTINCT FROM OLD.status_retificacao
       AND ((NEW.status_retificacao='rectified' AND NEW.aprovada_por IS DISTINCT FROM v_actor)
         OR (NEW.status_retificacao='rectification_rejected' AND NEW.rejeitada_por IS DISTINCT FROM v_actor)) THEN
      RAISE EXCEPTION 'decisão sem ator autorizado';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.aprovada_por IS DISTINCT FROM OLD.aprovada_por
     OR NEW.aprovada_em IS DISTINCT FROM OLD.aprovada_em
     OR NEW.rejeitada_por IS DISTINCT FROM OLD.rejeitada_por
     OR NEW.rejeitada_em IS DISTINCT FROM OLD.rejeitada_em
     OR NEW.retificado_por IS DISTINCT FROM OLD.retificado_por
     OR NEW.retificado_em IS DISTINCT FROM OLD.retificado_em
     OR NEW.motivo_rejeicao IS DISTINCT FROM OLD.motivo_rejeicao THEN
    RAISE EXCEPTION 'campo reservado à supervisão';
  END IF;
  IF NEW.status_retificacao IS DISTINCT FROM OLD.status_retificacao
     AND NEW.status_retificacao IS DISTINCT FROM 'pending_rectification' THEN
    RAISE EXCEPTION 'decisão reservada à supervisão';
  END IF;
  IF NEW.status_retificacao='pending_rectification'
     AND (NEW.solicitada_por IS DISTINCT FROM v_actor OR NEW.abordagem_original_id IS NULL) THEN
    RAISE EXCEPTION 'solicitante inválido';
  END IF;
  IF NEW.solicitada_por IS DISTINCT FROM OLD.solicitada_por
     AND (NEW.solicitada_por IS DISTINCT FROM v_actor OR NEW.status_retificacao<>'pending_rectification') THEN
    RAISE EXCEPTION 'solicitante inválido';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gm_guard_approach_update ON public.abordagens_pessoas;
CREATE TRIGGER gm_guard_approach_update BEFORE UPDATE ON public.abordagens_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.gm_guard_approach_update();
DROP TRIGGER IF EXISTS gm_guard_approach_update ON public.abordagens_veiculos;
CREATE TRIGGER gm_guard_approach_update BEFORE UPDATE ON public.abordagens_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.gm_guard_approach_update();

CREATE OR REPLACE FUNCTION public.gm_guard_creator_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_row jsonb := to_jsonb(NEW); v_old jsonb := to_jsonb(OLD); v_actor uuid := public.gm_current_profile_id();
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF v_row->>'criado_por' IS DISTINCT FROM v_old->>'criado_por' THEN RAISE EXCEPTION 'autor imutável'; END IF;
  IF v_row ? 'atualizado_por'
     AND v_row->>'atualizado_por' IS DISTINCT FROM v_old->>'atualizado_por'
     AND v_row->>'atualizado_por' IS DISTINCT FROM v_actor::text THEN
    RAISE EXCEPTION 'atualizador inválido';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS gm_guard_creator_update ON public.envolvidos;
CREATE TRIGGER gm_guard_creator_update BEFORE UPDATE ON public.envolvidos FOR EACH ROW EXECUTE FUNCTION public.gm_guard_creator_update();
DROP TRIGGER IF EXISTS gm_guard_creator_update ON public.anexos;
CREATE TRIGGER gm_guard_creator_update BEFORE UPDATE ON public.anexos FOR EACH ROW EXECUTE FUNCTION public.gm_guard_creator_update();
DROP TRIGGER IF EXISTS gm_guard_creator_update ON public.mural_avisos;
CREATE TRIGGER gm_guard_creator_update BEFORE UPDATE ON public.mural_avisos FOR EACH ROW EXECUTE FUNCTION public.gm_guard_creator_update();

-- 8) Revoke unsafe SECURITY DEFINER RPCs and preserve only narrowly scoped helpers.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('verificar_senha','get_unread_mural_count','salvar_ocorrencia_completa','rls_auto_enable')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',r.signature);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.criar_hash_senha(character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_hash_senha(character varying) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.gm_current_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_current_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_is_active_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_is_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_can_manage_occurrence(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_can_assign_occurrence(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_verify_my_password(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_update_my_password(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_complete_first_access(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gm_emit_notification(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_current_profile_id() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_current_role() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_is_active_profile() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_is_manager() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_is_admin() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_can_manage_occurrence(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_can_assign_occurrence(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gm_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gm_verify_my_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gm_update_my_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gm_complete_first_access(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gm_emit_notification(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.gm_record_login_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_clear_login_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gm_verify_legacy_password(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_record_login_attempt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_clear_login_attempt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_verify_legacy_password(text,text) TO service_role;

COMMIT;
