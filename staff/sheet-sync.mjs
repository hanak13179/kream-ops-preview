// 재고 숫자를 Hana의 Google 시트(Kream Inventory)에도 기록해요.
// 앱의 저장(Supabase)이 끝난 뒤에 보내는 복사본이라, 시트가 늦거나 실패해도 앱에는 영향이 없어요.
// 몇 개씩 모아서 보내고, 앱을 닫을 때 남은 것도 보내요.

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwjnrGRDkR_qX7AmNq2S3oDVveSR1QbjED0FFga11Au1NcHWNNlPLQlZNwL7EpIlu6x/exec';
const SYNC_KEY = 'kream-stock-sync';
const STORE_LABELS = {downtown: '1호점 Wellesley', midland: '2호점 Midland', 'richmond-hill': '3호점 Richmond Hill', finch: '4호점 Finch'};

let pending = [], timer = null;

/** 한 품목 재고를 시트로 보낼 줄에 넣어요. count는 화면에 보이는 숫자(낱개/조각). */
export function queueSheetStock({store, staff, product, count, sort, unit}) {
  pending.push({
    store_id: store,
    store: STORE_LABELS[store] || store,
    staff: staff || '',
    item_id: product.id,
    item: product.name_ko || product.name_en || product.id,
    category: product.category || '',
    subgroup: product.subgroup || '',
    unit: unit || '',
    sort: sort ?? '',
    count,
    recorded_at: new Date().toISOString(),
  });
  clearTimeout(timer);
  timer = setTimeout(flushSheetStock, pending.length >= 10 ? 0 : 4000);
}

export function flushSheetStock() {
  clearTimeout(timer);
  if (!pending.length) return;
  const body = JSON.stringify({action: 'recordStock', key: SYNC_KEY, rows: pending});
  pending = [];
  try {
    // no-cors: 답은 못 읽지만 보내기는 돼요. keepalive: 앱을 닫는 중에도 보내져요.
    fetch(SHEET_URL, {method: 'POST', mode: 'no-cors', keepalive: true, headers: {'Content-Type': 'text/plain;charset=utf-8'}, body});
  } catch { /* 시트 기록 실패는 앱 사용을 막지 않아요 */ }
}

addEventListener('pagehide', flushSheetStock);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSheetStock(); });
