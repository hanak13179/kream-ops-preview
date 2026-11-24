// 최소수량 (매니저 전용): 매장마다 품목별로 "늘 있어야 할 수량"을 평일 / 주말로 정해요.
// 주말을 비워두면 주말에도 평일 수량을 써요 (앱의 원래 계산 방식).
// 직원이 재고를 세면 (최소수량 − 센 재고)만큼 자동으로 발주함에 들어가요.
// 바꾼 줄만 색이 바뀌고, "업데이트 하기"를 눌러야 저장돼요.

const STYLE_ID = 'minimum-editor-style';
const CSS = `
.me-sheet{display:block;width:100%;height:44px;margin:4px 0 2px;border:1.5px dashed #8fb0e8;border-radius:12px;background:#eef4ff;color:#1d3f7a;font-size:15px;font-weight:800}
.me-sheet-help{display:block;margin:0 0 10px;color:#6b6555;font-size:12px}

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
 * c: {state, items, t, esc, name, unitLabel, current(p) → {wd, we, sug} (숫자|null, sug = 아직 안 정했을 때 쓰는 추천값),
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
    const step = (k, label, v, ph) => `<div class="me-step"><label>${label}</label><button data-me="-" data-k="${k}" data-id="${esc(p.id)}" aria-label="${label} ${t('줄이기', 'less')}">−</button><input data-me-input="${esc(p.id)}" data-k="${k}" type="number" inputmode="decimal" min="0" max="100000" step="any" value="${esc(fmt(v))}" placeholder="${esc(ph)}" aria-label="${esc(c.name(p))} ${label}"><button data-me="+" data-k="${k}" data-id="${esc(p.id)}" aria-label="${label} ${t('늘리기', 'more')}">＋</button></div>`;
    return `<div class="me-row ${isChanged(p) ? 'changed' : ''}" data-row="${esc(p.id)}"><b>${esc(c.name(p))}</b><small>${esc(c.unitLabel(p))}${cur(p).wd == null && cur(p).we == null ? ' · ' + (cur(p).sug != null ? t(`아직 안 정함 · 지금은 추천값 ${cur(p).sug} 으로 발주`, `not set · ordering with suggested ${cur(p).sug}`) : t('아직 안 정함', 'not set')) : ''}</small>
      <div class="me-pair">${step('wd', t('평일', 'Wkday'), wd, cur(p).sug != null && wd == null ? `(${cur(p).sug})` : '—')}${step('we', t('주말', 'Wkend'), we, wd == null ? '—' : `(${wd})`)}</div></div>`;
  }

  function draw() {
    const groups = [];
    items.forEach(p => { let g = groups.find(x => x.cat === p.category); if (!g) groups.push(g = {cat: p.category, list: []}); g.list.push(p); });
    const n = changed().length;
    host.innerHTML = `<div class="me">
      <p class="me-help">${t('늘 있어야 할 수량이에요. 직원이 재고를 세면 모자란 만큼 자동으로 주문돼요. 주말을 비워두면 주말에도 평일 수량을 써요 (회색 숫자).', 'How many should always be in store. Counting orders the shortfall automatically. Leave weekend blank to use the weekday number.')}</p>${c.loadSheet && !c.preview ? `<button class="me-sheet" data-me="sheet" ${s.saving ? 'disabled' : ''}>📄 ${t('시트에서 가져오기', 'Load from sheet')}</button><small class="me-sheet-help">${t('최소재고량 시트 값을 채워 넣어요. 확인하고 업데이트 하기를 눌러야 저장돼요.', 'Fills in the 최소재고량 sheet values. Press Update to save.')}</small>` : ''}
      ${groups.map(g => `<div class="me-cat">${esc(g.cat)} · ${g.list.length}</div>${g.list.map(rowHtml).join('')}`).join('') || `<p class="empty">${t('해당 품목이 없어요.', 'No items here.')}</p>`}
      <div class="me-bar"><button class="undo" data-me="undo" ${n ? '' : 'disabled'}>${t('되돌리기', 'Undo')}</button><span>${n ? t(`${n}개 바뀜`, `${n} changed`) : t('바뀐 것 없음', 'No changes')}</span><button data-me="save" ${n && !s.saving && !c.preview ? '' : 'disabled'}>${s.saving ? t('저장 중…', 'Saving…') : t('업데이트 하기', 'Update')}</button></div>
      <p class="me-msg ${s.err ? 'err' : ''}">${esc(c.preview ? t('미리보기: 저장되지 않아요.', 'Preview: nothing is saved.') : s.msg)}</p>
    </div>`;
  }

  function setVal(id, k, v, fromTyping) {
    const p = items.find(x => x.id === id); if (!p) return;
    const e = s.edits[id] || (s.edits[id] = {});
    // 반 단위(예: 스패너 크림 1.5통, 우유 2.5백)도 그대로 둬요. 소수 둘째 자리까지.
    e[k] = v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(100000, Math.round(Number(v) * 100) / 100));
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
      const start = get(p, k) ?? (k === 'we' ? get(p, 'wd') : null) ?? (k === 'wd' ? cur(p).sug : null) ?? 0;
      setVal(id, k, Number(start) + (b.dataset.me === '+' ? 1 : -1));
      return;
    }
    if (b.dataset.me === 'sheet') {
      s.saving = true; s.msg = t('시트를 읽는 중…', 'Reading the sheet…'); s.err = false; draw();
      try {
        const rows = await c.loadSheet();
        let n = 0;
        for (const r of rows) {
          const p = items.find(x => x.id === r.id); if (!p) continue;
          const o = cur(p), e = {};
          if (r.wd != null && r.wd !== o.wd) e.wd = r.wd;
          if (r.we != null && r.we !== o.we) e.we = r.we;
          if (Object.keys(e).length) { s.edits[p.id] = {...(s.edits[p.id] || {}), ...e}; if (isChanged(p)) n++; else delete s.edits[p.id]; }
        }
        s.msg = n ? t(`시트에서 ${n}개 다른 값을 채웠어요. 색이 칠해진 품목을 확인하고 업데이트 하기를 눌러요.`, `Filled ${n} different values from the sheet. Check the highlighted items and press Update.`)
          : t('시트 값이 지금 앱 값과 같아요.', 'The sheet matches the app.');
      } catch (err) {
        s.msg = t(`시트를 못 읽었어요 (${String(err?.message || err)}).`, `Could not read the sheet (${String(err?.message || err)}).`); s.err = true;
      } finally { s.saving = false; draw(); }
      return;
    }
    if (b.dataset.me === 'undo') { s.edits = {}; s.msg = ''; draw(); return; }
    if (b.dataset.me === 'save') {
      const list = changed().map(p => ({p, weekday: get(p, 'wd'), weekend: get(p, 'we')}));
      if (!list.length) return;
      const n0 = list.length;
      s.saving = true; draw();
      try {
        await c.save(list);
        s.msg = t(`${list.length}개 최소수량을 업데이트했어요.`, `Updated ${list.length} minimums.`); s.err = false;
      } catch (err) {
        const why = r => /permission|denied|not allowed|42501|forbidden|권한/i.test(r) ? t('권한이 없어요', 'no permission')
          : /revision|conflict|stale|changed|modified/i.test(r) ? t('다른 사람이 방금 바꿨어요', 'someone just changed it')
          : /STOCK_PIECES_REQUIRED/.test(r) ? t('낱개는 정수로 적어요', 'use whole pieces') : (r || t('알 수 없는 오류', 'unknown error'));
        const list = (err?.failures || []).map(f => `${f.name} (${why(f.reason)})`);
        const ok = Math.max(0, n0 - list.length);
        s.msg = list.length
          ? t(`${ok ? ok + '개는 저장했어요. ' : ''}저장 안 된 품목: ${list.join(', ')}. 색이 남은 품목을 다시 업데이트해 주세요.`, `${ok ? ok + ' saved. ' : ''}Not saved: ${list.join(', ')}. Update the highlighted items again.`)
          : t(`저장이 안 됐어요 (${why(String(err?.message || err))}). 다시 업데이트해 주세요.`, `Not saved (${why(String(err?.message || err))}). Please try again.`);
        s.err = true;
      } finally { s.saving = false; draw(); }
    }
  };
  host.oninput = e => { const el = e.target.closest('[data-me-input]'); if (el) setVal(el.dataset.meInput, el.dataset.k, el.value, true); };
  draw();
}

