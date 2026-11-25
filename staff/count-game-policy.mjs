// Toronto operating day ends at 3 AM; unfinished morning tasks transfer at 5 PM.
export function countPhase(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Toronto', hour:'numeric', hourCycle:'h23'}).format(now));
  const handover = hour >= 17 || hour < 3;
  return {handover, defaultShift: handover ? 'closing' : 'morning'};
}
export function countProgress(ids, done, failed = new Set()) {
  const required = [...new Set(ids || [])];
  const remaining = required.filter(id => !done.has(id) || failed.has(id));
  return {total:required.length, completed:required.length-remaining.length, remaining, complete:required.length>0 && remaining.length===0};
}
export function closingCarryover(products, carried, {now, isMorning, isCounted}) {
  if (!countPhase(now).handover) return new Set();
  for (const p of products) if (isMorning(p) && !isCounted(p)) carried.add(p.id);
  return carried;
}
