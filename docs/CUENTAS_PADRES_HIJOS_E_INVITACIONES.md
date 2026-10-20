# Padres e hijos y códigos de invitación de Familia (ESTUDIO — sin implementar)

Estudio del 20/10/2026 pedido por la usuaria. **No se ha cambiado nada.** Marcas: **[Código]** leído en el código; **[No verificado]** no se ha podido comprobar en producción (la base de datos real no es accesible para mí en este momento).

> No confundir: el **código de invitación de PEPA** (alta de una cuenta; 8 letras/números; un solo uso) es cosa distinta del **código de 6 cifras del correo** (solo confirma un correo). El acceso por invitación **no se toca** (ver `docs/CUENTAS_SEGURIDAD_PLAN.md` §1 bis).

## 1. Cómo funciona hoy la invitación de un miembro de Familia

| Pregunta | Respuesta **[Código]** |
|---|---|
| ¿Dónde está el botón? | Familia → pestaña Miembros → en la fila de la persona, el botón **⋯** de la derecha → «🔑 Generar código de acceso» (`FamilyScreen.tsx`, componente `InviteCodeButton`). Solo sale en fichas **sin cuenta** (sin `linked_profile_id`) |
| ¿Quién puede usarlo? | **Solo las administradoras de esa familia**: el ⋯ solo se dibuja si `profile.role === 'admin'`, y el servidor lo exige igual (`generate_member_invite_code`: rol admin y ficha de su propia familia). Una madre o padre con rol «adulto» **no puede**, ni verlo |
| ¿Sale al añadir o al editar? | **Ni una cosa ni otra.** «Añadir miembro» y «Editar» no lo ofrecen; solo el ⋯ de la fila. Tras añadir un hijo no hay ninguna pista de que haya que abrir el ⋯ para darle acceso |
| ¿Existe pero está escondido? | Está accesible, pero oculto detrás del ⋯ (cerrado por defecto) y solo para administradoras. La pantalla de «Únete a tu familia» manda a «Familia → tu nombre → Generar código», que **no es la ruta real** (es ⋯ de la ficha de la persona) |
| Vigencia | 24 horas y un solo uso; generar otro sustituye al anterior |
| Qué hace al usarlo | `join_family_with_code`: crea el perfil de esa persona y lo enlaza a **esa** ficha (no crea una familia aparte). Pide el nombre y, si la ficha no traía fecha de nacimiento, la que escriba quien se registra |

**Cuando una madre o un padre crea la ficha de su hijo y después quiere darle acceso con su propio correo:**
1. Si la madre/padre es **administradora**: ficha → ⋯ → «Generar código de acceso» → el hijo, en su móvil, «¿No tienes cuenta? Crear una» (su correo y contraseña), confirma el correo con el código de 6 cifras, y en «Únete a tu familia» escribe el código de invitación, su nombre y su fecha de nacimiento.
2. Si es solo **adulta/o** (no administradora): **no puede darle acceso**; tiene que pedírselo a una administradora.
3. La madre/padre **no escribe el correo del hijo**: lo pone el propio hijo; hasta ahora la administradora no podía ni ver con qué correo se registró (con el trabajo de cuentas ya lo verá en la ficha).
4. Quien se registra escribe su fecha de nacimiento si la ficha no la trae: **un menor podría poner una fecha de adulto**. Por eso conviene que la ficha ya lleve la fecha antes de generar el código.

## 2. Hallazgo importante: el alta con código parece haber perdido el rol «niño/invitado» y sus secciones **[Código]**, **[No verificado en producción]**

- Hasta la migración 0097 (septiembre), `join_family_with_code` creaba el perfil con el rol que correspondía a la ficha (`child`, `guest`, `admin` o `adult`) y **copiaba a la cuenta las «Secciones a las que puede entrar»** (`allowed_sections`) que la administradora había marcado en la ficha.
- La migración **0217** (08/10/2026, un arreglo solo de un mensaje) volvió a escribir la función partiendo de una versión anterior y **perdió esas dos cosas**; la 0286 (17/10/2026, fecha de nacimiento obligatoria) heredó esa versión. Hoy la función crea el perfil como `admin` o **`adult`** y **no copia `allowed_sections`**. Ninguna migración posterior lo arregla.
- Si es así en producción, una cuenta creada con código **desde el 08/10/2026** para un niño o un invitado nace como **adulta sin restricciones**: ve Economía y todo el menú aunque la ficha dijera lo contrario, y las reglas que distinguen a `child` (cartera de Pequeños Grandes con aprobación, lista de deseos, destinatarios de avisos, restricciones de Economía) no le aplican; incluso podría aprobar sus propios movimientos (`decide_kid_wallet_transaction` solo excluye a `child`).
- La Comunidad no se ve afectada por esto (decide también por el tipo de ficha).
- **Comprobación de solo lectura que propongo (con tu permiso):**
  `select p.role, fm.member_type, (p.allowed_sections is null) as sin_secciones, count(*) from profiles p join family_members fm on fm.linked_profile_id = p.id group by 1,2,3;`
  Si aparece `role = adult` con `member_type = child` o `guest`, es real y hay que corregir esas cuentas.
- **Arreglo más sencillo y seguro (propuesta):** un disparador (trigger) en `family_members` que, cuando se enlaza una cuenta (`linked_profile_id`), copie a su perfil el rol y las secciones de la ficha. **No toca `join_family_with_code` ni ninguna comprobación de invitación**, así que la puerta queda igual. Más una corrección de las cuentas ya creadas mal. Necesita tu autorización (toca datos de producción).

## 3. Mejoras sencillas del proceso de invitación (sin tocar las restricciones)

Todas usan **las mismas funciones y reglas** (administradora de la familia, 24 h, un solo uso, invitación obligatoria):
1. **Hacerlo visible:** en cada ficha sin cuenta, una etiqueta «Sin acceso a PEPA» y un botón «Dar acceso» a la vista (no escondido en ⋯), que llama a la misma función.
2. **Ofrecerlo al crear:** al añadir una persona (adulta, niña/o o invitada/o; no bebé) preguntar «¿Quieres darle acceso a PEPA ahora?» y, si sí, enseñar el código.
3. **Fecha de nacimiento antes del código** para menores (evita la fecha falsa) y texto de ayuda correcto en «Únete a tu familia» (ruta real).
4. **Copiar / compartir el código** por el menú de compartir del móvil, con las instrucciones paso a paso.
5. **Corregir el rol y las secciones** (hallazgo §2).
6. **Opcional, para más adelante:** que una madre/padre vinculado (§4) pueda generar el código **solo de la ficha de su hijo menor**, aunque no sea administradora. Sigue siendo un código de la familia, de un solo uso, y no abre el registro; pero amplía quién puede generarlo, así que necesita tu aprobación expresa.

## 4. «Es mi hijo/a»: vínculo entre padres e hijos

### Qué datos ya existen y se pueden reutilizar **[Código]**
| Dato | Qué es | Sirve para |
|---|---|---|
| `family_members` | Todas las **personas** de la familia (con o sin cuenta): tipo (admin/adulto/niño/bebé/invitado), fecha de nacimiento, `linked_profile_id` (su cuenta, si la tiene) | Es el sitio natural de «ficha» y de «tiene o no acceso» |
| `profiles` | La **cuenta** (identificador de Supabase Auth, rol `admin/adult/guest/child`, secciones) | Es el sitio de la cuenta de acceso |
| Funciones `private.current_family_id()`, `current_role_in_family()`, `current_member_id()` | Quién eres y de qué familia | Las comprobaciones de permisos |
| `community_minor_permission_log.guardian_declared` (0277) | Un registro de «soy madre/padre/tutor» al autorizar Comunidad | **Solo un registro**: no dice de quién ni de quién es tutor. Más adelante podría leer el vínculo nuevo en vez de pedir la declaración cada vez |
| Pequeños Grandes (`kid_wallet_*`) | Aprobar movimientos de un niño lo hace «cualquier adulto» | Hoy no distingue padres de otros adultos |

**No existe ninguna relación «padre/madre/tutor de»** entre personas. Para registrar el vínculo hace falta **una tabla nueva y pequeña**; todo lo demás se reutiliza.

### Propuesta mínima
Tabla `family_member_guardians`: una fila por cada vínculo (hijo ↔ madre/padre/tutor), referida a **fichas** (`family_members`), no a cuentas, así que se puede registrar aunque el hijo aún no tenga acceso:
- `child_member_id`, `guardian_member_id`, tipo (`parent` = «es mi hijo/a»; `legal_guardian` = tutor), estado (`pending` → `active` → `revoked`), quién lo declaró y cuándo, quién lo confirmó y cuándo, quién lo revocó.
- **Dos o más** vínculos por hijo: sin límite de diseño; propongo tope de 2 activos (se puede cambiar).
- Se escribe **solo con funciones del servidor** (nadie inserta a mano), y la base de datos lo exige:
  - ambos de la misma familia; quien es madre/padre/tutor es **adulta/o o administradora con cuenta**; el hijo es **menor de 18** (por fecha de nacimiento, o niño/bebé si no hay fecha);
  - **nunca** una persona adulta puede ser el «hijo» de un vínculo: así **no se pueden dar permisos sobre cuentas de otros adultos**;
  - sin vínculos consigo mismo, sin duplicados.
- Los poderes **caducan solos a los 18 años** (se comprueban al actuar, no se confía en un dato guardado).

### Cómo se comprueba la autorización (no basta con marcar una casilla)
1. **Identificación reciente** de quien declara (contraseña o código al correo, menos de 5 minutos), la misma comprobación que usa la recuperación del PIN.
2. **Declaración expresa** («soy su madre/padre/tutor legal») registrada con fecha, como ya se hace en Comunidad.
3. **Confirmación de otra persona adulta de la familia** cuando exista: si Jennifer declara a Eric como hijo, Paco (u otra adulta) lo confirma, y viceversa. Si en la familia solo hay una persona adulta con cuenta, no hay nadie a quien proteger y se activa tras los pasos 1 y 2. Un **segundo vínculo** sobre un menor que ya tiene uno exige la confirmación de quien ya está vinculado.
4. **Avisos**: al activarse, al revocarse y en cada acción sensible, notificación a las demás personas vinculadas.
5. Cada madre/padre puede revocar **su** vínculo; las administradoras de la familia, cualquiera (decisión tuya).

### Qué permite (y qué no)
- **Fase A (propongo empezar aquí):** registrar el vínculo, verlo en la ficha y mejorar la invitación (§3). Todavía **no concede ningún poder** sobre cuentas.
- **Fase B (después, con tu aprobación):** que una madre/padre **vinculado** gestione el **correo** de su hijo menor **con cuenta propia**. Hoy cada persona cambia su correo ella misma (ya hecho). Para el caso «el hijo no puede» hace falta una función de servidor con la clave de servicio, y Supabase **no trae** un cambio de correo iniciado por otra persona con verificación; opciones: (1) pedir el cambio con la sesión del hijo (el hijo mete un código que le da su madre/padre), o (2) una función propia que verifique un código enviado a la **dirección nueva** y avise al correo antiguo y a la otra madre/padre. Se decide cuando haga falta, y antes se prueba en un entorno de pruebas qué hace exactamente Supabase al cambiar un correo por administración **[No verificado]**.
- **Nunca:** la contraseña, el PIN ni la sesión del menor; nada sobre una persona adulta; el vínculo no convierte a nadie en administradora.
- **Ficha ≠ cuenta:** en la ficha se verán dos cosas distintas: «Es mi hijo/a» (relación, sirve sin cuenta) y «Dar acceso» (invitación para crear una cuenta; solo con código). Marcar el vínculo **no crea ninguna cuenta ni salta la invitación**.

### Coste
Una tabla pequeña. Para verlo en Familia no hace falta una llamada más si se añade a la función que ya devuelve los correos de la familia (hoy una por apertura para administradoras).

## 5. Decisiones que necesito
1. ¿Autorizas la comprobación de solo lectura del §2 (y, si sale mal, el arreglo con disparador y la corrección de cuentas)? **Es lo más urgente.**
2. ¿Empezamos por la Fase A (vínculo + invitación más visible) y dejamos los poderes sobre el correo de los hijos para la Fase B?
3. Confirmación del vínculo por otra persona adulta: ¿sí (propuesto) o basta con tu declaración y la identificación?
4. ¿Tope de 2 madres/padres/tutores por hijo y quién puede revocar?
5. ¿Una madre/padre vinculado puede generar el código de acceso de la ficha de su hijo menor aunque no sea administradora (§3.6)?
