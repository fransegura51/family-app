-- Amplía el catálogo global de cadenas (Fase 3 de 0142) con las cadenas principales españolas que
-- todavía faltaban para que el selector de tiendas de Compras (0182) tenga una base útil desde el
-- primer día, sin obligar a cada familia a escribirlas a mano: Carrefour, Eroski, Dia, Alcampo, El Corte
-- Inglés e Hipercor.
--
-- DIFERENCIA IMPORTANTE con la semilla de 0142: aquella solo añadía cadenas con evidencia real auditada
-- en tickets/banco de una familia (para interpretar texto de compra). Esta migración tiene un propósito
-- distinto — completar el CATÁLOGO del selector de tiendas — así que estas filas se añaden por nombre
-- oficial conocido, sin evidencia de ticket todavía: learnable queda a false en todas (igual que ya
-- hace 0142 con Consum/Aldi/Lidl, "sin tickets con productos en los datos"), para que el aprendizaje
-- compartido de clasificación de producto siga exigiendo evidencia real antes de activarse.
--
-- Puramente aditiva: ninguna fila existente (mercadona, hiperber, charter, consum, aldi, lidl, repsol,
-- amazon, macro_asia, es_poligono_las_maromas) se toca. No afecta a las tiendas ya creadas a mano por
-- ninguna familia (shopping_stores no se modifica) — vincularlas sigue siendo una elección explícita del
-- usuario en StoreManager, nunca automática.
--
-- EL CORTE INGLÉS / HIPERCOR: mismo criterio que Charter/Consum, ya documentado en 0142 ("cadena
-- PROPIA: su clave nunca se funde con [la cadena del grupo]") — son marcas, webs (elcorteingles.es vs
-- hipercor.es) y formatos de tienda distintos dentro del mismo grupo empresarial, así que se modelan
-- como DOS cadenas independientes, cada una con su propio alias, nunca una sola con la otra como alias.
--
-- ROLLBACK: supabase/rollbacks/0183_store_chains_catalog_expansion_down.sql

insert into public.store_chains (key, name, kind, learnable, notes) values
  ('carrefour', 'Carrefour', 'supermarket', false, 'Cadena del catálogo base — sin evidencia de ticket auditada todavía.'),
  ('eroski', 'Eroski', 'supermarket', false, 'Cadena del catálogo base — sin evidencia de ticket auditada todavía.'),
  ('dia', 'Dia', 'supermarket', false, 'Cadena del catálogo base — sin evidencia de ticket auditada todavía.'),
  ('alcampo', 'Alcampo', 'supermarket', false, 'Cadena del catálogo base — sin evidencia de ticket auditada todavía.'),
  ('el_corte_ingles', 'El Corte Inglés', 'supermarket', false,
   'Cadena del catálogo base — sin evidencia de ticket auditada todavía. Cadena PROPIA, nunca se funde con Hipercor (mismo grupo, marca y formato de tienda distintos).'),
  ('hipercor', 'Hipercor', 'supermarket', false,
   'Cadena del catálogo base — sin evidencia de ticket auditada todavía. Cadena PROPIA, nunca se funde con El Corte Inglés (mismo grupo, marca y formato de tienda distintos).');

-- "Dia" se queda sin alias propio a propósito: store_chain_aliases exige length(alias_norm) >= 4 (0142)
-- y el nombre normalizado de la cadena ("dia") solo tiene 3 — no hay ningún texto real auditado más
-- largo que se pueda usar en su lugar sin inventarlo. La cadena sigue apareciendo igual en el catálogo
-- del selector; lo único que no funciona para ella es la sugerencia automática de vínculo con una tienda
-- ya creada a mano con ese mismo nombre (StoreManager ofrecería crearla aparte en ese caso concreto).
insert into public.store_chain_aliases (chain_key, alias_norm, match_mode, evidence) values
  ('carrefour', 'carrefour', 'exact', 'nombre oficial de la cadena — catálogo base, sin evidencia de ticket/banco auditada todavía'),
  ('eroski', 'eroski', 'exact', 'nombre oficial de la cadena — catálogo base, sin evidencia de ticket/banco auditada todavía'),
  ('alcampo', 'alcampo', 'exact', 'nombre oficial de la cadena — catálogo base, sin evidencia de ticket/banco auditada todavía'),
  ('el_corte_ingles', 'el corte ingles', 'exact', 'nombre oficial de la cadena (normalizado, sin tilde) — catálogo base, sin evidencia de ticket/banco auditada todavía'),
  ('hipercor', 'hipercor', 'exact', 'nombre oficial de la cadena — catálogo base, sin evidencia de ticket/banco auditada todavía');
