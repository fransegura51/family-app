import { describe, expect, it } from 'vitest'

// CORRECCIÓN REAL (incidencia 1, reportada tras comprobar la versión desplegada en Safari de iPhone): la
// imagen de la tarjeta "Recibido" se veía solo como una franja horizontal arriba, el resto en blanco — las
// otras 3 se veían bien. Las 4 imágenes son JPEG íntegros de 1254×1254 sin diferencias de EXIF/orientación
// entre ellas (comprobado leyendo los bytes de los 4 ficheros), así que no es un fichero corrupto.
//
// Causa real encontrada por comparación con el patrón que SÍ funciona en la app (.pg-access-card/
// .pg-access-card-img, el hub de Pequeños Grandes — nunca reportado roto): el <img> de las 4 tarjetas
// llevaba su propio `aspect-ratio` (style inline), como hijo directo de un <button> sin ningún tamaño
// propio — un ciclo de dependencia (el alto del botón depende del img, el alto "usado" del img depende de
// su aspect-ratio × el ancho que le da el botón) que WebKit, bajo descarga de red real, puede resolver mal
// en el primer pintado y no recalcular después — el navegador de desarrollo (Chromium) no reproduce el
// fallo, de ahí la diferencia entre "funciona en dev" y "roto en Safari real". El patrón que sí funciona
// pone el aspect-ratio en el CONTENEDOR (tamaño fijo, no depende del contenido) y el <img> solo rellena ese
// tamaño ya decidido — se aplica igual aquí, para las 4 tarjetas por igual (nunca solo para "Recibido").
//
// No se comprueba el contenido de styles.css aquí: Vite deja en blanco los imports de .css (incluso con
// "?raw") en el entorno de test, y este proyecto no tiene las utilidades de Node ("fs") que haría falta
// para leer el fichero del disco directamente (mismo límite ya documentado en
// calendarTimeGridOverflowUi.test.ts/educacionFinancieraObjetivoRedisenoUi.test.ts) — el CSS
// (aspect-ratio/overflow en el contenedor, width/height/object-fit en el <img>) se verifica en vivo en el
// navegador, ya confirmado en las 4 tarjetas durante esta sesión.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

describe('Las 4 tarjetas (Recibido/Ahorro/Para gastar/Impuestos) — mismo tamaño fijo en el contenedor, nunca aspect-ratio en el <img> suelto', () => {
  it('el <img> ya no lleva su propio aspect-ratio (ni inline ni clase que lo ponga en el propio <img>)', () => {
    expect(FS).not.toMatch(/<img[^>]*style=\{\{\s*aspectRatio/)
    expect(FS).toContain('<img src={t.img} alt={t.label} />')
  })
  it('las 4 tarjetas comparten el mismo botón/clase — nunca una corrección especial solo para Recibido', () => {
    const occurrences = FS.split('className="wallet-type-card-tap"').length - 1
    expect(occurrences).toBe(1) // una sola declaración, reutilizada por WALLET_TABS.map para las 4
    expect(FS).toContain('{WALLET_TABS.map((t) => {')
  })
})
