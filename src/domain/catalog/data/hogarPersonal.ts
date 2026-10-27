// CATÁLOGO MAESTRO — limpieza y mantenimiento del hogar, higiene y cuidado personal, farmacia y salud.
// clave | Nombre | clase | alias; alias | base (k/l/u) | atributos | no
export const HOGAR_PERSONAL = `
# Lavandería
limp.detergente.liquido | Detergente líquido | limp | detergente gel; gel lavadora; detergente liquido ropa; detergente ropa liquido | l | bio
limp.detergente.polvo | Detergente en polvo | limp | detergente polvo; detergente ropa polvo | k
limp.detergente.capsulas | Detergente en cápsulas | limp | detergente capsula; capsula lavadora; capsula detergente; bola detergente; detergente monodosis; pastilla lavadora | u
~limp.detergente | Detergente | limp | detergente; detergente ropa; detergente lavadora; detergente maquina | l
limp.suavizante | Suavizante | limp | suavizante ropa; suavizante concentrado | l
limp.quitamanchas | Quitamanchas | limp | quitamanchas ropa; quitamanchas oxigeno; vanish; oxi ropa | l
limp.lejia | Lejía | limp | lejia ropa; lejia lavadora; lejia hogar; lejia pino | l
limp.almidon | Apresto y almidón | limp | almidon; apresto; planchado spray; spray planchar | l
# Cocina
limp.lavavajillas.mano | Lavavajillas a mano | limp | lavavajilla mano; lavavajilla liquido; lavaplatos mano; fregaplatos; lavavajilla concentrado | l
limp.lavavajillas.pastilla | Lavavajillas en pastillas | limp | pastilla lavavajilla; capsula lavavajilla; lavavajilla pastilla; lavavajilla capsula; lavavajilla tabs; lavavajilla all in 1; lavaplatos pastilla; lavavajilla todo en 1 | u
limp.lavavajillas.sal | Sal para lavavajillas | limp | sal lavavajilla; sal lavaplatos | k
limp.abrillantador | Abrillantador | limp | abrillantador lavavajilla; abrillantador lavaplatos | l
~limp.lavavajillas | Lavavajillas | limp | lavavajilla; lavaplatos | l
limp.quitagrasas | Quitagrasas | limp | desengrasante; limpiador cocina; limpiacocinas; limpia cocina; quitagrasas cocina | l
limp.vitroceramica | Limpiador de vitrocerámica | limp | limpiador vitroceramica; vitroceramica; vitroclen; limpia vitro | l
limp.horno | Limpiador de horno | limp | limpiahornos; limpia horno; limpiador horno | l
limp.antical | Antical | limp | quitacal; anticalcareo; descalcificador; antical lavadora | l
# Superficies y baño
limp.multiusos | Limpiador multiusos | limp | multiusos; limpiador multiusos; limpiador universal; limpiador general; limpiador hogar | l
limp.suelos | Limpiador de suelos | limp | fregasuelos; friegasuelos; limpia suelos; limpiador suelo; limpiador parquet; suelos | l
limp.cristales | Limpiacristales | limp | limpia cristales; limpiador cristales; limpiador espejos; cristales | l
limp.bano | Limpiador de baño | limp | limpiabanos; limpia bano; limpiador bano; limpiador sanitarios; limpia sanitario | l
limp.inodoro | Limpiador de inodoro | limp | limpia inodoro; limpiador wc; pastilla wc; limpiawc; wc gel; gel wc; bloque wc; wc | l
limp.desinfectante | Desinfectante | limp | desinfectante hogar; spray desinfectante; desinfectante superficies; desinfectante multiusos | l
limp.ambientador | Ambientador | limp | ambientador spray; ambientador coche; ambientador enchufable; ambientador aerosol; ambientador recambio; ambientador automatico; ambientador gel | u
limp.insecticida | Insecticida | limp | matamoscas; antimosquitos; mosquitos; insecticida hormigas; insecticida cucarachas; raid; insecticida spray; mosquitos enchufable; insecticida enchufable; repelente insectos | u
limp.desatascador | Desatascador | limp | desatascador tuberias; desatascador liquido | l
limp.amoniaco | Amoniaco | limp | | l
# Utensilios de limpieza
limp.bayeta | Bayetas | limp | bayeta; panos cocina; paño; panos microfibra; trapo; paño microfibra; bayeta microfibra | u
limp.estropajo | Estropajos | limp | estropajo; estropajo acero; estropajo fibra; esponja cocina; esponja; esponja fregar | u
limp.fregona | Fregona | limp | fregona recambio; mopa; recambio fregona; mopa recambio; cubo fregona | u
limp.escoba | Escoba y recogedor | limp | escoba; recogedor; cepillo barrer; cepillo suelo | u
limp.guantes | Guantes de limpieza | limp | guante; guante latex; guante nitrilo; guante goma; guantes desechables; guante vinilo | u
# Papel y bolsas
limp.papel.higienico | Papel higiénico | limp | higienico; papel wc; papel higienico rollos; rollos higienico | u | | cocina
limp.papel.cocina | Papel de cocina | limp | rollo cocina; papel absorbente; absorbente cocina; papel cocina rollos; papel secamanos | u
limp.servilleta | Servilletas | limp | servilleta; servilleta papel; servilletas papel | u
limp.panuelo | Pañuelos de papel | limp | panuelo; panuelos papel; panuelos desechables; panuelo papel; pañuelos; pañuelo | u
limp.papel.aluminio | Papel de aluminio | limp | aluminio; papel aluminio; aluminio cocina | u
limp.film | Film transparente | limp | film; papel film; film alimentario; film cocina; film transparente | u
limp.papel.horno | Papel de horno | limp | papel vegetal; papel sulfurizado; papel hornear | u
limp.bolsa.basura | Bolsas de basura | limp | basura; residuos; bolsa residuos; bolsas basura | u
limp.bolsa.congelar | Bolsas para congelar | limp | bolsa congelar; bolsa zip; bolsa conservar; congelar | u
# Otros del hogar
hogar.pila | Pilas | elec | pila; pila alcalina; pila boton; bateria boton; pila recargable; pilas aaa; pilas aa | u
hogar.bombilla | Bombillas | elec | bombilla; bombilla led; led; lampara led; foco led; tira led | u
hogar.vela | Velas | otro | vela; vela aromatica; velas; cerilla; cerillas; mechero; encendedor | u
hogar.carbon | Carbón y encendido | otro | carbon; carbon vegetal; pastillas encendido; encendedor barbacoa; lena; leña; briquetas | k
# Higiene personal
cui.champu | Champú | cui | champu | l | | bebe infantil perro gato
cui.acondicionador | Acondicionador | cui | suavizante pelo; balsamo pelo | l
cui.mascarilla.pelo | Mascarilla capilar | cui | mascarilla pelo; mascarilla cabello | l
cui.gel.ducha | Gel de ducha | cui | gel bano; gel ducha; jabon ducha; gel ducha hidratante; gel corporal | l | | bebe infantil
cui.jabon.manos | Jabón de manos | cui | jabon liquido; jabon manos; dosificador jabon; jabon liquido manos; recambio jabon; jabon manos liquido | l
cui.jabon.pastilla | Jabón en pastilla | cui | pastilla jabon; jabon barra; jabon glicerina; jabon pastillas | u
cui.desodorante | Desodorante | cui | desodorante spray; desodorante roll on; antitranspirante; desodorante barra; desodorante crema; roll on | u
cui.colonia | Colonia y perfume | cui | perfume; eau toilette; agua colonia; eau parfum; colonia hombre; colonia mujer; fragancia | l | | bebe infantil
cui.dentifrico | Pasta de dientes | cui | pasta diente; dentifrico; crema dental; pasta dental; gel dental; pasta dentifrico | u
cui.cepillo.dientes | Cepillo de dientes | cui | cepillo dental; cepillo diente; cepillo electrico; recambio cepillo; cabezal cepillo; cepillo manual | u
cui.hilo.dental | Hilo dental | cui | seda dental; interdental; cepillo interdental; palillos dentales; irrigador | u
cui.enjuague | Enjuague bucal | cui | colutorio; enjuague; elixir bucal; enjuague dental; enjuague bucal | l
cui.compresa | Compresas | cui | compresa; compresa noche; compresa alas; compresas higiene | u
cui.tampon | Tampones | cui | tampon; tampones | u
cui.salvaslip | Salvaslips | cui | salvaslip; protegeslip; protector diario; salvaslips | u
cui.copa | Copa menstrual y discos | cui | copa menstrual; braga menstrual; esponja menstrual | u
cui.maquinilla | Maquinillas de afeitar | cui | maquinilla afeitar; maquinilla; cuchilla afeitar; recambio afeitar; cuchillas afeitar; rasuradora; afeitadora; cuchilla; desechable afeitar | u
cui.espuma.afeitar | Espuma de afeitar | cui | espuma afeitar; gel afeitar; crema afeitar; after shave; balsamo afeitar; afeitar | u
cui.crema.corporal | Crema corporal | cui | crema hidratante; crema cuerpo; leche corporal; body milk; locion corporal; crema piel; hidratante corporal; crema corporal hidratante | l | | bebe infantil panal facial manos solar
cui.crema.manos | Crema de manos | cui | crema mano; crema manos hidratante; crema manos pies | u
cui.crema.facial | Crema facial | cui | crema cara; contorno ojos; serum; crema antiarrugas; crema facial hidratante; hidratante facial | u
cui.solar | Protector solar | cui | crema solar; solar; fotoprotector; bronceador; spf; leche solar; spray solar; protector solar spf | l
cui.after.sun | After sun | cui | aftersun; after sun; despues sol; reparador solar | l
cui.bastoncillo | Bastoncillos | cui | bastoncillos algodon; cotonete; bastoncillo algodon | u
cui.algodon | Algodón y discos | cui | algodon; discos algodon; disco algodon; discos desmaquillantes; disco desmaquillante | u
cui.desmaquillante | Desmaquillante | cui | agua micelar; leche limpiadora; toallita desmaquillante; toallitas desmaquillantes; limpiador facial; tonico facial; gel limpiador facial; micelar | l
cui.esmalte | Esmalte de uñas | cui | esmalte; laca unas; pintauñas; pintaunas; esmalte unas | u
cui.quitaesmalte | Quitaesmalte | cui | disolvente unas; quitaesmalte uñas | l
cui.laca | Laca y fijadores | cui | laca pelo; laca cabello; gomina; gel pelo; fijador; espuma pelo; cera pelo; spray fijador | u
cui.tinte | Tinte | cui | coloracion; tinte pelo; tinte cabello; tinte capilar; decolorante | u
cui.labial | Labial y bálsamo labial | cui | pintalabios; balsamo labial; cacao labial; stick labial; labial | u
cui.maquillaje | Maquillaje | cui | base maquillaje; rimel; mascara pestanas; sombra ojos; colorete; polvos compactos; corrector; eyeliner; delineador | u
cui.preservativo | Preservativos | cui | condon; condones; profilactico | u
cui.cortaunas | Cortaúñas y accesorios | cui | cortaunas; pinzas; pinza | u
cui.peine | Peines y cepillos de pelo | cui | cepillo pelo; cepillo cabello; peine; peine cabello; coletero; gomas pelo; horquilla; pasador | u
cui.mascarilla.facial | Mascarilla facial | cui | mascarilla cara; mascarilla facial; mascarilla hidratante; exfoliante facial; exfoliante | u
cui.depilacion | Depilación | cui | cera depilatoria; crema depilatoria; cera frio; depilatoria; cera depilar; bandas depilatorias; depilacion | u
cui.higiene.intima | Higiene íntima | cui | gel intimo; higiene intima; toallita intima; jabon intimo | l
# Farmacia y salud
farm.paracetamol | Paracetamol | farm | paracetamol 1g; paracetamol 500; efferalgan; gelocatil; dolor; analgesico; antitermico | u
farm.ibuprofeno | Ibuprofeno | farm | ibuprofeno 600; ibuprofeno 400; espidifen; dalsy; neobrufen; antiinflamatorio | u
farm.tirita | Tiritas | farm | tirita; apositos; aposito; vendas; venda; gasas; gasa; esparadrapo; botiquin; ampollas; curas | u
farm.termometro | Termómetro | farm | termometro digital; termometro frente; termometro oido | u
farm.gel.hidroalcoholico | Gel hidroalcohólico | farm | gel hidroalcoholico; hidroalcoholico; gel manos desinfectante; gel desinfectante manos | l
farm.mascarilla | Mascarillas | farm | mascarilla ffp2; mascarilla quirurgica; mascarillas; ffp2 | u
farm.vitaminas | Vitaminas y suplementos | farm | vitamina; vitaminas; vitamina c; vitamina d; magnesio; omega 3; hierro; calcio; complemento alimenticio; suplemento; multivitaminico; colageno; probiotico; melatonina; zinc | u
farm.suero | Suero fisiológico | farm | suero fisiologico; suero; fisiologico; suero nasal; agua mar spray; spray nasal; spray garganta | u
farm.antiseptico | Antiséptico y agua oxigenada | farm | agua oxigenada; alcohol sanitario; alcohol 96; alcohol; betadine; povidona; clorhexidina; desinfectante herida; mercromina | l
farm.garganta | Pastillas para la garganta | farm | pastillas garganta; juanola; strepsils; tos pastillas; pastilla tos | u
farm.jarabe | Jarabe y medicamentos | farm | jarabe; jarabe tos; antitusivo; mucolitico; expectorante; antihistaminico; medicamento; pastillas; comprimidos; pomada; crema muscular; voltaren; spray muscular; ungüento; unguento | u
farm.test | Test y pruebas | farm | test embarazo; test covid; test antigenos; autotest; test ovulacion; test | u
farm.repelente | Repelente | farm | repelente; repelente mosquitos; antimosquitos piel; autan; picaduras | u
farm.colirio | Colirio y lentillas | farm | colirio; lagrimas artificiales; gotas ojos; liquido lentillas; lentillas; lentilla | u
`
