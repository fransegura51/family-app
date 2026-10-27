// CATÁLOGO MAESTRO — frescos: fruta, verdura, carne y embutidos, pescado y marisco, huevos. Formato y reglas en ../parse.ts.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
// Cada entrada es UN producto que una familia compararía con otro de la misma entrada. Lo que son varios productos distintos con un nombre genérico
// va en una entrada de clase («~»): clasifica, no agrupa.
export const FRESCOS = `
# Fruta
fruta.manzana | Manzana | fru | | k
fruta.pera | Pera | fru | | k | | zumo
fruta.platano | Plátano | fru | platano canario; banana | k
fruta.naranja | Naranja | fru | naranja mesa; naranja zumo | k | | zero gas refresco zumo
fruta.mandarina | Mandarina | fru | clementina; satsuma | k
fruta.limon | Limón | fru | | k | | zero gas refresco zumo
fruta.lima | Lima | fru | | k
fruta.pomelo | Pomelo | fru | | k
fruta.uva | Uva | fru | | k | | pasa
fruta.fresa | Fresa | fru | | k | | yogur batido helado mermelada
fruta.frambuesa | Frambuesa | fru | | k
fruta.arandano | Arándano | fru | | k
fruta.cereza | Cereza | fru | picota | k
fruta.melon | Melón | fru | | k
fruta.sandia | Sandía | fru | | k
fruta.kiwi | Kiwi | fru | | k
fruta.mango | Mango | fru | | k | | zumo
fruta.pina | Piña | fru | | k | | zumo lata almibar
fruta.melocoton | Melocotón | fru | paraguayo | k | | zumo almibar lata
fruta.nectarina | Nectarina | fru | | k
fruta.albaricoque | Albaricoque | fru | | k
fruta.ciruela | Ciruela | fru | | k | | pasa
fruta.aguacate | Aguacate | fru | | k | | guacamole
fruta.higo | Higo | fru | breva | k
fruta.granada | Granada | fru | | k
fruta.papaya | Papaya | fru | | k
fruta.caqui | Caqui | fru | persimon | k
fruta.coco | Coco | fru | | k | | rallado leche bebida
fruta.macedonia | Macedonia de fruta | fru | fruta troceada; fruta cortada; ensalada fruta | k
~fruta.otras | Fruta | fru | fruta variada; fruta temporada; fruta surtida; chirimoya; maracuya; lichi; carambola; fruta pasion | k
# Verdura y hortalizas
verd.tomate | Tomate | ver | tomate pera; tomate rama; tomate cherry; tomate ensalada; tomate canario | k | | frito triturado natural conserva salsa pelado ketchup
verd.cebolla | Cebolla | ver | cebolla morada | k | | frito crujiente aro
verd.cebolleta | Cebolleta | ver | | k
verd.ajo | Ajo | ver | ajo cabeza | k | | polvo granulado
verd.patata | Patata fresca | ver | patata; patata lavada; patata nueva; patata agria | k | | frito chip congelado puré prefrito
verd.boniato | Boniato | ver | batata | k
verd.zanahoria | Zanahoria | ver | | k | | ensalada rallada
verd.pimiento | Pimiento | ver | pimiento italiano; pimiento california | k | | asado lata conserva piquillo
verd.pimiento.padron | Pimiento de Padrón | ver | padron; pimiento padron | k
verd.lechuga | Lechuga | ver | lechuga iceberg; lechuga romana; lechuga francesa; lechuga roble; lechuga hoja roble | k
verd.cogollo | Cogollos | ver | cogollo; cogollo lechuga; cogollos tudela | k
verd.canonigo | Canónigos | ver | canonigo | k
verd.rucula | Rúcula | ver | | k
verd.espinaca | Espinaca | ver | espinaca baby | k | | congelado
verd.acelga | Acelga | ver | | k
verd.repollo | Repollo | ver | col; col blanca | k
verd.lombarda | Lombarda | ver | col lombarda | k
verd.coliflor | Coliflor | ver | | k
verd.brocoli | Brócoli | ver | brecol | k | | congelado
verd.calabacin | Calabacín | ver | | k
verd.calabaza | Calabaza | ver | | k
verd.berenjena | Berenjena | ver | | k
verd.pepino | Pepino | ver | | k | | pepinillo encurtido
verd.puerro | Puerro | ver | | k
verd.apio | Apio | ver | | k
verd.judia | Judía verde | ver | judia verde; judia plana; judia redonda | k | | blanca seca cocida bote lata congelado
verd.guisante | Guisante | ver | | k | | congelado lata bote conserva
verd.haba | Habas | ver | haba | k | | congelado lata bote conserva
verd.maiz | Maíz dulce | ver | mazorca | k | | lata bote conserva
verd.champinon | Champiñón | ver | champinon laminado; champinon entero | k | | lata bote conserva
verd.esparrago | Espárrago | ver | esparrago trigueros | k | | lata bote conserva
verd.alcachofa | Alcachofa | ver | | k | | lata bote conserva congelado
verd.remolacha | Remolacha | ver | | k
verd.rabano | Rábano | ver | rabano; rabanito | k
verd.jengibre | Jengibre | ver | | k | | polvo
verd.perejil | Perejil | ver | | u
verd.cilantro | Cilantro | ver | | u
verd.albahaca | Albahaca | ver | | u
verd.ensalada | Ensalada en bolsa | ver | ensalada lista; ensalada mezcla; ensalada 4 estaciones; ensalada mix; lechuga troceada; mezclum | k
~verd.otras | Verdura | ver | verdura; hortaliza; seta; setas; boletus; shiitake; hinojo; endibia; nabo; brote; germinado; verdura salteado; verdura wok | k
# Huevos
hue.docena | Huevos | hue | huevo; huevo gallina; huevo camperos; huevo campero; huevo suelo; huevo l; huevo m; huevo xl | u | | cocido chocolate
hue.cocido | Huevos cocidos | hue | huevo cocido; huevo duro; huevo cocido pelado | u
hue.liquido | Huevo líquido | hue | huevo pasteurizado; clara huevo; clara liquida; huevina | l
# Carne de ave
carne.pollo | Pollo | carne | pollo entero; pollo troceado; pollo campero; cuarto pollo | k | | nugget croqueta empanado caldo sopa pizza lasana quesadilla empanadilla ensalada sandwich arroz crema
carne.pollo.pechuga | Pechuga de pollo | carne | pechuga pollo; filete pechuga; pechuga fileteada; pechuga troceada | k | | fiambre lonchas cocida
carne.pollo.muslo | Muslo de pollo | carne | muslo pollo; contramuslo; contramuslo pollo | k
carne.pollo.ala | Alitas de pollo | carne | alita pollo; ala pollo; alita | k
carne.pollo.asado | Pollo asado | pre | pollo asado; pollo rustido; pollo braseado | u
carne.pavo | Pavo | carne | filete pavo; pavo troceado; pavo picado; pechuga pavo; muslo pavo | k | | fiambre lonchas cocida loncha embutido
# Cerdo y vacuno
carne.cerdo.lomo | Lomo de cerdo | carne | lomo cerdo; lomo adobado; lomo fileteado | k | | embuchado serrano lonchas
carne.cerdo.chuleta | Chuletas de cerdo | carne | chuleta cerdo; chuleta lomo; chuleta aguja; chuleta sajonia; chuleta | k | | cordero ternera
carne.cerdo.costilla | Costillas de cerdo | carne | costilla cerdo; costilla; costillar; costilla adobada | k
carne.cerdo.solomillo | Solomillo de cerdo | carne | solomillo cerdo; solomillo iberico | k
carne.cerdo.panceta | Panceta | carne | panceta adobada; tocino; torrezno | k | | lonchas ahumada
carne.cerdo.picada | Carne picada | carne | carne picada mixta; carne picada vacuno; picada | k | | albondiga hamburguesa
carne.cerdo | Cerdo | carne | cerdo guisar; cerdo troceado; magro cerdo; presa; secreto | k
carne.ternera | Ternera | carne | ternera guisar; ternera filete; filete ternera; ternera estofar; babilla; redondo ternera; falda ternera; ternera troceada | k | | hamburguesa picada burger lonchas
carne.ternera.entrecot | Entrecot de ternera | carne | entrecot; chuleton; solomillo ternera; lomo alto; lomo bajo; vacio | k
carne.hamburguesa | Hamburguesa | carne | hamburguesa mixta; hamburguesa vacuno; hamburguesa buey | k | | queso pan veggie vegetal garbanzo
carne.albondiga | Albóndigas | carne | albondiga | k
carne.salchicha | Salchichas | carne | salchicha frankfurt; frankfurt; salchicha cocktail | k | | pan perrito
carne.pinchito | Pinchitos y brochetas | carne | pinchito; brocheta; pincho moruno; kebab | k
carne.cordero | Cordero | carne | cordero; pierna cordero; paletilla cordero; chuleta cordero; cordero lechal | k
carne.conejo | Conejo | carne | conejo troceado | k
~carne.otras | Carne | carne | carne; carne fresca; carne guisar; carne variada; pato; magret; higado; callos; lengua; rabo toro; manita; oreja; morro; molleja; casqueria; cabrito; codorniz | k
# Embutidos y charcutería
emb.chorizo | Chorizo | carne | chorizo iberico; chorizo cular; chorizo sarta; chorizo parrilla; chorizo cantimpalo | k | | sandwich
emb.salchichon | Salchichón | carne | salchichon iberico | k
emb.fuet | Fuet y espetec | carne | fuet; espetec | k
emb.longaniza | Longaniza | carne | butifarra | k
emb.sobrasada | Sobrasada | carne | | k
emb.morcilla | Morcilla | carne | morcilla burgos; morcilla arroz; morcilla cebolla | k
emb.lomo.embuchado | Lomo embuchado | carne | lomo embuchado; cecina; caña lomo | k
emb.jamon.serrano | Jamón serrano | carne | jamon reserva; jamon cebo; paleta curada; taco jamon; jamon trozo; jamon deshuesado | k | | cocido york iberico
emb.jamon.iberico | Jamón ibérico | carne | jamon iberico; paleta iberica; paleta cebo iberica; jamon bellota; paleta bellota | k | | cocido york serrano
emb.jamon.cocido | Jamón cocido | carne | jamon york; fiambre jamon; york; jamon cocido lonchas | k | | serrano curado iberico
emb.pavo.fiambre | Pechuga de pavo en lonchas | carne | pavo cocido; pechuga pavo cocida; pavo lonchas; fiambre pavo; pavo fiambre; pechuga cocida | k
emb.pollo.fiambre | Pollo en lonchas | carne | fiambre pollo; pollo cocido lonchas; pechuga pollo lonchas | k
emb.bacon | Bacon | carne | beicon; bacon lonchas; bacon cubos; dados bacon | k
emb.mortadela | Mortadela | carne | mortadela aceitunas; mortadela italiana | k
emb.chopped | Chopped | carne | chopped pork | k
emb.pate | Paté | carne | pate; pate campaña; mousse pate; foie; foie gras; bloc foie | k
~emb.otros | Embutido | carne | embutido; embutido variado; fiambre; fiambre variado; charcuteria; lonchas | k
# Pescado y marisco
pes.merluza | Merluza | pes | merluza filete; merluza rodaja; merluza lomo; filete merluza; pescadilla; pescadilla filete | k | | empanado rebozado congelado
pes.salmon | Salmón | pes | salmon filete; salmon lomo; salmon trozo; filete salmon; salmon noruego; lomo salmon | k | | ahumado lata
pes.salmon.ahumado | Salmón ahumado | pes | salmon ahumado; salmon ahumado lonchas | k
pes.atun.fresco | Atún fresco | pes | atun fresco; atun filete; atun lomo; atun rodaja; bonito fresco; bonito del norte | k | | lata aceite natural conserva
pes.bacalao | Bacalao | pes | bacalao desalado; bacalao lomo; bacalao miga; bacalao filete; bacalao loma | k | | empanado rebozado ahumado
pes.dorada | Dorada | pes | dorada filete | k
pes.lubina | Lubina | pes | lubina filete | k
pes.trucha | Trucha | pes | trucha filete | k
pes.sardina | Sardina | pes | | k | | lata aceite conserva
pes.boqueron | Boquerón | pes | boqueron limpio | k | | vinagre lata conserva
pes.rape | Rape | pes | rape rodaja; rape filete; rape cola | k
pes.lenguado | Lenguado | pes | | k
pes.rodaballo | Rodaballo | pes | | k
pes.gamba | Gambas | pes | gamba pelada; gamba arrocera | k | | congelado lata cocktail ensalada
pes.gambon | Gambón | pes | | k
pes.langostino | Langostinos | pes | langostino pelado | k
pes.mejillon | Mejillones | pes | mejillon vapor | k | | lata conserva escabeche
pes.almeja | Almejas | pes | almeja fina; almeja japonesa; chirla | k
pes.berberecho | Berberechos | pes | | k | | lata conserva
pes.calamar | Calamar | pes | calamar limpio; calamar anillas | k | | congelado romana rebozado lata
pes.pulpo | Pulpo | pes | pulpo patas | k
pes.sepia | Sepia | pes | sepia limpia | k
pes.surimi | Surimi | pes | palito cangrejo; palitos mar; barritas mar; delicias mar; surimi | k
pes.gulas | Gulas | pes | gula; angulas | k
~pes.otros | Pescado | pes | pescado; pescado azul; pescado fileteado; filete pescado; pescado variado; besugo; pargo; mero; abadejo; pez espada; emperador; panga; tilapia; jurel; salmonete; chicharro; corvina; marisco; marisco mixto; cangrejo; centollo; necora; bogavante; langosta; cigala; carabinero; ostra; vieira; navaja; coquina; percebe; zamburina; mojama; huevas | k | | empanado rebozado congelado
`
