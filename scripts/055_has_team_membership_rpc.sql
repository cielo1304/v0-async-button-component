-- Migration 055: SECURITY DEFINER RPC for middleware membership check
-- Bypasses RLS so the middleware anon/authed client can safely determine
-- whether the currently-authenticated user has any team_members row.

create or replace function public.has_team_membership()
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  return exists (
    select 1 from public.team_members tm
    where tm.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.has_team_membership() to authenticated;
