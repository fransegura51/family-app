# Estado real de las migraciones 0299 a 0303 (aclaración del 24/10/2026)

**APLICADAS en producción desde el 21/10/2026** (0299, 0300, 0301, 0302 y 0303), con el gancho «Before User Created» de Auth activado. Verificado por Jennifer el 24/10/2026.
Las cabeceras de los archivos SQL de 0300, 0301 y 0302 todavía dicen «SIN APLICAR»: es texto histórico que no se actualizó. NO se han tocado (son SQL ya aplicado); vale este documento.

## Contradicción de la cabecera de 0300 (retirar el propio vínculo)

- La cabecera de `supabase/migrations/0300_family_member_guardians.sql` (líneas 14-15) dice que `revoke_own_guardianship` «se crea pero NO se habilita».
- El SQL del mismo archivo (final, bloque «Retirar el PROPIO vínculo») hace `grant execute on function public.revoke_own_guardianship(uuid, text) to authenticated`, con el comentario «Habilitada tras probarla con datos».
- **Manda el SQL**: la función SÍ está habilitada para `authenticated` (aprobado el 21/10/2026, requisito CTA-20 de `PEPA_CONTROL_REQUISITOS.md`). La cabecera quedó de una versión anterior del diseño.
- Comprobación opcional en producción (solo lectura): `select has_function_privilege('authenticated','public.revoke_own_guardianship(uuid,text)','execute');` debe dar `true`.

Otros textos «sin aplicar / sin desplegar» sobre 0299-0303 en la documentación son históricos: `CUENTAS_SEGURIDAD_PLAN.md` (§1 a §5; el estado vigente está en §5 ter), `PEPA_CONTROL_REQUISITOS.md` (CTA-4 a CTA-20), `CUENTAS_PADRES_HIJOS_E_INVITACIONES.md` y `AUDITORIA_ROLES_Y_PERMISOS_2026-10-21.md` (foto del momento de la auditoría). Cada uno lleva ahora una nota de actualización al principio.
Los comentarios «no se ha ejecutado todavía» de `supabase/pending-migrations/0299_live_test.sql` también son históricos (se ejecutó con resultado `PRUEBA_0299_OK`).
