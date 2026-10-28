-- Deshace 0344: quita la función de reprogramar encuestas. No toca datos (las encuestas ya reprogramadas conservan su nueva fecha).
drop function if exists public.community_admin_reschedule_poll(uuid, timestamptz);
