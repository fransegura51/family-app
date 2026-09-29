-- Cola nocturna, Bloque 11 — Presupuesto general de Eventos: "Organízamelo Pepa" (BUDGET_PLAN_TEMPLATES)
-- proponía un importe concreto inventado por cada concepto (p. ej. "Tarta: 40 €"), violando la regla real
-- de que PEPA solo debe proponer CONCEPTOS, nunca precios. El propio modelo (planned_amount NOT NULL
-- DEFAULT 0) no dejaba representar "concepto sin importe todavía" — un campo en blanco se colaba como 0,00 €
-- silencioso en vez de quedar pendiente de rellenar. Cambio aditivo y seguro: solo se relaja la restricción,
-- ninguna fila existente cambia de valor (todas ya tenían un número, nunca NULL).
alter table event_budget_items alter column planned_amount drop not null;
