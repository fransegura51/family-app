import { describe, expect, it } from 'vitest'
import { HELP_CARDS, HELP_MODULES } from '@/help/catalog'
import { TOURS } from '@/help/tours/registry'
import { SERIES } from '@/help/tours/series'

// REGLA DEL PROYECTO (petición del 24/10/2026): toda función y toda sección de PEPA lleva su recorrido guiado. «Hablar con PEPA» lo arranca con «necesito ayuda con…»
// (help/talkHelp.ts) y la sección «Enséñame» de la Ayuda lo ofrece, así que hace falta una ficha de Ayuda por función, un recorrido por ficha (`cardId`) y una visita
// «Conoce…» por sección.
//
// Si esta prueba falla porque has añadido una función o una sección nueva: crea su ficha (src/help/catalog/cards*.ts), su recorrido (src/help/tours/defs, registrado en
// src/help/tours/registry.ts) con `cardId` apuntando a la ficha, y marca los controles con `data-help-id`. NO la arregles con una lista de excepciones.

// RECORRIDOS-01 (revisada al organizar los tutoriales en series con capítulos): una ficha está cubierta si algún capítulo la tiene como ficha, si es la `tour` de la ficha, o si la lista una serie
// (`cardIds`). Un mismo capítulo o serie puede cubrir varias fichas.
const coveredBy = (cardId: string, cardTour: string | undefined) => TOURS.some((t) => t.cardId === cardId || t.id === cardTour) || SERIES.some((s) => s.cardIds?.includes(cardId))

describe('cobertura de recorridos: todo lo que PEPA hace se puede aprender en pantalla', () => {
  it('cada ficha de una función que existe (disponible o parcial) tiene su recorrido', () => {
    const missing = HELP_CARDS.filter((c) => c.state !== 'desactivada' && !coveredBy(c.id, c.tour)).map((c) => c.id)
    expect(missing, `Fichas sin recorrido: ${missing.join(', ')}`).toEqual([])
  })

  it('cada sección de la Ayuda que tiene fichas tiene su visita «Conoce esta sección»', () => {
    const modulesWithCards = new Set(HELP_CARDS.filter((c) => c.state !== 'desactivada').map((c) => c.module))
    const missing = HELP_MODULES.filter((m) => modulesWithCards.has(m.id) && !TOURS.some((t) => t.kind === 'visit' && t.module === m.id)).map((m) => m.id)
    expect(missing, `Secciones sin visita guiada: ${missing.join(', ')}`).toEqual([])
  })

  it('Pepa puede arrancar el recorrido de cada sección por voz («necesito ayuda con…»): toda visita tiene módulo y su ficha existe', () => {
    for (const t of TOURS.filter((x) => x.kind === 'visit')) {
      expect(t.module, t.id).toBeTruthy()
      expect(HELP_CARDS.some((c) => c.id === t.cardId), `${t.id}: su ficha ${t.cardId} no existe`).toBe(true)
    }
  })
})
