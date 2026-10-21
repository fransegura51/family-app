// Plantillas de los correos de acceso de PEPA (Supabase Auth). Un solo diseño para todas, para que se reconozcan al instante.
//   node scripts/build-email-templates.mjs        → escribe supabase/email-templates/*.html y supabase/email-templates/preview/*.html
// Las plantillas llevan los marcadores de Supabase ({{ .Token }}, {{ .NewEmail }}…): se pegan tal cual en el panel de Supabase
// (Authentication → Emails → Templates). La vista previa (preview/) sustituye esos marcadores por datos de ejemplo para mirarla en un navegador.
//
// Decisiones:
//  · Solo código de seis cifras ({{ .Token }}), nunca el enlace {{ .ConfirmationURL }}: los antivirus de correo (p. ej. Outlook/Hotmail) abren los
//    enlaces antes que la persona y los «gastan». El enlace y el código comparten la misma clave de un solo uso, así que NO se ponen los dos.
//  · Diseño con tablas y estilos en línea (lo único que respetan todos los gestores de correo), ancho fluido de hasta 560 px para móviles.
//  · El logotipo es una copia reducida del oficial (supabase/email-templates/assets/pepa-logo-email.jpg), alojada en el dominio propio.
//  · Sin imágenes ni scripts de terceros.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LOGO_URL = 'https://pepafamilyapp.es/email/pepa-logo-email.jpg'
export const SUPPORT_EMAIL = 'info@pepafamilyapp.es'
export const SITE_URL = 'https://pepafamilyapp.es'
// Debe coincidir con «Email OTP Expiration» en Supabase (por defecto 3600 s). Si se cambia allí, se cambia aquí y se vuelve a generar.
export const OTP_EXPIRY_TEXT = 'una hora'

const BRAND_PINK = '#e8205a'
const TEXT = '#1c1f26'
const MUTED = '#6b7280'

function layout({ title, preheader, heading, paragraphs, codeLabel, afterCode }) {
  const paras = paragraphs.map((p) => `<p style="margin:0 0 14px 0;font-size:16px;line-height:24px;color:${TEXT};">${p}</p>`).join('\n              ')
  const after = afterCode.map((p) => `<p style="margin:0 0 12px 0;font-size:14px;line-height:21px;color:${MUTED};">${p}</p>`).join('\n              ')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6fa;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f6fa;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px;">
              <img src="${LOGO_URL}" width="280" alt="PEPA · Tu familia organizada" style="display:block;width:280px;max-width:100%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:12px 0 14px 0;font-size:24px;line-height:30px;color:${BRAND_PINK};">${heading}</h1>
              ${paras}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 28px 6px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${MUTED};">${codeLabel}</p>
              <div style="display:inline-block;padding:14px 22px;background-color:#fff0f5;border:2px solid #f6b8cb;border-radius:12px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:8px;color:${TEXT};">{{ .Token }}</div>
              <p style="margin:10px 0 0 0;font-size:13px;line-height:19px;color:${MUTED};">El código caduca en ${OTP_EXPIRY_TEXT} y solo sirve una vez.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${after}
              <p style="margin:0 0 4px 0;font-size:14px;line-height:21px;color:${MUTED};"><strong style="color:${TEXT};">Tu seguridad:</strong> no compartas este código con nadie. PEPA nunca te lo pedirá por teléfono, WhatsApp ni correo.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 26px 28px;border-top:1px solid #eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};text-align:center;">PEPA · Tu familia organizada<br>
              Este es un mensaje automático. Si necesitas ayuda, escríbenos a <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

// Plantillas que PEPA usa de verdad. «invite» (invitar desde Supabase) NO se usa: las invitaciones a la familia son códigos propios de PEPA
// (join_family_with_code), no correos de Supabase Auth; por eso no se prepara ni se toca esa plantilla.
export const TEMPLATES = {
  confirmation: {
    supabaseName: 'Confirm sign up',
    subject: 'Confirma tu correo electrónico en PEPA',
    html: layout({
      title: 'Confirma tu correo electrónico en PEPA',
      preheader: 'Tu código para confirmar el correo y entrar en PEPA.',
      heading: '¡Bienvenido a la familia!',
      paragraphs: ['Solo falta confirmar tu correo electrónico para empezar a disfrutar de PEPA.', 'Escribe este código en la pantalla de PEPA donde te lo pide:'],
      codeLabel: 'Tu código de confirmación',
      afterCode: ['Si tú no has creado una cuenta en PEPA, puedes ignorar este mensaje: no se creará nada.'],
    }),
  },
  recovery: {
    supabaseName: 'Reset password',
    subject: 'Recupera tu contraseña de PEPA',
    html: layout({
      title: 'Recupera tu contraseña de PEPA',
      preheader: 'Tu código para elegir una contraseña nueva en PEPA.',
      heading: 'Recupera tu contraseña',
      paragraphs: ['Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de PEPA.', 'Escribe este código en PEPA y podrás elegir una contraseña nueva:'],
      codeLabel: 'Tu código de recuperación',
      afterCode: ['Si no has solicitado el cambio, puedes ignorar este mensaje: tu contraseña seguirá siendo la de siempre.'],
    }),
  },
  email_change: {
    supabaseName: 'Change email address',
    subject: 'Confirma tu nuevo correo electrónico en PEPA',
    html: layout({
      title: 'Confirma tu nuevo correo electrónico en PEPA',
      preheader: 'Tu código para confirmar el cambio de correo en PEPA.',
      heading: 'Confirma tu nuevo correo',
      // Solo se nombra la dirección NUEVA: la antigua no se enseña (podría llegar a quien escribió mal la dirección).
      paragraphs: ['Se ha pedido usar <strong>{{ .NewEmail }}</strong> como correo de acceso de una cuenta de PEPA.', 'Si has sido tú, escribe este código en PEPA para confirmar el cambio:'],
      codeLabel: 'Tu código de confirmación',
      afterCode: ['Si no has sido tú, no hagas nada: el correo de la cuenta no cambiará hasta que se confirme. Si crees que alguien intenta entrar en tu cuenta, cambia tu contraseña desde PEPA.'],
    }),
  },
  reauthentication: {
    supabaseName: 'Reauthentication',
    subject: 'Tu código de verificación de PEPA',
    html: layout({
      title: 'Tu código de verificación de PEPA',
      preheader: 'Tu código para confirmar que eres tú en PEPA.',
      heading: 'Confirma que eres tú',
      paragraphs: ['Para proteger tu cuenta, PEPA necesita comprobar tu identidad antes de hacer este cambio.', 'Escribe este código en PEPA:'],
      codeLabel: 'Tu código de verificación',
      afterCode: ['Si no has pedido este código, puedes ignorar el mensaje.'],
    }),
  },
  // Se envía al pedir «Recuperar mi PIN» o un código de acceso a una cuenta que ya existe (signInWithOtp). PEPA no usa «enlace mágico» para entrar.
  magic_link: {
    supabaseName: 'Magic link',
    subject: 'Tu código de verificación de PEPA',
    html: layout({
      title: 'Tu código de verificación de PEPA',
      preheader: 'Tu código para confirmar que eres tú en PEPA.',
      heading: 'Confirma que eres tú',
      paragraphs: ['Has pedido un código para comprobar tu identidad en PEPA, por ejemplo para recuperar tu PIN.', 'Escríbelo en la pantalla de PEPA donde te lo pide:'],
      codeLabel: 'Tu código de verificación',
      afterCode: ['Si no lo has pedido tú, puedes ignorar este mensaje.'],
    }),
  },
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// PLANTILLAS DE TRANSICIÓN (con botón de enlace, SIN código). Son las que se pegan HOY en Supabase, mientras la web desplegada de PEPA siga siendo la actual (la que recupera la
// contraseña y confirma el correo pulsando el enlace del correo). Las de arriba (TEMPLATES, solo código de seis cifras) solo se pegan JUNTO CON el despliegue de la web nueva de la rama
// de Cuentas, que es la que sabe pedir el código: si se pegaran antes, quien pidiera recuperar su contraseña recibiría un código que la web actual no sabe usar.
// Mismo diseño, en español y con el logotipo; solo cambia el cuerpo (botón con {{ .ConfirmationURL }} en vez del código). Los antivirus de correo pueden «gastar» el enlace antes
// que la persona; es el comportamiento de hoy y se corrige al pasar a los códigos.
function layoutLink({ title, preheader, heading, paragraphs, buttonLabel, afterButton }) {
  const paras = paragraphs.map((p) => `<p style="margin:0 0 14px 0;font-size:16px;line-height:24px;color:${TEXT};">${p}</p>`).join('\n              ')
  const after = afterButton.map((p) => `<p style="margin:0 0 12px 0;font-size:14px;line-height:21px;color:${MUTED};">${p}</p>`).join('\n              ')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6fa;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f6fa;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px;">
              <img src="${LOGO_URL}" width="280" alt="PEPA · Tu familia organizada" style="display:block;width:280px;max-width:100%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:12px 0 14px 0;font-size:24px;line-height:30px;color:${BRAND_PINK};">${heading}</h1>
              ${paras}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 28px 6px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 26px;background-color:${BRAND_PINK};border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${buttonLabel}</a>
              <p style="margin:10px 0 0 0;font-size:12px;line-height:18px;color:${MUTED};">Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="word-break:break-all;">{{ .ConfirmationURL }}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${after}
              <p style="margin:0 0 4px 0;font-size:14px;line-height:21px;color:${MUTED};"><strong style="color:${TEXT};">Tu seguridad:</strong> no compartas este correo ni su enlace con nadie. PEPA nunca te pedirá tu contraseña por teléfono, WhatsApp ni correo.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 26px 28px;border-top:1px solid #eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};text-align:center;">PEPA · Tu familia organizada<br>
              Este es un mensaje automático. Si necesitas ayuda, escríbenos a <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

// Solo las TRES plantillas de flujos que la web actual ya usa con enlace. «Reauthentication» y «Magic link» solo las usa la web nueva (PIN y cambio de correo seguro): no se tocan hoy.
export const TRANSITION_TEMPLATES = {
  confirmation: {
    supabaseName: 'Confirm sign up',
    subject: 'Confirma tu correo electrónico en PEPA',
    html: layoutLink({
      title: 'Confirma tu correo electrónico en PEPA',
      preheader: 'Pulsa el botón para confirmar tu correo y entrar en PEPA.',
      heading: '¡Bienvenido a la familia!',
      paragraphs: ['Solo falta confirmar tu correo electrónico para empezar a disfrutar de PEPA.', 'Pulsa el botón para confirmarlo:'],
      buttonLabel: 'Confirmar mi correo',
      afterButton: ['Si tú no has creado una cuenta en PEPA, puedes ignorar este mensaje: no se creará nada.'],
    }),
  },
  recovery: {
    supabaseName: 'Reset password',
    subject: 'Recupera tu contraseña de PEPA',
    html: layoutLink({
      title: 'Recupera tu contraseña de PEPA',
      preheader: 'Pulsa el botón para elegir una contraseña nueva en PEPA.',
      heading: 'Recupera tu contraseña',
      paragraphs: ['Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de PEPA.', 'Pulsa el botón y podrás elegir una contraseña nueva:'],
      buttonLabel: 'Elegir mi contraseña nueva',
      afterButton: ['Si no has solicitado el cambio, puedes ignorar este mensaje: tu contraseña seguirá siendo la de siempre.'],
    }),
  },
  email_change: {
    supabaseName: 'Change email address',
    subject: 'Confirma tu nuevo correo electrónico en PEPA',
    html: layoutLink({
      title: 'Confirma tu nuevo correo electrónico en PEPA',
      preheader: 'Pulsa el botón para confirmar el cambio de correo en PEPA.',
      heading: 'Confirma tu nuevo correo',
      paragraphs: ['Se ha pedido usar <strong>{{ .NewEmail }}</strong> como correo de acceso de una cuenta de PEPA.', 'Si has sido tú, pulsa el botón para confirmar el cambio:'],
      buttonLabel: 'Confirmar el cambio de correo',
      afterButton: ['Si no has sido tú, no hagas nada: el correo de la cuenta no cambiará hasta que se confirme. Si crees que alguien intenta entrar en tu cuenta, cambia tu contraseña desde PEPA.'],
    }),
  },
}

// Datos de ejemplo solo para la vista previa en el navegador.
export function previewHtml(html) {
  return html.replaceAll('{{ .Token }}', '482913').replaceAll('{{ .NewEmail }}', 'nuevo.correo@ejemplo.com').replaceAll('{{ .ConfirmationURL }}', 'https://ejemplo.supabase.co/auth/v1/verify?token=EJEMPLO&type=recovery')
}


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// INVITACIONES A PEPA (no son plantillas de Supabase Auth): las enviará una función de servidor cuando el correo oficial esté configurado. HOY NO SE ENVÍA NINGÚN CORREO: solo existen la
// plantilla y la vista previa. Marcadores propios (no los de Supabase): {{invite_code}}, {{expires_text}}, {{register_url}}, {{inviter_name}}, {{recipient_name}}.
// Son DOS tipos y no se mezclan:
//   · invitation_new_family — la envía una administradora de PEPA: autoriza crear un espacio familiar nuevo.
//   · invitation_member     — la envía una administradora de la familia o una madre/padre vinculado: autoriza crear una cuenta y unirse a una ficha.
// Un solo correo con el código y las instrucciones. El código de 6 cifras del correo de confirmación es OTRA cosa y se explica como tal.
function invitationLayout({ title, preheader, heading, intro, steps, closing, validity }) {
  const items = steps.map((t, i) => `<tr><td valign="top" style="padding:4px 10px 4px 0;font-size:16px;line-height:24px;font-weight:700;color:${BRAND_PINK};">${i + 1}.</td><td style="padding:4px 0;font-size:16px;line-height:24px;color:${TEXT};">${t}</td></tr>`).join('\n                ')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6fa;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f6fa;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px;">
              <img src="${LOGO_URL}" width="280" alt="PEPA · Tu familia organizada" style="display:block;width:280px;max-width:100%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:12px 0 14px 0;font-size:24px;line-height:30px;color:${BRAND_PINK};">${heading}</h1>
              <p style="margin:0 0 14px 0;font-size:16px;line-height:24px;color:${TEXT};">${intro}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 28px 6px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${MUTED};">Tu código de invitación</p>
              <div style="display:inline-block;padding:14px 22px;background-color:#fff0f5;border:2px solid #f6b8cb;border-radius:12px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;line-height:36px;font-weight:700;letter-spacing:4px;color:${TEXT};">{{invite_code}}</div>
              <p style="margin:10px 0 0 0;font-size:13px;line-height:19px;color:${MUTED};">${validity}: válido hasta {{expires_text}} · solo se puede usar una vez. Si caduca, pide que te generen otro.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 4px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:16px;line-height:24px;font-weight:700;color:${TEXT};">Para crear tu cuenta:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                ${items}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 28px 6px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <a href="{{register_url}}" style="display:inline-block;padding:14px 26px;background-color:${BRAND_PINK};border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Crear mi cuenta en PEPA</a>
              <p style="margin:10px 0 0 0;font-size:12px;line-height:18px;color:${MUTED};">Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="word-break:break-all;">{{register_url}}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 12px 0;font-size:14px;line-height:21px;color:${MUTED};">${closing}</p>
              <p style="margin:0 0 4px 0;font-size:14px;line-height:21px;color:${MUTED};"><strong style="color:${TEXT};">Tu seguridad:</strong> la invitación es personal. No la compartas con nadie ni la publiques.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 26px 28px;border-top:1px solid #eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};text-align:center;">PEPA · Tu familia organizada<br>
              Este es un mensaje automático. Si necesitas ayuda, escríbenos a <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

const CONFIRM_STEP = 'Te llegará un correo con un <strong>código de 6 cifras</strong>: escríbelo para confirmar tu correo. Es un código distinto del de invitación.'

export const INVITATION_TEMPLATES = {
  invitation_new_family: {
    subject: 'Te han invitado a crear tu familia en PEPA',
    html: invitationLayout({
      title: 'Te han invitado a crear tu familia en PEPA',
      preheader: 'Tu invitación y los pasos para crear tu espacio familiar en PEPA.',
      heading: 'Te damos la bienvenida a PEPA',
      intro: 'PEPA es una aplicación privada y has recibido autorización para <strong>crear el espacio de tu familia</strong>. Con el código de abajo podrás registrarte.',
      steps: [
        'Pulsa el botón «Crear mi cuenta en PEPA» (el código se rellena solo). Si no, abre PEPA y pulsa «Tengo una invitación».',
        'Escribe el código de invitación si te lo pide.',
        'Escribe tu correo y elige una contraseña.',
        CONFIRM_STEP,
        'Pon el nombre de tu familia y tus datos. ¡Ya estarás dentro!',
      ],
      closing: 'Si no esperabas esta invitación, puedes ignorar este mensaje: no se crea ninguna cuenta si no la usas.',
      validity: 'Caduca a los 7 días de generarse',
    }),
  },
  invitation_member: {
    subject: 'Te han invitado a unirte a tu familia en PEPA',
    html: invitationLayout({
      title: 'Te han invitado a unirte a tu familia en PEPA',
      preheader: 'Tu invitación y los pasos para crear tu cuenta y unirte a tu familia en PEPA.',
      heading: 'Te esperan en PEPA',
      intro: '{{inviter_name}} te invita a <strong>unirte a tu familia en PEPA</strong>{{recipient_name}}. Con el código de abajo podrás crear tu cuenta y quedar dentro de tu familia.',
      steps: [
        'Pulsa el botón «Crear mi cuenta en PEPA» (el código se rellena solo). Si no, abre PEPA y pulsa «Tengo una invitación».',
        'Escribe el código de invitación si te lo pide.',
        'Escribe tu correo y elige una contraseña.',
        CONFIRM_STEP,
        'Completa tus datos. ¡Ya estarás en tu familia!',
      ],
      closing: 'Si no esperabas esta invitación, puedes ignorar este mensaje: no se crea ninguna cuenta si no la usas.',
      validity: 'Caduca a las 24 horas de generarse',
    }),
  },
}

const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Rellena una invitación: todos los valores se escapan (un nombre con «<» no puede inyectar HTML). `recipient_name` entra como « (nombre)» si existe. */
export function renderInvitation(html, vars) {
  const v = {
    invite_code: escapeHtml(vars.invite_code ?? ''),
    expires_text: escapeHtml(vars.expires_text ?? ''),
    register_url: escapeHtml(vars.register_url ?? ''),
    inviter_name: escapeHtml(vars.inviter_name || 'Alguien de tu familia'),
    recipient_name: vars.recipient_name ? ` (${escapeHtml(vars.recipient_name)})` : '',
  }
  return html.replace(/\{\{(invite_code|expires_text|register_url|inviter_name|recipient_name)\}\}/g, (_, k) => v[k])
}

export const INVITATION_SAMPLE = {
  invite_code: 'K7M2QX9PTD',
  expires_text: 'el 28/10/2026 a las 14:30',
  register_url: 'https://fransegura51.github.io/family-app/?invitacion=K7M2QX9PTD',
  inviter_name: 'Jennifer',
  recipient_name: 'Eric',
}

export function writeAll(root) {
  const dir = join(root, 'supabase', 'email-templates')
  mkdirSync(join(dir, 'preview'), { recursive: true })
  for (const [name, t] of Object.entries(TEMPLATES)) {
    writeFileSync(join(dir, `${name}.html`), t.html)
    writeFileSync(join(dir, 'preview', `${name}.html`), previewHtml(t.html).replaceAll(LOGO_URL, '../assets/pepa-logo-email.jpg'))
  }
  mkdirSync(join(dir, 'transition', 'preview'), { recursive: true })
  for (const [name, t] of Object.entries(TRANSITION_TEMPLATES)) {
    writeFileSync(join(dir, 'transition', `${name}.html`), t.html)
    writeFileSync(join(dir, 'transition', 'preview', `${name}.html`), previewHtml(t.html).replaceAll(LOGO_URL, '../../assets/pepa-logo-email.jpg'))
  }
  for (const [name, t] of Object.entries(INVITATION_TEMPLATES)) {
    writeFileSync(join(dir, `${name}.html`), t.html)
    writeFileSync(join(dir, 'preview', `${name}.html`), renderInvitation(t.html, INVITATION_SAMPLE).replaceAll(LOGO_URL, '../assets/pepa-logo-email.jpg'))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeAll(join(dirname(fileURLToPath(import.meta.url)), '..'))
  console.log('Plantillas escritas en supabase/email-templates/')
}
