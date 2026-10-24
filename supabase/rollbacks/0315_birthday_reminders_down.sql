do $$ begin
  if exists (select 1 from cron.job where jobname = 'birthday-reminders') then perform cron.unschedule('birthday-reminders'); end if;
end $$;
drop function if exists private.run_birthday_reminders();
drop function if exists private.run_birthday_reminders_at(timestamptz);
drop function if exists private.birthday_on(date, date);
