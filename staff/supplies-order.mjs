// 📦 소모품 주문: 소모품·패키징은 재고를 세지 않아요. 필요한 품목만 '더 필요해요!'를 누르면 발주함에 1단위씩 들어가요.
// (패키징은 거의 박스채로 와서 발주 주기가 길어요. 발주게임에서는 빠져요.)
// c: {items, t, esc, name, unitLabel, picture, getQty(p), setQty(p,q), qtyStep(p), qtyDisplay(p,q), onTheWay(p) → {date}|null, back(), locked, preview, openBasket()}
const STYLE_ID = 'supplies-order-style';
const CSS = `
.so-top{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.so-top button{border:0;border-radius:12px;padding:8px 12px;background:#fff;box-shadow:0 1px 4px #0001;font-weight:800}
.so-top h3{margin:0;font-size:18px}
.so-help{margin:0 0 10px;color:#6b6555;font-size:13px}
.so-group{margin:12px 0 6px;padding:6px 10px;border-radius:10px;background:#efe9dc;font-weight:800;font-size:14px}
.so-row{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;background:#fff;border-radius:14px;padding:8px 10px;margin:6px 0;box-shadow:0 1px 3px #0001}
.so-row.on{outline:2px solid #e8583a;background:#fff6f2}
.so-pic{width:44px;height:44px;border-radius:10px;overflow:hidden}
.so-pic img{width:100%;height:100%;object-fit:cover}
.so-name{font-weight:800;font-size:15px}
.so-name small{display:block;font-weight:600;color:#6b6555;font-size:12px}
.so-act{display:flex;align-items:center;gap:6px}
.so-act .need{border:0;border-radius:12px;padding:10px 12px;background:#e8583a;color:#fff;font-weight:800;font-size:14px;white-space:nowrap}
.so-act .less{border:0;border-radius:10px;width:34px;height:34px;background:#efe9dc;font-size:18px;font-weight:800}
.so-act b{min-width:34px;text-align:center}
.so-basket{margin-top:12px;width:100%;height:46px;border:0;border-radius:14px;background:#3e4b33;color:#fff;font-size:16px;font-weight:800}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style'); el.id = STYLE_ID; el.textContent = CSS; document.head.appendChild(el);
}
export function renderSupplies(host, c) {
  ensureStyle();
  const {t, esc} = c;
  const draw = () => {
    const groups = [];
    c.items.forEach(p => { const k = p.subgroup || p.category || ''; let g = groups.find(x => x.k === k); if (!g) groups.push(g = {k, list: []}); g.list.push(p); });
    const dis = c.locked || c.preview ? 'disabled' : '';
    const n = c.items.filter(p => c.getQty(p) > 0).length;
    host.innerHTML = `<div class="so"><div class="so-top"><button data-so="back">← ${t('발주게임', 'Order game')}</button><h3>📦 ${t('소모품 주문', 'Supplies order')}</h3></div>
      <p class="so-help">${t('소모품·패키징은 재고를 세지 않아요. 필요한 것만 "더 필요해요!"를 누르면 발주함에 1단위씩 들어가요.', 'No counting for supplies and packaging. Tap "Need more!" for what you need; each tap adds 1 unit to the basket.')}</p>
      ${c.items.length ? groups.map(g => `<div class="so-group">${esc(g.k)} · ${g.list.length}</div>${g.list.map(p => { const q = c.getQty(p), way = c.onTheWay?.(p);
        return `<div class="so-row ${q > 0 ? 'on' : ''}"><div class="so-pic">${c.picture(p)}</div><div class="so-name">${esc(c.name(p))}<small>${esc(c.unitLabel(p))}${way ? ' · ' + esc(t(`${way.date} 도착 예정분 있음`, `arriving ${way.date}`)) : ''}</small></div>
          <div class="so-act">${q > 0 ? `<button class="less" data-so="less" data-id="${esc(p.id)}" ${dis} aria-label="${t('하나 빼기', 'one less')}">−</button><b>${esc(c.qtyDisplay(p, q))}</b>` : ''}<button class="need" data-so="need" data-id="${esc(p.id)}" ${dis}>${t('더 필요해요!', 'Need more!')}</button></div></div>`; }).join('')}`).join('') : `<p>${t('소모품·패키징 품목이 없어요.', 'No supplies or packaging items.')}</p>`}
      <button class="so-basket" data-so="basket">🛒 ${t(`발주함 보기${n ? ` · ${n}개` : ''}`, `Open basket${n ? ` · ${n}` : ''}`)}</button></div>`;
  };
  host.onclick = e => {
    const b = e.target.closest('button[data-so]'); if (!b || b.disabled) return;
    if (b.dataset.so === 'back') return c.back();
    if (b.dataset.so === 'basket') return c.openBasket();
    const p = c.items.find(x => x.id === b.dataset.id); if (!p) return;
    const step = c.qtyStep(p) || 1, q = c.getQty(p);
    c.setQty(p, Math.max(0, Math.round((q + (b.dataset.so === 'need' ? step : -step)) * 1000) / 1000));
    draw();
  };
  draw();
}
