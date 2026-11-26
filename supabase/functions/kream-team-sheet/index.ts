// 구글 시트 'Kream Ops Schedule' → 앱 스케줄 반영 (시트에서 고치면 앱에도 바뀌어요)
// Apps Script(integrations/schedule-sheet/Code.gs)가 바뀐 블록(한 매장·한 주)을 보내요.
// 비밀값: supabase secrets set TEAM_SHEET_SECRET=... (시트 Apps Script의 스크립트 속성에도 같은 값)
// 배포: supabase functions deploy kream-team-sheet --no-verify-jwt
import {planSheetSync} from './plan.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function runtimeSecret() { const config=await db('rpc/kream_team_sheet_runtime_config',{method:'POST',body:'{}'}); return config?.secret || ''; }
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
    if (!await equalSecret(req.headers.get('x-kream-sheet-secret') || '', await runtimeSecret())) return new Response('Unauthorized', {status: 401});
    const body = await req.json();
    const store = String(body.store_id || ''), week = String(body.week_start || '');
    if (!STORES.includes(store) || !/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(week + 'T12:00:00Z').getUTCDay() !== 1) return Response.json({ok: false, error: 'Bad store or week'}, {status: 400});
    const end = addDays(week, 6);
    if (!Array.isArray(body.shifts) || body.shifts.length>300) return Response.json({ok:false,error:'Invalid shifts'}, {status:400});
    const incoming=body.shifts.filter((r:any)=>String(r.name||'').trim().toLowerCase()!=='t').map((r:any)=>({date:r.date,start_min:r.start_min,end_min:r.end_min,name:String(r.name||'').slice(0,80),position:String(r.position||'').slice(0,40)}));
    if(incoming.some((r:any)=>typeof r.date!=='string'||r.date<week||r.date>end||!Number.isInteger(r.start_min)||!Number.isInteger(r.end_min)||r.start_min<0||r.end_min>1440||r.end_min<=r.start_min))return Response.json({ok:false,error:'Invalid date or time; nothing changed'}, {status:400});
    const existing = (await db(`kream_team_shifts?select=id,shift_date,start_min,end_min,user_id,position,note,published,updated_at&store_id=eq.${store}&shift_date=gte.${week}&shift_date=lte.${end}`))
      .map((s: any) => ({...s, date: s.shift_date}));
    // 이름은 1·3·4호점 사람 모두에서 찾아요 (다른 지점 사람이 일할 수도 있어요)
    const members = await db(`kream_memberships?select=user_id,store_id&store_id=in.(${STORES.join(',')})`);
    const ids = [...new Set(members.map((m: any) => m.user_id))];
    const profiles = ids.length ? await db(`kream_profiles?select=user_id,display_name,active,access_blocked&user_id=in.(${ids.join(',')})&active=eq.true&access_blocked=eq.false`) : [];
    const aliases:Record<string,string[]>={'장은영':['Eunyoung'],'김다솜':['Dasom'],'문예린':['Yerin'],'오세인':['Sein'],'서수연':['Suyeon'],'정현이':['Jeonghyeon','정현'],'Hajun':['하준'],'노경민':['경민'],'민채원':['채원'],'민지연':['지연'],'신민아':['민아']};
    const people = profiles.flatMap((p:any)=>[p.display_name,...(aliases[p.display_name]||[])].map(name=>({id:p.user_id,name})));
    const plan = planSheetSync({existing, incoming, people, newId: () => crypto.randomUUID()});
    if(plan.changed)await db('rpc/kream_team_sheet_apply',{method:'POST',body:JSON.stringify({target_store:store,week_start:week,expected:existing.map((r:any)=>({id:r.id,updated_at:r.updated_at})),rows:plan.upserts,delete_ids:plan.deletes})});
    return Response.json({ok: true, changed: plan.changed, warnings: plan.warnings.map((w:string)=>w.replace('→ 빈 근무로 넣었어요','→ 담당자 확인 필요 (관리자 초안)'))});
  } catch (e) { return Response.json({ok: false, error: 'Schedule sync failed; nothing partially saved'}, {status: 500}); }
});
