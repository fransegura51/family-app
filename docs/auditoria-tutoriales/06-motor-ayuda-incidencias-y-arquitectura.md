# AUD_motor — Auditoría (solo lectura) del MOTOR de tutoriales y de la Ayuda

Repositorio leído: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (master 25/10/2026, HEAD d3641f5). Todo lo de abajo sale de leer código; **nada se ha ejecutado, probado ni visto en un iPhone**. Donde digo «no comprobado» es porque depende de un dispositivo real, de datos o del servidor.

Convención de referencias: `archivo` + función/línea aproximada. Rutas relativas a `src/`.

---------------------------------------------------------------------------------------------------

## 0. Resumen ejecutivo (lo que más importa)

| # | Hallazgo | Prioridad | Estado de la causa |
|---|---|---|---|
| A | **Sugerencias del buscador: el TÍTULO se pinta en blanco sobre blanco.** `.help-suggestion` (help.css:616) pone `background: transparent` pero **no fija `color`**; el CSS global `button { color: white }` (ui/styles.css:1199-1207) lo deja en blanco. Contraste 1,00:1 (1,13:1 al pasar el ratón). Solo el nombre del módulo (gris `--muted`) se lee. | **Alta** | Comprobada por lectura de CSS (no visto en pantalla) |
| B | **«¿Cómo funciona?» duplicado**: `explainersForCard()` devuelve TODAS las explicaciones que citan la ficha y `HelpAnswer` pinta un botón idéntico por cada una. 20 fichas tienen 2-4 explicaciones. | Media | Comprobada |
| C | **Tutoriales que «arrancan en el paso 3/4 o 2/3»**: los pasos `optional` se omiten solos a los 350 ms (en la práctica 350-750 ms) si su control no existe; pero la pestaña de Compras pinta la marca de llegada **antes** de que la lista termine de cargar (`Cargando lista…`), así que se omiten por una carrera de carga. Lo omitido va a `state.skipped` y «Atrás» nunca vuelve a ello; además el contador cuenta pasos omitidos. | **Alta** | Mecanismo comprobado; que ocurra en iPhone con red lenta: no comprobado, pero encaja |
| D | **Tarjeta que tapa controles**: el motor solo conoce UN control (`target`) por paso. No sabe nada de controles auxiliares que el texto manda usar, ni de hojas/ventanas de la propia app (z-index 1300 vs 50), ni de la zona segura real (usa constantes 8 y 100 px, el CSS usa 8+safe-top y 76+safe-bottom). Para destinos muy altos (formulario entero) siempre tapa algo. | **Alta** | Comprobada |
| E | **Resaltado equivocado**: `findTarget` devuelve el PRIMER elemento visible con esa marca; hay marcas repetidas por fila/tienda, contenedores en vez de controles, y **«✅ Finalizar compra» no tiene `data-help-id`** (`ConfirmButton` no admite la propiedad), por eso el paso apunta a la cabecera de tienda. | **Alta** | Comprobada |
| F | **Dos defectos del motor/progreso**: (1) repetir un tutorial ya «Hecho» y salir a mitad lo degrada a «dismissed» y **se pierde el ✓** (`setTourProgress('started')` al montar); (2) volver con «Atrás» a un paso **sensible** ya hecho deja sin «Siguiente» (solo se puede rehacer, reiniciar o salir). | Media | Comprobada |
| G | **Diagnósticos internos**: el panel «🛠 Solo administración PEPA» está bien protegido (`ownerKnown` = solo memoria, cero llamadas extra). **Pero** 4 fichas llevan en `quick` (texto público) frases de estado interno («apagada», «solo existe la base de datos preparada»). | Media | Comprobada |
| H | Capítulos: se puede construir **encima de lo que hay** (`reduceTour` puro, `TourRunner`, `prefs`), con `TourDef.chapters` opcional, alias de ids antiguos y una clave de progreso por capítulo compatible con el patrón de claves existente. Esfuerzo orientativo del motor/infraestructura: **15-18 jornadas**, más el trabajo de contenido (fusionar 109 tutoriales). Detalle en §4. | — | Propuesta |

Datos del catálogo actual (del volcado `tours_dump.json`): 129 entradas = 109 tutoriales + 20 visitas; 660 pasos en total; 236 pasos `optional` (36 %); 61 tutoriales (56 %) tienen al menos un paso sensible; 502 pasos con `manualNext`; 49 en grupos «Saltar opciones»; duración media de un tutorial 82 s, máximo 120 s (la prueba `tourDefs.test.ts:52` obliga a `durationSec ≤ 120`); 13 fichas tienen más de un tutorial (30 tutoriales comparten ficha). **9 tutoriales empiezan con un paso `optional`** y por tanto sufren la carrera de la incidencia C: `bienvenida`, `tut-calendario-marcar-hecho`, `tut-pequenos-solicitar`, `tut-compras-tiendas` (1 inicial), `tut-compras-compartir` (**2 iniciales**), `tut-economia-clasificar-pendientes`, `tut-contactos-importar`, `tut-contactos-compartir`, `tut-galeria-compartir`.

---------------------------------------------------------------------------------------------------

## 1. Inventario del MOTOR y de la infraestructura (alcance de este informe)

| Pieza | Archivo | Qué hace de verdad |
|---|---|---|
| Máquina de estados pura | `help/tours/engine.ts` (136 l.) | `startState`, `reduceTour` (acciones: signal, next, skip-group, back, pause, resume, restart, exit, target-missing/found, off-route/on-route, skip), `canGoNext`, `previousIndex`, `groupHasMore`. No toca el DOM. |
| Tipos | `help/tours/types.ts` | `TourStep` (id, text, target, completeOn, manualNext, sensitive, optional, skipIf, group, details), `TourDef` (kind visit/tutorial, module, cardId, durationSec, startPath, startDest, paths, steps, finishText, next, version), `TourState` (index, status, reason, skipped[]). **No hay noción de capítulo.** |
| Corredor | `help/tours/TourRunner.tsx` (633 l.) | Escucha clics/input/change/focusout/keydown en captura; sondea el DOM cada 400 ms + MutationObserver; resalta con `data-tour-active` en el control; coloca la tarjeta; voz; guarda progreso; portal en `document.body`, `z-index: 1300`. |
| Localización de controles | `help/tours/domTargets.ts` | `findTarget` (primer `[data-help-id="…"]` visible), `fieldOf`, `ringElementOf` (campo suelto + su `<label>` si solo hay un campo), `markedAncestor` (`closest('[data-help-id]')`). |
| Geometría | `help/tours/viewport.ts` | `readVisibleArea` (visualViewport, teclado >100 px, compacto <520 px), `choosePanelSide`, `scrollDeltaToReveal`, `freeZone`, `scrollContentBy`. |
| Estilos | `help/tours/tours.css` | Panel `position:absolute` dentro de la capa fija; abajo `bottom: calc(76px + safe-bottom)`, arriba `top: calc(8px + safe-top)`; ≥720 px tarjeta de 380 px a la derecha. |
| Bus de avisos | `help/tours/helpBus.ts` | `emitHelpEvent('modulo.accion-hecha')` tras confirmar el servidor. |
| Rutas permitidas | `help/tours/paths.ts` | `pathAllowed` con comodín `/x/*`. |
| Registro | `help/tours/registry.ts` | `TOURS` (aplanado de defs/ + g1..g10), `getTour`, `hasTour`, `TOUR_IDS`. |
| Destinos | `help/destinations.ts` | `requestDestination`, `useHelpDestinations`, `HelpDestMark` (`data-help-dest`), `waitForDestination` (observa el DOM, 8 s máx.), `closeOpenMenus`. |
| Proveedor | `help/ui/HelpProvider.tsx` | Estado de la Ayuda (panel, área, conversación en memoria), `startTourById`, `goToPlace`, `canDoTour`, `canExplain`, monta `TourRunner` (lazy) con `key=id:tourRun`; `ownerKnown`. |
| Áreas | `help/ui/HelpAreas.tsx` | Pestañas Preguntar / Conoce esta sección / Enséñame / Cómo funciona PEPA / Soporte (solo si flag). Insignias de progreso. |
| Respuesta | `help/ui/HelpAnswer.tsx` | Ficha: texto, pasos, botones Llévame / Enséñame / «Enséñame: título» / «¿Cómo funciona?». |
| Conversación, panel, avisos | `HelpConversation.tsx`, `HelpPanel.tsx`, `HelpNudges.tsx`, `HelpHint.tsx` | Buscador con sugerencias; hoja flotante; bienvenida y aviso de primera visita; «?» contextual. |
| Preferencias | `help/prefs.ts` | Claves `pepa:help-tour:<id>`, `pepa:help-welcome`, `pepa:help-hint:<modulo>`, `pepa:help-voice-mode`. Escritura por `prefSet`. |
| Catálogo maestro | `help/master/inventory.ts` | `visitsOf`, `tutorialsOf`, `explainersOf`, `sectionInventory` (se calcula de los registros). |
| Salud | `help/health.ts` | `computeHelpHealth` (fichas completas, rutas rotas, tutoriales desconocidos, candidatos). |
| Admin | `ui/admin/AreaAyuda.tsx` | Detrás de `AdminGate` (`am_i_app_owner` al servidor, `fresh: true`). |
| Buscador | `help/search/*` | Índice SOLO de fichas y entradas «legacy» (no indexa tutoriales ni explicaciones). |

Pruebas existentes que fijan el comportamiento actual (útil para saber qué hay que tocar): `engine.test.ts`, `engineGroups.test.ts` (incluye «Atrás no vuelve a un paso omitido», líneas 76-90), `tourRunner.test.tsx`, `tourStart.test.tsx`, `tourViewport.test.tsx` (geometría con valores simulados; **jsdom no calcula posiciones**, así que no hay ninguna prueba que compruebe que la tarjeta no tapa un control real), `tourPilotsReal.test.tsx`, `calendarTutorialsUx.test.tsx`, `tourDefs.test.ts`, `tourCoverage.test.ts`, `paths.test.ts`, `master/masterCatalog.test.ts`, `ui/helpAreas.test.tsx`, `ui/helpUi.test.tsx`, `ui/helpSuggestions.test.tsx`. No hay Playwright/WebKit en `package.json` (solo vitest + jsdom).

---------------------------------------------------------------------------------------------------

## 2. INCIDENCIAS de las pruebas en iPhone — causa en el código

### 2.1 (i) La tarjeta tapa controles que el paso manda usar (caso «Marcar un evento o una tarea como hecho»)

**Cómo se decide dónde va la tarjeta** (`TourRunner.tsx:397-404`):
1. `rect` = caja del elemento del paso (`ringElementOf(findTarget(step.target))`), relativa a la capa del tutorial.
2. `ringSpan = [rect.top-4, rect.bottom+4]` (solo vertical).
3. `halfRule`: si el centro del control está por debajo del 52 % del área visible → tarjeta **arriba**; si no, **abajo**.
4. `choosePanelSide(ringSpan, area.height, panelH, bottomOffset, halfRule)` (`viewport.ts:54-64`) solo corrige si el lado de la regla tapa el control. Nota: el parámetro `current` que recibe es `halfRule`, **no** el lado anterior (`sideRef`), así que no hay la histéresis que dice el comentario («sin saltos»): el lado puede cambiar cada vez que el control cruza el 52 %.
5. `bottomOffset` = 8 con teclado, 16 en ≥720 px y **100** en móvil (constante). El CSS real es `bottom: calc(76px + env(safe-area-inset-bottom))` (`tours.css:57-59`): en un iPhone con barra de inicio (≈34 px) son 110 px, no 100. Arriba, `choosePanelSide` usa `margin = 8` y `freeZone` usa `margin*2`, pero el CSS es `top: calc(8px + env(safe-area-inset-top))` (`tours.css:61-63`): en la app instalada (hay `viewport-fit=cover`, `index.html:5`) la zona segura superior (≈47-59 px) **no entra en el cálculo**. Es decir, la tarjeta real ocupa 10 px más abajo y hasta ~59 px más arriba de lo que el algoritmo cree.
6. Altura máxima de la tarjeta: 46 % del área (40 % compacta) (`TourRunner.tsx:602`); en un iPhone de 844 px son hasta ~390 px.
7. Desplazamiento: al entrar en el paso, **una sola vez** y solo si el control queda a <60 px de un borde, `el.scrollIntoView({block:'center'})` (`TourRunner.tsx:275-280`). Centra en el viewport **entero**, no en la zona libre que deja la tarjeta. El cálculo bueno (`scrollDeltaToReveal` + `freeZone`, que prioriza ver la parte de arriba si no cabe) solo se invoca desde `revealTarget`, y `revealTarget` solo se ejecuta tras ráfagas de teclado/foco/resize (`TourRunner.tsx:323-333`), **nunca al entrar en un paso**.
8. Horizontal: ignorado en móvil (la tarjeta ocupa todo el ancho, correcto) y también en ≥720 px (la tarjeta es de 380 px a la derecha, pero se decide como si ocupara todo el ancho: puede saltar de lado sin necesidad).
9. El tutorial **no sabe nada** de lo que haya encima de la app: las hojas propias (`.modal-overlay` z-index 50, ui/styles.css:4491-4498) quedan por debajo de la capa del tutorial (1300) y la tarjeta (con `pointer-events:auto`) intercepta los toques.

**Caso «Marcar como hecho»** (`help/tours/defs/g1/calendarTutorials.ts:109-145`, pantalla `ui/CalendarScreen.tsx:1673-1699`):
- El paso `dia` marca el **panel entero del día** (`calendar.day-panel`, un `div.day-panel` que contiene la cabecera con las flechas ‹ › y todos los apuntes) y su texto dice «cambia de día con ‹ y › **o toca otro día del mes**». El mes (la cuadrícula donde se toca otro día) queda **fuera** del control marcado y encima del panel.
- Con el control marcado en la mitad inferior, la regla pone la tarjeta **arriba**; `choosePanelSide` no la mueve porque la tarjeta de arriba no solapa con el panel del día. Resultado: la tarjeta cae justo sobre la cuadrícula del mes (los días que el texto manda tocar) y/o sobre la cabecera con ‹ ›. Además el panel del día es alto y `scrollIntoView({block:'center'})` lo centra, empujando fuera de pantalla la cabecera con las flechas.
- Los dos pasos siguientes (`circulo`, `marcar`) marcan `calendar.entry-complete`, **el primer círculo visible** (no hay forma de decir «el de este apunte»; ver 2.4).

**Cuándo puede cubrir el objetivo o un auxiliar (resumen comprobable):**
1. Auxiliar que el texto exige y no está marcado/considerado (flechas del día, cuadrícula del mes, desplegable abierto, botón «Guardar» cercano): **siempre** posible; el motor solo mira `step.target`.
2. Objetivo más alto que la zona libre (formulario, panel del día, lista de líneas del ticket): **inevitable**; `choosePanelSide` solo minimiza el solapamiento y desempata por el centro (`viewport.ts:62`).
3. Desajuste de zonas seguras (punto 5): cualquier control a menos de ~60 px del borde superior o ~10 px del inferior.
4. Hojas/modales de la propia app abiertos durante el paso (2.2).
5. Teclado: el caso de teclado SÍ está tratado (capa = `visualViewport`, tarjeta compacta, `revealTarget`), pero igualmente solo con el control del paso.

**Prioridad: Alta.** **Corrección recomendada** (sin implementarla; propuesta concreta en §4.6): (a) cálculo de colocación con TODOS los controles que el paso necesita (`target` + `keepVisible`), zonas seguras medidas (no constantes), altura real de la barra inferior y hojas abiertas; (b) desplazar a la zona libre al entrar en el paso, no al centro; (c) modo «píldora» cuando no haya hueco; (d) botón «↕ Mover tarjeta» siempre disponible; (e) en los textos de esos pasos, marcar de verdad lo que se manda tocar (flechas ‹ ›, cuadrícula del mes) o repartir el paso en dos.

### 2.2 (ii) «Subir ticket y revisar productos»: tarjeta sobre el título y sobre el selector de fotos/PDF

Definición: `help/tours/defs/g2/compras.ts:217-289` (`tut-compras-subir-ticket`, `startDest: compras.tickets`). Pantalla: `ui/FinanceScreen.tsx:6361-6409` + `ui/FileOrPdfPicker.tsx`.

**Paso 1 (`form`, título tapado).** El destino es **todo el formulario** (`data-help-id="shopping.receipt-form"` en el `<form>`, FinanceScreen:6361), mucho más alto que la pantalla. Efecto en el motor: `scrollIntoView({block:'center'})` coloca el centro del formulario en el centro del viewport (su cabecera «Subir ticket» queda por encima) y `choosePanelSide` ve solapamiento igual por arriba y por abajo (el destino cubre todo) → empate → decide «centro del destino en la mitad inferior → tarjeta arriba» (`viewport.ts:62`), que tapa lo poco que queda visible de la parte alta. Es un caso de «destino mayor que la zona libre»: no hay solución posible con el algoritmo actual. *No comprobado en iPhone cuál de los dos efectos (título fuera por el desplazamiento o tapado por la tarjeta) es el que se ve; ambos salen del mismo origen.*

**Paso 2 (`foto`, selector).** Hay DOS cosas distintas y conviene no mezclarlas:
- **La hoja propia de la app** «Añadir ticket» (📷 Hacer foto / 🖼️ Elegir de la galería / 📄 Elegir PDF / Cancelar): `FileSourceSheet` en `FileOrPdfPicker.tsx:27-63`, un `div.modal-overlay` (z-index **50**, alineado abajo) con `modal-sheet`. Se abre al tocar «+ Añadir foto o PDF», que es precisamente el control marcado (`shopping.receipt-file`, que suele estar en la mitad superior → tarjeta **abajo**: `bottom: 76px + safe`). La capa del tutorial (z-index 1300) y la tarjeta (`pointer-events:auto`) quedan **por encima** de la hoja: **tapan sus tres opciones y «Cancelar»** y los toques no llegan. El motor no sabe que hay una hoja abierta (no hay ninguna detección de `[role=dialog]`/`.modal-overlay` en `TourRunner`). **Causa comprobada.**
- **El selector nativo del sistema** (Fototeca / Hacer foto / Elegir archivo de iOS), que se abre con `input.click()` tras elegir una opción de la hoja: es UI del sistema, **por encima de la página**; la tarjeta (DOM) no puede quedar encima de él. Pero el tutorial **no detecta** que se ha abierto: no escucha `blur`, `visibilitychange`, `pageshow` ni nada parecido (solo `focusin/focusout` de campos para el teclado). Dos consecuencias comprobadas en el código del paso:
  1. `foto` solo avanza con `appear shopping.receipt-read` (que existe solo cuando ya hay `file`); no tiene `manualNext`. Si la persona **cancela** el selector, no hay evento ni «Siguiente»: callejón sin salida salvo «Salir/Reiniciar».
  2. Si iOS recarga la página al volver de la cámara (puede pasar con poca memoria; **no comprobado**), el estado del tutorial vive solo en React: se pierde (no hay reanudación; `prefs.ts` solo guarda empezado/hecho/descartado).
- Nota: lo que la persona cuenta («se superpone al selector nativo») es, por el código, casi seguro la hoja propia de la app. Para el selector del sistema el único riesgo real es el de arriba (no detectarlo).

**Prioridad: Alta.** **Corrección:** (1) detectar hoja/modal abierto (`.modal-overlay`, `[role=dialog]` ajeno al tutorial) y colapsar la tarjeta a píldora en el borde contrario o suspenderla; (2) marcar los pasos de selector nativo con `native: 'file'|'camera'|'date'|'select'` → al tocar el control la tarjeta se «aparta» (píldora) hasta `change` / `visibilitychange→visible` / `pageshow` / toque en la píldora; (3) dar «Siguiente / Continuar sin foto» a ese paso; (4) el paso 1 debe apuntar a la **cabecera** del formulario o partirse (ver §4.6 regla «destino alto»).

### 2.3 (iii) Tutoriales que arrancan en el paso 3/4 o 2/3 y no dejan volver al primero

Defs: `help/tours/defs/g8/compras.ts` (`tut-compras-tiendas` 4 pasos: `agrupada`[optional,manualNext], `abrir`[skipIf appear store-new], `cadenas`[optional], `nueva`[sensible]; `tut-compras-compartir` 3 pasos: `todo`[optional], `tienda`[optional], `resultado`). Ambos con `startDest: 'compras.lista'`.

**Algoritmo de inicio y omisión (todo comprobado):**
1. `startState` → `index 0`, `skipped []` (`engine.ts:7-9`). No existe ninguna noción de «ya cumplidos al llegar» en el motor; vive en el corredor.
2. `TourRunner` primero «prepara»: pide el destino `compras.lista` y espera a su marca `data-help-dest` (`waitForDestination`). **Esa marca la pinta `ShoppingScreen` en cuanto la pestaña es «Lista» (`ShoppingScreen.tsx:310`), pero el contenido de la pestaña (`ShoppingListTab`) devuelve `<p>Cargando lista…</p>` mientras `loading && !initialized` (línea 1061)**. O sea, «llegada» = pestaña montada, no = datos cargados. Los controles `shopping.share-all` (solo con `pending.length>0`, línea 1080), `shopping.store-heading`/`store-share` (una por tienda con productos, 1101-1128) y el desplegable de tiendas (1453) **no existen** hasta que carga la lista.
3. Con `prep='ok'`, `measure()` evalúa el paso 0 (`TourRunner.tsx:230-286`). Si el control no existe: `missingSince.current ??= Date.now()`; para un paso `optional` el límite es `min(missingAfterMs, OPTIONAL_GRACE_MS=350)` (líneas 33, 263-267). A los >350 ms (siguiente sondeo de 400 ms o mutación del DOM) se envía `target-missing` y el reductor hace `advance(tour, state, state.index)`: **avanza y apunta el índice en `state.skipped`** (`engine.ts:107-111`, `61-66`).
4. Se repite para el paso siguiente (el contador `missingSince` se reinicia al cambiar de paso): en `tut-compras-compartir` hay **dos** pasos iniciales opcionales; si la lista tarda >350 ms (+sondeo) en un paso y >350 ms en el siguiente, se omiten ambos y el tutorial queda en **«Paso 3 de 3»**; si llega entre medias, queda en «2 de 3» (el caso descrito).
5. En `tut-compras-tiendas`, el paso 0 (`agrupada`, `store-heading`, opcional) se omite igual por la carrera (o legítimamente, si no hay productos). El paso `abrir` tiene `skipIf: appear store-new` (solo se evalúa al llegar: `TourRunner.tsx:244-249`) y además `completeOn click shopping.stores`; si la persona ya tocó «🏬 Tiendas» (o el desplegable estaba abierto) el paso se da por hecho y se llega a `cadenas` = «Paso 3 de 4». *No comprobado en iPhone cuál de las dos vías ocurre.*
6. **El contador es `Paso {índice+1} de {total de pasos del def}`** (`TourRunner.tsx:613`), sin descontar los omitidos: por eso se percibe «arranca en el 3/4».
7. **Por qué «Atrás» no los recupera:** `previousIndex(state)` retrocede **saltando todo índice presente en `skipped`** (`engine.ts:122-126`); si todo lo anterior está omitido devuelve `null`, y el botón «← Atrás» solo se pinta si `previousIndex(state) !== null` (`TourRunner.tsx:541`). Es **intencionado** y está fijado por pruebas (`engineGroups.test.ts:76-90`, `calendarTutorialsUx.test.tsx:176`) para que volver a un paso omitido no rebote hacia delante. «↺ Reiniciar» (dentro de «⋯ Más») vuelve al índice 0 pero lo vuelve a evaluar y, si la lista ya cargó, **sí** muestra el paso 1.
8. `tut-compras-compartir` tiene además un detalle de contenido: sus dos primeros pasos piden pulsar botones de compartir «tú si quieres probarlo» (el texto del paso 0 dice «Después, pulsa Siguiente» y la definición lo permite sin acción).

**Extensión del problema:** afecta a los 9 tutoriales con primer paso opcional (lista en §0). Y a cualquier paso opcional intermedio (236 pasos en el catálogo) cuando la pantalla aún cargue datos (Compras → Historial: `if (loading) return "Cargando historial…"`, ShoppingScreen:2747; igual patrón probable en Tickets/Economía: no revisado pantalla a pantalla).

**Prioridad: Alta** (los textos asumen un orden que la persona no ve). **Corrección recomendada:**
- Esperar a «datos listos» además de «pestaña montada»: `readyOn?: TourSignal[]` en el def (p. ej. `appear shopping.counter`, que solo existe tras cargar) o mover la marca `compras.lista` dentro del contenido ya cargado; más una espera de «DOM estable» (~300 ms sin mutaciones, máx. 3 s) antes de aplicar la gracia de 350 ms.
- Prohibir (con prueba) que el **primer paso** sea `optional`; si hace falta una condición de datos, declararla como `needs` del capítulo (§4.4) con mensaje claro.
- Contador por pasos **mostrados** («Paso k de n» con n = pasos − omitidos ya conocidos), o «Paso k» sin total cuando haya opcionales pendientes.
- Si `previousIndex===null && index>0`, mostrar «↺ Volver al principio» (reinicia y reevalúa) en lugar de nada.
- Mantener que «Atrás» no rebota a pasos omitidos *por falta de control*; permitirlo para los omitidos por `skipIf`/`group` solo si se rehace su evaluación al volver (hoy `enteredBack` ya lo hace para el paso destino).

### 2.4 (iv) Resaltado que no corresponde

**Cómo se resuelve un `target` a elemento** (`domTargets.ts`, `TourRunner.measure`):
1. `findTarget(id)`: valida el patrón `[a-z0-9]+([.-][a-z0-9]+)*`, hace `querySelectorAll('[data-help-id="id"]')` y devuelve **el primero en orden de DOM que sea «visible»** (`defaultVisible`: sin `[hidden]`/`[inert]` en ancestros, rectángulo >0, `visibility`/`display` OK). No comprueba `opacity`, ni que esté dentro del viewport, ni que esté tapado por otra capa.
2. `ringElementOf(el)`: si `el` es un campo y su padre es un `<label>` con **un solo** campo, el aro va al `<label>`; en cualquier otro caso, al propio elemento marcado. Es lo que se marca con `data-tour-active` (el aro es un `box-shadow` del propio control).
3. `fieldOf(el)`: el propio campo, o el primer `input/textarea/select` de dentro (para `filled`/`entered`/`confirmed`).
4. `markedAncestor(e.target)`: `closest('[data-help-id]')` — **el marcado más cercano**. Para señales de clic/escritura, un hijo marcado «roba» el evento a su padre marcado.

**Por qué puede acabar en un elemento distinto o en ninguno (todas comprobadas):**
- **Falta la marca.** «✅ Finalizar compra» es un `ConfirmButton` (ShoppingScreen:1165-1170) y `ui/ConfirmButton.tsx` **no admite `data-help-id`** (ni `helpId`). Por eso el paso `finalizar` de `tut-compras-marcar-comprado` (`defs/g2/compras.ts:158-165`) apunta a `shopping.store-heading` (la cabecera de la tienda, un `h3 role="button"` que además **pliega la tienda** si se toca, lo que **oculta** el propio botón «Finalizar compra»). El texto habla del botón y el aro está en la cabecera. Es la incidencia descrita.
- **Marcas repetidas** (primera visible gana): `shopping.store-heading`/`store-share` (una por tienda), `shopping.item-name`, `shopping.item-check`, `calendar.entry-complete` (un círculo por apunte; ni siquiera se limita al de ese día), `shopping.receipt-line-class` (un icono por línea, FinanceScreen:5884). Un elemento anterior en el DOM, aunque sea de otra tienda/día, se lleva el aro; si aparece uno nuevo por encima, el aro salta.
- **Contenedores en vez de controles:** `calendar.day-panel`, `shopping.receipt-form`, `shopping.receipt-lines`, `shopping.history-total`… el aro rodea una zona enorme y no «señala» nada.
- **Marca en el icono, no en lo que se abre:** `shopping.receipt-line-class` marca el botón-símbolo; al tocarlo se abre `.category-picker-panel` (el «desplegable de clase» de las líneas del ticket), que **no está marcado**: el aro se queda en el icono mientras el texto habla del desplegable, y la tarjeta puede taparlo (2.2). En el tutorial del historial (`tut-compras-clase-historial`) el `<select>` sí está marcado (`shopping.product-class`, ShoppingScreen:2934) y el aro va al propio `select` (su padre es un `div`, no un `label`); su lista desplegable es la nativa del sistema.
- **`ringElementOf` con `label`:** al rodear la etiqueta entera, si la etiqueta contiene más texto del esperado el aro cubre más de lo que el paso nombra; si el campo está dentro de un `label` con más de un campo, se cae a rodear solo el campo.
- **Marcas anidadas:** `shopping.store-share` está dentro de `shopping.store-heading` (un toque en 📤 se contabiliza como `store-share`, nunca como `store-heading`); un paso `click store-heading` no se completaría al pulsar 📤.
- **Visibilidad parcial:** un control dentro de un `<details>` cerrado o de una pestaña oculta devuelve `null` (se trata como ausente → paso omitido u «roto»); un control tapado por una hoja propia sigue siendo «visible» y se le pinta el aro bajo la capa oscura.

**Prioridad: Alta** para los casos con texto que nombra un botón sin marca. **Corrección:** (1) añadir `dataHelpId` a `ConfirmButton` y marcar «Finalizar compra» (y revisar con una prueba que el texto de cada paso nombra un control que existe con su marca: lista de botones citados entre «» ↔ `data-help-id`); (2) permitir un selector de **ámbito** en el paso (`within`/`nth`/`scope: 'first-visible-in-viewport'`) o marcar solo el primer elemento de una lista (`data-help-id` solo si `index===0`), como ya hace `CompletionCircle` con `helpMark`; (3) preferir marcas en el control accionable y, para zonas, usar una marca de **cabecera**; (4) marcar también el panel que se abre (`shopping.receipt-line-class-panel`); (5) una prueba que falle si un `target` cae en un contenedor mayor que X sin `scope`.

### 2.5 (v) «Anterior» / «Siguiente»: coherencia con pasos omitidos, grupos y `manualNext`

- Etiqueta real: **«← Atrás»** (no «Anterior») (`TourRunner.tsx:541-552`).
- `Siguiente →` se pinta si `canGoNext(step)` (`!sensitive && (manualNext || completeOn.length===0)`) **o** si se volvió a ese paso con «Atrás» (`backIndex.current === state.index && !step.sensitive`) (líneas 553-557). `next` forzado salta aunque el paso no sea manual, salvo sensibles.
- **Pasos sensibles:** nunca tienen «Siguiente». Si la persona llega a uno con «Atrás» (p. ej. de `contador` a `marcar` en `tut-compras-marcar-comprado`), el paso ya se había completado, el motor no vuelve a oír la señal y **no hay forma de avanzar** salvo repetir la acción (hay que tener otro producto pendiente), «Reiniciar» o «Salir». Defecto de diseño comprobado en el código (`TourRunner.tsx:553`, `engine.ts:80`).
- **Omitidos:** «Atrás» los salta (2.3). `skip-group` añade los índices del grupo a `skipped` (`engine.ts:81-91`), así que «Atrás» tampoco puede reabrir las opciones saltadas (coherente con lo anterior, pero la persona no tiene manera de recuperarlas sin reiniciar).
- **`backIndex`** (ref) solo se pone al pulsar «Atrás» y **no se limpia nunca** (grep: líneas 91, 243, 546, 553). Tras «Reiniciar», si se llega otra vez a ese índice, el corredor lo trata como «entrada hacia atrás»: ignora `skipIf` y las señales `appear/filled` ya cumplidas y muestra «Siguiente». Efecto menor pero real.
- **Fin de pasos / `skipped` y contador:** el contador no descuenta omitidos (2.3).
- **`manualNext` + `completeOn`:** correcto en los pasos que admiten ambas vías (p. ej. `modo` en marcar-comprado). Un paso sin `manualNext` y con señales (como `foto`) no ofrece salida si la señal no llega (2.2).
- **Prioridad: Media.** **Corrección:** permitir «Siguiente» tras «Atrás» también en sensibles ya completados (con etiqueta «Ya lo hice»), limpiar `backIndex` al avanzar/reiniciar, contador por pasos mostrados, «Volver al principio» cuando `previousIndex` sea null, y botón «Saltar este paso» opcional configurable por def para pasos de selector/nativos.

### 2.6 (vi) «No confundir una respuesta informativa de Ayuda con un tutorial Enséñame»

Hoy se distingue **solo por los botones de `HelpAnswer.tsx:109-133`**, sin etiqueta ni texto que lo explique:
- Respuesta informativa = título + `quick` + «Ver los pasos» (lista escrita) + «Explicación avanzada» + vídeo + 🔊 Escuchar. Nada de esto abre un tutorial.
- **«Llévame»** (o `card.go.label`) → solo lleva al destino exacto (`goTo`).
- **«Enséñame»** (con ✓ si `getTourProgress(card.tour)?.status==='completed'`) → `help.startTour(card)` → tutorial interactivo de la ficha. Se muestra solo si `canOfferActions` y `canStartTour(card)` (tutorial existe y se puede hacer).
- **«Enséñame: <título>»** → otros tutoriales de la misma ficha (`moreTours`: `t.cardId===card.id && t.id!==card.tour`, máx. 3, excluye visitas).
- **«¿Cómo funciona?»** → `help.openExplainer(id)` → texto de «Cómo funciona PEPA» (nivel C).
- Debilidades: el botón «Enséñame» no dice cuánto dura ni que es interactivo; «Enséñame» y «Enséñame: …» comparten etiqueta; con 3 tutoriales en una ficha (13 fichas tienen >1) no se ve cuál es el principal; el ✓ solo se pinta en el principal si está completado; las **sugerencias del buscador solo ofrecen fichas** (`cardsOnly`), nunca tutoriales ni capítulos, y el índice de búsqueda no incluye tutoriales; la voz (`talkHelp.ts:124-127`, `tutorialFor`) elige el **primer** tutorial con `cardId===card.id`, no necesariamente `card.tour`.
- Regla propuesta (barata): etiquetas distintas y estables: **«Ver los pasos»** (escrito) / **«Enséñame en pantalla (2 min)»** (interactivo, duración desde `durationSec`) / **«Capítulo: …»** / **«¿Cómo funciona PEPA por dentro?»**; ficha informativa sin tutorial nunca muestra «Enséñame» (ya es así por `canStartTour`); una prueba por ficha que compruebe la correspondencia etiqueta↔tipo.

---------------------------------------------------------------------------------------------------

## 3. AYUDA

### 3.1 (a) Botón «¿Cómo funciona?» duplicado — causa exacta

`HelpAnswer.tsx:63` → `explainersForCard(card.id).filter(e => help.canExplain(e.id))` y `HelpAnswer.tsx:128-132` → `explainers.map(e => <button …>¿Cómo funciona?</button>)`. `explainersForCard` (`HelpAreas.tsx:355-357`) es `EXPLAINERS.filter(e => e.cardIds?.includes(cardId))` y **devuelve todas** las explicaciones que citan la ficha. Cada una pinta un botón con el **mismo texto** pero distinto destino. Confirmado con `src/help/explainers/**` (campo `cardIds`). Fichas con varias explicaciones (todas visibles para una cuenta con acceso):

| Ficha | Nº | Explicaciones (id) |
|---|---|---|
| `not-activar` | 4 | exp-calendario-recordatorios, exp-configuracion-avisos, exp-ubicacion-avisos, exp-notificaciones-campana |
| `cal-para-quien` | 3 | exp-calendario-puntos, exp-calendario-quien-recibe-avisos, exp-calendario-privado-familiar |
| `not-resumen-tareas` | 3 | exp-calendario-recordatorios, exp-calendario-quien-recibe-avisos, exp-configuracion-avisos |
| `eco-banco` | 3 | exp-economia-categorizar-movimientos, exp-economia-conciliacion, exp-economia-conexion-bancaria |
| `ini-sugerencias` | 3 | exp-ayuda-sugerencias, exp-ayuda-resenas, exp-cuentas-que-ve-cada-persona |
| `fam-invitado-limitado` | 3 | exp-familia-tipos-de-miembro, exp-familia-dar-acceso, exp-cuentas-que-ve-cada-persona |
| 14 fichas con 2 | 2 | `cal-recordatorio`, `pg-puntos`, `com-ticket`, `eco-categorias`, `eco-pendientes`, `com2-publicar`, `com2-alias`, `eve-presupuesto`, `ini-resenas`, `cfg-que-hay`, `fam-anadir-miembro`, `ubi-permiso-android`, `ubi-lugares`, `not-campana` |

(Cuenta total: 20 fichas con ≥2.) **Prioridad: Media (cosmética pero confusa).** **Corrección:** si hay una sola, botón «¿Cómo funciona?»; si hay varias, un botón por explicación con su **título corto** («¿Cómo funciona? · Recordatorios»), o un solo botón «¿Cómo funciona? (3)» que abra la lista filtrada en el área «Cómo funciona PEPA». Prueba: que no haya dos botones con el mismo nombre accesible en una respuesta.

### 3.2 (b) Contraste de las sugerencias del buscador

Valores reales: `:root { --card-bg:#fff; --text:#1c1f26; --muted:#6b7280; --primary:#4c6ef5; color-scheme: light }` (`ui/styles.css:1-14`); tema «vivo»: `--primary:#364fc7; --muted:#495057`. **No hay modo oscuro en la app principal**: no existe ningún `prefers-color-scheme: dark` fuera de `support/ui/support.css`, y `:root` declara `color-scheme: light` (la app se queda clara aunque el sistema esté en oscuro; el oscurecimiento forzado de Android/WebView no está comprobado).

Reglas: `.help-suggestions` (help.css:606): fondo `var(--card-bg,#fff)`, borde `#d9dee8` (la variable `--border` no existe en `:root`, se usa el valor de reserva). `.help-suggestion` (616): `background: transparent`, `font-size:15px`, **sin `color`**. `:hover/:focus-visible` → `rgba(76,110,245,0.1)` (= `#edf1fe` sobre blanco). `.help-suggestion-title` (638): `font-weight:700`, sin color. `.help-suggestion-module` (642): `font-size:12px; color: var(--muted,#6b7280)`.

Como los `<button>` heredan `button { color: white; … }` (ui/styles.css:1199-1207) y `.help-suggestion` no lo anula:

| Elemento | Colores | Ratio | WCAG AA (texto normal 4,5:1) |
|---|---|---|---|
| Título (reposo) | `#ffffff` sobre `#ffffff` | **1,00:1** | **NO cumple** (ilegible) |
| Título (hover/foco) | `#ffffff` sobre `#edf1fe` | **1,13:1** | **NO cumple** |
| Módulo (reposo) | `#6b7280` sobre `#ffffff` | 4,83:1 | Cumple (justo) |
| Módulo (hover/foco) | `#6b7280` sobre `#edf1fe` | **4,29:1** | **NO cumple** (12 px) |
| Módulo, tema «vivo» | `#495057` sobre `#fff` / `#ebedf9` | 8,18 / ≈7,2 | Cumple |
| Título si usara `--text` (`#1c1f26`) | sobre `#fff` | 16,49:1 | (valor de referencia tras corregir) |

Modo oscuro: **no aplica hoy** (no existe tema oscuro). Si se añadiera, `.help-suggestions` ya usaría `var(--card-bg)` pero el título seguiría sin color propio (blanco) y el `rgba(76,110,245,.1)` y el `--muted` no están definidos para oscuro: habría que definirlos antes. **Otros ratios que encontré de paso** (AA, texto normal): blanco sobre el azul `#4c6ef5` (`.help-btn-primary`, `.tour-btn-primary`, pestaña activa, `.help-seg-on`) = **4,32:1** (no llega a 4,5; con el tema «vivo» `#364fc7` sí); `.tour-sub`/`muted` 4,83:1 (OK); nota de administración `#78350f` sobre `#fffbeb` 8,75:1 (OK).

Nota: `helpSuggestions.test.tsx` solo comprueba `min-height: 44px`, nada de color; por eso no se detectó. **Prioridad: Alta (A).** **Corrección:** `color: var(--text, #1c1f26)` en `.help-suggestion`; `.help-suggestion-module` en `#4b5563` o aclarar el fondo de hover a un tono que mantenga ≥4,5; prueba que lea el CSS (como ya hace con `min-height`) y calcule el ratio.

### 3.3 (c) Diagnósticos internos solo para administración — verificación

Lo que está bien (comprobado):
- `AdminStateNote` (`HelpAnswer.tsx:142-151`): se pinta solo si `help.ownerKnown`; texto «🛠 Solo administración PEPA · estado: parcial/desactivada — <limits>».
- `ownerKnown = peekAppOwner(profile.id)` (`HelpProvider.tsx:344`; `state/useAppOwner.ts:21-24`): **solo mira una caché en memoria** (por usuario, 10 min) rellenada cuando algún componente llama a `useAppOwner()`; **nunca consulta Supabase**. La caché solo guarda `true/false` devuelto por `am_i_app_owner` (servidor) y es por `userId`; si no se sabe, `false` (fail-safe). Quien la rellena: `AdminGate` (con `fresh:true`), `AdminCenterCard` (Configuración), `InviteFriendsButton` (Inicio, Familia, Comunidad). Efecto secundario: una cuenta propietaria que no haya pasado por esas pantallas en 10 min **no verá** la nota (no es un riesgo de seguridad). La memoización de `api` solo recalcula `ownerKnown` cuando cambia alguna dependencia (ruta, panel abierto…), así que puede ir hasta un cambio de ruta por detrás de la caché.
- `limitsInternal`: `publicLimit = card.state==='parcial' && card.limits && !card.limitsInternal` (HelpAnswer:60), mismo criterio en voz de la Ayuda (`HelpProvider.spokenTextOf`:161) y en «Hablar con PEPA» (`talkHelp.ts:115`). Las fichas con `limitsInternal:true` (9 en total) no muestran su `limits` a cuentas normales. Los `limits` marcados «internos» son estados de despliegue («Interruptor apagado…», «pantalla pendiente»); los no marcados son limitaciones de uso reales (comprobado leyendo las 24 fichas no disponibles).
- Etiqueta «Todavía no está disponible» para `desactivada` es pública a propósito.
- `AreaAyuda.tsx`: solo se monta desde `AdministrationPage` detrás de `AdminGate` (`useAppOwner({fresh:true})` → `am_i_app_owner` al servidor; denegado si `unverified`). Contiene módulos, fichas incompletas, rutas rotas, vídeos, candidatos y el estado «Valoraciones… migración 0306 pendiente de autorización». `health.ts` y `inventory.ts` son funciones puras sobre el catálogo (sin red). Las valoraciones (`loadHelpFeedbackSummary`) solo se piden al pulsar y `HELP_FEEDBACK_ENABLED=false`.
- Cero llamadas extra a Supabase por todo esto: `ensureCommunity` es la única consulta de la Ayuda y es compartida/cacheada (`communityStatusCache`), solo al abrir la Ayuda; `rankHelpWithAi` está apagado (`HELP_AI_ENABLED=false`); `HelpFeedback` apagado.

Lo que **sí llega a una cuenta normal** y es estado interno o interno-adyacente (prioridad Media):
1. `quick` de `com-viajes-inventario`: «…solo existe la base de datos preparada» (cardsDiaADia.ts, ficha `desactivada`).
2. `quick` de `eve-menu` (disponible): «…dependen de la función de alergias, que está apagada».
3. `quick` de `com2-publica` y `com2-ia`: «…existe, pero está apagada por ahora» (solo cuentas con acceso a Comunidad, `access:{community:true}`). Están marcadas `limitsInternal` pero el estado ya está en el `quick`.
4. `ExplainerDetail` imprime «Comprobado contra la app el <fecha>» a todos (`HelpAreas.tsx:337`): inocuo pero interno; `basedOn` (rutas de archivos y migraciones) **no** se pinta (grep).
5. El índice de búsqueda incluye `card.limits` (también los internos) en el cuerpo (`searchEngine.ts:27`): no muestra el texto, pero una consulta como «interruptor» puede devolver esa ficha.
6. Los catálogos (fichas, `limits` internos, `basedOn`) viajan en el JS del cliente: «visible» ≠ «presente en el paquete». No es un fallo de la interfaz; si se quisiera ocultar de verdad, habría que sacar los textos internos del paquete público (coste alto, valor bajo).

**Corrección recomendada:** reescribir esos 4 `quick` en lenguaje de producto («Todavía no está disponible») y moverlo técnico a `limits`+`limitsInternal`; una prueba que busque en `quick/steps/more` de **todas** las fichas palabras como `apagad|interruptor|migraci|base de datos|flag|pantalla pendiente` (ya existe una similar para una ficha en `helpUi.test.tsx`).

---------------------------------------------------------------------------------------------------

## 4. ACCESOS: mapa de todas las vías hoy a un tutorial / visita / explicación

| # | Vía | Dónde (código) | Llama a | Observaciones |
|---|---|---|---|---|
| 1 | Botón **«Enséñame»** de una ficha | `HelpAnswer.tsx:116-121` | `help.startTour(card)` → `startTourById(card.tour)` | Solo ficha con `tour` registrado y `canDoTour`+`canOfferActions`. ✓ si completado. |
| 2 | **«Enséñame: título»** | `HelpAnswer.tsx:122-127` | `startTourById(t.id)` | Otros tutoriales con `cardId` igual; máx. 3; sin visitas. |
| 3 | **Catálogo del área Enséñame** | `HelpAreas.tsx:141-193` `HelpLearnArea` | `startTourById` | Por módulo (el módulo en foco primero), agrupado por `group`, buscador por título/resumen/grupo/módulo, insignias Hecho/Hay versión nueva/Empezado, minutos. Filtra con `canDoTour`. |
| 4 | **Conoce esta sección** | `HelpAreas.tsx:79-116` `HelpSectionArea` | `startTourById(visita)` | Visita del módulo en foco + «Otras secciones». |
| 5 | **«Enséñame a corregirlo»** (explicación) | `HelpAreas.tsx:321-325` `ExplainerDetail` | `startTourById(e.tour)` | Solo si `getTour(e.tour)` y `canDoTour`. Solo 1 `tour` por explicación (sin capítulo). |
| 6 | **Aviso de primera visita a un módulo** | `HelpNudges.tsx:68-95` | `startTourById(visit.id)` (botón «Conoce esta sección») | Solo cuentas nuevas (`welcome!==null`), 1 vez por módulo, 14 s. |
| 7 | **Bienvenida** | `HelpNudges.tsx:45-67` («Sí, enséñame») y `AyudaScreen.tsx:67` («🎓 Recorrido de bienvenida») | `startTourById('bienvenida')` | `onTourClosed` marca `done/skipped`. |
| 8 | **«?» contextual** | `HelpHint.tsx` (`SectionBreadcrumb.tsx:89`, `CalendarScreen.tsx:4393`, `FamilyScreen.tsx:770`, `ShoppingScreen.tsx:2024`) | `openHelp({cardId?, moduleId})` | Abre el panel en el área **«Preguntar»** (chat) con la ficha o con los chips «Ayuda de [módulo]». **Nunca** pasa `area`, así que no abre «Conoce esta sección» ni «Enséñame». |
| 9 | **Buscador / sugerencias** | `HelpConversation.tsx:84-90, 217-239` | `showCard(id)` | Solo **fichas** (`cardsOnly`); el índice no contiene tutoriales/explicaciones. Luego el acceso es por los botones de la ficha. |
| 10 | **Voz «necesito ayuda con…»** | `talkHelp.ts:123-132` + `ui/VoiceCapture.tsx:945-957` | `help.startTourById(outcome.tourId)` tras hablar | `tutorialFor` elige el primer tutorial con `cardId===card.id` (puede no ser `card.tour`); `visitFor` la visita del módulo. |
| 11 | **Al terminar un tutorial** (`next`) | `HelpProvider.tsx:388-394`, `TourRunner.tsx:446-474` | `onPick`: `startTourById` o `openHelp({cardId})` | Sugerencias por ficha: si la ficha tiene tutorial lo lanza, si no abre la ficha. |
| 12 | **Pausado fuera de ruta → «Seguir»** | `TourRunner.tsx:495-519` | navegación a `startPath` | No es un acceso nuevo, pero reanuda en el mismo paso solo dentro de la sesión. |
| 13 | Explicación «Cómo funciona PEPA» | `HelpAreas.tsx:218-271`, botones `¿Cómo funciona?` de `HelpAnswer` | `openExplainer(id)` | No son tutoriales. |
| — | **No existe** | — | — | URL profunda a un tutorial (solo `/ayuda?soporte=` y `location.state.module` para expandir un módulo, `AyudaScreen.tsx`); ni a un capítulo; ni acceso desde notificaciones. |

**Cómo funcionaría un acceso directo a un capítulo** (con la propuesta de §5): todas las vías anteriores pasarían por una única función `startTourById(tourId, { chapter?: string, mode?: 'chapter'|'full' })` (donde hoy solo hay `tourId`): (1) ficha → `card.tour` + opcional `card.tourChapter`; (2) catálogo → fila de tutorial expandible con sus capítulos y «Recorrido completo»; (3) explicación → `e.tour` + `e.tourChapter`; (4) «?» contextual → `openHelp({ area:'learn', moduleId })` o ficha con su capítulo; (5) voz/avisos → id canónico `tutorial:capitulo`; (6) enlaces externos → `/ayuda?tutorial=<id>&capitulo=<id>` resuelto en `AyudaScreen` con `canDoTour`. Los ids antiguos (`tut-compras-tiendas`…) se resuelven con una tabla de alias a `(tutorial, capítulo)`.

---------------------------------------------------------------------------------------------------

## 5. ARQUITECTURA DE CAPÍTULOS — propuesta técnica reutilizando lo existente

Principio: **no crear un segundo motor.** El reductor puro `reduceTour` sigue gobernando los pasos de UN capítulo (un capítulo se comporta como el `TourDef` de hoy). Encima se añade una capa mínima y pura de «recorrido» (qué capítulos y en qué orden) y el corredor la usa.

### 5.1 Tipos (`help/tours/types.ts`)

```ts
export interface TourChapter {
  id: string                // estable y único dentro del tutorial, [a-z0-9-]+ ; p. ej. 'captura'
  title: string
  summary: string           // una línea para el catálogo
  durationSec: number       // ≈ 60-120 (prueba: ≤120 por capítulo)
  version: number           // sube si cambia la interfaz que recorre ESTE capítulo
  access?: HelpAccessRule   // opcional: hereda el del tutorial
  startPath?: string; startDest?: string; paths?: string[]   // por defecto, los del tutorial
  readyOn?: TourSignal[]    // «datos cargados»: se espera a esto antes del paso 1 (p. ej. appear shopping.counter)
  needs?: ChapterNeed[]     // precondiciones de datos (ver 5.4)
  steps: TourStep[]
  finishText?: string
  explainer?: string        // id de «Cómo funciona PEPA» relacionado (nivel C) → botón final
}
export interface ChapterNeed { target: string; message: string; fixChapter?: string }

export interface TourDef {
  /* …todo lo actual… */
  steps?: TourStep[]        // legado: equivale a un único capítulo implícito 'main'
  chapters?: TourChapter[]  // nuevo; si existe, manda sobre `steps`
  fullRun?: { chapters?: string[] }   // orden del «recorrido completo» (por defecto, todos en orden)
}
```
`TourStep` gana: `keepVisible?: string[]` (marcas auxiliares que la tarjeta no puede tapar), `native?: 'file'|'camera'|'date'|'select'` (ver 5.6), `scope?: 'first'|'last'|'inView'` (qué instancia resaltar cuando la marca se repite), `skipLabel?: string` (botón «Continuar sin…»).

`TourState` gana `chapterId?: string`; el estado de recorrido (nuevo, puro, en `help/tours/run.ts`): `{ tourId, plan: string[], pos: number, mode: 'chapter'|'full' }` con `chaptersOf(def)`, `chapterAsTour(def, chapterId): TourDef` (devuelve un `TourDef` «plano» con los valores heredados y `id = tourId:capitulo` para eventos/depuración), `planRun(def, {chapter, mode})`, `nextChapter/prevChapter`.

### 5.2 Identificadores estables
- Tutorial: el `id` actual (`tut-compras-subir-ticket`) o uno nuevo canónico.
- Capítulo: `id` local; referencia pública **`<tutorial>:<capitulo>`** (p. ej. `tut-compras-ticket:captura`). Son identificadores de **código y enlaces**, no de claves de almacenamiento (los `:` no pasan el patrón de claves de prefs).
- Clave de progreso: `pepa:help-tour:<tutorial>--<capitulo>` (guion doble). Cumple `^pepa:help-tour:[a-z0-9-]+$` y el límite de 120 caracteres (`prefsRegistry.ts` y `0306_help_feedback_and_prefs.sql` línea 34 usan el mismo patrón), así que **no exige cambiar la migración 0306 pendiente**. La clave `pepa:help-tour:<tutorial>` actual se conserva como «estado del conjunto».
- Alias de ids antiguos: tabla `TOUR_ALIASES: Record<oldId, { tour: string; chapter?: string }>` en `help/tours/aliases.ts`; `getTour(id)` resuelve alias y devuelve el tutorial canónico; nuevo `resolveTourRef(ref)` devuelve `{def, chapterId}`. Los alias se aplican en: `card.tour`, `explainer.tour`, `TourDef.next`, resultados de voz, `HelpNudges`, progreso leído (5.7) y enlaces externos.

### 5.3 Reductor, corredor y navegación
- **Pasos dentro del capítulo:** sin cambios en `reduceTour`. Correcciones propias (independientes de capítulos): contador por pasos mostrados; «Volver al principio» cuando `previousIndex===null && index>0`; «Siguiente» en sensibles ya completados tras «Atrás» («Ya lo hice»); limpiar `backIndex`; rechazar que el primer paso sea `optional`.
- **Recorrido completo = capítulos encadenados.** `TourRunner` recibe `chapter: TourDef` (resuelto) y `plan`. Al terminar un capítulo (`status==='completed'`), el panel final existente (`TourRunner.tsx:446-474`) muestra el `finishText` del capítulo y, si hay siguiente en el plan, el botón primario **«Siguiente capítulo: <título> (≈1 min)»** además de «Terminar aquí» y «Repetir capítulo». Al pulsarlo, `HelpProvider` avanza `pos` y remonta `TourRunner` con `key=tour:capitulo:run` (mismo mecanismo que `tourRun`), que ejecuta su `prepare` con el `startDest` del capítulo siguiente. Entre capítulos no se arrastra ningún estado de pasos.
- **Anterior/Siguiente entre pasos y entre capítulos:** dentro del capítulo, igual que hoy. En el primer paso mostrado de un capítulo `pos>0`, aparece **«← Capítulo anterior»** que *reinicia* el capítulo anterior desde su principio (no a su último paso: así cumple «estado de arranque limpio»). La cabecera pasa a «Capítulo 2 de 4 · Paso 1 de 3».
- **Salida segura:** «✕ Salir» ya cierra sin guardar nada del usuario (el motor no ejecuta nada). Se conserva. Se guarda `dismissed` solo para el capítulo en curso y **nunca degrada** un `completed` (ver 5.7).
- **Pausa/ruta:** `paths` por capítulo (ya existe `pathAllowed`).
- **Reanudación razonable:** al salir por recarga/cámara de iOS, `sessionStorage`/`localStorage` local (clave `pepa:help-run`, **no sincronizada**, no registrada en `prefsRegistry`) con `{tour, chapter, mode, at}`; al arrancar `HelpProvider`, si hay un registro de ≤30 min, `HelpNudges` ofrece (nunca autoarranca) «¿Seguimos con «<capítulo>»? [Seguir] [Ahora no]» y se **reinicia el capítulo** (no el paso: cada capítulo dura 1-2 min y empieza limpio). Se borra al completar/salir.

### 5.4 Estado de arranque limpio y datos que faltan
1. `prepare` (ya existe) lleva a `startPath/startDest` del capítulo y espera la marca.
2. Nuevo: `readyOn` (señales `appear`) y «DOM estable» antes del paso 1, para cerrar la carrera de 2.3.
3. `needs`: tras `ready`, se comprueba cada `needs.target` con `findTarget`. Si falta: tarjeta «Para este capítulo necesitas <message>» con **tres salidas**: «Ir al capítulo <fixChapter>» (que crea ese dato; mantiene la regla de que el tutorial no crea nada por la persona), «Verlo sin practicar» (modo lectura: pasos informativos, los que exigen acción se muestran como explicación), «Salir». Nada se inventa ni se simula.
4. Regla de diseño de capítulos: el primer paso nunca es opcional; la dependencia de datos se declara en `needs`, no escondiéndola en un `optional`.

### 5.5 Resaltado ligado a elementos reales
- Se mantiene `data-help-id` + `data-tour-active` (el aro viaja con el control; nada de coordenadas). Añadir: `scope` para listas repetidas (`inView`: el primero cuyo rectángulo esté en la zona libre), `keepVisible` para auxiliares, marcas en lo que se abre (paneles/desplegables) y en botones sin marca (`ConfirmButton`).
- Prueba estática nueva: cada `target`, `keepVisible`, `needs.target` y `readyOn` existe como `data-help-id`; cada texto de paso que nombra un botón entre «» tiene un control marcado con ese texto (reutilizando la verificación de `labels` que ya hacen las fichas).

### 5.6 Posicionamiento de la tarjeta: regla concreta y comprobable

Una función **pura** `planPanel(input) → { side, mode, scrollDelta, unsatisfiable }` que sustituye a `choosePanelSide`+`halfRule`+`scrollIntoView(center)`.

Entradas: `area` (visualViewport); `safeTop`/`safeBottom` **medidos** (elemento sonda `position:fixed; padding-top:env(safe-area-inset-top)` y su equivalente inferior); `navBottom` (altura real de `.bottom-nav` si visible); `panelHeights = {full, compact, pill}` medidas; `focus: Rect[]` = rectángulos de `[target, …keepVisible]` (con el aro); `blockers: Rect[]` = zonas **interactivas** de hojas/diálogos propios abiertos (`.modal-overlay .modal-sheet`, `[role=dialog]` no del tutorial); `wide` (≥720 px: considerar también el eje horizontal con la tarjeta de 380 px).

Regla (en este orden, la primera candidata válida gana; con histéresis sobre el lado actual):
1. R1: (lado actual, completa) → (otro lado, completa) → (lado actual, compacta) → (otro lado, compacta) → (mejor lado, **píldora** ≤ 56 px: título corto + ← →).
2. «Válida» = ningún rectángulo de `focus` ni de `blockers` solapa con el rectángulo real de la tarjeta (incluidas zonas seguras y barra inferior) **y** todo `focus` cabe en la zona libre del lado elegido (si no cabe, `scrollDelta` = `scrollDeltaToReveal(union(focus), freeZone)`, priorizando la parte de arriba; se aplica **al entrar en el paso** y tras cada cambio de viewport).
3. R2 «destino alto»: si un `focus` mide más del 60 % del área, solo se exige no tapar sus primeros 120 px (cabecera) y todo `keepVisible`; el resto se considera zona de lectura.
4. R3: si ninguna candidata es válida → `unsatisfiable: true` (píldora + botón «↕ Mover» visible + `console.warn` en desarrollo); la persona siempre puede mover la tarjeta a mano (la preferencia vale para el paso).
5. R4: nunca se centra con `scrollIntoView({block:'center'})`; se usa el desplazamiento de R1/2.

Comprobación automática: (a) unitarias de `planPanel` con casos por fuerza bruta (si existe una colocación sin solapes, la función la encuentra; si no, devuelve `unsatisfiable`); (b) regresión de los casos reales descritos (día del calendario con cuadrícula, formulario de ticket, hoja de adjuntos); (c) **prueba en navegador real** (Playwright WebKit con viewport 375×667 y 390×844 y safe-area emulada; hoy no existe en el repo, hay un arnés en `vite.harness.config.ts`/`__harness__` que podría servir de base): para cada paso de cada capítulo, con datos de prueba, `document.elementsFromPoint(centro de cada focus)` no puede contener `.tour-panel`. Esto es lo único que garantiza la regla en un navegador de verdad.

**Selectores nativos y hojas propias:**
- **Hoja propia de la app** (`FileSourceSheet`, `StoreQuestionSheet`, etc.): detección por DOM (`blockers`) → píldora arriba (o suspendida) para no tapar sus opciones.
- **Selector nativo del sistema** (fototeca/cámara/archivos de iOS, rueda de fecha, `<select>` nativo): **no hay API web para saber que está abierto**. Se declara en el def con `native` y, al tocar el control marcado, el corredor pasa a `suspended` (píldora, sin interceptar toques) hasta `change` del campo, `visibilitychange→visible`/`pageshow`/`focus` o toque en la píldora. Ese paso lleva siempre salida («Ya lo elegí» / «Continuar sin foto») por si se cancela. Para fecha ya existe la lógica `confirmed` (1,8 s con foco).
- iPhone Safari / app instalada / Android Chrome / escritorio: la capa sigue ajustada a `visualViewport`; zonas seguras medidas por sonda (también cubre Android con gestos); ≥720 px tarjeta lateral con comprobación horizontal; `prefers-reduced-motion` ya respetado. *No comprobado en dispositivos.*

### 5.7 Progreso, sincronización y versionado (`help/prefs.ts`)
- Por capítulo: `pepa:help-tour:<tutorial>--<capitulo>` = `{status, at, version}` (mismo `TourProgress`). Estado del tutorial = derivado (todos completados con `version >= capitulo.version`) y se sigue escribiendo la clave del tutorial como «último estado» para compatibilidad.
- **Arreglo previo imprescindible:** `setTourProgress(…'started')` al montar y `'dismissed'` al salir **degradan un `completed` anterior** (`TourRunner.tsx:122, 380-388`) → perder el ✓. Regla nueva: `started/dismissed` nunca pisan `completed` de la misma versión; se guarda aparte `lastCompletedVersion`.
- Lectura con alias: `getChapterProgress(tutorial, capitulo)` mira la clave nueva y, si no existe, la clave del id antiguo (`TOUR_ALIASES` inverso) → quien ya hizo `tut-compras-tiendas` ve ese capítulo como hecho sin migrar datos.
- Sincronización: hoy `HELP_PREFS_SYNC_ENABLED=false` (el progreso es local al dispositivo; `docs/AYUDA_B3_B4_ESTADO.md`). Al encenderlo, el motor de prefs (`prefsEngine.ts`) es compare-and-set por clave con ganador decidido por el servidor; por eso **una clave por capítulo** (no un JSON único por tutorial) evita pisarse entre dispositivos al hacer capítulos distintos. Escritura «el más avanzado gana»: `completed` > `started` > `dismissed`, `version` mayor gana. Tamaño: ≤120 caracteres de clave, valores ≪ 8000.
- Versionado: `capitulo.version` sube cuando cambia su pantalla; el catálogo muestra «Hay una versión nueva» por capítulo.

### 5.8 Catálogo, Ayuda y accesos directos
- **Catálogo Enséñame** (`HelpLearnArea`): cada tutorial = tarjeta con «Recorrido completo (≈6 min)» y una lista de capítulos (título, minutos, ✓/nuevo/empezado) con botón por capítulo; el resumen «N tutoriales · M hechos» pasa a «N tutoriales · capítulos hechos x/y».
- **HelpAnswer**: botón «Enséñame en pantalla (≈N min)» → abre el selector de capítulos de ese tutorial (o arranca el capítulo indicado por `card.tourChapter`); las fichas con varios tutoriales hoy (13) pasan a ser un tutorial con varios capítulos (desaparece «Enséñame: título»).
- **Explicaciones (nivel C)**: `tour` + `tourChapter` (capítulo exacto de «Enséñame a corregirlo»); el capítulo, a su vez, puede enlazar `explainer` al terminar. Se evita repetición: el capítulo dice **cómo hacerlo**; la explicación, **qué hace PEPA por dentro** (límites, clasificaciones, automatizaciones).
- **Visitas (nivel A)** siguen siendo `kind:'visit'`, sin capítulos.
- **Buscador**: indexar capítulos como `kind:'chapter'` (título, resumen, sinónimos propios) para que la sugerencia pueda ofrecer «Capítulo: …» y no solo fichas.
- **Deep link**: `startTourById(ref, {chapter,mode})`, `openHelp({area:'learn', tourId, chapterId})`, y `/ayuda?tutorial=…&capitulo=…` en `AyudaScreen`.

### 5.9 Migración de los 109 tutoriales actuales sin romper enlaces
1. Mantener `TourDef.steps` válido (tutoriales sin capítulos siguen funcionando como capítulo único `main`): migración **incremental por módulo**, sin big-bang.
2. Para fusionar: helper `chapterFromTour(oldTour)` (reutiliza `steps`, `startDest`, `durationSec`, `finishText`) y `defineTutorial({id, chapters:[chapterFromTour(a), chapterFromTour(b)…]})`. Los pasos y las marcas ya verificadas se reutilizan tal cual.
3. `TOUR_ALIASES` con los 129 ids actuales (volcado `tours_dump.json` como lista congelada para la prueba): cada id antiguo → `(tutorial, capítulo)` o a sí mismo si no cambia.
4. Fichas: `card.tour` se cambia al tutorial principal + `tourChapter` opcional; los alias cubren todo lo que se haya quedado con el id antiguo (progreso, voz, `next`, enlaces).
5. Progreso antiguo: leído por alias (5.7), sin reescribir claves.
6. Contenido: reducir 109 → ~25-30 tutoriales principales con 3-5 capítulos (decisión editorial de los informes por módulo, no del motor).

### 5.10 Cambios en pruebas
- `tourDefs.test.ts`: iterar capítulos además de tutoriales (`describe` por capítulo); `durationSec ≤ 120` **por capítulo** y suma del recorrido ≤ 7 min; ids de capítulo únicos y válidos; primer paso **no** `optional`; `needs/readyOn/keepVisible/native` con marcas existentes; sensibles solo con eventos (sin cambio); `startDest` existente en el registro de destinos.
- Nuevas: `chapters.test.ts` (resolución, plan completo, alias, progreso derivado), `tourAliases.test.ts` (los 129 ids antiguos resuelven; ningún alias choca con un id canónico), `planPanel.test.ts` (geometría pura), y e2e opcional de «la tarjeta no tapa» (5.6).
- `engine.test.ts` / `engineGroups.test.ts`: casos nuevos (Atrás tras sensible hecho, contador, «volver al principio»); la prueba «Atrás no vuelve a un paso omitido» se mantiene.
- `tourRunner.test.tsx` / `tourStart.test.tsx`: transición entre capítulos, `readyOn` (no se omite un opcional mientras «Cargando…»), `needs`, `native`/suspensión, reanudación.
- `masterCatalog.test.ts`: «todo tutorial declara módulo y resumen» pasa a también por capítulo (resumen/duración); inventario cuenta capítulos; «seguridad: ningún tutorial avanza pulsando…» por capítulo.
- `helpAreas.test.tsx`: lista de capítulos, botón de capítulo arranca ese capítulo, insignias por capítulo, «Recorrido completo».
- `helpUi.test.tsx`/`helpSuggestions.test.tsx`: un solo «¿Cómo funciona?» por explicación con nombre distinto; contraste de sugerencias (leer CSS y calcular ratio); textos internos en `quick`.
- `HelpAnswer`: pruebas de etiquetas (informativo vs interactivo).

### 5.11 Catálogo maestro y panel de administración
- `master/inventory.ts`: `SectionInventory` añade `chapters` y minutos totales; `tutorialsOf` sigue devolviendo tutoriales; nuevo `chaptersOf(tutorial)`.
- `health.ts`/`AreaAyuda.tsx`: nuevas comprobaciones («capítulo sin ficha», «alias roto», «capítulo >120 s», «tutorial sin capítulos descritos», marcas de capítulos inexistentes), contadores «tutoriales / capítulos / minutos», y lista de alias vigentes. Sigue siendo solo cliente, detrás de `AdminGate`, sin llamadas a Supabase.

### 5.12 Esfuerzo orientativo y riesgos

Estimación en jornadas de desarrollo efectivo (una persona + revisión), **solo motor/infraestructura**; el contenido de los capítulos va aparte:

| Bloque | Jornadas |
|---|---|
| Hotfix previo independiente: color de sugerencias; un solo «¿Cómo funciona?»; marca de «Finalizar compra» (+`ConfirmButton`); no degradar ✓; contador; limpiar `backIndex`; reescribir 4 `quick` internos; `readyOn` mínimo para Compras Lista/Historial | 2 |
| Tipos, `chapters.ts`, alias, registro (`getTour`/`resolveTourRef`) | 1,5 |
| Corredor: plan de capítulos, transición, «Capítulo anterior», cabecera, `needs`, modo lectura, `readyOn`/DOM estable | 3 |
| `planPanel` + sonda de zonas seguras + `keepVisible` + píldora + «↕ Mover» + detección de hojas + `native`/suspensión | 4 |
| Marcas nuevas en pantallas (`ConfirmButton`, flechas ‹ ›, cuadrícula del mes, paneles que se abren, `scope`) | 1,5 |
| Progreso por capítulo + lectura por alias + reanudación | 1,5 |
| Catálogo (Enséñame con capítulos), `HelpAnswer`, explicaciones, «?», voz, nudges, enlace profundo, índice de búsqueda | 2 |
| Panel de administración + `health`/`inventory` | 1 |
| Pruebas (actualizar ~6 suites, nuevas, e2e opcional con Playwright WebKit) | 3-4 |
| Validación en iPhone/Android reales (tarjeta, selectores, cámara, teclado) | 2 |
| **Total motor/infraestructura** | **≈ 22 con el hotfix (≈ 20 sin él); acotando e2e y alcance, ≈ 15-18** |

Riesgos principales:
1. **Posicionamiento:** es el punto más delicado; solo se valida de verdad en navegador/dispositivo real. Mitigación: función pura + prueba de «hit test» en WebKit + botón «↕ Mover» como red de seguridad.
2. **Selectores nativos:** sin API web fiable; depende de que cada def marque `native`. Riesgo de olvidar uno → mitigado con prueba que exija `native` en todo paso cuyo `target` sea `input[type=file|date]`, `select` o botón que lo dispare.
3. **Sincronización de progreso** (flag apagado; migración 0306 pendiente de autorización): compare-and-set por clave; una clave por capítulo reduce conflictos, no los elimina.
4. **Alias y enlaces:** cualquier id olvidado deja un enlace roto → prueba con lista congelada de los 129 ids.
5. **Capítulos «independientes» vs datos:** muchos capítulos necesitan datos previos (un producto, un evento): `needs` + capítulo de creación; si se abusa se vuelve a la dependencia entre capítulos.
6. **Remontar el corredor por capítulo** puede parpadear (lazy + portal) y repetir voz; hay que cuidar `stopHelpSpeech` y el foco.
7. **Volumen de pruebas:** hay ~15 suites que tocan tours; cambios de forma de `TourDef` los rompen si `steps` deja de ser obligatorio → mantener `steps` válido y migrar por módulos.
8. **Reglas existentes que habrá que cambiar a propósito:** `durationSec ≤ 120` por tutorial, y la que fija «Atrás no rebota a omitidos» (se mantiene, con matices).

---------------------------------------------------------------------------------------------------

## 6. Decisiones de producto realmente necesarias (solo las que no se resuelven con una recomendación)

1. **¿Recorrido completo encadenado automáticamente o con parada entre capítulos?** Recomendación: parada con botón «Siguiente capítulo» (da punto de salida y reduce riesgo de iOS); decisión suya si prefiere continuidad sin tocar nada.
2. **Selectores nativos / cámara:** ¿aceptan que la tarjeta se «aparte» (píldora) durante el selector y que el paso ofrezca «Continuar sin foto»? Recomendación: sí (no hay alternativa técnica fiable).
3. **Modo «verlo sin practicar»** cuando faltan datos: ¿se permite o se obliga a crear el dato antes (capítulo de creación)? Recomendación: permitir ambos.
4. **Sincronizar el progreso entre dispositivos** (requiere aplicar 0306): ¿antes o después de los capítulos? Recomendación: después; los capítulos ya usan claves compatibles.
5. **Accesibilidad AA de la marca:** el azul `#4c6ef5` con texto blanco da 4,32:1 en todos los botones primarios de la app (no solo de la Ayuda). ¿Se oscurece el color primario (afecta a toda la app) o se acepta como excepción? Recomendación: oscurecer a `#3f5fe0`-`#364fc7` (el tema «vivo» ya lo usa).
