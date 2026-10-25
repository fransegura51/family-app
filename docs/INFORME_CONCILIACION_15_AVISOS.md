# Informe: los 15 avisos «posibles duplicados o pagos por vincular» (25/10/2026)

Solo lectura sobre la base real (familia Hepburn). **No se ha modificado ningún dato.** El único ensayo de cambio se hizo dentro de una transacción REVERTIDA (nada quedó guardado).

## Qué son

15 compras de **Mercadona** (ticket con productos) de junio, julio y agosto de 2026. Cada una existe **dos veces en Economía**:

| Qué | Origen | Cuenta como gasto |
|---|---|---|
| El gasto del ticket | `source = 'ticket'`, creado el 14/09/2026 (08:28–08:34 UTC) al subir 16 tickets antiguos de golpe | Sí |
| El cargo del banco | `source = 'banco'`, importado el 08–10/09/2026 | Sí |

Ninguno de los dos está vinculado con el otro (`bank_transactions.matched_expense_id` apunta solo al apunte del banco; el gasto del ticket no tiene movimiento bancario). **Es duplicación real: la misma compra suma dos veces en Resumen, Estadísticas y Presupuestos de esos meses.**

| # | Fecha ticket | Fecha banco | Días | Importe | Comercio (ticket → banco) |
|---|---|---|---|---|---|
| 1 | 11/06 | 12/06 | 1 | 211,93 € | Mercadona → MERCADONA ALMORADI-ALMORADI |
| 2 | 16/06 | 16/06 | 0 | 37,16 € | idem |
| 3 | 20/06 | 22/06 | 2 | 108,79 € | idem |
| 4 | 25/06 | 25/06 | 0 | 91,57 € | idem |
| 5 | 29/06 | 29/06 | 0 | 87,81 € | idem |
| 6 | 04/07 | 06/07 | 2 | 65,46 € | idem |
| 7 | 09/07 | 09/07 | 0 | 86,54 € | idem |
| 8 | 15/07 | 15/07 | 0 | 79,15 € | idem |
| 9 | 18/07 | 20/07 | 2 | 96,01 € | idem |
| 10 | 22/07 | 22/07 | 0 | 87,19 € | idem |
| 11 | 31/07 | 31/07 | 0 | 80,75 € | idem |
| 12 | 03/08 | 03/08 | 0 | 120,08 € | idem |
| 13 | 08/08 | 10/08 | 2 | 65,95 € | idem |
| 14 | 11/08 | 11/08 | 0 | 120,53 € | idem |
| 15 | 14/08 | 14/08 | 0 | 48,75 € | MERCADONA CALLOSA DEL SEG-ALMAJAL |

**Total contado dos veces: 1.387,67 €.** Los dos ejemplos del encargo (14/08 · 48,75 € y 11/08 · 120,53 €) son los casos 15 y 14.

## Comprobaciones hechas para cada caso

- Compra original: existe, con ticket y productos (10–45 líneas); 5 de los 15 con foto guardada y 10 sin foto (la foto se borra a los 3 meses): **la foto no influye**.
- Movimiento bancario candidato: **exactamente uno** por compra (mismo importe al céntimo, 0–2 días, comercio compatible); y cada cargo solo encaja con una compra (ningún importe repetido en esas fechas). Una sola cuenta bancaria.
- ¿Ya vinculado? No. ¿Gasto económico separado? Sí (el del banco). ¿El cargo del banco tiene compra, cartera o devolución propias? No.
- Pagos: ninguna es en efectivo ni mixta (sin forma de pago, sin cartera): la regla «el efectivo nunca se empareja con el banco» no interviene.

## Por qué aparecen ahora

Los avisos los enseña la detección de duplicados que se añadió en la última entrega (ECO-1i). **La duplicación ya existía desde septiembre; el aviso la ha hecho visible.** Esos 15 quedaron sin vincular porque la vinculación solo se intenta en el momento de crear el ticket o de importar el cargo, y aquí los 16 tickets se subieron cuando el banco ya había traído sus cargos. Probablemente intervino una versión anterior de la unión «ticket → banco» (el 17/10 se corrigió el alta de tickets para buscar el gasto existente), pero no se puede saber qué versión exacta lo hizo; sí se ha comprobado que el código actual de alta de tickets las habría unido.

Además se ha encontrado y corregido un **camino sin conciliar**: al **editar** un ticket que no tenía gasto (se le pone importe después), la edición creaba un gasto nuevo sin buscar el del banco. Ahora busca primero (`updateReceipt`).

## Ensayo de la vinculación (transacción revertida)

Con la función que ya existía (`link_purchase_to_bank_expense`, ECO-1e), aplicada a los 15 casos a la vez como Jennifer:

- Pares encontrados y vinculados: **15 de 15**, sin errores.
- Gasto jun–ago: **14.010,68 € → 12.623,01 €** (−1.387,67 €; 222 → 207 apuntes).
- Movimientos bancarios (`bank_transactions`): **idénticos** (misma suma de control; 0 modificados, 0 borrados).
- Orígenes: `banco` 332 → 317, `ticket` 16 → 1, `ticket_banco` 66 → 81.
- 15 anotaciones en el registro de operaciones (`purchase_audit_log`), cada una reversible con «Deshacer».
- Después: se revirtió todo. Estado real intacto.

## Qué cambia en la app (sin tocar datos todavía)

- **Conciliación automática** (`domain/bankReconciliation.ts`): coincidencia **segura y única** (importe al céntimo, comercio conocido y compatible, ≤ 3 días, una sola candidata en los dos sentidos) → se vincula sola al abrir Compras registradas (máx. 25 por apertura), con aviso y «Deshacer». La foto no se mira.
- **Dudosa** (4–7 días, comercio desconocido) o **varias coincidencias** → solo se sugiere («Sí, vincular / No, son distintas»).
- **Ya vinculada** (origen `ticket_banco`) → no vuelve a aparecer. Efectivo/mixto nunca. Un cargo con compra, cartera o devolución propia no se toca.
- El aviso «posibles duplicados o pagos por vincular» pasa a contar **solo lo que necesita intervención**.
- **Los 15 casos son todos «segura y única»**: en cuanto se publique el cliente y se abra Compras registradas, se vincularán solos (con aviso y deshacer). Hasta entonces no se toca nada.

## Decisiones humanas pendientes

Ninguna de los 15: no hay ambigüedad. Queda a decisión del usuario **autorizar la publicación** (la vinculación ocurrirá al abrir la app publicada). Si prefiere revisarlos uno a uno, se puede publicar con la vinculación automática apagada (`autoLink={false}`) y aceptarlos a mano.

## Deshacer

Cada vinculación queda anotada. «Deshacer» (aviso tras la vinculación automática) restituye el apunte del banco, el origen del gasto del ticket y los vínculos, una sola vez por anotación.

## Comprobación final antes de publicar (25/10/2026): qué se conserva al vincular

Al repasar cada vinculación apareció un fallo que habría perdido datos: **14 de los 15 cargos del banco llevaban la etiqueta «Comun» puesta a mano**, y los tickets no tenían etiqueta. La función de vinculación (0312) retira el apunte duplicado del banco, así que esa etiqueta se habría perdido (y, con ella, el reparto «Común» de esas compras en las estadísticas por etiqueta). Se corrigió en la migración 0318 (aplicada el 25/10/2026) y se ensayó otra vez con los 15 casos dentro de una transacción revertida:

| Se conserva | Resultado del ensayo (15 casos) |
|---|---|
| La compra original (importe, fecha, tienda, categoría, presupuesto) | 0 diferencias |
| El justificante (fila del ticket, con o sin foto) y sus productos (10–45 líneas por compra) | 0 diferencias |
| La etiqueta que ya tenía el cargo del banco | Heredada por la compra en 14 casos (el 15.º no tenía); si la compra ya tenía, no se pisa |
| El movimiento bancario original | 398 de 398 movimientos, contenido idéntico (solo cambia a qué gasto apunta, ahora la compra) |
| Otros gastos | No se crea ninguno; se retira el apunte duplicado (queda su copia completa en el registro de operaciones) |
| Poder deshacer | 15 anotaciones; «Deshacer» devuelve el apunte del banco con su etiqueta y la compra a como estaba (3/3 probadas); un segundo «Deshacer» se rechaza |

La categoría de la compra se queda como la tenía el ticket («Alimentación»); la del cargo del banco («Supermercado, carnicería…», adivinada por el comercio) queda en el registro de operaciones y se recupera al deshacer.
