// 최소수량 (매니저 전용): 매장마다 품목별로 "늘 있어야 할 수량"을 평일 / 주말로 정해요.
// 주말을 비워두면 주말에도 평일 수량을 써요 (앱의 원래 계산 방식).
// 직원이 재고를 세면 (최소수량 − 센 재고)만큼 자동으로 발주함에 들어가요.
// 바꾼 줄만 색이 바뀌고, "업데이트 하기"를 눌러야 저장돼요.

const STYLE_ID = 'minimum-editor-style';
const CSS = `
.me{grid-column:1/-1;max-width:640px;width:100%;margin:0 auto 110px}
.me *{box-sizing:border-box}
.me-help{font-size:13px;color:#6b6555;margin:4px 0 10px}
.me-cat{font-weight:800;font-size:14px;padding:10px 12px;border-radius:12px;background:#efe9db;margin:14px 0 6px}
.me-row{background:#fff;border-radius:14px;padding:10px 12px;margin-bottom:6px;box-shadow:0 1px 3px #0001}
.me-row.changed{background:#fdf1e7;outline:2px solid #f0a37a}
.me-row b{font-size:15px}
.me-row small{font-size:12px;color:#8a8676;margin-left:6px}
.me-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.me-step{display:flex;align-items:center;gap:5px}
.me-step label{font-size:12px;font-weight:700;color:#6b6555;min-width:30px}
.me-step button{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:#efe9db;font-size:20px}
.me-step input{flex:1;min-width:0;width:100%;height:38px;text-align:center;font-size:17px;font-weight:800;border:1px solid #e2dfd3;border-radius:10px;background:#fff;-moz-appearance:textfield}
.me-step input::placeholder{font-size:11px;font-weight:600;color:#b3ad9c}
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

/** app.mjs가 들고 있는 상태: 바꾼 값 {품목id: {wd, we}} (null = 비움) */
export function createMinimumState() { return {edits: {}, msg: '', err: false, saving: false}; }

/**
 * c: {state, items, t, esc, name, unitLabel, current(p) → {wd, we} (숫자|null),
 *     save: async (changes:[{p, weekday, weekend}]) → void (저장된 품목은 state.edits에서 지워요), preview}
 */
export function renderMinimumEditor(host, c) {
  ensureStyle();
  const {state: s, items, t, esc} = c;
  const cur = p => c.current(p) || {wd: null, we: null};
  const get = (p, k) => { const e = s.edits[p.id]; return e && k in e ? e[k] : cur(p)[k]; };
  const isChanged = p => { const e = s.edits[p.id]; if (!e) return false; const o = cur(p); return ('wd' in e && e.wd !== o.wd) || ('we' in e && e.we !== o.we); };
  const changed = () => items.filter(isChanged);
  const fmt = v => (v == null ? '' : String(v));

  function rowHtml(p) {
    const wd = get(p, 'wd'), we = get(p, 'we');
    const step = (k, label, v, ph) => `<div class="me-step"><label>${label}</label><button data-me="-" data-k="${k}" data-id="${esc(p.id)}" aria-label="${label} ${t('줄이기', 'less')}">−</button><input data-me-input="${esc(p.id)}" data-k="${k}" type="number" inputmode="numeric" min="0" max="100000" step="1" value="${esc(fmt(v))}" placeholder="${esc(ph)}" aria-label="${esc(c.name(p))} ${label}"><button data-me="+" data-k="${k}" data-id="${esc(p.id)}" aria-label="${label} ${t('늘리기', 'more')}">＋</button></div>`;
    return `<div class="me-row ${isChanged(p) ? 'changed' : ''}" data-row="${esc(p.id)}"><b>${esc(c.name(p))}</b><small>${esc(c.unitLabel(p))}${cur(p).wd == null && cur(p).we == null ? ' · ' + t('아직 안 정함', 'not set') : ''}</small>
      <div class="me-pair">${step('wd', t('평일', 'Wkday'), wd, '—')}${step('we', t('주말', 'Wkend'), we, wd == null ? '—' : `(${wd})`)}</div></div>`;
  }

  function draw() {
    const groups = [];
    items.forEach(p => { let g = groups.find(x => x.cat === p.category); if (!g) groups.push(g = {cat: p.category, list: []}); g.list.push(p); });
    const n = changed().length;
    host.innerHTML = `<div class="me">
      <p class="me-help">${t('늘 있어야 할 수량이에요. 직원이 재고를 세면 모자란 만큼 자동으로 주문돼요. 주말을 비워두면 주말에도 평일 수량을 써요 (회색 숫자).', 'How many should always be in store. Counting orders the shortfall automatically. Leave weekend blank to use the weekday number.')}</p>
      ${groups.map(g => `<div class="me-cat">${esc(g.cat)} · ${g.list.length}</div>${g.list.map(rowHtml).join('')}`).join('') || `<p class="empty">${t('해당 품목이 없어요.', 'No items here.')}</p>`}
      <div class="me-bar"><button class="undo" data-me="undo" ${n ? '' : 'disabled'}>${t('되돌리기', 'Undo')}</button><span>${n ? t(`${n}개 바뀜`, `${n} changed`) : t('바뀐 것 없음', 'No changes')}</span><button data-me="save" ${n && !s.saving && !c.preview ? '' : 'disabled'}>${s.saving ? t('저장 중…', 'Saving…') : t('업데이트 하기', 'Update')}</button></div>
      <p class="me-msg ${s.err ? 'err' : ''}">${esc(c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : s.msg)}</p>
    </div>`;
  }

  function setVal(id, k, v, fromTyping) {
    const p = items.find(x => x.id === id); if (!p) return;
    const e = s.edits[id] || (s.edits[id] = {});
    e[k] = v === '' || v == null ? null : Math.max(0, Math.min(100000, Math.round(Number(v))));
    if (!isChanged(p)) delete s.edits[id];
    s.msg = ''; s.err = false;
    // 그 줄과 아래 막대만 고치기 (화면이 튀지 않게)
    const row = [...host.querySelectorAll('[data-row]')].find(r => r.dataset.row === id);
    if (row) {
      row.classList.toggle('changed', isChanged(p));
      row.querySelectorAll('input[data-k]').forEach(inp => {
        if (!(fromTyping && document.activeElement === inp)) inp.value = fmt(get(p, inp.dataset.k));
        if (inp.dataset.k === 'we') { const wd = get(p, 'wd'); inp.placeholder = wd == null ? '—' : `(${wd})`; }
      });
    }
    const n = changed().length, bar = host.querySelector('.me-bar');
    if (bar) { bar.querySelector('span').textContent = n ? t(`${n}개 바뀜`, `${n} changed`) : t('바뀐 것 없음', 'No changes'); bar.querySelector('[data-me="save"]').disabled = !n || s.saving || c.preview; bar.querySelector('[data-me="undo"]').disabled = !n; }
  }

  host.onclick = async e => {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    const id = b.dataset.id, k = b.dataset.k;
    if (b.dataset.me === '+' || b.dataset.me === '-') {
      const p = items.find(x => x.id === id);
      // 주말이 비어 있으면 평일 숫자에서 시작
      const start = get(p, k) ?? (k === 'we' ? get(p, 'wd') : null) ?? 0;
      setVal(id, k, Number(start) + (b.dataset.me === '+' ? 1 : -1));
      return;
    }
    if (b.dataset.me === 'undo') { s.edits = {}; s.msg = ''; draw(); return; }
    if (b.dataset.me === 'save') {
      const list = changed().map(p => ({p, weekday: get(p, 'wd'), weekend: get(p, 'we')}));
      if (!list.length) return;
      s.saving = true; draw();
      try {
        await c.save(list);
        s.msg = t(`${list.length}개 최소수량을 업데이트했어요.`, `Updated ${list.length} minimums.`); s.err = false;
      } catch (err) {
        s.msg = t('일부 저장이 안 됐어요. 색이 남은 품목을 다시 업데이트해 주세요.', 'Some did not save. Update the highlighted items again.'); s.err = true;
      } finally { s.saving = false; draw(); }
    }
  };
  host.oninput = e => { const el = e.target.closest('[data-me-input]'); if (el) setVal(el.dataset.meInput, el.dataset.k, el.value, true); };
  draw();
}
