// ATRIBUTOS que distinguen productos que NO son equivalentes aunque se llamen casi igual: tipo de leche, talla de pañal, etapa de la leche infantil,
// «sin lactosa», «sin alcohol», «zero»... Un producto del catálogo declara cuáles le afectan (y cuáles son obligatorios: sin ellos la identidad
// queda incompleta y NO se agrupa sola). Lo que no es un atributo conocido (un sabor, un relleno) NO se ignora: queda como «resto» del nombre y
// también impide dar por equivalentes dos productos (ver identify.ts).
import { tokensOf } from './tokens'

export interface AttrValueSpec {
  value: string
  /** Cómo se escribe en el nombre normalizado del producto («semidesnatada», «sin lactosa»). '' = no se escribe. */
  label: string
  /** Frases (ya troceadas en palabras normalizadas) que lo indican; basta con que aparezcan TODAS las palabras de una frase. */
  phrases: string[][]
}

export interface AttrDef {
  id: string
  values: AttrValueSpec[]
  /** Valor que se da por bueno cuando no aparece nada (p. ej. «con lactosa»): no cuenta como dato que falta. */
  defaultValue?: string
  /** Atributo numérico (talla, etapa): se lee del texto con una expresión; `bareDigit` admite además un dígito suelto (confianza baja). */
  numeric?: { re: RegExp; label: (v: string) => string; bareDigit?: boolean }
}

function spec(value: string, label: string, ...phrases: string[]): AttrValueSpec {
  return { value, label, phrases: phrases.map(tokensOf) }
}

export const ATTRS: Readonly<Record<string, AttrDef>> = {
  tipoLeche: {
    id: 'tipoLeche',
    values: [spec('semi', 'semidesnatada', 'semidesnatada'), spec('desnatada', 'desnatada', 'desnatada'), spec('entera', 'entera', 'entera')],
  },
  lactosa: { id: 'lactosa', defaultValue: 'con', values: [spec('sin', 'sin lactosa', 'sin lactosa')] },
  gluten: { id: 'gluten', defaultValue: 'con', values: [spec('sin', 'sin gluten', 'sin gluten')] },
  azucar: {
    id: 'azucar',
    defaultValue: 'normal',
    values: [spec('zero', 'zero', 'zero', 'cero', '0 azucar'), spec('sinazucar', 'sin azúcar', 'sin azucar', 'sin azucares anadidos'), spec('light', 'light', 'light', 'ligero')],
  },
  alcohol: { id: 'alcohol', defaultValue: 'con', values: [spec('sin', 'sin alcohol', 'sin alcohol', '0 0', '00', 'cero cero', '0 alcohol')] },
  bio: { id: 'bio', defaultValue: 'no', values: [spec('bio', 'ecológico', 'bio', 'eco', 'ecologico', 'organico')] },
  integral: { id: 'integral', defaultValue: 'no', values: [spec('integral', 'integral', 'integral')] },
  gas: { id: 'gas', values: [spec('singas', 'sin gas', 'sin gas'), spec('congas', 'con gas', 'con gas', 'gas')], defaultValue: 'singas' },
  tipoPanal: { id: 'tipoPanal', defaultValue: 'panal', values: [spec('braguita', 'braguita', 'braguita', 'pant', 'pants', 'pull ups', 'pantalon', 'bragapanal')] },
  talla: {
    id: 'talla',
    values: [spec('0', 'recién nacido', 'recien nacido', 'newborn', 'rn')],
    numeric: { re: /\b(?:talla|tll|tl|t)\s?-?\s?(\d{1,2})\b/, label: (v) => `talla ${v}` },
  },
  etapa: {
    id: 'etapa',
    values: [spec('1', 'etapa 1', 'inicio'), spec('2', 'etapa 2', 'continuacion'), spec('3', 'etapa 3', 'crecimiento')],
    numeric: { re: /\b(?:etapa|et|stage|step|tipo)\s?-?\s?([1-4])\b/, label: (v) => `etapa ${v}`, bareDigit: true },
  },
  especie: {
    id: 'especie',
    values: [spec('perro', 'perro', 'perro', 'canino'), spec('gato', 'gato', 'gato', 'felino'), spec('ave', 'aves', 'ave', 'pajaro', 'canario'), spec('pez', 'peces', 'pez', 'acuario')],
  },
  edad: {
    id: 'edad',
    values: [spec('cachorro', 'cachorro', 'cachorro', 'puppy', 'junior', 'gatito', 'kitten'), spec('senior', 'senior', 'senior', 'mayor'), spec('adulto', 'adulto', 'adulto', 'adult')],
  },
}
