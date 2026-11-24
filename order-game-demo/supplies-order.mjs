import {isSupplyOrderItem} from './required-order-items.mjs';
const STYLE_ID = 'supplies-order-style';
const CSS = `
.so{min-width:0;max-width:100%}.so-kinds{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.so-kinds button{border:1px solid #e4ddcc;border-radius:999px;padding:7px 10px;background:white;color:#443a2e;font:inherit;font-size:.85rem;min-height:40px}.so-kinds button[aria-pressed=true]{background:#3e4b33;color:white;border-color:#3e4b33}
.so-top{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.so-top button{border:0;border-radius:12px;padding:8px 12px;background:#fff;box-shadow:0 1px 4px #0001;font-weight:800}
.so-top h3{margin:0;font-size:18px}
.so-filters{display:grid;grid-template-columns:2fr 1fr;gap:8px;margin:0 0 12px}.so-filters input,.so-filters select{width:100%;min-width:0;padding:10px;border:1px solid #e4ddcc;border-radius:9px;background:white;color:inherit;font:inherit}.so-filters [hidden],.so [hidden]{display:none}.so-basket{position:sticky;bottom:8px}.so-name{overflow-wrap:anywhere}@media(max-width:400px){.so-row{grid-template-columns:32px minmax(0,1fr) auto;gap:6px}.so-pic{width:32px;height:32px}.so-act{grid-column:2/4;justify-content:flex-end}.so-act .need{padding:8px;font-size:13px;min-height:44px}}
.so-help{margin:0 0 10px;color:#6b6555;font-size:13px}
.so-group{margin:12px 0 6px;padding:6px 10px;border-radius:10px;background:#efe9dc;font-weight:800;font-size:14px}
.so-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;background:#fff;border-radius:14px;padding:8px 10px;margin:6px 0;box-shadow:0 1px 3px #0001}
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
  const categories = [...new Set(c.items.map(p => p.category).filter(Boolean))];
  let search = '', category = '', kind = 'all';
  const applyFilters = () => {
    const query = search.trim().toLowerCase().replace(/\s/g, '');
    let visible = 0;
    host.querySelectorAll('[data-so-group]').forEach(group => {
      let matches = 0;
      group.querySelectorAll('[data-so-row]').forEach(row => {
        row.hidden = (kind !== 'all' && kind !== row.dataset.kind) || Boolean(category && row.dataset.category !== category) || !row.dataset.search.includes(query);
        if (!row.hidden) matches++;
      });
      group.hidden = matches === 0;
      visible += matches;
    });
    host.querySelector('[data-so-empty]').hidden = visible > 0;
  };
  const draw = () => {
    const groups = [];
    c.items.forEach(p => { const k = [p.category, p.subgroup].filter(Boolean).join(' · '); let g = groups.find(x => x.k === k); if (!g) groups.push(g = {k, list: []}); g.list.push(p); });
    const dis = c.locked || c.preview ? 'disabled' : '';
    const n = c.items.filter(p => c.getQty(p) > 0).length;
    host.innerHTML = `<div class="so"><div class="so-top"><h3>📦 ${t('추가 주문', 'Extra order')}</h3></div>
      <p class="so-help">${t('필요한 품목만 골라 주세요. 버튼을 누를 때마다 발주 단위로 하나씩 담겨요.', 'Choose what you need. Each tap adds one ordering increment.')}</p>
      <div class="so-kinds" role="group" aria-label="${t('품목 종류','Item type')}">${[['all',t('전체','All')],['food',t('식재료·메뉴','Food & ingredients')],['supply',t('소모품·포장','Supplies & packaging')]].map(([key,label])=>`<button data-so="kind" data-kind="${key}" aria-pressed="${kind===key}">${esc(label)}</button>`).join('')}</div><div class="so-filters"><input data-so-search type="search" aria-label="${t('품목 검색','Search items')}" placeholder="${t('품목 검색','Search items')}" value="${esc(search)}"><select data-so-category aria-label="${t('카테고리','Category')}"><option value="">${t('전체 카테고리','All categories')}</option>${categories.map(value => `<option value="${esc(value)}" ${category===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div>
      ${groups.map(g => `<section data-so-group><div class="so-group">${esc(g.k)} · ${g.list.length}</div>${g.list.map(p => { const q = c.getQty(p), way = c.onTheWay?.(p);
        return `<div data-so-row data-kind="${isSupplyOrderItem(p)?'supply':'food'}" data-category="${esc(p.category || '')}" data-search="${esc(`${p.name_ko || ''} ${p.name_en || ''} ${c.name(p)}`.toLowerCase().replace(/\s/g, ''))}" class="so-row ${q > 0 ? 'on' : ''}"><div class="so-pic">${c.picture(p)}</div><div class="so-name">${esc(c.name(p))}<small>${esc(c.unitLabel(p))}${way ? ' · ' + esc(t(`${way.date} 도착 예정분 있음`, `arriving ${way.date}`)) : ''}</small></div>
          <div class="so-act">${q > 0 ? `<button class="less" data-so="less" data-id="${esc(p.id)}" ${dis} aria-label="${t('하나 빼기', 'one less')}">−</button><b>${esc(c.qtyDisplay(p, q))}</b>` : ''}<button class="need" data-so="need" data-id="${esc(p.id)}" ${dis}>${t('더 필요해요!', 'Need more!')}</button></div></div>`;  }).join('')}</section>`).join('')}
      <p data-so-empty hidden>${t('찾는 품목이 없어요.', 'No matching items.')}</p>
      <button class="so-basket" data-so="basket">🛒 ${t(`발주함 보기${n ? ` · ${n}개` : ''}`, `Open basket${n ? ` · ${n}` : ''}`)}</button></div>`;
    host.querySelector('[data-so-search]').oninput = event => { search = event.target.value; applyFilters(); };
    host.querySelector('[data-so-category]').onchange = event => { category = event.target.value; applyFilters(); };
    applyFilters();
  };
  host.onclick = e => {
    const b = e.target.closest('button[data-so]'); if (!b || b.disabled) return;
    if (b.dataset.so === 'kind') {
      kind = b.dataset.kind;
      host.querySelectorAll('[data-so="kind"]').forEach(button => button.setAttribute('aria-pressed', String(button === b)));
      applyFilters();
      return;
    }
    if (b.dataset.so === 'basket') return c.openBasket();
    const p = c.items.find(x => x.id === b.dataset.id); if (!p) return;
    const step = c.qtyStep(p) || 1, q = c.getQty(p);
    c.setQty(p, Math.min(Math.floor(100000 / step) * step, Math.max(0, Math.round((q + (b.dataset.so === 'need' ? step : -step)) * 1000) / 1000)));
    draw();
  };
  draw();
}
