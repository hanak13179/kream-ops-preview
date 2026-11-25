// 📊 HR Management — 화면 없이 계산만 (테스트: tests/hr-logic.test.mjs)
// 발주·캐시·품절·공장 재고·입고확인 + 사람(지각·미출근·퇴근 안 찍음·스케줄) 문제를 한곳에 모아요.
import {today as torontoToday, addDays, weekStart, weekDates, localParts, lateMinutes, shiftStatus, shiftIssues, tcDate, TEAM_STORES} from './team-logic.mjs?v=20261125-team4';

export const ORDER_STORES = ['downtown', 'midland', 'richmond-hill', 'finch'];   // 발주·재고는 2호점도 봐요 (스케줄·캐시는 1·3·4만)
export const LONG_OUT_DAYS = 4, STALE_COUNT_DAYS = 4, MISSED_ORDER_DAYS = 7, PEOPLE_DAYS = 14;
const live = o => o && !['cancelled', 'canceled', 'void'].includes(String(o.status || '').toLowerCase());

/** 내일 도착 발주를 했는지 (오늘 주문 → 내일 도착이 원칙) */
export function orderStatus({stores = ORDER_STORES, orders = [], baskets = [], today = torontoToday()}) {
  const tomorrow = addDays(today, 1);
  return stores.map(st => {
    const done = orders.some(o => live(o) && o.store_id === st && o.delivery_date === tomorrow);
    const b = baskets.find(x => x.store_id === st && x.delivery_date === tomorrow);
    return {store_id: st, date: tomorrow, done, inProgress: !done && !!b && (b.items || []).length > 0, items: b ? (b.items || []).length : 0};
  });
}
/** 최근 N일 중 발주가 없던 도착일 */
export function missedOrders({stores = ORDER_STORES, orders = [], today = torontoToday(), days = MISSED_ORDER_DAYS}) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    for (const st of stores) if (!orders.some(o => live(o) && o.store_id === st && o.delivery_date === d)) out.push({store_id: st, date: d});
  }
  return out;
}
const nameOf = (catalog, id) => { const p = catalog.find(c => c.id === id); return p ? (p.name_ko || p.name_en || id) : id; };
const active = (catalog, id) => { const p = catalog.find(c => c.id === id); return !p || (p.active !== false && !p.archived); };
/** 그 매장이 실제로 쓰는 품목인지: 최소수량·발주 기준이 있거나, 최근 30일 안에 발주한 적이 있음 (안 파는 품목의 0은 품절이 아니에요) */
export function carriedSet({stock = [], rules = [], orders = []}) {
  const k = new Set();
  for (const r of stock) if (Number(r.minimum) > 0) k.add(r.store_id + '|' + r.product_id);
  for (const r of rules) if (Number(r.weekday_base) > 0 || Number(r.weekend_base) > 0) k.add(r.store_id + '|' + r.product_id);
  for (const o of orders) if (live(o)) for (const i of (o.kream_order_items || o.items || [])) if (Number(i.quantity) > 0) k.add(o.store_id + '|' + i.product_id);
  return k;
}
/** 지점별 품절 (그 매장이 쓰는 품목 중 재고 0 이하) */
export function soldOut({stock = [], catalog = [], stores = ORDER_STORES, carried = null, orders = [], today = torontoToday()}) {
  const by = Object.fromEntries(stores.map(s => [s, []]));
  // 오늘·내일 도착 발주에 들어 있으면 '곧 들어옴'
  const coming = new Set();
  for (const o of orders) if (live(o) && (o.delivery_date === today || o.delivery_date === addDays(today, 1))) for (const i of (o.kream_order_items || o.items || [])) if (Number(i.quantity) > 0) coming.add(o.store_id + '|' + i.product_id);
  for (const r of stock) if (by[r.store_id] && Number(r.on_hand) <= 0 && active(catalog, r.product_id) && (!carried || carried.has(r.store_id + '|' + r.product_id)))
    by[r.store_id].push({product_id: r.product_id, name: nameOf(catalog, r.product_id), since: r.updated_at, coming: coming.has(r.store_id + '|' + r.product_id)});
  for (const s of stores) by[s].sort((a, b) => a.name.localeCompare(b.name));
  return by;
}
/** 오래 품절: 재고 0인데 최근 N일 동안 그 품목이 들어온(도착한) 발주가 없음 */
export function longSoldOut({stock = [], orders = [], catalog = [], today = torontoToday(), days = LONG_OUT_DAYS, stores = ORDER_STORES, carried = null}) {
  const from = addDays(today, -days), out = [];
  for (const r of stock) {
    if (!stores.includes(r.store_id) || Number(r.on_hand) > 0 || !active(catalog, r.product_id) || (carried && !carried.has(r.store_id + '|' + r.product_id))) continue;
    const came = orders.some(o => live(o) && o.store_id === r.store_id && o.delivery_date >= from && o.delivery_date <= addDays(today, 1) && (o.kream_order_items || o.items || []).some(i => i.product_id === r.product_id && Number(i.quantity) > 0));
    if (!came) out.push({store_id: r.store_id, product_id: r.product_id, name: nameOf(catalog, r.product_id)});
  }
  return out.sort((a, b) => a.store_id.localeCompare(b.store_id) || a.name.localeCompare(b.name));
}
/** 재고를 오래 안 셈 (실제로 센 날이 N일 넘음) → 매장별 개수 */
export function staleCounts({stock = [], catalog = [], today = torontoToday(), days = STALE_COUNT_DAYS, stores = ORDER_STORES, carried = null}) {
  const out = Object.fromEntries(stores.map(s => [s, []]));
  for (const r of stock) {
    if (!out[r.store_id] || !active(catalog, r.product_id) || (carried && !carried.has(r.store_id + '|' + r.product_id))) continue;
    const at = r.physical_count_at || r.updated_at;
    if (!at || localParts(at).date < addDays(today, -days)) out[r.store_id].push({product_id: r.product_id, name: nameOf(catalog, r.product_id), at});
  }
  return out;
}
/** 공장 완제품 재고 없음: 실제로 센(counted) 품목 중 0 이하. 안 센 품목의 마이너스는 '보낸 게 더 많음'이라 따로 개수만 */
export function factoryOut({finished = [], catalog = []}) {
  return finished.filter(f => f.counted !== false && Number(f.quantity) <= 0 && active(catalog, f.product_id))
    .map(f => ({product_id: f.product_id, name: nameOf(catalog, f.product_id), quantity: Number(f.quantity), unit: f.order_unit || ''}))
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
}
/** 원재료·소모품 부족 (최소보다 적거나 0) */
export function lowMaterials(materials = []) {
  return materials.filter(m => m.active !== false && m.on_hand != null && (Number(m.on_hand) <= 0 || (m.minimum != null && Number(m.on_hand) < Number(m.minimum))))
    .map(m => ({id: m.id, name: m.name_ko || m.name_en, on_hand: Number(m.on_hand), minimum: m.minimum == null ? null : Number(m.minimum), unit: m.unit || ''}))
    .sort((a, b) => a.on_hand - b.on_hand);
}
/** 공장이 보냈는데 매장이 입고확인 안 함 (도착일 지남) */
export function notReceived({orders = [], receipts = [], today = torontoToday()}) {
  const got = new Set(receipts.map(r => r.order_id));
  return orders.filter(o => live(o) && ['dispatched', 'shipped', 'sent'].includes(String(o.status).toLowerCase()) && o.delivery_date < today && !got.has(o.id))
    .map(o => ({id: o.id, store_id: o.store_id, date: o.delivery_date}));
}

// ── 사람 ──────────────────────────────────────────────
/** 지각·미출근 (최근 N일) → 사람별 */
export function attendance({shifts = [], timecards = [], people = [], today = torontoToday(), days = PEOPLE_DAYS, now = new Date()}) {
  const from = addDays(today, -days), name = id => people.find(p => p.id === id)?.name || '—', by = new Map();
  const row = id => by.get(id) || by.set(id, {user_id: id, name: name(id), late: [], noShow: []}).get(id);
  for (const s of shifts) {
    if (!s.user_id || s.published === false || s.date < from || s.date > today || !TEAM_STORES.includes(s.store_id)) continue;
    const st = shiftStatus(s, timecards, now);
    if (st.late) row(s.user_id).late.push({date: s.date, store_id: s.store_id, minutes: st.late});
    if (st.status === 'noshow') row(s.user_id).noShow.push({date: s.date, store_id: s.store_id, start_min: s.start_min});
  }
  return [...by.values()].filter(r => r.late.length || r.noShow.length).sort((a, b) => (b.noShow.length * 3 + b.late.length) - (a.noShow.length * 3 + a.late.length));
}
/** 퇴근을 안 찍은 기록 (12시간 넘게 열려 있음, 또는 어제 이전) */
export function openPunches({timecards = [], people = [], now = new Date()}) {
  const name = id => people.find(p => p.id === id)?.name || '—', t = localParts(now).date;
  return timecards.filter(tc => !tc.clock_out && ((now - new Date(tc.clock_in)) / 3600000 >= 12 || tcDate(tc) < t))
    .map(tc => ({id: tc.id, user_id: tc.user_id, name: name(tc.user_id), store_id: tc.store_id, date: tcDate(tc), hours: Math.round((now - new Date(tc.clock_in)) / 360000) / 10}));
}
/** 스케줄 문제: 다음 주 미게시, 다음 7일 빈 근무, 겹침·휴가·안 되는 시간, 대기 중인 요청 */
export function scheduleProblems({stores = TEAM_STORES, shifts = [], timeOff = [], swaps = [], fixes = [], availability = [], prefs = {}, people = [], today = torontoToday()}) {
  const next = addDays(weekStart(today), 7), nextDates = weekDates(next), name = id => people.find(p => p.id === id)?.name || '—';
  const unpublished = stores.filter(st => !shifts.some(s => s.store_id === st && s.published !== false && s.date >= next && s.date <= nextDates[6]))
    .map(st => ({store_id: st, week: next, drafts: shifts.filter(s => s.store_id === st && s.published === false && s.date >= next && s.date <= nextDates[6]).length}));
  const soon = shifts.filter(s => s.date >= today && s.date <= addDays(today, 7) && s.published !== false);
  const open = soon.filter(s => !s.user_id).map(s => ({...s}));
  const conflicts = soon.filter(s => s.user_id).map(s => ({s, issues: shiftIssues(s, {shifts, availabilityRows: availability, timeOff, prefs})})).filter(x => x.issues.length)
    .map(({s, issues}) => ({...s, name: name(s.user_id), issues}));
  return {unpublished, open, conflicts,
    pendingTimeOff: timeOff.filter(o => o.status === 'pending').length,
    pendingSwaps: swaps.filter(w => w.status === 'accepted').length,
    pendingFixes: fixes.filter(f => f.status === 'pending').length};
}

/** 맨 위에 보여줄 요약 (빨강 = 지금 해야 해요) */
export const ORDER_DUE_MIN = 18 * 60, CASH_DUE_MIN = 22 * 60;   // 발주는 저녁, 캐시 카운트는 마감 후 → 그 전엔 빨간색 아님
export function headline({orders, cash, nowMin = ORDER_DUE_MIN, attendanceRows, open, problems, sold, factory, notRec, pendingAccounts}) {
  const out = [];
  const notOrdered = orders.filter(o => !o.done);
  if (notOrdered.length && nowMin >= ORDER_DUE_MIN) out.push({key: 'order', level: 'red', n: notOrdered.length});
  const noCash = cash.filter(c => c.done === false);
  if (noCash.length && nowMin >= CASH_DUE_MIN) out.push({key: 'cash', level: 'red', n: noCash.length});
  if (open.length) out.push({key: 'open', level: 'red', n: open.length});
  const ns = attendanceRows.reduce((a, r) => a + r.noShow.length, 0), late = attendanceRows.reduce((a, r) => a + r.late.length, 0);
  if (ns) out.push({key: 'noshow', level: 'red', n: ns});
  if (late) out.push({key: 'late', level: 'amber', n: late});
  const sch = problems.unpublished.length + problems.open.length + problems.conflicts.length + problems.pendingTimeOff + problems.pendingSwaps + problems.pendingFixes;
  if (sch) out.push({key: 'schedule', level: 'amber', n: sch});
  const so = Object.values(sold).reduce((a, l) => a + l.filter(x => !x.coming).length, 0);
  if (so) out.push({key: 'soldout', level: 'amber', n: so});
  if (factory) out.push({key: 'factory', level: 'amber', n: factory});
  if (notRec) out.push({key: 'receive', level: 'amber', n: notRec});
  if (pendingAccounts) out.push({key: 'accounts', level: 'amber', n: pendingAccounts});
  return out;
}
