-- Tareas: fecha de inicio + hora, para poder anclar la recurrencia
-- (antes recurrence_rule no se usaba para nada, era solo una etiqueta).
alter table tasks add column start_date date not null default current_date;
alter table tasks add column time_of_day time;

-- Etiqueta a Paco también como figura administradora dentro de la
-- familia (los dos adultos son "admin" a nivel de member_type/UI). Su
-- permiso real en RLS sigue dependiendo de profiles.role — no tiene
-- cuenta propia todavía, así que esto es solo la etiqueta visible.
update family_members set member_type = 'admin' where name = 'PACO';
