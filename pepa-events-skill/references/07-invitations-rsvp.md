# Invitations + RSVP — Flagship Subsystem

## 1. Goal
Create genuinely attractive invitations that remain extremely easy to customise on mobile, then let recipients RSVP without installing PEPA.

Flow:
1. Design
2. Review
3. Share
4. Confirmations

## 2. Design — staged/layered experience
Do not build a desktop-style Canva clone.
Think WhatsApp / Instagram Stories simplicity.

### Stage A — choose template/theme
Show large, visual thumbnails.
Template catalog depends on event type and audience.

### Stage B — auto-filled event data
Populate from the event where available:
- name/title
- age (for birthday)
- confirmed/provisional date
- time
- location(s)
- RSVP deadline
- invitation text

All auto-filled text remains editable.
If a date is not confirmed, support wording such as `Date to be confirmed` or a save-the-date/provisional version.

### Stage C — visual editor
Use layers/objects:
- background
- decorative graphics
- user photo/image
- text
- emoji/sticker
- event-data text elements

Direct touch gestures:
- drag to move
- pinch to resize
- rotate with touch gesture
- tap/select

Simple selected-element actions:
- colour
- size
- font
- duplicate
- delete
- bring forward
- send backward

Keep advanced controls secondary.
Provide:
- Undo
- Restore template

Optional AI action:
`Pepa, hazla bonita` / `PEPA, make it look nice`
This rebalances/repositions elements while preserving the user's content.

## 3. Theme/content licensing
Do NOT ship unlicensed copyrighted TV, film or video-game characters as PEPA-owned theme packs.
Design architecture should support:
- PEPA-original/generic theme assets
- user-uploaded imagery where legally/permissibly appropriate
- future licensed theme packs

## 4. Review
Show exactly how the invitation will appear.
Allow provisional/save-the-date variants if event details are not final.

## 5. Sharing
Do not depend on importing PEPA contacts.
Use the device-native share sheet so user can choose WhatsApp, Messages, Telegram, email, etc.

Useful share outputs:
- beautiful invite image/card
- RSVP link
- prepared share message

PEPA should not automatically message invitees unless a future explicitly authorised integration exists.

## 6. Branding / organic acquisition
Include subtle PEPA branding on invitations and public RSVP page:
- small PEPA logo
- app name / `Organised with PEPA`

Do not overpower the invitation design.
Where available, branding may link to a smart landing/download URL that routes to Google Play or App Store as appropriate.

Public RSVP footer/callout may say a restrained equivalent of:
`Like this invitation? Create yours with PEPA.`
No intrusive ads or banners.

## 7. RSVP link modes
Support two modes.

### Personalized link — recommended
Each guest/family/group can have a unique tokenized RSVP link.
Public URL should not expose personal data in readable query parameters.
Link can view/edit only that invitation response.

Public page clearly identifies the invitation, e.g. `Invitation for Family López`.

### Open link — optional
For informal events, an open RSVP link may allow recipient to type minimal identification and adult/child counts.
Less precise but fast.

## 8. RSVP states
Use simple states:
- Pending
- Confirmed
- Not attending
- Unsure

If confirmed, collect:
- adults count
- children count

Optional short note for useful information such as allergy/dietary note or arrival comment.
Avoid long forms.

## 9. Editing RSVP
A recipient can reopen the same valid link and change their response.
Event totals update automatically.

## 10. Wrong/shared link handling
If a personalized link was sent to the wrong person:
- show clearly who the invitation is for;
- provide `This invitation is not for me` without modifying the record.

Organizer can regenerate/invalidate the RSVP token/link if needed.

## 11. RSVP dashboard inside PEPA
Show:
- total invited/listed
- confirmed
- pending
- not attending
- unsure
- confirmed adults
- confirmed children

Provide filters for states and family/group entries.

## 12. RSVP deadline
Optional deadline.
PEPA conclusions can warn when deadline is approaching and responses remain outstanding.

## 13. Reminder workflow
Provide `Remind pending` as a manual share workflow.
PEPA prepares text; user shares through native share sheet.
Do not send autonomously by default.

## 14. Group/family invitations
Do not force one invitation per person.
Support group/family entry such as:
`Family García — 2 adults + 2 children`.
One RSVP can update actual attendance counts.

## 15. Multiple-location invitations
For Communion, Baptism and Intimate Wedding, invitation content can be scoped per guest/family to:
- ceremony + celebration
- ceremony only
- celebration only

Only show relevant addresses, times and location actions.
