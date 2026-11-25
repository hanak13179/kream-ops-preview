// 근무·스케줄 (1·3·4호점) — 화면 없이 계산만 하는 부분이에요 (테스트: tests/team-logic.test.mjs)
// 출퇴근 GPS 확인, 가능 시간, 자동 스케줄, 근무기록(시간·초과근무), 팁 나누기용 시간 바꾸기.
// 날짜는 모두 토론토 기준 'YYYY-MM-DD', 시간은 하루 시작부터 분(0~1440)이에요.

export const TEAM_STORES = ['downtown', 'richmond-hill', 'finch'];
export const TZ = 'America/Toronto';
export const WEEK_OT_HOURS = 44;          // 온타리오: 한 주 44시간 넘으면 초과근무
export const DEFAULT_MAX_HOURS = 40;
export const DEFAULT_WANT_HOURS = 24;   // 원하는 시간을 안 적은 사람
export const DEFAULT_RADIUS = 100;        // m · 매장 POS에서 100m 안에서만 출근
export const DEFAULT_NOTICE_DAYS = 14;
export const LATE_GRACE_MIN = 5;
// 매장 위치는 매니저가 매장 안에서 설정 → '지금 여기로 정하기'를 눌러 정해요.
// (POS 옆에 서서 누르세요) 정하기 전에는 출근이 막히지 않고 '매장 위치 미설정'으로 기록돼요 (잘못된 좌표로 출근을 막지 않게).
export const STORE_ADDRESS = {downtown: '526 Yonge St, Toronto', 'richmond-hill': '10039 Yonge St, Richmond Hill', finch: '5619 Yonge St, North York'};

const pad = n => String(n).padStart(2, '0');
const round2 = n => Math.round(n * 100) / 100;

// ── 날짜·시간 ─────────────────────────────────────────
const partsFmt = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
/** Date/ISO → {date:'YYYY-MM-DD', min} (토론토) */
export function localParts(value) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(value)).map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) % 24 * 60 + Number(p.minute)};
}
export const today = (now = new Date()) => localParts(now).date;
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a, b) {
  const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86400000);
}
/** 0=일 … 6=토 */
export function weekday(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
/** 월요일 시작 주 */
export function weekStart(ymd) { return addDays(ymd, -((weekday(ymd) + 6) % 7)); }
export function weekDates(start) { return Array.from({length: 7}, (_, i) => addDays(start, i)); }
export function parseTime(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  if (m[3]) { if (h < 1 || h > 12) return null; h = h % 12 + (m[3][0] === 'p' ? 12 : 0); }
  if (h > 24 || min > 59 || (h === 24 && min)) return null;
  return h * 60 + min;
}
export const timeValue = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;   // <input type=time>
export function fmtTime(min, lang = 'ko') {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (lang === 'ko') return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}${m ? ':' + pad(m) : '시'}`;
  return `${h % 12 || 12}${m ? ':' + pad(m) : ''}${h < 12 ? 'am' : 'pm'}`;
}
export const fmtRange = (a, b, lang) => `${fmtTime(a, lang)}–${fmtTime(b, lang)}`;
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'], DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (wd, lang = 'ko') => (lang === 'ko' ? DAY_KO : DAY_EN)[wd];
export function fmtDate(ymd, lang = 'ko') {
  const [, m, d] = ymd.split('-').map(Number);
  return lang === 'ko' ? `${m}/${d} (${DAY_KO[weekday(ymd)]})` : `${DAY_EN[weekday(ymd)]} ${m}/${d}`;
}
export const shiftMinutes = s => Math.max(0, s.end_min - s.start_min);
export const shiftHours = s => round2(shiftMinutes(s) / 60);
export const overlaps = (a, b) => a.date === b.date && a.start_min < b.end_min && b.start_min < a.end_min;

// ── GPS ───────────────────────────────────────────────
export function distanceM(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** 매장 POS에서 반경(기본 100m) 안인지. 서버(SQL)도 같은 규칙으로 다시 확인해요.
 *  GPS가 부정확하면(정확도 > 반경) 'fuzzy' → 창가에서 다시 눌러 달라고 안내해요. */
export function geoCheck(store, pos) {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return {ok: false, reason: 'no_location'};
  if (!store || !Number.isFinite(store.lat) || !Number.isFinite(store.lng)) return {ok: false, reason: 'store_unset', dist: null};   // 서버도 위치가 없으면 출근을 막아요 (Store location not configured)
  const dist = Math.round(distanceM(store, pos)), acc = Math.round(Math.max(0, Number(pos.acc) || 0)), radius = Number(store.radius_m) || DEFAULT_RADIUS;
  const ok = dist <= radius;
  return {ok, dist, acc, radius, reason: ok ? 'near' : acc > radius ? 'fuzzy' : 'far'};
}

// ── 가능 시간 · 휴가 ─────────────────────────────────
/** rows: [{user_id, weekday, kind:'all'|'none'|'range', start_min, end_min}] → 'yes' | 'no' | 'unset' */
export function availability(rows, userId, ymd, start, end) {
  const r = (rows || []).find(a => a.user_id === userId && Number(a.weekday) === weekday(ymd));
  if (!r) return 'unset';
  if (r.kind === 'none') return 'no';
  if (r.kind === 'range') return start >= r.start_min && end <= r.end_min ? 'yes' : 'no';
  return 'yes';
}
export const onTimeOff = (timeOff, userId, ymd) => (timeOff || []).some(o => o.user_id === userId && o.status === 'approved' && o.start_date <= ymd && ymd <= o.end_date);
export function noticeOk(startDate, todayYmd, days) { return daysBetween(todayYmd, startDate) >= (Number(days) || 0); }

/** 이 근무에 걸리는 문제들 → ['timeoff','unavailable','overlap','overmax'] */
export function shiftIssues(shift, {shifts = [], availabilityRows = [], timeOff = [], prefs = {}} = {}) {
  if (!shift.user_id) return [];
  const out = [];
  if (onTimeOff(timeOff, shift.user_id, shift.date)) out.push('timeoff');
  if (availability(availabilityRows, shift.user_id, shift.date, shift.start_min, shift.end_min) === 'no') out.push('unavailable');
  const mine = shifts.filter(s => s.user_id === shift.user_id && s.id !== shift.id);
  if (mine.some(s => overlaps(s, shift))) out.push('overlap');
  const wk = weekStart(shift.date), max = Number(prefs[shift.user_id]?.max_hours) || DEFAULT_MAX_HOURS;
  const hours = [...mine.filter(s => weekStart(s.date) === wk), shift].reduce((a, s) => a + shiftMinutes(s), 0) / 60;
  if (hours > max + 1e-9) out.push('overmax');
  return out;
}

/** 이 사람이 일주일에 원하는 시간 (꼭 맞추는 건 아니고 자동 스케줄이 참고해요). '최대한 많이'면 주 최대 시간 */
export function wantHours(pref) {
  const max = Number(pref?.max_hours) || DEFAULT_MAX_HOURS;
  if (pref?.want_max) return max;
  const w = Number(pref?.desired_hours);
  return w > 0 ? Math.min(w, max) : Math.min(DEFAULT_WANT_HOURS, max);
}

// ── 자동 스케줄 ───────────────────────────────────────
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
/**
 * 필요 인원(needs)대로 한 주를 채워요. 이미 있는 근무(다른 매장 포함)는 그대로 두고 빈 자리만 채워요.
 * needs: [{weekday, start_min, end_min, count, position}]
 * people: [{id, name, stores:[...]}]   (이 매장에서 일하는 사람)
 * shifts: 이번 주 모든 근무 (모든 매장)  → 겹침·시간 계산에 써요
 * → {shifts: 새 근무(아직 게시 안 함), unfilled: [{date,start_min,end_min,position,missing}]}
 * 규칙: 휴가·안 되는 시간·겹치는 근무는 빼고 / 주 최대 시간 넘지 않게 / 하루 한 번
 *       / 원하는 시간 대비 덜 받은 사람부터 (원하는 시간 비율로 골고루 → '최대한 많이'는 더 받지만 다른 사람도 꾸준히 받아요)
 */
export function autoSchedule({store, dates, needs = [], people = [], shifts = [], availabilityRows = [], timeOff = [], prefs = {}, maxPerDay = 1}) {
  const all = shifts.map(s => ({...s}));
  const added = [], unfilled = [];
  const hoursOf = id => all.filter(s => s.user_id === id).reduce((a, s) => a + shiftMinutes(s), 0) / 60;
  const daysOf = id => new Set(all.filter(s => s.user_id === id).map(s => s.date)).size;
  // 1) 채워야 할 자리 (이미 같은 시간·포지션 근무가 있으면 빼요)
  const units = [];
  for (const date of dates) {
    const wd = weekday(date), taken = all.filter(s => s.store_id === store && s.date === date);
    for (const n of needs.filter(x => Number(x.weekday) === wd && x.end_min > x.start_min)) {
      const pos = n.position || '';
      const have = taken.filter(s => s.start_min === n.start_min && s.end_min === n.end_min && (s.position || '') === pos);
      have.forEach(s => taken.splice(taken.indexOf(s), 1));
      for (let i = have.length; i < (Number(n.count) || 0); i++) units.push({date, start_min: n.start_min, end_min: n.end_min, position: pos});
    }
  }
  const fits = (p, u) => {
    const s = {...u, user_id: p.id};
    if (onTimeOff(timeOff, p.id, u.date)) return false;
    if (availability(availabilityRows, p.id, u.date, u.start_min, u.end_min) === 'no') return false;
    const mine = all.filter(x => x.user_id === p.id);
    if (mine.some(x => overlaps(x, s))) return false;
    if (mine.filter(x => x.date === u.date).length >= maxPerDay) return false;
    const max = Number(prefs[p.id]?.max_hours) || DEFAULT_MAX_HOURS;
    return hoursOf(p.id) + shiftMinutes(u) / 60 <= max + 1e-9;
  };
  // 2) 할 수 있는 사람이 적은 자리부터
  const pool = people.filter(p => !p.stores || p.stores.includes(store));
  units.forEach(u => { u.options = pool.filter(p => fits(p, u)).length; });
  units.sort((a, b) => a.options - b.options || a.date.localeCompare(b.date) || a.start_min - b.start_min);
  for (const u of units) {
    const c = pool.filter(p => fits(p, u));
    // 원하는 시간을 아직 못 채운 사람 먼저 → 그 안에서는 원하는 시간 대비 비율이 낮은 사람 (공평하게)
    const fill = id => hoursOf(id) / wantHours(prefs[id]), under = id => hoursOf(id) + 1e-9 < wantHours(prefs[id]) ? 0 : 1;
    c.sort((a, b) => under(a.id) - under(b.id) || fill(a.id) - fill(b.id) || daysOf(a.id) - daysOf(b.id) || hash(a.id + u.date) - hash(b.id + u.date));
    const s = {date: u.date, store_id: store, start_min: u.start_min, end_min: u.end_min, position: u.position, user_id: c[0]?.id || null, published: false, auto: true};
    all.push(s); added.push(s);
    if (!c.length) unfilled.push({date: u.date, start_min: u.start_min, end_min: u.end_min, position: u.position, missing: 1});
  }
  added.sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min);
  return {shifts: added, unfilled};
}
/** 지난주 근무를 이번 주로 (사람·시간 그대로, 게시 안 함) */
export function copyWeek(shifts, fromStart, toStart, store) {
  const off = daysBetween(fromStart, toStart);
  return shifts.filter(s => s.store_id === store && s.date >= fromStart && s.date <= addDays(fromStart, 6))
    .map(s => ({date: addDays(s.date, off), store_id: store, start_min: s.start_min, end_min: s.end_min, position: s.position || '', user_id: s.user_id || null, note: s.note || '', published: false}));
}

// ── 근무기록 (출퇴근) ─────────────────────────────────
/** timecard: {clock_in, clock_out, breaks:[{start,end}]} → 쉬는 시간 뺀 시간 */
export function breakMinutes(tc, now = new Date()) {
  return (tc.breaks || []).reduce((a, b) => b.start ? a + Math.max(0, (new Date(b.end || tc.clock_out || now) - new Date(b.start)) / 60000) : a, 0);
}
export function workedHours(tc, now = new Date()) {
  if (!tc.clock_in) return 0;
  const end = tc.clock_out ? new Date(tc.clock_out) : now;
  return round2(Math.max(0, (end - new Date(tc.clock_in)) / 60000 - breakMinutes(tc, now)) / 60);
}
export const onBreak = tc => !!tc && !tc.clock_out && (tc.breaks || []).some(b => b.start && !b.end);
export const tcDate = tc => localParts(tc.clock_in).date;

/** 근무기록 + 스케줄 → 사람별 시간 (주 44시간 넘는 건 초과근무) */
export function timesheet({timecards = [], shifts = [], people = [], from, to, now = new Date()}) {
  const name = id => people.find(p => p.id === id)?.name || '—';
  const rows = new Map();
  for (const tc of timecards) {
    const date = tcDate(tc);
    if ((from && date < from) || (to && date > to)) continue;
    const r = rows.get(tc.user_id) || {user_id: tc.user_id, name: name(tc.user_id), cards: [], hours: 0, scheduled: 0, overtime: 0, flags: 0};
    const hrs = workedHours(tc, now), sched = shifts.find(s => s.user_id === tc.user_id && s.store_id === tc.store_id && s.date === date);
    const inMin = localParts(tc.clock_in).min, flags = [];
    if (!tc.clock_out) flags.push('open');
    if (sched && inMin > sched.start_min + LATE_GRACE_MIN) flags.push('late');
    if (!sched) flags.push('unscheduled');
    if (tc.in_geo && tc.in_geo.ok === false) flags.push('far');
    if (tc.source === 'manager' || tc.edited_at) flags.push('edited');
    if (hrs > 5 && !(tc.breaks || []).length) flags.push('nobreak');
    r.cards.push({...tc, date, hours: hrs, shift: sched || null, flags});
    r.hours += hrs; r.flags += flags.filter(f => f !== 'edited' && f !== 'unscheduled').length;
    rows.set(tc.user_id, r);
  }
  for (const s of shifts) {
    if (!s.user_id || (from && s.date < from) || (to && s.date > to)) continue;
    const r = rows.get(s.user_id) || {user_id: s.user_id, name: name(s.user_id), cards: [], hours: 0, scheduled: 0, overtime: 0, flags: 0};
    r.scheduled += shiftHours(s); rows.set(s.user_id, r);
  }
  for (const r of rows.values()) {
    const weeks = new Map();
    for (const c of r.cards) weeks.set(weekStart(c.date), (weeks.get(weekStart(c.date)) || 0) + c.hours);
    r.overtime = round2([...weeks.values()].reduce((a, h) => a + Math.max(0, h - WEEK_OT_HOURS), 0));
    r.hours = round2(r.hours); r.scheduled = round2(r.scheduled); r.regular = round2(r.hours - r.overtime);
    r.cards.sort((a, b) => a.clock_in < b.clock_in ? -1 : 1);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
export function timesheetCsv(rows, storeName = s => s) {
  const lines = [['Name', 'Date', 'Store', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Scheduled', 'Flags', 'Note']];
  for (const r of rows) for (const c of r.cards) {
    const t = v => v ? timeValue(localParts(v).min) : '';
    lines.push([r.name, c.date, storeName(c.store_id), t(c.clock_in), t(c.clock_out), Math.round(breakMinutes(c)), c.hours, c.shift ? `${timeValue(c.shift.start_min)}-${timeValue(c.shift.end_min)}` : '', c.flags.join(' '), c.note || '']);
  }
  lines.push([]); lines.push(['Name', 'Total hours', 'Regular', 'Overtime (>44h/wk)', 'Scheduled']);
  for (const r of rows) lines.push([r.name, r.hours, r.regular, r.overtime, r.scheduled]);
  return lines.map(l => l.map(csvCell).join(',')).join('\n');
}

// ── 팁 ────────────────────────────────────────────────
/** 출퇴근 기록 → tip-split.mjs splitTips() 가 받는 모양 [{date, name, store, hours}] (퇴근까지 한 기록만) */
export function tipShiftsFromTimecards(timecards, people) {
  const name = id => people.find(p => p.id === id)?.name || id;
  return (timecards || []).filter(tc => tc.clock_out && TEAM_STORES.includes(tc.store_id))
    .map(tc => ({date: tcDate(tc), name: name(tc.user_id), store: tc.store_id, hours: workedHours(tc)}))
    .filter(s => s.hours > 0);
}
/** 오늘 근무자 (캐시 카운트 '근무자' 칸 채우기): 출퇴근 기록이 있으면 그 시간, 없으면 게시된 스케줄 시간 */
export function crewForDay({timecards = [], shifts = [], people = [], store, date, now = new Date()}) {
  const name = id => people.find(p => p.id === id)?.name || '—';
  const byUser = new Map();
  for (const tc of timecards) if (tc.store_id === store && tcDate(tc) === date) byUser.set(tc.user_id, (byUser.get(tc.user_id) || 0) + workedHours(tc, now));
  if (!byUser.size) for (const s of shifts) if (s.store_id === store && s.date === date && s.user_id && s.published !== false) byUser.set(s.user_id, (byUser.get(s.user_id) || 0) + shiftHours(s));
  return [...byUser.entries()].map(([id, h]) => ({name: name(id), hours: round2(h)})).sort((a, b) => a.name.localeCompare(b.name));
}

// ── 매장 색 (앱·시트 같은 색) ─────────────────────────
export const STORE_COLORS = {
  downtown: {bg: '#fde2e4', line: '#d9707c', label: '1호점', en: 'Store 1 · Wellesley'},
  'richmond-hill': {bg: '#dbeafe', line: '#5b8fd6', label: '3호점', en: 'Store 3 · Richmond Hill'},
  finch: {bg: '#dcf2dc', line: '#5fa463', label: '4호점', en: 'Store 4 · Finch'}
};
export const storeLabel = (id, lang = 'ko') => STORE_COLORS[id] ? (lang === 'ko' ? STORE_COLORS[id].label : STORE_COLORS[id].en) : id;

// ── 지각 ──────────────────────────────────────────────
/** 이 출근 기록이 스케줄보다 몇 분 늦었는지 (5분까지는 봐줘요) → 0이면 늦지 않음 */
export function lateMinutes(tc, shifts) {
  const {date, min} = localParts(tc.clock_in);
  const s = (shifts || []).filter(x => x.user_id === tc.user_id && x.store_id === tc.store_id && x.date === date)
    .sort((a, b) => Math.abs(a.start_min - min) - Math.abs(b.start_min - min))[0];
  if (!s) return 0;
  const late = min - s.start_min;
  return late > LATE_GRACE_MIN ? late : 0;
}
/** 근무(shift)에 붙은 출근 기록 찾기 */
export function cardForShift(shift, timecards) {
  return (timecards || []).filter(tc => tc.user_id === shift.user_id && tc.store_id === shift.store_id && tcDate(tc) === shift.date)
    .sort((a, b) => Math.abs(localParts(a.clock_in).min - shift.start_min) - Math.abs(localParts(b.clock_in).min - shift.start_min))[0] || null;
}
/** 근무 상태: 'late'(늦게 옴) · 'noshow'(시작 15분 지났는데 안 옴) · 'working' · 'done' · '' */
export function shiftStatus(shift, timecards, now = new Date()) {
  if (!shift.user_id) return {status: ''};
  const tc = cardForShift(shift, timecards), n = localParts(now);
  if (tc) {
    const late = Math.max(0, localParts(tc.clock_in).min - shift.start_min);
    return {status: tc.clock_out ? 'done' : 'working', late: late > LATE_GRACE_MIN ? late : 0, card: tc};
  }
  if (shift.date < n.date || (shift.date === n.date && n.min > shift.start_min + 15)) return {status: shift.date === n.date && n.min < shift.end_min ? 'late_nocard' : 'noshow', late: shift.date === n.date ? n.min - shift.start_min : 0};
  return {status: ''};
}

/** 토론토 날짜+분 → ISO (서머타임 자동) */
export function zonedToISO(ymd, min) {
  const [y, m, d] = ymd.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60) + 5 * 3600000;
  for (let i = 0; i < 3; i++) {
    const p = localParts(t), diff = (daysBetween(ymd, p.date) * 1440 + p.min - min) * 60000;
    if (!diff) break; t -= diff;
  }
  return new Date(t).toISOString();
}

// ── 지각 반복 경고 · 퇴근 알림 ───────────────────────
export const LATE_WINDOW_DAYS = 30, LATE_STRONG = 3;
/** 최근 30일 지각 → {count, level: 0 | 1(주의) | 2(반복 경고), list} */
export function lateRecord(timecards, shifts, userId, todayYmd) {
  const list = (timecards || []).filter(tc => tc.user_id === userId && tcDate(tc) >= addDays(todayYmd, -LATE_WINDOW_DAYS))
    .map(tc => ({date: tcDate(tc), store_id: tc.store_id, late: lateMinutes(tc, shifts)})).filter(x => x.late).sort((a, b) => a.date.localeCompare(b.date));
  return {count: list.length, level: list.length >= LATE_STRONG ? 2 : list.length ? 1 : 0, list};
}
/** 퇴근 알림: 스케줄 끝난 지 10분 지났거나, 스케줄 없이 10시간 넘게 근무 중 */
export function clockOutReminder(card, shifts, now = new Date()) {
  if (!card || card.clock_out) return null;
  const n = localParts(now), d = tcDate(card);
  const s = (shifts || []).filter(x => x.user_id === card.user_id && x.store_id === card.store_id && x.date === d).sort((a, b) => b.end_min - a.end_min)[0];
  const hrs = (now - new Date(card.clock_in)) / 3600000;
  if (s && (n.date > d || n.min >= s.end_min + 10)) return {reason: 'after_shift', over: (daysBetween(d, n.date) * 1440 + n.min) - s.end_min, shift: s};
  if (!s && hrs >= 10) return {reason: 'long', hours: Math.round(hrs * 10) / 10};
  return null;
}

// ── 2주 급여 (Payroll) ────────────────────────────────
// 2주 급여 기간의 첫날(월요일). 실제 급여 시작일과 다르면 이 날짜만 바꾸면 돼요 (시트 Apps Script의 PAY_ANCHOR도 같이).
export const PAY_ANCHOR = '2026-11-16';
export function payPeriod(ymd, anchor = PAY_ANCHOR) {
  const k = Math.floor(daysBetween(anchor, ymd) / 14), from = addDays(anchor, k * 14);
  return {from, to: addDays(from, 13)};
}
/** 사람별 2주 합계: 시간·정규·초과(주 44h)·지각·카드팁·현금팁 */
export function payrollSummary({timecards = [], shifts = [], people = [], from, to, tips = []}) {
  const ts = timesheet({timecards, shifts, people, from, to});
  const tipOf = name => tips.find(x => x.name === name) || {};
  return ts.map(r => ({name: r.name, user_id: r.user_id, hours: r.hours, regular: r.regular, overtime: r.overtime, scheduled: r.scheduled,
    late: r.cards.filter(c => c.flags.includes('late')).length, open: r.cards.filter(c => !c.clock_out).length,
    card_tips: Number(tipOf(r.name).card) || 0, cash_tips: Number(tipOf(r.name).cash) || 0,
    stores: [...new Set(r.cards.map(c => c.store_id))]}));
}
