# Brief: Tour Timer
Type: work   Size: full   Owner: Aljo Claassen   Written: 14 November 2026, after the build, from the owner's account, the handovers and the code

## Problem
The main problem was reporting. Guides wrote each tour on a board by hand, and the details were then copied into a book so daily averages (tours run, tour times) could be worked out. Every tour was recorded twice by hand, and the averages were calculated by hand.

Visitors were mostly well served: a digital clock showed the time of the next tour, and the guide on that tour greeted visitors as they arrived and introduced themselves. The clock had no countdown, though, and visitors sometimes forgot the tour time or their guide's name.

## Outcome (as if shipped)
A TV in the waiting area shows the next tour, the guide and a countdown, and how long visitors can still join a tour that has left. Guides log each tour on a phone at the start and end points, even without signal. Each evening the day's report arrives by email as a PDF and CSV and is filed in Drive, with the averages already worked out.

## Success measure
A full day of use with every guide on their own code: every scheduled tour logged from start to end, and the daily report matching what actually happened that day.

Where it stands on 14 November 2026: the TV side works as intended. Guides have logged their tours for the last two weeks, they understand how it works, and the report works. The full test with each guide on their own code has not yet been run.

## Appetite
No formal proposal or time budget was set. The app was built step by step from 16 October 2026, shaped by testing and by feedback from people who saw it running, which has been positive. From now on, each change gets its own appetite in its own small Brief or ticket.

## Rough solution
Pages on GitHub Pages (TV, phone, admin), an Apps Script web app, and a Google Sheet. See ADR 0001, the README and the App Guide.

## Rabbit holes
- No signal at the start or end point: phones queue changes and sync later with their original times.
- Sun and glare on the TV: light and dark themes plus a bright mode.
- Codes on phones without signal: phones keep scrambled copies. A 4-digit guide code is for attribution, not security.

## No-gos
- No guest names, phone numbers or emails are stored.
- No bookings or payments.
- No codes, names or keys in the public pages.

## Parked for later
- **Visitor reminders on their own phones.** Visitors scan a QR code or open a link as they arrive, and get a notification shortly before their tour starts. Parked until the timer and tour logging run smoothly. When it is picked up: a link that uses the phone's own browser notifications needs no personal details, while anything that collects phone numbers or names is personal information under POPIA and needs the Information Officer's view first.

## Data and approvals
Stores guide first names and codes, each change with the guide who made it, guest counts, and booked group names or booking references. Before go-live: the Head of BOA Foundation and the CEO approve Google Workspace and GitHub; the Information Officer confirms the POPIA position on storing guide names; an archive routine is agreed with the Information Officer in line with the five-year retention rule.

## Decision
Test phase: go. Go-live: after the full test with each guide's own code, and the approvals above.
