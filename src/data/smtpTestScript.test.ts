// Script de prueba del SMTP de OVH (scripts/prueba-smtp-ovh.mjs): se prueba contra un servidor SMTP FALSO en el propio ordenador. No se conecta a OVH ni usa ninguna contraseña real.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestMessage, DEFAULTS, explainVerdict, runSmtpTest, type SmtpVerdict } from '../../scripts/prueba-smtp-ovh.mjs'

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../scripts/prueba-smtp-ovh.mjs'), 'utf8')
const PASS = 'clave-de-prueba-NO-REAL-9f3'

interface FakeOptions {
  rejectSender?: boolean
  rejectRecipient?: boolean
  rejectData?: boolean
  goodUser?: string
  goodPass?: string
}

// Servidor SMTP mínimo: responde como OVH (EHLO con AUTH LOGIN) y guarda lo que recibe.
function fakeServer(opts: FakeOptions = {}) {
  const log: string[] = []
  let message = ''
  const server = net.createServer((sock) => {
    let step: 'cmd' | 'user' | 'pass' | 'data' = 'cmd'
    let buf = ''
    let user = ''
    sock.on('error', () => {}) // el cliente cierra de golpe al terminar: es normal
    sock.write('220 FAKE-OVH ready\r\n')
    sock.on('data', (d) => {
      buf += d.toString('utf8')
      let i: number
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (step === 'data') {
          if (line === '.') {
            step = 'cmd'
            sock.write(opts.rejectData ? '554 5.7.1 Message refused\r\n' : '250 2.0.0 OK queued\r\n')
          } else message += line + '\r\n'
          continue
        }
        log.push(step === 'cmd' ? line : `(${step})`)
        if (step === 'user') {
          user = Buffer.from(line, 'base64').toString('utf8')
          step = 'pass'
          sock.write('334 UGFzc3dvcmQ6\r\n')
        } else if (step === 'pass') {
          const pass = Buffer.from(line, 'base64').toString('utf8')
          step = 'cmd'
          const ok = user === (opts.goodUser ?? DEFAULTS.user) && pass === (opts.goodPass ?? PASS)
          sock.write(ok ? '235 2.7.0 Authentication succeeded\r\n' : '535 5.7.1 Authentication failed\r\n')
        } else if (/^EHLO/i.test(line)) sock.write('250-FAKE-OVH Hello\r\n250-SIZE 104857600\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n')
        else if (/^AUTH LOGIN/i.test(line)) {
          step = 'user'
          sock.write('334 VXNlcm5hbWU6\r\n')
        } else if (/^MAIL FROM/i.test(line)) sock.write(opts.rejectSender ? '553 5.7.1 Sender address rejected: not owned by user\r\n' : '250 2.1.0 OK\r\n')
        else if (/^RCPT TO/i.test(line)) sock.write(opts.rejectRecipient ? '550 5.1.1 User unknown\r\n' : '250 2.1.5 OK\r\n')
        else if (/^DATA/i.test(line)) {
          step = 'data'
          sock.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 Bye\r\n')
          sock.end()
        } else sock.write('500 5.5.1 Unknown command\r\n')
      }
    })
  })
  return new Promise<{ port: number; log: string[]; message: () => string; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        log,
        message: () => message,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    ),
  )
}

const servers: { close: () => Promise<void> }[] = []
afterEach(async () => {
  while (servers.length) await servers.pop()!.close()
})
async function run(opts: FakeOptions = {}, pass = PASS) {
  const s = await fakeServer(opts)
  servers.push(s)
  const logged: string[] = []
  const result = await runSmtpTest({ host: '127.0.0.1', port: s.port, transport: 'plain', pass, to: 'prueba@gmail.com', onLog: (x) => logged.push(JSON.stringify(x)) })
  return { s, result, logged }
}

describe('prueba SMTP de OVH: resultados', () => {
  it('todo bien: se identifica con info@, usa el alias no-reply@ como remitente y envía UN solo correo', async () => {
    const { s, result } = await run()
    expect(result.veredicto).toBe('OK')
    expect(result.pasos.every((p) => p.ok)).toBe(true)
    expect(s.log.filter((l) => /^MAIL FROM/i.test(l))).toEqual(['MAIL FROM:<no-reply@pepafamilyapp.es>'])
    expect(s.log.filter((l) => /^RCPT TO/i.test(l))).toEqual(['RCPT TO:<prueba@gmail.com>'])
    expect(s.log.filter((l) => /^DATA/i.test(l)).length).toBe(1) // un único correo
    const msg = s.message()
    expect(msg).toContain('From: =?UTF-8?B?')
    expect(msg).toContain('<no-reply@pepafamilyapp.es>')
    expect(msg).toContain('To: <prueba@gmail.com>')
    expect(Buffer.from(msg.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8')).toContain('PRUEBA')
  })

  it('contraseña equivocada → «AUTH_FALLIDA» y no llega a pedir remitente ni destinatario', async () => {
    const { s, result } = await run({}, 'otra-clave')
    expect(result.veredicto).toBe('AUTH_FALLIDA')
    expect(s.log.some((l) => /^MAIL FROM/i.test(l))).toBe(false)
  })

  it('OVH no deja usar el alias como remitente → «REMITENTE_RECHAZADO» con el texto de OVH, sin enviar contenido', async () => {
    const { s, result } = await run({ rejectSender: true })
    expect(result.veredicto).toBe('REMITENTE_RECHAZADO')
    const last = result.pasos[result.pasos.length - 1]
    expect(last.ok).toBe(false)
    expect(last.detalle).toContain('553')
    expect(s.log.some((l) => /^DATA/i.test(l))).toBe(false)
  })

  it('destinatario rechazado y contenido rechazado se distinguen', async () => {
    expect((await run({ rejectRecipient: true })).result.veredicto).toBe('DESTINATARIO_RECHAZADO')
    expect((await run({ rejectData: true })).result.veredicto).toBe('DATOS_RECHAZADOS')
  })

  it('sin conexión → «CONEXION» (no se cuelga)', async () => {
    const s = await fakeServer()
    await s.close()
    const result = await runSmtpTest({ host: '127.0.0.1', port: s.port, transport: 'plain', pass: PASS, to: 'prueba@gmail.com' })
    expect(result.veredicto).toBe('CONEXION')
  })
})

describe('prueba SMTP de OVH: la contraseña no se muestra ni se guarda', () => {
  it('ni los pasos ni lo que se enseña en pantalla contienen la contraseña (ni su forma en base64)', async () => {
    const { result, logged } = await run()
    const everything = JSON.stringify(result.pasos) + logged.join('\n')
    expect(everything).not.toContain(PASS)
    expect(everything).not.toContain(Buffer.from(PASS).toString('base64'))
    expect(everything).toContain('ocultos')
  })

  it('el programa no escribe nada en disco, no usa el historial ni imprime la variable de la contraseña', () => {
    expect(SCRIPT).not.toMatch(/writeFile|appendFile|createWriteStream|fs\./)
    expect(SCRIPT).not.toMatch(/console\.(log|error|info)\([^)]*\bpass\b/)
    expect(SCRIPT).not.toMatch(/process\.env/)
    expect(SCRIPT).not.toMatch(/argv[^\n]*pass|--(clave|password|pass)/i) // la contraseña nunca va en la línea de comandos
    expect(SCRIPT).toContain('setRawMode(true)') // teclado sin eco
    expect(SCRIPT).toContain("process.stdout.write('*')") // solo asteriscos
    expect(SCRIPT).toContain("pass = '' ")
  })

  it('solo habla con el servidor de correo: ni Supabase, ni DNS, ni base de datos, ni red de PEPA', () => {
    // Solo importa módulos de Node para conectarse por TCP/TLS y leer el teclado: nada de librerías de Supabase ni de red HTTP.
    const imports = (SCRIPT.match(/^import .* from '([^']+)'/gm) ?? []).map((l) => /from '([^']+)'/.exec(l)![1])
    expect(imports.sort()).toEqual(['node:crypto', 'node:net', 'node:readline', 'node:tls', 'node:url'])
    expect(SCRIPT).not.toMatch(/fetch\(|https?:\/\/|dns\.|resolve4|resolveTxt/i)
    expect(SCRIPT).toContain("host: 'smtp.mail.ovh.net'")
  })

  it('por línea de comandos solo usa el puerto 465 (TLS directo) o 587 (STARTTLS); un único correo, con confirmación previa', () => {
    expect(SCRIPT).toContain('![465, 587].includes(port)')
    expect(SCRIPT).toContain("port === 587 ? 'starttls' : 'tls'")
    expect(SCRIPT).toContain('¿Continuar? (s/n)')
    expect((SCRIPT.match(/runSmtpTest\(\{/g) ?? []).length).toBe(2) // la definición y UNA sola llamada desde main()
  })
})

describe('mensajes de ayuda', () => {
  it('cada resultado explica en palabras sencillas qué pasó y qué hacer', () => {
    const all: SmtpVerdict[] = ['OK', 'AUTH_FALLIDA', 'REMITENTE_RECHAZADO', 'DESTINATARIO_RECHAZADO', 'DATOS_RECHAZADOS', 'CONEXION']
    for (const v of all) expect(explainVerdict(v, { to: 'x@gmail.com' }).join(' ').length, v).toBeGreaterThan(40)
    expect(explainVerdict('OK', { to: 'x@gmail.com' }).join('\n')).toContain('Mostrar original')
    expect(explainVerdict('REMITENTE_RECHAZADO').join('\n')).toContain('info@pepafamilyapp.es')
  })

  it('el correo de prueba va marcado como prueba y con el remitente del alias', () => {
    const m = buildTestMessage({ from: DEFAULTS.from, fromName: DEFAULTS.fromName, to: 'a@b.es', now: new Date('2026-10-21T12:34:00Z') })
    expect(m).toContain('<no-reply@pepafamilyapp.es>')
    expect(m).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(m).not.toMatch(/\r\n\./) // sin líneas que empiecen por punto (final de mensaje SMTP)
  })
})
