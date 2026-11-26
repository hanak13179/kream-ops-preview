import test from 'node:test';import assert from 'node:assert/strict';
import {isStoreClosingPage,eveningItems,isEvening} from '../evening-warning.mjs';
test('저녁 경고: 안 센 재고, 안 보낸 발주함, 안 한 캐시 카운트', () => {
  assert.equal(eveningItems({remaining: 5, total: 182, submitted: false, cashDone: false, cashPage: true}).map(i => i.key).join(), 'order,cash');
  assert.match(eveningItems({remaining: 5, total: 182}).at(0).ko, /5개가 남았어요 \(177\/182\)/);
  assert.equal(eveningItems({remaining: 0, total: 182, submitted: false}).at(0).key, 'order');
  assert.equal(eveningItems({remaining: 0, total: 182, submitted: true, cashDone: true, cashPage: true}).length, 0);
  assert.equal(eveningItems({remaining: 0, total: 182, submitted: true, cashDone: null, cashPage: true}).length, 0);   // 모르면 경고 안 해요
  assert.equal(eveningItems({remaining: 0, total: 182, submitted: true, cashDone: false, cashPage: false}).length, 0);  // 캐시 카운트 없는 매장
  assert.equal(isEvening(new Date('2026-11-23T23:30:00Z')), true);   // 18:30 토론토
  assert.equal(isEvening(new Date('2026-11-24T07:30:00Z')), true);   // 02:30
  assert.equal(isEvening(new Date('2026-11-23T17:00:00Z')), false);  // 12:00
});

test('store reminders are absent from every factory and global page, including mixed-role factory areas',()=>{
 for(const page of ['production','dispatch','factorymanual','factoryreservations','productionlog','finishedstock','inventory','purchases','materialreceiving','costs','externaldispatch','galleria','galleriaHistory','galleriaSop','overview','hr','accounts','workplaces','catalogreview'])assert.equal(isStoreClosingPage(page),false,page);
 for(const page of ['order','history','receiving','cash','team','manual','reservations','daily','settlement','sop','waste'])assert.equal(isStoreClosingPage(page),true,page);
 for(const page of ['sop','waste','cash'])assert.equal(isStoreClosingPage(page,true),false,page);
});
