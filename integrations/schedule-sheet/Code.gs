/**
 * Kream Ops Schedule 시트 연결 (📅 스케줄 페이지 → 구글 시트)
 * 시트: https://docs.google.com/spreadsheets/d/1GMTKRZKT6a2AoY3PQmQEaGrc_pHIPZkDfh1ufNbq7kw
 *
 * 앱이 {action, token, ...}을 보내면, 이 스크립트가 그 사람의 로그인 토큰으로 Supabase에서 직접 읽어서 써요.
 * → 앱에서 숫자를 보내지 않으니 시트에 가짜 시간을 넣을 수 없어요 (팁 금액만 매니저 앱에서 같이 와요).
 *
 *  syncWeek         (매니저) 그 주 스케줄을 '<월> Schedule' 탭에 매장별(색)로. 같은 주는 다시 쓰고, 새 주는 아래에 계속 쌓여요. 지각·안 옴 표시.
 *  syncAvailability (누구나) 'Availability' 탭에서 그 사람 줄만 바꿔요 (매니저가 보내면 매장 사람 모두).
 *  syncPayroll      (매니저) 'Payroll' 탭에 2주 급여 요약 (시간·정규·초과 44h/주·카드팁·현금팁·지각). 같은 기간은 다시 써요.
 *
 * 설치: 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자) → URL을 staff/team-data.mjs 의 SCHEDULE_SHEET_URL 에 넣기
 */
const SUPABASE_URL = 'https://imkhosgnkgwchoyrqczw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ISqCCHUBASP2sKEqEM04Lg_Jnft4D-y';   // 공개 키 (앱에도 있는 값). 권한은 사람 토큰 + RLS로 정해져요.
const TZ = 'America/Toronto';
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
    const profile = sb(body.token, `kream_profiles?user_id=eq.${me}&select=role,display_name,active`)[0] || {};
    const manager = profile.active && ['owner', 'manager'].indexOf(profile.role) >= 0;
    let out;
    if (body.action === 'syncWeek') { if (!manager) throw new Error('Manager access required'); out = syncWeek(body.token, body.week_start); }
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
function sheetNamed(name) { const ss = SpreadsheetApp.getActive(); return ss.getSheetByName(name) || ss.insertSheet(name); }

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
  (styles || []).forEach(s => { const r = sh.getRange(at + s.row, 1 + (s.col || 0), 1, s.cols || width); if (s.bg) r.setBackground(s.bg); if (s.bold) r.setFontWeight('bold'); if (s.color) r.setFontColor(s.color); if (s.size) r.setFontSize(s.size); });
  return at;
}

// ── 스케줄 (주마다 쌓기) ──
function syncWeek(token, weekStart) {
  weekStart = weekStartOf(weekStart);
  const end = ymdAdd(weekStart, 6), dates = [0, 1, 2, 3, 4, 5, 6].map(i => ymdAdd(weekStart, i));
  const ppl = people(token);
  const shifts = sb(token, `kream_team_shifts?select=*&published=eq.true&shift_date=gte.${weekStart}&shift_date=lte.${end}&order=start_min`);
  const cards = sb(token, `kream_team_timecards?select=*&clock_in=gte.${isoBound(ymdAdd(weekStart, -1))}&clock_in=lt.${isoBound(ymdAdd(end, 2))}`);
  const name = id => id ? ((ppl[id] && ppl[id].name) || '?') : 'OPEN (빈 근무)';
  const now = new Date(), today = local(now.toISOString()), nowMin = localMin(now.toISOString());
  const rows = [[`# WEEK ${weekStart}`, `Week of ${md(weekStart)} – ${md(end)}, ${end.slice(0, 4)}`, `updated ${Utilities.formatDate(now, TZ, 'MMM d HH:mm')}`]];
  const styles = [{row: 0, bold: true, bg: '#3e4b33', color: '#ffffff', size: 12}];
  rows.push(['Store', 'Name'].concat(dates.map(d => `${DAYS[wd(d)]} ${md(d)}`), ['Hours', 'Late']));
  styles.push({row: 1, bold: true, bg: '#efe9da'});
  STORES.forEach(st => {
    const list = shifts.filter(s => s.store_id === st);
    if (!list.length) return;
    const who = []; list.forEach(s => { const k = s.user_id || 'open'; if (who.indexOf(k) < 0) who.push(k); });
    who.sort((a, b) => name(a === 'open' ? null : a).localeCompare(name(b === 'open' ? null : b)));
    who.forEach(k => {
      const id = k === 'open' ? null : k; let hrs = 0, lates = 0;
      const cells = dates.map(d => list.filter(s => (s.user_id || null) === id && s.shift_date === d).map(s => {
        hrs += (s.end_min - s.start_min) / 60;
        let txt = `${hm(s.start_min)}–${hm(s.end_min)}${s.position ? ' ' + s.position : ''}`;
        if (id) {
          const tc = cards.filter(c => c.user_id === id && c.store_id === st && local(c.clock_in) === d)[0];
          if (tc) { const late = localMin(tc.clock_in) - s.start_min; if (late > LATE_GRACE) { txt += ` ⚠ late ${late}m`; lates++; } }
          else if (d < today || (d === today && nowMin > s.start_min + 15)) txt += ' ✗ no-show';
        }
        return txt;
      }).join('\n'));
      rows.push([STORE[st].label, name(id)].concat(cells, [r2(hrs), lates || '']));
      styles.push({row: rows.length - 1, bg: STORE[st].bg});
      if (lates) styles.push({row: rows.length - 1, col: 2 + 7 + 1, cols: 1, color: '#b00020', bold: true});
    });
  });
  if (rows.length === 2) rows.push(['', '(게시된 근무 없음)']);
  const sh = sheetNamed(monthTab(weekStart, 'Schedule'));
  writeBlock(sh, `# WEEK ${weekStart}`, rows, styles);
  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 130); for (let c = 3; c <= 9; c++) sh.setColumnWidth(c, 125);
  return {tab: sh.getName(), rows: rows.length - 2};
}

// ── 가능 시간 ──
function syncAvailability(token) {
  const ppl = people(token), avail = sb(token, 'kream_team_availability?select=*'), prefs = sb(token, 'kream_team_prefs?select=*');
  const sh = sheetNamed('Availability'), head = ['user_id', 'Name', 'Stores', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Max hrs/wk', 'Note', 'Updated'];
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#efe9da'); sh.setFrozenRows(1); sh.hideColumns(1); }
  const ids = {}; avail.forEach(a => { ids[a.user_id] = 1; }); prefs.forEach(p => { ids[p.user_id] = 1; });
  const order = [1, 2, 3, 4, 5, 6, 0], stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  let n = 0;
  Object.keys(ids).forEach(id => {
    const p = ppl[id]; if (!p) return;
    const pr = prefs.filter(x => x.user_id === id)[0] || {};
    const cells = order.map(d => { const a = avail.filter(x => x.user_id === id && Number(x.weekday) === d)[0]; return !a ? '' : a.kind === 'none' ? '✗ not available' : a.kind === 'range' ? `${hm(a.start_min)}–${hm(a.end_min)}` : '✓ any time'; });
    const row = [id, p.name, p.stores.map(s => STORE[s].label).join(', ')].concat(cells, [pr.max_hours == null ? '' : pr.max_hours, pr.note || '', stamp]);
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
