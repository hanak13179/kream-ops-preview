// 매장 발주 · 한 개씩 보기
// 카테고리 안에서 품목을 하나씩 보여주고, 재고 숫자만 넣으면 자동 주문수량이 발주함에 들어가고 (화면에는 안 보임),
// "다음"을 누르면 저장하고 다음 품목으로 넘어가요. 이전으로 가거나 목록에서 골라 고칠 수 있어요.
// 상태(state)는 app.mjs가 들고 있어서, 화면이 다시 그려져도 보던 품목이 유지돼요.

const STYLE_ID = 'order-steps-style';
const CSS = `
.os{grid-column:1/-1;max-width:520px;width:100%;margin:0 auto 96px;touch-action:manipulation}
.os *{box-sizing:border-box}
.os-shift{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.os-shift button{border:0;border-radius:14px;padding:8px 6px;font-size:15px;font-weight:800;background:#fff;box-shadow:0 1px 4px #0001;color:#3b382f}
.os-shift button small{display:block;font-size:11px;font-weight:600;color:#6b6555;margin-top:2px}
.os-shift button[aria-pressed=true]{background:#3e4b33;color:#fff}
.os-shift button[aria-pressed=true] small{color:#dfe6d6}
.os-head{display:flex;align-items:center;gap:8px;margin:2px 0 6px}
.os-count{font-weight:800;font-size:15px;min-width:64px}
.os-bar{flex:1;height:10px;border-radius:99px;background:#e4ddcc;overflow:hidden}
.os-bar i{display:block;height:100%;background:linear-gradient(90deg,#9fc48a,#3e4b33);border-radius:99px;transition:width .3s}
.os-tools{display:flex;gap:8px;margin-bottom:8px}
.os-tools button{flex:1;border:0;border-radius:12px;padding:7px;background:#efe9db;font-size:15px;font-weight:600}
.os-tools button[aria-pressed=true]{background:#3e4b33;color:#fff}
.os-card{background:#fff;border-radius:22px;padding:14px;box-shadow:0 3px 10px #0001;text-align:center}
.os-card.in{animation:os-in .22s ease}
@keyframes os-in{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}
.os-top{display:flex;gap:12px;align-items:center;text-align:left}
.os-pic{flex:none;width:76px;height:76px;border-radius:18px;overflow:hidden;display:grid;place-items:center;font-size:14px;font-weight:700;background:#e6e8dc}
.os-pic img{width:100%;height:100%;object-fit:cover}
.os-name{font-size:20px;font-weight:800;line-height:1.2}
.os-unit,.os-last{font-size:13px;color:#6b6555}
.os-label{font-size:13px;font-weight:700;color:#6b6555;margin-top:12px}
.os-num{display:flex;align-items:center;justify-content:center;gap:12px;margin:2px 0}
.os-num output{display:block;min-width:110px;height:auto;min-height:0;padding:0;margin:0;background:none;border:0;border-radius:0;border-bottom:3px solid #3e4b33;font-size:42px;font-weight:800;line-height:1.15;text-align:center}
.os-num output.empty{color:#c9c1ae}
.os-num button,.os-order button{width:48px;height:48px;border-radius:50%;border:0;background:#efe9db;font-size:24px}
.os-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}
.os-pad button{height:50px;border:0;border-radius:13px;background:#f7f3ea;font-size:22px;font-weight:600}
.os-pad button:active,.os-num button:active,.os-order button:active{transform:scale(.95)}
.os-order{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:10px 12px;border-radius:16px;background:#fdf1e7}
.os-order b{font-size:15px;text-align:left}
.os-order small{display:block;font-weight:500;color:#a0522d}
.os-order .qty{display:flex;align-items:center;gap:8px}
.os-order .qty span{min-width:44px;font-size:26px;font-weight:800}
.os-nav{display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:12px}
.os-nav button{height:56px;border:0;border-radius:16px;font-size:18px;font-weight:700}
.os-prev{background:#e4ddcc;color:#3b382f}
.os-next{background:#3e4b33;color:#fff}
.os-nav button:disabled{opacity:.4}
.os-warn{font-size:12px;color:#a0522d;min-height:16px;margin-top:6px}
.os-list{background:#fff;border-radius:18px;box-shadow:0 3px 10px #0001;overflow:hidden}
.os-row{display:grid;grid-template-columns:1fr auto 44px;gap:10px;align-items:center;width:100%;border:0;border-bottom:1px solid #f0ebe0;background:none;padding:12px 14px;text-align:left;font-size:15px}
.os-row:last-child{border-bottom:0}
.os-row.on{background:#f3f7ee}
.os-row small{color:#6b6555;font-size:12px;white-space:nowrap}
.os-row em{font-style:normal;font-weight:700;white-space:nowrap}
.os-win{text-align:center;background:#fff;border-radius:22px;padding:26px 14px;box-shadow:0 3px 10px #0001}
.os-win .big{font-size:58px}
.os-win h3{font-size:22px;margin:6px 0}
.os-win p{color:#6b6555;margin:4px 0 12px}
.os-win button{width:100%;margin-top:8px;border:0;border-radius:16px;padding:15px;font-size:17px;font-weight:700;background:#e4ddcc}
.os-win button.primary{background:#3e4b33;color:#fff}
.os-toast{position:fixed;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);background:#3e4b33;color:#fff;font-weight:800;font-size:17px;padding:12px 18px;border-radius:999px;box-shadow:0 6px 18px #0003;z-index:3000;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;animation:os-toast 1.4s ease forwards;pointer-events:none}
@keyframes os-toast{0%{opacity:0;transform:translate(-50%,10px) scale(.9)}12%{opacity:1;transform:translate(-50%,0) scale(1.04)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}
.os-win .praise{font-size:17px;font-weight:700;color:#3e4b33;margin:6px 0 2px}
.os-win .time{font-size:14px;color:#6b6555}
.os-win button.done{background:linear-gradient(135deg,#ed522e,#f08a4b);color:#fff;font-size:20px;padding:18px}
.os-yn{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.os-yn button{height:120px;border:0;border-radius:20px;font-size:20px;font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 6px #0001}
.os-yn button i{font-style:normal;font-size:38px}
.os-yn small{font-size:12px;font-weight:600;opacity:.8}
.os-yn.many{grid-template-columns:repeat(auto-fit,minmax(88px,1fr))}
.os-yn.many button{height:96px;font-size:17px;background:#f3efe4;color:#3b382f}
.os-yn.many button.on{background:#e3efd9}
.os-yn.three{grid-template-columns:repeat(3,1fr)}
.os-yn.three button{height:110px;font-size:17px}
.os-yn .half{background:#fbefc9;color:#7a5a12}
.os-way{margin-top:10px;padding:10px 12px;border-radius:14px;background:#e9f0fb;color:#2c4a73;font-size:14px;font-weight:700}
.os-yn .yes{background:#e3efd9;color:#2f4a22}
.os-yn .no{background:#fbe1d8;color:#8a2f12}
.os-yn button.on{outline:4px solid #3e4b33}
@media(min-width:900px){.os{max-width:760px}.os-card{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;align-items:center;text-align:center}.os-card .os-top{grid-column:1}.os-card .os-label{grid-column:1}.os-card .os-num{grid-column:1}.os-card .os-pad,.os-card .os-yn{grid-column:2;grid-row:1 / span 3;margin-top:0}.os-card .os-warn,.os-card .os-nav{grid-column:1 / -1}}
.os-pop{position:fixed;left:50%;top:40%;font-size:42px;pointer-events:none;animation:os-pop .7s ease forwards;z-index:3000}
@keyframes os-pop{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-90%)}}
`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}


// 칭찬 문구 (한국어, English)
const PRAISE = [
  ['좋아요! 👍', 'Nice! 👍'], ['숫자 요정 등장 ✨', 'Number fairy! ✨'], ['계산기보다 빠름 🧮', 'Faster than a calculator 🧮'],
  ['오, 프로의 냄새 👃', 'Smells like a pro 👃'], ['재고가 떨고 있어요 😆', 'The stock is shaking 😆'], ['정확도 100% (아마도) 🎯', '100% accurate (probably) 🎯'],
  ['이 구역 재고왕 👑', 'Stock royalty 👑'], ['크림 사장님이 좋아합니다 🍰', 'The boss approves 🍰'], ['다음 거 덤벼 🥊', 'Bring on the next one 🥊'],
  ['손가락 워밍업 완료 💪', 'Fingers warmed up 💪'], ['눈썰미 무엇? 👀', 'Eagle eyes 👀'], ['오늘도 한 건 해결 ✅', 'Another one done ✅']
];
const FAST = [['⚡ 번개 손!', '⚡ Lightning hands!'], ['손가락에 모터 달았어요? 🏎️', 'Motor in those fingers? 🏎️'], ['눈 깜빡할 새 끝 😳', 'Done in a blink 😳']];
const STREAK = {5: ['🔥 5연속! 멈출 수 없다', '🔥 5 in a row!'], 10: ['🔥🔥 10연속! 전설의 시작', '🔥🔥 10 in a row! Legendary'], 20: ['🔥🔥🔥 20연속! 기네스에 연락할까요?', '🔥🔥🔥 20 in a row! Calling Guinness']};
const SPEED = [
  [3, '🚀', '전설의 손가락! 이 속도면 재고가 알아서 줄 서요', 'Legendary! The stock lines up by itself'],
  [6, '⚡', '번개처럼 끝! 오늘 커피는 사장님이… 아마도?', 'Lightning fast! Coffee is on the boss… maybe?'],
  [12, '😎', '깔끔하게 끝! 재고 장인 인정합니다', 'Clean finish! Certified stock master'],
  [Infinity, '🐢', '천천히, 정확하게! 거북이가 이긴 거 아시죠?', 'Slow and steady wins the race!']
];
const pick = list => list[Math.floor(Math.random() * list.length)];
function timeText(secs, t) { return secs >= 60 ? `${Math.floor(secs / 60)}${t('분', 'm')} ${secs % 60}${t('초', 's')}` : `${secs}${t('초', 's')}`; }

/** app.mjs가 한 번 만들어서 계속 들고 있는 상태 */
export function createStepState(store, today) {
  const memoryKey = `kream-count-${store}-${today}`;
  let remembered = [];
  try { remembered = JSON.parse(localStorage.getItem(memoryKey) || '[]'); } catch { /* 무시 */ }
  return {
    memoryKey, store, today,
    key: '',            // 보고 있는 카테고리 (바뀌면 처음부터)
    index: 0,           // 보고 있는 품목 순서
    view: 'one',        // 'one' 한 개씩 | 'list' 목록에서 고치기
    typed: {},          // 품목 id → 입력 중인 재고 글자
    order: {},          // 품목 id → 직접 바꾼 주문수량
    done: new Set(remembered), // 오늘 센 품목
    failed: new Set(),
    lastShown: '',      // 애니메이션용
    streak: 0,
    startedAt: 0,      // 이 카테고리 첫 입력 시간
    lastNext: 0,       // 마지막 '다음' 누른 시간
    counts: 0,         // 이 카테고리에서 센 개수
    queue: Promise.resolve(),
  };
}

/**
 * host 안에 한 개씩 보기를 그립니다.
 * c: {state, items, key, title, t, esc, name, unitLabel, picture, lastStock(p), parse(p,text),
 *     suggest(p, stored|null) → 주문수량|null, getQty(p), setQty(p,q), qtyStep(p), qtyDisplay(p,q),
 *     saveStock(p, stored) → Promise, locked, preview, nextCategory → 이름|null, goNextCategory(), openBasket(),
 *     showGrid(), shift/shiftCounts/setShift/otherShiftHere: 낮·마감 나누기, bagMode(p) 티백 1봉지/반봉지/없음, yesNoText(p) 있다/없다 버튼 글자, yesNoQty(p) 없을 때 주문할 양, countPrompt(p) 숫자 칸 질문 (예: 몇 병 있나요?), choices(p) → [[값, 글자, 아이콘]] 고르기 버튼 (예: 콜드브루 반 통/1통/2통), onTheWay(p) → {date}|null 이미 주문해서 오는 중, yesNo(p) → true면 '한 박스 있다/없다' 버튼 (포장·소모품), allIds: 이 매장 전체 품목 id (모두 끝나면 🏆)}
 */
export function renderOrderSteps(host, c) {
  ensureStyle();
  const {state: s, items, t, esc} = c;
  if (s.key !== c.key) { s.key = c.key; s.index = firstUndone(); s.view = 'one'; s.streak = 0; s.startedAt = 0; s.counts = 0; s.finishedIn = 0; }
  if (s.index > items.length) s.index = items.length;

  function firstUndone() { const i = items.findIndex(p => !s.done.has(p.id)); return i < 0 ? 0 : i; }
  let doneCount = 0;
  function head() {
    doneCount = items.filter(p => s.done.has(p.id)).length;
    const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;
    const sc = c.shiftCounts || {};
    const shiftBar = c.shift ? `<div class="os-shift"><button data-shift="morning" aria-pressed="${c.shift === 'morning'}">☀️ ${t('낮 요정', 'Day fairy')}<small>${t('포장재·소모품·음료 베이스', 'Packaging · supplies · drink bases')} · ${sc.morning ?? ''}</small></button><button data-shift="closing" aria-pressed="${c.shift === 'closing'}">🧚‍♀️ ${t('마감 요정', 'Closing fairy')}<small>${t('나머지 전부', 'Everything else')} · ${sc.closing ?? ''}</small></button></div>` : '';
    return shiftBar + `<div class="os-head"><span class="os-count">${Math.min(s.index + 1, items.length)} / ${items.length}</span><div class="os-bar"><i style="width:${pct}%"></i></div><span>${doneCount === items.length && items.length ? '🏆' : s.streak >= 3 ? `🔥${s.streak}` : ''}</span></div>
    <div class="os-tools"><button data-os="one" aria-pressed="${s.view === 'one'}">${t('한 개씩', 'One by one')}</button><button data-os="list" aria-pressed="${s.view === 'list'}">✎ ${t('목록', 'List')}</button><button data-os="grid">▦ ${t('전체 보기', 'Grid')}</button></div>`;
  }

  const wrap = html => { host.innerHTML = `<div class="os">${html}</div>`; };

  const ynText = (p, v) => {
    if (v === '' || v == null || v === '—') return v;
    const ch = c.choices?.(p)?.find(x => String(x[0]) === String(v)); if (ch) return ch[1];
    if (c.bagMode?.(p)) return Number(v) >= 1 ? t('1봉지 이상', '1+ bag') : Number(v) > 0 ? t('반봉지', 'half bag') : t('없음', 'none');
    if (c.yesNo?.(p)) return Number(v) > 0 ? t('있음', 'yes') : t('없음', 'no');
    return v;
  };

  function stockText(p) {
    if (s.typed[p.id] != null) return s.typed[p.id];
    return '';
  }
  function stored(p) {
    const text = stockText(p);
    if (text === '' || text.endsWith('.')) return null;
    try { return c.parse(p, text); } catch { return undefined; }
  }
  function orderFor(p) {
    if (s.order[p.id] != null) return {q: s.order[p.id], auto: false};
    const v = stored(p);
    // 포장·소모품(있다/없다)과 티백(1봉지/반봉지/없음): 모자라면 1개(박스·봉지) 주문.
    // 단, 이미 주문해서 오는 중(입고확인 전)이면 또 주문하지 않아요.
    if ((c.yesNo?.(p) || c.bagMode?.(p)) && v != null && v !== undefined) {
      const enough = c.bagMode?.(p) ? Number(v) >= 1 : Number(v) > 0;
      if (enough) return {q: 0, auto: true};
      if (c.onTheWay?.(p)) return {q: 0, auto: true, way: true};
      return {q: c.yesNoQty?.(p) ?? c.qtyStep(p), auto: true};   // 없을 때 주문할 양 (매장마다 다를 수 있음, 예: 3호점 다이제스티브 2박스)
    }
    const sug = v == null || v === undefined ? null : c.suggest(p, v);
    if (sug != null) return {q: sug, auto: true};
    return {q: c.getQty(p) || 0, auto: false, keep: true};
  }

  function drawList() {
    wrap(head() + `<div class="os-list">${items.map((p, i) => {
      const st = stockText(p), last = c.lastStock(p);
      return `<button class="os-row ${i === s.index ? 'on' : ''}" data-go="${i}"><span>${s.done.has(p.id) ? '✅ ' : ''}${esc(c.name(p))}</span><em>${esc(ynText(p, st !== '' ? st : last ?? '—'))}</em><small>${st !== '' ? t('오늘', 'today') : t('지난번', 'last')}</small></button>`;
    }).join('')}</div>`);
  }

  function drawWin() {
    const next = c.nextCategory, allDone = (c.allIds || []).length > 0 && c.allIds.every(id => s.done.has(id));
    const secs = s.finishedIn || 0, per = s.counts ? secs / s.counts : Infinity;
    const tier = SPEED.find(x => per <= x[0]);
    wrap(head() + `<div class="os-win"><div class="big">${allDone ? '🏆' : tier[1]}</div>
      <h3>${allDone ? (c.shift === 'morning' ? t('낮 요정 임무 완료! ☀️', 'Day fairy: mission complete! ☀️') : c.shift === 'closing' ? t('마감 요정 임무 완료! 🧚‍♀️', 'Closing fairy: mission complete! 🧚‍♀️') : t('오늘 재고 전부 끝!', 'All stock counted!')) : `${esc(c.title)} ${t('완료!', 'done!')}`}</h3>
      <p class="praise">${esc(t(tier[2], tier[3]))}</p>
      <p class="time">${s.counts ? `${s.counts}${t('개', ' items')} · ${timeText(secs, t)}` : `${doneCount} / ${items.length} ${t('품목', 'items')}`}</p>
      ${s.failed.size ? `<p class="os-warn">${t(`${s.failed.size}개 재고가 저장되지 않았어요. 목록에서 다시 확인해 주세요.`, `${s.failed.size} counts did not save. Check them in the list.`)}</p>` : ''}
      ${next && !allDone ? `<button class="primary" data-os="nextcat">${t(`다음: ${next} →`, `Next: ${next} →`)}</button>` : ''}
      <button class="done" data-os="basket">${t('다 했어요! 🙌', 'All done! 🙌')}</button>
      <button data-os="list">✎ ${t('목록에서 고치기', 'Fix from list')}</button></div>`);
  }

  function drawOne() {
    if (!items.length) {
      const other = c.shift === 'morning' ? t('마감 요정', 'the closing fairy') : t('낮 요정', 'the day fairy');
      wrap(head() + (c.otherShiftHere ? `<div class="os-win"><div class="big">${c.shift === 'morning' ? '🌙' : '☀️'}</div><h3>${t(`여기는 ${other} 담당이에요`, `This is for ${other}`)}</h3><p>${t('위에서 근무 시간을 바꾸거나 다른 카테고리를 골라 주세요.', 'Switch the shift above or pick another category.')}</p></div>` : `<p class="empty">${t('해당 품목이 없어요.', 'No items here.')}</p>`));
      return;
    }
    if (s.index >= items.length) return drawWin();
    const p = items[s.index], st = stockText(p), last = c.lastStock(p);
    const animate = s.lastShown !== p.id; s.lastShown = p.id;
    // 있다/없다 버튼 글자: 기본은 포장·소모품(한 박스), app이 품목마다 바꿀 수 있어요 (예: 아이스크림 10스쿱)
    const yn = Object.assign({q: t('한 박스 이상 있나요?', 'At least one full box?'), yes: t('있어요', 'Yes'), yesSmall: t('한 박스 이상', '1+ box'), yesIcon: '📦', no: t('없어요', 'No'), noSmall: t('자동으로 1박스 주문', 'Orders 1 box')}, c.yesNoText?.(p) || {});
    const dis = c.locked ? 'disabled' : '';
    wrap(head() + `<div class="os-card ${animate ? 'in' : ''}">
      <div class="os-top"><div class="os-pic">${c.picture(p)}</div><div><div class="os-name">${s.done.has(p.id) ? '✅ ' : ''}${esc(c.name(p))}</div><div class="os-unit">${esc(c.unitLabel(p))}</div><div class="os-last">${last == null || last === '' ? t('지난 재고 기록 없음', 'No previous count') : `${t('지난번 재고', 'Last count')}: ${esc(ynText(p, last))}`}</div></div></div>
      ${c.choices?.(p) ? `<div class="os-label">${esc(c.countPrompt?.(p) || t('얼마나 남았나요?', 'How much is left?'))}</div>
      <div class="os-yn many">${c.choices(p).map(([v, label, icon]) => `<button class="${st === String(v) ? 'on' : ''}" data-yn="${esc(v)}" ${dis}><i>${icon || ''}</i>${esc(label)}</button>`).join('')}</div>` : c.bagMode?.(p) ? `<div class="os-label">${t('얼마나 남았나요?', 'How much is left?')}</div>
      <div class="os-yn three"><button class="yes ${st === '1' ? 'on' : ''}" data-yn="1" ${dis}><i>🫖</i>${t('1봉지 이상', '1+ bag')}</button><button class="half ${st === '0.5' ? 'on' : ''}" data-yn="0.5" ${dis}><i>🍵</i>${t('반봉지', 'Half')}</button><button class="no ${st === '0' ? 'on' : ''}" data-yn="0" ${dis}><i>🙅</i>${t('없음', 'None')}</button></div>${(() => { const w = c.onTheWay?.(p); return w && (c.yesNo?.(p) || c.bagMode?.(p)) ? `<div class="os-way">📦 ${t(`이미 주문했어요${w.date ? ` (${w.date} 도착 예정)` : ''} · 받을 때까지 또 주문 안 해요`, `Already ordered${w.date ? ` (arrives ${w.date})` : ''} · won't reorder until received`)}</div>` : ''; })()}` : c.yesNo?.(p) ? `${(() => { const w = c.onTheWay?.(p); return w && (c.yesNo?.(p) || c.bagMode?.(p)) ? `<div class="os-way">📦 ${t(`이미 주문했어요${w.date ? ` (${w.date} 도착 예정)` : ''} · 받을 때까지 또 주문 안 해요`, `Already ordered${w.date ? ` (arrives ${w.date})` : ''} · won't reorder until received`)}</div>` : ''; })()}<div class="os-label">${yn.q}</div>
      <div class="os-yn"><button class="yes ${st === '1' ? 'on' : ''}" data-yn="1" ${dis}><i>${yn.yesIcon}</i>${yn.yes}<small>${yn.yesSmall}</small></button><button class="no ${st === '0' ? 'on' : ''}" data-yn="0" ${dis}><i>🙅</i>${yn.no}<small>${yn.noSmall}</small></button></div>` : `<div class="os-label">${esc(c.countPrompt?.(p) || t('지금 재고', 'Stock now'))}</div>
      <div class="os-num"><button data-os="minus" ${dis} aria-label="${t('하나 빼기', 'minus one')}">−</button><output class="${st === '' ? 'empty' : ''}">${st === '' ? '?' : esc(st)}</output><button data-os="plus" ${dis} aria-label="${t('하나 더하기', 'plus one')}">＋</button></div>
      <div class="os-pad">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => `<button data-key="${k}" ${dis} aria-label="${k === '⌫' ? t('지우기', 'delete') : k}">${k}</button>`).join('')}</div>`}
      <div class="os-warn" id="osWarn">${c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : s.failed.has(p.id) ? t('이 품목 재고가 저장되지 않았어요. 다시 넣어 주세요.', 'This count did not save. Please re-enter.') : ''}</div>
      <div class="os-nav"><button class="os-prev" data-os="prev" ${s.index === 0 ? 'disabled' : ''}>← ${t('이전', 'Back')}</button><button class="os-next" data-os="next" ${dis}>${s.index + 1 === items.length ? t('다 했어요! 🙌', 'All done! 🙌') : t('다음 →', 'Next →')}</button></div>
    </div>`);
  }

  function draw() { s.view === 'list' ? drawList() : drawOne(); }

  function refreshNumbers() {
    const p = items[s.index]; if (!p) return;
    const out = host.querySelector('.os-num output'), qty = host.querySelector('.os-order .qty span'), note = host.querySelector('.os-order small');
    const st = stockText(p), o = orderFor(p);
    if (out) { out.textContent = st === '' ? '?' : st; out.classList.toggle('empty', st === ''); }
    if (qty) qty.textContent = c.qtyDisplay(p, o.q);
    if (note) note.textContent = o.auto ? t('재고 기준 자동 계산', 'From stock count') : o.keep ? t('발주함에 담긴 수량', 'In basket now') : t('직접 바꿈', 'Changed by you');
  }

  function press(k) {
    const p = items[s.index]; if (!p || c.locked) return;
    let v = stockText(p);
    if (k === '⌫') v = v.slice(0, -1);
    else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; }
    else if (v.length < 7) v = v === '0' ? k : v + k;
    s.typed[p.id] = v;
    refreshNumbers();
  }

  function stepStock(d) {
    const p = items[s.index]; if (!p) return;
    const base = stockText(p) !== '' ? Number(stockText(p)) : Number(c.lastStock(p)) || 0;
    s.typed[p.id] = String(Math.max(0, Math.round((base + d) * 1000) / 1000));
    refreshNumbers();
  }

  function stepOrder(dir) {
    const p = items[s.index]; if (!p) return;
    const q = orderFor(p).q || 0;
    s.order[p.id] = Math.max(0, Math.min(100000, Math.round((q + dir * c.qtyStep(p)) * 1000) / 1000));
    refreshNumbers();
  }

  // 지금 품목을 확정: 재고 저장 + 주문수량 발주함에 반영
  function commit(p) {
    const v = stored(p);
    if (v === undefined) { const w = host.querySelector('#osWarn'); if (w) w.textContent = t('낱개 수량을 정수로 입력해 주세요.', 'Enter a whole number of pieces.'); return false; }
    const o = orderFor(p);
    if (!o.keep && o.q !== (c.getQty(p) || 0)) c.setQty(p, o.q);
    if (v != null) {
      s.done.add(p.id); s.failed.delete(p.id);
      if (!c.preview) {
        s.queue = s.queue.then(() => c.saveStock(p, v)).then(() => {
          try { localStorage.setItem(s.memoryKey, JSON.stringify([...s.done])); } catch { /* 무시 */ }
        }).catch(() => { s.failed.add(p.id); s.done.delete(p.id); });
      }
    }
    return true;
  }

  function toast(pair) {
    document.querySelectorAll('.os-toast').forEach(x => x.remove());
    const el = document.createElement('div');
    el.className = 'os-toast'; el.textContent = t(pair[0], pair[1]);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1450);
  }

  function pop(emoji) {
    const el = document.createElement('div');
    el.className = 'os-pop'; el.textContent = emoji;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  host.onclick = e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.key) return press(b.dataset.key);
    if (b.dataset.shift) return c.setShift?.(b.dataset.shift);
    if (b.dataset.yn != null) { const it = items[s.index]; if (!it || c.locked) return; s.typed[it.id] = b.dataset.yn; b.classList.add('on'); return setTimeout(() => host.querySelector('[data-os="next"]')?.click(), 180); }
    if (b.dataset.go != null) { s.index = Number(b.dataset.go); s.view = 'one'; return draw(); }
    const p = items[s.index];
    switch (b.dataset.os) {
      case 'one': s.view = 'one'; return draw();
      case 'list': s.view = 'list'; return draw();
      case 'grid': return c.showGrid();
      case 'minus': return stepStock(-1);
      case 'plus': return stepStock(1);
      case 'qminus': return stepOrder(-1);
      case 'qplus': return stepOrder(1);
      case 'prev': if (p && !commit(p)) return; s.index = Math.max(0, s.index - 1); s.streak = 0; return draw();
      case 'next': {
        if (!p || !commit(p)) return;
        const now = Date.now();
        if (stored(p) != null) {
          if (!s.startedAt) s.startedAt = now;
          s.streak += 1; s.counts += 1;
          const fast = s.lastNext && now - s.lastNext < 3000;
          toast(STREAK[s.streak] || (fast ? pick(FAST) : pick(PRAISE)));
          pop(s.streak % 5 === 0 ? '🔥' : fast ? '⚡' : ['⭐', '✨', '👍', '💪'][s.streak % 4]);
        }
        s.lastNext = now;
        s.index += 1;
        if (s.index >= items.length) s.finishedIn = s.startedAt ? Math.max(1, Math.round((now - s.startedAt) / 1000)) : 0;
        return draw();
      }
      case 'nextcat': return c.goNextCategory();
      case 'basket': return c.openBasket();
    }
  };

  // 컴퓨터 키보드: 숫자, Enter(다음), ←(이전). 검색창 등에 쓰는 중이면 무시.
  if (typeof window === 'undefined') { draw(); return; }
  if (!window.__osKeys) {
    window.__osKeys = true;
    document.addEventListener('keydown', e => {
      const h = window.__osHost;
      if (!h || !h.isConnected || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const map = {Enter: 'next', ArrowLeft: 'prev', ArrowUp: 'plus', ArrowDown: 'minus'};
      let target = null;
      if (/^[0-9.]$/.test(e.key)) target = h.querySelector(`[data-key="${e.key}"]`);
      else if (e.key === 'Backspace') target = h.querySelector('[data-key="⌫"]');
      else if (map[e.key]) target = h.querySelector(`[data-os="${map[e.key]}"]`);
      if (target && !target.disabled) { e.preventDefault(); target.click(); }
    });
  }
  window.__osHost = host;

  draw();
}
