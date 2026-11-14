# Tour Timer: App Guide

What Tour Timer is, how it is built, and why, in plain language. For the general ideas (server, database, deployment, cache and so on) this guide links to the Concepts handbook in the `build-standards` repo instead of repeating them. Version 1, 14 November 2026, matching release v1.0.0.

**Status:** test phase. Personal Google and GitHub accounts, four sample guides, sample data. In daily test use since 30 October 2026. Going live waits on approvals (see section 6).

## 1. What it does, and for whom

| Who | What they see or do | Where |
| --- | --- | --- |
| Visitors in the waiting area | The next tour, its guide, a countdown, and how long they can still join a tour that has just left | The TV page |
| Guides at the tour start point | Take a tour, count guests, start it, split it, hand it over, log "no tour" | The start point phone |
| Guides at the tour end point | End tours, log tours that leave from there | The end point phone |
| Admin | Reports by day or range, the change log, settings, closing the day | The admin page, on any computer |
| Management | A daily email with a summary, a CSV file and a PDF, also filed in Google Drive | Email and Drive |

Tours run every hour on the half hour, from 08:30 to 15:30, all year. Admin can change the times.

## 2. How the parts fit together

```text
 TV page ──┐
 Start phone ──┼──> Apps Script web app ──> Google Sheet (the data)
 End phone ──┤      (the server)            Gmail (daily email)
 Admin page ──┘                             Drive (filed reports)

 The four pages are files on GitHub Pages. They hold no codes, names or keys.
```

| Part | Lives in | Job |
| --- | --- | --- |
| The pages: `tv.html`, `phone.html`, `admin.html` | GitHub Pages, from the public repo | What people see and tap: the front end (Concepts handbook, entry 2) |
| `assets/core.js` | The repo; an identical copy runs in Apps Script as `Core.gs` | The tour rules: what each tap does, how reports and the CSV are worked out |
| `assets/app.js` | The repo | Draws the three screens |
| `assets/config.js` | The repo | The server's web address and the TV's look. Public, so nothing secret |
| Apps Script (`Code.gs`, `Api.gs`, `Core.gs`) | Inside the Google Sheet; master copy in `platform/apps-script/` | The server: checks every change, stores it, answers the TV and phones, sends the report |
| The Google Sheet "Tour Timer (test)" | Google Drive | The data: every change ever made, guides and codes, settings, promo messages |
| `sw.js` | The repo | Keeps the pages opening without signal (Concepts handbook, entry 12) |

## 3. How tours work in the app (the subject)

These are the operating rules the app follows. They came from how tours actually run at the ranch, and can change as guides test it.

**A tour's life:** Unclaimed → **Take this tour** → **Gathering** (counting guests) → **On tour** → **Done**. Or **No tour**, with a reason and a count of visitors who chose to go self-guided.

| Rule | Setting now | Why |
| --- | --- | --- |
| A scheduled tour can be taken from | 60 minutes before | Lets a guide claim the next tour early without blocking later ones |
| Leaving early or late needs a reason after | 15 minutes either side | Small delays are normal; bigger ones are worth knowing about. One-tap reasons: guests watching a cheetah walk, waiting for a booked group, waiting for late arrivals, or other with a note |
| TV calls guests to the waiting area | 5 minutes before | Time to gather without crowding |
| TV shows "you can still join" after departure | 15 minutes (admin can set 5 to 30) | Late arrivals can still catch up, but only on tours open to walk-ins that left from the start point |
| "No tour" can be logged | From 30 minutes before an unclaimed slot | Records why a slot did not run |
| Largest guest count accepted | 80 | Catches typing mistakes |
| Start phone signs out after | 2 minutes idle | The start phone is shared; a code is needed for anyone else's tour |

**Who's on the tour:** Public, Booked group, or Both. A booked group is recorded by a group or company name, or a booking reference for private bookings, never a surname. "Chose self-guided" is counted separately and left out of tour averages.

**Splits:** a guide can split a large tour in two while gathering. The second guide confirms with their code. The halves are shown as Split A and Split B with a shared colour; in the report a booked group appears once with both guides.

**Extra tours:** for groups that go at an unscheduled time. They can leave at any minute and do not use up the next scheduled slot.

**Finish details later:** a guide in a hurry can start a tour and fill in counts afterwards. The card turns amber, and the tour stays out of the report until the details are in.

**Handover:** passing a tour to another guide needs both guides' codes, or the admin code with a reason. Everything is logged.

**The TV never** says "delayed", and never shows codes, guest counts or group names. It shows tour times and guide first names only.

## 4. Why it is built this way

Each answer follows the six parts from the SOP.

### Why does Tour Timer have a server when the training tracker doesn't?

**Answer:** four devices share one set of tours, so something must hold it in the middle.

**Picture:** a whiteboard in the office that the two phones write on, the TV reads and admin checks. A notebook in one person's pocket would not work.

**Term:** *server*, see Concepts handbook, entry 3.

**Why not without one:** each phone would only know its own taps; the TV could not show who took the next tour.

**What would change it:** nothing while more than one device is involved.

### Why a Google Sheet as the database?

**Answer:** it is free, staff can read it like any spreadsheet, and Apps Script can use it directly.

**Picture:** a filing cabinet with a drawer per kind of record, where anyone with the key can open a drawer and read.

**Term:** *database*, see Concepts handbook, entry 4. The Sheet's tabs: **Ops** (every change ever made, never edited), **Guides**, **Settings**, **Promo** (ticker messages), **Tours** and **Change log** (readable versions, rewritten each day when the report sends).

**Turned down:** a hosted database such as Supabase: another account to approve and look after, and staff could not simply open it.

**What would change it:** many more devices, or the Ops tab growing very large. It grows by a few hundred rows a week, so an archive routine is needed before go-live.

### Why is every change saved as a separate entry in the Ops tab?

**Answer:** keeping every change, in order, means the current state can always be rebuilt and nothing is lost or overwritten.

**Picture:** a bank statement rather than a balance scribbled on a note. The balance can always be worked out from the statement, and every transaction can be traced.

**Term:** an *op* is one change: "Sam claimed the 10:30", "12 public guests", "started at 10:34". The Ops tab is *append-only*: rows are only ever added, never changed. `core.js` replays the ops to work out each tour.

**Turned down:** storing only each tour's current state. A late or repeated phone message could overwrite good information, and there would be no trail for the change log.

**What would change it:** nothing; this is what makes offline phones and the change log reliable.

### Why does the same `core.js` run on the phones and on the server?

**Answer:** so the phones and the server always apply exactly the same rules.

**Picture:** two referees using the same rulebook, page for page.

**Term:** `assets/core.js` (pages) and `Core.gs` (Apps Script) must be identical, byte for byte. A change to one is made to both in the same commit.

**Why:** the phones work out the tour state themselves when offline; the server checks and stores. If their rules differed, the phone would show one thing and the report another.

### Why Apps Script as the server?

**Answer:** it is free, already inside Google, can use the Sheet, Gmail and Drive, and needs no server of our own to look after.

**Term:** see Concepts handbook, entry 5. It also sends the daily report: a trigger checks every 15 minutes and sends once at or after 17:00.

**Turned down:** a rented server (monthly cost, maintenance). Make.com in the live path: the TV asks for updates every 20 seconds, which would use up Make's operations allowance quickly.

**What would change it:** more use than Google's daily quotas, or leaving Google Workspace.

### Why GitHub Pages, and why is the repo public?

**Answer:** GitHub Pages hosts the pages for free, but on a free account only from a public repo, so the pages were built to contain nothing secret.

**Term:** see Concepts handbook, entry 6 and Concepts handbook, entry 21.

**Turned down:** a private repo, which needs GitHub Pro (paid) and therefore approval.

**What is public:** the code, and the four sample guides' fake codes in `Code.gs`. **What is private:** everything real (codes, keys, report email), which lives only in the Sheet.

### Why do the phones keep working without signal?

**Answer:** the start and end points have unreliable signal, so every tap is saved on the phone with its time and sent when signal returns.

**Term:** *offline queue* and *sync*, see Concepts handbook, entry 11. Phones sync every 15 seconds and straight after a tap. A late change shows both times in the change log. The TV keeps counting down from its last update.

### Are guide codes secure?

**Answer:** they are for recording who did what, not for security.

**Picture:** initials on a delivery slip, not a bank PIN.

**Term:** see Concepts handbook, entry 22. Phones check codes offline against fingerprints (hashes), so plain codes never leave the server. Someone with a phone link and technical skill could work out a 4-digit code. This is accepted, and the Head of BOA Foundation is told before go-live.

**What would change it:** if codes ever controlled money or personal data, they would need to be real passwords on the server.

### Why does the phone link contain a key?

**Answer:** the key proves a change came from a team phone, so a stranger who finds the web address cannot log tours.

**What to do if a phone is lost or the link leaks:** see the runbook. Make the new link after the day's last tour, when both phones show "Online" with nothing waiting, because changes made with the old link are held until the phone opens the new one.

### Why sample data and personal accounts for now?

**Answer:** real guide names and organisational accounts need approval and a POPIA check first.

**Picture:** a dress rehearsal with stand-ins.

**What would change it:** the go-live gate in section 6.

## 5. Common jobs

| Job | How |
| --- | --- |
| Change tour times, join window, report time or report email | Admin page, Settings |
| Add, rename or deactivate a guide | Sheet, Guides tab. Set Active to No rather than deleting a row, so old tours keep their guide |
| Add a ticker message | Sheet, Promo tab (Message, Show, From, Until, Order) |
| Send today's report now | Admin page, Close today; or Sheet, Tour Timer menu, Send today's report now |
| Lost phone, or a link or code seen by the wrong person | Runbook, "Lost phone, or a leaked phone link or code" |
| Change the code | Runbook, "Updating the code": repo first, then the Apps Script editor, then a new version of the existing deployment |
| Something is wrong | Runbook, "Failure points"; then the debugging protocol in the SOP |

## 6. Where it stands

| Area | State |
| --- | --- |
| Release | v1.0.0 test baseline, 10 November 2026. Apps Script deployment version 2. Cache `tour-timer-v3` |
| Brand | Cango Wildlife "Sun disc" direction on all screens. Recolouring the spots needs the marketing lead's confirmation |
| TV and sun | No TV installed yet. The spot gets direct sun; shading is the real fix. A Bright conditions schedule (v10) is planned once sun photos are reviewed |
| Audio | Parked until a live TV test |
| Media panel | Placeholder slides until content is approved by the marketing lead |
| Printing | Open: the printer is USB-only; depends on the office PC |
| Visitor reminders | Idea parked: visitors scan a QR code on arrival and get a notification before their tour. Picked up once the timer and logging run smoothly; see the brief's "Parked for later" |

**Go-live gate:** the Head of BOA Foundation and the CEO approve Google Workspace and GitHub; organisational accounts; the Information Officer confirms the POPIA position on guide names; an Ops archive routine is agreed; the sample codes are replaced. Steps: SETUP.md, Part F.

## 7. Where to find more

- `README.md`: the one-page overview
- `SETUP.md`: setting it up from nothing, and the test checklist
- `docs/runbook.md`: updating, rolling back, failures
- `docs/brief.md`: why it exists and what it will not do
- `docs/decisions/`: the recorded decisions
- `CHANGELOG.md`: what changed and which version is live
- The Concepts handbook, in the `build-standards` repo: the general ideas
