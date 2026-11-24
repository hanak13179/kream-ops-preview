// 📦 추가 주문: 발주게임 '필수 확인'에 없는 품목은 재고를 세지 않아요. 필요한 것만 '더 필요해요!'를 누르면 발주함에 1단위씩 들어가요.
// 폰 폭(375px)에서도 옆으로 밀리지 않게: 한 줄 = 사진 · 이름/단위 · 버튼, 고르면 −/수량/+ 로 바뀌어요.
// c: {items, t, esc, name, unitLabel, picture, getQty(p), setQty(p,q), qtyStep(p), qtyDisplay(p,q), onTheWay(p) → {date}|null, back(), locked, preview, openBasket()}
const STYLE_ID = 'supplies-order-style-v2';
const CSS = `
.so{max-width:720px}
.so-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px}
.so-tabs button{min-width:0;border:0;border-radius:12px;padding:10px 6px;background:#fff;box-shadow:0 1px 4px #0001;font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.so-tabs button[aria-pressed="true"]{background:#3e4b33;color:#fff}
.so h3{margin:0 0 4px;font-size:18px}
.so-help{margin:0 0 10px;color:#6b6555;font-size:13px}
.so-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.so-chips button{border:1px solid #ddd5c4;border-radius:999px;padding:7px 12px;background:#fff;font-size:13px;font-weight:700}
.so-chips button[aria-pressed="true"]{background:#3e4b33;border-color:#3e4b33;color:#fff}
.so-find{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:6px;margin:0 0 6px}
.so-find input,.so-find select{width:100%;min-width:0;height:42px;border:1px solid #ddd5c4;border-radius:12px;padding:0 10px;font-size:16px;background:#fff}
.so-group{margin:14px 0 6px;padding:6px 10px;border-radius:10px;background:#efe9dc;font-weight:800;font-size:14px}
.so-row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;background:#fff;border-radius:14px;padding:8px 10px;margin:6px 0;box-shadow:0 1px 3px #0001}
.so-row.on{outline:2px solid #e8583a;background:#fff6f2}
.so-pic{width:40px;height:40px;border-radius:10px;overflow:hidden;background:#efe9dc;display:grid;place-items:center;font-size:18px}
.so-pic img{width:100%;height:100%;object-fit:cover}
.so-name{min-width:0;font-weight:800;font-size:15px;overflow-wrap:anywhere}
.so-name small{display:block;font-weight:600;color:#6b6555;font-size:12px}
.so-act{display:flex;align-items:center;gap:4px}
.so-act .need{border:0;border-radius:12px;padding:10px 10px;background:#e8583a;color:#fff;font-weight:800;font-size:14px;white-space:nowrap}
.so-act .step{border:0;border-radius:10px;width:36px;height:36px;background:#efe9dc;font-size:18px;font-weight:800}
.so-act .step.plus{background:#e8583a;color:#fff}
.so-act b{min-width:44px;text-align:center;font-size:14px;white-space:nowrap}
.so-empty{padding:16px;text-align:center;color:#6b6555}
.so-basket{position:sticky;bottom:8px;margin-top:12px;width:100%;height:48px;border:0;border-radius:14px;background:#3e4b33;color:#fff;font-size:16px;font-weight:800;box-shadow:0 4px 12px #0003}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style'); el.id = STYLE_ID; el.textContent = CSS; document.head.appendChild(el);
}
export function kindOf(p) { return /포장|소모품/.test(String(p.category || '') + String(p.subgroup || '')) ? 'supplies' : 'food'; }
export function filterItems(items, {kind = 'all', cat = '', q = ''}, name = p => p.name_ko) {
  const s = String(q || '').trim().toLowerCase().replace(/\s/g, '');
  return items.filter(p => (kind === 'all' || kindOf(p) === kind) && (!cat || p.category === cat)
    && (!s || String(name(p) || '').toLowerCase().replace(/\s/g, '').includes(s) || String(p.name_en || '').toLowerCase().replace(/\s/g, '').includes(s)));
}
const view = {kind: 'all', cat: '', q: ''};
export function renderSupplies(host, c) {
  ensureStyle();
  const {t, esc} = c;
  const cats = [...new Set(c.items.map(p => p.category).filter(Boolean))];
  if (view.cat && !cats.includes(view.cat)) view.cat = '';
  const rows = () => {
    const list = filterItems(c.items, view, c.name), groups = [];
    list.forEach(p => { const k = p.category || ''; let g = groups.find(x => x.k === k); if (!g) groups.push(g = {k, list: []}); g.list.push(p); });
    const dis = c.locked || c.preview ? 'disabled' : '';
    return list.length ? groups.map(g => `<div class="so-group">${esc(g.k)} · ${g.list.length}</div>${g.list.map(p => {
      const q = c.getQty(p), way = c.onTheWay?.(p);
      return `<div class="so-row ${q > 0 ? 'on' : ''}"><div class="so-pic">${kindOf(p) === 'supplies' && !/img/.test(c.picture(p)) ? '📦' : c.picture(p)}</div>
        <div class="so-name">${esc(c.name(p))}<small>${esc(c.unitLabel(p))}${way ? ' · ' + esc(t(`${way.date} 도착 예정`, `arriving ${way.date}`)) : ''}</small></div>
        <div class="so-act">${q > 0
          ? `<button class="step" data-so="less" data-id="${esc(p.id)}" ${dis} aria-label="${t('하나 빼기', 'one less')}">−</button><b>${esc(c.qtyDisplay(p, q))}</b><button class="step plus" data-so="need" data-id="${esc(p.id)}" ${dis} aria-label="${t('하나 더', 'one more')}">+</button>`
          : `<button class="need" data-so="need" data-id="${esc(p.id)}" ${dis}>${t('더 필요해요!', 'Need more!')}</button>`}</div></div>`;
    }).join('')}`).join('') : `<p class="so-empty">${t('찾는 품목이 없어요', 'No matching items')}</p>`;
  };
  const basketLabel = () => { const n = c.items.filter(p => c.getQty(p) > 0).length; return '🛒 ' + t(`발주함 보기${n ? ` · 추가 ${n}개` : ''}`, `Open basket${n ? ` · ${n} extra` : ''}`); };
  host.innerHTML = `<div class="so">
    <div class="so-tabs"><button data-so="back">✅ ${t('필수 확인', 'Must check')}</button><button aria-pressed="true">📦 ${t('추가 주문', 'Extra order')}</button><button data-so="basket">🛒 ${t('발주함', 'Basket')}</button></div>
    <h3>📦 ${t('추가 주문', 'Extra order')}</h3>
    <p class="so-help">${t('필수 확인에 없는 품목이에요. 세지 않아도 돼요. 필요한 것만 "더 필요해요!"를 누르면 발주 단위로 하나씩 담겨요.', 'Items not in Must check. No counting. Tap "Need more!" to add one order unit at a time.')}</p>
    <div class="so-chips">${[['all', t('전체', 'All')], ['food', t('식재료·메뉴', 'Food & menu')], ['supplies', t('소모품·포장', 'Supplies')]].map(([k, l]) => `<button data-kind="${k}" aria-pressed="${view.kind === k}">${l}</button>`).join('')}</div>
    <div class="so-find"><input type="search" id="soSearch" placeholder="${t('품목 검색', 'Search')}" value="${esc(view.q)}"><select id="soCat"><option value="">${t('전체 카테고리', 'All categories')}</option>${cats.map(k => `<option ${view.cat === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    <div id="soRows">${rows()}</div>
    <button class="so-basket" data-so="basket">${basketLabel()}</button></div>`;
  const redraw = () => { host.querySelector('#soRows').innerHTML = rows(); host.querySelectorAll('.so-basket').forEach(b => { b.textContent = basketLabel(); }); };
  host.querySelector('#soSearch').oninput = e => { view.q = e.target.value; redraw(); };
  host.querySelector('#soCat').onchange = e => { view.cat = e.target.value; redraw(); };
  host.onclick = e => {
    const k = e.target.closest('button[data-kind]');
    if (k) { view.kind = k.dataset.kind; host.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === k))); return redraw(); }
    const b = e.target.closest('button[data-so]'); if (!b || b.disabled) return;
    if (b.dataset.so === 'back') return c.back();
    if (b.dataset.so === 'basket') return c.openBasket();
    const p = c.items.find(x => x.id === b.dataset.id); if (!p) return;
    const step = c.qtyStep(p) || 1, q = c.getQty(p);
    c.setQty(p, Math.max(0, Math.round((q + (b.dataset.so === 'need' ? step : -step)) * 1000) / 1000));
    redraw();
  };
}
