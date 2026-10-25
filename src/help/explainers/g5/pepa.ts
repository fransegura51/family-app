import type { HelpExplainer } from '@/help/explainers/types'

// Hablar con PEPA: cuándo enseña una tarjeta para revisar y cuándo guarda al momento. Comprobado contra src/services/pepaPreferences.ts (`getAutoConfirm`), src/pepa/autoConfirm.ts,
// src/ui/ActionConfirmSheet.tsx y src/ui/PepaPreferencesCard.tsx el 25/10/2026. «Nada se guarda hasta confirmar» NO es siempre cierto: depende de este ajuste.

export const expPepaTarjetaODirecto: HelpExplainer = {
  id: 'exp-pepa-tarjeta-o-directo',
  module: 'pepa',
  title: 'Cuándo PEPA te enseña una tarjeta y cuándo lo guarda al momento',
  summary: 'Al pedirle que apunte algo, PEPA puede enseñarte antes una tarjeta para revisarlo o guardarlo directamente. Aquí se explica de qué depende y qué casos siempre llevan tarjeta.',
  synonyms: ['tarjeta de confirmación', 'sin tarjeta', 'guarda sin preguntar', 'por qué no sale la tarjeta', 'confirmar lo que apunta pepa', 'se guarda solo', 'hacerlo directamente'],
  sections: [
    {
      heading: 'Dos formas de apuntar',
      paragraphs: [
        'Con tarjeta: PEPA te enseña lo que va a hacer (título, día, a quién va…). Puedes cambiarlo y solo se guarda cuando pulsas el botón de guardar; «Cancelar» no guarda nada.',
        'Sin tarjeta («Hacerlo directamente, sin tarjeta»): PEPA lo guarda al momento y te cuenta lo que ha hecho. No hay un paso de revisión antes.',
      ],
    },
    {
      heading: 'Cuál tienes tú',
      paragraphs: [
        'Mientras no lo elijas, en la app del móvil viene sin tarjeta y en la web viene con tarjeta. Lo cambias en Configuración → tema «🗣️ Pepa». Es una preferencia tuya: se guarda en tu cuenta y no cambia lo de los demás.',
      ],
    },
    {
      heading: 'Cuándo sale la tarjeta aunque esté sin tarjeta',
      paragraphs: [
        'Siempre que sea un presupuesto (toca dinero). También cuando la tarjeta trae un aviso (por ejemplo, un posible duplicado o un choque de horario), cuando falta una elección por hacer (a quién va, qué plato…) y cuando es una tarea sin persona asignada, para que puedas decir de quién es.',
      ],
      example: 'Ejemplo inventado: con «sin tarjeta», «Tengo que llamar al fontanero» es una tarea sin persona, así que sale la tarjeta. Si en la frase dices el nombre de alguien de la familia, la tarea ya viene asignada a esa persona y se guarda directamente.',
    },
  ],
  limits: [
    'Sin tarjeta no hay revisión previa: si PEPA entiende mal la frase, ya está guardado y hay que corregirlo o borrarlo desde la pantalla de Calendario o Compras.',
    'Borrar hablando con PEPA no se puede, con tarjeta o sin ella.',
    'Primero entiende la frase con reglas fijas y solo si no la entiende usa la IA, y solo para entender preguntas: la IA nunca guarda nada.',
  ],
  ifWrong: [
    'Si prefieres revisar siempre antes de guardar, desmarca «Hacerlo directamente, sin tarjeta» en Configuración → «Pepa».',
    'Si se guardó algo que no querías, corrígelo o bórralo desde su pantalla (Calendario, Compras…).',
    'Si esperabas ver la tarjeta y no salió, es lo normal con «sin tarjeta» activado; si salió una tarjeta y no esperabas, mira si trae un aviso o una elección pendiente.',
  ],
  verified: '2026-10-25',
  basedOn: ['src/services/pepaPreferences.ts', 'src/pepa/autoConfirm.ts', 'src/ui/ActionConfirmSheet.tsx', 'src/ui/PepaPreferencesCard.tsx'],
  tour: 'tut-pepa-sin-tarjeta',
  go: { path: '/menu-organizar', dest: 'config.pepa' },
  labels: ['Hacerlo directamente, sin tarjeta', 'Cancelar'],
  cardIds: ['pepa-sin-tarjeta', 'pepa-apuntar', 'pepa-hablar'],
}

export const EXPLAINERS_PEPA: HelpExplainer[] = [expPepaTarjetaODirecto]
