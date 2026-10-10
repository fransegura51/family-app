-- PEPA — prompt maestro "Continuidad automática", Bloque B3: formulario de oferta unificado. Añade un
-- nombre opcional a la oferta ("Paquete básico", "Oferta con álbum"...) para distinguir varias ofertas
-- del mismo proveedor de un vistazo, sin depender solo del importe o la fecha. Aditiva, nullable — las
-- ofertas ya existentes se quedan sin nombre (se siguen identificando por proveedor + importe, como hasta
-- ahora) hasta que alguien las edite y le ponga uno.
alter table event_task_group_offers add column name text null check (name is null or char_length(name) <= 200);
