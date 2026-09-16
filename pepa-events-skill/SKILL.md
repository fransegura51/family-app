---
name: pepa-events
description: Design, implement, review, or extend the PEPA Family Events module for birthdays, communions, baptisms, anniversaries/family celebrations, intimate weddings, and custom events. Use when working on event planning, invitations, RSVP, guests, budgets, menus, shopping, tasks, day plans, event-specific modules, or PEPA AI recommendations.
---

# PEPA Events Skill

## Purpose
Build and maintain the PEPA Family Events module exactly according to the approved product specification in `references/`.

This is a large product area. Do not implement it from memory or from this file alone.

## Mandatory operating rule
Before changing Events code:
1. Read `references/00-master-spec.md`.
2. Read `references/07-invitations-rsvp.md` if the task touches invitations, design, sharing, guests, confirmations, public pages, or RSVP.
3. Read `references/08-data-integration-ai.md` if the task touches Economy, purchases, calendar, AI, tags, external data, or cross-module behavior.
4. Read the reference for the event type being changed.
5. Before finishing a meaningful Events implementation, run through `references/09-acceptance-checklist.md` and report any intentionally unimplemented item.

If the user requests the entire Events module, read ALL reference files before coding.

## Non-negotiable product principles
- Mobile-first, simple, intuitive, low typing.
- Reuse one common Events engine. Do not create six independent mini-apps.
- Event modules are configurable: show only what the user wants; hidden sections can always be reactivated.
- PEPA proposes; the user confirms before important cross-module writes or automation.
- Reuse existing PEPA Calendar, Purchases and Economy data wherever possible instead of duplicating it.
- The event home screen prioritizes real pending actions, not just counters.
- Invitations and RSVP are a flagship feature and must be visually polished and frictionless.
- Public invitees must not need a PEPA account or app to RSVP.
- Keep private planning data private. Public invitation/RSVP pages expose only what is needed.
- Do not add external/store gift registries for weddings.
- Do not add shared birthday photo albums/pages.
- Respect copyright/licensing: do not ship unlicensed copyrighted characters as PEPA-owned theme packs.

## Architecture
Use the shared engine described in `references/00-master-spec.md`, then layer event-specific behavior from:
- `references/01-birthday.md`
- `references/02-communion.md`
- `references/03-baptism.md`
- `references/04-celebration-anniversary.md`
- `references/05-intimate-wedding.md`
- `references/06-custom-event.md`

Invitation/RSVP behavior is centralized in `references/07-invitations-rsvp.md`.
Cross-module and AI rules are centralized in `references/08-data-integration-ai.md`.

## Implementation discipline
- Prefer shared components and shared data models with per-event configuration.
- Never silently remove an approved feature because a screen feels crowded; use grouping, progressive disclosure, optional modules, accordions, or secondary screens.
- Avoid asking the user to re-enter data already known elsewhere in the event.
- Keep advanced controls secondary.
- Preserve future extensibility for new event types without requiring schema redesign.

## Required completion behavior
For any substantial Events task, finish by stating:
- what was implemented;
- what remains intentionally deferred;
- which acceptance checks passed/failed;
- any migration or compatibility risk.
