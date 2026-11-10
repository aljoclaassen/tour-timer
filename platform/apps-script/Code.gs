/* Tour Timer: Google Sheet, Gmail and Drive connections, the web address the pages call, and the Tour Timer menu.
   Files in this project: Core.gs (a copy of assets/core.js), Api.gs, Code.gs. Set the project time zone to Johannesburg. */

const TABS = {
  ops: { name: 'Ops', head: ['Seq', 'Received', 'Day', 'Uid', 'Type', 'Actor', 'Change'] },
  guides: { name: 'Guides', head: ['Id', 'Name', 'Code', 'Active'] },
  settings: { name: 'Settings', head: ['Setting', 'Value', 'What it does'] },
  promo: { name: 'Promo', head: ['Message', 'Show', 'From', 'Until', 'Order'] },
  tours: { name: 'Tours', head: CSV_HEAD_LABELS() },
  log: { name: 'Change log', head: ['Date', 'Logged', 'Synced', 'Who', 'Action', 'Detail'] },
};
function CSV_HEAD_LABELS() { return ['date', 'slot', 'type', 'linked_slot', 'split', 'status', 'guide', 'public_guests', 'booked_guests', 'booked_group', 'self_guided', 'start_point', 'departure', 'return', 'duration_min', 'gathering_min', 'reason']; }

const SETTING_NOTES = {
  tourTimes: 'Scheduled tour times, comma separated, HH:MM. Admin can change these on the admin page.',
  joinWindowMin: 'Minutes the TV shows "you can still join" after a tour leaves (5 to 30).',
  autoSendTime: 'Time the daily report sends itself, HH:MM.',
  reportEmail: 'Where the daily report goes. Use an organisational address once live.',
  adminCode: 'Code for the admin page and phone overrides. 6 or more characters. Keep it private.',
  phoneKey: 'Secret part of the phone links. Use the menu to make a new one if a phone is lost.',
  salt: 'Used to protect guide codes on the phones. Do not change.',
  pagesUrl: 'Address of the pages on GitHub Pages, for example https://yourname.github.io/tour-timer',
};
const SAMPLE_GUIDES = [['g1', 'Thandi', '2481', 'Yes'], ['g2', 'Pieter', '3702', 'Yes'], ['g3', 'Lerato', '5196', 'Yes'], ['g4', 'Sam', '6043', 'Yes']];
const SAMPLE_PROMO = [['Tours leave every hour on the half hour', 'Yes', '', '', 1], ['[PROMO_MESSAGE]', 'Yes', '', '', 2], ['Please stay on the paths and follow your guide', 'Yes', '', '', 3]];
const REPORT_FOLDER = 'Tour Timer reports';

// ---------- web address ----------
function doGet() { return json({ ok: true, app: 'Tour Timer', serverTime: Date.now() }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e && e.postData ? e.postData.contents : ''); } catch (err) { return json({ ok: false, error: 'The request could not be read.' }); }
  return json(apiHandle(req, sheetStore()));
}
const json = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);

// ---------- the Sheet as the store ----------
function sheetStore() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone();
  const tab = key => ss.getSheetByName(TABS[key].name);
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const asDay = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  const asText = v => v instanceof Date ? Utilities.formatDate(v, tz, 'HH:mm') : String(v).trim();
  let settingsMemo = null;

  const rowsToOps = rows => rows.filter(r => r[0] !== '' && r[6]).map(r => {
    const op = JSON.parse(r[6]); op.seq = Number(r[0]); return op;
  });
  const readOps = (startRow) => {
    const sh = tab('ops'), last = sh.getLastRow();
    if (last < startRow) return [];
    return sh.getRange(startRow, 1, last - startRow + 1, 7).getValues();
  };
  const todayStartRow = () => Number(props.getProperty(`firstRow:${dayKey(Date.now())}`)) || 0;

  return {
    now: () => Date.now(),
    settings() {
      if (settingsMemo) return settingsMemo;
      const map = {};
      tab('settings').getDataRange().getValues().slice(1).forEach(r => { if (r[0]) map[String(r[0]).trim()] = r[1]; });
      const times = asText(map.tourTimes || '').split(/[,\s]+/).filter(Boolean).map(t => t.length === 4 ? `0${t}` : t).sort();
      settingsMemo = {
        tourTimes: times.length ? times : CONFIG.tourTimes, joinWindowMin: Number(map.joinWindowMin) || CONFIG.joinWindowMin,
        autoSendTime: asText(map.autoSendTime || CONFIG.autoSendTime), reportEmail: String(map.reportEmail || '').trim(),
        adminCode: String(map.adminCode || '').trim(), phoneKey: String(map.phoneKey || '').trim(), salt: String(map.salt || '').trim(),
        pagesUrl: String(map.pagesUrl || '').trim().replace(/\/+$/, ''),
      };
      return settingsMemo;
    },
    saveSettings(n) {
      const sh = tab('settings'), rows = sh.getDataRange().getValues();
      const set = (key, value) => { const i = rows.findIndex(r => String(r[0]).trim() === key); if (i > 0) sh.getRange(i + 1, 2).setValue(value); };
      set('tourTimes', n.tourTimes.join(', ')); set('joinWindowMin', n.joinWindowMin); set('autoSendTime', n.autoSendTime); set('reportEmail', n.reportEmail);
      settingsMemo = null;
    },
    guides() {
      return tab('guides').getDataRange().getValues().slice(1).filter(r => r[0] && r[1])
        .map(r => ({ id: String(r[0]).trim(), name: String(r[1]).trim(), code: String(r[2]).trim(), active: String(r[3]).trim().toLowerCase() !== 'no' }));
    },
    opsForDays(from, to) {
      return rowsToOps(readOps(2).filter(r => { const d = asDay(r[2]); return d >= from && d <= to; }));
    },
    opsSince(day, since) {
      const first = todayStartRow();
      if (day !== dayKey(Date.now())) return this.opsForDays(day, day).filter(op => op.seq > since);
      if (!first) return [];
      return rowsToOps(readOps(first).filter(r => asDay(r[2]) === day && Number(r[0]) > since));
    },
    uidsSince() {
      const sh = tab('ops'), last = sh.getLastRow(), seen = {};
      if (last < 2) return seen;
      const start = Math.max(2, last - 3000);
      sh.getRange(start, 4, last - start + 1, 1).getValues().forEach(r => { if (r[0]) seen[r[0]] = true; });
      return seen;
    },
    append(ops) {
      const sh = tab('ops');
      let seq = Number(props.getProperty('nextSeq')) || 1;
      const rows = ops.map(op => [seq++, new Date(), op.day, op.uid, op.type, op.actor, JSON.stringify(op)]);
      const start = sh.getLastRow() + 1;
      sh.getRange(start, 3, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, rows.length, 7).setValues(rows);
      props.setProperty('nextSeq', String(seq));
      const key = `firstRow:${dayKey(Date.now())}`;
      if (!props.getProperty(key)) props.setProperty(key, String(start));
    },
    withLock(fn) {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return fn(); } finally { lock.releaseLock(); }
    },
    promo(day) {
      const sh = tab('promo');
      if (!sh || sh.getLastRow() < 2) return [];
      return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
        .filter(r => String(r[0]).trim() && String(r[1]).trim().toLowerCase() === 'yes')
        .filter(r => (!r[2] || asDay(r[2]) <= day) && (!r[3] || asDay(r[3]) >= day))
        .sort((a, b) => (Number(a[4]) || 99) - (Number(b[4]) || 99)).map(r => String(r[0]).trim().slice(0, 120));
    },
    newToken: () => Utilities.getUuid().replace(/-/g, ''),
    tokenPut(token, hours) { cache.put(`adm:${token}`, '1', Math.min(21600, hours * 3600)); },
    tokenOk: token => /^[a-f0-9]{32}$/.test(token) && cache.get(`adm:${token}`) === '1',
    sendReport(day, files, st, s) {
      const pdf = Utilities.newBlob(files.html, 'text/html', `tour-report-${day}.html`).getAs('application/pdf').setName(`tour-report-${day}.pdf`);
      const csv = Utilities.newBlob(files.csv, 'text/csv', `tour-report-${day}.csv`);
      MailApp.sendEmail({ to: st.reportEmail, subject: files.subject, htmlBody: files.html, attachments: [csv, pdf], name: 'Tour Timer' });
      const folder = reportFolder(day);
      [`tour-report-${day}.csv`, `tour-report-${day}.pdf`].forEach(name => { const it = folder.getFilesByName(name); while (it.hasNext()) it.next().setTrashed(true); });
      folder.createFile(csv); folder.createFile(pdf);
      writeDayViews(day, s);
    },
  };
}

// Reports are filed in Drive as Tour Timer reports / year / month.
function reportFolder(day) {
  const [y, m] = day.split('-');
  const sub = (parent, name) => { const it = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : (parent ? parent.createFolder(name) : DriveApp.createFolder(name)); };
  return sub(sub(sub(null, REPORT_FOLDER), y), `${m} ${MONTHS[Number(m) - 1]}`);
}

// Rewrites one day's rows in the readable Tours and Change log tabs.
function writeDayViews(day, s) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone();
  const v = dayViewRows(s, day);
  [[TABS.tours, v.tours], [TABS.log, v.changes]].forEach(([def, rows]) => {
    const sh = ss.getSheetByName(def.name);
    const all = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, def.head.length).getValues() : [];
    const keep = all.filter(r => (r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0])) !== day);
    const out = keep.concat(rows).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (all.length) sh.getRange(2, 1, all.length, def.head.length).clearContent();
    if (out.length) { sh.getRange(2, 1, out.length, def.head.length).setNumberFormat('@').setValues(out); }
  });
}

// ---------- the daily trigger ----------
function autoReport() {
  const res = apiAutoReport(sheetStore());
  if (!res.ok) console.warn(`Daily report not sent: ${res.error}`);
}

// ---------- menu ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tour Timer')
    .addItem('1. Set up this Sheet', 'setupSheet')
    .addItem('2. Turn on the daily report', 'installTriggers')
    .addItem('Show the TV, phone and admin links', 'showLinks')
    .addSeparator()
    .addItem('Send today’s report now', 'sendReportNow')
    .addItem('Load two weeks of sample history', 'loadSampleHistory')
    .addItem('Remove the sample history', 'removeSampleHistory')
    .addItem('Make a new phone link (lost phone)', 'newPhoneKey')
    .addToUi();
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
  Object.keys(TABS).forEach(key => {
    const def = TABS[key];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  });
  const ops = ss.getSheetByName(TABS.ops.name);
  ops.getRange('C:C').setNumberFormat('@');
  if (!ops.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) ops.protect().setDescription('Tour Timer data: do not edit or delete rows').setWarningOnly(true);
  const guides = ss.getSheetByName(TABS.guides.name);
  guides.getRange('A:C').setNumberFormat('@');
  if (guides.getLastRow() < 2) guides.getRange(2, 1, SAMPLE_GUIDES.length, 4).setValues(SAMPLE_GUIDES);
  const promo = ss.getSheetByName(TABS.promo.name);
  if (promo.getLastRow() < 2) promo.getRange(2, 1, SAMPLE_PROMO.length, 5).setValues(SAMPLE_PROMO);
  const settings = ss.getSheetByName(TABS.settings.name);
  settings.getRange('B:B').setNumberFormat('@');
  const have = settings.getDataRange().getValues().map(r => String(r[0]).trim());
  const defaults = { tourTimes: CONFIG.tourTimes.join(', '), joinWindowMin: String(CONFIG.joinWindowMin), autoSendTime: CONFIG.autoSendTime,
    reportEmail: Session.getActiveUser().getEmail() || '', adminCode: randomDigits(6), phoneKey: randomKey(24), salt: randomKey(16), pagesUrl: '' };
  Object.keys(defaults).filter(k => !have.includes(k)).forEach(k => settings.appendRow([k, defaults[k], SETTING_NOTES[k]]));
  ['Tours', 'Change log'].forEach(n => ss.getSheetByName(n).getRange('A:A').setNumberFormat('@'));
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  const tz = Session.getScriptTimeZone();
  ui.alert('Tour Timer is set up',
    `Tabs created: Ops, Guides, Settings, Promo, Tours, Change log.\n\nThe admin code is in the Settings tab. The four guides are sample names with sample codes: change them in the Guides tab when you go live.\n\n${tz === 'Africa/Johannesburg' ? 'Time zone: Johannesburg. Good.' : `Warning: the script time zone is ${tz}. Set it to (GMT+02:00) Johannesburg in Project Settings, or tour times will be wrong.`}\n\nNext: Tour Timer menu > 2. Turn on the daily report.`, ui.ButtonSet.OK);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('autoReport').timeBased().everyMinutes(15).create();
  const st = sheetStore().settings();
  SpreadsheetApp.getUi().alert('Daily report is on', `The report sends itself once a day at or soon after ${st.autoSendTime} to ${st.reportEmail || '(no address set: add one in Settings)'}.`, SpreadsheetApp.getUi().ButtonSet.OK);
}

function showLinks() {
  const st = sheetStore().settings(), ui = SpreadsheetApp.getUi();
  if (!st.pagesUrl) { ui.alert('Add the pages address first', 'Put your GitHub Pages address in the pagesUrl row of the Settings tab, then try again.', ui.ButtonSet.OK); return; }
  const key = encodeURIComponent(st.phoneKey), b = st.pagesUrl;
  const links = [['TV', `${b}/tv.html`], ['Start point phone', `${b}/phone.html?key=${key}#start`], ['End point phone', `${b}/phone.html?key=${key}#end`], ['Admin', `${b}/admin.html`]];
  const html = HtmlService.createHtmlOutput(`<div style="font-family:Arial,sans-serif;font-size:13px">${links.map(([n, u]) => `<p><b>${n}</b><br><input style="width:100%" readonly value="${u}" onclick="this.select()"></p>`).join('')}
    <p>Open each link on its device and bookmark it, or add it to the home screen. The phone links contain a secret key: don't share them outside the team.</p></div>`).setWidth(560).setHeight(360);
  ui.showModalDialog(html, 'Tour Timer links');
}

function sendReportNow() {
  const store = sheetStore(); loadGuides(store);
  const res = sendDailyReport(store, dayKey(Date.now()), false);
  SpreadsheetApp.getUi().alert(res.ok ? `Report sent to ${res.sentTo}.` : res.error);
}

function loadSampleHistory() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Load sample history?', 'This adds two weeks of made-up tours before today, using the guides in the Guides tab, so the admin report has something to show. Use it on a test Sheet only.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const store = sheetStore(); loadGuides(store);
  if (CONFIG.guides.length < 2) { ui.alert('Add at least two active guides in the Guides tab first.'); return; }
  const existing = store.uidsSince();
  if (existing['sample-1']) { ui.alert('Sample history is already loaded.'); return; }
  const ops = sampleOps(dayKey(Date.now()));
  store.withLock(() => store.append(ops));
  ui.alert(`Loaded ${ops.length} sample changes.`);
}

function removeSampleHistory() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Remove the sample history?', 'This deletes only the made-up sample rows from the Ops tab.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.ops.name);
  sheetStore().withLock(() => {
    const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues() : [];
    const keep = vals.filter(r => !String(r[3]).startsWith('sample-'));
    if (vals.length) sh.getRange(2, 1, vals.length, 7).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, 7).setValues(keep);
    // Today's first row moves when rows above it are removed.
    const props = PropertiesService.getScriptProperties(), today = dayKey(Date.now());
    const i = keep.findIndex(r => r[1] instanceof Date && dayKey(r[1].getTime()) === today);
    if (i >= 0) props.setProperty(`firstRow:${today}`, String(i + 2)); else props.deleteProperty(`firstRow:${today}`);
    ui.alert(`Removed ${vals.length - keep.length} sample rows.`);
  });
}

function newPhoneKey() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Make a new phone link?', 'Both phones stop working until they open the new links. Use this if a phone is lost or a link was shared.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.settings.name), rows = sh.getDataRange().getValues();
  const i = rows.findIndex(r => String(r[0]).trim() === 'phoneKey');
  sh.getRange(i + 1, 2).setValue(randomKey(24));
  showLinks();
}

function randomKey(n) { const c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function randomDigits(n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
