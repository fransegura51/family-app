import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Calendario. Los capítulos que ya existían conservan su identificador (ver aliases/a.ts para los que se fusionaron).
export const SERIES_A: TutorialSeries[] = [
  {
    id: 'ser-calendario-moverte',
    module: 'calendario',
    title: 'Moverte por tu calendario',
    summary: 'Cambiar de vista, moverte por meses y días, saltar a una fecha, filtrar por persona y usar tus notas en Personal.',
    chapters: ['tut-calendario-cambiar-vista', 'tut-calendario-saltar-fecha', 'tut-calendario-filtrar-persona', 'tut-calendario-nota-personal'],
    cardIds: ['cal-vistas', 'cal-saltar-fecha', 'cal-privado'],
    synonyms: ['vistas', 'mes', 'semana', 'agenda', 'ir a una fecha', 'filtrar', 'notas', 'personal', 'navegar por el calendario', 'cambiar de día'],
  },
  {
    id: 'ser-calendario-crear',
    module: 'calendario',
    title: 'Crear eventos y tareas',
    summary: 'Crear un evento paso a paso (y en qué se diferencia una tarea): fecha, hora, personas, repetición, recordatorio, puntos, ubicación, adjuntos y guardar.',
    chapters: [
      'cal-crear-evento',
      'tut-calendario-para-quien',
      'tut-calendario-evento-repetitivo',
      'tut-calendario-evento-recordatorio',
      'tut-calendario-puntos',
      'tut-calendario-ubicacion-adjuntos',
      'tut-calendario-guardar-evento',
    ],
    cardIds: ['cal-crear-evento', 'cal-crear-tarea', 'cal-para-quien', 'cal-repeticion', 'cal-recordatorio', 'cal-puntos', 'cal-privado'],
    synonyms: ['nuevo evento', 'nueva tarea', 'crear una cita', 'apuntar', 'repetir', 'recordatorio', 'puntos', 'para quién', 'privado', 'categoría'],
  },
  {
    id: 'ser-calendario-gestionar',
    module: 'calendario',
    title: 'Gestionar eventos y tareas',
    summary: 'Entender una fila, marcar como hecho, editar, cambiar una serie, compartir, saber cómo se borra y (opcional) conectar calendarios externos.',
    chapters: [
      'tut-calendario-consultar-apunte',
      'tut-calendario-marcar-hecho',
      'tut-calendario-editar-evento',
      'tut-calendario-cambiar-serie',
      'tut-calendario-compartir',
      'tut-calendario-borrar-apunte',
      'tut-calendario-google',
    ],
    cardIds: ['cal-hecho', 'cal-compartir', 'cal-google', 'cal-repeticion'],
    synonyms: ['hecho', 'completar', 'editar', 'cambiar un evento', 'serie', 'borrar', 'eliminar', 'compartir', 'google calendar', 'calendario externo'],
  },
]
