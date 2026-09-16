# Intimate Wedding Specification

Use Communion as the closest base structure.
Goal: handle small/intimate weddings well without becoming a specialist wedding-planning platform.

## Shared formal-event structure
Keep:
- ceremony + celebration
- one or two locations
- guest management
- invitation scope per guest/family
- RSVP
- tables
- venue/menu
- providers
- budget
- payments/deposits
- tasks
- day plan
- PEPA conclusions
- private gifts received

## Wedding-specific data/modules
- Couple names
- Ceremony type: civil / religious / symbolic / other
- Witnesses: optional
- Clothing / dress / suits / accessories: optional
- Rings: optional task + budget item
- Bouquet / flowers: optional
- Music: ceremony / entrance / meal/party; simple tracking only
- Photographer/video: optional provider
- Transport between locations: optional
- Cake: optional separate item if not included by venue
- Tables/seating: likely more important here, but still optional

## Invitation scope
Per guest/family:
- ceremony + celebration
- ceremony only
- celebration only

Use shared invitation editor and RSVP system.

## Invitation styles
- elegant
- minimalist
- floral
- romantic
- modern
- rustic
- Mediterranean
- classic
- informal
- civil

## Gifts
### EXCLUDE
Do NOT implement an external/store wedding gift registry or wish list.

### KEEP
Keep optional private `Gifts received` tracking:
- who gave what
- cash amount where relevant
- notes
- totals / net event cost

## Special details for special people — OPTIONAL
Separate from gifts received.
For parents, godparents, witnesses, grandparents, siblings, close friends, etc.
Track:
- recipient
- relationship/role
- detail/gift idea
- budget
- status: pending / bought / prepared
- delivery moment
- notes

## Out of scope by design
Do not turn this into a specialist wedding suite with:
- advanced dress appointment systems
- provider comparison marketplace
- advanced floor-plan seating planner
- external wedding website builder
- store gift registry
- highly specialised wedding-only workflows unless user later requests them.
