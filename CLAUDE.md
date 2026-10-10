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
