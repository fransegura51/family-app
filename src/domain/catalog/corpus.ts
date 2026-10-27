// CORPUS DE EVALUACIÓN del normalizador: líneas de ticket tal como se escriben en los supermercados españoles (mayúsculas, abreviaturas, formato pegado al
// nombre), con lo que una persona espera de cada una. Lo he redactado a mano para este catálogo: NO sale de los tickets reales de ninguna familia y no
// sustituye la prueba limpia con una familia real (docs/EVALUACION_NORMALIZACION.md), pero sirve de red de seguridad: si una regla nueva rompe algo, falla aquí.
//
// Formato: texto del ticket => clave esperada [; atributo=valor] [; pack=CxA unidad]
//   · clave `-`      no debe identificarse (nombre ambiguo o fuera del catálogo): ni clase ni agrupación.
//   · clave `~x`     solo clase (entrada de clase `x`): clasifica, no agrupa.
export interface CorpusCase {
  text: string
  key: string
  attrs: Record<string, string>
  pack: string | null
}

const RAW = `
LECHE ENTERA => lac.leche; tipoLeche=entera
LECHE SEMI => lac.leche; tipoLeche=semi
LECHE SEMIDESNATADA PASCUAL 1L => lac.leche; tipoLeche=semi; pack=1x1 l
LECHE DESNATADA => lac.leche; tipoLeche=desnatada
LECHE SEMI P-6 => lac.leche; tipoLeche=semi; pack=6x1 ud
LECHE SIN LACTOSA SEMI => lac.leche; tipoLeche=semi; lactosa=sin
LECHE => lac.leche
LECHE CONDENSADA => lac.leche.condensada
LECHE AVENA => lac.bebida.avena
BEBIDA SOJA => lac.bebida.soja
BEBIDA ALMENDRA => lac.bebida.almendra
NATA COCINAR => lac.nata
YOGUR NATURAL => lac.yogur
YOGUR NATURAL 4X125G => lac.yogur; pack=4x125 g
YOGUR GRIEGO => lac.yogur.griego
YOGUR FRESA => lac.yogur
YOGUR PROTEINAS => lac.yogur.proteina
SKYR NATURAL => lac.yogur.proteina
BATIDO CHOCOLATE => lac.batido
FLAN HUEVO => lac.flan
NATILLAS => lac.natillas
QUESO RALLADO => lac.queso.rallado
QUESO FRESCO => lac.queso.fresco
QUESO TIERNO => lac.queso.tierno
QUESO CURADO => lac.queso.curado
QUESO LONCHAS => lac.queso.lonchas
MOZZARELLA => lac.queso.mozzarella
QUESO CABRA => lac.queso.cabra
QUESO UNTAR => lac.queso.crema
MANTEQUILLA => lac.mantequilla
HUEVOS L => hue.docena
HUEVOS DOCENA => hue.docena; pack=12x1 ud
PAN BARRA => pan.barra
PAN MOLDE => pan.molde
PAN MOLDE INTEGRAL => pan.molde; integral=integral
PAN HAMBURGUESA => pan.hamburguesa
PAN RALLADO => pan.rallado
PICOS => pan.picos
CROISSANT => pan.croissant
MAGDALENAS => pan.magdalena
GALLETAS MARIA => pan.galleta.maria
GALLETAS DIGESTIVE => pan.galleta.digestive
CEREALES DESAYUNO => desp.cereales.desayuno
PATATA 5 KG => verd.patata; pack=1x5 kg
PATATA 3 KG => verd.patata; pack=1x3 kg
PATATAS FRITAS => snk.patatas.fritas
PATATAS FRITAS LAYS => snk.patatas.fritas
TOMATE RAMA => verd.tomate
TOMATE FRITO => desp.tomate.frito
TOMATE TRITURADO => desp.tomate.triturado
CEBOLLA => verd.cebolla
CEBOLLETA => verd.cebolleta
AJO => verd.ajo
ZANAHORIA => verd.zanahoria
PIMIENTO VERDE => verd.pimiento
PIMIENTO ROJO => verd.pimiento
LECHUGA ROMANA => verd.lechuga
CALABACIN => verd.calabacin
PEPINO => verd.pepino
BERENJENA => verd.berenjena
BROCOLI => verd.brocoli
COLIFLOR => verd.coliflor
ESPINACAS => verd.espinaca
CHAMPIÑON LAMINADO => verd.champinon
JUDIA VERDE => verd.judia
ENSALADA 4 ESTACIONES => verd.ensalada
AGUACATE => fruta.aguacate
PLATANO => fruta.platano
BANANA => fruta.platano
MANZANA GOLDEN => fruta.manzana
PERA CONFERENCIA => fruta.pera
NARANJA MESA => fruta.naranja
NARANJAS 2 KG => fruta.naranja; pack=1x2 kg
MANDARINAS => fruta.mandarina
LIMON => fruta.limon
FRESAS => fruta.fresa
MELOCOTON => fruta.melocoton
SANDIA => fruta.sandia
UVA BLANCA => fruta.uva
KIWI => fruta.kiwi
PECHUGA POLLO => carne.pollo.pechuga
FILETE PECHUGA POLLO => carne.pollo.pechuga
MUSLO POLLO => carne.pollo.muslo
POLLO ENTERO => carne.pollo
ALITAS POLLO => carne.pollo.ala
POLLO ASADO => carne.pollo.asado
PAVO TROCEADO => carne.pavo
CARNE PICADA MIXTA => carne.cerdo.picada
LOMO CERDO => carne.cerdo.lomo
CHULETAS CERDO => carne.cerdo.chuleta
COSTILLAS CERDO => carne.cerdo.costilla
TERNERA GUISAR => carne.ternera
HAMBURGUESA TERNERA => carne.hamburguesa
SALCHICHAS FRANKFURT => carne.salchicha
CHORIZO => emb.chorizo
JAMON COCIDO => emb.jamon.cocido
JAMON SERRANO => emb.jamon.serrano
PAVO LONCHAS => emb.pavo.fiambre
BACON LONCHAS => emb.bacon
SOBRASADA => emb.sobrasada
MERLUZA => pes.merluza
SALMON FILETE => pes.salmon
SALMON AHUMADO => pes.salmon.ahumado
DORADA => pes.dorada
GAMBAS COCIDAS => pes.gamba
MEJILLONES => pes.mejillon
CALAMAR LIMPIO => pes.calamar
BACALAO DESALADO => pes.bacalao
ATUN CLARO ACEITE GIRASOL => desp.atun.lata
ATUN CLARO => desp.atun.lata
SARDINAS LATA => desp.sardina.lata
MEJILLONES ESCABECHE => desp.mejillon.lata
ARROZ REDONDO => desp.arroz
ARROZ BOMBA => desp.arroz
ARROZ BASMATI => desp.arroz.basmati
ESPAGUETI => desp.pasta.espagueti
ESPAGUETIS 500 G => desp.pasta.espagueti; pack=1x500 g
MACARRONES => desp.pasta.macarron
FIDEOS => desp.pasta.fideo
LENTEJAS => desp.lenteja
GARBANZOS COCIDOS => desp.legumbre.cocida
ALUBIAS => desp.alubia
HARINA TRIGO => desp.harina
AZUCAR => desp.azucar
SAL => desp.sal
ACEITE O.V.E. => desp.aceite.oliva.virgen.extra
ACEITE OLIVA VIRGEN EXTRA 1L => desp.aceite.oliva.virgen.extra; pack=1x1 l
ACEITE OLIVA SUAVE => desp.aceite.oliva
ACEITE GIRASOL => desp.aceite.girasol
VINAGRE VINO => desp.vinagre
MAYONESA => desp.mayonesa
KETCHUP => desp.ketchup
MOSTAZA => desp.mostaza
SALSA SOJA => desp.salsa.soja
CALDO POLLO => desp.caldo
CAFE MOLIDO => desp.cafe.molido
CAFE CAPSULAS => desp.cafe.capsulas
CACAO SOLUBLE => desp.cacao.polvo
COLA CAO => desp.cacao.polvo
MERMELADA FRESA => desp.mermelada
MIEL => desp.miel
ALMENDRAS => desp.fruto.seco.almendra
NUECES => desp.fruto.seco.nuez
PIPAS => desp.fruto.seco.pipas
AGUACATE MADURO => fruta.aguacate
GUACAMOLE 200 G => desp.guacamole; pack=1x200 g
HUMMUS => desp.hummus
CHOCOLATE NEGRO 70% => snk.chocolate
NUTELLA => snk.crema.cacao
CARAMELOS => snk.caramelo
GOMINOLAS => snk.gominola
PALOMITAS => snk.palomitas
NACHOS => snk.nachos
AGUA MINERAL 1,5L => bna.agua; pack=1x1.5 l
AGUA 6X1,5L => bna.agua; pack=6x1.5 l
AGUA CON GAS => bna.agua; gas=congas
REFRESCO COLA => bna.refresco.cola
COCA COLA ZERO => bna.refresco.cola; azucar=zero
REFRESCO COCA COLA ZERO => bna.refresco.cola; azucar=zero
FANTA NARANJA => bna.refresco
REFRESCO NARANJA => bna.refresco
TONICA => bna.tonica
ZUMO NARANJA => bna.zumo
ZUMO MELOCOTON => bna.zumo
BEBIDA ISOTONICA => bna.isotonica
BEBIDA ENERGETICA => bna.energetica
CERVEZA => bal.cerveza
CERVEZA MAHOU => bal.cerveza
CERVEZA 0,0 => bna.cerveza.sin
CERVEZA SIN ALCOHOL => bna.cerveza.sin
VINO TINTO => bal.vino
VINO BLANCO => bal.vino
CAVA BRUT => bal.cava
SIDRA => bal.sidra
GINEBRA => bal.ginebra
WHISKY => bal.whisky
HELADO => ~cong.helado
HELADO TARRINA => cong.helado.tarrina
POLO => cong.helado.polo
GUISANTES CONGELADOS => cong.congelado
PIZZA => pre.pizza
PIZZA BARBACOA => pre.pizza
LASAÑA CARNE => pre.lasana
LASAÑA PLACAS => desp.pasta.lasana
CROQUETAS JAMON => pre.croqueta
EMPANADILLAS => pre.empanadilla
NUGGETS POLLO => pre.nugget
QUESADILLA POLLO => pre.quesadilla
SUSHI => pre.sushi
TORTILLA PATATA => pre.tortilla.patata
ENSALADILLA RUSA => pre.ensaladilla
SANDWICH MIXTO => pre.sandwich
LECHE INFANTIL 2 => inf.leche.formula; etapa=2
LECHE INF 2 => inf.leche.formula; etapa=2
LECHE INICIO 1 => inf.leche.formula; etapa=1
LECHE CONTINUACION => inf.leche.formula; etapa=2
LECHE CRECIMIENTO 3 => inf.leche.formula; etapa=3
LECHE INFANTIL => inf.leche.formula
ALMIRON 2 => inf.leche.formula; etapa=2
PAPILLA 8 CEREALES => inf.cereales
CEREALES BEBE => inf.cereales
POTITO POLLO => inf.potito
BOLSITA FRUTA => inf.bolsita
SNACK BEBE => inf.snack
GALLETAS BEBE => pan.galleta.infantil
PAÑALES T4 => beb.panal; talla=4; tipoPanal=panal
PAÑALES TALLA 3 => beb.panal; talla=3
PAÑALES T4 48 UDS => beb.panal; talla=4; pack=48x1 ud
BRAGUITAS T5 => beb.panal; talla=5; tipoPanal=braguita
PAÑALES => beb.panal
TOALLITAS BEBE => beb.toallita
TOALLITAS HUMEDAS => beb.toallita
CREMA PAÑAL => beb.crema.panal
CHAMPU BEBE => beb.champu
GEL BEBE => beb.gel
DETERGENTE LIQUIDO => limp.detergente.liquido
DETERGENTE POLVO => limp.detergente.polvo
DETERGENTE CAPSULAS 40 LAVADOS => limp.detergente.capsulas; pack=40x1 ud
DETERGENTE => ~limp.detergente
SUAVIZANTE => limp.suavizante
LAVAVAJILLAS MANO => limp.lavavajillas.mano
LAVAVAJILLAS PASTILLAS => limp.lavavajillas.pastilla
LAVAVAJILLAS => ~limp.lavavajillas
LEJIA => limp.lejia
FREGASUELOS => limp.suelos
LIMPIACRISTALES => limp.cristales
MULTIUSOS => limp.multiusos
AMBIENTADOR => limp.ambientador
BAYETAS => limp.bayeta
ESTROPAJO => limp.estropajo
FREGONA => limp.fregona
GUANTES LIMPIEZA => limp.guantes
PAPEL HIGIENICO => limp.papel.higienico
PAPEL HIGIENICO 12 ROLLOS => limp.papel.higienico; pack=12x1 ud
PAPEL COCINA => limp.papel.cocina
SERVILLETAS => limp.servilleta
PAÑUELOS PAPEL => limp.panuelo
PAPEL ALUMINIO => limp.papel.aluminio
FILM TRANSPARENTE => limp.film
BOLSAS BASURA => limp.bolsa.basura
PILAS AAA => hogar.pila
BOMBILLA LED => hogar.bombilla
CHAMPU => cui.champu
ACONDICIONADOR => cui.acondicionador
GEL DUCHA => cui.gel.ducha
JABON MANOS => cui.jabon.manos
JABON PASTILLA => cui.jabon.pastilla
DESODORANTE => cui.desodorante
PASTA DIENTES => cui.dentifrico
CEPILLO DIENTES => cui.cepillo.dientes
ENJUAGUE BUCAL => cui.enjuague
COMPRESAS => cui.compresa
TAMPONES => cui.tampon
MAQUINILLA AFEITAR => cui.maquinilla
CREMA HIDRATANTE => cui.crema.corporal
CREMA SOLAR => cui.solar
BASTONCILLOS => cui.bastoncillo
ALGODON => cui.algodon
PRESERVATIVOS => cui.preservativo
PARACETAMOL => farm.paracetamol
IBUPROFENO => farm.ibuprofeno
TIRITAS => farm.tirita
PIENSO PERRO ADULTO => masc.pienso; especie=perro; edad=adulto
PIENSO GATO => masc.pienso; especie=gato
COMIDA GATO => ~masc.comida; especie=gato
ARENA GATO => masc.arena
WHISKAS POLLO => masc.comida; especie=gato
CUADERNO => pap.cuaderno
BOLIGRAFO => pap.boligrafo
FOLIOS => pap.folios
PEGAMENTO => pap.pegamento
CINTA ADHESIVA => pap.cinta
TUPPER => uten.tupper
SARTEN => uten.sarten
CALCETINES => ropa.calcetin
MACETA => jard.maceta
JUGUETE => jug.juguete
BOLSA => -
TICKET => -
DESCUENTO => -
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

export const CORPUS: readonly CorpusCase[] = parse()
