// CATÁLOGO MAESTRO — alimentación infantil e higiene y cuidado del bebé.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
// Aquí la ETAPA de la leche y la TALLA del pañal son atributos OBLIGATORIOS: leche infantil etapa 1 ≠ etapa 2, pañal talla 3 ≠ talla 4, pañal ≠ pañal-braguita.
// Un artículo sin ese dato se clasifica bien, pero su identidad queda incompleta: no se agrupa solo.
export const INFANTIL = `
# Alimentación infantil
inf.leche.formula | Leche infantil | inf | leche formula; formula infantil; formula lactante; leche lactante; leche bebe; leche inicio; leche continuacion; leche crecimiento; formula | k | etapa! | liquida brik
inf.leche.formula.liquida | Leche infantil líquida | inf | leche infantil liquida; formula liquida; leche formula liquida | l | etapa!
inf.cereales | Papilla de cereales | inf | cereal infantil; cereal bebe; papilla; papilla cereal; cereales bebe; cereales papilla | k | gluten
inf.potito | Potito | inf | tarrito; tarro infantil; menu infantil; potito bebe | u
inf.bolsita | Bolsita de fruta | inf | pouch; bolsita fruta; bolsita infantil; bolsita compota; compota; squeezy | u
inf.snack | Snack infantil | inf | snack bebe; snack infantil; melts; rosquilla bebe | u
inf.yogur | Yogur infantil | inf | yogur bebe; yogur infantil; petit infantil | u
inf.zumo | Zumo infantil | inf | zumo bebe; zumo infantil | l
~inf.otros | Alimentación infantil | inf | alimentacion infantil; alimento infantil; alimento bebe; papilla fruta; infusion bebe | u
# Higiene y cuidado del bebé
beb.panal | Pañales | beb | panal bebe; panal infantil; braguita; bragapanal; pants; panal recien nacido | u | tipoPanal, talla! | toallita crema bano
beb.panal.bano | Pañales de baño | beb | panal bano; panal piscina; panal agua | u
beb.toallita | Toallitas húmedas | beb | toallita; toallita bebe; toallita humeda; toallita sensible | u | | desmaquillante
beb.crema.panal | Crema para el pañal | beb | crema panal; pasta agua; crema culito | k
beb.colonia | Colonia infantil | beb | colonia bebe; colonia infantil; agua colonia bebe | l
beb.gel | Gel de baño infantil | beb | gel bebe; gel bano bebe; gel infantil | l
beb.champu | Champú infantil | beb | champu bebe; champu infantil | l
beb.gel.champu | Gel y champú infantil | beb | gel champu bebe; gel champu infantil | l
beb.aceite | Aceite corporal de bebé | beb | aceite bebe; aceite infantil | l
beb.chupete | Chupete | beb | | u
beb.biberon | Biberón | beb | tetina; biberones | u
beb.lactancia | Discos y protectores de lactancia | beb | disco lactancia; protector lactancia; conchas lactancia | u
beb.empapador | Empapadores | beb | cambiador; empapador bebe | u
~beb.otros | Cuidado del bebé | beb | bebe; articulo bebe; puericultura; babero; sonajero | u
`
