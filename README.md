# Tour Timer

Shows guided tour times and countdowns on a TV in the waiting area, lets guides log tours from two phones (start point and end point), and emails a daily report.

**Status:** test phase. Personal Google and GitHub accounts, sample guides, sample data. Go-live waits on approvals (see "Going live" below).
**Owner:** Aljo Claassen, Digital Systems Lead, Cango Wildlife Ranch
**Process:** built and maintained under App Build SOP v0.2

## How it fits together

| Part | Lives in | Does |
| --- | --- | --- |
| Pages: `tv.html`, `phone.html`, `admin.html` | This repo, served by GitHub Pages | The screens. They hold no codes, names or keys |
| `assets/config.js` | This repo | The web app address and TV look. Public: never put a code or key here |
| `assets/core.js` | This repo | Shared rules, used by the pages and the server. Must match `platform/apps-script/Core.gs` exactly |
| Apps Script web app | Google, inside the "Tour Timer (test)" Sheet | Checks codes, stores changes, sends the daily report, files reports in Drive |
| `platform/apps-script/` | This repo | The source of truth for the Apps Script code. The Apps Script editor holds a deployed copy |
| Google Sheet | Google Drive | Ops (every change), Guides, Settings, Promo, Tours, Change log |

The TV asks for updates every 20 seconds. Each phone syncs every 15 seconds and straight after a tap. Without signal, a phone keeps working and sends its saved changes later with their original times.

## Where it is running

| What | Where |
| --- | --- |
| Pages | https://aljoclaassen.github.io/tour-timer |
| Apps Script web app | Project "Tour Timer"; active deployment version 2, "v1.0.0 test baseline" (3 November 2026). The address is in `assets/config.js` |
| Daily report | Apps Script trigger every 15 minutes; sends once a day at the report time set in the Settings tab |
| Reports in Drive | Tour Timer reports / year / month |

## Changing the code

Follow `docs/runbook.md`. In short: change the file in this repo first, then copy it into the Apps Script editor, then deploy a new version of the existing deployment. Never choose New deployment for an update: it creates a new web address the pages don't know.

## Documents

- `SETUP.md`: setting it up from nothing
- `docs/brief.md`: why it exists and what it will not do
- `docs/decisions/`: why it is built this way
- `docs/runbook.md`: operating, updating, rolling back, troubleshooting
- `CHANGELOG.md`: what changed and which version is live

## Going live

Waits on: the Head of BOA Foundation and the CEO approving Google Workspace and GitHub; organisational accounts; the POPIA position on storing guide names confirmed before real names go in. Steps are in `SETUP.md`, Part F.
