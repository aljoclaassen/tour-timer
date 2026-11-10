# Runbook: Tour Timer

Owner: Aljo Claassen. Test phase: personal Google account (Sheet "Tour Timer (test)") and personal GitHub.

## Daily
- Nothing to do. The trigger checks every 15 minutes and sends the report once, at or after the report time in the Settings tab.
- The report arrives by email with a PDF and CSV, filed in Drive under Tour Timer reports / year / month.

## Updating the code
1. Change the file in this repo and commit it with a message that says what and why.
2. Apps Script files: open the Apps Script editor, replace the matching file's contents with the repo file, save.
   - `assets/core.js` changed: replace `Core.gs` with the same contents.
3. Deploy › Manage deployments › pencil icon › Version: New version. Description: the CHANGELOG version, for example `v1.1.0 split tours`. Deploy. The web address stays the same.
   - Never choose New deployment for an update: it makes a new address the pages don't know, and the TV and phones lose their connection.
4. A page or anything in `assets/` changed: bump `CACHE` in `sw.js` (tour-timer-v3 and so on) and commit.
5. Add the CHANGELOG entry with the new deployment version number, tag the release in GitHub, and check on a phone.

## Rolling back
- Apps Script: Deploy › Manage deployments › pencil icon › choose the previous version › Deploy. The web address stays the same.
- Pages: revert the commit in GitHub, bump `CACHE` in `sw.js`, commit.
- Record the rollback in the CHANGELOG.

## Lost phone, or a leaked phone link or code
1. Wait until no tour is running and both phones show "Online" with nothing waiting. Changes made with the old link after the change are refused until the phone opens the new link; the phone keeps them and sends them then.
2. Tour Timer › Make a new phone link (lost phone).
3. Tour Timer › Show the TV, phone and admin links. Open the new links on both phones, add them to the Home screen again, and delete the old shortcuts.
4. Admin code: change it in the Settings tab. People already signed in stay signed in for up to 6 hours.
5. Never change the salt.

## Failure points
| What you see | Likely cause | Fix |
| --- | --- | --- |
| Phone or admin says "not connected yet" | `assets/config.js` still has the placeholder | Paste the web app address and commit |
| Phone says "This phone link is not valid" | Phone key changed, or the link was cut short | Open the phone link again from Show the TV, phone and admin links |
| TV never shows guide names | Web app access is not "Anyone", or the address is wrong | Open the address in a browser: it must show `"ok":true` |
| Script changes don't show | The deployment still runs the old version | Manage deployments › Edit › New version › Deploy |
| Tour times an hour or more out | Script time zone not Johannesburg | Project Settings › Time zone |
| No daily email | Report email empty, or the trigger is off | Check reportEmail; run Tour Timer › 2. Turn on the daily report |
| A phone shows old screens after an update | It is using its saved copy | Bump `CACHE` in `sw.js` and commit |

Script errors: Apps Script editor › Executions shows each run and its error.

## Checks at each review
- The Apps Script editor matches `platform/apps-script/` (Claude can compare checksums in the browser).
- `assets/core.js` matches `Core.gs`.
- Ops tab size; agree archiving with the Information Officer before go-live.
