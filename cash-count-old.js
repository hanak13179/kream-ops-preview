/*
 * 캐시 카운트: 직원 앱(Kream Operations) 캐시 카운트 화면에서 보낸 마감 현금을 'Cash Count' 시트에 기록해요.
 *  - 월 탭 (예: November): 하루에 한 칸, 그 안에 1호점 · 3호점 · 4호점 박스가 나란히 (원래 Cash Count 계산기 모양).
 *    새 날짜는 맨 위에 새 칸이 생기고, 같은 매장·날짜를 다시 저장하면 그 박스를 고쳐요.
 * 봉투 = (합계 − 오픈시재) 이하에서 가진 지폐로 딱 떨어지는 가장 큰 금액, 내일 오픈시재 = 합계 − 봉투. 팁은 나중에.
 */
var KREAM_CASH_SHEET_ID = '1eYMfOsdj2y6zmcdM9paQci5SvzOXI5ufiNOK9A3S5i8';
var KREAM_CASH_DENOMS = [100, 50, 20, 10, 5, 2, 1, 0.25, 0.1, 0.05];
var KREAM_CASH_BILLS = [100, 50, 20, 10, 5];
var KREAM_CASH_STORES = [
  {id: 'downtown', label: '1호점', tab: '1호점 현금', color: '#eeb4ae'},
  {id: 'richmond-hill', label: '3호점', tab: '3호점 현금', color: '#a9c1e3'},
  {id: 'finch', label: '4호점', tab: '4호점 현금', color: '#ccb6e2'}
];
var KREAM_CASH_HEAD = ['날짜', '합계', '오픈시재', '남는 현금', '현금 매출 (POS)', '차이', '봉투', '봉투 지폐', '내일 오픈시재',
  'After Tax Sales', 'Before Tax', 'Total', '직원', '저장 시간', '메모'].concat(KREAM_CASH_DENOMS.map(function (d) { return d >= 1 ? '$' + d : Math.round(d * 100) + '¢'; }));

function kreamCashMoney(n) { return Math.round(Number(n || 0) * 100) / 100; }
function kreamCashOpt(n) { return n === '' || n == null || !isFinite(Number(n)) ? '' : kreamCashMoney(n); }

function kreamCashEnvelope(counts, extra) {
  var have = KREAM_CASH_BILLS.map(function (b) { return Math.max(0, Math.floor(Number(counts[String(b)]) || 0)); });
  var target = Math.floor(Math.max(0, extra) / 5) * 5, use = [];
  function pick(i, left) {
    if (left === 0) return true; if (i >= KREAM_CASH_BILLS.length) return false;
    for (var n = Math.min(have[i], Math.floor(left / KREAM_CASH_BILLS[i])); n >= 0; n--) { use[i] = n; if (pick(i + 1, left - n * KREAM_CASH_BILLS[i])) return true; }
    return false;
  }
  for (var amt = target; amt > 0; amt -= 5) {
    use = [];
    if (pick(0, amt)) return {amount: amt, text: KREAM_CASH_BILLS.map(function (b, i) { return use[i] ? '$' + b + '×' + use[i] : ''; }).filter(String).join(' + ')};
  }
  return {amount: 0, text: ''};
}

var KREAM_CASH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var KREAM_CASH_BAND = 31;   // 하루치 칸 높이 (박스 30줄 + 빈 줄 1)
var KREAM_CASH_TOP = 3;     // 1행: 매장 이름, 2행: 빈 줄, 3행부터 날짜별 박스
var KREAM_CASH_COL = {downtown: 2, 'richmond-hill': 6, finch: 10};   // 1호점 B, 3호점 F, 4호점 J (박스 3칸 + 띄움 1칸)

// 월 탭 (예: November): 맨 위에 1호점 · 3호점 · 4호점 제목
function kreamCashMonthTab(ss, date) {
  var name = KREAM_CASH_MONTHS[Number(date.slice(5, 7)) - 1];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
  if (sh.getRange(1, 2).getDisplayValue() !== '1호점') {
    sh.getRange(1, 1, 2, 13).clear();
    KREAM_CASH_STORES.forEach(function (st) {
      var c = KREAM_CASH_COL[st.id];
      sh.getRange(1, c, 1, 3).breakApart().merge().setValue(st.label).setBackground(st.color)
        .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
    });
    sh.setColumnWidth(1, 92);
    [5, 9, 13].forEach(function (c) { sh.setColumnWidth(c, 18); });
    sh.setFrozenRows(1);
  }
  return sh;
}

// 그날 칸(밴드) 시작 행. 없으면 날짜 순서(최신이 위)에 맞게 새로 끼워 넣어요.
function kreamCashBand(sh, date) {
  var last = sh.getLastRow(), dates = [];
  if (last >= KREAM_CASH_TOP) dates = sh.getRange(KREAM_CASH_TOP, 1, last - KREAM_CASH_TOP + 1, 1).getDisplayValues();
  var at = null;
  for (var i = 0; i < dates.length; i++) {
    var d = String(dates[i][0]).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d === date) return KREAM_CASH_TOP + i;
    if (d < date && at == null) at = KREAM_CASH_TOP + i;
  }
  if (at == null) at = Math.max(KREAM_CASH_TOP, last + 1);
  if (at <= sh.getMaxRows()) sh.insertRowsBefore(at, KREAM_CASH_BAND);
  else sh.insertRowsAfter(sh.getMaxRows(), at + KREAM_CASH_BAND - sh.getMaxRows());
  var band = sh.getRange(at, 1, KREAM_CASH_BAND, 13);
  band.breakApart(); band.clear();
  var wk = ['일', '월', '화', '수', '목', '금', '토'][new Date(date + 'T12:00:00').getDay()];
  sh.getRange(at, 1).setNumberFormat('@').setValue(date + ' (' + wk + ')').setFontWeight('bold').setVerticalAlignment('top');
  return at;
}

// 박스 하나 = 원래 Sheet2 계산기 모양 그대로 (서식은 Sheet2에서 복사) + 아래에 같은 모양 작은 박스들
//  0 매장·날짜 | 1 CAD -ea = | 2–11 지폐·동전 | 12 TTL | 14–15 오픈시재·당일 현금매출 | 17–18 POS·차이
//  20–22 봉투·봉투 지폐·내일 오픈시재 | 24–26 After Tax·Before Tax·Total | 28–29 직원·메모
var KREAM_CASH_TEMPLATE = 'Sheet2';
function kreamCashMerge(r) { try { if (!r.isPartOfMerge()) r.merge(); } catch (e) {} }
function kreamCashBox(sh, row, store, d) {
  var c = KREAM_CASH_COL[store.id], r0 = row, ss = sh.getParent();
  var tpl = ss.getSheetByName(KREAM_CASH_TEMPLATE);
  var box = sh.getRange(r0, c, KREAM_CASH_BAND - 1, 3);
  box.breakApart(); box.clear();
  var A = function (r, k) { return sh.getRange(r0 + r, c + (k || 0)).getA1Notation(); };
  var P = SpreadsheetApp.CopyPasteType.PASTE_FORMAT;
  if (tpl) {
    [2, 3, 4].forEach(function (k, i) { sh.setColumnWidth(c + i, tpl.getColumnWidth(k)); });
    tpl.getRange('B2:D2').copyTo(sh.getRange(r0, c, 1, 3), P, false);        // 머리글 줄 모양
    tpl.getRange('B2:D13').copyTo(sh.getRange(r0 + 1, c, 12, 3), P, false);  // CAD ~ TTL
    [[14, 2], [17, 2], [20, 3], [24, 3], [28, 2]].forEach(function (g) {      // 오픈시재 박스 모양
      for (var i = 0; i < g[1]; i++) tpl.getRange('B15:D15').copyTo(sh.getRange(r0 + g[0] + i, c, 1, 3), P, false);
    });
  }
  var thick = SpreadsheetApp.BorderStyle.SOLID_MEDIUM, dot = SpreadsheetApp.BorderStyle.DOTTED;
  [[14, 2], [17, 2], [20, 3], [24, 3], [28, 2]].forEach(function (g) {
    var gr = sh.getRange(r0 + g[0], c, g[1], 3);
    gr.setBorder(true, true, true, true, null, null, '#000000', thick);
    if (g[1] > 1) gr.setBorder(null, null, null, null, null, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    for (var i = 0; i < g[1]; i++) kreamCashMerge(sh.getRange(r0 + g[0] + i, c + 1, 1, 2));
  });
  // 값
  sh.getRange(r0, c, 1, 3).merge().setValue(store.label + ' · ' + d.date.slice(5).replace('-', '/'))
    .setBackground(store.color).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, null, null, '#000000', thick);
  var grid = [['CAD', '-ea', "'="]];
  KREAM_CASH_DENOMS.forEach(function (den, i) { grid.push([den, d.counts[i], '=' + A(2 + i) + '*' + A(2 + i, 1)]); });
  sh.getRange(r0 + 1, c, 11, 3).setValues(grid);
  kreamCashMerge(sh.getRange(r0 + 12, c + 1, 1, 2));
  sh.getRange(r0 + 12, c).setValue('TTL');
  sh.getRange(r0 + 12, c + 1).setFormula('=SUM(' + A(2, 2) + ':' + A(11, 2) + ')');
  var set = function (r, label, v) { sh.getRange(r0 + r, c).setValue(label); if (v !== undefined) sh.getRange(r0 + r, c + 1).setValue(v); };
  set(14, '오픈시재', d.open);
  set(15, '당일 현금매출', '=' + A(12, 1) + '-' + A(14, 1));
  set(17, '현금 매출 (POS)', d.pos);
  set(18, '차이', d.pos === '' ? '' : '=' + A(15, 1) + '-' + A(17, 1));
  set(20, '✉️ 봉투', d.envelope);
  set(21, '봉투 지폐'); sh.getRange(r0 + 21, c + 1).setNumberFormat('@').setValue(d.bills).setHorizontalAlignment('center');
  set(22, '🌅 내일 오픈시재', '=' + A(12, 1) + '-' + A(20, 1));
  set(24, 'After Tax Sales', d.after);
  set(25, 'Before Tax', d.before);
  set(26, 'Total', d.totalSales);
  set(28, '직원'); sh.getRange(r0 + 28, c + 1).setNumberFormat('@').setValue(d.staff + (d.saved ? '  (' + d.saved + ')' : '')).setHorizontalAlignment('center');
  set(29, '메모'); sh.getRange(r0 + 29, c + 1).setNumberFormat('@').setValue(d.note).setHorizontalAlignment('center').setWrap(true);
  sh.getRange(r0 + 20, c, 1, 3).setBackground('#fff2cc').setFontWeight('bold');
  sh.getRange(r0 + 22, c, 1, 3).setBackground('#fce5cd').setFontWeight('bold');
}

function kreamRecordCash(req) {
  var settings = kreamSettingMap();
  if (req.key !== (settings.sync_key || KREAM_STOCK_DEFAULT_KEY)) throw kreamError('BAD_SYNC_KEY');
  var store = KREAM_CASH_STORES.filter(function (s) { return s.id === req.store_id; })[0];
  if (!store) throw kreamError('UNKNOWN_STORE');
  var date = String(req.count_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw kreamError('BAD_DATE');
  var countsIn = req.counts || {};
  var counts = KREAM_CASH_DENOMS.map(function (d) {
    var n = Number(countsIn[String(d)] || 0);
    if (!isFinite(n) || n < 0 || n % 1) throw kreamError('BAD_COUNT');
    return n;
  });
  var total = kreamCashMoney(counts.reduce(function (s, n, i) { return s + n * KREAM_CASH_DENOMS[i]; }, 0));
  var open = kreamCashMoney(req.open_float == null || req.open_float === '' ? 300 : req.open_float);
  var extra = kreamCashMoney(total - open);
  var env = kreamCashEnvelope(countsIn, extra);
  var next = kreamCashMoney(total - env.amount);
  var pos = kreamCashOpt(req.cash_sales), diff = pos === '' ? '' : kreamCashMoney(extra - pos);

  // doPost가 이미 스크립트 잠금을 잡고 있어요
  var sh = kreamCashMonthTab(SpreadsheetApp.openById(KREAM_CASH_SHEET_ID), date);
  var row = kreamCashBand(sh, date);   // 같은 날짜면 같은 줄, 새 날짜면 맨 위에 새 칸
  kreamCashBox(sh, row, store, {
    date: date, counts: counts, open: open, extra: extra, pos: pos, diff: diff, envelope: env.amount, bills: env.text, next: next,
    after: kreamCashOpt(req.after_tax), before: kreamCashOpt(req.before_tax), totalSales: kreamCashOpt(req.total_sales),
    staff: String(req.staff || '').slice(0, 80), saved: Utilities.formatDate(new Date(), KREAM_TZ, 'MM/dd HH:mm'), note: String(req.note || '').slice(0, 300)
  });
  return {total: total, open_float: open, extra: extra, envelope: env.amount, bills: env.text, next_open: next, diff: diff, tab: sh.getName()};
}
