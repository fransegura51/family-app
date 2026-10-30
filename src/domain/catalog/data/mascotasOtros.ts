// CATÁLOGO MAESTRO — mascotas, papelería, utensilios de cocina, ropa, electrónica, jardín, juguetes y otros consumibles de compra familiar.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
export const MASCOTAS_OTROS = `
# Mascotas
masc.pienso | Pienso | masc | pienso; comida seca; croqueta perro; croqueta gato; pienso perro; pienso gato | k | especie!, edad
masc.comida.humeda | Comida húmeda para mascotas | masc | comida humeda; lata perro; lata gato; sobre gato; sobre perro; tarrina perro; tarrina gato; sobres comida; paté perro; paté gato | k | especie!, edad
masc.snack.perro | Snacks para perro | masc | snack perro; premio perro; hueso perro; hueso; palo perro; galleta perro; masticable perro | u
masc.snack.gato | Snacks para gato | masc | snack gato; premio gato; galleta gato | u
masc.arena | Arena para gatos | masc | arena gato; arena sanitaria; piedras gato; lecho gato; arena higienica; arena aglomerante; arena silice | k
masc.antiparasitario | Antiparasitario | masc | pipeta; collar antiparasitario; antipulgas; collar pulgas; frontline; advantix; desparasitante | u
masc.comida.aves | Comida para aves | masc | alpiste; comida pajaros; comida canarios; comida periquitos; comida aves; mixtura pajaros | k
masc.comida.peces | Comida para peces | masc | escamas peces; comida peces; comida pez | u
masc.bolsas | Bolsas higiénicas para mascotas | masc | bolsas excrementos; bolsas caca; bolsas perro; bolsa excremento | u
masc.juguete | Juguetes para mascotas | masc | juguete perro; juguete gato; pelota perro; rascador; ratón gato; juguete mascota | u
~masc.comida | Comida para mascotas | masc | comida perro; comida gato; alimento perro; alimento gato; comida mascota | k | especie
~masc.otros | Productos para mascotas | masc | mascota; comedero; bebedero; correa; arnes; collar perro; cama perro; transportin; champu perro; champu gato; cepillo perro | u
# Papelería y oficina
pap.cuaderno | Cuaderno | pap | libreta; bloc; cuaderno espiral; cuaderno grapado; cuaderno cuadricula; bloc notas | u
pap.boligrafo | Bolígrafos | pap | boligrafo; boli; bolis; boligrafos; roller | u
pap.lapiz | Lápices | pap | lapiz; lapices; lapiz grafito; portaminas; minas | u
pap.goma | Gomas de borrar | pap | goma borrar; goma; gomas | u
pap.sacapuntas | Sacapuntas | pap | | u
pap.rotulador | Rotuladores | pap | rotuladores; marcador; marcadores; subrayador; rotulador permanente; rotuladores colores | u
pap.colores | Lápices de colores y ceras | pap | lapices colores; ceras; cera colores; colores; pinturas; plastidecor; ceras plastidecor; pinturas colores | u
pap.pegamento | Pegamento | pap | barra pegamento; cola blanca; pegamento instantaneo; loctite; pegamento barra; pegamento liquido; silicona | u
pap.tijeras | Tijeras | pap | tijera; tijeras escolares; tijeras cocina | u
pap.folios | Folios | pap | folio; papel a4; resma; papel impresora; papel fotocopiadora; paquete folios; a4 | u
pap.carpeta | Carpetas y archivadores | pap | archivador; clasificador; fundas; funda plastico; portafolios; carpeta anillas; carpeta plastico; separadores; carpetas | u | | cajones cajonera mueble ruedas
pap.regla | Reglas y compases | pap | escuadra; cartabon; compas; transportador; regla escolar; juego reglas | u
pap.cinta | Cinta adhesiva | pap | celo; cinta embalar; cinta carrocero; precinto; cinta doble cara; cinta adhesiva transparente; cinta carpintero | u
pap.grapas | Grapas y clips | pap | grapa; grapadora; clips; clip; chincheta; chinchetas; pinza papel; gomillas | u
pap.postit | Notas adhesivas | pap | post it; postit; notas adhesivas; taco notas; notas post it; marcapaginas | u
pap.estuche | Estuche y mochila escolar | pap | mochila escolar; cartera escolar; mochila; cartera; estuche escolar; trolley escolar; neceser | u
pap.tempera | Témperas y manualidades | man | plastilina; acuarela; pincel; pinceles; pintura dedos; goma eva; cartulina; cartulinas; manualidades; purpurina; pistola silicona | u
pap.sobre | Sobres | pap | sobres; sobre carta; sobre acolchado; sobre manila | u
pap.regalo | Papel de regalo | pap | envoltorio regalo; lazo regalo; felicitacion; lazo; cinta regalo; papel envolver | u
~pap.otros | Material de oficina | pap | oficina; material oficina; calculadora; agenda; calendario; etiquetas; etiqueta | u
# Cocina y menaje
uten.tupper | Tuppers y recipientes | uten | tupper; tapper; recipiente; fiambrera; recipiente cristal; recipiente hermetico; bolsa hermetica; boteria | u
uten.vaso.desechable | Vasos y platos desechables | uten | vaso desechable; plato desechable; vasos plastico; platos carton; platos plastico; cubiertos desechables; vaso carton; vasos desechables | u
uten.sarten | Sartenes y cazuelas | uten | sarten; cazuela; olla; olla express; cacerola; wok; cazo; paellera; cazuelas | u
uten.cubiertos | Cubiertos | uten | cubierto; tenedor; cuchara; cuchillo; cubertería; cuberteria | u
uten.vajilla | Vasos, platos y tazas | uten | vaso; plato; taza; vajilla; bol; bowl cocina; copa; copas; jarra; vasos; platos; tazas | u
uten.bolsa.compra | Bolsa de compra | uten | bolsa compra; bolsa supermercado; bolsa reutilizable; bolsa rafia; bolsa carrito; bolsa tienda | u | | basura residuos congelar
uten.filtro.cafe | Filtros de café | uten | filtro cafe; filtros cafetera; filtro papel cafe | u
uten.termo | Termos y botellas | uten | termo; botella termo; botella reutilizable; cantimplora;  | u
~uten.otros | Menaje de cocina | uten | menaje; utensilio; utensilios; espatula; cucharon; colador; rallador; pelador; abrelatas; sacacorchos; tabla cortar; molde; molde horno; bandeja horno; bandeja | u
# Ropa y calzado
ropa.calcetin | Calcetines | ropa | calcetines; calcetin; medias; pantys; leotardos; calcetin tobillero | u
ropa.ropa.interior | Ropa interior | ropa | calzoncillo; calzoncillos; boxer; braga; bragas; slip; sujetador; bañador; bikini; camiseta interior | u
~ropa.otros | Ropa y calzado | ropa | ropa; camiseta; pantalon; camisa; sudadera; chaqueta; abrigo; vestido; falda; zapato; zapatos; zapatilla; zapatillas; chancla; chanclas; sandalia; sandalias; calzado; pijama; gorro; bufanda; gorra | u
# Muebles y organización (COR-06): muebles de almacenaje, no material de oficina ni ferretería
mue.cajonera | Cajoneras y muebles archivadores | mue | cajonera; cajoneras; archivador movil; archivador cajones; archivador ruedas; mueble archivador; cajonera oficina; archivador cerradura | u
mue.estanteria | Estanterías y librerías | mue | estanteria; estanterias; libreria; librerias; balda; baldas | u
mue.almacenaje | Muebles de almacenaje | mue | mueble almacenaje; zapatero; comoda; armario; mueble auxiliar; mesita noche; cubos almacenaje | u
# Manualidades y creatividad (COR-06): actividades creativas con niños; los juegos educativos siguen siendo juguetes y los colorantes de cocina, comida
man.kit | Kits de manualidades y experimentos | man | kit manualidades; kit experimentos; kit creativo; tubos ensayo; kit ciencia; actividades creativas; manualidades infantiles | u
# Electrónica, jardín y otros
~elec.otros | Electrónica | elec | tecnologia; informatica; ethernet; cable red; cargador; cable; auriculares; usb; pendrive; memoria; adaptador; altavoz; movil; funda movil; protector pantalla; bateria; regleta; alargador; enchufe; ladron | u
jard.tierra | Tierra y abono | jard | tierra; sustrato; abono; fertilizante; turba; compost; mantillo; tierra macetas | k
jard.maceta | Macetas | jard | maceta; macetero; jardinera; maceteros; tiesto | u
jard.semillas | Semillas y plantas | jard | semilla huerto; bulbo; planta; plantas; flor; flores; ramo; ramo flores; orquidea; cactus; suculenta; rosal; geranio | u
jug.juguete | Juguetes | jug | juguete; puzzle; peluche; muñeca; muneca; lego; juego mesa; juego cartas; cartas; baraja; pelota; globo; globos; coche juguete; juego; juegos; rompecabezas; disfraz; slime; peonza | u
ferr.tornillo | Tornillos y ferretería | ferr | tornillo; tornillos; clavo; clavos; brida; bridas; cinta aislante; llave; destornillador; martillo; alicate; taladro; broca; brocha; rodillo; masilla; silicona sellador; cola contacto | u
comb.aceite.motor | Aceite y líquidos del coche | comb | aceite motor; adblue; anticongelante; limpiaparabrisas; liquido frenos; liquido refrigerante; aditivo; gasolina; diesel; gasoil; carburante | l
~otro.otros | Otros artículos | otro | articulo; articulos; varios; surtido; otro; servicio; recarga; llavero | u
`
