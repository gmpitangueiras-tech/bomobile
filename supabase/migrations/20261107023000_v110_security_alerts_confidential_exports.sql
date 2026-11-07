
-- Compatibilidade: o cliente atual envia finalidade e justificativa dentro de escopo.
CREATE OR REPLACE FUNCTION public.gm_audit_confidential_export() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO public.logs_auditoria(usuario_id,acao,entidade,entidade_id,dados_novos) VALUES(NEW.solicitado_por,'request_confidential_export','governance_export_requests',NEW.id,jsonb_build_object('classificacao',coalesce(NEW.classificacao,NEW.escopo->>'classificacao','confidencial'),'finalidade',left(coalesce(NEW.finalidade,NEW.escopo->>'finalidade',''),240),'justificativa',left(coalesce(NEW.justificativa,NEW.escopo->>'justificativa',''),500),'escopo',NEW.escopo,'status',NEW.status));
 ELSIF TG_OP='UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.objeto_path IS DISTINCT FROM OLD.objeto_path) THEN INSERT INTO public.logs_auditoria(usuario_id,acao,entidade,entidade_id,dados_anteriores,dados_novos) VALUES(NEW.solicitado_por,'export_status_change','governance_export_requests',NEW.id,jsonb_build_object('status',OLD.status,'objeto_disponivel',OLD.objeto_path IS NOT NULL),jsonb_build_object('status',NEW.status,'objeto_disponivel',NEW.objeto_path IS NOT NULL,'concluido_em',NEW.concluido_em,'expira_em',NEW.expira_em,'erro_codigo',NEW.erro_codigo)); END IF; RETURN NEW;
END; $$;
