-- Uso único del state OAuth (banco y Google): se anota la firma de cada state usado para que no se pueda reutilizar dentro de sus 10 minutos.
create table if not exists public.oauth_state_used (
  sig text primary key,
  used_at timestamptz not null default now()
);
alter table public.oauth_state_used enable row level security;
revoke all on public.oauth_state_used from anon, authenticated;

-- true = primera vez que se usa; false = ya se había usado. Solo service_role.
create or replace function public.consume_oauth_state(p_sig text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.oauth_state_used where used_at < now() - interval '1 day';
  insert into public.oauth_state_used (sig) values (p_sig) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;
