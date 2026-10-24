# Auditoría de roles y permisos de las cuentas (solo lectura) — 21/10/2026

Consultas **estrictamente de solo lectura** sobre la base de datos de producción (recuentos, sin nombres, correos ni datos personales). No se ha modificado nada.

## Resultado en una frase
**El fallo existe en el código que hay en producción, pero hoy no hay ninguna cuenta afectada**, porque todavía no se ha creado ninguna cuenta de niño ni de invitado con código. Es un riesgo latente: **la primera cuenta de niño o de invitado que se creara con código nacería como «adulta» sin restricciones.**

## 1. ¿Existe el fallo en producción? Sí, en el código
Las funciones que hay desplegadas son exactamente las de la migración 0286 (comprobado por su definición):

| Función | Asigna rol `child` | Asigna rol `guest` | Copia las secciones de la ficha | Comprueba caducidad | Bloquea la fila (uso simultáneo) |
|---|---|---|---|---|---|
| `join_family_with_code` | **no** | **no** | **no** | sí | **no** |
| `create_family` | — | — | — | sí | **no** |

Origen: la migración 0097 creaba la cuenta con el rol de la ficha (niño, invitado, administradora o adulta) y copiaba las «secciones a las que puede entrar»; la 0217 (08/10/2026, un arreglo solo de un mensaje) reescribió la función partiendo de una versión anterior y lo perdió; la 0286 (17/10/2026) lo heredó.

## 2. ¿Cuántas cuentas están afectadas? Ninguna
Cuentas vinculadas a una ficha: **9**

| Rol de la cuenta | Tipo de la ficha original | Cuentas | Restricciones de secciones |
|---|---|---|---|
| administradora | administradora | 8 | sin restricción (ficha y cuenta, coinciden) |
| adulta | adulta | 1 | sin restricción (coinciden) |

- No hay **ninguna** cuenta con rol de niño o de invitado, ni ficha de niño, bebé o invitado con cuenta (6 fichas de niño y 2 de bebé, **todas sin cuenta**).
- No hay menores con permisos de adulto, ni invitados con permisos superiores a los previstos.
- Perfiles sin ficha enlazada: **0**. Perfiles totales: 9 (8 administradoras, 1 adulta). Familias: 7. Administradoras de PEPA (`is_app_owner`): 2.
- Hay una ficha **de bebé** con un código de invitación **caducado** (se generó alguna vez; la nueva versión no admite cuentas de bebé).

## 3. Qué operaciones sensibles se habrían podido hacer mal (si hubiera cuentas afectadas)
Un niño o invitado creado como «adulta» habría podido: ver **Economía** y todo el menú (las restricciones de secciones se leen de la cuenta, que quedaría sin ellas); no estar sujeto a las reglas de **Pequeños Grandes** que distinguen al niño (cartera con aprobación de movimientos, lista de deseos, destinatarios de avisos, Economía restringida); y **aprobar sus propios movimientos** (la aprobación solo excluye al rol niño). Hoy esto **no ha ocurrido** con ninguna cuenta real.

## 4. Otros hallazgos de la auditoría (datos y diseño)
1. **Código maestro permanente en el Vault** (`family_signup_code`): existe y permite crear familias sin invitación de un solo uso. Es compatibilidad antigua. **Decisión pendiente tuya:** rotarlo o retirarlo cuando el nuevo sistema de invitaciones esté desplegado (el nuevo sistema lo sigue aceptando para no romper nada hasta que lo decidas).
2. **Ninguna cuenta huérfana**: hay 9 logins y 9 perfiles. Nadie ha creado un login sin invitación hasta hoy.
3. **Invitaciones de familia nueva**: 2 usadas (08/10 y 12/10), ninguna vigente.
4. **Sin bloqueo de uso simultáneo** en las dos funciones de alta (dos personas podrían, en teoría, gastar el mismo código a la vez).
5. **Cualquier administradora de familia podía escribir a mano, en la tabla de fichas, el código de invitación, su caducidad y el enlace con una cuenta** (permiso de columnas abierto): se saltaba las 24 horas y podía mover quién es madre/padre vinculado. La app nunca lo hace (comprobado en el código). Corregido en la propuesta (disparador en 0301).
6. **Fichas de niño sin fecha de nacimiento: 2** (de 6). Con la propuesta, un niño no puede unirse mientras su ficha no tenga fecha (la pone quien invita, no el menor). **Fichas de administradora o adulta sin fecha: 5** (siguen siendo «adultas» a efectos de Comunidad, como hasta ahora).
7. Solo los administradores de familia pueden crear, editar y borrar fichas (reglas de seguridad de filas): comprobado.
8. Hay 3 disparadores en las fichas (comprobar que la cuenta enlazada es de la misma familia, recalcular exclusión de IA y registro de actividad). El permiso de insertar o borrar perfiles está retirado a la app (0276).

## 5. Propuesta de corrección (preparada en la rama, **sin aplicar**)

> **Actualización 24/10/2026:** las migraciones 0299 a 0303 están APLICADAS en producción desde el 21/10/2026 (verificado). Donde este documento diga «sin aplicar» o «sin desplegar» sobre ellas es histórico. Ver `docs/ESTADO_MIGRACIONES_0299_0303.md`.
Está en `supabase/migrations/0301_invitation_hardening.sql` (con su rollback). Necesita tu autorización antes de aplicarse.

| Pieza | Qué hace |
|---|---|
| Restaurar roles | `join_family_with_code` vuelve a asignar el rol de la ficha: administradora → admin; invitado → guest; niño → child; el resto → adulta. **Nunca depende de lo que escriba la persona** |
| Restaurar secciones | copia a la cuenta las secciones de la ficha |
| Prevenir futuras asignaciones erróneas | (a) la edad y el rol salen de la ficha, no de la fecha tecleada en el registro; (b) un niño exige fecha de nacimiento en su ficha; (c) una cuenta de adulta no se crea con una fecha de menor; (d) un bebé no tiene cuenta; (e) un disparador impide escribir a mano el código, su caducidad y el enlace con la cuenta; (f) las pruebas (abajo) fallan si alguien vuelve a perder el mapeo |
| Cuentas ya creadas mal | **No hay ninguna**, así que no hace falta corregir datos. Si apareciera alguna, la detecta esta consulta de solo lectura, y la corrección sería puntual y con tu autorización: |

```sql
-- Detección (solo lectura): cuentas cuyo rol no corresponde al tipo de su ficha.
select p.role as rol_cuenta, fm.member_type as tipo_ficha, (p.allowed_sections is null) as cuenta_sin_secciones, count(*) as cuentas
from profiles p join family_members fm on fm.linked_profile_id = p.id
where p.role <> case fm.member_type when 'admin' then 'admin' when 'guest' then 'guest' when 'child' then 'child' else 'adult' end
   or (fm.allowed_sections is not null and p.allowed_sections is distinct from fm.allowed_sections)
group by 1,2,3;
-- Corrección (SOLO con autorización, y mirando antes las filas devueltas): igualar rol y secciones a los de la ficha.
-- update profiles p set role = case fm.member_type when 'admin' then 'admin' when 'guest' then 'guest' when 'child' then 'child' else 'adult' end,
--        allowed_sections = fm.allowed_sections from family_members fm where fm.linked_profile_id = p.id and p.id in (… las filas revisadas …);
```

**Pruebas de seguridad hechas (en un PostgreSQL local con las migraciones reales, 51 pruebas):** el menor queda como `child` con las secciones de su ficha; el invitado como `guest`; la adulta como `adult`; la fecha de la ficha manda sobre la escrita; una cuenta de adulta no se crea con fecha de menor; un bebé no tiene cuenta; un login sin invitación no crea nada. Además 40 pruebas sobre el texto del SQL y de la app (`src/data/invitationGate.test.ts`).

**Reversión:** `supabase/rollbacks/0301_invitation_hardening_down.sql` devuelve `create_family` y `join_family_with_code` a las definiciones exactas de producción (0286) y quita lo añadido. Aplicarla antes de que nadie haya usado las funciones nuevas no pierde datos.

**Consulta de solo lectura para repetir esta auditoría cuando quieras** (sin datos personales): ver las consultas de arriba y las de recuento de `supabase/local-sql-tests/README.md`.
