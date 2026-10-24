// @vitest-environment jsdom
// Documentos (24/10/2026): elegir quién puede ver cada documento. El servidor lo hace cumplir (migración 0317, probada en la base real con una transacción que se deshace);
// aquí, la elección en pantalla y lo que se manda a guardar.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { FamilyMember } from '@/domain/types'
import { DocumentVisibilityPicker, FAMILY_AUDIENCE, audienceToIds, describeAudience, idsToAudience, type DocumentAudience } from '@/ui/DocumentVisibilityPicker'
import documentsData from '@/data/documents.ts?raw'
import documentsScreen from '@/ui/DocumentsScreen.tsx?raw'

afterEach(cleanup)

const members = [
  { id: 'paco', name: 'Paco' },
  { id: 'jenni', name: 'Jennifer' },
  { id: 'eric', name: 'Eric' },
] as unknown as FamilyMember[]

describe('quién puede ver el documento', () => {
  it('traduce la elección a lo que se guarda: familia = null, solo yo = [], personas = esa lista', () => {
    expect(audienceToIds(FAMILY_AUDIENCE)).toBeNull()
    expect(audienceToIds({ mode: 'me' })).toEqual([])
    expect(audienceToIds({ mode: 'some', ids: ['paco'] })).toEqual(['paco'])
    expect(idsToAudience(null)).toEqual({ mode: 'family' })
    expect(idsToAudience([])).toEqual({ mode: 'me' })
    expect(idsToAudience(['paco', 'eric'])).toEqual({ mode: 'some', ids: ['paco', 'eric'] })
  })

  it('describe el candado con los nombres, y nada si lo ve toda la familia', () => {
    expect(describeAudience(null, members)).toBeNull()
    expect(describeAudience([], members)).toBe('🔒 Solo quien lo subió')
    expect(describeAudience(['paco', 'jenni'], members)).toBe('🔒 Lo ven: Paco, Jennifer y quien lo subió')
  })

  it('en pantalla se elige toda la familia / solo yo / personas concretas', () => {
    const seen: DocumentAudience[] = []
    function Harness() {
      const [value, setValue] = useState<DocumentAudience>(FAMILY_AUDIENCE)
      return (
        <DocumentVisibilityPicker
          members={members}
          value={value}
          onChange={(next) => {
            seen.push(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Harness />)
    expect((screen.getByLabelText('Toda la familia') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText('Paco')).toBeNull() // la lista de personas solo sale al elegir «Elegir personas»

    fireEvent.click(screen.getByLabelText('Solo yo'))
    expect(seen.at(-1)).toEqual({ mode: 'me' })

    fireEvent.click(screen.getByLabelText('Elegir personas'))
    fireEvent.click(screen.getByLabelText('Paco'))
    fireEvent.click(screen.getByLabelText('Jennifer'))
    expect(seen.at(-1)).toEqual({ mode: 'some', ids: ['paco', 'jenni'] })
    fireEvent.click(screen.getByLabelText('Paco'))
    expect(seen.at(-1)).toEqual({ mode: 'some', ids: ['jenni'] })
    expect(screen.queryByLabelText('Eric')).toBeTruthy() // Eric sigue en la lista sin marcar: no lo ve
    expect((screen.getByLabelText('Eric') as HTMLInputElement).checked).toBe(false)
  })
})

describe('Documentos: lo que se manda al guardar', () => {
  it('el formulario de subida lleva el selector y manda la elección; la fila muestra el candado y solo deja editar o borrar a quien lo subió', () => {
    expect(documentsScreen).toContain('<DocumentVisibilityPicker members={members} value={audience} onChange={setAudience} />')
    expect(documentsScreen).toContain('visibleToMemberIds: audienceToIds(audience)')
    expect(documentsScreen).toContain('const canManage = doc.visibleToMemberIds === null || doc.isMine')
    expect(documentsScreen).toContain('{canManage && (')
  })

  it('el documento se guarda con su lista de visibilidad y el aviso de vencimiento de uno restringido es privado (no enseña el título a la familia)', () => {
    expect(documentsData).toContain('visible_to_member_ids: input.visibleToMemberIds ?? null')
    expect(documentsData).toContain("visibility: input.restricted ? ('private' as const) : ('shared' as const)")
    expect(documentsData).toContain('restricted: !!input.visibleToMemberIds')
  })
})

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
