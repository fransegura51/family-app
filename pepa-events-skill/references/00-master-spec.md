# PEPA Events — Master Product Specification

## 1. Product goal
Events is a native PEPA Family module for planning family and social events without turning PEPA into a specialist wedding or event-management platform.

Supported initial event types:
- Birthday
- Communion
- Baptism
- Anniversary / family celebration
- Intimate wedding
- Custom event

Events must feel like one coherent system. Each event type is a configured variant of the same engine.

## 2. Shared event lifecycle
1. Create event with minimal necessary data.
2. Choose which planning sections/modules to use.
3. Plan and prepare.
4. Add guests and create/share invitations.
5. Receive RSVP updates.
6. Refine budget, menu, purchases, suppliers and day plan.
7. On event day, switch home view to immediate actions.
8. Finish event.
9. Archive without deleting useful data.
10. Optionally duplicate/reuse the event structure later.

## 3. Date model
Events must support:
- no date yet;
- provisional/planned date;
- confirmed date.

Do not force a confirmed date during creation when the venue may determine availability.
Do not create firm Calendar commitments until the relevant date/time is confirmed.
When a date becomes confirmed or changes, recalculate date-relative tasks and reminders.

## 4. Modular planning
At creation, after essential data, ask which planning sections the user wants.
Offer:
- Recommended / complete setup
- Choose sections myself

Unselected modules are hidden from the normal event UI but remain available under `Manage sections` and can be reactivated at any time.

If a venue provides services (food, drinks, decoration, entertainment, cleaning, etc.), PEPA may recommend hiding redundant sections, but must not decide irreversibly without the user.

## 5. Shared modules
Available shared modules include:
- Guests
- Invitations
- RSVP / confirmations
- Preparations / tasks
- Budget
- Payments / deposits
- Menu + shopping
- Decoration
- Activities / games
- Tables / seating
- Ceremony
- Providers
- Special details / favors where applicable
- Gifts received (private, optional)
- Day plan
- PEPA conclusions

Not every event type uses every module.

## 6. Event home screen
The first screen must be action-oriented and visually calm.

Top summary should show only useful headline data, e.g.:
- event title
- date status
- venue status
- guest/RSVP summary
- budget summary where enabled

Then show `Pending now` with actual tasks/actions, not just a number such as “9 pending tasks”.
Show approximately the most important/nearest 3–5 actions and a `View all` action.

Example:
- Reserve venue
- Send invitations
- Confirm cake
- Choose decoration
- Review venue menu

Group modules visually instead of displaying a wall of independent cards. Recommended conceptual groups:
- Organisation
- Money & needs
- Celebration

PEPA recommendations should appear contextually rather than as a giant standalone dashboard tile.

## 7. Guests
Keep guest entry low-friction.
Default guest/group record should be minimal:
- display name / family name
- adults count
- children count
- RSVP state

Do not require phone, email or contact import.
Do not depend on device contact import, especially on iPhone.
Guest totals are computed from the guest list; do not ask the creator for an approximate guest count at event creation.

Track separately:
- invited/listed people
- confirmed attendees
- confirmed adults
- confirmed children

## 8. Preparations / tasks
Generate a sensible event-specific checklist based on event type and time remaining.
Tasks are editable, removable and manually addable.
Date-relative tasks update when event date changes.
Cross-posting into PEPA Calendar requires user confirmation.

## 9. Budget
Budget may include planned vs actual spending by category.
Do not duplicate PEPA Economy transactions.
See `08-data-integration-ai.md` for the preferred tag-based strategy.

## 10. Menu + shopping
Treat menu planning and shopping as one connected flow:
1. Plan menu / food / drinks.
2. Estimate quantities if useful.
3. Account for adult/child counts and dietary constraints.
4. Generate shopping needs.
5. User confirms transfer to PEPA Purchases.

Menu comes BEFORE shopping.

## 11. Decoration
Decoration is optional.
PEPA may propose ideas/items; the family chooses all, some, or none.
Never assume every event needs decoration.
External idea-search APIs are optional/future; do not make core functionality depend on free/public decoration APIs.

## 12. Activities
Activities/games are contextual and optional.
Especially useful for birthdays outside full-service indoor play centres.
Venue-provided entertainment may make this module unnecessary.

## 13. Day plan
Offer an editable chronological plan for the event day.
It becomes especially prominent on the day of the event.

## 14. PEPA conclusions
A core value layer across Events.
Examples:
- pending RSVPs near deadline;
- budget running over/under;
- missing high-priority purchase;
- allergy conflict with planned menu;
- unpaid deposit approaching due date.

Conclusions should link directly to the relevant module/action where possible.

## 15. Event-day mode
On the event date, home view should emphasise:
- today status/banner;
- confirmed attendance;
- remaining last-minute tasks;
- outstanding purchases;
- next scheduled action;
- day plan.

## 16. Event completion and archive
`Finish event` archives; it does not delete.
Preserve useful private planning history such as:
- guest list and final RSVP state
- budget and tagged spending visibility
- tasks
- invitation configuration
- plan
- gifts received where enabled

Provide an end summary such as:
- budget vs spent
- final attendance
- task completion
- net cost where gifts received are tracked

## 17. Duplicate/reuse
Allow duplicating a prior event as a starting structure.
Do not copy stale transactional state such as old RSVP confirmations or old expenses as new live data.
Useful for yearly birthdays, recurring family meals, etc.

## 18. Broad audience
PEPA Events is for all ages and family types. Do not design the overall Events UX as “only for parents of small children”.
