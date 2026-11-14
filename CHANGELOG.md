# Changelog

Newest first. Versions follow SemVer. Each entry records the live Apps Script deployment version.

## Unreleased (documentation only, no change to the running app)
- `platform/apps-script/Core.gs` brought up to date with the live editor; it was not updated on 13 November.
- Added `docs/guide.md`, the plain-language App Guide.
- Completed `docs/brief.md`: how tours were tracked before, the success measure, the appetite, and the parked visitor-reminder idea.
- Public documents now name roles (Head of BOA Foundation, CEO, Information Officer) instead of colleagues' names.

## [1.0.1] - 2026-11-13
Apps Script deployment: version 3 (13 November 2026, 13:32), same deployment and web address. Pages: commits dd63244, 8b4353c, c013c48. Service worker cache: tour-timer-v3. Checked on 14 November 2026: the editor's Code.gs, Api.gs and Core.gs match the repo by checksum.

### Changed
- Leaving within 15 minutes of the slot now needs no reason (was 5), the same as the join window.
- A tour with booked guests is never flagged early or late, and needs no reason: booked groups always take the next tour.
- A form that shows an error keeps what the guide typed (times, counts, notes). Codes are still retyped.

## [1.0.0] - 2026-11-10
Apps Script deployment: version 2 (3 November 2026, 09:52), description "v1.0.0 test baseline". Pages: commit of 3 November 2026. Service worker cache: tour-timer-v2.

First tagged release. Records the build already in test use; no code changes.

### Changed
- Apps Script project renamed from "Untitled project" to "Tour Timer".
- Active deployment given the description "v1.0.0 test baseline". Same version and web address.

### Added
- `platform/apps-script/` with Code.gs, Api.gs, Core.gs and appsscript.json, copied from the live editor and checked by checksum.
- README, SETUP, AGENTS.md, CLAUDE.md, this changelog, the brief, ADR 0001, the decisions log and the runbook.

### Notes on earlier, unversioned builds
- 2026-10-28: setup guide version 1.
- 2026-10-30: first script files (Code.gs, Api.gs, Core.gs).
- 2026-11-02: pages uploaded to GitHub; `config.js` connected to the web app.
- 2026-11-03: updated Api.gs, Core.gs, app.js, core.js and sw.js. A "no tour" record no longer needs a time slot; the server skips one that has neither a tour nor a slot. Apps Script deployment version 2.
- 2026-10-30 to 2026-11-06: test use by sample guides. 2026-11-07 onwards: automatic daily report only.
