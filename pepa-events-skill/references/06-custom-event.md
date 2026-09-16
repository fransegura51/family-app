# Custom Event Specification

Custom Event is the flexible form of the common engine, not a separate architecture.

## Creation
Ask only minimal basics:
- event name
- date if known
- location if known
- optional short description

Then show the module picker.

## Module picker
Allow selecting any relevant engine module, including:
- Guests
- Invitations
- RSVP
- Tasks
- Budget
- Payments/deposits
- Menu + shopping
- Decoration
- Activities
- Tables
- Ceremony
- Providers
- Gifts received
- Day plan
- PEPA conclusions

Modules can be activated/deactivated later.

## PEPA setup assistance
Optional prompt:
`Describe the event briefly and PEPA will recommend which modules to activate.`

Example intent:
`Surprise retirement party for 35 people in a restaurant.`
PEPA may recommend guests, invitations, RSVP, budget, venue/payment, optional decoration and day plan.
User approves selections.

## Personal templates
Allow saving a completed module configuration as a reusable personal template, useful for recurring family events such as annual Christmas meals.
Do not copy old live RSVP/expense state into new occurrences.
