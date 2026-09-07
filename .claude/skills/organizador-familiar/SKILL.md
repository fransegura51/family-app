---
name: organizador-familiar
description: Skill para arrancar y desarrollar la app de organización familiar de Paco y Jennifer (inspirada en "Conchy", tipo Cozi/FamilyWall). Úsalo siempre que el usuario mencione "app familiar", "organizador familiar", "Conchy", "calendario familiar", "lista de la compra familiar", "tareas de los niños", "menús semanales" o cualquier módulo del documento maestro "Family App — Master Skills". Define el stack, la arquitectura, los perfiles familiares, las fases de desarrollo y los criterios de diseño que Claude Code debe respetar en cada sesión de trabajo sobre este proyecto.
---

# App de organización familiar (Paco / Jennifer)

Ahora mismo en fase de prueba solo con la propia familia, pero el
objetivo declarado por el usuario es venderla a otras familias en el
futuro (2026-09-08) — así que toda funcionalidad nueva debe diseñarse
pensando en varias familias/tenants distintos, aislados entre sí, no
solo en "nosotros". Inspirado en la app ficticia "Conchy" de la serie
"Padre no hay más que uno". Referencia de mercado: apps tipo Cozi /
FamilyWall.

Implicaciones concretas de este enfoque multi-tenant:
- Cualquier integración por email (ingesta de tickets, pedidos de
  Amazon...) debe pensarse como "un email de ingesta por familia", no
  una dirección compartida hardcodeada — evaluar un alias/subdominio
  propio de la app en vez de reenviar a una dirección de Pipedream larga
  y poco presentable de cara a un futuro cliente.
- "Usuarios invitados" (compartir secciones concretas con otras
  personas) debe construirse con permisos por sección desde el
  principio, ya que es la base tanto de "compartir con la familia
  extendida" como de una futura cuenta multi-usuario de pago.
- Seguir evitando construir nada que asuma que solo existe una familia
  en la base de datos (RLS por family_id ya lo cubre en gran parte).

## Principio general: TODO GRATIS

Este proyecto se construye íntegramente con planes gratuitos, sin
excepción salvo que el usuario lo pida explícitamente:

- Supabase free tier (cuenta fransegurahortelano@gmail.com, mismo patrón
  que alerfer-seguimiento — comprobar cuota libre antes de añadir un
  segundo proyecto en esa cuenta).
- Hosting en Vercel free tier (o similar: Netlify/Cloudflare Pages free).
- Cualquier API externa que se integre (calendario ICS, FatSecret, etc.)
  debe usarse en su capa gratuita. Antes de dar por buena una integración,
  confirmar explícitamente cuáles son los límites del plan gratuito (nº de
  peticiones/día, campos disponibles) y diseñar el uso para quedarse
  cómodamente por debajo.
- Si en algún momento una funcionalidad solo es viable de pago, no
  implementarla por defecto: parar y preguntar al usuario si quiere asumir
  ese coste.

## Stack

TypeScript / React / PWA / Supabase — offline-first, mobile-first (según el
documento maestro "Family App — Master Skills", 33 skills).

## Perfiles familiares iniciales

Paco (avatar oso), Jennifer (avatar unicornio), Eric (avatar Pikachu),
Fernando (avatar configurable). No deben quedar hardcodeados en el código.

## Seguridad y privacidad

- RLS (Row Level Security) por family_id en Supabase.
- Cuidado especial con la privacidad de los menores (Eric, Fernando).

## Fases de desarrollo (orden pedido)

1. Auth / familia / UX base / calendario
2. Tareas / rutinas infantiles
3. Compras / inventario (lista → ticket → inventario)
4. OCR de tickets → productos
5. Alimentación / menús (aquí entra el módulo FatSecret, ver abajo)
6. Finanzas / educación financiera infantil
7. IA operativa intercambiable
8. Geolocalización opcional / automatizaciones

No construir varios módulos a la vez.

## Módulo: Calendario (Fase 1)

- Cada miembro de la familia enlaza su calendario externo mediante
  suscripción ICS (iCloud o Google Calendar).
- Guardar la URL .ics asociada a cada miembro (family_member_id + ics_url).
- Backend hace fetch periódico y parsea el ICS (ical.js en JS/TS).
- Un miembro puede tener varias fuentes ICS.

## Módulo: Alimentación / menús — integración FatSecret (Fase 5)

- Registro de app en platform.fatsecret.com → Client ID / Client Secret.
- Llamadas siempre desde el backend, nunca desde el cliente.
- Endpoints: food.search, food.get, recipe.get.
- Cachear alimentos consultados en Supabase (tabla food_cache).
- Verificar límites del plan gratuito de FatSecret antes de cerrar el diseño.

## Cómo trabajar en este proyecto (para Claude Code)

1. Confirmar con el usuario la fase/módulo de la sesión antes de generar código.
2. Cualquier servicio externo nuevo se integra en su capa gratuita por defecto.
3. Diseñar el modelo de datos pensando en varios perfiles familiares desde el principio.
4. Preguntar por dónde desplegar y por credenciales de APIs antes de asumirlas.
