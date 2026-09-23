import { describe, expect, it } from 'vitest'

// Fase 1E.0/1E.1 — infraestructura de préstamos/hipotecas (forecast_loan_details, migración 0160).
// Mismo patrón que forecastRecurrenceDismissalsMigration.test.ts: lo que un test de dominio puro no
// puede comprobar (constraints reales, FK compuesta, cascada, RLS) se verifica leyendo el SQL real de la
// migración — el comportamiento en sí se rehearsal contra datos reales de producción antes de aplicar
// (BEGIN/ROLLBACK; ver el informe de la fase para el detalle exacto de cada caso probado: cuenta/familia
// correcta -> permitido, forecast_payment de otra familia -> rechazado por la FK compuesta, capital sin
// fecha -> rechazado, fecha sin capital -> rechazado, capital+fecha juntos -> aceptado, importe negativo
// -> rechazado, DELETE forecast_payment -> loan_detail se borra, DEACTIVATE -> loan_detail se conserva).
const FILES = import.meta.glob(['/supabase/migrations/0160_forecast_loan_details.sql', '/supabase/rollbacks/0160_forecast_loan_details_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0160_forecast_loan_details.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0160_forecast_loan_details_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')
const APP = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DATA_FORECAST = APP['/src/data/forecast.ts']
const DOMAIN_FORECAST = APP['/src/domain/forecast.ts']

describe('0160 — forecast_loan_details: esquema, integridad y RLS', () => {
  it('1) Nivel 1 es un esquema válido: forecast_payment_id/family_id son las únicas columnas NOT NULL — todo lo financiero es opcional', () => {
    expect(SQL).toContain('family_id uuid not null references families(id) on delete cascade')
    expect(SQL).toContain('forecast_payment_id uuid not null unique')
    expect(SQL).toContain("loan_type text null check (loan_type in ('hipoteca', 'prestamo_coche', 'prestamo_moto', 'prestamo_personal', 'otro'))")
    expect(SQL).toContain('outstanding_principal_cents bigint null')
    expect(SQL).toContain('interest_rate_bps integer null')
    expect(SQL).toContain('maturity_date date null')
    expect(SQL).toContain('remaining_installments integer null')
  })

  it('2) forecast_payment_id es UNIQUE — 1:1 real, nunca dos loan_details para el mismo pago previsto', () => {
    expect(SQL).toContain('forecast_payment_id uuid not null unique')
  })

  it('3/13) integridad cross-family: FK COMPUESTA (forecast_payment_id, family_id) contra forecast_payments(id, family_id) — nunca depende solo de RLS (mismo bug que 0158 evitado por diseño)', () => {
    expect(SQL).toContain('alter table forecast_payments add constraint forecast_payments_id_family_id_key unique (id, family_id)')
    expect(SQL).toContain('foreign key (forecast_payment_id, family_id) references forecast_payments (id, family_id) on delete cascade')
  })

  it('4) RLS habilitada con una policy real, SIN ningún EXISTS/subquery correlacionado — la integridad real la garantiza la FK compuesta, no una condición de texto que pueda sombrear un nombre', () => {
    expect(SQL).toContain('alter table forecast_loan_details enable row level security')
    expect(SQL).toContain('create policy "forecast_loan_details: family crud" on forecast_loan_details for all')
    const policyIdx = SQL.indexOf('create policy "forecast_loan_details: family crud"')
    const policyBody = SQL.slice(policyIdx)
    expect(policyBody).toContain('family_id = private.current_family_id()')
    expect(policyBody).toContain("private.has_section_access('dinero')")
    expect(policyBody).not.toMatch(/exists\s*\(/i)
  })

  it('7) capital pendiente sin fecha (o fecha sin capital) se rechaza — constraint bidireccional, ninguno de los dos sin el otro', () => {
    expect(SQL).toContain('constraint forecast_loan_details_principal_date_together check (')
    expect(SQL).toContain('(outstanding_principal_cents is null) = (principal_as_of_date is null)')
  })

  it('8) combinación válida capital+fecha: ambos son columnas nullable normales, sin exigir un valor concreto — el constraint solo exige que vayan JUNTOS', () => {
    expect(SQL).toContain('outstanding_principal_cents bigint null check (outstanding_principal_cents is null or outstanding_principal_cents >= 0)')
    expect(SQL).toContain('principal_as_of_date date null')
  })

  it('9) importes negativos se rechazan — original_principal_cents y outstanding_principal_cents exigen >= 0', () => {
    expect(SQL).toContain('original_principal_cents bigint null check (original_principal_cents is null or original_principal_cents >= 0)')
    expect(SQL).toContain('outstanding_principal_cents bigint null check (outstanding_principal_cents is null or outstanding_principal_cents >= 0)')
  })

  it('10) interest_rate_bps inválido se rechaza — rango 0-10000 (0%-100%), en básicos puntos, nunca decimal', () => {
    expect(SQL).toContain('interest_rate_bps integer null check (interest_rate_bps is null or (interest_rate_bps >= 0 and interest_rate_bps <= 10000))')
  })

  it('11) remaining_installments negativo se rechaza', () => {
    expect(SQL).toContain('remaining_installments integer null check (remaining_installments is null or remaining_installments >= 0)')
  })

  it('12/13) DELETE forecast_payment borra loan_detail (cascade); DEACTIVATE (UPDATE active=false) nunca dispara la cascada — solo DELETE la dispara', () => {
    expect(SQL).toContain('foreign key (forecast_payment_id, family_id) references forecast_payments (id, family_id) on delete cascade')
    // "on delete cascade" no reacciona a UPDATE — no hace falta ningún trigger/condición extra para que
    // desactivar (UPDATE active=false) conserve la fila; es el comportamiento nativo de ON DELETE CASCADE.
  })

  it('5/6) bank_reference y contract_reference son columnas independientes, ninguna se deriva de la otra en la migración', () => {
    expect(SQL).toContain('bank_reference text null')
    expect(SQL).toContain('contract_reference text null')
  })

  it('maturity_date nunca se deriva del recurrence_rule — es una columna independiente, sin default ni expresión calculada', () => {
    expect(SQL).toContain('maturity_date date null')
    expect(SQL).not.toMatch(/maturity_date[^,]*default/i)
  })

  it('no crea installment_amount ni duplica provider/currency/bank_account_id/owner_member_id — esos viven solo en forecast_payments', () => {
    expect(SQL).not.toMatch(/installment_amount/i)
    expect(SQL).not.toMatch(/\bprovider\b/i)
    expect(SQL).not.toMatch(/\bcurrency\b/i)
    expect(SQL).not.toMatch(/bank_account_id/i)
    expect(SQL).not.toMatch(/owner_member_id/i)
  })

  it('nunca SECURITY DEFINER, nunca una función que se salte la RLS — solo tabla + constraint + policy normales', () => {
    expect(SQL).not.toMatch(/security definer/i)
    expect(SQL).not.toMatch(/create (or replace )?function/i)
  })

  it('el rollback deshace exactamente la tabla y la unique añadida a forecast_payments', () => {
    expect(ROLLBACK).toContain('drop table if exists forecast_loan_details')
    expect(ROLLBACK).toContain('alter table forecast_payments drop constraint if exists forecast_payments_id_family_id_key')
  })
})

describe('data/forecast.ts — data layer de forecast_loan_details (solo infraestructura, sin UI)', () => {
  it('14) borrar loan_detail (deleteLoanDetails) nunca toca forecast_payments — el pago previsto permanece', () => {
    const idx = DATA_FORECAST.indexOf('export async function deleteLoanDetails')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).toContain(".from('forecast_loan_details')")
    expect(body).not.toContain("from('forecast_payments')")
  })

  it('el family_id nunca lo manda quien llama (mismo criterio que dismissForecastRecurrence/createForecastPayment) — createLoanDetails lo resuelve en el servidor', () => {
    const idx = DATA_FORECAST.indexOf('export async function createLoanDetails')
    const signatureLine = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf(')', idx))
    expect(signatureLine).not.toMatch(/familyId/)
    expect(DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))).toContain('currentFamilyAndUser()')
  })

  it('updateLoanDetails nunca calcula ni resta la cuota del capital pendiente — solo guarda lo que le pasan, tal cual', () => {
    const idx = DATA_FORECAST.indexOf('export async function updateLoanDetails')
    const body = DATA_FORECAST.slice(idx, DATA_FORECAST.indexOf('\n}', idx))
    expect(body).not.toMatch(/outstanding_principal_cents\s*-|amount\s*-\s*outstanding/i)
  })

  it('getLoanDetails/listLoanDetails/createLoanDetails/updateLoanDetails/deleteLoanDetails existen — API mínima, ninguna función de más (amortización, simulación, cálculo de intereses)', () => {
    expect(DATA_FORECAST).toContain('export async function getLoanDetails')
    expect(DATA_FORECAST).toContain('export async function listLoanDetails')
    expect(DATA_FORECAST).toContain('export async function createLoanDetails')
    expect(DATA_FORECAST).toContain('export async function updateLoanDetails')
    expect(DATA_FORECAST).toContain('export async function deleteLoanDetails')
    // Nunca una función DE CÁLCULO (solo comentarios explicando por qué no la hay son legítimos) —
    // comprobado por ausencia de una declaración de función con esos nombres, no de la palabra suelta.
    expect(DATA_FORECAST).not.toMatch(/function\s+\w*[Ss]imulat\w*|function\s+\w*[Aa]mortiz\w*/)
  })
})

describe('domain/forecast.ts — ForecastLoanDetails: nunca 0 como sustituto de "no lo sabemos", nunca cálculo financiero', () => {
  it('todos los campos financieros son `| null` — ninguno tiene un valor por defecto numérico', () => {
    const idx = DOMAIN_FORECAST.indexOf('export interface ForecastLoanDetails')
    const body = DOMAIN_FORECAST.slice(idx, DOMAIN_FORECAST.indexOf('\n}', idx))
    expect(body).toContain('originalPrincipalCents: number | null')
    expect(body).toContain('outstandingPrincipalCents: number | null')
    expect(body).toContain('interestRateBps: number | null')
    expect(body).toContain('remainingInstallments: number | null')
  })

  it('el dominio no define ninguna función de cálculo (amortización, TAE, intereses) — Fase 1E.0 es solo infraestructura', () => {
    expect(DOMAIN_FORECAST).not.toMatch(/function.*[Aa]mortiz|function.*calculateInterest|function.*TAE/)
  })
})
