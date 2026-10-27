// CATÁLOGO MAESTRO — despensa: arroz, pasta, legumbres, harinas, aceites, conservas, salsas, caldos, café e infusiones, frutos secos, condimentos.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
// Regla de oro: el alias es el TIPO de producto (o un sinónimo suyo). Las variantes (redondo/largo, al natural/en aceite, sabores, marcas) NO van en el
// alias: quedan como diferencia entre artículos y por eso «arroz bomba» y «arroz largo» no se confunden.
export const DESPENSA = `
# Arroz, pasta y legumbres
desp.arroz | Arroz | desp | | k | integral, bio | basmati cocido microondas leche pollo paella cena tortita
desp.arroz.basmati | Arroz basmati | desp | basmati | k | integral
desp.arroz.cocido | Arroz cocido | desp | arroz microondas; arroz vasito; arroz precocinado | u
desp.pasta.espagueti | Espaguetis | desp | spaghetti; pasta espagueti | k | integral, gluten
desp.pasta.macarron | Macarrones | desp | pasta macarron | k | integral, gluten
desp.pasta.penne | Penne | desp | pasta penne | k | integral, gluten
desp.pasta.fusilli | Fusilli | desp | pasta fusilli | k | integral, gluten
desp.pasta.fideo | Fideos | desp | fideua; pasta fideo | k
desp.pasta.tallarin | Tallarines | desp | fettuccine; linguine; pasta tallarin | k | integral
desp.pasta.lasana | Lasaña (placas) | desp | placa lasana | k
desp.pasta.canelon | Canelones (placas) | desp | placa canelon | k
desp.pasta.sopa | Pasta de sopa | desp | pasta sopa; estrellitas | k
desp.pasta.tortellini | Tortellini | desp | | k
desp.pasta.ravioli | Ravioli | desp | | k
desp.pasta.gnocchi | Gnocchi | desp | noquis | k
~desp.pasta | Pasta | desp | pasta; pasta seca; pasta rellena | k | gluten, integral | dientes
desp.cuscus | Cuscús | desp | cuscus; couscous | k
desp.quinoa | Quinoa | desp | | k
desp.lenteja | Lentejas | desp | | k | | cocida bote cocinada
desp.garbanzo | Garbanzos | desp | | k | | cocido bote cocinado
desp.alubia | Alubias | desp | judia blanca; faba; fabes | k | | cocida bote cocinada
desp.legumbre.cocida | Legumbres cocidas | desp | legumbre bote; legumbre cocinada; cocido; cocida; cocinada; cocinado | k
# Harinas, azúcar, sal, repostería
desp.harina | Harina | desp | | k | gluten | maiz arroz
desp.harina.maiz | Harina de maíz | desp | harina maiz; fecula | k
desp.azucar | Azúcar | desp | | k | | moreno glas glass
desp.azucar.moreno | Azúcar moreno | desp | azucar panela | k
desp.azucar.glas | Azúcar glas | desp | azucar glass | k
desp.edulcorante | Edulcorante | desp | sacarina; stevia | u
desp.levadura | Levadura | desp | | u
desp.sal | Sal | cond | | k | | ajo
# Aceites y vinagres
desp.aceite.oliva.virgen.extra | Aceite de oliva virgen extra | desp | aceite virgen extra; aceite oliva extra | l | bio | spray girasol
desp.aceite.oliva.virgen | Aceite de oliva virgen | desp | | l | bio | extra
desp.aceite.oliva | Aceite de oliva | desp | | l | bio | virgen extra spray
desp.aceite.girasol | Aceite de girasol | desp | | l | bio
desp.aceite.semillas | Aceite de semillas | desp | aceite semilla | l
desp.aceite.spray | Aceite en spray | desp | aceite spray; spray aceite | l
desp.aceite.coco | Aceite de coco | desp | | l
~desp.aceite | Aceite | desp | aceite | l
desp.vinagre | Vinagre | desp | | l | | crema
desp.vinagre.crema | Crema de vinagre | desp | crema balsamico; crema vinagre | l
# Conservas
desp.atun.lata | Atún en lata | pes | atun; atun lata | u | | fresco filete lomo rodaja
desp.caballa.lata | Caballa en lata | pes | | u | | fresca
desp.sardina.lata | Sardinas en lata | pes | sardinilla | u
desp.mejillon.lata | Mejillones en lata | pes | mejillon escabeche | u
desp.berberecho.lata | Berberechos en lata | pes | | u
desp.anchoa | Anchoas | pes | | u
desp.pimiento.lata | Pimientos en conserva | desp | piquillo | u
desp.maiz.lata | Maíz en lata | desp | | u
desp.pepinillo | Pepinillos | desp | | u
desp.aceituna | Aceitunas | desp | | u
desp.esparrago.lata | Espárragos en conserva | desp | | u
desp.champinon.lata | Champiñones en conserva | desp | | u
desp.alcachofa.lata | Alcachofas en conserva | desp | corazon alcachofa | u
desp.menestra | Menestra | desp | | u
~desp.encurtido | Encurtidos | desp | encurtido; guindilla; banderilla; cebolleta vinagre | u
desp.tomate.triturado | Tomate triturado | desp | tomate pelado | u | | frito ketchup
desp.tomate.frito | Tomate frito | desp | frito tomate | u | | triturado
desp.fruta.almibar | Fruta en almíbar | desp | almibar | u
~desp.conserva | Conserva | desp | conserva; conserva vegetal; bote | u
# Salsas
desp.mayonesa | Mayonesa | desp | | u
desp.ketchup | Ketchup | desp | catsup | u
desp.mostaza | Mostaza | desp | | u
desp.salsa.soja | Salsa de soja | desp | soja salsa | l
desp.salsa.barbacoa | Salsa barbacoa | desp | barbacoa; salsa bbq | u
desp.salsa.alioli | Alioli | desp | | u
desp.salsa.bolonesa | Salsa boloñesa | desp | salsa bolognesa | u
desp.salsa.carbonara | Salsa carbonara | desp | | u
desp.salsa.pesto | Pesto | desp | | u
desp.salsa.picante | Salsa picante | desp | | u
desp.sofrito | Sofrito | desp | | u
~desp.salsa | Salsa | desp | salsa; aderezo; vinagreta; salsa ensalada; salsa pasta; salsa queso | u
desp.caldo | Caldo | desp | | l | | pastilla cubito concentrado polvo
desp.caldo.pastilla | Caldo en pastillas | desp | pastilla caldo; cubito caldo; caldo concentrado; caldo polvo | u
desp.sopa | Sopa | desp | sopa sobre; sopa deshidratada | u
desp.crema.verduras | Crema de verduras | desp | crema verdura; pure verdura | l
~desp.crema.otras | Crema o puré envasado | desp | crema calabacin; crema champinon; crema calabaza; crema puerro; pure patata | l
# Café, infusiones, cacao
desp.cafe.molido | Café molido | desp | | k
desp.cafe.grano | Café en grano | desp | | k
desp.cafe.capsulas | Café en cápsulas | desp | cafe capsula; capsula cafe | u
desp.cafe.soluble | Café soluble | desp | cafe instantaneo; soluble | k
desp.cafe.monodosis | Café en monodosis | desp | monodosis cafe; cafe pod | u
~desp.cafe | Café | desp | cafe | k
desp.cacao.polvo | Cacao en polvo | desp | cacao; cacao instantaneo | k
desp.te | Té | desp | | u
desp.infusion | Infusión | desp | | u
~desp.infusion.otras | Infusión de hierbas | desp | manzanilla; poleo; tila; rooibos; hierbaluisa | u
# Dulces y desayuno
desp.miel | Miel | desp | | k
desp.mermelada | Mermelada | desp | confitura | k
desp.dulce.membrillo | Dulce de membrillo | desp | membrillo | k
desp.avena | Copos de avena | desp | avena; salvado avena | k | | bebida leche cereal
~desp.semillas | Semillas | desp | semilla; chia; lino; sesamo; psyllium | k
desp.fruto.seco.almendra | Almendras | snk | | k | | bebida leche turron
desp.fruto.seco.nuez | Nueces | snk | | k
desp.fruto.seco.cacahuete | Cacahuetes | snk | mani | k | | crema mantequilla
desp.fruto.seco.avellana | Avellanas | snk | | k
desp.fruto.seco.pistacho | Pistachos | snk | | k
desp.fruto.seco.anacardo | Anacardos | snk | | k
desp.fruto.seco.pipas | Pipas | snk | pipa | k
desp.pasas | Pasas | desp | | k
~desp.fruto.seco | Frutos secos | snk | fruto seco; mix frutos; mezcla frutos; datil; orejon; fruta deshidratada; higo seco | k
desp.crema.cacahuete | Crema de cacahuete | desp | mantequilla cacahuete; crema cacahuete | k
desp.hummus | Hummus | desp | humus | k
desp.guacamole | Guacamole | desp | | k
desp.tahini | Tahini | desp | tahin | k
# Condimentos y hierbas
cond.pimienta | Pimienta | cond | | k
cond.pimenton | Pimentón | cond | | k
cond.oregano | Orégano | cond | | k
cond.comino | Comino | cond | | k
cond.canela | Canela | cond | | k
cond.curry | Curry | cond | | k
cond.azafran | Azafrán | cond | | u
cond.laurel | Laurel | cond | | u
cond.ajo.polvo | Ajo en polvo | cond | ajo granulado | k
cond.vainilla | Vainilla | cond | | u
~cond.hierbas | Hierbas aromáticas | cond | hierba; hierbas aromaticas; hierbas provenzales; tomillo; romero; salvia; eneldo; mejorana; estragon | u
~cond.especias | Especias y sazonadores | cond | especia; condimento; sazonador; adobo; sazon; colorante alimentario; mezcla especias | u
`
