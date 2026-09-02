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

// Algunas versiones/implementaciones devuelven cada propiedad como
// array (lo normal, según la especificación) pero por si acaso alguna
// devolviera el valor suelto, esto acepta las dos formas en vez de
// fallar en silencio con un contacto vacío.
function firstValue(v: string[] | string | undefined | null): string | null {
  if (!v) return null
  if (Array.isArray(v)) return v[0]?.trim() || null
  return v.trim() || null
}

export async function pickContacts(): Promise<PickedContact[]> {
  if (!navigator.contacts) {
    throw new Error('Este navegador no permite importar contactos del teléfono (funciona en Chrome para Android).')
  }
  const results = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true })
  return results.map((r) => ({
    name: firstValue(r.name) ?? '',
    phone: firstValue(r.tel),
    email: firstValue(r.email),
  }))
}
