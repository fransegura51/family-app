# Plan de despliegue — Compras manuales, comparador, efectivo e integración económica

Estado a 24/10/2026: **nada de esto está desplegado.** La migración 0308 (aprendizaje compartido) es la última aplicada en producción (proyecto `family-app`, ref `objhgjgrinbhyzscjlbw`). Las migraciones 0309, 0310 y 0311, el cambio del sincronizador bancario y el cliente están **solo en local** (commits locales, sin push). Este documento es el procedimiento para cuando se autorice.

## 1. Qué se despliega y en qué orden

| Orden | Pieza | Archivo | Depende de | Reversible con |
|---|---|---|---|---|
| 1 | Compras manuales | `supabase/pending-migrations/0309_manual_purchases.sql` | 0308 | `supabase/rollbacks/0309_manual_purchases_down.sql` |
| 2 | Equivalencias de productos (comparador) | `.../0310_product_equivalences.sql` | 0308 (usa `shared_family_hash`, `shared_text_key_ok`) | `.../0310_product_equivalences_down.sql` |
| 3 | Efectivo, pagos mixtos, devoluciones, duplicados | `.../0311_cash_wallets_payments_refunds.sql` | **0309** | `.../0311_cash_wallets_payments_refunds_down.sql` |
| 4 | Sincronizador bancario | `supabase/functions/enable-banking-sync-transactions/index.ts` | **0311** (consulta `expenses.payment_method` y `purchase_payments`) | volver a desplegar la versión anterior (git) |
| 5 | Cliente web | todo `src/` | 0309, 0310, 0311 | desplegar el commit anterior |

**Por qué este orden:** el cliente pide `receipts.is_manual`, `receipts.payment_method` y `expenses.payment_method`; sin las migraciones fallaría al listar tickets y gastos. El sincronizador filtra por `expenses.payment_method`: si se desplegara **antes** de 0311, su consulta fallaría y dejaría de traer movimientos del banco. Por eso va después de 0311 y antes que el cliente (así, cuando alguien registre un pago en efectivo, el banco ya sabe no unirlo).

0309 y 0310 son independientes entre sí; 0311 necesita 0309 (sustituye su restricción `receipts_payment_method_check` para admitir «mixto»). Comprobado por `src/data/pendingMigrationsCompatibility.test.ts` y con una prueba en la base real (0309+0311 juntas, transacción revertida).

## 2. Comprobaciones previas (antes de tocar nada)

1. **Rama y pruebas:** `git status` limpio, suite de `src` verde (`npx vitest run src`), `npx tsc --noEmit -p .` sin errores. Estado actual: 618 archivos / 11.503 pruebas verdes.
2. **Copia de seguridad:** confirmar en el panel de Supabase que hay copia diaria reciente (plan Pro) y, si se quiere margen extra, anotar la hora para una restauración puntual. Ninguna migración borra datos, pero es la red de seguridad.
3. **Foto del estado** (para comparar después). Resultado el 24/10/2026, antes de aplicar:
   ```sql
   select (select count(*) from receipts) receipts, (select count(*) from expenses) expenses, (select count(*) from products) products,
          (select count(*) from product_prices) prices, (select count(*) from bank_transactions) bank_tx,
          (select count(*) from shared_product_confirmations) votes;
   ```
   → `receipts 114 · expenses 947 · products 460 · bank_tx 801 · votes 245` (precios: 1157).
4. **Que las tablas nuevas no existan ya:**
   ```sql
   select count(*) from information_schema.tables where table_schema='public' and table_name in ('product_equivalences','shared_equivalence_votes','cash_wallets','cash_movements','purchase_payments','purchase_refunds','purchase_duplicate_decisions');  -- 0
   select count(*) from information_schema.columns where table_schema='public' and column_name in ('is_manual','payment_method') and table_name in ('receipts','expenses'); -- 0
   ```
5. **Categorías estándar presentes en cada familia** (las funciones de devoluciones y retirada del banco las necesitan; en la familia de prueba usada el 24/10 estaban las tres; esta consulta lo comprueba en TODAS antes de aplicar):
   ```sql
   select f.name, count(*) filter (where c.catalog_key in ('i.ingreso.devoluciones','g.movimientos_internos.transferencias_propias','i.movimientos_internos')) as de_3
   from families f left join budget_categories c on c.family_id=f.id group by f.name;   -- esperado 3 en todas
   ```
   Una familia con menos de 3 simplemente no podrá registrar devoluciones / retiradas hasta que la tenga (la función devuelve un mensaje claro, no rompe nada).
6. **Ventana:** aplicar fuera de la hora de sincronización del banco (pg_cron la lanza 4 veces al día, `0077_schedule_bank_sync.sql`) para no solaparse con una sincronización.
7. **Asesores de Supabase** (seguridad y rendimiento) abiertos antes y después, para comparar avisos nuevos.

## 3. Procedimiento

1. Aplicar **0309** (`apply_migration` o editor SQL). Verificar: `receipts` tiene `is_manual` (todas `false`) y `payment_method` (todas NULL); conteos iguales a la foto previa.
2. Aplicar **0310**. Verificar: tablas `product_equivalences` (0 filas) y `shared_equivalence_votes` (0 filas); `select * from resolve_shared_equivalences(array['a','b'])` devuelve vacío.
3. Aplicar **0311**. Verificar: `expenses.payment_method` existe (todo NULL); tablas nuevas vacías; `select count(*) from cash_wallet_balances` = 0; comprobar que un usuario normal **no** tiene `execute` sobre funciones internas (`private.*`) más allá de las concedidas.
4. **Prueba de humo en SQL con una familia de prueba** (los guiones usados en la verificación del 24/10 — pagos mixtos, devolución, traspaso, retirada del banco, aislamiento — están descritos en `docs/PEPA_CONTROL_REQUISITOS.md`, EFE-1/ECO-1). Si algo no cuadra: revertir 0311 con su archivo `_down`.
5. Mover los tres archivos de `supabase/pending-migrations/` a `supabase/migrations/` y **subir los candados de numeración** (`toBe(308)` → `toBe(311)` en `financeUiRefunds.test.ts`, `eventGuestBreakdown14B.test.ts`, `refundsGuards.test.ts`, `eventDecisionsAndMomentsMigration.test.ts`, con su comentario), actualizar `pendingMigrationsCompatibility.test.ts` y `cashMigrationAndBankSyncGuards.test.ts` (rutas), y commitear.
6. Desplegar la función **enable-banking-sync-transactions**. Lanzar una sincronización manual desde Banco y comprobar en `client_errors` y en los registros de la función que no hay errores; comprobar que los movimientos nuevos se enlazan como antes (tickets/gastos a mano **no** pagados en efectivo siguen uniéndose al cargo).
7. Desplegar el cliente (push → flujo habitual de GitHub Pages). Comprobar el trozo (chunk) propio de Compras y de Economía, no solo `index-*.js` (la app está dividida por rutas).
8. **Comprobaciones finales en la app real**, en un móvil Android y en iPhone Safari (no probado hasta ahora): ver §5.

## 4. Recuperación

| Si falla… | Qué hacer | Se pierde |
|---|---|---|
| Una migración da error al aplicarse | Nada: cada una es una transacción, se aplica entera o no se aplica | nada |
| 0311 en producción con datos de carteras ya creados | `0311_..._down.sql` (antes, deshacer cada vínculo de retirada con `cash_unlink_bank_expense` para devolver su categoría al apunte bancario) | carteras, movimientos, pagos mixtos, vínculos de devolución. **No** se borran gastos ni compras; las filas de Economía de devoluciones se conservan como ingresos «Devoluciones» |
| 0310 | `0310_..._down.sql` | decisiones de equivalencia y votos compartidos. Productos y precios intactos |
| 0309 | `0309_..._down.sql` (después de 0311) | marca «compra manual» y forma de pago. Las compras y sus gastos siguen |
| Sincronizador con problemas | Redesplegar la versión anterior del archivo (git). Efecto: vuelve a unir por importe sin mirar la forma de pago | nada |
| Cliente con problemas | Redesplegar el commit anterior. Las migraciones son compatibles hacia atrás (columnas nuevas nulas) | nada |
| Datos dañados | Restaurar la copia diaria / punto en el tiempo de Supabase (último recurso) | lo registrado desde la copia |

**Único punto de no retorno parcial:** `link_purchase_to_bank_expense` (el usuario acepta «Sí, vincular») **retira** el apunte duplicado del banco. El movimiento bancario original (`bank_transactions`) se conserva y pasa a apuntar al gasto de la compra, así que el apunte retirado se puede reconstruir (importe, fecha y descripción están en el movimiento). Solo ocurre por decisión explícita, nunca automática, y solo si ese apunte no tiene compra, cartera ni devolución propias.

## 5. Lista de comprobación después del despliegue

- [ ] **Compra rápida** «Panadería — 8 € — Efectivo» sin cartera: un solo gasto en Economía, sin movimiento de cartera, aparece en Historial.
- [ ] Mismo gasto, **con tarjeta**, y luego sincronizar el banco: el cargo se une a la compra (`ticket_banco`), un solo gasto.
- [ ] Mismo gasto **en efectivo** con un cargo bancario de igual importe y fecha cercana: **no** se unen.
- [ ] Gasto a mano en Economía + compra manual igual en Compras: aparece el aviso «Ya tienes este gasto apuntado»; al aceptar, un solo gasto.
- [ ] **Justificante posterior** con 📎 y subiendo un ticket del mismo importe («Sí, es la del…»): una sola compra, un solo gasto.
- [ ] **Cartera**: crear familiar y personal; entrada, salida, ajuste; traspaso entre ambas (ni ingreso ni gasto: Resumen y Estadísticas no cambian); saldo cero y gasto de 25 € → aviso con las tres opciones; registrar igualmente deja saldo negativo «por regularizar».
- [ ] **Retirada del banco** de 100 €: al marcarla, desaparece de gastos del mes y la cartera sube 100 €; «Deshacer» lo restituye.
- [ ] **Pago mixto** 60 € = 20 efectivo (cartera) + 40 tarjeta: un solo gasto de 60 €, la cartera baja 20 €, y el cargo de 40 € del banco se une a esa compra.
- [ ] **Devolución** parcial (15 €) y del resto: gasto neto y estadísticas correctos (Devoluciones restan, no suman ingreso); cartera sube si fue en efectivo; el abono bancario posterior se une a ella.
- [ ] **Duplicados**: el panel solo sugiere; «No, son distintas» no vuelve a salir.
- [ ] **Aislamiento**: con dos cuentas de familias distintas, ninguna ve carteras, pagos, devoluciones ni decisiones de equivalencia de la otra.
- [ ] **Comparador**: ficha de producto con €/kg correcto y lista de la compra con total por tienda y aviso de precios antiguos.
- [ ] Revisar `client_errors` 24 h después.

## 6. Decisiones pendientes para Jennifer

1. **Aplicar las migraciones y desplegar** (autorización explícita, no concedida todavía).
2. **Aprobar los requisitos** CAT-1, COM-1, COMP-1, EFE-1 y ECO-1 en `docs/PEPA_CONTROL_REQUISITOS.md` (hoy ninguno está en «Aprobado»).
3. Si las **carteras personales** de los adultos deben verse entre sí en modo «compartido» (hoy sí: se comportan igual que las cuentas bancarias; en modo privado solo ve cada uno la suya y las familiares).
4. Si se quiere **pantalla de revisión** de equivalencias compartidas y de sugerencias de ahorro (no hecha).
5. Versión del sincronizador: el cambio es pequeño y está probado por inspección y por pruebas estructurales, pero **no se ha podido ejecutar contra el banco real** sin desplegarlo; conviene vigilar la primera sincronización.
