import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Configuración, Cuentas y Avisos.
export const SERIES_F: TutorialSeries[] = [
  {
    id: 'ser-configuracion-personalizar',
    module: 'configuracion',
    title: 'Personalizar PEPA',
    summary: 'Elige los colores, saca a la pantalla los accesos de los menús ☰ y ajusta lo de la familia.',
    chapters: [
      'tut-configuracion-colores',
      'tut-configuracion-sacar-accesos',
      'tut-configuracion-nombre-familia',
      'tut-configuracion-bebe-a-nino',
    ],
    cardIds: ['cfg-que-hay', 'cfg-colores', 'cfg-sacar-accesos', 'cfg-sincronizacion', 'cfg-nombre-familia', 'cfg-bebe-a-nino'],
    synonyms: ['ajustes', 'cambiar colores', 'poner un botón en la pantalla', 'orden del menú', 'nombre de la familia', 'de bebé a niño', 'preferencias'],
  },
  {
    id: 'ser-cuentas-proteger',
    module: 'cuentas',
    title: 'Proteger mi cuenta',
    summary: 'Pon un PIN o la huella para abrir PEPA y cambia tu contraseña o tu correo con códigos de 6 cifras.',
    chapters: ['tut-cuentas-pin', 'tut-cuentas-cambiar-contrasena', 'tut-cuentas-correo-contrasena'],
    cardIds: ['cue-pin', 'cue-correo-contrasena'],
    synonyms: ['pin', 'huella', 'face id', 'contraseña', 'cambiar correo', 'bloqueo', 'seguridad'],
  },
  {
    id: 'ser-avisos-configurar',
    module: 'notificaciones',
    title: 'Tus avisos',
    summary: 'Activa los avisos en este móvil, elige cuándo recibes el resumen de tareas y aprende a usar la campana.',
    chapters: ['tut-notificaciones-activar', 'tut-notificaciones-horario-avisos', 'tut-notificaciones-campana'],
    cardIds: ['not-activar', 'not-resumen-tareas', 'not-campana'],
    synonyms: ['notificaciones', 'avisos del móvil', 'resumen de tareas', 'campana', 'no me llegan avisos', 'tareas atrasadas'],
  },
]
