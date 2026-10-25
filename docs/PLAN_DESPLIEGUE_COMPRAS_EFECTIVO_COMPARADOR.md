# Plan de despliegue — Compras manuales, comparador, efectivo e integración económica

## ESTADO ACTUAL (24/10/2026)

- **Aplicadas en producción (family-app, `objhgjgrinbhyzscjlbw`)**: `0310_manual_purchases`, `0311_product_equivalences`, `0312_cash_wallets_payments_refunds` y `0312b_least_privilege_new_tables` (esta última solo recorta permisos; el mismo recorte está añadido al final de los archivos 0311 y 0312 para que una instalación nueva quede igual). Verificado tras cada una: huella (md5) idéntica de receipts, expenses, products, product_prices, bank_transactions, bank_accounts, budget_categories, family_food_types, family_members, shared_product_learning y point_grants; recuentos iguales; las 14 funciones de 0312 coinciden byte a byte con el archivo; reversión de cada una probada dentro de una transacción revertida.
- **Función del banco DESPLEGADA el 24/10/2026: versión 19** (`ezbr_sha256` `fcebeb5c…8752`, `verify_jwt=false` como la 18; el código publicado coincide con `supabase/functions/enable-banking-sync-transactions/index.ts`). Copia de la 18 para restaurar al instante: `supabase/rollbacks/functions/` (ver `LEEME.md`). Tras el despliegue: cron `sync-bank-transactions-4x-daily` intacto (`0 3,9,15,21 * * *`, activo, mismo comando), llamada sin credenciales → 401 `unauthorized` (la función arranca y no toca el banco), `bank_transactions` sigue en 801 (5 sin enlazar), 0 pagos mixtos, 0 gastos con forma de pago. **No se forzó ninguna sincronización** (cupo PSD2): la primera comprobación real queda para la sincronización programada de las 15:00 UTC (§3.7). Único cambio de datos desde el inicio: un ticket de Amazon subido por la familia a las 10:07 UTC (+1 recibo, +1 gasto, +1 precio).
- **Primera sincronizacion real con la v19 (15:00 UTC del 24/10/2026): correcta.** 2 movimientos nuevos (801 a 803), saldos actualizados, sin duplicados, 0 gastos en efectivo/mixtos enlazados al banco, 5 sin enlazar iguales que antes; el ticket de Amazon (22,80 EUR) se unio a su cargo bancario sin crear otro gasto y el otro cargo (20,50 EUR) creo un gasto nuevo de banco. Los pagos mixtos y las devoluciones manuales siguen sin ejercitarse en datos reales (0 casos): se validaran con el cliente publicado.
- **§3.8 hecho (24/10/2026)**: 0310, 0311 y 0312 movidas a `supabase/migrations/` (sin volver a ejecutarlas), candados de numeracion subidos a 312, tests/typecheck/lint/build en verde. **Falta solo §3.9: el push (publicar el cliente), pendiente de autorizacion.**
- **Cliente PUBLICADO el 24/10/2026** (push `c08095d` a master, integrado con 30 commits de otras sesiones; GitHub Actions: build y deploy en verde; https://fransegura51.github.io/family-app/). Web comprobada: carga sin errores de consola, el paquete publicado contiene Compras manuales, «Añadir productos a mano», comparador y efectivo, y las pantallas anteriores siguen. Banco v19 activo (misma huella), cron intacto, sin duplicados ni cambios economicos tras la publicacion. **Validacion en iPhone y Android pendiente**: guia en `docs/VALIDACION_MOVIL_COMPRAS_ECONOMIA.md`. Todos los requisitos siguen en «Implementado, pendiente de validacion real».
- Las migraciones se renumeraron a 0310, 0311 y 0312 porque otra sesión (rama `puntos-correcciones`) ya había aplicado en producción `0309_point_grant_corrections`. Siguen en `supabase/pending-migrations/` hasta el commit del push (§3.8).
- Pasos que quedan: **§3.6 (función del banco), §3.7 (primera sincronización), §3.8 (mover archivos y subir candados), §3.9 (push)** y la validación en dispositivos (§5).

Histórico: a la hora de redactar este plan, **nada de esto estaba desplegado.** La migración 0308 (aprendizaje compartido) es la última aplicada en producción (proyecto `family-app`, ref `objhgjgrinbhyzscjlbw`). Las migraciones 0310, 0311 y 0312, el cambio del sincronizador bancario y el cliente están **solo en commits locales** (sin push). Este documento es el procedimiento exacto para cuando se autorice.

## 0. Lo primero que hay que saber

1. **Un `git push` a `master` publica el cliente**: `.github/workflows/deploy.yml` se dispara con cada push a `master`, ejecuta `typecheck`, `lint`, `test` y `build`, y publica en GitHub Pages. Las apps de Android e iPhone son una cáscara que abre esa misma web (`capacitor.config.ts`: `server.url = https://fransegura51.github.io/family-app/`), así que **no hay que recompilar APK ni iPhone**, pero el cliente llega a todos los móviles en cuanto GitHub Pages lo publica. Por eso el push es lo ÚLTIMO.
2. El **orden es obligatorio**: migraciones → función del banco → push. Si el cliente llegara antes que las migraciones, Economía fallaría al listar gastos (pide `expenses.payment_method`). Si la función del banco se desplegara antes que 0312, su consulta fallaría y dejaría de traer movimientos.
3. Todo es aditivo (columnas nulas, tablas nuevas, funciones nuevas). Un cliente viejo con la base nueva sigue funcionando; un cliente nuevo con la base vieja, no.

## 1. Qué se despliega

| Orden | Pieza | Archivo | Depende de | Cómo se revierte |
|---|---|---|---|---|
| 1 | Compras manuales | `supabase/pending-migrations/0310_manual_purchases.sql` | 0308 | `supabase/rollbacks/0310_manual_purchases_down.sql` (después de 0312) |
| 2 | Equivalencias (comparador) | `.../0311_product_equivalences.sql` | 0308 (`shared_family_hash`, `shared_text_key_ok`) | `.../0311_product_equivalences_down.sql` |
| 3 | Efectivo, pagos mixtos, devoluciones, duplicados, **registro de operaciones y borrado seguro** | `.../0312_cash_wallets_payments_refunds.sql` | **0310** | `.../0312_cash_wallets_payments_refunds_down.sql` (antes que 0310) |
| 4 | Sincronizador bancario | `supabase/functions/enable-banking-sync-transactions/index.ts` | **0312** | volver a desplegar la versión previa (§6) |
| 5 | Cliente web | todo `src/` | 0310, 0311, 0312 y función | desplegar el commit anterior |

**Compatibilidad entre migraciones** (comprobada): `src/data/pendingMigrationsCompatibility.test.ts` verifica que ningún objeto (tabla, función, trigger, política, columna) se crea en dos migraciones, que 0312 sustituye la restricción `receipts_payment_method_check` creada en 0310 (para admitir «mixto») y que su reversión la deja exactamente como la dejó 0310, que 0311 solo usa funciones que 0308 ya dejó creadas y que cada reversión borra solo lo suyo. Además, 0310+0312 se ejecutaron juntas contra la base real dentro de una transacción revertida (carteras, pagos mixtos, devoluciones, borrado y deshacer, aislamiento) y 0311 aparte (equivalencias y aislamiento). 0312 se editó en su sitio (aún sin aplicar) para añadir el borrado seguro: **no hay 0313**. Las tres llevan los números 0310, 0311 y 0312 porque otra sesión (rama `puntos-correcciones`) ya aplicó en producción una migración propia llamada `0309_point_grant_corrections`; así la numeración sigue sin repetirse al fusionar las ramas.

## 2. Comprobaciones previas (el día del despliegue)

1. **Código:** `git status` sin cambios sin commitear; `npm run typecheck`, `npm run lint`, `npx vitest run src` y `npm run build` en verde (a 24/10: 620 archivos / 11.538 pruebas; typecheck, lint y build limpios). **Cuidado con `docs/comunidad/` y otros archivos sin seguimiento:** no se añaden al commit del push (`git add` solo de archivos concretos); `vitest run` completo en tu equipo falla en `docs/comunidad/db-tests/*` porque esas pruebas necesitan una base de datos local — en GitHub no existen porque no están en el repositorio.
2. **Copia de seguridad:** en el panel de Supabase → Database → Backups, comprobar que hay copia diaria reciente (plan Pro) y anotar la hora. Ninguna migración borra datos, pero es la red de seguridad.
3. **Foto del estado** (para comparar al terminar). Valores del 24/10/2026 (ojo: `votes` sube cuando las familias confirman productos; el resto solo cambia si se usa la app):
   ```sql
   select (select count(*) from receipts) receipts, (select count(*) from expenses) expenses, (select count(*) from products) products,
          (select count(*) from product_prices) prices, (select count(*) from bank_transactions) bank_tx,
          (select count(*) from bank_transactions where matched_expense_id is null) bank_tx_sin_enlazar,
          (select count(*) from shared_product_confirmations) votes;
   ```
   → `receipts 114 · expenses 947 · products 460 · prices 1157 · bank_tx 801 · votes 248`.
4. **Que lo nuevo no exista ya** (las dos consultas deben dar 0):
   ```sql
   select count(*) from information_schema.tables where table_schema='public' and table_name in ('product_equivalences','shared_equivalence_votes','cash_wallets','cash_movements','purchase_payments','purchase_refunds','purchase_duplicate_decisions','purchase_audit_log');
   select count(*) from information_schema.columns where table_schema='public' and column_name in ('is_manual','payment_method') and table_name in ('receipts','expenses');
   ```
5. **Categorías estándar en cada familia** (las funciones de devoluciones y retirada del banco las necesitan; el 24/10 estaban las tres en la familia de prueba usada). Esperado: 3 en todas las familias que usan Economía:
   ```sql
   select f.name, count(*) filter (where c.catalog_key in ('i.ingreso.devoluciones','g.movimientos_internos.transferencias_propias','i.movimientos_internos')) as de_3
   from families f left join budget_categories c on c.family_id=f.id group by f.name order by 1;
   ```
   Una familia con menos de 3 no se rompe: esas dos operaciones devuelven un mensaje claro.
6. **Función del banco desplegada ahora** (para poder volver): versión **18**, `verify_jwt = false`, actualizada el 25/09/2026, `ezbr_sha256 = 48460154487f7cb49f103b14692ef625600a9e25c648f4fd52d11aea3ff5aa13`. Guardar también su código (`get_edge_function`). El 24/10 se comparó con el archivo del repositorio anterior a los cambios y coincide en estructura y comentarios; si quieres certeza total, diferéncialos antes de desplegar.
7. **Ventana:** aplicar fuera de la sincronización del banco (pg_cron la lanza 4 veces al día, `0077_schedule_bank_sync.sql`; mirar la hora en `select * from cron.job`).
8. **Asesores de Supabase** (seguridad) antes de empezar: hoy hay 4 avisos (1 INFO `rls_enabled_no_policy`, 1 WARN `extension_in_public`, 2 WARN de funciones `SECURITY DEFINER` ejecutables). Tras aplicar se esperan **más** del mismo tipo, por diseño: las tablas `shared_equivalence_votes`, `shared_product_confirmations`… tienen RLS y ninguna política (solo accede el servidor) y las funciones nuevas son `SECURITY DEFINER` concedidas solo a `authenticated` y comprueban permisos dentro. Cualquier aviso de otro tipo (p. ej. una tabla sin RLS) es un fallo a corregir.

## 3. Procedimiento exacto

Con el Supabase MCP (o el editor SQL del panel, pegando el contenido de cada archivo tal cual):

1. **Aplicar 0310.** `apply_migration` con nombre `manual_purchases` y el contenido de `0310_manual_purchases.sql`. Verificar:
   ```sql
   select count(*) filter (where is_manual) manuales, count(*) filter (where payment_method is not null) con_pago from receipts;  -- 0, 0
   ```
   y los conteos de la foto previa sin cambios.
2. **Aplicar 0311** (`product_equivalences`). Verificar: `select count(*) from product_equivalences` y `from shared_equivalence_votes` → 0; `select * from resolve_shared_equivalences(array['a','b'])` → vacío.
3. **Aplicar 0312** (`cash_wallets_payments_refunds`). Verificar: `expenses.payment_method` existe y todo NULL; las 6 tablas nuevas (`cash_wallets`, `cash_movements`, `purchase_payments`, `purchase_refunds`, `purchase_duplicate_decisions`, `purchase_audit_log`) con 0 filas; `select count(*) from cash_wallet_balances` → 0; `select has_function_privilege('anon', 'public.delete_purchase(uuid)', 'execute')` → `false` y con `'authenticated'` → `true`.
4. **Prueba de humo en SQL** (opcional pero recomendada, en una transacción que termina en error para deshacerlo todo): repetir con una familia de prueba los guiones del 24/10 — carteras y traspaso, pago mixto 60 = 20 + 40, devolución parcial y total, borrar la compra y deshacer, vínculo con el banco y deshacer, usuario de otra familia sin acceso. Sus resultados exactos están en `docs/PEPA_CONTROL_REQUISITOS.md` (EFE-1, ECO-1).
5. **Revisar los asesores de Supabase** (ver §2.8). Si hay algo inesperado, parar y revertir 0312 (§6).
6. **Desplegar la función del banco** `enable-banking-sync-transactions` con **`verify_jwt = false`** (imprescindible: el cron la llama solo con `x-cron-secret`, ver el comentario de la propia función). Con el MCP: `deploy_edge_function` (nombre `enable-banking-sync-transactions`, archivo `index.ts`, `verify_jwt: false`); con la CLI: `supabase functions deploy enable-banking-sync-transactions --no-verify-jwt --project-ref objhgjgrinbhyzscjlbw`. Comprobar que la versión pasa a 19 y que `verify_jwt` sigue en `false`.
7. **Primera sincronización bancaria** (ver §5.3). No continuar hasta que sea correcta.
8. **Preparar el commit del push:** mover `0310`, `0311` y `0312` de `supabase/pending-migrations/` a `supabase/migrations/`; en los cuatro archivos de prueba que fijan la última migración cambiar `toBe(308)` por `toBe(312)` (o `toBe(313)` si antes se fusiona otra migración: comprobar la última que haya en `supabase/migrations/`) y su comentario (`src/ui/financeUiRefunds.test.ts`, `src/ui/eventGuestBreakdown14B.test.ts`, `src/data/refundsGuards.test.ts`, `src/data/eventDecisionsAndMomentsMigration.test.ts`); actualizar las rutas en `pendingMigrationsCompatibility.test.ts` y `cashMigrationAndBankSyncGuards.test.ts`; pasar `typecheck`, `lint`, `vitest run src`, `build`; commit.
9. **`git push origin master`** → GitHub Actions publica (unos minutos). Seguirlo en la pestaña Actions; si falla un paso, no se publica nada.
10. Comprobar en la web publicada que el trozo (chunk) propio de Compras/Economía ya trae la novedad, no solo `index-*.js` (la app está dividida por rutas): buscar en el código servido el texto `Sin ticket`.
11. Pasar la lista de §5.

## 4. Comprobación de la copia publicada

- Abrir `https://fransegura51.github.io/family-app/` en el navegador del ordenador con la caché vacía (Ctrl+Shift+R). En Compras → Tickets debe verse «📷 Con ticket / ✍️ Sin ticket».
- La app es una PWA con service worker (139 archivos en precaché): **un móvil que ya la tiene abierta puede seguir con la versión anterior hasta cerrarla y abrirla dos veces**.

## 5. Validación en los dispositivos reales (nada de esto se ha podido probar sin dispositivos)

Usar una **familia de prueba** (p. ej. «Familia Prueba») o, en la real, importes pequeños y reconocibles, y borrar lo creado al terminar con «Borrar» (que además prueba el borrado seguro).

### 5.1 iPhone Safari (y la PWA instalada en la pantalla de inicio)

Requisito: **iOS 16 o superior** (el aviso «Ya tienes este gasto…» usa `requestSubmit()`; en iOS 15 o anterior ese botón no enviaría el formulario). Comprobar en Ajustes → General → Información.

1. Cerrar PEPA del todo (deslizar hacia arriba en el selector de apps) y abrirla **dos veces**. Si sigue sin verse «Sin ticket»: Ajustes → Safari → Avanzado → Datos de sitios web → buscar `fransegura51.github.io` → Eliminar, y volver a abrir (si es la PWA de la pantalla de inicio, borrarla y volver a añadirla desde Safari).
2. **Compra rápida:** Compras → Tickets → «✍️ Sin ticket»; escribir Panadería, importe `8,50` con el teclado (la coma debe aceptarse), elegir Efectivo, Guardar. Debe tardar pocos segundos, sin pasos extra.
3. **Teclado y pantalla:** el teclado no debe tapar el botón Guardar (hacer scroll); los selectores (forma de pago, cartera) se abren a pantalla completa de iOS; los campos de fecha abren el selector nativo.
4. **Pago mixto:** importe 60, «+ Pagar con varios medios» → 20 efectivo + 40 tarjeta: debe verse «✓ Cuadra con el total»; con 30 + 40 debe avisar «Sobran 10,00 €».
5. **Carteras:** Economía → Banco → «💶 Efectivo (opcional)» → crear una cartera con saldo 0 → registrar un gasto en efectivo de 25 € con esa cartera: sale el aviso «Tu cartera tiene 0,00 € y estás registrando un gasto de 25,00 €. ¿Quieres continuar?» (ventana centrada, botones tocables sin zoom raro). «Registrar igualmente» → saldo −25,00 € «por regularizar».
6. **Devolución:** en la fila de esa compra, ↩️ → 10 € → «Registrar devolución» → la fila muestra «Devueltos 10,00 € · neto …».
7. **Borrar y deshacer:** borrar la compra → ventana «Borrar «…»» con lo que pasará → «Borrar la compra» → aparece «Deshacer» → tocar: la compra vuelve.
8. **Ticket posterior:** en una compra sin ticket, 📎 → elegir foto (cámara y fototeca) → «Añadir ticket»: sigue habiendo una sola compra.
9. Girar el móvil y volver: ningún formulario pierde lo escrito.

### 5.2 Android (Chrome y la app PEPA)

Probar **las dos cosas**: Chrome (a pantalla completa y en la PWA) y la **app PEPA** (cáscara de Capacitor, que carga la misma web).

1. Cerrar la app desde «recientes» y abrirla dos veces (el WebView puede conservar la versión anterior). Si no se actualiza: Ajustes de Android → Aplicaciones → PEPA → Almacenamiento → Borrar **caché** (no los datos, para no cerrar la sesión).
2. Repetir los pasos 2 a 9 del iPhone. Particular de Android: el botón «atrás» del sistema con la ventana «Borrar compra» o el aviso de saldo abiertos debe cerrarlos o salir de la pantalla sin dejar la compra a medio borrar; el selector de fotos debe ofrecer cámara y archivos.
3. Con la app nativa: confirmar que los permisos de ubicación y notificaciones siguen igual (no se ha tocado nada nativo, pero se comprueba que la app abre sin errores).

### 5.3 Primera sincronización bancaria (el punto más delicado)

La función modificada no se ha ejecutado nunca contra el banco real; sus reglas están probadas con una base de mentira (`src/data/bankSyncMixedPayments.test.ts`, 14 casos, que fallan si se quita el filtro). Procedimiento:

**Antes** (SQL, anotar el resultado):
```sql
select count(*) filter (where matched_expense_id is null) sin_enlazar, count(*) total from bank_transactions;
select source, count(*) from expenses group by source order by 1;
```
**Lanzar:** Economía → Banco → «Sincronizar movimientos» (periodo por defecto) — la primera vez conviene hacerla a mano y no esperar al cron. Si hay varias cuentas, se sincronizan todas.

**Mirar el registro de la función** (Supabase → Edge Functions → `enable-banking-sync-transactions` → Logs, o `query_logs`): debe responder `ok: true` y cada cuenta con `synced` y sin `error`. Cualquier `error` → ir a §6 (volver a la versión 18).

**Después** (SQL; los tres primeros deben dar 0):
```sql
select count(*) from bank_transactions where matched_expense_id is null;                                    -- 0: todo enlazado
select count(*) from bank_transactions bt join expenses e on e.id = bt.matched_expense_id where e.payment_method = 'efectivo';  -- 0: ningún efectivo enlazado al banco
select count(*) from expenses where source = 'banco' and payment_method is not null;                         -- 0
select source, count(*) from expenses group by source order by 1;  -- comparar con el «antes»: solo deben crecer 'banco' y 'ticket_banco' por movimientos nuevos
```
**Prueba con dinero real, mínima** (recomendada, 2 compras pequeñas, un mismo importe NO usado en otro gasto de esa semana):
1. Compra A: pagar **con tarjeta** 1,37 € en cualquier tienda; en PEPA registrarla «Sin ticket» con forma de pago Tarjeta **antes** de que llegue el cargo. Al sincronizar (cuando el banco lo publique, puede tardar horas), el cargo debe **unirse a esa compra** (origen «ticket_banco»), sin gasto nuevo.
2. Compra B: pagar **en efectivo** 1,37 € (mismo importe) y registrarla como Efectivo. Si el banco trae algún cargo de 1,37 € de otro comercio, **no** debe unirse a la compra en efectivo.
3. (Opcional) Pago mixto: una compra de 2,00 € pagada 0,60 € en efectivo + 1,40 € con tarjeta, registrada con «+ Pagar con varios medios» antes del cargo: al sincronizar, el cargo de 1,40 € debe unirse a la compra; el gasto sigue siendo de 2,00 €.

Si algo no cuadra: no borrar nada a mano; ir a §6.

## 6. Recuperación

| Si falla… | Qué hacer | Se pierde |
|---|---|---|
| Una migración da error al aplicarse | Nada: cada una es una transacción, se aplica entera o no | nada |
| Hay que quitar 0312 con datos de carteras ya creados | Primero, si se quiere conservar algo, deshacer con `restore_economy_log` las operaciones recientes y `cash_unlink_bank_expense` en cada retirada del banco (devuelve su categoría al apunte). Después `supabase/rollbacks/0311_..._down.sql` | carteras, movimientos, pagos mixtos, devoluciones vinculadas y el **registro de operaciones** (sin él ya no hay deshacer). Gastos y compras NO se borran; las filas «Devoluciones» quedan como ingresos de devolución |
| 0311 | `0310_..._down.sql` | decisiones de equivalencia y votos compartidos. Productos y precios intactos |
| 0310 | `0309_..._down.sql` (siempre después de 0312) | marca «compra manual» y forma de pago |
| Sincronizador con problemas | Redesplegar la versión anterior: `git show 3e5b1c6:supabase/functions/enable-banking-sync-transactions/index.ts` (con `verify_jwt = false`), o el código guardado de la versión 18 | nada. Los movimientos que no se hubieran enlazado quedan sin enlazar y se enlazan solos en la siguiente sincronización |
| Cliente con problemas | `git revert` del commit publicado y push (o redesplegar el commit anterior desde Actions → Run workflow). Las migraciones son compatibles hacia atrás | nada |
| Datos dañados | Restaurar la copia diaria de Supabase (último recurso) | lo registrado desde la copia |

**Operaciones que retiran registros económicos, y cómo se deshacen** (todas anotadas en `purchase_audit_log`, que solo ve la familia con acceso a «dinero»):

- **Borrar una compra** (`delete_purchase`): las carteras quedan coherentes (el efectivo del pago vuelve a la cartera; el de la devolución se retira), las devoluciones se borran con la compra y **los movimientos bancarios originales nunca se borran**: se re-apuntan a un apunte económico del banco recreado. Deshacer: `select restore_economy_log('<id del registro>')` (desde la app, el botón «Deshacer» justo después). No recupera la foto del ticket.
- **Vincular con el banco** (`link_purchase_to_bank_expense`): conserva el movimiento bancario y retira solo el apunte económico duplicado. Deshacer igual.
- **Retirar un duplicado** (`remove_duplicate_expense`): solo gastos propios, nunca apuntes del banco. Deshacer igual.
- Ver los últimos: `select id, kind, created_at, restored_at, summary from purchase_audit_log order by created_at desc limit 20;`

## 7. Lista de comprobación después del despliegue

- [ ] **Compra rápida** «Panadería — 8 € — Efectivo» sin cartera: un solo gasto en Economía, sin movimiento de cartera, aparece en Historial.
- [ ] Mismo gasto con **tarjeta** y luego sincronizar: el cargo se une a la compra (`ticket_banco`), un solo gasto.
- [ ] Mismo gasto **en efectivo** con un cargo bancario de igual importe y fecha cercana: **no** se unen.
- [ ] Gasto a mano en Economía + compra manual igual en Compras: aviso «Ya tienes este gasto apuntado»; al aceptar, un solo gasto.
- [ ] **Justificante posterior** con 📎 y subiendo un ticket del mismo importe («Sí, es la del…»): una sola compra, un solo gasto.
- [ ] **Cartera**: familiar y personal; entrada, salida, ajuste; traspaso entre ambas (Resumen y Estadísticas no cambian); saldo cero y gasto de 25 € → aviso con las tres opciones; «Registrar igualmente» deja saldo negativo «por regularizar».
- [ ] **Retirada del banco** de 100 €: desaparece de gastos del mes, la cartera sube 100 €, «Deshacer» lo restituye.
- [ ] **Pago mixto 60 € = 20 efectivo + 40 tarjeta:** un solo gasto de 60 €; la cartera baja 20 €; el cargo de 40 € se une a esa compra; un cargo de 60 € o de 20 € NO se une.
- [ ] **Devolución** parcial y del resto: gasto neto y estadísticas correctos (resta, no suma ingreso); cartera sube si fue en efectivo; el abono bancario posterior se une a ella.
- [ ] **Borrar una compra con devolución en cartera:** el aviso explica lo que pasará; las carteras quedan sin movimientos huérfanos; los movimientos del banco siguen contando; «Deshacer» devuelve todo.
- [ ] **Duplicados:** el panel solo sugiere; «No, son distintas» no vuelve a salir; quitar un duplicado pide confirmación y se puede deshacer.
- [ ] **Aislamiento:** con dos cuentas de familias distintas, ninguna ve carteras, pagos, devoluciones, decisiones de equivalencia ni el registro de operaciones de la otra.
- [ ] **Comparador:** ficha de producto con €/kg correcto; lista de la compra con total por tienda y aviso de precios antiguos.
- [ ] Revisar `client_errors` a las 24 horas y los avisos de los asesores de Supabase.

## 8. ¿Hay algo que impida publicar?

**Nada técnico pendiente de corregir.** Impiden publicar hoy, solo, estas decisiones/acciones tuyas:

1. **Autorización** para aplicar las migraciones, desplegar la función y hacer push (no concedida todavía).
2. **Aprobación** de los requisitos CAT-1, COM-1, COMP-1, EFE-1 y ECO-1 en `docs/PEPA_CONTROL_REQUISITOS.md` (ninguno está en «Aprobado»).

Riesgos conocidos, no bloqueantes pero a vigilar:

- La función del banco modificada **no se ha ejecutado contra el banco real** (sí contra una base de mentira, con 14 casos, y su lógica de SQL equivalente contra la base real). La primera sincronización (§5.3) es la comprobación definitiva; la vuelta atrás es redesplegar la versión anterior.
- **Nada se ha probado en iPhone ni Android reales** (§5). El código usa funciones estándar (`requestSubmit`, `input type=date/number`, modales propios), pero no se ha visto en pantalla.
- Las pruebas de GitHub corren con **Node 20**; en este equipo, con Node 24. Las nuevas no usan nada propio de Node 24, pero no se han podido ejecutar con Node 20. Si el paso `npm test` fallase en Actions, no se publica nada.
- «Deshacer» solo se ofrece justo después de la operación en pantalla; el registro permanece (por SQL se puede deshacer más tarde). No hay pantalla de historial (no se ha abierto una función nueva).
- La foto de un ticket borrado no se recupera.
- Casi todo el conocimiento compartido del comparador es provisional (solo hay 2 familias con datos reales).
- Si el banco abona una devolución por un importe distinto del registrado, no se une y queda como ingreso de devolución aparte.

## 9. Decisiones pendientes para Jennifer

1. Aplicar y desplegar (§3) y cuándo.
2. Aprobar los requisitos.
3. Si las carteras personales de los adultos deben verse entre sí en modo «compartido» (hoy sí, como las cuentas bancarias; en modo privado, cada uno ve la suya y las familiares).
4. Si se quiere una pantalla de «Operaciones recientes» para deshacer más tarde y una de revisión de equivalencias compartidas (no hechas).

---

## Anexo (25/10/2026) — bloque de correcciones tras la validación en iPhone

Contiene: estadísticas con una sola definición de gasto real, carteras en «Mis cuentas» y «Tendencia del saldo», conciliación automática compra ↔ banco, «Ver desglose» de «Cuánto he gastado», recuadros de filtro compactos y retiradas de efectivo.

**Orden y riesgos (nada de esto está desplegado ni aplicado):**

1. **Cliente (push a master)** — no necesita migración. Efectos al publicar y abrir «Compras registradas»: los **15 avisos históricos** (`docs/INFORME_CONCILIACION_15_AVISOS.md`) se vincularán solos, con aviso y «Deshacer» (ensayado en transacción revertida: 15/15, gasto jun–ago −1.387,67 €, movimientos bancarios idénticos). Si se prefiere revisarlos a mano, publicar con `autoLink={false}` en `PurchaseDuplicatesPanel`.
2. **Migración `0318_cash_withdrawals.sql`** — **APLICADA el 25/10/2026** (con autorización): crea «Retirada de efectivo», permite repartir una retirada entre carteras y vincular una entrada ya apuntada, y **sustituye** `link_purchase_to_bank_expense` / `restore_economy_log` para que vincular una compra con su cargo del banco no pierda la etiqueta (hallazgo en la comprobación final de los 15 casos). Ensayada entera en transacciones revertidas (retiradas: 11 comprobaciones; vinculación de los 15: 0 diferencias, 14 etiquetas heredadas, banco intacto, deshacer 3/3); reversión probada. Reversión: `supabase/rollbacks/0318_cash_withdrawals_down.sql`.
3. **Función bancaria**: v19 sin cambios. No hay que redesplegar nada.

**Comprobación después de publicar:** que los 15 casos pasen a un solo gasto (Resumen de junio–agosto baja 1.387,67 €), que «Deshacer» devuelva el apunte del banco, y que no queden avisos de duplicados en Compras registradas salvo casos dudosos.

**Estado final del anexo (25/10/2026):** migración 0318 aplicada (huellas de gastos, movimientos bancarios, carteras, movimientos de cartera: idénticas antes y después; +7 categorías «Retirada de efectivo»); cliente publicado en el commit 637fa7d (build y deploy en verde); función bancaria v19 sin cambios. **Pendiente de comprobar tras abrir «Compras registradas» en el iPhone:** que se crean 15 anotaciones «bank_expense_merged», que desaparecen 15 apuntes duplicados del banco, que el gasto de junio–agosto baja 1.387,67 € y que 14 compras quedan con la etiqueta «Comun». Para deshacerlo: «Deshacer» en el aviso (o restore_economy_log por anotación).
