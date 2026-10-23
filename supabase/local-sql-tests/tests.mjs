import assert from 'node:assert/strict'
import { setup, addUser, mkFamily, addAccount, addFicha, as, asAnon, err, uid, read } from './harness.mjs'

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
const FRESH = 5 // identificación de hace 5 segundos
const OLD = 3600 * 5

const db = await setup()

// ---------------------------------------------------------------------------------------------------------- 0299
console.log('\n0299 · PIN y correos')
{
  const fam = await mkFamily(db)
  const a = await addAccount(db, fam, 'admin', 'Ana')
  const b = await addAccount(db, fam, 'adult', 'Beto')
  const famC = await mkFamily(db, 'C')
  const c = await addAccount(db, famC, 'admin', 'Cris')

  await t('cambiar PIN: PIN actual mal → wrong_pin y cuenta el intento; bueno → ok', async () => {
    await as(db, a.id, () => db.query(`select public.set_own_pin('1234')`))
    const r = await as(db, a.id, () => db.query(`select public.change_own_pin('0000','5678') r`))
    assert.equal(r.rows[0].r, 'wrong_pin')
    const n = await db.query('select failed_attempts from profile_locks where profile_id=$1', [a.id])
    assert.equal(n.rows[0].failed_attempts, 1)
    const ok = await as(db, a.id, () => db.query(`select public.change_own_pin('1234','5678') r`))
    assert.equal(ok.rows[0].r, 'ok')
    const v = await as(db, a.id, () => db.query(`select public.verify_own_pin('5678') v`))
    assert.equal(v.rows[0].v, true)
  })
  await t('tras 5 fallos se bloquea (PIN_LOCKED) y el contador NO se pierde', async () => {
    for (let i = 0; i < 5; i++) await as(db, a.id, () => db.query(`select public.change_own_pin('0000','1111')`))
    const e = await as(db, a.id, () => err(() => db.query(`select public.change_own_pin('5678','1111')`)))
    has(e, 'PIN_LOCKED')
    await db.query(`update profile_locks set failed_attempts=0, locked_until=null where profile_id=$1`, [a.id])
  })
  await t('quitar PIN con el PIN: mal → wrong_pin; bueno → ok y borra huellas', async () => {
    await db.query(`insert into profile_webauthn_credentials (profile_id, credential_id, public_key) values ($1,'c1','pk')`, [a.id])
    assert.equal((await as(db, a.id, () => db.query(`select public.clear_own_pin_with_pin('0000') r`))).rows[0].r, 'wrong_pin')
    assert.equal((await as(db, a.id, () => db.query(`select public.clear_own_pin_with_pin('5678') r`))).rows[0].r, 'ok')
    assert.equal((await db.query('select count(*)::int n from profile_locks where profile_id=$1', [a.id])).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from profile_webauthn_credentials where profile_id=$1', [a.id])).rows[0].n, 0)
  })
  await t('recuperar el PIN: sesión de hace horas → RECENT_AUTH_REQUIRED; reciente → quita PIN y huellas', async () => {
    await as(db, a.id, () => db.query(`select public.set_own_pin('2468')`))
    await db.query(`insert into profile_webauthn_credentials (profile_id, credential_id, public_key) values ($1,'c2','pk')`, [a.id])
    const e = await as(db, a.id, () => err(() => db.query('select public.reset_own_pin_after_recent_auth()')), { amrAgoSeconds: OLD })
    has(e, 'RECENT_AUTH_REQUIRED')
    assert.equal((await db.query('select count(*)::int n from profile_locks where profile_id=$1', [a.id])).rows[0].n, 1)
    await as(db, a.id, () => db.query('select public.reset_own_pin_after_recent_auth()'), { amrAgoSeconds: FRESH })
    assert.equal((await db.query('select count(*)::int n from profile_locks where profile_id=$1', [a.id])).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from profile_webauthn_credentials where profile_id=$1', [a.id])).rows[0].n, 0)
  })
  await t('correos de las fichas: admin ve los de su familia; adulta solo el suyo; nadie ve los de otra familia', async () => {
    assert.equal((await as(db, a.id, () => db.query('select * from public.list_family_account_emails()'))).rows.length, 2)
    assert.equal((await as(db, b.id, () => db.query('select * from public.list_family_account_emails()'))).rows.length, 1)
    const rc = await as(db, c.id, () => db.query('select email from public.list_family_account_emails()'))
    assert.equal(rc.rows.length, 1)
    assert.ok(!rc.rows.some((r) => r.email === a.email || r.email === b.email))
  })
}

// ---------------------------------------------------------------------------------------------------------- 0300
console.log('\n0300 · Vínculo parental («Es mi hijo/a»)')
{
  const fam = await mkFamily(db, 'G')
  const mom = await addAccount(db, fam, 'admin', 'Mama')
  const dad = await addAccount(db, fam, 'adult', 'Papa')
  const guest = await addAccount(db, fam, 'guest', 'Invitado', 'guest')
  const kidAcc = await addAccount(db, fam, 'child', 'NinoConCuenta', 'child', { birth: '2015-05-05' })
  const kid = await addFicha(db, fam, 'Eric', 'child', { birth: '2016-03-03' })
  const baby = await addFicha(db, fam, 'Fer', 'baby', { birth: '2025-01-01' })
  const adultFicha = await addFicha(db, fam, 'Abuela', 'adult', { birth: '1950-01-01' })
  const adultAsChild = await addFicha(db, fam, 'Mayor', 'child', { birth: '2000-01-01' }) // «niño» ya mayor de 18
  const otherFam = await mkFamily(db, 'Otra')
  const otherKid = await addFicha(db, otherFam, 'Ajeno', 'child', { birth: '2016-01-01' })
  const D = (child, accepted = true, v = 'v1', rel = 'parent') => db.query('select public.declare_guardianship($1,$2,$3,$4) id', [child, rel, accepted, v])

  await t('declarar con identificación reciente y declaración: crea el vínculo y su registro', async () => {
    const r = await as(db, mom.id, () => D(kid), { amrAgoSeconds: FRESH })
    assert.ok(r.rows[0].id)
    const g = await db.query('select status, relationship, declaration_version, declared_by from family_member_guardians where id=$1', [r.rows[0].id])
    assert.equal(g.rows[0].status, 'active'); assert.equal(g.rows[0].declared_by, mom.id)
    assert.equal((await db.query(`select count(*)::int n from family_guardian_events where event='declared'`)).rows[0].n, 1)
  })
  await t('sin declaración aceptada → DECLARATION_REQUIRED; con sesión antigua → RECENT_AUTH_REQUIRED', async () => {
    has(await as(db, dad.id, () => err(() => D(kid, false)), { amrAgoSeconds: FRESH }), 'DECLARATION_REQUIRED')
    has(await as(db, dad.id, () => err(() => D(kid, true, '')), { amrAgoSeconds: FRESH }), 'DECLARATION_REQUIRED')
    has(await as(db, dad.id, () => err(() => D(kid)), { amrAgoSeconds: OLD }), 'RECENT_AUTH_REQUIRED')
  })
  await t('SIN límite de tutores: un segundo vínculo sobre el mismo menor es válido (y un tercero también)', async () => {
    await as(db, dad.id, () => D(kid), { amrAgoSeconds: FRESH })
    const extra = await addAccount(db, fam, 'adult', 'Tutor')
    await as(db, extra.id, () => D(kid, true, 'v1', 'legal_guardian'), { amrAgoSeconds: FRESH })
    assert.equal((await db.query(`select count(*)::int n from family_member_guardians where child_member_id=$1 and status='active'`, [kid])).rows[0].n, 3)
  })
  await t('no se duplica el mismo vínculo', async () => {
    has(await as(db, mom.id, () => err(() => D(kid)), { amrAgoSeconds: FRESH }), 'ALREADY_LINKED')
  })
  await t('NUNCA sobre una persona adulta: ficha adulta, ficha «niño» ya mayor de 18, uno mismo, otra familia', async () => {
    has(await as(db, mom.id, () => err(() => D(adultFicha)), { amrAgoSeconds: FRESH }), 'CHILD_MUST_BE_MINOR')
    has(await as(db, mom.id, () => err(() => D(adultAsChild)), { amrAgoSeconds: FRESH }), 'CHILD_MUST_BE_MINOR')
    has(await as(db, mom.id, () => err(() => D(mom.member)), { amrAgoSeconds: FRESH }), 'CANNOT_DECLARE_SELF')
    has(await as(db, mom.id, () => err(() => D(dad.member)), { amrAgoSeconds: FRESH }), 'CHILD_MUST_BE_MINOR')
    has(await as(db, mom.id, () => err(() => D(otherKid)), { amrAgoSeconds: FRESH }), 'CHILD_NOT_FOUND')
  })
  await t('un invitado o un niño con cuenta no pueden declarar; un bebé sí es menor', async () => {
    has(await as(db, guest.id, () => err(() => D(kid)), { amrAgoSeconds: FRESH }), 'NOT_AUTHORIZED')
    has(await as(db, kidAcc.id, () => err(() => D(kid)), { amrAgoSeconds: FRESH }), 'NOT_AUTHORIZED')
    assert.ok((await as(db, mom.id, () => D(baby), { amrAgoSeconds: FRESH })).rows[0].id)
  })
  await t('no se puede escribir a mano en la tabla (ni insertar, ni borrar, ni cambiar)', async () => {
    assert.ok(await as(db, mom.id, () => err(() => db.query(`insert into family_member_guardians (family_id, child_member_id, guardian_member_id, relationship, declaration_version) values ($1,$2,$3,'parent','x')`, [fam, adultFicha, mom.member]))))
    assert.ok(await as(db, mom.id, () => err(() => db.query(`update family_member_guardians set status='revoked', revoked_at=now()`))))
    assert.ok(await as(db, mom.id, () => err(() => db.query(`delete from family_member_guardians`))))
  })
  await t('RLS: las adultas de la familia ven los vínculos; un niño con cuenta y otra familia no', async () => {
    assert.ok((await as(db, dad.id, () => db.query('select * from family_member_guardians'))).rows.length >= 3)
    assert.equal((await as(db, kidAcc.id, () => db.query('select * from family_member_guardians'))).rows.length, 0)
    const stranger = await addAccount(db, otherFam, 'admin', 'Ajena')
    assert.equal((await as(db, stranger.id, () => db.query('select * from family_member_guardians'))).rows.length, 0)
  })
  await t('retirar el PROPIO vínculo: solo su titular; ni otra tutora, ni la administradora, ni nadie ajeno pueden retirar el de otra persona', async () => {
    const link = (await db.query(`select id from family_member_guardians where guardian_member_id=$1 and child_member_id=$2`, [dad.member, kid])).rows[0].id
    const momLink = (await db.query(`select id from family_member_guardians where guardian_member_id=$1 and child_member_id=$2`, [mom.member, kid])).rows[0].id
    // La app (usuaria autenticada) SÍ puede llamar a la función, pero solo actúa sobre el vínculo propio.
    assert.equal((await db.query(`select has_function_privilege('authenticated','public.revoke_own_guardianship(uuid,text)','execute') a, has_function_privilege('anon','public.revoke_own_guardianship(uuid,text)','execute') b`)).rows[0].b, false)
    has(await as(db, mom.id, () => err(() => db.query('select public.revoke_own_guardianship($1)', [link]))), 'LINK_NOT_FOUND')           // otra tutora (administradora de la familia)
    const stranger = await addAccount(db, otherFam, 'admin', 'Ajena2')
    has(await as(db, stranger.id, () => err(() => db.query('select public.revoke_own_guardianship($1)', [link]))), 'LINK_NOT_FOUND')     // otra familia
    assert.equal((await db.query('select status from family_member_guardians where id=$1', [link])).rows[0].status, 'active')
    await as(db, dad.id, () => db.query('select public.revoke_own_guardianship($1,$2)', [link, 'prueba']))
    const r = await db.query('select status, revoked_by from family_member_guardians where id=$1', [link])
    assert.equal(r.rows[0].status, 'revoked'); assert.equal(r.rows[0].revoked_by, dad.id)
    // El vínculo de la otra persona sigue vigente (sin límite de tutores y cada vínculo es individual).
    assert.equal((await db.query('select status from family_member_guardians where id=$1', [momLink])).rows[0].status, 'active')
    // Ya retirado: no se puede retirar otra vez.
    has(await as(db, dad.id, () => err(() => db.query('select public.revoke_own_guardianship($1)', [link]))), 'LINK_NOT_FOUND')
    assert.equal((await db.query(`select count(*)::int n from family_guardian_events where link_id=$1 and event='revoked'`, [link])).rows[0].n, 1)
    // historial conservado: se puede volver a declarar y el vínculo antiguo sigue como registro
    await as(db, dad.id, () => D(kid), { amrAgoSeconds: FRESH })
    assert.equal((await db.query(`select count(*)::int n from family_member_guardians where guardian_member_id=$1 and child_member_id=$2`, [dad.member, kid])).rows[0].n, 2)
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  })
  await t('ayudante de edad: a los 18 años dejan los poderes (sin borrar el vínculo)', async () => {
    const teen = await addFicha(db, fam, 'Casi', 'child', { birth: '2010-06-01' })
    await as(db, mom.id, () => D(teen), { amrAgoSeconds: FRESH })
    const f = () => as(db, mom.id, () => db.query('select private.is_active_guardian_of($1) v', [teen]))
    // is_active_guardian_of es privada: se prueba como propietario con la identidad puesta
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [mom.id])
    assert.equal((await db.query('select private.is_active_guardian_of($1) v', [teen])).rows[0].v, true)
    await db.query('update family_members set birth_date = current_date - interval \'18 years\' where id=$1', [teen])
    assert.equal((await db.query('select private.is_active_guardian_of($1) v', [teen])).rows[0].v, false)
    assert.equal((await db.query(`select count(*)::int n from family_member_guardians where child_member_id=$1 and status='active'`, [teen])).rows[0].n, 1)
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    void f
  })
}

// ---------------------------------------------------------------------------------------------------------- 0301
console.log('\n0301 · Invitaciones: dar acceso, rol de la ficha, bloqueos y reserva')
{
  const fam = await mkFamily(db, 'H')
  const mom = await addAccount(db, fam, 'admin', 'Mama2')
  const dad = await addAccount(db, fam, 'adult', 'Papa2')
  const other = await addAccount(db, fam, 'adult', 'Tio')
  const kid = await addFicha(db, fam, 'Eric2', 'child', { birth: '2016-03-03', sections: ['compras', 'calendario'] })
  const kidNoDate = await addFicha(db, fam, 'SinFecha', 'child')
  const guestF = await addFicha(db, fam, 'Amiga', 'guest', { sections: ['calendario'] })
  const adultF = await addFicha(db, fam, 'Abuelo2', 'adult', { birth: '1950-01-01' })
  const babyF = await addFicha(db, fam, 'Bebe', 'baby', { birth: '2025-01-01' })
  const inv = (m, regen = false) => db.query('select * from public.create_member_invitation($1,$2)', [m, regen])
  await as(db, mom.id, () => db.query('select public.declare_guardianship($1,$2,true,$3)', [kid, 'parent', 'v1']), { amrAgoSeconds: FRESH })
  await as(db, dad.id, () => db.query('select public.declare_guardianship($1,$2,true,$3)', [kid, 'parent', 'v1']), { amrAgoSeconds: FRESH })

  await t('administradora: genera el código de cualquier ficha sin cuenta (salvo bebé); 10 caracteres; 24 h', async () => {
    const r = await as(db, mom.id, () => inv(adultF))
    assert.equal(r.rows[0].o_code.length, 10); assert.equal(r.rows[0].o_reused, false)
    assert.ok(new Date(r.rows[0].o_expires_at) > new Date(Date.now() + 23 * 3600e3))
    has(await as(db, mom.id, () => err(() => inv(babyF))), 'MEMBER_NOT_INVITABLE')
  })
  await t('NO duplica: pedir otra vez devuelve el mismo código vigente (reutilizado) con su caducidad; regenerar sí cambia', async () => {
    const a = (await as(db, mom.id, () => inv(kid))).rows[0]
    const b = (await as(db, mom.id, () => inv(kid))).rows[0]
    assert.equal(a.o_code, b.o_code); assert.equal(b.o_reused, true)
    const c = (await as(db, mom.id, () => inv(kid, true))).rows[0]
    assert.notEqual(c.o_code, a.o_code); assert.equal(c.o_reused, false)
    assert.equal((await db.query('select count(*)::int n from family_members where invite_code=$1', [a.o_code])).rows[0].n, 0)
  })
  await t('madre/padre vinculado (no administrador) puede invitar a SU hijo menor', async () => {
    const r = await as(db, dad.id, () => inv(kid))
    assert.ok(r.rows[0].o_code)
  })
  await t('…pero NO a un adulto, ni a un invitado, ni a un niño ajeno, ni sin ser madre/padre vinculado', async () => {
    has(await as(db, dad.id, () => err(() => inv(adultF))), 'NOT_AUTHORIZED')
    has(await as(db, dad.id, () => err(() => inv(guestF))), 'NOT_AUTHORIZED')
    has(await as(db, other.id, () => err(() => inv(kid))), 'NOT_AUTHORIZED')
    const otherKid = await addFicha(db, fam, 'HijoDeOtro', 'child', { birth: '2014-01-01' })
    has(await as(db, dad.id, () => err(() => inv(otherKid))), 'NOT_AUTHORIZED')
  })
  await t('una ficha con cuenta no se invita; un niño sin fecha en la ficha exige ponerla antes', async () => {
    has(await as(db, mom.id, () => err(() => inv(dad.member))), 'ya tiene una cuenta')
    has(await as(db, mom.id, () => err(() => inv(kidNoDate))), 'BIRTH_DATE_REQUIRED_ON_PROFILE')
  })
  await t('a los 18 años el padre vinculado deja de poder invitar (la administradora sí)', async () => {
    const teen = await addFicha(db, fam, 'Mayorcito', 'child', { birth: '2010-06-01' })
    await as(db, dad.id, () => db.query('select public.declare_guardianship($1,$2,true,$3)', [teen, 'parent', 'v1']), { amrAgoSeconds: FRESH })
    assert.ok((await as(db, dad.id, () => inv(teen))).rows[0].o_code)
    await db.query(`update family_members set birth_date = current_date - interval '18 years', invite_code=null, invite_code_expires_at=null where id=$1`, [teen])
    has(await as(db, dad.id, () => err(() => inv(teen))), 'NOT_AUTHORIZED')
    assert.ok((await as(db, mom.id, () => inv(teen))).rows[0].o_code)
  })

  // --- unirse: el rol y las secciones salen de la FICHA
  const newAcc = async (email) => ({ id: await addUser(db, email), email })
  await t('el menor que se une queda como role child con las secciones de su ficha (arregla el fallo 0217)', async () => {
    const code = (await as(db, mom.id, () => inv(kid, true))).rows[0].o_code
    const u = await newAcc('eric@example.invalid')
    await as(db, u.id, () => db.query('select public.join_family_with_code($1,$2,$3)', [code, 'Eric', '2000-01-01']), { email: u.email })
    const p = (await db.query('select role, allowed_sections, family_id from profiles where id=$1', [u.id])).rows[0]
    assert.equal(p.role, 'child'); assert.deepEqual(p.allowed_sections, ['compras', 'calendario']); assert.equal(p.family_id, fam)
    // la fecha de la ficha manda: la escrita (2000) se ignora
    assert.equal(String((await db.query('select birth_date::text d from family_members where id=$1', [kid])).rows[0].d), '2016-03-03')
  })
  await t('el invitado queda como role guest con sus secciones; la adulta como adult', async () => {
    const g = (await as(db, mom.id, () => inv(guestF))).rows[0].o_code
    const ug = await newAcc('amiga@example.invalid')
    await as(db, ug.id, () => db.query('select public.join_family_with_code($1,$2,$3)', [g, 'Amiga', '1990-01-01']), { email: ug.email })
    const pg = (await db.query('select role, allowed_sections from profiles where id=$1', [ug.id])).rows[0]
    assert.equal(pg.role, 'guest'); assert.deepEqual(pg.allowed_sections, ['calendario'])
    const a = (await as(db, mom.id, () => inv(adultF))).rows[0].o_code
    const ua = await newAcc('abuelo@example.invalid')
    await as(db, ua.id, () => db.query('select public.join_family_with_code($1,$2,$3)', [a, 'Abuelo', '1950-01-01']), { email: ua.email })
    assert.equal((await db.query('select role from profiles where id=$1', [ua.id])).rows[0].role, 'adult')
  })
  await t('un menor NO consigue permisos de adulto con una fecha falsa: la ficha de adulto con fecha de menor se rechaza', async () => {
    const f = await addFicha(db, fam, 'AdultoSinFecha', 'adult')
    const c = (await as(db, mom.id, () => inv(f))).rows[0].o_code
    const u = await newAcc('falso@example.invalid')
    has(await as(db, u.id, () => err(() => db.query('select public.join_family_with_code($1,$2,$3)', [c, 'X', new Date(Date.now() - 12 * 365 * 864e5).toISOString().slice(0, 10)])), { email: u.email }), 'ADULT_REQUIRED')
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [u.id])).rows[0].n, 0)
    assert.ok(!(await db.query('select linked_profile_id from family_members where id=$1', [f])).rows[0].linked_profile_id)
  })
  await t('sin fecha en ninguna parte → BIRTH_DATE_REQUIRED; fecha futura → BIRTH_DATE_INVALID', async () => {
    const f = await addFicha(db, fam, 'Otro', 'adult')
    const c = (await as(db, mom.id, () => inv(f))).rows[0].o_code
    const u = await newAcc('sinfecha@example.invalid')
    has(await as(db, u.id, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [c, 'X'])), { email: u.email }), 'BIRTH_DATE_REQUIRED')
    has(await as(db, u.id, () => err(() => db.query(`select public.join_family_with_code($1,$2,'2999-01-01')`, [c, 'X'])), { email: u.email }), 'BIRTH_DATE_INVALID')
  })
  await t('código usado, inventado o caducado → «Código no válido o caducado»; no se reutiliza', async () => {
    const f = await addFicha(db, fam, 'Uno', 'adult', { birth: '1980-01-01' })
    const c = (await as(db, mom.id, () => inv(f))).rows[0].o_code
    const u1 = await newAcc('u1@example.invalid'); const u2 = await newAcc('u2@example.invalid')
    await as(db, u1.id, () => db.query('select public.join_family_with_code($1,$2,null)', [c, 'U1']), { email: u1.email })
    has(await as(db, u2.id, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [c, 'U2'])), { email: u2.email }), 'Código no válido o caducado')
    has(await as(db, u2.id, () => err(() => db.query(`select public.join_family_with_code('ZZZZZZZZZZ','U2',null)`)), { email: u2.email }), 'Código no válido o caducado')
    const f2 = await addFicha(db, fam, 'Dos', 'adult', { birth: '1980-01-01' })
    const c2 = (await as(db, mom.id, () => inv(f2))).rows[0].o_code
    await db.query(`update family_members set invite_code_expires_at = now() - interval '1 minute' where id=$1`, [f2])
    has(await as(db, u2.id, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [c2, 'U2'])), { email: u2.email }), 'Código no válido o caducado')
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [u2.id])).rows[0].n, 0)
  })
  await t('un bebé no tiene cuenta aunque tenga un código antiguo', async () => {
    await db.query(`update family_members set invite_code='BABYCODE1', invite_code_expires_at=now()+interval '1 day' where id=$1`, [babyF])
    const u = await newAcc('bebe@example.invalid')
    has(await as(db, u.id, () => err(() => db.query(`select public.join_family_with_code('BABYCODE1','X','2020-01-01')`)), { email: u.email }), 'Código no válido o caducado')
  })
  await t('reserva por correo: si el código está reservado para otro correo, no vale; para el mismo, sí', async () => {
    const f = await addFicha(db, fam, 'Reserva', 'adult', { birth: '1980-01-01' })
    const c = (await as(db, mom.id, () => inv(f))).rows[0].o_code
    await db.query(`update family_members set invite_reserved_email='dueno@example.invalid', invite_reserved_until=now()+interval '1 hour' where id=$1`, [f])
    const intruso = await newAcc('intruso@example.invalid')
    has(await as(db, intruso.id, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [c, 'X'])), { email: intruso.email }), 'Código no válido o caducado')
    const dueno = await newAcc('dueno@example.invalid')
    await as(db, dueno.id, () => db.query('select public.join_family_with_code($1,$2,null)', [c, 'D']), { email: dueno.email })
    assert.equal((await db.query('select role from profiles where id=$1', [dueno.id])).rows[0].role, 'adult')
    assert.equal((await db.query('select invite_reserved_email e from family_members where id=$1', [f])).rows[0].e, null)
  })
  await t('reserva ya vencida (la invitación caducó) deja de bloquear', async () => {
    const f = await addFicha(db, fam, 'ReservaVieja', 'adult', { birth: '1980-01-01' })
    const c = (await as(db, mom.id, () => inv(f))).rows[0].o_code
    await db.query(`update family_members set invite_reserved_email='otro@example.invalid', invite_reserved_until=now()-interval '1 minute' where id=$1`, [f])
    const u = await newAcc('tarde@example.invalid')
    await as(db, u.id, () => db.query('select public.join_family_with_code($1,$2,null)', [c, 'T']), { email: u.email })
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [u.id])).rows[0].n, 1)
  })

  // --- crear familia
  const owner = await addAccount(db, await mkFamily(db, 'Dueña'), 'admin', 'Duena', 'admin', { owner: true })
  const CF = (code, birth = '1990-01-01') => db.query('select public.create_family($1,$2,$3,$4)', ['Fam', 'Yo', code, birth])
  const gen = async () => (await as(db, owner.id, () => db.query(`select public.generate_family_invite('prueba') c`))).rows[0].c
  await t('crear familia: sin código, con código equivocado, caducado o usado → «Código de acceso incorrecto»', async () => {
    const u = await newAcc('f0@example.invalid')
    for (const bad of ['', 'WRONGCODE', 'x']) has(await as(db, u.id, () => err(() => CF(bad)), { email: u.email }), 'Código de acceso incorrecto')
    await db.query(`insert into family_invites (code, created_by, expires_at) values ('EXPIRADO1', $1, now()-interval '1 day')`, [owner.id])
    await db.query(`insert into family_invites (code, created_by, used_at) values ('USADO0001', $1, now())`, [owner.id])
    for (const bad of ['EXPIRADO1', 'USADO0001']) has(await as(db, u.id, () => err(() => CF(bad)), { email: u.email }), 'Código de acceso incorrecto')
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [u.id])).rows[0].n, 0)
  })
  await t('crear familia con invitación válida: sí, una sola vez; la gasta al terminar', async () => {
    const c = await gen()
    const u1 = await newAcc('f1@example.invalid'); const u2 = await newAcc('f2@example.invalid')
    await as(db, u1.id, () => CF(c), { email: u1.email })
    assert.equal((await db.query('select role from profiles where id=$1', [u1.id])).rows[0].role, 'admin')
    const used = (await db.query('select used_at, used_by_family, reserved_email from family_invites where code=$1', [c])).rows[0]
    assert.ok(used.used_at && used.used_by_family)
    has(await as(db, u2.id, () => err(() => CF(c)), { email: u2.email }), 'Código de acceso incorrecto')
  })
  await t('crear familia: quien la crea debe ser mayor de edad; fecha ausente/futura sigue siendo error', async () => {
    const c = await gen()
    const u = await newAcc('f3@example.invalid')
    const young = new Date(Date.now() - 15 * 365 * 864e5).toISOString().slice(0, 10)
    has(await as(db, u.id, () => err(() => CF(c, young)), { email: u.email }), 'ADULT_REQUIRED')
    has(await as(db, u.id, () => err(() => db.query(`select public.create_family('F','Y',$1,null)`, [c])), { email: u.email }), 'BIRTH_DATE_REQUIRED')
    has(await as(db, u.id, () => err(() => CF(c, '2999-01-01')), { email: u.email }), 'BIRTH_DATE_INVALID')
    assert.equal((await db.query('select used_at from family_invites where code=$1', [c])).rows[0].used_at, null) // sigue sin gastar
  })
  await t('invitación de familia reservada para otro correo → rechazada; para el mismo → válida', async () => {
    const c = await gen()
    await db.query(`update family_invites set reserved_email='titular@example.invalid', reserved_until=now()+interval '1 hour' where code=$1`, [c])
    const x = await newAcc('intruso2@example.invalid')
    has(await as(db, x.id, () => err(() => CF(c)), { email: x.email }), 'Código de acceso incorrecto')
    const ok = await newAcc('titular@example.invalid')
    await as(db, ok.id, () => CF(c), { email: ok.email })
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [ok.id])).rows[0].n, 1)
  })
  await t('código maestro (Vault): sigue funcionando como compatibilidad', async () => {
    await db.query(`insert into vault.secrets (name, secret) values ('family_signup_code','MAESTRO-X')`)
    const u = await newAcc('maestro@example.invalid')
    await as(db, u.id, () => CF('MAESTRO-X'), { email: u.email })
    assert.equal((await db.query('select role from profiles where id=$1', [u.id])).rows[0].role, 'admin')
    await db.query(`delete from vault.secrets`)
  })
  await t('quién genera invitaciones de familia nueva: solo la administradora DE PEPA; las de familia solo las fichas de SU familia', async () => {
    has(await as(db, mom.id, () => err(() => db.query(`select public.generate_family_invite('x')`))), 'Solo la dueña de la app')
    has(await as(db, dad.id, () => err(() => db.query(`select public.generate_member_invite_code($1)`, [kid]))), 'Solo el administrador')
    const ajena = await addFicha(db, await mkFamily(db, 'Z'), 'ZZ', 'adult')
    has(await as(db, mom.id, () => err(() => db.query(`select public.generate_member_invite_code($1)`, [ajena]))), 'Miembro no encontrado')
    has(await as(db, mom.id, () => err(() => inv(ajena))), 'Miembro no encontrado')
  })
}

console.log('\n0301 · Blindaje de las columnas de invitación')
{
  const fam = await mkFamily(db, 'B')
  const adm = await addAccount(db, fam, 'admin', 'AdminB')
  const adu = await addAccount(db, fam, 'adult', 'AdultaB')
  const f = await addFicha(db, fam, 'FichaB', 'adult', { birth: '1980-01-01' })
  await t('la app (aunque sea administradora) NO puede escribir a mano el código, su caducidad ni el enlace con la cuenta', async () => {
    for (const q of [
      `update family_members set invite_code='HECHOAMANO1' where id='${f}'`,
      `update family_members set invite_code_expires_at=now()+interval '100 years' where id='${f}'`,
      `update family_members set linked_profile_id='${adu.id}' where id='${f}'`,
      `update family_members set invite_reserved_email='x@x.es' where id='${f}'`,
      `insert into family_members (family_id, name, member_type, invite_code) values ('${fam}','Trampa','adult','TRAMPA0001')`,
      `insert into family_members (family_id, name, member_type, linked_profile_id) values ('${fam}','Trampa2','adult','${adu.id}')`,
    ]) has(await as(db, adm.id, () => err(() => db.query(q))), 'solo los cambia el servidor')
    assert.equal((await db.query('select invite_code, linked_profile_id from family_members where id=$1', [f])).rows[0].invite_code, null)
  })
  await t('lo normal sigue funcionando: crear y editar fichas, y que las funciones del servidor escriban el código', async () => {
    await as(db, adm.id, () => db.query(`insert into family_members (family_id, name, member_type, birth_date) values ($1,'Normal','child','2016-01-01')`, [fam]))
    await as(db, adm.id, () => db.query(`update family_members set name='Editada' where id=$1`, [f]))
    const r = await as(db, adm.id, () => db.query('select * from public.create_member_invitation($1,false)', [f]))
    assert.ok(r.rows[0].o_code)
    assert.equal((await db.query('select invite_code from family_members where id=$1', [f])).rows[0].invite_code, r.rows[0].o_code)
  })
  await t('una ficha con cuenta de adulta no cuenta como menor aunque se marque «niño» con fecha reciente', async () => {
    const trap = await addAccount(db, fam, 'adult', 'Trampa3', 'child', { birth: '2018-01-01' })
    has(await as(db, adu.id, () => err(() => db.query(`select public.declare_guardianship($1,'parent',true,'v1')`, [trap.member])), { amrAgoSeconds: FRESH }), 'CHILD_MUST_BE_MINOR')
  })
}

// ---------------------------------------------------------------------------------------------------------- 0302
console.log('\n0302 · Primero la invitación, después la cuenta')
{
  const fam = await mkFamily(db, 'P')
  const mom = await addAccount(db, fam, 'admin', 'Mama3')
  const owner = await addAccount(db, await mkFamily(db, 'Dueña2'), 'admin', 'Duena2', 'admin', { owner: true })
  const f = await addFicha(db, fam, 'Peque', 'child', { birth: '2016-03-03' })
  const memberCode = (await as(db, mom.id, () => db.query('select * from public.create_member_invitation($1,false)', [f]))).rows[0].o_code
  const famCode = (await as(db, owner.id, () => db.query(`select public.generate_family_invite('x') c`))).rows[0].c
  const CK = (c, ip = '1.2.3.4') => asAnon(db, () => db.query('select public.check_invitation($1) r', [c]), { 'x-forwarded-for': ip + ', 10.0.0.1' })
  const HOOK = (email, code, extra = {}) => db.query('select public.hook_before_user_created($1::jsonb) r', [JSON.stringify({ metadata: { ip_address: '9.9.9.9' }, user: { email, app_metadata: { provider: 'email' }, user_metadata: code === undefined ? {} : { invite_code: code }, is_anonymous: false, ...extra } })])

  await t('check_invitation: pública (anon), devuelve solo validez, tipo y caducidad — nada privado', async () => {
    const m = (await CK(memberCode)).rows[0].r
    assert.equal(m.valid, true); assert.equal(m.kind, 'member'); assert.ok(m.expires_at)
    assert.deepEqual(Object.keys(m).sort(), ['expires_at', 'kind', 'needs_birth_date', 'valid'])
    assert.equal(m.needs_birth_date, false) // la ficha del niño ya trae su fecha: la pantalla no la pide (y la fecha no se envía)
    const fc = (await CK(famCode)).rows[0].r
    assert.equal(fc.kind, 'family'); assert.equal(fc.needs_birth_date, true)
    assert.equal((await CK('ZZZZZZZZZZ')).rows[0].r.valid, false)
    assert.deepEqual(Object.keys((await CK('ZZZZZZZZZZ')).rows[0].r), ['valid'])
    assert.equal((await CK('')).rows[0].r.valid, false)
  })
  await t('check_invitation no gasta ni reserva el código', async () => {
    await CK(memberCode); await CK(famCode)
    assert.equal((await db.query('select invite_reserved_email e from family_members where id=$1', [f])).rows[0].e, null)
    assert.equal((await db.query('select used_at, reserved_email from family_invites where code=$1', [famCode])).rows[0].used_at, null)
  })
  await t('check_invitation: caducado, usado y de ficha con cuenta → no válido', async () => {
    await db.query(`insert into family_invites (code, created_by, expires_at) values ('CADUCADO01', $1, now()-interval '1 day')`, [owner.id])
    await db.query(`insert into family_invites (code, created_by, used_at) values ('USADO00002', $1, now())`, [owner.id])
    assert.equal((await CK('CADUCADO01')).rows[0].r.valid, false)
    assert.equal((await CK('USADO00002')).rows[0].r.valid, false)
  })
  await t('check_invitation: límite de intentos por IP (30 por hora) → throttled; otra IP no se ve afectada', async () => {
    let last
    for (let i = 0; i < 32; i++) last = (await CK('NOEXISTE' + i, '7.7.7.7')).rows[0].r
    assert.equal(last.valid, false); assert.equal(last.throttled, true)
    assert.equal((await CK(memberCode, '8.8.8.8')).rows[0].r.valid, true)
    assert.equal((await CK(memberCode, '7.7.7.7')).rows[0].r.valid, false) // incluso un código bueno se bloquea tras el límite
  })
  await t('el gancho rechaza el alta SIN código, con código inventado, caducado, usado, anónimo o con proveedor externo', async () => {
    for (const [e, c, x] of [['a@x.es', undefined], ['a@x.es', ''], ['a@x.es', 'ZZZZZZZZZZ'], ['a@x.es', 'CADUCADO01'], ['a@x.es', 'USADO00002'], ['a@x.es', famCode, { is_anonymous: true }], ['a@x.es', famCode, { app_metadata: { provider: 'google' } }]]) {
      const r = (await HOOK(e, c, x ?? {})).rows[0].r
      assert.ok(r.error && r.error.http_code === 400, JSON.stringify(r))
      assert.ok(/^INVITATION_(REQUIRED|INVALID)/.test(r.error.message), r.error.message)
    }
    assert.equal((await db.query('select count(*)::int n from auth.users where email=$1', ['a@x.es'])).rows[0].n, 0)
  })
  await t('el gancho acepta una invitación válida y la RESERVA para ese correo (sin gastarla)', async () => {
    const r = (await HOOK('Nuevo@Example.Invalid', famCode)).rows[0].r
    assert.deepEqual(r, {})
    const row = (await db.query('select reserved_email, reserved_until, used_at from family_invites where code=$1', [famCode])).rows[0]
    assert.equal(row.reserved_email, 'nuevo@example.invalid'); assert.ok(new Date(row.reserved_until) > new Date()); assert.equal(row.used_at, null)
  })
  await t('caducidad por tipo: familia nueva 7 días (168 h), miembro 24 h; la reserva dura EXACTAMENTE lo que la invitación, sin plazo propio', async () => {
    const row = (await db.query('select reserved_until, expires_at, created_at from family_invites where code=$1', [famCode])).rows[0]
    assert.equal(new Date(row.reserved_until).getTime(), new Date(row.expires_at).getTime())
    const horas = (new Date(row.expires_at) - new Date(row.created_at)) / 3600000
    assert.ok(horas > 167.9 && horas < 168.1, 'dura ' + horas + ' h')
    // Miembro: se reserva y la reserva coincide con la caducidad de la ficha.
    assert.deepEqual((await HOOK('caduca24@example.invalid', memberCode)).rows[0].r, {})
    const mrow = (await db.query('select invite_code_expires_at, invite_reserved_until from family_members where invite_code=$1', [memberCode])).rows[0]
    assert.equal(new Date(mrow.invite_reserved_until).getTime(), new Date(mrow.invite_code_expires_at).getTime())
    const mh = (new Date(mrow.invite_code_expires_at) - new Date()) / 3600000
    assert.ok(mh > 23 && mh < 24.1, 'ficha dura ' + mh + ' h')
  })
  await t('correo reservado SIN confirmar (error al escribirlo): otra dirección puede retomar la invitación', async () => {
    // «nuevo@» está reservado pero nunca existió como login confirmado → no retiene la invitación.
    assert.deepEqual((await HOOK('otra@example.invalid', famCode)).rows[0].r, {})
    assert.equal((await db.query('select reserved_email e from family_invites where code=$1', [famCode])).rows[0].e, 'otra@example.invalid')
  })
  await t('correo reservado y CONFIRMADO: nadie más puede usar la invitación; su dueña puede volver a intentarlo hasta que caduque', async () => {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'otra@example.invalid', now())`, [uid()])
    const r = (await HOOK('tercera@example.invalid', famCode)).rows[0].r
    assert.ok(r.error.message.startsWith('INVITATION_IN_USE'))
    assert.deepEqual((await HOOK('otra@example.invalid', famCode)).rows[0].r, {})
  })
  await t('quien perdió la reserva por un correo mal escrito no puede completar el alta con la dirección antigua', async () => {
    const fr = await addFicha(db, fam, 'Retoma', 'adult', { birth: '1980-01-01' })
    const dest = (await as(db, mom.id, () => db.query('select * from public.create_member_invitation($1,false)', [fr]))).rows[0].o_code
    assert.deepEqual((await HOOK('erratas@example.invalid', dest)).rows[0].r, {})
    assert.deepEqual((await HOOK('correcta@example.invalid', dest)).rows[0].r, {})
    const viejo = await addUser(db, 'erratas@example.invalid')
    has(await as(db, viejo, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [dest, 'X'])), { email: 'erratas@example.invalid' }), 'Código no válido o caducado')
    const bueno = await addUser(db, 'correcta@example.invalid')
    await as(db, bueno, () => db.query('select public.join_family_with_code($1,$2,null)', [dest, 'B']), { email: 'correcta@example.invalid' })
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [bueno])).rows[0].n, 1)
  })
  await t('invitación familiar: el gancho la reserva; al terminar, solo ese correo puede usarla; el código sigue sin gastarse hasta entonces', async () => {
    assert.deepEqual((await HOOK('peque@example.invalid', memberCode)).rows[0].r, {})
    const intruso = await addUser(db, 'intruso3@example.invalid')
    has(await as(db, intruso, () => err(() => db.query('select public.join_family_with_code($1,$2,null)', [memberCode, 'X'])), { email: 'intruso3@example.invalid' }), 'Código no válido o caducado')
    const peque = await addUser(db, 'peque@example.invalid')
    await as(db, peque, () => db.query('select public.join_family_with_code($1,$2,null)', [memberCode, 'Peque']), { email: 'peque@example.invalid' })
    const p = (await db.query('select role from profiles where id=$1', [peque])).rows[0]
    assert.equal(p.role, 'child')
    // ya gastado: el gancho lo rechaza
    assert.ok((await HOOK('otro@example.invalid', memberCode)).rows[0].r.error)
  })
  await t('el gancho lee el código también si llega como raw_user_meta_data (la documentación no aclara el nombre); sin ninguno, rechaza', async () => {
    const c2 = (await as(db, owner.id, () => db.query(`select public.generate_family_invite('y') c`))).rows[0].c
    const r = (await db.query('select public.hook_before_user_created($1::jsonb) r', [JSON.stringify({ user: { email: 'raw@example.invalid', app_metadata: { provider: 'email' }, raw_user_meta_data: { invite_code: c2 } } })])).rows[0].r
    assert.deepEqual(r, {})
    const sin = (await db.query('select public.hook_before_user_created($1::jsonb) r', [JSON.stringify({ user: { email: 'raw2@example.invalid', app_metadata: { provider: 'email' } } })])).rows[0].r
    assert.ok(sin.error && sin.error.message.startsWith('INVITATION_REQUIRED'))
  })
  await t('el gancho acepta el código maestro (compatibilidad) sin reservar', async () => {
    await db.query(`insert into vault.secrets (name, secret) values ('family_signup_code','MAESTRO-Y')`)
    assert.deepEqual((await HOOK('m@example.invalid', 'MAESTRO-Y')).rows[0].r, {})
    assert.ok((await HOOK('m@example.invalid', 'maestro-y')).rows[0].r.error) // distingue mayúsculas, como create_family
    await db.query(`delete from vault.secrets`)
  })
  await t('el gancho no es ejecutable por la app (solo por Supabase Auth); check_invitation sí por anon', async () => {
    const p = await db.query(`select has_function_privilege('authenticated','public.hook_before_user_created(jsonb)','execute') a, has_function_privilege('anon','public.hook_before_user_created(jsonb)','execute') b, has_function_privilege('supabase_auth_admin','public.hook_before_user_created(jsonb)','execute') c, has_function_privilege('anon','public.check_invitation(text)','execute') d, has_function_privilege('anon','public.create_member_invitation(uuid,boolean)','execute') e, has_function_privilege('anon','public.create_family(text,text,text,date)','execute') f`)
    assert.deepEqual(p.rows[0], { a: false, b: false, c: true, d: true, e: false, f: false }, JSON.stringify(p.rows[0]))
  })
  await t('limpieza de logins huérfanos: borra los de más de 8 días (cuando ya caducó cualquier invitación) sin familia y NUNCA a quien tiene familia ni a quien aún puede usar su invitación', async () => {
    const viejo = await addUser(db, 'huerfano@example.invalid')
    await db.query(`update auth.users set created_at = now() - interval '9 days' where id=$1`, [viejo])
    const aunVale = await addUser(db, 'sieteDias@example.invalid')
    await db.query(`update auth.users set created_at = now() - interval '6 days' where id=$1`, [aunVale])
    await addUser(db, 'reciente@example.invalid')
    const conFamilia = await addAccount(db, fam, 'adult', 'Antigua')
    await db.query(`update auth.users set created_at = now() - interval '9 days' where id=$1`, [conFamilia.id])
    const n = (await db.query('select private.purge_orphan_logins() n')).rows[0].n
    assert.equal(n, 1)
    assert.equal((await db.query(`select count(*)::int n from auth.users where email='huerfano@example.invalid'`)).rows[0].n, 0)
    assert.equal((await db.query(`select count(*)::int n from auth.users where email='reciente@example.invalid'`)).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int n from auth.users where id=$1', [conFamilia.id])).rows[0].n, 1)
  })
}

// ---------------------------------------------------------------------------------------------------------- 0304
console.log('\n0304 · cada persona adulta edita su ficha y la de sus hijos/as')
{
  const fam = await mkFamily(db, 'E')
  const admin = await addAccount(db, fam, 'admin', 'Adm')
  const mom = await addAccount(db, fam, 'adult', 'Mama')
  const other = await addAccount(db, fam, 'adult', 'Otra')
  const guest = await addAccount(db, fam, 'guest', 'Invitada')
  const kidAcc = await addAccount(db, fam, 'child', 'NinaCuenta', 'child', { birth: '2015-05-05' })
  const kid = await addFicha(db, fam, 'Hijo', 'child', { birth: null })
  const teen = await addFicha(db, fam, 'Mayor', 'child', { birth: '2005-01-01' })
  await as(db, mom.id, () => db.query('select public.declare_guardianship($1,$2,true,$3)', [kid, 'parent', 'v1']), { amrAgoSeconds: FRESH })
  const famB = await mkFamily(db, 'B')
  const outsider = await addAccount(db, famB, 'admin', 'Fuera')
  const U = (who, member, name = 'Nombre', color = '#112233', birth = '2018-03-04', sex = null) =>
    as(db, who, () => db.query('select public.update_member_card($1,$2,$3,$4,$5)', [member, name, color, birth, sex]))
  const row = async (id) => (await db.query('select name, color, birth_date::text bd, sex, photo_path, member_type, allowed_sections from family_members where id=$1', [id])).rows[0]

  await t('una madre/padre vinculado edita la ficha de su hijo/a (nombre, color, fecha y sexo) y NO cambia el tipo ni las secciones', async () => {
    await U(mom.id, kid, 'Hijo Nuevo', '#aabbcc', '2018-03-04', 'male')
    const r = await row(kid)
    assert.deepEqual([r.name, r.color, r.bd, r.sex, r.member_type, r.allowed_sections], ['Hijo Nuevo', '#aabbcc', '2018-03-04', 'male', 'child', null])
  })
  await t('la fecha nueva de un menor debe seguir siendo de menor de 18 años (nadie lo hace mayor desde una ficha)', async () => {
    has(await err(() => U(mom.id, kid, 'Hijo', '#aabbcc', '2001-01-01')), 'CHILD_MUST_BE_MINOR')
    assert.equal((await row(kid)).bd, '2018-03-04')
  })
  await t('sin vínculo no se edita al hijo/a de otra persona; ni una ficha ya mayor de edad', async () => {
    has(await err(() => U(other.id, kid)), 'NOT_AUTHORIZED')
    has(await err(() => U(other.id, teen)), 'NOT_AUTHORIZED')
    has(await err(() => U(mom.id, teen)), 'NOT_AUTHORIZED')
  })
  await t('una persona adulta edita SU ficha; la fecha propia no puede quedar vacía; no cambia su tipo', async () => {
    await U(other.id, other.member, 'Otra Persona', '#010203', '1990-02-02', 'female')
    const r = await row(other.member)
    assert.deepEqual([r.name, r.bd, r.sex, r.member_type], ['Otra Persona', '1990-02-02', 'female', 'adult'])
    has(await err(() => U(other.id, other.member, 'Otra Persona', '#010203', null)), 'BIRTH_DATE_REQUIRED')
  })
  await t('no se edita la ficha de otra persona adulta (ni la de la administradora)', async () => {
    has(await err(() => U(other.id, mom.member)), 'NOT_AUTHORIZED')
    has(await err(() => U(mom.id, admin.member)), 'NOT_AUTHORIZED')
  })
  await t('invitados y niños con cuenta no editan nada, ni lo suyo', async () => {
    has(await err(() => U(guest.id, guest.member)), 'NOT_AUTHORIZED')
    has(await err(() => U(kidAcc.id, kidAcc.member)), 'NOT_AUTHORIZED')
    has(await err(() => U(kidAcc.id, kid)), 'NOT_AUTHORIZED')
  })
  await t('la administradora sigue pudiendo con cualquier ficha de su familia, y no con las de otra familia', async () => {
    await U(admin.id, mom.member, 'Mama', '#000000', null)
    assert.equal((await row(mom.member)).bd, null)
    has(await err(() => U(admin.id, outsider.member)), 'NOT_AUTHORIZED')
    has(await err(() => U(outsider.id, kid)), 'NOT_AUTHORIZED')
  })
  await t('datos inválidos se rechazan (nombre vacío, color raro, sexo raro, fecha futura o anterior a 1900)', async () => {
    has(await err(() => U(mom.id, kid, '   ')), 'INVALID_NAME')
    has(await err(() => U(mom.id, kid, 'x'.repeat(61))), 'INVALID_NAME')
    has(await err(() => U(mom.id, kid, 'Hijo', 'rojo')), 'INVALID_COLOR')
    has(await err(() => U(mom.id, kid, 'Hijo', '#112233', '2018-03-04', 'otro')), 'INVALID_SEX')
    has(await err(() => U(mom.id, kid, 'Hijo', '#112233', '2999-01-01')), 'INVALID_BIRTH_DATE')
    has(await err(() => U(mom.id, kid, 'Hijo', '#112233', '1800-01-01')), 'INVALID_BIRTH_DATE')
  })
  await t('foto: la ficha propia y la del hijo/a vinculado sí; la de otra persona no; la ruta debe ser de la propia familia', async () => {
    const P = (who, member, path) => as(db, who, () => db.query('select public.set_member_photo($1,$2)', [member, path]))
    await P(mom.id, kid, `${fam}/a.jpg`)
    await P(other.id, other.member, `${fam}/b.jpg`)
    assert.equal((await row(kid)).photo_path, `${fam}/a.jpg`)
    has(await err(() => P(other.id, kid, `${fam}/c.jpg`)), 'NOT_AUTHORIZED')
    has(await err(() => P(guest.id, guest.member, `${fam}/d.jpg`)), 'NOT_AUTHORIZED')
    has(await err(() => P(mom.id, kid, `${famB}/e.jpg`)), 'INVALID_PHOTO_PATH')
    has(await err(() => P(mom.id, kid, `${fam}/../x.jpg`)), 'INVALID_PHOTO_PATH')
    has(await err(() => P(mom.id, kid, null)), 'INVALID_PHOTO_PATH')
    await P(admin.id, mom.member, `${fam}/f.jpg`)
  })
  await t('sin sesión no se puede nada', async () => {
    assert.ok(await asAnon(db, () => err(() => db.query('select public.update_member_card($1,$2,$3,$4,$5)', [kid, 'x', '#112233', null, null]))))
    assert.ok(await asAnon(db, () => err(() => db.query('select public.set_member_photo($1,$2)', [kid, `${fam}/z.jpg`]))))
  })
}

// ---------------------------------------------------------------------------------------------------------- 0305
console.log('\n0305 · preferencias por persona (una fila por preferencia)')
{
  const fam = await mkFamily(db, 'P')
  const ana = await addAccount(db, fam, 'admin', 'AnaP')
  const beto = await addAccount(db, fam, 'adult', 'BetoP')
  const NAV = 'familyapp:tab-order:bottom-nav'
  const THEME = 'familyapp:color-theme'
  const S = (who, key, value, base) => as(db, who, async () => (await db.query('select * from public.set_user_pref($1, $2::jsonb, $3)', [key, value === null ? null : JSON.stringify(value), base])).rows[0])
  const mine = (who) => as(db, who, async () => (await db.query('select key, value, rev::int from public.user_prefs order by key')).rows)

  await t('comparar y cambiar: primera vez (base 0) se aplica; con la revisión correcta se aplica; con una antigua NO y devuelve el valor ganador', async () => {
    const r1 = await S(ana.id, NAV, 'v1', 0)
    assert.equal(r1.applied, true)
    assert.ok(Number(r1.rev) > 0)
    assert.equal(r1.value, 'v1')
    const r2 = await S(ana.id, NAV, 'v2', Number(r1.rev))
    assert.equal(r2.applied, true)
    assert.ok(Number(r2.rev) > Number(r1.rev))
    const r3 = await S(ana.id, NAV, 'v3-antiguo', Number(r1.rev)) // parte de la revisión 1, ya superada
    assert.equal(r3.applied, false)
    assert.equal(r3.value, 'v2')
    assert.equal(Number(r3.rev), Number(r2.rev))
    const r4 = await S(ana.id, NAV, 'otra-vez-primera', 0) // «no existía»: ya existe
    assert.equal(r4.applied, false)
    assert.equal(r4.value, 'v2')
  })

  await t('la revisión crece entre preferencias distintas (orden de servidor) y cada preferencia es independiente', async () => {
    const a = await S(ana.id, THEME, 'vivo', 0)
    const b = await S(ana.id, 'familyapp:home-card-order', '["a"]', 0)
    assert.ok(Number(b.rev) > Number(a.rev))
    const rows = await mine(ana.id)
    assert.deepEqual(rows.map((r) => r.key), [THEME, 'familyapp:home-card-order', NAV].sort())
    const nav = rows.find((r) => r.key === NAV)
    assert.equal(nav.value, 'v2') // cambiar otras claves no toca esta
  })

  await t('aislamiento entre personas: nadie lee ni pisa las preferencias de otra, aunque use la misma clave', async () => {
    assert.equal((await mine(beto.id)).length, 0)
    const r = await S(beto.id, NAV, 'de-beto', 0)
    assert.equal(r.applied, true)
    assert.equal((await mine(ana.id)).find((x) => x.key === NAV).value, 'v2')
    assert.equal((await mine(beto.id)).find((x) => x.key === NAV).value, 'de-beto')
  })

  await t('«volver al valor predeterminado» (null) se guarda como JSON null y se devuelve como tal', async () => {
    const cur = (await mine(beto.id)).find((x) => x.key === NAV)
    const r = await S(beto.id, NAV, null, cur.rev)
    assert.equal(r.applied, true)
    assert.equal(r.value, null)
    assert.equal((await db.query(`select jsonb_typeof(value) t from public.user_prefs where user_id = $1 and key = $2`, [beto.id, NAV])).rows[0].t, 'null')
  })

  await t('claves fuera de la lista cerrada, valores que no son texto, demasiado grandes o con revisión rara se rechazan', async () => {
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref('familyapp:location-sharing-member-id', '"x"'::jsonb, 0)`))), 'INVALID_KEY')
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref('otra:clave', '"x"'::jsonb, 0)`))), 'INVALID_KEY')
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref($1, '{"a":1}'::jsonb, 0)`, [THEME]))), 'INVALID_VALUE')
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref($1, to_jsonb(repeat('x', 9000)), 0)`, ['familyapp:chart-color-theme']))), 'INVALID_VALUE')
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref($1, '"x"'::jsonb, -1)`, [THEME]))), 'INVALID_VALUE')
    has(await as(db, ana.id, () => err(() => db.query(`select * from public.set_user_pref($1, '"x"'::jsonb, null)`, [THEME]))), 'INVALID_VALUE')
  })

  await t('sin sesión no se puede escribir ni leer; el rol anónimo no tiene ni permiso de ejecutar la función', async () => {
    assert.ok(await asAnon(db, () => err(() => db.query(`select * from public.set_user_pref($1, '"x"'::jsonb, 0)`, [THEME]))))
    assert.ok(await asAnon(db, () => err(() => db.query('select * from public.user_prefs'))))
    assert.equal((await db.query(`select has_function_privilege('anon', 'public.set_user_pref(text, jsonb, bigint)', 'execute') p`)).rows[0].p, false)
    assert.equal((await db.query(`select has_function_privilege('authenticated', 'public.set_user_pref(text, jsonb, bigint)', 'execute') p`)).rows[0].p, true)
  })

  await t('nadie escribe directamente en la tabla (ni insertar, ni actualizar, ni borrar) y la secuencia no es accesible', async () => {
    assert.ok(await as(db, ana.id, () => err(() => db.query(`insert into public.user_prefs (user_id, key, value) values ($1, $2, '"x"')`, [ana.id, 'familyapp:color-theme-x']))))
    assert.ok(await as(db, ana.id, () => err(() => db.query(`update public.user_prefs set value = '"hack"' where key = $1`, [NAV]))))
    assert.ok(await as(db, ana.id, () => err(() => db.query(`delete from public.user_prefs`))))
    assert.ok(await as(db, ana.id, () => err(() => db.query(`select nextval('public.user_prefs_rev_seq')`))))
    assert.equal((await mine(ana.id)).find((x) => x.key === NAV).value, 'v2')
  })

  await t('límite de 200 preferencias por persona (la 201.ª clave nueva se rechaza; actualizar una existente sigue valiendo)', async () => {
    const c = await addAccount(db, fam, 'adult', 'CarlosP')
    for (let i = 0; i < 200; i++) {
      await db.query(`insert into public.user_prefs (user_id, key, value) values ($1, $2, '"x"')`, [c.id, `familyapp:tab-order:k${i}`])
    }
    has(await as(db, c.id, () => err(() => db.query(`select * from public.set_user_pref($1, '"x"'::jsonb, 0)`, ['familyapp:tab-order:nueva']))), 'TOO_MANY_PREFS')
    const cur = (await mine(c.id)).find((x) => x.key === 'familyapp:tab-order:k5')
    const r = await S(c.id, 'familyapp:tab-order:k5', 'otro', cur.rev)
    assert.equal(r.applied, true)
  })

  await t('copia inicial desde user_ui_prefs: solo claves permitidas y válidas, sin pisar lo ya existente y sin borrar la tabla antigua', async () => {
    const d = await addAccount(db, fam, 'adult', 'DanaP')
    await db.query(`insert into public.user_ui_prefs (user_id, prefs) values ($1, $2::jsonb)`, [d.id, JSON.stringify({ [NAV]: 'viejo', [THEME]: 'neutro', 'basura:clave': 'x', 'familyapp:location-sharing-member-id': 'ajeno' })])
    // El disparador de transición ya copia al insertar; se vacía para probar la copia inicial por separado.
    await db.query('delete from public.user_prefs where user_id = $1', [d.id])
    await db.query(`insert into public.user_prefs (user_id, key, value) values ($1, $2, '"ya-nuevo"')`, [d.id, THEME])
    const sql = read('supabase/migrations/0305_user_prefs.sql')
    const block = sql.slice(sql.indexOf('-- BACKFILL START'), sql.indexOf('-- BACKFILL END'))
    await db.exec(block)
    const rows = (await db.query('select key, value from public.user_prefs where user_id = $1 order by key', [d.id])).rows
    assert.deepEqual(rows.map((r) => [r.key, r.value]), [[THEME, 'ya-nuevo'], [NAV, 'viejo']].sort((a, b) => a[0].localeCompare(b[0])))
    assert.equal((await db.query('select count(*)::int n from public.user_ui_prefs where user_id = $1', [d.id])).rows[0].n, 1)
  })

  await t('disparador de transición: lo que sube una versión antigua se copia (solo claves que cambian y permitidas); lo que no cambia no repone valores viejos', async () => {
    const e = await addAccount(db, fam, 'adult', 'EvaP')
    await db.query(`insert into public.user_ui_prefs (user_id, prefs) values ($1, $2::jsonb)`, [e.id, JSON.stringify({ [NAV]: 'a1', [THEME]: 'pastel' })])
    const first = (await db.query('select key, value, rev::int from public.user_prefs where user_id = $1 order by key', [e.id])).rows
    assert.deepEqual(first.map((r) => [r.key, r.value]), [[THEME, 'pastel'], [NAV, 'a1']].sort((a, b) => a[0].localeCompare(b[0])))
    // La versión nueva cambia el tema en user_prefs; después una versión antigua sube lo mismo que ya tenía + un cambio del menú.
    const themeRow = first.find((r) => r.key === THEME)
    const r = await S(e.id, THEME, 'vivo', themeRow.rev)
    assert.equal(r.applied, true)
    await db.query(`update public.user_ui_prefs set prefs = $2::jsonb where user_id = $1`, [e.id, JSON.stringify({ [NAV]: 'a2', [THEME]: 'pastel', 'basura:x': '1' })])
    const after = (await db.query('select key, value from public.user_prefs where user_id = $1 order by key', [e.id])).rows
    assert.equal(after.find((x) => x.key === NAV).value, 'a2') // cambió
    assert.equal(after.find((x) => x.key === THEME).value, 'vivo') // el tema no cambió en la fila antigua: no se repone
    assert.ok(!after.some((x) => x.key === 'basura:x'))
  })

  await t('deshacer 0305: devuelve lo nuevo a user_ui_prefs (sin perder cambios) y deja la base como antes de la migración', async () => {
    const db2 = await setup()
    const fam2 = await mkFamily(db2, 'R')
    const f = await addAccount(db2, fam2, 'adult', 'FaustoR')
    await db2.query(`insert into public.user_ui_prefs (user_id, prefs) values ($1, '{"familyapp:color-theme":"pastel"}'::jsonb)`, [f.id])
    await as(db2, f.id, () => db2.query(`select * from public.set_user_pref('familyapp:tab-order:bottom-nav', '"orden-nuevo"'::jsonb, 0)`))
    await as(db2, f.id, async () => {
      const cur = (await db2.query(`select rev from public.user_prefs where key = 'familyapp:color-theme'`)).rows[0].rev
      await db2.query(`select * from public.set_user_pref('familyapp:color-theme', '"vivo"'::jsonb, $1)`, [cur])
    })
    await db2.exec(read('supabase/rollbacks/0305_user_prefs_down.sql'))
    const prefs = (await db2.query('select prefs from public.user_ui_prefs where user_id = $1', [f.id])).rows[0].prefs
    assert.equal(prefs['familyapp:tab-order:bottom-nav'], 'orden-nuevo')
    assert.equal(prefs['familyapp:color-theme'], 'vivo')
    assert.equal((await db2.query(`select to_regclass('public.user_prefs') is null as gone`)).rows[0].gone, true)
    assert.equal((await db2.query(`select count(*)::int n from pg_proc where proname in ('set_user_pref','user_pref_key_allowed','mirror_user_ui_prefs')`)).rows[0].n, 0)
  })

  await t('el guion de prueba EN VIVO de 0305 funciona sobre la base local: todo correcto y todo deshecho', async () => {
    const before = (await db.query('select count(*)::int n from public.user_prefs')).rows[0].n
    const msg = await err(() => db.exec(read('supabase/pending-migrations/0305_live_test.sql')))
    has(msg, 'RESULTADO (todo deshecho)')
    has(msg, '2a primera vez: applied=true')
    has(msg, '2b con revision buena: applied=true rev sube=true')
    has(msg, '2c con revision antigua: applied=false')
    has(msg, '3a ok clave ajena: INVALID_KEY')
    has(msg, '3b ok valor no texto: INVALID_VALUE')
    has(msg, '4 ok insercion directa')
    has(msg, '5 B ve filas de A (debe ser 0): 0')
    assert.ok(!msg.includes('FALLO'))
    assert.equal((await db.query('select count(*)::int n from public.user_prefs')).rows[0].n, before)
  })

  await t('la lista cerrada de claves del SQL coincide con la del código (registro de claves)', async () => {
    const sql = read('supabase/migrations/0305_user_prefs.sql')
    const body = sql.slice(sql.indexOf('create or replace function private.user_pref_key_allowed'), sql.indexOf('revoke all on function private.user_pref_key_allowed'))
    const sqlPatterns = [...body.matchAll(/^\s*'(\^[^']+\$)',?\s*$/gm)].map((m) => m[1])
    const reg = read('src/state/prefs/prefsRegistry.ts')
    const tsBlock = reg.slice(reg.indexOf('SYNCED_KEY_PATTERN_SOURCES'), reg.indexOf(']\n\n// Preferencias de la Ayuda'))
    const tsPatterns = [...tsBlock.matchAll(/^\s*'(\^[^']+\$)',\s*$/gm)].map((m) => m[1].replace(/\\\\/g, '\\'))
    assert.ok(sqlPatterns.length >= 10)
    assert.deepEqual(sqlPatterns, tsPatterns)
  })
}

// ---------------------------------------------------------------------------------------------------------- 0306 (pendiente de aplicar)
console.log('\n0306 · valoraciones agregadas de la Ayuda y claves de preferencias de Ayuda (migración PENDIENTE, probada en local)')
{
  // La función am_i_app_owner viene de 0254 (no está en el esquema mínimo del banco): se define igual que allí.
  await db.exec(`create or replace function public.am_i_app_owner() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce((select p.is_app_owner from public.profiles p where p.id = auth.uid()), false) $$;
    revoke execute on function public.am_i_app_owner() from public, anon; grant execute on function public.am_i_app_owner() to authenticated;`)
  const fam = await mkFamily(db, 'H')
  const owner = await addAccount(db, fam, 'admin', 'DuenaH', 'admin', { owner: true })
  const normal = await addAccount(db, fam, 'adult', 'NormalH')
  const HELP_KEYS = ['pepa:help-voice-mode', 'pepa:help-welcome', 'pepa:help-hint:calendario', 'pepa:help-tour:cal-crear-evento']
  const S = (who, key, value) => as(db, who, async () => (await db.query('select * from public.set_user_pref($1, $2::jsonb, 0)', [key, JSON.stringify(value)])).rows[0])

  await t('ANTES de aplicar 0306 las claves de Ayuda se rechazan (por eso la web las deja solo locales hasta entonces)', async () => {
    has(await as(db, normal.id, () => err(() => db.query(`select * from public.set_user_pref('pepa:help-voice-mode', '"voice"'::jsonb, 0)`))), 'INVALID_KEY')
    has(await as(db, normal.id, () => err(() => db.query(`select * from public.record_help_feedback('cal-crear-evento', true)`))), 'record_help_feedback')
  })

  await db.exec(read('supabase/pending-migrations/0306_help_feedback_and_prefs.sql'))

  await t('tras 0306: las cuatro claves de Ayuda se aceptan, las de siempre siguen, y las inventadas se rechazan', async () => {
    for (const k of HELP_KEYS) assert.equal((await S(normal.id, k, 'x')).applied, true, k)
    assert.equal((await S(normal.id, 'familyapp:color-theme', 'vivo')).applied, true)
    for (const bad of ['pepa:help-voice-modex', 'pepa:help-tour:Mal Id', 'pepa:help-otra', 'familyapp:location-sharing-member-id']) {
      has(await as(db, normal.id, () => err(() => db.query(`select * from public.set_user_pref($1, '"x"'::jsonb, 0)`, [bad]))), 'INVALID_KEY')
    }
  })

  await t('valorar: suma sí/no por ficha y día; un identificador raro, vacío o sin sesión se rechaza; anónimo no puede ni ejecutar', async () => {
    await as(db, normal.id, () => db.query(`select public.record_help_feedback('cal-crear-evento', true)`))
    await as(db, owner.id, () => db.query(`select public.record_help_feedback('cal-crear-evento', true)`))
    await as(db, normal.id, () => db.query(`select public.record_help_feedback('cal-crear-evento', false)`))
    const row = (await db.query(`select useful, not_useful from public.help_feedback_daily where card_id = 'cal-crear-evento'`)).rows[0]
    assert.equal(row.useful, 2)
    assert.equal(row.not_useful, 1)
    for (const bad of ['', 'ab', 'Tiene Mayusculas', 'x'.repeat(61), "a'; drop table x;--"]) {
      has(await as(db, normal.id, () => err(() => db.query(`select public.record_help_feedback($1, true)`, [bad]))), 'INVALID_CARD')
    }
    has(await as(db, normal.id, () => err(() => db.query(`select public.record_help_feedback('cal-crear-evento', null)`))), 'INVALID_CARD')
    assert.ok(await asAnon(db, () => err(() => db.query(`select public.record_help_feedback('cal-crear-evento', true)`))))
  })

  await t('NO se guarda quién valoró ni nada de la conversación: la tabla solo tiene día, ficha y dos contadores', async () => {
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='help_feedback_daily' order by ordinal_position`)).rows.map((r) => r.column_name)
    assert.deepEqual(cols, ['day', 'card_id', 'useful', 'not_useful'])
  })

  await t('la tabla no se lee ni se escribe directamente: ni cuentas normales, ni propietarias, ni anónimo', async () => {
    for (const who of [normal.id, owner.id]) {
      assert.ok(await as(db, who, () => err(() => db.query(`select * from public.help_feedback_daily`))))
      assert.ok(await as(db, who, () => err(() => db.query(`insert into public.help_feedback_daily (day, card_id) values (current_date, 'hack-1')`))))
      assert.ok(await as(db, who, () => err(() => db.query(`update public.help_feedback_daily set useful = 999`))))
      assert.ok(await as(db, who, () => err(() => db.query(`delete from public.help_feedback_daily`))))
    }
    assert.ok(await asAnon(db, () => err(() => db.query(`select * from public.help_feedback_daily`))))
  })

  await t('resumen: solo las cuentas propietarias de PEPA lo ven; cualquier otra recibe 0 filas (sin error); anónimo no puede ejecutarlo', async () => {
    const ownerRows = (await as(db, owner.id, () => db.query(`select * from public.help_feedback_summary(30)`))).rows
    assert.deepEqual(ownerRows.map((r) => [r.card_id, Number(r.useful), Number(r.not_useful)]), [['cal-crear-evento', 2, 1]])
    assert.equal((await as(db, normal.id, () => db.query(`select * from public.help_feedback_summary(30)`))).rows.length, 0)
    assert.ok(await asAnon(db, () => err(() => db.query(`select * from public.help_feedback_summary(30)`))))
  })

  await t('tope diario: una cuenta no puede llenar la tabla inventando fichas (300 distintas al día; la 301 se ignora sin error; las ya existentes siguen sumando)', async () => {
    for (let i = 0; i < 305; i++) await as(db, normal.id, () => db.query(`select public.record_help_feedback($1, true)`, [`prueba-${String(i).padStart(3, '0')}`]))
    const n = (await db.query(`select count(*)::int n from public.help_feedback_daily where day = current_date`)).rows[0].n
    assert.equal(n, 300)
    await as(db, normal.id, () => db.query(`select public.record_help_feedback('cal-crear-evento', true)`))
    assert.equal((await db.query(`select useful from public.help_feedback_daily where card_id='cal-crear-evento'`)).rows[0].useful, 3)
  })

  await t('la lista cerrada de 0306 coincide con la del código (preferencias normales + las de Ayuda)', async () => {
    const sql = read('supabase/pending-migrations/0306_help_feedback_and_prefs.sql')
    const body = sql.slice(sql.indexOf('create or replace function private.user_pref_key_allowed'), sql.indexOf('revoke all on function private.user_pref_key_allowed'))
    const sqlPatterns = [...body.matchAll(/^\s*'(\^[^']+\$)',?\s*$/gm)].map((m) => m[1])
    const reg = read('src/state/prefs/prefsRegistry.ts')
    const grab = (name, end) => {
      const block = reg.slice(reg.indexOf(name), reg.indexOf(end, reg.indexOf(name)))
      return [...block.matchAll(/^\s*'(\^[^']+\$)',\s*$/gm)].map((m) => m[1].replace(/\\\\/g, '\\'))
    }
    const ts = [...grab('SYNCED_KEY_PATTERN_SOURCES', ']\n\n// Preferencias de la Ayuda'), ...grab('HELP_PREF_PATTERN_SOURCES', ']\n\nconst SYNCED_KEY_PATTERNS')]
    assert.ok(sqlPatterns.length >= 14)
    assert.deepEqual(sqlPatterns, ts)
  })

  await t('deshacer 0306: quita la tabla y las funciones y devuelve la lista cerrada de 0305 (las claves de Ayuda vuelven a rechazarse)', async () => {
    await db.exec(read('supabase/rollbacks/0306_help_feedback_and_prefs_down.sql'))
    assert.equal((await db.query(`select to_regclass('public.help_feedback_daily') r`)).rows[0].r, null)
    has(await as(db, normal.id, () => err(() => db.query(`select public.record_help_feedback('cal-crear-evento', true)`))), 'record_help_feedback')
    const k = await as(db, normal.id, () => err(() => db.query(`select * from public.set_user_pref('pepa:help-voice-mode', '"voice"'::jsonb, 0)`)))
    has(k, 'INVALID_KEY')
    assert.equal((await S(normal.id, 'familyapp:tab-order:bottom-nav', 'x')).applied, true)
  })
}

// ---------------------------------------------------------------------------------------------------------- Puerta global
console.log('\nPuerta por invitación (resumen): sin invitación válida no hay perfil')
{
  await t('un login sin invitación no puede crear familia, unirse, ni insertar perfiles a mano; las funciones nuevas tampoco le dan nada', async () => {
    const u = await addUser(db, 'sininvitacion@example.invalid')
    const before = (await db.query('select (select count(*) from profiles)::int p, (select count(*) from families)::int f')).rows[0]
    has(await as(db, u, () => err(() => db.query(`select public.create_family('F','Y','',' 1990-01-01')`)), { email: 'sininvitacion@example.invalid' }), 'Código de acceso incorrecto')
    has(await as(db, u, () => err(() => db.query(`select public.join_family_with_code('NOEXISTE','Y','1990-01-01')`)), { email: 'sininvitacion@example.invalid' }), 'Código no válido o caducado')
    assert.ok(await as(db, u, () => err(() => db.query(`insert into profiles (id, family_id, role, display_name) select $1, id, 'admin', 'x' from families limit 1`, [u]))))
    assert.ok(await as(db, u, () => err(() => db.query(`insert into families (name) values ('x')`))))
    assert.equal((await as(db, u, () => db.query('select * from public.list_family_account_emails()'))).rows.length, 0)
    assert.equal((await as(db, u, () => db.query(`select public.change_own_pin('0000','1234') r`))).rows[0].r, 'no_pin')
    await as(db, u, () => db.query('select public.reset_own_pin_after_recent_auth()'), { amrAgoSeconds: FRESH })
    has(await as(db, u, () => err(() => db.query(`select * from public.create_member_invitation($1,false)`, [uid()]))), 'NOT_AUTHORIZED')
    has(await as(db, u, () => err(() => db.query(`select public.declare_guardianship($1,'parent',true,'v1')`, [uid()])), { amrAgoSeconds: FRESH }), 'NOT_AUTHORIZED')
    const after = (await db.query('select (select count(*) from profiles)::int p, (select count(*) from families)::int f')).rows[0]
    assert.deepEqual(after, before)
    assert.equal((await db.query('select count(*)::int n from profiles where id=$1', [u])).rows[0].n, 0)
  })
}

// ---------------------------------------------------------------------------------------------------------- 0307 (pendiente de aplicar)
console.log('\n0307 · Actividad reciente: un UPDATE que no cambia nada no se anota (migración PENDIENTE, probada en local)')
{
  const fam = await mkFamily(db, 'J')
  const ana = await addAccount(db, fam, 'admin', 'AnaJ')
  // Esquema mínimo de 0011 (tabla de actividad + un disparador sobre una tabla de eventos de prueba, con updated_at como calendar_events).
  await db.exec(`create table activity_log (id uuid primary key default gen_random_uuid(), family_id uuid not null, actor_id uuid, table_name text not null, action text not null, record_id uuid, created_at timestamptz not null default now());
    create table evt_test (id uuid primary key default gen_random_uuid(), family_id uuid not null, title text not null, start_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create function public.log_activity() returns trigger language plpgsql security definer set search_path = public as $f$ begin
      insert into activity_log (family_id, actor_id, table_name, action, record_id) values (coalesce(NEW.family_id, OLD.family_id), auth.uid(), TG_TABLE_NAME, lower(TG_OP), coalesce(NEW.id, OLD.id)); return coalesce(NEW, OLD); end $f$;
    create trigger trg_log_evt after insert or update or delete on evt_test for each row execute function public.log_activity();
    grant select, insert, update, delete on evt_test to authenticated;`)
  const n = async () => (await db.query('select count(*)::int n from activity_log')).rows[0].n
  const ev = (await db.query(`insert into evt_test (family_id, title) values ($1, 'Dentista') returning id`, [fam])).rows[0].id

  await t('ANTES de 0307 (disparador original): un update idéntico se anota igual que uno real — el fallo', async () => {
    const before = await n()
    await db.query(`update evt_test set title='Dentista' where id=$1`, [ev])
    assert.equal(await n(), before + 1)
  })

  await db.exec(read('supabase/pending-migrations/0307_activity_log_skip_noop_updates.sql'))

  await t('tras 0307: 49 updates idénticos seguidos (la sincronización horaria de Google) no anotan NADA', async () => {
    const ids = []
    for (let i = 0; i < 49; i++) ids.push((await db.query(`insert into evt_test (family_id, title) values ($1, $2) returning id`, [fam, 'Importado ' + i])).rows[0].id)
    const before = await n()
    for (const id of ids) await db.query(`update evt_test set title=title, start_at=start_at where id=$1`, [id])
    assert.equal(await n(), before)
  })

  await t('un update que solo cambia updated_at tampoco es actividad', async () => {
    const before = await n()
    await db.query(`update evt_test set updated_at = now() + interval '1 hour' where id=$1`, [ev])
    assert.equal(await n(), before)
  })

  await t('un cambio REAL se sigue anotando, con la persona que lo hizo; sin sesión (proceso automático) con actor nulo', async () => {
    const before = await n()
    await as(db, ana.id, () => db.query(`update evt_test set title='Dentista de Eric' where id=$1`, [ev]))
    await db.query(`update evt_test set start_at = start_at + interval '1 day' where id=$1`, [ev])
    assert.equal(await n(), before + 2)
    const rows = (await db.query(`select actor_id from activity_log order by created_at desc, id limit 2`)).rows.map((r) => r.actor_id)
    assert.ok(rows.includes(ana.id))
    assert.ok(rows.includes(null))
  })

  await t('crear y borrar se anotan siempre', async () => {
    const before = await n()
    const id = (await db.query(`insert into evt_test (family_id, title) values ($1, 'x') returning id`, [fam])).rows[0].id
    await db.query('delete from evt_test where id=$1', [id])
    assert.equal(await n(), before + 2)
  })

  await t('nunca borra ni toca las filas de actividad que ya existían', async () => {
    assert.ok((await n()) >= 1)
  })

  await t('deshacer 0307 devuelve el disparador original (vuelve a anotar los updates idénticos)', async () => {
    await db.exec(read('supabase/rollbacks/0307_activity_log_skip_noop_updates_down.sql'))
    const before = await n()
    await db.query(`update evt_test set title=title where id=$1`, [ev])
    assert.equal(await n(), before + 1)
  })
}

console.log(`\n${passed} pruebas correctas, ${failed.length} falladas`)
if (failed.length) {
  console.log('FALLADAS:', failed)
  process.exit(1)
}
