
CREATE OR REPLACE FUNCTION public.gm_capture_auth_security_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.attempt_count > COALESCE(OLD.attempt_count,0) THEN
    PERFORM public.gm_record_security_event('failed_login',NEW.attempt_key,NULL,'invalid_credentials_or_rate_limit',NULL,jsonb_build_object('attempt_count',NEW.attempt_count));
  END IF;
  IF NEW.blocked_until IS NOT NULL AND (TG_OP='INSERT' OR OLD.blocked_until IS NULL OR NEW.blocked_until<>OLD.blocked_until) THEN
    PERFORM public.gm_record_security_event('blocked_login',NEW.attempt_key,NULL,'temporary_lockout',NULL,jsonb_build_object('blocked_until',NEW.blocked_until));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS gm_auth_security_event_capture ON public.gm_auth_login_attempts;
CREATE TRIGGER gm_auth_security_event_capture AFTER INSERT OR UPDATE OF attempt_count, blocked_until ON public.gm_auth_login_attempts FOR EACH ROW EXECUTE FUNCTION public.gm_capture_auth_security_event();
REVOKE ALL ON FUNCTION public.gm_capture_auth_security_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gm_capture_auth_security_event() TO service_role;
