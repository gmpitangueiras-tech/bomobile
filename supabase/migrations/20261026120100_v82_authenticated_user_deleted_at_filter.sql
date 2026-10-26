-- v82: allow the active-user directory query to filter on deleted_at.
-- This is a column-level grant for authenticated users only; it does not
-- grant table access to anon or change any RLS policy.
BEGIN;

GRANT SELECT (deleted_at) ON TABLE public.usuarios TO authenticated;

COMMIT;
