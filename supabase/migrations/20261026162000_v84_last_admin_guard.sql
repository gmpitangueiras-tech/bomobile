-- v84: protect the last active administrator at database level.
-- The transaction lock closes the race between concurrent privilege/status changes.

CREATE OR REPLACE FUNCTION public.gm_guard_last_active_administrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_admins integer;
BEGIN
  IF OLD.perfil = 'administrador'
     AND OLD.status = 'ativo'
     AND (
       NEW.perfil IS DISTINCT FROM 'administrador'
       OR NEW.status IS DISTINCT FROM 'ativo'
       OR NEW.deleted_at IS NOT NULL
     ) THEN
    PERFORM pg_advisory_xact_lock(hashtext('gm:last-active-administrator'));

    SELECT count(*)
      INTO remaining_admins
      FROM public.usuarios
     WHERE id <> OLD.id
       AND perfil = 'administrador'
       AND status = 'ativo'
       AND deleted_at IS NULL;

    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'Não é permitido remover o último administrador ativo'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_active_administrator ON public.usuarios;

CREATE TRIGGER trg_guard_last_active_administrator
BEFORE UPDATE OF perfil, status, deleted_at ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.gm_guard_last_active_administrator();

REVOKE ALL ON FUNCTION public.gm_guard_last_active_administrator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gm_guard_last_active_administrator() FROM anon;
REVOKE ALL ON FUNCTION public.gm_guard_last_active_administrator() FROM authenticated;
