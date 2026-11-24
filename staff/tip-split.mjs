// 팁 나누기 (1·3·4호점)
// 마감하는 직원이 캐시 카운트에서 그날 현금 팁 · 카드 팁을 적으면 시트 'Tips' 탭에 매장·날짜별로 쌓여요.
// 매니저가 Homebase 타임시트 CSV를 올리면, 매장·날짜마다 그날 일한 사람들끼리 일한 시간 비율로 나눠요.
//   내 몫 = 그날 그 매장 팁 × (내 시간 ÷ 그날 그 매장에서 일한 모든 사람 시간)
// 현금 팁과 카드 팁은 따로 나눠요 (현금은 손으로, 카드는 급여로 주니까). 센트 단위로 맞춰서 합계가 팁과 딱 같아요.
// 어느 매장 근무인지는 Homebase 역할(Role) 이름으로 알아요: Wellesley/Downtown → 1호점, Richmond → 3호점, Finch → 4호점.

export const TIP_STORES = [
  {id: 'downtown', label: '1호점', keys: ['wellesley', 'downtown', 'yonge', '1호']},
  {id: 'richmond-hill', label: '3호점', keys: ['richmond', '3호']},
  {id: 'finch', label: '4호점', keys: ['finch', 'pantry', '4호']}
];
export const tipStoreLabel = id => TIP_STORES.find(s => s.id === id)?.label || id;
const cents = n => Math.round(Number(n || 0) * 100);
const dollars = c => Math.round(c) / 100;

/** 역할·부서 글자에서 매장 찾기. 못 찾으면 null */
export function storeFromRole(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return null;
  const hit = TIP_STORES.filter(st => st.keys.some(k => s.includes(k)));
  return hit.length === 1 ? hit[0].id : null;
}

/** 따옴표·쉼표·줄바꿈을 지키는 CSV 읽기 → 2차원 배열 */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

const MONTHS = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12};
const pad = n => String(n).padStart(2, '0');
/** '11/16/2026', '2026-11-16', 'Nov 16, 2026', 'Mon, Nov 16 2026', '11/16/26 10:00 AM' → '2026-11-16' */
export function toDate(text, fallbackYear) {
  const s = String(text || '').trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fallbackYear; if (y) return `${y}-${pad(m[1])}-${pad(m[2])}`; }
  m = s.toLowerCase().match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m && MONTHS[m[1]]) { const y = m[3] ? Number(m[3]) : fallbackYear; if (y) return `${y}-${pad(MONTHS[m[1]])}-${pad(m[2])}`; }
  return null;
}
/** '10:00 AM', '22:30', '11/16/2026 5:00 PM' → 하루 시작부터 분 */
export function toMinutes(text) {
  const m = String(text || '').trim().toLowerCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|a|p)?\s*$/);
  if (!m) return null;
  let h = Number(m[1]) % 24; const ap = m[3];
  if (ap) { h = h % 12; if (ap[0] === 'p') h += 12; }
  return h * 60 + Number(m[2]);
}
/** '7.5', '7:30', '7h 30m' → 7.5 */
export function toHours(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{2})$/); if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] || 0) + Number(m[2] || 0) / 60;
  const n = Number(s.replace(/,/g, '')); return isFinite(n) ? n : null;
}

// 머리글 이름으로 칸 찾기 (Homebase 내보내기마다 조금씩 달라서 여러 이름을 받아요)
const COLS = {
  first: [/^first ?name$/],
  last: [/^last ?name$/],
  name: [/^(employee|team member|name|employee name|full name)$/],
  date: [/^(date|shift date|day|work date)$/],
  role: [/^(role|roles|department|position|job|job title)$/],
  location: [/^(location|store)$/],
  hours: [/^(total hours|paid hours|total paid hours|hours worked|hours|total|regular hours)$/],
  regular: [/^(regular|regular hours|reg hours)$/],
  overtime: [/^(overtime|overtime hours|ot hours|ot)$/],
  clockIn: [/^(clock in|clock-in|clocked in|time in|in|start|start time|clock in time)$/],
  clockOut: [/^(clock out|clock-out|clocked out|time out|out|end|end time|clock out time)$/],
  breaks: [/^(breaks?|break (hours|duration|length)|unpaid breaks?)$/]
};
function findCols(head) {
  const h = head.map(x => String(x).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '').trim());
  const out = {};
  for (const [k, pats] of Object.entries(COLS)) { const i = h.findIndex(x => pats.some(p => p.test(x))); if (i >= 0) out[k] = i; }
  return out;
}

/**
 * Homebase 타임시트 CSV → 근무 한 줄씩
 * → {shifts:[{date,name,store,hours,role}], skipped:[{line,reason,text}], columns}
 */
export function parseHomebaseShifts(text, {year = new Date().getFullYear()} = {}) {
  const rows = parseCsv(text);
  const headAt = rows.findIndex(r => { const c = findCols(r); return (c.name != null || c.first != null) && (c.date != null || c.clockIn != null); });
  if (headAt < 0) return {shifts: [], skipped: [], columns: null, error: 'NO_HEADER'};
  const col = findCols(rows[headAt]);
  const shifts = [], skipped = [];
  let lastName = '';
  for (let i = headAt + 1; i < rows.length; i++) {
    const r = rows[i], get = k => col[k] == null ? '' : String(r[col[k]] ?? '').trim();
    const line = i + 1, raw = r.join(', ').slice(0, 120);
    let name = col.name != null ? get('name') : [get('first'), get('last')].filter(Boolean).join(' ');
    if (/^(total|totals|grand total|subtotal)\b/i.test(name) || /^(total|totals)\b/i.test(get('date'))) continue;
    if (!name && lastName && (get('date') || get('clockIn'))) name = lastName;   // 이름이 첫 줄에만 있는 내보내기
    if (!name) continue;
    lastName = name;
    const date = toDate(get('date') || get('clockIn'), year);
    if (!date) { skipped.push({line, reason: 'date', text: raw}); continue; }
    let hours = toHours(get('hours'));
    if (hours == null && (get('regular') || get('overtime'))) hours = (toHours(get('regular')) || 0) + (toHours(get('overtime')) || 0);
    if (hours == null) {
      const a = toMinutes(get('clockIn')), b = toMinutes(get('clockOut'));
      if (a != null && b != null) hours = ((b - a + 1440) % 1440) / 60 - (toHours(get('breaks')) || 0);
    }
    if (!(hours > 0)) { skipped.push({line, reason: 'hours', text: raw}); continue; }
    const role = get('role') || get('location');
    const store = storeFromRole(get('role')) || storeFromRole(get('location'));
    if (!store) { skipped.push({line, reason: 'store', text: raw, name, date, hours: Math.round(hours * 100) / 100, role}); continue; }
    shifts.push({date, name, store, hours: Math.round(hours * 100) / 100, role});
  }
  return {shifts, skipped, columns: col};
}

/** 금액(센트)을 무게 비율로 나누고, 남는 센트는 소수점이 큰 사람부터 1¢씩 → 합계가 정확히 맞아요 */
export function shareCents(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || !total) return weights.map(() => 0);
  const raw = weights.map(w => total * w / sum), base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  return base;
}

/**
 * tips: [{date, store, cash, card}]  (시트 'Tips' 탭)
 * shifts: parseHomebaseShifts(...).shifts
 * → {lines:[{date,store,name,hours,pct,cash,card,total}], people:[{name,hours,cash,card,total}], unsplit:[{date,store,cash,card}], from, to}
 */
export function splitTips(tips, shifts, {from = '', to = ''} = {}) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const hours = new Map();   // 'date|store' → Map(name → hours)
  for (const s of shifts) {
    if (!inRange(s.date)) continue;
    const k = s.date + '|' + s.store;
    if (!hours.has(k)) hours.set(k, new Map());
    const m = hours.get(k); m.set(s.name, (m.get(s.name) || 0) + s.hours);
  }
  const tipMap = new Map();
  for (const t of tips) {
    if (!inRange(t.date)) continue;
    const k = t.date + '|' + t.store, cur = tipMap.get(k) || {date: t.date, store: t.store, cash: 0, card: 0};
    cur.cash += cents(t.cash); cur.card += cents(t.card); tipMap.set(k, cur);
  }
  const lines = [], unsplit = [], people = new Map();
  for (const [k, t] of [...tipMap.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (!t.cash && !t.card) continue;
    const m = hours.get(k);
    if (!m || !m.size) { unsplit.push({date: t.date, store: t.store, cash: dollars(t.cash), card: dollars(t.card)}); continue; }
    const names = [...m.keys()].sort((a, b) => a.localeCompare(b)), w = names.map(n => m.get(n)), sum = w.reduce((a, b) => a + b, 0);
    const cash = shareCents(t.cash, w), card = shareCents(t.card, w);
    names.forEach((name, i) => {
      lines.push({date: t.date, store: t.store, name, hours: Math.round(w[i] * 100) / 100, pct: Math.round(w[i] / sum * 1000) / 10, cash: dollars(cash[i]), card: dollars(card[i]), total: dollars(cash[i] + card[i])});
      const p = people.get(name) || {name, hours: 0, cash: 0, card: 0};
      p.hours += w[i]; p.cash += cash[i]; p.card += card[i]; people.set(name, p);
    });
  }
  const dates = [...tipMap.values()].map(t => t.date).sort();
  return {
    lines, unsplit,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({name: p.name, hours: Math.round(p.hours * 100) / 100, cash: dollars(p.cash), card: dollars(p.card), total: dollars(p.cash + p.card)})),
    from: from || dates[0] || '', to: to || dates[dates.length - 1] || ''
  };
}
