-- 0353 · Registro de la función con IA «Importar participantes desde foto o PDF» (Gestión de grupos) en el Centro de IA existente (0335).
-- No crea tablas ni cambia permisos: solo da de alta la función para que el interruptor global, los topes y el registro de uso la gobiernen igual que a las demás.
insert into public.ai_function (purpose, label, module, description, origin, needs, sort) values
  ('analyze-participants-document', 'Importar participantes desde foto o PDF', 'otros', 'Convierte la foto o el PDF de una lista de clase o de equipo en fichas de participantes (nombre, madre/padre, teléfono).', 'family', '{global}', 30)
on conflict (purpose) do nothing;
