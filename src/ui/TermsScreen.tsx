// Página pública (sin sesión) — la pide Enable Banking al dar de alta
// la aplicación en su panel ("Terms URL of the application"). Ver
// App.tsx: se sirve antes de la pantalla de login.
export function TermsScreen() {
  return (
    <div className="screen">
      <h1>Términos de uso</h1>
      <p className="muted">Última actualización: septiembre de 2026</p>

      <p>
        Family App es una aplicación de organización familiar (calendario, compras, alimentación, economía,
        documentos y fotos). Actualmente es de uso privado para una familia; en el futuro podría ofrecerse a otras
        familias en las mismas condiciones.
      </p>

      <h2>Uso de la aplicación</h2>
      <p>
        La app se ofrece "tal cual", sin garantía de disponibilidad continua. Cada familia es responsable de la
        veracidad de los datos que introduce (gastos, eventos, documentos...).
      </p>

      <h2>Cuentas bancarias (Enable Banking)</h2>
      <p>
        Al enlazar una cuenta bancaria, la familia autoriza expresamente a Enable Banking (proveedor regulado de
        servicios de información de cuentas, bajo normativa PSD2) a compartir con esta app la lista de cuentas,
        saldos y movimientos de esa cuenta, durante el plazo de consentimiento que se acepte en cada momento. Esa
        autorización puede revocarse en cualquier momento desde Economía → Banco, o directamente desde el propio
        banco.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        La app no sustituye asesoramiento financiero, médico ni legal profesional. Las estadísticas y conclusiones
        económicas se calculan a partir de los datos introducidos y pueden no ser exactas si esos datos son
        incompletos.
      </p>

      <h2>Contacto</h2>
      <p>
        Para cualquier duda: <a href="mailto:jenniferhepburn@live.com">jenniferhepburn@live.com</a>
      </p>
    </div>
  )
}
