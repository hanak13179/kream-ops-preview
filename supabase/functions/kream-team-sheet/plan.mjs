// 구글 시트에서 고친 스케줄 → 앱(DB)에 반영할 계획 (index.ts 가 써요, 테스트: staff/tests/team-sheet-plan.test.mjs)
// 시트 한 블록 = 한 매장 · 한 주. 그 주의 '게시된' 근무만 바꿔요 (초안은 그대로).
//  - 같은 날·같은 시간 근무가 있으면 사람·포지션만 바꿔요 (id 유지 → 교환 기록이 안 깨져요)
//  - 같은 날·같은 사람이면 시간만 바꿔요
//  - 시트에 없어진 근무는 지우고, 새로 적은 근무는 게시된 근무로 넣어요
//  - 이름은 앱 이름과 맞춰요 (대소문자·띄어쓰기 무시, 앞부분이 한 사람만 맞으면 그 사람). 못 찾으면 빈 근무 + 경고
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const OPEN_WORDS = ['', 'open', 'open shift', '빈 근무', '빈근무', 'open (빈 근무)', '-', '—'];

export function matchName(name, people) {
  const n = norm(name).replace(/\s*[⚠✗].*$/, '').trim();
  if (OPEN_WORDS.includes(n)) return {user_id: null};
  const exact = people.filter(p => norm(p.name) === n);
  if (exact.length === 1) return {user_id: exact[0].id};
  const starts = people.filter(p => norm(p.name).startsWith(n) || n.startsWith(norm(p.name).split(' ')[0]) && norm(p.name).split(' ')[0].length >= 2);
  if (starts.length === 1) return {user_id: starts[0].id};
  return {user_id: null, unknown: String(name).trim(), many: exact.length > 1 || starts.length > 1};
}

/**
 * existing: [{id, date, start_min, end_min, user_id, position, published}]  (그 매장·그 주)
 * incoming: [{date, start_min, end_min, name, position}]                   (시트에서 읽은 것)
 * people:   [{id, name}]
 * → {upserts:[{id?, date, start_min, end_min, user_id, position, note}], deletes:[id], warnings:[text], changed:n}
 */
export function planSheetSync({existing = [], incoming = [], people = [], newId = () => null}) {
  const pub = existing.filter(s => s.published !== false || String(s.note||'').startsWith('시트 이름 확인:')), left = new Set(pub.map(s => s.id));
  const upserts = [], warnings = [];
  for (const r of incoming) {
    if (!(r.end_min > r.start_min)) { warnings.push(`${r.date} ${r.name || ''}: 시간을 못 읽었어요`); continue; }
    const m = matchName(r.name, people);
    if (m.unknown) warnings.push(`${r.date} “${m.unknown}”: ${m.many ? '같은 이름이 여러 명이에요' : '앱에 없는 이름이에요'} → 빈 근무로 넣었어요`);
    const free = pub.filter(s => left.has(s.id));
    const hit = free.find(s => s.date === r.date && s.start_min === r.start_min && s.end_min === r.end_min && (s.user_id || null) === m.user_id)
      || free.find(s => s.date === r.date && s.start_min === r.start_min && s.end_min === r.end_min)
      || (m.user_id ? free.find(s => s.date === r.date && s.user_id === m.user_id) : null);
    const row = {date: r.date, start_min: r.start_min, end_min: r.end_min, user_id: m.user_id, position: r.position || '', note: m.unknown ? `시트 이름 확인: ${m.unknown}` : ''};
    if (hit) {
      left.delete(hit.id);
      if (hit.start_min !== row.start_min || hit.end_min !== row.end_min || (hit.user_id || null) !== row.user_id || (row.position && row.position !== (hit.position || '')) || row.note)
        upserts.push({...row, id: hit.id, position: row.position || hit.position || ''});
    } else upserts.push({...row, id: newId()});
  }
  const deletes = [...left];
  return {upserts, deletes, warnings, changed: upserts.length + deletes.length};
}
