# Brief: Tour Timer
Type: work   Size: full   Owner: Aljo Claassen   Written: 2026-11-10 (after the build, from the proposal and the code)

## Problem
Visitors waiting for a guided tour don't know when the next tour leaves, who is guiding it, or whether they can still join one that has left. Tour times, guest counts and reasons for late or cancelled tours are not recorded in one place.
[DETAIL NEEDED: how tours are tracked today and what that costs: time, missed tours, disputes over counts]

## Outcome (as if shipped)
A TV in the waiting area shows the next tour, the guide and a countdown, and how long visitors can still join a tour that has left. Guides log each tour on a phone at the start and end points, even without signal. Each evening the day's report arrives by email as a PDF and CSV and is filed in Drive.

## Success measure
[DETAIL NEEDED: one observable signal, for example "every scheduled tour has a start and end logged for four weeks running", or "no missed daily report in a month"]

## Appetite
[DETAIL NEEDED: the time budget agreed at the proposal]

## Rough solution
Pages on GitHub Pages (TV, phone, admin), an Apps Script web app, and a Google Sheet. See ADR 0001 and the README.

## Rabbit holes
- No signal at the start or end point: phones queue changes and sync later with their original times.
- Sun and glare on the TV: light and dark themes plus a bright mode.
- Codes on phones without signal: phones keep scrambled copies. A 4-digit guide code is for attribution, not security.

## No-gos
- No guest names, phone numbers or emails are stored.
- No bookings or payments.
- No codes, names or keys in the public pages.

## Data and approvals
Stores guide first names and codes, each change with the guide who made it, guest counts, and booked group names or booking references. Before go-live: Carmen Jacobs and Douglas Eriksen approve Google Workspace and GitHub; Annelize Greeff confirms the POPIA position on storing guide names; an archive routine is agreed with the Information Officer in line with the five-year retention rule.

## Decision
Test phase: go. Go-live: pending the approvals above.
