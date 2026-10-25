# AUDITORÍA (solo lectura) — Tutoriales «Enséñame» de ECONOMÍA

Repositorio leído: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (master, HEAD `d3641f5`, 25/10/2026).
Alcance: `src/ui/FinanceScreen.tsx` (12.461 líneas), `BankAccountsModal.tsx`, `CashAndPaymentsUi.tsx`, `MenuSettingsScreen.tsx` (sección Economía), `src/domain/*` (finance, financeCompute, forecastReconciliation, movementForm, pending, classifyPurchase, cashWallet, refunds…), `src/data/{finance,cash,bank,forecast,receipts}.ts`, función `enable-banking-sync-transactions`, migraciones 0173/0312 (solo leídas), tutoriales `defs/g2/economia.ts` y `defs/g9/economia.ts` + los dos de `g10/ajustes.ts`, explicaciones `explainers/g2/economia.ts`, fichas `catalog/cardsOtros.ts`, motor `tours/{engine,TourRunner,domTargets}`.

Convención: «(L)» = verificado leyendo código; «(no comprobado)» = no se puede saber leyendo (ejecución real, iPhone/Android, servidor, datos). NADA aquí está «probado».

---------------------------------------------------------------------------------------------------

## 0. Resumen en 12 líneas

1. Hoy hay 11 piezas «Enséñame»/visita de Economía (1 visita + 10 tutoriales, 60–110 s cada uno, 59 pasos en total) y 5 explicaciones «Cómo funciona PEPA». Cubren solo: apuntar movimiento, cambiar categoría, clasificar pendientes, crear presupuesto, añadir pago previsto, revisar conciliación, ver estadísticas, conectar banco, mes contable, modo de cuentas.
2. Desde el 24/10 existen y están publicados (cliente publicado; migración 0312 aplicada; sincronizador v19) **carteras de efectivo, pagos con varios medios, devoluciones de compra, detección de duplicados, borrado seguro con «Deshacer»**: NINGUNO tiene ficha, tutorial ni explicación en el sistema nuevo de Ayuda (solo texto en `legacyHelp.ts`) y ni siquiera están en `featureInventory.ts`. Los documentos de estado dicen «Implementado, pendiente de validación real en iPhone y Android; sin Aprobar».
3. Duplicado fuerte: `tut-economia-cambiar-categoria` y `tut-economia-clasificar-pendientes` repiten los 4 mismos pasos finales (fila → categoría → elegir → guardar). La visita y `conectar-banco` repiten «Mis cuentas / Añadir cuenta». La visita y `ver-estadisticas` repiten «📅 Fecha».
4. Huecos importantes sin tutorial ni ficha: gestionar categorías y etiquetas, Fijo/Variable por movimiento, editar/borrar/compartir un movimiento, filtros de Movimientos, Efectivo, Visión 12 meses / Próximos pagos / ⋯ editar-desactivar, pagos recurrentes detectados (💡), «🔮 Añadir a Previsión», «Importar desde foto o documento», Gestionar movimiento tras conciliar, Desconciliar, historial de presupuestos / eliminar, «📄 Generar informe», Tendencia del saldo / Comparado con periodo anterior / Evolución temporal, Cuentas bancarias en Configuración, Filtros temporales, Colorear movimientos.
5. Incidencias de arranque/resaltado más graves (detalle en §6): (I1) «+ Añadir cuenta» desde cualquier pestaña distinta de Banco NO abre la ventana (contradice la visita); (I2) `revisar-conciliacion` es imposible de completar si no hay propuestas ni histórico (paso 1 obligatorio → «roto» con mensaje genérico); (I3) `cambiar-categoria`/`clasificar-pendientes` se rompen sin ningún movimiento y el aviso «pulsa Salir» nunca se ve; (I4) `apuntar-movimiento` se rompe si hay un filtro de «Ver registros» activo (el botón «+ Nuevo movimiento» se oculta); (I5) carrera de carga: el paso opcional «señal de pendientes» se omite en 350 ms y el siguiente paso afirma «no tienes gastos pendientes» aunque los haya.
6. Discrepancias texto↔código a corregir (§4.3): la ficha `eco-categorias` y el texto de Configuración hablan de «Categorías/Etiquetas» como pestañas y de «renombrar/ordenar» (no existe); el tutorial de estadísticas dice «el total es siempre el mismo» (no en Etiquetas); la visita enumera mal los periodos; las explicaciones de conciliación quedaron desfasadas tras los cambios del 24/10.
7. Regla interna importante NO documentada y con riesgo: «Ingresos» NO suma igual en Resumen (cuenta ingresos a mano) que en Presupuesto (con banco enlazado ignora los apuntados a mano) (§8, R1).
8. Regla interna con riesgo (por lectura, no comprobado en ejecución): borrar con ✕ un movimiento que vino del banco no lo elimina de verdad: el movimiento bancario queda «sin enlazar» y la siguiente sincronización lo vuelve a crear (§8, R2).
9. Lo que NO existe (no presentar como operativo): cuentas manuales no bancarias, tarjetas de crédito/inversión, editar el importe de un presupuesto en pantalla (solo por voz), renombrar/reordenar categorías, crear/editar préstamos e hipotecas (solo plan «En varios pagos»; la sección «Préstamos e hipotecas» solo lee datos antiguos), exportar a CSV/Excel, conversión de divisas, detección automática de traspasos entre cuentas propias, deshacer un «No es este», conciliación automática de pagos previstos, avisos de caducidad del banco dentro de la app.
10. Estructura inicial de la usuaria: casi óptima. Ajustes propuestos: (a) «Conoce Economía» es nivel A (visita), no tutorial B; (b) mover **Presupuestos** de su punto 2 al 5 (es seguimiento, no registro) y así equilibrar duraciones; (c) añadir **modo de cuentas/de quién es cada cuenta** al punto 3; (d) incluir **Efectivo** en el 3 como capítulo marcado «pendiente de validación»; (e) en el 4, la conciliación banco↔ticket/compra es automática → va a nivel C, no a capítulo; solo la conciliación con pagos previstos es interactiva; (f) el **mes contable y los filtros de periodo** van al 5.
11. Propuesta: A = visita «Conoce Economía»; B = 4 tutoriales con 3–4 capítulos cada uno (≈14 capítulos, 1–2 min; recorrido de 4–6 min); C = 5 explicaciones actuales (corregidas) + 6 nuevas.
12. Decisiones de producto reales: §9 (5 puntos).

---------------------------------------------------------------------------------------------------

## 1. INVENTARIO

### 1.1 Tutoriales/visita (volcado `tours_dump.json`, módulo `economia`, 11 entradas)

| id | Tipo | Título | Pasos (obligatorios+opcionales) | Pantalla de inicio | Ficha (`cardId`) | Qué cubre de verdad |
|---|---|---|---|---|---|---|
| `visita-economia` | visita | Conoce Economía | 8 (1 opcional) · 100 s | `/dinero` `economia.resumen` | `eco-nuevo-movimiento` | ☰ menú, Mis cuentas, Añadir cuenta, ⚙️ Configuración cuentas, 📅 Fecha, señal ⏳ pendientes, Resumen, Conclusiones |
| `tut-economia-apuntar-movimiento` | tutorial | Apuntar un gasto o un ingreso | 7 (1 opc.) · 90 s | `economia.movimientos` | `eco-nuevo-movimiento` | «+ Nuevo movimiento» (Gasto/Ingreso, categoría, fecha, importe, opcionales, guardar) |
| `tut-economia-cambiar-categoria` | tutorial | Cambiar la categoría de un movimiento | 4 (1 opc.) · 80 s | `economia.movimientos` | `eco-categorias` | tocar fila → Categoría → Guardar |
| `tut-economia-clasificar-pendientes` | tutorial | Clasificar los gastos pendientes | 7 (2 opc.) · 100 s | `economia.resumen` | `eco-pendientes` | señal ⏳ → filtro «Pendientes» → fila → Categoría → Guardar |
| `tut-economia-crear-presupuesto` | tutorial | Crear un presupuesto | 5 · 80 s | `economia.presupuesto` | `eco-presupuesto` | «+ Nuevo presupuesto» (periodo, categoría, importe, crear) |
| `tut-economia-anadir-pago-previsto` | tutorial | Añadir un pago previsto | 8 (1 opc.) · 110 s | `economia.prevision` | `eco-prevision` | «+ Añadir pago» (concepto, estado, importe, categoría, vencimiento, repetición/«¿Cómo se paga?», crear) |
| `tut-economia-revisar-conciliacion` | tutorial (solo informa) | Revisar una propuesta de conciliación | 4 (3 opc.) · 90 s | `economia.prevision` | `eco-prevision` | «🔎 N pagos por revisar», tarjeta Previsto/Banco, Confirmar, «No es este» |
| `tut-economia-ver-estadisticas` | tutorial (solo mira) | Ver las estadísticas | 3 · 70 s | `economia.estadisticas` | `eco-categorias` (ver I-D5) | 📅 Fecha, 4 vistas del dónut, tarjeta del dónut |
| `tut-economia-conectar-banco` | tutorial (no conecta nada) | Conectar mi banco | 7 (5 opc.) · 110 s | `economia.banco` | `eco-banco` | Mis cuentas, Añadir cuenta, ventana Cuentas bancarias, dueño, «+ Conectar banco», ✕, «🔄 Sincronizar» |
| `tut-economia-mes-contable` | tutorial | Cambiar el día en que empieza el mes contable | 3 · 60 s | `/menu-organizar` `config.economia` | `eco-mes-contable` | Configuración → Economía → Día (1–31) |
| `tut-economia-modo-cuentas` | tutorial (solo explica; `access: familyAdmin`) | Cuentas compartidas o separadas | 3 · 75 s | `/menu-organizar` `config.economia` | `eco-modo-cuentas` | Tarjeta «Modo de cuentas» (no señala ningún botón) |

Los 10 tutoriales usan solo `module: economia`; ningún `access` salvo `modo-cuentas`. Definiciones: `src/help/tours/defs/g2/economia.ts` (visita + 6) y `g9/economia.ts` (clasificar-pendientes, conectar-banco); `mes-contable` y `modo-cuentas` en `defs/g10/ajustes.ts` (líneas ~92 y ~129).

### 1.2 Explicaciones nivel C (`explainers/g2/economia.ts`, verificadas «2026-10-23»)

| id | Título | Tour enlazado | Fichas |
|---|---|---|---|
| `exp-economia-categorizar-movimientos` | Cómo categoriza Economía los movimientos | `tut-economia-cambiar-categoria` | eco-nuevo-movimiento, eco-categorias, eco-banco |
| `exp-economia-pendiente-clasificar` | Por qué queda «Pendiente de clasificar» | `tut-economia-cambiar-categoria` (**debería** ser `…clasificar-pendientes`) | eco-pendientes |
| `exp-economia-conciliacion` | Cómo concilia PEPA banco ↔ tickets/apuntes/pagos previstos | `tut-economia-revisar-conciliacion` | eco-prevision, eco-banco |
| `exp-economia-conexion-bancaria` | Cómo se conecta el banco y qué trae PEPA | **ninguno** (existe `conectar-banco`) | eco-banco |
| `exp-economia-correccion-no-aprende` | Por qué corregir una categoría no enseña a PEPA | `tut-economia-cambiar-categoria` | eco-categorias, eco-pendientes |
| (g5) `exp-cuentas-compartidas-separadas` | modo de cuentas | ninguno | — |

### 1.3 Fichas (`catalog/cardsOtros.ts`) — 8

`eco-nuevo-movimiento`, `eco-pendientes` (tour), `eco-presupuesto` (parcial), `eco-banco` (parcial, tour), `eco-prevision` (parcial), `eco-categorias` (parcial), `eco-modo-cuentas` (tour), `eco-mes-contable` (tour). Solo 4 llevan `tour:` en la ficha; el resto se ofrece por `cardId` (máx. 3 «más tutoriales», `HelpAnswer.tsx:65`). No hay ficha para Efectivo, Estadísticas, Informe, Cuentas bancarias (Configuración), Filtros temporales, Colorear movimientos.

---------------------------------------------------------------------------------------------------

## 2. MAPA FUNCIONAL REAL (qué existe de verdad)

Estados: OK = existe y funciona (por código); PARCIAL; NO EXISTE. «Marca» = `data-help-id` existente hoy.

### 2.0 Estructura de pantalla (FinanceScreen.tsx)
- Pestañas (`SUB_TABS`, L307): Resumen (menú: «🏠 Inicio»), Estadísticas, Movimientos, «Presupuesto Generales» (menú «💰 Presupuesto(s)», migas «Presupuestos»), Banco, Previsión de pagos. Se cambian con el botón ☰ (`EconomiaMenuDropdown`, L778). Desde el 24/10 el ☰ solo tiene «📌 Sacar / 📍 Quitar» (poner la pestaña como botón en pantalla; se guarda en el dispositivo). Ya no hay modo Editar ni accesos personalizados (L798-799).
- Siempre visible bajo la cabecera, en TODAS las pestañas: «Mis cuentas» (`AccountBalanceCards`, L906-998): una tarjeta por cuenta bancaria («Cuenta de «Nombre»» o «Cuenta común», saldo o 🔒 en modo Separadas o «Sincronizando…»), botón «›» (ver todas), «+ Añadir cuenta», enlace «⚙️ Configuración cuentas» (abre Configuración con el grupo Economía desplegado: `state={{group:'economia'}}`, L993; verificado que `MenuSettingsScreen` lee ese estado, L1675-1678). Las carteras de efectivo NO salen aquí.
- «Destinos de Llévame/Enséñame» (`useHelpDestinations`, L469-476): resumen, estadisticas, movimientos, presupuesto, banco, prevision. El destino NO limpia el filtro de Movimientos (ver I4).
- Un menor con Economía restringida solo ve su monedero (`isDineroRestricted`, L458).

### 2.1 Inicio / Resumen (L1870-2204)
| Función | Estado | Notas |
|---|---|---|
| 📅 Fecha (desplegable) | OK | Catálogo completo de 11 periodos (`dateRanges.ts` L23-34, L214-242): Hoy, Esta semana, Mes contable (en el botón; la tarjeta dice «Este mes»), Mes contable anterior, Mes real, Mes real anterior, Este año, Año anterior, Últimos 30 días, Últimos 3 meses, Rango. Cada persona puede desactivar los que no use y marcar un favorito en Configuración → Filtros temporales (L229-315). La visita solo nombra 6. |
| Señal «⏳ N pendientes de clasificar · X €» | OK | solo si `count>0`; cuenta TODAS las fechas (L1860-1868, `domain/pending.ts` L71) |
| Tarjeta «Resumen — periodo»: Ingresos, Gastos, Devoluciones y Gasto neto (solo si hay devoluciones), Ahorro/Balance y Tasa de ahorro, «Ver registros →» | OK | traspasos internos excluidos; devoluciones restan del gasto neto (L2145-2179) |
| Bloque «🏦 Dinero destinado a cuentas de ahorro» | OK (condicional) | si hay traspasos a cuentas de ahorro (L2183) |
| Conclusiones de Pepa (frases rotativas, «+info →», 💡 explicación en algunas) | OK | cambia al deslizar con el dedo o al reabrir (solo eventos táctiles, L2269-2282: sin flechas para ratón) |

### 2.2 Estadísticas (L2767-2994)
| Función | Estado |
|---|---|
| «Tendencia del saldo» (solo con banco enlazado; L1012-1166) | OK, sin tutorial |
| Vistas: Categorías / Etiquetas / Debo-Necesito-Quiero / Fijo-variable (dónut; tocar porción → «Ver movimientos →», «✕ Ver todo») | OK |
| «Comparado con el periodo anterior» (L3042) | OK, sin tutorial |
| «Evolución temporal — últimos 6 meses» (modo real/contable) | OK, sin tutorial |
| Nota ℹ️ de Alimentación vs Compras | OK |

### 2.3 Movimientos (L3285-3843)
| Función | Estado | Notas |
|---|---|---|
| «+ Nuevo movimiento» (modal «Nuevo movimiento») | OK | **solo se pinta si no hay filtro activo** (`onOpenNewMovement && !filter`, L3584). Campos: Gasto/Ingreso, Categoría, Fecha, Importe, Establecimiento (solo gasto), Clasificación (solo categorías de Alimentación/Compras y familia), Etiqueta (con «⚙️ Gestionar etiquetas»), Concepto, Según categoría/Fijo/Variable (solo gasto). Botón «Apuntar gasto»/«Apuntar ingreso». **No tiene «forma de pago» ni cartera**: `addExpense` no admite `paymentMethod` (finance.ts L168-190) |
| Tocar fila → editar inline (mismos campos; categoría de un gasto vía `classify_purchase`; un ingreso con lista simple) | OK | botón extra «🔮 Añadir a Previsión» solo en movimientos de banco |
| ✕ borrar movimiento (doble toque) | OK | ver R2 |
| 🤝 Compartir a Común / ✅ (solo modo Separadas, pestaña Individual) | OK | |
| Filtro «Filtrar por»: Todos, Gastos fijos, Gastos variables, Ingresos, Devoluciones, Categoría, Búsqueda libre, Pendientes (`TYPE_FILTER_OPTIONS` L5364) | OK | |
| «🏦 Cuenta» (solo con >1 cuenta), Individual/Común (Separadas), total «X € gastados · +Y € ingresados» | OK | |
| Iconos de origen ✏️ / 🧾 / 🏦 y nota ℹ️ «categoría por sugerencia» | OK | `SOURCE_META` L3845 |
| Filtro «Ver registros →» desde otras pestañas (tarjeta «Filtro: …», «‹ Volver», «✕ Quitar filtro») | OK | |

### 2.4 Presupuesto(s) (L7082-8588)
| Función | Estado | Notas |
|---|---|---|
| «Presupuestos»: lista del mes contable en curso con barra de progreso; **Eliminar** (con confirmación); **«+ Nuevo presupuesto»**; **Historial** por meses | OK | solo mensual/semanal; categoría o «General»; aviso si duplicas categoría+mes (L8977-8986) |
| Cambiar el importe de un presupuesto | **NO EXISTE en pantalla**; solo por voz de PEPA (`pepa/actions/financeActions.ts` L118-129) | |
| Tarjeta «Resumen» del presupuesto: Ingresos, Presupuesto, Gastado, Balance, desglose por categoría padre/hija, ⏳ pendiente | OK | «Presupuesto/Balance» solo con filtro Mes contable (L8290-8292, 8463) |
| «+ Añadir ingreso» (formulario de ingreso con categoría, fecha, importe) | PARCIAL | **solo si NO hay cuentas bancarias** (L8405). Con banco, «Ingresos» sale solo del banco y los apuntados a mano NO suman aquí (L8311-8324) — pero SÍ suman en Resumen (R1) |
| Dónut «Reparto del gasto por categoría» | OK | |
| «📄 Generar informe» (`openBudgetReport`, L8593) | PARCIAL | abre ventana con «Informe de Economía»: periodo, Ingresos, Gastado, Balance y tabla por categoría (+ pendiente) y lanza el diálogo de imprimir/Guardar como PDF del navegador. Sin CSV/Excel, sin gráficos. Dentro de las apps nativas (`window.open`+`window.print`): no comprobado |
| «Saldo entre personas» (solo Separadas → Común) | OK | reparto por adulto desde su fecha de alta (L7871) |

### 2.5 Banco (L1369-1756) y cuentas
| Función | Estado | Notas |
|---|---|---|
| Conectar banco (Enable Banking): «Añadir cuenta» / Configuración → Economía → «Cuentas bancarias → Gestionar cuentas» abre `BankAccountsModal`; «+ Conectar banco» → País (ES, FI, FR, DE, IT, PT), Banco, IBAN opcional → «Conectar» → se autoriza en la web del banco | OK / **no comprobado** con banco real | El botón «⚙️ Gestionar cuentas» que citaba la auditoría previa ya NO existe en Banco (comentario L1602-1613) |
| De quién es cada cuenta (🏠 Común o miembro) | OK | solo su dueño actual puede cambiarla; una cuenta sin dueño, cualquiera (L71-73) |
| «Desconectar» (confirmación) | OK | **cualquier** persona con acceso a Economía puede conectar/desconectar (RLS `bank_connections: family crud`, 0066) |
| «🔄 Sincronizar movimientos» + «Traer al menos: último mes / últimos 3 meses» (solo con banco activo) y cron 4×/día | OK | |
| Lista «Movimientos del banco (N de M)» con los mismos filtros que Movimientos | OK | la misma tabla `expenses` |
| «💶 Efectivo (opcional)» — carteras | OK, **pendiente de validación en iPhone/Android**, sin marcas ni ayuda nueva | `CashWalletsSection` (CashAndPaymentsUi L293), se pinta en Banco aunque no haya banco. Crear cartera Personal (una por persona) o Familiar con saldo inicial; ＋Entrada, −Salida, ⚖️Ajustar saldo, ⇄Traspaso, 🏦Retirada del banco; historial; ✕ borrar apuntes manuales; «Archivar cartera» (solo personales); saldo negativo = «por regularizar»; sin renombrar |
| Cuentas manuales (no bancarias) | **NO EXISTE** | `bank_accounts` solo nace de Enable Banking (`data/bank.ts`) |
| Divisas | NO EXISTE en movimientos/presupuestos (`Expense` sin divisa; todo se pinta en €). Solo la Previsión de pagos permite EUR/GBP/USD y totales por divisa sin conversión (L9079, 9697) |

### 2.6 Previsión de pagos (L9146-11405)
| Función | Estado |
|---|---|
| «+ Añadir pago» → «Nuevo pago previsto» (Concepto; Estado del importe Conocido/Estimado/Pendiente; Importe + Divisa; «¿En qué se basa?» **obligatorio si Estimado**; Categoría; Vencimiento; «¿Esperas que se cobre otro día?»; «¿Cómo se paga?» Un solo pago/En varios pagos; «¿Este pago volverá a repetirse?»; Avísame antes; Mostrar en Calendario; Cuenta prevista; Relacionado con; Notas) | OK |
| «Visión 12 meses», horizontes 7 d/30 d/3 m/12 m, «Próximos pagos», menú ⋯ por pago (Editar, Desactivar/Reactivar, Eliminar, 📄 Ver documento original) | OK |
| «🔎 N pagos por revisar» / «Conciliación bancaria» → Confirmar, «No es este», «Gestionar», «Desconciliar», histórico | OK (propone, nunca concilia sola; sin deshacer de «No es este») |
| «💡 N posibles pagos recurrentes» → Revisar / No me interesa | OK, sin tutorial |
| «📄 Importar desde foto o documento» (IA) | PARCIAL: depende de la IA/servidor; mensaje de error genérico (`services/forecastDocument.ts`) — no comprobado |
| «🏦 Préstamos e hipotecas» | **SOLO LECTURA** de datos antiguos; no hay forma de crear/editar un préstamo (el botón «Ver / editar datos del préstamo» abre el formulario general, L9923). Un préstamo se anota hoy como pago «En varios pagos» + categoría «Préstamos e intereses» |
| «Avísame antes» | se guarda; la entrega de avisos no está comprobada en vivo (`featureInventory.ts` L283) |

### 2.7 Configuración → Economía (`MenuSettingsScreen.tsx` L1758-1778)
Inicio del mes contable (Día 1–31, se guarda en cada cambio, por persona); Modo de cuentas (Compartidas/Separadas, solo admin por RLS aunque la tarjeta se ve a todos); Cuentas bancarias → Gestionar cuentas; Categorías «Gestionar»; Etiquetas «Gestionar»; Colorear movimientos por (Categoría/Etiqueta/Sin color, por dispositivo). En «Filtros temporales» (grupo aparte): favorito y activar/desactivar periodos.
- Gestor de categorías (`CategoriesModal`, L4248): **crear** (Generales/Ingresos, con categoría padre), **eliminar**, y para gastos asignar **Debo/Necesito/Quiero** y **Fijo/Variable**. **No renombra ni reordena** (orden alfabético). Gestor de etiquetas (`TagsModal`, L4424): crear, **editar nombre+color** (tocando la etiqueta), eliminar.

### 2.8 Funciones de Economía que viven en Compras (no duplicar aquí, pero enlazar)
Forma de pago por compra (Efectivo/Tarjeta/Bizum/Transferencia/Otro, `PAYMENT_METHODS`), «+ Pagar con varios medios» (pago mixto; un solo gasto), ↩️ devolución total/parcial (`RefundPanel`), «🔎 posibles duplicados o pagos por vincular», «Borrar la compra» con resumen y «Deshacer» (`CashAndPaymentsUi.tsx` L18-290, 524-617). Se usan desde `ReceiptsTab`/`ReceiptForm`, que también se pintan en Compras.

---------------------------------------------------------------------------------------------------

## 3. QUÉ NO EXISTE / ES PARCIAL (para no explicarlo como operativo)

| Tema | Veredicto | Evidencia |
|---|---|---|
| Cuentas manuales / efectivo como «cuenta» | No hay cuentas manuales. Efectivo = **carteras** opcionales dentro de Banco, fuera de «Mis cuentas» | `data/bank.ts` (sin alta manual); `CashWalletsSection` |
| Medios de pago | Solo en Compras (compra con/sin ticket). «+ Nuevo movimiento» no tiene forma de pago → un gasto en efectivo apuntado desde Economía no queda marcado como efectivo (y el sincronizador solo excluye `efectivo`/`mixto`, L620-626) | `addExpense`; sincronizador |
| «Añadir cuenta» | Solo conectar un banco (Enable Banking). Desde Banco abre el modal; desde otras pestañas solo navega (I1) | L653-656, 1436-1442 |
| Préstamos/hipotecas | Solo lectura; plan «En varios pagos» como sustituto | L9878-9932, 11019-11025 |
| Divisas | Solo Previsión (EUR/GBP/USD, sin conversión). Resto fijo en € | L9079 |
| Informes | Un solo informe imprimible (totales + categorías). Sin exportación a archivo | L8593-8663 |
| Exportaciones | No existe (CSV/Excel) en Economía | búsqueda en FinanceScreen/CashAndPaymentsUi |
| Presupuesto: editar importe | solo voz | `updateBudgetAmount` solo en `financeActions.ts` |
| Categorías: renombrar/reordenar | no (la ficha dice que tampoco cambia icono) | `CategoriesModal`; el texto de Configuración L1773 dice lo contrario |
| Traspasos entre cuentas propias | no se detectan solos; se pone a mano la categoría «Transferencias entre cuentas propias» (salvo retirada de cajero: «🏦 Retirada del banco» de la cartera) | sincronizador; `cash_link_bank_expense` (0312 L299-331) |
| Conciliación automática de pagos previstos | no existe: solo propone | `forecastReconciliation.ts` L1-8 |
| Deshacer «No es este» | no existe | no hay función de borrado de descartes en `data/forecast.ts` |
| Caducidad del banco | solo 2 eventos de Calendario; la app no marca la conexión como caducada | `enable-banking-auth-callback` L87-130; `BankAccountsModal` |
| Aprendizaje de categorías por comercio | no existe para movimientos (sí para clases de producto en Compras) | `EditExpenseInline.handleSave`; búsqueda de reglas aprendidas: ninguna |
| Educación financiera infantil | ya no es pestaña de Economía (vive en Pequeños Grandes) | L305-306 |

---------------------------------------------------------------------------------------------------

## 4. DUPLICADOS, SOLAPES, HUECOS Y DISCREPANCIAS

### 4.1 Duplicados y solapes
- D1 `cambiar-categoria` ≡ `clasificar-pendientes` en sus 4 últimos pasos: fila (`finance.movement-row`), Categoría (`…movement-category`), elegir (`…category-picker`), Guardar (`…edit-save`/`movement-updated`). Solo cambia la entrada (señal/filtro). Texto igual salvo la última frase.
- D2 «Mis cuentas» + «Añadir cuenta» aparecen en la visita (pasos 2-3) y en `conectar-banco` (pasos 1-2).
- D3 «📅 Fecha» en la visita (paso 5) y en `ver-estadisticas` (paso 1) con textos casi idénticos.
- D4 La señal de pendientes se explica en: visita paso 6, `clasificar-pendientes` paso 1-2, ficha `eco-pendientes`, explicación `pendiente-clasificar`.
- D5 «PEPA no recuerda tu corrección» está en el paso final y en el `finishText` de `cambiar-categoria` y en dos explicaciones (`categorizar` y `correccion-no-aprende`). Contenido de nivel C dentro del tutorial.
- D6 PSD2 90 días: paso `ventana` de `conectar-banco` y explicación de conexión bancaria.
- D7 `modo-cuentas` (tutorial de solo explicar, 3 pasos) ≈ explicación `exp-cuentas-compartidas-separadas`. Es un nivel-C disfrazado de B (ningún paso exige actuar).
- D8 `revisar-conciliacion` (solo señala, nunca espera una acción) ≈ explicación `exp-economia-conciliacion` apartado B.
- D9 `exp-economia-categorizar-movimientos` y `exp-economia-correccion-no-aprende` se solapan (banco = reglas fijas; no aprende). Se pueden fusionar en una o dejar la segunda como 3 líneas.

### 4.2 Huecos (funciones importantes SIN tutorial/ficha/explicación en el sistema nuevo)
Efectivo/carteras · pago con varios medios · devoluciones (↩️) · duplicados/«vincular con el banco» · borrado seguro/Deshacer (los cuatro solo en `legacyHelp.ts` L213-217) · gestionar categorías/etiquetas · Fijo/Variable y Debo/Necesito/Quiero · editar/borrar/compartir un movimiento · filtros de Movimientos · Presupuesto: Historial, Eliminar, Resumen, ingresos · «Generar informe» · Tendencia del saldo, Comparado con periodo anterior, Evolución temporal · Visión 12 meses / Próximos pagos / ⋯ · recurrentes detectados · «🔮 Añadir a Previsión» · «Importar desde foto o documento» · «Gestionar movimiento» tras conciliar · «Desconciliar» · Configuración → Cuentas bancarias · Filtros temporales · Colorear movimientos · «Pendiente de clasificar» desde Amazon/tickets.

### 4.3 Discrepancias texto ↔ código

| # | Dónde | Dice | Código real |
|---|---|---|---|
| T1 | Visita, paso `anadir` | «'Añadir cuenta' te lleva a Banco y abre la ventana…» | Solo la abre si la pestaña Banco ya estaba abierta (I1) |
| T2 | Visita, paso `fecha` | «hoy, esta semana, mes contable, mes real, año o un rango» | 11 periodos configurables (L214-242); el botón dice «Mes contable» pero la tarjeta «Resumen — Este mes» |
| T3 | Visita, paso `cuentas` | «con su saldo» | Muestra 🔒 en modo Separadas para cuentas ajenas y «Sincronizando…» sin saldo (L973-975) |
| T4 | Visita, `menu` | enumera las 6 secciones | correcto; falta decir «📌 Sacar» y que «Inicio» = Resumen |
| T5 | `apuntar-movimiento`, `categoria` | «Ya viene una puesta de partida (la primera de tu lista)» | `categories[0]` de `budget_categories` ordenadas por `sort_order` de TODOS los grupos (movementForm.ts L48-50): no tiene por qué ser la primera que ve en el selector (que solo lista las de `generales` de primer nivel). No comprobado con datos reales |
| T6 | `apuntar-movimiento`, `tipo` | señala «Elige Gasto o Ingreso» | la marca `finance.movement-type` está solo en el chip «Gasto» (L4030): se resalta un solo chip |
| T7 | `apuntar-movimiento`, `opcionales` | «Establecimiento (solo en gastos), Etiqueta y Concepto» | paso opcional con `target` = Establecimiento, que no existe en un Ingreso → se omite y Etiqueta/Concepto no se explican en ingresos |
| T8 | `anadir-pago-previsto`, `estado`/`importe` | no menciona que «Estimado» obliga a rellenar «¿En qué se basa?» | campo `required` (L10984-10989): el paso final «Crear pago previsto» queda bloqueado por la validación del navegador sin explicación |
| T9 | `ver-estadisticas`, `vistas` | «el total es siempre el mismo» | en «Etiquetas» el centro del dónut suma solo lo etiquetado (L2877-2881) |
| T10 | `crear-presupuesto`, `importe` | «pídeselo a PEPA por voz» | correcto (`financeActions.ts`). Falta decir que se puede Eliminar |
| T11 | `clasificar-pendientes`, paso `menu` | «Ahora mismo no veo la señal: no tienes gastos pendientes» | se muestra también si la señal aún no cargó (I5) |
| T12 | `clasificar-pendientes`, `filtro` | «Si llegaste desde la señal, ya ves solo los pendientes» | cierto, pero el desplegable «Filtrar por» sigue diciendo «Todos»: lo filtra la tarjeta «Filtro: ⏳ Pendiente de clasificar» (L3590-3606) |
| T13 | `conectar-banco`, `dueno` | «Solo su dueño actual puede cambiarlo» | correcto; matiz: una cuenta sin dueño la puede asignar cualquiera (L71-73) |
| T14 | Ficha `eco-categorias` | «Desde Economía → Categorías o Etiquetas, «Gestionar»…» | Esas pestañas se retiraron (`RETIRED_KEYS`, economiaMenu.ts L111); se gestionan en Configuración → Economía o con el atajo «⚙️ Gestionar categorías/etiquetas» del selector |
| T15 | Configuración, tarjeta Categorías (MenuSettingsScreen L1773) | «Crea, renombra o ordena…» | solo crea, elimina y clasifica |
| T16 | Texto en pantalla (L2875, L4106) | «botón flotante de Movimientos», «botón flotante 🗂️ Categorías» | no hay botones flotantes ya |
| T17 | Explicación conciliación, A | «Los ingresos no se concilian así»; «no hay un botón para separarlos/unir a mano» | Desde 0312: una devolución manual se une al abono del banco (±14 días, L429-454, 571-580); en Compras hay «Sí, vincular», «Sí, quitar el que sobra» y «Deshacer» (`PurchaseDuplicatesPanel`); efectivo/mixto excluidos (L620-626); pago mixto casa por la parte de tarjeta (L405-426, 589-597) |
| T18 | Explicación categorización | «Si no, el gasto va a «Otros»» | `guessCategory` (L156-164) devuelve «Otros» solo si la familia tiene una categoría con ese nombre exacto; si no, la primera de su lista |
| T19 | Explicación conciliación | «Cuando varias reglas…» ok; «17 reglas» | verificado: 17 reglas (L136-154) |
| T20 | Validación móvil (doc) | botón «Devolver» | La UI real es un icono ↩️ (aria «Registrar una devolución») y el botón del panel «Registrar devolución» (FinanceScreen L5723-5746, CashAndPaymentsUi L232) |
| T21 | `featureInventory.ts` (`economia-movimientos`, rev. 21/10) | «vincular una devolución con la compra original queda fuera» y no menciona efectivo | ya existe devolución vinculada a compra (Compras) y carteras; inventario desfasado |

---------------------------------------------------------------------------------------------------

## 5. DEPENDENCIAS

| Tutorial | Navegación | Datos necesarios | Elementos/modales | Rol/plataforma |
|---|---|---|---|---|
| visita | `/dinero`, destino `economia.resumen`; espera la pestaña pero NO la carga de datos (`HelpDestMark` se pinta antes que `ResumenTab`, L706-712) | ninguno (pendientes opcional) | — | cualquiera con acceso a `dinero`; menor restringido no ve esta pantalla |
| apuntar-movimiento | `economia.movimientos` | no necesita movimientos; **necesita que no haya filtro activo** | modal «Nuevo movimiento»; selector de categoría; selector de fecha | — |
| cambiar-categoria | `economia.movimientos` | **≥1 movimiento** | fila → editor inline; modal selector de categorías | — |
| clasificar-pendientes | `economia.resumen` | idealmente ≥1 pendiente; si no, ≥1 movimiento | señal → filtro; editor; selector | — |
| crear-presupuesto | `economia.presupuesto` | ninguno | modal «Nuevo presupuesto»; selector; `window.confirm` si hay duplicado | en Separadas, crea en Individual o Común según la pestaña |
| anadir-pago-previsto | `economia.prevision` | ninguno | modal largo (muchos campos condicionales) | — |
| revisar-conciliacion | `economia.prevision` | **banco enlazado + pago previsto + cargo candidato (±3 días)** o histórico de conciliaciones | acordeón 🔎 | solo familias con banco |
| ver-estadisticas | `economia.estadisticas` | movimientos en el periodo (si no, dónut vacío) | — | — |
| conectar-banco | `economia.banco` | ninguno; pasos 4,7 requieren banco ya conectado (opcionales) | modal «Cuentas bancarias» | cualquiera con Economía; **todas** las personas pueden conectar/desconectar |
| mes-contable | `/menu-organizar` `config.economia` | ninguno | tarjeta de Configuración | cambia un ajuste real (por persona) |
| modo-cuentas | idem | ninguno | tarjeta | `familyAdmin` (el servidor lo impone: `families: admin update`) |

Plataforma: el flujo real de conexión bancaria puede quedarse en el móvil («Redirigir a su proveedor…»; texto en `BankAccountsModal` L288-290) → no comprobado en iPhone/Android. Efectivo/pagos mixtos/devoluciones: «pendiente de validación en iPhone y Android» (`docs/VALIDACION_MOVIL_COMPRAS_ECONOMIA.md`). Las apps nativas cargan la web publicada, así que los tutoriales nuevos llegan sin recompilar (plan de despliegue §0).

---------------------------------------------------------------------------------------------------

## 6. INCIDENCIAS CONCRETAS (causa comprobada en código)

Mecánica del motor que explica varias (L): un paso NO opcional cuyo control no existe tras 3,5 s deja el tutorial «roto» con el mensaje genérico «No encuentro este control en tu pantalla (puede que sea otra versión…)» (`TourRunner.tsx` L27, L476-480; `engine.ts` L107-111) y **no muestra el texto del paso**; un paso opcional se omite a los 350 ms (`OPTIONAL_GRACE_MS`, L33, L265).

| ID | Prioridad | Qué pasa | Causa (archivo/condición) | Corrección recomendada (sin implementar) |
|---|---|---|---|---|
| I1 | ALTA | «+ Añadir cuenta» desde Inicio/Estadísticas/Movimientos/Presupuestos/Previsión solo cambia a Banco; **no abre la ventana** (la visita lo promete). Solo la abre si Banco ya estaba abierto | `FinanceScreen.tsx` L653-656 incrementa `openConnectSignal` y `setTab('Banco')` en el mismo evento; `BankTab` se monta ya con el valor nuevo y `lastConnectSignalRef = useRef(openConnectSignal)` (L1436) lo toma como «visto» → el `useEffect` (L1437-1442) nunca ve cambio. Sin prueba en el repo. *Por lectura; no ejecutado* | Inicializar la referencia con 0 o abrir por estado elevado; mientras tanto, texto de la visita: «te lleva a Banco; allí se abre…» o ajustar el tutorial |
| I2 | ALTA | `tut-economia-revisar-conciliacion` es irrealizable para quien no tenga propuestas ni histórico (la mayoría); acaba en «roto» | Paso 1 obligatorio con `target finance.reconcile-toggle`; ese control solo existe si hay candidatos, conciliados recientes o histórico (FinanceScreen L9751); el texto «Si no lo ves, ahora no hay nada que revisar» nunca se muestra | Hacer el paso 1 `optional` y añadir pasos sin `target` (solo explicación) que se vean cuando no hay nada; o pasar todo a nivel C + capítulo condicional |
| I3 | MEDIA-ALTA | `cambiar-categoria` y `clasificar-pendientes` se rompen sin ningún movimiento; el texto «Si aún no tienes ninguno, pulsa Salir» no llega a verse | Pasos `fila` obligatorios (`finance.movement-row` solo existe si hay filas) | `optional: true` + paso de respaldo sin target; o capítulo condicionado a que existan movimientos |
| I4 | MEDIA | `apuntar-movimiento` se rompe si hay un filtro activo en Movimientos (p. ej. quien venía de «Ver registros →» y volvió por el ☰) | `+ Nuevo movimiento` se pinta solo con `!filter` (L3584); `useHelpDestinations['economia.movimientos']` solo hace `setTab('Movimientos')` y no limpia `movementsFilter` (L469-476, estado L477) | Que el destino de Ayuda limpie el filtro (o mostrar el botón siempre) |
| I5 | MEDIA | Carrera de carga: en `clasificar-pendientes` la señal aún no ha cargado a los 350 ms → paso 1 se omite → el paso 2 afirma «no tienes gastos pendientes». Igual riesgo en pasos opcionales de la visita y de `conectar-banco` | `ResumenTab` devuelve «Cargando resumen…» hasta recibir `listExpenses` (L1903) y el motor da solo 350 ms a los opcionales (`TourRunner.tsx` L33) | No afirmar «no tienes pendientes» en un paso condicional; o esperar a que desaparezca «Cargando…» (señal `appear` de un elemento de carga terminada) |
| I6 | MEDIA | `anadir-pago-previsto` con «Estimado» no avisa del campo obligatorio «¿En qué se basa?» | L10984-10989 (`required`); el paso `importe` es opcional y no menciona la base | Añadir paso opcional `forecast-amount-basis` (necesita marca nueva) |
| I7 | MEDIA | `revisar-conciliacion` con 3 pasos opcionales manuales: si hay candidata pero se omiten por carrera (350 ms) el usuario solo ve el paso 1 | opcionales con `manualNext` | Ver I2 |
| I8 | BAJA | `apuntar-movimiento` `tipo` resalta solo «Gasto» | `data-help-id="finance.movement-type"` solo en el primer chip (L4030) | Mover la marca al contenedor `filter-row` |
| I9 | BAJA | `mes-contable`: «Día» guarda en cada pulsación válida (escribir «25» guarda primero «2») y el paso avanza con el primer guardado | `MenuSettingsScreen` L210-213 + evento L185 | Texto del paso `resultado`: «comprueba que ha quedado el valor que querías» (ya lo dice); sin cambio obligatorio |
| I10 | BAJA | `visita` `conclusiones`: «cambia al deslizar» no funciona con ratón | solo `onTouchStart/End` (L2269-2282) | Mencionar «con el dedo» o añadir flechas |
| I11 | BAJA | Explicación `exp-economia-pendiente-clasificar` enlaza el tutorial de «cambiar categoría» y `exp-economia-conexion-bancaria` no enlaza ninguno | campo `tour` de los explainers | Apuntar al tutorial específico |
| I12 | BAJA | Ficha `eco-categorias` cuelga `tut-economia-ver-estadisticas` (cardId) | `defs/g2/economia.ts` L394 | Crear ficha propia de Estadísticas o reasignar |
| I13 | INFO | Faltan marcas `data-help-id` para: Efectivo (`CashWalletsSection`), gestores de categorías y etiquetas, tarjetas de Configuración (Cuentas bancarias, Categorías, Etiquetas, Colorear, Filtros temporales), lista/Historial/Resumen/Informe de Presupuestos, Tendencia/Comparación/Evolución, Visión 12 meses, horizontes, Próximos pagos, ⋯, recurrentes, Importar, «¿En qué se basa?», chip Ingreso, Fijo/Variable, «🔮 Añadir a Previsión», filtro 🏦 Cuenta | verificado con búsqueda de `data-help-id` (FinanceScreen y MenuSettingsScreen) | Necesarias antes de escribir los capítulos nuevos |

---------------------------------------------------------------------------------------------------

## 7. PROPUESTA DE ESTRUCTURA

### 7.1 Veredicto sobre la estructura inicial de la usuaria
1 Conoce Economía · 2 Registrar ingresos/gastos/presupuestos · 3 Cuentas, bancos y efectivo · 4 Conciliación y pagos previstos · 5 Informes y control económico.
La lógica de uso real lo respalda con estos ajustes:
- **1 = nivel A** (visita), no un B. Se queda tal cual (reducido).
- **Presupuestos pasan del 2 al 5**: crear un presupuesto es «control/seguimiento» y se entiende con Resumen/Estadísticas; el 2 quedaría con 5 min y el 5 con solo lectura. Con el cambio: 2 ≈ 5 min, 5 ≈ 5,5 min.
- **3 incluye «de quién es cada cuenta» y modo Compartidas/Separadas** (hoy dispersos en conectar-banco y modo-cuentas) y **Efectivo**.
- **4**: la conciliación banco↔ticket/apunte/compra es automática (no hay nada que hacer) → nivel C. Lo interactivo es «Previsión de pagos» + «Revisar una propuesta». Por eso el título mejor es «Pagos previstos y conciliación».
- **Mes contable y filtros de periodo → 5** (son la base de todas las cifras).
- No hace falta un 6.º tutorial: «Categorías y etiquetas» va en el 2; «Corregir un movimiento/pendientes» también en el 2.

### 7.2 Nivel A — «Conoce Economía» (visita, ≈1,5–2 min, sin tocar nada)
Reutiliza: `menu` (reescribir: 6 secciones en una frase cada una, «📌 Sacar»), `cuentas` (reutilizar; añadir 🔒 y «Efectivo está en Banco»), `fecha` (reescribir con «11 periodos; los eliges en Configuración»), `pendientes` (reutilizar, opcional), `resumen` (reutilizar + devoluciones/gasto neto), `conclusiones` (reutilizar con «con el dedo»).
Se **mueven** a B: `anadir`, `config` (→ B2), y la parte de periodos (→ B4).
Límite técnico (L): una visita tiene una sola pantalla de partida y las pestañas no son rutas, así que A recorre «Inicio» y nombra las otras cinco; cada tutorial B abre con un paso corto «Estás en X: aquí…».

### 7.3 Nivel B — 4 tutoriales con capítulos

**B1 · Apunta y organiza tu dinero** (≈5 min)
| Cap. | Contenido | Pasos actuales que se reutilizan | Reescribir | Falta |
|---|---|---|---|---|
| 1.1 Apunta un gasto o un ingreso (≈1,5′) | todo el formulario; aviso «la forma de pago (efectivo/tarjeta…) se elige en Compras» | `abrir`, `fecha`, `importe`, `guardar` (4) | `tipo` (marca en el contenedor), `categoria` (aclarar el valor inicial), `opcionales` (incluir Etiqueta, Concepto y Fijo/Variable también para ingreso) | arreglar I4 |
| 1.2 Encuentra y corrige un movimiento (≈1,5′) | Filtrar por (Pendientes/Búsqueda/…), tocar fila, cambiar Categoría, Guardar; ✕ borrar y 🤝 Común como pasos informativos | de `clasificar-pendientes`: `senal`(opc.), `filtro`; de ambos: `fila`, `categoria`, `elegir`, `guardar` (se fusionan 8 en 5) | quitar «PEPA no recuerda…» del paso (→ C) | arreglar I3, I5 |
| 1.3 Tus categorías y etiquetas (≈1,5′) | Configuración → Economía → Categorías/Etiquetas «Gestionar» o atajo ⚙️ del selector; crear, Debo/Necesito/Quiero, Fijo/Variable; etiquetas con color; aviso «no se renombra» | ninguno | todo nuevo | marcas (I13) y corregir T14/T15 |

**B2 · Tus cuentas, tu banco y tu efectivo** (≈5,5 min)
| Cap. | Contenido | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 2.1 Conecta tu banco (≈2′) | Mis cuentas → Añadir cuenta → ventana → «+ Conectar banco» → sincronizar; PSD2 en una frase y enlace a C | `cuentas`, `anadir`, `ventana`, `conectar`, `cerrar`, `sincronizar` (6 de 7) | `anadir` (I1); `ventana` más corto | — |
| 2.2 De quién es cada cuenta y qué ve cada persona (≈1,5′) | selector dueño; si eres admin: Modo de cuentas (Compartidas/Separadas, Individual/Común, 🤝) | `dueno`; `tarjeta`, `compartidas`, `decidir` de `modo-cuentas` | unir en un capítulo; las 3 de `modo-cuentas` solo se muestran a admin (usar `skipIf`/pasos opcionales por rol) | — |
| 2.3 Efectivo (opcional) (≈2′) | abrir «💶 Efectivo», crear cartera, ＋/−/⚖️, ⇄ Traspaso, 🏦 Retirada del banco; «no es ingreso ni gasto»; **pagar en efectivo/varios medios se hace en Compras** (enlace) | ninguno | todo nuevo | marcas (I13); **validación real previa** (decisión D1) |

**B3 · Pagos previstos y conciliación** (≈5 min)
| Cap. | Contenido | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 3.1 Añade un pago previsto (≈2′) | formulario completo; «Estimado exige base»; «En varios pagos»; Divisa | los 8 de `anadir-pago-previsto` | `estado` (+ base obligatoria), `repeticion` | I6 |
| 3.2 Mira lo que viene (≈1,5′) | Visión 12 meses, horizonte, Próximos pagos, ⋯ (Editar/Desactivar/Eliminar), 💡 recurrentes, «🔮 Añadir a Previsión» desde un movimiento, «Importar desde foto o documento» (marcar como IA) | ninguno | todo nuevo | marcas (I13) |
| 3.3 Revisa una propuesta de conciliación (≈1,5′) | tarjeta Previsto/Banco, motivos, Confirmar (y qué pasa), «No es este» (sin deshacer), Gestionar, Desconciliar | `abrir`, `tarjeta`, `confirmar`, `descartar` (4) | paso 1 opcional + pasos de respaldo sin `target` (I2); añadir «Gestionar» y «Desconciliar» | — |

**B4 · Entiende tus números y controla el gasto** (≈5,5 min)
| Cap. | Contenido | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 4.1 Elige el periodo y tu mes contable (≈1,5′) | 📅 Fecha, Mes contable vs Mes real, Configuración → Inicio del mes contable, Filtros temporales | `fecha` (de `ver-estadisticas`), `tarjeta`, `dia`, `resultado` de `mes-contable` | `fecha` con los 11 periodos | paso nuevo de Filtros temporales |
| 4.2 Lee tus estadísticas (≈1,5′) | vistas, tocar porción, «Ver movimientos →», Comparado con el anterior, Evolución, Tendencia del saldo | `vistas`, `grafica` | `vistas` (corregir T9) | pasos nuevos con marcas |
| 4.3 Controla con presupuestos (≈2′) | crear, ver progreso, Historial, Eliminar, importe solo por voz, Resumen/Balance | los 5 de `crear-presupuesto` | `importe` (+ voz) | pasos nuevos de lista/Historial |
| 4.4 Genera un informe (≈1′) | «📄 Generar informe»: qué contiene y qué no (imprimir/guardar PDF; sin Excel) | ninguno | nuevo | marca; comprobar en iPhone/Android |

Totales: 14 capítulos; reutilización aproximada: ≈45 de los 59 pasos actuales (≈8 de ellos reescritos); ≈14 desaparecen por duplicado o pasan a A/C; ≈22 pasos nuevos (recuento orientativo, no exacto). Duración estimada por tutorial 5–5,5 min (rango del encargo 4–7).

### 7.4 Nivel C — «Entiende cómo funciona PEPA»
Mantener (corrigiendo): categorizar (T18; añadir efectivo), pendiente-clasificar (enlazar al tutorial correcto), conciliación (dividir en «Banco con tickets/compras/apuntes — automática» y «Banco con pagos previstos — propuesta»; actualizar T17), conexión bancaria, «no aprende» (fusionar o dejar breve).
Añadir:
1. **Qué cuenta como ingreso, gasto y ahorro** (R1, traspasos, «Cobro anulado», devoluciones y gasto neto, pendientes) — hoy no existe.
2. **Efectivo y carteras** (R3).
3. **Pagos con varios medios, devoluciones y duplicados** (coordinar con Compras).
4. **Previsión: Conocido/Estimado/Pendiente**, qué cuenta como gasto, recurrentes detectados, límites (préstamos, avisos).
5. **Periodos y mes contable.**
6. **Modo de cuentas** (ya hay la g5; enlazar y quitar `modo-cuentas` de tutoriales).

### 7.5 Reparto B ↔ C (qué se queda dónde)
- **En el tutorial (B):** dónde pulsar, qué significa cada campo en una frase, qué es irreversible o no editable (importe del presupuesto, «No es este», ✕ borrar), qué falta (marcar «no existe»), y el paso de guardar (sensible, lo pulsa la persona).
- **A la explicación (C):** las 17 reglas por comercio, «no aprende», puntuación de conciliación, ventanas de ±7/±3/±14 días, PSD2/90 días, quién ve qué en Separadas, por qué un pendiente no es «Otros», qué hace «Confirmar» con la categoría, efectos de desconciliar.
- **No repetir:** que PEPA «no recuerda» la corrección sale hoy 5 veces; dejarlo solo en C con enlace.

---------------------------------------------------------------------------------------------------

## 8. REGLAS INTERNAS (para nivel C) — verificadas en código

R-a **Categoría de movimientos del banco** (sincronizador L105-164, 459-678): limpia el nombre (prefijos COMPRA TARJ., ADEUDO, RECIBO, TRANSFERENCIA A FAVOR DE/DE, BIZUM A/DE, PAGO A/EN), busca la **primera** de 17 reglas por subcadena y solo vale si la familia tiene una categoría con ese nombre exacto; si no, «Otros» (o la primera categoría si no existe «Otros»). Sin IA; no usa importe, fecha ni cuenta. «UBER EATS» cae en transporte por orden. Ingresos → «Ingreso»; «ANUL…» (60 días, mismo importe) y reversión de comisión (3 días, ambas con palabra de comisión/interés) → ambas patas «Cobro anulado»; descripción que empieza por «DEVOLUCION» → categoría Devoluciones (por `catalog_key`).
R-b **Pendiente de clasificar** (`pending.ts` L1-71): categoría NULL; cuenta en totales, ahorro y presupuesto General, no en categorías ni presupuestos de categoría; hoy lo produce el correo de Amazon (`amazon-order-webhook` L102,124) y tickets sin categoría; el banco nunca lo deja pendiente.
R-c **Corregir categoría** (`EditExpenseInline.handleSave` L4168-4206): cambia ESE gasto (y su ticket enlazado) vía `classify_purchase`; se rechaza si gasto y ticket tienen categorías distintas (`classifyPurchase.ts` L45); un ingreso se cambia con `updateExpense`; **no se guarda ninguna regla**. Sí aprende PEPA en Compras (clases de producto) y al confirmar una conciliación con previsión (hereda la categoría vía `match_forecast_occurrence`, 0173 L69-79; «Desconciliar» no devuelve la anterior).
R-d **Conciliación automática banco↔gasto manual/ticket**: cargo nuevo → gasto `ticket`/`manual` no enlazado, no efectivo/mixto, mismo importe (<0,01 €), ±7 días, el más cercano; si ya estaba enlazado crea un gasto nuevo (L616-676). Al subir un ticket, al revés (`ticketExpenseMatch.ts`: orígenes banco/ticket_banco/manual). Pago mixto: el cargo casa solo con la parte no efectivo (importe exacto, ±7 días, una sola candidata) (L405-426, 589-597). Devolución manual ↔ abono del banco (±14 días, una candidata, no efectivo) (L429-454, 571-580).
R-e **Propuesta con pagos previstos** (`forecastReconciliation.ts`): solo cargos con gasto enlazado, misma divisa, ±3 días de la fecha prevista, misma cuenta si el pago la tiene; puntos cuenta +30, importe exacto +40 / ≤15 % +20, mismo día +30 (−5 por día), palabra común +10, categoría +5/+10; alta ≥70, media ≥35, baja <35 (**se enseñan todas las bajas**, contra lo que dice un comentario en FinanceScreen L9747-9750); exclusión fuerte si importe (≥50 % y ≥30 €) y categoría chocan a la vez; un candidato por pago y por movimiento; ventana de revisión −14/+10 días; «No es este» persiste y no tiene deshacer.
R-f **R1 — Ingresos distintos según pantalla** (riesgo): Resumen, Movimientos y Estadísticas suman todo ingreso real (manual o banco) (`computePeriodFinancials`, financeCompute.ts L122-128); Presupuesto con cuentas bancarias enlazadas suma **solo** ingresos de banco y avisa de que los apuntados a mano «ya NO se cuentan» (FinanceScreen L8311-8324, 8423-8427). Un ingreso apuntado a mano con banco enlazado aparece en Resumen y no en Presupuesto.
R-g **R2 — Borrar un movimiento bancario** (por lectura; no ejecutado): `deleteExpense` borra la fila de `expenses`; `bank_transactions.matched_expense_id` es `on delete set null` (0066 L47) y no hay marca de «ignorado»; `linkTransactionsToExpenses` toma todos los `bank_transactions` con `matched_expense_id` nulo (L462-467) y crea de nuevo el gasto (con la categoría adivinada). Resultado probable: reaparece en la siguiente sincronización (cron 4×/día). Sin aviso en la UI (doble toque en ✕). Verificar en ejecución antes de documentarlo.
R-h **R3 — Efectivo** (`cashWallet.ts`, 0312): una cartera por persona + las familiares que se quieran; saldo = inicial + movimientos; entradas/salidas/ajustes/traspasos **no crean gastos ni ingresos**; «Retirada del banco» convierte un cargo del banco en «Transferencias entre cuentas propias» (y se puede deshacer, restituye la categoría); saldo negativo = «por regularizar»; efectivo y mixto no se concilian con el banco; permisos: personal solo la toca su dueña, familiar cualquiera con acceso a `dinero`; en Separadas la ajena no se ve (EFE-1f, solo probado por política).
R-i **Presupuestos** (`budgetSpent`, finance.ts L314-365): cuenta gasto bruto del periodo (excluye traspasos internos y no resta devoluciones); presupuesto de categoría padre incluye sus subcategorías; el General incluye pendientes.
R-j **Previsión**: lo previsto no es gasto hasta que se concilia; importe Pendiente nunca se muestra como 0 €; totales por divisa sin convertir.

---------------------------------------------------------------------------------------------------

## 9. DECISIONES DE PRODUCTO NECESARIAS (solo las que no puedo resolver con una recomendación)

D1. **Efectivo / pagos mixtos / devoluciones**: ¿escribir y publicar ya los capítulos (2.3 y los de Compras) o esperar a que valides en iPhone y Android? Recomiendo prepararlos ahora (con las marcas) y publicarlos solo cuando pase de «Implementado, pendiente de validación» a «Aprobado».
D2. **Ingresos a mano con banco enlazado (R1)**: ¿unificar Resumen y Presupuesto, o dejarlo como está y documentarlo en C? Hoy un mismo ingreso suma en una pantalla y no en otra.
D3. **Borrar un movimiento del banco (R2)**: tras comprobarlo en ejecución, ¿se corrige la app (marcar «ignorado» / avisar) o se documenta?
D4. **Quién puede conectar/desconectar bancos**: hoy cualquier miembro con Economía (sin `adultsOnly` en los tutoriales ni restricción en el modal). ¿Se restringe a adultos/administración o se deja?
D5. **Tutoriales solo-informativos** (`modo-cuentas`, `revisar-conciliacion`): ¿se aceptan como «capítulos informativos» dentro del interactivo (mi recomendación) o se pasan íntegros a C?

---------------------------------------------------------------------------------------------------

## 10. CORRECCIONES A LA AUDITORÍA PREVIA (`AUDIT_ECONOMIA.md`)

- «~16 reglas» → son **17** (sincronizador L136-154); la explicación ya decía 17.
- «Sin data-help-id en Economía» → ya hay marcas (unas 45 `finance.*` en `FinanceScreen.tsx` y 4 en `BankAccountsModal.tsx`); faltan las de §6 I13.
- «Banco → ⚙️ Gestionar cuentas» → **ya no existe** en Banco; ahora «⚙️ Configuración cuentas» (bajo Mis cuentas) y Configuración → Economía → «Gestionar cuentas».
- No incluía Efectivo, pagos mixtos, devoluciones, duplicados ni el cambio del ☰ (solo Sacar/Quitar).
- La conciliación A estaba incompleta: efectivo/mixto excluidos, pago mixto, devolución ±14 días.
- Confirmado: «Confirmar» sustituye la categoría por la de la previsión (0173); «Desconciliar» no la devuelve; baja confianza sí se muestra; sin deshacer de «No es este»; sin aprendizaje de categorías por comercio.

---------------------------------------------------------------------------------------------------

## 11. NO COMPROBADO (y por qué)

- Comportamiento en iPhone/Android (conexión bancaria, window.open/print del informe, selector de fechas, Efectivo).
- Sincronización real con el banco, caducidad a los 90 días, entrega de «Avísame antes», importación de documento con IA (depende del servidor/IA).
- I1 y R2 se infieren leyendo el flujo de estado/SQL; no se han ejecutado.
- Orden real de `budget_categories` (valor inicial de «Categoría» en «+ Nuevo movimiento», T5).
- Estado de producción de migraciones (se cita lo que dicen `docs/PLAN_DESPLIEGUE_COMPRAS_EFECTIVO_COMPARADOR.md` y `docs/VALIDACION_MOVIL_COMPRAS_ECONOMIA.md`, commit `d3641f5`; no se tocó Supabase).
