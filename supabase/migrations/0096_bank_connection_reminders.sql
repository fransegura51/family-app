-- Petición real: "ponemos una función que se genere automáticamente
-- dos avisos en el calendario por cada cuenta cuando se conecte, uno
-- una semana antes del vencimiento y otro un día antes del vencimiento
-- de la cuenta" — enable-banking-auth-callback crea estos dos eventos
-- (todo el día, sin miembro asignado = visibles para toda la familia)
-- justo después de guardar la conexión, usando el valid_until que
-- Enable Banking ya devuelve (ver 0066_bank_linking_schema.sql).
--
-- Esta tabla solo sirve para poder borrar esos dos avisos cuando se
-- desconecta el banco a mano (enable-banking-disconnect) — si no, se
-- quedarían recordando renovar algo que la familia ya ha desconectado
-- a propósito. Solo la escriben las Edge Functions (service role); no
-- hay policy de escritura porque ninguna pantalla la necesita todavía.
create table bank_connection_reminders (
  connection_id uuid not null references bank_connections(id) on delete cascade,
  event_id uuid not null references calendar_events(id) on delete cascade,
  primary key (connection_id, event_id)
);

alter table bank_connection_reminders enable row level security;

create policy "bank_connection_reminders: family select"
  on bank_connection_reminders for select
  using (
    exists (
      select 1 from bank_connections c
      where c.id = connection_id and c.family_id = private.current_family_id()
    )
  );
