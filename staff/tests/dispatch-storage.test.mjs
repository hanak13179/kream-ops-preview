import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStorageRows,storageGroups,rowEntryKey,splitStorageEntries,checkedEntry,storageZone,familyInfo,storageUnit,numberedStore} from '../dispatch-storage-model.mjs';
import {availableForStore} from '../store-availability.mjs';
const date='2026-11-24',catalog=[{id:'cake',name_ko:'딸기 레어 치즈케이크',name_en:'Strawberry Rare Cheesecake',category:'디저트',subgroup:'레어 치즈케이크',order_unit:'EA'}];
const order=(id,quantity,extra={})=>({id,store_id:'finch',delivery_date:date,status:'submitted',created_at:id,kream_order_items:[{product_id:'cake',order_unit:'EA',quantity}],...extra});
test('storage view aggregates the same date and product, retaining source orders; no canceled or carried rows',()=>{
 const data=buildStorageRows([order('a',3),order('b',2),order('old',99,{delivery_date:'2026-11-23'}),order('cancel',99,{status:'cancelled'}),order('sent',99,{dispatch_finalized_at:'now',status:'dispatched'})],catalog,[],date);
 assert.equal(data.rows.length,1);assert.equal(data.rows[0].total,5);assert.equal(data.rows[0].stores.finch,5);assert.deepEqual(data.rows[0].parts.map(p=>p.orderId),['a','b']);
 const entries={[rowEntryKey(data.rows[0],'finch')]:4};assert.deepEqual(splitStorageEntries(data.rows,'finch',entries),{a:[{product_id:'cake',quantity:3}],b:[{product_id:'cake',quantity:1}]});
 assert.throws(()=>splitStorageEntries(data.rows,'finch',{}),/UNCHECKED/);
});
test('partial dispatch sums are deducted, zero actual quantities persist against every original order',()=>{
 const {rows}=buildStorageRows([order('a',3),order('b',2)],catalog,[{order_id:'a',kream_dispatch_items:[{product_id:'cake',quantity:1}]}],date);assert.equal(rows[0].total,4);
 assert.deepEqual(splitStorageEntries(rows,'finch',{[rowEntryKey(rows[0],'finch')]:0}),{a:[{product_id:'cake',quantity:0}],b:[{product_id:'cake',quantity:0}]});
 assert.equal(checkedEntry(rows[0],'finch',{[rowEntryKey(rows[0],'finch')]:5}),false);
});
test('storage mapping splits chilled desserts and ingredients; rice stays visible for location review',()=>{
 assert.equal(storageZone(catalog[0],'finch'),'chilled-desserts');assert.equal(storageZone({name_ko:'우유 2%'},'finch'),'chilled-ingredients');
 for(const name_ko of ['삼각김밥김','로투스','오레오','레이디핑거'])assert.equal(storageZone({name_ko},'finch'),'ambient');
 assert.equal(storageZone({name_ko:'커피빈'},'finch'),'supplies');assert.equal(storageZone({name_ko:'쌀'},'finch'),'unassigned');
 assert.equal(storageZone({subgroup:'크림밤'},'midland'),'midland');assert.equal(storageZone({subgroup:'크림밤'},'finch'),'unassigned');
});
test('flavor tables have at most four columns, preserve units and never mix Dubai cookies into ordinary cookies',()=>{
 const a={...catalog[0],key:'a',zone:'chilled-desserts',family:familyInfo(catalog[0])};
 assert.equal(storageGroups(Array.from({length:5},(_,i)=>({...a,key:String(i)}))).length,2);
 assert.equal(storageGroups([{...a,order_unit:'EA'},{...a,key:'b',order_unit:'Tray'}]).length,2);
 assert.equal(familyInfo({name_ko:'말차 두바이 쫀득 쿠키',subgroup:'쿠키'}),null);
 assert.equal(familyInfo({name_ko:'바나나 푸딩',subgroup:'푸딩'}),null);
 assert.equal(familyInfo({name_ko:'블루베리 치아시드 푸딩',subgroup:'푸딩'}).flavorEn,'Blueberry');
});
test('same ID with different snapshot units is never added into one displayed total',()=>{
 const b=order('b',1);b.kream_order_items[0].order_unit='Tray';const {rows}=buildStorageRows([order('a',3),b],catalog,[],date);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.total).sort(),[1,3]);
});
test('English units and numbered stores contain no Korean display labels',()=>{
 for(const order_unit of ['EA','개','봉','Bag · 20개/봉','통','켤레'])assert.doesNotMatch(storageUnit({order_unit},'en'),/[가-힣]/);
 assert.equal(numberedStore('midland','en'),'2 · Midland');assert.equal(numberedStore('downtown','en'),'1 · Wellesley');
});
test('Midland kilogram taro item is orderable only at Midland',()=>{
 const p={id:'midland-sheet-taro-base-1kg',category:'원재료·음료',subgroup:'음료 베이스'};assert.equal(availableForStore(p,'midland'),true);for(const s of ['finch','downtown','richmond-hill'])assert.equal(availableForStore(p,s),false);
});
test('confirmed November 24 locations cover food, beverage and office items without overriding rare cheesecake',async()=>{
 const {storageLocationNote}=await import('../dispatch-storage-model.mjs');
 const cases={
  frozen:['베이글','베이글 (박스)','두바이쫀득쿠키','오리지널 두바이쫀득쿠키','밤 치즈케이크 · 크림 포함','티라미수 치즈케이크','생지','유부'],
  'chilled-desserts':['딸기 4인치 홀케이크 (워크인)','망고 4인치 홀케이크 (워크인)','소세지빵','바나나 푸딩'],
  'chilled-ingredients':['아몬드 밀크','오트 밀크','스패너 크림','티라미수 크림 ( 음료제조용 )','화채 캔','미숫가루 캔','블루베리 티 캔','레몬','바나나','라임 페이스트','청포도 페이스트','콜드브루','말차 음료 베이스','갈릭마요소스 (베이킹용)','티라미수베이스 (티라미수제조용)','할라피뇨'],
  ambient:['죠리퐁','리얼 레몬 주스','딸기 청','삼각김밥 라벨스티커']
 };
 for(const [zone,names] of Object.entries(cases))for(const name_ko of names)assert.equal(storageZone({name_ko},'finch'),zone,name_ko);
 assert.equal(storageZone({name_ko:'삼각김밥 라벨 스티커',category:'포장·소모품'},'finch'),'ambient');
 assert.equal(storageLocationNote({name_ko:'삼각김밥 라벨스티커'}),'사무실');
 assert.equal(storageLocationNote({name_ko:'삼각김밥 라벨스티커'},'en'),'Office');
 assert.equal(storageLocationNote({name_ko:'티라미수베이스'}),'');
 assert.equal(storageZone(catalog[0],'finch'),'chilled-desserts');
 assert.equal(storageZone({name_ko:'딸기 크림치즈',subgroup:'베이글 & 크림치즈'},'finch'),'unassigned');
 assert.equal(storageZone({name_ko:'타로 음료 베이스'},'midland'),'unassigned');
});
