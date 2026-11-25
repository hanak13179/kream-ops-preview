import test from 'node:test';import assert from 'node:assert/strict';
import {orderStatus,missedOrders,soldOut,longSoldOut,staleCounts,factoryOut,lowMaterials,notReceived,attendance,openPunches,scheduleProblems,headline} from '../hr-logic.mjs';
import {zonedToISO} from '../team-logic.mjs';
const today='2026-11-25';
const catalog=[{id:'a',name_ko:'딸기 케이크'},{id:'b',name_ko:'우유'},{id:'c',name_ko:'옛날 품목',archived:true}];
test('orders: tomorrow done / in progress / missed days',()=>{
 const orders=[{store_id:'finch',delivery_date:'2026-11-26',status:'submitted'},{store_id:'downtown',delivery_date:'2026-11-26',status:'cancelled'},{store_id:'finch',delivery_date:'2026-11-24',status:'dispatched',id:'o1',kream_order_items:[{product_id:'a',quantity:2}]}];
 const s=orderStatus({stores:['downtown','finch'],orders,baskets:[{store_id:'downtown',delivery_date:'2026-11-26',items:[{product_id:'b'}]}],today});
 assert.deepEqual(s.map(x=>[x.store_id,x.done,x.inProgress]),[['downtown',false,true],['finch',true,false]]);
 const m=missedOrders({stores:['finch'],orders,today,days:3});assert.deepEqual(m.map(x=>x.date),['2026-11-23','2026-11-25']);
 assert.deepEqual(notReceived({orders,receipts:[],today}).map(x=>x.id),['o1']);
 assert.equal(notReceived({orders,receipts:[{order_id:'o1'}],today}).length,0);
});
test('stock: sold out, long sold out, stale counts',()=>{
 const stock=[{store_id:'finch',product_id:'a',on_hand:0,physical_count_at:'2026-11-25T15:00:00Z'},{store_id:'finch',product_id:'b',on_hand:0,physical_count_at:'2026-11-10T15:00:00Z'},{store_id:'finch',product_id:'c',on_hand:0},{store_id:'downtown',product_id:'a',on_hand:3,physical_count_at:'2026-11-25T15:00:00Z'}];
 const so=soldOut({stock,catalog,stores:['downtown','finch']});assert.deepEqual(so.finch.map(x=>x.name),['딸기 케이크','우유']);assert.equal(so.downtown.length,0);
 const orders=[{store_id:'finch',delivery_date:'2026-11-24',status:'dispatched',kream_order_items:[{product_id:'a',quantity:2}]}];
 assert.deepEqual(longSoldOut({stock,orders,catalog,today,stores:['finch']}).map(x=>x.product_id),['b']);   // 딸기는 어제 들어옴
 assert.deepEqual(staleCounts({stock,catalog,today,stores:['finch']}).finch.map(x=>x.product_id),['b']);
});
test('factory and materials',()=>{
 assert.deepEqual(factoryOut({finished:[{product_id:'a',quantity:-34},{product_id:'b',quantity:5},{product_id:'c',quantity:0}],catalog}).map(x=>[x.name,x.quantity]),[['딸기 케이크',-34]]);
 assert.deepEqual(lowMaterials([{id:1,name_ko:'설탕',on_hand:2,minimum:5},{id:2,name_ko:'밀가루',on_hand:10,minimum:5},{id:3,name_ko:'미정',on_hand:null}]).map(x=>x.name),['설탕']);
});
test('people: late, no-show, open punches, schedule problems, headline',()=>{
 const people=[{id:'u1',name:'Amy'},{id:'u2',name:'Ben'}];
 const shifts=[{id:'1',user_id:'u1',store_id:'finch',date:'2026-11-24',start_min:600,end_min:960},{id:'2',user_id:'u2',store_id:'finch',date:'2026-11-24',start_min:600,end_min:960},
  {id:'3',user_id:null,store_id:'finch',date:'2026-11-27',start_min:600,end_min:960},{id:'4',user_id:'u1',store_id:'downtown',date:'2026-12-01',start_min:600,end_min:960,published:false}];
 const timecards=[{id:'t1',user_id:'u1',store_id:'finch',clock_in:zonedToISO('2026-11-24',615),clock_out:zonedToISO('2026-11-24',960)},{id:'t2',user_id:'u2',store_id:'finch',clock_in:zonedToISO('2026-11-23',600),clock_out:null}];
 const now=new Date(zonedToISO(today,700));
 const a=attendance({shifts,timecards,people,today,now});
 assert.deepEqual(a.map(r=>[r.name,r.late.length,r.noShow.length]),[['Ben',0,1],['Amy',1,0]]);
 assert.deepEqual(openPunches({timecards,people,now}).map(x=>x.name),['Ben']);
 const p=scheduleProblems({stores:['downtown','finch'],shifts,people,today,timeOff:[{status:'pending'}]});
 assert.deepEqual(p.unpublished.map(x=>[x.store_id,x.drafts]),[['downtown',1],['finch',0]]);assert.equal(p.open.length,1);assert.equal(p.pendingTimeOff,1);
 const h=headline({nowMin:23*60,orders:[{done:false}],cash:[{done:false},{done:true}],attendanceRows:a,open:[1],problems:p,sold:{finch:[1,2]},factory:1,notRec:0,pendingAccounts:2});
 assert.deepEqual(h.map(x=>x.key),['order','cash','open','noshow','late','schedule','soldout','factory','accounts']);
});
import {carriedSet,ORDER_DUE_MIN} from '../hr-logic.mjs';
test('only items the store actually carries count as sold out; evening-only red; counted factory only',()=>{
 const stock=[{store_id:'midland',product_id:'x',on_hand:0},{store_id:'midland',product_id:'y',on_hand:0},{store_id:'finch',product_id:'z',on_hand:0,minimum:2}];
 const carried=carriedSet({stock,rules:[],orders:[{store_id:'midland',status:'dispatched',kream_order_items:[{product_id:'x',quantity:3}]}]});
 const so=soldOut({stock,catalog:[],stores:['midland','finch'],carried});
 assert.deepEqual(so.midland.map(x=>x.product_id),['x']);assert.deepEqual(so.finch.map(x=>x.product_id),['z']);
 const base={cash:[{done:false}],attendanceRows:[],open:[],problems:{unpublished:[],open:[],conflicts:[],pendingTimeOff:0,pendingSwaps:0,pendingFixes:0},sold:{},factory:0,notRec:0,pendingAccounts:0,orders:[{done:false}]};
 assert.deepEqual(headline({...base,nowMin:12*60}).map(x=>x.key),[]);
 assert.deepEqual(headline({...base,nowMin:ORDER_DUE_MIN}).map(x=>x.key),['order']);
 assert.deepEqual(factoryOut({finished:[{product_id:'a',quantity:-5,counted:false},{product_id:'b',quantity:0,counted:true}],catalog:[]}).map(x=>x.product_id),['b']);
});
test('sold out that is already on today/tomorrow order is marked coming and not counted',()=>{
 const so=soldOut({stock:[{store_id:'finch',product_id:'a',on_hand:0},{store_id:'finch',product_id:'b',on_hand:0}],catalog:[],stores:['finch'],orders:[{store_id:'finch',delivery_date:'2026-11-26',status:'submitted',kream_order_items:[{product_id:'a',quantity:1}]}],today:'2026-11-25'});
 assert.deepEqual(so.finch.map(x=>[x.product_id,x.coming]),[['a',true],['b',false]]);
 const base={orders:[],cash:[],attendanceRows:[],open:[],problems:{unpublished:[],open:[],conflicts:[],pendingTimeOff:0,pendingSwaps:0,pendingFixes:0},factory:0,notRec:0,pendingAccounts:0};
 assert.deepEqual(headline({...base,sold:so}).map(x=>[x.key,x.n]),[['soldout',1]]);
});
