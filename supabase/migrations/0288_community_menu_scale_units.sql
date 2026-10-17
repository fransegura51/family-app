-- Escalado de cantidades al importar un menú de Comunidad a la Cocina: mismas unidades y reglas que la compra (src/domain/recipeScaling.ts).
--
-- Antes solo se escalaban g/kg, ml/cl/l, unidades, cucharadas y cucharaditas. Ahora también: lonchas, rebanadas, dientes (de ajo), hojas, rodajas, filetes, lomos, muslos y huevos,
-- en singular, plural y con abreviaturas («ud.», «cdas.») o complemento («dientes de ajo»); una cantidad numérica SIN unidad («2» huevos) se trata como unidades enteras; y se
-- entienden fracciones («1/2», «1 1/2», «½»). La pizca no se escala (es un toque de condimento). Lo que no se entiende se deja EXACTAMENTE como estaba.
-- La receta oficial de Comunidad no se modifica: esto solo calcula la copia que se guarda en la Cocina de la familia.
-- Deshacer: supabase/rollbacks/0288_community_menu_scale_units_down.sql.
create or replace function private.community_menu_scale(p_quantity text, p_unit text, p_from numeric, p_to numeric)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_raw text := btrim(coalesce(p_quantity, ''));
  v_q text := replace(v_raw, ',', '.');
  v_u text := regexp_replace(lower(btrim(coalesce(p_unit, ''))), '\.+$', '');
  v_family text;
  v_label text;
  v_val numeric;
  v_text text;
  v_unit text;
  m text[];
begin
  if p_from is null or p_from <= 0 or p_to is null or p_to <= 0 or p_from = p_to then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  -- Número: decimal, fracción («1/2», «1 1/2») o fracción escrita con un solo carácter («½», «1½»).
  if v_q ~ '^\d+(\.\d+)?$' then
    v_val := v_q::numeric;
  elsif v_q ~ '^(\d+\s+)?\d+/\d+$' then
    m := regexp_match(v_q, '^(?:(\d+)\s+)?(\d+)/(\d+)$');
    if m[3]::numeric = 0 then
      return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
    end if;
    v_val := coalesce(m[1]::numeric, 0) + m[2]::numeric / m[3]::numeric;
  elsif v_q ~ '^(\d+)?\s*[½¼¾⅓⅔]$' then
    m := regexp_match(v_q, '^(\d+)?\s*([½¼¾⅓⅔])$');
    v_val := coalesce(m[1]::numeric, 0) + case m[2] when '½' then 0.5 when '¼' then 0.25 when '¾' then 0.75 when '⅓' then 1.0 / 3 else 2.0 / 3 end;
  else
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  if v_val <= 0 then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  -- «dientes de ajo» → «dientes», «lonchas de queso» → «lonchas».
  if v_u like '% de %' then
    v_u := split_part(v_u, ' de ', 1);
  end if;
  v_family := case v_u
    when 'g' then 'masa' when 'gr' then 'masa' when 'kg' then 'masa'
    when 'ml' then 'volumen' when 'cl' then 'volumen' when 'l' then 'volumen' when 'lt' then 'volumen' when 'litro' then 'volumen' when 'litros' then 'volumen'
    when 'unidad' then 'conteo' when 'unidades' then 'conteo' when 'ud' then 'conteo' when 'uds' then 'conteo' when 'huevo' then 'conteo' when 'huevos' then 'conteo'
    when '' then 'sinunidad'
    when 'cucharada' then 'cucharada' when 'cucharadas' then 'cucharada' when 'cda' then 'cucharada' when 'cdas' then 'cucharada'
    when 'cucharadita' then 'cucharadita' when 'cucharaditas' then 'cucharadita' when 'cdta' then 'cucharadita' when 'cdtas' then 'cucharadita'
    when 'loncha' then 'loncha' when 'lonchas' then 'loncha'
    when 'rebanada' then 'rebanada' when 'rebanadas' then 'rebanada'
    when 'diente' then 'diente' when 'dientes' then 'diente'
    when 'hoja' then 'hoja' when 'hojas' then 'hoja'
    when 'rodaja' then 'rodaja' when 'rodajas' then 'rodaja'
    when 'filete' then 'filete' when 'filetes' then 'filete'
    when 'lomo' then 'lomo' when 'lomos' then 'lomo'
    when 'muslo' then 'muslo' when 'muslos' then 'muslo'
    else null end;
  -- Unidad que no se entiende (y la pizca): se deja tal cual.
  if v_family is null then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_val := v_val * p_to / p_from;
  v_label := case v_u
    when 'g' then 'g' when 'gr' then 'g' when 'kg' then 'kg'
    when 'ml' then 'ml' when 'cl' then 'cl' else 'l' end;
  v_unit := case v_family
    when 'masa' then v_label
    when 'volumen' then v_label
    when 'sinunidad' then ''
    when 'conteo' then case when v_val = 1 then 'unidad' else 'unidades' end
    else case when v_val = 1 then v_family else v_family || 's' end
  end;
  v_text := round(v_val, 2)::text;
  if v_text like '%.%' then
    v_text := rtrim(rtrim(v_text, '0'), '.');
  end if;
  return jsonb_build_object('quantity', v_text, 'unit', v_unit);
end;
$$;
revoke execute on function private.community_menu_scale(text, text, numeric, numeric) from public, anon, authenticated;
