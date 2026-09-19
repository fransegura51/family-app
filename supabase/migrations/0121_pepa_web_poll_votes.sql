-- "La pregunta de Paco" de la web pública de PEPA (ver 0120): voto
-- simple, sin datos personales, solo cuenta agregada de resultados
-- visible públicamente. Aislada de las tablas de negocio, igual que
-- pepa_web_leads.
create table pepa_web_poll_votes (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  option_key text not null,
  created_at timestamptz not null default now()
);

create index idx_pepa_web_poll_votes_question on pepa_web_poll_votes (question_key);

alter table pepa_web_poll_votes enable row level security;

-- Cualquier visitante puede votar. Sin policy de select: las filas
-- individuales (con su timestamp) no son públicas, solo el recuento
-- agregado, a través de la función de abajo.
create policy "pepa_web_poll_votes: anon insert" on pepa_web_poll_votes
  for insert to anon
  with check (true);

-- Mismo patrón que generate_event_open_rsvp_token (0109): función
-- security definer en vez de exponer la tabla — así el recuento es
-- público sin que nadie pueda leer filas individuales.
create or replace function public.get_pepa_web_poll_results(p_question_key text)
returns table (option_key text, votes bigint)
language sql
security definer
set search_path = public
as $$
  select option_key, count(*) as votes
  from pepa_web_poll_votes
  where question_key = p_question_key
  group by option_key;
$$;

grant execute on function public.get_pepa_web_poll_results(text) to anon, authenticated;
