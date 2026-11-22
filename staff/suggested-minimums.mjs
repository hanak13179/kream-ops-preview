// 매니저가 최소수량을 아직 안 정한 품목에 쓰는 추천 최소수량 (주문 단위 기준).
// 매니저가 최소수량 탭에서 숫자를 넣으면 그 숫자가 항상 먼저예요. 2호점 Midland는 쓰지 않아요.
// 판매 데이터: Hana 시트 "하루 나가는양" 매장별 최소수량 탭 (2026-10-31 ~ 11-20, 하루 평균 x 2일 x 1.5).
// 순서: [1호점 downtown, 3호점 richmond-hill, 4호점 finch]

const STORES = ['downtown', 'richmond-hill', 'finch'];

// 낱개로 팔리는 디저트: 시트 숫자 = 낱개 수
const PIECES = {
  '딸기 요거트케이크': [14, 5, 4], '청포도 요거트케이크': [0, 0, 10],
  '다크 초콜릿 쿠키': [5, 2, 6], '피칸쿠키': [4, 2, 7], '말차 마카다미아 쿠키': [3, 2, 6], '두바이쫀득쿠키': [231, 19, 80],
  '플레인 치즈케익': [5, 3, 4], '피스타치오 치즈케이크': [3, 3, 3], '얼그레이 치즈케이크': [4, 3, 3], '유자 치즈케이크': [3, 3, 3],
  '밤 치즈케이크': [5, 3, 3], '티라미수 치즈케이크': [6, 3, 3], '무화과 치즈케이크': [3, 3, 3],
  '플레인 · 휘낭시에': [6, 2, 41], '로투스 · 휘낭시에': [5, 2, 0], '소세지 · 휘낭시에': [1, 1, 0], '초콜릿 · 휘낭시에': [5, 3, 0],
  '딸기 · 휘낭시에': [3, 2, 0], '말차 · 휘낭시에': [3, 2, 0], '휘낭시에 세트 (6ea)': [2, 1, 3],
  '마차 티라미수': [4, 3, 7], '클래식 티라미수': [15, 3, 21], '밤 티라미수': [4, 3, 7], '망고 티라미수': [5, 4, 8],
  '딸기 레어 치즈케이크': [6, 3, 8], '망고 레어 치즈케이크': [7, 3, 11], '오레오 레어 치즈케이크': [7, 3, 8], '초코 레어 치즈케이크': [7, 3, 10],
  '망고 치아시드 푸딩': [3, 3, 6], '딸기 치아시드 푸딩': [3, 3, 3], '코코넛 치아시드 푸딩': [3, 3, 3], '바나나 푸딩': [10, 4, 6],
  '인절미 시루': [2, 0, 1], '쑥 시루': [0, 0, 3], '흑임자 시루': [1, 0, 0], '단호박 시루': [2, 0, 1],
  '플레인 미니 스콘': [4, 1, 8], '딸기 4인치 홀케이크 (워크인)': [5, 3, 4], '망고 4인치 홀케이크 (워크인)': [3, 3, 3],
};

// 다른 단위로 기록된 재료: 어느 매장에서 안 쓰는지만 봐요 (0 = 그 매장은 안 팔아서 최소수량 0)
const USED = {
  '타로 음료 베이스': [1, 0, 0], '오미자 시럽': [0, 1, 1], '한국 배 에이드': [0, 1, 1], '죠리퐁': [1, 0, 0],
  '팥': [0, 1, 1], '미숫가루 캔': [1, 0, 0], '리얼 망고 프루티 캔': [1, 1, 0], '레몬': [1, 1, 1],
};

// 다른 매장 최소수량을 판매량 비율로 맞춘 값 (최대 2배)
const EXPLICIT = {
  downtown: { milk: 2.5, 'sheet-b44e048309': 2, 'sheet-92360ca4c8': 5, 'sheet-c5a9813f13': 6, 'sheet-7655afbe86': 6, 'sheet-0e5e29bb57': 6, 'sheet-700f07661f': 6, 'sheet-c4d1e3ed1d': 2, 'sheet-9914d9ccbb': 6, 'sheet-202cbe18f1': 6 },
  'richmond-hill': { 'sheet-81132cad4c': 6, 'sheet-70441a15e7': 20, 'sheet-9ea75322e4': 20, 'sheet-1f39626328': 20, 'sheet-e35b099b4e': 3, 'sheet-2a614f0f8e': 3, milk: 3.5, 'sheet-b44e048309': 2, 'sheet-92360ca4c8': 4, 'sheet-c5a9813f13': 6, 'sheet-7655afbe86': 6, 'sheet-0e5e29bb57': 6, 'sheet-cb222a16d6': 6, 'sheet-9c60391dcb': 6, 'sheet-a336021cf6': 6, 'sheet-a37e9cb48f': 6, 'sheet-700f07661f': 6, 'sheet-c2bcf67036': 2, 'sheet-f253f0ab99': 2, 'sheet-a695ceb7c7': 1.5, 'sheet-c4d1e3ed1d': 2, 'sheet-9914d9ccbb': 6, 'sheet-202cbe18f1': 6 },
  finch: { 'sheet-e35b099b4e': 3, 'sheet-2a614f0f8e': 4, 'sheet-c2bcf67036': 2 },
};

const ALIAS = { '플레인 치즈케이크': '플레인 치즈케익' };
const CAKE = /치즈케이크|치즈케익|티라미수|쇼트케이크|요거트케이크|푸딩|치아시드|홀케이크/;

/**
 * p: 품목, store: 매장 id, piecesPerUnit: 주문 1단위에 낱개 몇 개 (트레이 10, 쿠키 봉지 20, 휘낭시에 봉지 10, 낱개 1, 모르면 0)
 * recent: 이 매장 최근 2주 발주에서 한 번에 주문한 양 (가운데 값, 주문 단위). 판매 자료가 0이거나 없을 때 대신 써요
 *         (예: 3호점 시루는 Clover 이름 연결이 안 돼서 판매 0으로 나오지만 실제로는 주문함).
 * → 주문 단위 최소수량 | null (Midland 등)
 */
export function suggestedMinimum(p, store, piecesPerUnit, recent = 0) {
  const i = STORES.indexOf(store);
  if (i < 0 || !p) return null;
  if (EXPLICIT[store]?.[p.id] != null) return Math.max(EXPLICIT[store][p.id], recent || 0);
  const name = String(p.name_ko || '').trim(), key = ALIAS[name] || name;
  const cake = CAKE.test(name);
  const r = Number(recent) || 0;
  if (PIECES[key] && piecesPerUnit > 0 && PIECES[key][i] > 0) {
    const pcs = cake ? Math.max(3, PIECES[key][i]) : PIECES[key][i];
    return Math.round(pcs / piecesPerUnit * 100) / 100;
  }
  // 판매 0 / 자료 없음: 최근에 주문했으면 그 양, 아니면 기본값
  if (r > 0) return r;
  if (PIECES[key] && piecesPerUnit > 0 && !cake) return 0;
  if (USED[key] && !USED[key][i]) return 0;
  if (cake && piecesPerUnit > 0) return Math.round(3 / piecesPerUnit * 100) / 100;
  return 1;
}
