-- PEPA Eventos — prompt maestro, Fase 7 (Parte C2): trazabilidad oferta → encargo. Al resolver/contratar
-- un encargo a partir de una oferta concreta (OffersComparison → "Usar esta oferta al resolver"), se
-- guarda de qué oferta viene, además del proveedor/precio que ya se guardaban (0215) — aditivo, nunca
-- cambia el significado de provider_id/payment_id ya existentes. Mismo patrón exacto que esas dos
-- columnas: event_task_groups refleja solo la resolución MÁS RECIENTE, event_task_group_resolutions
-- guarda el histórico completo (append-only, migración 0220).
alter table event_task_groups add column offer_id uuid null references event_task_group_offers(id) on delete set null;
alter table event_task_group_resolutions add column offer_id uuid null references event_task_group_offers(id) on delete set null;
