# Plantillas de los correos de acceso de PEPA

**No están activadas.** Son los archivos que se pegarán en Supabase (Authentication → Emails → Templates) cuando se autorice. Todo el plan: `docs/CUENTAS_SEGURIDAD_PLAN.md`.

| Archivo | Plantilla de Supabase | Asunto |
|---|---|---|
| `confirmation.html` | Confirm sign up | Confirma tu correo electrónico en PEPA |
| `recovery.html` | Reset password | Recupera tu contraseña de PEPA |
| `email_change.html` | Change email address | Confirma tu nuevo correo electrónico en PEPA |
| `reauthentication.html` | Reauthentication | Tu código de verificación de PEPA |
| `magic_link.html` | Magic link | Tu código de verificación de PEPA (se usa para «Recuperar mi PIN») |

- **Invite user: no se prepara ni se toca.** PEPA no invita con correos de Supabase Auth; las invitaciones a la familia son códigos propios (`join_family_with_code`).
- Llevan **solo el código** de seis cifras (`{{ .Token }}`), nunca el enlace: los antivirus de correo gastan los enlaces antes que la persona.
- **Se generan, no se editan a mano:** `node scripts/build-email-templates.mjs`. Una prueba comprueba que los archivos guardados son los que genera el script.
- `preview/` son las mismas plantillas con datos de ejemplo para abrirlas en un navegador (el logotipo se lee de `assets/`).
- Logotipo: `assets/pepa-logo-email.jpg` es una **copia reducida** (560 px, 55 KB) del logotipo oficial con eslogan (`src/assets/brand/variants/pepa-family-app-logo-slogan.png`); el archivo maestro no se ha tocado. Hay que publicarla en `https://pepafamilyapp.es/email/pepa-logo-email.jpg` (copia lista en `pepa-web/public/email/`) **antes** de activar las plantillas, o el logotipo no se verá.
- Ajustes de Supabase que deben ir con ellas: «Email OTP expiration» = 3600 s (las plantillas dicen «una hora»), «Email OTP length» = 6.
- Antes de pegar, **copiar a un archivo el texto actual de cada plantilla**: el panel no guarda historial y es la forma de volver atrás.
