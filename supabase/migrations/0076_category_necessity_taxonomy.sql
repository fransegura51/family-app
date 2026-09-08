-- Skill de Pepa, puntos 9/15/16 — petición real: "la adjudicación de
-- Quiero/Necesito/Debo y la de Fijo/Variable no debería ser manual
-- sino automática según estándares contables habituales... clasificar
-- cada categoría desde un principio (editable después)". La
-- clasificación pasa de expenses (por movimiento — nunca llegó a
-- usarse: 0 filas con datos) a budget_categories (por categoría),
-- automática de fábrica y editable por la familia.
alter table budget_categories add column necessity text check (necessity in ('debo', 'necesito', 'quiero'));
alter table budget_categories add column is_fixed boolean;

alter table expenses drop column necessity;
alter table expenses drop column is_fixed;

-- Taxonomía maestra del documento (punto 9): 11 categorías de gasto
-- con sus subcategorías (Ingresos ya tiene su propia semilla, en el
-- cliente, y no aplica fijo/variable ni debo/necesito/quiero).
-- Clasificación según estándares contables habituales: debo =
-- obligación contractual o legal; necesito = consumo básico; quiero =
-- discrecional. fijo = importe recurrente pactado; variable = fluctúa
-- con el consumo. Ahorro/Movimientos internos/Otros quedan sin
-- necessity (no son gasto real, o Pepa no puede saberlo sin inventar).
-- Se siembra para cada familia que todavía no tenga una categoría con
-- ese nombre exacto en budget_group 'generales', para no duplicar lo
-- que la familia ya se haya creado a mano.
do $$
declare
  fam record;
  new_parent_id uuid;
  cat jsonb;
  sub jsonb;
  taxonomy jsonb := '[
    {"name":"Alimentación","icon":"🛒","necessity":"necesito","is_fixed":false,"children":[
      {"name":"Supermercado, carnicería y tiendas de alimentación","icon":"🛒","necessity":"necesito","is_fixed":false},
      {"name":"Restaurantes, bares y cafeterías","icon":"🍽️","necessity":"quiero","is_fixed":false}
    ]},
    {"name":"Vivienda y hogar","icon":"🏠","necessity":"necesito","is_fixed":true,"children":[
      {"name":"Alquiler / hipoteca","icon":"🏦","necessity":"debo","is_fixed":true},
      {"name":"Suministros","icon":"💡","necessity":"necesito","is_fixed":true},
      {"name":"Mantenimiento y hogar","icon":"🔨","necessity":"necesito","is_fixed":false},
      {"name":"Seguro de hogar","icon":"🛡️","necessity":"debo","is_fixed":true}
    ]},
    {"name":"Transporte y vehículo","icon":"🚗","necessity":"necesito","is_fixed":false,"children":[
      {"name":"Combustible","icon":"⛽","necessity":"necesito","is_fixed":false},
      {"name":"Aparcamiento y peajes","icon":"🅿️","necessity":"necesito","is_fixed":false},
      {"name":"Transporte público / taxi","icon":"🚕","necessity":"necesito","is_fixed":false},
      {"name":"Mantenimiento y reparaciones","icon":"🔧","necessity":"necesito","is_fixed":false},
      {"name":"Seguro / financiación del vehículo","icon":"🚙","necessity":"debo","is_fixed":true}
    ]},
    {"name":"Compras y familia","icon":"🛍️","necessity":"quiero","is_fixed":false,"children":[
      {"name":"Ropa y accesorios","icon":"👕","necessity":"necesito","is_fixed":false},
      {"name":"Niños","icon":"🧸","necessity":"necesito","is_fixed":false},
      {"name":"Casa y jardín","icon":"🏡","necessity":"quiero","is_fixed":false},
      {"name":"Tecnología y electrónica","icon":"📺","necessity":"quiero","is_fixed":false},
      {"name":"Mascotas","icon":"🐾","necessity":"necesito","is_fixed":false},
      {"name":"Regalos y compras varias","icon":"🎁","necessity":"quiero","is_fixed":false}
    ]},
    {"name":"Salud y bienestar","icon":"⚕️","necessity":"necesito","is_fixed":false,"children":[
      {"name":"Salud y farmacia","icon":"💊","necessity":"necesito","is_fixed":false},
      {"name":"Belleza y cuidado personal","icon":"💅","necessity":"quiero","is_fixed":false},
      {"name":"Deporte y fitness","icon":"🏋️","necessity":"quiero","is_fixed":false}
    ]},
    {"name":"Ocio y viajes","icon":"🌴","necessity":"quiero","is_fixed":false,"children":[
      {"name":"Ocio y cultura","icon":"🎭","necessity":"quiero","is_fixed":false},
      {"name":"Aficiones","icon":"🎨","necessity":"quiero","is_fixed":false},
      {"name":"Suscripciones y entretenimiento","icon":"🎬","necessity":"quiero","is_fixed":true},
      {"name":"Viajes y vacaciones","icon":"✈️","necessity":"quiero","is_fixed":false},
      {"name":"Eventos y celebraciones","icon":"🎉","necessity":"quiero","is_fixed":false}
    ]},
    {"name":"Comunicaciones y servicios","icon":"📱","necessity":"necesito","is_fixed":true,"children":[
      {"name":"Teléfono e Internet","icon":"📶","necessity":"necesito","is_fixed":true},
      {"name":"Software y aplicaciones","icon":"💻","necessity":"quiero","is_fixed":true},
      {"name":"Otros servicios","icon":"🔌","necessity":"necesito","is_fixed":false}
    ]},
    {"name":"Finanzas y obligaciones","icon":"📑","necessity":"debo","is_fixed":true,"children":[
      {"name":"Impuestos","icon":"🧾","necessity":"debo","is_fixed":true},
      {"name":"Préstamos e intereses","icon":"💳","necessity":"debo","is_fixed":true},
      {"name":"Seguros","icon":"🔒","necessity":"debo","is_fixed":true},
      {"name":"Comisiones y cargos","icon":"💸","necessity":"debo","is_fixed":false},
      {"name":"Multas / obligaciones","icon":"🚨","necessity":"debo","is_fixed":false},
      {"name":"Asesoría","icon":"🧑‍💼","necessity":"debo","is_fixed":false}
    ]},
    {"name":"Ahorro e inversión","icon":"💰","necessity":null,"is_fixed":null,"children":[
      {"name":"Ahorro","icon":"🐷","necessity":null,"is_fixed":true},
      {"name":"Inversiones","icon":"📈","necessity":null,"is_fixed":false}
    ]},
    {"name":"Movimientos internos","icon":"🔄","necessity":null,"is_fixed":null,"children":[
      {"name":"Transferencias entre cuentas propias","icon":"🔁","necessity":null,"is_fixed":null}
    ]},
    {"name":"Otros","icon":"📦","necessity":null,"is_fixed":null}
  ]';
begin
  for fam in select id from families loop
    for cat in select * from jsonb_array_elements(taxonomy) loop
      select id into new_parent_id from budget_categories
        where family_id = fam.id and budget_group = 'generales' and parent_id is null
          and lower(name) = lower(cat->>'name');

      if new_parent_id is null then
        insert into budget_categories (family_id, name, icon, budget_group, sort_order, necessity, is_fixed)
        values (
          fam.id, cat->>'name', cat->>'icon', 'generales', (extract(epoch from now()) * 1000)::bigint,
          cat->>'necessity', (cat->>'is_fixed')::boolean
        )
        returning id into new_parent_id;
      end if;

      if cat ? 'children' then
        for sub in select * from jsonb_array_elements(cat->'children') loop
          if not exists (
            select 1 from budget_categories
            where family_id = fam.id and budget_group = 'generales' and lower(name) = lower(sub->>'name')
          ) then
            insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed)
            values (
              fam.id, sub->>'name', sub->>'icon', 'generales', new_parent_id, (extract(epoch from now()) * 1000)::bigint,
              sub->>'necessity', (sub->>'is_fixed')::boolean
            );
          end if;
        end loop;
      end if;
    end loop;
  end loop;
end $$;

-- Categorías que la familia ya se había creado a mano antes de esta
-- taxonomía: se integran bajo el árbol maestro de arriba (mismo
-- nombre, así los gastos ya apuntados con ese nombre no se pierden) en
-- vez de duplicarlas con el nombre "oficial" del documento.
update budget_categories bc set parent_id = p.id, necessity = 'necesito', is_fixed = true
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Vivienda y hogar'
    and bc.budget_group = 'generales' and bc.name in ('Agua', 'Luz');

update budget_categories bc set parent_id = p.id, necessity = 'debo', is_fixed = true
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Vivienda y hogar'
    and bc.budget_group = 'generales' and bc.name = 'Hipoteca';

update budget_categories bc set parent_id = p.id, necessity = 'debo', is_fixed = true
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Finanzas y obligaciones'
    and bc.budget_group = 'generales' and bc.name in ('Impuestos', 'Préstamos');

update budget_categories bc set parent_id = p.id, necessity = 'necesito', is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Transporte y vehículo'
    and bc.budget_group = 'generales' and bc.name in ('Taller', 'Gasolinera');

update budget_categories bc set parent_id = p.id, necessity = 'quiero', is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Alimentación'
    and bc.budget_group = 'generales' and bc.name = 'Restaurantes';

update budget_categories bc set parent_id = p.id, necessity = 'necesito', is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Compras y familia'
    and bc.budget_group = 'generales' and bc.name in ('Ropa y Calzado', 'Niños', 'Gastos escolares');

update budget_categories bc set parent_id = p.id, necessity = 'quiero', is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Compras y familia'
    and bc.budget_group = 'generales' and bc.name in ('Casa y Jardin', 'Electronica');

update budget_categories bc set parent_id = p.id, necessity = 'necesito', is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Salud y bienestar'
    and bc.budget_group = 'generales' and bc.name = 'Farmacia';

-- "Imprevistos" y "Amazon" (esta última es una tienda, no un tipo de
-- gasto — se compra de todo) no tienen una clasificación real sin
-- inventarla: se agrupan en Otros y se dejan sin necessity.
update budget_categories bc set parent_id = p.id, is_fixed = false
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Otros'
    and bc.budget_group = 'generales' and bc.name = 'Imprevistos';

update budget_categories bc set parent_id = p.id
  from budget_categories p
  where p.family_id = bc.family_id and p.budget_group = 'generales' and p.parent_id is null and p.name = 'Otros'
    and bc.budget_group = 'generales' and bc.name = 'Amazon';
