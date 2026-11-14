# Tour Timer setup

About 45 minutes the first time. Test phase: personal Google and GitHub accounts and sample data only. Nothing real goes in until the Head of BOA Foundation and the CEO approve Google Workspace and GitHub, and the Information Officer confirms the POPIA position on guide names.

## Part A: the Google Sheet and script
1. In your Google account, create a new Google Sheet named `Tour Timer (test)`.
2. Open Extensions › Apps Script. Rename the project `Tour Timer`.
3. Project Settings (gear icon): tick "Show appsscript.json manifest file in editor", and set the time zone to (GMT+02:00) Johannesburg. Tour times depend on this.
4. In the Editor, create three script files with + › Script, named `Core`, `Api` and `Code`. Replace the starter text in each with the matching file from `platform/apps-script/` in this repo.
5. Open `appsscript.json` and replace its contents with `platform/apps-script/appsscript.json`.
6. Save. Close the Apps Script tab and reload the Sheet. A Tour Timer menu appears after a few seconds.
7. Tour Timer › 1. Set up this Sheet. Allow the permissions it asks for (Sheet, Gmail to send the report, Drive to file reports, triggers for the daily report). "Unsafe" on the warning only means Google has not reviewed a script you wrote yourself.
8. Check the new tabs: Ops, Guides, Settings, Promo, Tours, Change log. Guides has four sample guides; Settings has a random admin code and phone key, and reportEmail set to your own address.
9. Tour Timer › 2. Turn on the daily report.
10. Deploy › New deployment: type Web app, execute as Me, access Anyone. Deploy and copy the Web app URL (ends in `/exec`). This is the only time you choose New deployment.
11. Open the URL in a browser. You should see `{"ok":true,"app":"Tour Timer",...}`. A sign-in page means access is not set to Anyone.
12. Add the deployment version to `CHANGELOG.md`.

## Part B: the pages on GitHub Pages
A free GitHub account serves Pages only from a public repo. The pages hold no codes, names, emails or keys, so that is acceptable for the test.
1. Create a repository named `tour-timer` and add this repo's files.
2. Edit `assets/config.js`: replace `PASTE_YOUR_WEB_APP_URL_HERE` with the Web app URL. Commit.
3. Settings › Pages › Deploy from a branch › main › / (root). Save.
4. After a minute or two the address appears at the top of the Pages screen.
5. In the Sheet's Settings tab, put that address in `pagesUrl`, without a slash at the end.
6. Tour Timer › Show the TV, phone and admin links. Copy the four links.

## Part C: the devices
| Device | Link | Set-up |
| --- | --- | --- |
| TV or stand-in screen | TV link | Open in the TV's browser and bookmark. Press OK on the remote once for full screen |
| Start point phone | Start point phone link | Open, then Add to Home screen. Keep on charge |
| End point phone | End point phone link | Same as the start point phone |
| Admin | Admin link | Any computer. Sign in with the admin code from the Settings tab |

TV options go on the TV link: `?theme=dark`, `?bright=1`, or both: `tv.html?theme=dark&bright=1`. Phone links contain the phone key: don't share them outside the team.

## Part D: what to test
With two phones and the TV, using the sample guide codes in the Guides tab:
- [ ] TV shows the next tour and counts down.
- [ ] Start phone: sign in, take the next tour, add guests. The TV shows the guide's name within 20 seconds.
- [ ] Start the tour. The TV shows the join countdown for tours open to walk-ins.
- [ ] End phone: the tour appears under "Out on tour now". End it with the guide's code.
- [ ] A wrong code is refused on both phones.
- [ ] Flight mode on, log a change: the pill shows "No signal · 1 waiting". Flight mode off: it syncs, and the change log shows when.
- [ ] Flight mode on, close and reopen the phone page: it opens, and the waiting change is still there.
- [ ] Admin: the report, the change log, and a settings change reach the TV and phones within a minute.
- [ ] Tour Timer › Load two weeks of sample history, then check "Last 7 days" on the admin page.
- [ ] Close today and send the report: the email arrives with a CSV and PDF, filed in Drive; the Tours and Change log tabs fill in.
- [ ] Leave the start phone idle for 2 minutes: it signs out.
- [ ] Note the TV's mobile data use for a full day.

Write down anything slow, unclear or wrong, with the time it happened.

## Part E: changing the code later
See `docs/runbook.md`, "Updating the code". The repo changes first; the Apps Script editor second.

## Part F: moving from test to live, after approval
1. Make a copy of the test Sheet in the organisation's Google account (File › Make a copy copies the script too).
2. In the copy: delete all rows below the header in Ops, Tours and Change log; put the real guides and codes in Guides; set a new adminCode; set reportEmail to an organisational address; clear phoneKey, then run 1. Set up this Sheet to make a new one.
3. Run 2. Turn on the daily report, then make a new web app deployment (Part A, step 10). Put the new URL in `assets/config.js`.
4. Set `environmentLabel` to `''` in `assets/config.js`.
5. Transfer the GitHub repository to the organisation's account (Settings › Transfer), or create it there. Update pagesUrl in the Settings tab.
6. Release as its own version in the CHANGELOG.

## Security and POPIA
| Topic | Position |
| --- | --- |
| Stored | Guide first names and codes; every change with the guide who made it; guest counts; booked group names or booking references. No guest names, phone numbers or emails |
| Who sees what | The TV shows tour times and guide first names only. Phones need the phone key; the admin page needs the admin code. Share the Sheet narrowly: it holds the codes |
| Codes | For attribution, not security. Someone with a phone link and technical skill could work out a 4-digit guide code. Keep the admin code to admin staff |
| Sample codes | The sample guide codes are written in `Code.gs`, which is public in this repo. Replace them in the Guides tab before go-live |
| Retention | The Ops tab grows by a few hundred rows a week. Agree an archive routine with the Information Officer, in line with the five-year retention rule |
| Open | The Information Officer to confirm the POPIA position on storing guide names before real names go in |
