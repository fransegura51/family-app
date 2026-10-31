# Reparación compra Mercadona 03/10/2026 (31/10/2026)

Compra: `receipts.id = a640a41e-93f8-4b70-848f-72b4ac0e68d3` (familia 011429a4-…, total 129,25 €, gasto `4c0dc08d-71cd-4220-8026-f1f141a14ee7`).

## Causa
Dos líneas «RESERVA LONCHAS» (vendidas por peso, 25,00 €/kg) se guardaron en `product_prices` como 25,00 € × 1 ud. El ticket imprime 25,00 en «P. Unit» (es €/kg) y el importe real en la última columna (6,35 € y 6,20 €), sin línea de peso.
2 × 25,00 − (6,35 + 6,20) = 37,45 € de sobra. Suma guardada 166,70 € − 37,45 € = 129,25 €.

## Estado original (para revertir)
| id | producto | price | quantity | unit |
|---|---|---|---|---|
| 1bbbcd0b-5a19-481c-a1fd-af1aabfbdb0f | RESERVA LONCHAS | 25.00 | 1 | ud |
| b0bc7259-0230-4ba1-ab0c-5568833e5a37 | RESERVA LONCHAS | 25.00 | 1 | ud |

## Corrección aplicada
`price` = 25.00 (€/kg, igual que PEPINO y MANZ. ROJA DULCE), `unit` = kg, `quantity` = importe / 25:
- 1bbbcd0b…: 0.254 kg → 6,35 €
- b0bc7259…: 0.248 kg → 6,20 €

## Revertir
```sql
update product_prices set quantity='1', unit='ud' where id in ('1bbbcd0b-5a19-481c-a1fd-af1aabfbdb0f','b0bc7259-0230-4ba1-ab0c-5568833e5a37');
```
