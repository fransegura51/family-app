// Wrapper fino sobre la Contact Picker API del navegador — deja elegir
// contactos ya guardados en el teléfono y traerlos a la app con un
// toque, en vez de tener que escribirlos a mano uno a uno. Solo
// disponible en Chrome/Edge para Android (no en iPhone ni en
// ordenador): no hace falta ningún permiso previo ni servicio de
// pago, cada llamada abre el selector nativo del propio teléfono y el
// usuario decide qué contactos comparte, uno a uno.

interface ContactInfo {
  name?: string[]
  tel?: string[]
  email?: string[]
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactInfo[]>
}

declare global {
  interface Navigator {
    contacts?: ContactsManager
  }
}

export function isContactPickerSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.contacts && 'ContactsManager' in window
}

export interface PickedContact {
  name: string
  phone: string | null
  email: string | null
}

export async function pickContacts(): Promise<PickedContact[]> {
  if (!navigator.contacts) {
    throw new Error('Este navegador no permite importar contactos del teléfono (funciona en Chrome para Android).')
  }
  const results = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true })
  return results.map((r) => ({
    name: r.name?.[0] ?? '',
    phone: r.tel?.[0] ?? null,
    email: r.email?.[0] ?? null,
  }))
}
