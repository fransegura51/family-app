# PEPA Events — Data Integration + AI Rules

## 1. Core principle
Events should reuse PEPA data and modules instead of duplicating them.

## 2. Economy / expenses
Current bank/ticket transaction architecture may not support deep direct event linking easily.
Preferred initial strategy: event tags/labels.

Example event tag:
`Cumpleaños Eric`

Tagged expenses remain normal Economy transactions but are surfaced in the event budget/spending view.
Benefits:
- no duplicated transaction
- minimal migration risk
- reversible
- can evolve later to a stronger internal relation/foreign key if architecture permits

If a robust transaction-ID relation already exists or becomes easy to add, it may supersede the tag-only method, but preserve compatibility and avoid duplicate spend records.

## 3. Purchases
Generated shopping needs are proposed first.
User confirms before transferring items to PEPA Purchases.
Tag/relate the purchase list/items to the event so they can be surfaced in both places without duplication.

## 4. Calendar
Event tasks and reminders can be proposed inside Events.
Adding firm calendar items requires user confirmation.
Avoid firm dates while event date is only provisional unless explicitly approved as provisional.
When date changes, propose updates to date-relative calendar items.

## 5. PEPA AI role
AI is a planning assistant, not an autonomous event organiser.
It may:
- propose event structure/modules
- generate checklists
- suggest budget distribution
- suggest menu/quantities
- generate shopping needs
- suggest decoration
- suggest activities
- propose day schedule
- generate invitation text
- suggest conclusions/alerts
- optionally propose a complete plan (`Organízamelo PEPA`)

It must not silently write important changes into Purchases, Calendar or Economy.
Show a summary of proposed writes before user confirms.

Example:
`PEPA will add 12 tasks, 18 purchase items and 4 calendar items.`
Then user confirms.

## 6. “Organízamelo PEPA” staged rollout
Treat complete event generation as an advanced capability and implement incrementally according to actual model reliability.
First target: structured proposal for tasks, budget, menu, shopping, decoration, activities and plan.
Do not assume perfect one-shot automation.

## 7. PEPA conclusions
Conclusions are derived from available event data and should be actionable.
Examples:
- 5 RSVPs still pending with deadline in 3 days
- spending is 18% above decoration plan
- drinks are not purchased with event in 2 days
- two guests have nut allergies and menu contains flagged items
- restaurant balance due next week

Where useful, include a direct deep link/action into the relevant event module.

## 8. External idea/content APIs
Do not make core event planning dependent on free/public external APIs for decoration/ideas/recipes.
Such integrations are optional enhancements to investigate separately.
