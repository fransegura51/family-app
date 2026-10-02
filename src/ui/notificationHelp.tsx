// Pasos para desbloquear los avisos cuando el navegador no deja ni preguntar. Compartido por la tarjeta
// de Familia (siempre visible) y la de Inicio (primer arranque): las dos tienen que dar exactamente la
// misma ayuda.
//
// Cada sistema esconde el permiso en un sitio distinto, así que son pasos cortos y numerados por
// plataforma (el párrafo largo de la primera versión no se entendía en el móvil de Paco, caso real). En
// Android el permiso vive en los ajustes de SITIOS de Chrome, y NUNCA se aconseja "Borrar y restablecer"
// desde aquí: borra la sesión y quien lo hace no siempre puede volver a escribir la contraseña.
function deniedSteps(): string[] {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) {
    // Caso real (el Android de Paco): Chrome contesta "denegado" SIN preguntar tras haber ignorado o
    // rechazado la pregunta varias veces. En una pestaña normal de Chrome sí salen la pregunta y el candado
    // con sus permisos, y el permiso es por página, no por ventana: concedido ahí, vale también para PEPA.
    return [
      'Abre Chrome desde su icono (el navegador normal, con la barra de direcciones arriba, no esta ventana de PEPA).',
      `Escribe esta dirección y entra: ${window.location.origin}${import.meta.env.BASE_URL}familia`,
      'Toca "Activar avisos". Si Chrome pregunta, elige "Permitir".',
      'Si no pregunta nada: toca el candado a la izquierda de la dirección, entra en Permisos, Notificaciones, y elige "Permitir".',
      'Vuelve a PEPA, cierra la app del todo y ábrela otra vez.',
      'Si sigue igual: Ajustes del móvil, Aplicaciones, Chrome, Notificaciones, y deja activado "Mostrar notificaciones".',
    ]
  }
  if (/iphone|ipad/i.test(ua)) return ['Abre los Ajustes del iPhone, Notificaciones, PEPA, y activa "Permitir notificaciones".', 'Vuelve aquí y toca "Activar avisos".']
  return ['Abre los ajustes del móvil, Aplicaciones, PEPA, Notificaciones, y permítelas.', 'Vuelve aquí y toca "Activar avisos".']
}

export function StepsList() {
  return (
    <ol className="muted" style={{ paddingLeft: 20, margin: '6px 0' }}>
      {deniedSteps().map((step) => (
        <li key={step} style={{ marginBottom: 6 }}>
          {step}
        </li>
      ))}
    </ol>
  )
}
