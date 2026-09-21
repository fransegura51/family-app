-- ROLLBACK de la Fase 6C.2C (0150_classify_purchase.sql): retira la función. No toca datos ni el esquema de la 0149.
drop function if exists public.classify_purchase(uuid, uuid, text);
