-- Deshacer 0343: vuelve el check a ('item', 'dish'). Si ya hay propuestas guardadas con alcance 'day' o 'recipe', primero se reasignan a 'dish' (la más cercana: se conserva su
-- propuesta, su instrucción y su historial; solo cambia la etiqueta del alcance) para que el check pueda volver a ponerse.
update public.community_editorial_revisions set scope = 'dish' where scope in ('day', 'recipe');
alter table public.community_editorial_revisions drop constraint if exists community_editorial_revisions_scope_check;
alter table public.community_editorial_revisions
  add constraint community_editorial_revisions_scope_check check (scope in ('item', 'dish'));
