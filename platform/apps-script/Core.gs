/* Tour Timer core: shared by the TV, phone and admin pages and by the Google Apps Script back end.
   Copy this file unchanged into the Apps Script project as Core.gs whenever it changes.
   It holds the rules for tours (one op per change), the report, the CSV and the TV status. No page code. */

// ===================== CONFIG: behaviour defaults =====================
// Pages add display settings and the web app address in config.js. Guides come from the Sheet.
const CONFIG = {
  tourTimes: ['08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30'],
  joinWindowMin: 15,          // TV shows "you can still join" this long after departure
  joinWindowLimits: [5, 30],
  preCallMin: 5,              // TV calls guests to the gathering area this long before a tour
  claimOpenMin: 60,           // a scheduled tour can be taken this long before it starts
  startGraceMin: 5,           // leaving within this of the slot needs no reason
  dueSoonMin: 30,             // "No tour" appears this close to an unclaimed slot
  maxGuests: 80,
  autoSendTime: '17:00',
  reportEmail: '',
  guides: [],                 // filled from the Guides tab: { id, name } and, on phones, a code hash
  extraTypes: ['Extra', 'Booked', 'Emergency'],
  lateReasons: ['Guests watching a cheetah walk', 'Waiting for a booked group', 'Waiting for late arrivals'],
  noTourReasons: ['No guests', 'Guests chose self-guided', 'Weather', 'Animal welfare', 'Staff unavailable', 'Other'],
  sampleGroups: ['Sample Primary School', 'Example Travel Co.', 'Demo Seniors Club', 'Sample Coach Tours'],
  points: { start: 'Start point', end: 'End point' },
  kinds: { public: 'Public', booked: 'Booked group', both: 'Both' },
  splitColours: 4,
  historyDays: 13,            // days of sample history the Sheet menu can load
};
// =======================================================================

const MIN = 60000;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pad = n => String(n).padStart(2, '0');
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const at = (key, hm) => { const [y, m, d] = key.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
const fmtTime = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = key => { const [y, m, d] = key.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); };
const fmtMinutes = min => { if (min == null || isNaN(min)) return ''; min = Math.round(min); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${pad(min % 60)} min`; };
const fmtCountdown = ms => { let s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guideName = id => (CONFIG.guides.find(g => g.id === id) || {}).name || (id === 'admin' ? 'Admin' : 'Unknown');
const sortTimes = arr => [...arr].sort();
const guestsOf = t => (t.pub || 0) + (t.booked || 0);
const clampGuests = n => Math.max(0, Math.min(CONFIG.maxGuests, n));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- clock and ids ----------
// clockOffset corrects a device whose clock is wrong, using the server's time.
let clockOffset = 0;
const now = () => Date.now() + clockOffset;
let uid = 0;
const DEVICE_TAG = Math.random().toString(36).slice(2, 6);
// Ids are unique across devices, so two phones never create the same tour id.
const newId = p => `${p}${DEVICE_TAG}${Date.now().toString(36)}${++uid}`;

function freshServer(settings) {
  const st = settings || {};
  return { settings: { tourTimes: [...(st.tourTimes || CONFIG.tourTimes)], joinWindowMin: st.joinWindowMin || CONFIG.joinWindowMin,
    reportEmail: st.reportEmail || CONFIG.reportEmail, autoSendTime: st.autoSendTime || CONFIG.autoSendTime },
    tours: [], changes: [], closedDays: {}, orders: {} };
}

function tourLabel(t) {
  if (t.slot) return `${t.slot} tour${t.splitLabel ? ` (split ${t.splitLabel})` : ''}`;
  if (t.splitLabel) return `${t.relatedSlot || fmtTime(t.plannedAt)} tour (split ${t.splitLabel})`;
  const base = t.type === 'Booked' ? `booked tour${t.group ? ` (${t.group})` : ''}` : `${t.type.toLowerCase()} tour`;
  const time = t.start || t.plannedAt;
  return time ? `${base} at ${fmtTime(time)}` : base;
}
function guestText(t) {
  const g = guestsOf(t);
  if (t.booked && t.pub) return `${g} guests (${t.pub} public, ${t.booked} booked)`;
  return t.booked ? `${g} booked guests` : `${g} guests`;
}
function scheduledType(date, slot, time) {
  const diff = (time - at(date, slot)) / MIN;
  if (diff < -CONFIG.startGraceMin) return 'Early start';
  if (diff > CONFIG.startGraceMin) return 'Late start';
  return 'Scheduled';
}
const rowTime = t => t.start ?? t.plannedAt ?? t.claimedAt;
// Both halves of a split sit at their slot's time, so 14:30 shows as two 14:30 cards.
const shownTime = t => t.slot || (t.splitLabel && t.relatedSlot) || fmtTime(rowTime(t));

// Every change goes through one op, so a phone can queue it without signal and the change log stays complete.
function applyOp(s, op, syncedAt) {
  const log = (action, detail) => s.changes.push({ id: newId('c'), ts: op.ts, syncedAt: syncedAt ?? null, actor: op.actor, action, detail });
  const find = id => s.tours.find(t => t.id === id);
  const blank = { pending: false, relatedSlot: null, pub: 0, booked: 0, group: '', selfGuided: 0, firstGuestAt: null, start: null, end: null, reason: '',
    kind: 'public', startFrom: 'start', walkIns: false, splitId: null, splitLabel: '', splitColour: 0, plannedAt: null };
  switch (op.type) {
    case 'claim': {
      const taken = s.tours.find(t => t.date === op.date && t.slot === op.slot);
      if (taken) { log('Not applied', `The ${op.slot} tour was already taken by ${guideName(taken.guideId)}`); return; }
      s.tours.push({ ...blank, id: op.tourId, date: op.date, slot: op.slot, type: 'Scheduled', guideId: op.actor, claimedAt: op.ts,
        plannedAt: at(op.date, op.slot), walkIns: true, status: 'gathering' });
      log('Took tour', `${op.slot} tour`);
      return;
    }
    case 'createExtra': {
      const t = { ...blank, id: op.tourId, date: op.date, slot: null, relatedSlot: op.relatedSlot || null, type: op.tourType,
        guideId: op.guideId || op.actor, group: op.group || '', reason: op.reason || '', claimedAt: op.ts, plannedAt: op.plannedAt,
        startFrom: op.startFrom || 'start', kind: op.kind || (op.tourType === 'Booked' ? 'booked' : 'public'), status: 'gathering' };
      s.tours.push(t);
      log('Logged extra tour', `${tourLabel(t)} with ${guideName(t.guideId)}, from the ${CONFIG.points[t.startFrom].toLowerCase()}${t.reason ? `. Reason: ${t.reason}` : ''}`);
      return;
    }
    case 'counts': {
      const t = find(op.tourId);
      if (!t || (t.status !== 'gathering' && t.status !== 'running')) return;
      ['kind', 'pub', 'booked', 'selfGuided', 'group'].forEach(k => { if (op[k] !== undefined) t[k] = op[k]; });
      if (!t.firstGuestAt && guestsOf(t) > 0) t.firstGuestAt = op.ts;
      return; // counts change tap by tap; the totals are logged when the tour departs
    }
    case 'split': {
      const a = find(op.tourId);
      if (!a || a.status !== 'gathering' || a.splitId) { log('Not applied', 'Tour could not be split'); return; }
      const splitsToday = new Set(s.tours.filter(x => x.date === a.date && x.splitId).map(x => x.splitId)).size;
      a.splitId = newId('sp'); a.splitLabel = 'A'; a.splitColour = splitsToday % CONFIG.splitColours + 1; a.walkIns = false;
      a.pub -= op.pub; a.booked -= op.booked;
      const b = { ...blank, id: op.newId, date: a.date, slot: null, relatedSlot: a.slot || a.relatedSlot, type: 'Split group', guideId: op.to,
        pub: op.pub, booked: op.booked, group: a.group, kind: a.kind, claimedAt: op.ts, firstGuestAt: op.ts, plannedAt: a.plannedAt,
        startFrom: op.startFrom, splitId: a.splitId, splitLabel: 'B', splitColour: a.splitColour, reason: `Split from the ${tourLabel(a).replace(' (split A)', '')}`, status: 'gathering' };
      s.tours.push(b);
      log('Split tour', `${tourLabel(a).replace(' (split A)', '')}: ${guideName(a.guideId)} keeps ${guestText(a)}, ${guideName(b.guideId)} takes ${guestText(b)} from the ${CONFIG.points[b.startFrom].toLowerCase()}, both codes confirmed`);
      return;
    }
    case 'walkins': {
      const t = find(op.tourId);
      if (!t || t.walkIns === op.value) return;
      t.walkIns = op.value;
      log(op.value ? 'Opened tour to walk-ins' : 'Closed tour to walk-ins', tourLabel(t));
      return;
    }
    case 'start': {
      const t = find(op.tourId);
      if (!t || t.status !== 'gathering') { log('Not applied', 'Tour had already left'); return; }
      ['kind', 'pub', 'booked', 'group'].forEach(k => { if (op[k] != null) t[k] = op[k]; });
      if (!t.firstGuestAt && guestsOf(t) > 0) t.firstGuestAt = op.ts;
      t.start = op.time; t.status = 'running';
      if (op.startFrom) t.startFrom = op.startFrom;
      if (t.startFrom === 'end') t.walkIns = false; // guests at the TV can't catch a tour that left from the other end
      if (t.slot) { t.type = scheduledType(t.date, t.slot, t.start); if (op.reason) t.reason = op.reason; }
      const where = t.startFrom === 'end' ? ' from the end point' : '';
      if (op.pending) { t.pending = true; log('Started tour, details to follow', `${tourLabel(t)} with ${guideName(t.guideId)}, departed ${fmtTime(t.start)}${where}`); return; }
      log('Started tour', `${tourLabel(t)} with ${guideName(t.guideId)}, ${guestText(t)}${t.group ? `, group ${t.group}` : ''}${t.selfGuided ? `, ${t.selfGuided} chose self-guided` : ''}, departed ${fmtTime(t.start)}${where}${op.reason ? `. Reason: ${op.reason}` : ''}`);
      return;
    }
    case 'details': {
      const t = find(op.tourId);
      if (!t || !t.pending) { log('Not applied', 'Details were already completed'); return; }
      completeDetails(t, op, log);
      return;
    }
    case 'end': {
      const t = find(op.tourId);
      if (!t || t.status !== 'running') { log('Not applied', 'Tour had already ended'); return; }
      if (t.pending) completeDetails(t, op, log);
      const before = guestText(t);
      if (op.pub != null) t.pub = op.pub;
      if (op.booked != null) t.booked = op.booked;
      t.end = op.time; t.status = 'done';
      const after = guestText(t);
      log('Ended tour', `${tourLabel(t)}, ${fmtMinutes((t.end - t.start) / MIN)}${after !== before ? `, ${before} → ${after}` : ''}${op.endAt ? `, ended at the ${CONFIG.points[op.endAt].toLowerCase()}` : ''}`);
      return;
    }
    case 'noTour': {
      let t = find(op.tourId);
      if (t && t.status !== 'gathering') { log('Not applied', 'Tour had already left'); return; }
      if (!t && !op.slot) { log('Not applied', 'No tour was recorded because the time slot was missing'); return; }
      if (!t) {
        if (s.tours.some(x => x.date === op.date && x.slot === op.slot)) { log('Not applied', `The ${op.slot} tour was already logged`); return; }
        t = { ...blank, id: op.tourId, date: op.date, slot: op.slot, type: 'Scheduled', guideId: null, claimedAt: null, plannedAt: at(op.date, op.slot) };
        s.tours.push(t);
      }
      t.status = 'no-tour'; t.pub = 0; t.booked = 0; t.selfGuided = op.selfGuided || 0; t.reason = op.reason;
      log('Recorded no tour', `${tourLabel(t)}${t.selfGuided ? `, ${t.selfGuided} chose self-guided` : ''}. Reason: ${op.reason}`);
      return;
    }
    case 'handover': {
      const t = find(op.tourId);
      if (!t || t.status === 'done' || t.status === 'no-tour') { log('Not applied', 'Tour can no longer be handed over'); return; }
      const from = guideName(t.guideId); t.guideId = op.to;
      if (op.override) log('Admin override', `${tourLabel(t)} reassigned from ${from} to ${guideName(op.to)}, confirmed by ${guideName(op.to)}. Reason: ${op.reason}`);
      else log('Handed over tour', `${tourLabel(t)} from ${from} to ${guideName(op.to)}, both codes confirmed`);
      return;
    }
    case 'correct': {
      const t = find(op.tourId);
      if (!t) { log('Not applied', 'Tour not found'); return; }
      const parts = [], set = (k, label, fmt = v => v) => { if (op[k] != null && op[k] !== t[k]) { parts.push(`${label} ${fmt(t[k]) || '—'} → ${fmt(op[k]) || '—'}`); t[k] = op[k]; } };
      set('start', 'departure', fmtTime); set('end', 'return', fmtTime); set('kind', 'type', v => CONFIG.kinds[v]);
      set('pub', 'public guests'); set('booked', 'booked guests'); set('group', 'group'); set('selfGuided', 'self-guided');
      if (!parts.length) return;
      if (t.slot) t.type = scheduledType(t.date, t.slot, t.start);
      log('Corrected tour', `${tourLabel(t)}: ${parts.join('; ')}. Reason: ${op.reason}`);
      return;
    }
    case 'order':
      s.orders[op.date] = [...op.order];
      log("Set today's order", op.order.map(guideName).join(', '));
      return;
    case 'mode': log('Switched phone', `This phone is now the ${CONFIG.points[op.mode].toLowerCase()}`); return;
    case 'settings': log('Changed settings', op.detail); return;
    case 'closeDay':
      s.closedDays[op.date] = { ts: op.ts, auto: !!op.auto };
      log(op.auto ? 'Sent daily report automatically' : 'Closed day and sent report', `${fmtDate(op.date)} to ${s.settings.reportEmail}`);
  }
}

// A tour started with details to follow stays out of the report until a guide completes it.
function completeDetails(t, op, log) {
  ['kind', 'pub', 'booked', 'group', 'selfGuided'].forEach(k => { if (op[k] != null) t[k] = op[k]; });
  if (op.reason) t.reason = op.reason;
  t.pending = false;
  log('Completed details', `${tourLabel(t)}: ${guestText(t)}${t.group ? `, group ${t.group}` : ''}${t.selfGuided ? `, ${t.selfGuided} chose self-guided` : ''}${op.reason ? `. Reason: ${op.reason}` : ''}`);
}

// Rebuilds the full state from the ops the server has accepted, in the order it accepted them.
function buildState(ops, settings) {
  const s = freshServer(settings);
  [...ops].sort((a, b) => (a.seq || 0) - (b.seq || 0)).forEach(op => applyOp(s, op, op.syncedAt || null));
  return s;
}

// The day an op belongs to, used by the server to file it.
function opDay(op, s) {
  if (op.date) return op.date;
  const t = op.tourId && s && s.tours.find(x => x.id === op.tourId);
  return t ? t.date : dayKey(op.ts || now());
}

// ---------- sample data ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const kindOf = (pub, booked) => booked ? (pub ? 'both' : 'booked') : 'public';

// Sample history for testing: the past days only, so today starts empty for live testing.
function sampleOps(today) {
  const ops = [];
  let n = 0;
  const rng = mulberry32(20261016);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = a => a[Math.floor(rng() * a.length)];
  const G = CONFIG.guides.map(g => g.id);
  if (!G.length) return ops;
  const run = op => { op.uid = `sample-${++n}`; op.day = op.date || dayOfTour[op.tourId] || dayKey(op.ts); if (op.date && op.tourId) dayOfTour[op.tourId] = op.date; ops.push(op); };
  const dayOfTour = {};
  const sid = () => `s${++n}x`;
  const doTour = (date, slot, guide, o) => {
    const id = sid(); dayOfTour[id] = date;
    if (slot) run({ type: 'claim', ts: o.claim, actor: guide, tourId: id, date, slot });
    else run({ type: 'createExtra', ts: o.claim, actor: guide, tourId: id, date, tourType: o.type, relatedSlot: o.related, group: o.group, reason: o.reason, plannedAt: o.planned ?? o.start, startFrom: o.from });
    run({ type: 'counts', ts: o.first, actor: guide, tourId: id, kind: kindOf(o.pub, o.booked), pub: o.pub, booked: o.booked || 0, group: o.group || '', selfGuided: o.self || 0 });
    if (o.walkIns != null) run({ type: 'walkins', ts: o.first, actor: guide, tourId: id, value: o.walkIns });
    if (o.start == null) return id;
    run({ type: 'start', ts: o.start, actor: guide, tourId: id, time: o.start, reason: o.lateReason || '', pending: !!o.pending, startFrom: o.from });
    if (o.dur) run({ type: 'end', ts: o.start + o.dur * MIN, actor: guide, tourId: id, time: o.start + o.dur * MIN });
    return id;
  };
  const splitPair = (date, slot, gA, gB, o) => {
    const a = sid(), b = sid(); dayOfTour[a] = date; dayOfTour[b] = date;
    run({ type: 'claim', ts: o.claim, actor: gA, tourId: a, date, slot });
    run({ type: 'counts', ts: o.first, actor: gA, tourId: a, kind: kindOf(o.pubA + o.pubB, o.bookA + o.bookB), pub: o.pubA + o.pubB, booked: o.bookA + o.bookB, group: o.group || '' });
    run({ type: 'split', ts: o.first + 4 * MIN, actor: gA, tourId: a, newId: b, to: gB, pub: o.pubB, booked: o.bookB, startFrom: o.fromB });
    run({ type: 'start', ts: o.startA, actor: gA, tourId: a, time: o.startA, reason: o.lateReason || '', startFrom: 'start' });
    run({ type: 'start', ts: o.startB, actor: gB, tourId: b, time: o.startB, startFrom: o.fromB });
    if (o.durA) run({ type: 'end', ts: o.startA + o.durA * MIN, actor: gA, tourId: a, time: o.startA + o.durA * MIN });
    if (o.durB) run({ type: 'end', ts: o.startB + o.durB * MIN, actor: gB, tourId: b, time: o.startB + o.durB * MIN });
  };
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  for (let d = CONFIG.historyDays; d >= 1; d--) {
    const date = addDays(today, -d);
    const order = shuffle(G);
    run({ type: 'order', ts: at(date, '08:05'), actor: order[0], date, order });
    const splitSlot = rng() < 0.3 ? pick(CONFIG.tourTimes) : null;
    CONFIG.tourTimes.forEach((slot, i) => {
      const slotMs = at(date, slot), g = order[i % order.length], g2 = order[(i + 1) % order.length];
      if (slot === splitSlot) {
        const sA = slotMs + ri(0, 4) * MIN, booked = rng() < 0.6;
        splitPair(date, slot, g, g2, { claim: slotMs - 30 * MIN, first: slotMs - 20 * MIN, startA: sA, startB: sA + ri(2, 6) * MIN,
          pubA: booked ? ri(0, 3) : ri(12, 20), pubB: booked ? 0 : ri(12, 20), bookA: booked ? ri(18, 25) : 0, bookB: booked ? ri(18, 25) : 0,
          group: booked ? pick(CONFIG.sampleGroups) : '', fromB: rng() < 0.6 ? 'end' : 'start', durA: ri(45, 65), durB: ri(45, 70) });
        return;
      }
      if (rng() < 0.08) {
        const self = rng() < 0.5 ? ri(1, 3) : 0;
        run({ type: 'noTour', ts: slotMs + 12 * MIN, actor: g, tourId: sid(), date, slot, reason: self ? 'Guests chose self-guided' : 'No guests', selfGuided: self });
        return;
      }
      const late = rng() < 0.1, start = slotMs + (late ? ri(12, 18) : ri(0, 4)) * MIN;
      const mixed = rng() < 0.15, first = start - ri(6, 25) * MIN;
      doTour(date, slot, g, { claim: first - ri(0, 15) * MIN, first, start, dur: ri(42, 68),
        pub: mixed ? ri(1, 6) : ri(3, 20), booked: mixed ? ri(8, 20) : 0, group: mixed ? pick(CONFIG.sampleGroups) : '',
        self: rng() < 0.5 ? 0 : ri(1, 3), lateReason: late ? pick(CONFIG.lateReasons) : '' });
    });
    if (rng() < 0.3) {
      const s = at(date, `${pad(ri(10, 14))}:${pad(ri(0, 59))}`);
      doTour(date, null, pick(G), { type: 'Booked', group: pick(CONFIG.sampleGroups), claim: s - ri(10, 30) * MIN, first: s - 8 * MIN, start: s, dur: ri(45, 70), pub: 0, booked: ri(15, 35) });
    }
    if (rng() < 0.3) {
      const s = at(date, `${pad(ri(9, 14))}:${pad(ri(5, 25))}`);
      doTour(date, null, pick(G), { type: 'Extra', reason: 'Unbooked group needed to go straight away', claim: s - 5 * MIN, first: s - 5 * MIN, start: s, dur: ri(40, 60), pub: ri(6, 14) });
    }
    run({ type: 'closeDay', ts: at(date, CONFIG.autoSendTime), actor: 'admin', date, auto: true });
  }
  return ops;
}

// ---------- shared lookups ----------
const slotTour = (s, date, slot) => s.tours.find(t => t.date === date && t.slot === slot);
const splitPartner = (s, t) => t.splitId ? s.tours.find(x => x.splitId === t.splitId && x.id !== t.id) : null;
function slotGuides(s, date, slot) {
  const a = slotTour(s, date, slot);
  if (!a || !a.guideId) return '';
  const b = splitPartner(s, a);
  return esc(guideName(a.guideId)) + (b ? ` and ${esc(guideName(b.guideId))}` : '');
}

function nextInOrder(s, date) {
  const order = s.orders[date];
  if (!order || !order.length) return null;
  const claimed = s.tours.filter(t => t.date === date && t.slot && t.claimedAt && t.guideId).sort((a, b) => b.claimedAt - a.claimedAt);
  if (!claimed.length) return order[0];
  const i = order.indexOf(claimed[0].guideId);
  return order[(i + 1) % order.length];
}

// ---------- TV ----------
function tvStatus(s, t) {
  const date = dayKey(t), join = s.settings.joinWindowMin * MIN, pre = CONFIG.preCallMin * MIN;
  const slots = sortTimes(s.settings.tourTimes);
  const today = s.tours.filter(x => x.date === date);
  const joining = today.filter(x => x.status === 'running' && x.walkIns && x.startFrom === 'start' && t - x.start < join).sort((a, b) => b.start - a.start)[0];
  const called = slots.find(sl => { const tr = slotTour(s, date, sl), ms = at(date, sl);
    if (tr && tr.status !== 'gathering') return false;
    return t >= ms - pre && (tr ? true : t < ms + join); });
  const next = slots.find(sl => { const tr = slotTour(s, date, sl); return at(date, sl) > t && (!tr || tr.status === 'gathering'); });
  const extra = today.filter(x => !x.slot && x.status === 'gathering' && x.walkIns && x.startFrom === 'start' && x.plannedAt >= t - CONFIG.preCallMin * MIN)
    .sort((a, b) => a.plannedAt - b.plannedAt)[0];
  return { date, join, slots, joining, called, next, extra };
}

// ---------- report ----------
function daysIn(from, to) { const out = []; let k = from; while (k <= to && out.length < 400) { out.push(k); k = addDays(k, 1); } return out; }

function computeReport(s, from, to, atTime) {
  const t = atTime || now(), today = dayKey(t), join = s.settings.joinWindowMin * MIN;
  const days = daysIn(from, to < today ? to : today);
  const pending = s.tours.filter(x => x.date >= from && x.date <= to && x.pending);
  const inRange = s.tours.filter(x => x.date >= from && x.date <= to && !x.pending);
  const run = inRange.filter(x => x.status === 'running' || x.status === 'done');
  const noTour = inRange.filter(x => x.status === 'no-tour');
  const unlogged = [];
  days.forEach(d => sortTimes(s.settings.tourTimes).forEach(sl => { if (!slotTour(s, d, sl) && at(d, sl) + join <= t) unlogged.push({ date: d, slot: sl }); }));
  const sum = a => a.reduce((n, x) => n + x, 0);
  const avg = a => a.length ? sum(a) / a.length : null;
  const durs = a => a.filter(x => x.status === 'done').map(x => (x.end - x.start) / MIN);
  const gathers = run.filter(x => x.firstGuestAt && x.start >= x.firstGuestAt).map(x => (x.start - x.firstGuestAt) / MIN);
  const pub = sum(run.map(x => x.pub)), booked = sum(run.map(x => x.booked)), self = sum(inRange.map(x => x.selfGuided || 0));
  const byGuide = CONFIG.guides.map(g => { const r = run.filter(x => x.guideId === g.id); return { name: g.name, tours: r.length, guests: sum(r.map(guestsOf)), avg: avg(durs(r)) }; }).filter(r => r.tours);
  const byDay = days.map(d => { const r = run.filter(x => x.date === d); return { date: d, tours: r.length, pub: sum(r.map(x => x.pub)), booked: sum(r.map(x => x.booked)),
    self: sum(inRange.filter(x => x.date === d).map(x => x.selfGuided || 0)), avg: avg(durs(r)) }; }).reverse();
  // A split booked group appears once, with both halves' guests and guides.
  const groupMap = new Map();
  run.filter(x => x.booked).forEach(x => {
    const k = x.splitId || x.id, g = groupMap.get(k) || { date: x.date, start: x.start, slot: x.slot || x.relatedSlot, group: x.group, booked: 0, pub: 0, guides: [], split: !!x.splitId };
    g.start = Math.min(g.start, x.start); g.booked += x.booked; g.pub += x.pub; g.guides.push(guideName(x.guideId)); groupMap.set(k, g);
  });
  return { days, pending, run, noTour, unlogged, pub, booked, guests: pub + booked, self, byGuide, byDay,
    groups: [...groupMap.values()].sort((a, b) => b.start - a.start),
    exceptions: inRange.filter(x => (x.type !== 'Scheduled' && x.type !== 'Booked' && x.status !== 'gathering') || x.status === 'no-tour').sort((a, b) => (b.start || 0) - (a.start || 0)),
    avgGroup: run.length ? (pub + booked) / run.length : null, avgDur: avg(durs(run)), avgGather: avg(gathers),
    selfPerDay: days.length ? self / days.length : null };
}

const CSV_HEAD = ['date', 'slot', 'type', 'linked_slot', 'split', 'status', 'guide', 'public_guests', 'booked_guests', 'booked_group', 'self_guided', 'start_point', 'departure', 'return', 'duration_min', 'gathering_min', 'reason'];
// One row per tour that ran or was recorded as no tour, oldest first. Tours waiting on details stay out.
function csvRows(s, from, to) {
  return s.tours.filter(x => x.date >= from && x.date <= to && x.status !== 'gathering' && !x.pending).sort((a, b) => (a.start || 0) - (b.start || 0))
    .map(x => [x.date, x.slot || '', x.type, x.relatedSlot || '', x.splitLabel, x.status, x.guideId ? guideName(x.guideId) : '', x.pub, x.booked, x.group, x.selfGuided,
      x.status === 'no-tour' ? '' : CONFIG.points[x.startFrom], x.start && x.status !== 'no-tour' ? fmtTime(x.start) : '', x.end ? fmtTime(x.end) : '', x.end ? Math.round((x.end - x.start) / MIN) : '',
      x.firstGuestAt && x.start >= x.firstGuestAt ? Math.round((x.start - x.firstGuestAt) / MIN) : '', x.reason]);
}
// A value a spreadsheet would run as a formula gets a leading apostrophe.
const csvSafe = v => { const str = String(v ?? ''); return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str; };
function csvFor(s, from, to) {
  const q = v => { const str = csvSafe(v); return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str; };
  return [CSV_HEAD.join(',')].concat(csvRows(s, from, to).map(r => r.map(q).join(','))).join('\n');
}

const fmtNum = (v, d = 1) => v == null ? '' : (Math.round(v * 10 ** d) / 10 ** d).toString();

// ---------- SHA-256, for checking guide codes on a phone without sending them around ----------
function sha256(text) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = unescape(encodeURIComponent(String(text))).split('').map(c => c.charCodeAt(0));
  const len = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (len >>> (i * 8)) & 0xff);
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map(x => x | 0);
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const codeHash = (salt, code) => sha256(`${salt}:${String(code).trim()}`);
