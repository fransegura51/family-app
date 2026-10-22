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

## AYUDA-01 — mantener la Ayuda al día (obligatorio)

La Ayuda de PEPA («Pepa te acompaña», `src/help/`) es parte del producto: no puede volver a quedarse desactualizada. **Cuando crees, modifiques, desactives o elimines una
funcionalidad, en el MISMO cambio revisa:**

1. Su **ficha de Ayuda** (`src/help/catalog/cards*.ts`): título, sinónimos, respuesta breve, pasos, estado (`disponible` / `parcial` / `desactivada`) y su límite si lo tiene. Una
   función apagada o a medias se explica como tal; nunca se vende como disponible.
2. Los **textos de botones y pantallas** que cita la ficha (`labels`): deben ser exactamente los de la interfaz (una prueba lo comprueba contra el código).
3. El destino de **«Llévame»** (`go.path`, debe existir en `src/help/routes.ts`) y los pasos/marcas de **«Enséñame»** (`src/help/tours`, marcas `data-help-id` en los controles).
4. Su ficha del **inventario del Centro de Administración** (`src/admin/features/featureInventory.ts`: estado, qué falta, límites, verificación y puntos clave de Ayuda).
5. La **explicación ampliada** histórica (`src/help/legacy/legacyHelp.ts`) si la función ya aparecía allí.

Comprobaciones automáticas (`npm test`): `src/help/catalog/catalog.test.ts` (botones citados existen en el código, rutas reales, fichas ↔ inventario) y
`src/help/catalog/ayuda01.test.ts` (trinquete: toda función del inventario tiene ficha, la cobertura no empeora, sin rutas rotas). La **deuda histórica** está identificada en
`src/help/helpDebt.ts` y NO bloquea publicaciones; una función **nueva** sin ficha, o una cobertura que baje, SÍ hace fallar las pruebas. No añadas funciones nuevas a la lista de
deuda para esquivar la regla. Al mejorar la Ayuda, **sube** los pisos de `helpDebt.ts`.

Ayuda con IA: solo puede ELEGIR entre fichas verificadas ya filtradas por permisos; nunca escribe el texto que ve la persona ni inventa botones, rutas, permisos o comportamientos.
No se guarda ninguna conversación de Ayuda. Detalle y estado: [`docs/AYUDA_B3_B4_ESTADO.md`](docs/AYUDA_B3_B4_ESTADO.md).
