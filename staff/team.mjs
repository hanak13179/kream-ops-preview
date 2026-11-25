// 📅 스케줄 (1·3·4호점) — Homebase 같은 근무 관리
// 출퇴근(POS 100m 안에서만), 이번 주 스케줄(매장별 색), 매니저 스케줄 짜기(자동 채우기·게시),
// 가능 시간, 휴가(미리 신청), 교대·대타, 근무기록(지각·초과근무·CSV), 요청 승인, 매장 설정. 팁은 Cash$에서 이 출퇴근 시간으로 나눠요.
import {TEAM_STORES, STORE_COLORS, storeLabel, today, addDays, weekStart, weekDates, weekday, fmtTime, fmtRange, fmtDate, dayName, timeValue, parseTime,
  shiftHours, shiftIssues, autoSchedule, copyWeek, availability, onTimeOff, geoCheck, workedHours, onBreak, localParts, timesheet, timesheetCsv,
  lateMinutes, shiftStatus, zonedToISO, breakMinutes, DEFAULT_RADIUS, DEFAULT_NOTICE_DAYS, DEFAULT_MAX_HOURS, tcDate,
  lateRecord, clockOutReminder, payPeriod, payrollSummary, tipShiftsFromTimecards, LATE_STRONG, wantHours} from './team-logic.mjs?v=20261125-pr789';
import {splitTips} from './tip-split.mjs?v=20261123-tips1';
import {fetchTips} from './cash-count.mjs?v=20261125-pr789';
import {pushState, enablePush, disablePush, PUSH_TOPICS} from './push.mjs?v=20261125-live-push';
import {teamBackend, friendlyError, SCHEDULE_SHEET_URL, SCHEDULE_SHEET_LINK, newId} from './team-data.mjs?v=20261125-pr789';

const S = {tab: 'week', week: weekStart(today()), filter: 'all', mine: true, build: false, buildStore: null, edit: null, swapFor: null, punchMsg: null,
  msg: '', err: false, busy: false, data: null, api: null, clockStore: null, tsFrom: null, tsTo: null, tsStore: 'all', tcEdit: null, av: null, setStore: null, setDraft: null, fix: null, pay: null, push: null};
const MANAGER_ROLES = ['owner', 'manager', 'general_manager', 'manager_factory'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function ensureStyle() {
  if (document.getElementById('tmStyle')) return;
  const st = document.createElement('style'); st.id = 'tmStyle';
  st.textContent = `
.tm{max-width:880px;margin:0 auto;color:#2b2a26;font-size:15px}
.tm-card{background:#fff;border:1px solid #ebe4d3;border-radius:18px;padding:14px;margin:10px 0}
.tm h3{margin:0 0 8px;font-size:18px}.tm h4{margin:0 0 6px;font-size:15px}
.tm-banner{background:#fff7d6;border:1px solid #f0dc8a;border-radius:14px;padding:10px 12px;font-size:13px;margin:8px 0}
.tm-banner button{margin-left:6px}
.tm-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px 0 2px;scrollbar-width:none}
.tm-tabs button{flex:0 0 auto;border:1px solid #e4ddcc;background:#fff;border-radius:999px;padding:8px 12px;font-size:14px;font-weight:700;color:#4a463c}
.tm-tabs button.on{background:#3e4b33;color:#fff;border-color:#3e4b33}
.tm-badge{display:inline-block;min-width:18px;padding:0 5px;border-radius:9px;background:#d9534f;color:#fff;font-size:11px;line-height:18px;text-align:center;margin-left:4px}
.tm-btn{border:0;border-radius:14px;padding:10px 14px;font-size:15px;font-weight:700;background:#3e4b33;color:#fff;cursor:pointer}
.tm-btn.alt{background:#efe9da;color:#3b382f}.tm-btn.red{background:#c0392b}.tm-btn.small{padding:6px 10px;font-size:13px;border-radius:10px}
.tm-btn:disabled{opacity:.45}
.tm-big{width:100%;height:60px;font-size:20px;border-radius:18px}
.tm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tm-row>*{min-width:0}
.tm label.f{display:block;font-size:12px;font-weight:700;color:#6b6555;margin-top:6px}
.tm input,.tm select,.tm textarea{font:inherit;border:1px solid #e4ddcc;border-radius:10px;padding:8px;background:#fff;max-width:100%;box-sizing:border-box}
.tm label.f input,.tm label.f select,.tm label.f textarea{display:block;width:100%;margin-top:3px}
.tm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tm-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.tm-msg{font-size:14px;margin:8px 0;padding:10px 12px;border-radius:12px;background:#eef5e9}
.tm-msg.err{background:#fdecea;color:#8a1c12}.tm-msg.warn{background:#fff3cd;color:#7a5800}
.tm-alert{border-radius:14px;padding:12px;margin-top:10px;font-weight:700}
.tm-alert.far{background:#fdecea;color:#8a1c12;border:2px solid #e57368}.tm-alert.late{background:#fff3cd;color:#7a5800;border:2px solid #f0c24b}.tm-alert.ok{background:#e8f5e3;color:#2d5a1f}
.tm-rule{font-size:13px;color:#6b6555;margin-top:8px}
.tm-week{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tm-week b{font-size:16px}
.tm-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.tm-chip{border:2px solid transparent;border-radius:999px;padding:5px 11px;font-size:13px;font-weight:700;cursor:pointer;background:#f3efe4}
.tm-chip.on{border-color:#3b382f}
.tm-day{border-top:1px solid #efe9da;padding:8px 0}
.tm-day.today h4{color:#3e4b33}.tm-day.today h4:after{content:' • 오늘';font-size:12px;color:#5fa463}
.tm-shift{border-radius:12px;padding:8px 10px;margin:5px 0;cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:center}
.tm-shift.mine{box-shadow:inset 0 0 0 2px #3b382f}
.tm-shift.draft{opacity:.75;background-image:repeating-linear-gradient(45deg,transparent 0 8px,rgba(255,255,255,.55) 8px 16px)}
.tm-shift .who{font-weight:700}.tm-shift small{color:#5c574a}
.tm-tag{display:inline-block;font-size:11px;font-weight:800;border-radius:7px;padding:2px 6px;margin:2px 2px 0 0;background:rgba(255,255,255,.75)}
.tm-tag.late{background:#f6c343;color:#5c3f00}.tm-tag.noshow{background:#c0392b;color:#fff}.tm-tag.on{background:#2e7d32;color:#fff}.tm-tag.issue{background:#fff;color:#a12a1e;border:1px solid #e3a59e}
.tm-off{font-size:12px;color:#6b6555;margin:3px 0}
.tm-table{width:100%;border-collapse:collapse;font-size:13px}.tm-table th,.tm-table td{padding:6px 4px;border-bottom:1px solid #efe9da;text-align:left;vertical-align:top}
.tm-table th{font-size:12px;color:#6b6555}
.tm-scroll{overflow-x:auto}
.tm-edit{background:#fbf9f3;border:2px solid #3e4b33}
.tm-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#5c574a}.tm-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:3px}
.tm-muted{color:#6b6555;font-size:13px}
details.tm-card summary{cursor:pointer;font-weight:700}
@media(max-width:520px){.tm-grid3{grid-template-columns:1fr 1fr}}
`;
  document.head.appendChild(st);
}

export async function renderTeam(host, c) {
  ensureStyle();
  const {t, esc} = c, lang = c.lang || 'ko';
  const stores = (c.stores || []).map(s => s.id).filter(id => TEAM_STORES.includes(id));
  if (!stores.length) { host.innerHTML = `<p class="empty">${t('스케줄은 1·3·4호점에서 써요.', 'Scheduling is for stores 1, 3 and 4.')}</p>`; return; }
  const role = c.profile?.role, manager = MANAGER_ROLES.includes(role) || !!c.profile?.store_manager || !!c.profile?.general_manager;
  if (!S.buildStore || !stores.includes(S.buildStore)) S.buildStore = stores.includes(c.store) ? c.store : stores[0];
  if (!S.clockStore || !stores.includes(S.clockStore)) S.clockStore = stores.includes(c.store) ? c.store : stores[0];
  if (!S.setStore || !stores.includes(S.setStore)) S.setStore = S.buildStore;
  if (!S.tsFrom) { S.tsFrom = addDays(weekStart(today()), -7); S.tsTo = addDays(weekStart(today()), -1); }
  host.innerHTML = `<div class="tm"><p class="tm-muted">${t('불러오는 중…', 'Loading…')}</p></div>`;
  let api;
  try { api = await teamBackend(c, stores); } catch (e) { host.innerHTML = `<div class="tm"><p class="tm-msg err">${esc(friendlyError(e, t))}</p></div>`; return; }
  S.api = api;
  const me = api.me;

  async function reload() {
    const from = [S.week, S.tsFrom].sort()[0], to = [addDays(S.week, 6), S.tsTo].sort().pop();
    S.data = await api.load({from, to});
    // 예시 모드: 직원은 게시된 근무만 보여요 (실제 DB에서는 서버가 걸러요)
    if (api.mode === 'demo' && !manager) S.data.shifts = S.data.shifts.filter(s => s.published);
  }
  try { await reload(); } catch (e) { host.innerHTML = `<div class="tm"><p class="tm-msg err">${esc(friendlyError(e, t))}</p></div>`; return; }

  const D = () => S.data;
  const person = id => D().people.find(p => p.id === id);
  const nameOf = id => id ? (person(id)?.name || t('알 수 없음', 'Unknown')) : t('빈 근무', 'Open shift');
  const storePeople = st => D().people.filter(p => p.stores.includes(st) && p.role !== 'owner');
  const colorOf = st => STORE_COLORS[st] || {bg: '#eee', line: '#999'};
  const settingsOf = st => D().settings[st] || {radius_m: DEFAULT_RADIUS, notice_days: DEFAULT_NOTICE_DAYS, needs: []};
  const say = (msg, err = false) => { S.msg = msg; S.err = err; draw(); };
  const tags = arr => arr.join('');
  const issueText = {timeoff: t('🌴 휴가', '🌴 Time off'), unavailable: t('✗ 안 되는 시간', '✗ Unavailable'), overlap: t('⧉ 겹침', '⧉ Overlap'), overmax: t('⏱ 시간 초과', '⏱ Over max hours')};
  const flagText = {open: t('퇴근 안 함', 'No clock-out'), late: t('늦음', 'Late'), unscheduled: t('스케줄 없음', 'Unscheduled'), far: t('위치 밖', 'Outside'), edited: t('수정됨', 'Edited'), nobreak: t('5시간+ 휴식 없음', '5h+ no break')};
  async function run(fn, okMsg) {
    if (S.busy) return; S.busy = true; S.msg = ''; draw();
    try { const r = await fn(); await reload(); S.busy = false; if (okMsg) say(typeof okMsg === 'function' ? okMsg(r) : okMsg); else draw(); }
    catch (e) { S.busy = false; try { await reload(); } catch { /* 그대로 */ } say(friendlyError(e, t), true); }
  }
  async function sheet(what, week, extra = {}) {
    try { const r = await api.syncSheet(what, week, extra); return r?.skipped ? '' : t(' · 📄 시트에도 저장했어요', ' · 📄 Saved to the sheet too'); }
    catch { return t(' · ⚠ 시트 저장은 안 됐어요 (다시 시도)', ' · ⚠ Sheet update failed (try again)'); }
  }

  // ── 출퇴근 ──────────────────────────────────────────
  function getPos() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(Error('Location required'));
      navigator.geolocation.getCurrentPosition(p => res({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}),
        e => rej(Error(e.code === 1 ? 'LOCATION_DENIED' : 'Location required')), {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
    });
  }
  const myCard = () => D().timecards.find(tc => tc.user_id === me && !tc.clock_out);
  const myLates = () => D().timecards.filter(tc => tc.user_id === me && tcDate(tc) >= addDays(today(), -30)).map(tc => ({tc, late: lateMinutes(tc, D().shifts)})).filter(x => x.late);
  function clockHtml() {
    const card = myCard(), st = card ? card.store_id : S.clockStore, set = settingsOf(st), radius = set.radius_m || DEFAULT_RADIUS;
    const todays = D().shifts.filter(s => s.user_id === me && s.date === today()).sort((a, b) => a.start_min - b.start_min);
    const unset = !(Number.isFinite(set.lat) && Number.isFinite(set.lng));
    let body;
    if (card) {
      const br = onBreak(card);
      body = `<p style="margin:0 0 8px">🟢 <b>${t('근무 중', 'Clocked in')}</b> · ${esc(storeLabel(card.store_id, lang))} · ${esc(fmtTime(localParts(card.clock_in).min, lang))}${t('부터', ' start')} · <b>${workedHours(card)}h</b>${br ? ` · ☕ ${t('휴식 중', 'On break')}` : ''}</p>
        <div class="tm-grid2"><button class="tm-btn alt tm-big" data-act="punch" data-k="${br ? 'break_end' : 'break_start'}" ${S.busy ? 'disabled' : ''}>${br ? t('☕ 휴식 끝', '☕ End break') : t('☕ 휴식 시작', '☕ Start break')}</button>
        <button class="tm-btn red tm-big" data-act="punch" data-k="out" ${S.busy ? 'disabled' : ''}>${t('퇴근하기', 'Clock out')}</button></div>`;
    } else {
      body = `${todays.length ? `<p style="margin:0 0 8px">${t('오늘 근무', 'Today')}: ${todays.map(s => `<b>${esc(fmtRange(s.start_min, s.end_min, lang))}</b> ${esc(storeLabel(s.store_id, lang))}`).join(', ')}</p>` : `<p class="tm-muted" style="margin:0 0 8px">${t('오늘 스케줄된 근무가 없어요', 'No shift scheduled today')}</p>`}
        ${stores.length > 1 ? `<label class="f">${t('매장', 'Store')}<select data-in="clockStore">${stores.map(s => `<option value="${s}" ${s === S.clockStore ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label>` : ''}
        <button class="tm-btn tm-big" style="margin-top:8px" data-act="punch" data-k="in" ${S.busy ? 'disabled' : ''}>${S.busy ? t('위치 확인 중…', 'Checking location…') : t('출근하기', 'Clock in')}</button>`;
    }
    const pm = S.punchMsg;
    return `<div class="tm-card" style="border-left:6px solid ${colorOf(st).line}"><h3>⏱ ${t('출퇴근', 'Time clock')}</h3>${body}
      <p class="tm-rule">📍 ${t(`출근은 ${storeLabel(st, lang)} POS에서 ${radius}m 안에서만 돼요. 멀리 있으면 출근이 안 되고 경고가 떠요.`, `Clock-in only works within ${radius} m of the ${storeLabel(st, lang)} POS. If you are too far, it is blocked with a warning.`)}</p>
      ${unset ? `<p class="tm-msg warn">${manager ? t('⚠ 이 매장 POS 위치가 아직 없어요. ⚙ 설정에서 POS 옆에 서서 “지금 여기로 정하기”를 눌러 주세요. 그 전에는 위치 확인 없이 출근돼요.', '⚠ This store’s POS location is not set yet. In ⚙ Settings, stand next to the POS and tap “Use my location”. Until then clock-in is not location-checked.') : t('이 매장 위치가 아직 정해지지 않아서 지금은 위치 확인 없이 출근돼요.', 'Store location is not set yet, so clock-in is not location-checked for now.')}</p>` : ''}
      ${pm ? `<div class="tm-alert ${pm.kind}">${esc(pm.text)}</div>` : ''}</div>`;
  }
  async function punch(kind) {
    if (S.busy) return;
    const card = myCard(), st = card ? card.store_id : S.clockStore;
    S.busy = true; S.punchMsg = null; draw();
    let pos = null;
    try { pos = await getPos(); }
    catch (e) {
      if (kind === 'in') { S.busy = false; S.punchMsg = {kind: 'far', text: e.message === 'LOCATION_DENIED' ? t('🚫 위치 권한이 꺼져 있어요. 브라우저/폰 설정에서 이 사이트의 위치를 허용한 뒤 다시 눌러 주세요.', '🚫 Location is blocked. Allow location for this site in your browser/phone settings, then try again.') : t('🚫 위치를 못 찾았어요. 잠시 후 다시 눌러 주세요.', '🚫 Could not get your location. Please try again.')}; draw(); return; }
    }
    if (kind === 'in') {
      const g = geoCheck(settingsOf(st), pos);
      if (!g.ok) {
        S.busy = false;
        S.punchMsg = {kind: 'far', text: g.reason === 'fuzzy'
          ? t(`🚫 GPS가 부정확해요 (±${g.acc}m, 지금 ${g.dist}m로 보여요). 창가나 문 쪽으로 가서 다시 눌러 주세요. 출근은 POS에서 ${g.radius}m 안에서만 돼요.`, `🚫 GPS is inaccurate (±${g.acc} m, shows ${g.dist} m away). Move near a window or the door and try again. Clock-in only works within ${g.radius} m of the POS.`)
          : t(`🚫 너무 멀어요! 매장 POS에서 ${g.dist}m 떨어져 있어요. 출근은 ${g.radius}m 안에서만 돼요. 매장에 도착해서 다시 눌러 주세요.`, `🚫 Too far! You are ${g.dist} m from the store POS. Clock-in only works within ${g.radius} m. Please try again when you arrive.`)};
        draw(); return;
      }
    }
    try {
      await api.punch(st, kind, pos);
      await reload();
      S.busy = false;
      if (kind === 'in') {
        const tc = myCard(), late = tc ? lateMinutes(tc, D().shifts) : 0;
        const rec = lateRecord(D().timecards, D().shifts, me, today());
        S.punchMsg = late ? {kind: rec.level === 2 ? 'far' : 'late', text: rec.level === 2
          ? t(`🚨 ${late}분 늦게 출근했어요. 최근 30일에 ${rec.count}번째 지각이에요. 계속 늦으면 매니저 면담이 있을 수 있어요. 꼭 시간 맞춰 와 주세요.`, `🚨 You clocked in ${late} min late. That is ${rec.count} late arrivals in 30 days. Repeated lateness may lead to a talk with your manager. Please be on time.`)
          : t(`⚠ 스케줄보다 ${late}분 늦게 출근했어요. 스케줄에 ‘늦음’으로 표시되고 매니저가 확인해요. 다음엔 시간 맞춰 와 주세요!`, `⚠ You clocked in ${late} min late. It shows as “Late” on the schedule and your manager will see it. Please be on time next time!`)}
          : {kind: 'ok', text: t('✅ 출근했어요. 오늘도 화이팅!', '✅ Clocked in. Have a great shift!')};
      } else S.punchMsg = {kind: 'ok', text: kind === 'out' ? t('✅ 퇴근했어요. 수고했어요!', '✅ Clocked out. Thanks for today!') : kind === 'break_start' ? t('☕ 휴식 시작', '☕ Break started') : t('휴식 끝 · 다시 근무 중', 'Break ended')};
      draw();
    } catch (e) { S.busy = false; try { await reload(); } catch { /* */ } S.punchMsg = {kind: 'far', text: '🚫 ' + friendlyError(e, t)}; draw(); }
  }
  function latesHtml() {
    const out = [], rem = clockOutReminder(myCard(), D().shifts);
    if (rem) out.push(`<div class="tm-alert far">⏰ ${rem.reason === 'after_shift' ? t(`퇴근 찍는 거 잊지 마세요! 스케줄이 ${fmtTime(rem.shift.end_min, lang)}에 끝났는데 아직 근무 중으로 되어 있어요.`, `Don’t forget to clock out! Your shift ended at ${fmtTime(rem.shift.end_min, lang)} but you are still clocked in.`) : t(`퇴근 찍는 거 잊지 마세요! ${rem.hours}시간째 근무 중으로 되어 있어요.`, `Don’t forget to clock out! You have been clocked in for ${rem.hours} hours.`)} ${t('이미 퇴근했다면 퇴근을 누르고, ⏱ 내 출퇴근에서 시간 고치기를 요청해 주세요.', 'If you already left, clock out and request a time fix in ⏱ My punches.')}</div>`);
    const r = lateRecord(D().timecards, D().shifts, me, today());
    if (r.level === 2) out.push(`<div class="tm-alert far">🚨 ${t(`최근 30일에 ${r.count}번 늦게 출근했어요. 계속 늦으면 매니저 면담이 있을 수 있어요.`, `You were late ${r.count} times in the last 30 days. Repeated lateness may lead to a talk with your manager.`)}<br><small>${r.list.slice(-6).map(x => `${esc(fmtDate(x.date, lang))} ${x.late}${t('분', 'm')}`).join(' · ')}</small></div>`);
    else if (r.level === 1) out.push(`<div class="tm-msg warn">⚠ ${t(`최근 30일에 ${r.count}번 늦게 출근했어요`, `You were late ${r.count} time(s) in the last 30 days`)}: ${r.list.map(x => `${esc(fmtDate(x.date, lang))} ${x.late}${t('분', 'm')}`).join(', ')}</div>`);
    return out.join('');
  }

  // ── 🔔 알림 (직원) ───────────────────────────────────
  function pushCard() {
    const P = S.push;
    if (!P) { pushState(c).then(x => { S.push = x; if (S.tab === 'mytime') draw(); }).catch(() => { S.push = {supported: false}; }); return ''; }
    const mine = PUSH_TOPICS.filter(x => x.roles.includes('staff'));
    return `<div class="tm-card"><h4>🔔 ${t('폰 알림', 'Phone notifications')}</h4><p class="tm-muted">${t('근무 2시간 전, 퇴근 안 찍었을 때, 쉬프트 마켓에 새 근무, 새 스케줄, 내 요청 결과를 알려줘요.', 'Shift in 2 hours, forgot to clock out, new market shifts, new schedule, request results.')}</p>
      ${!P.supported ? `<p class="tm-msg warn">${esc(P.why || t('이 기기·브라우저는 알림을 못 받아요.', 'This device/browser cannot receive notifications.'))}</p>` : P.enabled
        ? `${mine.map(x => `<label style="display:flex;gap:8px;align-items:center;padding:3px 0"><input type="checkbox" data-topic="${x.key}" ${P.topics?.includes(x.key) ? 'checked' : ''} style="width:auto"> ${t(x.ko, x.en)}</label>`).join('')}<div class="tm-row" style="margin-top:8px"><button class="tm-btn small" data-act="pushSave">${t('저장', 'Save')}</button><button class="tm-btn alt small" data-act="pushOff">${t('끄기', 'Turn off')}</button></div>`
        : `<button class="tm-btn" data-act="pushOn">🔔 ${t('이 폰에서 알림 켜기', 'Turn on for this phone')}</button>`}
      <p class="tm-muted">${t('아이폰은 사파리 → 공유 → “홈 화면에 추가”로 앱을 설치한 뒤, 그 앱에서 켜 주세요.', 'iPhone: Safari → Share → Add to Home Screen, then turn on inside that app.')}</p></div>`;
  }

  // ── 내 출퇴근 · 시간 고치기 요청 ─────────────────────
  const fixStatus = {pending: t('⏳ 매니저 확인 중', '⏳ Manager reviewing'), approved: t('✅ 적용됨', '✅ Applied'), denied: t('❌ 거절', '❌ Denied'), cancelled: t('취소됨', 'Cancelled')};
  function myTimeHtml() {
    const cards = D().timecards.filter(tc => tc.user_id === me && tcDate(tc) >= addDays(today(), -31)).sort((a, b) => b.clock_in.localeCompare(a.clock_in));
    const fixes = (D().fixes || []).filter(f => f.user_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const tm = v => v ? fmtTime(localParts(v).min, lang) : '—';
    const f = S.fix;
    const form = f ? `<div class="tm-card tm-edit"><h4>${f.timecard_id ? t('출퇴근 시간 고치기 요청', 'Request a time fix') : t('빠진 출퇴근 요청', 'Request a missing punch')}</h4>
      <div class="tm-grid2"><label class="f">${t('날짜', 'Date')}<input type="date" data-fx="date" value="${f.date}" max="${today()}" min="${addDays(today(), -31)}"></label>
      <label class="f">${t('매장', 'Store')}<select data-fx="store" ${f.timecard_id ? 'disabled' : ''}>${stores.map(st => `<option value="${st}" ${st === f.store_id ? 'selected' : ''}>${esc(storeLabel(st, lang))}</option>`).join('')}</select></label></div>
      <div class="tm-grid3"><label class="f">${t('출근', 'In')}<input type="time" data-fx="in" value="${timeValue(f.in)}"></label><label class="f">${t('퇴근', 'Out')}<input type="time" data-fx="out" value="${f.out == null ? '' : timeValue(f.out)}"></label><label class="f">${t('휴식(분)', 'Break (min)')}<input type="number" min="0" max="240" data-fx="brk" value="${f.brk}"></label></div>
      <label class="f">${t('이유 (꼭 적기)', 'Reason (required)')}<input data-fx="reason" maxlength="200" value="${esc(f.reason || '')}" placeholder="${t('예: 출근 찍는 걸 잊었어요', 'e.g. forgot to clock in')}"></label>
      <p class="tm-msg warn" style="margin:8px 0">ℹ️ ${t('보낸 시간은 매니저가 확인(검증)한 뒤에 적용돼요. 승인 전에는 원래 기록으로 급여가 계산돼요.', 'Management will verify these hours before they are applied. Until approved, payroll uses the original punch.')}</p>
      <div class="tm-row"><button class="tm-btn" data-act="fixSend" ${S.busy ? 'disabled' : ''}>${t('요청 보내기', 'Send request')}</button><button class="tm-btn alt" data-act="fixCancelForm">${t('취소', 'Cancel')}</button></div></div>` : '';
    return `<div class="tm-card"><h3>⏱ ${t('내 출퇴근 기록', 'My punches')}</h3>
      <p class="tm-muted">${t('시간이 틀렸거나 찍는 걸 잊었으면 고치기를 요청해 주세요. 매니저가 확인한 뒤에 적용돼요.', 'If a time is wrong or you forgot to punch, request a fix. Management verifies it before it is applied.')}</p>
      <button class="tm-btn alt" data-act="fixNew">➕ ${t('빠진 출퇴근 요청', 'Request a missing punch')}</button></div>
      ${form}
      <div class="tm-card">${cards.map(tc => { const late = lateMinutes(tc, D().shifts), pend = fixes.find(x => x.timecard_id === tc.id && x.status === 'pending'); return `<div class="tm-row" style="justify-content:space-between;border-left:4px solid ${colorOf(tc.store_id).line};background:${colorOf(tc.store_id).bg};border-radius:8px;padding:6px 8px;margin:4px 0">
        <span>${esc(fmtDate(tcDate(tc), lang))} · ${esc(storeLabel(tc.store_id, lang))} · ${esc(tm(tc.clock_in))}–${esc(tm(tc.clock_out))} · <b>${workedHours(tc)}h</b>${late ? ` <span class="tm-tag late">⚠ ${late}${t('분 늦음', 'm late')}</span>` : ''}${tc.edited_at || tc.source === 'manager' ? ` <span class="tm-tag">${t('수정됨', 'Edited')}</span>` : ''}</span>
        ${pend ? `<span class="tm-tag">${fixStatus.pending}</span>` : `<button class="tm-btn alt small" data-act="fixFor" data-id="${esc(tc.id)}">${t('시간 고치기 요청', 'Request fix')}</button>`}</div>`; }).join('') || `<p class="tm-muted">${t('최근 31일 기록이 없어요', 'No punches in the last 31 days')}</p>`}</div>
      ${pushCard()}
      <div class="tm-card"><h4>${t('내 고치기 요청', 'My fix requests')}</h4>${fixes.map(x => `<div class="tm-row" style="justify-content:space-between;border-top:1px solid #efe9da;padding:6px 0"><span>${esc(fmtDate(localParts(x.new_in).date, lang))} · ${esc(storeLabel(x.store_id, lang))} · ${esc(tm(x.new_in))}–${esc(tm(x.new_out))}${x.break_min ? ` · ☕${x.break_min}${t('분', 'm')}` : ''} · “${esc(x.reason)}”</span><span>${fixStatus[x.status] || x.status}${x.status === 'pending' ? ` <button class="tm-btn alt small" data-act="fixCancel" data-id="${x.id}">${t('취소', 'Cancel')}</button>` : ''}</span></div>`).join('') || `<p class="tm-muted">${t('아직 없어요', 'None yet')}</p>`}</div>`;
  }

  // ── 스케줄 (이번 주) ─────────────────────────────────
  const weekLabel = () => { const a = S.week, b = addDays(S.week, 6); return `${fmtDate(a, lang)} – ${fmtDate(b, lang)}`; };
  const pendingSwap = id => D().swaps.find(w => w.shift_id === id && ['open', 'accepted'].includes(w.status));
  function shiftChip(s, {build = false} = {}) {
    // 지각·안 옴·근무 중은 본인과 매니저(운영진)만 봐요
    const col = colorOf(s.store_id), st = manager || s.user_id === me ? shiftStatus(s, D().timecards) : {status: ''}, tg = [];
    if (!s.published) tg.push(`<span class="tm-tag">${t('초안', 'Draft')}</span>`);
    if (!s.user_id) tg.push(`<span class="tm-tag">${t('빈 근무', 'Open')}</span>`);
    if (st.late) tg.push(`<span class="tm-tag late">⚠ ${st.late}${t('분 늦음', 'm late')}</span>`);
    if (st.status === 'late_nocard') tg.push(`<span class="tm-tag late">⚠ ${t('아직 출근 안 함', 'Not clocked in yet')}</span>`);
    if (st.status === 'noshow') tg.push(`<span class="tm-tag noshow">✗ ${t('안 옴', 'No-show')}</span>`);
    if (st.status === 'working') tg.push(`<span class="tm-tag on">● ${t('근무 중', 'On shift')}</span>`);
    const pw = pendingSwap(s.id);
    if (pw) tg.push(`<span class="tm-tag">${pw.status === 'open' ? '🛒 ' + t('마켓에 올림', 'On the market') : '🔁 ' + t('교환 대기', 'Swap pending')}</span>`);
    const canSwap = !build && s.user_id === me && s.date >= today() && s.published && !pw && st.status !== 'working';
    if (build) shiftIssues(s, {shifts: D().shifts, availabilityRows: D().availability, timeOff: D().timeOff, prefs: D().prefs}).forEach(i => tg.push(`<span class="tm-tag issue">${issueText[i]}</span>`));
    return `<div class="tm-shift ${s.user_id === me ? 'mine' : ''} ${s.published ? '' : 'draft'}" style="background:${col.bg};border-left:5px solid ${col.line}" data-act="${build ? 'editShift' : 'shift'}" data-id="${esc(s.id)}">
      <div><div><b>${esc(fmtRange(s.start_min, s.end_min, lang))}</b> · <span class="who">${esc(nameOf(s.user_id))}</span></div>
      <small>${esc(storeLabel(s.store_id, lang))}${s.position ? ' · ' + esc(s.position) : ''} · ${shiftHours(s)}h${s.note ? ' · ' + esc(s.note) : ''}</small><div>${tags(tg)}</div></div>
      ${canSwap ? `<button class="tm-btn small" style="flex:0 0 auto;background:#fff;color:#3b382f;border:1px solid ${col.line}" data-act="shift" data-id="${esc(s.id)}">🔁 ${t('교환하기', 'Swap')}</button>` : ''}</div>`;
  }
  function legendHtml(only) {
    return `<div class="tm-legend">${(only || stores).map(s => `<span><i style="background:${colorOf(s).bg};border:1px solid ${colorOf(s).line}"></i>${esc(storeLabel(s, lang))}</span>`).join('')}<span>⚠ ${t('늦음', 'late')}</span><span>✗ ${t('안 옴', 'no-show')}</span></div>`;
  }
  function weekNav() {
    return `<div class="tm-week"><button class="tm-btn alt small" data-act="wk" data-d="-7">◀</button><b>${esc(weekLabel())}</b><button class="tm-btn alt small" data-act="wk" data-d="7">▶</button></div>
      ${S.week !== weekStart(today()) ? `<div style="text-align:center;margin-top:4px"><button class="tm-btn alt small" data-act="wk" data-d="0">${t('이번 주로', 'This week')}</button></div>` : ''}`;
  }
  function swapPanel(s) {
    if (!s) return '';
    const mine = s.user_id === me, sw = pendingSwap(s.id);
    if (s.date < today()) return '';
    if (sw) return `<div class="tm-card tm-edit"><b>🔁 ${t('교대 요청 중이에요', 'Swap already requested')}</b> · ${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))}
      ${(sw.from_user === me || (!sw.from_user && sw.to_user === me)) ? `<div style="margin-top:8px"><button class="tm-btn alt small" data-act="swapCancel" data-id="${sw.id}">${t('요청 취소', 'Cancel request')}</button></div>` : ''}</div>`;
    if (mine) {
      const others = storePeople(s.store_id).filter(p => p.id !== me);
      return `<div class="tm-card tm-edit"><h4>🔁 ${t('이 근무 교환하기', 'Swap this shift')}</h4><p class="tm-muted" style="margin:0">${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))} · ${esc(storeLabel(s.store_id, lang))}</p>
        <label class="f">${t('누구에게', 'Who')}<select id="tmSwapTo"><option value="">🛒 ${t('쉬프트 마켓에 올리기 (1·3·4호점 누구나)', 'Post to the shift market (anyone, stores 1·3·4)')}</option>${others.map(p => `<option value="${esc(p.id)}">${esc(p.name)} ${availability(D().availability, p.id, s.date, s.start_min, s.end_min) === 'no' ? t('(안 되는 시간)', '(unavailable)') : ''}</option>`).join('')}</select></label>
        <label class="f">${t('메모', 'Note')}<input id="tmSwapNote" maxlength="200" placeholder="${t('예: 병원 예약', 'e.g. doctor appointment')}"></label>
        <div class="tm-row" style="margin-top:8px"><button class="tm-btn" data-act="swapOffer" data-id="${esc(s.id)}">${t('올리기 / 보내기', 'Post / send')}</button><button class="tm-btn alt" data-act="closeSwap">${t('닫기', 'Close')}</button></div>
        <p class="tm-muted">${settingsOf(s.store_id).swap_approval ? t('누가 수락하면 매니저가 승인한 뒤에 그 사람 근무가 돼요. 그 전까지는 내 근무예요.', 'When someone accepts, a manager approves before it becomes theirs. Until then it is still yours.') : t('누가 수락하면 바로 그 사람 근무가 돼요. 그 전까지는 내 근무라 꼭 나와야 해요.', 'As soon as someone accepts, it becomes theirs. Until then it is still yours, so you still need to come in.')}</p></div>`;
    }
    if (!s.user_id && stores.includes(s.store_id)) return `<div class="tm-card tm-edit"><h4>🙋 ${t('이 빈 근무를 할까요?', 'Take this open shift?')}</h4><p class="tm-muted" style="margin:0">${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))} · ${esc(storeLabel(s.store_id, lang))}</p>
      <div class="tm-row" style="margin-top:8px"><button class="tm-btn" data-act="swapOffer" data-id="${esc(s.id)}">${t('제가 할게요 (요청)', 'I’ll take it (request)')}</button><button class="tm-btn alt" data-act="closeSwap">${t('닫기', 'Close')}</button></div></div>`;
    return '';
  }
  function weekHtml() {
    const dates = weekDates(S.week);
    const shown = D().shifts.filter(s => s.date >= S.week && s.date <= dates[6] && (S.filter === 'all' || s.store_id === S.filter) && (!S.mine || s.user_id === me));
    const offs = D().timeOff.filter(o => o.status === 'approved');
    const chips = `<div class="tm-chips"><span class="tm-chip ${S.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">${t('전체', 'All')}</span>${stores.map(s => `<span class="tm-chip ${S.filter === s ? 'on' : ''}" style="background:${colorOf(s).bg}" data-act="filter" data-v="${s}">${esc(storeLabel(s, lang))}</span>`).join('')}
      <span class="tm-chip ${S.mine ? 'on' : ''}" data-act="mine">👤 ${t('내 근무만', 'Only mine')}</span></div>`;
    const myHours = D().shifts.filter(s => s.user_id === me && s.date >= S.week && s.date <= dates[6]).reduce((a, s) => a + shiftHours(s), 0);
    return `<div class="tm-card">${weekNav()}${chips}
      ${manager ? `<button class="tm-btn" style="width:100%;margin-bottom:8px" data-act="build">🛠 ${t('스케줄 짜기 (매니저)', 'Build schedule (managers)')}</button>` : ''}
      <p class="tm-muted" style="margin:4px 0">${t(`이번 주 내 근무 ${Math.round(myHours * 100) / 100}시간`, `My hours this week: ${Math.round(myHours * 100) / 100}`)} · ${t('못 하는 날은 🔁 교환하기로 쉬프트 마켓에 올려요', 'Can’t make it? Tap 🔁 Swap to post it to the shift market')}</p>
      ${legendHtml()}
      ${swapPanel(D().shifts.find(s => s.id === S.swapFor))}
      ${(S.mine || S.filter !== 'all' ? [null] : stores).map(st => {
        const part = st ? shown.filter(s => s.store_id === st) : shown;
        const head = st ? `<div style="margin:14px 0 2px;padding:8px 12px;border-radius:12px;background:${colorOf(st).bg};border-left:6px solid ${colorOf(st).line};font-weight:800">${esc(storeLabel(st, lang))} <small class="tm-muted" style="font-weight:600">· ${part.length}${t('개 근무', ' shifts')}</small></div>` : '';
        return head + dates.map(d => {
          const list = part.filter(s => s.date === d).sort((a, b) => a.start_min - b.start_min || a.store_id.localeCompare(b.store_id));
          const off = offs.filter(o => o.start_date <= d && d <= o.end_date && (manager || o.user_id === me) && (!st || D().people.find(p => p.id === o.user_id)?.stores.includes(st)));
          return `<div class="tm-day ${d === today() ? 'today' : ''}"><h4>${esc(fmtDate(d, lang))}</h4>${list.map(s => shiftChip(s)).join('') || `<p class="tm-off">${t('근무 없음', 'No shifts')}</p>`}
            ${off.map(o => `<p class="tm-off">🌴 ${esc(nameOf(o.user_id))} ${t('휴가', 'time off')}</p>`).join('')}</div>`;
        }).join('');
      }).join('')}</div>`;
  }

  // ── 스케줄 짜기 (매니저) ─────────────────────────────
  function buildHtml() {
    const st = S.buildStore, dates = weekDates(S.week), col = colorOf(st);
    const wk = D().shifts.filter(s => s.store_id === st && s.date >= S.week && s.date <= dates[6]);
    const drafts = wk.filter(s => !s.published).length, needs = settingsOf(st).needs || [];
    const ppl = storePeople(st);
    const weekAll = D().shifts.filter(s => s.date >= S.week && s.date <= dates[6]);
    const rows = ppl.map(p => {
      const mine = weekAll.filter(s => s.user_id === p.id), hrs = mine.reduce((a, s) => a + shiftHours(s), 0), max = Number(D().prefs[p.id]?.max_hours) || DEFAULT_MAX_HOURS;
      const iss = new Set(mine.flatMap(s => shiftIssues(s, {shifts: D().shifts, availabilityRows: D().availability, timeOff: D().timeOff, prefs: D().prefs})));
      const avail = WEEK_ORDER.map(wd => { const a = D().availability.find(x => x.user_id === p.id && Number(x.weekday) === wd); return !a ? '' : a.kind === 'none' ? `${dayName(wd, lang)}✗` : a.kind === 'range' ? `${dayName(wd, lang)} ${fmtRange(a.start_min, a.end_min, lang)}` : ''; }).filter(Boolean).join(', ');
      const want = wantHours(D().prefs[p.id]), wl = D().prefs[p.id]?.want_max ? '💪 ' + t('최대한', 'max') : (D().prefs[p.id]?.desired_hours ? `${want}h` : '–');
      return `<tr><td><b>${esc(p.name)}</b>${mine.some(s => s.store_id !== st) ? `<br><small class="tm-muted">${t('다른 매장 근무 포함', 'incl. other stores')}</small>` : ''}</td><td>${Math.round(hrs * 100) / 100}h<br><small class="tm-muted">${t('원함', 'wants')} ${esc(wl)} · ${t('최대', 'max')} ${max}</small></td><td><small>${esc(avail || t('언제든', 'Any time'))}</small></td><td>${[...iss].map(i => `<span class="tm-tag issue">${issueText[i]}</span>`).join('')}</td></tr>`;
    }).join('');
    return `<div class="tm-card" style="border-top:8px solid ${col.line}">
      <div class="tm-row" style="justify-content:space-between"><h3 style="margin:0">🛠 ${t('스케줄 짜기', 'Build schedule')}</h3><button class="tm-btn alt small" data-act="unbuild">← ${t('스케줄 보기', 'Back to schedule')}</button></div>
      <label class="f">${t('매장', 'Store')}<select data-in="buildStore">${stores.map(s => `<option value="${s}" ${s === st ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label>
      <div style="margin-top:8px">${weekNav()}</div>
      <div class="tm-grid2" style="margin-top:10px">
        <button class="tm-btn" data-act="auto" ${S.busy ? 'disabled' : ''}>✨ ${t('자동으로 채우기', 'Auto-fill')}</button>
        <button class="tm-btn alt" data-act="copyLast" ${S.busy ? 'disabled' : ''}>📋 ${t('지난주 복사', 'Copy last week')}</button>
        <button class="tm-btn alt" data-act="addShift">➕ ${t('근무 추가', 'Add shift')}</button>
        <button class="tm-btn alt" data-act="clearDrafts" ${drafts && !S.busy ? '' : 'disabled'}>🗑 ${t('초안 지우기', 'Clear drafts')}</button>
      </div>
      <button class="tm-btn" style="width:100%;margin-top:8px;background:#2e7d32" data-act="publish" ${drafts && !S.busy ? '' : 'disabled'}>📤 ${t(`게시하기 · 직원에게 보여요 (${drafts}개)`, `Publish · staff can see it (${drafts})`)}</button>
      <p class="tm-muted">${needs.length ? t(`자동 채우기는 ⚙ 설정의 ‘필요 인원’(${needs.length}줄)대로 채워요. 가능 시간·휴가·주 최대 시간·다른 매장 근무를 지키고, 각자 원하는 시간을 참고해서 공평하게 나눠요 (💪 최대한 많이 원하는 사람은 더 받아요).`, `Auto-fill uses ‘Staffing needs’ in ⚙ Settings (${needs.length} rows). It respects availability, time off, max hours and other-store shifts, and spreads hours evenly.`) : t('⚙ 설정에서 ‘필요 인원’을 먼저 정해 주세요.', 'Set ‘Staffing needs’ in ⚙ Settings first.')}</p>
      ${editHtml()}
      ${dates.map(d => {
        const list = wk.filter(s => s.date === d).sort((a, b) => a.start_min - b.start_min);
        const off = D().timeOff.filter(o => o.status === 'approved' && o.start_date <= d && d <= o.end_date && ppl.some(p => p.id === o.user_id));
        return `<div class="tm-day ${d === today() ? 'today' : ''}"><div class="tm-row" style="justify-content:space-between"><h4>${esc(fmtDate(d, lang))}</h4><button class="tm-btn alt small" data-act="addShift" data-d="${d}">＋</button></div>
          ${list.map(s => shiftChip(s, {build: true})).join('') || `<p class="tm-off">${t('근무 없음', 'No shifts')}</p>`}${off.map(o => `<p class="tm-off">🌴 ${esc(nameOf(o.user_id))} ${t('휴가', 'time off')}</p>`).join('')}</div>`;
      }).join('')}
      <h4 style="margin-top:12px">👥 ${t('이번 주 시간', 'Hours this week')}</h4>
      <div class="tm-scroll"><table class="tm-table"><thead><tr><th>${t('이름', 'Name')}</th><th>${t('이번 주', 'This week')}</th><th>${t('가능 시간', 'Availability')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="4">${t('이 매장 직원이 없어요', 'No staff on this store')}</td></tr>`}</tbody></table></div></div>`;
  }
  function editHtml() {
    const e = S.edit;
    if (!e) return '';
    const ppl = storePeople(S.buildStore), dates = weekDates(S.week);
    const opt = p => {
      const a = availability(D().availability, p.id, e.date, e.start_min, e.end_min), off = onTimeOff(D().timeOff, p.id, e.date);
      const hrs = D().shifts.filter(s => s.user_id === p.id && s.id !== e.id && s.date >= S.week && s.date <= dates[6]).reduce((x, s) => x + shiftHours(s), 0);
      return `<option value="${esc(p.id)}" ${e.user_id === p.id ? 'selected' : ''}>${off ? '🌴' : a === 'no' ? '✗' : a === 'yes' ? '✓' : '·'} ${esc(p.name)} (${Math.round(hrs * 10) / 10}h)</option>`;
    };
    return `<div class="tm-card tm-edit"><h4>${e.id ? t('근무 고치기', 'Edit shift') : t('근무 추가', 'Add shift')}</h4>
      <div class="tm-grid3"><label class="f">${t('날짜', 'Day')}<select data-ed="date">${dates.map(d => `<option value="${d}" ${d === e.date ? 'selected' : ''}>${esc(fmtDate(d, lang))}</option>`).join('')}</select></label>
      <label class="f">${t('시작', 'Start')}<input type="time" step="900" data-ed="start" value="${timeValue(e.start_min)}"></label>
      <label class="f">${t('끝', 'End')}<input type="time" step="900" data-ed="end" value="${timeValue(e.end_min)}"></label></div>
      <label class="f">${t('직원', 'Person')} <small>(✓ ${t('가능', 'available')} · ✗ ${t('안 됨', 'unavailable')} · 🌴 ${t('휴가', 'off')})</small><select data-ed="user"><option value="">— ${t('빈 근무 (직원이 가져가기)', 'Open shift (staff can claim)')} —</option>${ppl.map(opt).join('')}</select></label>
      <div class="tm-grid2"><label class="f">${t('포지션', 'Position')}<input data-ed="position" maxlength="40" value="${esc(e.position || '')}" placeholder="${t('예: 바리스타, 오픈', 'e.g. Barista, Open')}"></label>
      <label class="f">${t('메모', 'Note')}<input data-ed="note" maxlength="200" value="${esc(e.note || '')}"></label></div>
      <div class="tm-row" style="margin-top:10px"><button class="tm-btn" data-act="saveShift" ${S.busy ? 'disabled' : ''}>${t('저장', 'Save')}</button>${e.id ? `<button class="tm-btn red" data-act="delShift">${t('삭제', 'Delete')}</button>` : ''}<button class="tm-btn alt" data-act="cancelEdit">${t('취소', 'Cancel')}</button></div>
      ${e.published ? `<p class="tm-muted">${t('이미 게시된 근무예요. 저장하면 바로 직원에게 바뀐 내용이 보여요.', 'Already published. Changes show to staff right away.')}</p>` : ''}</div>`;
  }

  // ── 가능 시간 ───────────────────────────────────────
  function availHtml() {
    if (!S.av) {
      const mine = D().availability.filter(a => a.user_id === me);
      S.av = {rows: Object.fromEntries(WEEK_ORDER.map(wd => { const a = mine.find(x => Number(x.weekday) === wd); return [wd, a ? {kind: a.kind, start_min: a.start_min ?? 600, end_min: a.end_min ?? 1320} : {kind: 'all', start_min: 600, end_min: 1320}]; })),
        max: D().prefs[me]?.max_hours ?? '', note: D().prefs[me]?.note || '', want: D().prefs[me]?.desired_hours ?? '', wantMax: !!D().prefs[me]?.want_max};
    }
    const r = S.av.rows;
    const mineForm = `<div class="tm-card"><h3>🙋 ${t('내 가능 시간', 'My availability')}</h3><p class="tm-muted">${t('매주 일할 수 있는 시간을 적어 주세요. 매니저가 스케줄을 짤 때 이대로 맞춰요. 바뀌면 언제든 고쳐요.', 'Tell us when you can work each week. Managers schedule around it. Update any time.')}</p>
      ${WEEK_ORDER.map(wd => `<div class="tm-row" style="margin:6px 0"><b style="width:34px">${dayName(wd, lang)}</b>
        <select data-av="kind" data-wd="${wd}"><option value="all" ${r[wd].kind === 'all' ? 'selected' : ''}>${t('언제든', 'Any time')}</option><option value="range" ${r[wd].kind === 'range' ? 'selected' : ''}>${t('시간 지정', 'Between')}</option><option value="none" ${r[wd].kind === 'none' ? 'selected' : ''}>${t('안 돼요', 'Not available')}</option></select>
        ${r[wd].kind === 'range' ? `<input type="time" step="900" data-av="start" data-wd="${wd}" value="${timeValue(r[wd].start_min)}">–<input type="time" step="900" data-av="end" data-wd="${wd}" value="${timeValue(r[wd].end_min)}">` : ''}</div>`).join('')}
      <h4 style="margin-top:12px">⏱ ${t('일주일에 일하고 싶은 시간', 'Hours I want per week')}</h4>
      <div class="tm-grid2"><label class="f">${t('원하는 시간', 'Hours I’d like')}<input type="number" min="0" max="80" step="1" data-av="want" value="${esc(S.av.want)}" placeholder="${t('예: 25', 'e.g. 25')}" ${S.av.wantMax ? 'disabled' : ''}></label>
      <label class="f" style="display:flex;gap:8px;align-items:center;margin-top:22px"><input type="checkbox" data-av="wantMax" ${S.av.wantMax ? 'checked' : ''} style="width:auto">💪 ${t('최대한 많이 일하고 싶어요!', 'As many hours as possible!')}</label></div>
      <p class="tm-muted" style="margin:4px 0 0">${t('자동 스케줄이 이 시간을 참고해서 더 주거나 덜 줘요. 꼭 맞춰지는 건 아니고, 모두에게 공평하게 나눠요.', 'Auto-scheduling uses this to give you more or fewer hours. It isn’t guaranteed, and hours are shared fairly.')}</p>
      <div class="tm-grid2"><label class="f">${t('주 최대 시간 (이보다 많이는 안 돼요)', 'Max hours / week (hard limit)')}<input type="number" min="0" max="80" data-av="max" value="${esc(S.av.max)}" placeholder="${DEFAULT_MAX_HOURS}"></label>
      <label class="f">${t('메모 (학교 등)', 'Note (school etc.)')}<input data-av="note" maxlength="200" value="${esc(S.av.note)}"></label></div>
      <button class="tm-btn" style="margin-top:10px;width:100%" data-act="saveAvail" ${S.busy ? 'disabled' : ''}>${t('저장', 'Save')}</button></div>`;
    if (!manager) return mineForm;
    const st = S.buildStore;
    const table = `<div class="tm-card"><h3>👥 ${t('직원 가능 시간', 'Team availability')}</h3>
      <label class="f">${t('매장', 'Store')}<select data-in="buildStore">${stores.map(s => `<option value="${s}" ${s === st ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label>
      <div class="tm-scroll"><table class="tm-table"><thead><tr><th>${t('이름', 'Name')}</th>${WEEK_ORDER.map(wd => `<th>${dayName(wd, lang)}</th>`).join('')}<th>${t('원함', 'Wants')}</th><th>${t('최대', 'Max')}</th></tr></thead><tbody>
      ${storePeople(st).map(p => `<tr style="background:${colorOf(st).bg}55"><td><b>${esc(p.name)}</b>${D().prefs[p.id]?.note ? `<br><small>${esc(D().prefs[p.id].note)}</small>` : ''}</td>${WEEK_ORDER.map(wd => { const a = D().availability.find(x => x.user_id === p.id && Number(x.weekday) === wd); return `<td>${!a ? '<span class="tm-muted">–</span>' : a.kind === 'none' ? '✗' : a.kind === 'range' ? `<small>${esc(fmtRange(a.start_min, a.end_min, lang))}</small>` : '✓'}</td>`; }).join('')}<td>${D().prefs[p.id]?.want_max ? '💪' : esc(D().prefs[p.id]?.desired_hours ?? '–')}</td><td>${esc(D().prefs[p.id]?.max_hours ?? '')}</td></tr>`).join('')}
      </tbody></table></div><p class="tm-muted">✓ ${t('언제든', 'any time')} · ✗ ${t('안 돼요', 'not available')} · – ${t('아직 안 적음 (언제든으로 봐요)', 'not set (treated as any time)')}</p></div>`;
    return mineForm + table;
  }

  // ── 휴가 ────────────────────────────────────────────
  function offHtml() {
    const need = Math.max(0, ...stores.map(s => Number(settingsOf(s).notice_days ?? DEFAULT_NOTICE_DAYS)));
    const earliest = addDays(today(), need);
    const mine = D().timeOff.filter(o => o.user_id === me).sort((a, b) => b.start_date.localeCompare(a.start_date));
    const st = {pending: t('⏳ 대기', '⏳ Pending'), approved: t('✅ 승인', '✅ Approved'), denied: t('❌ 거절', '❌ Denied'), cancelled: t('취소됨', 'Cancelled')};
    return `<div class="tm-card"><h3>🌴 ${t('휴가 신청', 'Request time off')}</h3>
      <p class="tm-muted">${t(`최소 ${need}일 전에 신청해야 해요 (가장 빠른 날: ${fmtDate(earliest, lang)}). 급한 일은 매니저에게 직접 연락해 주세요.`, `Requests need ${need} days notice (earliest: ${fmtDate(earliest, lang)}). For emergencies, contact your manager directly.`)}</p>
      <div class="tm-grid2"><label class="f">${t('시작', 'From')}<input type="date" id="tmOffFrom" min="${earliest}" value="${earliest}"></label><label class="f">${t('끝', 'To')}<input type="date" id="tmOffTo" min="${earliest}" value="${earliest}"></label></div>
      <label class="f">${t('사유 (선택)', 'Reason (optional)')}<input id="tmOffWhy" maxlength="200"></label>
      <button class="tm-btn" style="margin-top:10px;width:100%" data-act="reqOff" ${S.busy ? 'disabled' : ''}>${t('신청하기', 'Send request')}</button></div>
      <div class="tm-card"><h4>${t('내 신청', 'My requests')}</h4>${mine.map(o => `<div class="tm-row" style="justify-content:space-between;border-top:1px solid #efe9da;padding:6px 0"><span>${esc(fmtDate(o.start_date, lang))}${o.end_date !== o.start_date ? ' – ' + esc(fmtDate(o.end_date, lang)) : ''} ${o.reason ? '· ' + esc(o.reason) : ''}</span><span>${st[o.status] || o.status}${['pending', 'approved'].includes(o.status) && o.start_date > today() ? ` <button class="tm-btn alt small" data-act="cancelOff" data-id="${o.id}">${t('취소', 'Cancel')}</button>` : ''}</span></div>`).join('') || `<p class="tm-muted">${t('아직 없어요', 'None yet')}</p>`}</div>`;
  }

  // ── 🛒 쉬프트 마켓 (1·3·4호점 통합) ─────────────────
  function swapsHtml() {
    const shift = id => D().shifts.find(s => s.id === id);
    const chip = st => `<span style="background:${colorOf(st).bg};border:1px solid ${colorOf(st).line};border-radius:7px;padding:1px 7px;font-weight:700;font-size:12px">${esc(storeLabel(st, lang))}</span>`;
    const stTxt = {open: t('🛒 마켓에 올라가 있어요', '🛒 On the market'), accepted: t('매니저 승인 대기', 'Waiting for manager'), approved: t('✅ 넘어갔어요', '✅ Taken'), denied: t('❌ 거절', '❌ Denied'), cancelled: t('취소됨', 'Cancelled')};
    const busyAt = m => D().shifts.some(x => x.user_id === me && x.date === m.date && x.start_min < m.end_min && m.start_min < x.end_min);
    const market = (D().market || []).filter(m => m.from_user !== me && (S.mkStore === 'all' || !S.mkStore || m.store_id === S.mkStore));
    const mine = D().swaps.filter(w => w.from_user === me || w.to_user === me).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const days = [...new Set(market.map(m => m.date))];
    return `<div class="tm-card"><h3>🛒 ${t('쉬프트 마켓', 'Shift market')}</h3>
      <p class="tm-muted">${t('1·3·4호점에서 일하기 어려운 근무가 여기 올라와요. “제가 할게요”를 누르면 내 근무가 돼요. 다른 지점 근무도 가져갈 수 있어요.', 'Shifts people can’t work at stores 1·3·4 show up here. Tap “I’ll take it” and it becomes yours, even at another store.')}</p>
      <div class="tm-chips"><span class="tm-chip ${!S.mkStore || S.mkStore === 'all' ? 'on' : ''}" data-act="mk" data-v="all">${t('전체 지점', 'All stores')}</span>${TEAM_STORES.map(st => `<span class="tm-chip ${S.mkStore === st ? 'on' : ''}" style="background:${colorOf(st).bg}" data-act="mk" data-v="${st}">${esc(storeLabel(st, lang))}</span>`).join('')}</div>
      ${days.map(d => `<h4 style="margin:12px 0 4px">${esc(fmtDate(d, lang))}</h4>${market.filter(m => m.date === d).map(m => { const busy = busyAt(m); return `<div class="tm-shift" style="background:${colorOf(m.store_id).bg};border-left:5px solid ${colorOf(m.store_id).line};cursor:default">
        <div><div>${chip(m.store_id)} <b>${esc(fmtRange(m.start_min, m.end_min, lang))}</b> · ${(m.end_min - m.start_min) / 60}h${m.position ? ' · ' + esc(m.position) : ''}</div>
        <small>${m.from_user ? `${t('올린 사람', 'Posted by')}: ${esc(m.from_name || nameOf(m.from_user))}` : t('빈 근무 (매니저가 올림)', 'Open shift (from manager)')}${m.note ? ` · “${esc(m.note)}”` : ''}</small></div>
        <button class="tm-btn small" style="flex:0 0 auto" data-act="${m.swap_id ? 'swapAccept' : 'swapOffer'}" data-id="${esc(m.swap_id || m.shift_id)}" ${busy || S.busy ? 'disabled' : ''}>${busy ? t('그때 근무 있음', 'You work then') : t('제가 할게요', 'I’ll take it')}</button></div>`; }).join('')}`).join('') || `<p class="tm-muted">${t('지금 올라온 근무가 없어요', 'Nothing on the market right now')}</p>`}</div>
      <div class="tm-card"><h4>📤 ${t('내가 올린 근무 · 가져간 근무', 'My posts and pickups')}</h4><p class="tm-muted">${t('📅 스케줄에서 내 근무의 “🔁 교환하기”를 눌러 마켓에 올려요.', 'Tap “🔁 Swap” on your shift in 📅 Schedule to post it.')}</p>
      ${mine.map(w => { const s = shift(w.shift_id); return `<div class="tm-row" style="justify-content:space-between;border-top:1px solid #efe9da;padding:6px 0"><span>${s ? `${chip(s.store_id)} ${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))}` : t('(지난 근무)', '(past shift)')} · ${w.from_user === me ? (w.to_user ? `→ ${esc(nameOf(w.to_user))}` : t('내가 올림', 'posted by me')) : t('내가 가져감', 'I took it')}</span><span>${stTxt[w.status] || w.status}${['open', 'accepted'].includes(w.status) && (w.from_user === me || !w.from_user) ? ` <button class="tm-btn alt small" data-act="swapCancel" data-id="${w.id}">${t('내리기', 'Take down')}</button>` : ''}</span></div>`; }).join('') || `<p class="tm-muted">${t('아직 없어요', 'None yet')}</p>`}</div>`;
  }

  // ── 요청 (매니저) ───────────────────────────────────
  const managedPeople = () => new Set(D().people.filter(p => p.stores.some(s => stores.includes(s))).map(p => p.id));
  const pendingOff = () => D().timeOff.filter(o => o.status === 'pending' && managedPeople().has(o.user_id));
  const pendingFixes = () => (D().fixes || []).filter(f => f.status === 'pending' && stores.includes(f.store_id));
  const pendingSwaps = () => D().swaps.filter(w => w.status === 'accepted' && D().shifts.some(s => s.id === w.shift_id && stores.includes(s.store_id)));
  function requestsHtml() {
    const shift = id => D().shifts.find(s => s.id === id);
    const offs = pendingOff(), sws = pendingSwaps(), fixes = pendingFixes();
    const tm = v => v ? fmtTime(localParts(v).min, lang) : '—';
    const repeat = D().people.filter(p => p.stores.some(x => stores.includes(x))).map(p => ({p, r: lateRecord(D().timecards, D().shifts, p.id, today())})).filter(x => x.r.count).sort((a, b) => b.r.count - a.r.count);
    return `<div class="tm-card"><h3>🕐 ${t('출퇴근 고치기 요청', 'Punch fix requests')}</h3><p class="tm-muted">${t('직원이 보낸 시간을 확인하고 승인하면 근무기록·급여에 적용돼요. 원래 기록은 따로 남아요.', 'Verify the hours. Approving applies them to timesheets and payroll; the original is kept in the audit log.')}</p>${fixes.map(f => {
        const orig = f.timecard_id ? D().timecards.find(tc => tc.id === f.timecard_id) : null;
        const sched = D().shifts.find(x => x.user_id === f.user_id && x.store_id === f.store_id && x.date === localParts(f.new_in).date);
        return `<div style="border-top:1px solid #efe9da;padding:8px 0;border-left:4px solid ${colorOf(f.store_id).line};padding-left:8px"><b>${esc(nameOf(f.user_id))}</b> · ${esc(storeLabel(f.store_id, lang))} · ${esc(fmtDate(localParts(f.new_in).date, lang))}<br>
          ${orig ? `${t('원래', 'Was')}: ${esc(tm(orig.clock_in))}–${esc(tm(orig.clock_out))} → ` : `<span class="tm-tag">${t('빠진 기록', 'Missing punch')}</span> `}<b>${esc(tm(f.new_in))}–${esc(tm(f.new_out))}</b>${f.break_min ? ` · ☕${f.break_min}${t('분', 'm')}` : ''}${sched ? ` <small>(${t('스케줄', 'sched')} ${esc(fmtRange(sched.start_min, sched.end_min, lang))})</small>` : ` <small>(${t('스케줄 없음', 'no shift')})</small>`}<br>“${esc(f.reason)}”
          <div class="tm-row" style="margin-top:6px"><button class="tm-btn small" data-act="decideFix" data-id="${f.id}" data-yes="1">${t('확인 · 적용', 'Verify & apply')}</button><button class="tm-btn alt small" data-act="decideFix" data-id="${f.id}" data-yes="0">${t('거절', 'Deny')}</button></div></div>`;
      }).join('') || `<p class="tm-muted">${t('대기 중인 요청이 없어요', 'No pending requests')}</p>`}</div>
      ${repeat.length ? `<div class="tm-card"><h3>⚠ ${t('지각 (최근 30일)', 'Lateness (last 30 days)')}</h3>${repeat.map(({p, r}) => `<div class="tm-row" style="justify-content:space-between;border-top:1px solid #efe9da;padding:6px 0"><span><b>${esc(p.name)}</b> · ${r.list.slice(-5).map(x => `${esc(fmtDate(x.date, lang))} ${x.late}${t('분', 'm')}`).join(', ')}</span><span class="tm-tag ${r.level === 2 ? 'noshow' : 'late'}">${r.count}${t('번', 'x')}${r.level === 2 ? ' · ' + t('반복', 'repeat') : ''}</span></div>`).join('')}<p class="tm-muted">${t(`${LATE_STRONG}번 이상이면 직원 화면에 빨간 경고가 떠요.`, `At ${LATE_STRONG}+ the employee sees a red warning.`)}</p></div>` : ''}
      <div class="tm-card"><h3>🌴 ${t('휴가 요청', 'Time-off requests')}</h3>${offs.map(o => {
        const clash = D().shifts.filter(s => s.user_id === o.user_id && s.date >= o.start_date && s.date <= o.end_date);
        return `<div style="border-top:1px solid #efe9da;padding:8px 0"><b>${esc(nameOf(o.user_id))}</b> · ${esc(fmtDate(o.start_date, lang))}${o.end_date !== o.start_date ? ' – ' + esc(fmtDate(o.end_date, lang)) : ''}${o.reason ? ` · “${esc(o.reason)}”` : ''}
          ${clash.length ? `<p class="tm-msg warn" style="margin:6px 0">${t('이 기간에 근무가 있어요', 'Has shifts in this period')}: ${clash.map(s => `${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))} ${esc(storeLabel(s.store_id, lang))}`).join(', ')} — ${t('승인 후 스케줄에서 바꿔 주세요', 'adjust the schedule after approving')}</p>` : ''}
          <div class="tm-row"><button class="tm-btn small" data-act="decideOff" data-id="${o.id}" data-yes="1">${t('승인', 'Approve')}</button><button class="tm-btn alt small" data-act="decideOff" data-id="${o.id}" data-yes="0">${t('거절', 'Deny')}</button></div></div>`;
      }).join('') || `<p class="tm-muted">${t('대기 중인 요청이 없어요', 'No pending requests')}</p>`}</div>
      <div class="tm-card"><h3>🔁 ${t('교대 승인', 'Swap approvals')}</h3>${sws.map(w => { const s = shift(w.shift_id); return `<div style="border-top:1px solid #efe9da;padding:8px 0"><span style="background:${colorOf(s.store_id).bg};border-radius:6px;padding:1px 6px">${esc(storeLabel(s.store_id, lang))}</span> ${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))}<br><b>${esc(w.from_user ? nameOf(w.from_user) : t('빈 근무', 'Open shift'))}</b> → <b>${esc(nameOf(w.to_user))}</b>${w.note ? ` · “${esc(w.note)}”` : ''}
          ${shiftIssues({...s, user_id: w.to_user}, {shifts: D().shifts, availabilityRows: D().availability, timeOff: D().timeOff, prefs: D().prefs}).map(i => `<span class="tm-tag issue">${issueText[i]}</span>`).join('')}
          <div class="tm-row" style="margin-top:6px"><button class="tm-btn small" data-act="decideSwap" data-id="${w.id}" data-yes="1">${t('승인', 'Approve')}</button><button class="tm-btn alt small" data-act="decideSwap" data-id="${w.id}" data-yes="0">${t('거절', 'Deny')}</button></div></div>`; }).join('') || `<p class="tm-muted">${t('대기 중인 교대가 없어요', 'No pending swaps')}</p>`}</div>`;
  }

  // ── 근무기록 (매니저) ───────────────────────────────
  function tsRows() {
    const inStore = x => S.tsStore === 'all' ? stores.includes(x.store_id) : x.store_id === S.tsStore;
    return timesheet({timecards: D().timecards.filter(inStore), shifts: D().shifts.filter(inStore), people: D().people, from: S.tsFrom, to: S.tsTo});
  }
  function tsHtml() {
    const rows = tsRows(), e = S.tcEdit;
    const tm = v => v ? fmtTime(localParts(v).min, lang) : '—';
    const presets = [[t('이번 주', 'This week'), weekStart(today()), addDays(weekStart(today()), 6)], [t('지난주', 'Last week'), addDays(weekStart(today()), -7), addDays(weekStart(today()), -1)], [t('지난 2주', 'Last 2 weeks'), addDays(weekStart(today()), -14), addDays(weekStart(today()), -1)]];
    const late = rows.reduce((a, r) => a + r.cards.filter(c => c.flags.includes('late')).length, 0);
    return `<div class="tm-card"><h3>🧾 ${t('근무기록', 'Timesheets')}</h3>
      <div class="tm-row">${presets.map(([l, a, b]) => `<button class="tm-btn ${S.tsFrom === a && S.tsTo === b ? '' : 'alt'} small" data-act="tsPreset" data-a="${a}" data-b="${b}">${l}</button>`).join('')}</div>
      <div class="tm-grid3"><label class="f">${t('시작', 'From')}<input type="date" data-in="tsFrom" value="${S.tsFrom}"></label><label class="f">${t('끝', 'To')}<input type="date" data-in="tsTo" value="${S.tsTo}"></label>
      <label class="f">${t('매장', 'Store')}<select data-in="tsStore"><option value="all">${t('전체', 'All')}</option>${stores.map(s => `<option value="${s}" ${S.tsStore === s ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label></div>
      <div class="tm-row" style="margin-top:8px"><button class="tm-btn alt small" data-act="tcAdd">➕ ${t('빠진 기록 넣기', 'Add missing punch')}</button><button class="tm-btn alt small" data-act="csv">⬇ CSV (${t('급여용', 'payroll')})</button></div>
      ${late ? `<p class="tm-msg warn">⚠ ${t(`이 기간에 늦은 출근 ${late}번`, `${late} late clock-in(s) in this period`)}</p>` : ''}
      <p class="tm-muted">${t('초과근무 = 한 주(월~일) 44시간 넘는 시간 (온타리오). 💵 팁은 Cash$ → 팁 나누기에서 이 시간으로 나눠요.', 'Overtime = hours over 44 in a Mon–Sun week (Ontario). 💵 Tips are split by these hours in Cash$ → Split tips.')}</p></div>
      ${payrollHtml()}
      ${e ? tcEditHtml(e) : ''}
      <div class="tm-card tm-scroll"><table class="tm-table"><thead><tr><th>${t('이름', 'Name')}</th><th>${t('시간', 'Hours')}</th><th>${t('정규', 'Reg')}</th><th>OT</th><th>${t('스케줄', 'Sched')}</th><th>⚠</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.hours}</td><td>${r.regular}</td><td>${r.overtime || ''}</td><td>${r.scheduled}</td><td>${r.flags || ''}</td></tr>
        <tr><td colspan="6" style="padding-top:0"><details><summary class="tm-muted">${t('자세히', 'Details')} (${r.cards.length})</summary>${r.cards.map(cd => `<div class="tm-row" style="justify-content:space-between;border-left:4px solid ${colorOf(cd.store_id).line};background:${colorOf(cd.store_id).bg};border-radius:8px;padding:6px 8px;margin:4px 0">
          <span>${esc(fmtDate(cd.date, lang))} · ${esc(tm(cd.clock_in))}–${esc(tm(cd.clock_out))}${breakMinutes(cd) ? ` · ☕${Math.round(breakMinutes(cd))}${t('분', 'm')}` : ''} · <b>${cd.hours}h</b>${cd.shift ? ` <small>(${t('스케줄', 'sched')} ${esc(fmtRange(cd.shift.start_min, cd.shift.end_min, lang))})</small>` : ''}<br>${cd.flags.map(f => `<span class="tm-tag ${f === 'late' ? 'late' : f === 'open' || f === 'far' ? 'noshow' : ''}">${f === 'late' ? `⚠ ${lateMinutes(cd, D().shifts)}${t('분 늦음', 'm late')}` : esc(flagText[f] || f)}</span>`).join('')}${cd.note ? `<small> · ${esc(cd.note)}</small>` : ''}</span>
          <button class="tm-btn alt small" data-act="tcEdit" data-id="${esc(cd.id)}">${t('고치기', 'Edit')}</button></div>`).join('')}</details></td></tr>`).join('') || `<tr><td colspan="6">${t('이 기간 기록이 없어요', 'No records in this period')}</td></tr>`}
      </tbody></table></div>`;
  }
  function payrollHtml() {
    if (!S.pay) S.pay = {...payPeriod(addDays(today(), -14)), tips: null, tipNote: '', rows: null};
    const P = S.pay, cur = payPeriod(today()), prev = payPeriod(addDays(cur.from, -1));
    const money = n => '$' + (Number(n) || 0).toFixed(2);
    const rows = P.rows;
    return `<details class="tm-card" ${rows ? 'open' : ''}><summary>💰 ${t('2주 급여 요약 (Payroll)', 'Biweekly payroll summary')}</summary>
      <div class="tm-row" style="margin-top:8px"><button class="tm-btn ${P.from === prev.from ? '' : 'alt'} small" data-act="payPeriod" data-a="${prev.from}">${t('지난 급여 기간', 'Last pay period')} ${esc(fmtDate(prev.from, lang))}–${esc(fmtDate(prev.to, lang))}</button>
      <button class="tm-btn ${P.from === cur.from ? '' : 'alt'} small" data-act="payPeriod" data-a="${cur.from}">${t('이번 기간 (진행 중)', 'Current (in progress)')}</button></div>
      <button class="tm-btn" style="width:100%;margin-top:8px" data-act="payCalc" ${S.busy ? 'disabled' : ''}>${t('계산하기 (근무시간 + 팁)', 'Calculate (hours + tips)')}</button>
      ${rows ? `<div class="tm-scroll"><table class="tm-table" style="margin-top:8px"><thead><tr><th>${t('이름', 'Name')}</th><th>${t('시간', 'Hours')}</th><th>${t('정규', 'Reg')}</th><th>OT</th><th>${t('카드 팁', 'Card tips')}</th><th>${t('현금 팁', 'Cash tips')}</th><th>⚠</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b><br><small>${r.stores.map(x => esc(storeLabel(x, lang))).join(', ')}</small></td><td>${r.hours}</td><td>${r.regular}</td><td>${r.overtime || ''}</td><td>${money(r.card_tips)}</td><td>${money(r.cash_tips)}</td><td>${r.late ? `<span class="tm-tag late">${t('지각', 'late')} ${r.late}</span>` : ''}${r.open ? `<span class="tm-tag noshow">${t('퇴근 없음', 'no out')} ${r.open}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="7">${t('기록이 없어요', 'No records')}</td></tr>`}
        </tbody></table></div>
        <p class="tm-muted">${esc(P.tipNote)} ${t('카드 팁은 급여로, 현금 팁은 손으로 줘요. 퇴근 없는 기록은 먼저 고쳐 주세요.', 'Card tips go on payroll, cash tips are paid by hand. Fix punches with no clock-out first.')}</p>
        <button class="tm-btn" style="width:100%;background:#2e7d32" data-act="paySheet" ${S.busy || !SCHEDULE_SHEET_URL || api.mode !== 'live' ? 'disabled' : ''}>📄 ${t('시트 Payroll 탭에 저장', 'Save to the sheet Payroll tab')}</button>
        ${!SCHEDULE_SHEET_URL || api.mode !== 'live' ? `<p class="tm-muted">${t('시트 연결 후에 저장할 수 있어요. 지금은 CSV로 받을 수 있어요.', 'Available after the sheet is connected. You can download CSV for now.')}</p>` : ''}
        <button class="tm-btn alt small" data-act="payCsv">⬇ CSV</button>` : ''}</details>`;
  }
  function tcEditHtml(e) {
    const ppl = D().people.filter(p => p.stores.some(s => stores.includes(s)));
    return `<div class="tm-card tm-edit"><h4>${e.id ? t('출퇴근 고치기', 'Edit punch') : t('빠진 기록 넣기', 'Add missing punch')}</h4>
      <div class="tm-grid2"><label class="f">${t('직원', 'Person')}<select data-tc="user" ${e.id ? 'disabled' : ''}>${ppl.map(p => `<option value="${esc(p.id)}" ${p.id === e.user_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f">${t('매장', 'Store')}<select data-tc="store" ${e.id ? 'disabled' : ''}>${stores.map(s => `<option value="${s}" ${s === e.store_id ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label></div>
      <div class="tm-grid2"><label class="f">${t('날짜', 'Date')}<input type="date" data-tc="date" value="${e.date}"></label><label class="f">${t('휴식(분)', 'Break (min)')}<input type="number" min="0" max="240" data-tc="brk" value="${e.brk}"></label></div>
      <div class="tm-grid2"><label class="f">${t('출근', 'In')}<input type="time" data-tc="in" value="${timeValue(e.in)}"></label><label class="f">${t('퇴근', 'Out')}<input type="time" data-tc="out" value="${e.out == null ? '' : timeValue(e.out)}"></label></div>
      <label class="f">${t('사유 (꼭 적기)', 'Reason (required)')}<input data-tc="note" maxlength="200" value="${esc(e.note || '')}" placeholder="${t('예: 폰 배터리 꺼짐', 'e.g. phone died')}"></label>
      <div class="tm-row" style="margin-top:8px"><button class="tm-btn" data-act="tcSave">${t('저장', 'Save')}</button>${e.id ? `<button class="tm-btn red" data-act="tcDel">${t('삭제', 'Delete')}</button>` : ''}<button class="tm-btn alt" data-act="tcCancel">${t('취소', 'Cancel')}</button></div>
      <p class="tm-muted">${t('고친 기록은 ‘수정됨’으로 표시되고 원래 기록은 따로 남아요.', 'Edited punches are marked “Edited” and the original is kept in the audit log.')}</p></div>`;
  }

  // ── 설정 (매니저) ───────────────────────────────────
  function settingsHtml() {
    const st = S.setStore;
    if (!S.setDraft || S.setDraft.store_id !== st) { const s = settingsOf(st); S.setDraft = {store_id: st, lat: s.lat ?? null, lng: s.lng ?? null, radius_m: s.radius_m || DEFAULT_RADIUS, notice_days: s.notice_days ?? DEFAULT_NOTICE_DAYS, swap_approval: s.swap_approval !== false, needs: (s.needs || []).map(n => ({...n}))}; }
    const d = S.setDraft, col = colorOf(st);
    const needs = [...d.needs].map((n, i) => ({...n, i})).sort((a, b) => WEEK_ORDER.indexOf(Number(a.weekday)) - WEEK_ORDER.indexOf(Number(b.weekday)) || a.start_min - b.start_min);
    return `<div class="tm-card" style="border-top:8px solid ${col.line}"><h3>⚙ ${t('매장 설정', 'Store settings')}</h3>
      <label class="f">${t('매장', 'Store')}<select data-in="setStore">${stores.map(s => `<option value="${s}" ${s === st ? 'selected' : ''}>${esc(storeLabel(s, lang))}</option>`).join('')}</select></label>
      <h4 style="margin-top:12px">📍 ${t('POS 위치 (출근 확인)', 'POS location (clock-in check)')}</h4>
      <p class="tm-muted">${t('POS 바로 옆에 서서 아래 버튼을 눌러 주세요. 직원은 여기서 반경 안에서만 출근할 수 있어요.', 'Stand right next to the POS and tap the button. Staff can only clock in within the radius from here.')}</p>
      <p>${Number.isFinite(d.lat) ? `✅ ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)} · <a href="https://maps.google.com/?q=${d.lat},${d.lng}" target="_blank" rel="noopener">${t('지도에서 보기', 'View on map')}</a>` : `⚠ ${t('아직 안 정했어요', 'Not set yet')}`}</p>
      <button class="tm-btn alt" data-act="here" ${S.busy ? 'disabled' : ''}>📍 ${t('POS 옆 · 지금 여기로 정하기', 'At the POS · use my location')}</button>
      <div class="tm-grid3"><label class="f">${t('반경 (m)', 'Radius (m)')}<input type="number" min="30" max="500" data-set="radius_m" value="${d.radius_m}"></label>
      <label class="f">${t('휴가 신청 기한 (일 전)', 'Time-off notice (days)')}<input type="number" min="0" max="90" data-set="notice_days" value="${d.notice_days}"></label>
      <label class="f" style="display:flex;gap:6px;align-items:center;margin-top:22px"><input type="checkbox" data-set="swap_approval" ${d.swap_approval ? 'checked' : ''} style="width:auto">${t('마켓 교환은 매니저 승인 후 적용', 'Market swaps need manager approval')}</label></div>
      <h4 style="margin-top:14px">👥 ${t('필요 인원 (자동 스케줄용)', 'Staffing needs (for auto-fill)')}</h4>
      <div class="tm-scroll"><table class="tm-table"><thead><tr><th>${t('요일', 'Day')}</th><th>${t('시작', 'Start')}</th><th>${t('끝', 'End')}</th><th>${t('인원', 'People')}</th><th>${t('포지션', 'Position')}</th><th></th></tr></thead><tbody>
      ${needs.map(n => `<tr><td><select data-need="weekday" data-i="${n.i}">${WEEK_ORDER.map(wd => `<option value="${wd}" ${Number(n.weekday) === wd ? 'selected' : ''}>${dayName(wd, lang)}</option>`).join('')}</select></td>
        <td><input type="time" step="900" data-need="start_min" data-i="${n.i}" value="${timeValue(n.start_min)}"></td><td><input type="time" step="900" data-need="end_min" data-i="${n.i}" value="${timeValue(n.end_min)}"></td>
        <td><input type="number" min="0" max="20" style="width:56px" data-need="count" data-i="${n.i}" value="${n.count}"></td><td><input style="width:96px" maxlength="40" data-need="position" data-i="${n.i}" value="${esc(n.position || '')}"></td>
        <td><button class="tm-btn alt small" data-act="needDel" data-i="${n.i}">✕</button></td></tr>`).join('') || `<tr><td colspan="6" class="tm-muted">${t('아직 없어요', 'None yet')}</td></tr>`}</tbody></table></div>
      <div class="tm-row" style="margin-top:6px"><button class="tm-btn alt small" data-act="needAdd">＋ ${t('줄 추가', 'Add row')}</button><button class="tm-btn alt small" data-act="needCopy">${t('월요일 → 화~금 복사', 'Copy Mon → Tue–Fri')}</button></div>
      <button class="tm-btn" style="width:100%;margin-top:12px" data-act="saveSettings" ${S.busy ? 'disabled' : ''}>${t('설정 저장', 'Save settings')}</button></div>
      <div class="tm-card"><h4>📄 ${t('구글 시트', 'Google Sheet')}</h4><p class="tm-muted">${t('게시하면 ‘월 Schedule’ 탭에 주마다 매장별(색)로 쌓이고, 가능 시간을 저장하면 ‘Availability’ 탭이 바뀌어요.', 'Publishing adds each week to the monthly “Schedule” tab, by store (colour). Saving availability updates the “Availability” tab.')}</p>
      <div class="tm-row"><a class="tm-btn alt small" style="text-decoration:none" href="${SCHEDULE_SHEET_LINK}" target="_blank" rel="noopener">${t('시트 열기', 'Open sheet')}</a><button class="tm-btn alt small" data-act="sheetNow" ${SCHEDULE_SHEET_URL && api.mode === 'live' ? '' : 'disabled'}>${t('이번 주 지금 보내기', 'Send this week now')}</button></div>
      ${!SCHEDULE_SHEET_URL ? `<p class="tm-muted">${t('시트 연결(Apps Script 배포) 준비 중이에요.', 'Sheet connection (Apps Script deploy) is not set up yet.')}</p>` : ''}</div>`;
  }

  // ── 그리기 ──────────────────────────────────────────
  function draw() {
    const nReq = manager ? pendingOff().length + pendingSwaps().length + pendingFixes().length : 0;
    const tabs = [['week', '📅 ' + t('스케줄', 'Schedule')], ['mytime', '⏱ ' + t('내 출퇴근', 'My punches')], ['avail', '🙋 ' + t('가능 시간', 'Availability')], ['off', '🌴 ' + t('휴가', 'Time off')], ['swaps', '🛒 ' + t('쉬프트 마켓', 'Shift market') + ((D().market || []).filter(m => m.from_user !== me).length ? `<span class="tm-badge" style="background:#3e4b33">${(D().market || []).filter(m => m.from_user !== me).length}</span>` : '')]]
      .concat(manager ? [['req', '📥 ' + t('요청', 'Requests') + (nReq ? `<span class="tm-badge">${nReq}</span>` : '')], ['ts', '🧾 ' + t('근무기록', 'Timesheets')], ['set', '⚙ ' + t('설정', 'Settings')]] : []);
    const body = S.tab === 'week' ? (S.build && manager ? buildHtml() : weekHtml()) : S.tab === 'mytime' ? myTimeHtml() : S.tab === 'avail' ? availHtml() : S.tab === 'off' ? offHtml() : S.tab === 'swaps' ? swapsHtml() : S.tab === 'req' ? requestsHtml() : S.tab === 'ts' ? tsHtml() : settingsHtml();
    host.innerHTML = `<div class="tm">
      ${api.mode === 'demo' ? `<div class="tm-banner">🧪 ${api.why === 'no_tables' ? t('예시 모드 · DB 표(team-schedule.sql)를 아직 안 넣어서 예시 자료로 보여요. 이 기기에만 저장돼요.', 'Demo mode · database tables are not installed yet, so this shows sample data saved on this device only.') : t('예시 모드 · 미리보기라서 이 기기에만 저장돼요.', 'Demo mode · preview, saved on this device only.')}<button class="tm-btn alt small" data-act="resetDemo">${t('예시 다시 만들기', 'Reset demo')}</button></div>` : ''}
      ${clockHtml()}${latesHtml()}
      <div class="tm-tabs">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
      ${S.msg ? `<p class="tm-msg ${S.err ? 'err' : ''}">${esc(S.msg)}</p>` : ''}
      ${body}</div>`;
  }

  // ── 동작 ────────────────────────────────────────────
  const val = sel => host.querySelector(sel)?.value ?? '';
  const editFromShift = s => ({id: s.id, date: s.date, start_min: s.start_min, end_min: s.end_min, user_id: s.user_id || '', position: s.position || '', note: s.note || '', published: s.published});
  host.onchange = ev => {
    const el = ev.target, d = el.dataset;
    if (d.in) {
      if (d.in === 'clockStore') S.clockStore = el.value;
      if (d.in === 'buildStore') { S.buildStore = el.value; S.edit = null; }
      if (d.in === 'setStore') { S.setStore = el.value; S.setDraft = null; }
      if (d.in === 'tsStore') S.tsStore = el.value;
      if (d.in === 'tsFrom' || d.in === 'tsTo') { S[d.in] = el.value; if (S.tsFrom > S.tsTo) [S.tsFrom, S.tsTo] = [S.tsTo, S.tsFrom]; S.punchMsg = null; reload().then(draw); return; }
      draw(); return;
    }
    if (d.ed && S.edit) {
      if (d.ed === 'date') S.edit.date = el.value;
      if (d.ed === 'start' || d.ed === 'end') { const m = parseTime(el.value); if (m != null) S.edit[d.ed === 'start' ? 'start_min' : 'end_min'] = m === 0 && d.ed === 'end' ? 1440 : m; }
      if (d.ed === 'user') S.edit.user_id = el.value;
      if (d.ed === 'position' || d.ed === 'note') { S.edit[d.ed] = el.value; return; }
      draw(); return;
    }
    if (d.av && S.av) {
      const wd = Number(d.wd);
      if (d.av === 'kind') { S.av.rows[wd].kind = el.value; draw(); return; }
      if (d.av === 'start' || d.av === 'end') { const m = parseTime(el.value); if (m != null) S.av.rows[wd][d.av === 'start' ? 'start_min' : 'end_min'] = m === 0 && d.av === 'end' ? 1440 : m; return; }
      if (d.av === 'max') S.av.max = el.value; if (d.av === 'note') S.av.note = el.value; if (d.av === 'want') S.av.want = el.value;
      if (d.av === 'wantMax') { S.av.wantMax = el.checked; draw(); } return;
    }
    if (d.set && S.setDraft) { S.setDraft[d.set] = el.type === 'checkbox' ? el.checked : Number(el.value); return; }
    if (d.need && S.setDraft) {
      const n = S.setDraft.needs[Number(d.i)];
      if (d.need === 'start_min' || d.need === 'end_min') { const m = parseTime(el.value); if (m != null) n[d.need] = m === 0 && d.need === 'end_min' ? 1440 : m; }
      else n[d.need] = d.need === 'position' ? el.value : Number(el.value);
      return;
    }
    if (d.fx && S.fix) { const k = d.fx; if (k === 'in' || k === 'out') S.fix[k] = el.value ? parseTime(el.value) : null; else if (k === 'brk') S.fix.brk = Number(el.value) || 0; else if (k === 'store') S.fix.store_id = el.value; else S.fix[k] = el.value; return; }
    if (d.tc && S.tcEdit) { const k = d.tc; S.tcEdit[k === 'user' ? 'user_id' : k === 'store' ? 'store_id' : k] = (k === 'in' || k === 'out') ? (el.value ? parseTime(el.value) : null) : k === 'brk' ? Number(el.value) || 0 : el.value; }
  };
  // 가져간 뒤: 바로 내 근무가 됐는지(승인 필요 없음) 매니저 승인 대기인지
  const afterTake = m => {
    const mineNow = m && D().shifts.some(x => x.id === m.shift_id && x.user_id === me);
    const where = m ? `${storeLabel(m.store_id, lang)} ${fmtDate(m.date, lang)} ${fmtRange(m.start_min, m.end_min, lang)}` : '';
    return mineNow ? t(`✅ 이제 내 근무예요: ${where}. 📅 스케줄에 보여요.`, `✅ It’s yours now: ${where}. It shows on 📅 Schedule.`) : t(`가져가기로 했어요 (${where}). 매니저 승인 후 내 근무가 돼요.`, `You took it (${where}). It becomes yours after manager approval.`);
  };
  host.onclick = async ev => {
    const b = ev.target.closest('[data-act]');
    if (!b || !host.contains(b)) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'tab') { S.tab = b.dataset.v; S.msg = ''; S.swapFor = null; draw(); return; }
    if (act === 'resetDemo') { api.reset(); S.av = null; S.setDraft = null; await reload(); say(t('예시 자료를 새로 만들었어요', 'Demo data reset')); return; }
    if (act === 'punch') { punch(b.dataset.k); return; }
    if (act === 'wk') { S.week = b.dataset.d === '0' ? weekStart(today()) : addDays(S.week, Number(b.dataset.d)); S.edit = null; S.swapFor = null; await reload(); draw(); return; }
    if (act === 'filter') { S.filter = b.dataset.v; draw(); return; }
    if (act === 'mine') { S.mine = !S.mine; draw(); return; }
    if (act === 'mk') { S.mkStore = b.dataset.v; draw(); return; }
    if (act === 'build') { S.build = true; if (S.filter !== 'all' && stores.includes(S.filter)) S.buildStore = S.filter; S.msg = ''; draw(); return; }
    if (act === 'unbuild') { S.build = false; S.edit = null; S.msg = ''; draw(); return; }
    if (act === 'shift') { const s = D().shifts.find(x => x.id === id); S.swapFor = s && (s.user_id === me || !s.user_id) && s.date >= today() ? id : null; draw(); return; }
    if (act === 'closeSwap') { S.swapFor = null; draw(); return; }
    if (act === 'swapOffer') {
      const s = D().shifts.find(x => x.id === id) || (D().market || []).find(m => m.shift_id === id), mineShift = s && s.user_id === me;
      const to = mineShift ? val('#tmSwapTo') : '', note = mineShift ? val('#tmSwapNote') : '';
      S.swapFor = null;
      run(() => api.swapOffer(id, to || null, note), () => mineShift ? (to ? t('교환 요청을 보냈어요', 'Swap request sent') : t('🛒 쉬프트 마켓에 올렸어요. 누가 가져가기 전까지는 내 근무예요.', '🛒 Posted to the shift market. It stays yours until someone takes it.')) : afterTake(s));
      return;
    }
    if (act === 'swapAccept') { const m = (D().market || []).find(x => x.swap_id === id); run(() => api.swapAccept(id), () => afterTake(m)); return; }
    if (act === 'swapCancel') { run(() => api.swapCancel(id), t('요청을 취소했어요', 'Request cancelled')); return; }
    if (act === 'decideSwap') { run(() => api.swapDecide(id, b.dataset.yes === '1'), b.dataset.yes === '1' ? t('승인했어요 · 스케줄이 바뀌었어요', 'Approved · schedule updated') : t('거절했어요', 'Denied')); return; }
    if (act === 'decideOff') { run(() => api.decideTimeOff(id, b.dataset.yes === '1'), b.dataset.yes === '1' ? t('휴가를 승인했어요', 'Time off approved') : t('거절했어요', 'Denied')); return; }
    if (act === 'reqOff') { const a = val('#tmOffFrom'), z = val('#tmOffTo') || a; if (!a) return; run(() => api.requestTimeOff(a, z < a ? a : z, val('#tmOffWhy')), t('휴가를 신청했어요. 매니저가 확인해요.', 'Request sent. Your manager will review it.')); return; }
    if (act === 'cancelOff') { run(() => api.cancelTimeOff(id), t('취소했어요', 'Cancelled')); return; }
    if (act === 'saveAvail') {
      const rows = WEEK_ORDER.map(wd => { const r = S.av.rows[wd]; return r.kind === 'range' ? {weekday: wd, kind: 'range', start_min: r.start_min, end_min: r.end_min} : {weekday: wd, kind: r.kind}; });
      if (rows.some(r => r.kind === 'range' && !(r.end_min > r.start_min))) { say(t('끝나는 시간이 시작보다 늦어야 해요', 'End time must be after start time'), true); return; }
      if (!S.av.wantMax && S.av.want !== '' && S.av.max !== '' && Number(S.av.want) > Number(S.av.max)) { say(t('원하는 시간이 주 최대 시간보다 많아요', 'Wanted hours are more than your max hours'), true); return; }
      run(async () => { await api.saveAvailability(rows, S.av.max === '' ? null : Number(S.av.max), S.av.note, {desired_hours: S.av.wantMax ? null : (S.av.want === '' ? null : Number(S.av.want)), want_max: S.av.wantMax}); return sheet('syncAvailability'); }, extra => t('가능 시간을 저장했어요', 'Availability saved') + (extra || ''));
      return;
    }
    // 내 출퇴근 고치기 요청
    if (act === 'fixNew') { S.fix = {timecard_id: null, store_id: S.clockStore, date: today(), in: 600, out: 960, brk: 0, reason: ''}; draw(); return; }
    if (act === 'fixFor') { const tc = D().timecards.find(x => x.id === id); if (!tc) return; S.fix = {timecard_id: tc.id, store_id: tc.store_id, date: tcDate(tc), in: localParts(tc.clock_in).min, out: tc.clock_out ? localParts(tc.clock_out).min : null, brk: Math.round(breakMinutes(tc)), reason: ''}; draw(); host.querySelector('.tm-edit')?.scrollIntoView({block: 'center'}); return; }
    if (act === 'fixCancelForm') { S.fix = null; draw(); return; }
    if (act === 'fixSend') {
      const f = S.fix; f.reason = val('[data-fx="reason"]');
      if (!f.reason.trim()) { say(t('이유를 적어 주세요', 'Please write a reason'), true); return; }
      if (f.in == null || (f.out != null && f.out <= f.in)) { say(t('퇴근 시간이 출근보다 늦어야 해요', 'Clock-out must be after clock-in'), true); return; }
      const body = {timecard_id: f.timecard_id, store_id: f.store_id, new_in: zonedToISO(f.date, f.in), new_out: f.out == null ? null : zonedToISO(f.date, f.out), break_min: f.brk, reason: f.reason};
      S.fix = null; run(() => api.requestFix(body), t('요청을 보냈어요. 매니저가 확인한 뒤에 적용돼요.', 'Request sent. Management will verify it before it is applied.')); return;
    }
    if (act === 'pushOn' || act === 'pushSave' || act === 'pushOff') {
      const topics = [...host.querySelectorAll('[data-topic]')].filter(x => x.checked).map(x => x.dataset.topic);
      try { if (act === 'pushOff') await disablePush(c); else await enablePush(c, act === 'pushOn' ? null : topics); S.push = await pushState(c); say(act === 'pushOff' ? t('알림을 껐어요', 'Notifications off') : t('🔔 알림이 켜졌어요', '🔔 Notifications on')); }
      catch (e) { say(e.message === 'DENIED' ? t('알림 권한이 꺼져 있어요. 설정에서 이 앱 알림을 허용해 주세요.', 'Notifications are blocked; allow them in settings.') : e.message === 'NOT_READY' ? t('알림 서버 준비 중이에요.', 'Notification server is not ready yet.') : String(e.message || e), true); }
      return;
    }
    if (act === 'fixCancel') { run(() => api.cancelFix(id), t('취소했어요', 'Cancelled')); return; }
    if (act === 'decideFix') { run(() => api.decideFix(id, b.dataset.yes === '1'), b.dataset.yes === '1' ? t('확인했어요 · 근무기록에 적용됐어요', 'Verified · applied to the timesheet') : t('거절했어요', 'Denied')); return; }
    // 2주 급여
    if (act === 'payPeriod') { S.pay = {...payPeriod(b.dataset.a), rows: null, tipNote: ''}; S.tsFrom = S.pay.from; S.tsTo = S.pay.to; await reload(); draw(); return; }
    if (act === 'payCalc') {
      const P = S.pay; S.tsFrom = P.from; S.tsTo = P.to;
      run(async () => {
        await reload();
        const cards = D().timecards.filter(tc => stores.includes(tc.store_id) && tcDate(tc) >= P.from && tcDate(tc) <= P.to);
        let tips = [], note = '';
        try {
          const raw = await fetchTips(P.from, P.to);
          const sp = splitTips(raw, tipShiftsFromTimecards(cards, D().people), {from: P.from, to: P.to});
          tips = sp.people; note = sp.unsplit.length ? t(`⚠ 팁은 있는데 출퇴근 기록이 없는 날 ${sp.unsplit.length}개는 안 나눴어요.`, `⚠ ${sp.unsplit.length} day(s) with tips but no punches were not split.`) : t('💵 팁은 Cash$ 팁 기록을 출퇴근 시간 비율로 나눴어요.', '💵 Tips from Cash$ split by clocked hours.');
        } catch { note = t('⚠ 팁 기록을 못 불러와서 팁은 0으로 보여요.', '⚠ Could not load tips, shown as $0.'); }
        P.rows = payrollSummary({timecards: cards, shifts: D().shifts.filter(x => stores.includes(x.store_id)), people: D().people, from: P.from, to: P.to, tips});
        P.tipNote = note; P.tips = tips;
      }, () => t(`${fmtDate(S.pay.from, lang)}–${fmtDate(S.pay.to, lang)} 급여 요약을 계산했어요`, `Payroll summary for ${fmtDate(S.pay.from, lang)}–${fmtDate(S.pay.to, lang)} is ready`));
      return;
    }
    if (act === 'paySheet') { const P = S.pay; run(() => api.syncSheet('syncPayroll', P.from, {from: P.from, to: P.to, tips: (P.tips || []).map(x => ({name: x.name, cash: x.cash, card: x.card}))}), t('시트 Payroll 탭에 저장했어요', 'Saved to the Payroll tab')); return; }
    if (act === 'payCsv') {
      const P = S.pay, head = ['Name', 'Stores', 'Hours', 'Regular', 'Overtime', 'Card tips', 'Cash tips', 'Late', 'No clock-out'];
      const csv = [[`Pay period ${P.from} to ${P.to}`], head, ...P.rows.map(r => [r.name, r.stores.map(x => storeLabel(x, 'en')).join(' / '), r.hours, r.regular, r.overtime, r.card_tips, r.cash_tips, r.late, r.open])].map(l => l.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], {type: 'text/csv'})); a.download = `kream-payroll-${P.from}-to-${P.to}.csv`; a.click(); return;
    }
    // 스케줄 짜기
    if (act === 'addShift') { const d = b.dataset.d || S.week; S.edit = {id: null, date: d, start_min: 600, end_min: 960, user_id: '', position: '', note: '', published: false}; draw(); host.querySelector('.tm-edit')?.scrollIntoView({block: 'center'}); return; }
    if (act === 'editShift') { const s = D().shifts.find(x => x.id === id); if (s) { S.edit = editFromShift(s); draw(); host.querySelector('.tm-edit')?.scrollIntoView({block: 'center'}); } return; }
    if (act === 'cancelEdit') { S.edit = null; draw(); return; }
    if (act === 'saveShift') {
      const e = S.edit; e.position = val('[data-ed="position"]'); e.note = val('[data-ed="note"]');
      if (!(e.end_min > e.start_min)) { say(t('끝나는 시간이 시작보다 늦어야 해요', 'End time must be after start time'), true); return; }
      const row = {id: e.id || newId(), date: e.date, start_min: e.start_min, end_min: e.end_min, user_id: e.user_id || null, position: e.position, note: e.note, published: !!e.published};
      S.edit = null; run(() => api.saveShifts(S.buildStore, [row]), t('저장했어요', 'Saved'));
      return;
    }
    if (act === 'delShift') { const e = S.edit; if (!confirm(t('이 근무를 지울까요?', 'Delete this shift?'))) return; S.edit = null; run(() => api.saveShifts(S.buildStore, [], [e.id]), t('지웠어요', 'Deleted')); return; }
    if (act === 'auto') {
      const st = S.buildStore, needs = settingsOf(st).needs || [];
      if (!needs.length) { S.tab = 'set'; S.setStore = st; S.setDraft = null; say(t('먼저 필요 인원을 정해 주세요', 'Set staffing needs first'), true); return; }
      const r = autoSchedule({store: st, dates: weekDates(S.week), needs, people: storePeople(st), shifts: D().shifts.filter(s => s.date >= S.week && s.date <= addDays(S.week, 6)), availabilityRows: D().availability, timeOff: D().timeOff, prefs: D().prefs});
      if (!r.shifts.length) { say(t('이미 필요 인원만큼 다 채워져 있어요', 'Already fully staffed')); return; }
      run(() => api.saveShifts(st, r.shifts.map(s => ({...s, id: newId()}))), () => t(`근무 ${r.shifts.length}개를 초안으로 넣었어요${r.unfilled.length ? ` · ⚠ ${r.unfilled.length}개는 가능한 사람이 없어서 빈 근무로 뒀어요` : ''}. 확인하고 ‘게시하기’를 눌러 주세요.`, `Added ${r.shifts.length} draft shifts${r.unfilled.length ? ` · ⚠ ${r.unfilled.length} left open (nobody available)` : ''}. Review, then tap Publish.`));
      return;
    }
    if (act === 'copyLast') {
      const st = S.buildStore, rows = copyWeek(D().shifts, addDays(S.week, -7), S.week, st);
      if (!rows.length) { say(t('지난주 근무가 없어요', 'No shifts last week'), true); return; }
      const have = D().shifts.filter(s => s.store_id === st && s.date >= S.week && s.date <= addDays(S.week, 6)).length;
      if (have && !confirm(t(`이번 주에 이미 근무 ${have}개가 있어요. 그래도 지난주 근무를 더할까요?`, `This week already has ${have} shifts. Add last week’s on top?`))) return;
      run(() => api.saveShifts(st, rows.map(s => ({...s, user_id: onTimeOff(D().timeOff, s.user_id, s.date) ? null : s.user_id, id: newId()}))), t(`지난주 근무 ${rows.length}개를 초안으로 복사했어요`, `Copied ${rows.length} shifts as drafts`));
      return;
    }
    if (act === 'clearDrafts') { const st = S.buildStore, ids = D().shifts.filter(s => s.store_id === st && !s.published && s.date >= S.week && s.date <= addDays(S.week, 6)).map(s => s.id); if (!confirm(t(`초안 ${ids.length}개를 지울까요?`, `Delete ${ids.length} drafts?`))) return; run(() => api.saveShifts(st, [], ids), t('초안을 지웠어요', 'Drafts cleared')); return; }
    if (act === 'publish') {
      const st = S.buildStore;
      run(async () => { const n = await api.publish(st, S.week, addDays(S.week, 6)); return {n, extra: await sheet('syncWeek', S.week, {stores})}; }, r => t(`게시했어요 · 직원들이 이제 볼 수 있어요 (${r.n}개)`, `Published · staff can see it now (${r.n})`) + (r.extra || ''));
      return;
    }
    // 근무기록
    if (act === 'tsPreset') { S.tsFrom = b.dataset.a; S.tsTo = b.dataset.b; await reload(); draw(); return; }
    if (act === 'csv') {
      const blob = new Blob(['﻿' + timesheetCsv(tsRows(), s => storeLabel(s, 'en'))], {type: 'text/csv'}), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `kream-timesheet-${S.tsFrom}-to-${S.tsTo}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return;
    }
    if (act === 'tcAdd') { const p = D().people.find(x => x.stores.some(s => stores.includes(s))); S.tcEdit = {id: null, user_id: p?.id, store_id: S.tsStore === 'all' ? stores[0] : S.tsStore, date: today(), in: 600, out: 960, brk: 0, note: ''}; draw(); return; }
    if (act === 'tcEdit') {
      const tc = D().timecards.find(x => x.id === id); if (!tc) return;
      S.tcEdit = {id: tc.id, user_id: tc.user_id, store_id: tc.store_id, date: tcDate(tc), in: localParts(tc.clock_in).min, out: tc.clock_out ? localParts(tc.clock_out).min : null, brk: Math.round(breakMinutes(tc)), note: ''}; draw(); host.querySelector('.tm-edit')?.scrollIntoView({block: 'center'}); return;
    }
    if (act === 'tcCancel') { S.tcEdit = null; draw(); return; }
    if (act === 'tcSave' || act === 'tcDel') {
      const e = S.tcEdit; e.note = val('[data-tc="note"]');
      if (!e.note.trim()) { say(t('사유를 적어 주세요', 'Please write a reason'), true); return; }
      if (act === 'tcDel') { if (!confirm(t('이 기록을 지울까요?', 'Delete this punch?'))) return; S.tcEdit = null; run(() => api.deleteTimecard(e.id, e.note), t('지웠어요', 'Deleted')); return; }
      if (e.in == null || (e.out != null && e.out <= e.in)) { say(t('퇴근 시간이 출근보다 늦어야 해요', 'Clock-out must be after clock-in'), true); return; }
      const cin = zonedToISO(e.date, e.in), cout = e.out == null ? null : zonedToISO(e.date, e.out);
      const breaks = e.brk > 0 ? [{start: zonedToISO(e.date, e.in + Math.min(180, Math.max(0, ((e.out ?? e.in + 240) - e.in - e.brk) / 2))), end: zonedToISO(e.date, e.in + Math.min(180, Math.max(0, ((e.out ?? e.in + 240) - e.in - e.brk) / 2)) + e.brk)}] : [];
      S.tcEdit = null; run(() => api.saveTimecard({id: e.id, user_id: e.user_id, store_id: e.store_id, clock_in: cin, clock_out: cout, breaks, note: e.note}), t('저장했어요', 'Saved'));
      return;
    }
    // 설정
    if (act === 'here') {
      S.busy = true; draw();
      try { const p = await getPos(); S.setDraft.lat = p.lat; S.setDraft.lng = p.lng; S.busy = false; say(p.acc > 50 ? t(`위치를 잡았어요 (정확도 ±${Math.round(p.acc)}m — 좀 부정확해요. 창가에서 한 번 더 눌러 보세요). ‘설정 저장’을 눌러야 저장돼요.`, `Got it (±${Math.round(p.acc)} m — a bit fuzzy, try again near a window). Tap “Save settings” to keep it.`) : t(`위치를 잡았어요 (±${Math.round(p.acc)}m). ‘설정 저장’을 눌러야 저장돼요.`, `Got it (±${Math.round(p.acc)} m). Tap “Save settings” to keep it.`)); }
      catch (e) { S.busy = false; say(e.message === 'LOCATION_DENIED' ? t('위치 권한을 허용해 주세요', 'Please allow location access') : t('위치를 못 찾았어요', 'Could not get location'), true); }
      return;
    }
    if (act === 'needAdd') { S.setDraft.needs.push({weekday: 1, start_min: 600, end_min: 960, count: 1, position: ''}); draw(); return; }
    if (act === 'needDel') { S.setDraft.needs.splice(Number(b.dataset.i), 1); draw(); return; }
    if (act === 'needCopy') { const mon = S.setDraft.needs.filter(n => Number(n.weekday) === 1); if (!mon.length) { say(t('월요일 줄이 없어요', 'No Monday rows'), true); return; } S.setDraft.needs = S.setDraft.needs.filter(n => ![2, 3, 4, 5].includes(Number(n.weekday))).concat([2, 3, 4, 5].flatMap(wd => mon.map(n => ({...n, weekday: wd})))); draw(); return; }
    if (act === 'saveSettings') {
      const d = S.setDraft;
      if (d.needs.some(n => !(n.end_min > n.start_min))) { say(t('필요 인원: 끝나는 시간이 시작보다 늦어야 해요', 'Staffing needs: end must be after start'), true); return; }
      const radius = Math.min(500, Math.max(30, Number(d.radius_m) || DEFAULT_RADIUS));
      run(() => api.saveSettings(d.store_id, {...d, radius_m: radius, needs: d.needs.map(({weekday: w, start_min, end_min, count, position}) => ({weekday: Number(w), start_min, end_min, count: Number(count) || 0, position: position || ''}))}), () => { S.setDraft = null; return t('설정을 저장했어요', 'Settings saved'); });
      return;
    }
    if (act === 'sheetNow') { run(() => api.syncSheet('syncWeek', S.week, {stores}), t('시트에 보냈어요', 'Sent to the sheet')); }
  };
  draw();
}
