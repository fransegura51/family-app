# Communion Specification

Base Communion on the shared engine plus a structure similar to a formal celebration.

## Event-specific data
- Child/person name
- Communion date/time
- Church/parish ceremony location
- Celebration venue/location
- Ceremony arrival time if needed

Support two distinct locations:
1. Ceremony
2. Celebration

## Guest attendance scope
Each guest/family can be invited to:
- ceremony + celebration
- ceremony only
- celebration only

This selection must drive invitation content automatically, while allowing the organiser to override before sharing.

## Invitation location rule
Per invitation, allow choosing whether to include:
- both locations;
- only ceremony location;
- only celebration location.

Also adapt times, wording and any map/location action to the selected scope.

## Communion-specific optional modules
### Ceremony
May contain:
- church/parish
- ceremony time
- recommended arrival
- preparation meetings / rehearsals
- documents/tasks
- clothing/accessories
- hairdresser
- photographer/video

### Tables
Simple seating management:
- table name/number
- capacity
- assign guests/families
No need for advanced 3D floor planning.

### Restaurant/menu
Typical fields:
- provider/venue
- adult menu price
- child menu price
- menu options
- dietary constraints
- what venue includes

### Details / keepsakes
Track optional guest details/favors:
- item/type
- required quantity
- budget
- supplier
- status
- delivery/collection

A simple printed keepsake/card can reuse parts of the invitation editor with lighter controls.

### Payments / deposits
Track:
- concept/provider
- total amount
- deposit paid
- remaining amount
- due date
- state

Surface upcoming unpaid balances in `Pending now` and PEPA conclusions.

### Providers
Lightweight internal register; no external provider marketplace required.
Fields may include name, type, phone/contact note, notes, linked payments.

### Gifts received — PRIVATE, OPTIONAL
Allow recording:
- guest/family/person
- gift description/type
- cash amount where applicable
- note

Summaries:
- total money received
- event spend
- net event cost after money received

Preserve history for future private reference, e.g. seeing what a family gave when later attending their communion.
Never expose this on public invite/RSVP pages.

## Invitation styles
Include:
- classic
- modern
- floral
- minimalist
- discreet religious
- neutral

## Day plan
Can include ceremony, photos, transport, restaurant/celebration, cake, details, etc.
