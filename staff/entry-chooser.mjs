// First screen when the app opens: pick 1호점 · 2호점 · 3호점 · 4호점 · 공장, then go in.
// Change which store each number means here (matched against store id or name, case-insensitive).
export const ENTRY_CHOICES = [
  {key: '1', label: '1호점', match: 'wellesley', color: '#eeb4ae'},
  {key: '2', label: '2호점', match: 'midland', color: '#b3cd9f'},
  {key: '3', label: '3호점', match: 'richmond', color: '#a9c1e3'},
  {key: '4', label: '4호점', match: 'finch', color: '#ccb6e2'},
  {key: 'factory', label: '공장', match: 'factory', color: '#3e4b33', dark: true}
];
const KEY = 'kream-entry-choice';

export function entryChoice() {
  try { return ENTRY_CHOICES.find(c => c.key === sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
// The store from the list that matches the chosen 호점, or null.
export function entryStore(stores) {
  const c = entryChoice();
  if (!c || c.key === 'factory') return null;
  return stores.find(s => String(s.id).toLowerCase().includes(c.match) || String(s.name || '').toLowerCase().includes(c.match)) || null;
}
export function resetEntry() { try { sessionStorage.removeItem(KEY); } catch {} location.reload(); }

// Shows the chooser once per app open (sessionStorage), resolves when a place is picked.
export function chooseEntry() {
  if (entryChoice()) return Promise.resolve(entryChoice());
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.id = 'entry-chooser';
    wrap.innerHTML = `<div class="entry-box"><div class="entry-logo">kream</div><p class="entry-sub">어디에서 일하나요? · Where are you working?</p>
      <div class="entry-grid">${ENTRY_CHOICES.map(c => `<button type="button" data-entry="${c.key}" class="${c.key === 'factory' ? 'entry-factory' : ''}" style="--c:${c.color};${c.dark ? 'color:#fff' : ''}">${c.label}</button>`).join('')}</div></div>`;
    const css = document.createElement('style');
    css.textContent = `#entry-chooser{position:fixed;inset:0;z-index:10000;background:#f8f5ef;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}
      .entry-box{width:min(440px,100%);text-align:center}
      .entry-logo{font:italic 54px Georgia,serif;color:#ed522e;line-height:1}
      .entry-sub{color:#55574d;margin:14px 0 26px;font:15px system-ui,sans-serif}
      .entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .entry-grid button{font:700 24px system-ui,sans-serif;min-height:104px;border-radius:20px;border:0;background:var(--c);color:#2f3129;box-shadow:0 3px 0 #0002;cursor:pointer}
      .entry-grid button:active{transform:translateY(2px);box-shadow:0 1px 0 #0002}
      .entry-grid .entry-factory{grid-column:1/-1;min-height:88px}`;
    document.head.appendChild(css);
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-entry]');
      if (!b) return;
      try { sessionStorage.setItem(KEY, b.dataset.entry); } catch {}
      wrap.remove();
      resolve(entryChoice());
    });
  });
}
