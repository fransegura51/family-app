-- Petición real: "quiero definir a cada pestaña de banco el nombre de
-- quien es la cuenta para que use esa letra para los movimientos" —
-- el nombre que trae el banco (bank_accounts.name) es el del titular
-- legal, que en cuentas de menores suele ser el padre/madre
-- representante, no sirve para distinguir "cuenta de Eric" de "cuenta
-- de Fernando" a simple vista. Se enlaza a un miembro YA existente de
-- la familia (mismo patrón que receipts.purchased_by_member_id,
-- calendar_events, member_documents) en vez de una etiqueta de texto
-- suelta, para heredar gratis su color y avatar ya definidos, sin
-- duplicar datos. Nullable: una cuenta común de la casa puede quedar
-- sin asignar.
alter table bank_accounts
  add column owner_member_id uuid references family_members(id) on delete set null;

create index if not exists bank_accounts_owner_member_id_idx on bank_accounts(owner_member_id);
