/* Tour Timer API: what the TV, phones and admin page can ask the server for.
   This file has no Google services in it, so it can be tested on its own. Code.gs connects it to the Sheet, Gmail and Drive.
   Needs Core.gs (a copy of assets/core.js). */

const API = {
  maxOpsPerSync: 100,
  pastDaysAllowed: 3,          // a phone without signal can still sync changes up to this old
  offlineAfterMs: 60 * 1000,   // a change that reaches the server later than this is marked as synced late
  tokenHours: 6,               // admin sign-in lasts this long (Google's cache keeps it 6 hours at most)
  maxRangeDays: 366,
};

const RE = {
  uid: /^[A-Za-z0-9_-]{6,64}$/,
  id: /^[A-Za-z0-9_-]{1,64}$/,
  day: /^\d{4}-\d{2}-\d{2}$/,
  hm: /^([01]\d|2[0-3]):[0-5]\d$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

// Routes one request. Every answer is { ok: true, ... } or { ok: false, error }.
function apiHandle(req, store) {
  try {
    if (!req || typeof req !== 'object') return fail('The request was empty.');
    loadGuides(store);
    if (req.action === 'tv') return apiTv(store);
    if (req.action === 'phone') return apiPhone(req, store);
    if (req.action === 'admin') return apiAdmin(req, store);
    if (req.action === 'ping') return { ok: true, app: 'Tour Timer', serverTime: store.now() };
    return fail('Unknown request.');
  } catch (e) {
    return fail(`Something went wrong on the server: ${e && e.message ? e.message : e}`);
  }
}

const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

// ---------- shared ----------
function loadGuides(store) {
  CONFIG.guides = store.guides().filter(g => g.active).map(g => ({ id: g.id, name: g.name }));
}

function publicSettings(st) {
  return { tourTimes: st.tourTimes, joinWindowMin: st.joinWindowMin, autoSendTime: st.autoSendTime };
}

function todayKey(store) { return dayKey(store.now()); }

function stateFor(store, from, to) {
  return buildState(store.opsForDays(from, to), store.settings());
}

// ---------- TV: status only, no counts, groups, reasons or codes ----------
function apiTv(store) {
  const today = todayKey(store), st = store.settings();
  const s = buildState(store.opsSince(today, 0), st);
  const tours = s.tours.filter(t => t.date === today).map(t => ({
    id: t.id, date: t.date, slot: t.slot, type: t.type, status: t.status, guideId: t.guideId, start: t.start, plannedAt: t.plannedAt,
    walkIns: t.walkIns, startFrom: t.startFrom, splitId: t.splitId, splitLabel: t.splitLabel, relatedSlot: t.relatedSlot }));
  return { ok: true, serverTime: store.now(), settings: publicSettings(st), guides: CONFIG.guides, tours, promo: store.promo(today) };
}

// ---------- phones: send queued changes, get today's changes back ----------
function apiPhone(req, store) {
  const st = store.settings();
  if (!st.phoneKey || req.key !== st.phoneKey) return fail('This phone link is not valid. Ask the admin for the current phone link.', { code: 'bad-key' });
  const today = todayKey(store), since = Number(req.since) || 0;
  const incoming = Array.isArray(req.ops) ? req.ops.slice(0, API.maxOpsPerSync) : [];
  const accepted = [], rejected = [];
  if (incoming.length) {
    store.withLock(() => {
      const seen = store.uidsSince(addDays(today, -API.pastDaysAllowed));
      const clean = [];
      incoming.forEach(op => {
        if (op && seen[op.uid]) { accepted.push(op.uid); return; } // a retry of a change the server already has
        const err = validateOp(op, store.now(), false);
        if (err) { rejected.push({ uid: op && op.uid, error: err }); return; }
        const c = cleanOp(op);
        if (store.now() - c.ts > API.offlineAfterMs) c.syncedAt = store.now();
        seen[c.uid] = true; clean.push(c); accepted.push(c.uid);
      });
      if (clean.length) store.append(clean);
    });
  }
  const ops = store.opsSince(today, since);
  const guides = store.guides().filter(g => g.active).map(g => ({ id: g.id, name: g.name, hash: codeHash(st.salt, g.code) }));
  return { ok: true, serverTime: store.now(), day: today, accepted, rejected, ops, settings: publicSettings(st), guides,
    salt: st.salt, adminHash: codeHash(st.salt, st.adminCode) };
}

// Field rules for each change a phone can send. Anything not listed is dropped.
const FIELD = {
  uid: v => RE.uid.test(v), type: v => typeof v === 'string', ts: v => typeof v === 'number', actor: v => typeof v === 'string', day: v => RE.day.test(v),
  tourId: v => RE.id.test(v), newId: v => RE.id.test(v), date: v => RE.day.test(v), slot: v => RE.hm.test(v),
  relatedSlot: v => v === null || RE.hm.test(v), pub: v => isCount(v), booked: v => isCount(v), selfGuided: v => isCount(v),
  group: v => isText(v, 80), reason: v => isText(v, 300), kind: v => v in CONFIG.kinds, startFrom: v => v in CONFIG.points,
  endAt: v => v in CONFIG.points, mode: v => v in CONFIG.points, tourType: v => CONFIG.extraTypes.includes(v),
  time: v => typeof v === 'number', start: v => typeof v === 'number', end: v => v === null || typeof v === 'number', plannedAt: v => typeof v === 'number',
  pending: v => typeof v === 'boolean', value: v => typeof v === 'boolean', override: v => typeof v === 'boolean',
  to: v => isGuide(v), guideId: v => isGuide(v), order: v => Array.isArray(v) && v.length <= 30 && v.every(isGuide),
};
const OP_FIELDS = {
  claim: ['tourId', 'date', 'slot'],
  createExtra: ['tourId', 'date', 'tourType', 'relatedSlot', 'group', 'reason', 'plannedAt', 'startFrom', 'kind', 'guideId'],
  counts: ['tourId', 'kind', 'pub', 'booked', 'selfGuided', 'group'],
  split: ['tourId', 'newId', 'to', 'pub', 'booked', 'startFrom'],
  walkins: ['tourId', 'value'],
  start: ['tourId', 'time', 'reason', 'pending', 'startFrom', 'kind', 'pub', 'booked', 'group'],
  details: ['tourId', 'kind', 'pub', 'booked', 'group', 'selfGuided', 'reason'],
  end: ['tourId', 'time', 'endAt', 'kind', 'pub', 'booked', 'group', 'selfGuided', 'reason'],
  noTour: ['tourId', 'date', 'slot', 'reason', 'selfGuided'],
  handover: ['tourId', 'to', 'override', 'reason'],
  correct: ['tourId', 'start', 'end', 'kind', 'pub', 'booked', 'group', 'selfGuided', 'reason'],
  order: ['date', 'order'],
  mode: ['mode'],
};
const REQUIRED = { claim: ['tourId', 'date', 'slot'], createExtra: ['tourId', 'date', 'tourType', 'plannedAt'], counts: ['tourId'],
  split: ['tourId', 'newId', 'to', 'pub', 'booked'], walkins: ['tourId', 'value'], start: ['tourId', 'time'], details: ['tourId'],
  end: ['tourId', 'time'], noTour: ['tourId', 'date', 'reason'], handover: ['tourId', 'to'], correct: ['tourId', 'reason'],
  order: ['date', 'order'], mode: ['mode'] };

function isCount(v) { return Number.isInteger(v) && v >= 0 && v <= CONFIG.maxGuests; }
function isText(v, max) { return typeof v === 'string' && v.length <= max; }
function isGuide(v) { return CONFIG.guides.some(g => g.id === v); }

function validateOp(op, nowMs, fromAdmin) {
  if (!op || typeof op !== 'object') return 'The change was empty.';
  if (!RE.uid.test(op.uid || '')) return 'The change had no valid id.';
  const fields = OP_FIELDS[op.type];
  if (!fields) return `"${op.type}" is not a change a phone can send.`;
  if (typeof op.ts !== 'number' || op.ts < nowMs - API.pastDaysAllowed * 24 * 3600000 || op.ts > nowMs + 2 * MIN) return 'The change has a time outside the allowed window. Check the phone clock.';
  if (!RE.day.test(op.day || '')) return 'The change had no valid date.';
  if (!(isGuide(op.actor) || (op.actor === 'admin' && (fromAdmin || op.type === 'handover' || op.type === 'mode')))) return 'The change named a guide who is not in the Guides tab.';
  for (const k of REQUIRED[op.type]) if (op[k] === undefined || op[k] === null || op[k] === '') return `The change is missing ${k}.`;
  for (const k of fields) if (op[k] !== undefined && op[k] !== null && !FIELD[k](op[k])) return `The change has an invalid ${k}.`;
  for (const k of ['time', 'start', 'end', 'plannedAt']) if (typeof op[k] === 'number' && (op[k] < nowMs - (API.pastDaysAllowed + 1) * 24 * 3600000 || op[k] > nowMs + 24 * 3600000)) return `The change has an invalid ${k}.`;
  return '';
}

function cleanOp(op) {
  const c = { uid: op.uid, type: op.type, ts: op.ts, actor: op.actor, day: op.day };
  OP_FIELDS[op.type].forEach(k => { if (op[k] !== undefined) c[k] = typeof op[k] === 'string' ? op[k].trim() : op[k]; });
  return c;
}

// ---------- admin ----------
function apiAdmin(req, store) {
  const st = store.settings();
  if (req.op === 'signin') {
    if (!st.adminCode || String(req.code || '').trim() !== String(st.adminCode)) return fail("That admin code isn't right. Try again.");
    const token = store.newToken();
    store.tokenPut(token, API.tokenHours);
    return { ok: true, token };
  }
  if (!req.token || !store.tokenOk(req.token)) return fail('Your admin session has ended. Sign in again.', { code: 'signed-out' });
  const today = todayKey(store);
  if (req.op === 'data') {
    const from = req.from, to = req.to;
    if (!RE.day.test(from || '') || !RE.day.test(to || '') || from > to) return fail('Choose a valid date range.');
    if (daysIn(from, to).length > API.maxRangeDays) return fail('Choose a range of one year or less.');
    const ops = store.opsForDays(from < today ? from : today, to > today ? to : today);
    return { ok: true, serverTime: store.now(), today, ops, settings: { ...publicSettings(st), reportEmail: st.reportEmail }, guides: CONFIG.guides };
  }
  if (req.op === 'settings') return adminSettings(req.settings || {}, store, st, today);
  if (req.op === 'closeDay') {
    const day = req.date || today;
    if (!RE.day.test(day) || day > today) return fail('Choose today or an earlier day.');
    return sendDailyReport(store, day, false);
  }
  return fail('Unknown admin request.');
}

function adminSettings(n, store, old, today) {
  const times = Array.isArray(n.tourTimes) ? [...new Set(n.tourTimes)].sort() : [];
  if (!times.length || times.length > 24 || !times.every(t => RE.hm.test(t))) return fail('Add at least one tour time, each as HH:MM.');
  const join = Number(n.joinWindowMin);
  if (!Number.isInteger(join) || join < CONFIG.joinWindowLimits[0] || join > CONFIG.joinWindowLimits[1]) return fail(`Set the join window between ${CONFIG.joinWindowLimits[0]} and ${CONFIG.joinWindowLimits[1]} minutes.`);
  if (!RE.hm.test(n.autoSendTime || '')) return fail('Enter the automatic report time as HH:MM.');
  const email = String(n.reportEmail || '').trim();
  if (!RE.email.test(email)) return fail('Enter a valid email address, for example tours@example.org.');
  const parts = [];
  if (times.join() !== old.tourTimes.join()) parts.push(`tour times ${old.tourTimes.join(', ')} → ${times.join(', ')}`);
  if (join !== old.joinWindowMin) parts.push(`join window ${old.joinWindowMin} → ${join} min`);
  if (n.autoSendTime !== old.autoSendTime) parts.push(`report time ${old.autoSendTime} → ${n.autoSendTime}`);
  if (email !== old.reportEmail) parts.push(`report email ${old.reportEmail || 'not set'} → ${email}`);
  if (!parts.length) return { ok: true, changed: false, settings: { ...publicSettings(old), reportEmail: old.reportEmail } };
  store.withLock(() => {
    store.saveSettings({ tourTimes: times, joinWindowMin: join, autoSendTime: n.autoSendTime, reportEmail: email });
    store.append([{ uid: `set${store.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type: 'settings', ts: store.now(), actor: 'admin', day: today, detail: parts.join('; ') }]);
  });
  const st = store.settings();
  return { ok: true, changed: true, settings: { ...publicSettings(st), reportEmail: st.reportEmail } };
}

// ---------- daily report ----------
// Runs from the 15-minute trigger: sends today's report once, at or after the report time.
function apiAutoReport(store) {
  loadGuides(store);
  const st = store.settings(), today = todayKey(store);
  if (store.now() < at(today, st.autoSendTime)) return { ok: true, sent: false, why: 'Not report time yet.' };
  const s = stateFor(store, today, today);
  if (s.closedDays[today]) return { ok: true, sent: false, why: 'Already sent today.' };
  return sendDailyReport(store, today, true);
}

function sendDailyReport(store, day, auto) {
  const st = store.settings();
  if (!RE.email.test(st.reportEmail || '')) return fail('Set a report email address in Settings first.');
  const s = stateFor(store, day, day);
  const files = reportFiles(s, day, st, store.now());
  store.sendReport(day, files, st, s);
  store.withLock(() => store.append([{ uid: `close${store.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type: 'closeDay', ts: store.now(), actor: 'admin', day, date: day, auto: !!auto }]));
  return { ok: true, sent: true, sentTo: st.reportEmail, day };
}

// The email body, the PDF and the CSV for one day.
function reportFiles(s, day, st, nowMs) {
  // A report sent early counts only the slots that have already passed.
  const r = computeReport(s, day, day, day === dayKey(nowMs) ? nowMs : at(day, '23:59'));
  const e = v => esc(v);
  const row = cells => `<tr>${cells.map((c, i) => `<td style="padding:6px 10px;border-bottom:1px solid #d2d2d2;${i && typeof c === 'number' ? 'text-align:right;' : ''}">${c}</td>`).join('')}</tr>`;
  const head = cells => `<tr>${cells.map(c => `<th style="padding:6px 10px;border-bottom:2px solid #000;text-align:left;color:#605c62;font-weight:600">${c}</th>`).join('')}</tr>`;
  const table = (h, rows) => rows.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 18px">${head(h)}${rows.join('')}</table>` : '<p style="color:#605c62">None.</p>';
  const tile = (label, value, sub) => `<td style="padding:10px 12px;border:1px solid #d2d2d2;vertical-align:top"><div style="font-size:12px;color:#605c62">${label}</div><div style="font-size:22px;font-weight:600">${value}</div>${sub ? `<div style="font-size:12px;color:#605c62">${sub}</div>` : ''}</td>`;
  const typeCell = x => x.status === 'no-tour' ? 'No tour' : e(x.type) + (x.splitLabel ? ` ${x.splitLabel}` : '') + (x.relatedSlot ? ` (${x.relatedSlot})` : '');
  const html = `<meta charset="utf-8"><div style="font-family:'Gill Sans Nova','Gill Sans MT','Gill Sans',Arial,sans-serif;color:#000;max-width:760px">
  <div style="background:#ecba47;padding:14px 18px;margin-bottom:16px"><div style="font-size:13px">Cango Wildlife · Tour Timer</div>
  <div style="font-size:22px;font-weight:600">Daily tour report, ${fmtDate(day)}</div></div>
  ${r.pending.length ? `<p style="background:#fbefd6;padding:10px 12px">${r.pending.length} tour${r.pending.length > 1 ? 's' : ''} still need details and ${r.pending.length > 1 ? 'are' : 'is'} not in these figures: ${r.pending.map(x => `${e(tourLabel(x))} (${e(guideName(x.guideId))})`).join(', ')}.</p>` : ''}
  <table style="border-collapse:separate;border-spacing:6px;width:100%;margin:0 -6px 12px"><tr>
    ${tile('Tours run', r.run.length)}${tile('Guests on tour', r.guests, `${r.pub} public · ${r.booked} booked`)}${tile('Average group', fmtNum(r.avgGroup) || 'None')}${tile('Average tour length', fmtMinutes(r.avgDur) || 'None')}
  </tr><tr>
    ${tile('Average gathering time', fmtMinutes(r.avgGather) || 'None', 'First guest to departure')}${tile('Chose self-guided', r.self, 'Not in tour averages')}${tile('No-tour slots', r.noTour.length)}${tile('Slots not logged', r.unlogged.length)}
  </tr></table>
  <h3 style="font-size:16px;margin:8px 0">Booked groups</h3>
  ${table(['Group or company', 'Departed', 'Booked guests', 'Public added', 'Guide'], r.groups.map(g => row([`<b>${e(g.group)}</b>${g.split ? ' · split over two tours' : ''}`, `${fmtTime(g.start)}${g.slot ? ` (${g.slot} slot)` : ''}`, g.booked, g.pub, e(g.guides.join(' and '))])))}
  <h3 style="font-size:16px;margin:8px 0">By guide</h3>
  ${table(['Guide', 'Tours', 'Guests', 'Average length'], r.byGuide.map(g => row([e(g.name), g.tours, g.guests, fmtMinutes(g.avg)])))}
  <h3 style="font-size:16px;margin:8px 0">Exceptions and reasons</h3>
  ${table(['Time', 'Type', 'Guide', 'Guests', 'Reason'], r.unlogged.map(u => row([u.slot, 'Not logged', '', '', 'Nobody recorded this slot']))
    .concat(r.exceptions.map(x => row([x.status === 'no-tour' ? x.slot || '' : fmtTime(x.start), typeCell(x), x.guideId ? e(guideName(x.guideId)) : '', x.status === 'no-tour' ? '' : guestsOf(x), e(x.reason)]))))}
  <p style="font-size:12px;color:#605c62;margin-top:18px">The CSV attached has every tour. Sent ${fmtTime(nowMs)} to ${e(st.reportEmail)}. Guide names are personal information: keep this report inside the organisation.</p></div>`;
  return { subject: `Tour report ${fmtDate(day)}: ${r.run.length} tours, ${r.guests} guests`, html, csv: csvFor(s, day, day) };
}

// Rows for the readable Tours and Change log tabs.
function dayViewRows(s, day) {
  const tours = csvRows(s, day, day).map(r => r.map(csvSafe));
  const changes = s.changes.filter(c => dayKey(c.ts) === day).sort((a, b) => a.ts - b.ts)
    .map(c => [day, fmtTime(c.ts), c.syncedAt ? fmtTime(c.syncedAt) : '', guideName(c.actor), c.action, csvSafe(c.detail)]);
  return { tours, changes };
}
