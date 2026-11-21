// 매장 발주 · 한 개씩 보기
// 카테고리 안에서 품목을 하나씩 보여주고, 재고 숫자를 넣으면 자동 주문수량이 계산되고,
// "다음"을 누르면 저장하고 다음 품목으로 넘어가요. 이전으로 가거나 목록에서 골라 고칠 수 있어요.
// 상태(state)는 app.mjs가 들고 있어서, 화면이 다시 그려져도 보던 품목이 유지돼요.

const STYLE_ID = 'order-steps-style';
const CSS = `
.os{grid-column:1/-1;max-width:520px;width:100%;margin:0 auto;touch-action:manipulation}
.os *{box-sizing:border-box}
.os-head{display:flex;align-items:center;gap:8px;margin:2px 0 6px}
.os-count{font-weight:800;font-size:15px;min-width:64px}
.os-bar{flex:1;height:10px;border-radius:99px;background:#e4ddcc;overflow:hidden}
.os-bar i{display:block;height:100%;background:linear-gradient(90deg,#9fc48a,#3e4b33);border-radius:99px;transition:width .3s}
.os-tools{display:flex;gap:8px;margin-bottom:8px}
.os-tools button{flex:1;border:0;border-radius:12px;padding:10px;background:#efe9db;font-size:15px;font-weight:600}
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
.os-num output{min-width:110px;font-size:42px;font-weight:800;border-bottom:3px solid #3e4b33;line-height:1.15}
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
.os-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;width:100%;border:0;border-bottom:1px solid #f0ebe0;background:none;padding:12px 14px;text-align:left;font-size:15px}
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
.os-pop{position:fixed;left:50%;top:40%;font-size:42px;pointer-events:none;animation:os-pop .7s ease forwards;z-index:3000}
@keyframes os-pop{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-90%)}}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

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
    queue: Promise.resolve(),
  };
}

/**
 * host 안에 한 개씩 보기를 그립니다.
 * c: {state, items, key, title, t, esc, name, unitLabel, picture, lastStock(p), parse(p,text),
 *     suggest(p, stored|null) → 주문수량|null, getQty(p), setQty(p,q), qtyStep(p), qtyDisplay(p,q),
 *     saveStock(p, stored) → Promise, locked, preview, nextCategory → 이름|null, goNextCategory(), openBasket(),
 *     showGrid()}
 */
export function renderOrderSteps(host, c) {
  ensureStyle();
  const {state: s, items, t, esc} = c;
  if (s.key !== c.key) { s.key = c.key; s.index = firstUndone(); s.view = 'one'; s.streak = 0; }
  if (s.index > items.length) s.index = items.length;

  function firstUndone() { const i = items.findIndex(p => !s.done.has(p.id)); return i < 0 ? 0 : i; }
  const doneCount = items.filter(p => s.done.has(p.id)).length;
  const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;

  const head = `<div class="os-head"><span class="os-count">${Math.min(s.index + 1, items.length)} / ${items.length}</span><div class="os-bar"><i style="width:${pct}%"></i></div><span>${doneCount === items.length && items.length ? '🏆' : s.streak >= 3 ? `🔥${s.streak}` : ''}</span></div>
    <div class="os-tools"><button data-os="one" aria-pressed="${s.view === 'one'}">${t('한 개씩', 'One by one')}</button><button data-os="list" aria-pressed="${s.view === 'list'}">✎ ${t('목록', 'List')}</button><button data-os="grid">▦ ${t('전체 보기', 'Grid')}</button></div>`;

  const wrap = html => { host.innerHTML = `<div class="os">${html}</div>`; };

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
    const sug = v == null || v === undefined ? null : c.suggest(p, v);
    if (sug != null) return {q: sug, auto: true};
    return {q: c.getQty(p) || 0, auto: false, keep: true};
  }

  function drawList() {
    wrap(head + `<div class="os-list">${items.map((p, i) => {
      const st = stockText(p), last = c.lastStock(p), o = orderFor(p);
      return `<button class="os-row ${i === s.index ? 'on' : ''}" data-go="${i}"><span>${s.done.has(p.id) ? '✅ ' : ''}${esc(c.name(p))}</span><small>${t('재고', 'Stock')} ${esc(st !== '' ? st : last ?? '—')}</small><em>${t('주문', 'Order')} ${esc(c.qtyDisplay(p, o.q))}</em></button>`;
    }).join('')}</div>`);
  }

  function drawWin() {
    const next = c.nextCategory;
    wrap(head + `<div class="os-win"><div class="big">${next ? '🎉' : '🏆'}</div><h3>${esc(c.title)} ${t('완료!', 'done!')}</h3><p>${doneCount} / ${items.length} ${t('품목 재고 입력', 'items counted')}</p>
      ${s.failed.size ? `<p class="os-warn">${t(`${s.failed.size}개 재고가 저장되지 않았어요. 목록에서 다시 확인해 주세요.`, `${s.failed.size} counts did not save. Check them in the list.`)}</p>` : ''}
      ${next ? `<button class="primary" data-os="nextcat">${t(`다음: ${next} →`, `Next: ${next} →`)}</button>` : ''}
      <button class="${next ? '' : 'primary'}" data-os="basket">${t('발주함 확인 →', 'Review basket →')}</button>
      <button data-os="list">✎ ${t('목록에서 고치기', 'Fix from list')}</button></div>`);
  }

  function drawOne() {
    if (!items.length) { wrap(head + `<p class="empty">${t('해당 품목이 없어요.', 'No items here.')}</p>`); return; }
    if (s.index >= items.length) return drawWin();
    const p = items[s.index], st = stockText(p), last = c.lastStock(p), o = orderFor(p);
    const animate = s.lastShown !== p.id; s.lastShown = p.id;
    const dis = c.locked ? 'disabled' : '';
    wrap(head + `<div class="os-card ${animate ? 'in' : ''}">
      <div class="os-top"><div class="os-pic">${c.picture(p)}</div><div><div class="os-name">${s.done.has(p.id) ? '✅ ' : ''}${esc(c.name(p))}</div><div class="os-unit">${esc(c.unitLabel(p))}</div><div class="os-last">${last == null || last === '' ? t('지난 재고 기록 없음', 'No previous count') : `${t('지난번 재고', 'Last count')}: ${esc(last)}`}</div></div></div>
      <div class="os-label">${t('지금 재고', 'Stock now')}</div>
      <div class="os-num"><button data-os="minus" ${dis} aria-label="${t('하나 빼기', 'minus one')}">−</button><output class="${st === '' ? 'empty' : ''}">${st === '' ? '?' : esc(st)}</output><button data-os="plus" ${dis} aria-label="${t('하나 더하기', 'plus one')}">＋</button></div>
      <div class="os-pad">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => `<button data-key="${k}" ${dis} aria-label="${k === '⌫' ? t('지우기', 'delete') : k}">${k}</button>`).join('')}</div>
      <div class="os-order"><b>${t('자동 주문수량', 'Auto order')}<small>${o.auto ? t('재고 기준 자동 계산', 'From stock count') : o.keep ? t('발주함에 담긴 수량', 'In basket now') : t('직접 바꿈', 'Changed by you')}</small></b><div class="qty"><button data-os="qminus" ${dis} aria-label="${t('주문 줄이기', 'order less')}">−</button><span>${esc(c.qtyDisplay(p, o.q))}</span><button data-os="qplus" ${dis} aria-label="${t('주문 늘리기', 'order more')}">＋</button></div></div>
      <div class="os-warn" id="osWarn">${c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : s.failed.has(p.id) ? t('이 품목 재고가 저장되지 않았어요. 다시 넣어 주세요.', 'This count did not save. Please re-enter.') : ''}</div>
      <div class="os-nav"><button class="os-prev" data-os="prev" ${s.index === 0 ? 'disabled' : ''}>← ${t('이전', 'Back')}</button><button class="os-next" data-os="next" ${dis}>${s.index + 1 === items.length ? t('완료 ✓', 'Done ✓') : t('다음 →', 'Next →')}</button></div>
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

  function pop(emoji) {
    const el = document.createElement('div');
    el.className = 'os-pop'; el.textContent = emoji;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  host.onclick = e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.key) return press(b.dataset.key);
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
        if (stored(p) != null) { s.streak += 1; pop(s.streak % 5 === 0 ? '🔥' : ['⭐', '✨', '👍', '💪'][s.streak % 4]); }
        s.index += 1; return draw();
      }
      case 'nextcat': return c.goNextCategory();
      case 'basket': return c.openBasket();
    }
  };

  // 컴퓨터 키보드: 숫자, Enter(다음), ←(이전). 검색창 등에 쓰는 중이면 무시.
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
