// Ejecuta los scripts de «prueba en vivo» (supabase/pending-migrations/*_live_test.sql) contra el PostgreSQL local, para comprobar que los propios scripts funcionan
// antes de lanzarlos contra la base de datos real. Cada uno termina con un error a propósito («PRUEBA_…_OK»): ese es el resultado correcto.
import { setup, read } from './harness.mjs'

let bad = 0
for (const [file, ok] of [
  ['supabase/pending-migrations/0299_live_test.sql', 'PRUEBA_0299_OK'],
  ['supabase/pending-migrations/invitation_gate_live_test.sql', 'PRUEBA_PUERTA_OK'],
]) {
  const db = await setup()
  try {
    await db.exec(read(file))
    console.log('✗', file, '— debía terminar con el error a propósito y no lo hizo')
    bad++
  } catch (e) {
    const msg = String(e.message)
    if (msg.includes(ok)) console.log('✓', file, '→', msg.slice(0, 90))
    else {
      console.log('✗', file, '→', msg.slice(0, 300))
      bad++
    }
  }
}
process.exit(bad ? 1 : 0)
