# Padres, tutores e hijos · invitaciones de Familia (Fase A implementada en la rama; sin aplicar)

Decisiones definitivas del 20/10/2026. Estado: **Fase A preparada en la rama `feature/cuentas-seguridad`, probada en local, SIN aplicar en producción**. Fase B (gestionar el correo de los menores) **aplazada**: aquí solo está su diseño técnico.

> **Actualización 24/10/2026:** las migraciones 0299 a 0303 están APLICADAS en producción desde el 21/10/2026 (verificado). Donde este documento diga «sin aplicar» o «sin desplegar» sobre ellas es histórico. Ver `docs/ESTADO_MIGRACIONES_0299_0303.md`.

> No confundir: el **código de invitación de PEPA** (alta de una cuenta; un solo uso; caduca) es otra cosa que el **código de 6 cifras del correo** (solo confirma un correo). PEPA sigue siendo privada: sin invitación válida no se crea ninguna cuenta. Ver `docs/CUENTAS_SEGURIDAD_PLAN.md` §1 bis.

## 1. Quién es quién (los permisos no se mezclan)
| Figura | Qué es | Qué puede hacer con invitaciones y vínculos |
|---|---|---|
| **Administradora de PEPA** | `profiles.is_app_owner` (hoy 2 cuentas) | Generar invitaciones de **familia nueva**. No tiene poderes sobre familias ajenas por serlo |
| **Administradora de familia** | `profiles.role = 'admin'` de **esa** familia | Crear, editar y borrar fichas; dar acceso (invitación familiar) a cualquier ficha sin cuenta de **su** familia, salvo bebés. **No** puede retirar el vínculo de otra persona ni cambiar quién es madre/padre vinculado |
| **Madre/padre/tutor vinculado** | Persona adulta o administradora con un vínculo **vigente** sobre la ficha de un menor de 18 | Dar acceso **solo a la ficha de ese menor** (niño). No puede invitar a adultos ni a invitados, ni gestionar invitaciones de otras fichas |
| **Persona adulta** | `role = 'adult'` | Puede **declararse** madre/padre/tutor de un menor de su familia; sin vínculo no invita a nadie |
| Invitado / niño con cuenta | `role = 'guest'` / `'child'` | No declaran vínculos ni invitan |

La comprobación se hace **siempre en el servidor** (funciones con `SECURITY DEFINER`); ocultar o enseñar un botón nunca es la seguridad.

## 2. «Es mi hijo/a»: declaración y verificación (hecho)
Procedimiento (decisión 3; **no** exige confirmación de otra persona adulta):
1. Una persona adulta (o administradora) con cuenta pulsa **«👪 Es mi hijo/a»** en la ficha de un menor.
2. PEPA muestra una **declaración expresa** de responsabilidad parental o tutela y pide aceptarla.
3. PEPA exige una **identificación reciente** (contraseña o código del correo, menos de 5 minutos) con el sistema de acceso de siempre.
4. El servidor registra el vínculo con **titular, fecha, tipo y versión de la declaración**.

**Honestidad:** la declaración **no es una verificación documental** de la filiación ni de la tutela, y la app lo dice (`«PEPA no comprueba este vínculo con documentos»`). Un test impide que el texto diga «verificado», «certificado» o «acreditado».

Qué comprueba el servidor (`declare_guardianship`, probado con datos): rol adulta/administradora con cuenta; identificación reciente; declaración aceptada; la ficha es de la **misma familia** y de un **niño o bebé menor de 18**; no eres tú; no está ya vinculado. **Imposible sobre una persona adulta:** una ficha «niño» ya mayor de 18, una ficha de adulta o una ficha con cuenta de rol adulta no cuentan como menores. Nadie puede declarar a **otra** persona como madre/padre (el tutor es siempre quien llama).

## 3. Modelo de datos (0300)
Se reutilizan `family_members` y `profiles`. Solo hay **una tabla nueva** de vínculos y una de historial:
- `family_member_guardians`: hijo (ficha), madre/padre/tutor (ficha), tipo (`parent` o `legal_guardian`), estado (`active`/`revoked`), quién declaró, cuándo, versión de la declaración, y los datos de una eventual retirada. **Sin límite de tutores por menor** (familias reconstituidas, tutelas…): cada vínculo es una fila independiente. Un mismo vínculo vigente no se repite (índice único), el historial de retirados se conserva.
- `family_guardian_events`: registro de «declarado» y «retirado», que se conserva aunque cambie el vínculo.
- **Vinculado a las fichas**, no a las cuentas: el menor puede no tener cuenta. La madre/padre sí necesita cuenta para declarar (se identifica con ella).
- Seguridad de filas: leen los vínculos las personas adultas y administradoras de la familia; **nadie escribe desde la app** (solo funciones del servidor).
- **Los poderes derivados se comprueban al actuar**, nunca se guardan como «permiso»: a los **18 años** dejan de valer solos (se calcula con la fecha de la ficha en cada acción) **sin borrar el historial**.

## 4. Revocación (simplificada, 21/10/2026)
- **Cada persona retira solo su propio vínculo.** En su ficha, debajo de los nombres de las madres/padres/tutores, aparece **«Dejar de figurar como madre/padre/tutor»** con una confirmación («Solo quitas tu propio vínculo… Podrás volver a indicarlo cuando quieras»). Lo ejecuta `revoke_own_guardianship`, que **solo actúa sobre el vínculo cuya persona titular es quien llama**. Probado con datos: otra tutora, la administradora de la familia y una persona de otra familia reciben `LINK_NOT_FOUND`; el vínculo de la otra persona sigue vigente; no se puede retirar dos veces; el historial se conserva (`family_guardian_events`) y se puede volver a declarar.
- **Ninguna administradora puede retirar el vínculo de otra persona.** No existe función para ello y la tabla no admite escritura desde la app (tampoco puede reasignar a mano a qué cuenta pertenece una ficha desde la migración 0301).
- **Conflictos excepcionales (vínculo incorrecto o disputado): procedimiento sin trámites en el uso diario.** No hay solicitudes, plazos ni pantallas nuevas. Si alguien denuncia un vínculo incorrecto, lo revisa **una administradora de PEPA** con el historial (`family_guardian_events`: quién, cuándo, qué versión de la declaración) y, si procede, lo retira con una instrucción del servidor registrada por escrito. Si algún día hay muchos casos, se diseña entonces una solicitud de revisión.
- **Al cumplir 18 años** los poderes cesan solos; el vínculo y su historial se conservan.
- **Sin límite de tutores:** cada vínculo es individual; retirar uno no afecta a los demás.

## 5. Invitaciones familiares: «Dar acceso a PEPA» (hecho)
- **Visible:** las fichas sin cuenta ponen «Sin acceso a PEPA» y un botón **«🔑 Dar acceso a PEPA»** a la vista (antes solo estaba en el menú ⋯, solo para administradoras). **La opción del menú ⋯ se mantiene** hasta comprobar que la nueva funciona.
- **Quién:** administradora de la familia (cualquier ficha sin cuenta salvo bebés) o madre/padre vinculado **solo para la ficha de su hijo menor** (niño). El servidor lo decide (`create_member_invitation`), probado: un padre vinculado **no puede** invitar a una persona adulta, a un invitado, a un niño ajeno ni, a los 18 años, a su hijo; una adulta sin vínculo tampoco.
- **Al crear una ficha** (no bebés): «¿Quieres darle acceso a PEPA ahora?» («Crear la ficha no crea ninguna cuenta»). «Ahora no» continúa exactamente como antes.
- **Sin duplicar:** si ya hay una invitación vigente, se devuelve esa («Ya había una invitación vigente: es esta»); «Generar otra» pide confirmación y deja sin valor la anterior.
- **Caducidad visible** («Caduca mañana a las 14:30 · un solo uso»), **copiar, compartir y WhatsApp** con el texto de instrucciones (`src/domain/invitations.ts`, probado).
- **Menores y edad:** para una ficha de **niño** hace falta que su ficha tenga **fecha de nacimiento** antes de dar acceso (la pone quien invita, no el menor). Al unirse manda la fecha de la ficha, **no la que se escriba**; una cuenta de adulta no se crea con fecha de menor; un bebé no tiene cuenta.
- **Rol y secciones:** la cuenta nace con el rol y las secciones de **su ficha** (corrige el fallo de la auditoría).

## 6. Fase B (aplazada): diseño técnico para más adelante
**No se ha implementado ninguna función privilegiada para cambiar el correo de otra cuenta.** Condiciones para cuando se apruebe:
1. **Alcance:** solo cuentas **de menores**: la ficha es `child`, la **cuenta tiene rol `child`**, el menor tiene menos de 18 años, y quien actúa es madre/padre/tutor con vínculo **vigente**. Nunca para adultas, invitadas ni administradoras.
2. **Identificación:** el tutor se identifica hace menos de 5 minutos (mismo mecanismo que ahora).
3. **Supabase no trae un cambio de correo iniciado por otra persona con verificación.** Opciones, a decidir tras probarlas en un entorno de pruebas: (a) el menor cambia su correo con su propia sesión y su tutor le da el código que llega a la dirección nueva (cero poder privilegiado; recomendado como primer paso); (b) función de servidor con la clave de servicio: pide el cambio y el servidor guarda una solicitud con **código de 6 cifras de un solo uso (guardado cifrado), caducidad y límite de intentos**, enviado a la **dirección nueva**; solo al teclearlo el tutor se aplica el cambio. Antes hay que comprobar qué hace exactamente `auth.admin.updateUserById` con el correo y la confirmación **[No verificado]**.
4. **Salvaguardas:** aviso al correo antiguo y al resto de tutores; un cambio como máximo cada 7 días; todo en el registro; nunca acceso a la contraseña, el PIN ni la sesión del menor; mismo identificador de usuario (no se pierde nada).
5. **Pruebas necesarias:** aislamiento entre familias, que el vínculo de un menor que cumple 18 deje de valer, y que un adulto con ficha «niño» manipulada no obtenga poder (ya cubierto en la Fase A: una ficha con cuenta de adulta nunca cuenta como menor).

## 7. Decisiones pendientes de ti
1. **Revocación:** ¿apruebas el mecanismo del §4 (retirar el propio vínculo + revisión por administradora de PEPA para los disputados)? Hasta entonces nadie puede retirar un vínculo.
2. ¿Rotamos o retiramos el **código maestro** del Vault cuando el nuevo sistema esté desplegado?
3. ¿Qué se hace con la opción antigua del menú ⋯ «Generar código de acceso» cuando compruebes que «Dar acceso a PEPA» va bien?
