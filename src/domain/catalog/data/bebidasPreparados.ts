// CATÁLOGO MAESTRO — bebidas (sin alcohol y con alcohol), congelados y helados, platos preparados.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
// Una entrada por NOMBRE PRINCIPAL del producto: los sabores y variantes («naranja», «negra», «tinto») no van en el alias, se distinguen solos como diferencia
// entre artículos y por eso un refresco de naranja y uno de limón no se agrupan.
export const BEBIDAS_PREPARADOS = `
# Bebidas sin alcohol
bna.agua | Agua mineral | bna | agua | l | gas | bebe infantil oxigenada tonica
bna.agua.bebe | Agua para bebés | bna | agua bebe; agua infantil; agua biberon | l
bna.refresco.cola | Refresco de cola | bna | cola; refresco cola; bebida cola | l | azucar | cao
bna.refresco | Refresco | bna | refresco; bebida refrescante; zero; cero; light | l | azucar, gas
bna.tonica | Tónica | bna | agua tonica | l | azucar
bna.limonada | Limonada | bna | | l | azucar
bna.naranjada | Naranjada | bna | | l | azucar
bna.gaseosa | Gaseosa | bna | | l | azucar
bna.te.frio | Té frío | bna | te frio; te helado; ice tea | l | azucar
bna.isotonica | Bebida isotónica | bna | isotonica; isotonico; bebida deportiva | l | azucar
bna.energetica | Bebida energética | bna | energetica; energetico | l | azucar
bna.zumo | Zumo | bna | nectar; zumo fruta | l | azucar | cao
bna.mosto | Mosto | bna | | l
bna.horchata | Horchata | bna | | l
bna.cafe.frio | Café frío | bna | cafe helado | l
bna.cerveza.sin | Cerveza sin alcohol | bna | cerveza 0 0; cerveza 0; cerveza 00; cerveza cero; cerveza sin | l
~bna.otras | Bebida | bna | bebida; ginger ale; bitter; smoothie | l
# Bebidas alcohólicas
bal.cerveza | Cerveza | bal | | l | alcohol | tercio
bal.vino | Vino | bal | tinto | l | alcohol | verano cocina
bal.vino.cocina | Vino de cocina | bal | vino mesa | l
bal.cava | Cava | bal | espumoso; champan; prosecco | l
bal.tinto.verano | Tinto de verano | bal | tinto verano; sangria; calimocho | l
bal.sidra | Sidra | bal | | l
bal.vermut | Vermut | bal | vermouth | l
bal.ginebra | Ginebra | bal | gin | l
bal.ron | Ron | bal | | l
bal.whisky | Whisky | bal | whiskey; bourbon; scotch | l
bal.vodka | Vodka | bal | | l
bal.brandy | Brandy | bal | coñac; cognac | l
~bal.licor | Licor | bal | licor; orujo; aguardiente; anis; pacharan; tequila; baileys; amaretto; limoncello | l
# Congelados y helados
cong.helado.tarrina | Helado en tarrina | cong | tarrina helado; helado tarrina; helado litro | l
cong.helado.cono | Helado en cono | cong | helado cono; cono helado | u
cong.helado.polo | Polos | cong | polo; helado palo; helado hielo | u
cong.helado.tarta | Tarta helada | cong | tarta helado; helado tarta | u
~cong.helado | Helado | cong | helado | l
cong.hielo | Hielo | cong | hielo cubitos; cubitos hielo | k
cong.congelado | Congelado | cong | congelado; ultracongelado | k
# Platos preparados
pre.pizza | Pizza | pre | pizza refrigerada; mini pizza | u
pre.lasana | Lasaña preparada | pre | lasana | u | | placa
pre.canelon | Canelones preparados | pre | canelon | u | | placa
pre.croqueta | Croquetas | pre | croqueta | u
pre.empanadilla | Empanadillas | pre | empanadilla | u
pre.empanada | Empanada | pre | | u
pre.nugget | Nuggets | pre | nugget | u
pre.sanjacobo | San Jacobos | pre | san jacobo; sanjacobo; cordon bleu | u
pre.escalope | Escalopes y filetes empanados | pre | escalope; filete empanado; milanesa; flamenquin | u
pre.quesadilla | Quesadillas | pre | quesadilla | u
pre.fajita | Fajitas y tacos | pre | fajita; burrito; enchilada | u
pre.sushi | Sushi | pre | maki; nigiri; temaki | u
pre.poke | Poke | pre | poke bowl; bowl | u
pre.gazpacho | Gazpacho | pre | | l
pre.salmorejo | Salmorejo | pre | | l
pre.calamar.romana | Calamares a la romana | pre | | u
~pre.ensalada | Ensalada preparada | pre | ensalada atun; ensalada pollo; ensalada pasta; ensalada arroz; ensalada cesar; ensalada capresse; ensalada pollo | u
pre.ensaladilla | Ensaladilla rusa | pre | ensalada rusa; ensaladilla | k
pre.tortilla.patata | Tortilla de patata | pre | tortilla espanola; tortilla patata | u
pre.paella | Paella preparada | pre | paella | u
pre.sandwich | Sándwich | pre | sandwiches; sandwich mixto | u
pre.bocadillo | Bocadillo | pre | bocata | u
pre.hotdog | Perrito caliente | pre | hot dog | u
pre.noodles | Noodles y fideos instantáneos | pre | noodle; ramen; fideo instantaneo; fideo oriental; fideo vasito | u
~pre.plato | Plato preparado | pre | plato preparado; plato cocinado; plato listo; guiso; guisado; estofado; potaje; cena preparada | u
`
