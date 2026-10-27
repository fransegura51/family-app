// CATÁLOGO MAESTRO — lácteos, postres, panadería y bollería, galletas, cereales de desayuno, dulces y snacks.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
// Los alias son SINÓNIMOS DEL TIPO de producto: nunca llevan sabores, rellenos ni marcas (esas palabras quedan como diferencia entre artículos).
// Un tipo de producto con subtipos que se compran por separado (yogur / yogur griego) son entradas distintas: gana la que explica más palabras.
export const LACTEOS_PAN = `
# Leche y bebidas vegetales
lac.leche | Leche | lac | leche vaca; leche uht | l | tipoLeche!, lactosa, bio | condensada evaporada polvo infantil formula crecimiento continuacion avena soja almendra arroz coco cabra oveja batido chocolate
lac.leche.condensada | Leche condensada | lac | | k
lac.leche.evaporada | Leche evaporada | lac | | l
lac.leche.polvo | Leche en polvo | lac | | k
lac.leche.cabra | Leche de cabra | lac | | l
lac.bebida.avena | Bebida de avena | lac | leche avena; avena bebida | l | gluten, bio
lac.bebida.soja | Bebida de soja | lac | leche soja; soja bebida | l | azucar, bio
lac.bebida.almendra | Bebida de almendra | lac | leche almendra; almendra bebida | l | azucar, bio
lac.bebida.arroz | Bebida de arroz | lac | arroz bebida | l
lac.bebida.coco | Bebida de coco | lac | leche coco; coco bebida | l
lac.batido | Batido | lac | batido lacteo; batido leche | l | azucar, lactosa
lac.nata | Nata | lac | nata liquida; crema leche | l | | spray
lac.nata.spray | Nata en spray | lac | nata spray; nata aerosol; nata montada | l
# Yogures y postres lácteos
lac.yogur | Yogur | lac | | u | azucar, lactosa, bio | griego proteina skyr bebible liquido bifidus
lac.yogur.griego | Yogur griego | lac | griego | u | azucar
lac.yogur.proteina | Yogur proteico | lac | skyr; yogur proteina | u | azucar
lac.yogur.bebible | Yogur líquido | lac | yogur bebible; yogur liquido; kefir | l | azucar, lactosa
lac.yogur.bifidus | Yogur con bífidus | lac | yogur bifidus; bifidus | u | azucar, lactosa
lac.petit | Petit suisse | lac | petit; fromage frais | u
lac.natillas | Natillas | pos | | u
lac.flan | Flan | pos | | u
lac.cuajada | Cuajada | pos | | u
lac.arroz.leche | Arroz con leche | pos | | u
lac.gelatina | Gelatina | pos | gelatina postre | u
lac.mousse | Mousse | pos | | u
~lac.postre | Postre lácteo | pos | postre lacteo; postre; tiramisu; panacota; crema catalana; semifrio; profiterol | u
# Queso
lac.queso.fresco | Queso fresco | lac | queso burgos; queso fresco pasteurizado; burgos | k | | rallado lonchas
lac.queso.rallado | Queso rallado | lac | rallado queso | k
lac.queso.lonchas | Queso en lonchas | lac | queso loncha; lonchas queso; queso fundido | k | | rallado
lac.queso.tierno | Queso tierno | lac | | k | | rallado lonchas
lac.queso.semicurado | Queso semicurado | lac | | k | | rallado lonchas
lac.queso.curado | Queso curado | lac | queso viejo; queso anejo | k | | rallado lonchas
lac.queso.mezcla | Queso mezcla | lac | | k | | rallado lonchas
lac.queso.manchego | Queso manchego | lac | manchego | k
lac.queso.emmental | Queso emmental | lac | emmental | k | | rallado lonchas
lac.queso.gouda | Queso gouda | lac | gouda | k | | rallado lonchas
lac.queso.edam | Queso edam | lac | edam | k | | rallado lonchas
lac.queso.cabra | Queso de cabra | lac | | k
lac.queso.oveja | Queso de oveja | lac | | k
lac.queso.azul | Queso azul | lac | | k
lac.queso.mozzarella | Mozzarella | lac | | k | | rallado
lac.queso.burrata | Burrata | lac | | u
lac.queso.crema | Queso crema | lac | queso untar; queso untable | k
lac.queso.parmesano | Parmesano | lac | queso parmesano; parmigiano | k | | rallado
lac.queso.feta | Queso feta | lac | feta | k
lac.queso.cottage | Queso cottage | lac | cottage | k
lac.requeson | Requesón | lac | | k
lac.queso.porciones | Quesitos en porciones | lac | quesito; queso porcion; porciones queso | u
~lac.queso.otros | Queso | lac | queso | k
lac.mantequilla | Mantequilla | lac | | k
lac.margarina | Margarina | lac | | k
# Panadería
pan.barra | Pan | pan | pan barra; barra pan; baguette; panecillo | u | integral | molde rallado pita hamburguesa perrito tostado precocido
pan.molde | Pan de molde | pan | pan sandwich | u | integral, gluten | rallado
pan.hamburguesa | Pan de hamburguesa | pan | pan burger; bollo hamburguesa | u
pan.perrito | Pan de perrito | pan | pan hot dog; pan frankfurt | u
pan.rallado | Pan rallado | pan | rebozador | k
pan.pita | Pan de pita | pan | pita; pan arabe | u
pan.tortilla.trigo | Tortillas de trigo | pan | wrap; tortilla wrap; tortilla fajita; tortilla mexicana; tortilla trigo | u | integral
pan.tostada | Pan tostado | pan | tostada; tosta; biscote | u | integral
pan.picos | Picos y regañás | pan | pico; regaña; colin | u
pan.base.pizza | Base de pizza | pan | masa pizza | u
pan.hojaldre | Masa de hojaldre | pan | hojaldre | u
pan.precocido | Pan precocido | pan | pan horno; barra precocida | u
# Bollería y repostería
pan.croissant | Croissant | pan | cruasan | u
pan.magdalena | Magdalenas | pan | magdalena | u
pan.bizcocho | Bizcocho | pan | plum cake; plumcake | u
pan.donut | Donuts | pan | donut | u
pan.napolitana | Napolitana | pan | | u
pan.palmera | Palmeras | pan | palmera | u
pan.ensaimada | Ensaimada | pan | | u
pan.sobao | Sobaos | pan | sobao | u
~pan.bolleria | Bollería | pan | bolleria; bollo; brioche; trenza; caracola; suizo; pastel; pastelito; pasteleria; torta; quesada; roscon | u
pan.galleta.maria | Galletas María | pan | galleta maria | u | integral, gluten
pan.galleta.chocolate | Galletas de chocolate | pan | galleta chocolate; cookie; cookies | u | gluten
pan.galleta.rellena | Galletas rellenas | pan | galleta rellena; galleta sandwich | u
pan.galleta.digestive | Galletas digestive | pan | digestive | u | integral
pan.galleta.surtido | Surtido de galletas | pan | galleta surtido; surtido galleta | u
pan.galleta.infantil | Galletas infantiles | inf | galleta bebe; galleta infantil; galleta denticion | u
~pan.galleta | Galletas | pan | galleta | u | gluten
desp.cereales.desayuno | Cereales de desayuno | desp | cereal desayuno; cornflakes; cereal; granola; muesli | k | gluten | infantil bebe papilla
pan.barrita.cereales | Barritas de cereales | snk | barrita cereal; barrita cereales; barrita muesli; barrita avena | u
pan.tortita.arroz | Tortitas de arroz y maíz | snk | tortita | u | integral
# Chocolates y dulces
snk.chocolate | Chocolate en tableta | snk | tableta chocolate; chocolate | k | azucar, bio | crema bebida polvo batido helado turron galleta barrita bombon cacao
snk.crema.cacao | Crema de cacao | snk | crema cacao | k
snk.bombon | Bombones | snk | bombon | u
snk.chocolatina | Chocolatinas | snk | chocolatina | u
snk.caramelo | Caramelos | snk | caramelo | u
snk.piruleta | Piruletas | snk | piruleta | u
snk.chicle | Chicles | snk | chicle | u
snk.gominola | Gominolas | snk | gominola; golosina; chuche | k
snk.regaliz | Regaliz | snk | | k
snk.turron | Turrón | snk | | k
snk.polvoron | Polvorones | snk | polvoron; mantecado | k
snk.mazapan | Mazapán | snk | | k
# Snacks salados
snk.patatas.fritas | Patatas fritas de bolsa | snk | patata frito; patata chip; chips patata; snack patata; patata ondulado; patata lisa | k | | congelado horno prefrito
snk.nachos | Nachos | snk | nacho; tortilla chip; totopos | k
snk.palomitas | Palomitas | snk | palomita; maiz palomita | k
snk.ganchitos | Ganchitos | snk | ganchito; snack maiz | k
snk.frutos.fritos | Frutos secos fritos | snk | cacahuete frito; maiz frito; kikos | k
snk.aperitivo.mix | Aperitivo mixto | snk | aperitivo; mix aperitivo; surtido aperitivo; saladitos; snack mix | k
snk.pretzel | Pretzels | snk | pretzel; rosquilleta | k
`
