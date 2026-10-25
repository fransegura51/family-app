# Reorganización de Ayuda y tutoriales «Enséñame» — resultado (25/10/2026)

Estado: **desarrollado y probado con pruebas automáticas; commit local, sin push ni despliegue.** Nada se ha probado en un iPhone, un Android ni un navegador real: lo que sigue pendiente de validación humana está en el apartado 8.

Documentos de partida: `docs/PROPUESTA_TUTORIALES_ENSENAME.md` y `docs/auditoria-tutoriales/`.

## 1. Cifras (catálogo original → final)

| | Original (auditoría) | Final |
|---|---|---|
| Tutoriales «Enséñame» sueltos | 109 (537 pasos) | **133 capítulos en 37 series** |
| Visitas «Conoce» | 20 (123 pasos) | 20 (corregidas) |
| Pasos de tutorial | 537 | 715 |
| Identificadores antiguos → alias | — | 18 (apuntan a un capítulo o, en 2 casos, a una visita) |
| Recorridos planificados (sin tutorial) | — | 17 |
| Explicaciones «Cómo funciona» | — | 57 |

Tiempos: capítulo más largo 115 s (límite 120 s); serie más larga 510 s (límite 540 s).

Series por módulo (series / capítulos): Calendario 3/18, Compras 4/18, Economía 5/18, Familia 2/7, Cocina 3/6, Pequeños Grandes 2/9, Eventos 3/10, Documentos 1/4, Galería 1/3, Contactos 2/5, Cumpleaños 1/2, Comunidad 2/6, Ubicación 1/5, Inicio 2/5, Hablar con PEPA 1/5, Ayuda 1/2, Configuración 1/4, Cuentas 1/3, Avisos 1/3.

## 2. Qué se creó y qué se reutilizó

- **Un solo motor**: los capítulos son `TourDef` normales; las series (`src/help/tours/series/*.ts`) solo los agrupan. Se reutilizaron los pasos, marcas `data-help-id`, textos y rutas existentes; los que se quedaron como capítulo **conservan su id**.
- Capítulos **nuevos** donde la auditoría detectó huecos (p. ej. Calendario: ubicación/adjuntos, guardar y consultar, cambiar serie, borrar; Compras: finalizar compra, asignar tienda, registrar compra, revisar ticket, pago y Economía, guardar ticket, historial y comparación; Economía: moverse, ver pagos previstos, previsión, filtros, informe; Eventos: panel, enviar invitación, compra del menú; Familia: peso y objetivo; Cocina: recetas de internet y usar una receta; Pequeños Grandes: aprobar y camino; etc.).
- Calendario: «Moverte por tu calendario», «Crear eventos y tareas» (el evento como ejemplo por defecto, con las diferencias reales de la tarea explicadas una sola vez) y «Gestionar eventos y tareas». Compras: Lista, Tiendas, Tickets y Compras registradas, Historial. Economía: moverte, apuntar, cuentas/bancos, pagos y conciliación, tus números.
- Regla de Compras verificada en código y explicada: **«Comprado» solo cambia el estado de la lista**; «Finalizar compra» solo limpia lo marcado de esa tienda; lo que registra compra, gasto y precios es guardar un ticket o una compra «Sin ticket».
- Alias: 18 ids antiguos → capítulo que los sustituye (`src/help/tours/aliases/*.ts`). `getTour`, el progreso guardado, las fichas, la búsqueda y los enlaces los resuelven.

## 3. Experiencia nueva

- «Enséñame» muestra tutoriales (series) con **Recorrido completo / Continuar / Repetir** y **Ver capítulos** (cada capítulo se puede empezar solo, con ✓ de hecho).
- Entre capítulos hay **parada explícita**: el panel final ofrece «Siguiente capítulo», «Terminar aquí» o «Repetir capítulo»; nunca se encadenan solos. «← Capítulo anterior» en el primer paso. Atrás, «Volver al principio» y salir en cualquier momento.
- Acceso al capítulo exacto desde: el catálogo, la búsqueda de «Enséñame», las sugerencias del buscador de Ayuda (🎓), las fichas («Enséñame: capítulo» + «Ver todo el tutorial»), «Conoce esta sección» (botón de tutoriales de la sección) y `/ayuda?serie=…` / `?capitulo=…` (admite ids antiguos).
- Capítulos que pueden terminar guardando datos reales lo avisan antes («se guarda de verdad…») y se pueden cerrar sin guardar. Ningún tutorial guarda, borra, envía, publica, paga ni completa tareas por la persona.

## 4. Incidencias técnicas corregidas

Motor y navegación:
- Ningún paso se omite en silencio mientras la pantalla carga: nueva espera de datos (`readyOn`, detección real de «Cargando…» —se corrigió además una regex rota que nunca la detectaba—) y mensaje «Cargando los datos…».
- Arranques en 2/3 y 3/4 (Crear tiendas, Compartir lista…): primer paso nunca opcional + `readyOn`/`needs`; prueba que lo exige.
- Datos que faltan: `needs` → se explica y se ofrece «Verlo solo leyendo».
- Control opcional o ausente: se omite sin dejar pasos sin marco; mensaje propio (`missingText`) en lugar del genérico; «Volver a mirar», «Saltar este paso», «Ver los pasos escritos».
- Atrás recupera el paso omitido cuyo control ya existe; Volver al principio; el contador «Paso k de n» no cuenta los omitidos; adelantarse con un guardado real salta bien.
- El control que desaparece al pulsarlo (6 s de gracia) ya no rompe el paso. No se degrada un ✓ ya conseguido. Quitado el mensaje engañoso de «otra versión».
- `onTourClosed` solo cierra si sigue siendo ese capítulo (el siguiente no se pisa).

Tarjeta y resaltado:
- Colocación calculada (`planPanel`): completa → compacta → píldora; nunca tapa el control, los controles auxiliares (`keepVisible`) ni hojas propias abiertas; se recoloca sola; **«↕ Mover»** a mano; selectores del sistema (cámara, fotos, archivos, fecha) con `native` → píldora y vuelve al elegir; `skipLabel` («Continuar sin foto»).
- Marcas reales: «Finalizar compra» (botón con `helpId`, ya no resalta «Mercadona»), selector de clase de producto, hoja «Añadir ticket» y chips Con/Sin ticket, «Compartir lista», etc.

Interfaz de Ayuda:
- Un único «¿Cómo funciona?» por explicación (con nombre cuando hay varias); botones «Enséñame» con el capítulo; contraste del texto de las sugerencias y botones principales (azul más oscuro local de Ayuda).
- 4 fichas públicas que revelaban estado interno reescritas; el índice de búsqueda ya no usa `limits` internos; `/sugerencias` y `/resenas` pertenecen al módulo Ayuda.
- Centro de Administración → Ayuda: tutoriales por series/capítulos y lista de **recorridos planificados** con lo que falta (los diagnósticos internos siguen solo para administración).

## 5. Correcciones de contenido (resumen)

Pepa (guardado directo o tarjeta, según el modo), Ubicación (sin afirmar seguimiento con la app cerrada en iPhone), Cumpleaños (avisos diarios a las 09:00), Eventos (sin «compartir el Plan del día»), Calendario (sin «Editar» ni «Al abrir» en el menú ☰; qué comparte 📤), Compras/Economía (estado de la lista frente a compras registradas; categorías sin «renombrar/ordenar»; terminología «Compras registradas / Registrar compra / Historial de compras» integrada tras fusionar `origin/master`), Familia, Cocina, Pequeños Grandes, Configuración, Cuentas y Avisos (ver informes por módulo en el historial del trabajo). «PEPA no recuerda tu corrección» vive solo en el nivel C; ningún texto afirma que la IA aprenda de correcciones.

## 6. Pruebas

- `tsc --noEmit`, `tsc -p tsconfig.sw.json`, `eslint` (archivos tocados) y `npm run build`: sin errores.
- Suite completa (`TZ=UTC vitest run --pool=threads`): **653 archivos y 12.653 pruebas, todas en verde** (en una pasada anterior fallaron 2 pruebas por carga que pasaban aisladas; se acotó la espera en los pilotos).
- Pruebas nuevas: `engineChapters.test.ts`, `tourRunnerChapters.test.tsx`, `series/seriesProgress.test.ts`, `seriesB/C/D.test.ts`, `destinationsEventos.test.tsx`; `series.test.ts` (estructura, alias, un tutorial en una sola serie, tiempos, primer paso no opcional, planificados). Actualizadas las pruebas de Ayuda afectadas (catálogo, áreas, sugerencias, pilotos reales, Calendario, Familia, renombrado de Compras).

## 7. Compatibilidad

- Ids antiguos → alias (18); progreso guardado por id antiguo cuenta en el capítulo nuevo (gana lo más avanzado); un ✓ conseguido no se pierde al repetir o salir.
- Enlaces internos, fichas con `tour:`, búsqueda, permisos (rol, secciones, Comunidad 18+, plataforma, administración) y móvil/escritorio se mantienen. No se tocó ningún dato de las familias ni claves guardadas.
- Dos alias (`tut-familia-actividad`, `tut-pequenos-monedero`) apuntan a una **visita** porque eran recorridos de solo mirar sin capítulo equivalente (la prueba lo admite).

## 8. Pendiente de validar a mano (iPhone y Android reales)

- Colocación de la tarjeta con teclado, `keepVisible`, píldora con selectores nativos (cámara/fotos/archivos/fecha) y «↕ Mover».
- Espera de datos y `needs` con listas reales lentas; Atrás/Volver al principio.
- Capítulos que terminan guardando (Calendario «Guardar», Familia peso, Compras tickets, Cuentas PIN/contraseña/correo).
- Textos de Pepa (modo tarjeta/directo), Ubicación en iPhone y Compras/Economía tras el renombrado.

## 9. Eventos: recorridos planificados (sin tutorial)

Todos los módulos de Eventos figuran en el mapa (Centro de Administración → Ayuda) y los 8 sin tutorial están **planificados** con su prerrequisito (`src/help/tours/planned/d.ts`): Pagos y fianzas, Decoración, Actividades y juegos, Mesas, Ceremonia, Proveedores y ofertas, Detalles/recuerdos y Regalos recibidos (bloqueados por funciones a medias o sin validar en iPhone). También planificados: efectivo/carteras y pagos mixtos/devoluciones (Economía/Compras), educación financiera de Pequeños Grandes, sesiones y invitar amigos (Cuentas), iPhone en Ubicación, ajustes y comentarios de Comunidad y otras acciones por voz de Pepa.

## 10. Errores de producto detectados (no corregidos, fuera de alcance)

- Cumpleaños: ⭐/✏️/✕ visibles para todos pero solo guarda la administración (y se emite el evento aunque no se guarde).
- Calendario: la nota no se comparte (`description` nunca se rellena); editar una tarea podría activar la sincronización con Google; «⭐ Al abrir» sigue en el menú ☰.
- Plan del día: la hoja «Añadir momento» dice «no saldrá en el plan que compartáis» y esa función no existe.
- Pepa: `PANEL_INFO.talk` dice que siempre pasa por tarjeta (falso con «sin tarjeta»); `ubicacion.intro` generaliza «solo con la app abierta» (solo web).
- Familia: cuentas de niño no ven reservas; «Secciones» solo se copia al crear la cuenta; `InviteCodeButton` enseña instrucciones antiguas; orden ⠿ visible sin permiso (no avisa).
- Economía/Compras: «+ Añadir cuenta» desde otra pestaña solo navega; «Ingresos» de Presupuestos no cuenta los apuntes a mano con banco conectado; borrar un movimiento del banco puede reaparecer; texto «Crea, renombra o ordena» en Categorías falso; desplegable Tienda del producto no ofrece tiendas sin productos; `purge-old-receipt-photos` no versionada.
- Configuración/Seguridad: resumen del tema Seguridad dice «y sesiones» (no existe); `BatteryGuideCard` sin excluir iOS; «De bebé a niño» no hace nada al pulsar la edad ya marcada; comentarios obsoletos en `pepaPreferences.ts` y `HomeCarouselSettings.tsx`.
- Cuentas/Avisos: varios botones se pueden pulsar sin ser administración y solo fallan al guardar.

## 11. Estimación revisada (antes 36–47 jornadas)

| Concepto | Jornadas |
|---|---|
| Programación nueva (motor, tarjeta, catálogo por series, búsqueda, acceso desde fichas) | 9–11 |
| Reorganización de contenido, automatizable con revisión (series, alias, textos, fichas, explicaciones) | 13–16 |
| Pruebas automáticas y regresiones | 5–6 |
| Validación humana en iPhone/Android y ajustes posteriores | 4–6 (no bloquea nada: se hace al publicar) |
| Dependencias externas (validar funciones de Eventos, Compras/Economía pendientes, migración 0306) | no son trabajo de Ayuda; desbloquean los planificados |

Total del bloque técnico y de contenido: **27–33 jornadas equivalentes** (frente a 36–47), ya ejecutado; queda la validación humana. La reducción viene de reutilizar el motor y los 660 pasos y de automatizar la reorganización.
