import type { PlannedSeries } from '@/help/tours/planned/types'

// Recorridos planificados (Eventos, Documentos, Galería, Contactos y Cumpleaños): funciones todavía en desarrollo o sin validar. Ver planned/types.ts.
//
// Los 8 módulos de Eventos que hoy no tienen recorrido. Todos EXISTEN como pantallas y la visita «Conoce Eventos» los nombra, pero no se escribe su «Enséñame» hasta que se validen en el
// móvil: docs/QA_EVENTOS_PENDIENTES.md («Ninguna prueba está marcada como validada: las marca el equipo al probarla en iPhone») y docs/PEPA_CONTROL_REQUISITOS.md (estado de cada parte).
// Cuando una se valide, pasa a ser un capítulo de una serie de src/help/tours/series/d.ts y se quita de aquí.
export const PLANNED_D: PlannedSeries[] = [
  {
    id: 'ser-eventos-pagos-fianzas',
    module: 'eventos',
    title: 'Pagos y fianzas del evento',
    summary: 'Apuntar un pago a un proveedor, sus abonos y su fianza, y ver lo pendiente.',
    blockedBy:
      'Implementado el 10/10/2026 (pagos parciales, fianzas, vencimientos y documento adjunto; EVT-E1 a E6, migración 0236) pero sin validar en iPhone: ninguna prueba de docs/QA_EVENTOS_PENDIENTES.md está marcada como validada. Mueve importes y fianzas reales y alimenta Comprometido/Pagado del Presupuesto, así que hay que validarlo antes de enseñarlo.',
  },
  {
    id: 'ser-eventos-decoracion',
    module: 'eventos',
    title: 'Decoración del evento',
    summary: 'Apuntar ideas de decoración y marcar cuáles están compradas o hechas.',
    blockedBy:
      'Pantalla sin validar en iPhone (docs/QA_EVENTOS_PENDIENTES.md sin pruebas marcadas). Sus ideas también salen del configurador (qué incluye el lugar) y de «Organízamelo Pepa»; falta validar cómo se enlazan para no enseñar algo que luego duplique tareas o presupuesto (EVT-G5 / COR-2.3).',
  },
  {
    id: 'ser-eventos-actividades',
    module: 'eventos',
    title: 'Actividades y juegos del evento',
    summary: 'Apuntar las actividades y juegos previstos para la celebración.',
    blockedBy:
      'Pantalla sin validar en iPhone (docs/QA_EVENTOS_PENDIENTES.md sin pruebas marcadas). Recibe propuestas de «Organízamelo Pepa», cuyo efecto sobre lo ya apuntado (no quita lo que ya añadiste, puede repetir) hay que validar antes de enseñar el flujo.',
  },
  {
    id: 'ser-eventos-mesas',
    module: 'eventos',
    title: 'Mesas del evento',
    summary: 'Crear mesas y sentar a los invitados en cada una.',
    blockedBy:
      'Pantalla sin validar en iPhone (docs/QA_EVENTOS_PENDIENTES.md sin pruebas marcadas) y depende de la lista de Invitados cerrada y de la exportación «por mesas»; falta comprobar la asignación (incluido el aviso de mesa llena) con invitados reales.',
  },
  {
    id: 'ser-eventos-ceremonia',
    module: 'eventos',
    title: 'Ceremonia y celebración',
    summary: 'Organizar un evento por momentos (ceremonia y celebración), con su fecha y lugar.',
    blockedBy:
      'No es una pantalla propia ni una tarjeta de la rejilla: sus datos viven en «Gestionar evento» y en el bloque «Ceremonia y celebración» del configurador, que se está completando por fases y solo aplica a comunión, bautizo y boda. Hasta que ese bloque esté cerrado y validado en iPhone no hay un recorrido estable que enseñar.',
  },
  {
    id: 'ser-eventos-proveedores',
    module: 'eventos',
    title: 'Proveedores y ofertas del evento',
    summary: 'Enlazar proveedores al evento, comparar ofertas y resolver un encargo.',
    blockedBy:
      'Parcial según docs/PEPA_CONTROL_REQUISITOS.md (EVT-A2, EVT-A4, EVT-A5): «Habitual» no se ve en el registro global, no hay valoraciones y el aviso de proveedor repetido aún no está en «Resolver encargo». Además sigue sin validar en iPhone (QA_EVENTOS_PENDIENTES.md, pruebas 397 a 405 y 426).',
  },
  {
    id: 'ser-eventos-detalles-recuerdos',
    module: 'eventos',
    title: 'Detalles y recuerdos del evento',
    summary: 'Preparar detalles para los invitados y regalos para personas especiales (padrinos, testigos…).',
    blockedBy:
      'Auditado el 10/10/2026 sin fallos (EVT-DET-1 a 3), pero las pruebas manuales 495 a 510 de docs/QA_EVENTOS_PENDIENTES.md siguen sin validar en iPhone, y depende de «Personas especiales» del configurador, que se está completando.',
  },
  {
    id: 'ser-eventos-regalos-recibidos',
    module: 'eventos',
    title: 'Regalos recibidos en el evento',
    summary: 'Apuntar los regalos que llegan (privado) y el total en efectivo.',
    blockedBy:
      'Sin validar en iPhone (docs/QA_EVENTOS_PENDIENTES.md, prueba 444 y siguientes sin marcar). Es privado (no sale en la página pública de confirmación) y suma dinero en efectivo: conviene validar el alta y el total con datos reales antes de enseñarlo.',
  },
]
