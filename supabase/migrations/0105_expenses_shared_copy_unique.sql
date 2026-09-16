-- Fallo real encontrado en vivo: tocar tres veces seguidas "🤝
-- Compartir a Común" del mismo gasto creó tres copias idénticas en
-- Común, sin avisar de que ya se había compartido — el cliente
-- comprobaba si ya existía una copia mirando el propio estado ya
-- cargado (expenses.some(...)), que todavía no se había refrescado
-- entre un toque y el siguiente. Un índice único a nivel de base de
-- datos es la única forma de que esto no pueda pasar de verdad, pase
-- lo que pase en el cliente (dos pestañas, red lenta, lo que sea):
-- como mucho una copia compartida por gasto original.

-- Limpieza puntual de las copias duplicadas ya creadas por el fallo
-- (confirmado en vivo: un mismo gasto con 3 copias idénticas) — se
-- queda solo una por gasto original, para poder crear el índice.
delete from expenses a
using expenses b
where a.shared_from_expense_id is not null
  and a.shared_from_expense_id = b.shared_from_expense_id
  and a.ctid > b.ctid;

create unique index expenses_shared_from_expense_id_unique
  on expenses (shared_from_expense_id)
  where shared_from_expense_id is not null;
