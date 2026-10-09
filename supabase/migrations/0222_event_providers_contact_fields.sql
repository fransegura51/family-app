-- Revisión Proveedores (Parte B, Fase 5) — "📇 Proveedores" solo tenía nombre, tipo y una nota libre de
-- contacto ("Teléfono, email..." en un único campo de texto). Petición real: una ficha algo más completa
-- (persona de contacto, teléfono, email, web, dirección) sin perder la nota libre que ya existía ni
-- obligar a rellenar nada — todos los campos nuevos son opcionales, el flujo rápido de siempre
-- (nombre + tipo) sigue funcionando igual.
--
-- "archived" (petición real: "no destruir un proveedor enlazado a un pago/encargo, archivarlo") permite
-- retirar un proveedor de las listas de "elegir proveedor" sin borrarlo ni perder el histórico de pagos y
-- encargos que lo referencian — por defecto false, nada cambia para los proveedores ya existentes.
alter table event_providers
  add column contact_person text null,
  add column phone text null,
  add column email text null,
  add column website text null,
  add column address text null,
  add column archived boolean not null default false;

-- Sin cambios de RLS: la política de event_providers (migración 0106) ya es `for all` sin condiciones
-- por columna, cubre las columnas nuevas sin tocarla.
