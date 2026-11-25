// 🔔 Kream 폰 알림 보내기
//  - 5분마다 (pg_cron → 헤더 x-kream-cron-secret) : rules.mjs 로 보낼 알림을 계산하고, 켜 둔 사람에게만, 한 번씩 보내요
//  - 직원이 '알림 켜기'를 누르면 (로그인 토큰 + {test:true}) : 그 사람 기기에 테스트 알림
// 비밀값: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...), PUSH_CRON_SECRET, CASH_SHEET_URL, CASH_SHEET_KEY
// 배포: supabase functions deploy kream-push --no-verify-jwt   (설정 방법: supabase/changes/push.sql 맨 아래)
import webpush from 'npm:web-push@3.6.7';
import {pushPlan} from './rules.mjs';
import {addDays, weekStart, localParts} from '../../../staff/team-logic.mjs';

const base = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:ops@kreamtoronto.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
const TEAM = ['downtown', 'richmond-hill', 'finch'];

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${base}/rest/v1/${path}`, {...init, headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {})}});
  if (!r.ok) throw Error(`DB ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function send(sub: any, msg: any) {
  try {
    await webpush.sendNotification({endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth}}, JSON.stringify(msg), {TTL: 3600});
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await db(`kream_push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {method: 'DELETE'});   // 기기에서 지워짐
    return false;
  }
}
async function cashDone(store: string, date: string) {
  const url = Deno.env.get('CASH_SHEET_URL'), k = Deno.env.get('CASH_SHEET_KEY');
  if (!url || !k) return null;
  try {
    const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: 'recordCash', key: k, op: 'getCash', store_id: store, count_date: date}), redirect: 'follow'});
    const j = await r.json(); return j?.ok ? !!j.data?.box : null;
  } catch { return null; }
}

async function snapshot(now: Date) {
  const {date: today} = localParts(now), from = addDays(today, -2), to = addDays(today, 14), next = addDays(weekStart(today), 7);
  const [profiles, members, orders, shifts, timecards, timeOff, swaps, fixes, finished, catalog, accounts] = await Promise.all([
    db('kream_profiles?select=user_id,display_name,role,general_manager,factory_manager,store_manager,active,access_blocked'),
    db('kream_memberships?select=user_id,store_id'),
    db(`kream_orders?select=store_id,delivery_date,status&delivery_date=gte.${addDays(today, -1)}&delivery_date=lte.${addDays(today, 2)}`),
    db(`kream_team_shifts?select=id,store_id,shift_date,start_min,end_min,user_id,published,updated_at&shift_date=gte.${from}&shift_date=lte.${to}`).catch(() => []),
    db(`kream_team_timecards?select=user_id,store_id,clock_in,clock_out,breaks&clock_in=gte.${new Date(now.getTime() - 2 * 86400000).toISOString()}`).catch(() => []),
    db(`kream_team_time_off?select=id,user_id,start_date,end_date,reason,status,decided_at&or=(status.eq.pending,decided_at.gte.${new Date(now.getTime() - 86400000).toISOString()})`).catch(() => []),
    db(`kream_team_swaps?select=id,shift_id,from_user,to_user,status,decided_at,created_at&created_at=gte.${new Date(now.getTime() - 7 * 86400000).toISOString()}`).catch(() => []),
    db(`kream_team_timecard_requests?select=id,user_id,store_id,reason,status,decided_at&or=(status.eq.pending,decided_at.gte.${new Date(now.getTime() - 86400000).toISOString()})`).catch(() => []),
    db('kream_finished_stock?select=product_id,quantity').catch(() => []),
    db('kream_catalog?select=id,name_ko').catch(() => []),
    db('kream_profiles?select=user_id,display_name,created_at&active=eq.false&access_blocked=eq.false').catch(() => [])
  ]);
  const stores = (u: string) => members.filter((m: any) => m.user_id === u).map((m: any) => m.store_id);
  const people = profiles.filter((p: any) => !p.access_blocked).map((p: any) => ({...p, stores: stores(p.user_id)}));
  const sh = shifts.map((s: any) => ({...s, date: s.shift_date}));
  const cash: Record<string, boolean | null> = {};
  if (localParts(now).min >= 22 * 60 + 30) for (const st of TEAM) cash[st] = await cashDone(st, today);
  // 이번 5분 사이에 게시된 다음 주 근무 → 그 사람에게 '새 스케줄' 한 번
  const recent = new Date(now.getTime() - 6 * 60000).toISOString();
  const newly = new Map<string, any>();
  for (const s of sh) if (s.published && s.user_id && s.updated_at >= recent && s.date >= weekStart(today)) {
    const wk = weekStart(s.date), k = `${s.user_id}|${wk}`;
    newly.set(k, {user_id: s.user_id, week: wk, count: sh.filter((x: any) => x.user_id === s.user_id && x.published && weekStart(x.date) === wk).length});
  }
  return {now: now.toISOString(), people, orders, cash, shifts: sh, timecards, timeOff, swaps, fixes,
    finished: finished.map((f: any) => ({...f, name: catalog.find((c: any) => c.id === f.product_id)?.name_ko})),
    accounts: accounts.map((a: any) => ({user_id: a.user_id, display_name: a.display_name, since: a.created_at, stores: stores(a.user_id)})),
    publishedWeeks: [...new Set(sh.filter((s: any) => s.published && s.date >= next && s.date <= addDays(next, 6)).map((s: any) => `${s.store_id}:${next}`))],
    newlyPublished: [...newly.values()]};
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
  try {
    const body = await req.json().catch(() => ({}));
    // 1) 테스트 알림 (로그인한 본인 기기만)
    if (body.test) {
      const u = await fetch(`${base}/auth/v1/user`, {headers: {apikey: anon || key, Authorization: req.headers.get('Authorization') || ''}});
      if (!u.ok) return new Response('Unauthorized', {status: 401});
      const me = (await u.json()).id;
      const subs = await db(`kream_push_subscriptions?select=*&user_id=eq.${me}`);
      let n = 0; for (const s of subs) if (await send(s, {title: '🔔 Kream 알림이 켜졌어요', body: '이제 이 기기로 알림이 와요.', url: './'})) n++;
      return Response.json({ok: true, sent: n});
    }
    // 2) 5분마다
    if ((req.headers.get('x-kream-cron-secret') || '') !== (Deno.env.get('PUSH_CRON_SECRET') || '\u0000')) return new Response('Unauthorized', {status: 401});
    const now = new Date(), plan = pushPlan(await snapshot(now));
    if (!plan.length) return Response.json({ok: true, planned: 0, sent: 0});
    const sent = new Set((await db(`kream_push_sent?select=key&key=in.(${plan.map(p => `"${p.key.replace(/"/g, '')}"`).join(',')})`)).map((r: any) => r.key));
    const subs = await db(`kream_push_subscriptions?select=*&user_id=in.(${[...new Set(plan.map(p => p.user_id))].join(',')})`);
    let n = 0; const done: string[] = [];
    for (const p of plan) {
      if (sent.has(p.key)) continue;
      const mine = subs.filter((s: any) => s.user_id === p.user_id && (s.topics || []).includes(p.topic));
      done.push(p.key);   // 알림을 꺼 둔 사람도 '보낸 것'으로 기록 → 나중에 켜도 지난 알림이 몰려오지 않아요
      for (const s of mine) if (await send(s, {title: p.title, body: p.body, url: p.url, tag: p.topic})) n++;
    }
    if (done.length) await db('kream_push_sent', {method: 'POST', headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(done.map(k => ({key: k})))});
    return Response.json({ok: true, planned: plan.length, sent: n});
  } catch (e) { return Response.json({ok: false, error: String((e as Error).message || e)}, {status: 500}); }
});
