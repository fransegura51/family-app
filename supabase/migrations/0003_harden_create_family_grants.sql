-- create_family ya comprueba auth.uid() is null internamente, pero además
-- revocamos EXECUTE a anon explícitamente (mínimo privilegio, Skill 27) —
-- solo un usuario ya autenticado debe poder invocarlo.
revoke execute on function public.create_family(text, text) from anon;
