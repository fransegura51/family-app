import { describe, expect, it } from 'vitest'
import { classifyFoodType } from '@/domain/foodTypes'

function key(name: string): string {
  return classifyFoodType(name).key
}

describe('classifyFoodType', () => {
  it('carne', () => {
    expect(key('SOLOMILLO CERDO')).toBe('carne')
    expect(key('BURGER M VA/CE 1000G')).toBe('carne')
    expect(key('SALCHICHA BRATWURST')).toBe('carne')
    expect(key('ROTI DE POLLO')).toBe('carne')
  })

  it('pescado', () => {
    expect(key('FILETE MERLUZA CABO')).toBe('pescado')
    expect(key('GAMBA BLANCA MEDIANA')).toBe('pescado')
    expect(key('PULPO')).toBe('pescado')
  })

  it('fruta', () => {
    expect(key('MANZANA GRANNY')).toBe('fruta')
    expect(key('SANDÍA PARTIDA B/S')).toBe('fruta')
  })

  it('verdura, sin confundir "patata" con "patatas fritas"', () => {
    expect(key('PATATA 5 KG')).toBe('verdura')
    expect(key('CALABACIN VERDE')).toBe('verdura')
    expect(key('PEPINO')).toBe('verdura')
    expect(key('PATATAS LAYS SAL/')).toBe('snacks')
  })

  it('lácteos', () => {
    expect(key('QUESO GOUDA LONCHAS')).toBe('lacteos')
    expect(key('24 HUEVOS FRESCOS')).toBe('huevos')
  })

  it('panadería, sin confundir "panceta" con "pan"', () => {
    expect(key('PAN DE PUEBLO')).toBe('panaderia')
    expect(key('BIZCOCHO NUEZ')).toBe('panaderia')
    expect(key('PANCETA IBÉRICA')).toBe('carne')
  })

  // COM-03 — "Bebidas" genérica eliminada: se distingue alcohólicas de no alcohólicas por palabra
  // clave, con "sin alcohol" gestionado aparte (nunca se asume alcohol en ese caso).
  describe('bebidas no alcohólicas', () => {
    it('agua, refrescos, zumos, café, té, isotónicas y energéticas', () => {
      expect(key('AGUA MINERAL 1,5L')).toBe('bebidas_no_alcoholicas')
      expect(key('COCA-COLA ZERO 2L')).toBe('bebidas_no_alcoholicas')
      expect(key('ZUMO NARANJA 1L')).toBe('bebidas_no_alcoholicas')
      expect(key('CAFE SOLUBLE NESCAFE')).toBe('bebidas_no_alcoholicas')
      expect(key('TE ROJO HORNIMANS')).toBe('bebidas_no_alcoholicas')
      expect(key('AQUARIUS ISOTONICA LIMON')).toBe('bebidas_no_alcoholicas')
      expect(key('MONSTER ENERGETICA')).toBe('bebidas_no_alcoholicas')
    })

    it('refresco de sabor a fruta: "Naranja Zero" no cae en Fruta solo por llevar "naranja"', () => {
      expect(key('NARANJA ZERO')).toBe('bebidas_no_alcoholicas')
      expect(key('REFRES COCA-COLA')).toBe('bebidas_no_alcoholicas')
    })

    it('mosto: es zumo de uva SIN fermentar, nunca vino — no es alcohólico', () => {
      expect(key('MOSTO DON SIMON')).toBe('bebidas_no_alcoholicas')
    })

    it('cerveza/vino/sidra SIN alcohol: el fabricante lo dice explícitamente, nunca se asume alcohol', () => {
      expect(key('CERVEZA SIN ALCOHOL MAHOU')).toBe('bebidas_no_alcoholicas')
      expect(key('VINO SIN ALCOHOL 0,0')).toBe('bebidas_no_alcoholicas')
      expect(key('SIDRA SIN ALCOHOL EL GAITERO')).toBe('bebidas_no_alcoholicas')
    })
  })

  describe('bebidas alcohólicas', () => {
    it('cerveza, vino, sidra, licores y destilados', () => {
      expect(key('CERVEZA ESTRELLA')).toBe('bebidas_alcoholicas')
      expect(key('VINO TINTO CRIANZA')).toBe('bebidas_alcoholicas')
      expect(key('SIDRA EL GAITERO')).toBe('bebidas_alcoholicas')
      expect(key('CAVA FREIXENET')).toBe('bebidas_alcoholicas')
      expect(key('LICOR 43')).toBe('bebidas_alcoholicas')
      expect(key('GINEBRA BEEFEATER')).toBe('bebidas_alcoholicas')
      expect(key('RON BRUGAL')).toBe('bebidas_alcoholicas')
      expect(key('WHISKY JB')).toBe('bebidas_alcoholicas')
    })
  })

  it('producto ambiguo sin ninguna palabra de alcohol ni de bebida: no cae en ninguna de las dos, nunca una clasificación inventada', () => {
    expect(key('MARCA DESCONOCIDA XYZ 123')).toBe('otros')
  })

  it('congelados', () => {
    expect(key('HELADO CAPUCCINO')).toBe('congelados')
  })

  it('despensa', () => {
    expect(key('ACEITE VIRGEN EX')).toBe('despensa')
    expect(key('ARROZ FALLERA')).toBe('despensa')
  })

  it('sin coincidencia cae en Otros alimentos', () => {
    expect(key('COSA RARA XYZ')).toBe('otros')
  })
})

describe('pescado y marisco (reportado: «en tipos de comida no sale pescado»)', () => {
  it.each(['FILETE LUBINA', 'ALMEJAS', 'CHIPIRONES', 'BONITO DEL NORTE', 'ANCHOAS', 'CABALLA', 'PESCADILLA', 'MEJILLONES'])('%s → pescado', (name) => {
    expect(classifyFoodType(name).key).toBe('pescado')
  })
})
