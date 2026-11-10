# ADR 0001: Build on Google Workspace and GitHub Pages
Status: Accepted (recorded after the fact)
Date: 2026-11-10 (decision taken in October 2026)

## Context
Tour Timer needs a TV display, two phones that keep working without signal, an admin page and a daily emailed report. It must cost nothing to run in the test phase, be maintainable by one person who is still learning JavaScript, and need no server to look after. The SOP v0.1 default was React with Vite and Supabase or Firebase.

## Options considered
1. **SOP default: React, Vite, Supabase or Firebase.** For: a real database, room to grow. Against: a build step, a second paid or quota-limited service, more to learn and maintain, accounts that need approval.
2. **Google Workspace: plain JavaScript pages on GitHub Pages, an Apps Script web app, a Google Sheet.** For: free; no build step; Gmail and Drive for reports at no extra cost; data readable in a Sheet; staff already use Google. Against: Apps Script quotas and speed; a Sheet slows as it grows; free GitHub Pages needs a public repo; Apps Script code is edited in Google's editor, so it can drift from the repo.

## Decision
We use option 2.

## Consequences
- Easier: no hosting bills, reports in Gmail and Drive, data visible to non-developers.
- Harder: keeping Apps Script code in step with the repo (handled by the Platforms section of SOP v0.2 and `platform/apps-script/`); no automated judges yet.
- Watch: Sheet size (the Ops tab grows by a few hundred rows a week), Apps Script daily quotas, and that nothing secret ever reaches the public repo.
- Revisit if: guides or devices grow well beyond the current four guides and two phones, or the Sheet becomes slow.
