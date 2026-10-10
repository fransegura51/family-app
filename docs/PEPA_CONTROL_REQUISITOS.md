# Control de requisitos — PEPA

Registro maestro de requisitos de producto para PEPA: lo que se ha acordado,
lo que está implementado, lo que se ha probado de verdad y lo que falta.
Es el punto de partida obligatorio antes de empezar cualquier encargo nuevo
(ver «Procedimiento obligatorio» más abajo).

## Estados

| Estado | Significado |
|---|---|
| Acordado | Descrito y aceptado como requisito, todavía sin tocar código. |
| Enviado | Llegó en un prompt/encargo concreto, a la espera de implementarse. |
| Implementado | El código existe y pasa los tests automáticos relacionados. |
| Probado | Además de lo anterior, se ha comprobado a mano (navegador/móvil) el comportamiento descrito — abierto **y** cerrado en el caso de componentes plegables. |
| Aprobado | El usuario lo ha confirmado expresamente. **Nunca se marca sin esa confirmación explícita, aunque los tests y la prueba manual hayan ido bien.** |

## Registro

| ID | Módulo | Descripción y comportamiento esperado | Estado | Commit | Pruebas realizadas y evidencia | Pendientes y observaciones |
|---|---|---|---|---|---|---|
| EVT-001 | Eventos · Configurador | Si el lugar incluye música, el configurador debe ofrecer utilizarla o elegir una alternativa, evitando preguntas, tareas y gastos duplicados. | Acordado | — | — | No implementado todavía. Revisar primero cómo se gestiona hoy «Comida incluida en el lugar» (patrón ya resuelto, documentado en `docs/QA_EVENTOS_PENDIENTES.md` #110) para no duplicar lógica. |
| EVT-002 | Eventos · Configurador | Misma lógica que EVT-001 aplicada a la decoración incluida en el lugar. | Acordado | — | — | Depende del diseño que se adopte para EVT-001; implementar en el mismo encargo si es razonable, nunca como copia independiente. |
| EVT-003 | Eventos · Resúmenes de decisión | Sustituir la palabra «Resuelto» por un resumen breve de la respuesta real guardada. No inventar respuestas. | Acordado | — | — | Ya existe precedente parcial (p. ej. «Personas especiales · N» en vez de «Resuelto», tanda integrada, `QA_EVENTOS_PENDIENTES.md` #470-474) — revisar qué resúmenes quedan todavía con el texto genérico. |
| EVT-004 | Eventos · Preguntas plegables | Permitir plegar independientemente los grupos de preguntas dentro de cada sección, conservando sus respuestas. | Acordado | — | — | Comprobar que no colisiona con el aislamiento de pregunta ya existente (Fase 1 del configurador, `QA_EVENTOS_PENDIENTES.md` #420-423). |
| EVT-005 | Eventos · Pagos y fianzas | Compactar también el interior de las tarjetas desplegadas (no solo el estado cerrado). Añadir «+ Añadir pago» para pagos parciales sucesivos, conservando historial y recalculando el saldo pendiente. Reutilizar el sistema de pagos existente. | Acordado | — | — | Auditar `event_payments` y la pantalla de Pagos y fianzas antes de tocar nada — el requisito pide reutilizar, no crear un segundo sistema de pagos. |
| EVT-006 | Eventos · Presupuesto | Organizar las partidas en categorías editables con sugerencias automáticas según el tipo de evento. Crear/renombrar/reorganizar categorías y mover partidas. Mostrar subtotales y mantener separados planeado, comprometido (vía encargos), pagado y lo registrado en Economía. | Acordado | — | — | El Presupuesto de evento ya distingue hoy Planeado/Comprometido vía encargos/Pagado de lo comprometido (ver Ayuda, entrada «Presupuesto») — el requisito nuevo es la organización por categorías, no las cuatro cifras, que ya existen. |
| PG-001 | Pequeños Grandes · Hub | Las 3 tarjetas de acceso del hub (Puntos y recompensas / Educación financiera / Lista de deseos) en una sola columna, más pequeñas que la cabecera, proporción 16:9 sin recortar, sin bloques blancos ni subtítulos, imagen completa tocable. Sin generar ni tocar ninguna imagen aprobada. | Implementado | `7078fd9` | Test dedicado `src/ui/pequenosGrandesAccessCardsBloqueAUi.test.ts` (6 tests). `typecheck`/`lint`/`build` en verde. Deploy confirmado con éxito (`gh run watch`). | Verificación manual en navegador/móvil no registrada expresamente en este documento — pendiente de confirmar antes de pasar a Probado. |
| EVT-007 | Eventos · Proveedores | Botones «+ Nuevo proveedor»/«+ Vincular proveedor existente» arriba, visibles sin scroll; texto introductorio plegado en «ℹ️ Qué es esto»; menú «⋯» por proveedor (Editar/Llamar/Email/Copiar email/Guardar en contactos/Descartar-Recuperar/Desvincular); descartar o desvincular nunca borra del registro familiar. | Implementado | `1c67ded` | Test dedicado `src/ui/eventosProveedoresOfertasBloqueB1B5B6Ui.test.ts` (19 tests, cubre también EVT-009 y el menú de ofertas). `typecheck`/`lint`/`build` en verde. Deploy confirmado con éxito. | Verificación manual no registrada expresamente en este documento — pendiente de confirmar. |
| EVT-008 | Eventos · Ofertas | Formulario único («OfferFormFields») para crear y editar una oferta: proveedor, nombre opcional, importe total y «¿Qué incluye la oferta?» con Texto libre \| Desglosado. En Desglosado, servicios añadibles antes de guardar la oferta. Cambiar de modo nunca borra servicios ya guardados. «Más detalles (opcional)» agrupa qué NO incluye, fechas, condiciones, notas y adjunto. | Probado | `ef0c12c`, `070da58` | Migración `0232` (aditiva, con rollback). Test dedicado `src/ui/eventosOfertaUnificadaBloqueB3B4Ui.test.ts` (21 tests, incluye el caso «nunca borra en silencio al cambiar de modo» y que el nombre de la oferta se ve en las dos listas de tarjetas). Suite completa 361/361 archivos en verde tras el cambio. `typecheck`/`lint`/`build` en verde. Deploy confirmado con éxito. **Verificación manual real**: flujo completo (crear oferta con servicio en borrador → guardar → editar → detección automática de Desglosado → añadir segundo servicio → guardar → comprobar persistencia) probado en vivo contra los datos reales de Supabase de la familia, con limpieza inmediata de los datos de prueba. | La visualización del nombre de la oferta en las tarjetas (commit `070da58`) se verificó solo con test automático, no con captura real en navegador — sesión caducada al intentar repetirla. Pendiente una comprobación visual rápida la próxima vez que haya sesión abierta. |
| EVT-009 | Eventos · Importación con IA | Selector único (📷 Hacer foto / 🖼️ Galería / 📁 Archivo) reutilizado de `FileOrPdfPicker` para importar presupuestos y fichas de proveedor; corrige el nombre de archivo adjunto cortado en móvil. | Implementado | `1c67ded` | Cubierto por `eventosProveedoresOfertasBloqueB1B5B6Ui.test.ts` y por `src/ui/offerBudgetImportUi.test.ts` (servicios incluidos/excluidos antes de aplicar). `typecheck`/`lint`/`build` en verde. Deploy confirmado con éxito. | Verificación manual en Android/iPhone real no registrada en este documento — pendiente de confirmar. |
| EVT-010 | Eventos · Edición de ofertas | «Editar» abre el mismo formulario que crear, precargado con los servicios y el modo (Texto libre/Desglosado) ya guardados; nunca duplica ofertas; nunca pierde servicios, adjuntos, condiciones ni fechas; respeta el versionado (`supersedesOfferId`). | Probado | `ef0c12c`, `070da58` | Mismo test `eventosOfertaUnificadaBloqueB3B4Ui.test.ts` (carga de servicios existentes, auto-detección de modo, sincronización solo al guardar en Desglosado, actualizar sin duplicar). **Verificación manual real**: editar una oferta de prueba añadiendo un segundo servicio y confirmar en base de datos que ambos persistieron, ya detallado en EVT-008 (mismo flujo). | Igual que EVT-008: el añadido posterior (nombre visible) no se ha vuelto a comprobar a mano. |

## Procedimiento obligatorio desde ahora

Antes de implementar un nuevo encargo sobre PEPA:

1. Consultar este registro maestro.
2. Identificar los requisitos afectados (existentes o nuevos).
3. Comprobar que el prompt recibido no omite ninguna decisión ya acordada aquí.
4. Implementar y probar cada requisito.
5. Actualizar su estado y sus evidencias en la tabla de arriba.
6. Informar expresamente de lo que sigue pendiente — nunca dar un trabajo por cerrado solo porque pasan los tests generales.

Para componentes plegables/desplegables, la prueba manual debe cubrir **tanto el estado abierto como el cerrado**.

Ningún requisito pasa a **Aprobado** sin confirmación expresa del usuario, aunque el resto de evidencia esté completa.
