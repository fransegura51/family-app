# Pruebas locales del SQL de cuentas, vínculos e invitaciones

PostgreSQL en memoria (PGlite): no toca Supabase ni ningún dato real. Monta un esquema mínimo y ejecuta las migraciones **reales** 0292–0295 (y parte de la puerta actual, 0286/0093/0032).

```
cd supabase/local-sql-tests
npm install
npm test
```

Cubre: PIN y correos (0292), vínculo «Es mi hijo/a» (0293), invitaciones, rol y secciones de la ficha, reserva por correo y crear familia (0294), comprobación de invitación, gancho de alta y limpieza de huérfanos (0295), y que sin invitación válida no se crea perfil.

**No cubre**: el uso simultáneo real desde dos conexiones (aquí hay una sola; el bloqueo `for update` es estándar de PostgreSQL), ni el comportamiento de Supabase Auth (qué datos manda exactamente el gancho). Eso se comprueba en un entorno de pruebas antes de activar nada.
