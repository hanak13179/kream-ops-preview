// 저녁(18시 ~ 새벽 3시)에 그 매장으로 로그인하면, 오늘 아직 안 끝난 일을 맨 위에 알려줘요.
//  - 발주 게임: 오늘 안 센 재고가 남았거나 발주함을 아직 안 보냈을 때
//  - 캐시 카운트: 오늘(1·3·4호점) 시트에 아직 저장 안 됐을 때
export const EVENING_HOUR = 18;
export const CASH_STORES = ['downtown', 'richmond-hill', 'finch'];

export function torontoHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23'}).format(now));
}
export function isEvening(now = new Date()) { const h = torontoHour(now); return h >= EVENING_HOUR || h < 3; }

/** 무엇을 알려줄지: {remaining, total, submitted, cashDone (true|false|null=모름), cashPage} → [{key, ko, en}] */
export function eveningItems({remaining = 0, total = 0, submitted = true, cashDone = null, cashPage = false}) {
  const out = [], auto = submitted ? '' : ' · 새벽 3시까지 안 보내면 지금 발주함 그대로 자동 발주돼요', autoEn = submitted ? '' : ' · if not sent by 3 AM, the basket is sent as is';
  if (total && remaining > 0) out.push({key: 'order', ko: `재고 세기 ${remaining}개가 남았어요 (${total - remaining}/${total})` + auto, en: `${remaining} stock counts left (${total - remaining}/${total})` + autoEn});
  else if (total && !submitted) out.push({key: 'order', ko: '재고는 다 셌는데 발주함을 아직 보내지 않았어요' + auto, en: 'Counts are done but the basket has not been sent' + autoEn});
  if (cashPage && cashDone === false) out.push({key: 'cash', ko: '오늘 캐시 카운트를 아직 안 했어요', en: 'Today’s cash count is not done yet'});
  return out;
}

const cache = new Map();   // 'store|date' → {done, at}
/** 시트에 오늘 캐시 카운트가 저장됐는지 (1분마다 다시 확인). 모르면 null */
export async function cashSaved(url, key, store, date) {
  const k = store + '|' + date, hit = cache.get(k);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.done;
  try {
    const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: 'recordCash', key, op: 'getCash', store_id: store, count_date: date})});
    const j = await r.json();
    if (!j?.ok) return hit ? hit.done : null;
    const done = !!j.data?.box;
    cache.set(k, {done, at: Date.now()});
    return done;
  } catch { return hit ? hit.done : null; }
}
export function markCashSaved(store, date) { cache.set(store + '|' + date, {done: true, at: Date.now()}); }

export function eveningHtml(items, t, esc) {
  if (!items.length) return '';
  return `<div class="evening-warn" role="alert"><b>🌙 ${t('마감 전에 확인해 주세요', 'Before closing')}</b>${items.map(i => `<button type="button" data-evening="${esc(i.key)}">⚠️ ${esc(t(i.ko, i.en))} <span>→</span></button>`).join('')}</div>`;
}
export const EVENING_CSS = `.evening-warn{margin:0 0 12px;padding:10px 12px;border-radius:16px;background:#fff4e5;border:1.5px solid #f0b46c;color:#7a3e1d}
.evening-warn b{display:block;font-size:14px;margin-bottom:4px}
.evening-warn button{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;margin-top:6px;padding:10px 12px;border:0;border-radius:12px;background:#fff;color:#7a3e1d;font-size:15px;font-weight:700;text-align:left}
.evening-warn button span{flex:none}`;
