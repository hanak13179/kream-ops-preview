import {parseHomebaseShifts, splitTips, tipStoreLabel} from './tip-split.mjs?v=20261123-tips1';
// 캐시 카운트 (1·3·4호점): 마감 때 지폐·동전 개수를 세면 합계, 오픈시재를 뺀 당일 현금매출이 바로 계산돼요.
// 오픈시재를 빼고 남는 현금 중 지폐로 딱 떨어지는 만큼만 봉투에 넣고, 남은 돈이 내일 오픈시재예요 (예: 남는 돈 $121 → 봉투 $120, $1은 남김).
// "시트에 저장"을 누르면 Cash Count 시트에 매장별·날짜별로 기록돼요 (오늘이 맨 위, 같은 날 다시 저장하면 그 줄을 고쳐요). 앱 데이터베이스는 바꾸지 않아요.
// 세는 중인 숫자는 이 기기에 매장·날짜별로 임시 저장돼서, 화면을 나갔다 와도 그대로예요.
// 팁: 마감 직원이 그날 현금 팁·카드 팁을 적어서 같이 저장해요 (시트 'Tips' 탭). 매니저는 맨 아래 '팁 나누기'에서 Homebase 타임시트로 나눠요 (tip-split.mjs).

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwjnrGRDkR_qX7AmNq2S3oDVveSR1QbjED0FFga11Au1NcHWNNlPLQlZNwL7EpIlu6x/exec';
const SYNC_KEY = 'kream-stock-sync';
export const CASH_STORES = ['downtown', 'richmond-hill', 'finch'];
export const DENOMS = [
  [100, '$100'], [50, '$50'], [20, '$20'], [10, '$10'], [5, '$5'],
  [2, '$2 (투니)'], [1, '$1 (루니)'], [0.25, '25¢'], [0.1, '10¢'], [0.05, '5¢']
];
const DEFAULT_FLOAT = 300;
const STYLE_ID = 'cash-count-style';
const MANAGERS = ['owner', 'manager', 'general_manager', 'manager_factory'];
const CSS = `
.cc{max-width:560px;margin:0 auto 96px}
.cc *{box-sizing:border-box}
.cc-top{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.cc-top label{flex:1;min-width:140px;font-size:12px;font-weight:700;color:#6b6555}
.cc-top select,.cc-top input{display:block;width:100%;margin-top:4px;height:42px;border-radius:12px;border:1px solid #e4ddcc;padding:0 10px;font-size:16px;background:#fff}
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
.cc-tipsplit .cc-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cc-tipsplit button{margin-top:10px;width:100%;height:48px;border:0;border-radius:14px;font-size:16px;font-weight:700;background:#3e4b33;color:#fff}
.cc-tipsplit button.alt{background:#e4ddcc;color:#3b382f}
.cc-tipsplit button:disabled{opacity:.45}
.cc-tt{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
.cc-tt th,.cc-tt td{padding:6px 4px;border-bottom:1px solid #f0ebe0;text-align:right}
.cc-tt th:first-child,.cc-tt td:first-child{text-align:left}
.cc-tt tfoot td{font-weight:800}
.cc-warn{margin-top:10px;padding:10px;border-radius:14px;background:#fdf1e7;color:#7a3e1d;font-size:13px}
.cc-warn ul{margin:4px 0 0;padding-left:18px}
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

const memory = {store: '', date: ''};
const blank = () => ({counts: {}, open: DEFAULT_FLOAT, cashSales: '', afterTax: '', beforeTax: '', total: '', cashTips: '', cardTips: '', note: ''});
function key(store, date) { return `kream-cash-${store}-${date}`; }
function shiftDate(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function prevDay(date) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
function load(store, date) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(store, date)) || 'null');
    if (saved) return {...blank(), ...saved};
    // 처음 여는 날: 어제 이 기기에서 센 '내일 오픈시재'를 오늘 오픈시재로
    const prev = JSON.parse(localStorage.getItem(key(store, prevDay(date))) || 'null');
    return prev ? {...blank(), open: cashPlan({...blank(), ...prev}).nextOpen} : blank();
  } catch { return blank(); }
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
  let v = load(memory.store, memory.date), saving = false;
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
    if (r && r.unsplit.length) out.push(`<b>${t('팁은 있는데 Homebase에 일한 사람이 없는 날 (나누지 않았어요):', 'Tips with no one clocked in at that store (not split):')}</b><ul>${r.unsplit.map(u => `<li>${esc(u.date)} ${esc(tipStoreLabel(u.store))} · ${t('현금', 'cash')} ${fmt(u.cash)} · ${t('카드', 'card')} ${fmt(u.card)}</li>`).join('')}</ul>`);
    if (split.skipped.length) out.push(`<b>${t('빠진 근무 (Homebase에서 고치고 다시 내보내 주세요):', 'Shifts left out (fix in Homebase and export again):')}</b><ul>${split.skipped.slice(0, 30).map(k => `<li>${esc(k.name ? `${k.date} · ${k.name} · ${k.hours}h${k.role ? ' · ' + k.role : ''}` : `${t('줄', 'line')} ${k.line}: ${k.text}`)} — ${esc(t(...(REASONS[k.reason] || [k.reason, k.reason])))}</li>`).join('')}${split.skipped.length > 30 ? `<li>… +${split.skipped.length - 30}</li>` : ''}</ul>`);
    return out.length ? `<div class="cc-warn">${out.join('')}</div>` : '';
  }
  function tipSplitHtml() {
    const r = split.result;
    return `<details class="cc-card cc-tipsplit" ${split.open ? 'open' : ''} id="ccSplit"><summary>🧮 ${t('팁 나누기 (매니저)', 'Split tips (managers)')}</summary>
      <p style="font-size:13px;color:#6b6555;margin:8px 0 0">${t('Homebase → 타임시트 → 기간을 고르고 CSV로 내보낸 파일을 올려 주세요. 매장마다, 날마다 그날 일한 사람끼리 일한 시간만큼 나눠요 (현금·카드 따로).', 'In Homebase, export Timesheets for the pay period as CSV and upload it here. Each store’s tips for each day are shared by hours among the people who worked (cash and card separately).')}</p>
      <div class="cc-two"><label>${t('시작', 'From')}<input type="date" id="ccSplitFrom" value="${esc(split.from)}"></label><label>${t('끝', 'To')}<input type="date" id="ccSplitTo" value="${esc(split.to)}"></label></div>
      <label>${t('Homebase 타임시트 CSV', 'Homebase timesheet CSV')}<input type="file" id="ccSplitFile" accept=".csv,text/csv"></label>
      ${split.file ? `<small style="display:block;margin-top:4px">📄 ${esc(split.file)}</small>` : ''}
      <button data-cc="split" ${split.busy || !split.csv ? 'disabled' : ''}>${split.busy ? t('계산 중…', 'Working…') : t('나누기 계산', 'Calculate split')}</button>
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
  async function runSplit(save) {
    if (split.busy) return;
    split.busy = true; split.err = false; split.msg = ''; split.open = true; draw();
    try {
      if (!save) {
        const parsed = parseHomebaseShifts(split.csv, {year: Number(split.to.slice(0, 4)) || undefined});
        if (parsed.error) throw Error(t('CSV에서 이름·날짜 칸을 못 찾았어요', 'Could not find name/date columns in the CSV'));
        const got = await post({action: 'recordCash', op: 'getTips', from: split.from, to: split.to});
        split.skipped = parsed.skipped.filter(k => !k.date || (k.date >= split.from && k.date <= split.to));
        split.result = splitTips(got.tips || [], parsed.shifts, {from: split.from, to: split.to});
        split.msg = t(`근무 ${parsed.shifts.length}개 · 팁 기록 ${(got.tips || []).length}개`, `${parsed.shifts.length} shifts · ${(got.tips || []).length} tip records`);
      } else {
        const r = split.result;
        await post({action: 'recordCash', op: 'saveTipSplit', from: r.from, to: r.to, people: r.people, lines: r.lines, unsplit: r.unsplit, skipped: split.skipped.length, staff: c.profile?.display_name || ''});
        split.msg = t('Tip Split 탭에 저장했어요', 'Saved to the Tip Split tab');
      }
    } catch (err) { split.err = true; split.msg = (save ? t('저장하지 못했어요', 'Could not save') : t('계산하지 못했어요', 'Could not calculate')) + ` (${err.message})`; }
    split.busy = false; draw();
  }

  function draw() {
    host.innerHTML = `<div class="cc">
      <div class="cc-top"><label>${t('매장', 'Store')}<select id="ccStore">${stores.map(x => `<option value="${esc(x.id)}" ${x.id === memory.store ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}</select></label>
      <label>${t('마감 날짜', 'Closing date')}<input id="ccDate" type="date" value="${esc(memory.date)}"></label></div>
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
      <div class="cc-card"><h3>🧾 ${t('오늘 매출', 'Today’s sales')}</h3><div class="cc-sum">
        ${num('ccAfterTax', 'After Tax Sales', v.afterTax)}
        ${num('ccBeforeTax', 'Before Tax', v.beforeTax)}
        ${num('ccTotalSales', 'Total', v.total)}
      </div></div>
      <div class="cc-card"><h3>💝 ${t('오늘 팁', 'Today’s tips')}</h3><div class="cc-sum">
        ${num('ccCashTips', t('현금 팁', 'Cash tips'), v.cashTips, t('팁 통에 있는 돈 전부', 'Everything in the tip jar'))}
        ${num('ccCardTips', t('카드 팁', 'Card tips'), v.cardTips, t('Clover 리포트의 Tips', 'Tips on the Clover report'))}
        <span>${t('팁 합계', 'Total tips')}</span><span class="big" id="ccTipTotal"></span>
      </div><small style="display:block;margin-top:6px;color:#6b6555">${t('오늘 일한 사람들끼리 일한 시간만큼 나눠요. 현금 팁은 봉투·시재와 따로 보관해요.', 'Shared by hours among everyone who worked today. Keep cash tips separate from the envelope and float.')}</small></div>
      <div class="cc-card"><textarea id="ccNote" class="cc-note" maxlength="300" placeholder="${t('메모 (선택) · 예: 동전 롤 1개 따로 보관', 'Note (optional)')}">${esc(v.note || '')}</textarea></div>
      <div class="cc-actions"><button class="cc-clear" data-cc="clear">${t('다시 세기', 'Start over')}</button><button class="cc-save" data-cc="save" ${c.preview || saving ? 'disabled' : ''}>${saving ? t('저장 중…', 'Saving…') : t('시트에 저장 ✅', 'Save to sheet ✅')}</button></div>
      <p class="cc-msg" id="ccMsg">${c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : ''}</p>
      ${manager ? tipSplitHtml() : ''}
    </div>`;
    refresh();
  }
  function refresh() {
    const s = cashPlan(v), q = id => host.querySelector(id);
    DENOMS.forEach(([d]) => { const el = host.querySelector(`[data-line="${d}"]`); if (el) el.textContent = fmt(money((Number(v.counts[String(d)]) || 0) * d)); });
    q('#ccTotal').textContent = fmt(s.total);
    q('#ccExtra').textContent = fmt(s.extra); q('#ccExtra').classList.toggle('neg', s.extra < 0);
    q('#ccEnv').textContent = fmt(s.envelope);
    q('#ccBills').textContent = s.envelope ? billText(s.bills) + (s.extra - s.envelope > 0 ? ' · ' + t(`나머지 ${fmt(money(s.extra - s.envelope))}는 시재에 남겨요`, `keep ${fmt(money(s.extra - s.envelope))} in the till`) : '') : s.extra > 0 ? t('지폐로 뺄 수 있는 돈이 없어요 · 전부 시재에 남겨요', 'No bills to take out · keep it all in the till') : '';
    q('#ccNext').textContent = fmt(s.nextOpen);
    q('#ccTipTotal').textContent = fmt(money((Number(v.cashTips) || 0) + (Number(v.cardTips) || 0)));
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
  const FIELDS = {ccOpen: 'open', ccCashSales: 'cashSales', ccAfterTax: 'afterTax', ccBeforeTax: 'beforeTax', ccTotalSales: 'total', ccCashTips: 'cashTips', ccCardTips: 'cardTips'};

  host.oninput = e => {
    const el = e.target;
    if (el.dataset.d) return setCount(el.dataset.d, el.value);
    if (FIELDS[el.id]) { v[FIELDS[el.id]] = el.value === '' ? '' : money(el.value); refresh(); return; }
    if (el.id === 'ccNote') { v.note = el.value; keep(memory.store, memory.date, v); }
  };
  host.onchange = e => {
    const el = e.target;
    if (el.id === 'ccSplitFrom' || el.id === 'ccSplitTo') { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) { split[el.id === 'ccSplitFrom' ? 'from' : 'to'] = el.value; split.result = null; split.open = true; draw(); } return; }
    if (el.id === 'ccSplitFile') {
      const f = el.files && el.files[0]; if (!f) return;
      f.text().then(txt => { split.csv = txt; split.file = f.name; split.result = null; split.skipped = []; split.msg = ''; split.open = true; draw(); });
      return;
    }
    if (el.id === 'ccStore' || el.id === 'ccDate') {
      if (el.id === 'ccStore') memory.store = el.value; else if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) memory.date = el.value;
      v = load(memory.store, memory.date); draw();
    }
  };
  host.onclick = async e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.cc === '+' || b.dataset.cc === '-') return setCount(b.dataset.d, (Number(v.counts[b.dataset.d]) || 0) + (b.dataset.cc === '+' ? 1 : -1));
    if (b.dataset.cc === 'split') return runSplit(false);
    if (b.dataset.cc === 'splitSave') return runSplit(true);
    if (b.dataset.cc === 'clear') { if (!confirm(t('센 숫자와 입력한 매출을 모두 지울까요?', 'Clear everything?'))) return; v = blank(); keep(memory.store, memory.date, v); return draw(); }
    if (b.dataset.cc === 'save') {
      if (c.preview || saving) return;
      const s = cashPlan(v);
      if (!s.total && !confirm(t('합계가 $0이에요. 그래도 저장할까요?', 'Total is $0. Save anyway?'))) return;
      saving = true; b.disabled = true; b.textContent = t('저장 중…', 'Saving…');
      try {
        const r = await fetch(SHEET_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: 'recordCash', key: SYNC_KEY, store_id: memory.store, count_date: memory.date, counts: v.counts, open_float: s.open, cash_sales: s.reported, after_tax: v.afterTax === '' ? null : v.afterTax, before_tax: v.beforeTax === '' ? null : v.beforeTax, total_sales: v.total === '' ? null : v.total, cash_tips: v.cashTips === '' ? null : v.cashTips, card_tips: v.cardTips === '' ? null : v.cardTips, staff: c.profile?.display_name || '', note: v.note || ''})});
        const out = await r.json().catch(() => ({}));
        if (!r.ok || out.ok === false) throw Error(out.error || 'SAVE_FAILED');
        saving = false; draw();
        say(t(`저장했어요 · 봉투 ${fmt(s.envelope)} · 내일 오픈시재 ${fmt(s.nextOpen)}`, `Saved · envelope ${fmt(s.envelope)} · tomorrow’s float ${fmt(s.nextOpen)}`));
      } catch (err) {
        saving = false; b.disabled = false; b.textContent = t('시트에 저장 ✅', 'Save to sheet ✅');
        say(t('저장하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.', 'Could not save. Check the connection and try again.') + ` (${err.message})`, true);
      }
    }
  };
  draw();
}
