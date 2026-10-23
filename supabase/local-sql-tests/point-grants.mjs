// Pruebas locales (PGlite, sin tocar ningún dato real) de la migración 0309: corregir y anular puntos concedidos
// por error. Parte del DDL REAL de point_grants (0229), inserta datos «antiguos» ANTES de migrar para comprobar el
// etiquetado, aplica la 0309 real y prueba cada regla en el servidor.
import assert from 'node:assert/strict'
import { setup, addAccount, addFicha, mkFamily, as, asAnon, err, read } from './harness.mjs'

let passed = 0
const failed = []
async function t(name, fn) {
  try {
    await fn()
    passed++
    console.log('  ✓', name)
  } catch (e) {
    failed.push(name)
    console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      '))
  }
}
const has = (msg, text) => assert.ok(msg && msg.includes(text), `se esperaba «${text}» y fue: ${msg}`)

const db = await setup({ onlyBase: true })

// ---- esquema previo a la 0309: point_grants tal cual la creó la 0229 + las dos tablas que lee el saldo --------------
const m229 = read('supabase/migrations/0229_pequenos_grandes_rewards_approval.sql')
const a = m229.indexOf('create table point_grants (')
const b = m229.indexOf('-- RPC — solicitar un canje')
await db.exec(`
  create table calendar_event_completions (id uuid primary key default gen_random_uuid(), member_id uuid not null, points_awarded integer not null default 0);
  create table reward_redemptions (id uuid primary key default gen_random_uuid(), family_id uuid not null, member_id uuid not null, points_spent integer not null, status text not null default 'pendiente');
`)
await db.exec(m229.slice(a, b))
await db.exec(`grant select, insert on point_grants to authenticated; grant select on calendar_event_completions, reward_redemptions to authenticated;`)

const famA = await mkFamily(db, 'A')
const famB = await mkFamily(db, 'B')
const adultA = await addAccount(db, famA, 'admin', 'Ana')
const adult2A = await addAccount(db, famA, 'adult', 'Beto')
const childA = await addAccount(db, famA, 'child', 'Nico', 'child')
const kidA = childA.member
const kid2A = await addFicha(db, famA, 'Lola', 'child')
const adultB = await addAccount(db, famB, 'admin', 'Cris')
const kidB = await addFicha(db, famB, 'Otro', 'child')

// Movimientos «antiguos»: una concesión y una reversión manual (como permitía la política anterior).
const old1 = (await db.query(`insert into point_grants (family_id, member_id, amount, reason, granted_by) values ($1,$2,5,'antigua',$3) returning id`, [famA, kidA, adultA.id])).rows[0].id
await db.query(`insert into point_grants (family_id, member_id, amount, reason, granted_by, reverses_grant_id) values ($1,$2,-5,'reversión antigua',$3,$4)`, [famA, kidA, adultA.id, old1])

console.log('\n0309 · aplicar la migración')
await db.exec(read('supabase/migrations/0309_point_grant_corrections.sql'))

const sum = async (member) => Number((await db.query('select coalesce(sum(amount),0) s from point_grants where member_id = $1', [member])).rows[0].s)
const rows = async (member) => (await db.query('select * from point_grants where member_id = $1 order by created_at, id', [member])).rows
const give = (user, member, amount, reason = null, extra = {}) =>
  as(db, user.id, () => db.query(
    `insert into point_grants (family_id, member_id, amount, reason, granted_by, kind, reverses_grant_id) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [extra.family ?? famA, member, amount, reason, user.id, extra.kind ?? 'concesion', extra.reverses ?? null]))
const adjust = (user, id, action, amount = null, reason = null) =>
  as(db, user.id, () => db.query('select * from adjust_point_grant($1,$2,$3,$4)', [id, action, amount, reason]))

await t('las filas anteriores no cambian de cantidad; la reversión antigua queda etiquetada como anulación', async () => {
  const r = await rows(kidA)
  assert.equal(r.length, 2)
  assert.equal(r[0].kind, 'concesion')
  assert.equal(r[0].amount, 5)
  assert.equal(r[1].kind, 'anulacion')
  assert.equal(r[1].amount, -5)
  assert.equal(await sum(kidA), 0)
})

console.log('\n0309 · quién puede insertar y qué')
await t('un adulto puede conceder puntos nuevos a un miembro de su familia', async () => {
  assert.equal(await err(() => give(adultA, kid2A, 10, 'ordenó la habitación')), null)
  assert.equal(await sum(kid2A), 10)
})
await t('un niño no puede conceder puntos', async () => {
  has(await err(() => give(childA, kidA, 10)), 'row-level security')
})
await t('no se puede conceder a un miembro de OTRA familia', async () => {
  has(await err(() => give(adultA, kidB, 10)), 'row-level security')
  assert.equal(await sum(kidB), 0)
})
await t('el insert directo ya no admite cantidades negativas ni cero', async () => {
  has(await err(() => give(adultA, kid2A, -3)), 'row-level security')
  has(await err(() => give(adultA, kid2A, 0)), 'row-level security')
})
await t('el insert directo ya no admite referenciar otra fila ni marcar una corrección/anulación a mano', async () => {
  const id = (await rows(kid2A))[0].id
  has(await err(() => give(adultA, kid2A, 3, null, { reverses: id })), 'row-level security')
  has(await err(() => give(adultA, kid2A, 3, null, { kind: 'correccion' })), 'row-level security')
  has(await err(() => give(adultA, kid2A, -10, null, { kind: 'anulacion', reverses: id })), 'row-level security')
  assert.equal(await sum(kid2A), 10)
})
await t('nadie puede actualizar ni borrar un movimiento (sin políticas de update/delete)', async () => {
  const id = (await rows(kid2A))[0].id
  const upd = await as(db, adultA.id, () => db.query('update point_grants set amount = 999 where id = $1 returning id', [id]).catch((e) => ({ error: e.message })))
  assert.ok(upd.error || upd.rows.length === 0)
  const del = await as(db, adultA.id, () => db.query('delete from point_grants where id = $1 returning id', [id]).catch((e) => ({ error: e.message })))
  assert.ok(del.error || del.rows.length === 0)
  assert.equal((await rows(kid2A))[0].amount, 10)
})

console.log('\n0309 · corregir la cantidad')
let g1
await t('corregir 10 → 7 inserta una fila de −3 con fecha, responsable y motivo; la original no se toca', async () => {
  g1 = (await rows(kid2A))[0].id
  const r = await adjust(adult2A, g1, 'corregir', 7, 'me equivoqué de cantidad')
  const row = r.rows[0]
  assert.equal(row.amount, -3)
  assert.equal(row.kind, 'correccion')
  assert.equal(row.reverses_grant_id, g1)
  assert.equal(row.granted_by, adult2A.id)
  assert.equal(row.reason, 'me equivoqué de cantidad')
  assert.ok(row.created_at)
  const all = await rows(kid2A)
  assert.equal(all.length, 2)
  assert.equal(all[0].amount, 10) // la concesión original intacta
  assert.equal(await sum(kid2A), 7)
})
await t('se puede volver a corregir: 7 → 12 suma +5 sobre lo vigente', async () => {
  await adjust(adultA, g1, 'corregir', 12)
  assert.equal(await sum(kid2A), 12)
  const last = (await rows(kid2A)).at(-1)
  assert.equal(last.amount, 5)
  assert.equal(last.reason, null) // motivo opcional
})
await t('cantidad igual a la vigente, cero, negativa, nula o excesiva se rechaza', async () => {
  has(await err(() => adjust(adultA, g1, 'corregir', 12)), 'no_change')
  has(await err(() => adjust(adultA, g1, 'corregir', 0)), 'invalid_amount')
  has(await err(() => adjust(adultA, g1, 'corregir', -4)), 'invalid_amount')
  has(await err(() => adjust(adultA, g1, 'corregir', null)), 'invalid_amount')
  has(await err(() => adjust(adultA, g1, 'corregir', 10001)), 'invalid_amount')
  assert.equal(await sum(kid2A), 12)
})

console.log('\n0309 · anular una concesión')
await t('anular descuenta exactamente lo vigente (12) y conserva todas las filas', async () => {
  const r = await adjust(adultA, g1, 'anular', null, 'se lo di al niño equivocado')
  assert.equal(r.rows[0].amount, -12)
  assert.equal(r.rows[0].kind, 'anulacion')
  assert.equal(await sum(kid2A), 0)
  assert.equal((await rows(kid2A)).length, 4)
})
await t('doble anulación y corregir una concesión ya anulada se rechazan (sin filas nuevas)', async () => {
  has(await err(() => adjust(adultA, g1, 'anular')), 'already_annulled')
  has(await err(() => adjust(adult2A, g1, 'corregir', 5)), 'already_annulled')
  assert.equal((await rows(kid2A)).length, 4)
  assert.equal(await sum(kid2A), 0)
})
await t('dos anulaciones simultáneas de la misma concesión nunca descuentan dos veces', async () => {
  const fresh = (await db.query(`insert into point_grants (family_id, member_id, amount, granted_by) values ($1,$2,6,$3) returning id`, [famA, kid2A, adultA.id])).rows[0].id
  const results = await Promise.all([err(() => adjust(adultA, fresh, 'anular')), err(() => adjust(adult2A, fresh, 'anular'))])
  assert.equal(results.filter((x) => x === null).length, 1)
  assert.equal(await sum(kid2A), 0)
})
await t('una reversión antigua (anulación) no se puede corregir ni anular otra vez', async () => {
  const legacyReversal = (await rows(kidA))[1].id
  has(await err(() => adjust(adultA, legacyReversal, 'anular')), 'not_a_grant')
  has(await err(() => adjust(adultA, old1, 'anular')), 'already_annulled')
})
await t('no se puede corregir una fila de corrección ni una fila que no es una concesión', async () => {
  const correction = (await rows(kid2A)).find((r) => r.kind === 'correccion').id
  has(await err(() => adjust(adultA, correction, 'anular')), 'not_a_grant')
})

console.log('\n0309 · permisos y familias')
await t('un niño no puede corregir ni anular', async () => {
  const id = (await db.query(`insert into point_grants (family_id, member_id, amount, granted_by) values ($1,$2,4,$3) returning id`, [famA, kidA, adultA.id])).rows[0].id
  has(await err(() => adjust(childA, id, 'anular')), 'not_allowed')
  has(await err(() => adjust(childA, id, 'corregir', 1)), 'not_allowed')
  assert.equal(await sum(kidA), 4)
})
await t('un adulto de otra familia recibe «no existe»: no puede tocar ni confirmar el id', async () => {
  const id = (await rows(kidA)).find((r) => r.amount === 4).id
  has(await err(() => adjust(adultB, id, 'anular')), 'grant_not_found')
  has(await err(() => adjust(adultB, '00000000-0000-0000-0000-000000000000', 'anular')), 'grant_not_found')
  assert.equal(await sum(kidA), 4)
})
await t('sin sesión no se puede ejecutar', async () => {
  const id = (await rows(kidA)).find((r) => r.amount === 4).id
  const msg = await err(() => asAnon(db, () => db.query('select * from adjust_point_grant($1,$2,null,null)', [id, 'anular'])))
  assert.ok(msg)
  assert.equal(await sum(kidA), 4)
})
await t('acción desconocida o motivo de más de 300 caracteres se rechazan', async () => {
  const id = (await rows(kidA)).find((r) => r.amount === 4).id
  has(await err(() => adjust(adultA, id, 'borrar')), 'invalid_action')
  has(await err(() => adjust(adultA, id, 'anular', null, 'x'.repeat(301))), 'reason_too_long')
})

console.log('\n0309 · saldo coherente con los canjes')
await t('no se puede anular lo que ya se gastó en un canje (el saldo quedaría negativo)', async () => {
  const k = await addFicha(db, famA, 'Gasta', 'child')
  const gid = (await db.query(`insert into point_grants (family_id, member_id, amount, granted_by) values ($1,$2,10,$3) returning id`, [famA, k, adultA.id])).rows[0].id
  await db.query(`insert into reward_redemptions (family_id, member_id, points_spent, status) values ($1,$2,8,'aprobada')`, [famA, k])
  has(await err(() => adjust(adultA, gid, 'anular')), 'would_make_balance_negative')
  has(await err(() => adjust(adultA, gid, 'corregir', 5)), 'would_make_balance_negative')
  assert.equal(await err(() => adjust(adultA, gid, 'corregir', 8)), null) // −2, el saldo queda en 0
  assert.equal(await sum(k), 8)
})
await t('un canje rechazado no bloquea; uno pendiente sí (los puntos están reservados); subir nunca se bloquea', async () => {
  const k = await addFicha(db, famA, 'Reserva', 'child')
  const gid = (await db.query(`insert into point_grants (family_id, member_id, amount, granted_by) values ($1,$2,10,$3) returning id`, [famA, k, adultA.id])).rows[0].id
  await db.query(`insert into reward_redemptions (family_id, member_id, points_spent, status) values ($1,$2,10,'rechazada')`, [famA, k])
  assert.equal(await err(() => adjust(adultA, gid, 'corregir', 20)), null)
  await db.query(`insert into reward_redemptions (family_id, member_id, points_spent, status) values ($1,$2,20,'pendiente')`, [famA, k])
  has(await err(() => adjust(adultA, gid, 'anular')), 'would_make_balance_negative')
})
await t('los puntos de Calendario cuentan en el saldo: anular una concesión es posible si el resto lo cubre', async () => {
  const k = await addFicha(db, famA, 'Calendario', 'child')
  await db.query(`insert into calendar_event_completions (member_id, points_awarded) values ($1,30)`, [k])
  const gid = (await db.query(`insert into point_grants (family_id, member_id, amount, granted_by) values ($1,$2,10,$3) returning id`, [famA, k, adultA.id])).rows[0].id
  await db.query(`insert into reward_redemptions (family_id, member_id, points_spent, status) values ($1,$2,25,'aprobada')`, [famA, k])
  assert.equal(await err(() => adjust(adultA, gid, 'anular')), null) // 30 + 10 − 25 = 15 → anular 10 deja 5
})

console.log(`\n${passed} correctas, ${failed.length} con fallos`)
if (failed.length) {
  console.log('Fallos:', failed.join(' | '))
  process.exit(1)
}
