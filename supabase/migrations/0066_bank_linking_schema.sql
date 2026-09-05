-- Módulo Banco (Enable Banking, ver conversación con el usuario):
-- enlazar cuentas bancarias reales de la familia para leer sus
-- movimientos. Mismo patrón que el calendario de Google (state con el
-- family_id metido en base64, sin fila "pendiente" que limpiar si el
-- usuario nunca completa la autorización en el banco) — la fila de
-- bank_connections solo se crea DESPUÉS de que el banco confirme la
-- autorización, en el callback.
create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  aspsp_name text not null,
  aspsp_country text not null,
  session_id text,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  valid_until timestamptz,
  connected_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Se guarda también la respuesta cruda de Enable Banking (columna
-- "raw") porque el mapeo exacto de sus campos (IBAN, nombre...) se
-- verificará con datos reales del sandbox — así no se pierde nada
-- aunque el mapeo inicial no sea perfecto.
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references bank_connections(id) on delete cascade,
  account_uid text not null,
  iban text,
  name text,
  currency text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references bank_accounts(id) on delete cascade,
  entry_reference text,
  transaction_date date,
  amount numeric(10, 2) not null,
  currency text not null default 'EUR',
  credit_debit text not null check (credit_debit in ('CRDT', 'DBIT')),
  description text,
  -- Para el módulo de conciliación con Amazon (Módulo 3, pendiente):
  -- un movimiento ya emparejado con un pedido/gasto no se vuelve a
  -- ofrecer para revisión manual.
  matched_expense_id uuid references expenses(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, entry_reference)
);

alter table bank_connections enable row level security;
alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;

create policy "bank_connections: family crud" on bank_connections for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "bank_accounts: family crud" on bank_accounts for all
  using (exists (select 1 from bank_connections c where c.id = connection_id and c.family_id = private.current_family_id()))
  with check (exists (select 1 from bank_connections c where c.id = connection_id and c.family_id = private.current_family_id()));

create policy "bank_transactions: family crud" on bank_transactions for all
  using (
    exists (
      select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = private.current_family_id()
    )
  )
  with check (
    exists (
      select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = private.current_family_id()
    )
  );

create index idx_bank_connections_family on bank_connections(family_id);
create index idx_bank_accounts_connection on bank_accounts(connection_id);
create index idx_bank_transactions_account on bank_transactions(account_id);
