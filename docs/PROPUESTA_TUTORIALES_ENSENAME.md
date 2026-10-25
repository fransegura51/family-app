# «Enséñame»: auditoría y propuesta de reorganización (25/10/2026)

**Estado: solo auditoría y propuesta. No se ha modificado código, base de datos, tutoriales ni contenido publicado.** Todo lo que sigue sale de **leer el código y el catálogo reales** (rama al día con `master` del 25/10/2026, commit `d3641f5`). Nada se ha probado en un iPhone, un Android ni un navegador: lo que depende de eso está marcado **«no comprobado»**. Los informes detallados (con referencias a archivo y función) están en [`docs/auditoria-tutoriales/`](auditoria-tutoriales/).

---

## 0. Resumen en una pantalla

- **Hoy hay 129 recorridos**: 20 visitas «Conoce esta sección» y **109 tutoriales «Enséñame»**, con 660 pasos, repartidos en 19 módulos. Desde mi entrega del 24/10, otras sesiones añadieron ≈44 tutoriales (Cuentas, Pepa, Avisos, Ubicación, nuevas piezas de Calendario, Compras y Economía…): la fragmentación ha crecido.
- **Propuesta: de 109 tutoriales a ≈36 tutoriales principales con ≈125 capítulos** de 1–2 minutos. Las 20 visitas se mantienen (nivel A), ajustadas.
- Tu estructura inicial para **Calendario, Compras y Economía es acertada**; propongo ajustes pequeños y justificados (§B): «Conoce…» es nivel A (visita), no un tutorial; en Compras, «Compartir la lista» y «Estadística» entran como capítulos; en Economía, Presupuestos pasa a «Entiende tus números» y «Efectivo» a «Cuentas»; en Calendario, T1 deja de repetir la visita.
- **Hay errores de contenido que conviene corregir ya, sin esperar al rediseño** (§D.3): p. ej. dicen «nada se guarda hasta confirmar» y en la app nativa Pepa guarda directamente; «Cumpleaños no tiene avisos» y desde la 0315 sí; el Plan del día «se comparte» y esa función no existe; se afirma que la ubicación con la app cerrada funciona en iPhone y está sin probar.
- **Las incidencias de tu iPhone tienen causa localizada en el código** (§D). Las más graves comparten raíz: el motor **solo conoce un control por paso** y **omite en silencio los pasos opcionales mientras la pantalla aún carga**. Por eso la tarjeta tapa lo que el texto manda pulsar y por eso algunos tutoriales «empiezan en el 3/4».
- **Lo que no se puede arreglar solo con contenido**: el motor no tiene «capítulos» (§E). La arquitectura propuesta **evoluciona el motor existente**, sin sistema paralelo, y mantiene todos los enlaces actuales con una tabla de alias.
- **Esfuerzo orientativo del motor: 15–22 jornadas** (según se acote la prueba en navegador real), más el contenido por módulo. Orden recomendado: arreglos urgentes → motor de capítulos → Calendario → Compras → Economía → resto (§F).

---

## A. Inventario actual (resumen; tabla completa en `auditoria-tutoriales/00-inventario-actual.md`)

| Módulo | Visitas | Tutoriales | Pasos | Qué cubren hoy |
|---|---|---|---|---|
| Calendario | 1 | 15 | 102 | crear evento y tarea (pilotos largos), vistas, filtrar, hecho, editar, repetición, recordatorio, puntos, notas, Google, para quién, compartir, saltar fecha |
| Compras | 1 | 8 | 42 | añadir/editar producto, Modo compra y comprado, clases, subir ticket, historial, tiendas, compartir |
| Economía | 1 | 10 | 59 | apuntar movimiento, categoría, presupuesto, pago previsto, conciliación, estadísticas, pendientes, conectar banco, mes contable, modo de cuentas |
| Cocina | 1 | 4 | 28 | plato del menú, receta, menú→Compras, qué cocinar |
| Familia | 1 | 6 | 41 | añadir, editar ficha, secciones, peso y medidas, dar acceso, actividad |
| Pequeños Grandes | 1 | 8 | 46 | dar puntos, recompensas, listas de deseos, reservar, Mi Camino, monedero |
| Eventos | 1 | 7 | 53 | crear, tareas, invitados, presupuesto, plato, plan del día, invitación |
| Comunidad | 1 | 8 | 44 | alias, guardar, seguir, borrador, receta, denunciar, qué es, sin acceso |
| Documentos / Galería / Contactos / Cumpleaños | 4 | 2+3+4+2 = 11 | 66 | carpeta, subir, fotos, ampliar, compartir, añadir/buscar/importar/compartir, favorito/fecha |
| Configuración / Cuentas / Avisos | 3 | 5+6+3 = 14 | 72 | menú, colores, nombre, sacar accesos, sincronización, PIN, correo, cerrar, borrar, entrar, avisos, campana |
| Ubicación / Inicio / Pepa / Ayuda (con Buzón y Reseñas) | 5 | 5+4+7+2 = 18 | 107 | lugares, reglas, compartir, bienvenida, barra, hablar, apuntar, modos, buzón, reseñas |
| **Total** | **20** | **109** | **660** | |

Hallazgos del inventario:
- **13 «tutoriales» no son interactivos** (todos los pasos tienen «Siguiente» y ninguno espera una acción): son visitas o explicaciones con otro nombre (`que-es`, `colores`, `sincronizacion`, `cuentas-pin`, `-olvide-pin`, `-correo-contrasena`, `-cerrar-sesion`, `-borrar-cuenta`, `-entrar`, `pepa-te-avisa`, `ver-miembros`, `permiso-android`, `buzon-escribir-sugerencia`). Otros siete solo «miran» (Mi Camino, monedero, importar contactos, ampliar foto, actividad, peso y medidas…).
- **Solapes**: en Calendario ≈28 de 58 pasos de creación se repiten entre los pilotos y las «inmersiones»; en Economía `cambiar-categoria` y `clasificar-pendientes` repiten los mismos 4 pasos finales y «PEPA no recuerda tu corrección» sale 5 veces dentro de tutoriales (es nivel C).
- **Funciones reales sin tutorial** (principales): Compras sin ticket, formas de pago, líneas manuales, Precio por tienda, Comparar la lista, Estadística compras; Economía: categorías y etiquetas, efectivo/carteras, Previsión (12 meses, recurrentes, importar), informe; Calendario: consultar un apunte, ubicación/adjunto/nota, calendarios externos con propietario; Pepa: los 5 botones clásicos; Ubicación: ¡Estoy aquí!, mover un lugar, historial; Comunidad: comentar, Mis ajustes; Eventos: enviar invitaciones y seguir confirmaciones, Pagos, Proveedores, Mesas…
- **Accesos hoy** (13 vías, ver `06-motor…` §4): botón «Enséñame» de una ficha, «Enséñame: título», catálogo del área Enséñame, «Conoce esta sección», «Enséñame a corregirlo», aviso de primera visita, bienvenida, «?» contextual (**siempre abre «Preguntar»**, nunca «Enséñame»), voz y buscador (**las sugerencias solo ofrecen fichas**, no tutoriales). **No existe enlace directo a un tutorial ni a un capítulo.**

---

## B. Nueva estructura propuesta

Criterio de niveles (sin repetir contenido):
- **A «Conoce esta sección»** = dónde está cada cosa, sin acciones (≈1–2 min).
- **B «Enséñame a hacerlo»** = una tarea real que la persona hace; capítulos de 1–2 min; recorrido completo de 4–7 min.
- **C «Entiende cómo funciona PEPA»** = reglas internas, clasificaciones, límites, qué ve cada rol.

### B.1 Calendario — 3 tutoriales, 18 capítulos
Tu propuesta es acertada en T2 y T3. Dos ajustes: (1) **T1 «Conoce tu calendario» duplicaba la visita**, así que la visita (A) se mantiene y T1 pasa a ser **«Moverte por tu calendario»**, interactivo; (2) la intro de T2 debe decir que la tarea va **sin hora, sin «Todo el día» y sin recordatorio** (no solo «sin hora»: el formulario de tarea tampoco tiene recordatorios).

Diferencias reales evento ↔ tarea (comprobadas): *solo evento*: hora de inicio/fin, «Todo el día», recordatorios, autorrelleno por título. *Solo tarea*: en repetición semanal personalizada hay que marcar al menos un día; se muestra «Tarea / No realizada» y va en un bloque «Tareas». *Iguales*: título, fecha, privado, aviso a toda la familia (condicional), repetición, ¿Para quién?, categoría, puntos (solo con una persona), ubicación, adjunto y nota. Un evento no se puede convertir en tarea ni al revés. Editar usa un único formulario para ambos.

| Tutorial | Capítulos (≈ minutos) |
|---|---|
| **T1 Moverte por tu calendario** (≈5) | Vistas (1) · Días y meses, saltar a una fecha (1,5) · Filtrar por persona (1) · Tu vista Personal y notas (1,3) |
| **T2 Crear eventos y tareas** (≈8,5; sin pregunta evento/tarea) | Crear un evento: nombre, fecha, hora (1,7) · Personas y categorías (1,5) · Repeticiones (1,3) · Recordatorios (1,3) · Puntos y recompensas (0,8) · Ubicación, adjuntos y notas (1,2) · Guardar y comprobar el resultado (0,7) |
| **T3 Gestionar eventos y tareas** (≈7) | Consultar un apunte (nuevo) · Marcar como hecho (rehacer) · Editar · Cambiar una serie («toda / solo esta / esta y siguientes») · Compartir · Borrar (solo descripción, nunca se resalta ni se pulsa) · Calendarios externos (opcional) |

### B.2 Compras — 4 tutoriales + visita ampliada, 18 capítulos
Tu estructura es **casi la óptima**. Ajustes: **T1 es nivel A** (la visita «Conoce Compras» se amplía con la relación Lista → Tickets → Historial/Estadística y la regla de «Comprado»); **«Compartir la lista» entra como último capítulo de T2** y **«Estadística compras» como último de T5**; «clasificar artículos» se reparte (gestión y cambio de clase en T3, clase por línea en T4, «cómo decide PEPA» solo en C); T4 abre con «Con ticket / Sin ticket» y separa **qué se revisa** de **cómo se paga**; T5 empieza en la pestaña **Tickets** (ahí viven las compras registradas), no en Historial.

| Tutorial | Capítulos |
|---|---|
| **T2 Preparar y usar tu lista** (≈6) | Añadir productos · Editar y ordenar (cantidad, unidad, tienda, prioridad, foto) · Ir de compras: Modo compra y tachar · Finalizar la compra · Compartir la lista |
| **T3 Tiendas y clases** (≈4,5) | Crear y ordenar tus tiendas · Asignar tienda y leer la lista agrupada · Clases de productos (gestionar y cambiar la clase de un producto) |
| **T4 Registrar compras y tickets** (≈7) | Elegir cómo registrar (con ticket / sin ticket) · Subir y leer un ticket · Revisar datos y productos (incluye «+ Añadir productos a mano / + Añadir línea» y el aviso de cuadre) · Cómo se paga y qué pasa en Economía · Guardar y gestionar lo guardado |
| **T5 Historial, comparación y estadística** (≈6) | Consultar tus compras registradas (Tickets) · Leer el Historial · Ficha del producto y precio por tienda · Comparar la lista entre tiendas · Estadística compras |

**Regla de «Comprado» (verificada en el código):** marcar comprado solo cambia el estado del producto en la lista; «Finalizar compra» solo borra de la lista lo tachado de esa tienda; ninguno crea compra, gasto ni precio (una prueba existente lo blinda). Lo que **sí** crea el gasto en Economía es **guardar un ticket o una compra sin ticket**; ahí el gasto se enlaza con un cargo del banco del mismo importe a ±7 días o se crea nuevo, y efectivo y pagos mixtos nunca se unen al banco. Los tutoriales actuales no dicen la primera parte; el nuevo cap. 2.3 y la visita la dirán de forma explícita.

### B.3 Economía — 4 tutoriales + visita, 13 capítulos
Tu estructura de cinco puntos se respeta con estos ajustes: **«1 Conoce Economía» es la visita (A)**; **Presupuestos pasa al grupo «Entiende tus números»** (es seguimiento, no registro); **«Cuentas, bancos y efectivo»** incluye de quién es cada cuenta y el modo Compartidas/Separadas; **la conciliación banco↔ticket/apunte es automática** (no hay nada que hacer: va a nivel C) y lo interactivo es «Pagos previstos y conciliación»; mes contable y periodos van a «Entiende tus números».

| Tutorial | Capítulos |
|---|---|
| **B1 Apunta y organiza tu dinero** (≈5) | Apunta un gasto o ingreso · Encuentra y corrige un movimiento (fusiona los dos duplicados) · Categorías y etiquetas (nuevo) |
| **B2 Cuentas, banco y efectivo** (≈5,5) | Conecta tu banco · De quién es cada cuenta y qué ve cada persona · Efectivo (opcional; **publicar tras tu validación** en iPhone y Android) |
| **B3 Pagos previstos y conciliación** (≈5) | Añade un pago previsto · Mira lo que viene (12 meses, recurrentes) · Revisa una propuesta de conciliación |
| **B4 Entiende tus números** (≈5,5) | Periodo y mes contable · Estadísticas · Presupuestos · Generar informe |

**Disponible hoy / no existe** (para no prometer): *existe* — resumen, estadísticas, movimientos, presupuestos (el importe solo se edita por voz), banco, previsión de pagos, conciliación con propuesta, efectivo en Banco, informe imprimible. *No existe* — cuentas manuales, exportar a Excel/CSV, conversión de divisas, crear préstamos o hipotecas, traspasos entre tus cuentas detectados solos, deshacer un «No es este», renombrar o reordenar categorías. «Añadir cuenta» solo conecta un banco. Los medios de pago solo se eligen en Compras, no en «+ Nuevo movimiento».

### B.4 Resto de módulos (criterio: lógica de uso, no cinco por módulo)

| Módulo | Hoy | Propuesta (tutoriales · capítulos) |
|---|---|---|
| Familia | 6 | **2 · 7**: «Gestionar las fichas» (añadir, editar y foto, secciones, dar acceso) y «Peso y medidas» (apuntar, leer la evolución, peso objetivo). Actividad reciente pasa a visita + C |
| La cocina de Pepa | 4 | **3 · 6**: Planificar la semana (plato; pasar a Compras) · Mis recetas (escribir; traer de internet/enlace; usar una receta) · ¿Qué cocino hoy? |
| Eventos | 7 | **3 · 10**: Crear y preparar (crear, panel, tareas, partida) · Invitados e invitación (invitados, diseño, **enviar y seguir confirmaciones**, nuevo) · Menú y plan del día. Quedan fuera 8 módulos sin recorrido (Pagos, Decoración, Actividades, Mesas, Ceremonia, Proveedores, Detalles, Regalos): la visita los nombra |
| Pequeños Grandes | 8 | **3 · 10**: Puntos y recompensas (por rol) · Lista de deseos (incluye editar y compartir) · Educación financiera (apuntar, aprobar, objetivos). «Mi Camino» pasa a visita/C |
| Documentos | 2 | **1 · 4**: carpeta · subir · vencimiento y avisos · quién lo ve (candado) |
| Galería | 3 | **1 · 3**: subir · ver grande y descripción · compartir |
| Contactos | 4 | **2 · 5**: agenda (añadir, buscar, editar/cumpleaños) · importar y compartir |
| Cumpleaños | 2 | **1 · 2**: favoritos · cambiar una fecha (depende de una decisión de permisos, §G) |
| Comunidad (18+) | 8 | **1 · 5 + «Completar mi fecha» aparte**: alias y normas · leer, guardar y seguir · publicar · guardar receta · denunciar/bloquear |
| Configuración | 5 | **1 · 4**: mi menú (capítulo compartido con Inicio) · colores · sacar accesos · ajustes de la familia (admin) |
| Cuentas | 6 | **1 · 2**: PIN y huella · correo y contraseña (recorrer los formularios de verdad). Cerrar sesión, borrar cuenta, «olvidé el PIN» y «entrar» pasan a visita + C; **el borrado de cuenta no se guía** |
| Avisos | 3 | **1 · 4**: activar en este móvil · resumen de tareas (hoy y atrasadas) · la campana · (Android) que lleguen con la app cerrada |
| Ubicación | 5 | **1 · 5**: compartir mi ubicación · guardar un lugar · editar o mover un lugar (nuevo) · reglas · (Android) app cerrada |
| Inicio | 4 | **1 · 4**: barra y menú ☰ · elegir las 4 fijas · ordenar tarjetas · carrusel (nuevo). La bienvenida se reclasifica como visita general |
| Hablar con PEPA | 7 | **1 · 4**: preguntar · apuntar y revisar la tarjeta · cómo quiero que me conteste (+ botones y «sin tarjeta») · pedir ayuda |
| Ayuda y opiniones | 2 | **1 · 2** + 2 visitas: escribir una sugerencia · valorar con estrellas |

---

## C. Mapa de migración (qué se fusiona en qué)

**Calendario** (16 → 1 visita + 3 tutoriales)
- T1 ← `tut-calendario-cambiar-vista` (cap. Vistas), `tut-calendario-saltar-fecha` + pasos «mes/día» de la visita (cap. Días y meses), `tut-calendario-filtrar-persona`, `tut-calendario-nota-personal`.
- T2 ← `cal-crear-evento` (13 pasos: abrir, título, fecha, hora, todo el día, quién, privado, categoría, puntos, extras, guardar), `cal-crear-tarea` (10; desaparece, su contenido queda como notas «en una tarea…»), `tut-calendario-evento-repetitivo` + `-tarea-repetitiva` (comparten `repeatSteps`), `tut-calendario-evento-recordatorio`, `tut-calendario-puntos`, `tut-calendario-para-quien`. Se evitan ≈28 pasos duplicados.
- T3 ← `tut-calendario-marcar-hecho` (rehacer), `tut-calendario-editar-evento` (editar + serie), `tut-calendario-compartir`, `tut-calendario-google` (capítulo opcional); «consultar» y «borrar (texto)» nuevos.
- Falta: marcas para las flechas ‹ › del día y la cuadrícula del mes, los tres chips (ubicación/adjunto/nota), el aviso a toda la familia y el formulario de edición (categoría, extras, «todo el día»).

**Compras** (9 → 1 visita + 4 tutoriales)
- T2 ← `com-anadir-producto` (cap. 2.1), `tut-compras-editar-producto` (2.2), `tut-compras-marcar-comprado` (2.3 y 2.4, reescribiendo `finalizar`), `tut-compras-compartir` (2.5).
- T3 ← `tut-compras-tiendas` (3.1 y 3.2), `tut-compras-clase-historial` (3.3).
- T4 ← `tut-compras-subir-ticket` (4.2, 4.3 y 4.5); **nuevos**: 4.1 y 4.4.
- T5 ← `tut-compras-historial-precios` (5.2 y 5.3); **nuevos**: 5.1, 5.4 y 5.5.
- Falta: marca de «Finalizar compra», de los chips Con/Sin ticket, de la hoja de origen del archivo y de las acciones de fila de un ticket.

**Economía** (11 → 1 visita + 4 tutoriales)
- B1 ← `apuntar-movimiento` (1.1), `cambiar-categoria` + `clasificar-pendientes` (1.2, 8 pasos se fusionan en 5); 1.3 nuevo.
- B2 ← `conectar-banco` (2.1), `conectar-banco.dueno` + `modo-cuentas` (2.2); 2.3 nuevo.
- B3 ← `anadir-pago-previsto` (3.1), `revisar-conciliacion` (3.3); 3.2 nuevo.
- B4 ← `mes-contable` + `ver-estadisticas.fecha` (4.1), `ver-estadisticas` (4.2), `crear-presupuesto` (4.3); 4.4 nuevo.
- Se reutilizan ≈45 de los 59 pasos (≈8 reescritos); ≈22 pasos nuevos (recuento orientativo).

**Resto de módulos**: el detalle paso a paso por módulo (qué pasos se reutilizan, cuáles se reescriben y qué falta) está en los informes `04` y `05`. Regla común: un tutorial pequeño de 2–4 pasos (p. ej. `tut-cumpleanos-favorito`, `tut-galeria-ampliar`, `tut-contactos-buscar`) **se convierte en capítulo** del tutorial de su módulo.

---

## D. Incidencias técnicas (causas comprobadas leyendo el código)

### D.1 Las reportadas en tu iPhone

| # | Incidencia | Causa en el código | Prioridad | Corrección recomendada |
|---|---|---|---|---|
| 1 | La tarjeta tapa los controles de fecha en «Marcar como hecho» (y en general) | El motor conoce **un solo control por paso** (`step.target`) y elige arriba/abajo mirando solo ese. El paso `dia` resalta el panel entero del día pero el texto manda pulsar ‹ › y otro día del mes, que no están marcados; la tarjeta llega al 46 % de la pantalla y lo que queda debajo no se puede pulsar. Además usa constantes de zona segura (8 y 100 px) distintas del CSS real, y entra en el paso con `scrollIntoView` centrado | **Alta** | Marcar los controles auxiliares (`keepVisible`), calcular la posición con una función pura y medir las zonas seguras (§E.6); marcar ‹ › del día y la cuadrícula del mes; el paso solo se muestra si no hay ya un círculo pendiente a la vista |
| 2 | Siguiente paso de «Marcar como hecho»: ¿resalta el control real? | El control es el círculo (`calendar.entry-complete`), el mismo para eventos y tareas, **solo si el apunte es propio y está pendiente**; aparece en todas las vistas con tarjetas, pero solo si el día mostrado tiene algo pendiente. Si no hay nada, a los 3,5 s sale «No encuentro este control… otra versión», un mensaje engañoso y el caso más común. Si la persona toca el círculo en el paso 2 («todavía no lo toques»), el aviso se ignora y el paso 3 queda atascado. El marco puede quedar recortado por `overflow:hidden` (no comprobado en pantalla) | **Alta** | Fusionar los pasos 2 y 3; mensaje propio cuando falta el control («necesitas un apunte pendiente; crea uno o elige otro día»); modo «verlo sin practicar» |
| 3 | «Crear una tarea que se repite»: faltan campos | Confirmado: de «cerrar repetición» pasa a «guardar»; sin explicar Privado, Aviso a toda la familia, ¿Para quién?, Categoría, Puntos y Ubicación/Adjunto/Nota (todas tienen marca). Igual en «evento que se repite» (faltan hora, todo el día, recordatorio…) | Media | Se resuelve al integrar en T2 (capítulos 2, 5 y 6); anexo con omisiones de todos los tutoriales |
| 4 | **Compras: «Finalizar compra» resalta «Mercadona»** | El botón es un `ConfirmButton` que **no admite `data-help-id`**; el paso apunta a la cabecera de tienda (que además **pliega la tienda y oculta el propio botón**). Además el texto dice «queda tachado en su sitio» y en realidad pasa a «✓ Completados» | Media-alta | Añadir `helpId` a `ConfirmButton` y marcar el botón; reescribir el texto con la regla de «Comprado» |
| 5 | **«Tiendas» empieza en 3/4 y «Compartir lista» en 2/3, sin poder volver al primero** | Es del **motor**: la marca de llegada se pinta cuando la pestaña monta, **antes de que carguen los datos** («Cargando lista…»); un paso opcional cuyo control no existe se omite a los 350 ms y se anota en `skipped`; «Atrás» salta los omitidos (y el botón no se pinta si no hay anterior); el contador no descuenta lo omitido. En «Tiendas» además el paso `abrir` tiene `skipIf` sobre un campo dentro de un `<details>` cerrado y `findTarget` no mira si el `<details>` está cerrado. **Afecta a 9 tutoriales** con primer paso opcional (bienvenida, marcar-hecho, solicitar, tiendas, compartir ×2, clasificar-pendientes, contactos-importar, contactos-compartir, galería-compartir). *No comprobado en iPhone cuál de las vías ocurrió* | **Alta** | Esperar a «datos listos» (`readyOn`), no permitir que el primer paso sea opcional (los datos requeridos se declaran como `needs`), ignorar elementos dentro de `<details>` cerrado, contador por pasos mostrados y «Volver al principio» |
| 6 | **«Subir ticket»: la tarjeta tapa el título y se superpone al selector** | El paso 1 resalta el `<form>` entero, más alto que la pantalla: `scrollIntoView(center)` oculta el título «Subir ticket» y ninguna colocación es válida. Lo que se ve superpuesto es casi seguro la **hoja propia de PEPA** «Añadir ticket» (cámara/galería/PDF; z-index 50) bajo la capa del tutorial (z-index 1300), que intercepta sus opciones y «Cancelar». El selector **nativo** del sistema no puede quedar tapado por el DOM, pero el tutorial no detecta que se abrió, y el paso `foto` no tiene «Siguiente»: si se cancela no hay salida | **Alta** | Resaltar solo la cabecera en el paso 1; detectar hojas propias abiertas y mover la tarjeta; declarar los pasos con selector nativo (`native`) para pasar a modo píldora y ofrecer «Continuar sin foto» |
| 7 | **«Cambiar clase»: el último paso no resalta el desplegable** | El marco es un `box-shadow` sobre el propio `<select>`; en WebKit puede ignorarse o recortarse (hipótesis). **No determinable leyendo** | Baja | Marcar el contenedor (`<label>` o `<div>`) en vez del `select`; añadir `outline` |
| 8 | Botón «¿Cómo funciona?» duplicado | `explainersForCard()` devuelve **todas** las explicaciones que citan la ficha y se pinta un botón idéntico por cada una. 20 fichas tienen 2 o más (la peor, `not-activar`, 4) | Media | Un botón por explicación con su nombre, o uno solo que abra la lista |
| 9 | Contraste de las sugerencias del buscador | `.help-suggestion` no fija `color` y el CSS global `button{color:white}` lo deja **blanco sobre blanco (1,00:1)**; el nombre del módulo da 4,83:1 en reposo pero 4,29:1 en hover. No hay modo oscuro en la app principal. De paso, el blanco sobre el azul primario `#4c6ef5` da **4,32:1** en todos los botones primarios de la app (<4,5) | **Alta** (sugerencias); media (azul primario) | Fijar el color del texto; oscurecer el azul primario a ≈`#3f5fe0` (decisión §G) |
| 10 | Diagnósticos internos solo para administración | **Bien resuelto**: `ownerKnown` solo lee una caché en memoria (sin llamadas a Supabase) y `AreaAyuda` está tras `AdminGate`, que pregunta al servidor. **Fallo:** 4 textos públicos (`quick`) cuentan estado interno («solo existe la base de datos preparada», «la función de alergias, que está apagada», «están apagadas por ahora») y el índice de búsqueda incluye también los `limits` internos | Media | Reescribir esas 4 fichas y excluir `limitsInternal` del índice |
| 11 | Respuesta informativa de Ayuda frente a tutorial «Enséñame» | Hoy solo se distinguen por los botones de `HelpAnswer`; «Enséñame» y «Enséñame: título» comparten etiqueta, no indican duración ni que es interactivo; las sugerencias solo ofrecen fichas; la voz arranca **el primer** tutorial de la ficha, no el principal | Media | Etiquetas estables: «Ver los pasos» (escrito) · «Enséñame en pantalla (2 min)» · «Capítulo: …» · «¿Cómo funciona PEPA por dentro?» |
| 12 | «Anterior»/«Siguiente» | El botón real se llama «← Atrás». En un paso sensible ya hecho, tras volver con «Atrás» **no hay forma de avanzar**; `backIndex` no se limpia nunca; repetir un tutorial «Hecho» y salir a mitad **degrada el ✓** a «descartado» | Media | «Ya lo hice» en sensibles completados, limpiar `backIndex`, no degradar un ✓ de la misma versión |

### D.2 Omisiones equivalentes en otros tutoriales
Hay una tabla por módulo en los informes. Ejemplos: Pepa «apuntar» no explica la opción «Para» ni los avisos ⚠️; Ubicación «guardar lugar» no dice dónde queda ni cómo editarlo; Cuentas «PIN» no recorre los dos campos; Comunidad «borrador» no explica sección, tema, receta ni límites; Reseñas habla de «un comentario» y son dos cuadros; Avisos «horario» solo cubre las atrasadas, no las de hoy.

### D.3 Contenido que contradice la app de hoy (corregible ya, sin esperar al rediseño)
| Prioridad | Dónde | Qué dice | Qué hace el código |
|---|---|---|---|
| **Alta** | Pepa: tutorial «apuntar», visita, fichas y panel | «Nada se guarda hasta confirmar» | En la **app nativa** el valor por defecto es guardar **directamente** sin tarjeta (`getAutoConfirm()`); quien hace el tutorial en el móvil guarda de verdad |
| **Alta** | Ubicación, ficha y tutorial «compartir» | la ubicación con la app cerrada funciona en iPhone | `docs/APP_IOS.md`: «SIN PROBAR» en un iPhone real |
| **Alta** | Cumpleaños: visita y explicación | «no hay avisos» | Desde la 0315 llega un aviso diario a las 09:00 (hoy y mañana) |
| **Alta** | Eventos: Plan del día | «Mostrar al compartir» / el plan que compartáis | Ninguna función de compartir el plan existe |
| **Alta** | Calendario: tutorial del menú ☰ | «✏️ Editar» del menú | Se retiró el 24/10 |
| **Alta** | Calendario: 📤 Compartir | manda título, fecha y **nota** | Manda título, fecha y `description`; la nota va a `note` y **no se comparte** |
| **Alta** | Familia: «Dar acceso» | usa «Generar código de acceso» con «Crear / Ya tengo un código» | El flujo real es «Tengo una invitación» (primero invitación, luego cuenta); además una madre/padre vinculado puede dar acceso y el tutorial lo restringe a administración |
| Media | Ubicación | «Editar un lugar no cambia sus coordenadas» | Desde el 24/10 existe «Mover el lugar a donde estoy ahora» |
| Media | Compras: explicación de clasificación | lista compartida fija de 3 cadenas | La 0308 hace que las clases confirmadas por cada familia voten y el cliente las usa |
| Media | Economía: explicaciones de conciliación | — | Desfasadas: ahora hay vínculo de devoluciones, exclusión del efectivo y pago mixto |
| Media | Avisos / Comunidad: dos explicaciones | «no hay botón de marcar todas leídas» / «la zona horaria se cambia en Familia» | Existe «Marcar todas»; los horarios están solo en Configuración → Avisos |
| Media | Cocina, Pequeños, Documentos | 4 comidas; sin aviso a adultos; sin visibilidad por persona | 5 comidas (Snack) y semanas; aviso a adultos desde la 0316; visibilidad por persona y candado (0317) |
| Media | Pepa: «Guardar como» | señala «Guardar como» | El marcador va en la primera opción, «Para» |
| Baja | Varias | «con tres advertencias se pierde el acceso»; «sesiones» en Seguridad | Es una expulsión de 30 días con readmisión; no existe pantalla de sesiones |

### D.4 Hallazgos de producto (fuera de la Ayuda; no se corrigen sin tu decisión)
Cumpleaños no guarda para adultas no administradoras (RLS); editar una tarea podría cambiar su sincronización con Google (`EditEventForm` no envía `syncToGoogle`); Economía: «Ingresos» suma distinto en Resumen que en Presupuesto con banco enlazado, y borrar con ✕ un movimiento del banco probablemente lo recrea la siguiente sincronización (por lectura de SQL, no ejecutado); cualquier miembro con Economía puede conectar/desconectar bancos; las cuentas de niño no ven las reservas en Lista de deseos; la ficha de un miembro cambia sus secciones pero no las de su cuenta; editar una ficha con acceso total la deja solo con Inicio si no se marca nada.

---

## E. Arquitectura propuesta (evoluciona el motor existente)

Principio: **no se crea un segundo motor.** El reductor puro `reduceTour` sigue gobernando los pasos de **un capítulo**, que se comporta exactamente como el `TourDef` de hoy; encima se añade una capa mínima de «recorrido».

1. **Tipos.** `TourDef.chapters?: TourChapter[]` (si existe manda sobre `steps`; un tutorial sin capítulos sigue siendo un capítulo único). Cada capítulo: `id`, `title`, `summary`, `durationSec` (≤120 por capítulo), `version`, `access/startPath/startDest/paths` propios (rol, plataforma), `readyOn` (señales de «datos cargados»), `needs` (precondiciones de datos con mensaje), `steps`. Cada paso gana `keepVisible` (controles auxiliares que la tarjeta no puede tapar), `native` (selector del sistema), `scope` (qué instancia resaltar si la marca se repite) y `skipLabel` («Continuar sin foto»).
2. **Identificadores.** Referencia pública `tutorial:capitulo`. Progreso por capítulo en `pepa:help-tour:<tutorial>--<capitulo>` (cumple el patrón de claves actual, así que **no hace falta cambiar la migración 0306 pendiente**). Tabla de **alias** con los 129 ids actuales → (tutorial, capítulo): ningún enlace, ficha, `next`, voz ni progreso existente se rompe.
3. **Recorrido completo y navegación.** Capítulos encadenados: al terminar uno, el panel final existente muestra «Siguiente capítulo: … (≈1 min)», «Terminar aquí» y «Repetir capítulo»; «← Capítulo anterior» reinicia el anterior desde su principio (estado limpio). Cabecera «Capítulo 2 de 4 · Paso 1 de 3». Dentro del capítulo, «Atrás/Siguiente» como hoy con las correcciones de D.1-12.
4. **Acceso directo al capítulo.** `startTourById(ref, {chapter, mode})`, `openHelp({area:'learn', tourId, chapterId})` y `/ayuda?tutorial=…&capitulo=…`. El catálogo «Enséñame» muestra por tutorial «Recorrido completo (≈6 min)» y la lista de capítulos con ✓/nuevo/empezado; las fichas muestran «Enséñame en pantalla» que abre el selector de capítulos (o el capítulo concreto); las explicaciones (nivel C) enlazan a un capítulo exacto de «Enséñame a corregirlo»; el «?» contextual podrá abrir directamente «Enséñame» del módulo; el buscador indexará capítulos.
5. **Salida segura y reanudación.** «✕ Salir» no guarda nada del usuario (el motor nunca ejecuta acciones). `started/dismissed` nunca pisan un `completed` de la misma versión. Reanudación: registro local de ≤30 min; al volver, `HelpNudges` **ofrece** («¿Seguimos con «…»?») y reinicia **el capítulo**, nunca autoarranca.
6. **Datos que faltan.** Si un capítulo necesita un dato (un producto, un evento): tarjeta con tres salidas — «Ir al capítulo que lo crea», «Verlo sin practicar» (pasos informativos) y «Salir». Nada se inventa ni se simula.
7. **Resaltado ligado a elementos reales.** Se mantiene `data-help-id` + `data-tour-active` (el aro viaja con el control; **sin coordenadas**). Una prueba estática exigirá que cada `target`, `keepVisible`, `readyOn` y `needs` exista y que cada botón citado entre «» tenga su marca.
8. **Posición de la tarjeta (regla comprobable).** Una función pura `planPanel()` que sustituye a la decisión actual: mide las zonas seguras reales (sonda `env(safe-area-inset-*)`), la barra inferior, los controles a proteger (`target` + `keepVisible`) y las **hojas propias abiertas**, y prueba en orden: lado actual completa → otro lado completa → compacta → **píldora** (≤56 px). Si ninguna cumple, avisa y deja siempre un botón «↕ Mover». Nunca centra con `scrollIntoView`: desplaza solo lo necesario. Con selectores nativos (archivos, cámara, fecha) el paso pasa a píldora sin interceptar toques hasta que la persona vuelve. Se verifica con pruebas unitarias de geometría y, para garantizarlo de verdad, con una prueba en WebKit real (viewport 375×667 y 390×844: ningún control a proteger puede quedar bajo la tarjeta). *Compatibilidad iPhone Safari/Android/escritorio: no comprobada hasta pasar esa prueba y la validación manual.*
9. **Migración.** Incremental por módulo, sin «big bang»: un helper convierte un tutorial actual en capítulo reutilizando sus pasos y marcas ya verificadas. La regla actual «cada ficha tiene su recorrido» (`tourCoverage.test.ts`) **hay que cambiarla a propósito** para que un capítulo pueda cubrir varias fichas (decisión §G-1). Cambiar ids borra hoy el «✓ Hecho» de la gente; los alias lo evitan leyendo el progreso por el id antiguo.
10. **Catálogo maestro y administración.** `inventory` cuenta capítulos y minutos; el panel de administración añade comprobaciones («capítulo sin ficha», «alias roto», «capítulo >120 s», marcas inexistentes). Sigue siendo solo cliente, sin llamadas a Supabase.

---

## F. Plan de implementación

| Bloque | Qué incluye | Jornadas | Pruebas |
|---|---|---|---|
| **0. Arreglos urgentes** (publicables ya, sin tocar el modelo) | contraste de sugerencias; un solo «¿Cómo funciona?»; marca de «Finalizar compra» (`ConfirmButton`); no degradar el ✓; contador y `backIndex`; 4 fichas con estado interno; **correcciones de contenido de D.3** (Pepa, iPhone, Cumpleaños, Plan del día, menú Calendario, 📤, lugar, explicaciones desfasadas) | ≈2 + redacción | las existentes + contraste por CSS + etiquetas↔tipo |
| **1. Motor de capítulos** | tipos, alias, corredor (plan, transición, «capítulo anterior»), `readyOn`/`needs`/modo lectura, progreso por capítulo, deep links, catálogo/Ayuda/voz/nudges/búsqueda, administración | ≈8–9 | `tourDefs`, `engine*`, `tourRunner`, nuevas `chapters`, `tourAliases`, `helpAreas` |
| **2. Tarjeta y selectores nativos** | `planPanel`, sonda de zonas seguras, `keepVisible`, píldora/«↕ Mover», detección de hojas, `native` | ≈4 | geometría + **WebKit real** (Playwright; hoy no está en el repo) |
| **3. Calendario** | marcas nuevas + T1, T2, T3 (18 capítulos) | ≈4–5 | pantallas reales (`calendarG1.test.tsx`) |
| **4. Compras** | marcas + T2–T5 (18 capítulos) + visita ampliada + corregir explicación de clasificación | ≈5 | ídem |
| **5. Economía** | marcas (≈20) + B1–B4 (13 capítulos); Efectivo preparado y **publicado tras tu validación** | ≈4–5 | ídem |
| **6. Resto de módulos** | agrupado en 2–3 tandas (Familia/Cocina/Pequeños; Eventos/Documentos/Galería/Contactos/Cumpleaños; Comunidad/Configuración/Cuentas/Avisos/Ubicación/Inicio/Pepa/Ayuda) | ≈8–10 | ídem |
| **7. Validación en dispositivos** | checklist iPhone Safari, app instalada, Android y escritorio (tarjeta, teclado, selectores, cámara) | ≈2 + tu tiempo | manual |

**Orden recomendado:** 0 → 1 → 2 → Calendario → Compras → Economía → resto. Los bloques 1 y 2 no se pueden saltar: sin ellos las incidencias 1, 2, 5 y 6 reaparecerían en los capítulos nuevos. El bloque 0 puede publicarse esta misma semana. Estimación del motor (bloques 0–2): **≈15–22 jornadas** según se acote la prueba en WebKit. Contenido (3–6): ≈21–25 jornadas.

**Riesgos principales:** (1) la posición de la tarjeta solo se valida de verdad en navegador/dispositivo real; (2) los selectores nativos no tienen API web fiable: cada paso debe declararlo y una prueba lo comprobará; (3) un id olvidado rompe un enlace: lista congelada de los 129 ids; (4) capítulos «independientes» que necesitan datos previos: `needs` + modo lectura, sin abusar; (5) ~15 suites tocan los tutoriales: se mantiene `steps` válido y se migra por módulos; (6) el progreso no se sincroniza entre dispositivos hasta aplicar la 0306 (autorización pendiente): las claves por capítulo ya son compatibles.

---

## G. Decisiones pendientes (solo las de producto) — con recomendación

1. **Regla «una ficha = un recorrido».** Hoy una prueba lo exige. *Recomiendo cambiarla* para que un capítulo pueda cubrir una o varias fichas. Sin esto no se pueden fundir tutoriales.
2. **Recorrido completo: ¿encadenado solo o con parada entre capítulos?** *Recomiendo parada con botón «Siguiente capítulo»* (punto de salida y menos riesgo en iPhone).
3. **📤 Compartir en Calendario: ¿se comparte también la nota?** Hoy el texto de la Ayuda lo promete y el código no lo hace. *Recomiendo corregir ahora el texto (sin cambiar la app)* y decidir después si se cambia el comportamiento.
4. **Efectivo, pagos con varios medios, devoluciones y duplicados.** *Recomiendo preparar los capítulos ahora y publicarlos solo cuando valides esas pantallas en iPhone y Android* (hoy figuran «pendiente de validación»).
5. **Cumpleaños para una adulta no administradora** (⭐ y ✏️ visibles pero el servidor no guarda). *Recomiendo ocultarlos o desactivarlos para ella* hasta decidir si se abre el permiso; mientras tanto el tutorial solo se ofrece a administración.
6. **Pepa en la app nativa: ¿«sin tarjeta» por defecto es definitivo?** *Recomiendo mantenerlo* y escribir los textos para los dos modos (el capítulo «Apuntar» comprobará el ajuste y usará una frase que siempre deja tarjeta).
7. **Botones clásicos de Pepa** (5 botones visibles por defecto, hoy sin explicar). *Recomiendo una frase en la visita, sin capítulo propio.*
8. **Eventos: 8 módulos sin recorrido** (Pagos, Proveedores, Mesas, Decoración…). *Recomiendo dejarlos fuera de esta tanda; la visita los nombra.*
9. **Botón antiguo «Generar código de acceso» en Familia.** *Recomiendo retirarlo (o actualizar su texto)* para que haya un solo flujo de entrada.
10. **Color primario (azul `#4c6ef5`, 4,32:1 con texto blanco; AA exige 4,5).** *Recomiendo oscurecerlo a ≈`#3f5fe0`* (afecta a toda la app, no solo a la Ayuda).
11. **Dos confirmaciones técnicas que necesito de ti** (no puedo comprobarlas desde aquí): que la función de **borrado de fotos de tickets a los 3 meses** está desplegada, y que la política vigente de clasificación es la de la **0308**.

*El resto de decisiones del informe tienen recomendación concreta y no necesitan que decidas:* ver ticket sin guardar al terminar un capítulo (sí, permitirlo), «verlo sin practicar» cuando faltan datos (sí), «Estadística compras» como capítulo de T5 (sí), capítulos con rol (`access` por capítulo), mensajes propios cuando falta un control (sí), progreso entre dispositivos después de los capítulos, guiar el borrado de cuenta (**no**).

---

## Qué no se ha comprobado
Todo comportamiento real en iPhone/Android/Safari (posición de la tarjeta, recorte del marco, selectores nativos, teclado, cámara); cuál de las vías de omisión ocurrió en tu iPhone en «Tiendas» y «Compartir»; el estado en producción de las migraciones y funciones de servidor citadas (0308, purga de fotos, 0315–0317); la IA de lectura de tickets; el banco real; y las inferencias marcadas «por lectura» en Economía (I1, R2). No se ha ejecutado ninguna prueba nueva ni se ha tocado ningún dato.
