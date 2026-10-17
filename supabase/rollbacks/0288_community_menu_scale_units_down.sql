-- Deshacer 0288: vuelve al escalado de 0278 (solo g/kg, ml/cl/l, unidades, cucharadas y cucharaditas).
create or replace function private.community_menu_scale(p_quantity text, p_unit text, p_from numeric, p_to numeric)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_q text := replace(btrim(coalesce(p_quantity, '')), ',', '.');
  v_u text := lower(btrim(coalesce(p_unit, '')));
  v_family text;
  v_label text;
  v_val numeric;
  v_text text;
  v_unit text;
begin
  if p_from is null or p_from <= 0 or p_to is null or p_to <= 0 or p_from = p_to or v_q !~ '^\d+(\.\d+)?$' then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_val := v_q::numeric;
  if v_val <= 0 then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_family := case v_u
    when 'g' then 'masa' when 'gr' then 'masa' when 'kg' then 'masa'
    when 'ml' then 'volumen' when 'cl' then 'volumen' when 'l' then 'volumen' when 'lt' then 'volumen' when 'litro' then 'volumen' when 'litros' then 'volumen'
    when 'unidad' then 'conteo' when 'unidades' then 'conteo' when 'ud' then 'conteo' when 'uds' then 'conteo'
    when 'cucharada' then 'cucharada' when 'cucharadas' then 'cucharada' when 'cda' then 'cucharada' when 'cdas' then 'cucharada'
    when 'cucharadita' then 'cucharadita' when 'cucharaditas' then 'cucharadita' when 'cdta' then 'cucharadita' when 'cdtas' then 'cucharadita'
    else null end;
  if v_family is null then
    return jsonb_build_object('quantity', p_quantity, 'unit', p_unit);
  end if;
  v_val := v_val * p_to / p_from;
  v_label := case v_u
    when 'g' then 'g' when 'gr' then 'g' when 'kg' then 'kg'
    when 'ml' then 'ml' when 'cl' then 'cl' else 'l' end;
  v_unit := case v_family
    when 'conteo' then case when v_val = 1 then 'unidad' else 'unidades' end
    when 'cucharada' then case when v_val = 1 then 'cucharada' else 'cucharadas' end
    when 'cucharadita' then case when v_val = 1 then 'cucharadita' else 'cucharaditas' end
    else v_label end;
  v_text := round(v_val, 2)::text;
  if v_text like '%.%' then
    v_text := rtrim(rtrim(v_text, '0'), '.');
  end if;
  return jsonb_build_object('quantity', v_text, 'unit', v_unit);
end;
$$;
revoke execute on function private.community_menu_scale(text, text, numeric, numeric) from public, anon, authenticated;
