// Petición real: "vamos a hacer todo lo que falta para que sea la mejor
// del mercado" — textos legales obligatorios antes de cobrar y de tratar
// datos bancarios y de menores de otras familias (RGPD / LOPDGDD). El
// usuario todavía no tiene los datos de la empresa: los huecos van
// marcados como «[…]» y agrupados en LEGAL_PLACEHOLDERS para rellenarlos
// de una vez cuando existan. Mientras haya huecos, NO cobrar.
//
// Se puede leer sin sesión (enlace desde la pantalla de entrada): una
// persona tiene que poder leer la política ANTES de crear la cuenta.

export const LEGAL_PLACEHOLDERS = {
  responsable: '[Nombre o razón social del responsable]',
  nif: '[NIF/CIF]',
  direccion: '[Dirección postal completa]',
  email: '[email de contacto para privacidad]',
  fechaVersion: '[fecha de esta versión]',
} as const

export type LegalKind = 'privacidad' | 'condiciones'

export const LEGAL_TITLES: Record<LegalKind, string> = {
  privacidad: 'Política de privacidad',
  condiciones: 'Condiciones de uso',
}

const P = LEGAL_PLACEHOLDERS

function PrivacyText() {
  return (
    <>
      <p className="muted">Versión: {P.fechaVersion}</p>

      <h2 className="section-title">1. Quién es el responsable</h2>
      <p>
        {P.responsable}, con NIF {P.nif} y domicilio en {P.direccion}. Para cualquier cuestión sobre tus datos escribe a{' '}
        {P.email}.
      </p>

      <h2 className="section-title">2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Cuenta:</strong> email y contraseña (cifrada), nombre que eliges mostrar, y las cuentas de tu familia que tú
          mismo/a invites.
        </li>
        <li>
          <strong>Lo que tu familia apunta en la app:</strong> eventos y tareas del calendario, listas de la compra, tickets
          (foto y líneas), recetas y menús, contactos, documentos que subes, fotos de la galería, puntos y recompensas de
          los niños, notas.
        </li>
        <li>
          <strong>Economía:</strong> los gastos e ingresos que apuntas a mano o desde tickets y, SOLO si tú lo activas,
          los movimientos y saldos de las cuentas bancarias que conectes (ver punto 5).
        </li>
        <li>
          <strong>Ubicación (opcional):</strong> solo de los miembros que la activen expresamente; el rastro detallado
          se borra automáticamente a las 24 horas, y las visitas a lugares a los 90 días.
        </li>
        <li>
          <strong>Voz:</strong> lo que le dictas a Pepa se convierte en texto en tu propio dispositivo (reconocimiento
          de voz del navegador/sistema) y se guarda solo el resultado (la cita, la lista...), no el audio.
        </li>
        <li>
          <strong>Datos técnicos:</strong> si la app falla, registramos el error, la pantalla en la que estabas y el
          navegador, para arreglarlo. Nunca el contenido de lo que estabas escribiendo.
        </li>
      </ul>

      <h2 className="section-title">3. Datos de menores</h2>
      <p>
        Los datos de niños y niñas (nombre, cumpleaños, tareas, puntos, hucha, medidas si las apuntáis) los introducen y
        controlan sus padres, madres o tutores legales desde su propia cuenta. Un menor solo puede tener cuenta propia si
        la crea o autoriza su padre, madre o tutor mediante el código de invitación de la familia, y puede limitarse a
        qué secciones accede. Puedes borrar en cualquier momento los datos de un menor desde Familia.
      </p>

      <h2 className="section-title">4. Para qué y con qué base legal</h2>
      <ul>
        <li>
          <strong>Prestar el servicio</strong> que has contratado o aceptado (organizar tu familia): ejecución del
          contrato (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Conexión bancaria, ubicación y notificaciones:</strong> solo con tu consentimiento expreso, que puedes
          retirar cuando quieras desde la propia app (art. 6.1.a RGPD).
        </li>
        <li>
          <strong>Seguridad y arreglo de fallos:</strong> interés legítimo en que la app funcione y sea segura (art. 6.1.f
          RGPD).
        </li>
      </ul>
      <p>No usamos tus datos para publicidad ni los vendemos a nadie.</p>

      <h2 className="section-title">5. Conexión con tu banco</h2>
      <p>
        Si conectas una cuenta bancaria, lo haces a través de un proveedor autorizado de acceso a cuentas (PSD2), que es
        quien se identifica ante tu banco con tu consentimiento explícito; nosotros nunca vemos ni guardamos tus claves
        del banco. Recibimos únicamente movimientos y saldos de lectura, para mostrarlos y categorizarlos en Economía.
        Puedes desconectar la cuenta cuando quieras desde Economía → Banco, y el consentimiento caduca por sí solo según
        el plazo que marque tu banco (normalmente 90 o 180 días).
      </p>

      <h2 className="section-title">6. Quién más trata tus datos (encargados)</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (base de datos, autenticación y almacenamiento de archivos), en servidores de la
          Unión Europea.
        </li>
        <li>
          <strong>Proveedor de acceso bancario PSD2</strong> (solo si conectas un banco), autorizado en la UE.
        </li>
        <li>
          <strong>Google</strong> (solo si enlazas Google Calendar), según sus propias condiciones.
        </li>
        <li>
          <strong>Servicios de notificaciones push</strong> del navegador/sistema (solo si las activas).
        </li>
      </ul>
      <p>Todos actúan siguiendo nuestras instrucciones y con contrato de encargado de tratamiento.</p>

      <h2 className="section-title">7. Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tengas cuenta. Si la borras, eliminamos tus datos y los de tu familia en un plazo máximo de 30 días,
        salvo lo que debamos conservar por obligación legal (por ejemplo, facturas). La ubicación detallada se borra a
        las 24 horas y las visitas a los 90 días de forma automática.
      </p>

      <h2 className="section-title">8. Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, borrar, limitar u oponerte al tratamiento y pedir la portabilidad de tus datos
        escribiendo a {P.email}. Casi todo puedes hacerlo tú mismo/a desde la app (editar o borrar cualquier apunte,
        desconectar el banco, desactivar la ubicación, borrar miembros). Si crees que no te hemos atendido bien, puedes
        reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).
      </p>

      <h2 className="section-title">9. Seguridad</h2>
      <p>
        Cada familia solo puede ver sus propios datos (aislamiento en la propia base de datos). Toda la comunicación va
        cifrada. Puedes proteger además la app con un PIN o huella/cara desde Ajustes.
      </p>

      <h2 className="section-title">10. Cambios</h2>
      <p>Si cambiamos esta política te lo diremos dentro de la app antes de que entre en vigor.</p>
    </>
  )
}

function TermsText() {
  return (
    <>
      <p className="muted">Versión: {P.fechaVersion}</p>

      <h2 className="section-title">1. Qué es Family App</h2>
      <p>
        Una aplicación para organizar la vida de una familia (calendario, compras, cocina, economía, niños...) ofrecida
        por {P.responsable} ({P.nif}, {P.direccion}, {P.email}). Al crear una cuenta aceptas estas condiciones y la{' '}
        Política de privacidad.
      </p>

      <h2 className="section-title">2. Cuenta y acceso</h2>
      <p>
        Para crear una familia hace falta un código de invitación. Eres responsable de guardar tu contraseña y de a quién
        invitas a tu familia. Quien administra la familia decide qué ven los demás miembros. Debes ser mayor de edad para
        crear una familia; los menores solo participan bajo la cuenta y el control de sus padres, madres o tutores.
      </p>

      <h2 className="section-title">3. Uso correcto</h2>
      <p>
        La app es para uso personal y familiar. No puedes usarla para fines ilegales, para acceder a datos de otras
        familias, ni intentar saltarte sus medidas de seguridad. El contenido que subes (fotos, documentos, tickets) es
        tuyo y respondes de tener derecho a subirlo.
      </p>

      <h2 className="section-title">4. Economía y banco</h2>
      <p>
        La información económica (categorías, conclusiones de Pepa, previsiones) es orientativa y se calcula a partir de lo
        que tú apuntas o de lo que devuelve tu banco; no es asesoramiento financiero. La conexión bancaria es de solo
        lectura y opcional.
      </p>

      <h2 className="section-title">5. Precio</h2>
      <p>
        [Durante la fase de prueba la app es gratuita para las familias invitadas. Si en el futuro se cobra una
        suscripción, se avisará con antelación dentro de la app y nunca se cobrará sin aceptación expresa.]
      </p>

      <h2 className="section-title">6. Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que la app funcione siempre, pero no podemos garantizar que esté disponible sin interrupciones ni
        libre de errores, y puede cambiar o retirarse alguna función. En la medida que permita la ley, no respondemos de
        daños indirectos derivados del uso de la app (por ejemplo, una cita mal apuntada o un cálculo económico
        orientativo). Recomendamos comprobar siempre los datos importantes.
      </p>

      <h2 className="section-title">7. Baja</h2>
      <p>
        Puedes dejar de usar la app y pedir el borrado de tu cuenta y la de tu familia cuando quieras escribiendo a{' '}
        {P.email}. Podemos suspender cuentas que incumplan estas condiciones.
      </p>

      <h2 className="section-title">8. Ley aplicable</h2>
      <p>Estas condiciones se rigen por la legislación española. Para cualquier conflicto, los juzgados del domicilio del usuario.</p>
    </>
  )
}

export function LegalScreen({ kind, standalone = false }: { kind: LegalKind; standalone?: boolean }) {
  return (
    <div className={standalone ? 'screen screen-centered' : 'screen'} style={{ maxWidth: 720, margin: '0 auto', alignItems: 'stretch' }}>
      <h1>{LEGAL_TITLES[kind]}</h1>
      {kind === 'privacidad' ? <PrivacyText /> : <TermsText />}
      <p className="muted" style={{ marginTop: 24 }}>
        {kind === 'privacidad' ? (
          <a href={`${import.meta.env.BASE_URL}condiciones`}>Ver las condiciones de uso →</a>
        ) : (
          <a href={`${import.meta.env.BASE_URL}privacidad`}>Ver la política de privacidad →</a>
        )}
      </p>
      {standalone && (
        <p>
          <a href={import.meta.env.BASE_URL}>← Volver a la app</a>
        </p>
      )}
    </div>
  )
}
