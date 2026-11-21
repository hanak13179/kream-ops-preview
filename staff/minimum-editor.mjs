// 최소수량 (매니저 전용): 매장마다 품목별로 "늘 있어야 할 수량"을 정해요.
// 직원이 재고를 세면 (최소수량 − 센 재고)만큼 자동으로 발주함에 들어가요.
// 바꾼 줄만 색이 바뀌고, "업데이트 하기"를 눌러야 저장돼요.

const STYLE_ID = 'minimum-editor-style';
const CSS = `
.me{grid-column:1/-1;max-width:640px;width:100%;margin:0 auto 110px}
.me *{box-sizing:border-box}
.me-help{font-size:13px;color:#6b6555;margin:4px 0 10px}
.me-cat{font-weight:800;font-size:14px;padding:10px 12px;border-radius:12px;background:#efe9db;margin:14px 0 6px}
.me-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;background:#fff;border-radius:14px;padding:8px 10px 8px 14px;margin-bottom:6px;box-shadow:0 1px 3px #0001}
.me-row.changed{background:#fdf1e7;outline:2px solid #f0a37a}
.me-row b{font-size:15px;display:block}
.me-row small{font-size:12px;color:#8a8676}
.me-step{display:flex;align-items:center;gap:6px}
.me-step button{width:42px;height:42px;border-radius:50%;border:0;background:#efe9db;font-size:22px}
.me-step input{width:64px;height:42px;text-align:center;font-size:18px;font-weight:800;border:1px solid #e2dfd3;border-radius:10px;background:#fff;-moz-appearance:textfield}
.me-step input::-webkit-inner-spin-button{appearance:none}
.me-bar{position:sticky;bottom:96px;display:flex;gap:10px;align-items:center;justify-content:space-between;background:#3e4b33;color:#fff;border-radius:16px;padding:10px 12px;margin-top:12px;z-index:4}
.me-bar button{border:0;border-radius:12px;padding:12px 18px;font-size:16px;font-weight:800;background:#ed522e;color:#fff}
.me-bar button:disabled{opacity:.45}
.me-bar .undo{background:transparent;color:#dfe6d6;font-weight:600;padding:12px 8px}
.me-msg{font-size:13px;min-height:18px;margin-top:6px;color:#3e4b33}
.me-msg.err{color:#b33427}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID; el.textContent = CSS;
  document.head.appendChild(el);
}

/** app.mjs가 들고 있는 상태: 바꾼 값 */
export function createMinimumState() { return {edits: {}, msg: '', err: false, saving: false}; }

/**
 * c: {state, items, t, esc, name, unitLabel, current(p) → 숫자|null, save: async (changes:[{p,value}]) → void, preview, title}
 */
export function renderMinimumEditor(host, c) {
  ensureStyle();
  const {state: s, items, t, esc} = c;
  const val = p => (s.edits[p.id] != null ? s.edits[p.id] : c.current(p));
  const changed = () => items.filter(p => s.edits[p.id] != null && s.edits[p.id] !== c.current(p));

  function draw() {
    const groups = [];
    items.forEach(p => { const g = groups.find(x => x.cat === p.category) || (groups.push({cat: p.category, list: []}), groups[groups.length - 1]); g.list.push(p); });
    const n = changed().length;
    host.innerHTML = `<div class="me">
      <p class="me-help">${t('늘 있어야 할 수량이에요. 직원이 재고를 세면 모자란 만큼 자동으로 주문돼요.', 'How many should always be in store. Counting stock orders the shortfall automatically.')}</p>
      ${groups.map(g => `<div class="me-cat">${esc(g.cat)} · ${g.list.length}</div>${g.list.map(p => {
        const v = val(p), ch = s.edits[p.id] != null && s.edits[p.id] !== c.current(p);
        return `<div class="me-row ${ch ? 'changed' : ''}" data-row="${esc(p.id)}"><div><b>${esc(c.name(p))}</b><small>${esc(c.unitLabel(p))}${c.current(p) == null ? ' · ' + t('아직 안 정함', 'not set') : ''}</small></div>
          <div class="me-step"><button data-me="-" data-id="${esc(p.id)}" aria-label="${t('줄이기', 'less')}">−</button><input data-me-input="${esc(p.id)}" type="number" inputmode="numeric" min="0" max="100000" step="1" value="${v == null ? '' : esc(v)}" placeholder="—" aria-label="${esc(c.name(p))} ${t('최소수량', 'minimum')}"><button data-me="+" data-id="${esc(p.id)}" aria-label="${t('늘리기', 'more')}">＋</button></div></div>`;
      }).join('')}`).join('') || `<p class="empty">${t('해당 품목이 없어요.', 'No items here.')}</p>`}
      <div class="me-bar"><button class="undo" data-me="undo" ${n ? '' : 'disabled'}>${t('되돌리기', 'Undo')}</button><span>${n ? t(`${n}개 바뀜`, `${n} changed`) : t('바뀐 것 없음', 'No changes')}</span><button data-me="save" ${n && !s.saving && !c.preview ? '' : 'disabled'}>${s.saving ? t('저장 중…', 'Saving…') : t('업데이트 하기', 'Update')}</button></div>
      <p class="me-msg ${s.err ? 'err' : ''}">${esc(c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : s.msg)}</p>
    </div>`;
  }

  function setVal(id, v) {
    const p = items.find(x => x.id === id); if (!p) return;
    if (v === '' || v == null) { delete s.edits[id]; }
    else s.edits[id] = Math.max(0, Math.min(100000, Math.round(Number(v))));
    if (s.edits[id] === c.current(p)) delete s.edits[id];
    s.msg = ''; s.err = false;
    // 그 줄과 아래 막대만 다시 그리기 (화면이 튀지 않게)
    const row = host.querySelector(`[data-row="${CSS_escape(id)}"]`);
    const ch = s.edits[id] != null;
    if (row) { row.classList.toggle('changed', ch); const inp = row.querySelector('input'); if (inp && document.activeElement !== inp) inp.value = val(p) ?? ''; }
    const n = changed().length, bar = host.querySelector('.me-bar');
    if (bar) { bar.querySelector('span').textContent = n ? t(`${n}개 바뀜`, `${n} changed`) : t('바뀐 것 없음', 'No changes'); bar.querySelector('[data-me="save"]').disabled = !n || s.saving || c.preview; bar.querySelector('[data-me="undo"]').disabled = !n; }
  }

  host.onclick = async e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    const id = b.dataset.id;
    if (b.dataset.me === '+' || b.dataset.me === '-') { const p = items.find(x => x.id === id); setVal(id, (Number(val(p)) || 0) + (b.dataset.me === '+' ? 1 : -1)); return; }
    if (b.dataset.me === 'undo') { s.edits = {}; s.msg = ''; draw(); return; }
    if (b.dataset.me === 'save') {
      const list = changed().map(p => ({p, value: s.edits[p.id]}));
      if (!list.length) return;
      s.saving = true; draw();
      try {
        await c.save(list);
        s.edits = {}; s.msg = t(`${list.length}개 최소수량을 업데이트했어요.`, `Updated ${list.length} minimums.`); s.err = false;
      } catch (err) {
        s.msg = t('일부 저장이 안 됐어요. 남은 품목은 색이 그대로예요. 다시 눌러 주세요.', 'Some did not save. Remaining items stay highlighted; try again.'); s.err = true;
      } finally { s.saving = false; draw(); }
    }
  };
  host.oninput = e => { const el = e.target.closest('[data-me-input]'); if (el) setVal(el.dataset.meInput, el.value); };
  draw();
}

function CSS_escape(v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/"/g, '\\"'); }
