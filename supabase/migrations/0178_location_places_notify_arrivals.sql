-- Petición real: "lo quiero así" (como Google Maps) — avisar cuando alguien
-- llega o se va de un lugar guardado, sin tener que crear una regla a mano
-- en "Reglas" (eso ya existía, pero pedía escribir el mensaje y elegir el
-- disparador uno por uno). Columna aparte, no una regla: el interruptor en
-- el propio lugar es la fuente de la verdad ("¿está encendido o no?"); por
-- dentro sigue usando el mismo motor de automation_rules de siempre (ver
-- src/ui/AutomationWatcher.tsx), solo que las dos reglas (llegada/salida)
-- las crea y borra el propio código al tocar el interruptor.
alter table location_places add column notify_arrivals boolean not null default false;

-- La política "location_places: family crud" (migración 0010) ya cubre
-- todas las columnas (es a nivel de fila, no de columna) — igual que se
-- confirmó en la 0175 al añadir "category". No hace falta ninguna política
-- nueva.
