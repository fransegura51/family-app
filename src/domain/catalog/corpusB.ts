// CORPUS B («ciego»): redactado DESPUÉS del catálogo pero SIN mirar sus alias, imitando el ruido de los tickets (abreviaturas, formato pegado, marcas, orden raro).
// La primera pasada de este corpus (antes de ajustar nada) está anotada en docs/EVALUACION_NORMALIZACION.md como resultado «sin ajustar»; después de corregir
// huecos del catálogo ya no es ciego. Sigue sin ser un conjunto de tickets reales. Mismo formato que corpus.ts.
import type { CorpusCase } from './corpus'

const RAW = `
HELADO MINI MAGNUM => ~cong.helado
PAN BARRA CRISTAL => pan.barra
YOGUR LIQ FRESA => lac.yogur.bebible
ZUMO MULTIFRUTAS 1L => bna.zumo; pack=1x1 l
QUESO LONCHAS EMMENTAL => lac.queso.lonchas
MACARRON INTEGRAL => desp.pasta.macarron; integral=integral
TOMATE TRITURADO 800G => desp.tomate.triturado; pack=1x800 g
ARROZ LARGO 1KG => desp.arroz; pack=1x1 kg
PATATAS ONDULADAS => snk.patatas.fritas
AGUA S/GAS 8L => bna.agua; gas=singas; pack=1x8 l
CERV MAHOU 5 ESTRELLAS => bal.cerveza
SALCHICHAS PAVO => carne.salchicha
LECHE S/LACT ENT => lac.leche; tipoLeche=entera; lactosa=sin
ESPINACAS CONG 500G => cong.congelado; pack=1x500 g
PIZZA PEPPERONI => pre.pizza
AZUCAR MORENO => desp.azucar.moreno
ENSALADA ATUN => ~pre.ensalada
BOLSA BASURA 30L => limp.bolsa.basura
GEL BAÑO 1L => cui.gel.ducha; pack=1x1 l
CHAMPU ANTICASPA => cui.champu
COMPRESAS NOCHE => cui.compresa
SERVILLETAS 100 => limp.servilleta
PIENSO GATO ADULTO => masc.pienso; especie=gato; edad=adulto
DETERGENTE LIQ COLOR => limp.detergente.liquido
FREGASUELOS PINO => limp.suelos
PAPEL HIG 4 CAPAS 12R => limp.papel.higienico
PAÑAL RN => beb.panal; talla=0
SPAGHETTI N5 => desp.pasta.espagueti
ALMENDRAS TOSTADAS => desp.fruto.seco.almendra
SALMON AHUMADO 100G => pes.salmon.ahumado; pack=1x100 g
LECHE SEMI 6X1L => lac.leche; tipoLeche=semi; pack=6x1 l
MOZZARELLA 125G => lac.queso.mozzarella; pack=1x125 g
CROISSANT MANTEQUILLA 4U => pan.croissant; pack=4x1 ud
BANANA 1KG => fruta.platano; pack=1x1 kg
TOMATES CHERRY => verd.tomate
CEBOLLA MORADA => verd.cebolla
AGUACATE 2 UD => fruta.aguacate
PEPINILLOS => desp.pepinillo
HARINA REPOSTERIA => desp.harina
COLA ZERO 2L => bna.refresco.cola; azucar=zero; pack=1x2 l
CERVEZA RADLER LIMON => bal.cerveza
VINO TINTO CRIANZA => bal.vino
CAFE MOLIDO NATURAL 250G => desp.cafe.molido; pack=1x250 g
CAPSULAS CAFE => desp.cafe.capsulas
GALLETAS CHOCOLATE => pan.galleta.chocolate
YOGUR GRIEGO NATURAL => lac.yogur.griego
SKYR => lac.yogur.proteina
SANDWICH JAMON QUESO => pre.sandwich
BOLLOS SUIZOS => ~pan.bolleria
DETERGENTE ROPA POLVO => limp.detergente.polvo
SUAVIZANTE CONCENTRADO => limp.suavizante
LAVAVAJILLAS TODO EN 1 => limp.lavavajillas.pastilla
LEJIA 2L => limp.lejia; pack=1x2 l
ESTROPAJO FIBRA => limp.estropajo
DESODORANTE ROLL ON => cui.desodorante
GEL DUCHA HIDRATANTE => cui.gel.ducha
PASTA DENTIFRICA => cui.dentifrico
CEPILLO DENTAL => cui.cepillo.dientes
DISCOS ALGODON => cui.algodon
TOALLITAS BEBE => beb.toallita
PAÑALES DODOT T3 => beb.panal; talla=3
LECHE INFANTIL CRECIMIENTO => inf.leche.formula; etapa=3
LECHE CONTINUACION 2 => inf.leche.formula; etapa=2
POTITO VERDURAS => inf.potito
PAPILLA MULTICEREALES => inf.cereales
GALLETAS BEBE 8M => pan.galleta.infantil
AGUA BEBE => bna.agua.bebe
PIENSO PERRO CACHORRO => masc.pienso; especie=perro; edad=cachorro
ARENA GATOS 10KG => masc.arena
SNACK PERRO => masc.snack.perro
LATA GATO ATUN => masc.comida.humeda; especie=gato
PILAS ALCALINAS AA => hogar.pila
BOMBILLA LED E27 => hogar.bombilla
CUADERNO A4 => pap.cuaderno
BOLIGRAFOS 10 UDS => pap.boligrafo
CELO => pap.cinta
MOCHILA ESCOLAR => pap.estuche
JUGUETE PELUCHE => jug.juguete
POLLO => carne.pollo
PECHUGA PAVO => carne.pavo
JAMON YORK 200G => emb.jamon.cocido; pack=1x200 g
LOMO EMBUCHADO => emb.lomo.embuchado
FUET => emb.fuet
TERNERA FILETES => carne.ternera
HAMBURGUESA POLLO => carne.hamburguesa
CARNE PICADA VACUNO => carne.cerdo.picada
MERLUZA FILETES CONGELADA => cong.congelado
BACALAO => pes.bacalao
LUBINA => pes.lubina
GAMBON PELADO => pes.gambon
LANGOSTINOS => pes.langostino
CALAMARES ROMANA => pre.calamar.romana
ATUN CLARO NATURAL => desp.atun.lata
MEJILLONES NATURAL => desp.mejillon.lata
BERBERECHOS => pes.berberecho
ANCHOAS => desp.anchoa
PIMIENTOS PIQUILLO => desp.pimiento.lata
MAIZ DULCE LATA => desp.maiz.lata
ACEITUNAS RELLENAS => desp.aceituna
TOMATE FRITO 400G => desp.tomate.frito; pack=1x400 g
MAYONESA 450ML => desp.mayonesa; pack=1x450 ml
KETCHUP => desp.ketchup
SOJA SALSA => desp.salsa.soja
CALDO VERDURAS => desp.caldo
LENTEJAS PARDINAS => desp.lenteja
GARBANZOS => desp.garbanzo
ALUBIAS BLANCAS => desp.alubia
PASTA FIDEOS => desp.pasta.fideo
ESPAGUETIS INTEGRALES => desp.pasta.espagueti; integral=integral
ARROZ BASMATI 1KG => desp.arroz.basmati; pack=1x1 kg
COPOS AVENA => desp.avena
MUESLI => desp.cereales.desayuno
MERMELADA MELOCOTON => desp.mermelada
MIEL MILFLORES => desp.miel
CACAO EN POLVO => desp.cacao.polvo
CHOCOLATE LECHE => snk.chocolate
BOMBONES => snk.bombon
CHICLES => snk.chicle
PIPAS GIRASOL => desp.fruto.seco.pipas
CACAHUETES => desp.fruto.seco.cacahuete
HUMMUS CLASICO => desp.hummus
GUACAMOLE => desp.guacamole
TORTILLAS TRIGO FAJITAS => pan.tortilla.trigo
PAN HAMBURGUESA 4U => pan.hamburguesa
PAN PERRITOS => pan.perrito
BASE PIZZA => pan.base.pizza
MASA HOJALDRE => pan.hojaldre
MAGDALENAS 12 UD => pan.magdalena; pack=12x1 ud
BIZCOCHO => pan.bizcocho
DONUTS => pan.donut
NAPOLITANA CHOCOLATE => pan.napolitana
GALLETAS RELLENAS => pan.galleta.rellena
BARRITAS CEREALES => pan.barrita.cereales
TORTITAS ARROZ => pan.tortita.arroz
PALOMITAS MICROONDAS => snk.palomitas
NACHOS QUESO => snk.nachos
GANCHITOS => snk.ganchitos
AGUA CON GAS 1L => bna.agua; gas=congas; pack=1x1 l
TONICA ZERO => bna.tonica; azucar=zero
NESTEA LIMON => bna.te.frio
AQUARIUS NARANJA => bna.isotonica
MONSTER => bna.energetica
ZUMO PIÑA => bna.zumo
GASEOSA => bna.gaseosa
HORCHATA => bna.horchata
CERVEZA SIN 0,0 => bna.cerveza.sin
SIDRA NATURAL => bal.sidra
VERMUT => bal.vermut
GINEBRA => bal.ginebra
RON => bal.ron
CAVA => bal.cava
TINTO VERANO => bal.tinto.verano
HELADO VAINILLA TARRINA => cong.helado.tarrina
HIELO => cong.hielo
PIZZA 4 QUESOS => pre.pizza
CROQUETAS POLLO => pre.croqueta
NUGGETS => pre.nugget
EMPANADILLAS ATUN => pre.empanadilla
LASAÑA BOLOÑESA => pre.lasana
SUSHI MIX => pre.sushi
TORTILLA ESPAÑOLA => pre.tortilla.patata
ENSALADILLA => pre.ensaladilla
SAN JACOBO => pre.sanjacobo
QUESADILLA => pre.quesadilla
GAZPACHO => pre.gazpacho
HUEVOS CAMPEROS XL => hue.docena
CREMA DE CALABACIN => ~desp.crema.otras
PATATAS FRITAS CONGELADAS => cong.congelado
NARANJA ZERO => bna.refresco; azucar=zero
POLLO ASADO => carne.pollo.asado
PIZZA JAMON Y QUESO => pre.pizza
LECHE DE COCO => lac.bebida.coco
CHOCOLATE CON LECHE => snk.chocolate
ACEITE DE OLIVA SUAVE 1L => desp.aceite.oliva; pack=1x1 l
ZUMO DE TOMATE => bna.zumo
SALSA DE TOMATE => ~desp.salsa
ARROZ CON LECHE => lac.arroz.leche
OFERTA 3X2 => -
DESCUENTO CUPON => -
BOLSA PLASTICO => -
TARJETA REGALO => -
REDONDEO => -
PARKING => -
`

function parse(): CorpusCase[] {
  return RAW.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [text, rest] = line.split('=>').map((x) => x.trim())
      const [key, ...extras] = rest.split(';').map((x) => x.trim())
      const attrs: Record<string, string> = {}
      let pack: string | null = null
      for (const e of extras) {
        const [k, v] = e.split('=').map((x) => x.trim())
        if (k === 'pack') pack = v
        else attrs[k] = v
      }
      return { text, key, attrs, pack }
    })
}

export const CORPUS_B: readonly CorpusCase[] = parse()
