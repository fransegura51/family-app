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

// Datos de ejemplo solo para la vista previa en el navegador.
export function previewHtml(html) {
  return html.replaceAll('{{ .Token }}', '482913').replaceAll('{{ .NewEmail }}', 'nuevo.correo@ejemplo.com')
}

export function writeAll(root) {
  const dir = join(root, 'supabase', 'email-templates')
  mkdirSync(join(dir, 'preview'), { recursive: true })
  for (const [name, t] of Object.entries(TEMPLATES)) {
    writeFileSync(join(dir, `${name}.html`), t.html)
    writeFileSync(join(dir, 'preview', `${name}.html`), previewHtml(t.html).replaceAll(LOGO_URL, '../assets/pepa-logo-email.jpg'))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeAll(join(dirname(fileURLToPath(import.meta.url)), '..'))
  console.log('Plantillas escritas en supabase/email-templates/')
}
