# Auditoría integral del módulo Eventos — PEPA Family App

Fecha: 31/10/2026 · Fase: **solo auditoría** (no se ha modificado código, base de datos, migraciones, interfaces ni configuración; en producción solo se hicieron `SELECT` agregados, sin datos personales).
Revisores: 6 revisiones independientes por ámbito (A diseño/documentación, B configurador, C invitados/RSVP, D presupuesto/proveedores, E menú/música/tareas/plan, F BD/seguridad/integraciones) consolidadas aquí. Los informes detallados por ámbito (con IDs `A-xx`…`F-xx`) están en la carpeta de trabajo de la sesión; los IDs se citan abajo.

## 0. Cómo leer este informe

- **Tres niveles** para cada función: **(1) Interfaz** · **(2) Guarda datos** · **(3) Cumple su propósito** (los datos alimentan otra función u ofrecen una operación útil).
- **Certeza:** `CÓDIGO` = leído en el código · `PRUEBA` = comprobado con un test ejecutado o con una consulta `SELECT` · `PENDIENTE` = no verificable sin dispositivo o sin una acción destructiva.
- Las comprobaciones directas de esta consolidación (releídas por mí tras los informes): `deleteEvent` solo borra la fila `events` y su etiqueta (`src/data/events.ts:449-462`); el POST de `event-rsvp` no comprueba archivado (la única comprobación está en las ramas GET, `index.ts:362` y `503`); la Música/Fotos/Decoración del configurador se monta solo con `event.type === 'boda'` (`EventosScreen.tsx:6325`); `recalculateAutoTasks` actualiza por título exacto sin pasar por la sincronización de Calendario (`events.ts:419`).
- **Datos reales (producción):** 17 eventos (16 activos), 27 invitados, 105 tareas, 24 partidas de presupuesto, 5 pagos, 9 proveedores de evento, 3 ofertas, 30 platos, 51 decisiones del configurador. **Uso real muy bajo de lo «avanzado»**: 0 partidas con proveedor o encargo, 0 pagos enlazados a partida, 0 necesidades declaradas por invitados, 0 opciones de menú, 0 compras desde menú, 0 recordatorios de pago. Muchas funciones están verificadas solo por código y tests, **nunca con uso real**.
- **Limitación importante:** nada de lo móvil (iPhone/Android: modales, selectores, scroll, arrastre táctil) se ha verificado. `docs/QA_EVENTOS_PENDIENTES.md` tiene **0 de 510 casillas validadas**, y ningún requisito de Eventos del registro está «Probado» ni «Aprobado». Muchos tests de Eventos son **estáticos** (leen el código fuente y buscan cadenas): demuestran que el código contiene algo, no que funcione.

---

## A. Inventario funcional

Estados: FUNCIONAL · PARCIAL · SOLO INTERFAZ · DESCONECTADO · NO IMPLEMENTADO · NO VERIFICADO (en móvil, todo es «no verificado»; aquí el estado se refiere al código/datos).

| # | Sección | Qué existe | Estado | Qué falta | Conexiones |
|---|---|---|---|---|---|
| 1 | Creación del evento | Modal: nombre, tipo (6), subtipo (celebración), plantilla, módulos recomendados. Fecha y lugar ya no se piden al crear. Crea checklist de tareas por tipo. | FUNCIONAL | El tipo no se puede cambiar después (B-14). Edad del cumpleañero no se pide (A-01). No hay «describe el evento y PEPA recomienda módulos» (A-03). | Tareas plantilla; etiqueta de Economía |
| 2 | Tipos y personalización | Cambian: módulos recomendados, tareas plantilla, partidas «Organízamelo», bloques del configurador. Plantilla personal y duplicar. | PARCIAL | Plantilla/duplicado solo copian la identidad (sin decisiones ni momentos, B-08). Música/Fotos/Decoración detallada solo en bodas (B-10, E-08). Sin flag «sorpresa» (A-02). Lugar de cumpleaños reducido a 3 tipos (A-07). | `event_templates` |
| 3 | Configurador «Cómo queréis que sea vuestro evento» | 10 bloques plegables; guarda en `event_decisions` (jsonb, recuperable entre dispositivos). Pareja, Invitados, Momentos especiales, Comida, Música, Fotos, Decoración **generan y retiran** tareas, partidas, proveedores y momentos del plan del día. | PARCIAL («motor a medias») | Fecha/lugar/servicios del lugar **no** generan ni ocultan secciones. Cambiar servicios solo reconcilia Comida (B-01). Sin realtime en los bloques (B-09). | Tareas, presupuesto, plan del día, Calendario |
| 4 | Fechas, lugares, ceremonia, celebración | Fecha con 3 estados; Momentos (varios lugares y fechas) solo en comunión/bautizo/boda con módulo ceremonia; cumpleaños/celebración: 1 fecha y 1 lugar. Fecha operativa → Calendario. | PARCIAL | Calendario recibe una sola entrada (sin horas ni lugares de momentos, B-05); cambiar la fecha no mueve plazo RSVP ni tareas nacidas de decisiones (B-06); dos fuentes si se quita el módulo ceremonia (B-07). | Calendario, invitación/RSVP, tareas |
| 5 | Invitados y asistentes | Unidades (persona/familia) con adultos/niños, desglose opcional por persona, mesas, estadísticas reales, vínculo opcional con Gestión de grupos. | FUNCIONAL | Sin vínculo con Contactos ni miembros de la familia, sin teléfono/correo (C-07). Importar de grupo marca a todos como niños (C-11). Cabecera por contadores vs desglose pueden divergir (C-17). | Menú (comensales), Mesas, Grupos |
| 6a | Invitaciones (diseño y envío) | Diseñador por capas (~60 plantillas), PNG + texto + enlace por hoja de compartir del sistema, aviso de «información anterior». | FUNCIONAL para diseñar y compartir | Sin envío directo ni registro de «a quién se mandó» (C-06). Enlace con dominio de GitHub Pages, no `pepafamilyapp.es` (C-05). Sin «pellizcar» (decisión de la persona responsable). | RSVP (token) |
| 6b | RSVP público | Función `event-rsvp`: token por invitado y enlace abierto, estados, adultos/niños, nota, menú, preguntas, necesidades; límite de tasa; no expone presupuesto ni notas. | FUNCIONAL | **El POST ignora evento archivado y plazo** (C-03). `rsvp_token_active` sin uso (C-04). Sin aviso al organizador cuando alguien responde (C-01). Enlace abierto sin deduplicar (C-13). | Estadísticas, Menú |
| 7 | Presupuesto general | Partidas (importe opcional), 4 cifras (Planificado/Comprometido/Pagado/Gastado), agrupar, desglose, historial. | PARCIAL | Cifras del evento y de partida no cuadran (D-01); 0/5 pagos enlazados a partida y no hay forma de enlazarlos después (D-02); partidas sin importe cuentan 0 (D-04); aviso de exceso solo con Economía (D-03). | Pagos, encargos, Economía (solo por etiqueta) |
| 8 | Proveedores y fichas | Agenda familiar global + copia por evento; ficha, valoración, adjunto, importar ficha con IA, histórico de ofertas, `.vcf`. | PARCIAL (agenda funcional) | Dos fuentes de verdad sin sincronizar (D-08); sin estados de contratación (D-09); sin conexión con Contactos/Economía (D-10); sin UI para editar/borrar la copia (D-12). | Pagos, ofertas, partidas |
| 9 | Presupuestos y comparador | Ofertas con servicios, descuento/impuestos informativos, adjunto, revisión, «Seleccionar», importación con IA; «Resolver encargo» crea pago. | PARCIAL (registro) / comparador **NO IMPLEMENTADO** | Es una lista de tarjetas: sin alinear partidas equivalentes, sin total neto, sin ranking, sin valoración por concepto (D-22). Nº de presupuesto no estructurado (D-23). | Encargos, pagos |
| 10 | Música y entretenimiento | Bloque «Música y fiesta» (solo bodas): decisión → tarea + partida. Reconoce «el lugar incluye música». | PARCIAL | Solo bodas; partes de la música sin consumidor (E-09); sin selector de proveedor (E-06). | Tareas, presupuesto |
| 11 | Decoración y materiales | Bloque «Otros y decoración» (solo bodas) + módulo Decoración (nombre + estado + «→ Compras»). | PARCIAL / casi registro | `price_estimate` en BD sin UI (E-10); la marca «en Compras» no refleja el estado real (E-11); sin proveedor, responsable ni foto. | Compras (1 vía) |
| 12 | Menús, comida, bebida y Cocina | Menú por secciones, importación con IA (v5 activa), necesidades alimentarias con cruce plato↔necesidad, alternativas por persona, receta de Cocina por plato, compra con ingredientes escalados. | FUNCIONAL (la más completa) | No usa el menú semanal de Cocina (E-03); solo 1/30 platos con receta; opciones elegidas por invitados solo se cuentan, no se enlazan a platos ni a la compra (E-02); «Escalado a 0 comensales» (E-01). | Cocina (recetas), Compras, RSVP |
| 13 | Preparativos / tareas | Prioridad, sugerencias, responsables múltiples y externos, encargos, avisos, enlace a Calendario, deep link. | FUNCIONAL (la más completa) | **Desconectado de la sección Tareas global** (E-12); estado «hecho» no sincroniza con Calendario (E-13); la hora no llega a Calendario (E-14); cambiar fecha pisa fechas manuales (E-15). | Calendario (parcial) |
| 14 | Plan / cronograma del día | Lista editable, orden, hora opcional, elementos generados desde Comida. | FUNCIONAL como lista | «Mostrar al compartir» **sin consumidor** (E-22); sin fecha, sin Calendario. | Comida y bebida |
| 15 | Documentos, fotos y adjuntos | Adjuntos en menú, ofertas, pagos y proveedor (buckets privados, URL firmadas). | PARCIAL | No hay adjuntos en tareas/plan/decoración (E-26); nada se muestra en Documentos; fotos de invitación huérfanas (F-D2). «Fotos y recuerdos» es planificación de cobertura, no álbum (E-07). | — |
| 16 | Participantes, organizadores, permisos | Todo miembro con la sección «eventos» ve y edita todo. | NO IMPLEMENTADO como modelo por evento | Sin organizador/participante/solo lectura (C-09). RPC de token sin comprobar la sección (C-10, a confirmar). | Familia |
| 17 | Integración con Calendario | Una entrada por evento confirmado, plazo RSVP con recordatorio, tareas opcionales. | PARCIAL | Entrada del día sin recordatorios (12/12, F-I1); **borrar un evento deja huérfanas las entradas** (F-D1/E-27); 1 evento confirmado sin entrada (pendiente de investigar). | Calendario |
| 18 | Integración con Gestión de grupos | `group_event_links` + importar participantes como invitados. | FUNCIONAL (sin uso real: 0 invitados de grupo) | Adultos/niños no distinguidos (C-11); botes sin relación con el presupuesto (riesgo de duplicidad). | Grupos |
| 19 | Integración con Mis listas | Las listas se vinculan al evento del **Calendario**, no al módulo Eventos. | DESCONECTADO | Sin vínculo de listas con Eventos ni proveedores. | — |
| 20 | Ayuda y recorridos | Visita + 3 series de tutoriales. | PARCIAL | 8 módulos sin tutorial (Pagos, Decoración, Actividades, Mesas, Ceremonia, Proveedores, Detalles, Regalos); texto obsoleto «futura sección de comida» (`EventosScreen.tsx:8368`); ficha `eve-presupuesto` dice que se «ligan a Economía» (A-04). | Ayuda |
| 21 | Otras funciones existentes | Actividades, Mesas, Detalles/recuerdos, Regalos recibidos, Personas especiales/roles, Conclusiones PEPA, banner «hoy es el día», archivar con resumen y coste neto, «Organízamelo Pepa» (reglas fijas, sin IA), PEPA IA **no** crea/consulta eventos del módulo (F-I2). | FUNCIONAL / PARCIAL | Modo día del evento parcial; sin fechas candidatas; sin tipo de ceremonia propio. | — |

---

## B. Mapa de conexiones

**Comprobadas (se leyó el código del consumidor, o hay test/consulta):**
- Respuesta RSVP → `event_guests` → cabecera de Invitados, resumen del evento, alertas (realtime en la publicación).
- RSVP: elección de menú por persona → recuento de Comida y bebida; necesidades declaradas → revisión de la familia → aviso plato↔necesidad (0 filas reales todavía).
- Servicios del lugar **comida/bebidas/tarta** → preguntas, tareas, partidas, proveedor y plan del día de Comida (y reconciliación al cambiar).
- Decisiones de Pareja, Invitados, Momentos especiales, Comida, Música, Fotos, Decoración → tareas, partidas, proveedores (`executeReconcileActions`, solo retira lo que nadie ha tocado).
- Fecha del evento / momentos → fecha operativa → Calendario → cuenta atrás → invitación/RSVP.
- Pagos → Comprometido/Pagado del evento y avisos de vencimiento / «próximo hito».
- Menú → receta de Cocina (enlace y deep link leídos en ambos lados) → Compras (RPC `add_menu_shopping_lines`, idempotente; sin uso real).
- Decisión «Enviar a Decoración» → módulo Decoración; Decoración «→ Compras».
- Grupos ↔ Eventos (`group_event_links`, importar participantes).

**Parciales:**
- «El lugar incluye» música/decoración: solo cambia la pregunta mostrada, y solo en bodas (B-02, B-10). Presupuesto y Preparativos no leen los servicios del lugar directamente (B-03).
- Tareas ↔ Calendario: una vía, sin «hecho», sin hora, y las fechas auto no sincronizan (E-13 a E-17).
- Presupuesto ↔ Economía: solo por etiqueta (`tag_id`) en lectura; los pagos no crean gasto.
- Proveedores ↔ Contactos: solo `.vcf`.
- Notificaciones: solo vía `calendar_event_reminders` (plazo RSVP sí; día del evento no; pagos sin uso).
- Eventos ↔ Calendario al borrar: ninguna limpieza.

**Inexistentes:**
- RSVP → notificación al organizador. Invitados confirmados → presupuesto/coste por persona. Invitado ↔ Contactos / miembros de la familia. Envío directo y registro de «enviada». Caducidad y bloqueo individual de enlaces. Estados de contratación del proveedor. Oferta aceptada → partida/estado de las demás ofertas. Editar un pago. Opciones de menú elegidas → platos/compra. Menú del evento ↔ menú semanal de Cocina. Preparativos ↔ Tareas globales/notificaciones de tarea. PEPA (IA) ↔ módulo Eventos. Mis listas ↔ Eventos. Documentos ↔ Eventos. Organizadores/permisos por evento.

**Datos duplicados / dependencias rotas:**
- Proveedor: `providers_global` y copia `event_providers` (pagos, ofertas, partidas apuntan a la copia; ediciones y archivado globales no llegan a ella).
- «Hecho» de una tarea: `event_tasks.done` y `calendar_event_completions`.
- Dinero: pagos de Eventos, gastos de Economía y botes de Grupos son tres registros sin enlace (riesgo de duplicidad).
- Momentos reales vs campos antiguos de ceremonia/celebración (dos fuentes si se quita el módulo ceremonia).
- Etiqueta de Economía: `duplicateEvent` + `findOrCreateEventTag` pueden compartir `tag_id` dentro del mismo año (A-06).
- Escrituras sin lectura: `event_decision_providers` (0 filas), `providerCategory`, `category_id`, `price_estimate`, `rsvp_token_active`, `show_on_share`, `transferred_to_shopping` (sin vuelta atrás).

**Oportunidades de reutilización de información (sin crear listas paralelas):** servicios del lugar → Música/Decoración/Presupuesto/Plan; confirmados RSVP → presupuesto de catering y compra; fecha → recordatorio del día y plazo RSVP; elección de menú → platos/compra; proveedor contratado → partida + pago + estado; recetas de Cocina ya enlazables a más platos.

---

## C. Funcionalidades sin utilidad práctica suficiente

Las conservo como **candidatos**: la decisión de mantener/mejorar/integrar/replantear es de la persona responsable. No se propone convertir listas en sistemas complejos.

| Apartado | Utilidad ahora | Lo que parece pretender | Conexiones que faltan | Recomendación (no aprobada) |
|---|---|---|---|---|
| Módulo Decoración | Nombre + estado + «→ Compras» (`price_estimate` en BD sin UI) | Ideas, materiales, compras, encargos, presupuesto (según comentarios) | Proveedor, partida, tarea, foto, «lugar incluye decoración» | **Mejorar poco**: enlazar a Presupuesto y proveedor; el resto opcional |
| Música: «partes con música» y animación | Checklist informativo | Planificar el programa musical | Plan del día, proveedor | Mantener; conectar proveedor y plan del día |
| «Fotos y recuerdos» | Decisión sobre quién hace las fotos | Recuerdos/álbum del evento | Álbum (decisión original: **no** álbum compartido de cumpleaños) | **Replantear el nombre**: es «Cobertura de foto/vídeo» |
| Plan del día | Cronograma editable | Plan compartible con invitados | «Mostrar al compartir» sin consumidor; fecha; Calendario | Quitar la promesa o implementar compartir (decidir) |
| Valoración ⭐ del proveedor | Solo se ve en el registro global | Elegir entre proveedores | Mostrarla al comparar ofertas | Integrar cuando se haga el comparador |
| `link.status` interesado/descartado | Filtra la lista | Estados de contratación | Contactado→presupuestado→contratado | Mejorar (estado derivado de pagos/ofertas) |
| `ProviderLinker` (decisión↔proveedor) | Escribe, nadie lee (0 filas) | Proveedor de cada decisión | Lectura en proveedor/partida | Integrar con la partida o retirar |
| Fianza | Dato informativo | Control de fianzas | Totales, aviso «sin devolver» | Mejorar ligeramente |
| Desglose de conceptos de partida | Lista informativa (0 filas) | Detallar presupuesto | Suma/reconciliación con el importe | Mantener o replantear |
| Condiciones/alcance/descuento/IVA de oferta | Texto libre / solo se muestran | Comparar ofertas | Campos estructurados | Integrar en el futuro comparador |
| Opciones de menú de invitados | Recuento | Menú por comensal y catering | Enlace a platos y a la compra | Mejorar |
| Decoración «→ Compras» (marca) | Booleano sin vínculo real | Seguimiento de compra | `shopping_items` real | Mejorar |
| Sección «Detalles/recuerdos» y «Regalos recibidos» | Registros con totales (coste neto útil) | — | Sin tutorial | Mantener |

**Con utilidad real adicional (no son solo listas):** Menú (importación, avisos, compra), Preparativos, Momentos→Calendario, Decisiones→tarea+partida, Pagos→avisos, Resolver encargo→pago.

---

## D. Problemas detectados

### CRÍTICOS (criterio: impiden usar bien una función o comprometen datos)
No hay hallazgos críticos de **seguridad**. Hay **un candidato crítico funcional** (los revisores discreparon: E lo marcó crítico, F importante):

- **CR-1 · Borrar un evento deja entradas fantasma en el Calendario de la familia.** `deleteEvent` solo borra la fila `events` y su cascada de BD (`events.ts:449-462`). Las entradas del Calendario (fecha, plazo RSVP, recordatorios de pago, tareas enlazadas) no dependen del evento (las FK van de `events` hacia `calendar_events`, con `SET NULL`, no al revés) y **siguen visibles, con recordatorios activos y sincronizadas con Google**. Tampoco se borran los archivos de Storage. La cascada además borra pagos y presupuesto de golpe; no se verificó si la interfaz pide una confirmación específica cuando hay pagos (F-D4). Certeza: CÓDIGO + PRUEBA (FK y 0 triggers en `events`); el volumen real de huérfanos es PENDIENTE de medir.

### IMPORTANTES (agrupados por área; certeza entre paréntesis)

**Configurador y propagación**
- B-01 Al cambiar «qué incluye el lugar» solo se reconcilia Comida; lo ya generado por Música/Decoración queda obsoleto (CÓDIGO).
- B-02/B-03 Servicios personal, mobiliario, barra libre y alojamiento se guardan sin consumidor; Presupuesto/Preparativos/Plan no leen los servicios; «Organízamelo» usa un vocabulario antiguo reducido (CÓDIGO).
- B-04/B-10/E-08 Varios lugares/fechas solo en comunión/bautizo/boda; Música, Fotos y Decoración del configurador solo en bodas (CÓDIGO; verificado).
- B-05/B-06/E-24 Calendario recibe una sola entrada; cambiar la fecha no mueve el plazo RSVP ni las tareas nacidas de decisiones (CÓDIGO).
- B-07 Quitar el módulo ceremonia: configurador y RSVP leen fuentes distintas (CÓDIGO).
- B-08 Duplicar/plantilla no copian decisiones ni momentos y no se avisa (CÓDIGO).
- B-09/C-02/F-C3 Sin realtime en bloques del configurador, preguntas, respuestas, necesidades, ofertas, regalos, plan del día, invitación; varias tablas en realtime sin suscriptor (PRUEBA+CÓDIGO).

**Invitados y RSVP**
- C-01 Sin aviso al organizador cuando alguien responde (PRUEBA: 0 triggers).
- C-03/F-R1 El POST del RSVP acepta respuestas con evento archivado o fuera de plazo (CÓDIGO, releído).
- C-04 `rsvp_token_active` sin uso; sin caducidad ni bloqueo individual (CÓDIGO).
- C-05 Enlaces con `window.location.origin + BASE_URL` (GitHub Pages) y, en la app nativa, posible `https://localhost/` inservible (CÓDIGO; nativo PENDIENTE).
- C-06 Sin registro de a quién se envió la invitación (CÓDIGO).
- C-07/C-11 Invitados sin vínculo con Contactos/familia ni teléfono/correo; importar de grupo marca a todos como niños (CÓDIGO).
- C-08 Presupuesto/catering no usa los confirmados (CÓDIGO).
- C-09/C-10 Sin roles por evento; RPC de token solo comprueban la familia (CÓDIGO; C-10 a confirmar).

**Presupuesto, pagos, proveedores y ofertas**
- D-01 «Comprometido» del evento = Σ total de pagos; ignora el manual y no cuadra con las partidas (CÓDIGO).
- D-02 Sin UI para enlazar un pago existente a una partida; 0/5 enlazados (PRUEBA).
- D-03/D-04 Aviso de exceso solo con gasto de Economía; partidas sin importe suman 0 sin aviso en el total (6/24, PRUEBA).
- D-08/D-12 Dos fuentes de verdad del proveedor; la copia de evento no se puede editar, archivar ni borrar desde la UI (CÓDIGO).
- D-09/D-10/D-11 Sin estados de contratación; sin conexión con Contactos/Economía; `ProviderLinker` sin lector (CÓDIGO+PRUEBA).
- D-15 Un pago no se puede editar tras crearlo (CÓDIGO). D-16 Re-resolver un encargo con precio puede duplicar el pago (CÓDIGO; sin reproducir). D-17 Borrar un pago deja huérfano el recordatorio y el adjunto (CÓDIGO). D-18 «Corregir lo pagado»/«Marcar pagado» descuadran el diario de abonos (CÓDIGO).
- D-22 a D-25 No hay comparador real; nº de presupuesto no estructurado; descuento/IVA informativos (cifras no homogéneas); la oferta ganadora no queda marcada (CÓDIGO).
- F-I3 Pagos de Eventos, Economía y botes son tres libros sin enlace (CÓDIGO).

**Menú, tareas y calendario**
- E-01 «Escalado a 0 comensales confirmados» (texto engañoso); compra infradimensionada con pocos confirmados (CÓDIGO).
- E-02/E-03 Opciones de menú elegidas sin efecto; sin uso del menú semanal de Cocina (CÓDIGO).
- E-12 Preparativos desconectados de Tareas globales y notificaciones de tarea (CÓDIGO, ambos lados).
- E-13 «Hecho» duplicado sin sincronizar entre tarea y Calendario (CÓDIGO; efecto en recordatorios PENDIENTE).
- E-14/E-15/E-17 La hora no llega a Calendario; `recalculateAutoTasks` pisa fechas manuales, incluye tareas hechas y no sincroniza el Calendario ni sus avisos; entrada de tarea sin zona horaria (CÓDIGO).
- E-16 Calendario → tarea sin vuelta; un evento borrado a mano en Calendario se recrea al siguiente guardado (CÓDIGO).
- E-18 36/105 tareas sin fecha y 7 vencidas abiertas (PRUEBA).
- E-22 «Mostrar al compartir» del plan del día sin consumidor (CÓDIGO; ya admitido en el tutorial).
- F-I1 Entrada del día del evento sin recordatorios (PRUEBA: 12/12).
- F-I2 PEPA IA no crea ni consulta eventos del módulo Eventos (CÓDIGO).

**Datos y seguridad (defensa en profundidad)**
- F-S1 Muchas tablas hijas no comprueban que `event_id` sea de la misma familia; con el UUID de otro evento se podrían inyectar preguntas/opciones en su página pública (PRUEBA+CÓDIGO; riesgo bajo).
- F-C1 Sin bloqueo optimista: 8/48 tablas con `updated_at`, nunca comparado; gana la última escritura (PRUEBA+CÓDIGO).
- F-D2 21 fotos de invitación en `event-photos`, 0 referenciadas, nunca se borran (PRUEBA).
- F-Q1 Sin pruebas RLS ni de `event-rsvp` contra BD real; pruebas estáticas (CÓDIGO).
- A-04/A-05/A-06 Ficha de Ayuda que dice «se ligan a Economía»; inventario «probada» con QA manual 0/510; etiqueta de Economía compartida al duplicar en el mismo año (CÓDIGO).
- A-01/A-02/A-03/A-07 Previstas y no implementadas: edad obligatoria, modo sorpresa, recomendación por descripción, tipos de lugar completos (CÓDIGO).

### MENORES (resumen)
B-11 sin índice único (event_id, question_key) (0 duplicados hoy) · B-12 sin «limpiar respuesta» · B-13/B-14/B-15 · C-12 la edge ignora errores al guardar personas/preguntas y responde ok · C-14 abrir el modal de invitación ya crea un token · C-15/C-16/C-17/C-18 · D-05…D-07, D-13, D-14, D-19…D-21, D-26, D-27, D-29 (tres tipos `CompareMode`) · E-04…E-07, E-09…E-11, E-19…E-21, E-23, E-25 · F-D3, F-D4, F-C2, F-S2/S3 (CORS abierto, token de familia compartido por 3 webhooks), F-R2, F-M1 (buckets sin límite de tamaño/MIME en servidor), F-M2 (comentario obsoleto `events.ts:869`; ~10 funciones muertas: `updateEventBudgetItemConcept`, `deleteEventProvider`, etc.) · A-08 texto «futura sección de comida» · A-09 marca PEPA pública sin «Organizado con PEPA» · A-12 licencias de ~60 ilustraciones sin verificar.

---

## E. Reutilización de componentes y motores de PEPA

- **Motor de decisiones→tareas/partidas** (`reconcilePairGeneration` + `executeReconcileActions`, con reglas de «no tocado»): base para extender servicios del lugar a Música/Decoración/Presupuesto.
- **`eventVenueServices.ts`** (`venueIncludesService`, `resolveVenueCase`): ya es la fuente única de «incluido»; falta conectarla.
- **`eventBudgetTracking.ts`** (comprometido/pagado por partida, «no sumar nulos como 0») y `computeEventStatusSummary`.
- **Ofertas:** `OfferItemsPanel`/`DraftItemForm` (servicio con cantidad, unidad, precio, subtotal, paquete, seleccionado), `event_task_group_offer_items`, `analyzeOfferBudgetDocument` (importación con IA), `findProviderGlobalMatch`.
- **Comparativa de Mis listas** (`user_lists.kind='comparativa'`, `list_columns`, `list_items`): reutilizable su *mecánica* (`relocateBlock`, estructura de dos niveles, `normalizeForCompare`/`isObviousDuplicate` para emparejar nombres, importar/dictar/foto con revisión, arrastre táctil, deshacer, realtime). **Limitaciones técnicas:** los elementos son solo texto (sin importe, cantidad ni valoración); no existe una fila compartida entre columnas ni clave de alineación; máximo 5 columnas con scroll horizontal en móvil; sin vínculo con Eventos; `rich` solo negrita/color (restricción en BD); diseñada «sin puntuaciones ni cálculos».
- **Cálculo y equivalencias:** `priceComparison.ts`, `comparisonModes.ts`, `compareShared.ts` (equivalencia idéntico/equivalente, precio por unidad, totales por tienda, antigüedad de precio), acoplados hoy a `Product`/`ProductPrice` de Compras; se pueden generalizar con adaptadores.
- **Calendario:** `eventCalendarSync.ts` (`planCalendarSync`, idempotente) y `calendar_event_reminders`/`send-due-reminders` para recordatorio del día y avisos.
- **Realtime:** `useRealtimeRefresh` (debounce, recarga al volver) ya usado; ampliar a las tablas que faltan.
- **RSVP/tasa/tokens:** `rsvp_rate_limit_hit`, patrón de `group-form-public` (`pepafamilyapp.es/f/`) para enlaces con dominio oficial.
- **Cocina/Compras:** `recipe_id` + deep link, `add_menu_shopping_lines` (idempotente), `shopping_items.event_id`.
- **Gestión de grupos:** `GroupGuestsSheet`/`groupGuests.ts`, `group_event_links`; **Contactos:** `.vcf` (hoy) y el módulo de contactos/participantes con identidad compartida (`person_id`, migración 0358) como posible fuente futura para invitados (no aprobado).
- **Ayuda:** estructura de series/capítulos y `planned/d.ts` para los 8 tutoriales pendientes.

---

## F. Diferencias con el diseño original (`pepa-events-skill`)

El skill no está enlazado al registro de requisitos y su checklist 09 (~110 casillas) **nunca se repasó formalmente**. Lo previsto que **no existe o difiere**:
1. Edad del cumpleañero **obligatoria**: hoy opcional y no se pide al crear.
2. **Modo sorpresa** y avisos anti-spoiler: solo el subtipo de texto «Fiesta sorpresa».
3. «**Describe el evento y PEPA recomienda módulos**»: no existe.
4. **Fechas candidatas**: no existen.
5. Tipos de lugar: 3 (casa propia / restaurante-local / otro); falta centro de juegos, exterior, etc.
6. **Modo día del evento**: solo banner (faltan tareas de última hora).
7. **Pellizcar/rotar con dos dedos**: sustituido por un asa (decisión posterior, «sin pinch»).
8. Marca en el RSVP: sin «Organizado con PEPA» ni enlace inteligente a tiendas.
9. Tipo de ceremonia civil/religiosa/simbólica como campo propio; padrinos y testigos como roles de «Personas especiales».
10. «Recomendar ocultar módulos redundantes si el lugar presta servicios»: no se aplica de forma general.
11. Propuesta automática de menú por adultos/niños/presupuesto: no existe (sí raciones y comensales).
12. Compra → gasto de Economía: no hay (solo etiqueta).
13. Materiales de actividades → Compras: no verificado.
14. Plantillas de invitación «hitos 18/30/40…» y «humor/sorpresa»: no identificadas.

**Decisiones cambiadas o añadidas posteriormente:** el evento confirmado se sincroniza solo con Calendario (sin pedir confirmación); módulo renombrado «Invitación»; «Menú + compra» sustituido por el hub «Menú del evento»; presupuesto a 4 cifras; etiqueta de Economía con año; **configurador, encargos/ofertas, registro global de proveedores, personas especiales, plantillas personales y la importación de menú con IA no estaban en la especificación**. La auditoría del 26/09 (`AUDITORIA_EVENTOS_PRESUPUESTO_COMPRAS.md`) está muy obsoleta (de 4.454 a 17.068 líneas): resueltos proveedor en pagos, Comprometido/Pagado, fianza y menú; **sigue vigente** la colisión de etiqueta al duplicar.

---

## G. Propuesta de bloques de revisión (propuesta, **no aprobada**)

Ordenados por dependencias técnicas y funcionales.

| Bloque | Contenido | Depende de |
|---|---|---|
| **1 · Integridad y limpieza** | Limpieza al borrar/archivar un evento (Calendario, recordatorios, Storage) y confirmación con pagos; POST de RSVP respeta archivado/plazo/`rsvp_token_active`; `recalculateAutoTasks` por el flujo normal (respeta hechas/manuales y sincroniza Calendario); comprobación de `event_id` en las políticas hijas; índice único de decisiones; fotos huérfanas; comentario obsoleto; pruebas RLS/edge reales | — |
| **2 · Configurador como motor** | Servicios del lugar → Música, Decoración, Presupuesto, Preparativos, Plan; reconciliar Música/Decoración al cambiar; decidir si Música/Fotos/Decoración se extienden a otros tipos; una sola fuente para ceremonia/celebración; copia (o aviso) al duplicar/plantilla | 1 |
| **3 · Proveedores unificados** | Fuente única (ficha global + vínculo), editar/archivar propaga, estado de contratación derivado, `ProviderLinker` con lector, enlace con Contactos (decisión) | 1 |
| **4 · Presupuesto y pagos coherentes** | Cifras que cuadran; enlazar/reenlazar pago↔partida; editar pago; abonos coherentes; aviso por comprometido; partidas sin importe visibles; relación con Economía/botes sin duplicar (decisión de producto) | 3 |
| **5 · Comparador de presupuestos** | Modelo de «concepto equivalente», impuestos estructurados, nº de presupuesto, valoraciones por concepto; reutiliza lo listado en E. **No** hay que empezar antes del bloque 3 | 3, 4 |
| **6 · Invitados y RSVP** | Aviso al organizador, estado de envío, dominio oficial (`pepafamilyapp.es`), vínculo opcional con Contactos/Grupos (teléfono/correo), deduplicado del enlace abierto, coste por persona confirmada | 1 |
| **7 · Calendario y tareas** | Recordatorio del día del evento; «hecho» sincronizado; hora de tarea; entradas por momento; decidir relación con Tareas globales | 1, 2 |
| **8 · Menú, Cocina, Compras** | Mensaje/escala con 0 confirmados y nº de comensales elegible; opciones de menú elegidas → platos/compra; uso del menú semanal (decisión) | 6 |
| **9 · Roles, concurrencia y realtime** | Organizador/solo lectura (decisión), RPC de token con sección, aviso de edición concurrente, realtime en las tablas que faltan | 1 |
| **10 · Ayuda y QA** | QA manual iPhone/Android (0/510), 8 tutoriales pendientes, textos obsoletos, ficha de Economía, enlazar el skill al registro de requisitos, checklist 09 | Tras cada bloque |
| **11 · Replantear apartados de bajo valor** | Decoración, «Fotos y recuerdos», plan «al compartir», fianza/desglose | 2, 4 |

Decisiones de producto que nadie ha tomado y condicionan bloques: relación con Economía/botes (duplicidad), modelo de roles por evento, alcance de Música/Fotos/Decoración fuera de bodas, si se mantiene «compartir plan del día», modo sorpresa y edad obligatoria, y EVT-004 (plegado de grupos de preguntas).

---

## H. Evidencias técnicas de los hallazgos principales

| Hallazgo | Archivo / componente | Función / servicio | Tabla / relación | Evidencia | Certeza |
|---|---|---|---|---|---|
| CR-1 borrar evento | `src/data/events.ts:449-462`; botón en `EventosScreen.tsx` (~2375) | `deleteEvent` | `events` → hijos `CASCADE`; `calendar_events` solo `SET NULL` desde `events` | Solo `delete().eq('id')` + limpieza de etiqueta; 0 triggers sobre `events` | CÓDIGO (releído) + PRUEBA (FK/triggers); efecto real PENDIENTE |
| C-03 RSVP tras archivar/plazo | `supabase/functions/event-rsvp/index.ts:336-501` | Rama POST | `events.status`, `rsvp_deadline` | `archivado` solo se comprueba en GET (líneas 362 y 503) | CÓDIGO (releído) |
| C-04 `rsvp_token_active` | `data/events.ts:1074` | `mapGuest` | `event_guests.rsvp_token_active` (27 `true`) | Ninguna consulta lo filtra | CÓDIGO |
| C-01 sin aviso | — | — | `event_guests` | 0 triggers; sin push por RSVP | PRUEBA |
| B-10 / E-08 solo bodas | `EventosScreen.tsx:6325, 6344, 6363, 6101-6121` | `MusicaFiestaBlock`, `FotosRecuerdosBlock`, `OtrosDecoracionBlock` | `event_decisions` (solo 2 filas de estos bloques en toda la BD) | `event.type === 'boda' &&` | CÓDIGO (releído) + PRUEBA |
| B-01 / B-02 servicios del lugar | `domain/eventVenueServices.ts`; `data/events.ts:2965-2985` | `venueIncludesService`, `reconcileFoodForVenueChange` | decisión `lugar.servicios_incluidos` | Solo `eventFood`, 2 bloques de boda y el resumen la consumen | CÓDIGO |
| E-15 recálculo | `data/events.ts:419-428` | `recalculateAutoTasks` | `event_tasks` | `update({due_date}).eq('source','auto').eq('title', …)`; no pasa por `updateEventTask` | CÓDIGO (releído) |
| E-13 «hecho» | `data/events.ts` (`updateEventTask`), `CalendarScreen` | — | `event_tasks.done` vs `calendar_event_completions` | Sin escritura cruzada | CÓDIGO |
| F-I1 día sin recordatorio | `data/events.ts:824-848` | `linkEventToCalendar` | `calendar_event_reminders` | 12/12 entradas sin recordatorio | PRUEBA |
| D-02 pago↔partida | `data/events.ts` (`updateEventPayment` acepta `budgetItemId`), `PaymentsSection` ~14707 | `updateEventPayment` | `event_payments.budget_item_id` | 0/5 enlazados; ningún componente lo llama | PRUEBA+CÓDIGO |
| D-01 comprometido | `EventosScreen.tsx:13109-13117`; `domain/eventBudgetTracking.ts` | — | `event_payments`, `event_budget_items.committed_amount` | Σ total de pagos vs manual por partida | CÓDIGO |
| D-08 proveedor doble | `src/data/providersGlobal.ts:203`; `data/events.ts:1738` | `linkProviderGlobalToEvent`; `updateEventProvider`/`deleteEventProvider` sin llamador | `providers_global`, `event_providers`, `event_provider_links` | Edición global no propaga; sin UI en la copia | CÓDIGO |
| D-22 comparador | `EventosScreen.tsx:4174` (`OffersComparison`), 5242-5327 (`OfferItemsPanel`) | — | `event_task_group_offers(_items)` | Lista de tarjetas; sin alineación ni total neto | CÓDIGO |
| D-28 Comparativa de listas | `src/domain/lists.ts` (cabecera línea 4), `src/data/lists.ts` | — | `user_lists`, `list_columns`, `list_items` | «Sin puntuaciones ni cálculos»; 2 comparativas con 3 elementos | CÓDIGO + PRUEBA |
| E-22 compartir plan | `src/ui/EventDayPlan.tsx:320-326` | — | `event_day_plan_items.show_on_share` | Sin lector fuera de la sección | CÓDIGO |
| E-12 Tareas globales | — | `loadAllEventAlerts` (solo Home) | `event_tasks` | Ni Tareas ni Notificaciones leen `event_tasks` | CÓDIGO (ambos lados) |
| F-S1 `event_id` en RLS | migraciones 0106+ | políticas `family crud` | ~12 tablas hijas | `WITH CHECK` solo con `family_id` | PRUEBA+CÓDIGO |
| F-C1 concurrencia | — | `.eq('updated_at', …)` inexistente | 8/48 tablas con `updated_at` | Gana la última escritura | PRUEBA+CÓDIGO |
| F-D2 fotos | `data/events.ts:3323` | `uploadInvitationPhoto` | bucket `event-photos` (21 objetos, 0 referenciados) | Sin `remove` en el bucket | PRUEBA |
| A-04 ficha de Ayuda | `src/help/catalog/cardsOtros.ts` (`eve-presupuesto`) | — | `events.tag_id` ↔ `expenses.tag_id` | Pagos y compras no escriben en `expenses` | CÓDIGO |
| RLS/seguridad base | `pg_policies`, advisors | `family_id = current_family_id() AND has_section_access('eventos')` | 48 tablas | RLS activa en todas; buckets privados; tokens de 192 bits no expuestos a anon | PRUEBA |

### Qué NO se pudo comprobar
- Todo el comportamiento en iPhone y Android (modales, selectores, scroll, arrastre táctil, plegables abiertos/cerrados).
- Que una recarga en vivo pise un formulario abierto; el aviso de Calendario tras completar una tarea; el desfase de día de `T00:00:00` sin zona; el comportamiento con Google Calendar conectado.
- Si la interfaz pide confirmación especial al borrar un evento con pagos; cuántos objetos de Storage y entradas de Calendario han quedado realmente huérfanos por borrados anteriores; el uso real de las funciones «avanzadas» (aún sin datos); las licencias de las ilustraciones de invitaciones; si un niño con cuenta puede crear eventos (RLS).
- Que `event-rsvp`, las RPC de token y el aislamiento entre familias funcionen contra una base real con casos negativos (no hay pruebas).

---

*Documento de auditoría; no modifica la aplicación. Nada de lo aquí propuesto está aprobado. Las decisiones y prioridades se establecerán tras revisar este informe.*
