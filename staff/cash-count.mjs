import {splitTips, tipStoreLabel} from './tip-split.mjs?v=20261123-tips1';
import {tipShiftsFromTimecards, crewForDay} from './team-logic.mjs?v=20261125-loc1';
import {teamBackend} from './team-data.mjs?v=20261125-loc1';
// 캐시 카운트 (1·3·4호점): 마감 때 지폐·동전 개수를 세면 합계, 오픈시재를 뺀 당일 현금매출이 바로 계산돼요.
// 오픈시재를 빼고 남는 현금 중 지폐로 딱 떨어지는 만큼만 봉투에 넣고, 남은 돈이 내일 오픈시재예요 (예: 남는 돈 $121 → 봉투 $120, $1은 남김).
// "시트에 저장"을 누르면 Cash Count 시트에 매장별·날짜별로 기록돼요 (오늘이 맨 위, 같은 날 다시 저장하면 그 줄을 고쳐요). 앱 데이터베이스는 바꾸지 않아요.
// 세는 중인 숫자는 이 기기에 매장·날짜별로 임시 저장돼서, 화면을 나갔다 와도 그대로예요.
// 팁: 마감 직원이 그날 현금 팁·카드 팁을 적어서 같이 저장해요 (시트 'Tips' 탭). 매니저는 맨 아래 '팁 나누기'에서 📅 스케줄의 출퇴근 기록(일한 시간)으로 나눠요 (tip-split.mjs). Homebase는 안 써요.

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwjnrGRDkR_qX7AmNq2S3oDVveSR1QbjED0FFga11Au1NcHWNNlPLQlZNwL7EpIlu6x/exec';
const SYNC_KEY = 'kream-stock-sync';
/** 시트 'Tips' 탭에서 기간의 매장·날짜별 현금/카드 팁 → [{date, store, cash, card}] (📅 스케줄의 2주 급여 요약도 써요) */
export async function fetchTips(from, to) {
  const r = await fetch(SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({key: SYNC_KEY, action: 'recordCash', op: 'getTips', from, to})});
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw Error(out.error || 'REQUEST_FAILED');
  return (out.data ?? out).tips || [];
}
export const CASH_STORES = ['downtown', 'richmond-hill', 'finch'];
// 4호점: 현금이 아주 조금이라 시재·봉투가 없어요 → 매출(After/Before Tax)·현금 매출·팁만 적어요 (시트 박스도 같게)
export const SIMPLE_CASH_STORES = ['finch'];
export const DENOMS = [
  [100, '$100'], [50, '$50'], [20, '$20'], [10, '$10'], [5, '$5'],
  [2, '$2'], [1, '$1'], [0.25, '25¢'], [0.1, '10¢'], [0.05, '5¢']
];
const DEFAULT_FLOAT = 300;
const STYLE_ID = 'cash-count-style';
const MANAGERS = ['owner', 'manager', 'general_manager', 'manager_factory'];
const CSS = `
.cc{max-width:560px;margin:0 auto 96px}
.cc *{box-sizing:border-box}
.cc-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-bottom:10px}
.cc-top label{min-width:0;font-size:12px;font-weight:700;color:#6b6555}
.cc-top select,.cc-top input,.cc-tipsplit input[type=date]{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin-top:4px;height:42px;line-height:40px;border-radius:12px;border:1px solid #e4ddcc;padding:0 10px;font-size:16px;font-weight:700;color:#2b2a26;background:#fff;-webkit-appearance:none;appearance:none}
.cc-top select{padding-right:28px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%236b6555' stroke-width='2'/%3E%3C/svg%3E") no-repeat right 10px center;text-overflow:ellipsis}
/* 아이폰 사파리: 날짜 칸이 위로 붕 뜨거나 옆으로 삐져나가지 않게 */
.cc input[type=date]::-webkit-date-and-time-value{text-align:left;margin:0;line-height:40px}
.cc input[type=date]::-webkit-datetime-edit{padding:0;line-height:40px}
.cc input[type=date]::-webkit-calendar-picker-indicator{margin:0}
.cc-card{background:#fff;border-radius:22px;padding:14px;box-shadow:0 3px 10px #0001;margin-bottom:12px}
.cc-card h3{margin:0 0 8px;font-size:18px}
.cc-row{display:grid;grid-template-columns:96px 1fr 92px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0ebe0}
.cc-row:last-child{border-bottom:0}
.cc-row b{font-size:17px}
.cc-row em{font-style:normal;text-align:right;font-weight:700;color:#3b382f}
.cc-step{display:grid;grid-template-columns:40px 1fr 40px;gap:6px;align-items:center}
.cc-step button{height:40px;border:0;border-radius:50%;background:#efe9db;font-size:20px}
.cc-step input{height:40px;border:1px solid #e4ddcc;border-radius:12px;text-align:center;font-size:18px;font-weight:700;width:100%}
.cc-sum{display:grid;grid-template-columns:1fr auto;gap:8px 12px;font-size:16px}
.cc-sum .big{font-size:26px;font-weight:800}
.cc-sum input{width:120px;height:40px;border:1px solid #e4ddcc;border-radius:12px;text-align:right;font-size:18px;padding:0 10px}
.cc-sales{color:#2f4a22}.cc-sales.neg{color:#a0522d}
.cc-actions{display:grid;grid-template-columns:1fr 2fr;gap:8px}
.cc-actions button{height:54px;border:0;border-radius:16px;font-size:17px;font-weight:700}
.cc-clear{background:#e4ddcc;color:#3b382f}
.cc-save{background:#3e4b33;color:#fff}
.cc-save:disabled{opacity:.45}
.cc-msg{min-height:20px;margin-top:8px;font-size:14px;font-weight:700}
.cc-msg.err{color:#a0522d}
.cc-note{width:100%;min-height:60px;border:0;border-radius:14px;background:#f7f3ea;padding:10px;font-size:15px}
.cc-env{margin-top:10px;padding:12px;border-radius:16px;background:#fdf1e7}
.cc-env b{font-size:24px}
.cc-env small{display:block;color:#a0522d;font-weight:600;margin-top:2px}
.cc-next{margin-top:8px;padding:12px;border-radius:16px;background:#e3efd9;font-weight:700}
.cc-next b{font-size:22px}
.cc-sum hr{grid-column:1/-1;width:100%;border:0;border-top:1px solid #f0ebe0;margin:2px 0}
.cc-tipsplit summary{cursor:pointer;font-size:18px;font-weight:800}
.cc-tipsplit label{display:block;font-size:12px;font-weight:700;color:#6b6555;margin-top:8px}
.cc-tipsplit input[type=date],.cc-tipsplit input[type=file]{display:block;width:100%;margin-top:4px;height:42px;border-radius:12px;border:1px solid #e4ddcc;padding:6px 10px;font-size:15px;background:#fff}
.cc-tipsplit .cc-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.cc-tipsplit button{margin-top:10px;width:100%;height:48px;border:0;border-radius:14px;font-size:16px;font-weight:700;background:#3e4b33;color:#fff}
.cc-tipsplit button.alt{background:#e4ddcc;color:#3b382f}
.cc-tipsplit button:disabled{opacity:.45}
.cc-tt{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
.cc-tt th,.cc-tt td{padding:6px 4px;border-bottom:1px solid #f0ebe0;text-align:right}
.cc-tt th:first-child,.cc-tt td:first-child{text-align:left}
.cc-tt tfoot td{font-weight:800}
.cc-warn{margin-top:10px;padding:10px;border-radius:14px;background:#fdf1e7;color:#7a3e1d;font-size:13px}
.cc-warn ul{margin:4px 0 0;padding-left:18px}
.cc input[type=number],.cc input.cc-in{background:#eef4ff;border:1.5px solid #8fb0e8 !important;color:#1d3f7a}
.cc-legend{margin:0 0 10px;padding:8px 12px;border-radius:14px;background:#eef4ff;color:#1d3f7a;font-size:13px;font-weight:700}
.cc-auto{font-size:11px;font-weight:700;color:#8a8370;margin-left:4px}
.cc-crew{margin-top:8px}
.cc-cr{padding:6px 0;border-bottom:1px solid #f0ebe0}
.cc-cr1{display:grid;grid-template-columns:minmax(0,1fr) 72px 32px;gap:6px;align-items:center}
.cc-cr1 input{width:100%;min-width:0;height:40px;border-radius:10px;padding:0 8px;font-size:16px}
.cc-cr1 input.h{text-align:right}
.cc-cr1 button{border:0;background:none;font-size:18px;color:#a0522d;height:40px}
.cc-cr2{margin-top:4px;font-size:13px;color:#6b6555}
.cc-cr2 b{color:#2f4a22;font-size:15px}
.cc-cr2[hidden]{display:none}
.cc-ctot{margin-top:8px;font-size:13px;font-weight:700;overflow-wrap:anywhere}
.cc-ctot[hidden]{display:none}
.cc-tipsplit .cc-two>*{min-width:0}
.cc-tipsplit input[type=date]{min-width:0;max-width:100%;-webkit-appearance:none;appearance:none}
.cc-sum>*{min-width:0}
.cc-tt{table-layout:fixed;overflow-wrap:anywhere}
.cc-synced{margin:6px 0 0;padding:8px 10px;border-radius:12px;background:#e8f0fe;font-size:13px;font-weight:600}
.cc-sched{display:block;margin-top:8px;padding:10px;border:1px dashed #b9b09a;border-radius:12px;font-size:14px;font-weight:700;text-align:center;cursor:pointer}
.cc-sched input{display:none}
.cc-add{margin-top:8px;width:100%;height:40px;border:1px dashed #b9b09a;border-radius:12px;background:#fff;font-size:15px;font-weight:700;color:#3b382f}
.cc-diff{font-size:14px;font-weight:700}.cc-diff.over{color:#2f4a22}.cc-diff.short{color:#a0522d}
`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style'); el.id = STYLE_ID; el.textContent = CSS; document.head.appendChild(el);
}

export const money = n => Math.round(Number(n || 0) * 100) / 100;
/** counts: {'100': 2, '0.25': 4, ...} → 합계 */
export function cashTotal(counts) { return money(DENOMS.reduce((s, [d]) => s + (Number(counts?.[String(d)]) || 0) * d, 0)); }
export function cashSummary(counts, openFloat = DEFAULT_FLOAT) {
  const total = cashTotal(counts), open = money(openFloat === '' || openFloat == null ? DEFAULT_FLOAT : openFloat);
  return {total, open, sales: money(total - open)};
}
const BILLS = [100, 50, 20, 10, 5];
/** 봉투에 넣을 돈: (합계 − 오픈시재) 이하에서, 가지고 있는 지폐로 딱 떨어지는 가장 큰 금액. 동전은 남겨요.
 *  → {amount, bills:{'100':n,...}} 예: 남는 돈 $121 → $120 */
export function envelope(counts, extra) {
  const have = BILLS.map(b => Math.max(0, Math.floor(Number(counts?.[String(b)]) || 0)));
  const target = Math.floor(Math.max(0, Number(extra) || 0) / 5) * 5;
  for (let amt = target; amt > 0; amt -= 5) {
    const use = [];
    const pick = (i, left) => { if (left === 0) return true; if (i >= BILLS.length) return false;
      for (let n = Math.min(have[i], Math.floor(left / BILLS[i])); n >= 0; n--) { use[i] = n; if (pick(i + 1, left - n * BILLS[i])) return true; }
      return false; };
    if (pick(0, amt)) return {amount: amt, bills: Object.fromEntries(BILLS.map((b, i) => [String(b), use[i] || 0]).filter(([, n]) => n))};
  }
  return {amount: 0, bills: {}};
}
/** 전체 계산: 합계, 남는 현금(합계−오픈시재), 봉투, 내일 오픈시재, 입력한 현금매출과 차이 */
export function cashPlan(v) {
  const s = cashSummary(v.counts, v.open), env = envelope(v.counts, s.sales);
  const reported = v.cashSales === '' || v.cashSales == null ? null : money(v.cashSales);
  return {...s, extra: s.sales, envelope: env.amount, bills: env.bills, nextOpen: money(s.total - env.amount), reported, diff: reported == null ? null : money(s.sales - reported)};
}
export const billText = bills => Object.entries(bills).sort((a, b) => b[0] - a[0]).map(([b, n]) => `$${b}×${n}`).join(' + ');
const fmt = n => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);

// 마감은 자정을 넘길 수 있어서, 새벽 4시 전에는 어제 날짜로 세요.
export function cashDate(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'}).formatToParts(now).map(x => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day - (+p.hour < 4 ? 1 : 0))).toISOString().slice(0, 10);
}

// 오늘 근무한 사람끼리 일한 시간만큼 현금·카드 팁을 따로 나눠요 (센트 단위, 남는 센트는 시간 많은 사람부터)
export function shareTips(cash, card, crew) {
  const people = (crew || []).map(p => ({name: String(p.name || '').trim(), hours: Math.max(0, Number(p.hours) || 0)})).filter(p => p.name || p.hours);
  const hours = people.reduce((a, p) => a + p.hours, 0);
  // 누적 반올림: 앞사람부터 '여기까지 받을 몫'을 반올림해서 뺀 값 → 합이 항상 팁 총액과 딱 맞고, 시트 수식과도 같아요
  const part = amount => {
    const cents = Math.round((Number(amount) || 0) * 100);
    if (!hours || !cents) return people.map(() => 0);
    let cum = 0, prev = 0;
    return people.map(p => { cum += p.hours; const upto = Math.round(cents * cum / hours), c = upto - prev; prev = upto; return c / 100; });
  };
  const c1 = part(cash), c2 = part(card);
  return {hours: money(hours), people: people.map((p, i) => ({...p, cash: c1[i], card: c2[i], total: money(c1[i] + c2[i])}))};
}
// After Tax(세금 포함)와 Before Tax(세금 전)는 더하지 않아요. 차이 = 세금 → 영수증 확인용
export function salesTotal(after, before) { return after === '' || before === '' || after == null || before == null ? '' : money((Number(after) || 0) - (Number(before) || 0)); }

const memory = {store: '', date: ''};
const blank = () => ({counts: {}, open: DEFAULT_FLOAT, cashSales: '', afterTax: '', beforeTax: '', total: '', cashTips: '', cardTips: '', crew: [], note: ''});
function key(store, date) { return `kream-cash-${store}-${date}`; }
function shiftDate(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function prevDay(date) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
function crewKey(store) { return `kream-cash-crew-${store}`; }
function lastCrew(store) { try { return (JSON.parse(localStorage.getItem(crewKey(store)) || '[]') || []).map(name => ({name, hours: ''})); } catch { return []; } }
function load(store, date) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(store, date)) || 'null');
    if (saved) return {...blank(), ...saved, crew: saved.crew || []};
    // 처음 여는 날: 어제 이 기기에서 센 '내일 오픈시재'를 오늘 오픈시재로
    const prev = JSON.parse(localStorage.getItem(key(store, prevDay(date))) || 'null');
    return {...blank(), ...(prev ? {open: cashPlan({...blank(), ...prev}).nextOpen} : {}), crew: lastCrew(store)};   // 지난번 근무자 이름을 미리 채워요 (시간은 비움)
  } catch { return blank(); }
}
// 시트 박스 → 앱 화면 값 (시트가 기준: 누가 시트에서 고치면 앱에도 그대로 보여요)
export function fromSheetBox(box, base) {
  const v = {...base, counts: {}};
  DENOMS.forEach(([d], i) => { const n = Number(box.counts?.[i]) || 0; if (n) v.counts[String(d)] = n; });
  const opt = x => (x === '' || x == null ? '' : money(x));
  if (box.open !== '' && box.open != null) v.open = money(box.open);
  v.cashSales = opt(box.pos); v.afterTax = opt(box.after); v.beforeTax = opt(box.before);
  v.cashTips = opt(box.cashTips); v.cardTips = opt(box.cardTips);
  v.crew = (box.crew || []).map(p => ({name: String(p.name || ''), hours: p.hours === '' || p.hours == null ? '' : Number(p.hours)}));
  v.total = salesTotal(v.afterTax, v.beforeTax);
  return v;
}
// 근무자 칸이 비었거나 이름만 있으면 📅 스케줄(출퇴근 기록, 없으면 게시된 스케줄)로 채워요
export function crewFromSchedule(crew, schedule) {
  if (!schedule?.length) return null;
  if ((crew || []).some(p => p.hours !== '' && p.hours != null)) return null;
  return schedule.map(p => ({name: p.name, hours: Number(p.hours) || ''}));
}
function keep(store, date, v) { try { localStorage.setItem(key(store, date), JSON.stringify(v)); } catch { /* 이 기기에 저장 못 해도 계산은 돼요 */ } }

/** c: {stores:[{id,name}], store, t, esc, profile, preview} */
export function renderCashCount(host, c) {
  ensureStyle();
  const {t, esc} = c;
  const stores = (c.stores || []).filter(s => CASH_STORES.includes(s.id));
  if (!stores.length) { host.innerHTML = `<p class="empty">${t('캐시 카운트는 1·3·4호점만 써요.', 'Cash count is for stores 1, 3 and 4 only.')}</p>`; return; }
  if (!stores.some(s => s.id === memory.store)) memory.store = stores.some(s => s.id === c.store) ? c.store : stores[0].id;
  if (!memory.date) memory.date = cashDate();
  let v = load(memory.store, memory.date), saving = false, synced = '', syncTok = 0, touched = false;
  async function syncFromSheet() {
    if (c.preview) return;
    const tok = ++syncTok, store = memory.store, date = memory.date; touched = false;
    try {
      const got = await post({action: 'recordCash', op: 'getCash', store_id: store, count_date: date});
      if (tok !== syncTok || touched) return;   // 그 사이 다른 날짜로 바꿨거나 이미 입력을 시작했어요
      if (got.box) { v = fromSheetBox(got.box, v); synced = t('📋 시트에 저장된 값을 불러왔어요 (시트에서 고친 것도 보여요)', '📋 Loaded what is saved in the sheet (sheet edits show here too)'); }
      else {
        const app = await crewFromApp(store, date);
        const crew = crewFromSchedule(v.crew, app);
        if (tok !== syncTok || touched) return;
        if (crew) { v.crew = crew; synced = t(`📅 스케줄(출퇴근 기록)로 근무자 ${crew.length}명을 채웠어요 · 고칠 수 있어요`, `📅 Filled ${crew.length} people from the schedule (punches) · you can edit`); } else synced = '';
      }
      draw();
    } catch { /* 인터넷이 안 되면 이 기기 값으로 계속 써요 */ }
  }
  // 📅 스케줄 페이지의 출퇴근 기록(없으면 게시된 스케줄)으로 오늘 근무자·시간
  async function crewFromApp(store, date, anyMode = false) {
    try { const api = await teamBackend(c, stores.map(s => s.id)); if (api.mode !== 'live' && (!c.preview || !anyMode)) return []; const d = await api.load({from: date, to: date}); return crewForDay({...d, store, date}); }
    catch { return []; }
  }
  const manager = MANAGERS.includes(c.profile?.role) || !!c.profile?.store_manager || !!c.profile?.general_manager;
  const split = memory.split || (memory.split = {from: shiftDate(cashDate(), -14), to: shiftDate(cashDate(), -1), csv: '', file: '', result: null, skipped: [], busy: false, msg: ''});
  const num = (id, label, val, hint) => `<span>${label}${hint ? `<small style="display:block;font-size:11px;color:#6b6555">${hint}</small>` : ''}</span><input id="${id}" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(val ?? '')}" placeholder="$">`;

  // ── 팁 나누기 (매니저만) ─────────────────────────────
  const REASONS = {store: ['역할(Role)에 매장 이름이 없어요', 'No store in the role'], hours: ['시간이 없어요', 'No hours'], date: ['날짜를 못 읽었어요', 'Could not read the date']};
  function tipTable(r) {
    const tot = r.people.reduce((a, p) => ({hours: a.hours + p.hours, cash: a.cash + p.cash, card: a.card + p.card, total: a.total + p.total}), {hours: 0, cash: 0, card: 0, total: 0});
    const daily = r.lines.map(l => `<tr><td>${esc(l.date.slice(5))} ${esc(tipStoreLabel(l.store))} · ${esc(l.name)}</td><td>${l.hours}h</td><td>${l.pct}%</td><td>${fmt(l.cash)}</td><td>${fmt(l.card)}</td></tr>`).join('');
    return `<table class="cc-tt"><thead><tr><th>${t('이름', 'Name')}</th><th>${t('시간', 'Hours')}</th><th>${t('현금', 'Cash')}</th><th>${t('카드', 'Card')}</th><th>${t('합계', 'Total')}</th></tr></thead>
      <tbody>${r.people.map(p => `<tr><td>${esc(p.name)}</td><td>${p.hours}</td><td>${fmt(p.cash)}</td><td>${fmt(p.card)}</td><td><b>${fmt(p.total)}</b></td></tr>`).join('') || `<tr><td colspan="5">${t('나눌 팁이 없어요', 'No tips to split')}</td></tr>`}</tbody>
      <tfoot><tr><td>${t('합계', 'Total')}</td><td>${money(tot.hours)}</td><td>${fmt(money(tot.cash))}</td><td>${fmt(money(tot.card))}</td><td>${fmt(money(tot.total))}</td></tr></tfoot></table>
      ${daily ? `<details><summary style="font-size:14px;margin-top:8px">${t('날짜별 자세히', 'By day')}</summary><table class="cc-tt"><thead><tr><th></th><th>${t('시간', 'Hours')}</th><th>%</th><th>${t('현금', 'Cash')}</th><th>${t('카드', 'Card')}</th></tr></thead><tbody>${daily}</tbody></table></details>` : ''}`;
  }
  function tipWarnings(r) {
    const out = [];
    if (r && r.unsplit.length) out.push(`<b>${t('팁은 있는데 그 매장 출퇴근 기록이 없는 날 (나누지 않았어요 · 📅 스케줄 → 근무기록에서 빠진 기록을 넣어 주세요):', 'Tips with no one clocked in at that store (not split · add missing punches in 📅 Schedule → Timesheets):')}</b><ul>${r.unsplit.map(u => `<li>${esc(u.date)} ${esc(tipStoreLabel(u.store))} · ${t('현금', 'cash')} ${fmt(u.cash)} · ${t('카드', 'card')} ${fmt(u.card)}</li>`).join('')}</ul>`);
    if (split.skipped.length) out.push(`<b>${t('빠진 근무:', 'Shifts left out:')}</b><ul>${split.skipped.slice(0, 30).map(k => `<li>${esc(k.name ? `${k.date} · ${k.name} · ${k.hours}h${k.role ? ' · ' + k.role : ''}` : `${t('줄', 'line')} ${k.line}: ${k.text}`)} — ${esc(t(...(REASONS[k.reason] || [k.reason, k.reason])))}</li>`).join('')}${split.skipped.length > 30 ? `<li>… +${split.skipped.length - 30}</li>` : ''}</ul>`);
    return out.length ? `<div class="cc-warn">${out.join('')}</div>` : '';
  }
  function tipSplitHtml() {
    const r = split.result;
    return `<details class="cc-card cc-tipsplit" ${split.open ? 'open' : ''} id="ccSplit"><summary>🧮 ${t('팁 나누기 (매니저)', 'Split tips (managers)')}</summary>
      <p style="font-size:13px;color:#6b6555;margin:8px 0 0">${t('📅 스케줄의 출퇴근 기록으로 나눠요. 매장마다, 날마다 그날 일한 사람끼리 일한 시간만큼 나눠요 (현금·카드 따로). 빠진 출퇴근은 📅 스케줄 → 근무기록에서 먼저 넣어 주세요.', 'Split by clocked hours from 📅 Schedule. Each store’s tips for each day are shared by hours among the people who worked (cash and card separately). Add missing punches in 📅 Schedule → Timesheets first.')}</p>
      <div class="cc-two"><label>${t('시작', 'From')}<input type="date" id="ccSplitFrom" value="${esc(split.from)}"></label><label>${t('끝', 'To')}<input type="date" id="ccSplitTo" value="${esc(split.to)}"></label></div>
      <button data-cc="splitClock" ${split.busy ? 'disabled' : ''}>${split.busy ? t('계산 중…', 'Working…') : '⏱ ' + t('출퇴근 기록으로 나누기 계산', 'Calculate split from punches')}</button>
      ${r ? tipTable(r) : ''}${tipWarnings(r)}
      ${r && r.lines.length ? `<button data-cc="splitSave" ${split.busy || c.preview ? 'disabled' : ''}>${t('시트에 저장 (Tip Split 탭)', 'Save to sheet (Tip Split tab)')}</button>` : ''}
      <p class="cc-msg ${split.err ? 'err' : ''}">${esc(split.msg || '')}</p></details>`;
  }
  async function post(body) {
    const r = await fetch(SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({key: SYNC_KEY, ...body})});
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out.ok === false) throw Error(out.error || 'REQUEST_FAILED');
    return out.data ?? out;
  }
  async function runSplit(save, source = 'csv') {
    if (split.busy) return;
    split.busy = true; split.err = false; split.msg = ''; split.open = true; draw();
    try {
      if (!save && source === 'clock') {
        const api = await teamBackend(c, stores.map(s => s.id));
        if (api.mode !== 'live' && !c.preview) throw Error(t('실제 스케줄 연결 후 계산할 수 있어요.', 'Connect the live schedule before calculating.'));
        const d = await api.load({from: split.from, to: split.to});
        const shifts = tipShiftsFromTimecards(d.timecards, d.people).filter(s => s.date >= split.from && s.date <= split.to);
        const got = await post({action: 'recordCash', op: 'getTips', from: split.from, to: split.to});
        split.skipped = []; split.file = '';
        split.result = splitTips(got.tips || [], shifts, {from: split.from, to: split.to});
        split.msg = t(`앱 출퇴근 ${shifts.length}개 · 팁 기록 ${(got.tips || []).length}개${api.mode === 'demo' ? ' · (예시 모드)' : ''}`, `${shifts.length} app punches · ${(got.tips || []).length} tip records${api.mode === 'demo' ? ' · (demo)' : ''}`);
      } else {
        const r = split.result;
        await post({action: 'recordCash', op: 'saveTipSplit', from: r.from, to: r.to, people: r.people, lines: r.lines, unsplit: r.unsplit, skipped: split.skipped.length, staff: c.profile?.display_name || ''});
        split.msg = t('Tip Split 탭에 저장했어요', 'Saved to the Tip Split tab');
      }
    } catch (err) { split.err = true; split.msg = (save ? t('저장하지 못했어요', 'Could not save') : t('계산하지 못했어요', 'Could not calculate')) + ` (${err.message})`; }
    split.busy = false; draw();
  }

  function draw() {
    const simple = SIMPLE_CASH_STORES.includes(memory.store);
    host.innerHTML = `<div class="cc">
      <div class="cc-top"><label>${t('매장', 'Store')}<select id="ccStore">${stores.map(x => `<option value="${esc(x.id)}" ${x.id === memory.store ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}</select></label>
      <label>${t('마감 날짜', 'Closing date')}<input id="ccDate" type="date" value="${esc(memory.date)}"></label></div>
      <p class="cc-legend">🔵 ${t('파란 칸만 입력해요 · 나머지는 자동 계산', 'Fill in the blue boxes only · the rest is calculated')}</p>
      ${simple ? `<div class="cc-card"><p class="cc-legend" style="margin:0 0 8px">ℹ️ ${t('4호점은 시재가 없어요. 오늘 매출·현금 매출·팁만 적어요.', 'Store 4 has no float. Just record sales, cash sales and tips.')}</p><div class="cc-sum">
        ${num('ccCashSales', t('현금 매출 (POS)', 'Cash sales (POS)'), v.cashSales, t('Clover 리포트의 현금 매출', 'Cash sales on the Clover report'))}
      </div></div>` : `
      <div class="cc-card"><h3>💵 ${t('지폐·동전 몇 개?', 'How many of each?')}</h3>
      ${DENOMS.map(([d, label]) => { const n = Number(v.counts[String(d)]) || 0; return `<div class="cc-row"><b>${esc(label)}</b><div class="cc-step"><button data-cc="-" data-d="${d}" aria-label="${esc(label)} −">−</button><input data-d="${d}" type="number" inputmode="numeric" min="0" step="1" value="${n || ''}" placeholder="0" aria-label="${esc(label)}"><button data-cc="+" data-d="${d}" aria-label="${esc(label)} +">＋</button></div><em data-line="${d}">${fmt(money(n * d))}</em></div>`; }).join('')}
      </div>
      <div class="cc-card"><div class="cc-sum">
        <span>${t('합계 (TTL)', 'Total (TTL)')}</span><span class="big" id="ccTotal"></span>
        ${num('ccOpen', t('오픈시재', 'Opening float'), v.open)}
        <span>${t('남는 현금 (합계 − 오픈시재)', 'Extra (total − float)')}</span><span class="big cc-sales" id="ccExtra"></span>
        <hr>
        ${num('ccCashSales', t('현금 매출 (POS)', 'Cash sales (POS)'), v.cashSales, t('Clover 리포트의 현금 매출', 'Cash sales on the Clover report'))}
        <span></span><span class="cc-diff" id="ccDiff"></span>
      </div>
      <div class="cc-env">✉️ ${t('봉투에 넣을 돈', 'Put in the envelope')}: <b id="ccEnv"></b><small id="ccBills"></small></div>
      <div class="cc-next">🌅 ${t('내일 오픈시재', 'Tomorrow’s opening float')}: <b id="ccNext"></b></div></div>
      `}
      <div class="cc-card"><h3>🧾 ${t('오늘 매출', 'Today’s sales')}</h3><div class="cc-sum">
        ${num('ccAfterTax', 'After Tax Sales', v.afterTax, t('영수증 보고 적어요', 'From the receipt'))}
        ${num('ccBeforeTax', 'Before Tax', v.beforeTax, t('영수증 보고 적어요', 'From the receipt'))}
        <span>${t('세금 (After − Before)', 'Tax (After − Before)')}<span class="cc-auto">${t('자동', 'auto')}</span></span><span class="big" id="ccSalesTotal"></span>
      </div></div>
      <div class="cc-card"><h3>💝 ${t('오늘 팁', 'Today’s tips')}</h3><div class="cc-sum">
        ${num('ccCashTips', t('현금 팁', 'Cash tips'), v.cashTips, t('팁 통에 있는 돈 전부', 'Everything in the tip jar'))}
        ${num('ccCardTips', t('카드 팁', 'Card tips'), v.cardTips, t('Clover 리포트의 Tips', 'Tips on the Clover report'))}
        <span>${t('팁 합계', 'Total tips')}<span class="cc-auto">${t('자동', 'auto')}</span></span><span class="big" id="ccTipTotal"></span>
      </div>
      <h3 style="margin-top:14px">👥 ${t('오늘 근무 (확인용)', 'Who worked today (to check)')}</h3>
      ${synced ? `<p class="cc-synced">${esc(synced)}</p>` : ''}
      <div class="cc-crew">${(v.crew || []).map((p, i) => `<div class="cc-cr"><div class="cc-cr1"><input class="cc-in" data-crew="${i}" data-k="name" value="${esc(p.name || '')}" placeholder="${t('이름', 'Name')}" maxlength="40"><input class="h" type="number" inputmode="decimal" min="0" step="0.25" data-crew="${i}" data-k="hours" value="${esc(p.hours ?? '')}" placeholder="${t('시간', 'h')}"><button data-cc="crewDel" data-i="${i}" aria-label="${t('빼기', 'Remove')}">✕</button></div><div class="cc-cr2" data-shareline="${i}">${t('현금', 'Cash')} <span data-share="${i}c"></span> + ${t('카드', 'Card')} <span data-share="${i}d"></span> = <b data-share="${i}t"></b></div></div>`).join('')}
        <div class="cc-ctot" id="ccCrewTot">${t('합계', 'Total')} <span id="ccCrewHours"></span> · ${t('현금', 'Cash')} <span id="ccCrewCash"></span> · ${t('카드', 'Card')} <span id="ccCrewCard"></span> · ${t('팁', 'Tips')} <b id="ccCrewTip"></b></div></div>
      <button class="cc-add" data-cc="crewAdd">＋ ${t('사람 추가', 'Add person')}</button>
      <button class="cc-sched" data-cc="crewApp" style="width:100%;border:0;border-radius:12px;padding:10px;font-size:15px;font-weight:700;background:#e9efe2;color:#3e4b33">📅 ${t('스케줄에서 근무자 불러오기', 'Fill from the schedule')}</button>
      <small style="display:block;margin-top:6px;color:#6b6555">${t('📅 스케줄의 오늘 출퇴근 기록(없으면 게시된 스케줄)으로 이름과 일한 시간을 채워요. 고칠 수 있어요. 현금·카드 팁을 시간만큼 나눠요. 현금 팁은 봉투·시재와 따로 보관해요.', 'Fills names and hours from today’s punches in 📅 Schedule (or the published schedule). You can edit. Cash and card tips are shared by hours. Keep cash tips separate from the envelope and float.')}</small>
      <div class="cc-card"><textarea id="ccNote" class="cc-note" maxlength="300" placeholder="${t('메모 (선택) · 예: 동전 롤 1개 따로 보관', 'Note (optional)')}">${esc(v.note || '')}</textarea></div>
      <div class="cc-actions"><button class="cc-clear" data-cc="clear">${t('다시 세기', 'Start over')}</button><button class="cc-save" data-cc="save" ${c.preview || saving ? 'disabled' : ''}>${saving ? t('저장 중…', 'Saving…') : t('시트에 저장 ✅', 'Save to sheet ✅')}</button></div>
      <p class="cc-msg" id="ccMsg">${c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : ''}</p>
      ${manager ? tipSplitHtml() : ''}
    </div>`;
    refresh();
  }
  function refresh() {
    const s = cashPlan(v), dummy = {textContent: '', classList: {toggle() {}}}, q = id => host.querySelector(id) || dummy;   // 4호점은 시재 칸이 없어요
    DENOMS.forEach(([d]) => { const el = host.querySelector(`[data-line="${d}"]`); if (el) el.textContent = fmt(money((Number(v.counts[String(d)]) || 0) * d)); });
    q('#ccTotal').textContent = fmt(s.total);
    q('#ccExtra').textContent = fmt(s.extra); q('#ccExtra').classList.toggle('neg', s.extra < 0);
    q('#ccEnv').textContent = fmt(s.envelope);
    q('#ccBills').textContent = s.envelope ? billText(s.bills) + (s.extra - s.envelope > 0 ? ' · ' + t(`나머지 ${fmt(money(s.extra - s.envelope))}는 시재에 남겨요`, `keep ${fmt(money(s.extra - s.envelope))} in the till`) : '') : s.extra > 0 ? t('지폐로 뺄 수 있는 돈이 없어요 · 전부 시재에 남겨요', 'No bills to take out · keep it all in the till') : '';
    q('#ccNext').textContent = fmt(s.nextOpen);
    q('#ccTipTotal').textContent = fmt(money((Number(v.cashTips) || 0) + (Number(v.cardTips) || 0)));
    v.total = salesTotal(v.afterTax, v.beforeTax);
    q('#ccSalesTotal').textContent = v.total === '' ? '—' : fmt(v.total) + (Number(v.total) < 0 ? ' ⚠️ ' + t('After와 Before가 바뀐 것 같아요', 'After/Before look swapped') : '');
    const sh = shareTips(v.cashTips, v.cardTips, v.crew), rows = (v.crew || []).map(p => ({name: String(p.name || '').trim(), hours: Math.max(0, Number(p.hours) || 0)}));
    let k = 0;
    rows.forEach((p, i) => {
      const got = (p.name || p.hours) ? sh.people[k++] : null;
      const set = (suf, val) => { const el = host.querySelector(`[data-share="${i}${suf}"]`); if (el) el.textContent = got ? fmt(val) : ''; };
      if (got) { set('c', got.cash); set('d', got.card); set('t', got.total); } else { set('c'); set('d'); set('t'); }
      const line = host.querySelector(`[data-shareline="${i}"]`); if (line) line.hidden = !got || !(sh.people.length && (Number(v.cashTips) || Number(v.cardTips)));
    });
    const sum = f => money(sh.people.reduce((a, p) => a + p[f], 0));
    q('#ccCrewHours').textContent = sh.hours ? sh.hours + 'h' : '';
    q('#ccCrewCash').textContent = sh.people.length ? fmt(sum('cash')) : '';
    q('#ccCrewCard').textContent = sh.people.length ? fmt(sum('card')) : '';
    q('#ccCrewTip').textContent = sh.people.length ? fmt(sum('total')) : '';
    q('#ccCrewTot').hidden = !sh.people.length;
    const diff = q('#ccDiff');
    diff.textContent = s.diff == null ? '' : s.diff === 0 ? t('✅ 현금 매출과 딱 맞아요', '✅ Matches cash sales') : s.diff > 0 ? t(`⬆ ${fmt(s.diff)} 더 많아요`, `⬆ ${fmt(s.diff)} over`) : t(`⬇ ${fmt(-s.diff)} 모자라요`, `⬇ ${fmt(-s.diff)} short`);
    diff.className = 'cc-diff ' + (s.diff > 0 ? 'over' : s.diff < 0 ? 'short' : '');
    keep(memory.store, memory.date, v);
  }
  function say(msg, err = false) { const m = host.querySelector('#ccMsg'); if (m) { m.textContent = msg; m.classList.toggle('err', err); } }
  function setCount(d, n) {
    n = Math.max(0, Math.min(99999, Math.floor(Number(n) || 0)));
    if (n) v.counts[String(d)] = n; else delete v.counts[String(d)];
    const inp = host.querySelector(`input[data-d="${d}"]`); if (inp && document.activeElement !== inp) inp.value = n || '';
    refresh();
  }
  const FIELDS = {ccOpen: 'open', ccCashSales: 'cashSales', ccAfterTax: 'afterTax', ccBeforeTax: 'beforeTax', ccCashTips: 'cashTips', ccCardTips: 'cardTips'};

  host.oninput = e => {
    const el = e.target; touched = true;
    if (el.dataset.d) return setCount(el.dataset.d, el.value);
    if (el.dataset.crew != null) { const p = v.crew[Number(el.dataset.crew)]; if (p) { p[el.dataset.k] = el.dataset.k === 'hours' ? (el.value === '' ? '' : Number(el.value)) : el.value; refresh(); } return; }
    if (FIELDS[el.id]) { v[FIELDS[el.id]] = el.value === '' ? '' : money(el.value); refresh(); return; }
    if (el.id === 'ccNote') { v.note = el.value; keep(memory.store, memory.date, v); }
  };
  host.onchange = e => {
    const el = e.target;
    if (el.id === 'ccSplitFrom' || el.id === 'ccSplitTo') { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) { split[el.id === 'ccSplitFrom' ? 'from' : 'to'] = el.value; split.result = null; split.open = true; draw(); } return; }
    if (el.id === 'ccStore' || el.id === 'ccDate') {
      if (el.id === 'ccStore') memory.store = el.value; else if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) memory.date = el.value;
      v = load(memory.store, memory.date); synced = ''; draw(); syncFromSheet();
    }
  };
  host.onclick = async e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.cc === '+' || b.dataset.cc === '-') return setCount(b.dataset.d, (Number(v.counts[b.dataset.d]) || 0) + (b.dataset.cc === '+' ? 1 : -1));
    if (b.dataset.cc === 'crewAdd') { v.crew = v.crew || []; v.crew.push({name: '', hours: ''}); draw(); const ins = host.querySelectorAll('[data-k="name"]'); if (ins.length) ins[ins.length - 1].focus(); return; }
    if (b.dataset.cc === 'crewDel') { v.crew.splice(Number(b.dataset.i), 1); return draw(); }
    if (b.dataset.cc === 'splitClock') return runSplit(false, 'clock');
    if (b.dataset.cc === 'crewApp') {
      const crew = await crewFromApp(memory.store, memory.date, true);
      if (!crew.length) return say(t('이 날 이 매장 출퇴근 기록이나 스케줄이 없어요', 'No punches or shifts for this store on this day'), true);
      touched = true; v.crew = crew; keep(memory.store, memory.date, v); draw();
      return say(t(`📅 스케줄에서 근무자 ${crew.length}명을 불러왔어요`, `📅 Filled ${crew.length} people from the schedule`));
    }
    if (b.dataset.cc === 'splitSave') return runSplit(true);
    if (b.dataset.cc === 'clear') { if (!confirm(t('센 숫자와 입력한 매출을 모두 지울까요?', 'Clear everything?'))) return; v = blank(); keep(memory.store, memory.date, v); return draw(); }
    if (b.dataset.cc === 'save') {
      if (c.preview || saving) return;
      const s = cashPlan(v);
      const simple = SIMPLE_CASH_STORES.includes(memory.store);
      if (!simple && !s.total && !confirm(t('합계가 $0이에요. 그래도 저장할까요?', 'Total is $0. Save anyway?'))) return;
      saving = true; b.disabled = true; b.textContent = t('저장 중…', 'Saving…');
      try {
        const r = await fetch(SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: 'recordCash', key: SYNC_KEY, store_id: memory.store, count_date: memory.date, counts: simple ? {} : v.counts, open_float: simple ? null : s.open, simple, cash_sales: s.reported, after_tax: v.afterTax === '' ? null : v.afterTax, before_tax: v.beforeTax === '' ? null : v.beforeTax, total_sales: v.total === '' ? null : v.total, crew: shareTips(v.cashTips, v.cardTips, v.crew).people, cash_tips: v.cashTips === '' ? null : v.cashTips, card_tips: v.cardTips === '' ? null : v.cardTips, staff: c.profile?.display_name || '', note: v.note || ''})});
        const out = await r.json().catch(() => ({}));
        if (!r.ok || out.ok === false) throw Error(out.error || 'SAVE_FAILED');
        try { localStorage.setItem(crewKey(memory.store), JSON.stringify(shareTips(0, 0, v.crew).people.map(p => p.name).filter(Boolean))); } catch {}
        saving = false; synced = ''; draw();
        const changes = (out.data || out).changes || [];
        say((simple ? t(`저장했어요 · 현금 매출 ${s.reported == null ? '—' : fmt(s.reported)} · 팁 ${fmt(money((Number(v.cashTips) || 0) + (Number(v.cardTips) || 0)))}`, `Saved · cash sales ${s.reported == null ? '—' : fmt(s.reported)} · tips ${fmt(money((Number(v.cashTips) || 0) + (Number(v.cardTips) || 0)))}`) : t(`저장했어요 · 봉투 ${fmt(s.envelope)} · 내일 오픈시재 ${fmt(s.nextOpen)}`, `Saved · envelope ${fmt(s.envelope)} · tomorrow’s float ${fmt(s.nextOpen)}`))
          + (changes.length ? ' · ' + t(`바뀐 것 ${changes.length}개를 시트 '변경 기록'에 남겼어요: `, `${changes.length} changes logged in the sheet: `) + changes.join(' · ') : ''));
      } catch (err) {
        saving = false; b.disabled = false; b.textContent = t('시트에 저장 ✅', 'Save to sheet ✅');
        say(t('저장하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.', 'Could not save. Check the connection and try again.') + ` (${err.message})`, true);
      }
    }
  };
  draw();
  syncFromSheet();
}
