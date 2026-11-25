// 🔔 폰 알림 (Web Push). 앱을 홈 화면에 설치한 아이폰(iOS 16.4+)·안드로이드 크롬·컴퓨터 브라우저에서 돼요.
// 서버: supabase/functions/kream-push (5분마다 확인해서 보내요) · 표: supabase/changes/push.sql
// PUSH_PUBLIC_KEY: `npx web-push generate-vapid-keys` 로 만든 공개 키 (개인 키는 Supabase 비밀값으로만, 코드에 넣지 않아요)
export const PUSH_PUBLIC_KEY = 'BDsLCG6n37Od2k8isl9IG2VMAV2I3k-Ed9p3RYHuaiDKYxdTgF3t6RtuB_vbCB8BcQ_oFuSx3o_45S073188MEw';
const FUNCTION_URL = 'https://imkhosgnkgwchoyrqczw.supabase.co/functions/v1/kream-push';

// roles: 이 알림을 고를 수 있는 사람 ('manager' = 운영진·매니저·공장 매니저, 'staff' = 모든 직원)
export const PUSH_TOPICS = [
  {key: 'order_missing', ko: '🛒 저녁 7시까지 발주 안 한 매장', en: 'Stores with no order by 7pm', roles: ['manager'], on: true},
  {key: 'cash_missing', ko: '💵 밤 10시 반까지 캐시 카운트 안 한 매장', en: 'Cash count not done by 10:30pm', roles: ['manager'], on: true},
  {key: 'late_noshow', ko: '⏰ 지각·미출근 (시작 15분 지나도 출근 안 함)', en: 'Late / no-show (15 min after start)', roles: ['manager'], on: true},
  {key: 'open_punch', ko: '⏱ 퇴근 안 찍은 직원 (끝나고 2시간)', en: 'Staff not clocked out (2h after shift)', roles: ['manager'], on: true},
  {key: 'requests', ko: '📥 새 요청 (휴가·교환·출퇴근 고치기·가입)', en: 'New requests (time off, swaps, punch fixes, sign-ups)', roles: ['manager'], on: true},
  {key: 'schedule_unpublished', ko: '📅 금요일까지 다음 주 스케줄 미게시', en: 'Next week not published by Friday', roles: ['manager'], on: true},
  {key: 'factory_short', ko: '🏭 공장 완제품 부족 (하루 한 번)', en: 'Factory finished goods short (daily)', roles: ['manager'], on: true},
  {key: 'shift_reminder', ko: '⏰ 내 근무 2시간 전 알림', en: 'My shift in 2 hours', roles: ['staff', 'manager'], on: true},
  {key: 'clock_out', ko: '⏱ 퇴근 찍는 거 잊었을 때', en: 'Forgot to clock out', roles: ['staff', 'manager'], on: true},
  {key: 'market', ko: '🛒 쉬프트 마켓에 새 근무', en: 'New shift on the market', roles: ['staff', 'manager'], on: true},
  {key: 'schedule_published', ko: '📅 새 스케줄이 나왔을 때', en: 'New schedule published', roles: ['staff', 'manager'], on: true},
  {key: 'my_requests', ko: '✅ 내 요청 결과 (휴가·교환·시간 고치기)', en: 'My request results', roles: ['staff', 'manager'], on: true}
];
export const defaultTopics = manager => PUSH_TOPICS.filter(p => p.on && p.roles.includes(manager ? 'manager' : 'staff')).map(p => p.key);

const b64 = s => { const pad = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export async function pushState(c) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return {supported: false, why: isIOS() && !standalone() ? 'iPhone: Safari에서 공유 → “홈 화면에 추가”로 앱을 설치하고, 그 앱에서 알림을 켜 주세요. / Add to Home Screen first, then turn on in the app.' : null};
  if (Notification.permission === 'denied') return {supported: true, enabled: false, denied: true, why: 'DENIED'};
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return {supported: true, enabled: false};
  let topics = null;
  try { const {data} = await c.db.from('kream_push_subscriptions').select('topics').eq('endpoint', sub.endpoint).maybeSingle(); topics = data?.topics || null; } catch { /* 표가 아직 없음 */ }
  return {supported: true, enabled: !!topics, topics: topics || []};
}
export async function enablePush(c, topics = null) {
  if (!PUSH_PUBLIC_KEY) throw Error('NOT_READY');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Error('DENIED');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64(PUSH_PUBLIC_KEY)});
  const j = sub.toJSON(), manager = ['owner', 'manager'].includes(c.profile?.role) || !!c.profile?.factory_manager;
  const {error} = await c.db.rpc('kream_push_save', {sub_endpoint: j.endpoint, sub_p256dh: j.keys.p256dh, sub_auth: j.keys.auth, sub_topics: topics || defaultTopics(manager), sub_agent: navigator.userAgent.slice(0, 200)});
  if (error) throw Error(/does not exist|Could not find/.test(error.message) ? 'NOT_READY' : error.message);
  if (!topics) await testPush(c).catch(() => {});
}
export async function disablePush(c) {
  const reg = await navigator.serviceWorker.getRegistration(), sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await c.db.rpc('kream_push_remove', {sub_endpoint: sub.endpoint}).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
export async function testPush(c) {
  const {data} = await c.db.auth.getSession(), token = data?.session?.access_token;
  if (!token) return;
  const response = await fetch(FUNCTION_URL, {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({test: true})});
  const result = await response.json();
  if (!response.ok || !result.ok || !result.sent) throw Error('TEST_NOT_DELIVERED');
  return result;
}
