// Guía para que los avisos (y la ubicación) sigan funcionando con la app NATIVA cerrada o con el móvil bloqueado. Muchos fabricantes de Android
// (Xiaomi, Samsung, Huawei, Oppo…) cierran las apps en segundo plano para ahorrar batería y, sin tocar un ajuste suyo, el aviso llega a Google pero el
// móvil no lo enseña (caso real, 13/10/2026: Xiaomi 22101316G; arreglado con «Autoinicio en segundo plano» + batería «Sin restricciones»).
//
// La marca NO viene en el navegador interno de la app: solo el código de modelo («Android 14; 22101316G»). Se adivina por ese código y, si no se
// reconoce, se enseñan todas las marcas con la más probable primero; nunca se afirma una marca que no se sabe.

export type PhoneBrand = 'xiaomi' | 'samsung' | 'huawei' | 'oppo' | 'google' | 'other'

export interface BrandGuide {
  brand: PhoneBrand
  name: string
  steps: string[]
}

const GUIDES: BrandGuide[] = [
  {
    brand: 'xiaomi',
    name: 'Xiaomi, Redmi o POCO',
    steps: [
      'Ajustes → Aplicaciones. Arriba toca «Autoinicio en segundo plano» y activa PEPA.',
      'Ajustes → Aplicaciones → Gestionar aplicaciones → PEPA → Ahorro de batería → «Sin restricciones».',
      'En apps recientes, mantén pulsada la tarjeta de PEPA y toca el candado, para que el móvil no la limpie.',
    ],
  },
  {
    brand: 'samsung',
    name: 'Samsung',
    steps: [
      'Ajustes → Aplicaciones → PEPA → Batería → «Sin restricciones».',
      'Ajustes → Cuidado del dispositivo → Batería → Límites de uso en segundo plano. Quita PEPA de «Aplicaciones en suspensión» y desactiva «Poner en suspensión las apps sin usar».',
    ],
  },
  {
    brand: 'huawei',
    name: 'Huawei u Honor',
    steps: [
      'Ajustes → Aplicaciones → Inicio de aplicaciones → PEPA. Elige «Gestionar manualmente» y activa los tres interruptores (inicio automático, inicio secundario y ejecutar en segundo plano).',
    ],
  },
  {
    brand: 'oppo',
    name: 'Oppo, Realme u OnePlus',
    steps: [
      'Ajustes → Aplicaciones → PEPA → Uso de batería → permite la actividad en segundo plano.',
      'En esa misma pantalla de PEPA, permite el «Inicio automático».',
    ],
  },
  {
    brand: 'google',
    name: 'Google Pixel y otros Android',
    steps: ['Ajustes → Aplicaciones → PEPA → Batería → «Sin restricciones».'],
  },
]

// «Android 14; 22101316G Build/…» → «22101316G». Vacío si no se encuentra.
export function modelFromUserAgent(userAgent: string): string {
  const match = /Android [\d.]+;\s*([^;)]+?)(?:\s+Build\/|\)|;)/i.exec(userAgent)
  return match ? match[1].trim() : ''
}

export function detectBrand(userAgent: string): PhoneBrand {
  if (/xiaomi|redmi|poco|miui|hyperos/i.test(userAgent)) return 'xiaomi'
  const model = modelFromUserAgent(userAgent)
  // Los códigos de modelo de Xiaomi/Redmi/POCO: 22101316G, 2201117TG, M2101K7AG, 23076PC4BI…
  if (/^(?:\d{6,8}[A-Z0-9]{0,3}|M\d{4}[A-Z0-9]{3,6})$/.test(model)) return 'xiaomi'
  if (/^SM-|samsung/i.test(model) || /samsung/i.test(userAgent)) return 'samsung'
  if (/huawei|honor|^[A-Z]{3}-[A-Z]{1,2}\d{1,3}[A-Z]?$/i.test(model) || /huawei|honor/i.test(userAgent)) return 'huawei'
  if (/^(?:CPH|RMX|PH[A-Z])\d{3,4}/.test(model) || /oppo|realme|oneplus/i.test(userAgent)) return 'oppo'
  if (/^Pixel/i.test(model)) return 'google'
  return 'other'
}

// Todas las guías, con la de esta marca primero (si se ha reconocido).
export function orderedGuides(brand: PhoneBrand): BrandGuide[] {
  const first = GUIDES.filter((g) => g.brand === brand)
  return [...first, ...GUIDES.filter((g) => g.brand !== brand)]
}
