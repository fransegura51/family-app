# Preparación para un futuro modelo por planes (freemium)

Documento de **preparación**, no de implementación. Creado el 30/10/2026 a partir del BLOQUE 9 del encargo «Contactos, Gestión de grupos e importaciones inteligentes».

## Qué se ha hecho (y qué no)

- **Hecho:** un único punto de comprobación, `src/domain/entitlements.ts` (`checkEntitlement(función, contexto)`), que hoy responde **siempre «sí»**. Cuando exista un modelo comercial real, bastará con cambiar esa función y llamarla en los puntos de entrada de cada función; el resto de la app no cambia.
- **No hecho a propósito:** ningún plan, precio, cupo ni restricción. **No se bloquea a ninguna persona actual.** No se han introducido precios ficticios. No se limita ningún evento, bote, formulario ni conexión bancaria.
- La prueba `src/domain/entitlements.test.ts` garantiza que todo sigue permitido y que no aparecen precios ni planes en el código del módulo.

## Decisiones comerciales pendientes (de la persona responsable)

1. **Suscripción familiar** (una suscripción por familia).
2. **Número de miembros:** hoy sin límite; pendiente de revisión.
3. **Posibles planes:** Gratis, Flexible y Completo (nombres provisionales, sin contenido decidido).
4. **Conexiones bancarias:** incluidas con un límite, y suplemento por conexiones adicionales.
5. **Acceso limitado a módulos relacionados.** Ejemplo ya identificado: organizar un evento desde Gestión de grupos como *prueba* del módulo Eventos. **Solo se documenta la posibilidad de limitar a un evento en una fase comercial futura; no se implementa.**

## Cuando se decida el modelo

- Definir los planes y qué incluye cada uno **antes** de tocar código.
- Decidir qué pasa con las familias actuales (por defecto: conservan todo lo que ya usan).
- Añadir el plan de la familia (tabla y permisos de servidor: la comprobación **no** puede vivir solo en la interfaz) y cambiar `checkEntitlement`.
- Revisar la Ayuda (AYUDA-01) y el Centro de Administración (inventario) de cada función afectada.
