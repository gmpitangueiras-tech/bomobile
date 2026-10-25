-- Bootstrap JWT for legacy CPF/password accounts.
-- Additive only: preserves existing usuarios rows and their senha_hash values.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_auth_user_id_fkey'
      AND conrelid = 'public.usuarios'::regclass
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_auth_user_id_fkey
      FOREIGN KEY (auth_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_uidx
  ON public.usuarios (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gm_auth_login_attempts (
  attempt_key text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);

ALTER TABLE public.gm_auth_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gm_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT u.id
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid() AND u.status = 'ativo'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.gm_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT u.perfil::text
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid() AND u.status = 'ativo'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.gm_record_login_attempt(p_attempt_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_blocked_until timestamptz;
BEGIN
  INSERT INTO public.gm_auth_login_attempts AS a
    (attempt_key, attempt_count, window_started_at, blocked_until)
  VALUES (p_attempt_key, 1, now(), NULL)
  ON CONFLICT (attempt_key) DO UPDATE SET
    attempt_count = CASE
      WHEN a.blocked_until > now() THEN a.attempt_count
      WHEN a.window_started_at < now() - interval '15 minutes' THEN 1
      ELSE a.attempt_count + 1
    END,
    window_started_at = CASE
      WHEN a.window_started_at < now() - interval '15 minutes' THEN now()
      ELSE a.window_started_at
    END,
    blocked_until = CASE
      WHEN a.blocked_until > now() THEN a.blocked_until
      WHEN a.window_started_at < now() - interval '15 minutes' THEN NULL
      WHEN a.attempt_count + 1 >= 6 THEN now() + interval '15 minutes'
      ELSE NULL
    END
  RETURNING blocked_until INTO v_blocked_until;

  RETURN v_blocked_until IS NULL OR v_blocked_until <= now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.gm_clear_login_attempt(p_attempt_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  DELETE FROM public.gm_auth_login_attempts WHERE attempt_key = p_attempt_key;
$function$;

CREATE OR REPLACE FUNCTION public.gm_verify_legacy_password(p_cpf text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  SELECT u.senha_hash INTO v_hash
  FROM public.usuarios AS u
  WHERE u.cpf = p_cpf AND u.status IN ('ativo', 'primeiro_acesso');
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_hash = extensions.crypt(p_password, v_hash);
END;
$function$;

REVOKE ALL ON FUNCTION public.gm_current_profile_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_current_profile_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.gm_current_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_current_role() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.gm_record_login_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_record_login_attempt(text) TO service_role;
REVOKE ALL ON FUNCTION public.gm_clear_login_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_clear_login_attempt(text) TO service_role;
REVOKE ALL ON FUNCTION public.gm_verify_legacy_password(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gm_verify_legacy_password(text, text) TO service_role;
