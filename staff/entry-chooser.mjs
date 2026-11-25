// After login: ask where the person is working today (1호점 · 2호점 · 3호점 · 4호점 · 공장).
// Only places this account can use are shown; with a single option the screen is skipped.
// Asked once per app open (sessionStorage); a new app open asks again.
// Edit LABELS to change which store each 호점 number means (matched against store id or name).
const LABELS = [
  {label: '1호점', match: 'wellesley', color: '#eeb4ae'},
  {label: '2호점', match: 'midland', color: '#b3cd9f'},
  {label: '3호점', match: 'richmond', color: '#a9c1e3'},
  {label: '4호점', match: 'finch', color: '#ccb6e2'}
];
const FACTORY = {id: 'factory', label: '공장', color: '#3e4b33', dark: true};
const KEY = 'kream-entry-choice:';
export function assignedWorkplaces(profile,stores=[]){
 if(!profile?.active)return {stores:[],factory:false};
 const owner=profile.role==='owner',allStores=owner||profile.role==='manager'&&profile.general_manager;
 const storeRole=['employee','manager','midland_owner'].includes(profile.role)||profile.role==='factory'&&profile.factory_manager&&profile.store_manager;
 return {stores:stores.filter(s=>(allStores||storeRole&&(profile.store_ids||[]).includes(s.id))&&(profile.role!=='midland_owner'||s.id==='midland')),factory:owner||profile.role==='factory'};
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function labelFor(store) {
  const text = (String(store.id) + ' ' + String(store.name || '')).toLowerCase();
  return LABELS.find(l => text.includes(l.match)) || null;
}

// stores: the stores this account can open; factory: true if the account can open the factory pages.
// Resolves to {storeId} or {factory: true}, or null when nothing needs choosing.
export function chooseWorkplace({stores = [], factory = false, hr = false, lang = 'ko', userId = ''} = {}) {
  const options = stores.map(s => {
    const l = labelFor(s);
    return {id: s.id, label: l ? l.label : s.name, sub: l ? s.name : '', color: l ? l.color : '#e4e2d6', order: l ? LABELS.indexOf(l) : 99};
  }).sort((a, b) => a.order - b.order);
  if (factory) options.push({...FACTORY, sub: lang === 'ko' ? '생산 · 배분' : 'Production'});
  if (hr && options.length) options.push({id: 'hr', label: '📊 HR Management', sub: lang === 'ko' ? '지각·발주·품절·직원 관리' : 'Attendance · orders · stock · staff', color: '#5b4a6b', dark: true});
  if (!options.length) return Promise.resolve(null);

  let saved = null;
  try { saved = sessionStorage.getItem(KEY+userId); } catch {}
  const hit = options.find(o => o.id === saved);
  if (hit && hit.id !== 'hr') return Promise.resolve(hit.id === 'factory' ? {factory: true} : {storeId: hit.id});

  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.id = 'entry-chooser';
    wrap.setAttribute('role', 'dialog');
    wrap.innerHTML = `<div class="entry-box"><div class="entry-logo">kream</div>
      <p class="entry-sub">${lang === 'ko' ? '오늘 어디에서 일하나요?' : 'Where are you working today?'}</p>
      <div class="entry-grid">${options.map((o, i, all) => `<button type="button" data-entry="${esc(o.id)}" class="${o.id === 'factory' || o.id === 'hr' ? 'entry-factory' : wideLast(all, i) ? 'entry-wide' : ''}" style="--c:${o.color};${o.dark ? 'color:#fff' : ''}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div></div>`;
    if (!document.getElementById?.('entry-chooser-style')) {
      const css = document.createElement('style');
      css.id = 'entry-chooser-style';
      css.textContent = `#entry-chooser{position:fixed;inset:0;z-index:10000;background:#f8f5ef;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}
        .entry-box{width:min(440px,100%);text-align:center}
        .entry-logo{font:italic 54px Georgia,serif;color:#ed522e;line-height:1}
        .entry-sub{color:#55574d;margin:14px 0 26px;font:15px system-ui,sans-serif}
        .entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .entry-grid button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:700 24px system-ui,sans-serif;min-height:104px;border-radius:20px;border:0;background:var(--c);color:#2f3129;box-shadow:0 3px 0 #0002;cursor:pointer}
        .entry-grid button small{font:500 12px system-ui,sans-serif;opacity:.75}
        .entry-grid button:active{transform:translateY(2px);box-shadow:0 1px 0 #0002}
        .entry-grid .entry-factory{grid-column:1/-1;min-height:88px}
        .entry-grid .entry-wide{grid-column:1/-1}
        .entry-grid button{min-width:0;padding:12px 14px;text-align:center;overflow-wrap:anywhere;word-break:keep-all}
        @media(max-width:420px){.entry-grid{gap:10px}.entry-grid button{font-size:20px;min-height:92px}}`;
      document.head.appendChild(css);
    }
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-entry]');
      if (!b) return;
      if (b.dataset.entry !== 'hr') { try { sessionStorage.setItem(KEY+userId, b.dataset.entry); } catch {} }
      wrap.remove();
      resolve(b.dataset.entry === 'factory' ? {factory: true} : b.dataset.entry === 'hr' ? {hr: true} : {storeId: b.dataset.entry});
    });
  });
}

// Call on sign-out so the next person is asked again.
export function clearWorkplaceChoice(userId='') { try { sessionStorage.removeItem(KEY+userId); } catch {} }

// Label shown above the menu: "3호점 · Richmond Hill" or "공장".
const FACTORY_PAGES = new Set(['factorymanual', 'production', 'dispatch', 'galleria', 'galleriaHistory', 'galleriaSop', 'externaldispatch', 'productionlog', 'finishedstock', 'costs', 'inventory', 'purchases', 'materialreceiving']);
// 매장 수가 홀수면 마지막 매장 버튼을 한 줄 전체로 (반쪽만 떠 보이지 않게)
export function wideLast(options, i) {
  const stores = options.filter(o => o.id !== 'factory' && o.id !== 'hr');
  return stores.length % 2 === 1 && options[i] === stores[stores.length - 1];
}
export function workplaceBadge({store, factory=false, lang = 'ko'} = {}) {
  if (!factory && !store) return '';
  const l = store ? labelFor(store) : null;
  const title = factory ? (lang === 'ko' ? '공장' : 'Factory') : (l ? `${l.label} · ${store.name}` : store.name);
  const color = factory ? FACTORY.color : (l ? l.color : '#e4e2d6');
  return `<div class="workplace-badge${factory ? ' dark' : ''}" style="--c:${color}"><span><small>${lang === 'ko' ? '지금 근무지' : 'Working at'}</small>${esc(title)}</span><button type="button" data-workplace-switch>${lang === 'ko' ? '바꾸기' : 'Switch'}</button></div>`;
}
export function bindWorkplaceSwitch(host, onSwitch) {
  const b = host.querySelector('[data-workplace-switch]');
  if (b) b.onclick = onSwitch;
}
