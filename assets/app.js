/* Tour Timer screens: the TV, the guide phones and the admin page. Each page loads core.js, config.js and this file.
   The page sets data-page on <body> to "tv", "phone" or "admin". No codes, names or keys live in this file. */

const PAGE = document.body.dataset.page;
const params = new URLSearchParams(location.search);

// ---------- local storage: per device, and only for things the page can rebuild ----------
const saved = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: the page still works */ } },
};

// ---------- server connection ----------
const notSetUp = () => !CONFIG.apiUrl || /PASTE/.test(CONFIG.apiUrl);
let testClock = false;
async function call(payload, timeoutMs = 20000) {
  if (notSetUp()) throw new Error('setup');
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    // A plain text body keeps this a simple request, which Google's web app accepts from another site.
    const res = await fetch(CONFIG.apiUrl, { method: 'POST', body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined });
    const data = await res.json();
    if (data && data.serverTime && !testClock) {
      // Trust the server's clock when this device is more than 20 seconds out.
      const off = data.serverTime - Date.now();
      clockOffset = Math.abs(off) > 20000 ? off : 0;
    }
    return data;
  } finally { if (timer) clearTimeout(timer); }
}

// ---------- page state ----------
let server = freshServer();
let queue = [], online = true;
let phoneGuide = null, lastActivity = Date.now();
let phoneMode = location.hash === '#end' ? 'end' : 'start';
const ui = { panel: null, panelError: '', signinError: '', adminError: '', adminTab: 'report', range: null, showCsv: false,
  confirmClose: false, settingsDraft: null, settingsError: '', settingsNotice: '', logDate: null,
  more: {}, orderDraft: null, orderOpen: false, refocus: null, switchError: '', loading: false, setupError: '' };

// ---------- TV ----------
const TV_PHOTO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>`;
const rotation = (len, sec) => len ? Math.floor(Date.now() / (sec * 1000)) % len : 0;
const tvLast = { slide: -1, tick: -1, ticker: '' };
// The TV look comes from config.js, and a TV link can override it: tv.html?theme=dark&bright=1
const tvLook = { theme: (params.get('theme') || CONFIG.tvTheme) === 'dark' ? 'dark' : 'light', bright: params.has('bright') ? params.get('bright') === '1' : !!CONFIG.tvBright };
let tvPromo = [];
function applyTvLook() {
  const tv = document.getElementById('tv');
  tv.dataset.tv = tvLook.theme;
  tv.toggleAttribute('data-bright', tvLook.bright);
}

// The frame is built once so the media and ticker keep running while the timer text updates every second.
function buildTV() {
  const tv = document.getElementById('tv');
  tv.innerHTML = `
    <div class="tv-top"><div class="tv-brand"><span class="tv-logo" role="img" aria-label="Cango Wildlife"></span><span class="t-l">${esc(CONFIG.tvHeading)}</span></div>
      <span class="t-l num" id="tv-clock"></span></div>
    <div class="tv-body">
      <div class="tv-media" id="tv-media" aria-label="Media panel"></div>
      <div class="tv-main" id="tv-main"></div>
    </div>
    <div class="tv-foot"><span class="tv-foot-dot" aria-hidden="true"></span><span class="t-s tv-ticker" id="tv-ticker"></span></div>`;
  tv.dataset.built = '1';
  applyTvLook();
}

function tvLayout(st, t) {
  if (st.joining) return 'departed';
  if (st.called) return 'call';
  if (st.next && at(st.date, st.next) - t <= CONFIG.approachMin * MIN) return 'approach';
  return 'idle';
}

function renderTVMedia() {
  const slides = CONFIG.mediaSlides, i = rotation(slides.length, CONFIG.slideSec);
  if (i === tvLast.slide) return;
  tvLast.slide = i;
  const el = document.getElementById('tv-media');
  el.innerHTML = slides.length
    ? `<div class="tv-slide tv-fade">${TV_PHOTO_ICON}<p class="t-s">${esc(slides[i])}</p>
        <div class="tv-dots" aria-hidden="true">${slides.map((_, j) => `<span${j === i ? ' class="on"' : ''}></span>`).join('')}</div></div>`
    : `<div class="tv-slide">${TV_PHOTO_ICON}<p class="t-s">No media added yet</p></div>`;
}

function renderTicker(st) {
  const msgs = [`Daily tours: ${st.slots.join(' · ')}`, ...(tvPromo.length ? tvPromo : CONFIG.tickerMessages)].filter(Boolean);
  const i = rotation(msgs.length, CONFIG.tickerSec), text = msgs[i];
  if (i === tvLast.tick && text === tvLast.ticker) return;
  tvLast.tick = i; tvLast.ticker = text;
  const el = document.getElementById('tv-ticker');
  el.textContent = text;
  el.classList.remove('tv-fade'); void el.offsetWidth; el.classList.add('tv-fade');
}

function renderTV() {
  const tv = document.getElementById('tv');
  if (!tv.dataset.built) buildTV();
  const s = server, t = now(), st = tvStatus(s, t), layout = tvLayout(st, t);
  const guides = sl => slotGuides(s, st.date, sl);
  const nextLine = st.next ? `Next tour <span class="tv-accent num">${st.next}</span>${guides(st.next) ? ` with ${guides(st.next)}` : ''} · in <span class="num">${fmtCountdown(at(st.date, st.next) - t)}</span>`
    : 'That was the last tour today';
  let main;
  if (layout === 'departed') {
    const x = st.joining, left = x.start + st.join - t, pct = Math.max(0, Math.min(100, left / st.join * 100));
    main = `<p class="t-s tv-eyebrow">Tour on the go</p>
      <div class="tv-join">
        <p class="t-l">The ${x.slot || fmtTime(x.start)} tour left at <span class="num">${fmtTime(x.start)}</span> with ${esc(guideName(x.guideId))}. You can still join.</p>
        <div><p class="t-s">Time left to join</p><p class="t-xl tv-accent">${fmtCountdown(left)}</p></div>
      </div>
      <div class="tv-meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <p class="t-s">${nextLine}</p>`;
  } else if (layout === 'call') {
    const ms = at(st.date, st.called), before = t < ms;
    main = `<div class="tv-call"><div class="tv-call-text">
        <p class="t-l">${before ? `Tour starts in <span class="num tv-accent">${fmtCountdown(ms - t)}</span>` : 'Tour starting now'}</p>
        <p class="t-xl num">${st.called}</p>
        <p class="t-l">${guides(st.called) ? `With ${guides(st.called)}. ` : ''}Please make your way to the waiting area.</p></div>
        <svg class="tv-arrow" viewBox="0 0 60 100" aria-hidden="true"><path d="M30 6 V82 M8 60 L30 90 L52 60" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  } else if (st.next) {
    const left = at(st.date, st.next) - t, win = CONFIG.approachMin * MIN;
    const meter = layout === 'approach' ? `<div class="tv-meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, (win - left) / win * 100))}%"></span></div>` : '';
    main = `<p class="t-s tv-eyebrow">Next tour</p><p class="t-xl num">${st.next}</p>
      ${guides(st.next) ? `<p class="t-l">With ${guides(st.next)}</p>` : ''}
      <p class="t-l">Starts in <span class="num tv-accent">${fmtCountdown(left)}</span></p>${meter}`;
  } else {
    main = `<p class="t-s tv-eyebrow">No more tours today</p><p class="t-l">Thank you for visiting.</p>
      <p class="t-l">First tour tomorrow at <span class="tv-accent num">${st.slots[0] || ''}</span></p>`;
  }
  const extra = st.extra ? `<p class="t-s tv-extra">An extra tour leaves at <span class="tv-accent num">${fmtTime(st.extra.plannedAt)}</span> with ${esc(guideName(st.extra.guideId))}. Ask a guide.</p>` : '';
  tv.dataset.s = layout;
  document.getElementById('tv-clock').textContent = fmtTime(t);
  document.getElementById('tv-main').innerHTML = main + extra;
  document.getElementById('tv-media').setAttribute('aria-hidden', layout === 'call' || layout === 'departed');
  renderTVMedia(); renderTicker(st);
}

// The TV asks the server for today's tours. Between answers, and without signal, it keeps counting down from the last answer.
async function syncTv() {
  try {
    const r = await call({ action: 'tv' });
    if (!r || !r.ok) return;
    CONFIG.guides = r.guides || [];
    server = freshServer(r.settings);
    server.tours = r.tours || [];
    tvPromo = r.promo || [];
    saved.set('tt:tv', { day: dayKey(now()), settings: r.settings, guides: CONFIG.guides, tours: server.tours, promo: tvPromo });
  } catch (e) { /* no signal: keep showing the last answer */ }
}
function loadTvCache() {
  const c = saved.get('tt:tv', null);
  if (!c) return;
  server = freshServer(c.settings);
  CONFIG.guides = c.guides || [];
  tvPromo = c.promo || [];
  if (c.day === dayKey(now())) server.tours = c.tours || [];
}

// ---------- phone ----------
const envTag = () => CONFIG.environmentLabel ? `<p class="tag">${esc(CONFIG.environmentLabel)}</p>` : '';
// ---------- phone: shared pieces ----------
const netPill = () => online && !queue.length ? `<span class="pill">Online</span>`
  : online ? `<span class="pill">Saving ${queue.length}</span>` : `<span class="pill off">No signal${queue.length ? ` · ${queue.length} waiting` : ''}</span>`;
const errLine = () => `<p class="err" role="alert">${esc(ui.panelError)}</p>`;
const options = (list, sel) => list.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
const codeInput = (id, name, label) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="password" inputmode="${/admin/i.test(label) ? 'text' : 'numeric'}" autocomplete="off" maxlength="20"></div>`;
const numField = (id, name, label, v) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="number" inputmode="numeric" min="0" max="${CONFIG.maxGuests}" value="${v}"></div>`;
const guideSelect = (id, name, label, exclude) => `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}">${CONFIG.guides.filter(g => g.id !== exclude).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>`;
const pointSelect = (sel) => `<div class="field"><label for="f-from">Starts from</label><select id="f-from" name="from">${Object.entries(CONFIG.points).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`;
// The signed-in guide acts on their own tours; anyone else, and anyone at the end point, confirms with the tour guide's code.
const needCode = t => !(phoneMode === 'start' && phoneGuide && phoneGuide === t.guideId);
const ownCode = t => needCode(t) ? codeInput('f-code', 'code', `${esc(guideName(t.guideId))}'s code`) : '';
const splitStyle = t => t.splitId ? ` style="--sc: var(--split-${t.splitColour})"` : '';
const splitChip = t => t.splitId ? `<span class="chip split"${splitStyle(t)}>Split ${t.splitLabel}</span>` : '';

const needsReason = t => !!(t.slot && t.start && scheduledType(t.date, t.slot, t.start) !== 'Scheduled' && !t.reason);
const reasonFields = (label, hint) => `<div class="field"><label for="f-reason">${label}</label>
    <select id="f-reason" name="reason"><option value="">${hint ? 'No reason needed' : 'Choose a reason'}</option>${options([...CONFIG.lateReasons, 'Other'])}</select>
    ${hint ? `<span class="hint">${hint}</span>` : ''}</div>
  <div class="field"><label for="f-note">Note</label><input id="f-note" name="note" autocomplete="off"><span class="hint">Needed if you choose Other.</span></div>`;
// Forms show only the fields for the chosen group type; the select toggles them in place.
const showsPub = k => k !== 'booked', showsBooked = k => k !== 'public';
function kindFields(prefix, t, opts = {}) {
  const k = t.kind || 'public';
  return `<div class="field"><label for="${prefix}-kind">Who's on this tour?</label>
      <select id="${prefix}-kind" name="kind" data-kindselect>${Object.entries(CONFIG.kinds).map(([v, l]) => `<option value="${v}"${v === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field" data-show="booked"${showsBooked(k) ? '' : ' hidden'}><label for="${prefix}-grp">Booked group or company</label><input id="${prefix}-grp" name="group" autocomplete="off" value="${esc(t.group || '')}"></div>
    <div data-show="booked"${showsBooked(k) ? '' : ' hidden'}>${numField(`${prefix}-book`, 'booked', 'Booked guests', t.booked || 0)}</div>
    <div data-show="pub"${showsPub(k) ? '' : ' hidden'}>${numField(`${prefix}-pub`, 'pub', k === 'both' ? 'Public guests added' : 'Public guests', t.pub || 0)}</div>
    ${opts.self ? numField(`${prefix}-self`, 'self', 'Chose self-guided', t.selfGuided || 0) : ''}`;
}
function staticCountFields(prefix, t) {
  return (showsBooked(t.kind) ? numField(`${prefix}-book`, 'booked', 'Booked guests', t.booked) : '') + (showsPub(t.kind) ? numField(`${prefix}-pub`, 'pub', 'Public guests', t.pub) : '');
}
function detailFields(t) {
  return `<div class="grid2">${kindFields('d', t, { self: true })}</div>
    ${needsReason(t) ? reasonFields(`Reason for leaving at ${fmtTime(t.start)}`) : ''}`;
}

function stepper(t, field, label) {
  const v = t[field] || 0;
  return `<div class="counter"><span id="lbl-${t.id}-${field}">${label}</span><div class="stepper" role="group" aria-labelledby="lbl-${t.id}-${field}">
    <button type="button" id="st-${t.id}-${field}-dn" data-act="count" data-ref="${t.id}" data-field="${field}" data-d="-1" aria-label="Remove one">−</button>
    <output aria-live="polite">${v}</output>
    <button type="button" id="st-${t.id}-${field}-up" data-act="count" data-ref="${t.id}" data-field="${field}" data-d="1" aria-label="Add one">+</button></div></div>`;
}

function countersHtml(t) {
  const k = t.kind;
  return `<div class="counters">
    <div class="stack" style="gap:4px"><span class="small" id="kind-lbl-${t.id}"><strong>Who's on this tour?</strong></span>
      <div class="seg" role="group" aria-labelledby="kind-lbl-${t.id}">${Object.entries(CONFIG.kinds).map(([v, l]) =>
        `<button type="button" id="kd-${t.id}-${v}" data-act="kind" data-ref="${t.id}" data-kind-value="${v}" aria-pressed="${k === v}">${l}</button>`).join('')}</div></div>
    ${showsBooked(k) ? `<div class="field"><label for="grp-${t.id}">Booked group or company</label>
        <input id="grp-${t.id}" data-group="${t.id}" value="${esc(t.group)}" autocomplete="off" placeholder="For example: Sample Primary School">
        <span class="hint">Private booking? Enter the booking reference, not a surname.</span></div>
      ${stepper(t, 'booked', 'Booked guests')}` : ''}
    ${showsPub(k) ? stepper(t, 'pub', k === 'both' ? 'Public guests added' : 'Public guests') : ''}
    ${stepper(t, 'selfGuided', 'Chose self-guided')}
  </div>`;
}

function panelHtml(kind, t, s) {
  const nowHM = fmtTime(now());
  if (kind === 'start') return `<form class="panel" data-form="start" data-ref="${t.id}" novalidate>
      <div class="grid2">
        <div class="field"><label for="f-time">Departure time</label><input id="f-time" name="time" type="time" value="${nowHM}" required></div>
        ${pointSelect(t.startFrom === 'end' || phoneMode === 'end' ? 'end' : 'start')}
        ${ownCode(t)}
        ${needCode(t) ? kindFields('f-s', t) : ''}
      </div>
      ${t.slot ? reasonFields('Reason for starting late or early', `Needed if the tour leaves more than ${CONFIG.startGraceMin} minutes from ${t.slot}.`) : ''}
      <label class="check" for="f-later"><input type="checkbox" id="f-later" name="later"> Finish details later</label>
      <p class="hint">No time for the counts or reason? Tick this and complete them before the tour ends. The tour stays out of the report until then.</p>
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Start tour</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'split') return `<form class="panel" data-form="split" data-ref="${t.id}" novalidate>
      <p class="small">Split the ${esc(tourLabel(t))} between two guides. Both halves keep the group name, and neither is open to walk-ins.</p>
      <div class="grid2">
        ${guideSelect('sp-to', 'to', 'Second guide', t.guideId)}
        ${codeInput('sp-code', 'code', "Second guide's code")}
        ${showsPub(t.kind) ? numField('sp-pub', 'pub', `Public guests to move (of ${t.pub})`, t.kind === 'public' ? Math.floor(t.pub / 2) : 0) : ''}
        ${showsBooked(t.kind) ? numField('sp-book', 'booked', `Booked guests to move (of ${t.booked})`, Math.floor(t.booked / 2)) : ''}
        ${pointSelect('end')}
      </div>
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Split tour</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'notour') return `<form class="panel" data-form="notour" data-ref="${t ? t.id : ''}" data-slot="${ui.panel.ref}" novalidate>
      <div class="field"><label for="f-why">Why was there no tour?</label><select id="f-why" name="reason">${options(CONFIG.noTourReasons)}</select></div>
      <div class="grid2">
        ${numField('f-self', 'self', 'Chose self-guided', t ? t.selfGuided : 0)}
        <div class="field"><label for="f-nnote">Note</label><input id="f-nnote" name="note" autocomplete="off"><span class="hint">Needed if you choose Other.</span></div>
      </div>
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Record no tour</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'end') return `<form class="panel" data-form="end" data-ref="${t.id}" novalidate>
      ${t.pending ? `<p class="notice warn">Details are still needed. Complete them to end the tour.</p>` : ''}
      <div class="grid2">
        <div class="field"><label for="f-etime">Return time</label><input id="f-etime" name="time" type="time" value="${nowHM}" required></div>
        ${ownCode(t)}
        ${t.pending ? '' : staticCountFields('f-e', t)}
      </div>
      ${t.pending ? detailFields(t) : ''}
      ${errLine()}
      <div class="row-flex"><button class="btn primary">${t.pending ? 'Complete details and end tour' : 'End tour and record time'}</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'details') return `<form class="panel" data-form="details" data-ref="${t.id}" novalidate>
      ${detailFields(t)}
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Complete details</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'correct') return `<form class="panel" data-form="correct" data-ref="${t.id}" novalidate>
      <div class="grid2">
        <div class="field"><label for="f-cstart">Departure time</label><input id="f-cstart" name="start" type="time" value="${fmtTime(t.start)}" required></div>
        ${t.end ? `<div class="field"><label for="f-cend">Return time</label><input id="f-cend" name="end" type="time" value="${fmtTime(t.end)}" required></div>` : ''}
        ${kindFields('f-c', t, { self: true })}
      </div>
      <div class="field"><label for="f-creason">Reason for correction</label><input id="f-creason" name="reason" autocomplete="off" required></div>
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Save correction</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  if (kind === 'handover') {
    const owner = guideName(t.guideId);
    return `<form class="panel" data-form="handover" data-ref="${t.id}" novalidate>
      <p class="small">Hand the ${esc(tourLabel(t))} from <strong>${esc(owner)}</strong> to another guide. Both guides enter their codes.</p>
      <div class="grid2">
        ${codeInput('h-from', 'from', `${esc(owner)}'s code`)}
        ${guideSelect('h-to', 'to', 'New guide', t.guideId)}
        ${codeInput('h-tocode', 'tocode', "New guide's code")}
      </div>
      <details><summary class="small">${esc(owner)} isn't available</summary>
        <div class="grid2" style="margin-top:8px">${codeInput('h-admin', 'admin', 'Admin code')}
          <div class="field"><label for="h-why">Reason for override</label><input id="h-why" name="why" autocomplete="off"></div></div>
        <p class="hint">Leave ${esc(owner)}'s code empty. The override is logged with its reason.</p></details>
      ${errLine()}
      <div class="row-flex"><button class="btn primary">Confirm handover</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  }
  if (kind === 'extra' || kind === 'endextra') {
    const here = kind === 'endextra';
    const slots = sortTimes(s.settings.tourTimes);
    return `<form class="panel-box" data-form="${kind}" novalidate>
      <h3>${here ? 'Log a tour leaving from here' : 'Log a booked or extra tour'}</h3>
      <p class="hint">${here ? 'For a group leaving from the end point. The guide confirms with their code.' : 'The tour is yours once logged. Add guests while they gather, then start it.'}</p>
      <div class="grid2">
        ${here ? guideSelect('x-guide', 'guide', 'Guide on tour') + codeInput('x-code', 'code', "Guide's code") : ''}
        <div class="field"><label for="x-type">Type</label><select id="x-type" name="type">${options(CONFIG.extraTypes)}</select></div>
        <div class="field"><label for="x-time">Departure time</label><input id="x-time" name="time" type="time" value="${nowHM}" required><span class="hint">Any time. It sorts into today's log.</span></div>
        <div class="field"><label for="x-rel">Linked to slot</label><select id="x-rel" name="related"><option value="">None</option>${options(slots)}</select></div>
        ${here ? kindFields('x', { kind: 'public' }) : `<div class="field"><label for="x-group">Booked group or company</label><input id="x-group" name="group" autocomplete="off"><span class="hint">Needed for a booked tour.</span></div>`}
      </div>
      <div class="field"><label for="x-reason">Reason</label><input id="x-reason" name="reason" autocomplete="off" placeholder="For example: unbooked group needed to go straight away"><span class="hint">Needed unless it's a booked tour.</span></div>
      ${here ? `<label class="check" for="x-later"><input type="checkbox" id="x-later" name="later"> Finish details later</label>` : ''}
      ${errLine()}
      <div class="row-flex"><button class="btn primary">${here ? 'Start tour from here' : 'Log tour'}</button><button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  }
  return '';
}

function walkToggle(t) {
  return `<button class="btn small" data-act="walkins" data-ref="${t.id}" aria-pressed="${t.walkIns}">Walk-ins: ${t.walkIns ? 'open' : 'closed'}</button>`;
}

// ---------- phone: start point ----------
function slotCard(r, s, hint) {
  const t = now(), join = s.settings.joinWindowMin * MIN, claimOpen = CONFIG.claimOpenMin * MIN;
  const x = r.tour, mine = x && x.guideId === phoneGuide, key = x ? x.id : r.slot;
  let chip, info = '', acts = '', body = '', cls = x && x.splitId ? 'split' : '';
  const btn = (kind, label, primary) => `<button class="btn small${primary ? ' primary' : ''}" data-act="open" data-kind="${kind}" data-ref="${key}">${label}</button>`;
  const handBtn = btn('handover', 'Hand over');
  const fromEnd = x && x.startFrom === 'end' ? ' · from the end point' : '';
  if (!x) {
    const ms = r.time;
    if (t >= ms + join) { chip = `<span class="chip missing">Not logged</span>`; info = 'Take it to log the real times, or record no tour.'; }
    else if (t >= ms) { cls += ' is-due'; chip = `<span class="chip due">Due now</span>`; }
    else if (t >= ms - claimOpen) chip = `<span class="chip">Open to take</span>`;
    else { chip = `<span class="chip">Upcoming</span>`; info = `Can be taken from ${fmtTime(ms - claimOpen)}`; }
    if (hint) info += `${info ? ' · ' : ''}Next in order: <strong>${esc(guideName(hint))}</strong>`;
    if (t >= ms - claimOpen) acts += `<button class="btn small primary" data-act="claim" data-ref="${r.slot}">Take this tour</button>`;
    if (t >= ms - CONFIG.dueSoonMin * MIN) acts += btn('notour', 'No tour');
  } else if (x.status === 'gathering') {
    cls += ' is-gathering'; chip = `<span class="chip gathering">Gathering</span>`;
    info = `<strong>${esc(guideName(x.guideId))}</strong> · ${guestText(x)}${x.group ? ` · ${esc(x.group)}` : ''}${fromEnd}`;
    if (mine) {
      body = countersHtml(x);
      acts = btn('start', 'Start tour', true) + (x.splitId ? '' : btn('split', 'Split this tour')) + btn('notour', 'No tour') + handBtn + walkToggle(x);
    } else {
      body = `<p class="owner-note">${esc(guideName(x.guideId))}'s tour. Sign in as ${esc(guideName(x.guideId))} to update it, or start or hand it over with codes.</p>`;
      acts = btn('start', 'Start tour') + handBtn;
    }
  } else if (x.status === 'running') {
    const pend = x.pending;
    cls += pend ? ' is-pending' : ' is-running';
    chip = `<span class="chip running">On tour</span>${pend ? '<span class="chip pending">Details needed</span>' : ''}`;
    info = `<strong>${esc(guideName(x.guideId))}</strong> · ${pend ? 'counts not final' : guestText(x)} · left ${fmtTime(x.start)}${fromEnd}`;
    acts = (mine && pend ? btn('details', 'Complete details', true) : '') + btn('end', 'End tour', !pend) + (mine && !pend ? btn('correct', 'Correct') : '') + handBtn + (mine ? walkToggle(x) : '');
  } else if (x.status === 'done') {
    chip = `<span class="chip done">Done</span>`;
    info = `${esc(guideName(x.guideId))} · ${guestText(x)} · ${fmtTime(x.start)}–${fmtTime(x.end)} (${fmtMinutes((x.end - x.start) / MIN)})${fromEnd}`;
    if (mine) acts = btn('correct', 'Correct');
  } else {
    chip = `<span class="chip">No tour</span>`; info = esc(x.reason) + (x.selfGuided ? ` · ${x.selfGuided} chose self-guided` : '');
  }
  const typeChip = x && x.type !== 'Scheduled' && x.type !== 'Split group' && x.status !== 'no-tour' ? `<span class="chip extra">${esc(x.type)}${x.relatedSlot ? ` · ${x.relatedSlot}` : ''}</span>` : '';
  const walkChip = x && x.walkIns && (x.status === 'gathering' || x.status === 'running') && !x.slot ? `<span class="chip walk">Open to walk-ins</span>` : '';
  const reason = x && x.reason && x.status !== 'no-tour' ? `<span class="muted">${esc(x.reason)}</span>` : '';
  const selfLine = x && x.selfGuided && x.status !== 'no-tour' && x.status !== 'gathering' ? `<span class="muted">${x.selfGuided} chose self-guided</span>` : '';
  const open = ui.panel && ui.panel.ref === key ? panelHtml(ui.panel.kind, x, s) : '';
  return `<li class="slot ${cls}"${x ? splitStyle(x) : ''}>
    <div class="slot-main"><span class="slot-time">${r.slot || shownTime(x)}</span>
      <div class="slot-info"><div class="row-flex">${chip}${x ? splitChip(x) : ''}${typeChip}${walkChip}</div>${info ? `<span>${info}</span>` : ''}${reason}${selfLine}</div></div>
    ${body}${acts ? `<div class="slot-acts">${acts}</div>` : ''}${open}</li>`;
}

function phoneRows(s) {
  const t = now(), date = dayKey(t);
  const rows = sortTimes(s.settings.tourTimes).map(slot => ({ time: at(date, slot), slot, tour: slotTour(s, date, slot) }));
  s.tours.filter(x => x.date === date && !x.slot).forEach(x => rows.push({ time: x.splitLabel ? x.plannedAt : rowTime(x), slot: null, tour: x }));
  // keep split B straight after its A half, and everything else in time order
  rows.sort((a, b) => (a.time - b.time) || ((a.tour && a.tour.splitLabel === 'B') - (b.tour && b.tour.splitLabel === 'B')));
  const hintSlot = rows.find(r => r.slot && !r.tour && r.time + s.settings.joinWindowMin * MIN > t);
  const hint = hintSlot ? nextInOrder(s, date) : null;
  return rows.map(r => slotCard(r, s, r === hintSlot ? hint : null)).join('');
}

function orderHtml(s, date) {
  const saved = s.orders[date];
  const draft = ui.orderDraft || saved || CONFIG.guides.map(g => g.id);
  return `<details class="order-box" id="order-box"${ui.orderOpen ? ' open' : ''}>
    <summary>Today's order: <span class="muted">${saved ? saved.map(guideName).join(', ') : 'not set'}</span></summary>
    <ol class="order-list">${draft.map((id, i) => `<li><span>${i + 1}. ${esc(guideName(id))}</span><span class="row-flex">
      <button class="btn small" id="om-${i}-up" data-act="ordmove" data-i="${i}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Move ${esc(guideName(id))} up">↑</button>
      <button class="btn small" id="om-${i}-dn" data-act="ordmove" data-i="${i}" data-d="1"${i === draft.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(guideName(id))} down">↓</button></span></li>`).join('')}</ol>
    <p class="hint">For reference only. Nobody is assigned automatically, and anyone can take the next tour.</p>
    <button class="btn small primary" data-act="ordsave">Save today's order</button></details>`;
}

const fallbackHtml = target => `<details class="fallback"><summary class="small">Use this phone as the ${CONFIG.points[target].toLowerCase()}</summary>
  <form class="stack" data-form="switchmode" data-mode="${target}" novalidate style="margin-top:8px">
    <p class="hint">Only if the other phone is out of action. Needs the admin code, and is logged.</p>
    ${codeInput('sw-code', 'code', 'Admin code')}
    <p class="err" role="alert">${esc(ui.switchError)}</p>
    <button class="btn small">Switch to ${CONFIG.points[target].toLowerCase()}</button></form></details>`;

// ---------- phone: end point ----------
function endCard(x, s) {
  const open = ui.panel && ui.panel.ref === x.id ? panelHtml(ui.panel.kind, x, s) : '';
  const waiting = x.status === 'gathering';
  const label = waiting ? 'Start tour' : x.pending ? 'Complete details and end' : 'End tour';
  return `<li class="slot ${x.splitId ? 'split ' : ''}${x.pending ? 'is-pending' : waiting ? 'is-gathering' : 'is-running'}"${splitStyle(x)}>
    <div class="slot-main"><span class="slot-time">${shownTime(x)}</span>
      <div class="slot-info"><div class="row-flex"><span class="chip ${waiting ? 'gathering' : 'running'}">${waiting ? 'Waiting to leave' : 'On tour'}</span>${x.pending ? '<span class="chip pending">Details needed</span>' : ''}${splitChip(x)}</div>
        <span><strong>${esc(guideName(x.guideId))}</strong> · ${x.pending ? 'counts not final' : guestText(x)}${waiting ? '' : ` · left ${fmtTime(x.start)}${x.startFrom === 'end' ? ' from here' : ''}`}</span>
        ${x.group ? `<span class="muted">${esc(x.group)}</span>` : ''}</div></div>
    ${open ? '' : `<div class="slot-acts"><button class="btn small primary" data-act="open" data-kind="${waiting ? 'start' : 'end'}" data-ref="${x.id}">${label}</button></div>`}${open}</li>`;
}

function renderEndPoint(el) {
  const s = phoneState(), t = now(), date = dayKey(t);
  const today = s.tours.filter(x => x.date === date);
  const waiting = today.filter(x => x.status === 'gathering' && x.startFrom === 'end').sort((a, b) => a.plannedAt - b.plannedAt);
  const out = today.filter(x => x.status === 'running').sort((a, b) => a.start - b.start);
  const back = today.filter(x => x.status === 'done').sort((a, b) => b.end - a.end).slice(0, 3);
  el.innerHTML = `<div class="ph-head"><h2>End point</h2>${netPill()}</div>${envTag()}
    <p class="small muted">${fmtDate(date)} · <span class="num">${fmtTime(t)}</span></p>
    <p class="small">Tap your tour as soon as you're back and enter your code. Nobody signs in on this phone.</p>
    ${ui.panel && ui.panel.kind === 'endextra' ? panelHtml('endextra', null, s) : `<button class="btn" data-act="open" data-kind="endextra">Log a tour leaving from here</button>`}
    ${waiting.length ? `<h3>Waiting to leave from here</h3><ol class="slots">${waiting.map(x => endCard(x, s)).join('')}</ol>` : ''}
    <h3>Out on tour now</h3>
    ${out.length ? `<ol class="slots" aria-label="Tours out now">${out.map(x => endCard(x, s)).join('')}</ol>` : `<p class="empty">No tours are out right now.</p>`}
    ${back.length ? `<h3>Recently back</h3><ul class="slots">${back.map(x => `<li class="slot"><div class="slot-main"><span class="slot-time">${shownTime(x)}</span>
      <div class="slot-info"><span>${esc(guideName(x.guideId))} · back ${fmtTime(x.end)} · ${fmtMinutes((x.end - x.start) / MIN)}</span></div></div></li>`).join('')}</ul>` : ''}
    ${fallbackHtml('start')}`;
}

function renderPhone() {
  const el = document.getElementById('phone');
  if (ui.setupError) { el.innerHTML = `<div class="ph-head"><h2>Tour log</h2></div><p class="notice warn">${esc(ui.setupError)}</p>`; return; }
  if (!CONFIG.guides.length) { el.innerHTML = `<div class="ph-head"><h2>${CONFIG.points[phoneMode]}</h2>${netPill()}</div>
    <p class="notice warn">${online ? 'Loading the guide list.' : 'This phone needs signal once to load the guide list. Check the data connection.'}</p>`; return; }
  if (phoneMode === 'end') return renderEndPoint(el);
  if (!phoneGuide) {
    const s = phoneState(), date = dayKey(now());
    const out = s.tours.filter(x => x.date === date && x.status === 'running');
    el.innerHTML = `<div class="ph-head"><h2>Start point</h2>${netPill()}</div>${envTag()}
      <form class="stack" data-form="signin" novalidate>
        <p class="muted small">Enter your guide code to log tours. Your code is recorded against every change you make. This phone signs out after ${CONFIG.autoSignOutSec / 60} minutes without use.</p>
        <div class="field"><label for="ph-code">Guide code</label>
          <input id="ph-code" name="code" type="password" inputmode="numeric" autocomplete="off" maxlength="20" aria-describedby="ph-code-err"></div>
        <p class="err" id="ph-code-err" role="alert">${esc(ui.signinError)}</p>
        <button class="btn primary">Sign in to tour log</button>
      </form>
      ${out.length ? `<h3>Back from a tour?</h3><p class="small muted">End it here with your code. No sign-in needed.</p><ol class="slots">${out.map(x => endCard(x, s)).join('')}</ol>` : ''}
      ${fallbackHtml('end')}`;
    return;
  }
  const s = phoneState(), t = now(), date = dayKey(t);
  el.innerHTML = `<div class="ph-head"><h2>Start point</h2>${netPill()}</div>${envTag()}
    <div class="ph-who"><span>Signed in as <strong>${esc(guideName(phoneGuide))}</strong></span><button class="link" data-act="signout">Switch guide</button></div>
    <p class="small muted">${fmtDate(date)} · <span class="num">${fmtTime(t)}</span></p>
    ${orderHtml(s, date)}
    ${ui.panel && ui.panel.kind === 'extra' ? panelHtml('extra', null, s) : `<button class="btn" data-act="open" data-kind="extra">Log a booked or extra tour</button>`}
    <ol class="slots" aria-label="Today's tours">${phoneRows(s)}</ol>`;
}

// ---------- phone: syncing with the server ----------
// Confirmed changes come from the server; queued ones wait on the phone, saved, until the server has them.
let phoneOps = [], phoneSeq = 0, phoneDay = null, phoneKey = '', codeSalt = '', adminHash = '', phoneSettings = null;
let syncing = false, syncAgain = false, syncTimer = null;

function phoneLoad() {
  const fromLink = params.get('key');
  if (fromLink) saved.set('tt:key', fromLink);
  phoneKey = fromLink || saved.get('tt:key', '');
  const c = saved.get('tt:phone', null);
  if (c) { CONFIG.guides = c.guides || []; codeSalt = c.salt || ''; adminHash = c.adminHash || ''; phoneSettings = c.settings || null;
    if (c.day === dayKey(now())) { phoneOps = c.ops || []; phoneSeq = c.seq || 0; phoneDay = c.day; } }
  queue = saved.get('tt:queue', []);
  if (notSetUp()) ui.setupError = 'This copy of the pages is not connected yet. Add the web app address in assets/config.js.';
  else if (!phoneKey) ui.setupError = 'This phone link is missing its key. Open the phone link from the Tour Timer menu in the Sheet.';
  rebuildPhone();
}
function rebuildPhone() { server = buildState(phoneOps, phoneSettings); }
function savePhone() {
  saved.set('tt:queue', queue);
  saved.set('tt:phone', { day: phoneDay, ops: phoneOps, seq: phoneSeq, guides: CONFIG.guides, salt: codeSalt, adminHash, settings: phoneSettings });
}
const codeMatches = (guideId, code) => { const g = CONFIG.guides.find(x => x.id === guideId); return !!(g && code && g.hash === codeHash(codeSalt, code)); };
const adminMatches = code => !!(code && adminHash && adminHash === codeHash(codeSalt, code));
const guideByCode = code => { const h = code ? codeHash(codeSalt, code) : ''; return CONFIG.guides.find(g => g.hash === h); };

function soonSync(ms = 300) { clearTimeout(syncTimer); syncTimer = setTimeout(syncPhone, ms); }
async function syncPhone() {
  if (ui.setupError) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  const sending = queue.slice(0, 50), wasOffline = !online;
  let reached = false;
  try {
    const r = await call({ action: 'phone', key: phoneKey, since: phoneDay === dayKey(now()) ? phoneSeq : 0, ops: sending });
    if (!r.ok) {
      if (r.code === 'bad-key') { ui.setupError = r.error; saved.set('tt:key', ''); }
      online = true;
    } else {
      if (r.day !== phoneDay) { phoneOps = []; phoneSeq = 0; phoneDay = r.day; if (!sending.length) syncAgain = true; }
      const done = new Set([...(r.accepted || []), ...(r.rejected || []).map(x => x.uid)]);
      queue = queue.filter(op => !done.has(op.uid));
      if (r.rejected && r.rejected.length) toast(`${r.rejected.length} change${r.rejected.length > 1 ? 's' : ''} could not be saved: ${r.rejected[0].error}`);
      const have = new Set(phoneOps.map(o => o.uid));
      (r.ops || []).forEach(o => { if (!have.has(o.uid)) phoneOps.push(o); phoneSeq = Math.max(phoneSeq, o.seq || 0); });
      CONFIG.guides = r.guides || CONFIG.guides; codeSalt = r.salt || codeSalt; adminHash = r.adminHash || adminHash; phoneSettings = r.settings || phoneSettings;
      online = true; reached = true;
      if (wasOffline && sending.length) toast(`${sending.length} change${sending.length > 1 ? 's' : ''} synced with their original times.`);
      rebuildPhone();
    }
  } catch (e) {
    online = false;
  }
  syncing = false;
  savePhone();
  softRenderPhone();
  // Go again straight away for changes made during this sync, or a long backlog.
  if (reached && (syncAgain || queue.length)) { syncAgain = false; soonSync(200); }
  else syncAgain = false;
}
// Redraws the phone after a sync, unless someone is typing or has a form open.
function softRenderPhone() {
  const el = document.getElementById('phone');
  const typing = document.activeElement && el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (!ui.panel && !typing && !ui.orderOpen) renderPhone();
  else { const pill = el.querySelector('.ph-head .pill'); if (pill) pill.outerHTML = netPill(); }
}

function phoneState() {
  const s = JSON.parse(JSON.stringify(server));
  queue.forEach(op => applyOp(s, op, null));
  return s;
}

// Every change is queued first, so a phone without signal keeps working. The sync sends it as soon as it can.
function enqueue(op) {
  op.ts = op.ts || now();
  op.uid = newId('u');
  op.day = opDay(op, phoneState());
  queue.push(op);
  savePhone();
}
function dispatch(op, opts = {}) {
  enqueue(op);
  if (!online && queue.length === 1) toast('Saved on the phone. Changes sync when the phone has signal again.');
  if (!opts.keepPanel) { ui.panel = null; ui.panelError = ''; }
  renderPhone();
  if (ui.refocus) { const el = document.getElementById(ui.refocus); ui.refocus = null; if (el && !el.disabled) el.focus(); }
  soonSync();
}


// ---------- admin ----------
function reportHtml() {
  const s = server, today = dayKey(now());
  if (ui.loading && !adminLoaded) return `<div class="card"><p class="muted">Loading the report.</p></div>`;
  if (!ui.range) ui.range = { from: today, to: today };
  const { from, to } = ui.range;
  const r = computeReport(s, from, to);
  const multi = from !== to;
  const closed = s.closedDays[today];
  const typeCell = x => x.status === 'no-tour' ? 'No tour' : esc(x.type) + (x.splitLabel ? ` ${x.splitLabel}` : '') + (x.relatedSlot ? ` (${x.relatedSlot})` : '');
  const guestsCell = x => x.status === 'no-tour' ? '' : guestsOf(x);
  return `
  <div class="card">
    <form class="row-flex" data-form="range" novalidate style="align-items:end">
      <div class="field"><label for="r-from">From</label><input type="date" id="r-from" name="from" value="${from}"></div>
      <div class="field"><label for="r-to">To</label><input type="date" id="r-to" name="to" value="${to}"></div>
      <button class="btn">Show report</button>
      <button type="button" class="btn small" data-act="quick" data-q="today">Today</button>
      <button type="button" class="btn small" data-act="quick" data-q="7">Last 7 days</button>
      <button type="button" class="btn small" data-act="quick" data-q="month">This month</button>
    </form>
    <p class="err" role="alert">${esc(ui.adminError)}</p>
    <h2>${multi ? `${fmtDate(from)} to ${fmtDate(to)}` : fmtDate(from)}</h2>
    ${r.pending.length ? `<p class="notice warn">${r.pending.length} tour${r.pending.length > 1 ? 's need' : ' needs'} details and ${r.pending.length > 1 ? 'are' : 'is'} not in these figures yet: ${r.pending.map(x => `${esc(tourLabel(x))} (${esc(guideName(x.guideId))})`).join(', ')}.</p>` : ''}
    ${!r.days.length ? `<p class="empty">This range is in the future. Pick dates up to today.</p>` : `
    <div class="stats">
      <div class="stat"><span class="small muted">Tours run</span><b>${r.run.length}</b>${multi ? `<span class="sub">${fmtNum(r.run.length / r.days.length)} per day</span>` : ''}</div>
      <div class="stat"><span class="small muted">Guests on tour</span><b>${r.guests}</b><span class="sub">${r.pub} public · ${r.booked} booked in ${r.groups.length} group${r.groups.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><span class="small muted">Average group</span><b>${fmtNum(r.avgGroup) || 'None yet'}</b></div>
      <div class="stat"><span class="small muted">Average tour length</span><b>${fmtMinutes(r.avgDur) || 'None yet'}</b></div>
      <div class="stat"><span class="small muted">Average gathering time</span><b>${fmtMinutes(r.avgGather) || 'None yet'}</b><span class="sub">First guest to departure</span></div>
      <div class="stat"><span class="small muted">Chose self-guided</span><b>${r.self}</b><span class="sub">${multi ? `${fmtNum(r.selfPerDay)} per day · ` : ''}not in tour averages</span></div>
      <div class="stat"><span class="small muted">No-tour slots</span><b>${r.noTour.length}</b></div>
      <div class="stat${r.unlogged.length ? ' warn' : ''}"><span class="small muted">Slots not logged</span><b>${r.unlogged.length}</b></div>
    </div>
    ${r.run.length ? '' : `<p class="empty">No tours logged in this range yet.</p>`}
    <h3>Booked groups (${r.groups.length})</h3>
    ${r.groups.length ? `<div class="tbl-wrap"><table><thead><tr><th>Group or company</th><th>Date</th><th>Departed</th><th class="r">Booked guests</th><th class="r">Public added</th><th>Guide</th></tr></thead><tbody>
      ${r.groups.map(g => `<tr><td><strong>${esc(g.group)}</strong>${g.split ? ' <span class="muted">· split over two tours</span>' : ''}</td><td>${fmtDate(g.date)}</td><td>${fmtTime(g.start)}${g.slot ? ` (${g.slot} slot)` : ''}</td><td class="r">${g.booked}</td><td class="r">${g.pub}</td><td>${esc(g.guides.join(' and '))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">No booked groups in this range.</p>`}
    ${multi && r.byDay.length ? `<h3>By day</h3><div class="tbl-wrap"><table><thead><tr><th>Date</th><th class="r">Tours</th><th class="r">Public</th><th class="r">Booked</th><th class="r">Self-guided</th><th class="r">Average length</th></tr></thead><tbody>
      ${r.byDay.map(d => `<tr><td>${fmtDate(d.date)}</td><td class="r">${d.tours}</td><td class="r">${d.pub}</td><td class="r">${d.booked}</td><td class="r">${d.self}</td><td class="r">${fmtMinutes(d.avg)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${r.byGuide.length ? `<h3>By guide</h3><div class="tbl-wrap"><table><thead><tr><th>Guide</th><th class="r">Tours</th><th class="r">Guests</th><th class="r">Average length</th></tr></thead><tbody>
      ${r.byGuide.map(g => `<tr><td>${esc(g.name)}</td><td class="r">${g.tours}</td><td class="r">${g.guests}</td><td class="r">${fmtMinutes(g.avg)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3>Exceptions and reasons</h3>
    ${r.exceptions.length || r.unlogged.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Guide</th><th class="r">Guests</th><th>Reason</th></tr></thead><tbody>
      ${r.unlogged.map(u => `<tr><td>${fmtDate(u.date)}</td><td>${u.slot}</td><td>Not logged</td><td></td><td class="r"></td><td class="muted">Nobody recorded this slot</td></tr>`).join('')}
      ${r.exceptions.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${x.status === 'no-tour' ? x.slot || '' : fmtTime(x.start)}</td><td>${typeCell(x)}</td><td>${x.guideId ? esc(guideName(x.guideId)) : ''}</td><td class="r">${guestsCell(x)}</td><td>${esc(x.reason)}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">Every tour ran on schedule.</p>`}
    <details><summary>All tours in this range (${r.run.length + r.noTour.length})</summary>
      <div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Slot</th><th>Type</th><th>Guide</th><th>Booked group</th><th class="r">Public</th><th class="r">Booked</th><th class="r">Self-guided</th><th>Departed</th><th>Returned</th><th class="r">Length</th></tr></thead><tbody>
      ${[...r.run, ...r.noTour].sort((a, b) => (b.start || 0) - (a.start || 0)).map(x => `<tr><td>${fmtDate(x.date)}</td><td>${x.slot || ''}</td><td>${typeCell(x)}</td><td>${x.guideId ? esc(guideName(x.guideId)) : ''}</td><td>${esc(x.group)}</td><td class="r">${x.pub}</td><td class="r">${x.booked}</td><td class="r">${x.selfGuided}</td><td>${x.status === 'no-tour' ? '' : fmtTime(x.start)}</td><td>${x.end ? fmtTime(x.end) : (x.status === 'running' ? 'On tour' : '')}</td><td class="r">${x.end ? fmtMinutes((x.end - x.start) / MIN) : ''}</td></tr>`).join('')}
      </tbody></table></div></details>
    <div class="row-flex"><button class="btn" data-act="csv">${ui.showCsv ? 'Hide CSV' : 'Show CSV for this range'}</button></div>
    ${ui.showCsv ? `<div class="field"><label for="csv-out">CSV for ${multi ? `${fmtDate(from)} to ${fmtDate(to)}` : fmtDate(from)}</label>
      <textarea id="csv-out" readonly>${esc(csvFor(s, from, to))}</textarea>
      <div class="row-flex"><button class="btn small" data-act="downloadcsv">Download CSV</button><button class="btn small" data-act="copycsv">Copy CSV</button><span class="hint">The daily email attaches the same CSV.</span></div></div>` : ''}`}
  </div>
  <div class="card">
    <h2>Today's report</h2>
    ${closed ? `<p class="notice">Sent ${closed.auto ? 'automatically ' : ''}at ${fmtTime(closed.ts)} to ${esc(s.settings.reportEmail)}. It is also filed in Google Drive under Tour Timer reports.</p>
        <div class="row-flex"><button class="btn" data-act="askclose">Send it again</button></div>`
      : ui.confirmClose ? `<p class="notice warn">Send today's CSV and summary to ${esc(s.settings.reportEmail)} now? Tours logged after this still appear in later reports.</p>
        <div class="row-flex"><button class="btn primary" data-act="closeday"${ui.loading ? ' disabled' : ''}>Confirm and send report</button><button class="btn" data-act="cancelclose">Cancel</button></div>`
      : `${s.tours.some(x => x.date === today && x.pending) ? `<p class="notice warn">Some tours still need details. They will be missing from the report if it is sent now.</p>` : ''}<p class="muted">Not sent yet. Sends automatically at ${s.settings.autoSendTime} to ${esc(s.settings.reportEmail)}.</p>
        <div class="row-flex"><button class="btn" data-act="askclose">Close today and send report</button></div>`}
  </div>`;
}

function changesHtml() {
  const day = ui.logDate || dayKey(now());
  const list = server.changes.filter(c => dayKey(c.ts) === day).sort((a, b) => b.ts - a.ts);
  if (ui.loading && !list.length) return `<div class="card"><p class="muted">Loading the change log.</p></div>`;
  return `<div class="card">
    <div class="row-flex" style="align-items:end"><div class="field"><label for="log-date">Date</label><input type="date" id="log-date" value="${day}"></div>
      <span class="hint">Who changed what, and when. Entries can't be edited or deleted. Guest counts are logged when a tour leaves. Synced shows when a change made without signal reached the server.</span></div>
    ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Logged</th><th>Synced</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
      ${list.map(c => `<tr><td>${fmtTime(c.ts)}</td><td>${c.syncedAt ? fmtTime(c.syncedAt) : ''}</td><td>${esc(guideName(c.actor))}</td><td>${esc(c.action)}</td><td>${esc(c.detail)}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">No changes on ${fmtDate(day)}.</p>`}</div>`;
}

function settingsHtml() {
  const d = ui.settingsDraft || (ui.settingsDraft = JSON.parse(JSON.stringify(server.settings)));
  return `<form class="card" data-form="settings" novalidate>
    <div class="stack"><h3>Tour times</h3>
      <div class="times">${sortTimes(d.tourTimes).map(t => `<span class="time-chip num">${t}<button type="button" data-act="rmtime" data-t="${t}" aria-label="Remove ${t}">×</button></span>`).join('') || '<span class="muted">No tour times. Add at least one.</span>'}</div>
      <div class="row-flex" style="align-items:end"><div class="field"><label for="s-add">Add a tour time</label><input type="time" id="s-add"></div><button type="button" class="btn" data-act="addtime">Add tour time</button></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="s-join">Join window (minutes)</label><input id="s-join" name="join" type="number" min="${CONFIG.joinWindowLimits[0]}" max="${CONFIG.joinWindowLimits[1]}" value="${d.joinWindowMin}">
        <span class="hint">How long the TV shows "you can still join" after a tour leaves.</span></div>
      <div class="field"><label for="s-send">Automatic report time</label><input id="s-send" name="send" type="time" value="${d.autoSendTime}"></div>
      <div class="field"><label for="s-email">Report email address</label><input id="s-email" name="email" type="email" value="${esc(d.reportEmail)}" autocomplete="off">
        <span class="hint">Use an organisational address. The report contains guide names.</span></div>
    </div>
    <p class="hint">Guides and their codes, the admin code and the promo messages are kept in the Google Sheet, in the Guides, Settings and Promo tabs.</p>
    <p class="err" role="alert">${esc(ui.settingsError)}</p>
    ${ui.settingsNotice ? `<p class="notice">${esc(ui.settingsNotice)}</p>` : ''}
    <div class="row-flex"><button class="btn primary">Save settings</button><button type="button" class="btn" data-act="discard">Discard changes</button></div>
  </form>`;
}

function renderAdmin() {
  const el = document.getElementById('admin');
  if (notSetUp()) { el.innerHTML = `<div class="card"><p class="notice warn">This copy of the pages is not connected yet. Add the web app address in assets/config.js.</p></div>`; return; }
  if (!adminToken) {
    el.innerHTML = `<form class="card" data-form="admin-signin" novalidate style="max-width:420px">
      <h2>Admin</h2><p class="muted small">Reports, the change log and settings. Not shown on the TV.</p>
      <div class="field"><label for="ad-code">Admin code</label><input id="ad-code" name="code" type="password" autocomplete="off" maxlength="40"></div>
      <p class="err" role="alert">${esc(ui.adminError)}</p>
      <button class="btn primary"${ui.loading ? ' disabled' : ''}>${ui.loading ? 'Checking' : 'Open admin'}</button><p class="hint">The admin code is in the Settings tab of the Sheet.</p></form>`;
    return;
  }
  const tabs = [['report', 'Report'], ['changes', 'Change log'], ['settings', 'Settings']];
  const body = ui.adminTab === 'report' ? reportHtml() : ui.adminTab === 'changes' ? changesHtml() : settingsHtml();
  el.innerHTML = `<div class="stack">
    <div class="row-flex" style="justify-content:space-between"><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${ui.adminTab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <span class="row-flex"><button class="btn small" data-act="refresh"${ui.loading ? ' disabled' : ''}>${ui.loading ? 'Loading' : 'Refresh'}</button><button class="link" data-act="adminout">Sign out of admin</button></span></div>
    <p class="hint">Changes made on a phone without signal appear here once that phone syncs.</p>
    ${body}</div>`;
}

// ---------- admin: loading from the server ----------
let adminToken = (() => { try { return sessionStorage.getItem('tt:adm') || ''; } catch (e) { return ''; } })();
const adminOps = new Map();
let adminLoaded = false;
function setAdminToken(t) { adminToken = t; try { if (t) sessionStorage.setItem('tt:adm', t); else sessionStorage.removeItem('tt:adm'); } catch (e) { /* sign-in lasts for this tab only */ } }

async function adminCall(payload) {
  const r = await call({ action: 'admin', token: adminToken, ...payload });
  if (!r.ok && r.code === 'signed-out') { setAdminToken(''); adminOps.clear(); adminLoaded = false; }
  return r;
}
// Loads the days the report and change log need, plus today.
async function adminLoad() {
  const today = dayKey(now());
  if (!ui.range) ui.range = { from: today, to: today };
  const days = [ui.range.from, ui.range.to, ui.logDate || today, today].sort();
  ui.loading = true; renderAdmin();
  try {
    const r = await adminCall({ op: 'data', from: days[0], to: days[days.length - 1] });
    if (!r.ok) { ui.adminError = r.error; return; }
    CONFIG.guides = r.guides || [];
    (r.ops || []).forEach(o => adminOps.set(o.uid, o));
    server = buildState([...adminOps.values()], r.settings);
    adminLoaded = true; ui.adminError = '';
  } catch (e) {
    ui.adminError = e.message === 'setup' ? 'This copy of the pages is not connected yet.' : "Couldn't reach the server. Check the internet connection and try Refresh.";
  } finally { ui.loading = false; renderAdmin(); }
}


// ---------- shell ----------
let toastTimer;
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500); }
function renderAll() {
  if (PAGE === 'tv') renderTV();
  if (PAGE === 'phone') renderPhone();
  if (PAGE === 'admin') renderAdmin();
  if (ui.refocus) { const el = document.getElementById(ui.refocus); ui.refocus = null; if (el && !el.disabled) el.focus(); }
}

function timeFromInput(v) { return HM_RE.test(v || '') ? at(dayKey(now()), v) : null; }
function countFrom(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= CONFIG.maxGuests ? n : null; }
function panelFail(msg) { ui.panelError = msg; renderPhone(); const f = document.querySelector('#phone form input, #phone form select'); if (f) f.focus(); }
const currentTour = id => phoneState().tours.find(x => x.id === id);

// Reads the group type and counts from a form, zeroing the fields that type doesn't use.
function readCounts(v, fallback) {
  const kind = v.kind || fallback.kind || 'public';
  const pub = showsPub(kind) ? countFrom(v.pub ?? fallback.pub) : 0;
  const booked = showsBooked(kind) ? countFrom(v.booked ?? fallback.booked) : 0;
  const group = showsBooked(kind) ? (v.group ?? fallback.group ?? '').trim() : '';
  if (pub == null || booked == null) return `Enter guest counts from 0 to ${CONFIG.maxGuests}.`;
  if (showsBooked(kind) && !group) return "Add the booked group's name or booking reference.";
  if (kind === 'booked' && !booked) return 'Add the number of booked guests.';
  if (kind === 'both' && (!booked || !pub)) return 'For Both, add booked and public guests. Otherwise choose Public or Booked group.';
  return { kind, pub, booked, group };
}
function parseDetails(v, tour) {
  const c = readCounts(v, tour);
  if (typeof c === 'string') return c;
  const { kind, pub, booked, group } = c, self = countFrom(v.self);
  if (self == null) return `Enter the self-guided count, from 0 to ${CONFIG.maxGuests}.`;
  if (pub + booked < 1) return 'A tour that ran needs at least one guest.';
  let reason = '';
  if (needsReason(tour)) {
    const note = (v.note || '').trim();
    if (!v.reason) return `The tour left at ${fmtTime(tour.start)}, more than ${CONFIG.startGraceMin} minutes from ${tour.slot}. Choose a reason.`;
    if (v.reason === 'Other' && !note) return 'Add a note for the Other reason.';
    reason = v.reason === 'Other' ? `Other: ${note}` : `${v.reason}${note ? `: ${note}` : ''}`;
  }
  return { kind, pub, booked, group, selfGuided: self, reason };
}
// Returns an error message when the tour guide's code is needed and doesn't match.
function codeError(tour, v) {
  if (!needCode(tour)) return '';
  return codeMatches(tour.guideId, (v.code || '').trim()) ? '' : `That isn't ${guideName(tour.guideId)}'s code. Only the guide on this tour can do this.`;
}
const actorFor = tour => needCode(tour) ? tour.guideId : phoneGuide;

document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset.form) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries());
  const kind = f.dataset.form, ref = f.dataset.ref, t = now(), date = dayKey(t);
  const futureLimit = t + MIN;
  if (kind === 'signin') {
    const g = guideByCode((v.code || '').trim());
    if (!g) { ui.signinError = !codeSalt ? 'The guide list has not loaded yet. Wait for signal, then try again.' : "That code isn't recognised. Check it with your supervisor and try again."; renderPhone(); document.getElementById('ph-code').focus(); return; }
    phoneGuide = g.id; lastActivity = Date.now(); ui.signinError = ''; ui.panel = null; renderPhone(); soonSync(); return;
  }
  if (kind === 'admin-signin') {
    const code = (v.code || '').trim();
    if (!code) { ui.adminError = 'Enter the admin code.'; renderAdmin(); document.getElementById('ad-code').focus(); return; }
    ui.loading = true; ui.adminError = ''; renderAdmin();
    call({ action: 'admin', op: 'signin', code }).then(r => {
      ui.loading = false;
      if (!r.ok) { ui.adminError = r.error; renderAdmin(); document.getElementById('ad-code').focus(); return; }
      setAdminToken(r.token); adminLoad();
    }).catch(() => { ui.loading = false; ui.adminError = "Couldn't reach the server. Check the internet connection and try again."; renderAdmin(); });
    return;
  }
  if (kind === 'switchmode') {
    if (!adminMatches((v.code || '').trim())) { ui.switchError = "That admin code isn't right."; renderPhone(); return; }
    ui.switchError = ''; phoneGuide = null;
    phoneMode = f.dataset.mode;
    history.replaceState(null, '', `${location.pathname}${location.search}#${phoneMode}`);
    dispatch({ type: 'mode', actor: 'admin', mode: phoneMode }); toast(`This phone is now the ${CONFIG.points[phoneMode].toLowerCase()}.`); return;
  }
  if (kind === 'extra' || kind === 'endextra') {
    const here = kind === 'endextra', group = (v.group || '').trim(), reason = (v.reason || '').trim(), time = timeFromInput(v.time);
    if (here && !codeMatches(v.guide, (v.code || '').trim())) return panelFail(`That isn't ${guideName(v.guide)}'s code.`);
    if (time == null) return panelFail('Enter the departure time as HH:MM.');
    if (!here && v.type === 'Booked' && !group) return panelFail("Add the booked group's name or booking reference.");
    if (v.type !== 'Booked' && !reason) return panelFail('Add a reason, for example "Unbooked group needed to go straight away".');
    const guide = here ? v.guide : phoneGuide, tourId = newId('t');
    if (!here) return dispatch({ type: 'createExtra', actor: guide, tourId, date, tourType: v.type, relatedSlot: v.related || null, group, reason, plannedAt: time, startFrom: 'start' });
    const later = !!v.later;
    if (time > futureLimit) return panelFail("Departure time can't be in the future when starting now.");
    let c = readCounts(v, { kind: 'public' });
    if (typeof c === 'string') { if (!later) return panelFail(c); c = { kind: v.kind || 'public', pub: countFrom(v.pub) || 0, booked: countFrom(v.booked) || 0, group: (v.group || '').trim() }; }
    if (!later && c.pub + c.booked < 1) return panelFail('Add at least one guest, or tick Finish details later.');
    if (v.type === 'Booked' && !c.group) return panelFail("Add the booked group's name or booking reference.");
    enqueue({ type: 'createExtra', actor: guide, tourId, date, tourType: v.type, relatedSlot: v.related || null, group: c.group, reason, plannedAt: time, startFrom: 'end', kind: c.kind });
    toast(`Tour with ${guideName(guide)} started from the end point.`);
    return dispatch({ type: 'start', actor: guide, tourId, time, startFrom: 'end', pending: later, kind: c.kind, pub: c.pub, booked: c.booked, group: c.group });
  }
  if (kind === 'notour') {
    const note = (v.note || '').trim(), self = countFrom(v.self || '0');
    if (v.reason === 'Other' && !note) return panelFail('Add a note explaining why there was no tour.');
    if (self == null) return panelFail(`Enter the self-guided count, from 0 to ${CONFIG.maxGuests}.`);
    if (v.reason === 'Guests chose self-guided' && !self) return panelFail('Enter how many guests chose self-guided.');
    return dispatch({ type: 'noTour', actor: phoneGuide, tourId: ref || newId('t'), date, slot: f.dataset.slot, reason: note ? `${v.reason}: ${note}` : v.reason, selfGuided: self });
  }
  if (['range', 'settings'].includes(kind)) return adminSubmit(kind, v);
  const tour = currentTour(ref);
  if (!tour) return panelFail('This tour no longer exists. Close this panel and try again.');
  if (kind === 'start') {
    const time = timeFromInput(v.time), later = !!v.later;
    const cErr = codeError(tour, v); if (cErr) return panelFail(cErr);
    if (time == null) return panelFail('Enter the departure time as HH:MM.');
    if (time > futureLimit) return panelFail("Departure time can't be in the future. Tap Start when the tour leaves.");
    let c = { kind: tour.kind, pub: tour.pub, booked: tour.booked, group: tour.group };
    if (needCode(tour)) { const r = readCounts(v, tour); if (typeof r === 'string') { if (!later) return panelFail(r); } else c = r; }
    const { pub, booked } = c;
    let reason = '';
    if (!later) {
      if (pub + booked < 1) return panelFail('Add at least one guest before starting, or tick Finish details later. If nobody is joining, record no tour.');
      if (showsBooked(c.kind) && !c.group) return panelFail("Add the booked group's name before starting, or tick Finish details later.");
      if (tour.slot) {
        const type = scheduledType(date, tour.slot, time), note = (v.note || '').trim();
        if (v.reason === 'Other' && !note) return panelFail('Add a note for the Other reason.');
        reason = v.reason === 'Other' ? `Other: ${note}` : v.reason ? `${v.reason}${note ? `: ${note}` : ''}` : '';
        if (type !== 'Scheduled' && !reason) return panelFail(`This is ${type === 'Early start' ? 'an' : 'a'} ${type.toLowerCase()}, more than ${CONFIG.startGraceMin} minutes from ${tour.slot}. Choose a reason, or tick Finish details later.`);
      }
    }
    if (later) toast('Tour started. Complete the details before it ends.');
    return dispatch({ type: 'start', actor: actorFor(tour), tourId: ref, time, reason, pending: later, startFrom: v.from, ...(needCode(tour) ? c : {}) });
  }
  if (kind === 'split') {
    const pub = countFrom(v.pub ?? '0'), booked = countFrom(v.booked ?? '0');
    if (!codeMatches(v.to, (v.code || '').trim())) return panelFail(`That isn't ${guideName(v.to)}'s code. Ask ${guideName(v.to)} to enter it to accept the split.`);
    if (pub == null || booked == null) return panelFail('Enter how many guests move to the second guide.');
    if (pub > tour.pub || booked > tour.booked) return panelFail(`You can move up to ${tour.pub} public and ${tour.booked} booked guests.`);
    if (pub + booked < 1) return panelFail('Move at least one guest to the second guide.');
    if (guestsOf(tour) - pub - booked < 1) return panelFail(`Leave at least one guest with ${guideName(tour.guideId)}.`);
    toast(`Split. ${guideName(v.to)} now has split B.`);
    return dispatch({ type: 'split', actor: phoneGuide, tourId: ref, newId: newId('t'), to: v.to, pub, booked, startFrom: v.from });
  }
  if (kind === 'details') {
    const d = parseDetails(v, tour);
    if (typeof d === 'string') return panelFail(d);
    toast('Details completed. The tour is now in the report.');
    return dispatch({ type: 'details', actor: phoneGuide, tourId: ref, ...d });
  }
  if (kind === 'end') {
    const time = timeFromInput(v.time);
    const cErr = codeError(tour, v); if (cErr) return panelFail(cErr);
    if (time == null) return panelFail('Enter the return time as HH:MM.');
    if (time <= tour.start) return panelFail(`Return time must be after the departure at ${fmtTime(tour.start)}.`);
    if (time > futureLimit) return panelFail("Return time can't be in the future.");
    const base = { type: 'end', actor: actorFor(tour), tourId: ref, time, endAt: phoneMode };
    if (tour.pending) {
      const d = parseDetails(v, tour);
      if (typeof d === 'string') return panelFail(d);
      return dispatch({ ...base, ...d });
    }
    const pub = showsPub(tour.kind) ? countFrom(v.pub) : 0, booked = showsBooked(tour.kind) ? countFrom(v.booked) : 0;
    if (pub == null || booked == null) return panelFail(`Enter guest counts from 0 to ${CONFIG.maxGuests}.`);
    if (pub + booked < 1) return panelFail('A tour that ran needs at least one guest.');
    return dispatch({ ...base, pub, booked });
  }
  if (kind === 'correct') {
    if (!HM_RE.test(v.start || '')) return panelFail('Enter the departure time as HH:MM.');
    const c = readCounts(v, tour); if (typeof c === 'string') return panelFail(c);
    const start = at(tour.date, v.start), { kind, pub, booked, group } = c, self = countFrom(v.self), reason = (v.reason || '').trim();
    let end = null;
    if (tour.end) { if (!HM_RE.test(v.end || '')) return panelFail('Enter the return time as HH:MM.'); end = at(tour.date, v.end); if (end <= start) return panelFail('Return time must be after the departure time.'); }
    if (self == null) return panelFail(`Enter the self-guided count, from 0 to ${CONFIG.maxGuests}.`);
    if (pub + booked < 1) return panelFail('A tour that ran needs at least one guest.');
    if (!reason) return panelFail('Add a reason for the correction. It goes into the change log.');
    const same = start === tour.start && (end == null || end === tour.end) && kind === tour.kind && pub === tour.pub && booked === tour.booked && self === tour.selfGuided && group === tour.group;
    if (same) return panelFail('Nothing has changed. Edit a value or cancel.');
    return dispatch({ type: 'correct', actor: phoneGuide, tourId: ref, start, end, kind, pub, booked, group, selfGuided: self, reason });
  }
  if (kind === 'handover') {
    const from = (v.from || '').trim(), admin = (v.admin || '').trim(), why = (v.why || '').trim(), toCode = (v.tocode || '').trim();
    const owner = guideName(tour.guideId);
    let override = false;
    if (from) { if (!codeMatches(tour.guideId, from)) return panelFail(`That isn't ${owner}'s code. Ask ${owner} to enter it again.`); }
    else if (admin) {
      if (!adminMatches(admin)) return panelFail("That admin code isn't right.");
      if (!why) return panelFail('Add a reason for the admin override.');
      override = true;
    } else return panelFail(`Enter ${owner}'s code, or use the admin code if ${owner} isn't available.`);
    if (!codeMatches(v.to, toCode)) return panelFail(`That isn't ${guideName(v.to)}'s code. Ask ${guideName(v.to)} to enter it to accept the tour.`);
    toast(`${cap(tourLabel(tour))} is now ${guideName(v.to)}'s.`);
    return dispatch({ type: 'handover', actor: override ? 'admin' : tour.guideId, tourId: ref, to: v.to, override, reason: why });
  }
});


function adminSubmit(kind, v) {
  if (kind === 'range') {
    if (!v.from || !v.to) { ui.adminError = 'Choose both a start and an end date.'; return renderAdmin(); }
    if (v.from > v.to) { ui.adminError = 'The start date must be on or before the end date.'; return renderAdmin(); }
    if (daysIn(v.from, v.to).length > 366) { ui.adminError = 'Choose a range of one year or less.'; return renderAdmin(); }
    ui.adminError = ''; ui.range = { from: v.from, to: v.to }; ui.showCsv = false; return adminLoad();
  }
  const d = ui.settingsDraft, join = Number(v.join), email = (v.email || '').trim();
  ui.settingsNotice = '';
  if (!d.tourTimes.length) { ui.settingsError = 'Add at least one tour time.'; return renderAdmin(); }
  if (!Number.isInteger(join) || join < CONFIG.joinWindowLimits[0] || join > CONFIG.joinWindowLimits[1]) { ui.settingsError = `Set the join window between ${CONFIG.joinWindowLimits[0]} and ${CONFIG.joinWindowLimits[1]} minutes.`; return renderAdmin(); }
  if (!HM_RE.test(v.send || '')) { ui.settingsError = 'Enter the automatic report time as HH:MM.'; return renderAdmin(); }
  if (!EMAIL_RE.test(email)) { ui.settingsError = 'Enter a valid email address, for example tours@example.org.'; return renderAdmin(); }
  ui.settingsError = ''; ui.loading = true; renderAdmin();
  adminCall({ op: 'settings', settings: { tourTimes: sortTimes(d.tourTimes), joinWindowMin: join, autoSendTime: v.send, reportEmail: email } }).then(r => {
    ui.loading = false;
    if (!r.ok) { ui.settingsError = r.error; return renderAdmin(); }
    ui.settingsDraft = null;
    ui.settingsNotice = r.changed ? 'Settings saved. The TV and phones pick them up within a minute.' : 'No changes to save.';
    adminLoad();
  }).catch(() => { ui.loading = false; ui.settingsError = "Couldn't reach the server. Your changes are still here: try Save again."; renderAdmin(); });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'claim') {
    const slot = b.dataset.ref, existing = slotTour(phoneState(), dayKey(now()), slot);
    if (existing) { toast(`The ${slot} tour is already ${guideName(existing.guideId)}'s.`); return renderPhone(); }
    toast(`The ${slot} tour is now yours. Add guests as they arrive.`);
    dispatch({ type: 'claim', actor: phoneGuide, tourId: newId('t'), date: dayKey(now()), slot });
  }
  else if (act === 'count') {
    const tour = currentTour(b.dataset.ref); if (!tour) return;
    const field = b.dataset.field, nv = clampGuests((tour[field] || 0) + Number(b.dataset.d));
    if (nv === tour[field]) return;
    ui.refocus = b.id;
    dispatch({ type: 'counts', actor: phoneGuide, tourId: tour.id, [field]: nv }, { keepPanel: true });
  }
  else if (act === 'walkins') {
    const tour = currentTour(b.dataset.ref); if (!tour) return;
    if (!tour.walkIns && tour.startFrom === 'end') { toast("This tour left from the end point, so guests at the TV can't join it."); return; }
    toast(tour.walkIns ? 'Closed to walk-ins. The TV no longer invites guests to join.' : 'Open to walk-ins. The TV can invite guests to join.');
    dispatch({ type: 'walkins', actor: phoneGuide, tourId: tour.id, value: !tour.walkIns }, { keepPanel: true });
  }
  else if (act === 'kind') {
    const tour = currentTour(b.dataset.ref); if (!tour) return;
    const k = b.dataset.kindValue;
    if (k === tour.kind) return;
    if (!showsPub(k) && tour.pub) { toast(`Bring public guests to 0 before choosing ${CONFIG.kinds[k]}.`); return; }
    if (!showsBooked(k) && tour.booked) { toast(`Bring booked guests to 0 before choosing ${CONFIG.kinds[k]}.`); return; }
    ui.refocus = b.id;
    dispatch({ type: 'counts', actor: phoneGuide, tourId: tour.id, kind: k, ...(showsBooked(k) ? {} : { group: '' }) }, { keepPanel: true });
  }
  else if (act === 'open') { ui.panel = { kind: b.dataset.kind, ref: b.dataset.ref || null }; ui.panelError = ''; renderPhone();
    const first = document.querySelector('#phone form input:not([type=hidden]), #phone form select'); if (first) first.focus(); }
  else if (act === 'close') { ui.panel = null; ui.panelError = ''; renderPhone(); }
  else if (act === 'signout') { phoneGuide = null; ui.panel = null; renderPhone(); }
  else if (act === 'ordmove') {
    const s = phoneState(), date = dayKey(now());
    const draft = ui.orderDraft || [...(s.orders[date] || CONFIG.guides.map(g => g.id))];
    const i = Number(b.dataset.i), j = i + Number(b.dataset.d);
    if (j < 0 || j >= draft.length) return;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    ui.orderDraft = draft; ui.refocus = `om-${j}-${Number(b.dataset.d) < 0 ? 'up' : 'dn'}`; renderAll();
  }
  else if (act === 'ordsave') {
    const s = phoneState(), date = dayKey(now());
    const order = ui.orderDraft || s.orders[date] || CONFIG.guides.map(g => g.id);
    ui.orderDraft = null; ui.orderOpen = false;
    toast("Today's order saved.");
    dispatch({ type: 'order', actor: phoneGuide, date, order });
  }
  else if (act === 'adminout') { setAdminToken(''); adminOps.clear(); adminLoaded = false; server = freshServer(); renderAdmin(); }
  else if (act === 'refresh') adminLoad();
  else if (act === 'tab') { ui.adminTab = b.dataset.tab; ui.settingsNotice = ''; renderAdmin(); }
  else if (act === 'quick') {
    const today = dayKey(now()), q = b.dataset.q;
    ui.range = q === 'today' ? { from: today, to: today } : q === '7' ? { from: addDays(today, -6), to: today } : { from: today.slice(0, 8) + '01', to: today };
    ui.adminError = ''; ui.showCsv = false; adminLoad();
  }
  else if (act === 'csv') { ui.showCsv = !ui.showCsv; renderAdmin(); }
  else if (act === 'copycsv') {
    const ta = document.getElementById('csv-out');
    const fallback = () => { ta.focus(); ta.select(); toast('Copy blocked here. The CSV is selected: press Ctrl+C or Cmd+C.'); };
    try { navigator.clipboard.writeText(ta.value).then(() => toast('CSV copied.'), fallback); } catch { fallback(); }
  }
  else if (act === 'downloadcsv') {
    const { from, to } = ui.range, blob = new Blob([csvFor(server, from, to)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = from === to ? `tour-report-${from}.csv` : `tour-report-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  else if (act === 'askclose') { ui.confirmClose = true; renderAdmin(); }
  else if (act === 'cancelclose') { ui.confirmClose = false; renderAdmin(); }
  else if (act === 'closeday') {
    ui.loading = true; renderAdmin();
    adminCall({ op: 'closeDay', date: dayKey(now()) }).then(r => {
      ui.loading = false; ui.confirmClose = false;
      if (!r.ok) { ui.adminError = r.error; renderAdmin(); return; }
      toast(`Report sent to ${r.sentTo}.`); adminLoad();
    }).catch(() => { ui.loading = false; ui.adminError = "Couldn't reach the server, so the report wasn't sent. Try again."; renderAdmin(); });
  }
  else if (act === 'rmtime') { ui.settingsDraft.tourTimes = ui.settingsDraft.tourTimes.filter(t => t !== b.dataset.t); ui.settingsNotice = ''; renderAdmin(); }
  else if (act === 'addtime') {
    const v = document.getElementById('s-add').value;
    if (!HM_RE.test(v)) { ui.settingsError = 'Choose a time to add.'; return renderAdmin(); }
    if (ui.settingsDraft.tourTimes.includes(v)) { ui.settingsError = `${v} is already a tour time.`; return renderAdmin(); }
    ui.settingsDraft.tourTimes.push(v); ui.settingsError = ''; renderAdmin();
  }
  else if (act === 'discard') { ui.settingsDraft = null; ui.settingsError = ''; ui.settingsNotice = 'Changes discarded.'; renderAdmin(); }
});

document.addEventListener('change', e => {
  if (e.target.matches && e.target.matches('[data-kindselect]')) {
    const form = e.target.form, k = e.target.value;
    form.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show === 'pub' ? !showsPub(k) : !showsBooked(k); });
  } else if (e.target.id === 'log-date' && e.target.value) { ui.logDate = e.target.value; adminLoad(); }
  else if (e.target.dataset.group) {
    const tour = currentTour(e.target.dataset.group), group = e.target.value.trim();
    if (tour && group !== tour.group) dispatch({ type: 'counts', actor: phoneGuide, tourId: tour.id, group }, { keepPanel: true });
  }
});
['click', 'keydown', 'input'].forEach(ev => document.addEventListener(ev, e => { if (e.target.closest && e.target.closest('#phone')) lastActivity = Date.now(); }, true));
document.addEventListener('toggle', e => { if (e.target.id === 'order-box') ui.orderOpen = e.target.open; }, true);

function tick() {
  const t = now();
  if (PAGE === 'tv') { renderTV(); if (Math.floor(t / 1000) % CONFIG.tvRefreshSec === 0) syncTv(); return; }
  if (PAGE !== 'phone') return;
  if (phoneGuide && Date.now() - lastActivity > CONFIG.autoSignOutSec * 1000) {
    phoneGuide = null; ui.panel = null; ui.panelError = '';
    if (phoneMode === 'start') { renderPhone(); toast(`The start point phone signed out after ${Math.round(CONFIG.autoSignOutSec / 60)} minutes without use.`); }
  }
  if (Math.floor(t / 1000) % CONFIG.phoneRefreshSec === 0) syncPhone();
  else if (Math.floor(t / 1000) % 30 === 0) softRenderPhone();
}


// ---------- start ----------
window.addEventListener('hashchange', () => { if (PAGE === 'phone') { phoneMode = location.hash === '#end' ? 'end' : 'start'; ui.panel = null; renderPhone(); } });
window.addEventListener('online', () => { if (PAGE === 'phone') soonSync(0); });
if (PAGE === 'tv') {
  // Testing only: tv.html?at=15:18 shows the TV as it would look at that time today.
  const fake = params.get('at');
  if (fake && HM_RE.test(fake)) { clockOffset = at(dayKey(Date.now()), fake) - Date.now(); testClock = true; }
  loadTvCache(); renderTV(); syncTv();
  // A tap or the remote's OK button asks for full screen; TV browsers that refuse it keep the page as it is.
  document.addEventListener('click', () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); });
}
if (PAGE === 'phone') { phoneLoad(); renderPhone(); syncPhone(); }
if (PAGE === 'admin') { renderAdmin(); if (adminToken) adminLoad(); }
// The offline copy of the pages (sw.js). Skipped when opened as a local file.
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
setInterval(tick, 1000);
