// 구글 시트 'Kream Ops Schedule' → 앱 스케줄 반영 (시트에서 고치면 앱에도 바뀌어요)
// Apps Script(integrations/schedule-sheet/Code.gs)가 바뀐 블록(한 매장·한 주)을 보내요.
// 비밀값: supabase secrets set TEAM_SHEET_SECRET=... (시트 Apps Script의 스크립트 속성에도 같은 값)
// 배포: supabase functions deploy kream-team-sheet --no-verify-jwt
import {planSheetSync} from './plan.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const secret = Deno.env.get('TEAM_SHEET_SECRET') || '';
const STORES = ['downtown', 'richmond-hill', 'finch'];

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${base}/rest/v1/${path}`, {...init, headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {})}});
  if (!r.ok) throw Error(`DB ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function equalSecret(a: string, b: string) {
  if (!a || !b) return false;
  const d = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([d(a), d(b)]); let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]; return diff === 0;
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
  try {
    if (!await equalSecret(req.headers.get('x-kream-sheet-secret') || '', secret)) return new Response('Unauthorized', {status: 401});
    const body = await req.json();
    const store = String(body.store_id || ''), week = String(body.week_start || '');
    if (!STORES.includes(store) || !/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(week + 'T12:00:00Z').getUTCDay() !== 1) return Response.json({ok: false, error: 'Bad store or week'}, {status: 400});
    const end = addDays(week, 6);
    const incoming = (Array.isArray(body.shifts) ? body.shifts : []).slice(0, 300).filter((r: any) => typeof r.date === 'string' && r.date >= week && r.date <= end)
      .map((r: any) => ({date: r.date, start_min: Math.round(Number(r.start_min)), end_min: Math.round(Number(r.end_min)), name: String(r.name || '').slice(0, 80), position: String(r.position || '').slice(0, 40)}))
      .filter((r: any) => r.start_min >= 0 && r.end_min <= 1440);
    const existing = (await db(`kream_team_shifts?select=id,shift_date,start_min,end_min,user_id,position,published&store_id=eq.${store}&shift_date=gte.${week}&shift_date=lte.${end}`))
      .map((s: any) => ({...s, date: s.shift_date}));
    // 이름은 1·3·4호점 사람 모두에서 찾아요 (다른 지점 사람이 일할 수도 있어요)
    const members = await db(`kream_memberships?select=user_id,store_id&store_id=in.(${STORES.join(',')})`);
    const ids = [...new Set(members.map((m: any) => m.user_id))];
    const profiles = ids.length ? await db(`kream_profiles?select=user_id,display_name,active&user_id=in.(${ids.join(',')})&active=eq.true`) : [];
    const people = profiles.map((p: any) => ({id: p.user_id, name: p.display_name}));
    const plan = planSheetSync({existing, incoming, people, newId: () => crypto.randomUUID()});
    if (plan.deletes.length) await db(`kream_team_shifts?id=in.(${plan.deletes.join(',')})&store_id=eq.${store}`, {method: 'DELETE'});
    if (plan.upserts.length) await db('kream_team_shifts?on_conflict=id', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify(plan.upserts.map(u => ({id: u.id, store_id: store, shift_date: u.date, start_min: u.start_min, end_min: u.end_min, user_id: u.user_id, position: u.position, note: u.note, published: true, updated_at: new Date().toISOString()})))});
    return Response.json({ok: true, changed: plan.changed, warnings: plan.warnings});
  } catch (e) { return Response.json({ok: false, error: String((e as Error).message || e)}, {status: 500}); }
});
