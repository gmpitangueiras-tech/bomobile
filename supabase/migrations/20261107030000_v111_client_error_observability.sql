ALTER TABLE public.sistema_erros ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE public.sistema_erros ADD COLUMN IF NOT EXISTS ocorrencias integer NOT NULL DEFAULT 1;
ALTER TABLE public.sistema_erros ADD COLUMN IF NOT EXISTS primeira_ocorrencia timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sistema_erros ADD COLUMN IF NOT EXISTS ultima_ocorrencia timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sistema_erros_fingerprint_idx ON public.sistema_erros(fingerprint, ultima_ocorrencia DESC);
CREATE INDEX IF NOT EXISTS sistema_erros_abertos_idx ON public.sistema_erros(resolvido, ultima_ocorrencia DESC);
CREATE OR REPLACE FUNCTION public.gm_record_client_error(p_usuario_id uuid DEFAULT NULL,p_nivel text DEFAULT 'error',p_origem text DEFAULT 'pwa',p_mensagem text DEFAULT '',p_rota text DEFAULT NULL,p_versao text DEFAULT NULL,p_dispositivo text DEFAULT NULL,p_detalhes jsonb DEFAULT '{}'::jsonb,p_fingerprint text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE safe_message text; safe_origin text; safe_level text; safe_fp text; user_id_value uuid; existing_id uuid;
BEGIN
 safe_message:=left(regexp_replace(coalesce(p_mensagem,''),'[[:cntrl:]]',' ','g'),1000); safe_origin:=left(regexp_replace(coalesce(p_origem,'pwa'),'[^a-zA-Z0-9_.:-]','_','g'),80); safe_level:=CASE WHEN lower(coalesce(p_nivel,'error')) IN ('error','warn','warning','fatal') THEN lower(p_nivel) ELSE 'error' END; safe_fp:=left(regexp_replace(coalesce(p_fingerprint,md5(coalesce(safe_origin,'')||'|'||coalesce(safe_message,''))),'[^a-zA-Z0-9_.:-]','_','g'),180);
 IF safe_message='' THEN RETURN jsonb_build_object('accepted',false,'reason','empty_message'); END IF;
 SELECT u.id INTO user_id_value FROM public.usuarios u WHERE u.id=p_usuario_id AND u.deleted_at IS NULL;
 IF (SELECT count(*) FROM public.sistema_erros WHERE criado_em>=now()-interval '1 hour' AND fingerprint=safe_fp)>=20 THEN RETURN jsonb_build_object('accepted',false,'reason','rate_limited'); END IF;
 SELECT id INTO existing_id FROM public.sistema_erros WHERE fingerprint=safe_fp AND resolvido=false AND ultima_ocorrencia>=now()-interval '24 hours' ORDER BY ultima_ocorrencia DESC LIMIT 1;
 IF existing_id IS NOT NULL THEN UPDATE public.sistema_erros SET ocorrencias=ocorrencias+1,ultima_ocorrencia=now(),detalhes=coalesce(p_detalhes,'{}'::jsonb),rota=left(p_rota,240),versao=left(p_versao,120),dispositivo=left(p_dispositivo,500) WHERE id=existing_id; RETURN jsonb_build_object('accepted',true,'deduplicated',true,'id',existing_id); END IF;
 INSERT INTO public.sistema_erros(nivel,origem,mensagem,rota,versao,dispositivo,detalhes,fingerprint,ocorrencias,primeira_ocorrencia,ultima_ocorrencia) VALUES(safe_level,safe_origin,safe_message,left(p_rota,240),left(p_versao,120),left(p_dispositivo,500),coalesce(p_detalhes,'{}'::jsonb)||jsonb_build_object('usuario_id',user_id_value),safe_fp,1,now(),now()) RETURNING id INTO existing_id;
 RETURN jsonb_build_object('accepted',true,'deduplicated',false,'id',existing_id);
END; $$;
REVOKE ALL ON FUNCTION public.gm_record_client_error(uuid,text,text,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gm_record_client_error(uuid,text,text,text,text,text,text,jsonb,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.gm_admin_error_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; actor_id uuid;
BEGIN SELECT u.id INTO actor_id FROM public.usuarios u WHERE u.perfil='administrador' AND u.status='ativo' AND u.deleted_at IS NULL LIMIT 1; IF actor_id IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF; SELECT jsonb_build_object('total_abertos',count(*) FILTER (WHERE NOT resolvido),'total_24h',count(*) FILTER (WHERE ultima_ocorrencia>=now()-interval '24 hours'),'total_7d',count(*) FILTER (WHERE ultima_ocorrencia>=now()-interval '7 days'),'ocorrencias_24h',coalesce(sum(ocorrencias) FILTER (WHERE ultima_ocorrencia>=now()-interval '24 hours'),0),'origens',coalesce(jsonb_agg(distinct origem) FILTER (WHERE NOT resolvido),'[]'::jsonb)) INTO result FROM public.sistema_erros; RETURN result; END; $$;
REVOKE ALL ON FUNCTION public.gm_admin_error_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gm_admin_error_summary() TO service_role;
