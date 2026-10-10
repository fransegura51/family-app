# Control de requisitos — PEPA

Registro maestro de requisitos de producto para PEPA: lo que se ha acordado,
lo que está implementado, lo que se ha probado de verdad y lo que falta.
Es el punto de partida obligatorio antes de empezar cualquier encargo nuevo
(ver «Procedimiento obligatorio» más abajo).

**Reconstrucción 2026-10-10**: los identificadores `EVT-007` a `EVT-010`
(creados el 2026-10-09 antes de recuperar el texto literal del prompt
consolidado) mezclaban varios requisitos distintos bajo un solo ID. Se
sustituyen por IDs ligados a su apartado real del prompt original
(`EVT-A1`...`EVT-K`), con el ID antiguo conservado como alias para no perder
la trazabilidad de los commits ya hechos.

## Prompts origen (localizados literalmente en la transcripción, nunca por resumen)

| Alias | Prompt | Fecha/hora | Apartados |
|---|---|---|---|
| **CONSOLIDADO** | «PROMPT MAESTRO CONSOLIDADO DE MEJORAS DE EVENTOS» | 2026-10-09 11:16 | Partes A-K (proveedores, ofertas, encargos, presupuesto, pagos, calendario, configurador, seguridad, fases, pruebas, informe) |
| **PG-MAESTRO** | «PROMPT MAESTRO PARA CLAUDE CODE — PEPA — NUEVA SECCIÓN "PEQUEÑOS GRANDES"» | 2026-10-09 17:46 | Fases 1-18 |
| **CONTROL-REQ** | Encargo de implantar este mismo registro | 2026-10-10 06:45 | EVT-001 a EVT-006 (pendientes dictados directamente, sin corresponder 1:1 a un apartado del CONSOLIDADO) |
| **RECUPERACIÓN** | «ORDEN DE RECUPERACIÓN INTEGRAL DE REQUISITOS PENDIENTES» | 2026-10-10 (sesión actual) | Ejecución de todo lo pendiente de CONSOLIDADO + PG-MAESTRO |

## Estados

| Estado | Significado |
|---|---|
| Acordado | Descrito y aceptado como requisito, todavía sin tocar código. |
| Pendiente | Revisado contra el código real: no hay ninguna implementación. |
| Parcial | Existe código real, pero no cubre todo lo pedido — ver columna Pendientes para el detalle exacto. |
| Implementado | El código cubre el requisito completo y pasa los tests automáticos relacionados. |
| Probado | Además de lo anterior, se ha comprobado a mano (navegador/móvil) el comportamiento descrito — abierto **y** cerrado en el caso de componentes plegables. |
| No verificable | Requiere una comprobación puramente manual/de proceso que no deja rastro en el código (auditorías, pruebas en dispositivo real). |
| Aprobado | El usuario lo ha confirmado expresamente. **Nunca se marca sin esa confirmación explícita, aunque los tests y la prueba manual hayan ido bien.** |

---

## Parte A — Registro global de proveedores (CONSOLIDADO)

| ID | Descripción | Estado | Commits / archivos | Pruebas | Dependencias | Pendientes |
|---|---|---|---|---|---|---|
| EVT-A1 | Acceso "Proveedores y ofertas" desde Eventos→Inicio, sin depender de un evento | Implementado | `868a532`, `EventosScreen.tsx:775-786,874` | Cubierto por suite general de Eventos | — | — |
| EVT-A2 | Registro global: buscar, histórico de ofertas por evento, valoraciones, habituales | Parcial | `providersGlobal.ts:44-103`; histórico → `listOfferHistoryForProvider` (`c67f6d8`) | `eventosProveedorHistorialOfertasUi.test.ts` (8 tests) | EVT-A5 (ficha provisional) | "Habitual" no se ve en la pantalla global (solo dentro de un evento); sin campo de valoraciones/comentarios privados — no implementado todavía |
| EVT-A3 | Renombrar módulo, vista exclusiva por evento, filtros De interés/Todos/Descartados, archivar no borra | Implementado | `614f5f2` *(alias anterior: EVT-007)* | `eventosProveedoresOfertasBloqueB1B5B6Ui.test.ts` | — | — |
| EVT-A4 | Fichas compactas cerrado/abierto, buscador, sin botones ambiguos | Parcial | `EventosScreen.tsx:12770-12774,13108-13112`; breadcrumb "Inicio" duplicado corregido (`e92c9d8`) | `eventosProveedoresBreadcrumbUi.test.ts` (5 tests) | — | Datos de contacto siguen sin colapsar en la vista cerrada; sin buscador dentro de la vista de un evento (solo en el registro global) |
| EVT-A5 | Ficha provisional si no existe, sugerencias al escribir, detectar duplicados sin fusionar sola | Implementado (en ofertas de un encargo) | `findProviderGlobalMatch` (`providersGlobal.ts`), `AddOfferForm` (`c67f6d8`) | `eventosOfertaProveedorAutoVinculoUi.test.ts` (9 tests) | — | Mismo patrón NO aplicado todavía a "Resolver encargo" con proveedor nuevo (`ResolveGroupModal`) ni a `AddProviderAndLinkForm` (alta directa desde Proveedores de un evento) — pendiente en una fase posterior |
| EVT-A6 | Importar con foto/Maps, extraer datos, no sobrescribir, conservar documento original | Parcial | `providerContactDocument.ts`, `AddProviderGlobalForm`; documento conservado (`6b4811c`, migración `0233` + bucket `providers_global`) | `providersGlobalAttachmentUi.test.ts` (13 tests) | — | Sigue sin distinguir WhatsApp de teléfono |
| EVT-A7 | "Guardar en contactos" (.vcf), compartible, no modifica la ficha | Implementado | `3c80f8d`, `EventosScreen.tsx:12588-12609` | `providerSaveToContactsUi.test.ts` | — | — |

## Parte B — Ofertas y presupuestos de proveedores (CONSOLIDADO)

| ID | Descripción | Estado | Commits / archivos | Pruebas | Dependencias | Pendientes |
|---|---|---|---|---|---|---|
| EVT-B1 | Ofertas independientes de encargos, 3 puntos de entrada, sin efectos colaterales | Implementado | `b74cfdc`, `eventTaskGroups.ts:303-329` | `eventTaskGroupLooseOffersUi.test.ts` | — | — |
| EVT-B2 | Servicios estructurados, 3 totales distinguidos, descuentos/impuestos *(alias anterior: parte de EVT-008)* | Parcial | `61d975a`, `OfferItemsPanel` | `eventTaskGroupOfferItemsUi.test.ts` | — | Descuentos/impuestos no son datos propios, solo texto libre en condiciones/notas |
| EVT-B3 | Importar PDF/foto, extraer datos, descuentos/impuestos, revisión previa *(alias anterior: parte de EVT-008/EVT-009)* | Parcial | `offerBudgetDocument.ts`, `ImportOfferBudgetButton`; número de presupuesto + exclusiones + nombre descriptivo de oferta/adjunto (`1093a45`, función de servidor desplegada — versión 2) | `offerBudgetDocumentSpec.test.ts`, `eventosOfertaNumeroPresupuestoUi.test.ts` (22 tests) | — | Sigue sin descuentos/impuestos como datos propios (mismo hueco que EVT-B2) |
| EVT-B4 | Comparar ofertas, versiones, recuperar descartadas, diferenciar descartar/desvincular/eliminar *(alias anterior: EVT-010)* | Implementado | `ef0c12c`, `070da58`, `OffersComparison`; comparador independiente (EVT-C1) y "Desvincular" (`a1bfb00`, `unlinkTaskGroupOfferFromGroup`) | `eventosOfertaUnificadaBloqueB3B4Ui.test.ts` (21 tests), `eventosComparadorOfertasIndependienteUi.test.ts` (7 tests) | EVT-C1 | — |
| EVT-B5 | Histórico de ofertas de eventos anteriores visible en el registro global, sin trasladarse sola | Implementado | `c67f6d8`, `listOfferHistoryForProvider` | `eventosProveedorHistorialOfertasUi.test.ts` | EVT-A2 | — |

## Parte C — Encargos y preparativos (CONSOLIDADO)

| ID | Descripción | Estado | Pendientes |
|---|---|---|---|
| EVT-C1 | "Consultar ofertas disponibles" sin obligar a resolver el encargo | Implementado (`a1bfb00`, `OffersComparisonModal`, reutiliza `OffersComparison`) | — |
| EVT-C2a | Seleccionar servicios, precargar, calcular total, confirmar | Implementado | Funciona para un único proveedor por encargo |
| EVT-C2b | Contratar con varios proveedores en el mismo encargo | Pendiente | Un encargo solo admite una resolución/proveedor hoy |
| EVT-C2c | Trazabilidad oferta→servicios→encargo→presupuesto→pago | Parcial | Oferta↔resolución sí; resolución/pago↔presupuesto sin FK (requiere Parte D) |
| EVT-C3a | Distinguir presupuestar/elegir oferta/confirmar/ejecutar/completar tareas | Implementado | — |
| EVT-C3b | Revisar el texto "¿Cómo se ha resuelto?" | Pendiente | Texto sin tocar desde el prompt |
| EVT-C4 | Precio total o desglosado al resolver, no sobrescribir sin confirmación | Parcial | Desglose solo existe hoy en Ofertas; `ResolveGroupModal`/`AddPaymentModal`/`AddBudgetItemModal` siguen con un único campo numérico |
| EVT-C5a | Color por encargo, integrado con Pastel/Vivo/Neutro, sin fusionar | Implementado | — |
| EVT-C5b | Plegar/desplegar cada encargo individualmente | Pendiente | Solo hay togglees globales (mostrar todas/completadas), no por encargo |

## Parte D — Presupuesto (CONSOLIDADO) — también cubre EVT-006

| ID | Descripción | Estado | Pendientes |
|---|---|---|---|
| EVT-D1 | Distinguir Planeado/Comprometido/Pagado/Gastado | Parcial | Existen, pero solo como totales agregados de TODO el evento, nunca por partida |
| EVT-D2 | Consultar por Concepto/Encargo/Proveedor/Categoría | Pendiente | `event_budget_items` no tiene columnas `provider_id` ni `group_id` — falta en el esquema, no solo en la UI |
| EVT-D3 | Desgloses si existen, totales simples si no | Pendiente | Las partidas son una línea plana sin conceptos |
| EVT-D4 | Evitar duplicar importes | Implementado | — |
| EVT-D5 | Gasto bancario ≠ pago manual en Eventos | Implementado | — |
| EVT-D6 | Importes desconocidos ≠ cero | Implementado | — |
| EVT-D7 | Preservar partidas manuales e historial | Parcial | Se preservan los datos; sin historial consultable de cambios |
| EVT-006 *(alias de EVT-D2+D3)* | Categorías editables con sugerencias automáticas, partidas agrupadas plegables con subtotales | Pendiente | Mismo hueco de esquema que EVT-D2 — necesita migración (categoría/encargo/proveedor en `event_budget_items`) |

## Parte E — Pagos y fianzas (CONSOLIDADO) — también cubre EVT-005

| ID | Descripción | Estado | Pendientes |
|---|---|---|---|
| EVT-E1 | Tarjetas compactas desplegables | Implementado | — |
| EVT-E2 | Vista principal con 8 campos (incl. barra de progreso) | Parcial | Solo 4 de 8 visibles sin desplegar; **la barra de progreso no existe en ningún sitio del archivo** |
| EVT-E3 | Ordenar por 6 criterios | Pendiente | Sin estado de ordenación |
| EVT-E4 | 3 filtros Todos/Pendientes/Pagados | Implementado | — |
| EVT-E5 | Agrupar por categoría o proveedor | Pendiente | `event_payments` no tiene columna `category` — falta en el esquema |
| EVT-E6 | Al desplegar: desglose contratado, pagos parciales, fechas, fianzas, documentos, historial | Pendiente | Solo existe corregir un importe acumulado (`deposit_paid`), no una lista de pagos parciales con fecha |
| EVT-E7 | Mantener "Corregir lo pagado" | Implementado | — |
| EVT-E8 | No duplicar importes / sin movimientos bancarios automáticos | Implementado | — |
| EVT-005 *(alias de EVT-E2+E3+E5+E6)* | "+ Añadir pago" con historial de pagos parciales, fianzas, documentos | Pendiente | Necesita migración (tabla de pagos parciales en vez de un acumulado) |

## Parte F — Calendario (CONSOLIDADO)

| ID | Descripción | Estado |
|---|---|---|
| EVT-F1 | Preservar correcciones anteriores (overflow, FAB, navegación) | Implementado — regresión en sí no verificable por código |
| EVT-F2 | Auditar colores por calendario/persona | Implementado el mecanismo — auditoría de contraste no verificable |
| EVT-F3 | Integración con Eventos (fechas, sin duplicados, ofertas no crean eventos) | Implementado |
| EVT-F4 | Auditoría de pendientes de Calendario como entregable propio | Pendiente — no existe documento dedicado |

## Parte G — Configurador de eventos (CONSOLIDADO) — también cubre EVT-001/EVT-002

| ID | Descripción | Estado | Pendientes |
|---|---|---|---|
| EVT-G1 | Reglas generales (no repreguntar, 5 estados, no inventar) | Implementado | — |
| EVT-G2 *(alias: EVT-001)* | Música del lugar reflejada automáticamente, combinar fuentes | **Implementado — bug real corregido 2026-10-10** | `c67f6d8`: `MusicaFiestaBlock` filtraba sus propias decisiones y descartaba la de "qué incluye el lugar"; corregido. **Sigue pendiente**: indicar en qué parte del evento actúa el DJ/música en directo (Ceremonia/Cóctel/Comida/Baile/Fiesta) |
| EVT-G3 | Canciones en momentos especiales | Parcial | Solo Primer baile tiene canción; Entrada/Salida/Tarta/Ramo/Presentación de fotos no |
| EVT-G4 | Fotos: selección múltiple combinable + excluyentes | Implementado | — |
| EVT-G5 *(alias: EVT-002)* | Decoración del lugar reflejada automáticamente, zonas | **Implementado — bug real corregido 2026-10-10** | `c67f6d8`: mismo bug que G2, en `OtrosDecoracionBlock`. **Sigue pendiente**: el caso "combinación" no desglosa qué zona se contrata vs. cuál hace la familia |
| EVT-003 | Sustituir "Resuelto" por un resumen real en TODOS los resúmenes de decisión | Parcial | Ya existe el patrón (p. ej. Personas especiales) pero no se ha auditado si queda algún resumen con el texto genérico |
| EVT-004 | Plegar independientemente los grupos de preguntas de cada sección | Pendiente | No implementado — revisar que no colisione con el aislamiento de pregunta ya existente |

## Parte H — Seguridad y migraciones (CONSOLIDADO)

Implementado en las migraciones revisadas (RLS explícito por familia, sin fusión automática de proveedores, FKs antiguas preservadas). La auditoría previa como proceso formal (los 10 pasos del prompt) no deja rastro de código — **no verificable** como entregable separado.

## Detalles y recuerdos (no es parte del CONSOLIDADO — origen: tanda "Personas especiales")

| ID | Descripción | Estado | Pendientes |
|---|---|---|---|
| EVT-DET-1 | Completar pendientes de QA_EVENTOS_PENDIENTES.md #495-501 (Personas especiales) | Por auditar | Pendiente de localizar qué de esa lista sigue sin hacer |
| EVT-DET-2 | Investigar filas aparentemente duplicadas y estados Comprado/Pendiente | Por auditar | — |
| EVT-DET-3 | Corregir presentación móvil sin ocultar ni borrar datos | Por auditar | — |

---

## Pequeños Grandes (PG-MAESTRO, 18 fases)

| ID | Fase | Estado | Commits | Pendientes |
|---|---|---|---|---|
| PG-F1 | Auditoría inicial | Implementado | — (sin código, solo auditoría) | — |
| PG-F2 | Inicio de Pequeños Grandes (hub, 3 tarjetas) | Implementado | `b3149f5`, refinado visualmente en `7078fd9` *(alias: PG-001)* | — |
| PG-F3 | Identidad visual y cabeceras | Implementado | `b220a7f` | — |
| PG-F4 | Puntos y recompensas | Implementado | `b3149f5`, bug de permisos corregido en `0231` | — |
| PG-F5 | Educación financiera: reorganización | Implementado | `72fb6bf` | — |
| PG-F6 | Educación financiera: diseño infantil (4 tarjetas) | Implementado | `a824ab8` | — |
| PG-F7 | Ingresos y reparto automático 60/20/20 | Implementado | `40927da`, migración `0230` | — |
| PG-F8 | Autonomía y aprobaciones (adulto aprueba operaciones infantiles) | Pendiente | — | Sin estado "pendiente" en `registerKidIncome`; se aplica directo |
| PG-F9 | Conceptos con emojis (niños que no leen) | Pendiente | — | Sin selector de conceptos visuales en el formulario |
| PG-F10 | Objetivos de ahorro completos | Parcial | `FinanceScreen.tsx:11282-11299` | Barra de progreso y porcentaje sí; emoji/foto por objetivo no |
| PG-F11 | Fondo común de impuestos (aportaciones, historial, gastos) | Pendiente | — | Solo existe una frase explicativa, sin vista agregada |
| PG-F12-16 | Lista de deseos completa (listas, regalos, invitados, reservas, sorpresa) | Pendiente | `PequenosGrandesScreen.tsx` tiene un "coming soon" honesto (`ListaDeseosComingSoon`) | Módulo nuevo completo sin construir — requiere tablas nuevas, enlaces públicos, RLS por enlace, protección de secreto |
| PG-F17 | Auditoría dedicada de seguridad y privacidad | Pendiente | — | No se hizo como fase propia |
| PG-F18 | Integración, Ayuda y pruebas (checklist de 24 + informe de 10 puntos) | Parcial | Ayuda actualizada en cada fase entregada | Checklist específico de 24 puntos no ejecutado como tal |

---

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
