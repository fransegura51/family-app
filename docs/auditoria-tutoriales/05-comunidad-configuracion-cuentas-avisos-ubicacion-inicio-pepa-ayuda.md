# Auditoría (solo lectura) de los tutoriales «Enséñame» — Módulos B2

Alcance: Comunidad (9), Configuración (6), Cuentas (7), Notificaciones/avisos (4), Ubicación (6), Inicio (5), Hablar con PEPA (8), Ayuda y Buzón/Reseñas (4) = 49 entradas.
Repositorio leído: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (HEAD `d3641f5`, 25/10/2026). Fuente del catálogo: `tours_dump.json` + definiciones `src/help/tours/defs/**` (para `skipIf`, `details`, `finishText`, `next`, que el volcado no trae) + pantallas `src/ui/**` + `supabase/migrations/**` (solo lectura).
Nada de esto es «probado»: es lectura de código. Lo que no se puede saber leyendo se marca **no comprobado**.

---------------------------------------------------------------------------------------------------

## 0. Resumen ejecutivo

1. **Hay 13 «tutoriales» que no son interactivos**: todos sus pasos tienen «Siguiente» y ninguno espera una acción real (`tut-comunidad-que-es`, `tut-configuracion-colores`, `tut-configuracion-sincronizacion`, `tut-cuentas-pin`, `-olvide-pin`, `-correo-contrasena`, `-cerrar-sesion`, `-borrar-cuenta`, `-entrar`, `tut-ini-pepa-te-avisa`, `tut-ubicacion-ver-miembros`, `tut-ubicacion-permiso-android`, `tut-buzon-escribir-sugerencia`). Son visitas o explicaciones disfrazadas de tutorial. Además `tut-notificaciones-campana` tiene 10 pasos y 9 son opcionales/informativos.
2. **Incidencia más grave (contradicción con la app de hoy): la tarjeta de confirmación de Pepa.** Los tutoriales, la visita y varias fichas dicen «nada se guarda hasta que pulses el botón de la tarjeta», pero `getAutoConfirm()` (`src/services/pepaPreferences.ts:10-18`) devuelve por defecto **`true` en la app nativa** (Android/iPhone): ahí «Añade leche a Mercadona» se guarda al momento y no sale tarjeta. El tutorial `tut-pepa-apuntar` y su `finishText` prometen lo contrario (§8-I1).
3. **Otras contradicciones concretas con el código**: el paso «Guardar como» señala la fila «Para» (§8-I2); la visita de Pepa con el panel cerrado solo ejecuta 2 de 6 pasos (§8-I3); se afirma que la ubicación con la app cerrada funciona en iPhone (§8-I4, la documentación del propio proyecto dice «SIN PROBAR»); «Editar un lugar no cambia sus coordenadas» ya es falso desde el 24/10 (§8-I5); el tutorial de guardar un lugar da por hecha la pestaña «Lugares» (§8-I6); «Completar la fecha de nacimiento» señala el ⋯ de la primera ficha, no de «tu propia ficha» (§8-I7); dos explicaciones «Cómo funciona» están desfasadas respecto al código (§8-I9, I10).
4. **Lo que cubre la usuaria con «5 tutoriales por módulo» sobra**: con la lógica de uso real, estos 8 módulos (49 entradas) se pueden quedar en **~19 piezas principales** (8 visitas «Conoce», 1 «Recorrido de bienvenida», ~9 tutoriales con capítulos, 1 tutorial pequeño de Comunidad que debe seguir existiendo para quien no puede entrar). Detalle en §9.
5. **Bloqueo técnico a tener presente antes de reestructurar**: el motor no tiene capítulos (solo `group` de pasos opcionales y un único `startPath/startDest` por recorrido), y la prueba `tourCoverage.test.ts` exige un recorrido por ficha y dice «NO la arregles con una lista de excepciones». Fundir tutoriales exige cambiar esa regla a propósito (decisión D1 en §11).
6. **Cuatro cosas que deben dejar de decirse como operativas o precisarse**: iPhone con la app cerrada; «nada se guarda hasta confirmar» (depende del ajuste y de la plataforma); «Comunidad: con tres advertencias se pierde el acceso» (es una expulsión temporal de 30 días con posibilidad de pedir readmisión); «Seguridad … y sesiones» (el resumen del tema en pantalla promete una pantalla de sesiones que no existe).

---------------------------------------------------------------------------------------------------

## 1. Método y límites

- Leído: las 49 entradas completas (texto de cada paso, `target`, `manual`, `opt`, `sens`, `on`), sus definiciones TypeScript (`skipIf`, `details`, `startDest`, `finishText`, `next`), las pantallas reales marcadas con `data-help-id`, las fichas (`cardsGeneral.ts`, `cardsOtros.ts`), las explicaciones C (`explainers/g4,g5,g6`), el registro de rutas/accesos (`access.ts`, `context.ts`, `destinations.ts`), el motor (`engine.ts`, `domTargets.ts`), la inclusión en la Ayuda (`HelpAreas.tsx`, `HelpAnswer.tsx`, `talkHelp.ts`, `HelpNudges.tsx`), las pruebas de cobertura (`tourCoverage.test.ts`) y las migraciones que sostienen las afirmaciones del servidor (0186, 0277, 0283, 0284, 0078, 0254, 0266).
- **No comprobado** (no se puede saber leyendo): comportamiento real en iPhone/Android/Safari (teclado, dictado por voz, `Web Speech`), si el aro del tutorial se coloca bien en cada pantalla, si la app nativa de iPhone manda ubicación con la app cerrada, el estado real de los interruptores del servidor (lectura pública de Comunidad, IA), la afirmación «tu economía la calculo con tus datos, sin enviarlos a ningún sitio» (aparece en `tut-pepa-preguntas` y en la ficha `pepa-preguntas`; no la he rastreado hasta el final del flujo de `finance.ts`).
- Convención de prioridad: **Alta** = el texto del tutorial dice algo falso o puede hacer que la persona guarde/haga algo sin saberlo; **Media** = el tutorial se rompe o señala el control equivocado, o el texto contradice la app sin riesgo; **Baja** = omisión, redacción o mantenimiento.

---------------------------------------------------------------------------------------------------

## 2. Inventario (49 entradas)

Columnas: pasos / de ellos «sin Siguiente» (esperan una señal real) / sensibles (esperan un evento de guardado) / opcionales (se omiten si no hay control) / sin control (solo texto). `dur` en segundos según el catálogo. «C» = explicación «Cómo funciona PEPA» que cita la ficha o el tutorial.

### Comunidad (todas con `access: {community: true}` salvo `tut-comunidad-sin-acceso`)
| id | Título | pasos / auto / sens / opc / sin control | startPath·dest | Qué cubre de verdad | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-comunidad | Conoce Comunidad | 8 / 0 / 0 / 6 / 2 | /comunidad | portada: secciones, buscador, barra (Buscar, Guardados, Borradores, Novedades, Mi perfil, Publicar), «Crear publicación», bloques, normas, qué es público | com2-que-es | solo-adultas | 110 |
| tut-comunidad-que-es | Qué es Comunidad PEPA y quién puede entrar | 5 / 0 / 0 / 2 / 3 | /comunidad | repite la visita (secciones, alias, normas) + «si no sale en el menú de otra persona…» | com2-que-es | solo-adultas | 90 |
| tut-comunidad-elegir-alias | Elegir mi alias y aceptar las normas | 7 / 2 / 1 / 4 / 0 | /comunidad | diálogo de alias: campo, «🎲 Sugerir otro», icono, normas, casilla, «Guardar y continuar» | com2-alias | publico-privado, avisos | 100 |
| tut-comunidad-guardar-publicacion | Guardar una publicación | 3 / 2 / 1 / 0 / 0 | /comunidad (paths /comunidad/*) | abrir tarjeta → botón «Guardar» | com2-publicar | idem | 60 |
| tut-comunidad-seguir-conversacion | Seguir una conversación | 3 / 2 / 1 / 0 / 0 | /comunidad | abrir tarjeta → «Seguir la conversación» | com2-publicar | idem | 60 |
| tut-comunidad-crear-borrador | Crear una publicación (hasta el borrador) | 6 / 2 / 1 / 1 / 0 | /comunidad | «Crear publicación», tipo, título, texto, fotos, «Guardar borrador» | com2-publicar | idem | 100 |
| tut-comunidad-importar-receta | Guardar una receta en mi Cocina | 3 / 2 / 1 / 0 / 0 | /comunidad | abrir receta 🍲 → «📥 Guardar en mi Cocina» | com2-recetas | publico-privado | 70 |
| tut-comunidad-denunciar | Denunciar o bloquear en Comunidad | 4 / 2 / 0 / 2 / 1 | /comunidad | abrir publicación → «Más» → Denunciar/Bloquear (solo mira) | com2-denunciar | — | 90 |
| tut-comunidad-sin-acceso | Completar la fecha de nacimiento para Comunidad | 5 / 3 / 1 / 0 / 1 | /familia · familia.miembros | ficha propia → ⋯ → Editar → fecha → Guardar | com2-sin-acceso | solo-adultas | 100 |

### Configuración
| id | Título | pasos / auto / sens / opc / sin | startPath·dest | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-configuracion | Conoce Configuración | 7 / 0 / 0 / 2 / 0 | /menu-organizar | nombre de familia, Centro de Administración, Organizar menú, Colores, Avisos, Mi cuenta (6 de 12 temas) | cfg-que-hay | ajustes-personales-familiares | 100 |
| tut-configuracion-orden-menu | Cambiar el orden del menú | 3 / 1 / 1 / 0 / 0 | ·config.menu | ↑/↓ de «Organizar menú» | cfg-que-hay | idem | 60 |
| tut-configuracion-colores | Cambiar los colores de la app | 3 / 0 / 0 / 0 / 0 | ·config.colores | enseña los dos selectores, no espera nada | cfg-colores | — | 60 |
| tut-configuracion-nombre-familia | Cambiar el nombre de la familia | 4 / 2 / 1 / 0 / 0 | /menu-organizar (familyAdmin) | «✏️ Cambiar nombre» → Guardar | cfg-nombre-familia | ajustes-personales-familiares | 60 |
| tut-configuracion-sacar-accesos | Sacar un acceso del menú ☰ a la pantalla | 3 / 1 / 0 / 2 / 0 | /calendario | «☰ Menú» de Calendario → «📌 Sacar» (solo señala) | cfg-sacar-accesos | — | 45 |
| tut-configuracion-sincronizacion | Tus ajustes en varios dispositivos | 5 / 0 / 0 / 0 / 2 | /menu-organizar | explica sincronización (sin botón propio) | cfg-sincronizacion | ajustes-personales-familiares | 75 |

### Cuentas
| id | Título | pasos / auto / sens / opc / sin | startPath·dest | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-cuentas | Conoce tu cuenta | 5 / 0 / 0 / 2 / 1 | ·config.seguridad | Seguridad (correo/contraseña, bloqueo) + Mi cuenta + «cómo se entra» | cue-entrar | — | 80 |
| tut-cuentas-pin | Dónde poner un PIN o la huella | 4 / 0 / 0 / 1 / 0 | ·config.seguridad | señala tarjeta y botones; no recorre el formulario | cue-pin | — | 75 |
| tut-cuentas-olvide-pin | Qué hacer si olvido mi PIN | 3 / 0 / 0 / 1 / 2 | ·config.seguridad | 2 pasos de texto (pantalla de bloqueo no visible desde dentro) + señala el botón | cue-olvide-pin | — | 60 |
| tut-cuentas-correo-contrasena | Dónde cambiar mi correo o mi contraseña | 3 / 0 / 0 / 2 / 0 | ·config.seguridad | señala 3 controles; no recorre el flujo | cue-correo-contrasena | — | 75 |
| tut-cuentas-cerrar-sesion | Dónde cerrar la sesión | 2 / 0 / 0 / 0 / 0 | ·config.cuenta | señala la tarjeta y el botón | cue-cerrar-sesion | — | 45 |
| tut-cuentas-borrar-cuenta | Dónde está «Borrar mi cuenta» | 3 / 0 / 0 / 0 / 0 | ·config.cuenta | señala la tarjeta, «Borrar solo mi cuenta» y explica BORRAR | cue-borrar-cuenta | — | 60 |
| tut-cuentas-entrar | Entrar en PEPA y qué hacer sin cuenta | 4 / 0 / 0 / 1 / 3 | ·config.cuenta | 3 pasos de texto sobre la pantalla de entrada + señala «Cerrar sesión» | cue-entrar | — | 75 |

### Notificaciones / avisos
| id | Título | pasos / auto / sens / opc / sin | startPath·dest | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-notificaciones | Conoce los avisos | 4 / 0 / 0 / 3 / 1 | ·config.avisos | campana vs. móvil; tarjetas «Avisos en este móvil», «Horarios», «¿A quién avisamos?» | not-campana | configuracion-avisos, notificaciones-campana | 80 |
| tut-notificaciones-activar | Activar los avisos en este móvil | 4 / 1 / 1 / 2 / 0 | ·config.avisos | «Activar avisos» (si no está ya) → aviso de prueba → límites iPhone/Android | not-activar | idem + ubicacion-avisos | 75 |
| tut-notificaciones-horario-avisos | Activar un horario de avisos de tareas | 5 / 1 / 1 / 2 / 0 | ·config.avisos | zona horaria, casilla «tareas atrasadas», hora (NO cubre «tareas de hoy») | not-resumen-tareas | configuracion-avisos | 90 |
| tut-notificaciones-campana | Abrir y entender la campana de avisos | 10 / 1 / 0 / 9 / 0 | / | abrir la campana y 9 pasos informativos (vacío, contador, bloques, marcar leída/todas, seleccionar, cerrar) | not-campana | notificaciones-campana | 90 |

### Ubicación
| id | Título | pasos / auto / sens / opc / sin | startPath·dest | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-ubicacion | Conoce Ubicación | 7 / 0 / 0 / 4 / 0 | /ubicacion·ubicacion.mapa | intro, ☰ Menú (Inicio/Ubicación/Reglas), personas, 3 pestañas, lugares, compartir, reglas | ubi-ver | ubicacion-compartir | 100 |
| tut-ubicacion-ver-miembros | Ver dónde está cada miembro | 4 / 0 / 0 / 2 / 0 | ·ubicacion.mapa | mapa, chips, ficha de la persona, líneas (casi igual que la visita) | ubi-ver | idem | 90 |
| tut-ubicacion-compartir-movil | Compartir mi ubicación desde este móvil | 4 / 1 / 0 / 2 / 1 | ·ubicacion.mapa | pestaña «Compartir ubicación», consentimiento, «Este dispositivo», límite app cerrada | ubi-compartir-movil | idem | 100 |
| tut-ubicacion-guardar-lugar | Guardar un lugar frecuente | 6 / 1 / 1 / 3 / 0 | ·ubicacion.mapa | formulario «Nuevo lugar»: nombre, categoría, radio, aviso, posición, Guardar | ubi-lugares | ubicacion-avisos, app-cerrada | 100 |
| tut-ubicacion-crear-regla | Crear una regla de aviso | 7 / 1 / 1 / 3 / 0 | ·ubicacion.reglas | formulario «Nueva regla»: nombre, cuándo, lugar, hora, para quién, mensaje, Crear | ubi-lugares | idem | 100 |
| tut-ubicacion-permiso-android | Permiso de ubicación con la app cerrada en Android | 4 / 0 / 0 / 2 / 1 | /menu-organizar·config.avisos (android) | tarjeta «📍 Falta un permiso…» y botón «Abrir ajustes de PEPA» | ubi-permiso-android | idem | 80 |

### Inicio
| id | Título | pasos / auto / sens / opc / sin | startPath | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-inicio | Conoce Inicio | 7 / 0 / 0 / 4 / 0 | / | cabecera, campana, PEPA te avisa, carrusel, ⚙️ del carrusel, Organizar, tarjetas | ini-que-veo | inicio-carrusel | 100 |
| bienvenida | Recorrido de bienvenida | 5 / 1 / 0 / 4 / 0 | / | Inicio, abrir «Menú», Calendario, Compras, Ayuda | ayu-usar (módulo ayuda; el tutorial es del módulo inicio) | — | 90 |
| tut-inicio-organizar | Ordenar las tarjetas de Inicio | 3 / 2 / 0 / 0 / 0 | / | «↕️ Organizar» → ◀ ▶ → «✓ Listo» | ini-organizar | — | 60 |
| tut-ini-pepa-te-avisa | La tarjeta «PEPA te avisa» | 3 / 0 / 0 / 2 / 0 | / | dónde sale, qué avisa, tocar un aviso | ini-pepa-te-avisa | inicio-pepa-te-avisa | 60 |
| tut-ini-menu-y-barra | Moverme por PEPA: barra y menú | 6 / 3 / 0 / 2 / 0 | / (+/menu-organizar) | barra, abrir ☰, lista, Configuración → Organizar menú → lista | ini-menu-y-barra | — | 90 |

### Hablar con PEPA
| id | Título | pasos / auto / sens / opc / sin | startPath·dest | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-pepa | Conoce «Hablar con PEPA» | 6 / 0 / 0 / 4 / 1 | / | botón 💬, micrófono, ejemplos, texto, modo, tarjeta | pepa-hablar | — | 90 |
| tut-pepa-hablar | Hablar con PEPA (voz o texto) | 5 / 1 / 0 / 1 / 0 | / | abrir panel, micrófono, ejemplos, escribir, Enviar | pepa-hablar | — | 80 |
| tut-pepa-apuntar | Apuntar algo hablando con PEPA | 6 / 1 / 0 / 3 / 0 | / | escribir una frase, Enviar, ver tarjeta, «Guardar como», confirmar/cancelar | pepa-apuntar | — | 110 |
| tut-pepa-pedir-ayuda | Pedirle ayuda a Pepa por voz | 4 / 1 / 0 / 0 / 0 | / | «necesito ayuda con…» | pepa-pedir-ayuda | — | 80 |
| tut-pepa-preguntas | Qué le puedo preguntar a PEPA | 4 / 1 / 0 / 0 / 0 | / | ejemplos + temas (1 `details`) | pepa-preguntas | — | 90 |
| tut-pepa-modo-respuesta | Que Pepa me conteste en voz alta o por escrito | 3 / 1 / 0 / 0 / 1 | / | 🔊 Hablando / 💬 Por escrito | pepa-modo-respuesta | — | 60 |
| tut-pepa-botones | Mostrar u ocultar los botones de PEPA | 3 / 1 / 1 / 0 / 0 | ·config.pepa | casilla «Mostrar botones clásicos» | pepa-botones | — | 60 |
| tut-pepa-sin-tarjeta | Que PEPA lo haga sin enseñarte la tarjeta | 3 / 1 / 1 / 0 / 0 | ·config.pepa | casilla «Hacerlo directamente, sin tarjeta» | pepa-sin-tarjeta | — | 60 |

### Ayuda y Buzón/Reseñas
| id | Título | pasos / auto / sens / opc / sin | startPath | Cubre | Ficha | C | dur |
|---|---|---|---|---|---|---|---|
| visita-ayuda | Conoce la Ayuda | 5 / 0 / 0 / 2 / 0 | /ayuda | pregunta, 4 áreas, bienvenida, temas, vídeos | ayu-usar | — | 75 |
| visita-buzon | Conoce el Buzón de sugerencias | 5 / 0 / 0 / 1 / 0 | /sugerencias | intro, formulario, enviar, lista, estados | ini-sugerencias | sugerencias, resenas, que-ve-cada-persona | 80 |
| tut-buzon-escribir-sugerencia | Escribir una sugerencia | 3 / 0 / 0 / 0 / 0 | /sugerencias | escribir, botón enviar (no espera envío), estados | ini-sugerencias | idem | 60 |
| tut-ayuda-resenas | Valorar PEPA con estrellas | 4 / 1 / 1 / 1 / 0 | /resenas | estrellas generales (guarda), comentario, secciones | ini-resenas | ayuda-resenas | 60 |

Totales de duración declarada: Comunidad 780 s, Configuración 400, Cuentas 470, Notificaciones 335, Ubicación 570, Inicio 400, Pepa 630, Ayuda 275 (≈ 64 min en 49 entradas). La Ayuda las rotula «1 min» si ≤ 75 s y si no «n min» (`HelpAreas.tsx`, función `minutes`).

---------------------------------------------------------------------------------------------------

## 3. Mapa funcional real (qué existe hoy, con referencia a código)

Leyenda: ✔ existe y funciona · ◐ parcial/limitado · ✘ no existe (la ficha o el texto lo dan a entender).

### 3.1 Inicio (`src/ui/HomeScreen.tsx`, `NavShell.tsx`)
- ✔ Cabecera «Hola, {nombre}» + «¿Cómo te puedo ayudar?» + avatar (`data-help-id inicio.cabecera`, HomeScreen:161).
- ✔ Campana 🔔 solo en Inicio (`NotificationBell.tsx`); contador de sin leer; panel (§3.4).
- ✔ Tarjeta «🔔 PEPA te avisa» (`AttentionCard.tsx`): hasta 3 avisos; hoy **solo Eventos**; condiciones en `domain/events.ts:1975-2042`: invitados sin responder (plazo ≤7 días o pasado), tarea con fecha pasada, pago que vence ≤7 días, gasto supera presupuesto, necesidades alimentarias por revisar.
- ✔ Carrusel (`PhotoBanner`): Compra pendiente → Hoy en el calendario → Comunidad (si abierta) → fotos de la Galería (hasta 5); pasa cada 4,5 s; pausa con el dedo; engranaje ⚙️ → `HomeCarouselSettingsModal` (`HomeCarouselSettings.tsx`): mostrar carrusel, 4 casillas por diapositiva, fotos al azar / hasta 5 fijas. Se puede ocultar entero y se recupera en Configuración → «Inicio» (grupo `inicio`, MenuSettingsScreen:1703). Preferencia sincronizada (`prefsRegistry.ts`: `home-carousel`).
- ✔ Tarjetas de sección + «↕️ Organizar» con ◀ ▶ por tarjeta (HomeCard:626-646); orden sincronizado (`home-card-order`). Tarjeta «Comunidad PEPA» solo si `useCommunityVisible()`.
- ✔ Banners opcionales en Inicio: `NotificationsOnboarding` (activar avisos / instalar en iPhone, se aplaza 7 días), `ReviewInviteCard` (invitación a valorar tras unos días), `CalendarOnboardingModal`, `InviteFriendsButton` (desactivado según CLAUDE.md/ficha `cue-invitar-amigos`). Ninguno aparece en tutorial ni en visita.
- ✔ Barra inferior: «☰ Menú» + 4 secciones fijas (`PINNED_COUNT = 4`, NavShell:29); desplegable con el resto, **Comunidad PEPA (si abierta)**, Ayuda, Sugerencias, Reseñas y opiniones y Configuración (NavShell:150-175). Insignia de Eventos con avisos.

### 3.2 Hablar con PEPA (`src/ui/VoiceCapture.tsx`, `ActionConfirmSheet.tsx`, `src/pepa/**`)
- ✔ Botón 💬 (avatar + insignia 💬, verde `#12b886` en `styles.css:4995`), `data-help-id pepa.boton` solo en el modo `talk` (VoiceCapture:1435).
- ✔ **Cinco botones «clásicos» más, visibles por defecto** (🐣📅 Pepa Calendario, 🐣🛒 Pepa Compra, 🎤📅 Apuntar Calendario, 🎤🛒 Apuntar Compra, 📍 Buscar sitio; `PANEL_INFO` VoiceCapture:222-297). `getShowClassicButtons()` devuelve `true` salvo que se apague. **Ningún tutorial ni visita los explica**; los tutoriales hablan de «el botón verde 💬 de arriba» sin decir que hay otros cinco.
- ✔ Panel: «🎤 Toca y habla» (solo si hay dictado), «Cómo funciona:» (instrucciones del modo), ejemplos tocables (`TALK_EXAMPLES`: 8 frases incluidas menú, ingredientes a la compra y receta), cuadro de texto + «Enviar», selector «🔊 Hablando / 💬 Por escrito» (`pepa.modo`).
- ✔ Qué entiende (`src/pepa/talk.ts`, `actions/*`): preguntas de calendario/compra/menú/tiempo/tráfico/hora/economía, «¿dónde está Eric?» (abre el mapa), ideas de cocina, ayuda («necesito ayuda con…» → lleva y, si hay recorrido, lo arranca); apuntar: compra (`shopping.add`), evento o tarea (`calendar.create`), menú (`menu.set`), ingredientes a la compra (`menu.ingredients_to_shopping`), lugar (`location.addPlace`, «guárdalo»), presupuesto (`budget.set`), receta (`recipe.create`). Borrar por voz: ✘ (`DELETE_NOTICE`, ficha `pepa-borrar` desactivada).
- ◐ **Tarjeta de confirmación**: depende del ajuste `pepa:auto-confirm`. Por defecto **sin tarjeta en la app nativa y con tarjeta en la web** (`pepaPreferences.ts:10-18`). Aunque esté en directo, vuelve la tarjeta si: es presupuesto, hay avisos (duplicado/choque de horario), queda alguna elección sin valor, o es una **tarea sin persona asignada** (`autoConfirm.ts:10-24`). El ajuste viaja con la cuenta (`prefsRegistry.ts`: `pepa:(auto-confirm|show-classic-buttons)`), aunque el comentario del archivo siga diciendo «por aparato».
- ✔ Tarjeta (`ActionConfirmSheet`): título, líneas, opciones por `choice` (en calendario: **«Para»** y después **«Guardar como»**, `talkActions.ts:226-240`), avisos ⚠️, botón de confirmar con etiqueta propia («Guardar en el calendario», «Guardar tarea»…) y «Cancelar».
- ✔ Ajustes en Configuración → «🗣️ Pepa»: `PepaPreferencesCard` («Hacerlo directamente, sin tarjeta») y `ClassicButtonsCard` («Mostrar botones clásicos»).

### 3.3 Ayuda y Buzón/Reseñas (`AyudaScreen.tsx`, `help/ui/*`, `SuggestionsScreen.tsx`, `ReviewsScreen.tsx`)
- ✔ Ayuda: voz de la Ayuda (`HelpVoiceSetting`), «🎓 Recorrido de bienvenida (1-2 minutos)», conversación, 4 áreas (Preguntar, Conoce esta sección, Enséñame, Cómo funciona PEPA; «Soporte técnico» apagado, `SUPPORT_ENABLED = false`), «Todos los temas de PEPA», vídeos.
- ✔ Buzón: textarea «Nueva sugerencia», «📮 Enviar sugerencia» (desactivado sin texto), lista **de tu familia** (RLS `0078_suggestions.sql`: cada familia ve las suyas; `0254`), estados Pendiente/Aplicada/Descartada con «Respuesta:», «Retirar» mientras pendiente (cualquier miembro de la familia, política `delete`). Controles de dueña (Aplicada/Descartar) solo para la cuenta propietaria.
- ✔ Reseñas: estrellas generales (cada toque guarda, `saveAppReview`), comentario «Lo que me gusta» / «Lo que no me gusta» (dos cuadros) con «Guardar comentario», «Quitar mi valoración», bloque plegado «📋 Valorar cada sección (opcional)». El evento `resenas.review-saved` se emite también al **quitar** la valoración (`ReviewRow.run`).
- ◐ Contextual: `moduleForPath` (`help/context.ts:26-33`) no tiene ruta para `/sugerencias` ni `/resenas` (el módulo «ayuda» solo tiene `/ayuda`), así que en esas dos pantallas el «?» no enfoca el módulo Ayuda ni se ofrece la sugerencia de primera visita.

### 3.4 Notificaciones y avisos
- ✔ Panel de la campana (`NotificationPanel.tsx`): 30 días, dos bloques «Personales» / «Otras notificaciones» plegables, nuevos en negrita con punto, lectura automática a los 3 s a la vista, botón por aviso «Marcar leída / Marcar como no leída», «Marcar todas como leídas / no leídas», «Seleccionar» → «Eliminar (n)» con confirmación, resumen de tareas con detalle interno, cerrar con ✕/Escape/fuera. **Tutorial y explicación `exp-notificaciones-campana` están al día; `exp-configuracion-avisos` no** (§8-I9).
- ✔ Configuración → «🔔 Avisos» (orden real en pantalla): `NotificationsCard` («🔔 Avisos en este móvil»: Activar/Desactivar, «Mandarme un aviso de prueba», estados bloqueado/no soportado con pasos), `BackgroundLocationCard` (**solo app nativa Android**), `BatteryGuideCard` (solo app nativa; por marca), `NotificationPrefsCard` («🕗 Horarios de tus avisos»: zona horaria + «Usar esa zona», **Avisos de tareas** hoy (activado, 08:00) y atrasadas (desactivado, 09:00 propuesto), **Avisos de Comunidad** si se puede participar), `TaskNotifyModeCard` («¿A quién avisamos…?»: solo `profile.role === 'admin'`).
- ✔ Hora del resumen: llega desde la hora elegida y hasta 60 min después, solo si hay tareas (`0283_task_summary_preferences.sql:83`).

### 3.5 Cuentas (`SecuritySettings.tsx`, `ChangeEmailPanel.tsx`, `PinRecoveryPanel.tsx`, `AppLockScreen.tsx`, `DeleteAccountCard.tsx`, `LoginScreen.tsx`, SignOutCard en `MenuSettingsScreen.tsx:1648`)
- ✔ Seguridad → «🔐 Correo y contraseña»: correo + «✓ confirmado», «✉️ Cambiar correo» (contraseña actual → código de 6 cifras a la dirección nueva y, según el proyecto, otro al correo actual), «🔑 Cambiar contraseña» (actual + nueva + repetir, o «No recuerdo mi contraseña actual» → código al correo).
- ✔ «🔒 Bloqueo personal»: Activar PIN (4–6 dígitos + repetir), Cambiar PIN y Desactivar PIN (piden el actual; desactivar borra las huellas), «He olvidado mi PIN» (contraseña o código al correo; el servidor exige identificación de los últimos 5 min según el comentario de `PinRecoveryPanel`), «👆 Huella / Face ID» solo con PIN activo (nombre del dispositivo opcional, lista con «Quitar»). Se pide el PIN al abrir y al volver tras ≥1 min fuera (texto de la propia tarjeta).
- ✔ Mi cuenta: «🚪 Cerrar sesión» (solo este dispositivo, `signOut({scope:'local'})`) y «🗑️ Borrar mi cuenta» (solo yo / toda la familia si administras; escribir BORRAR; casilla opcional para borrar lo publicado en Comunidad).
- ✘ **Sesiones abiertas en otros dispositivos**: el resumen del tema «Seguridad» dice «Correo, contraseña, PIN, huella y sesiones» (MenuSettingsScreen:1796), pero no hay pantalla de sesiones (la ficha `cue-sesiones` está `desactivada`).
- ✔ Entrada: «¿No tienes cuenta? Tengo una invitación»; sin invitación válida no se crea cuenta (LoginScreen:16-23, 231, 298-299). La pantalla solo se ve con la sesión cerrada.

### 3.6 Configuración (`MenuSettingsScreen.tsx:1643-1844`)
Doce temas, uno abierto a la vez: 🧭 Organizar menú · 🏠 **Inicio (carrusel)** · 🎨 Colores · 👨‍👩‍👧‍👦 **Familia (De bebé a niño)** · 🗣️ Pepa · 🔔 Avisos · 💶 **Economía** (mes contable, modo de cuentas, cuentas bancarias, categorías, etiquetas, color de movimientos) · 🛒 **Compras y cocina** (clases de productos) · 🔒 Seguridad · 📅 **Filtros temporales** · 🗓️ **Calendario** (colores, categorías, Google/enlazados/exportar) · 👤 Mi cuenta. Encima: «Nombre de familia» (✏️ Cambiar nombre, visible para todos; el servidor solo acepta administración) y `AdminCenterCard` (solo cuentas propietarias).
La visita cubre 6 de 12; la ficha `cfg-que-hay` enumera 11 (le falta «Inicio»).
- ✔ Colores: dos selectores (pantallas: Pastel/Vivo/Neutro; gráficos: Pastel/Vivo); elegir recarga la app tras subir el cambio a la cuenta (`flushPrefsNow().finally(reload)`).
- ✔ Menús ☰ con «📌 Sacar / 📍 Quitar» en **seis** pantallas: Calendario, Compras, Cocina, Economía, Ubicación **y Comunidad** (`CommunityMenu.tsx`, `239ee39`). Ficha y tutorial nombran solo cinco (sin Comunidad).
- ✔ Sincronización: lista cerrada de claves en `prefsRegistry.ts`; el progreso de los tutoriales y la voz de la Ayuda **no** viajan (`HELP_PREFS_SYNC_ENABLED = false`).

### 3.7 Ubicación (`src/ui/LocationScreen.tsx`)
- ✔ Vistas por «☰ Menú» (Inicio/Ubicación/Reglas, con «📌 Sacar»). Texto fijo `ubicacion.intro`.
- ✔ Pestaña «Ubicación»: mapa con rastro de 24 h; chips de personas (⏸ no comparte, 🕒 sin posición reciente); ficha de la persona (estado, «📍 Abrir en Google Maps», «Activar/Desactivar» si puedes); y debajo **tres pestañas internas** (`panelTab`, LocationScreen:332): «🏠 Lugares» (por defecto), «📍 ¡Estoy aquí!», «👥 Compartir ubicación».
  - Lugares: formulario «Nuevo lugar» (nombre, categoría, radio 50 m por defecto, 🔔 aviso, 🔍 Buscar por nombre / 📍 Usar mi ubicación actual, «Guardar lugar»); tarjeta plegable «Lugares frecuentes» con, por lugar: radio, casilla 🔔 (se guarda al marcar), distancia de cada persona (⭐ la más cercana), «🚗 ver tiempo en coche» (dibuja la ruta), «📍 Compartir esta ubicación», «✎ Editar» (nombre, categoría, radio y **«📍 Mover el lugar a donde estoy ahora»**, `data-help-id ubicacion.lugar-mover-aqui`, LocationScreen:1135), «Eliminar»; y **«Historial de sitios»** (Hoy/Esta semana/Este mes, 90 días, por persona).
  - ¡Estoy aquí!: «📍 Compartir mi ubicación actual» (enlace de Google Maps) y «Añadir este sitio como Casa / Trabajo» (radio 50, aviso activado).
  - Compartir ubicación: «Este dispositivo» (¿Quién lleva este dispositivo? / Dejar de compartir) y «¿Quién puede compartir?» con botón «Activado/Desactivado» (cada uno el suyo; administración, todos). **Si te activas tú, empieza a compartir solo** (`handleToggleConsent`, 458-470).
- ✔ Pestaña «Reglas»: lista (Activa/Pausada, «Silenciar 1h», Eliminar), las reglas internas de cada lugar no salen; «Nueva regla» (nombre, Cuándo, Lugar o Hora, Para quién, Mensaje, «Crear regla»). Servidor: llegada/salida al guardarse la posición con histéresis (0186) y confirmación con 2 lecturas ≥60 s (0297/0313, según la explicación C); `hora_diaria` se evalúa cada minuto en hora Europe/Madrid y avisa en los 30 min siguientes, una vez al día, **a toda la familia aunque se elija «Para quién»** (`fire_daily_automations`: `send_family_push(r.family_id, null, …)`; `member_id` se ignora). El nombre del lugar en el aviso es la **categoría si existe** (`coalesce(nullif(btrim(lp.category),''), lp.name)`, 0243/0297/0313).
- ◐ App cerrada: web ✘; Android nativo ✔ (con «Permitir todo el tiempo»); iPhone: «preparada, SIN PROBAR» (`docs/APP_IOS.md:15`; explicación C `exp-ubicacion-app-cerrada`).

### 3.8 Comunidad (`src/ui/community/**`)
- ✔ **Solo 18+**: `private.community_access_level` devuelve únicamente `'none'` o `'participate'` (0284:20-35). El nivel `'read'` («solo lectura») y los textos asociados siguen en el cliente (`communityAccess.ts`, `ParticipationOnly`, `ReadOnlyNotice`) pero **el servidor ya no lo produce**. `community_status().visible` incluye interruptor de lanzamiento + acceso ≠ none (0277:233).
- ✔ Sin acceso: pantalla «Comunidad no está disponible para tu cuenta» (+ enlace «Completar mi fecha de nacimiento» → /familia si falta); sin menú ni tarjeta en Inicio.
- ✔ Menú ☰ propio (Portada / Recetas y cocina / Hogar y familia, «📌 Sacar/📍 Quitar», «🛠️ Administración» si eres de la administración), barra (Buscar, Guardados, Borradores, Novedades, Mi perfil, Publicar), portada (secciones, buscador, «✍️ Crear publicación», «Normas», bloques Más recientes/Más comentados/Preguntas sin responder/Para mí, «Propón un tema»).
- ✔ Alias (`AliasDialog`): propuesta automática, «🎲 Sugerir otro», 20 iconos, 3–24 caracteres, normas + casilla, «Guardar y continuar»; se abre al primer intento de participar. Cambiar alias después: Mi perfil → Mis ajustes → «Cambiar alias o icono».
- ✔ Publicación (`PostActions.tsx`): Me gusta, **Guardar**, **Seguir la conversación**, Compartir, «Más» (Editar/Eliminar si es mía; Denunciar y Bloquear si no), «Seguir a {alias}» con selector de avisos. Denunciar no exige participar (`startReport`); bloquear sí.
- ✔ Editor (`PostEditorPage.tsx`): tipo (Receta/Pregunta/Consejo/Anécdota) → subtipo de anécdota → **sección** → **tema** → título (140) → texto → campos de receta (+ casilla de consentimiento) → fotos (5) → Descartar / Guardar borrador / Publicar. Borradores: 30 días desde el último guardado manual, máx. 20 (0266:645); «Publicaciones parecidas»; «Recuperar lo que estabas escribiendo».
- ✔ Recetas: «📥 Guardar en mi Cocina» (`RecipeImportButton`; **no aparece si tu familia ya la guardó**, sale «Guardar otra copia»), valoración con estrellas y reseñas; menú semanal importable.
- ✔ Mis ajustes (`MySettingsPage.tsx`): alias/icono, mis publicaciones, personas que sigo (modo de avisos), bloqueadas, temas favoritos, cómo leo los comentarios, avisos de Comunidad, «Mis datos y su eliminación». Medallas, Novedades, Recientes, comentarios con fotos y respuestas, encuestas oficiales.
- ◐ Moderación: «tres advertencias» = expulsión de **30 días** y posibilidad de pedir readmisión (`domain/communityAdmin.ts:69, 393, 656, 789`); los textos de usuario (`COMMUNITY_RULES`, ficha `com2-denunciar`, `tut-comunidad-denunciar`) dicen «se pierde el acceso» sin matizar.

---------------------------------------------------------------------------------------------------

## 4. Duplicados y solapes

| Solape | Entradas | Qué se repite | Propuesta |
|---|---|---|---|
| Qué es Comunidad | `visita-comunidad` ↔ `tut-comunidad-que-es` (misma ficha `com2-que-es`) | secciones, alias, normas, quién entra | Quitar el tutorial; la visita lo cubre y el «18+» es C (`exp-comunidad-solo-adultas`). |
| Mapa de Ubicación | `visita-ubicacion` ↔ `tut-ubicacion-ver-miembros` | mapa, chips ⏸, ficha de persona, líneas | Quitar el tutorial; la visita tiene los 4 pasos equivalentes. |
| «Dónde está» Cuentas | `visita-cuentas` ↔ `tut-cuentas-cerrar-sesion` / `-borrar-cuenta` / `-pin` / `-correo-contrasena` | la visita ya señala correo, bloqueo y Mi cuenta (cerrar/borrar) | Los tres tutoriales de «dónde» no aportan acción; se convierten en capítulos reales (PIN, correo/contraseña) o se quedan en la visita. |
| Entrar | `visita-cuentas` (paso final) ↔ `tut-cuentas-entrar` | «para entrar hace falta cuenta e invitación» | Mover a C («Cómo se entra en PEPA») + enlace desde Familia («Dar acceso», fuera de este alcance). |
| Avisos | `visita-notificaciones` ↔ `visita-inicio` (campana) ↔ `tut-notificaciones-campana` ↔ `exp-notificaciones-campana` | qué es la campana, contador, marcar | Visita muestra dónde; un capítulo hace abrir/leer/marcar; el resto es C. |
| Menú y barra | `bienvenida` (paso menú) ↔ `tut-ini-menu-y-barra` ↔ `tut-configuracion-orden-menu` | abrir ☰, 4 fijas, ↑/↓ | Un solo capítulo «Elegir las 4 secciones fijas» con dos entradas (Inicio y Configuración). |
| Orden del menú vs. sacar accesos | `tut-ini-menu-y-barra` ↔ `tut-configuracion-sacar-accesos` | «poner a mano lo que más uso» | Capítulos distintos (barra de abajo vs. menú de cada sección) pero en el mismo tutorial «Mi PEPA». |
| PEPA te avisa | `tut-ini-pepa-te-avisa` ↔ `visita-inicio` (paso 3) ↔ `exp-inicio-pepa-te-avisa` | dónde sale, qué avisa, tocar | Quitar el tutorial; A + C ya lo cubren (y la C es más completa: 5 condiciones). |
| Sincronización | `tut-configuracion-sincronizacion` ↔ `exp-configuracion-ajustes-personales-familiares` | qué viaja, conflicto «Recuperar el mío» | Quitar el tutorial (no tiene botón propio, ya es C). |
| Buzón | `visita-buzon` ↔ `tut-buzon-escribir-sugerencia` | formulario, enviar, lista, estados | Fundir en un único capítulo; el tutorial no espera nada y no puede saber si se envió. |
| Guardar/seguir/publicar | `tut-comunidad-guardar-publicacion` ↔ `-seguir-conversacion` | ambos empiezan «abre una publicación» | Un capítulo «Leer, guardar y seguir». |
| Apuntar | `tut-pepa-hablar` ↔ `tut-pepa-preguntas` ↔ `tut-pepa-apuntar` | abrir panel, ejemplos, texto, Enviar | Capítulo «Preguntar» + capítulo «Apuntar»; el botón y el panel se explican una vez. |
| Ajustes de Pepa | `tut-pepa-modo-respuesta` ↔ `tut-pepa-botones` ↔ `tut-pepa-sin-tarjeta` | casillas de preferencia personales | Un capítulo «Ajustes de Pepa»; `sin-tarjeta` además debe explicarse dentro del capítulo «Apuntar». |
| Android | `tut-ubicacion-permiso-android` ↔ `tut-notificaciones-activar` (cita ahorro de batería) ↔ `exp-ubicacion-app-cerrada` | tarjeta del permiso / batería | Capítulo condicional por plataforma dentro de «Avisos» (o de Ubicación, ver §9.4/9.5). |

La ficha `com2-publicar` cuelga de **tres** tutoriales y `ubi-lugares` de dos; `talkHelp.ts:123-131` (`tutorialFor`) solo arranca el **primero** por orden de registro (para `com2-publicar` es «Guardar una publicación», no «Crear una publicación»). `HelpAnswer.tsx:65` muestra hasta 3 más con «Enséñame: …».

---------------------------------------------------------------------------------------------------

## 5. Funciones importantes sin tutorial (ni capítulo)

- **Pepa**: los 5 botones clásicos (visibles por defecto); apuntar menú / ingredientes a la compra / receta / lugar / presupuesto por voz; «¿dónde está Eric?»; ideas de cocina; «dime sí / guárdalo» (confirmar por voz en la tarjeta: `DialogReplyBar`); qué hace Pepa cuando no entiende.
- **Inicio**: ⚙️ del carrusel y su formulario; recuperar el carrusel oculto desde Configuración → Inicio; banners «Activa los avisos» y «Valora PEPA»; tarjeta de Comunidad y entrada de Comunidad en el menú ☰.
- **Ubicación**: «¡Estoy aquí!» (compartir mi ubicación actual, Casa/Trabajo en un toque); editar un lugar y **moverlo a donde estoy**; eliminar lugar; tiempo en coche y quién está más cerca; compartir una ubicación; **Historial de sitios** (90 días); gestionar reglas (Activa/Pausada, Silenciar 1h, Eliminar); «Dejar de compartir».
- **Comunidad**: comentar y responder (con foto), Me gusta, valorar una receta, seguir a una persona (y su modo de avisos), **Mis ajustes** (cambiar alias, personas que sigo/bloqueadas, temas favoritos, lectura de comentarios, avisos, eliminar mis datos), Novedades/Recientes/Seguidos, Medallas, Buscar con filtros, «Propón un tema», editar/eliminar mi publicación, publicar una receta desde la Cocina (`ShareToCommunityButton`), importar un menú semanal, el menú ☰ de Comunidad (Sacar).
- **Configuración**: temas Inicio, Familia (De bebé a niño), Economía, Compras y cocina, Filtros temporales, Calendario (los otros temas ya tienen módulo propio en la auditoría de Economía/Compras/Calendario); recuperar el carrusel; cómo se usa «Recuperar el mío» tras un conflicto (C).
- **Cuentas**: flujo real de activar el PIN (los dos campos), activar huella/Face ID, quitar una huella, cambiar correo con códigos, cambiar contraseña, borrar con la casilla de Comunidad.
- **Avisos**: «tareas de hoy» (activado por defecto), «Usar esa zona» horaria, Avisos de Comunidad, «Desactivar avisos», pasos cuando el navegador los bloquea (`StepsList`), guía de batería por marca (Android), «¿A quién avisamos?» (administración).
- **Ayuda/Buzón/Reseñas**: Llévame / Enséñame / voz dentro de la conversación (la visita lo nombra, no se practica), «Retirar» una sugerencia, comentario de reseña (dos cuadros) y valoración por secciones.

---------------------------------------------------------------------------------------------------

## 6. Discrepancias texto ↔ código (y desfases entre capas A/B/C/fichas)

| # | Dónde | Dice | El código hace | Prio |
|---|---|---|---|---|
| D1 | `tut-pepa-apuntar` paso `enviar` y `finishText`; `tut-pepa-hablar` `finishText`; `visita-pepa` paso `tarjeta`; `tut-pepa-sin-tarjeta` paso `tarjeta` («normalmente te enseño primero una tarjeta»); fichas `pepa-hablar` (steps) y `pepa-apuntar` (quick); instrucciones del panel (`PANEL_INFO.talk`, VoiceCapture:~287) | «Todavía no se guarda nada», «nada se guarda hasta que confirmas» | En la app nativa el valor por defecto es guardar **directamente** (`getAutoConfirm()` → `isNativeApp()`); también en web si la persona lo activó | **Alta** |
| D2 | `tut-pepa-apuntar` paso `guardar-como` | señala «Guardar como» | `data-help-id="pepa.tarjeta-opciones"` va en la **primera** opción (`ActionConfirmSheet:90`) = «Para» (`talkActions.ts:226-232`); «Guardar como» es la segunda | Media |
| D3 | `tut-ubicacion-compartir-movil` paso `limite`; ficha `ubi-lugares.limits` | «Con la app cerrada solo funciona en las apps de Android e iPhone» | iPhone: «SIN PROBAR en un iPhone real … lo más incierto» (`docs/APP_IOS.md:15,36`); la explicación C `exp-ubicacion-app-cerrada` lo dice bien («no se puede asegurar») | **Alta** (promete lo no comprobado) |
| D4 | ficha `ubi-lugares.limits`; `exp-ubicacion-avisos.limits` | «Editar un lugar no cambia sus coordenadas: hay que borrarlo y crearlo de nuevo» | Desde `8d98b96` (24/10) el editor tiene «📍 Mover el lugar a donde estoy ahora» (LocationScreen:1135; `updatePlace(..., ...editMoveTo)`) y ese commit no tocó la Ayuda | Media |
| D5 | `exp-configuracion-avisos.limits` | «No hay un botón para marcar todos los avisos como leídos de golpe» | Existen «Marcar todas como leídas / no leídas» y botón por aviso (86b7271, f2d4695); `exp-notificaciones-campana` sí está al día | Media |
| D6 | `exp-comunidad-avisos` («Dónde se cambia») | «… y también en Familia → «Horarios de tus avisos». La zona horaria se cambia en Familia» | `NotificationPrefsCard` solo está en Configuración → Avisos (`MenuSettingsScreen:1754`); ya no está en Familia (comentario de `NotificationsCard`: «antes en Familia») | Media |
| D7 | `tut-configuracion-sacar-accesos` paso `otros`; ficha `cfg-sacar-accesos` | «Los demás menús ☰ (Compras, Cocina, Economía y Ubicación)» | También Comunidad (`CommunityMenu.tsx`, mismo «📌 Sacar / 📍 Quitar») | Baja |
| D8 | `visita-configuracion`; ficha `cfg-que-hay` | 6 temas / 11 temas | 12 temas; falta «🏠 Inicio» en la ficha y 6 temas en la visita | Media |
| D9 | `tut-comunidad-sin-acceso` paso `abrir-acciones` | «Pulsa el ⋯ de **tu propia ficha**» | `findTarget` devuelve el primer `data-help-id` visible (`domTargets.ts:17-21`); todas las fichas editables comparten `family.member-actions` (`FamilyScreen.tsx:364`), así que una persona administradora ve resaltada la primera de la lista | Media |
| D10 | `tut-comunidad-denunciar` paso `perfil`; ficha `com2-denunciar`; normas | «Con tres advertencias, una persona pierde el acceso a Comunidad» | Es una expulsión de 30 días, con posibilidad de pedir readmisión (`communityAdmin.ts:69, 789`) | Baja |
| D11 | `LocationScreen` `ubicacion.intro` y `tut-ubicacion-ver-miembros` paso `lineas` | «el móvil solo manda su posición con la app abierta» | Vale para la web; en la app nativa de Android se envía con la app cerrada (`exp-ubicacion-app-cerrada`) | Baja |
| D12 | `MenuSettingsScreen:1796` (resumen del tema «Seguridad») | «… PIN, huella y **sesiones**» | No existe pantalla de sesiones (`cue-sesiones` desactivada) | Baja (texto de la propia pantalla; no del tutorial) |
| D13 | `tut-ini-pepa-te-avisa` paso `tarjeta` | «tareas atrasadas, pagos que vencen o invitados sin responder» | Son cinco condiciones (`events.ts:1975-2042`): además gasto sobre presupuesto y necesidades alimentarias | Baja |
| D14 | `tut-ini-menu-y-barra` paso `lista` | «el resto de secciones, además de Ayuda, Sugerencias y Reseñas» | También «Comunidad PEPA» (si abierta) y «Configuración» (NavShell:150-175) | Baja |
| D15 | `bienvenida` | módulo `inicio`, ficha `ayu-usar` (módulo `ayuda`) | Es un recorrido general, no de Inicio; sale en «Enséñame» bajo «Inicio» | Baja |
| D16 | `tut-notificaciones-horario-avisos` | título «Activar un horario de avisos de tareas» | Solo cubre las **atrasadas**; las de **hoy** (activadas por defecto) y los de Comunidad no se tocan | Baja |
| D17 | `tut-ubicacion-compartir-movil` paso `dispositivo` | «eliges quién lleva este móvil» | Si te activas **tú**, el móvil empieza a compartir solo como tú (`handleToggleConsent`: `startSharingGlobal`) y «Este dispositivo» pasa a «Compartiendo como … Dejar de compartir» | Baja |
| D18 | `tut-comunidad-crear-borrador` paso `tipo` | «Elige qué quieres publicar…, la sección y el tema» | Solo se resalta el tipo (`comunidad.editor-kind`); sección y tema no tienen marca; y las recetas fuerzan la sección y añaden un formulario de receta | Baja |
| D19 | `tut-ayuda-resenas` paso `comentario` | «un comentario» | Son dos cuadros («Lo que me gusta» / «Lo que no me gusta») | Baja |

---------------------------------------------------------------------------------------------------

## 7. Dependencias

### 7.1 Navegación y vistas internas
- Todas las `startDest` de Configuración (`config.menu|colores|pepa|avisos|seguridad|cuenta`) tienen manejador (`useHelpDestinations`, MenuSettingsScreen:1681). Ubicación solo tiene `ubicacion.inicio|mapa|reglas` (LocationScreen:~92); **no hay destino para las pestañas internas** Lugares / ¡Estoy aquí! / Compartir.
- `tut-configuracion-sacar-accesos` empieza en `/calendario`: si la cuenta no tiene Calendario (hijo/invitado con `allowedSections`), `canDoTour` solo mira el módulo `configuracion` y la regla propia (`HelpProvider.tsx:263-269`), no la ruta de inicio.
- `tut-comunidad-*` usan `paths: ['/comunidad/*']` y `startPath /comunidad`; necesitan al menos una publicación (guardar, seguir, denunciar), una receta no guardada aún por la familia (importar) y que Comunidad esté abierta (`community: true`).
- Modales/capas que cubren el aro: `AliasDialog` (modal), panel de Pepa (modal), `ActionConfirmSheet` (modal), `LocationPickerModal`, panel de avisos (portal fuera de `#root`, `useModalDialog`).

### 7.2 Permisos / rol / plataforma (`access`)
- `community: true` en 8 de 9 de Comunidad. `communityStateFrom` considera `access === 'none'` o `!visible` como «no» (`context.ts:14-18`); como el servidor ya no devuelve `'read'`, el caso «solo lectura» no se da hoy. Quien es menor o no tiene fecha de nacimiento **no ve ningún tutorial de Comunidad salvo `tut-comunidad-sin-acceso`** (sin `access`).
- `familyAdmin`: solo `tut-configuracion-nombre-familia` en este alcance. Pero hay ajustes de administración sin tutorial/visita completa: «De bebé a niño», «¿A quién avisamos?» (se menciona en la visita), «Modo de cuentas» (Economía).
- `platforms: ['android']`: `tut-ubicacion-permiso-android`. `detectPlatform()` devuelve `'android'` solo en la **app nativa** (`context.ts:11-15`); en Chrome/Android web es `'web'`. Coherente con `BackgroundLocationCard` (`isNativeApp() && !isIosApp()`).
- Sin regla pero dependientes: dictado por voz (`dictationOk`), geolocalización del navegador (guardar lugar, compartir), notificaciones del sistema (activar avisos; `unsupported` en iPhone fuera de la pantalla de inicio), `BatteryGuideCard` (solo nativa), `AdminCenterCard` (solo propietarias), `TaskNotifyModeCard` (editable solo con `role==='admin'`).

### 7.3 Datos necesarios
| Tutorial | Necesita | Qué pasa si falta |
|---|---|---|
| guardar-publicacion / seguir-conversacion / denunciar | una publicación ajena o propia en la portada | `comunidad.post-card` no existe → paso no opcional → recorrido «roto» (`target-missing`) |
| importar-receta | receta 🍲 que tu familia no haya guardado | el botón no se pinta (`RecipeImportButton`: muestra «Tu familia ya guardó…») → el paso sensible queda esperando |
| elegir-alias | no tener alias | si ya hay alias, «Crear publicación» entra directo al editor: el texto pide «Salir» |
| crear-regla (llegar/salir) | ≥1 lugar guardado | el desplegable es `required`; sin lugares no se puede crear (el paso `lugar` es opcional y dice que primero hay que guardar uno) |
| guardar-lugar | geolocalización o búsqueda por nombre | sin posición, «Usa primero "Usar mi ubicación actual"» (el texto del paso lo prevé) |
| campana | avisos (los pasos de bloques y marcar son opcionales) | con 0 avisos solo se ven `vacio` y `cerrar` |
| horario-avisos | – | tiene `skipIf` si el aviso de atrasadas ya está activo (correcto) |
| activar avisos | – | `skipIf` si ya están activos; opcional si el navegador no deja |

### 7.4 Contexto de la Ayuda que afecta a lo que se ve
- `moduleForPath` (`context.ts:26-33`): en `/` devuelve `inicio` (el módulo `pepa` también cuelga de `/` y **nunca queda enfocado**, así que los tutoriales de Pepa quedan tras «Ver los tutoriales de todas las secciones»); en `/menu-organizar` devuelve `configuracion` (los de `notificaciones`, `cuentas` y los de `pepa` en Configuración no se enfocan); `/sugerencias` y `/resenas` → `null`.
- `HINT_MODULES` (HelpNudges:14) no incluye `inicio`, `pepa`, `notificaciones`, `cuentas` ni `ayuda`, así que la sugerencia de primera visita no se ofrece ahí.
- El progreso de recorridos y la voz de la Ayuda no se sincronizan (`HELP_PREFS_SYNC_ENABLED = false`).

---------------------------------------------------------------------------------------------------

## 8. Incidencias concretas (causa comprobada, prioridad, corrección recomendada)

**I1 — Alta — «Nada se guarda hasta confirmar» es falso con «sin tarjeta» (por defecto en la app nativa).**
Causa: `src/services/pepaPreferences.ts:10-18` (`getAutoConfirm`: si no hay valor guardado, `return isNativeApp()`); `src/pepa/autoConfirm.ts` salta la tarjeta salvo `budget.set`, avisos, elecciones sin valor o tarea sin persona. Afecta a `tut-pepa-apuntar` (pasos `enviar`, `tarjeta`, `confirmar` y `finishText`), `tut-pepa-hablar.finishText`, `visita-pepa` paso `tarjeta`, `tut-pepa-sin-tarjeta` paso `tarjeta`, fichas `pepa-hablar` (paso 3) y `pepa-apuntar` (quick) e instrucciones del propio panel. En la práctica, quien haga el tutorial en el móvil Android con los valores por defecto **guarda de verdad** «leche, huevos y pan» o «dentista de Eric» creyendo que solo mira (los pasos `tarjeta/guardar-como/confirmar` son opcionales y se omiten solos, el tutorial «termina bien»).
Corrección: (a) redactar los textos para los dos modos (o con variante según `getAutoConfirm()`: el paso puede leer el ajuste al montarse); (b) el capítulo «Apuntar» debe empezar comprobando el ajuste y, si está en directo, o bien usar una frase que **siempre** deja tarjeta (una **tarea sin persona**: «Tengo que llamar al dentista»; `autoConfirm.ts:24`; no probado) o bien indicar antes cómo ponerlo en «con tarjeta» (enlace al capítulo de ajustes); (c) cambiar las fichas.

**I2 — Media — «Guardar como» señala «Para».** Causa: `ActionConfirmSheet.tsx:90` marca solo `choiceIndex === 0`; en `calendar.create` el orden es `[member «Para», kind «Guardar como»]` (`talkActions.ts:226-240`). Para `shopping.add` (el otro ejemplo) la primera opción es otra (tienda), y no hay «Guardar como». Corrección: `data-help-id` por opción (`pepa.tarjeta-opcion-${choice.id}`) y paso propio para «Para»; el paso «Guardar como» solo debe salir si existe esa opción (opcional).

**I3 — Media — `visita-pepa` con el panel cerrado solo muestra 2 de 6 pasos.** Causa: `microfono/ejemplos/texto/modo` son `optional` y su objetivo (`pepa.microfono`…) solo existe con el panel abierto (VoiceCapture:1465); el paso 1 dice «tócalo y vuelve a esta visita» pero tiene `completeOn: []` y «Siguiente», así que quien pulsa «Siguiente» sin abrir el panel salta cuatro pasos sin enterarse. Corrección: que el paso 1 espere la apertura (como `abrirBoton` de los tutoriales, con `skipIf appear pepa.panel`) o que la visita abra el panel de forma guiada; marcar el último paso («tarjeta») como estado-dependiente (I1).

**I4 — Alta — iPhone con la app cerrada dado por operativo.** Causa: `defs/g9/ubicacion.ts:95` y `cardsOtros.ts:276`. Evidencia contraria: `docs/APP_IOS.md:15,36`, `exp-ubicacion-app-cerrada`. Corrección: «Con la app cerrada, solo en la app de Android (con «Permitir todo el tiempo»); en iPhone todavía no está comprobado».

**I5 — Media — «Editar un lugar no cambia sus coordenadas» (obsoleto).** Causa: cambio `8d98b96` sin tocar `cardsOtros.ts:276` ni `explainers/g5/ubicacion.ts` (limits de `exp-ubicacion-avisos`). Corrección: actualizar ambos y añadir el capítulo «Editar o mover un lugar».

**I6 — Media — `tut-ubicacion-guardar-lugar` se rompe si estás en otra pestaña interna.** Causa: `panelTab` (LocationScreen:332) vive en `LocationTab`; `startDest ubicacion.mapa` solo exige la pestaña principal. Si ya estás en «Compartir ubicación» o «¡Estoy aquí!», `ubicacion.place-name` no existe (paso no opcional) → estado `broken`. Corrección: destino `ubicacion.lugares` (o primer paso «pulsa 🏠 Lugares» con `skipIf appear ubicacion.place-form`).

**I7 — Media — `tut-comunidad-sin-acceso` señala el ⋯ de otra persona.** Causa en D9. Corrección: marca específica de la ficha propia (`family.own-member-actions`) o paso previo que pida pulsar «tu nombre»; añadir comprobación de si ya hay fecha (el texto dice «vamos a ver si la tienes» pero no lo comprueba); `skipIf` ya cubre el caso de la fecha abierta.

**I8 — Media — La ficha `com2-publicar` arranca «Guardar una publicación» por voz.** Causa: `talkHelp.ts:125` (`TOURS.find` por `cardId`, primer resultado en el orden de `TOURS_G4`: guardar, seguir, borrador). «Necesito ayuda para publicar» no abre «Crear una publicación». Corrección: capítulos con puerta propia (`chapter.cardIds`) o `tour` explícito en la ficha.

**I9 — Media — `exp-configuracion-avisos` desfasada.** Ver D5. **I10 — Media — `exp-comunidad-avisos` desfasada.** Ver D6.

**I11 — Media — Comunidad: el menú ☰ de Comunidad (con «📌 Sacar») no figura en ningún sitio de la Ayuda.** `239ee39` tampoco tocó Ayuda; `cfg-sacar-accesos` y el tutorial lo omiten (D7).

**I12 — Baja — `resenas.review-saved` se emite también al quitar la valoración** (`ReviewsScreen.tsx:run`), no solo al guardar. En `tut-ayuda-resenas` no es peligroso (el paso espera estrellas); si se reutiliza el evento para otros pasos, conviene un evento distinto.

**I13 — Baja — `tut-buzon-escribir-sugerencia` no puede saber si se envió** (no hay evento en `SuggestionsScreen`), pero su paso `estados` da por hecho que «Al enviar una, aparece … Pendiente». Corrección: `emitHelpEvent('suggestions.sent')` y paso condicionado.

**I14 — Baja — Contextual de Ayuda/Pepa/Avisos/Cuentas** (ver §7.4): tutoriales que existen pero no se enfocan en su pantalla.

**I15 — Baja — Seguridad: texto de pantalla con «sesiones»** (D12) y comentario obsoleto en `pepaPreferences.ts` («se guardan por aparato») frente a `prefsRegistry.ts` (sincronizado).

Pruebas/regla relacionadas: `tourCoverage.test.ts` (una ficha = un recorrido; «NO la arregles con una lista de excepciones»).

---------------------------------------------------------------------------------------------------

## 9. Propuesta de estructura por módulo

Criterio común: **A «Conoce»** = dónde está cada cosa (sin acciones); **B «Enséñame»** = una tarea real con la persona haciéndola, en capítulos de 1–2 min, recorrido completo 4–7 min; **C «Cómo funciona»** = reglas, límites, qué ve cada quien. Cada capítulo debe tener su propio `startPath/startDest/access/platforms` y `skipIf` para empezar desde cualquier estado.

Resumen (49 → 19):
| Módulo | Hoy | Propuesta |
|---|---|---|
| Inicio | 5 | visita + «Moverme y ordenar PEPA» (3–4 cap.) + bienvenida (reclasificada) = 3 |
| Hablar con PEPA | 8 | visita + «Hablar con PEPA» (4 cap.) = 2 |
| Ayuda y opiniones | 4 | 2 visitas (Ayuda, Buzón) + «Dar tu opinión» (2 cap.) = 3 |
| Notificaciones | 4 | visita + «Tus avisos» (3 cap. + 1 condicional Android) = 2 |
| Cuentas | 7 | visita + «Proteger mi cuenta» (2 cap.) = 2 |
| Configuración | 6 | visita + «Personalizar PEPA» (4 cap.) = 2 |
| Ubicación | 6 | visita + «Ubicación y avisos» (4 cap. + 1 condicional Android) = 2 |
| Comunidad | 9 | visita + «Participar en Comunidad» (5 cap.) + `sin-acceso` (se mantiene) = 3 |

### 9.1 Inicio
| Pieza | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce Inicio» | los 7 pasos actuales | ~1,5 | `visita-inicio` íntegra | quitar «busca el Enséñame de Inicio» (poner el botón) | – |
| B «Moverme y ordenar PEPA» · cap. 1 «La barra y el menú ☰» | barra (Menú + 4 fijas), abrir ☰, qué hay dentro (con Comunidad y Configuración) | 1 | pasos `barra`, `abrir`, `lista` de `tut-ini-menu-y-barra` | `lista` (D14) | – |
| · cap. 2 «Elegir las 4 secciones fijas» | Configuración → Organizar menú → ↑/↓ | 1,5 | `configuracion`, `grupo`, `orden` de `tut-ini-menu-y-barra` + `mover`/`resultado` de `tut-configuracion-orden-menu` | unificar textos | **Mismo capítulo que en Configuración** (dos puertas: fichas `ini-menu-y-barra` y `cfg-que-hay`) |
| · cap. 3 «Ordenar las tarjetas de Inicio» | Organizar → ◀ ▶ → Listo | 1 | `tut-inicio-organizar` íntegro | – | – |
| · cap. 4 «El carrusel» | ⚙️ → qué diapositivas, fotos al azar/fijas; dónde recuperarlo | 1 | – | – | **nuevo** (hoy no existe) |
| Bienvenida | repaso de 1,5 min | 1,5 | `bienvenida` | marcarla como visita general («Primeros pasos») y componerla con pasos de `visita-inicio`, cap. 1 y `visita-ayuda` para no duplicar texto | – |
| Retirar | `tut-ini-pepa-te-avisa` (A paso 3 + C `exp-inicio-pepa-te-avisa`); `tut-ini-menu-y-barra` y `tut-inicio-organizar` pasan a capítulos | | | | |
- C: `exp-inicio-carrusel` y `exp-inicio-pepa-te-avisa` bastan.

### 9.2 Hablar con PEPA
| Capítulo | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce Hablar con PEPA» | botón, panel, micrófono, ejemplos, texto, modo, **botones clásicos**, tarjeta | 1,5 | `visita-pepa` | I3, I1; explicar que arriba hay 5 botones más | un paso sobre los botones clásicos (o decisión D4) |
| B · cap. 1 «Preguntar» | abrir panel, micrófono/ejemplos, escribir, Enviar, qué sé contestar | 1,5 | `tut-pepa-hablar` (5) + `temas` de `tut-pepa-preguntas` | unir ambos (comparten 3 pasos) | – |
| · cap. 2 «Apuntar y revisar la tarjeta» | frase → tarjeta → «Para» / «Guardar como» → confirmar o cancelar; con y sin tarjeta | 2 | `tut-pepa-apuntar` | I1, I2; elegir frase que garantice tarjeta (tarea sin persona) | paso inicial que comprueba el ajuste |
| · cap. 3 «Pedir ayuda a Pepa» | «necesito ayuda con…» | 1 | `tut-pepa-pedir-ayuda` (4) | – | podría ir como último paso del cap. 1; no merece capítulo propio si se quiere acortar |
| · cap. 4 «Cómo quiero que me conteste» | 🔊 Hablando / 💬 Por escrito; botones clásicos; «sin tarjeta» (enlace a Configuración → Pepa) | 1,5 | `tut-pepa-modo-respuesta` + `tut-pepa-botones` + `tut-pepa-sin-tarjeta` | unificar; el paso del panel y los dos de Configuración tienen `startDest` distinto | soporte de cambio de pantalla dentro de un capítulo |
| C | «Cómo entiende PEPA lo que le dices» (reglas primero, IA solo para entender preguntas y nunca escribe, tarjeta vs. directo y excepciones, qué no hace: borrar, presupuestos siempre con tarjeta) | – | contenido de `pepa-hablar.more`, `autoConfirm.ts` | **nuevo** (no existe ninguna explicación C de Pepa) | – |
- Total ≈ 5–6 min. Falta fuera de capítulos: menú/receta/lugar/presupuesto por voz y «dónde está Eric» (candidatos a C o a un capítulo opcional «Otras cosas que sé hacer», pendiente de D4).

### 9.3 Ayuda y opiniones (Ayuda, Buzón, Reseñas)
| Pieza | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|
| A «Conoce la Ayuda» | 1 | `visita-ayuda` | – | – |
| A «Conoce el Buzón» | 1 | `visita-buzon` | absorbe `tut-buzon-escribir-sugerencia` | – |
| B «Dar tu opinión» · cap. 1 «Escribir una sugerencia» | 1 | `tut-buzon-escribir-sugerencia` (3 pasos) | evento de envío (I13); recordar que la ve toda la familia | evento `suggestions.sent` |
| · cap. 2 «Valorar PEPA con estrellas» | 1,5 | `tut-ayuda-resenas` (4 pasos) | D19: dos cuadros; «Quitar mi valoración» | evento distinto al quitar (I12) |
| C | `exp-ayuda-sugerencias`, `exp-ayuda-resenas` ya existen | | | opcional C «Cómo funciona la Ayuda» (conversación efímera, IA apagada, progreso solo local) |
- Nota: el módulo `ayuda` tiene dos visitas; `talkHelp.ts:130` (`visitFor`, `TOURS.find`) y `HelpNudges.tsx` (`visitsOf(...).find`) usan solo la primera (`visita-ayuda`); `HelpSectionArea` sí lista todas las del módulo. La del Buzón se alcanza desde su ficha, desde «Conoce esta sección» o desde «Otras secciones».

### 9.4 Notificaciones y avisos
| Capítulo | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce los avisos» | campana vs. móvil, 3 tarjetas | 1 | `visita-notificaciones` | añadir Comunidad y batería (Android) si aplican | – |
| B · cap. 1 «Activar los avisos en este móvil» | Activar → permitir → prueba; qué hacer si está bloqueado | 1,5 | `tut-notificaciones-activar` (4) | añadir estados bloqueado/no soportado (pasos con `StepsList`) | – |
| · cap. 2 «Elegir cuándo recibo el resumen de tareas» | zona horaria; **tareas de hoy** y **atrasadas** (casilla + hora) | 1,5 | `tut-notificaciones-horario-avisos` (5, bien hecho con `skipIf`) | ampliar a «hoy» y renombrar (D16) | evento al marcar «hoy» |
| · cap. 3 «La campana de avisos» | abrir, leer, marcar, seleccionar/eliminar | 2 | `tut-notificaciones-campana` (10 pasos → ~6) | quitar pasos que son solo texto (pasan a C `exp-notificaciones-campana`) | – |
| · cap. 4 (solo app Android) «Que lleguen con la app cerrada» | tarjeta «Falta un permiso…», botón de ajustes, guía de batería | 1 | `tut-ubicacion-permiso-android` | I4 (no menciona iPhone) | pasos de batería |
- «¿A quién avisamos de tareas y eventos?» queda en A y C (no es una tarea de uso diario); si se quiere práctica, capítulo `familyAdmin` opcional.
- C: arreglar D5.

### 9.5 Cuentas
| Pieza | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce tu cuenta» | Seguridad + Mi cuenta (cerrar sesión, borrar) + cómo se entra | 1,5 | `visita-cuentas` | absorbe los pasos de `tut-cuentas-cerrar-sesion` y `tut-cuentas-borrar-cuenta` (ya están en la visita) | – |
| B «Proteger mi cuenta» · cap. 1 «Poner un PIN y la huella» | Activar PIN (los dos campos), huella/Face ID, cambiar/desactivar, «He olvidado mi PIN» (botón) | 2 | `tut-cuentas-pin` (4), `tut-cuentas-olvide-pin` paso `dentro` | convertir a recorrido de formulario (nuevos `data-help-id` en los campos; la persona escribe el PIN, el tutorial nunca lo hace) | marcas en `SecuritySettings.tsx` |
| · cap. 2 «Cambiar mi contraseña o mi correo» | «🔑 Cambiar contraseña» (actual/nueva/repetir o código) y «✉️ Cambiar correo» (contraseña → códigos de 6 cifras) | 2 | `tut-cuentas-correo-contrasena` (3) | recorrer los formularios | marcas en `ChangeEmailPanel`/`ChangePasswordPanel` |
| Retirar como tutoriales | `tut-cuentas-cerrar-sesion` y `-borrar-cuenta` → A (+ C «Qué pasa si borro mi cuenta»); `-olvide-pin` → C «Recuperar el PIN» (la pantalla de bloqueo no se puede mostrar desde dentro); `-entrar` → C «Cómo se entra en PEPA: invitación» | | | | explicación C nueva (hoy `exp-cuentas-*` solo cubre privacidad y economía) |
- Acciones destructivas: se recomienda **no guiar** el borrado (D5 en §11).

### 9.6 Configuración
| Pieza | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce Configuración» | los 12 temas, qué es tuyo y qué de la familia | 1,5 | `visita-configuracion` | cubrir Inicio, Familia, Pepa, Economía, Compras y cocina, Seguridad, Filtros, Calendario (D8) | – |
| B «Personalizar PEPA» · cap. 1 «Mi menú» | = cap. 2 de Inicio | 1,5 | ver §9.1 | – | – |
| · cap. 2 «Colores» | elegir estilo (se recarga) | 1 | `tut-configuracion-colores` (3, todo informativo) | dejar claro que el último paso lo hace la persona; considerar que recarga la app | – |
| · cap. 3 «Sacar accesos de los menús ☰» | «📌 Sacar / 📍 Quitar» (Calendario como ejemplo) | 1 | `tut-configuracion-sacar-accesos` (3) | D7 (añadir Comunidad); `startPath /calendario` requiere Calendario | – |
| · cap. 4 «Ajustes de la familia» (solo administración) | Nombre de familia, «De bebé a niño» | 1,5 | `tut-configuracion-nombre-familia` (4) | `access: familyAdmin` por capítulo | «De bebé a niño» (nuevo, 5 botones) |
| Retirar | `tut-configuracion-sincronizacion` → C | | | | |
- Los capítulos de Pepa (casillas) y Avisos viven en sus tutoriales respectivos, pero deben ser alcanzables desde Configuración (puertas por tema).

### 9.7 Ubicación
| Capítulo | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce Ubicación» | mapa, chips, ficha, 3 pestañas, menú ☰, reglas; absorbe `tut-ubicacion-ver-miembros` | 1,5 | `visita-ubicacion` + pasos `personas`, `info`, `lineas` | añadir ¡Estoy aquí!, Historial de sitios, tiempo en coche (hoy sin cobertura); corregir D11 | – |
| B «Ubicación y avisos» · cap. 1 «Compartir mi ubicación» | consentimiento propio, quién lleva el móvil, dejar de compartir | 1,5 | `tut-ubicacion-compartir-movil` (4) | D17, I4 | – |
| · cap. 2 «Guardar un lugar y su aviso» | Nuevo lugar (nombre → … → Guardar) y dónde queda (Lugares frecuentes) | 2 | `tut-ubicacion-guardar-lugar` (6) | I6 (primer paso Lugares) | – |
| · cap. 3 «Editar o mover un lugar» | ✎ Editar, radio, «📍 Mover el lugar a donde estoy ahora», casilla 🔔, eliminar | 1 | – | – | **nuevo** (marca ya existe: `ubicacion.lugar-mover-aqui`) |
| · cap. 4 «Avisos automáticos (reglas)» | crear regla y gestionar (Activa/Pausada, Silenciar 1h) | 2 | `tut-ubicacion-crear-regla` (7) | añadir gestión de reglas; avisar de que «Para quién» no filtra las de hora diaria (el servidor las manda a toda la familia) | – |
| · cap. 5 (solo Android nativa) «Con la app cerrada» | = cap. 4 de §9.4 | 1 | `tut-ubicacion-permiso-android` | I4 | – |
| C | tres explicaciones existentes | | | corregir I5 | – |
- Total ≈ 7–8 min sin el capítulo condicional.

### 9.8 Comunidad (solo 18+)
| Pieza | Qué cubre | Min | Reutiliza | Reescribe | Falta |
|---|---|---|---|---|---|
| A «Conoce Comunidad» | portada, secciones, buscador, barra, menú ☰, bloques, normas, qué es público | 2 | `visita-comunidad` (8) + `secciones`/`alias`/`normas` de `tut-comunidad-que-es` | añadir menú ☰ (Sacar), «Propón un tema» | – |
| B «Participar en Comunidad» · cap. 1 «Mi alias y las normas» | = `tut-comunidad-elegir-alias` | 1,5 | íntegro (7) | añadir cómo cambiarlo después (Mi perfil → Mis ajustes); si ya tiene alias, ir directo a ese camino en vez de «pulsa Salir» | – |
| · cap. 2 «Leer, guardar y seguir» | abrir publicación, Guardar, Seguir la conversación (+ Me gusta/comentar) | 1,5 | `-guardar-publicacion` + `-seguir-conversacion` (3+3, comparten `abrir`) | un solo `abrir` | comentar/responder |
| · cap. 3 «Publicar» | tipo → sección → tema → título → texto → (receta) → fotos → Guardar borrador / Publicar | 2 | `tut-comunidad-crear-borrador` (6) | D18; añadir receta, límites (140, 5 fotos, 20 borradores) | – |
| · cap. 4 «Guardar una receta en mi Cocina» | `📥 Guardar en mi Cocina`, valorar | 1 | `-importar-receta` (3) | `skipIf`/mensaje si la familia ya la guardó | – |
| · cap. 5 «Denunciar o bloquear» | Más → Denunciar (motivos) / Bloquear; desde el perfil | 1,5 | `-denunciar` (4) | D10 | – |
| Se mantiene aparte | `tut-comunidad-sin-acceso` («Completar la fecha de nacimiento»): único usable sin acceso; mejor colgarlo de Familia o de Cuentas | 1,5 | íntegro | I7 | – |
| Retirar | `tut-comunidad-que-es` | | | | |
- C: arreglar D6/I10. **Hacen falta**: «Mis ajustes de Comunidad» (alias, seguidas/bloqueadas, temas, avisos, borrar mis datos) como cap. 6 opcional o C.

---------------------------------------------------------------------------------------------------

## 10. Qué exige la nueva estructura (técnico, sin implementar)

1. **Capítulos en el motor**: `TourDef.chapters[]` con `fromStepId`, `durationSec`, `cardIds` y, por capítulo, `startPath/startDest/paths/access/platforms` (hoy hay un único `startDest` por recorrido, `types.ts`). Progreso por capítulo (hoy por recorrido, `getTourProgress(t.id)`; se guarda en el dispositivo, no sincroniza).
2. **Cobertura**: `tourCoverage.test.ts` pide `TOURS.some(t => t.cardId === card.id || t.id === card.tour)`; hay que permitir `chapter.cardIds` **a propósito** (la prueba lo prohíbe de forma explícita en su comentario).
3. **Arranque por voz**: `talkHelp.ts:123-131` elige el primer tutorial por ficha; con capítulos debe elegir capítulo por ficha.
4. **`HelpAnswer`/`HelpAreas`** muestran hasta 3 «Enséñame: …» y agrupan por `group`; habrá que mostrar «Recorrido completo» + capítulos.
5. **Condiciones por plataforma/administración/datos por capítulo** (Android, familyAdmin, hay publicaciones…).
6. **Marcas nuevas** (`data-help-id`) en: formularios de `SecuritySettings`/`ChangeEmailPanel`, opciones de `ActionConfirmSheet`, ficha propia en `FamilyScreen`, destino `ubicacion.lugares`, eventos de envío de sugerencia.
7. **`moduleForPath`**: dar entrada a `/sugerencias`, `/resenas` y a los módulos que comparten ruta (Pepa en `/`, Avisos y Cuentas en `/menu-organizar`) para que el «?» los enfoque.

---------------------------------------------------------------------------------------------------

## 11. Decisiones de producto realmente necesarias

- **D1 — Regla RECORRIDOS-01.** Hoy «cada ficha tiene su recorrido» (`tourCoverage.test.ts`). ¿Se acepta que un capítulo cubra una o varias fichas (recomendado) o se mantiene un recorrido por ficha? Sin esta decisión no se pueden fundir tutoriales.
- **D2 — Dónde vive el capítulo «Organizar menú».** Recomendado: Configuración como dueño, con puerta desde Inicio. Es una decisión de organización, no técnica.
- **D3 — Tarjeta de Pepa en la app nativa.** Recomendado resolver con textos que dependan del ajuste (no necesita decisión). Lo que sí es decisión: ¿el valor por defecto «sin tarjeta» en la app nativa es definitivo? Si la intención era «con tarjeta por defecto para quien aprende», cambiaría el contenido de todo el módulo Pepa.
- **D4 — Botones clásicos de Pepa.** ¿Se enseñan (visibles por defecto) o se consideran legado que se ocultará? Determina un capítulo/paso en Pepa.
- **D5 — Acciones destructivas.** Recomendación: no guiar «Borrar mi cuenta»/«Borrar toda la familia» como tutorial (solo A + C). Confirmar la política.
- **D6 — Idiomas y plataformas.** El tutorial de Android solo para la app nativa; la afirmación sobre iPhone espera a probarlo en un iPhone real (no decisión, dependencia).

Nada más requiere decisión: el resto (qué fundir, qué mover a A o C, qué corregir) tiene recomendación concreta arriba.

---------------------------------------------------------------------------------------------------

## 12. Anexo — Omisiones de campos visibles en los formularios que recorren los tutoriales

| Tutorial | Campos/controles visibles que no aparecen |
|---|---|
| `tut-ubicacion-guardar-lugar` | nada de los 6 campos; no dice dónde queda el lugar, ni «✎ Editar», «Eliminar», casilla 🔔 posterior, «Historial de sitios» |
| `tut-ubicacion-crear-regla` | los 6 campos están; falta la lista de reglas (Activa/Pausada, Silenciar 1h, Eliminar) y los marcadores `{miembro}`/`{lugar}` que el servidor sustituye |
| `tut-comunidad-crear-borrador` | sección y tema (selector), subtipo de Anécdota, formulario de la receta y su casilla de consentimiento, «Publicaciones parecidas», «Recuperar lo que estabas escribiendo», botón «Descartar», límites 140/5/20 |
| `tut-comunidad-elegir-alias` | reglas del alias (letras, números, espacios, puntos, guiones), aviso de alias ya usado |
| `tut-notificaciones-horario-avisos` | «Avisarme de las tareas de hoy» y su hora; «Usar esa zona»; bloque «Avisos de Comunidad» |
| `tut-notificaciones-activar` | «Desactivar avisos»; estado bloqueado (pasos del navegador); línea «Detalle: permiso …» |
| `tut-pepa-apuntar` | opción «Para»; avisos ⚠️ de duplicado/horario; campos de otros tipos de tarjeta (importe del presupuesto, plato del menú, nombre del lugar) |
| `tut-cuentas-pin` | «Nuevo PIN (4-6 dígitos)» + «Repite el PIN»; «Nombre de este dispositivo (opcional)»; lista de huellas con «Quitar» |
| `tut-cuentas-correo-contrasena` | contraseña actual / nueva / repetir; campo de código; «Reenviar códigos»; «Atrás» |
| `tut-cuentas-borrar-cuenta` | casilla «También borrar mis publicaciones y comentarios de Comunidad»; botón «Borrar toda la familia» (solo se cita) |
| `tut-ayuda-resenas` | «Lo que me gusta» / «Lo que no me gusta» (dos cuadros), «Quitar mi valoración» |
| `tut-buzon-escribir-sugerencia` | «Retirar» (se cita en el último paso, sí) |
| `tut-configuracion-nombre-familia` | – (completo) |
| `tut-inicio-organizar` | – (completo) |
| `tut-ubicacion-compartir-movil` | «Dejar de compartir» |

Fin del informe.
