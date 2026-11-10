# AGENTS.md: rules for every AI tool working on Tour Timer

Follow App Build SOP v0.2. These are the project-specific rules.

## The project
- Stack B (Google Workspace): plain HTML, CSS and JavaScript on GitHub Pages; Apps Script web app; Google Sheet for data. See `docs/decisions/0001-google-workspace-stack.md`.
- Test phase: sample guides and sample data only. Never put real names, phone numbers or emails anywhere.

## Hard rules
1. The repo is the source of truth. Apps Script code lives in `platform/apps-script/`. Give changes as repo files, never as code to paste from chat.
2. `assets/core.js` and `platform/apps-script/Core.gs` must stay byte-for-byte identical. Any change to one is made to both in the same commit.
3. The pages are public (GitHub Pages on a free account). No codes, keys, names or emails in any file under `assets/` or the HTML pages.
4. Never ask for, print or commit the admin code, phone key or salt. They live only in the Settings tab.
5. After any change to a page or anything in `assets/`, bump `CACHE` in `sw.js` (tour-timer-v2, v3 and so on) so devices drop their old copy.
6. Apps Script updates go to the existing deployment as a new version. Never a new deployment.
7. Every change keeps the phones working offline: changes queue on the phone and sync later with their original times.

## Code layout
- `platform/apps-script/Api.gs`: request handling and validation. No Google services, so it can be tested on its own.
- `platform/apps-script/Code.gs`: Sheet, Gmail, Drive, triggers, the Tour Timer menu.
- `platform/apps-script/Core.gs`: copy of `assets/core.js`.
- `assets/app.js`: the TV, phone and admin screens.

## Checking work
- No automated judges yet. Before a pull request: walk the Part D checklist in `SETUP.md` on two phones and the TV, and list in the pull request which items were checked.
- Point out in every pull request summary any change to code validation, guide codes, the phone key, the admin sign-in or the report email. The owner reads those parts.

## Review guidelines
- Check the change against `docs/brief.md`, not the Builder's summary.
- Flag by severity: anything that could lose a logged change, show a code or name on the TV or in a public file, break offline sync, or create a new web app address.
