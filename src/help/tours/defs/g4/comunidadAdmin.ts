import type { TourDef } from '@/help/tours/types'

// Comunidad, solo administración de PEPA (cuentas propietarias): la generación semanal con IA y «Rectificar con Pepa». Viven en el Centro de Administración → Comunidad → Contenido
// oficial (/administracion). Son recorridos INFORMATIVOS: ninguno pulsa, escribe, genera, acepta, aprueba ni publica por la persona (generar y rectificar gastan IA; aceptar guarda una
// versión). Serie «Generación semanal y Rectificar con Pepa» (src/help/tours/series/e.ts).

const ACCESS = { ownerOnly: true, community: true } as const

export const comunidadAdminGeneracion: TourDef = {
  id: 'tut-comunidad-admin-generacion',
  module: 'comunidad',
  summary: 'Los interruptores de la generación semanal, «Generar ahora» y el programa de la semana (solo administración de PEPA).',
  access: ACCESS,
  version: 1,
  title: 'Generación semanal de borradores',
  cardId: 'com-admin-generacion',
  durationSec: 100,
  startPath: '/administracion',
  startDest: 'admin.comunidad-oficial',
  paths: ['/administracion'],
  readyOn: ['comunidad.editorial-panel'],
  steps: [
    {
      id: 'panel',
      text: 'Este es el panel «Generación semanal». Cada miércoles a las 08:00 (hora de Madrid) Pepa prepara BORRADORES: 7 artículos, 1 encuesta y 1 menú. Generar nunca publica nada; lo decides tú aprobando.',
      target: 'comunidad.editorial-panel',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'interruptor',
      text: 'Artículos, Encuesta y Menú semanal tienen cada uno su interruptor Activar/Pausar. Empiezan en pausa. Pausar solo detiene los borradores nuevos: lo ya preparado o aprobado no cambia. Yo no lo toco.',
      target: 'comunidad.editorial-toggle-articles',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'ahora',
      text: '«Generar ahora» es para pruebas y funciona aunque el tipo esté en pausa. Pide confirmación porque gasta IA y puede tardar hasta dos minutos. Yo no lo pulso; solo crea borradores.',
      target: 'comunidad.editorial-generate-articles',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'autopublicar',
      text: '«Publicar a su hora el menú ya aprobado» es un control aparte de la generación: decide si un menú que tú ya aprobaste sale solo el sábado a las 10:00. Al activarlo pide confirmación. Yo no lo toco.',
      target: 'comunidad.editorial-menu-autopublish',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'historial',
      text: 'Aquí ves el historial de ejecuciones, con su resultado y los errores en español claro. Si algo falla, el panel lo cuenta sin textos técnicos.',
      target: 'comunidad.editorial-history',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'programa',
      text: 'El «Programa de la semana» enseña cada día con su artículo, la encuesta del sábado y el menú, con su estado: borrador, aprobado y programado a las 10:00, publicado o con error.',
      target: 'comunidad.editorial-program',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'revisar',
      text: '«Revisar» abre ese elemento justo debajo, en su tarjeta, para leerlo, rectificarlo, editarlo, aprobarlo o rechazarlo. Aprobar un artículo del programa lo programa para su día; no lo publica al momento.',
      target: 'comunidad.editorial-review',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Recuerda: nada sale sin que lo apruebes tú. Para cambiar un borrador con ayuda de Pepa, mira el capítulo «Rectificar con Pepa».',
  next: ['com-admin-rectificar'],
}

export const comunidadAdminRectificar: TourDef = {
  id: 'tut-comunidad-admin-rectificar',
  module: 'comunidad',
  summary: 'Pedirle a Pepa cambios en un borrador, compararlos, aceptarlos o rechazarlos y volver a una versión anterior.',
  access: ACCESS,
  version: 1,
  title: 'Rectificar un borrador con Pepa',
  cardId: 'com-admin-rectificar',
  durationSec: 110,
  startPath: '/administracion',
  startDest: 'admin.comunidad-oficial',
  paths: ['/administracion'],
  readyOn: ['comunidad.editorial-panel'],
  needs: [{ target: 'comunidad.revise-open', message: 'Para practicar este capítulo necesitas algún artículo, encuesta o menú sin publicar en Contenido oficial, y ahora no hay ninguno. Puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'abrir',
      text: 'En un borrador sin publicar, el botón «Rectificar con Pepa» abre el panel de cambios. Pulsarlo no gasta IA ni cambia nada. En un menú, junto a cada plato verás «Cambiar este plato con Pepa».',
      target: 'comunidad.revise-open',
      completeOn: [{ type: 'click', target: 'comunidad.revise-open' }],
      skipIf: [{ type: 'appear', target: 'comunidad.revise-panel' }],
    },
    {
      id: 'instruccion',
      text: 'Escribe qué quieres cambiar con tus palabras, o elige un ejemplo. Pepa respeta lo que no le pidas tocar.',
      target: 'comunidad.revise-instruction',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'pedir',
      text: '«Pedir una nueva versión» gasta una llamada de IA y puede tardar un par de minutos. No cambia nada hasta que aceptes. Yo no lo pulso.',
      target: 'comunidad.revise-ask',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'comparar',
      text: 'La comparación marca en verde lo añadido y en rojo lo eliminado, y muestra recetas, opciones de encuesta o platos del menú que cambian, con lo que dice Pepa que ha hecho.',
      target: 'comunidad.revise-compare',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'decidir',
      text: '«Aceptar esta versión» guarda una versión nueva y la anterior se conserva. Aceptar NUNCA publica: el borrador vuelve a «Pendiente de revisar» y hay que aprobarlo de nuevo. «Rechazar» no cambia nada.',
      target: 'comunidad.revise-accept',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'historial',
      text: 'El historial de versiones te deja «Restaurar esta versión» (crea otra versión nueva, no borra ninguna) y retomar una propuesta sin decidir.',
      target: 'comunidad.revise-history',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Puedes repetirlo las veces que haga falta o editar a mano con «Editar». Recuerda aprobar de nuevo el borrador rectificado.',
  next: ['com-admin-generacion'],
}

export const TOURS_COMUNIDAD_ADMIN: TourDef[] = [comunidadAdminGeneracion, comunidadAdminRectificar]
