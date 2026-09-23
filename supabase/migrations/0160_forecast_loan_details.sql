-- Fase 1E.0/1E.1 — infraestructura mínima de préstamos/hipotecas dentro de Previsión de pagos.
-- Diseño aprobado en la auditoría previa (sin código): forecast_loan_details es información adicional
-- OPCIONAL, relación 1:1, de un forecast_payment que la familia ha clasificado como préstamo — nunca una
-- entidad paralela. forecast_payments sigue siendo el ÚNICO generador de compromisos futuros; esta tabla
-- nunca participa en forecastTotals/forecastByMonth/expandForecastOccurrences.
--
-- NIVEL 1 (aprobado explícitamente): una fila con forecast_payment_id + family_id y TODO lo demás NULL
-- (incluido loan_type) ya es válida — "sabemos que es un préstamo, no sabemos más todavía". Ningún campo
-- financiero es obligatorio.
--
-- bank_reference (identificador ESTABLE observado en los cargos bancarios, p. ej. "8078183410" de
-- "PRESTAMOS ADEUDO CUOTA N.8078183410") y contract_reference (dato contractual real, p. ej.
-- "0081-8078183410", aportado por la familia) son conceptos DISTINTOS aunque a veces coincidan — nunca se
-- copia uno en el otro automáticamente.
--
-- Integridad family_id ↔ forecast_payment (corrección explícita tras el bug de RLS de
-- forecast_recurrence_dismissals en 0159): no basta con RLS. forecast_payments gana una UNIQUE(id,
-- family_id) — id ya era PK (único de por sí), así que esta unique compuesta es prácticamente gratis — y
-- forecast_loan_details referencia esa unique con una FOREIGN KEY COMPUESTA
-- (forecast_payment_id, family_id) REFERENCES forecast_payments(id, family_id). Esto hace IMPOSIBLE a
-- nivel de motor de base de datos que family_id de esta tabla diverja del family_id real del
-- forecast_payment al que apunta — nunca depende de que una policy RLS esté bien escrita (ese fue
-- exactamente el fallo de 0158). La policy de esta tabla puede entonces ser tan simple como la de
-- forecast_payments (family_id + has_section_access), sin ningún EXISTS/subquery correlacionado que
-- pueda sufrir el mismo sombreado de nombre.
alter table forecast_payments add constraint forecast_payments_id_family_id_key unique (id, family_id);

create table forecast_loan_details (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  forecast_payment_id uuid not null unique,

  loan_type text null check (loan_type in ('hipoteca', 'prestamo_coche', 'prestamo_moto', 'prestamo_personal', 'otro')),

  bank_reference text null,
  contract_reference text null,

  -- Importes en céntimos (bigint), nunca float — mismo criterio que forecastMoneyCents en todo Previsión.
  original_principal_cents bigint null check (original_principal_cents is null or original_principal_cents >= 0),
  outstanding_principal_cents bigint null check (outstanding_principal_cents is null or outstanding_principal_cents >= 0),
  -- Un capital pendiente sin fecha de referencia es un dato que caduca en silencio — obligatorios juntos
  -- en las dos direcciones (nunca uno sin el otro): "capital pendiente = 88.601,64€" sin decir de cuándo
  -- no es un dato utilizable, y una fecha sin importe tampoco aporta nada por sí sola.
  principal_as_of_date date null,
  constraint forecast_loan_details_principal_date_together check (
    (outstanding_principal_cents is null) = (principal_as_of_date is null)
  ),

  -- Básicos puntos (300 = 3,00 %) — evita el redondeo binario de un numeric(5,2) para porcentajes.
  interest_rate_bps integer null check (interest_rate_bps is null or (interest_rate_bps >= 0 and interest_rate_bps <= 10000)),
  interest_type text null check (interest_type in ('fijo', 'variable', 'mixto')),

  -- Dato contractual/confirmado — NUNCA derivado del UNTIL de forecast_payments.recurrence_rule (son
  -- conceptos distintos: uno es la previsión calculada, el otro es el vencimiento real del préstamo).
  maturity_date date null,
  remaining_installments integer null check (remaining_installments is null or remaining_installments >= 0),

  last_verified_at timestamptz null,
  notes text null,

  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- DELETE forecast_payment -> loan_detail se borra con él (información sin sentido por sí sola).
  -- Desactivar (active=false) es un UPDATE, nunca dispara esta cascada -> el detalle se conserva.
  foreign key (forecast_payment_id, family_id) references forecast_payments (id, family_id) on delete cascade
);

create index forecast_loan_details_family_idx on forecast_loan_details(family_id);

alter table forecast_loan_details enable row level security;

-- Misma policy exacta que forecast_payments (nunca un EXISTS/subquery correlacionado que pueda repetir
-- el bug de 0158): la integridad real de family_id la garantiza la FK compuesta de arriba, no esta policy.
create policy "forecast_loan_details: family crud" on forecast_loan_details for all
  using (family_id = private.current_family_id() and private.has_section_access('dinero'))
  with check (family_id = private.current_family_id() and private.has_section_access('dinero'));
