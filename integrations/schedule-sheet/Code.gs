/**
 * Kream Ops Schedule 시트 연결 (📅 스케줄 페이지 → 구글 시트)
 * 시트: https://docs.google.com/spreadsheets/d/1GMTKRZKT6a2AoY3PQmQEaGrc_pHIPZkDfh1ufNbq7kw
 *
 * 앱이 {action, token, ...}을 보내면, 이 스크립트가 그 사람의 로그인 토큰으로 Supabase에서 직접 읽어서 써요.
 * → 앱에서 숫자를 보내지 않으니 시트에 가짜 시간을 넣을 수 없어요 (팁 금액만 매니저 앱에서 같이 와요).
 *
 *  syncWeek         (매니저) 그 주 스케줄을 '<월> Schedule' 탭에 매장마다 블록으로 (날짜 칸 아래 시간 / 시간수 / 이름, 사람마다 색).
 *                   같은 주는 다시 쓰고 새 주는 아래에 계속 쌓여요. 지각·안 옴 표시.
 *  ⟲ 시트에서 고치기  시간·이름 칸을 고치면 1분 안에 앱에 반영돼요 (메뉴 'Kream 스케줄' → 자동 반영 켜기, 처음 한 번).
 *  syncAvailability (누구나) 'Availability' 탭에서 그 사람 줄만 바꿔요 (매니저가 보내면 매장 사람 모두).
 *  syncPayroll      (매니저) 'Payroll' 탭에 2주 급여 요약 (시간·정규·초과 44h/주·카드팁·현금팁·지각). 같은 기간은 다시 써요.
 *
 * 설치: 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자) → URL을 staff/team-data.mjs 의 SCHEDULE_SHEET_URL 에 넣기
 */
const SUPABASE_URL = 'https://imkhosgnkgwchoyrqczw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ISqCCHUBASP2sKEqEM04Lg_Jnft4D-y';   // 공개 키 (앱에도 있는 값). 권한은 사람 토큰 + RLS로 정해져요.
const TZ = 'America/Toronto';
const SCHEDULE_ID='1GMTKRZKT6a2AoY3PQmQEaGrc_pHIPZkDfh1ufNbq7kw';
function scheduleSpreadsheet(){return SpreadsheetApp.openById(SCHEDULE_ID);}
const STORES = ['downtown', 'richmond-hill', 'finch'];
const STORE = {
  downtown: {label: '1호점 Wellesley', bg: '#fde2e4'},
  'richmond-hill': {label: '3호점 Richmond Hill', bg: '#dbeafe'},
  finch: {label: '4호점 Finch', bg: '#dcf2dc'}
};
const LATE_GRACE = 5, WEEK_OT = 44;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (!body.token) throw new Error('Sign in required');
    const me = sbAuth(body.token);
    const profile = sb(body.token, `kream_profiles?user_id=eq.${me}&select=role,display_name,active,access_blocked`)[0] || {};
    if(!profile.active || profile.access_blocked) throw new Error('Access denied');
    const manager = profile.active && ['owner', 'manager'].indexOf(profile.role) >= 0;
    let out;
    if (body.action === 'syncWeek') { if (!manager) throw new Error('Manager access required'); out = syncWeek(body.token, body.week_start, body.stores || []); }
    else if (body.action === 'syncAvailability') out = syncAvailability(body.token);
    else if (body.action === 'syncPayroll') { if (!manager) throw new Error('Manager access required'); out = syncPayroll(body.token, body.from, body.to, body.tips || []); }
    else throw new Error('Unknown action');
    return json({ok: true, data: out});
  } catch (err) { return json({ok: false, error: String(err.message || err)}); }
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ── Supabase (그 사람 토큰으로) ──
function sbAuth(token) {
  const r = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/user`, {headers: {apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`}, muteHttpExceptions: true});
  if (r.getResponseCode() !== 200) throw new Error('Sign in again');
  return JSON.parse(r.getContentText()).id;
}
function sb(token, path) {
  const r = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {headers: {apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`}, muteHttpExceptions: true});
  if (r.getResponseCode() >= 300) throw new Error(`DB ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`);
  return JSON.parse(r.getContentText());
}
function rpc(token, name, args) {
  const r = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {method: 'post', contentType: 'application/json', payload: JSON.stringify(args), headers: {apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`}, muteHttpExceptions: true});
  if (r.getResponseCode() >= 300) return [];
  return JSON.parse(r.getContentText());
}
function people(token) {
  const map = {};
  STORES.forEach(st => rpc(token, 'kream_team_people', {target_store: st}).forEach(p => { (map[p.user_id] = map[p.user_id] || {name: p.display_name, stores: []}).stores.push(st); }));
  return map;
}

// ── 날짜 ──
const pad = n => ('0' + n).slice(-2);
function ymdAdd(ymd, n) { const p = ymd.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function wd(ymd) { const p = ymd.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function weekStartOf(ymd) { return ymdAdd(ymd, -((wd(ymd) + 6) % 7)); }
const local = iso => Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd');
const localMin = iso => { const s = Utilities.formatDate(new Date(iso), TZ, 'HH:mm').split(':'); return Number(s[0]) * 60 + Number(s[1]); };
const hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const md = ymd => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8))}`;
function isoBound(ymd) { return new Date(`${ymd}T00:00:00-05:00`).toISOString(); }   // 넉넉하게 읽고 아래에서 날짜로 다시 걸러요
function worked(tc) {
  if (!tc.clock_out) return 0;
  const br = (tc.breaks || []).reduce((a, b) => a + (b.start && b.end ? (new Date(b.end) - new Date(b.start)) / 60000 : 0), 0);
  return Math.max(0, (new Date(tc.clock_out) - new Date(tc.clock_in)) / 60000 - br) / 60;
}
const r2 = n => Math.round(n * 100) / 100;
function monthTab(ymd, suffix) { const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(ymd.slice(5, 7)) - 1]; return `${m} ${suffix}`; }
function sheetNamed(name) { const ss = scheduleSpreadsheet(); return ss.getSheetByName(name) || ss.insertSheet(name); }

/** 블록 다시 쓰기: A열에 key가 있는 줄부터 다음 '#' 줄 전까지를 지우고 같은 자리에 새로 써요. 없으면 맨 아래에 붙여요. */
function writeBlock(sh, key, rows, styles) {
  const last = sh.getLastRow(), colA = last ? sh.getRange(1, 1, last, 1).getValues().map(r => String(r[0])) : [];
  let at = colA.indexOf(key) + 1, len = 0;
  if (at) { len = 1; while (at + len <= last && !String(colA[at + len - 1]).startsWith('#')) len++; sh.deleteRows(at, len); }
  else at = last ? last + 2 : 1;
  const width = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => r.concat(Array(width - r.length).fill('')));
  if (at > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), at - sh.getMaxRows() + grid.length);
  sh.insertRowsBefore(at, grid.length);
  if (width > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  const rg = sh.getRange(at, 1, grid.length, width);
  rg.setValues(grid).setBackground(null).setFontWeight('normal').setFontColor('#2b2a26').setWrap(true).setVerticalAlignment('top');
  (styles || []).forEach(s => { const r = sh.getRange(at + s.row, 1 + (s.col || 0), 1, s.cols || width); if (s.bg) r.setBackground(s.bg); if (s.bold) r.setFontWeight('bold'); if (s.color) r.setFontColor(s.color); if (s.size) r.setFontSize(s.size); if (s.align) r.setHorizontalAlignment(s.align); if (s.italic) r.setFontStyle('italic'); });
  return at;
}

// ── 스케줄 (예전 엑셀처럼: 매장마다·주마다 블록, 날짜 칸 아래로 시간 / 시간수 / 이름) ──
const MONTHS3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS_FULL = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const PERSON_COLORS = ['#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#d9d2e9', '#ead1dc', '#e6b8af', '#b6d7a8', '#a2c4c9', '#b4a7d6', '#f9cb9c', '#ffe599', '#9fc5e8', '#d5a6bd'];
function personColor(name) { let h = 0; String(name).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return PERSON_COLORS[h % PERSON_COLORS.length]; }
const blockKey = (weekStart, store) => `# ${weekStart} ${store}`;
const hmSpace = (a, b) => `${hm(a)} ~ ${hm(b)}`;

/** stores: 앱에서 매니저가 관리하는 매장들. 그 매장 사람(멤버)인 경우만 써요 */
function syncWeek(token, weekStart, stores) {
  weekStart = weekStartOf(weekStart);
  const end = ymdAdd(weekStart, 6), dates = [0, 1, 2, 3, 4, 5, 6].map(i => ymdAdd(weekStart, i));
  const ppl = people(token);
  const shifts = sb(token, `kream_team_shifts?select=*&published=eq.true&shift_date=gte.${weekStart}&shift_date=lte.${end}&order=start_min`);
  const cards = sb(token, `kream_team_timecards?select=*&clock_in=gte.${isoBound(ymdAdd(weekStart, -1))}&clock_in=lt.${isoBound(ymdAdd(end, 2))}`);
  const mine = (stores && stores.length ? stores : STORES).filter(st => STORES.indexOf(st) >= 0 && rpc(token, 'kream_team_people', {target_store: st}).length);
  const sh = sheetNamed(monthTab(weekStart, 'Schedule'));
  const now = new Date(), today = local(now.toISOString()), nowMin = localMin(now.toISOString());
  mine.forEach(st => {
    const name = id => id ? ((ppl[id] && ppl[id].name) || '?') : 'OPEN';
    const byDay = dates.map(d => shifts.filter(s => s.store_id === st && s.shift_date === d).sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min));
    const slots = Math.max(1, ...byDay.map(l => l.length)) + 1;   // 맨 아래 빈 칸 한 줄: 시트에서 근무 추가용
    const rows = [], styles = [];
    rows.push([blockKey(weekStart, st), `${STORE[st].label}  ·  ${md(weekStart)} – ${md(end)}, ${end.slice(0, 4)}`, '', '', '', '', '', '', `앱에서 보냄 ${Utilities.formatDate(now, TZ, 'MMM d HH:mm')}`]);
    styles.push({row: 0, col: 1, cols: 7, bg: STORE[st].bg, bold: true, size: 12}, {row: 0, col: 8, cols: 1, color: '#888888', size: 9}, {row: 0, col: 0, cols: 1, color: '#bbbbbb', size: 8});
    rows.push([''].concat(dates.map(d => `${MONTHS3[Number(d.slice(5, 7)) - 1]}.${Number(d.slice(8))}`)));
    styles.push({row: 1, col: 1, cols: 7, bg: '#fff7c2', bold: true, align: 'center'});
    rows.push([''].concat(dates.map(d => DAYS_FULL[wd(d)])));
    styles.push({row: 2, col: 1, cols: 5, bold: true, align: 'center'}, {row: 2, col: 6, cols: 2, bold: true, color: '#d00000', italic: true, align: 'center'});
    for (let k = 0; k < slots; k++) {
      const tr = [''], hr = [''], nr = [''], base = rows.length;
      byDay.forEach((list, i) => {
        const s = list[k];
        if (!s) { tr.push(''); hr.push(''); nr.push(''); return; }
        tr.push(hmSpace(s.start_min, s.end_min) + (s.position ? ` ${s.position}` : ''));
        hr.push(r2((s.end_min - s.start_min) / 60));
        let nm = name(s.user_id), mark = '';
        if (s.user_id) {
          const tc = cards.filter(c => c.user_id === s.user_id && c.store_id === st && local(c.clock_in) === dates[i])[0];
          if (tc) { const late = localMin(tc.clock_in) - s.start_min; if (late > LATE_GRACE) mark = ` ⚠ ${late}m late`; }
          else if (dates[i] < today || (dates[i] === today && nowMin > s.start_min + 15)) mark = ' ✗ no-show';
        }
        nr.push(nm + mark);
        styles.push({row: base + 2, col: 1 + i, cols: 1, bg: s.user_id ? personColor(nm) : '#eeeeee'});
        if (mark) styles.push({row: base + 2, col: 1 + i, cols: 1, color: '#b00020', bold: true});
      });
      rows.push(tr, hr, nr);
      styles.push({row: base, col: 1, cols: 7, bold: true, align: 'center'}, {row: base + 1, col: 1, cols: 7, align: 'center', color: '#555555'}, {row: base + 2, col: 1, cols: 7, align: 'center'});
    }
    rows.push(['']);
    writeBlock(sh, blockKey(weekStart, st), rows, styles);
  });
  sh.setColumnWidth(1, 28); for (let c = 2; c <= 8; c++) sh.setColumnWidth(c, 150); sh.setColumnWidth(9, 220);
  return {tab: sh.getName(), stores: mine};
}

// ── 시트에서 고치면 앱에 반영 ──
// 스크립트 속성: TEAM_SHEET_SECRET (Supabase 비밀값과 같게), FUNCTION_URL (…/functions/v1/kream-team-sheet)
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kream 스케줄')
    .addItem('바뀐 스케줄 지금 앱에 반영', 'pushDirty')
    .addItem('이 블록 앱에 반영 (커서가 있는 곳)', 'pushCurrent')
    .addSeparator().addItem('자동 반영 켜기 (처음 한 번만)', 'installTriggers').addToUi();
}
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => { if (['onEditInstalled', 'pushDirty'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(scheduleSpreadsheet()).onEdit().create();
  ScriptApp.newTrigger('pushDirty').timeBased().everyMinutes(1).create();
  scheduleSpreadsheet().toast('자동 반영을 켰어요. 스케줄 칸을 고치면 1분 안에 앱에 반영돼요.');
}
function keyAbove(sh, row) {
  const top = Math.max(1, row - 80), vals = sh.getRange(top, 1, row - top + 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) { const v = String(vals[i][0]); if (v.indexOf('# ') === 0) return {key: v, row: top + i}; }
  return null;
}
function onEditInstalled(e) {
  const sh = e.range.getSheet();
  if (!/Schedule$/.test(sh.getName()) || e.range.getColumn() > 8) return;
  const k = keyAbove(sh, e.range.getRow());
  if (!k || e.range.getRow() < k.row + 3) return;
  const props = PropertiesService.getDocumentProperties(), dirty = JSON.parse(props.getProperty('dirty') || '{}');
  dirty[sh.getName() + '|' + k.key] = Date.now(); props.setProperty('dirty', JSON.stringify(dirty));
}
function pushCurrent() {
  const sh = SpreadsheetApp.getActiveSheet(), k = keyAbove(sh, sh.getActiveCell().getRow());
  if (!k) { scheduleSpreadsheet().toast('스케줄 블록 안을 눌러 주세요'); return; }
  scheduleSpreadsheet().toast(pushBlock(sh, k.key));
}
function pushDirty() {
  const lock = LockService.getDocumentLock(); if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getDocumentProperties(), dirty = JSON.parse(props.getProperty('dirty') || '{}');
    Object.keys(dirty).forEach(id => {
      if (Date.now() - dirty[id] < 20000) return;   // 아직 고치는 중이면 다음 번에
      const [tab, key] = [id.slice(0, id.indexOf('|')), id.slice(id.indexOf('|') + 1)], sh = scheduleSpreadsheet().getSheetByName(tab);
      if (sh && pushBlock(sh, key).indexOf('✅')===0) delete dirty[id];
    });
    props.setProperty('dirty', JSON.stringify(dirty));
  } finally { lock.releaseLock(); }
}
function parseRange(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[~\-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(.*)$/i);
  if (!m) return null;
  const t = (h, mi, ap) => { h = Number(h); mi = Number(mi || 0); if (ap) { h = h % 12 + (/p/i.test(ap) ? 12 : 0); } return h * 60 + mi; };
  let a = t(m[1], m[2], m[3]), b = t(m[4], m[5], m[6] || (m[3] && !m[6] && Number(m[4]) < Number(m[1]) ? 'pm' : ''));
  if (b === 0) b = 1440;
  return b > a && b <= 1440 ? {start_min: a, end_min: b, position: m[7].trim()} : null;
}
function pushBlock(sh, key) {
  const parts = key.split(' '), weekStart = parts[1], store = parts[2];
  const props = PropertiesService.getScriptProperties(), url = props.getProperty('FUNCTION_URL'), secret = props.getProperty('TEAM_SHEET_SECRET');
  const last = sh.getLastRow(), colA = sh.getRange(1, 1, last, 1).getValues().map(r => String(r[0]));
  const at = colA.indexOf(key) + 1; if (!at) return '블록을 못 찾았어요';
  let len = 1; while (at + len <= last && colA[at + len - 1].indexOf('#') !== 0) len++;
  const grid = sh.getRange(at, 1, len, 9).getValues(), shifts = [], bad = [];
  for (let r = 3; r + 2 < grid.length; r += 3) for (let c = 1; c <= 7; c++) {
    const time = String(grid[r][c]).trim(), nm = String(grid[r + 2][c]).trim();
    if (!time && !nm) continue;
    const t = parseRange(time);
    if (!t) { bad.push(`${md(ymdAdd(weekStart, c - 1))} “${time || '(시간 없음)'}”`); continue; }
    shifts.push({date: ymdAdd(weekStart, c - 1), start_min: t.start_min, end_min: t.end_min, position: t.position, name: nm});
  }
  const status = sh.getRange(at, 9);
  if(bad.length){status.setValue('⚠ 시간을 확인해 주세요. 앱은 변경하지 않았어요: '+bad.join(', '));return '시간 확인 필요';}
  if (!url || !secret) { status.setValue('⚠ 앱 반영 설정 전 (FUNCTION_URL / TEAM_SHEET_SECRET)'); return '설정이 필요해요'; }
  const r = UrlFetchApp.fetch(url, {method: 'post', contentType: 'application/json', headers: {'x-kream-sheet-secret': secret}, payload: JSON.stringify({store_id: store, week_start: weekStart, shifts}), muteHttpExceptions: true});
  const out = JSON.parse(r.getContentText() || '{}');
  // 시간수 줄은 시트에서도 바로 다시 계산
  for (let rr = 3; rr + 2 < grid.length; rr += 3) for (let c = 1; c <= 7; c++) { const t = parseRange(grid[rr][c]); sh.getRange(at + rr + 1, 1 + c).setValue(t ? r2((t.end_min - t.start_min) / 60) : ''); }
  const warn = (out.warnings || []).concat(bad.map(b => `${b}: 시간을 못 읽었어요 (예: 10:00 ~ 16:00)`));
  const msg = out.ok ? `✅ 앱에 반영 ${Utilities.formatDate(new Date(), TZ, 'MMM d HH:mm')} (${out.changed}개 바뀜)${warn.length ? '\n⚠ ' + warn.join('\n⚠ ') : ''}` : `⚠ 반영 실패: ${out.error || r.getResponseCode()}`;
  status.setValue(msg).setFontColor(warn.length || !out.ok ? '#b00020' : '#2e7d32').setWrap(true);
  return msg.split('\n')[0];
}

// ── 가능 시간 ──
function syncAvailability(token) {
  const ppl = people(token), avail = sb(token, 'kream_team_availability?select=*'), prefs = sb(token, 'kream_team_prefs?select=*');
  const sh = sheetNamed('Availability'), head = ['user_id', 'Name', 'Stores', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Wants hrs/wk', 'Max hrs/wk', 'Note', 'Updated'];
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efe9da'); sh.setFrozenRows(1); sh.hideColumns(1); }
  const ids = {}; avail.forEach(a => { ids[a.user_id] = 1; }); prefs.forEach(p => { ids[p.user_id] = 1; });
  const order = [1, 2, 3, 4, 5, 6, 0], stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  let n = 0;
  Object.keys(ids).forEach(id => {
    const p = ppl[id]; if (!p) return;
    const pr = prefs.filter(x => x.user_id === id)[0] || {};
    const cells = order.map(d => { const a = avail.filter(x => x.user_id === id && Number(x.weekday) === d)[0]; return !a ? '' : a.kind === 'none' ? '✗ not available' : a.kind === 'range' ? `${hm(a.start_min)}–${hm(a.end_min)}` : '✓ any time'; });
    const row = [id, p.name, p.stores.map(s => STORE[s].label).join(', ')].concat(cells, [pr.want_max ? 'As many as possible' : (pr.desired_hours == null ? '' : pr.desired_hours), pr.max_hours == null ? '' : pr.max_hours, pr.note || '', stamp]);
    const i = existing.indexOf(id), at = i >= 0 ? i + 2 : sh.getLastRow() + 1;
    sh.getRange(at, 1, 1, row.length).setValues([row]).setBackground(STORE[p.stores[0]].bg);
    if (i < 0) existing.push(id);
    n++;
  });
  return {people: n};
}

// ── 2주 급여 ──
function syncPayroll(token, from, to, tips) {
  const ppl = people(token);
  const cards = sb(token, `kream_team_timecards?select=*&clock_in=gte.${isoBound(ymdAdd(from, -1))}&clock_in=lt.${isoBound(ymdAdd(to, 2))}`).filter(c => { const d = local(c.clock_in); return d >= from && d <= to && STORES.indexOf(c.store_id) >= 0; });
  const shifts = sb(token, `kream_team_shifts?select=*&shift_date=gte.${from}&shift_date=lte.${to}`);
  const by = {};
  cards.forEach(c => {
    const r = by[c.user_id] = by[c.user_id] || {weeks: {}, hours: 0, late: 0, open: 0, stores: {}};
    const d = local(c.clock_in), h = worked(c), wk = weekStartOf(d);
    r.hours += h; r.weeks[wk] = (r.weeks[wk] || 0) + h; r.stores[c.store_id] = 1;
    if (!c.clock_out) r.open++;
    const s = shifts.filter(x => x.user_id === c.user_id && x.store_id === c.store_id && x.shift_date === d)[0];
    if (s && localMin(c.clock_in) - s.start_min > LATE_GRACE) r.late++;
  });
  const tipOf = n => tips.filter(t => t.name === n)[0] || {};
  const list = Object.keys(by).map(id => {
    const r = by[id], nm = (ppl[id] && ppl[id].name) || id, ot = Object.keys(r.weeks).reduce((a, k) => a + Math.max(0, r.weeks[k] - WEEK_OT), 0), tp = tipOf(nm);
    return [nm, Object.keys(r.stores).map(s => STORE[s].label).join(', '), r2(r.hours), r2(r.hours - ot), r2(ot), Number(tp.card) || 0, Number(tp.cash) || 0, r.late || '', r.open || ''];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const total = list.reduce((a, r) => [a[0] + r[2], a[1] + r[3], a[2] + r[4], a[3] + r[5], a[4] + r[6]], [0, 0, 0, 0, 0]);
  const key = `# PAY ${from}`;
  const rows = [[key, `Pay period ${md(from)} – ${md(to)}, ${to.slice(0, 4)}`, `updated ${Utilities.formatDate(new Date(), TZ, 'MMM d HH:mm')}`],
    ['Name', 'Stores', 'Total hours', 'Regular', 'Overtime (>44h/wk)', 'Card tips (payroll)', 'Cash tips (paid by hand)', 'Late', 'No clock-out']].concat(list,
    [['TOTAL', '', r2(total[0]), r2(total[1]), r2(total[2]), r2(total[3]), r2(total[4]), '', '']]);
  const styles = [{row: 0, bold: true, bg: '#3e4b33', color: '#ffffff', size: 12}, {row: 1, bold: true, bg: '#efe9da'}, {row: rows.length - 1, bold: true, bg: '#f6f2e6'}];
  list.forEach((r, i) => { if (r[8]) styles.push({row: 2 + i, col: 8, cols: 1, color: '#b00020', bold: true}); });
  const sh = sheetNamed('Payroll');
  writeBlock(sh, key, rows, styles);
  sh.getRange(1, 6, sh.getMaxRows(), 2).setNumberFormat('$#,##0.00');
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 170);
  return {people: list.length};
}
