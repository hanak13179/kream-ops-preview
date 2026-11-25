// 📊 HR Management — 운영진·매니저·공장 매니저용 한눈에 보기
// 맨 위: 지금 해야 할 것 (발주 안 함 · 캐시 카운트 안 함 · 퇴근 안 찍음 · 미출근)
// 사람: 지각·미출근, 스케줄 문제 / 재고: 지점별 품절, 오래 품절, 오래 안 센 재고, 발주 누락, 입고확인 안 함 / 공장: 완제품 재고 없음, 원재료 부족
// 직원 관리: 초대 링크, 가입·근무지 요청 승인, 매장 지정 (Sora의 accounts 화면을 그대로 써요) / 🔔 알림 설정
import {TEAM_STORES, STORE_COLORS, today, addDays, fmtDate, fmtRange, fmtTime, localParts} from './team-logic.mjs?v=20261125-pr789';
import {teamBackend} from './team-data.mjs?v=20261125-pr789';
import {readAllRows} from './read-rows.mjs';
import {carriedSet, ORDER_DUE_MIN, CASH_DUE_MIN, orderStatus, missedOrders, soldOut, longSoldOut, staleCounts, factoryOut, lowMaterials, notReceived, attendance, openPunches, scheduleProblems, headline, ORDER_STORES, LONG_OUT_DAYS, STALE_COUNT_DAYS, MISSED_ORDER_DAYS, PEOPLE_DAYS} from './hr-logic.mjs?v=20261125-pr789';
import {renderAccounts} from './accounts.mjs?v=20261124-account-folders';
import {pushState, enablePush, disablePush, PUSH_TOPICS} from './push.mjs?v=20261125-pr789';

export const HR_ROLES = ['owner', 'manager', 'general_manager', 'manager_factory', 'factory_manager'];
export function canUseHR(profile, role) {
  if (!profile?.active) return false;
  return HR_ROLES.includes(role) || profile.role === 'owner' || profile.role === 'manager' || (profile.role === 'factory' && !!profile.factory_manager);
}
const INVITE_URL = 'https://ops.kreamtoronto.com/staff/';
const S = {open: new Set(['now']), data: null, busy: false, msg: '', err: false, push: null};
const STORE_NAME = {downtown: '1호점 Wellesley', midland: '2호점 Midland', 'richmond-hill': '3호점 Richmond Hill', finch: '4호점 Finch'};
const STORE_BG = {...Object.fromEntries(Object.entries(STORE_COLORS).map(([k, v]) => [k, v.bg])), midland: '#e3eed9'};

function style() {
  if (document.getElementById('hrStyle')) return;
  const s = document.createElement('style'); s.id = 'hrStyle';
  s.textContent = `.hr{max-width:920px;margin:0 auto;color:#2b2a26}
.hr h2{margin:4px 0 6px}.hr-sub{color:#6b6555;font-size:13px;margin:0 0 10px}
.hr-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.hr-chip{border:0;border-radius:999px;padding:8px 12px;font-weight:800;font-size:14px;cursor:pointer}
.hr-chip.red{background:#fde2df;color:#8a1c12}.hr-chip.amber{background:#fff1c9;color:#6d4c00}.hr-chip.ok{background:#e3f1dc;color:#2d5a1f}
.hr-card{background:#fff;border:1px solid #ebe4d3;border-radius:18px;margin:10px 0;overflow:hidden}
.hr-card>summary{list-style:none;cursor:pointer;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800;font-size:16px}
.hr-card>summary::-webkit-details-marker{display:none}
.hr-card .body{padding:0 14px 14px}
.hr-n{min-width:26px;padding:2px 8px;border-radius:999px;font-size:13px;text-align:center;background:#efe9da}
.hr-n.red{background:#c0392b;color:#fff}.hr-n.amber{background:#f6c343;color:#4a3500}.hr-n.ok{background:#e3f1dc;color:#2d5a1f}
.hr-store{border-radius:12px;padding:8px 10px;margin:6px 0}
.hr-store b{display:block;margin-bottom:4px}
.hr-row{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #efe9da;padding:7px 0;font-size:14px}
.hr-row:first-child{border-top:0}
.hr-tag{display:inline-block;font-size:12px;font-weight:700;border-radius:8px;padding:2px 7px;margin:2px 3px 0 0;background:#fff}
.hr-tag.red{background:#fde2df;color:#8a1c12}.hr-tag.amber{background:#fff1c9;color:#6d4c00}
.hr-muted{color:#6b6555;font-size:13px}
.hr-btn{border:0;border-radius:12px;padding:9px 13px;font-weight:800;background:#3e4b33;color:#fff;cursor:pointer;font-size:14px}
.hr-btn.alt{background:#efe9da;color:#3b382f}
.hr-msg{padding:10px 12px;border-radius:12px;background:#eef5e9;font-size:14px}.hr-msg.err{background:#fdecea;color:#8a1c12}
.hr-names{font-size:13px;line-height:1.6}
.hr-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:8px}
.hr-top div{border-radius:14px;padding:10px 12px;font-weight:700}
.hr-top div small{display:block;font-weight:600;opacity:.8;margin-top:2px}`;
  document.head.appendChild(s);
}

export async function renderHR(host, c) {
  style();
  const {t, esc, db} = c, lang = c.lang || 'ko';
  if (!canUseHR(c.profile, c.role)) { host.innerHTML = `<p class="empty">${t('운영진·매니저·공장 매니저만 볼 수 있어요.', 'For owners, managers and factory managers only.')}</p>`; return; }
  const myStores = (c.stores || []).map(s => s.id);
  const orderStores = ORDER_STORES.filter(s => myStores.includes(s) || c.profile.role === 'owner' || c.profile.general_manager);
  const teamStores = TEAM_STORES.filter(s => orderStores.includes(s));
  const factorySide = c.profile.role === 'owner' || c.profile.role === 'factory' || c.role === 'manager_factory';
  const sn = st => STORE_NAME[st] || st;
  host.innerHTML = `<div class="hr"><h2>📊 HR Management</h2><p class="hr-muted">${t('불러오는 중…', 'Loading…')}</p></div>`;

  async function load() {
    const d = today(), safe = p => p.then(r => r?.error ? [] : (r?.data ?? r ?? [])).catch(() => []);
    const all = mk => readAllRows(mk).catch(() => []);
    const [ordersAll, receiptsAll, rules, baskets, stock, finished, materials, accounts, cash, team] = await Promise.all([
      all(() => db.from('kream_orders').select('id,store_id,delivery_date,status,kream_order_items(product_id,quantity)').gte('delivery_date', addDays(d, -30)).lte('delivery_date', addDays(d, 2)).order('id')),
      all(() => db.from('kream_receipts').select('order_id,store_id').gte('created_at', addDays(d, -45)).order('id')),
      all(() => db.from('kream_stock_rules').select('store_id,product_id,weekday_base,weekend_base').order('store_id').order('product_id')),
      safe(db.from('kream_store_baskets').select('store_id,delivery_date,items').gte('delivery_date', addDays(d, -1)).lte('delivery_date', addDays(d, 2))),
      all(() => db.from('kream_stock').select('store_id,product_id,on_hand,minimum,updated_at,physical_count_at').order('store_id').order('product_id')),
      factorySide ? safe(db.from('kream_finished_stock').select('product_id,order_unit,quantity,counted,updated_at')) : [],
      factorySide ? safe(db.from('kream_materials').select('id,name_ko,name_en,unit,on_hand,minimum,active')) : [],
      ['owner', 'manager'].includes(c.profile.role) ? safe(db.rpc('kream_list_accounts')) : [],
      Promise.all(teamStores.map(st => (c.cashSaved ? c.cashSaved(st, d) : Promise.resolve(null)).then(done => ({store_id: st, done})).catch(() => ({store_id: st, done: null})))),
      teamStores.length ? teamBackend(c, teamStores).then(api => api.load({from: addDays(d, -PEOPLE_DAYS), to: addDays(d, 14)}).then(x => ({...x, mode: api.mode}))).catch(() => null) : null
    ]);
    // 앱이 들고 있는 발주는 지금 매장 것만이라서, 여기서 모든 매장 것을 따로 불러요
    const catalog = c.catalogAll || [], orders = ordersAll.length ? ordersAll : (c.orders || []), receipts = [...receiptsAll, ...(c.receipts || [])];
    const people = team?.people || [], carried = carriedSet({stock, rules, orders});
    const tm = team || {shifts: [], timecards: [], timeOff: [], swaps: [], fixes: [], availability: [], prefs: {}};
    const pendingAccounts = (accounts || []).filter(a => !a.active && !a.access_blocked || (a.requests || []).some(r => r.status === 'pending')).length;
    const data = {
      orders: orderStatus({stores: orderStores, orders, baskets, today: d}),
      missed: missedOrders({stores: orderStores, orders, today: addDays(d, 1), days: MISSED_ORDER_DAYS}).filter(m => m.date <= d),
      cash, sold: soldOut({stock, catalog, stores: orderStores, carried, orders, today: d}),
      longOut: longSoldOut({stock, orders, catalog, today: d, stores: orderStores, carried}),
      stale: staleCounts({stock, catalog, today: d, stores: orderStores, carried}),
      factoryUncounted: finished.filter(f => f.counted === false && Number(f.quantity) < 0).length,
      factory: factoryOut({finished, catalog}), materials: lowMaterials(materials),
      notRec: notReceived({orders: orders.filter(o => orderStores.includes(o.store_id)), receipts, today: d}),
      attendance: attendance({shifts: tm.shifts, timecards: tm.timecards, people, today: d}),
      open: openPunches({timecards: tm.timecards, people}),
      schedule: scheduleProblems({stores: teamStores, shifts: tm.shifts, timeOff: tm.timeOff, swaps: tm.swaps, fixes: tm.fixes, availability: tm.availability, prefs: tm.prefs, people, today: d}),
      pendingAccounts, teamMode: team?.mode || 'none', teamWhy: team?.why || '', people
    };
    data.nowMin = localParts(new Date()).min;
    data.head = headline({nowMin: data.nowMin, orders: data.orders, cash: data.cash, attendanceRows: data.attendance, open: data.open, problems: data.schedule, sold: data.sold, factory: data.factory.length, notRec: data.notRec.length, pendingAccounts});
    S.data = data;
  }
  try { await load(); } catch (e) { host.innerHTML = `<div class="hr"><p class="hr-msg err">${esc(e.message || e)}</p></div>`; return; }
  try { S.push = await pushState(c); } catch { S.push = {supported: false}; }

  const label = {order: t('발주 아직 안 함', 'Order not placed'), cash: t('캐시 카운트 안 함', 'Cash count not done'), open: t('퇴근 안 찍음', 'Not clocked out'), noshow: t('미출근', 'No-show'), late: t('지각', 'Late'),
    schedule: t('스케줄 문제', 'Schedule issues'), soldout: t('품절', 'Sold out'), factory: t('공장 재고 없음', 'Factory out of stock'), receive: t('입고확인 안 함', 'Not received'), accounts: t('가입·근무지 요청', 'Account requests')};
  const target = {order: 'now', cash: 'now', open: 'now', noshow: 'people', late: 'people', schedule: 'schedule', soldout: 'sold', factory: 'factory', receive: 'receive', accounts: 'staff'};
  const n = (k, v, lv) => `<span class="hr-n ${v ? lv : 'ok'}">${v || '✓'}</span>`;
  const sec = (id, title, count, lv, body) => `<details class="hr-card" id="hr-${id}" ${S.open.has(id) ? 'open' : ''} data-sec="${id}"><summary>${title}${n(id, count, lv)}</summary><div class="body">${body}</div></details>`;
  const storeBox = (st, inner) => `<div class="hr-store" style="background:${STORE_BG[st] || '#f3efe4'}"><b>${esc(sn(st))}</b>${inner}</div>`;
  const nameOf = id => S.data.people.find(p => p.id === id)?.name || '—';

  function draw() {
    const D = S.data, d = today();
    const orderDue = D.nowMin >= ORDER_DUE_MIN, cashDue = D.nowMin >= CASH_DUE_MIN, GRAY = '#f3efe4';
    const now = `<div class="hr-top">${D.orders.map(o => `<div style="background:${o.done ? '#e3f1dc' : orderDue ? '#fde2df' : GRAY}">${o.done ? '✅' : o.inProgress ? '🛒' : '⏳'} ${esc(sn(o.store_id))}<small>${o.done ? t(`발주 완료 (${fmtDate(o.date, lang)} 도착)`, `Ordered (arrives ${fmtDate(o.date, lang)})`) : o.inProgress ? t(`발주함에 ${o.items}개 · 아직 발주완료 안 함`, `${o.items} in basket · not submitted`) : orderDue ? t('아직 발주 안 함', 'No order yet') : t('아직 발주 전 (보통 저녁에 해요)', 'Not yet (usually evening)')}</small></div>`).join('')}
      ${D.cash.map(cc => `<div style="background:${cc.done ? '#e3f1dc' : cc.done === false && cashDue ? '#fde2df' : GRAY}">${cc.done ? '✅' : cc.done === false ? '💵' : '·'} ${esc(sn(cc.store_id))}<small>${cc.done ? t('캐시 카운트 완료', 'Cash count done') : cc.done === false ? (cashDue ? t('캐시 카운트 아직 안 함', 'Cash count not done') : t('캐시 카운트는 마감 후에 해요', 'Cash count is after closing')) : t('캐시 카운트 확인 못 함', 'Could not check cash count')}</small></div>`).join('')}</div>
      ${D.open.length ? `<h4 style="margin:12px 0 4px">⏱ ${t('퇴근을 안 찍었어요', 'Still clocked in')}</h4>${D.open.map(o => `<div class="hr-row"><span><b>${esc(o.name)}</b> · ${esc(sn(o.store_id))} · ${esc(fmtDate(o.date, lang))}</span><span class="hr-tag red">${o.hours}h ${t('째', '')}</span></div>`).join('')}<p class="hr-muted">${t('📅 스케줄 → 근무기록에서 퇴근 시간을 고쳐 주세요.', 'Fix the clock-out in 📅 Schedule → Timesheets.')}</p>` : ''}`;
    const nowCount = (orderDue ? D.orders.filter(o => !o.done).length : 0) + (cashDue ? D.cash.filter(x => x.done === false).length : 0) + D.open.length;
    const ppl = D.attendance.map(r => `<div class="hr-row"><span><b>${esc(r.name)}</b><br>${r.noShow.map(x => `<span class="hr-tag red">✗ ${esc(fmtDate(x.date, lang))} ${esc(sn(x.store_id).split(' ')[0])}</span>`).join('')}${r.late.map(x => `<span class="hr-tag amber">⚠ ${esc(fmtDate(x.date, lang))} ${x.minutes}${t('분', 'm')}</span>`).join('')}</span><span>${r.noShow.length ? `<span class="hr-tag red">${t('미출근', 'no-show')} ${r.noShow.length}</span>` : ''}${r.late.length ? `<span class="hr-tag amber">${t('지각', 'late')} ${r.late.length}</span>` : ''}</span></div>`).join('')
      || `<p class="hr-muted">${D.teamMode === 'live' ? t(`최근 ${PEOPLE_DAYS}일 지각·미출근 없어요 👍`, `No late or no-show in ${PEOPLE_DAYS} days 👍`) : t('📅 스케줄 DB가 아직 없어서 출퇴근 기록이 없어요.', 'Schedule database not installed yet, so no punches.')}</p>`;
    const P = D.schedule;
    const schedBody = `${P.unpublished.map(u => `<div class="hr-row"><span>📅 <b>${esc(sn(u.store_id))}</b> ${t('다음 주', 'next week')} (${esc(fmtDate(u.week, lang))}~) ${t('스케줄이 아직 게시 안 됐어요', 'is not published')}</span>${u.drafts ? `<span class="hr-tag amber">${t('초안', 'drafts')} ${u.drafts}</span>` : ''}</div>`).join('')}
      ${P.open.length ? `<div class="hr-row"><span>🙋 ${t('다음 7일 빈 근무', 'Open shifts next 7 days')}: ${P.open.map(s => `<span class="hr-tag">${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))} ${esc(sn(s.store_id).split(' ')[0])}</span>`).join('')}</span></div>` : ''}
      ${P.conflicts.map(s => `<div class="hr-row"><span><b>${esc(s.name)}</b> · ${esc(fmtDate(s.date, lang))} ${esc(fmtRange(s.start_min, s.end_min, lang))} ${esc(sn(s.store_id).split(' ')[0])}</span><span>${s.issues.map(i => `<span class="hr-tag amber">${{timeoff: t('휴가', 'time off'), unavailable: t('안 되는 시간', 'unavailable'), overlap: t('겹침', 'overlap'), overmax: t('시간 초과', 'over max')}[i]}</span>`).join('')}</span></div>`).join('')}
      ${P.pendingTimeOff + P.pendingSwaps + P.pendingFixes ? `<div class="hr-row"><span>📥 ${t('기다리는 요청', 'Waiting requests')}: ${t('휴가', 'time off')} ${P.pendingTimeOff} · ${t('교환', 'swaps')} ${P.pendingSwaps} · ${t('출퇴근 고치기', 'punch fixes')} ${P.pendingFixes}</span><span class="hr-muted">📅 ${t('스케줄 → 요청', 'Schedule → Requests')}</span></div>` : ''}`;
    const schedCount = P.unpublished.length + P.open.length + P.conflicts.length + P.pendingTimeOff + P.pendingSwaps + P.pendingFixes;
    const soldCount = Object.values(D.sold).reduce((a, l) => a + l.filter(x => !x.coming).length, 0);
    const soldBody = `<p class="hr-muted">${t('그 매장이 쓰는 품목(최소수량이 있거나 최근 30일에 발주한 것) 중 재고 0이에요.', 'Items the store uses (has a minimum or ordered in 30 days) with 0 stock.')}</p>` + orderStores.map(st => { const l = D.sold[st] || [], no = l.filter(x => !x.coming), yes = l.filter(x => x.coming);
      return storeBox(st, l.length ? `${no.length ? `<div class="hr-names"><span class="hr-tag red">${t('품절 · 주문 안 됨', 'Out · not ordered')} ${no.length}</span> ${no.map(x => esc(x.name)).join(' · ')}</div>` : ''}${yes.length ? `<div class="hr-names" style="opacity:.7;margin-top:4px"><span class="hr-tag">${t('품절 · 오늘/내일 들어옴', 'Out · arriving')} ${yes.length}</span> ${yes.map(x => esc(x.name)).join(' · ')}</div>` : ''}` : `<span class="hr-muted">${t('품절 없음', 'Nothing sold out')}</span>`); }).join('')
      + (D.longOut.length ? `<h4 style="margin:12px 0 4px">🕒 ${t(`오래 품절 (재고 0인데 ${LONG_OUT_DAYS}일 동안 안 들어옴)`, `Long sold out (0 stock, nothing arrived in ${LONG_OUT_DAYS} days)`)}</h4>${orderStores.filter(st => D.longOut.some(x => x.store_id === st)).map(st => storeBox(st, `<div class="hr-names">${D.longOut.filter(x => x.store_id === st).map(x => esc(x.name)).join(' · ')}</div>`)).join('')}<p class="hr-muted">${t('최소수량이 0이거나 발주를 안 넣고 있는지 확인해 주세요.', 'Check if the minimum is 0 or nobody is ordering it.')}</p>` : '')
      + (Object.values(D.stale).some(l => l.length) ? `<h4 style="margin:12px 0 4px">📝 ${t(`재고를 ${STALE_COUNT_DAYS}일 넘게 안 셌어요`, `Not counted for ${STALE_COUNT_DAYS}+ days`)}</h4>${orderStores.filter(st => D.stale[st]?.length).map(st => `<div class="hr-row"><span>${esc(sn(st))}</span><span class="hr-tag amber">${D.stale[st].length}${t('개 품목', ' items')}</span></div>`).join('')}` : '');
    const missedBody = D.missed.length ? orderStores.filter(st => D.missed.some(m => m.store_id === st)).map(st => storeBox(st, D.missed.filter(m => m.store_id === st).map(m => `<span class="hr-tag red">${esc(fmtDate(m.date, lang))}</span>`).join(''))).join('') + `<p class="hr-muted">${t('그날 도착한 발주가 없었던 날이에요 (쉬는 날이면 괜찮아요).', 'Days with no order arriving (fine if the store was closed).')}</p>` : `<p class="hr-muted">${t(`최근 ${MISSED_ORDER_DAYS}일 발주 누락 없어요 👍`, `No missed orders in ${MISSED_ORDER_DAYS} days 👍`)}</p>`;
    const recBody = D.notRec.length ? D.notRec.map(o => `<div class="hr-row"><span>${esc(sn(o.store_id))}</span><span class="hr-tag amber">${esc(fmtDate(o.date, lang))} ${t('도착분', 'delivery')}</span></div>`).join('') + `<p class="hr-muted">${t('공장이 보냈는데 매장에서 입고확인을 안 했어요.', 'Factory sent it but the store has not confirmed receiving.')}</p>` : `<p class="hr-muted">${t('모두 입고확인 했어요 👍', 'All received 👍')}</p>`;
    const facBody = !factorySide ? `<p class="hr-muted">${t('공장 매니저·운영진만 봐요.', 'Factory managers and owners only.')}</p>` :
      (D.factory.length ? `<h4 style="margin:4px 0">🏭 ${t('완제품', 'Finished goods')}</h4>${D.factory.map(f => `<div class="hr-row"><span>${esc(f.name)}</span><span class="hr-tag ${f.quantity < 0 ? 'red' : 'amber'}">${f.quantity < 0 ? t(`${-f.quantity} 부족`, `${-f.quantity} short`) : t('0 · 없음', '0 · out')}</span></div>`).join('')}` : `<p class="hr-muted">${t('완제품 재고 없는 것 없어요 👍', 'No finished goods out 👍')}</p>`)
      + (D.factoryUncounted ? `<p class="hr-muted">${t(`재고를 센 적 없는 완제품 ${D.factoryUncounted}개는 마이너스(보낸 게 더 많음)라서 빼고 보여줘요. 🏭 완제품 재고관리에서 세면 여기 나와요.`, `${D.factoryUncounted} finished goods were never counted (negative = sent more than counted) and are left out. Count them in Finished stock to see them here.`)}</p>` : '')
      + (D.materials.length ? `<h4 style="margin:12px 0 4px">🧂 ${t('원재료·소모품 부족', 'Low materials')}</h4>${D.materials.map(m => `<div class="hr-row"><span>${esc(m.name)}</span><span class="hr-tag ${m.on_hand <= 0 ? 'red' : 'amber'}">${m.on_hand}${m.minimum != null ? ` / ${t('최소', 'min')} ${m.minimum}` : ''} ${esc(m.unit)}</span></div>`).join('')}` : '');
    const push = S.push || {};
    const pushBody = `<p class="hr-sub">${t('폰에 알림이 와요: 발주·캐시 카운트 안 했을 때, 지각·미출근, 퇴근 안 찍었을 때, 요청이 들어왔을 때, 공장 재고 부족.', 'Get phone alerts: order or cash count not done, late/no-show, not clocked out, new requests, factory shortages.')}</p>
      ${!push.supported ? `<p class="hr-msg err">${esc(push.why || t('이 기기·브라우저는 알림을 못 받아요.', 'This device/browser cannot receive notifications.'))}</p>` : push.enabled ? `<p class="hr-msg">🔔 ${t('이 기기에서 알림을 받고 있어요.', 'Notifications are on for this device.')}</p>
        <div>${PUSH_TOPICS.filter(p => p.roles.includes('manager')).map(p => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" data-topic="${p.key}" ${push.topics?.includes(p.key) ? 'checked' : ''}> ${t(p.ko, p.en)}</label>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:8px"><button class="hr-btn" data-act="pushSave">${t('저장', 'Save')}</button><button class="hr-btn alt" data-act="pushOff">${t('이 기기 알림 끄기', 'Turn off on this device')}</button></div>`
        : `<button class="hr-btn" data-act="pushOn">🔔 ${t('이 기기에서 알림 켜기', 'Turn on notifications on this device')}</button>`}
      <p class="hr-muted" style="margin-top:8px">${t('아이폰은 사파리에서 “홈 화면에 추가”로 앱을 설치한 뒤, 그 앱에서 켜야 알림이 와요 (iOS 16.4 이상). 안드로이드는 크롬에서 바로 돼요.', 'On iPhone, add the app to your Home Screen from Safari first and turn it on inside that app (iOS 16.4+). Android works in Chrome.')}</p>`;
    host.innerHTML = `<div class="hr"><h2>📊 HR Management</h2><p class="hr-sub">${t(`오늘 ${fmtDate(d, lang)} · 발주는 오늘 주문 → 내일 도착 기준이에요`, `Today ${fmtDate(d, lang)} · orders: placed today, arrive tomorrow`)}</p>
      ${S.msg ? `<p class="hr-msg ${S.err ? 'err' : ''}">${esc(S.msg)}</p>` : ''}
      ${D.teamMode === 'demo' ? `<p class="hr-msg" style="background:#fff7d6">🧪 ${t('지각·미출근·스케줄은 아직 예시 자료예요 (스케줄 DB 적용 전). 발주·품절·공장 재고는 실제 자료예요.', 'Attendance and schedule are sample data until the schedule database is installed. Orders, stock and factory are real.')}</p>` : ''}
      <div class="hr-chips">${D.head.map(h => `<button class="hr-chip ${h.level}" data-go="${target[h.key]}">${label[h.key]} ${h.n}</button>`).join('') || `<span class="hr-chip ok">✅ ${t('지금 급한 문제 없어요', 'Nothing urgent')}</span>`}
        <button class="hr-chip ok" data-act="reload">↻ ${t('새로고침', 'Refresh')}</button></div>
      ${sec('now', '🚨 ' + t('지금 해야 할 것', 'Do now'), nowCount, 'red', now)}
      ${sec('people', '⏰ ' + t(`지각·미출근 (최근 ${PEOPLE_DAYS}일)`, `Late & no-show (${PEOPLE_DAYS} days)`), D.attendance.length, 'red', ppl)}
      ${sec('schedule', '📅 ' + t('스케줄 문제', 'Schedule issues'), schedCount, 'amber', schedBody || `<p class="hr-muted">${t('문제 없어요 👍', 'No issues 👍')}</p>`)}
      ${sec('sold', '🔴 ' + t('지점별 품절', 'Sold out by store'), soldCount, 'amber', soldBody)}
      ${sec('missed', '🧾 ' + t(`발주 누락 (최근 ${MISSED_ORDER_DAYS}일)`, `Missed orders (${MISSED_ORDER_DAYS} days)`), D.missed.length, 'amber', missedBody)}
      ${sec('receive', '📦 ' + t('입고확인 안 함', 'Not received'), D.notRec.length, 'amber', recBody)}
      ${sec('factory', '🏭 ' + t('공장 재고 없음', 'Factory out of stock'), factorySide ? D.factory.length + D.materials.length : 0, 'amber', facBody)}
      ${['owner', 'manager'].includes(c.profile.role) ? sec('staff', '👥 ' + t('직원 관리 · 초대 · 요청 승인 · 매장 지정', 'Staff · invite · approve · assign stores'), D.pendingAccounts, 'amber', `
        <div class="hr-row" style="flex-wrap:wrap"><span style="flex:1 1 240px">✉️ ${t('직원 초대: 이 링크를 보내면 가입할 때 근무지를 골라요. 여기서 승인하고 매장을 지정해요.', 'Invite: send this link; they pick a workplace when signing up, then approve and assign stores here.')}<br><code style="font-size:12px">${INVITE_URL}</code></span>
        <span style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start"><button class="hr-btn alt" style="white-space:nowrap" data-act="copyInvite">${t('링크 복사', 'Copy link')}</button>${navigator.share ? `<button class="hr-btn" data-act="shareInvite">${t('보내기', 'Share')}</button>` : ''}</span></div>
        <div id="hrAccounts"></div>`) : ''}
      ${sec('push', '🔔 ' + t('알림 설정', 'Notification settings'), 0, 'ok', pushBody)}
    </div>`;
    const acc = host.querySelector('#hrAccounts');
    if (acc && S.open.has('staff')) renderAccounts(acc, c);
  }

  S.c = c;
  if (!host.__hrToggle) host.__hrToggle = host.addEventListener('toggle', e => { const c = S.c; const d = e.target.closest?.('[data-sec]'); if (!d) return; d.open ? S.open.add(d.dataset.sec) : S.open.delete(d.dataset.sec); if (d.dataset.sec === 'staff' && d.open) { const acc = host.querySelector('#hrAccounts'); if (acc && !acc.childElementCount) renderAccounts(acc, c); } }, true) || true;
  host.onclick = async e => {
    const b = e.target.closest('[data-act],[data-go]');
    if (!b || !host.contains(b)) return;
    if (b.dataset.go) { S.open.add(b.dataset.go); draw(); host.querySelector('#hr-' + b.dataset.go)?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
    const a = b.dataset.act;
    if (a === 'reload') { S.msg = ''; await load(); draw(); return; }
    if (a === 'copyInvite') { try { await navigator.clipboard.writeText(INVITE_URL); S.msg = t('초대 링크를 복사했어요', 'Invite link copied'); S.err = false; } catch { S.msg = INVITE_URL; } draw(); return; }
    if (a === 'shareInvite') { try { await navigator.share({title: 'Kream Operations', text: t('Kream 직원 앱에 가입해 주세요 (근무지를 골라 주세요)', 'Please sign up for the Kream staff app (pick your workplace)'), url: INVITE_URL}); } catch { /* 닫음 */ } return; }
    if (a === 'pushOn' || a === 'pushSave' || a === 'pushOff') {
      const topics = [...host.querySelectorAll('[data-topic]')].filter(x => x.checked).map(x => x.dataset.topic);
      try {
        if (a === 'pushOff') await disablePush(c); else await enablePush(c, a === 'pushOn' ? null : topics);
        S.push = await pushState(c); S.msg = a === 'pushOff' ? t('이 기기 알림을 껐어요', 'Notifications off on this device') : t('🔔 알림이 켜졌어요. 테스트 알림을 보냈어요.', '🔔 Notifications on. A test notification was sent.'); S.err = false;
      } catch (err) { S.msg = err.message === 'DENIED' ? t('알림 권한이 거부돼 있어요. 폰/브라우저 설정에서 이 사이트 알림을 허용해 주세요.', 'Notifications are blocked. Allow them for this site in settings.') : err.message === 'NOT_READY' ? t('알림 서버 준비 전이에요 (Sora가 설정 후 켤 수 있어요).', 'Notification server not set up yet.') : String(err.message || err); S.err = true; }
      draw();
    }
  };
  draw();
}
