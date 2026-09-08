// Página pública (sin sesión) — la pide Enable Banking al dar de alta
// la aplicación en su panel ("Privacy URL of the application"), y en
// general cualquier integración externa (Google, bancos...) necesita
// poder verla sin iniciar sesión. Ver App.tsx: se sirve antes de la
// pantalla de login, no dentro de las rutas protegidas.
export function PrivacyScreen() {
  return (
    <div className="screen">
      <h1>Política de privacidad</h1>
      <p className="muted">Última actualización: septiembre de 2026</p>

      <p>
        Family App es una aplicación de uso privado, creada para la organización de una familia (calendario,
        compras, alimentación, economía, documentos y fotos compartidas). Esta página explica qué datos guarda y
        cómo se usan.
      </p>

      <h2>Qué datos se guardan</h2>
      <p>
        Los datos que la propia familia introduce al usar la app: eventos de calendario, listas y tickets de la
        compra, productos y precios, movimientos económicos, documentos, fotos, contactos, y — si se activa
        voluntariamente — ubicación en tiempo real de los miembros y cuentas bancarias enlazadas.
      </p>

      <h2>Dónde se guardan</h2>
      <p>
        Toda la información se guarda en la base de datos de Supabase asociada a esta aplicación, con acceso
        restringido a los miembros de la propia familia mediante autenticación y reglas de seguridad por familia
        (nadie fuera de la familia puede ver estos datos).
      </p>

      <h2>Servicios externos que se usan</h2>
      <ul>
        <li>
          <strong>Enable Banking</strong> (si se enlaza una cuenta bancaria): permite leer los movimientos de las
          cuentas que la familia autorice expresamente, bajo normativa PSD2 de banca abierta europea.
        </li>
        <li>
          <strong>Google Calendar</strong> (si se enlaza): sincroniza los eventos de la app con el calendario de
          Google de quien lo active.
        </li>
        <li>
          <strong>Google Gemini</strong>: analiza fotos de tickets y correos reenviados para extraer productos,
          precios o eventos, solo cuando la familia sube esas fotos o reenvía esos correos.
        </li>
        <li>
          <strong>OpenStreetMap / Nominatim</strong>: búsqueda de direcciones al añadir una ubicación a un evento.
        </li>
      </ul>
      <p>Ningún dato se vende ni se comparte con terceros con fines publicitarios.</p>

      <h2>Control de la familia</h2>
      <p>
        Cualquier miembro puede borrar sus propios datos, desenlazar una cuenta bancaria o un calendario externo, y
        desactivar el compartir ubicación en cualquier momento desde la propia app.
      </p>

      <h2>Contacto</h2>
      <p>
        Para cualquier duda sobre privacidad o protección de datos: <a href="mailto:jenniferhepburn@live.com">jenniferhepburn@live.com</a>
      </p>
    </div>
  )
}
