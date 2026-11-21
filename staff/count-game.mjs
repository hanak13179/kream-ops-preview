// 재고 세기 게임 모드: 카테고리별로 한 품목씩 세고, 숫자를 넣으면 다음 품목으로 넘어가요.
// 저장은 기존 재고 저장(save 콜백)을 그대로 쓰고, 화면만 새로 그립니다.
// 앱 안 숫자판을 써서 휴대폰 키보드가 열리지 않아요 (화면 튐 방지).

const STYLE_ID = 'count-game-style';
const CSS = `
.cg{position:fixed;inset:0;z-index:2000;background:#f7f3ea;display:flex;flex-direction:column;font-size:16px;overscroll-behavior:contain;touch-action:manipulation}
.cg *{box-sizing:border-box}
.cg-top{display:flex;align-items:center;gap:10px;padding:max(12px,env(safe-area-inset-top)) 16px 8px}
.cg-top h2{flex:1;margin:0;font-size:18px}
.cg-x{border:0;background:#fff;border-radius:999px;width:40px;height:40px;font-size:20px;box-shadow:0 1px 3px #0002}
.cg-body{flex:1;overflow:auto;padding:4px 16px 16px;-webkit-overflow-scrolling:touch}
.cg-bar{height:12px;border-radius:99px;background:#e4ddcc;overflow:hidden;margin:4px 0 2px}
.cg-bar i{display:block;height:100%;background:linear-gradient(90deg,#9fc48a,#3e4b33);border-radius:99px;transition:width .35s}
.cg-meta{display:flex;justify-content:space-between;font-size:13px;color:#6b6555;margin-bottom:8px}
.cg-cats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:8px}
.cg-cat{border:0;border-radius:18px;padding:16px 12px;text-align:left;background:#fff;box-shadow:0 2px 6px #0001;font-size:16px;min-height:96px;display:flex;flex-direction:column;gap:6px}
.cg-cat b{font-size:17px}
.cg-cat small{color:#6b6555}
.cg-cat.done{background:#e3efd9}
.cg-cat .cg-bar{height:8px}
.cg-all{width:100%;margin-top:14px;border:0;border-radius:16px;padding:16px;font-size:18px;font-weight:700;background:#3e4b33;color:#fff}
.cg-card{background:#fff;border-radius:24px;padding:16px;box-shadow:0 3px 10px #0001;text-align:center;animation:cg-in .25s ease}
.cg-card.out{animation:cg-out .18s ease forwards}
@keyframes cg-in{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes cg-out{to{transform:translateX(-40px);opacity:0}}
.cg-pic{width:96px;height:96px;margin:0 auto 8px;border-radius:20px;overflow:hidden;display:grid;place-items:center;font-size:15px;font-weight:700}
.cg-pic img{width:100%;height:100%;object-fit:cover}
.cg-name{font-size:21px;font-weight:800;margin:2px 0}
.cg-unit{font-size:13px;color:#6b6555}
.cg-last{font-size:13px;color:#6b6555;margin-top:4px}
.cg-num{display:flex;align-items:center;justify-content:center;gap:12px;margin:12px 0 4px}
.cg-num output{min-width:120px;font-size:44px;font-weight:800;letter-spacing:1px;border-bottom:3px solid #3e4b33;line-height:1.1}
.cg-num output.empty{color:#c9c1ae}
.cg-num button{width:52px;height:52px;border-radius:50%;border:0;background:#efe9db;font-size:26px}
.cg-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.cg-pad button{height:54px;border:0;border-radius:14px;background:#fff;font-size:24px;font-weight:600;box-shadow:0 1px 3px #0002}
.cg-pad button:active,.cg-num button:active{transform:scale(.95)}
.cg-actions{display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:10px}
.cg-actions button{height:58px;border:0;border-radius:16px;font-size:18px;font-weight:700}
.cg-skip{background:#e4ddcc;color:#3b382f}
.cg-next{background:#3e4b33;color:#fff}
.cg-next:disabled{opacity:.4}
.cg-back{border:0;background:none;color:#6b6555;font-size:14px;margin-top:8px;text-decoration:underline}
.cg-streak{font-size:14px;font-weight:700;color:#c0582f;min-height:20px}
.cg-pop{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);font-size:44px;pointer-events:none;animation:cg-pop .7s ease forwards;z-index:2001}
@keyframes cg-pop{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-90%) scale(1)}}
.cg-win{text-align:center;padding:28px 8px}
.cg-win .big{font-size:64px;animation:cg-in .4s ease}
.cg-win h3{font-size:24px;margin:8px 0}
.cg-win p{color:#6b6555}
.cg-win button{width:100%;margin-top:10px;border:0;border-radius:16px;padding:16px;font-size:18px;font-weight:700}
.cg-win .primary{background:#3e4b33;color:#fff}
.cg-win .ghost{background:#e4ddcc}
.cg-warn{font-size:12px;color:#a0522d;margin-top:6px;min-height:16px}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * @param {object} c
 *  items: 셀 품목 (정렬된 순서), categories: 카테고리 순서
 *  stock: 현재 재고 행들, store: 매장 id, today: 'YYYY-MM-DD' (토론토, 오늘 센 품목 기억용)
 *  t, esc, name, unitLabel, picture(p) → html, display(p,value), parse(p,text) → 저장값 (오류면 throw)
 *  save: async (p, value) → 저장, preview: true면 저장 안 함
 *  onClose: (countedIds) → 끝났을 때
 */
export function openCountGame(c) {
  ensureStyle();
  const {t, esc} = c;
  const root = document.createElement('div');
  root.className = 'cg';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  document.body.appendChild(root);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const stockOf = id => c.stock.find(s => s.product_id === id);
  const memoryKey = `kream-count-${c.store}-${c.today}`;
  const remembered = new Set(readList(memoryKey)); // 오늘 이 기기에서 센 품목
  const counted = new Map(); // id → 표시값 (이번에 센 것)
  const failed = new Set();
  const countedToday = p => counted.has(p.id) || remembered.has(p.id);
  const byCat = cat => c.items.filter(p => p.category === cat);
  const cats = c.categories.filter(cat => byCat(cat).length);

  let queue = [], index = 0, value = '', streak = 0, started = 0, currentCat = '', saving = Promise.resolve();

  function close() {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevOverflow;
    root.remove();
    saving.finally(() => c.onClose?.([...counted.keys()]));
  }

  function header(title, back) {
    return `<div class="cg-top">${back ? `<button class="cg-x" data-cg="home" aria-label="${t('카테고리로', 'Categories')}">‹</button>` : ''}<h2>${esc(title)}</h2><button class="cg-x" data-cg="close" aria-label="${t('닫기', 'Close')}">✕</button></div>`;
  }

  function home() {
    queue = []; currentCat = '';
    const total = c.items.length, done = c.items.filter(countedToday).length;
    root.innerHTML = `${header(t('🎮 오늘의 재고 세기', '🎮 Stock count'))}<div class="cg-body">
      <div class="cg-bar"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>
      <div class="cg-meta"><span>${t('오늘 센 품목', 'Counted today')} <b>${done} / ${total}</b></span><span>${done === total && total ? '🏆' : ''}</span></div>
      <div class="cg-cats">${cats.map(cat => {
        const list = byCat(cat), d = list.filter(countedToday).length, full = d === list.length;
        return `<button class="cg-cat ${full ? 'done' : ''}" data-cat="${esc(cat)}"><b>${full ? '✅ ' : ''}${esc(cat)}</b><small>${d} / ${list.length}</small><div class="cg-bar"><i style="width:${Math.round(d / list.length * 100)}%"></i></div></button>`;
      }).join('')}</div>
      <button class="cg-all" data-cg="all">${done && done < total ? t('남은 것 이어서 세기 →', 'Continue where I left off →') : t('처음부터 순서대로 세기 →', 'Count everything in order →')}</button>
      ${c.preview ? `<p class="cg-warn">${t('미리보기 모드: 숫자는 저장되지 않아요.', 'Preview mode: counts are not saved.')}</p>` : ''}
    </div>`;
  }

  function start(list, cat) {
    const todo = list.filter(p => !countedToday(p));
    queue = todo.length ? todo : list;
    currentCat = cat || '';
    index = 0; streak = 0; started = Date.now();
    item();
  }

  function item() {
    if (index >= queue.length) return win();
    const p = queue[index], last = c.display(p, stockOf(p.id)?.on_hand);
    value = counted.has(p.id) ? String(counted.get(p.id)) : '';
    const catName = currentCat || p.category;
    const catList = currentCat ? queue : byCat(p.category);
    const pos = currentCat ? index + 1 : catList.indexOf(p) + 1;
    root.innerHTML = `${header(catName, true)}<div class="cg-body">
      <div class="cg-bar"><i style="width:${Math.round(index / queue.length * 100)}%"></i></div>
      <div class="cg-meta"><span>${pos} / ${catList.length}</span><span class="cg-streak">${streak >= 3 ? `🔥 ${streak}${t('연속', ' in a row')}` : ''}</span></div>
      <div class="cg-card">
        <div class="cg-pic">${c.picture(p)}</div>
        <div class="cg-name">${esc(c.name(p))}</div>
        <div class="cg-unit">${esc(c.unitLabel(p))}</div>
        <div class="cg-last">${last == null || last === '' ? t('지난 기록 없음', 'No previous count') : `${t('지난번', 'Last time')}: ${esc(last)}`}</div>
        <div class="cg-num"><button data-cg="minus" aria-label="${t('하나 빼기', 'minus one')}">−</button><output aria-live="polite" class="${value === '' ? 'empty' : ''}">${value === '' ? '?' : esc(value)}</output><button data-cg="plus" aria-label="${t('하나 더하기', 'plus one')}">＋</button></div>
        <div class="cg-warn" id="cgWarn">${failed.size ? t('저장 안 된 품목이 있어요. 나중에 다시 확인해 주세요.', 'Some counts were not saved. Please check later.') : ''}</div>
        <div class="cg-pad">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => `<button data-key="${k}" aria-label="${k === '⌫' ? t('지우기', 'delete') : k}">${k}</button>`).join('')}</div>
        <div class="cg-actions"><button class="cg-skip" data-cg="skip">${t('건너뛰기', 'Skip')}</button><button class="cg-next" data-cg="next" ${value === '' ? 'disabled' : ''}>${index + 1 === queue.length ? t('완료 ✓', 'Done ✓') : t('다음 →', 'Next →')}</button></div>
        ${index > 0 ? `<button class="cg-back" data-cg="prev">← ${t('이전 품목', 'Previous item')}</button>` : ''}
      </div></div>`;
  }

  function refreshNumber() {
    const out = root.querySelector('.cg-num output'), next = root.querySelector('.cg-next');
    if (!out) return;
    out.textContent = value === '' ? '?' : value;
    out.classList.toggle('empty', value === '');
    if (next) next.disabled = value === '';
  }

  function press(k) {
    if (k === '⌫') value = value.slice(0, -1);
    else if (k === '.') { if (!value.includes('.')) value = (value || '0') + '.'; }
    else if (value.length < 7) value = value === '0' ? k : value + k;
    refreshNumber();
  }

  function step(d) {
    const n = Math.max(0, Math.round(((Number(value) || 0) + d) * 1000) / 1000);
    value = String(n);
    refreshNumber();
  }

  function pop(emoji) {
    const el = document.createElement('div');
    el.className = 'cg-pop';
    el.textContent = emoji;
    root.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  function next() {
    if (value === '' || value.endsWith('.')) return;
    const p = queue[index];
    let stored;
    try { stored = c.parse(p, value); }
    catch { const w = root.querySelector('#cgWarn'); if (w) w.textContent = t('낱개 수량을 정수로 입력해 주세요.', 'Enter a whole number of pieces.'); return; }
    counted.set(p.id, value);
    failed.delete(p.id);
    if (!c.preview) {
      saving = saving.then(() => c.save(p, stored)).then(() => { remembered.add(p.id); writeList(memoryKey, [...remembered]); }).catch(() => { failed.add(p.id); counted.delete(p.id); });
    }
    streak += 1;
    pop(streak % 5 === 0 ? '🔥' : ['⭐', '✨', '👍', '💪'][streak % 4]);
    advance();
  }

  function advance() {
    const card = root.querySelector('.cg-card');
    if (card) card.classList.add('out');
    setTimeout(() => { index += 1; item(); }, 160);
  }

  function win() {
    const secs = Math.round((Date.now() - started) / 1000);
    const time = secs >= 60 ? `${Math.floor(secs / 60)}${t('분', 'm')} ${secs % 60}${t('초', 's')}` : `${secs}${t('초', 's')}`;
    const done = queue.filter(p => counted.has(p.id)).length;
    const nextCat = cats.find(cat => cat !== currentCat && byCat(cat).some(p => !countedToday(p)));
    const allDone = c.items.every(countedToday);
    root.innerHTML = `${header(currentCat || t('재고 세기', 'Stock count'))}<div class="cg-body"><div class="cg-win">
      <div class="big">${allDone ? '🏆' : '🎉'}</div>
      <h3>${allDone ? t('오늘 재고 전부 완료!', 'All stock counted today!') : t(`${currentCat || ''} 완료!`, `${currentCat || 'Section'} done!`)}</h3>
      <p>${done}${t('개 품목', ' items')} · ${time}</p>
      ${failed.size ? `<p class="cg-warn">${t(`${failed.size}개는 저장되지 않았어요. 다시 세어 주세요.`, `${failed.size} counts did not save. Please recount them.`)}</p>` : ''}
      ${!allDone && nextCat ? `<button class="primary" data-next-cat="${esc(nextCat)}">${t(`다음: ${nextCat} →`, `Next: ${nextCat} →`)}</button>` : ''}
      <button class="${allDone || !nextCat ? 'primary' : 'ghost'}" data-cg="close">${t('발주함에서 추천수량 보기', 'See suggested order')}</button>
      <button class="ghost" data-cg="home">${t('카테고리 목록', 'All categories')}</button>
    </div></div>`;
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.key) return press(b.dataset.key);
    if (b.dataset.cat) return start(byCat(b.dataset.cat), b.dataset.cat);
    if (b.dataset.nextCat) return start(byCat(b.dataset.nextCat), b.dataset.nextCat);
    switch (b.dataset.cg) {
      case 'close': return close();
      case 'home': return home();
      case 'all': return start(c.items, '');
      case 'minus': return step(-1);
      case 'plus': return step(1);
      case 'next': return next();
      case 'skip': streak = 0; return advance();
      case 'prev': index = Math.max(0, index - 1); return item();
    }
  });

  function onKey(e) {
    if (!queue.length || index >= queue.length) { if (e.key === 'Escape') close(); return; }
    if (/^[0-9]$/.test(e.key) || e.key === '.') press(e.key);
    else if (e.key === 'Backspace') press('⌫');
    else if (e.key === 'Enter') next();
    else if (e.key === 'ArrowUp') step(1);
    else if (e.key === 'ArrowDown') step(-1);
    else if (e.key === 'Escape') home();
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  home();
  return {close};
}

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* 저장 공간 없음: 무시 */ }
}
