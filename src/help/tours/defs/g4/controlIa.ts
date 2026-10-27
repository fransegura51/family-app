import type { TourDef } from '@/help/tours/types'

// Centro de Administración → Control de IA (solo cuentas propietarias). Recorridos INFORMATIVOS: ninguno pulsa, activa, desactiva, guarda ni cambia un límite por la persona
// (apagar la IA o poner un límite en bloqueo afecta a todas las familias). Serie «Control de IA» (src/help/tours/series/e.ts).

const ACCESS = { ownerOnly: true } as const

export const controlIaInterruptores: TourDef = {
  id: 'tut-admin-ia-interruptores',
  module: 'configuracion',
  summary: 'El interruptor general de la IA, los interruptores por función y qué pasa cuando apagas uno (solo administración de PEPA).',
  access: ACCESS,
  version: 1,
  title: 'Interruptores de la IA',
  cardId: 'adm-control-ia',
  durationSec: 90,
  startPath: '/administracion',
  startDest: 'admin.control-ia',
  paths: ['/administracion'],
  readyOn: ['ia.interruptor-general'],
  steps: [
    {
      id: 'general',
      text: 'Este es el interruptor general de la inteligencia artificial de PEPA. Si lo desactivas, ninguna función hace llamadas nuevas a la IA; los módulos siguen funcionando de forma normal y no se borra nada. Yo no lo toco.',
      target: 'ia.interruptor-general',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'funcion',
      text: 'Debajo hay un interruptor por cada función con IA, agrupadas por módulo. Cada una dice si está activada, desactivada por ti, en espera de algo (por ejemplo, que Comunidad esté abierta) o con un fallo técnico. Al reactivar el general, vuelve exactamente la selección que tenías.',
      target: 'ia.funcion-articulos',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'grupo',
      text: 'La lista sale de un registro central: si PEPA añade una función con IA, aparece aquí sola. Los cambios se ven al momento en tus otros dispositivos y quedan anotados en el registro de cambios.',
      target: 'ia.grupo-interruptores',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Para ver cuánto consume cada función y poner límites, mira el capítulo «Consumo, límites y alertas».',
  next: ['adm-control-ia'],
}

export const controlIaConsumo: TourDef = {
  id: 'tut-admin-ia-consumo',
  module: 'configuracion',
  summary: 'Consumo y coste estimado por función y familia, límites (en observación al empezar), alertas y la proyección de costes.',
  access: ACCESS,
  version: 1,
  title: 'Consumo, límites y alertas de IA',
  cardId: 'adm-control-ia',
  durationSec: 110,
  startPath: '/administracion',
  startDest: 'admin.control-ia',
  paths: ['/administracion'],
  readyOn: ['ia.grupo-consumo'],
  steps: [
    {
      id: 'consumo',
      text: '«Consumo y costes» enseña las llamadas, los tokens y el coste ESTIMADO por función, módulo y modelo, con filtros de periodo y gráficos. Son estimaciones a tarifa pública, no la factura. Pulsa su título para desplegarlo.',
      target: 'ia.grupo-consumo',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'limites',
      text: '«Límites y presupuestos» permite poner topes por toda la IA, módulo, función o familia. Todos empiezan en «Observación»: solo registran. «Aviso» alerta y «Bloqueo» impide nuevas operaciones; pide confirmación.',
      target: 'ia.grupo-limites',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'alertas',
      text: '«Alertas y anomalías» avisa de subidas bruscas, posibles bucles, errores del proveedor y límites cercanos. Una alerta no es una acusación: revísala antes de restringir nada.',
      target: 'ia.grupo-alertas',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'proyeccion',
      text: '«Proyección de costes» simula 1.000, 10.000 o 100.000 familias con el consumo real o con tus hipótesis. Es una proyección, nunca gasto real, y se marca como provisional si aún hay pocos datos.',
      target: 'ia.grupo-proyeccion',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Recuerda: ningún límite bloquea nada hasta que tú lo pases a «Bloqueo».',
  next: ['adm-control-ia'],
}

export const TOURS_CONTROL_IA: TourDef[] = [controlIaInterruptores, controlIaConsumo]
