# Instrucciones permanentes del proyecto

## Control de requisitos de PEPA (obligatorio)

Antes de implementar cualquier encargo sobre PEPA, consulta primero
[`docs/PEPA_CONTROL_REQUISITOS.md`](docs/PEPA_CONTROL_REQUISITOS.md): registro
maestro de requisitos (acordados, enviados, implementados, probados,
aprobados), con su commit y su evidencia de pruebas.

Procedimiento obligatorio:
1. Consultar el registro maestro.
2. Identificar los requisitos afectados por el encargo.
3. Comprobar que el encargo no omite ninguna decisión ya acordada allí.
4. Implementar y probar cada requisito.
5. Actualizar su estado y evidencias en el registro.
6. Informar expresamente de lo que queda pendiente — no dar un trabajo por
   cerrado solo porque pasen los tests generales.

Para componentes plegables/desplegables, la prueba manual debe cubrir tanto
el estado abierto como el cerrado.

Ningún requisito pasa a **Aprobado** sin confirmación expresa del usuario.

## Otros documentos de referencia

- [`PROJECT.md`](PROJECT.md) — arquitectura técnica.
- [`docs/QA_EVENTOS_PENDIENTES.md`](docs/QA_EVENTOS_PENDIENTES.md) — checklist manual detallado del módulo Eventos.

## RECORRIDOS-01 — toda función y sección nueva lleva su recorrido (obligatorio, sin que lo pidan)

Petición permanente de la persona responsable (24/10/2026): cada vez que se cree una función o una sección nueva en PEPA se crea también, **en el mismo cambio y sin que nadie lo pida**:
1. Su ficha de Ayuda (`src/help/catalog/cards*.ts`) y, si es una sección, su módulo (`src/help/catalog/modules.ts`).
2. Su recorrido guiado «Enséñame» (`src/help/tours/defs/…`, registrado en `src/help/tours/registry.ts`, con `cardId` apuntando a la ficha) y, si es una sección, su visita «Conoce esta sección» (`kind: 'visit'`).
3. Las marcas `data-help-id` en los controles reales que el recorrido señala (nunca controles inventados; los pasos que guardan datos son `sensitive` y esperan `emitHelpEvent`).
4. La asociación con Pepa por voz: «Hablar con PEPA» arranca solo el recorrido con «necesito ayuda con…» (`src/help/talkHelp.ts`) en cuanto existen la ficha y el recorrido; añade el nombre de la sección en `MODULE_WORDS` de ese archivo si la sección es nueva.

La prueba `src/help/tours/tourCoverage.test.ts` falla si una ficha usable no tiene recorrido o una sección con fichas no tiene visita. No la esquives con listas de excepciones: crea el recorrido.

## AYUDA-01 — mantener la Ayuda al día (obligatorio)

La Ayuda de PEPA («Pepa te acompaña», `src/help/`) es parte del producto: no puede volver a quedarse desactualizada. **Cuando crees, modifiques, desactives o elimines una
funcionalidad, en el MISMO cambio revisa:**

1. Su **ficha de Ayuda** (`src/help/catalog/cards*.ts`): título, sinónimos, respuesta breve, pasos, estado (`disponible` / `parcial` / `desactivada`) y su límite si lo tiene. Una
   función apagada o a medias se explica como tal; nunca se vende como disponible.
2. Los **textos de botones y pantallas** que cita la ficha (`labels`): deben ser exactamente los de la interfaz (una prueba lo comprueba contra el código).
3. El destino de **«Llévame»** (`go.path`, debe existir en `src/help/routes.ts`; y `go.dest` si la función vive en una pestaña, tema o formulario interno que NO es una ruta: la pantalla lo
   atiende con `useHelpDestinations` y pinta su marca con `<HelpDestMark />`, ver `src/help/destinations.ts`) y los pasos/marcas de **«Enséñame»** (`src/help/tours`, marcas `data-help-id` en los
   controles; `startDest` si el tutorial empieza en una vista interna). Si cambias una pestaña o un tema, revisa los destinos que llevan a ella.
   **Regla de visibilidad:** el estado interno de una ficha (`parcial`, `desactivada`, motivos técnicos) es solo para el Centro de Administración. En la Ayuda, `limits` se enseña a todo el mundo
   SOLO si afecta al uso real y está redactado con naturalidad; si es un motivo interno (interruptores, pantallas pendientes…) marca la ficha con `limitsInternal: true`.
4. Su ficha del **inventario del Centro de Administración** (`src/admin/features/featureInventory.ts`: estado, qué falta, límites, verificación y puntos clave de Ayuda).
5. La **explicación ampliada** histórica (`src/help/legacy/legacyHelp.ts`) si la función ya aparecía allí.
6. Si la función tiene **visita guiada** («Conoce esta sección»), **tutoriales** («Enséñame») o **explicaciones** («Cómo funciona PEPA»): revisa `src/help/tours/defs/**` (marcas `data-help-id`, textos
   de los pasos) y `src/help/explainers/**` (lo que afirman y `basedOn`). El **catálogo maestro** (`src/help/master`, prueba `masterCatalog.test.ts`) comprueba que cada sección tiene visita, que ninguna
   visita cambia datos, que ningún tutorial pulsa por la persona borrar/enviar/publicar/pagar y que cada explicación se apoya en archivos y textos de pantalla que existen. Una explicación solo
   afirma lo que el código hace: si cambias el comportamiento (p. ej. cómo se clasifica un ticket o un movimiento), cambia su explicación en el mismo cambio.
7. **Soporte técnico** (`src/support`, migración pendiente `supabase/pending-migrations/0310_support_tickets.sql`): está APAGADO por `SUPPORT_ENABLED = false` hasta que la migración se revise y se aplique;
   una prueba impide encenderlo sin la migración en `supabase/migrations`. Los avisos nunca llevan datos privados; el contexto técnico es una lista blanca (idéntica en el servidor y en `src/support/context.ts`).
   La IA para Soporte NO está activada: `src/support/responder.ts` solo define contratos.

Comprobaciones automáticas (`npm test`): `src/help/catalog/catalog.test.ts` (botones citados existen en el código, rutas reales, fichas ↔ inventario) y
`src/help/catalog/ayuda01.test.ts` (trinquete: toda función del inventario tiene ficha, la cobertura no empeora, sin rutas rotas). La **deuda histórica** está identificada en
`src/help/helpDebt.ts` y NO bloquea publicaciones; una función **nueva** sin ficha, o una cobertura que baje, SÍ hace fallar las pruebas. No añadas funciones nuevas a la lista de
deuda para esquivar la regla. Al mejorar la Ayuda, **sube** los pisos de `helpDebt.ts`.

Ayuda con IA: solo puede ELEGIR entre fichas verificadas ya filtradas por permisos; nunca escribe el texto que ve la persona ni inventa botones, rutas, permisos o comportamientos.
No se guarda ninguna conversación de Ayuda. Detalle y estado: [`docs/AYUDA_B3_B4_ESTADO.md`](docs/AYUDA_B3_B4_ESTADO.md).
