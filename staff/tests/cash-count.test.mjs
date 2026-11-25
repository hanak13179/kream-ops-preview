import test from 'node:test';import assert from 'node:assert/strict';
import {cashPlan,envelope,cashDate,billText} from '../cash-count.mjs';
const c={'50':3,'20':5,'10':2,'5':2,'2':15,'1':83,'0.25':128};
test('total, extra over the float and the bill-only envelope',()=>{const p=cashPlan({counts:c,open:300});assert.equal(p.total,425);assert.equal(p.extra,125);assert.equal(p.envelope,125);assert.equal(p.nextOpen,300);});
test('only bills go in the envelope: $121 extra → $120, $1 stays for tomorrow',()=>{const p=cashPlan({counts:{'100':4,'20':1,'1':1},open:300,cashSales:121});assert.equal(p.envelope,120);assert.equal(p.nextOpen,301);assert.equal(p.diff,0);assert.equal(billText(p.bills),'$100×1 + $20×1');});
test('envelope uses the bills actually in the till',()=>{assert.deepEqual(envelope({'50':1,'20':3},60),{amount:60,bills:{'20':3}});assert.equal(envelope({'100':1,'20':1,'1':1},71).amount,20);assert.equal(envelope({'1':50},40).amount,0);});
test('closing after midnight still counts as the previous day',()=>{assert.equal(cashDate(new Date('2026-11-23T06:30:00Z')),'2026-11-22');assert.equal(cashDate(new Date('2026-11-23T14:00:00Z')),'2026-11-23');});

test('tips are shared by hours, cash and card separately, to the cent', async () => {
  const {shareTips, salesTotal} = await import('../cash-count.mjs');
  const r = shareTips(100, 50.01, [{name: 'A', hours: 6}, {name: 'B', hours: 3}, {name: '', hours: ''}]);
  assert.equal(r.hours, 9);
  assert.deepEqual(r.people.map(p => [p.name, p.cash, p.card]), [['A', 66.67, 33.34], ['B', 33.33, 16.67]]);
  assert.equal(r.people.reduce((a, p) => a + p.total, 0).toFixed(2), '150.01');
  assert.deepEqual(shareTips(20, 0, [{name: 'A', hours: 0}]).people[0].cash, 0);
  assert.equal(salesTotal(1496.76, 1337.62), 159.14);   // After − Before = 세금 (더하지 않아요)
  assert.equal(salesTotal(635.01, ''), '');
  assert.equal(salesTotal('', ''), '');
});

test('시트 박스를 앱 값으로 불러와요', async () => {
  const {fromSheetBox, crewFromSchedule} = await import('../cash-count.mjs');
  const v = fromSheetBox({counts: [1, 0, 2, '', 0, 0, 0, 4, 0, 0], open: 200, pos: 150.5, after: 300, before: 265.49, cashTips: 20, cardTips: '', crew: [{name: 'A', hours: 5}]}, {counts: {'5': 9}, open: 200, note: 'x'});
  assert.deepEqual(v.counts, {'100': 1, '20': 2, '0.25': 4});
  assert.equal(v.cashSales, 150.5); assert.equal(v.total, 34.51); assert.equal(v.cardTips, ''); assert.equal(v.note, 'x');
  assert.deepEqual(v.crew, [{name: 'A', hours: 5}]);
  assert.deepEqual(crewFromSchedule([{name: 'A', hours: ''}], [{name: 'B', hours: 6.5}]), [{name: 'B', hours: 6.5}]);
  assert.equal(crewFromSchedule([{name: 'A', hours: 4}], [{name: 'B', hours: 6.5}]), null);
  assert.equal(crewFromSchedule([], []), null);
});
