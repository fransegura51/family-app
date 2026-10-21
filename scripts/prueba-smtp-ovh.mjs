#!/usr/bin/env node
// Prueba del correo de PEPA con OVH (Zimbra Starter): ¿acepta OVH enviar desde el alias no-reply@ identificándose con info@?
//
// Qué hace: se conecta a smtp.mail.ovh.net, se identifica con info@pepafamilyapp.es, e intenta mandar UN solo correo de prueba, con remitente no-reply@pepafamilyapp.es,
// a la dirección que escribas. Enseña, paso a paso, lo que contesta OVH.
//
// Seguridad: la contraseña se pide con el texto oculto, vive solo en la memoria de este programa mientras dura la prueba y NO se escribe en ningún archivo, ni en el
// historial, ni en pantalla. Este programa no toca Supabase, ni el DNS, ni la base de datos: solo habla con el servidor de correo de OVH.
//
// Cómo se ejecuta (explicado para personas, no solo para quien programa): docs/CUENTAS_SEGURIDAD_PLAN.md §3 y scripts/README-prueba-smtp-ovh.md.
import net from 'node:net'
import tls from 'node:tls'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { pathToFileURL } from 'node:url'

export const DEFAULTS = {
  host: 'smtp.mail.ovh.net',
  port: 465,
  user: 'info@pepafamilyapp.es',
  from: 'no-reply@pepafamilyapp.es',
  fromName: 'PEPA · Tu familia organizada',
}

const CRLF = '\r\n'
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
const encodedWord = (s) => `=?UTF-8?B?${b64(s)}?=`
const wrap76 = (s) => s.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd()

/** Mensaje de prueba (texto, UTF-8, base64). Parecido a un correo real de código, claramente marcado como prueba. */
export function buildTestMessage({ from, fromName, to, now = new Date() }) {
  const pad = (n) => String(n).padStart(2, '0')
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const body = [
    'Hola:',
    '',
    'Este es un correo de PRUEBA de PEPA. No tienes que hacer nada.',
    '',
    `Si lo estás leyendo, el servidor de correo de OVH aceptó enviarlo desde ${from} (enviado a las ${hora}).`,
    '',
    'Código de ejemplo: 482913 (no vale para nada)',
    '',
    'PEPA · Tu familia organizada',
  ].join(CRLF)
  const date = now.toUTCString().replace('GMT', '+0000')
  const headers = [
    `From: ${encodedWord(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodedWord('Prueba de correo de PEPA')}`,
    `Date: ${date}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  return headers.join(CRLF) + CRLF + CRLF + wrap76(b64(body))
}

/** Lector de respuestas SMTP (admite respuestas de varias líneas «250-…» y «250 …»). Se puede cambiar de socket (al cifrar con STARTTLS). */
function createReader(initialSocket) {
  let current = null
  let handlers = null
  let pending = []
  let partial = ''
  const replies = []
  let waiting = null
  let closed = null
  const deliver = () => {
    while (replies.length && waiting) {
      const w = waiting
      waiting = null
      w.resolve(replies.shift())
    }
  }
  const onData = (d) => {
    partial += d.toString('utf8')
    const lines = partial.split(/\r?\n/)
    partial = lines.pop() ?? ''
    for (const line of lines) {
      pending.push(line)
      if (/^\d{3}( |$)/.test(line) || !/^\d{3}-/.test(line)) {
        const code = parseInt(line.slice(0, 3), 10)
        replies.push({ code: Number.isNaN(code) ? 0 : code, lines: pending })
        pending = []
      }
    }
    deliver()
  }
  const onEnd = (why) => {
    closed = why
    if (waiting) {
      const w = waiting
      waiting = null
      w.reject(new Error(why))
    }
  }
  const setSocket = (socket) => {
    if (current && handlers) {
      current.removeListener('data', handlers.data)
      current.removeListener('error', handlers.error)
      current.removeListener('close', handlers.close)
    }
    partial = ''
    pending = []
    handlers = {
      data: onData,
      error: (e) => onEnd('Conexión interrumpida: ' + e.message),
      close: () => onEnd('El servidor cerró la conexión'),
    }
    current = socket
    socket.on('data', handlers.data)
    socket.on('error', handlers.error)
    socket.on('close', handlers.close)
  }
  setSocket(initialSocket)
  return {
    setSocket,
    next: (timeoutMs = 30000) =>
      new Promise((resolve, reject) => {
        if (replies.length) return resolve(replies.shift())
        if (closed) return reject(new Error(closed))
        const timer = setTimeout(() => {
          waiting = null
          reject(new Error('El servidor no contestó a tiempo'))
        }, timeoutMs)
        waiting = {
          resolve: (v) => {
            clearTimeout(timer)
            resolve(v)
          },
          reject: (e) => {
            clearTimeout(timer)
            reject(e)
          },
        }
      }),
  }
}

/**
 * Hace la prueba completa y devuelve { veredicto, pasos }. NUNCA escribe la contraseña en ninguna parte: ni en `pasos`, ni en `onLog`.
 * `transport` solo lo usan las pruebas automáticas contra un servidor falso local ('plain'); la línea de comandos usa siempre 'tls' (465) o 'starttls' (587).
 */
export async function runSmtpTest({ host = DEFAULTS.host, port = DEFAULTS.port, user = DEFAULTS.user, pass, from = DEFAULTS.from, fromName = DEFAULTS.fromName, to, transport, onLog = () => {} }) {
  const mode = transport ?? (port === 587 ? 'starttls' : 'tls')
  const pasos = []
  const say = (ok, titulo, detalle) => {
    pasos.push({ ok, titulo, detalle })
    onLog({ ok, titulo, detalle })
  }
  let socket
  let reader
  const cmd = (line) => socket.write(line + CRLF)
  const ask = async (line, etiqueta) => {
    cmd(line)
    const r = await reader.next()
    return { ...r, etiqueta }
  }
  const text = (r) => r.lines.join(' | ')
  const fail = (veredicto, titulo, r) => {
    say(false, titulo, text(r))
    return { veredicto, pasos }
  }

  try {
    // 1) Conexión
    if (mode === 'tls') {
      socket = tls.connect({ host, port, servername: host })
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve)
        socket.once('error', reject)
      })
    } else {
      socket = net.connect({ host, port })
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('error', reject)
      })
    }
    reader = createReader(socket)
    const hello = await reader.next()
    if (hello.code !== 220) return fail('CONEXION', 'El servidor no saludó como se esperaba', hello)
    say(true, `Conexión con ${host}:${port}${mode === 'tls' ? ' (cifrada)' : mode === 'starttls' ? ' (se cifra a continuación)' : ''}`, text(hello))

    const ehloName = 'prueba.pepafamilyapp.es'
    let r = await ask(`EHLO ${ehloName}`)
    if (r.code !== 250) return fail('CONEXION', 'El servidor no aceptó el saludo (EHLO)', r)

    if (mode === 'starttls') {
      r = await ask('STARTTLS')
      if (r.code !== 220) return fail('CONEXION', 'El servidor no permitió cifrar la conexión (STARTTLS)', r)
      socket = tls.connect({ socket, servername: host })
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve)
        socket.once('error', reject)
      })
      reader.setSocket(socket)
      r = await ask(`EHLO ${ehloName}`)
      if (r.code !== 250) return fail('CONEXION', 'El servidor no aceptó el saludo tras cifrar', r)
      say(true, 'Conexión cifrada (STARTTLS)', '')
    }

    // 2) Identificarse con el buzón real. Los datos de acceso NUNCA se muestran ni se guardan.
    r = await ask('AUTH LOGIN')
    if (r.code !== 334) return fail('AUTH_FALLIDA', 'El servidor no admite identificarse así', r)
    r = await ask(b64(user))
    if (r.code !== 334) return fail('AUTH_FALLIDA', 'El servidor no aceptó el nombre de usuario', r)
    r = await ask(b64(pass))
    if (r.code !== 235) return fail('AUTH_FALLIDA', `OVH NO aceptó el usuario y la contraseña de ${user}`, r)
    say(true, `OVH aceptó la identificación con ${user}`, '(usuario y contraseña ocultos)')

    // 3) Remitente = el alias (esto es lo que comprueba la prueba)
    r = await ask(`MAIL FROM:<${from}>`)
    if (r.code !== 250) return fail('REMITENTE_RECHAZADO', `OVH NO deja usar ${from} como remitente`, r)
    say(true, `OVH aceptó ${from} como remitente`, text(r))

    // 4) Destinatario
    r = await ask(`RCPT TO:<${to}>`)
    if (r.code !== 250 && r.code !== 251) return fail('DESTINATARIO_RECHAZADO', `OVH no aceptó el destinatario ${to}`, r)
    say(true, `Destinatario aceptado: ${to}`, text(r))

    // 5) Contenido (un único correo)
    r = await ask('DATA')
    if (r.code !== 354) return fail('DATOS_RECHAZADOS', 'OVH no aceptó recibir el contenido del correo', r)
    cmd(buildTestMessage({ from, fromName, to }) + CRLF + '.')
    r = await reader.next(60000)
    if (r.code !== 250) return fail('DATOS_RECHAZADOS', 'OVH rechazó el correo al enviarlo', r)
    say(true, 'OVH aceptó el correo para enviarlo', text(r))

    try {
      cmd('QUIT')
    } catch {
      // da igual: el correo ya está aceptado
    }
    return { veredicto: 'OK', pasos }
  } catch (e) {
    say(false, 'No se pudo completar la conexión', e instanceof Error ? e.message : String(e))
    return { veredicto: 'CONEXION', pasos }
  } finally {
    try {
      socket?.destroy()
    } catch {
      // nada
    }
  }
}

/** Qué significa cada resultado y qué hacer después, en palabras sencillas. */
export function explainVerdict(veredicto, { from = DEFAULTS.from, user = DEFAULTS.user, to = '' } = {}) {
  switch (veredicto) {
    case 'OK':
      return [
        `[BIEN] OVH ACEPTÓ enviar el correo desde ${from} identificándose con ${user}.`,
        '',
        `Ahora mira la bandeja de ${to} (y la carpeta de Spam):`,
        '  1. Debe haber llegado un correo «Prueba de correo de PEPA» de «PEPA · Tu familia organizada».',
        `  2. Ábrelo, pulsa los tres puntos → «Mostrar original» y comprueba que «De:» pone ${from} (no ${user}) y que SPF, DKIM y DMARC ponen PASS.`,
        '  3. Cuéntame qué has visto. Si todo está bien, preparamos la configuración de Supabase.',
        '',
        'Importante: que OVH lo acepte no garantiza que el remitente final sea el alias; por eso hay que mirar el punto 2.',
      ]
    case 'AUTH_FALLIDA':
      return [
        `[FALLO] OVH no aceptó la identificación con ${user}.`,
        '  · Lo más probable: la contraseña está mal escrita (al escribirla no se ve nada; se ponen asteriscos).',
        '  · Prueba entrando con esa contraseña en el correo web de OVH (Zimbra) para confirmar que es la buena.',
        '  · Si la contraseña es buena, puede que haga falta activar el envío por programas externos en OVH o que OVH haya bloqueado el buzón por seguridad.',
      ]
    case 'REMITENTE_RECHAZADO':
      return [
        `[FALLO] OVH se identificó bien con ${user}, pero NO deja enviar con ${from} como remitente.`,
        '  Es lo que algunas personas cuentan en los foros: el alias sirve para recibir, no para enviar por SMTP.',
        '  Alternativas, de más sencilla a menos:',
        `   A) Usar ${user} como remitente en Supabase (funciona seguro; las respuestas llegan igual a ese buzón).`,
        '   B) Preguntar a OVH si el alias puede enviar por SMTP en Zimbra Starter.',
        '   C) Un servicio de envío aparte (por ejemplo Resend), que además aguanta mejor cuando haya muchas familias.',
      ]
    case 'DESTINATARIO_RECHAZADO':
      return ['[FALLO] OVH no aceptó la dirección de destino. Revisa que esté bien escrita y vuelve a probar.']
    case 'DATOS_RECHAZADOS':
      return [
        '[FALLO] OVH aceptó la identificación y el remitente, pero rechazó el contenido del correo.',
        '  Copia el texto de la respuesta de OVH que sale arriba y cuéntamelo.',
      ]
    default:
      return [
        '[FALLO] No se pudo hablar con el servidor de correo de OVH.',
        '  · Comprueba que tienes internet.',
        '  · Algunas redes de empresa, hoteles o wifis públicas bloquean el envío de correo. Prueba con los datos del móvil como punto de acceso.',
        '  · Si estás en una red normal, prueba con el otro puerto: node scripts/prueba-smtp-ovh.mjs --puerto=587',
      ]
  }
}

/** Contraseña con el texto oculto (se ve un asterisco por letra). No se guarda en ningún sitio. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('NO_TTY'))
      return
    }
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const finish = (result, error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(result)
    }
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') return finish(value)
        if (c === '\u0003') return finish('', new Error('CANCELADO'))
        if (c === '\u007f' || c === '\b') {
          if (value.length) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
        } else if (c >= ' ') {
          value += c
          process.stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}

function askVisible(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => {
    rl.close()
    resolve(a.trim())
  }))
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
  const port = args.puerto ? parseInt(args.puerto, 10) : DEFAULTS.port
  if (![465, 587].includes(port)) {
    console.error('El puerto tiene que ser 465 o 587.')
    process.exit(2)
  }
  console.log('')
  console.log('=== Prueba del correo de PEPA con OVH ===')
  console.log(`Se enviará UN correo de prueba, con remitente ${DEFAULTS.from}, identificándose con ${DEFAULTS.user}.`)
  console.log('La contraseña no se guarda ni se muestra. No se toca Supabase, ni el DNS, ni nada de PEPA.')
  console.log('')

  let to = typeof args.destino === 'string' ? args.destino : await askVisible('¿A qué dirección quieres enviar la prueba? (por ejemplo tu Gmail): ')
  if (!EMAIL_RE.test(to)) {
    console.error('Esa dirección no parece válida. Vuelve a ejecutar el programa y escríbela completa (nombre@gmail.com).')
    process.exit(2)
  }
  const ok = (await askVisible(`Se enviará 1 correo a ${to}. ¿Continuar? (s/n): `)).toLowerCase()
  if (ok !== 's' && ok !== 'si' && ok !== 'sí') {
    console.log('Cancelado. No se ha enviado nada.')
    process.exit(0)
  }

  let pass
  try {
    pass = await askHidden(`Contraseña del buzón ${DEFAULTS.user} (no se verá nada, solo asteriscos): `)
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_TTY') {
      console.error('\nEste programa tiene que ejecutarse en una ventana de terminal normal (PowerShell o Símbolo del sistema) para poder pedirte la contraseña de forma oculta.')
    } else console.log('\nCancelado. No se ha enviado nada.')
    process.exit(1)
  }
  if (!pass) {
    console.error('No has escrito ninguna contraseña. No se ha enviado nada.')
    process.exit(1)
  }

  console.log('\nProbando…\n')
  const result = await runSmtpTest({
    port,
    pass,
    to,
    onLog: ({ ok, titulo, detalle }) => console.log(`${ok ? '  [BIEN]' : '  [FALLO]'} ${titulo}${detalle ? `\n      OVH dice: ${detalle}` : ''}`),
  })
  pass = '' // fuera de la memoria en cuanto termina
  console.log('')
  for (const line of explainVerdict(result.veredicto, { to })) console.log(line)
  console.log('')
  process.exit(result.veredicto === 'OK' ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
