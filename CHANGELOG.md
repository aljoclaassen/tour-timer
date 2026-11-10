# Changelog

Newest first. Versions follow SemVer. Each entry records the live Apps Script deployment version.

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
