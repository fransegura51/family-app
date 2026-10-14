-- Deshace 0261: vuelve claim_due_reminders a la versión de 0197 (sin out_profile_id) y quita el ajuste familiar y la casilla.
drop trigger if exists calendar_event_members_notify_assignment on public.calendar_event_members;
drop function if exists private.notify_task_assignment();
drop function if exists public.claim_due_reminders();
-- Reponer la versión de 0197: volver a ejecutar su bloque «create function public.claim_due_reminders() ... grant execute» (supabase/migrations/0197_...).
drop function if exists private.event_notification_recipients(uuid, boolean);
alter table public.calendar_events drop column if exists notify_family;
alter table public.families drop column if exists task_notify_mode;
