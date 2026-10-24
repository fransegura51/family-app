-- Deshace 0310 (soporte técnico). Borra las incidencias, mensajes, adjuntos (filas) e historial. Los ARCHIVOS del bucket «support-attachments» NO se borran con SQL
-- (hay que vaciar el bucket desde el panel de Storage antes de retirarlo, o se quedarían archivos huérfanos).
drop policy if exists "support_attachments storage: leer los míos o todos si soy administración" on storage.objects;
drop policy if exists "support_attachments storage: subir a mis incidencias" on storage.objects;

drop function if exists public.support_admin_stats();
drop function if exists public.support_admin_owners();
drop function if exists public.support_admin_similar(uuid);
drop function if exists public.support_admin_mark_read(uuid);
drop function if exists public.support_admin_set_priority(uuid, text);
drop function if exists public.support_admin_assign(uuid, uuid);
drop function if exists public.support_admin_set_status(uuid, text);
drop function if exists public.support_admin_reply(uuid, text, boolean, text);
drop function if exists public.support_admin_list(text, text, text, uuid, int);
drop function if exists public.support_mark_read(uuid);
drop function if exists public.support_confirm_resolution(uuid, boolean);
drop function if exists public.support_register_attachment(uuid, uuid, text, text, text, int);
drop function if exists public.support_post_message(uuid, text);
drop function if exists public.support_create_ticket(text, text, text, text, jsonb);
drop function if exists private.support_require_owner();
drop function if exists private.support_event(uuid, text, uuid, text, text, text, boolean);
drop function if exists private.support_notify_requester(uuid, text, text, uuid, text);
drop function if exists private.support_notify_owners(text, text, uuid, text);
drop function if exists private.support_clean_context(jsonb);

drop table if exists public.support_ticket_events;
drop table if exists public.support_attachments;
drop table if exists public.support_messages;
drop table if exists public.support_tickets;

-- El bucket solo se puede borrar si está vacío (desde el panel de Storage o la API). No se toca aquí.
