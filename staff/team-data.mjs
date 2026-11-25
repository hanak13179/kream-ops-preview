// 근무·스케줄 자료: Supabase(실제) 또는 예시 모드(이 기기에만 저장).
// 예시 모드: 권한 미리보기, 미리보기 사이트, 또는 아직 DB에 표(team-schedule.sql)가 없을 때.
import {TEAM_STORES, today, addDays, weekStart, weekDates, autoSchedule, geoCheck, localParts, zonedToISO, DEFAULT_RADIUS, DEFAULT_NOTICE_DAYS, noticeOk} from './team-logic.mjs?v=20261125-loc1';

// 구글 시트 'Kream Ops Schedule' 연결 (apps-script/schedule-sync.gs 를 시트에 붙여 웹앱으로 배포한 주소)
// 비어 있으면 시트 연결은 건너뛰어요. 시트는 로그인한 사람의 토큰으로 Supabase에서 직접 읽어서 써요 (가짜 자료를 못 넣어요).
export const SCHEDULE_SHEET_URL = '';
export const SCHEDULE_SHEET_LINK = 'https://docs.google.com/spreadsheets/d/1GMTKRZKT6a2AoY3PQmQEaGrc_pHIPZkDfh1ufNbq7kw/edit';

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
const missingTable = e => e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PREVIEW_READ_ONLY' || /does not exist|Could not find the (table|function)/i.test(e.message || ''));
export const friendlyError = (e, t) => {
  const m = String(e?.message || e || '');
  const far = m.match(/Too far from store: (\d+) m(?: \(limit (\d+) m\))?/);
  if (far) return t(`매장 POS에서 ${far[1]}m 떨어져 있어요. 출근은 ${far[2] || 100}m 안에서만 돼요.`, `You are ${far[1]} m from the store POS. Clock-in only works within ${far[2] || 100} m.`);
  const map = [
    [/Store location not configured/, ['매장 POS 위치 설정이 필요해요. 매니저에게 설정을 요청해 주세요.', 'Ask your manager to configure the store POS location first.']],
    [/Location required/, ['위치 정보가 필요해요. 브라우저에서 위치 허용을 눌러 주세요.', 'Location is needed. Please allow location in your browser.']],
    [/Already clocked in/, ['이미 출근했어요.', 'You are already clocked in.']],
    [/Not clocked in/, ['출근 기록이 없어요.', 'You are not clocked in.']],
    [/needs (\d+) days notice/, null],
    [/You already work then/, ['그 시간에 이미 근무가 있어요.', 'You already work at that time.']],
    [/Swap already requested/, ['이미 교대 요청이 있어요.', 'A swap is already requested for this shift.']],
    [/Fix already requested/, ['이미 고치기 요청이 있어요.', 'A fix is already requested.']],
    [/Only the last 31 days/, ['최근 31일 기록만 요청할 수 있어요.', 'Only the last 31 days can be requested.']],
    [/Reason required/, ['사유를 적어 주세요.', 'Please write a reason.']],
    [/Manager access required/, ['매니저만 할 수 있어요.', 'Managers only.']],
    [/PREVIEW|Preview only|미리보기/, ['미리보기에서는 저장되지 않아요.', 'Preview only, nothing was saved.']]
  ];
  const n = m.match(/needs (\d+) days notice/);
  if (n) return t(`휴가는 최소 ${n[1]}일 전에 신청해야 해요. 급한 일은 매니저에게 직접 연락해 주세요.`, `Time off needs ${n[1]} days notice. For emergencies, contact your manager directly.`);
  for (const [re, txt] of map) if (txt && re.test(m)) return t(...txt);
  return m || t('문제가 생겼어요. 다시 시도해 주세요.', 'Something went wrong. Please try again.');
};

// ── 예시 모드 ──────────────────────────────────────────
const DEMO_KEY = 'kream-team-demo-v2';
const SAMPLE = {
  downtown: ['민지', 'Jason', '서연', 'Emily', '도윤'],
  'richmond-hill': ['하은', 'Kevin', '지호', 'Olivia'],
  finch: ['수아', 'Daniel', '예준', 'Grace']
};
function defaultNeeds() {
  const out = [];
  for (let wd = 0; wd < 7; wd++) {
    const weekend = wd === 0 || wd === 6;
    out.push({weekday: wd, start_min: weekend ? 660 : 600, end_min: weekend ? 1020 : 960, count: weekend ? 2 : 1, position: ''});
    out.push({weekday: wd, start_min: weekend ? 1020 : 960, end_min: 1320, count: weekend ? 2 : 1, position: ''});
  }
  return out;
}
function seedDemo(me, myName, myStoresIn) {
  const myStores = myStoresIn.length ? myStoresIn : TEAM_STORES;
  const people = [], availability = [], prefs = {};
  TEAM_STORES.forEach((st, si) => SAMPLE[st].forEach((n, i) => {
    const id = `demo-${st}-${i}`; people.push({id, name: `${n} (예시)`, role: 'employee', stores: [st]});
    if (i % 2 === 0) availability.push({user_id: id, weekday: (i + si) % 7, kind: 'none'});
    if (i === 1) for (const wd of [1, 3]) availability.push({user_id: id, weekday: wd, kind: 'range', start_min: 900, end_min: 1320});
    prefs[id] = {max_hours: i === 3 ? 24 : 40, note: '', desired_hours: [30, null, 16, 20, null][i] ?? null, want_max: i === 1};
  }));
  people.push({id: me, name: myName, role: 'manager', stores: myStores});
  const settings = Object.fromEntries(TEAM_STORES.map(st => [st, {store_id: st, lat: null, lng: null, radius_m: DEFAULT_RADIUS, notice_days: DEFAULT_NOTICE_DAYS, swap_approval: false, needs: defaultNeeds()}]));
  const shifts = [], timecards = [];
  const thisWeek = weekStart(today()), lastWeek = addDays(thisWeek, -7);
  for (const st of TEAM_STORES) for (const wk of [lastWeek, thisWeek]) {
    const r = autoSchedule({store: st, dates: weekDates(wk), needs: settings[st].needs, people: people.filter(p => p.stores.includes(st) && p.id !== me), shifts, availabilityRows: availability, prefs});
    r.shifts.forEach(s => shifts.push({...s, id: uuid(), published: true}));
  }
  // 나에게도 이번 주·다음 주 근무 몇 개 (내 근무만 보기·교환하기를 써 볼 수 있게)
  shifts.filter(s => s.store_id === myStores[0] && s.date >= addDays(thisWeek, 2) && s.start_min < 700).slice(0, 3).forEach(s => { s.user_id = me; });
  // 지난주~어제 출퇴근 기록 (가끔 늦게 온 날도 있게)
  const until = today();
  shifts.filter(s => s.user_id && s.date < until).forEach((s, i) => {
    const late = i % 9 === 4 ? 12 + (i % 3) * 5 : 0, start = s.start_min + late - (late ? 0 : 3);
    timecards.push({id: uuid(), user_id: s.user_id, store_id: s.store_id, clock_in: zonedToISO(s.date, start), clock_out: zonedToISO(s.date, s.end_min + 2),
      breaks: s.end_min - s.start_min > 300 ? [{start: zonedToISO(s.date, s.start_min + 180), end: zonedToISO(s.date, s.start_min + 210)}] : [], in_geo: {ok: true, dist: 20 + i % 40}, source: 'app'});
  });
  const swaps = [];
  shifts.filter(s => s.user_id && s.date > until).filter((_, i) => i % 7 === 3).slice(0, 4)
    .forEach((s, i) => swaps.push({id: uuid(), shift_id: s.id, from_user: s.user_id, to_user: null, status: 'open', note: ['시험이 있어요', 'doctor appt', '가족 행사', ''][i], created_at: new Date().toISOString()}));
  return {people, availability, prefs, settings, shifts, timecards, timeOff: [], swaps, fixes: []};
}

function demoBackend(c) {
  const me = c.profile?.user_id || 'me', myName = c.profile?.display_name || '나', myStores = (c.stores || []).map(s => s.id).filter(id => TEAM_STORES.includes(id));
  let db;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { db = null; }
  if (!db || db.me !== me || !db.v3) db = {me, v3: true, ...seedDemo(me, myName, myStores.length ? myStores : TEAM_STORES)};
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* 저장 못 해도 화면은 돼요 */ } };
  save();
  const ok = v => Promise.resolve(v);
  const fail = msg => Promise.reject(new Error(msg));
  const myCard = () => db.timecards.find(tc => tc.user_id === me && !tc.clock_out);
  const nameOf = id => db.people.find(p => p.id === id)?.name || '';
  function demoMarket() {
    const t = today(), posted = db.swaps.filter(w => w.status === 'open').map(w => ({w, s: db.shifts.find(x => x.id === w.shift_id)})).filter(x => x.s && x.s.published && x.s.date >= t)
      .map(({w, s}) => ({swap_id: w.id, shift_id: s.id, store_id: s.store_id, date: s.date, start_min: s.start_min, end_min: s.end_min, position: s.position || '', from_user: w.from_user, from_name: nameOf(w.from_user), note: w.note || ''}));
    const open = db.shifts.filter(s => !s.user_id && s.published && s.date >= t && !db.swaps.some(w => w.shift_id === s.id && ['open', 'accepted'].includes(w.status)))
      .map(s => ({swap_id: null, shift_id: s.id, store_id: s.store_id, date: s.date, start_min: s.start_min, end_min: s.end_min, position: s.position || '', from_user: null, from_name: '', note: s.note || ''}));
    return [...posted, ...open].sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min);
  }
  const autoApply = w => { const s = db.shifts.find(x => x.id === w.shift_id); if (w.status === 'accepted' && !db.settings[s.store_id]?.swap_approval) { s.user_id = w.to_user; w.status = 'approved'; } };
  return {
    mode: 'demo', me,
    reset() { localStorage.removeItem(DEMO_KEY); db = {me, ...seedDemo(me, myName, myStores.length ? myStores : TEAM_STORES)}; save(); },
    async load({from, to}) {
      return {
        people: db.people, settings: db.settings, availability: db.availability, prefs: db.prefs,
        shifts: db.shifts.filter(s => s.date >= addDays(from, -7) && s.date <= to),
        timecards: db.timecards.filter(tc => { const d = localParts(tc.clock_in).date; return (d >= addDays(from, -31) && d <= to) || !tc.clock_out; }),
        timeOff: db.timeOff, swaps: db.swaps, fixes: db.fixes || [], market: demoMarket()
      };
    },
    saveSettings(store, s) { db.settings[store] = {...db.settings[store], ...s, store_id: store}; save(); return ok(); },
    saveAvailability(rows, max, note, want = {}) { db.availability = db.availability.filter(a => a.user_id !== me).concat(rows.map(r => ({...r, user_id: me}))); db.prefs[me] = {max_hours: max, note, desired_hours: want.desired_hours ?? null, want_max: !!want.want_max}; save(); return ok(); },
    saveShifts(store, rows, deleteIds = []) {
      db.shifts = db.shifts.filter(s => !deleteIds.includes(s.id));
      for (const r of rows) { const i = db.shifts.findIndex(s => s.id === r.id), v = {...r, store_id: store, id: r.id || uuid()}; if (i >= 0) db.shifts[i] = {...v, published: db.shifts[i].published || !!r.published}; else db.shifts.push(v); }
      save(); return ok(rows.length);
    },
    publish(store, from, to) { let n = 0; db.shifts.forEach(s => { if (s.store_id === store && s.date >= from && s.date <= to && !s.published) { s.published = true; n++; } }); save(); return ok(n); },
    requestTimeOff(from, to, reason) {
      const need = Math.max(...myStores.map(st => db.settings[st]?.notice_days ?? DEFAULT_NOTICE_DAYS), 0);
      if (!noticeOk(from, today(), need)) return fail(`Time off needs ${need} days notice`);
      db.timeOff.push({id: uuid(), user_id: me, start_date: from, end_date: to, reason, status: 'pending', created_at: new Date().toISOString()}); save(); return ok();
    },
    cancelTimeOff(id) { const r = db.timeOff.find(x => x.id === id && x.user_id === me); if (r) r.status = 'cancelled'; save(); return ok(); },
    decideTimeOff(id, yes) { const r = db.timeOff.find(x => x.id === id); if (r) { r.status = yes ? 'approved' : 'denied'; r.decided_name = myName; } save(); return ok(); },
    swapOffer(shiftId, toUser, note) {
      const s = db.shifts.find(x => x.id === shiftId);
      if (db.swaps.some(w => w.shift_id === shiftId && ['open', 'accepted'].includes(w.status))) return fail('Swap already requested');
      const w = s.user_id === me ? {id: uuid(), shift_id: shiftId, from_user: me, to_user: toUser || null, status: toUser ? 'accepted' : 'open', note, created_at: new Date().toISOString()}
        : {id: uuid(), shift_id: shiftId, from_user: null, to_user: me, status: 'accepted', note, created_at: new Date().toISOString()};
      db.swaps.push(w); autoApply(w);
      save(); return ok();
    },
    swapAccept(id) {
      const w = db.swaps.find(x => x.id === id), s = db.shifts.find(x => x.id === w.shift_id);
      if (db.shifts.some(x => x.user_id === me && x.date === s.date && x.start_min < s.end_min && s.start_min < x.end_min)) return fail('You already work then');
      w.to_user = me; w.status = 'accepted'; autoApply(w); save(); return ok();
    },
    swapDecide(id, yes) { const w = db.swaps.find(x => x.id === id); if (yes) { db.shifts.find(s => s.id === w.shift_id).user_id = w.to_user; w.status = 'approved'; } else w.status = 'denied'; save(); return ok(); },
    swapCancel(id) { const w = db.swaps.find(x => x.id === id); if (w) w.status = 'cancelled'; save(); return ok(); },
    punch(store, kind, pos) {
      const now = new Date().toISOString(), card = myCard();
      if (kind === 'in') {
        if (card) return fail('Already clocked in');
        if (!pos) return fail('Location required');
        const g = geoCheck(db.settings[store], pos);
        if (g.reason === 'store_unset') return fail('Store location not configured');
        if (!g.ok) return fail(`Too far from store: ${g.dist} m (limit ${g.radius} m)`);
        db.timecards.push({id: uuid(), user_id: me, store_id: store, clock_in: now, clock_out: null, breaks: [], in_geo: {...pos, dist: g.dist, ok: true}, source: 'app'});
      } else {
        if (!card) return fail('Not clocked in');
        if (kind === 'break_start' && !card.breaks.some(b => !b.end)) card.breaks.push({start: now});
        if (kind === 'break_end' || kind === 'out') card.breaks.forEach(b => { if (!b.end) b.end = now; });
        if (kind === 'out') { card.clock_out = now; const g = geoCheck(db.settings[card.store_id], pos); card.out_geo = pos ? {...pos, dist: g.dist, ok: g.reason === 'store_unset' ? null : g.ok} : null; }
      }
      save(); return ok();
    },
    saveTimecard({id, user_id, store_id, clock_in, clock_out, breaks, note}) {
      if (!String(note || '').trim()) return fail('Reason required');
      const i = db.timecards.findIndex(x => x.id === id), v = {id: id || uuid(), user_id, store_id, clock_in, clock_out, breaks: breaks || [], note, source: i >= 0 ? db.timecards[i].source : 'manager', edited_at: new Date().toISOString(), in_geo: i >= 0 ? db.timecards[i].in_geo : null};
      if (i >= 0) db.timecards[i] = v; else db.timecards.push(v);
      save(); return ok();
    },
    deleteTimecard(id, note) { if (!String(note || '').trim()) return fail('Reason required'); db.timecards = db.timecards.filter(x => x.id !== id); save(); return ok(); },
    requestFix({timecard_id, store_id, new_in, new_out, break_min, reason}) {
      if (!String(reason || '').trim()) return fail('Reason required');
      db.fixes = db.fixes || [];
      if (timecard_id && db.fixes.some(f => f.timecard_id === timecard_id && f.status === 'pending')) return fail('Fix already requested');
      db.fixes.push({id: uuid(), timecard_id: timecard_id || null, user_id: me, store_id, new_in, new_out, break_min: break_min || 0, reason, status: 'pending', created_at: new Date().toISOString()}); save(); return ok();
    },
    cancelFix(id) { const f = (db.fixes || []).find(x => x.id === id && x.user_id === me); if (f) f.status = 'cancelled'; save(); return ok(); },
    decideFix(id, yes) {
      const f = db.fixes.find(x => x.id === id); if (!f) return ok();
      if (yes) {
        const cid = f.timecard_id || f.id, i = db.timecards.findIndex(x => x.id === cid);
        const v = {id: cid, user_id: f.user_id, store_id: f.store_id, clock_in: f.new_in, clock_out: f.new_out, breaks: f.break_min ? [{start: new Date(new Date(f.new_in).getTime() + 3 * 3600000).toISOString(), end: new Date(new Date(f.new_in).getTime() + 3 * 3600000 + f.break_min * 60000).toISOString()}] : [], source: 'manager', note: '✓ ' + f.reason, edited_at: new Date().toISOString()};
        if (i >= 0) db.timecards[i] = {...db.timecards[i], ...v}; else db.timecards.push(v);
      }
      f.status = yes ? 'approved' : 'denied'; save(); return ok();
    },
    syncSheet() { return Promise.resolve({skipped: 'demo'}); }
  };
}

// ── Supabase ───────────────────────────────────────────
function supaBackend(c, stores) {
  const db = c.db, me = c.profile?.user_id;
  const call = async (name, args) => { const {data, error} = await db.rpc(name, args); if (error) throw error; return data; };
  const rows = async q => { const {data, error} = await q; if (error) throw error; return data || []; };
  const shiftOut = s => ({id: s.id, store_id: s.store_id, date: s.shift_date, start_min: s.start_min, end_min: s.end_min, position: s.position || '', user_id: s.user_id, note: s.note || '', published: s.published});
  return {
    mode: 'live', me,
    async probe() { const {error} = await db.from('kream_team_settings').select('store_id').limit(1); if (error) throw error; },
    async load({from, to}) {
      const peopleLists = await Promise.all(stores.map(st => call('kream_team_people', {target_store: st}).then(list => list.map(p => ({...p, store: st})))));
      const people = new Map();
      for (const p of peopleLists.flat()) { const cur = people.get(p.user_id) || {id: p.user_id, name: p.display_name, role: p.role, stores: []}; cur.stores.push(p.store); people.set(p.user_id, cur); }
      const fromISO = zonedToISO(addDays(from, -31), 0), toISO = zonedToISO(addDays(to, 1), 0);
      const [settings, availability, prefs, shifts, mine, market, timecards, openCards, timeOff, swaps, fixes] = await Promise.all([
        rows(db.from('kream_team_settings').select('*').in('store_id', stores)),
        rows(db.from('kream_team_availability').select('*')),
        rows(db.from('kream_team_prefs').select('*')),
        rows(db.from('kream_team_shifts').select('*').in('store_id', stores).gte('shift_date', addDays(from, -7)).lte('shift_date', to).order('shift_date').limit(3000)),
        rows(db.from('kream_team_shifts').select('*').eq('user_id', me).gte('shift_date', addDays(from, -7)).lte('shift_date', addDays(to, 31))),
        call('kream_team_market', {}).catch(() => []),
        rows(db.from('kream_team_timecards').select('*').gte('clock_in', fromISO).lt('clock_in', toISO).order('clock_in').limit(5000)),
        rows(db.from('kream_team_timecards').select('*').is('clock_out', null)),
        rows(db.from('kream_team_time_off').select('*').gte('end_date', addDays(today(), -60)).order('start_date')),
        rows(db.from('kream_team_swaps').select('*').in('status', ['open', 'accepted', 'approved', 'denied']).gte('created_at', zonedToISO(addDays(today(), -30), 0))),
        rows(db.from('kream_team_timecard_requests').select('*').gte('created_at', zonedToISO(addDays(today(), -45), 0)).order('created_at'))
      ]);
      const cards = new Map([...timecards, ...openCards].map(tc => [tc.id, tc]));
      return {
        people: [...people.values()],
        settings: Object.fromEntries(stores.map(st => [st, settings.find(s => s.store_id === st) || {store_id: st, lat: null, lng: null, radius_m: DEFAULT_RADIUS, notice_days: DEFAULT_NOTICE_DAYS, swap_approval: false, needs: []}])),
        availability, prefs: Object.fromEntries(prefs.map(p => [p.user_id, p])),
        shifts: [...new Map([...shifts, ...mine].map(s => [s.id, s])).values()].map(shiftOut), timecards: [...cards.values()], timeOff, swaps, fixes,
        market: (market || []).map(m => ({swap_id: m.swap_id, shift_id: m.shift_id, store_id: m.store_id, date: m.shift_date, start_min: m.start_min, end_min: m.end_min, position: m.shift_position || '', from_user: m.from_user, from_name: m.from_name || '', note: m.note || ''}))
      };
    },
    saveSettings: (store, s) => call('kream_team_save_settings', {target_store: store, new_lat: s.lat ?? null, new_lng: s.lng ?? null, new_radius: s.radius_m, new_notice: s.notice_days, new_swap_approval: s.swap_approval, new_needs: s.needs || []}),
    saveAvailability: (list, max, note, want = {}) => call('kream_team_save_availability', {rows: list, new_max_hours: max === '' || max == null ? null : Number(max), new_note: note || '', new_desired_hours: want.desired_hours === '' || want.desired_hours == null ? null : Number(want.desired_hours), new_want_max: !!want.want_max}),
    saveShifts: (store, list, deleteIds = []) => call('kream_team_save_shifts', {target_store: store, rows: list.map(s => ({...s, id: s.id || uuid()})), delete_ids: deleteIds}),
    publish: (store, from, to) => call('kream_team_publish', {target_store: store, from_date: from, to_date: to}),
    requestTimeOff: (from, to, reason) => call('kream_team_request_time_off', {request_id: uuid(), from_date: from, to_date: to, why: reason || ''}),
    cancelTimeOff: id => call('kream_team_cancel_time_off', {target_id: id}),
    decideTimeOff: (id, yes) => call('kream_team_decide_time_off', {target_id: id, approve: yes}),
    swapOffer: (shiftId, toUser, note) => call('kream_team_swap_offer', {request_id: uuid(), target_shift: shiftId, target_user: toUser || null, why: note || ''}),
    swapAccept: id => call('kream_team_swap_accept', {target_id: id}),
    swapDecide: (id, yes) => call('kream_team_swap_decide', {target_id: id, approve: yes}),
    swapCancel: id => call('kream_team_swap_cancel', {target_id: id}),
    punch: (store, kind, pos) => call('kream_team_punch', {request_id: uuid(), target_store: store, punch: kind, lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.acc ?? null}),
    saveTimecard: tc => call('kream_team_save_timecard', {target_id: tc.id || uuid(), target_user: tc.user_id, target_store: tc.store_id, new_in: tc.clock_in, new_out: tc.clock_out || null, new_breaks: tc.breaks || [], why: tc.note || ''}),
    deleteTimecard: (id, note) => call('kream_team_delete_timecard', {target_id: id, why: note || ''}),
    requestFix: f => call('kream_team_request_timecard_fix', {request_id: uuid(), target_timecard: f.timecard_id || null, target_store: f.store_id, want_in: f.new_in, want_out: f.new_out || null, want_break: f.break_min || 0, why: f.reason || ''}),
    cancelFix: id => call('kream_team_cancel_timecard_fix', {target_id: id}),
    decideFix: (id, yes) => call('kream_team_decide_timecard_fix', {target_id: id, approve: yes}),
    /** 시트에 이번 주 스케줄 / 가능 시간 다시 쓰기. 시트(Apps Script)가 이 사람 토큰으로 Supabase에서 직접 읽어요. */
    async syncSheet(what, weekStartYmd, extra = {}) {
      if (!SCHEDULE_SHEET_URL) return {skipped: 'no_url'};
      const {data} = await db.auth.getSession(), token = data?.session?.access_token;
      if (!token) return {skipped: 'no_session'};
      const r = await fetch(SCHEDULE_SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: what, week_start: weekStartYmd, token, ...extra})});
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out.ok === false) throw Error(out.error || 'SHEET_FAILED');
      return out;
    }
  };
}

let cached = null;
/** c: 앱 moduleContext → {mode:'live'|'demo', ...} (한 번 정하면 계속 써요) */
export async function teamBackend(c, stores) {
  const key = `${c.preview}|${c.profile?.user_id}|${stores.join(',')}`;
  if (cached?.key === key) return cached.api;
  let api;
  if (c.preview || !c.db) api = demoBackend(c);
  else {
    const live = supaBackend(c, stores);
    try { await live.probe(); api = live; }
    catch (e) { if (missingTable(e)) { api = demoBackend(c); api.why = 'no_tables'; } else throw e; }
  }
  cached = {key, api};
  return api;
}
export const newId = uuid;
