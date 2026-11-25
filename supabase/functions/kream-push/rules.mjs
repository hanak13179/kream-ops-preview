// 어떤 알림을 누구에게 보낼지 (5분마다 계산). 테스트: staff/tests/push-rules.test.mjs
// 같은 key는 한 번만 보내요 (kream_push_sent 에 기록).
import {localParts, addDays, weekStart, fmtRange, fmtDate, TEAM_STORES, shiftStatus} from '../../../staff/team-logic.mjs';

const NAME = {downtown: '1호점', midland: '2호점', 'richmond-hill': '3호점', finch: '4호점'};
const sn = s => NAME[s] || s;
const ORDER_STORES = ['downtown', 'midland', 'richmond-hill', 'finch'];

/** 이 매장 담당 매니저 (운영진·총괄은 모든 매장) */
export function managersOf(store, people) {
  return people.filter(p => p.active && (p.role === 'owner' || (p.role === 'manager' && (p.general_manager || (p.stores || []).includes(store))))).map(p => p.user_id);
}
export const factoryManagers = people => people.filter(p => p.active && (p.role === 'owner' || (p.role === 'factory' && p.factory_manager))).map(p => p.user_id);

/**
 * snap: {now, people:[{user_id, role, general_manager, factory_manager, stores, active, display_name}],
 *        orders:[{store_id, delivery_date, status}], cash:{store:true|false|null}, shifts, timecards, timeOff, swaps, fixes, finished, accounts, publishedWeeks}
 * → [{user_id, topic, key, title, body, url}]
 */
export function pushPlan(snap) {
  const now = new Date(snap.now), {date: today, min} = localParts(now), out = [];
  const add = (users, topic, key, title, body, url = './?go=hr') => [...new Set(users)].forEach(u => out.push({user_id: u, topic, key: `${key}:${u}`, title, body, url}));
  const people = snap.people || [], name = id => people.find(p => p.user_id === id)?.display_name || '직원';
  const live = o => !['cancelled', 'canceled'].includes(String(o.status || '').toLowerCase());

  // 🛒 저녁 7시~자정: 내일 도착 발주 없음
  if (min >= 19 * 60) for (const st of ORDER_STORES) {
    if (!(snap.orders || []).some(o => live(o) && o.store_id === st && o.delivery_date === addDays(today, 1)))
      add(managersOf(st, people), 'order_missing', `order:${st}:${today}`, `🛒 ${sn(st)} 발주 아직 안 했어요`, `내일(${fmtDate(addDays(today, 1))}) 도착 발주가 없어요. 오늘 안에 발주완료를 눌러 주세요.`, './?go=order');
  }
  // 💵 밤 10시 반~: 캐시 카운트 안 함 (1·3·4호점)
  if (min >= 22 * 60 + 30) for (const st of TEAM_STORES) if (snap.cash?.[st] === false)
    add(managersOf(st, people), 'cash_missing', `cash:${st}:${today}`, `💵 ${sn(st)} 캐시 카운트 안 했어요`, '마감 캐시 카운트를 아직 저장하지 않았어요.', './?go=cash');

  for (const s of snap.shifts || []) {
    if (!s.user_id || s.published === false || !TEAM_STORES.includes(s.store_id)) continue;
    // ⏰ 근무 2시간 전 (본인)
    if (s.date === today && s.start_min - min <= 120 && s.start_min - min > 100)
      add([s.user_id], 'shift_reminder', `remind:${s.id}`, '⏰ 2시간 뒤 근무예요', `${sn(s.store_id)} ${fmtRange(s.start_min, s.end_min, 'ko')}`, './?go=team');
    if (s.date !== today) continue;
    const st = shiftStatus(s, snap.timecards || [], now);
    // 미출근: 시작 15분 지났는데 출근 안 함 → 본인 + 매니저
    if (st.status === 'late_nocard') {
      add([s.user_id], 'late_noshow', `noclock:${s.id}`, '⏰ 출근 안 찍었어요', `${sn(s.store_id)} ${fmtRange(s.start_min, s.end_min, 'ko')} 근무예요. 매장에 왔으면 출근을 눌러 주세요.`, './?go=team');
      add(managersOf(s.store_id, people), 'late_noshow', `noshow:${s.id}`, `⏰ ${name(s.user_id)} 아직 출근 안 함`, `${sn(s.store_id)} ${fmtRange(s.start_min, s.end_min, 'ko')} · 시작 ${min - s.start_min}분 지남`);
    }
    // 퇴근 안 찍음: 끝나고 20분 → 본인, 2시간 → 매니저
    if (st.status === 'working' && st.card && !st.card.clock_out) {
      if (min >= s.end_min + 20) add([s.user_id], 'clock_out', `out:${s.id}`, '⏱ 퇴근 찍는 거 잊지 마세요', `${fmtRange(s.start_min, s.end_min, 'ko')} 근무가 끝났는데 아직 근무 중으로 되어 있어요.`, './?go=team');
      if (min >= s.end_min + 120) add(managersOf(s.store_id, people), 'open_punch', `openmgr:${s.id}`, `⏱ ${name(s.user_id)} 퇴근 안 찍음`, `${sn(s.store_id)} · 스케줄 끝난 지 2시간 지났어요.`);
    }
  }
  // 📥 새 요청 → 매니저
  for (const o of snap.timeOff || []) if (o.status === 'pending') for (const st of (people.find(p => p.user_id === o.user_id)?.stores || []).filter(x => TEAM_STORES.includes(x)))
    add(managersOf(st, people), 'requests', `toff:${o.id}`, `🌴 휴가 요청 · ${name(o.user_id)}`, `${fmtDate(o.start_date)}${o.end_date !== o.start_date ? '–' + fmtDate(o.end_date) : ''} ${o.reason || ''}`, './?go=team');
  for (const w of snap.swaps || []) {
    const s = (snap.shifts || []).find(x => x.id === w.shift_id);
    if (w.status === 'accepted' && s) add(managersOf(s.store_id, people), 'requests', `swap:${w.id}`, '🔁 교환 승인 요청', `${name(w.from_user)} → ${name(w.to_user)} · ${sn(s.store_id)} ${fmtDate(s.date)} ${fmtRange(s.start_min, s.end_min, 'ko')}`, './?go=team');
    // 🛒 마켓에 새 근무 → 1·3·4호점 직원 (올린 사람 빼고)
    if (w.status === 'open' && s && s.date >= today) add(people.filter(p => p.active && p.user_id !== w.from_user && (p.stores || []).some(x => TEAM_STORES.includes(x))).map(p => p.user_id), 'market', `market:${w.id}`, `🛒 쉬프트 마켓: ${sn(s.store_id)} ${fmtDate(s.date)}`, `${fmtRange(s.start_min, s.end_min, 'ko')} · 먼저 누르는 사람이 가져가요`, './?go=team');
    // ✅ 내 요청 결과
    if (w.status === 'approved' && w.from_user) add([w.from_user], 'my_requests', `swapok:${w.id}`, '✅ 교환이 됐어요', s ? `${fmtDate(s.date)} ${fmtRange(s.start_min, s.end_min, 'ko')} → ${name(w.to_user)}` : '', './?go=team');
  }
  for (const f of snap.fixes || []) {
    if (f.status === 'pending') add(managersOf(f.store_id, people), 'requests', `fix:${f.id}`, `🕐 출퇴근 고치기 요청 · ${name(f.user_id)}`, f.reason || '', './?go=team');
    if (['approved', 'denied'].includes(f.status)) add([f.user_id], 'my_requests', `fixres:${f.id}`, f.status === 'approved' ? '✅ 출퇴근 시간이 고쳐졌어요' : '❌ 출퇴근 고치기 요청이 거절됐어요', f.reason || '', './?go=team');
  }
  for (const o of snap.timeOff || []) if (['approved', 'denied'].includes(o.status)) add([o.user_id], 'my_requests', `toffres:${o.id}`, o.status === 'approved' ? '✅ 휴가가 승인됐어요' : '❌ 휴가가 거절됐어요', `${fmtDate(o.start_date)}${o.end_date !== o.start_date ? '–' + fmtDate(o.end_date) : ''}`, './?go=team');
  for (const a of snap.accounts || []) add(people.filter(p => p.active && (p.role === 'owner' || (p.role === 'manager' && (p.general_manager || (a.stores || []).some(s => (p.stores || []).includes(s)))))).map(p => p.user_id), 'requests', `acct:${a.user_id}:${a.since || ''}`, '👥 새 가입·근무지 요청', `${a.display_name || '새 직원'} · HR Management에서 승인해 주세요`);
  // 📅 금요일 정오~: 다음 주 스케줄 미게시 → 매니저
  const wd = new Date(Date.UTC(...today.split('-').map((x, i) => i === 1 ? x - 1 : +x))).getUTCDay(), next = addDays(weekStart(today), 7);
  if ((wd === 5 && min >= 12 * 60) || wd === 6) for (const st of TEAM_STORES)
    if (!(snap.publishedWeeks || []).includes(`${st}:${next}`)) add(managersOf(st, people), 'schedule_unpublished', `unpub:${st}:${next}`, `📅 ${sn(st)} 다음 주 스케줄 아직 안 나왔어요`, `${fmtDate(next)} 주 스케줄을 게시해 주세요.`, './?go=team');
  // 📅 새 스케줄 게시 → 그 주에 근무 있는 직원 (주마다 한 번)
  for (const k of snap.newlyPublished || []) add([k.user_id], 'schedule_published', `pub:${k.user_id}:${k.week}`, '📅 새 스케줄이 나왔어요', `${fmtDate(k.week)} 주 · 내 근무 ${k.count}개`, './?go=team');
  // 🏭 공장 완제품 부족 (하루 한 번, 아침 8시 이후)
  const short = (snap.finished || []).filter(f => Number(f.quantity) < 0);
  if (short.length && min >= 8 * 60) add(factoryManagers(people), 'factory_short', `factory:${today}`, `🏭 완제품 ${short.length}개 부족`, short.slice(0, 5).map(f => `${f.name || f.product_id} ${-f.quantity}`).join(', '), './?go=hr');
  return out;
}
