# Auditoría (solo lectura) — Módulo COMPRAS · tutoriales «Enséñame»

Repositorio leído: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (HEAD `d3641f5`, 24/10/2026). Todo lo de abajo sale de leer código; **nada está probado en dispositivo**. Donde algo depende de iPhone, del servidor real o de datos de producción lo marco como «no comprobado».

Abreviaturas de archivos: SS = `src/ui/ShoppingScreen.tsx`; FS = `src/ui/FinanceScreen.tsx`; TR = `src/help/tours/TourRunner.tsx`; EN = `src/help/tours/engine.ts`; DT = `src/help/tours/domTargets.ts`; G2 = `src/help/tours/defs/g2/compras.ts`; G8 = `src/help/tours/defs/g8/compras.ts`; CAP = `src/help/tours/defs/comAnadirProducto.ts`.

---------------------------------------------------------------------
## 0. Resumen ejecutivo (lo que más importa)

1. **Regla «Comprado ≠ compra registrada»: el código la cumple y los textos de Ayuda actuales NO la contradicen.** `updateShoppingItemStatus` (`src/data/shopping.ts`) solo hace `update shopping_items set status`; «Finalizar compra» (`finalizePurchase`, SS ~1051) solo hace `delete` de los ítems `comprado` de esa tienda. Ninguno de los dos crea compra, precio de historial ni gasto (hay un test que lo blinda: `src/data/shoppingBoughtDoesNotFeedHistory.test.ts`). Lo que **sí** falla en los tutoriales: (a) nunca se dice explícitamente en `tut-compras-marcar-comprado` ni en `com-anadir-producto` (solo lo dice `tut-compras-historial-precios`, paso `total`, y las fichas); (b) el paso `marcar` dice «queda tachado en su sitio», pero el código lo manda a un bloque «✓ Completados» al final de su tienda.
2. **Las cinco incidencias de iPhone tienen causa localizable en código.** (b) y (c) son un fallo **del motor** (`TourRunner`), no de los textos: pasos «opcionales» que se omiten en silencio a los 350 ms mientras la lista aún está «Cargando…», y «Atrás» que nunca vuelve a un paso omitido (`previousIndex`). (a) es un `target` mal elegido (la cabecera de tienda en lugar del botón). (d) son dos causas: el primer paso señala el formulario ENTERO (altísimo) y el panel del tutorial (z-index 1300) queda por encima de la hoja «Añadir ticket» (z-index 50). (e) no se puede deducir solo leyendo: hipótesis, prioridad baja.
3. **Funcionalidad real de Compras que NINGÚN tutorial enseña** (publicada el 24/10/2026): «✍️ Sin ticket» (compra manual), **forma de pago** (efectivo/tarjeta/Bizum/transferencia/otro, «varios medios», cartera de efectivo), «¿Quién?», «+ Añadir productos a mano» / «+ Añadir línea», aviso de cuadre de importes, avisos «¿Es una compra que ya apuntaste?» y «Ya tienes este gasto apuntado en Economía», 📎 añadir el ticket después, ↩️ devolución, borrado seguro con «Deshacer», «Precio por tienda» con equivalentes, «Comparar la lista entre tiendas», y toda la pestaña **Estadística compras**.
4. **Discrepancia de contenido importante (nivel C):** el explicador `exp-compras-clasificar-productos` afirma que la lista compartida es «pequeña y fija: tres cadenas», que solo la actualiza la administración y que la corrección «no enseña a otras familias». La migración `0308_shared_learning_all_stores.sql` (aplicada en producción según `docs/PEPA_CONTROL_REQUISITOS.md` l.767-773) crea un trigger (`products_shared_vote`) por el que **cada clase confirmada por una familia sí vota** (anónimo, por texto de producto) y el cliente la aplica (`resolveProductClass` paso 2). `legacyHelp.ts` («Clasificación compartida de productos») dice lo contrario que el explicador. Hay que corregir el explicador antes de reutilizarlo.
5. **Estructura propuesta:** la de la usuaria es casi óptima. Ajustes: T1 es nivel A (visita), no un tutorial B; falta ubicar **Compartir lista** y **Estadística compras**; «clasificar artículos» se parte (gestión de clases en T3, clase por línea en T4, «cómo decide PEPA» en C); T4 debe empezar por «Con ticket / Sin ticket». Detalle en §6.
6. **Restricciones del sistema que condicionan el rediseño** (están en `tourDefs.test.ts`): `durationSec ≤ 120` por tutorial, texto de paso ≤ 300 caracteres, pasos `sensitive` solo avanzan por evento de guardado, y `tourCoverage.test.ts` exige que cada ficha tenga un tutorial por `cardId`. **No existe el concepto de «capítulo» en `TourDef`** (`types.ts`): hará falta tipo nuevo o varios `TourDef` encadenados (cambio de motor/catálogo, no solo de contenido).

---------------------------------------------------------------------
## 1. Inventario (las 9 entradas con `module: 'compras'` del volcado)

| id | tipo | pasos | durationSec | startDest | ficha (`cardId`) | explicador relacionado |
|---|---|---|---|---|---|---|
| `visita-compras` «Conoce Compras» | visita (A) | 7 (2 opcionales al final) | 90 | `compras.inicio` | `com-anadir-producto` | — |
| `com-anadir-producto` «Añadir un producto…» | tutorial | 4 | 45 | `compras.lista` | `com-anadir-producto` | — |
| `tut-compras-editar-producto` | tutorial | 4 | 60 | `compras.lista` | `com-anadir-producto` | — |
| `tut-compras-marcar-comprado` «Usar el Modo compra y marcar lo comprado» | tutorial | 4 | 75 | `compras.lista` | `com-anadir-producto` | — |
| `tut-compras-tiendas` «Crear tiendas y agrupar…» | tutorial | 4 | 90 | `compras.lista` | `com-tiendas` | — |
| `tut-compras-compartir` | tutorial | 3 | 60 | `compras.lista` | `com-compartir` | — |
| `tut-compras-clase-historial` «Cambiar la clase de un producto» | tutorial | 3 | 80 | `compras.historial` | `com-historial-precios` | `exp-compras-clasificar-productos` (`tour:` apunta a él) |
| `tut-compras-subir-ticket` | tutorial | 8 | 120 | `compras.tickets` | `com-ticket` | `exp-compras-leer-ticket` (`tour:` apunta a él) |
| `tut-compras-historial-precios` | tutorial | 5 | 80 | `compras.historial` | `com-historial-precios` | — |

Total declarado ≈ 700 s (≈ 11,7 min) repartidos en 9 piezas sueltas. Definiciones: `CAP` (1), `G2` (visita + 5), `G8` (tiendas, compartir). Fichas: `src/help/catalog/cardsDiaADia.ts` l.190-270 (`com-anadir-producto`, `com-tiendas`, `com-compartir`, `com-ticket`, `com-historial-precios`, `com-viajes-inventario` [desactivada, sin pantalla]).

Matices de catálogo:
- Las fichas `com-ticket` y `com-historial-precios` **no tienen campo `tour`**. Su tutorial solo sale como botón secundario «Enséñame: <título>» (`HelpAnswer.tsx` l.65 `moreTours`, máx. 3), y `canStartTour` (`HelpProvider.tsx` l.310) exige `card.tour`. No es un fallo funcional, pero esas dos fichas no tienen el botón «Enséñame» principal (ni el ✓ de completado en él).
- Los tres tutoriales de la ficha `com-anadir-producto` (+ la visita, que cuelga de esa misma ficha) comparten `cardId`; la visita está excluida de `moreTours`.
- Voz/Hablar con PEPA: `talkHelp.ts` l.33 enruta «compras / lista de la compra / supermercados / tickets / historial de precios / estadística de compras» al módulo `compras`.

---------------------------------------------------------------------
## 2. Mapa funcional real de Compras (qué existe de verdad)

Pestañas (`SUB_TABS`, SS l.185; menú ☰ `ComprasMenuDropdown`, etiquetas en `src/state/comprasMenu.ts`): **Inicio · Lista de la compra · Historial de precios · Tickets · Estadística compras**. El menú solo ofrece «📌 Sacar / 📍 Quitar» (ya no hay modo Editar). Destinos de Ayuda: `compras.inicio|lista|historial|tickets|estadistica` (`HelpDestMark`, SS l.309-313; se pintan al montar la pestaña, **no** al terminar de cargar sus datos).

Leyenda: ✔ existe y funciona · ◐ parcial/limitado · ✘ no existe.

### 2.1 Inicio (`ComprasInicioTab`, SS l.325)
- ✔ 4 tarjetas de acceso (Lista, Historial, Tickets, Estadística) con `data-help-id` `shopping.card-*`.
- ✔ «🛒 PEPA analiza tus compras» (`PepaComprasWidget`, `shopping.insights`): carrusel de frases de `domain/shoppingInsights.ts` (tienda habitual más barata, producto frecuente/emergente/desaparecido, precio mínimo por tienda, recompra anticipada, cesta habitual, categoría por tienda). Con pocos datos: «Todavía necesito más tickets o compras registradas…». «+info →» salta al Historial con el producto buscado.
- ✔ «Este mes llevas X € registrados en la cesta de tickets de alimentación» (`shopping.basket`) y «¿Por qué ha cambiado mi compra?» (`shopping.why-changed`: desglose precio/cantidad/productos nuevos; exige compras en el mes actual y el anterior).

### 2.2 Lista de la compra (`ShoppingListTab`, SS l.725)
- ✔ **Añadir producto**: botón flotante «+ Añadir producto» (oculto en Modo compra) → hoja con Nombre (con sugerencias de productos ya conocidos; al coincidir rellena cantidad/unidad y enseña «Último precio»), Cantidad, Unidad, **Tienda (opcional)**, **Prioridad** (Alta/Normal/Baja), **«📷 Foto del producto (opcional)»**. «Añadir» NO cierra la hoja (para añadir varios; la tienda se queda puesta). Emite `shopping.product-added`.
- ◐ El desplegable de tienda del formulario (`datalist known-stores`) se alimenta de **las tiendas que ya tienen algún producto en la lista** (`knownStores = items.map(i=>i.store)`, SS l.1224/1246), **no** de las tiendas dadas de alta en «🏬 Tiendas». Una tienda recién creada y sin productos no se sugiere al escribir. (Sí se ofrece en el selector «¿En qué tienda?» al mandar un producto desde Historial con 🛒, SS l.2969-3014, y la reconoce la voz.)
- ✔ **Editar**: tocar el nombre → «Editar producto» (nombre, cantidad, unidad, tienda, prioridad, foto: ver/cambiar/quitar). Emite `shopping.product-updated`.
- ✔ **Borrar** deslizando a la izquierda («🗑 Eliminar»), **reordenar** arrastrando ⠿ (dentro de su clase / dentro de Completados), **plegar/desplegar** cada tienda tocando su cabecera, tocar el logo lleva a esa tienda.
- ✔ **Agrupación**: por tienda (orden de «🏬 Tiendas»; «Sin tienda» siempre el último) y, dentro de cada tienda, por clase de producto (resolutor central `domain/productClass.ts`). Lo marcado va a un bloque plano «✓ Completados» al final de su tienda (SS l.1151-1164).
- ✔ **Marcar comprado**: círculo ✓ a la derecha (`shopping.item-check`); es un interruptor (otra vez → pendiente). Solo `update status`. Emite `shopping.item-status-changed`. Contador «X/Y comprados» (`shopping.counter`).
- ✔ **Modo compra** (`shopping.shopping-mode`, botón «🛒 Modo compra»/«Salir de modo compra»): oculta asas de arrastre, borrar-deslizando, prioridad en la línea, «⚙️ Gestionar clases» y el botón flotante; con ≥1 comprado enseña «🧾 X €» (suma de `item.price` o último precio conocido; «(n sin precio conocido)»). Es una **estimación en pantalla**, no un registro.
- ✔ **✅ Finalizar compra** (por tienda, debajo de su lista, no se pinta si la tienda está plegada): `ConfirmButton` «✅ Finalizar compra» → «¿Seguro?» «Sí, finalizar» / «Cancelar». Borra **solo los ítems comprados de ESA tienda**; los pendientes se quedan. (El comentario de `deleteShoppingItems` en `data/shopping.ts` dice «comprados y sin comprar»: está **desfasado**, el llamador filtra a comprados.) No crea nada en historial/precios/gastos.
- ✔ **Compartir**: «📤 Compartir todo» (solo si hay algo pendiente, `pending.length > 0`) y 📤 en la cabecera de cada tienda (siempre que exista la cabecera, aunque solo haya comprados). Solo lo pendiente; `shareText`: menú del móvil → si falla, portapapeles («Copiado al portapapeles.»); si no hay nada pendiente en esa tienda, «No hay nada pendiente que compartir.».
- ✔ **Comparar la lista entre tiendas** (`ListPriceComparison`, `PriceComparisonPanels.tsx`): botón «💶 Comparar la lista entre tiendas» (aparece con ≥2 pendientes); calcula el total por tienda con los precios que la familia ya pagó, marca la más barata, avisa de precios >2 meses y de artículos sin precio. **Sin tutorial ni marca `data-help-id`.**
- ✔ **🏬 Tiendas** (`StoreManager`, `<details>` cerrado por defecto; `shopping.stores` es el `<summary>`): texto de ayuda de voz («Mercadona, patatas»), «Cadenas conocidas de PEPA» (`shopping.store-chains`; tocar una la añade; si ya hay una tienda parecida pregunta «¿"X" es Mercadona? Sí, vincular / No, es otra tienda»), lista de tiendas con asa ⠿ para ordenar, tocar el nombre para renombrar (✓/✕), ✕ con doble toque para quitar, y campo «+ Añadir otra tienda» (`shopping.store-new`) + «Añadir» (emite `shopping.store-added`).
- ✔ «⚙️ Gestionar clases de productos» (fuera de Modo compra) → `openManager('clases')` (ventana global).
- ✘ Viajes de compra e inventario: solo capa de datos, sin pantalla (ficha `com-viajes-inventario` desactivada).
- Entradas externas a la lista (no son pantallas de Compras pero la llenan): voz («Pepa, Mercadona, patatas»; evento `family-app:compras-changed`), Historial 🛒, menú de Cocina/Comunidad (`ShoppingLinesSheet.tsx` / `KitchenMenuShoppingSheet.tsx`: hoja «Añadir a Compras» con revisión, marca «Ya está en tu lista», todo-o-nada), Eventos (`eventId`).

### 2.3 Historial de precios (`HistoryTab`, SS l.2313)
- ✔ Dos vistas **Alimentos / Otros** (`shopping.history-mode`). Texto fijo: «Se construye con los tickets que guardas (y con las compras sin ticket que lleven productos). Marcar «comprado» en la lista no guarda precios.»
- ✔ «Sugerencias para la próxima compra» (`history-suggestions`): hasta 10 productos con `isDue`, ordenados por nº de compras; 🛒 → pregunta tienda → añade a la lista con el último precio.
- ✔ Buscador (nombre o clase) (`history-search`) y ⚙️ «Clasificaciones de productos» (`history-classes`).
- ✔ «Total de la compra» (`history-total`): cesta del mes **de la vista elegida** (en «Otros» es la cesta de Otros, no de alimentación) + variación vs mes anterior.
- ✔ Lista agrupada por clase (plegable), precio actual con ▲/▼ % vs mes anterior cuando hay compra en ambos meses.
- ✔ **Ficha del producto** (`history-product` → `product-detail`): cada cuántos días lo compras, nº de compras con precio, media/mín/máx en su magnitud (€/kg o €/ud, nunca mezcladas; las antiguas sin unidad se excluyen y se avisa), subida/bajada del mes, «Por tienda:» con la más barata, **desplegable de clase** (`shopping.product-class`: «Automático (…)» + clases de Alimentos y Otros; guarda al instante; emite `shopping.product-class-changed`), botón 🚫/✅ «marcar como Otros» (solo si el producto no tiene clase conocida) y el panel **«Precio por tienda»** (`ProductPriceComparison`): chips «Solo el mismo / + Equivalentes», filas por tienda con último precio, fecha, «🏷️ más barato», «+x % que el más barato», tendencia desde la primera compra, histórico desplegable, y decisiones de la familia «No es equivalente» / «¿Es lo mismo? Sí, equivalente / No». «Son precios que habéis pagado vosotros, no ofertas de hoy.»
- Comparaciones que existen: (1) mes actual vs anterior por producto y en el total, (2) entre tiendas por producto (y equivalentes), (3) lista pendiente entre tiendas, (4) «¿Por qué ha cambiado mi compra?», (5) en Estadística, comparativa de periodo por tienda (`PeriodComparison`).

### 2.4 Tickets (`ReceiptsTab` + `ReceiptForm`, FS l.4819 y l.5933)
Un **mismo formulario** `ReceiptForm` (modo `add`, `edit` y «añadir ticket a una compra» `attachTo`) arriba de todo.
- ✔ Selector **«📷 Con ticket / ✍️ Sin ticket»** (chips; oculto al adjuntar a una compra existente).
- ✔ **Con ticket**: «+ Añadir foto o PDF» abre una **hoja propia** (`FileOrPdfPicker` con `sheetTitle` → `FileSourceSheet`, `modal-overlay`): «📷 Hacer foto / 🖼️ Elegir de la galería / 📄 Elegir PDF / Cancelar». Nota «La foto se borra a los 3 meses». «📷 Leer ticket» (IA Gemini vía `analyze-receipt-photo`; solo adultas y si la IA está activa; el botón da el aviso genérico «No se pudo leer el ticket» si no) rellena Establecimiento, Fecha, Importe y líneas; omite líneas que no son producto (PARKING…) y separa descuentos (importes negativos, se guardan como «Descuentos del ticket»).
- ✔ **Sin ticket** (compra manual): sin foto; exige **importe > 0** y fecha (`validateManualPurchase`); establecimiento, forma de pago y productos son opcionales. Se guarda como «Guardar compra» (`is_manual = true`, gasto con `source = 'manual'`).
- ✔ Campos: Establecimiento (datalist de tiendas), Fecha, Importe total (€), **Categoría** (viene la subcategoría «Supermercado, carnicería y tiendas de alimentación» o «Alimentación», `defaultReceiptCategory`; selector de dos niveles + «⚙️ Gestionar categorías»), **¿Quién? (opcional)** (por defecto la persona que registra).
- ✔ **Forma de pago** (`PaymentSection`, `CashAndPaymentsUi.tsx`): lista cerrada `efectivo · tarjeta · bizum · transferencia · otro` (`domain/manualPurchase.ts`); con «Efectivo» y si la persona tiene carteras: selector «Cartera de efectivo / Sin cartera»; «+ Pagar con varios medios» (reparto que debe cuadrar con el total: «✓ Cuadra con el total / Faltan X / Sobran X», «+ Otro medio», «Un solo medio»). Si el efectivo supera el saldo de la cartera: aviso NO bloqueante (continuar, añadir efectivo o cancelar). No existe selector de **cuenta bancaria** en el ticket.
- ✔ **Productos**: «+ Añadir productos a mano (opcional)» (aparece con foto elegida o en «Sin ticket», si aún no hay líneas) y «+ Añadir línea» → editor de líneas (símbolo de clase [tocar para elegir Alimentos/Otros y clase], nombre, badge «Nuevo», ✕, cantidad o peso, unidad ud/kg, precio por unidad o por kg, «= importe»). ⚙️ «Clasificaciones de productos» dentro del propio bloque. Resumen automático «N productos suman X € … cuadra con el total / faltan / sobran… Puedes guardar igualmente» (`ticketLinesSummary.ts`); líneas sin precio válido no se guardan; negativas tampoco (van a descuentos). → **«Añadir líneas a mano durante la revisión inicial» YA existe** (publicado el 24/10/2026).
- ✔ **Qué crea «Guardar ticket / Guardar compra»** (`uploadReceipt`, `src/data/receipts.ts` l.68-183): (1) sube la foto/PDF al bucket privado `receipts` (comprimida); (2) **si hay importe**: busca un gasto del banco sin ticket con el mismo importe a ±7 días y, si lo hay, **lo enlaza** y le pone categoría/tienda (no crea gasto nuevo); si no, **inserta un gasto real** (`expenses`, `source = 'ticket'` o `'manual'`, categoría = la del formulario, `payment_method`); una compra manual solo se une a gastos `banco`; **efectivo y «mixto» nunca se unen a un apunte del banco**; (3) inserta el `receipts` (con `expense_id`, categoría, quién, descuentos, forma de pago); (4) si hay varios pagos o una cartera: `set_purchase_payments` (RPC 0312; un solo gasto, varios pagos; el efectivo con cartera resta de la cartera); (5) por cada línea guardable: `recordProductPurchase` → crea/actualiza `products` y **inserta `product_prices`** (único camino que alimenta el Historial) y solo si la persona eligió clase a mano se guarda `setProductFoodType` (queda «confirmada por la familia»). Sin importe no se crea gasto en Economía. Emite `shopping.receipt-saved`.
- ✔ Avisos antes de guardar: «¿Es una compra que ya apuntaste?… añadir el ticket a ella» (ticket nuevo con foto+importe que coincide con una compra manual sin ticket; **solo se ofrece**, nunca se une sola) y, solo en «Sin ticket», «Ya tienes este gasto apuntado en Economía… usarlo para esta compra / No, es otra compra».
- ✔ **Tras guardar**: «Tickets guardados» en carpetas por tienda (plegadas), filtradas por el selector de fecha de «Cuánto he gastado» (por defecto Mes contable; aviso «Hay N tickets más guardados en otras fechas · Ver todos mis tickets»), «+ Añadir tienda», panel «🔎 posibles duplicados», y por fila: 👁 ver, 📤 compartir, ↩️ devolución (total/parcial; resta del gasto, **no** es ingreso), 📎 añadir el ticket a una compra manual, ✏️ editar (mismo formulario; sustituye todas las líneas), ✕ borrar con aviso de lo que pasará + «Deshacer» (la foto no se recupera). Filas «📎 falta ticket» para gastos de banco sin ticket.
- ◐ **Borrado de la foto a los 3 meses**: la migración `0056` marca `storage_path = null` pasados 3 meses desde la fecha del ticket y `0057` programa un cron que llama a la función `purge-old-receipt-photos`; **esa función NO está en `supabase/functions/` ni en el historial de git**, y `src/admin/features/featureInventory.ts` l.184 lo reconoce («depende de una Edge Function no versionada»). **No comprobado** que esté desplegada y funcione. Los textos de Ayuda lo afirman como hecho.
- ◐ Importación automática: ticket digital de Mercadona por correo y pedidos de Amazon (`mercadona-ticket-webhook`, `amazon-order-webhook`) se guardan sin pasar por la revisión; no hay pantalla propia (solo lo cita el explicador).

### 2.5 Estadística compras (`BudgetsTab group="alimentacion"`, FS l.7082-7830)
- ✔ Filtro «📅 Fecha», «Total Registrado en Compras» (Alimentación + Otros, % del gasto total, «Ver movimientos →» a Economía), aviso de «Productos sin clasificar», avisos «la clasificación es una sugerencia» y «este total cuenta también compras sin ticket».
- ✔ Comparativa de periodo por tienda, chip Alimentación/Otros que gobierna dos dónuts (por tienda; por tipo de alimento / por clasificación en Otros), lista desplegable por tipo/clase, y «Solo con ticket subido» (reparto por tienda y gasto mensual).
- **Sin tutorial; solo 1 paso en la visita.** Sin marcas `data-help-id`.

### 2.6 Permisos y plataforma
- Los 9 tutoriales tienen `access: null` (sin regla propia). La Ayuda solo comprueba que la cuenta pueda entrar en `/compras` (`access.ts` `canEnterPath` por secciones permitidas). **«📷 Leer ticket» es solo para adultas** (puerta de IA en servidor) y depende del interruptor de IA: el tutorial lo dice.
- Carteras de efectivo y gastos de Economía respetan la sección «dinero» y el modo de cuentas en servidor (comentario de `0312`); **no comprobado** qué ve en el formulario de ticket una cuenta sin acceso a Economía (el selector de cartera solo se pinta si `usableWallets` no está vacío).
- No hay reglas por plataforma en Compras. iOS/Android: la web es la misma (Capacitor).

---------------------------------------------------------------------
## 3. Duplicados, solapes, lagunas y discrepancias texto ↔ código

### 3.1 Solapes
- `visita-compras` (A) y los tutoriales repiten descripciones de Lista/Historial/Tickets: es normal (A resume, B enseña), pero hoy A no enseña las relaciones entre secciones.
- `tut-compras-tiendas` paso `agrupada` y `com-anadir-producto` paso `tienda` explican lo mismo («la lista se agrupa por tienda»).
- `tut-compras-clase-historial` (clase en Historial) y `tut-compras-subir-ticket` pasos `clase` (clase por línea) cubren el mismo concepto en dos sitios; ambos remiten al mismo explicador.
- `tut-compras-editar-producto` y `com-anadir-producto` comparten el 80 % de los campos (hoy ninguno cita prioridad ni foto).
- Mensajes del marcar-comprado (`finalizar`, `finishText`) y del Historial (`total`) se complementan, pero solo uno dice «no registra».

### 3.2 Funciones importantes sin tutorial (ver §2)
Compra sin ticket · forma de pago/varios medios/cartera · ¿Quién? · «+ Añadir productos a mano»/«+ Añadir línea» y cuadre de importes · avisos de duplicado/vinculación con Economía · 📎 añadir ticket después · ✏️ editar ticket · ↩️ devolución · borrado seguro + Deshacer · carpetas «Tickets guardados» y filtro de fechas · «Precio por tienda»/equivalentes · «Comparar la lista entre tiendas» · Estadística compras · prioridad y foto del producto · renombrar/ordenar/quitar/vincular tiendas · «⚙️ Gestionar clases» (crear/editar/borrar clases) · plegar tiendas · borrar deslizando y reordenar (solo mencionado en negativo) · sugerencias 🛒 del Historial · «PEPA analiza tus compras» (solo en la visita) · añadir por voz.

### 3.3 Discrepancias texto actual ↔ código

| # | Dónde | Texto actual | Realidad en código | Gravedad |
|---|---|---|---|---|
| D1 | `tut-compras-marcar-comprado` paso `marcar` | «queda tachado **en su sitio** y no desaparece» | Se mueve a «✓ Completados», al final de su tienda, atenuado (SS l.1151-1164; confirmado por `legacyHelp.ts` l.207) | media |
| D2 | mismo tutorial, `finalizar` | señala la **cabecera de la tienda** («Mercadona») pero habla del botón «✅ Finalizar compra» | ver incidencia (a) | alta |
| D3 | mismo tutorial | No dice que marcar/finalizar **no** registra compra/gasto/precio | Es la regla funcional importante | alta (regla de la usuaria) |
| D4 | mismo tutorial, `modo` | «si PEPA conoce los precios, te va sumando lo que llevas» | Cierto, pero es una **estimación** con último precio conocido, no un gasto (puede no cuadrar con el ticket) | baja (aclarar) |
| D5 | `tut-compras-tiendas` `finishText` | «Al apuntar un producto podrás elegirla» | El campo Tienda del alta solo sugiere tiendas **que ya tienen productos** (`knownStores` de los ítems); la tienda nueva hay que escribirla igual (o usar voz / el selector del Historial) | media |
| D6 | `com-anadir-producto` | Campos citados: nombre, tienda | También Cantidad, Unidad, Prioridad y «📷 Foto del producto (opcional)» (visibles en el formulario) | baja-media (omisión) |
| D7 | `tut-compras-editar-producto` | «el nombre, la cantidad y la unidad» + tienda | También Prioridad y bloque de Foto (ver/cambiar/quitar) | baja |
| D8 | `visita-compras` `historial` | «si lo habéis comprado en varias tiendas, dice dónde sale más barato» | Cierto, pero **solo dentro de la ficha del producto** («Por tienda»/«Precio por tienda»); la lista no lo dice | baja |
| D9 | `visita-compras` `tickets` | «aquí se sube la foto o el PDF de un ticket» | Omite «✍️ Sin ticket» y la forma de pago; la tarjeta de Inicio dice «Sube la foto del ticket y consulta el gasto por tienda» | media |
| D10 | `tut-compras-historial-precios` `total` | «lo registrado este mes en la cesta de alimentación» | En la vista «Otros» el total es el de Otros (`purchases` filtradas por `mode`) | baja |
| D11 | `tut-compras-subir-ticket` `datos` | «Revisa Establecimiento, Fecha e Importe total» | El marco solo rodea Establecimiento; Fecha e Importe quedan fuera del resaltado (existe la marca `shopping.receipt-total` sin usar) | baja |
| D12 | `tut-compras-subir-ticket` `guardar` | «Si pusiste el importe, también se apunta como gasto en Economía (o se une al del banco si ya estaba)» | Correcto, pero incompleto: el **efectivo y los pagos mixtos nunca se unen al banco**; la compra manual solo se une a gastos de banco; sin importe no hay gasto | media (precisión) |
| D13 | mismo, `form` + `finishText` | «La foto se borra a los 3 meses» / «Lo encontrarás en la carpeta de su tienda» | Borrado: función no versionada (no comprobado). Carpeta: plegada por defecto y solo visible si el ticket cae en el periodo del filtro de fecha | media |
| D14 | `exp-compras-clasificar-productos` | «lista compartida … tres cadenas … solo la actualiza la administración … no enseña a otras familias» | `0308` + trigger de votos + `legacyHelp` («PEPA aprende de todas las familias, en cualquier tienda…»). Orden real en `resolve_shared_product_class`: cadena aprobada > revisión admin > validada > provisional | **alta (contenido C incorrecto)** |
| D15 | `exp-compras-leer-ticket` | «Las líneas con importe negativo… “Descuentos del ticket”»; «Si tu familia recibe el ticket digital de Mercadona por correo…» | Coincide con el código. Pero «Ya lo guardaste… ✏️ es el mismo formulario» y todo el bloque de pagos/sin ticket no se menciona | baja |
| D16 | `com-ticket` (ficha) `limits` | «puedes añadir y corregir las líneas a mano con «+ Añadir productos a mano»» | Coincide | — |
| D17 | `data/shopping.ts` comentario de `deleteShoppingItems` | «comprados y sin comprar» | El único llamador (`finalizePurchase`) pasa solo comprados | informativo (comentario del código) |
| D18 | `docs/VALIDACION_MOVIL_COMPRAS_ECONOMIA.md` fila 7 | «Aparece como **ingreso** vinculado a la compra» | App y SQL: la devolución «NO cuenta como ingreso: resta del gasto» (`RefundPanel`, `0312`) | informativo (documento interno, no de Ayuda) |

Textos de Ayuda que **sí** son correctos respecto a la regla de la usuaria: ficha `com-historial-precios.limits`, `legacyHelp` («Marcar “comprado” SOLO cambia el estado…»), `tut-compras-historial-precios.total`, UI del Historial (SS l.2752 y 2895).

### 3.4 Comprobaciones de los demás tutoriales (omisiones de campos visibles y textos)
- `com-anadir-producto`: ver D6. Paso `nombre` («PEPA te propone productos que ya has comprado»): la sugerencia sale de **todos los productos conocidos** (`buildSuggestions` sobre `products`, incluye los creados solo por foto de la lista), no estrictamente «ya has comprado»; imprecisión menor. Paso `tienda` marcado `optional` pero siempre existe (etiqueta del formulario).
- `tut-compras-editar-producto`: paso `tocar` pide tocar el nombre (existe `shopping.item-name`); si no hay productos queda esperando 3,5 s y pasa a «roto» (comportamiento deseado: «pulsa Salir»).
- `tut-compras-clase-historial`: paso `producto` dice «Si el historial está vacío… prueba antes “Subir un ticket”»; no menciona la vía «compra sin ticket con productos» que también llena el historial. Detalle «Automático» correcto (resolutor: aprendizaje compartido → reglas).
- `tut-compras-subir-ticket`: pasos `productos` y `clase` son opcionales y **solo existen si ya hay líneas** (tras «Leer ticket» o «+ Añadir productos a mano»): quien no use la IA nunca verá esos dos pasos (se omiten a los 350 ms) y por tanto **nunca aprende «+ Añadir productos a mano»**. No hay camino sin archivo: el paso `foto` (no opcional, sin «Siguiente») obliga a elegir una foto/PDF o salir.
- `tut-compras-historial-precios`: pasos 1-3 apuntan a controles que existen solo tras cargar el historial; `ficha` exige que haya al menos un producto (si no, «roto» tras 3,5 s). Faltan `history-classes` (⚙️) y el panel «Precio por tienda».
- `visita-compras`: `menu` coincide con las etiquetas reales; `lista`, `estadistica`, `analisis`, `cambio` coinciden. Los dos últimos son opcionales y se alcanzan al final (la carga ya terminó), no sufren el problema (b)/(c).

---------------------------------------------------------------------
## 4. Dependencias

### 4.1 Navegación
Todos: `startPath '/compras'`. `startDest`: `compras.inicio` (visita), `compras.lista` (anadir, editar, marcar, tiendas, compartir), `compras.historial` (clase, historial-precios), `compras.tickets` (subir-ticket). Las pestañas **no son rutas**: el motor pide el destino (`requestDestination`) y espera la marca `data-help-dest` (`waitForDestination`, máx. 8 s), que `ShoppingScreen` pinta al montar la pestaña, **antes** de que la pestaña termine de cargar datos (Lista: “Cargando lista…” l.1061; Historial: “Cargando historial…” l.2747; Tickets: “Cargando tickets…” FS l.4941).

### 4.2 Datos que necesita cada tutorial (y qué pasa si faltan)
| Tutorial | Necesita | Si falta |
|---|---|---|
| anadir-producto | nada | — |
| editar-producto | ≥1 producto | paso 1 «roto» a los 3,5 s |
| marcar-comprado | ≥1 producto | paso 2 «roto»; el final `finalizar` es opcional (se omite) |
| tiendas | nada (`agrupada` y `cadenas` son opcionales; `cadenas` solo existe si quedan cadenas sin vincular) | omisión silenciosa |
| compartir | pendientes para «Compartir todo»; cualquier tienda para el 📤 | omisión silenciosa (ver b/c) |
| clase-historial | ≥1 producto con precio | paso 2 «roto» |
| subir-ticket | **un archivo** (foto/PDF) | paso 2 sin salida salvo «Salir» |
| historial-precios | ≥1 producto con precio (paso 4) | paso 4 «roto» |

### 4.3 Elementos interactivos y modales
- Modales sobre los que el tutorial opera: hoja «Añadir producto» / «Editar producto» (`modal-overlay`, z-index 50), ficha de producto (Historial), hoja «Añadir ticket» (`FileSourceSheet`), selector de categoría (modal), `ShortfallDialog`, `DeletePurchaseDialog`. **El panel del tutorial vive en z-index 1300** (`tours.css` l.9) y la capa tiene `pointer-events:none` salvo el propio panel (que sí bloquea lo que tapa).
- `<details>` cerrado: «🏬 Tiendas» (`shopping.stores` es el `<summary>`).
- Controles sin `data-help-id` que haría falta marcar para el rediseño: botón «✅ Finalizar compra», chips Con/Sin ticket, `PaymentSection`, «¿Quién?», «+ Añadir productos a mano», «+ Añadir línea», resumen de cuadre, hoja de origen de foto, carpetas de «Tickets guardados», acciones de fila (👁 📤 ↩️ 📎 ✏️ ✕), «🔎 posibles duplicados», «Comparar la lista entre tiendas», panel «Precio por tienda», prioridad/cantidad/unidad/foto del formulario de producto, filas de tienda del gestor, y todos los bloques de Estadística. Regla del repo: cada `target` debe existir en el código (`tourDefs.test.ts`).
- Estado persistente entre ejecuciones: el `<details>` de Tiendas y el Modo compra viven en el estado de la pestaña montada; si la persona ya estaba en Lista con Tiendas abierto, el tutorial lo encuentra abierto (ver b).

---------------------------------------------------------------------
## 5. Incidencias de iPhone — causa en código, prioridad y corrección

### Mecánica del motor que explica (b), (c) y la parte de (a)/(d)
- **Paso opcional cuyo control no existe → se omite casi al instante**: `TR.measure()` (l.260-267): si el `target` no se encuentra, empieza a contar `missingSince`; con `step.optional` el límite es `min(missingAfterMs, OPTIONAL_GRACE_MS=350)`; superado, `dispatch({type:'target-missing', index})` → en `EN.reduceTour` (l.107-111) un paso opcional hace `advance(tour, state, state.index)`, que lo **añade a `state.skipped`** (l.61-66). No se avisa a la persona.
- **Paso con `skipIf`**: `TR.measure()` l.244-250: la primera vez que se evalúa un paso, si alguna señal `appear` de `skipIf` ya está en pantalla → `dispatch({type:'skip'})` → también a `skipped`.
- **«Atrás» no vuelve a los omitidos**: `previousIndex()` (EN l.122-126) salta los índices de `skipped`; el botón solo se pinta si `previousIndex(state) !== null` (TR l.541). Con el primer paso omitido **no hay botón «← Atrás»** (no deshabilitado: ausente). El comentario del motor lo justifica («volver a un paso omitido lo dejaría saltar otra vez hacia delante»).
- **El contador cuenta lo omitido**: `Paso {index+1} de {total}` (TR l.611-615), `total = tour.steps.length`. Por eso aparece «Paso 3 de 4» como primera pantalla visible.
- **«Reiniciar»** (⋯ Más) vuelve a `startState` (índice 0, `skipped = []`) y los pasos se reevalúan: es la única vía actual para ver un paso omitido, pero solo funciona si el control ya existe.

### (a) «Usar Modo compra y marcar lo comprado»: el último paso dice «Finalizar compra» pero resalta «Mercadona»
- **Causa comprobada**: G2 paso `finalizar` tiene `target: 'shopping.store-heading'` (G2 l.161). Esa marca está en el `<h3>` de la cabecera de tienda (SS l.1104). El botón «✅ Finalizar compra» es un `ConfirmButton` (SS l.1165-1170) **sin `data-help-id` ni forma de pasarlo** (`ConfirmButton.tsx` no tiene esa prop), así que se eligió la cabecera como aproximación. `findTarget` devuelve la primera cabecera visible (la de la primera tienda).
- **Prioridad**: media-alta (confunde en el único paso que habla de borrar datos; arreglo trivial).
- **Corrección recomendada**: añadir `data-help-id="shopping.finish-purchase"` al botón (envolverlo en un `<span>` o añadir `helpId` a `ConfirmButton`) y apuntar el paso ahí (sigue `optional` porque el botón no se pinta con la tienda plegada). Reescribir el texto añadiendo «solo quita de la lista lo tachado de esa tienda; no guarda compra, gasto ni precio». Con cabeceras plegadas el paso se omite en silencio (aceptable; mejor texto condicional).

### (b) «Crear tiendas y agrupar la lista por tienda» empieza en el paso 3/4 y no deja volver al primero
- **Causa comprobada (mecanismo)**: dos pasos iniciales entran en `skipped`:
  1. `agrupada` (G8 l.18-25; `optional`, target `shopping.store-heading`). `ShoppingListTab` devuelve solo `<p>Cargando lista…</p>` mientras `loading && !initialized` (SS l.1061) —10 consultas en paralelo en `reload()` l.822-833— y el tutorial arranca en cuanto aparece `HelpDestMark` (SS l.310, que no espera a los datos). Sin cabecera durante >350 ms → paso omitido. También se omite legítimamente si la lista está vacía (el propio texto lo avisa).
  2. `abrir` (G8 l.26-35) tiene `skipIf: [appear shopping.store-new]` **y** `completeOn appear shopping.store-new`. `shopping.store-new` es el campo «+ Añadir otra tienda», que está **dentro del `<details>` cerrado** (SS l.1453-1573). `findTarget` (DT l.5-25) decide «visible» solo con `[hidden]`/`[inert]`, `getBoundingClientRect()` (ancho/alto > 0) y `visibility/display` calculados; **no mira si hay un `<details>` cerrado**. Si el navegador devuelve geometría no nula para el contenido de un `<details>` cerrado, el paso se omite y el siguiente (`cadenas`, que también está dentro del `<details>`) se enseña con un marco sobre algo invisible. Si el `<details>` **ya estaba abierto** (la persona ya estaba en Lista con «🏬 Tiendas» desplegado; la pestaña no se remonta) la omisión es correcta por diseño, pero igual deja a la persona sin poder ver ese paso.
- Resultado: `skipped = [0, 1]` → `previousIndex = null` → sin «← Atrás»; contador «3 de 4».
- **No comprobado**: cuál de las tres vías (carga lenta, `<details>` ya abierto, geometría de `<details>` cerrado en WebKit) ocurrió en el iPhone de la usuaria. La primera vía es segura como mecanismo; la tercera depende del motor de WebKit (versión). Aun así, el síntoma exacto «3/4» encaja con la combinación (carga lenta/lista vacía → paso 1 omitido) + (paso 2 omitido por `skipIf`).
- **Prioridad**: **alta** (es del motor y afecta a todo tutorial con pasos iniciales opcionales o `skipIf`; ver (c)).
- **Corrección recomendada**:
  1. Motor: que `defaultVisible` descarte elementos dentro de `details:not([open])` (salvo el `summary`), y que `skipIf`/`appear` usen la misma noción.
  2. Que la llegada al destino espere a los datos: mover `HelpDestMark` **dentro** de la pestaña ya cargada (o un estado «listo») para Lista/Historial/Tickets.
  3. No omitir en silencio el **primer paso informativo**: o quitar `optional` (con texto condicional «si aún no tienes productos…») o hacer que `previousIndex`/contador solo ignoren los omitidos **que siguen sin existir** (si el control ya está en pantalla, «Atrás» debe poder volver).
  4. Contador: numerar solo los pasos no omitidos («Paso 1 de 3»).
  5. Contenido: abrir el desplegable es acción de la persona; ponerlo en el paso 1 con `skipIf` solo si el `<details>` está realmente abierto.

### (c) «Compartir la lista de la compra» empieza en el paso 2/3 y no deja volver al primero
- **Causa comprobada**: G8 l.69-75 paso `todo` (`optional`, target `shopping.share-all`). El botón solo se pinta con `pending.length > 0` (SS l.1080) y, además, no existe mientras la lista muestra «Cargando lista…» (SS l.1061). Dos vías de omisión:
  1. Carga (mismo mecanismo que b.1): >350 ms sin el botón → `skipped=[0]`; cuando carga, el paso 2 (`tienda`, target `shopping.store-share`, también opcional) ya existe y se enseña con «Paso 2 de 3».
  2. Lista sin pendientes pero con alguna tienda (p. ej. todo marcado como comprado): `share-all` no existe pero sí el 📤 de cabecera (SS l.1115-1127, se pinta aunque la tienda solo tenga comprados).
- Sin botón «Atrás» por `previousIndex`. Si no hay ninguna tienda, se omiten también el 1 y el 2 y se llega a «3 de 3» sin control señalado (paso `resultado` sin `target`).
- **No comprobado**: cuál de las dos vías ocurrió; ambas son legítimas desde el código.
- **Prioridad**: alta (misma raíz que b).
- **Corrección recomendada**: la del motor de (b); y de contenido, convertir el paso 1 en informativo no omisible («“Compartir todo” aparece cuando hay algo pendiente») con `target` opcional de apoyo, para que siempre se pueda leer.

### (d) «Subir ticket y revisar productos»: la tarjeta tapa el título superior en el primer paso y se superpone al selector de fotos/PDF
- **Causa 1 (primer paso)**: G2 `form` tiene `target: 'shopping.receipt-form'` = la marca del `<form>` **entero** (FS l.6361, solo `mode==='add'`). Es un elemento mucho más alto que la pantalla (chips, foto, Leer ticket, establecimiento, fecha, importe, categoría, quién, forma de pago, productos, botones). En `TR.measure()` l.275-280, si el elemento se sale (`top<60` o `bottom>alto-60`), hace `el.scrollIntoView({block:'center'})`: con un elemento más alto que la pantalla centra su **mitad**, dejando fuera el título «Subir ticket» y los chips Con/Sin ticket; además `choosePanelSide` (viewport.ts l.64-74) recibe un marco que solapa con arriba y con abajo y decide por «la mitad» (halfRule), con lo que la tarjeta puede quedar encima de la parte alta visible. **Esto es por lectura; el efecto exacto en iPhone no está comprobado.**
- **Causa 2 (paso `foto`)**: el control es `FileOrPdfPicker` con `sheetTitle` → al tocar «+ Añadir foto o PDF» se abre la **hoja propia** `FileSourceSheet` («Hacer foto / Elegir de la galería / Elegir PDF / Cancelar»), un `modal-overlay` anclado abajo (`align-items:flex-end`, z-index 50; styles.css l.4491-4511). El panel del tutorial es `position:absolute; bottom: calc(76px + safe-area)` dentro de una capa z-index 1300 con `pointer-events:auto` (tours.css l.1-66): **se pinta encima de la hoja y bloquea los toques en la zona que solapa** (típicamente «Elegir PDF» / «Cancelar»). El panel se coloca respecto al marco de `shopping.receipt-file`, que ya está tapado por el fondo oscuro; no sabe que hay una hoja. Lo que el iPhone muestra después (selector del sistema/cámara) es una capa del sistema que el panel no puede tapar; lo que sí se superpone es la hoja de PEPA.
- **Causa 3 (diseño)**: el paso `foto` no tiene ninguna salida si la persona no tiene una foto a mano (sin «Siguiente»).
- **Prioridad**: **alta** (es el tutorial principal de Tickets y el que bloquea el flujo en móvil).
- **Corrección recomendada**:
  1. Paso 1: señalar solo la cabecera (añadir `data-help-id` al `<h2>`/chips «Con ticket / Sin ticket») en lugar del formulario, con `manualNext`.
  2. Paso `foto`: dividir en dos: (i) señalar «+ Añadir foto o PDF»; (ii) al aparecer la hoja (`appear` sobre una marca nueva en `FileSourceSheet`) señalar sus tres opciones y **forzar el panel arriba/compacto** (o ocultarlo mientras haya una hoja `modal-overlay`). A nivel de motor: si hay un `.modal-overlay` visible que no sea el objetivo, elegir el lado contrario al de la hoja o bajar la tarjeta a modo compacto.
  3. Ofrecer una salida: «Siguiente» como alternativa («Si no tienes un ticket a mano, pasa al siguiente: te lo cuento sin guardar nada») o camino «Sin ticket».
  4. Añadir comprobación en una prueba de que el panel nunca solapa un `modal-overlay` abierto durante un paso que lo abre.

### (e) «Cambiar clase de un producto»: el último paso no resalta el desplegable (prioridad baja)
- **Qué dice el código**: paso `clase` (G2 l.197-210) → `target: 'shopping.product-class'` = el `<select>` de la ficha (SS l.2934), dentro de `.modal-sheet` (overflow-y:auto) y de `.inline-fields` (no `<label>`, así que `ringElementOf` no lo sustituye por una etiqueta). El marco es `box-shadow: 0 0 0 3px … !important` sobre el propio elemento (tours.css l.15-21). `completeOn` solo `event shopping.product-class-changed`; `sensitive`.
- **Causa**: **no determinable por lectura**. Hipótesis a verificar en el iPhone (`getComputedStyle(select).boxShadow`): (1) WebKit pinta el `<select>` nativo y puede ignorar o recortar el `box-shadow`; (2) el `overflow` del `.modal-sheet` recorta el halo en los bordes; (3) el desplegable ya no está en la zona libre tras abrirse el selector nativo. Distinto de los demás pasos del mismo tutorial (que sí resaltan botones).
- **Corrección recomendada**: envolver el `<select>` en un `<label>` o `<div data-help-id>` y apuntar el marco al contenedor (`ringElementOf` ya sabe resaltar la etiqueta); probar un `outline` además del `box-shadow`. Prioridad baja como pidió la usuaria.

### Incidencias adicionales halladas
- **X1 (media)** `tut-compras-subir-ticket` omite `productos` y `clase` si no hay líneas (§3.4): el camino «sin IA» nunca aprende a añadir productos a mano. Corrección: paso condicional «+ Añadir productos a mano» antes de `productos`.
- **X2 (media)** Esperas de 3,5 s para pasos no opcionales en pestañas con carga larga (Historial con siembra de clases, Tickets con 7 consultas + paginado `fetchAllRows`): un tutorial puede salir «roto» antes de que cargue. Misma corrección que (b.2).
- **X3 (baja)** Las fichas `com-ticket` y `com-historial-precios` no tienen `tour`; añadirlo cuando se unifiquen los recorridos.
- **X4 (baja)** `shopping.receipt-form` duplicado: existe también en `attachTo` (modo add); `findTarget` coge el primero visible.

---------------------------------------------------------------------
## 6. Propuesta de estructura (A / B con capítulos / C)

### 6.1 Veredicto sobre la estructura de la usuaria
Es **casi la agrupación óptima** (sigue el orden real de uso: lista → tiendas → tickets → historial). Ajustes justificados:
1. **T1 es nivel A (visita «Conoce Compras»), no un B.** Se mantiene como `visita-compras` ampliada con la relación entre secciones (ver 6.2). Así los «tutoriales B» son 4 (T2-T5), no 5.
2. **Faltan dos funciones en el esquema**: **Compartir la lista** (hoy `tut-compras-compartir`) → capítulo final de T2; **Estadística compras** (5.ª entrada del menú) → capítulo final de T5 (o, si T5 queda largo, solo A + C; ver decisión 7.2).
3. **«Clasificar artículos» se reparte** para no repetir: la *gestión de clases* y el *cambio de clase de un producto* en T3; la *clase por línea al revisar* en T4 (con una frase que remite a T3); *cómo decide PEPA y qué recuerda* solo en C. Hoy se explica en tres sitios.
4. **T4 debe abrir con «¿Con ticket o sin ticket?»** (hoy invisible) y separar **qué se revisa** de **cómo se paga**: es lo que hace que «medios de pago e Economía» pueda explicarse sin mezclar con la lectura del ticket.
5. «**Modificar cantidades**» (T2) es en realidad *editar producto* (nombre, cantidad, unidad, tienda, prioridad, foto): nombrar el capítulo «Editar y ordenar».
6. «**Consultar compras registradas**» (T5) vive en la pestaña **Tickets** (carpetas), no en Historial: su capítulo debe empezar en Tickets guardados, y lo dice el texto, para no confundir con T4.
7. **Duración**: cada capítulo 1-1,5 min. 5 capítulos ≈ 6 min por tutorial, dentro de lo que pide la usuaria; ojo con `durationSec ≤ 120` actual (ver 6.4).

### 6.2 Nivel A — «Conoce Compras» (T1, `visita-compras`)
Reutiliza: `menu`, `lista`, `historial`, `tickets`, `estadistica`, `analisis`, `cambio` (los dos últimos opcionales; se alcanzan tras la carga).
Reescribir: `historial` (aclarar que la comparación por tienda está en la ficha y en «Comparar la lista»), `tickets` (incluir «✍️ Sin ticket» y forma de pago en una frase), `estadistica` (añadir «incluye compras sin ticket y del banco»).
Falta (1-2 pasos nuevos, informativos): **«cómo se relacionan»** — Lista (lo que falta) → *marcar comprado solo tacha* → Tickets/compra sin ticket (lo que se registra: crea el gasto en Economía y llena el Historial) → Historial/Estadística (lo que se ve). Y «📌 Sacar» del menú ☰ (opcional). Sin acciones, ~90-100 s. Esto deja claro desde el primer minuto la regla de «Comprado».

### 6.3 Nivel B — tutoriales y capítulos

**T2 «Preparar y usar tu lista de la compra»** (~6 min, 5 capítulos)
| Cap. | Qué cubre | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 2.1 Añadir productos (≈1:15) | «+ Añadir producto», nombre con sugerencias, cantidad/unidad, tienda, prioridad, foto opcional, seguir añadiendo | `com-anadir-producto`: `abrir`, `nombre`, `guardar` | `tienda` (D5/D6: la tienda nueva se escribe; sugerencias solo de tiendas con productos) | pasos de Cantidad/Unidad, Prioridad, Foto (marcas `data-help-id`); mención de la voz |
| 2.2 Editar y ordenar (≈1 min) | tocar nombre, campos, guardar; borrar deslizando, arrastrar ⠿, plegar tiendas (solo explicado) | `tut-compras-editar-producto`: `tocar`, `nombre`, `tienda`, `guardar` | `nombre` (añadir prioridad/foto) | explicación de deslizar/arrastrar/plegar (sin hacerlos; con marca en ⠿) |
| 2.3 Ir de compras: Modo compra y tachar (≈1:15) | Modo compra, ✓, contador, total 🧾 estimado, lo tachado va a «✓ Completados», se puede desmarcar | `tut-compras-marcar-comprado`: `modo`, `marcar`, `contador` | `marcar` (D1: Completados), `modo` (D4: estimación); texto explícito **«solo cambia el estado en la lista; no registra compra, gasto ni precio»** | — |
| 2.4 Finalizar la compra (≈45 s) | qué borra (solo lo tachado de esa tienda), qué conserva, confirmación en dos toques, y «el gasto se registra en Tickets» | `tut-compras-marcar-comprado`: `finalizar` | **reescribir entero** y arreglar el `target` (incidencia a) | marca `shopping.finish-purchase` |
| 2.5 Compartir la lista (≈45 s) | «Compartir todo», 📤 por tienda, solo lo pendiente, menú del móvil / portapapeles | `tut-compras-compartir`: `todo`, `tienda`, `resultado` | `todo` no omisible (incidencia c) | — |

**T3 «Tiendas y clases de productos»** (~4,5 min, 3 capítulos)
| Cap. | Qué cubre | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 3.1 Crear y ordenar tus tiendas (≈1:30) | «🏬 Tiendas», cadenas conocidas, vincular, añadir a mano, renombrar, ordenar ⠿, quitar (doble toque) | `tut-compras-tiendas`: `abrir`, `cadenas`, `nueva` | `abrir` (sin `skipIf` frágil, incidencia b); `finishText` (D5) | pasos de renombrar/ordenar/quitar y de «¿Es Mercadona?» (marcas en las filas) |
| 3.2 Asignar tienda y leer la lista agrupada (≈1 min) | tienda al añadir/editar, grupo «Sin tienda», plegar, logo → ir a la tienda, 🛒 del Historial con «¿En qué tienda?» | `tut-compras-tiendas`: `agrupada`; `com-anadir-producto`: `tienda`; `editar`: `tienda` | `agrupada` (no omisible) | cabeceras como ejemplo; Historial 🛒 |
| 3.3 Clases de productos (≈1:30) | cómo se agrupa por clase en la lista, ⚙️ Gestionar clases (crear/editar/borrar, Alimentos/Otros), cambiar la clase de un producto (Historial → ficha), «Automático» | `tut-compras-clase-historial`: `lado`, `producto`, `clase` (+ detalles «Automático») | `clase` (arreglar marco, incidencia e); `lado` | paso de ⚙️ Gestionar clases (marca existente `shopping.manage-classes` / `history-classes`) |

**T4 «Registrar compras y tickets»** (~7 min, 5 capítulos)
| Cap. | Qué cubre | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 4.1 Elegir cómo registrar (≈1 min) | «📷 Con ticket / ✍️ Sin ticket»; compra sin ticket: tienda, fecha, **importe obligatorio**, forma de pago, «Guardar compra»; añadir el ticket después con 📎 | — | — | **todo nuevo** (marcas en los chips, en «Sin ticket» y en 📎) |
| 4.2 Subir y leer un ticket (≈1:30) | foto/PDF por la hoja (cámara, galería, PDF), «Leer ticket» (IA, solo adultas, puede estar apagada), «La foto se borra a los 3 meses» | `subir-ticket`: `form`, `foto`, `leer` | `form` (incidencia d), `foto` (hoja), borrar-a-3-meses (D13: verificar antes de afirmar) | marca en la hoja de origen; salida sin archivo |
| 4.3 Revisar datos y productos (≈1:30) | Establecimiento, Fecha, Importe, Categoría, ¿Quién?, productos leídos, **«+ Añadir productos a mano» / «+ Añadir línea»**, cantidad/peso, ud/kg, precio unitario, clase por línea y «Nuevo», aviso de cuadre, descuentos y líneas omitidas | `subir-ticket`: `datos`, `categoria`, `productos`, `clase` | `datos` (D11: marco), `productos` (no omisible, con el camino sin IA) | ¿Quién?, «+ Añadir productos a mano», resumen de cuadre, ⚙️ en el bloque |
| 4.4 Cómo se paga y qué pasa en Economía (≈1:30) | forma de pago (efectivo/tarjeta/Bizum/transferencia/otro), «varios medios» (suma = total, un solo gasto), cartera de efectivo opcional (aviso de saldo), qué crea Guardar en Economía: gasto con la categoría, unión con el cargo del banco (mismo importe ±7 días; efectivo y mixtos no se unen), avisos «¿Es una compra que ya apuntaste?» / «Ya tienes este gasto» | — | — | **todo nuevo** (marcas en `PaymentSection`, en los avisos); redactar solo con §2.4 |
| 4.5 Guardar y gestionar lo guardado (≈1 min) | «Guardar ticket», dónde queda (carpeta por tienda, filtro de fecha), ✏️ editar, 📎, ↩️ devolución (resta del gasto, no es ingreso), ✕ borrar con aviso y «Deshacer» | `subir-ticket`: `guardar`; finishText | `guardar` (D12), finishText (D13) | marcas en acciones de fila; el paso final debe poder cerrarse sin guardar (ver decisión 7.3) |

**T5 «Historial de precios, comparaciones y estadística»** (~6 min, 5 capítulos)
| Cap. | Qué cubre | Reutiliza | Reescribir | Falta |
|---|---|---|---|---|
| 5.1 Consultar tus compras registradas (≈1 min) | pestaña Tickets: «Cuánto he gastado» + filtro, carpetas por tienda, abrir una, ver líneas/foto, «falta ticket» | — | — | **nuevo** (marcas en filtro y carpetas) |
| 5.2 Leer el Historial (≈1:15) | Alimentos/Otros, total del mes (D10), sugerencias 🛒, buscador, ▲/▼ vs mes anterior | `tut-compras-historial-precios`: `total`, `sugerencias`, `buscar` | `total` | — |
| 5.3 Ficha del producto y precio por tienda (≈1:30) | media/mín/máx, cada cuánto, «Por tienda», «Precio por tienda», «Solo el mismo / + Equivalentes», «No es equivalente» | `historial-precios`: `ficha`, `detalle` | `detalle` (€/kg vs €/ud) | marca en el panel «Precio por tienda» |
| 5.4 Comparar tu lista entre tiendas (≈45 s) | «💶 Comparar la lista entre tiendas» (≥2 pendientes), tienda más barata, aviso de precios antiguos | — | — | **nuevo** (marca) |
| 5.5 Estadística compras (≈1:15) | Total Registrado, Alimentación/Otros, dónuts por tienda y por clase, «Solo con ticket», «Ver movimientos →» | `visita-compras`: `estadistica` (solo como base) | — | **nuevo** (marcas en los bloques) |

### 6.4 Nivel C — «Entiende cómo funciona PEPA»
Existentes: `exp-compras-leer-ticket` (correcto salvo ampliar con el camino sin IA y sin ticket) y `exp-compras-clasificar-productos` (**corregir D14 antes de reutilizar**).
Nuevos, todos con fuente comprobada en código:
1. **Qué hace y qué NO hace «Comprado» y «Finalizar compra»** (regla de la usuaria; `data/shopping.ts`, test `shoppingBoughtDoesNotFeedHistory`).
2. **De dónde sale el Historial y cómo se comparan los precios** (solo tickets/compras con productos/pedidos; €/kg vs €/ud; equivalentes y decisiones de la familia; precios >2 meses; «no son ofertas»).
3. **Cómo se une una compra con Economía** (gasto creado vs enlazado al banco, ventana ±7 días e importe exacto, efectivo/mixto no se unen, categoría y `classify_purchase`, duplicados nunca se unen solos, borrado seguro y deshacer).
4. **Medios de pago, carteras de efectivo y devoluciones** (opcional, `0312`).
5. **Qué se guarda y cuánto tiempo** (la foto, los datos, lo que borra la lista) — solo tras confirmar la función de purga (§2.4).
6. **Límites de la lectura con IA** (ya cubierto por `exp-compras-leer-ticket`).

Para A no repetir lo de B/C: A = visión y relaciones; B = pasos con controles reales; C = reglas, clasificaciones, límites.

### 6.5 Qué hay que tocar a nivel de sistema para soportar «capítulos» (no es contenido)
- `TourDef` no tiene capítulos ni «recorrido completo»; hoy `durationSec ≤ 120` y `next[]` (sugerencias finales). Opciones: (a) campo `chapters` con rango de pasos y menú de capítulos en el panel, o (b) un `TourDef` por capítulo + un `TourDef` «completo» que los encadena. Ambas obligan a revisar `tourDefs.test.ts`, `tourCoverage.test.ts` (`cardId`) y los botones «Enséñame» de las fichas.
- Los cambios de (b)/(c) (visibilidad en `<details>`, espera de datos, «Atrás», contador) afectan a **todos** los módulos; conviene arreglarlos antes de reescribir contenido.

---------------------------------------------------------------------
## 7. Decisiones de producto realmente necesarias
1. **Cómo se enseña el guardado en los capítulos de tickets/compra sin ticket**: hoy el último paso es `sensitive` (espera a que la persona guarde datos reales). Para un tutorial largo, ¿se exige guardar una compra real o se permite terminar «sin guardar» (paso final informativo con «Siguiente»)? Recomendación: permitir terminar sin guardar y avisar «no guardes si es solo práctica»; mantener `sensitive` solo si se quiere el evento de confirmación.
2. **Estadística compras**: ¿capítulo dentro de T5 (recomendado, 1:15) o solo A + C?
3. **Funciones avanzadas de dinero** (carteras, varios medios, devoluciones, duplicados): recomendación = *medios de pago y varios medios* dentro de B (cap. 4.4), y *carteras, devoluciones y duplicados* como un capítulo **opcional** corto o solo en C, porque no se han ejercitado todavía en datos reales (`docs/PLAN_DESPLIEGUE_COMPRAS_EFECTIVO_COMPARADOR.md`: «Los pagos mixtos y las devoluciones manuales siguen sin ejercitarse en datos reales» y la validación en iPhone/Android está pendiente). Hasta que la usuaria valide esas pantallas, no afirmar nada más de lo que dice el código.
4. **Borrado de la foto a los 3 meses**: antes de seguir afirmándolo en un tutorial nuevo hay que confirmar fuera de la auditoría (Supabase, que no puedo tocar) que `purge-old-receipt-photos` está desplegada; si no, cambiar el texto a «está programado» o quitarlo.
5. **Corrección del explicador de clasificación (D14)**: confirmar que la política vigente es la del `0308` (las confirmaciones votan, anónimas) para reescribirlo; el código y `legacyHelp` ya la dan por válida.

Todo lo demás (marcas nuevas, targets, textos, orden, arreglos del motor) se puede resolver con las recomendaciones de arriba sin decisión adicional.

---------------------------------------------------------------------
## 8. Qué NO he comprobado
- Comportamiento real en iPhone/Android (todas las incidencias a-e están analizadas solo por lectura; la geometría de `<details>` cerrado en WebKit y el recorte de `box-shadow` en `<select>` son hipótesis).
- Estado real de la función `purge-old-receipt-photos` y de las funciones de servidor en producción (no toqué Supabase).
- Si la IA de lectura de tickets está activa para la cuenta de la usuaria y qué ve una cuenta sin sección «dinero» en el formulario de ticket.
- Qué cadenas contiene hoy el catálogo `store_chains` en producción (el seed de `0142` trae Mercadona, Hiperber, Charter, Consum, Aldi, Lidl y 4 más no supermercado; el selector solo muestra las de tipo supermercado activas).
- Que `0308` esté en producción: lo afirma `docs/PEPA_CONTROL_REQUISITOS.md`; no lo verifiqué contra la base.
