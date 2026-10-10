-- Orden de recuperación de requisitos (Parte B2+B3, prompt maestro consolidado de Eventos) — "contemplar
-- descuentos por conjunto, impuestos" y "extracción correcta de... descuentos, impuestos" al importar un
-- presupuesto. Hasta ahora solo existían como texto libre dentro de notas/condiciones. Aditiva: dos
-- importes informativos sobre la oferta, nunca combinados en "amount" en automático (mismo criterio que
-- el desglose de servicios: se muestran aparte, la familia decide si los suma a mano).
alter table event_task_group_offers add column discount_amount numeric(10, 2) null check (discount_amount is null or discount_amount >= 0);
alter table event_task_group_offers add column tax_amount numeric(10, 2) null check (tax_amount is null or tax_amount >= 0);
