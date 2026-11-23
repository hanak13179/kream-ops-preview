import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canFinalizeMidland,midlandEditOpen,groupOrdersByDelivery,midlandReviewStatus,requestMidlandReview,renderGroupedOrderHistory} from '../order-review.mjs';
const manager={role:'midland_owner',active:true},employee={role:'employee',active:true};
const order={id:'a',store_id:'midland',delivery_date:'2026-11-20',status:'submitted',source_kind:'store'};
test('only active store managers and owners get final actions',()=>{
 assert.equal(canFinalizeMidland(employee),false);
 assert.equal(canFinalizeMidland(manager),true);
 assert.equal(canFinalizeMidland({role:'owner',active:false}),false);
 assert.equal(canFinalizeMidland({role:'factory',active:true,factory_manager:true,store_manager:false}),false);
 assert.equal(canFinalizeMidland({role:'factory',active:true,factory_manager:true,store_manager:true}),true);
});
test('Toronto 03:00 deadline works in winter and summer and never unlocks fulfillment',()=>{
 assert.equal(midlandEditOpen(order,manager,new Date('2026-11-20T07:59:59Z')),true);
 assert.equal(midlandEditOpen(order,manager,new Date('2026-11-20T08:00:00Z')),false);
 assert.equal(midlandEditOpen({...order,delivery_date:'2026-07-20'},manager,new Date('2026-07-20T06:59:59Z')),true);
 assert.equal(midlandEditOpen({...order,delivery_date:'2026-07-20'},manager,new Date('2026-07-20T07:00:00Z')),false);
 for(const override of [{dispatch_finalized_at:'2026-11-19T01:00Z'},{status:'received'},{source_kind:'factory'},{store_id:'finch'}])assert.equal(midlandEditOpen({...order,...override},manager,new Date('2026-11-19T01:00Z')),false);
 assert.equal(midlandEditOpen(order,employee,new Date('2026-11-19T01:00Z')),false);
 assert.equal(midlandEditOpen(order,manager,new Date('2026-11-19T01:00Z'),[{order_id:'a'}]),false);
 assert.equal(midlandEditOpen(order,manager,new Date('2026-11-19T01:00Z'),[],[{order_id:'a'}]),false);
});
test('same store/date additions combine once, retain units, exclude cancellations and leave records intact',()=>{
 const item=(id,quantity,unit='EA')=>({product_id:id,name_ko:id,order_unit:unit,quantity});
 const rows=[{...order,kream_order_items:[item('milk',2),item('slices',0.5,'Tray')]},{...order,id:'b',kream_order_items:[item('milk',3),item('slices',1,'Tray'),item('slices',2,'EA')]},{...order,id:'cancelled',status:'cancelled',kream_order_items:[item('milk',99)]},{...order,id:'other-store',store_id:'finch',kream_order_items:[item('milk',7)]},{...order,id:'other-day',delivery_date:'2026-11-21',kream_order_items:[item('milk',11)]}];
 const before=JSON.stringify(rows),groups=groupOrdersByDelivery(rows),g=groups.find(g=>g.store_id==='midland'&&g.delivery_date==='2026-11-20');
 assert.equal(groups.length,3);assert.equal(g.orders.length,3);
 assert.equal(g.items.find(p=>p.product_id==='milk').quantity,5);
 assert.equal(g.items.find(p=>p.product_id==='slices'&&p.order_unit==='Tray').quantity,1.5);
 assert.equal(g.items.find(p=>p.product_id==='slices'&&p.order_unit==='EA').quantity,2);
 assert.equal(JSON.stringify(rows),before);
 assert.ok(g.orders.every(o=>rows.includes(o)));
});
test('review requests retain revision and later staff edits are flagged',async()=>{
 let args;const db={rpc:async(fn,value)=>{assert.equal(fn,'kream_request_midland_review');args=value;return {data:{id:'basket',review_requested_at:'2026-11-20T01:00Z'}};}};
 await requestMidlandReview(db,{id:'basket',revision:4});assert.deepEqual(args,{draft_id:'basket',expected_revision:4});
 const markup=midlandReviewStatus({review_requested_at:'2026-11-20T01:00Z',review_changed_since_request:true},{t:a=>a,esc:String});
 assert.match(markup,/변경된 내용 있음/);assert.match(markup,/관리자 재검토 필요/);
 const error={message:'BASKET_CHANGED'};await assert.rejects(requestMidlandReview({rpc:async()=>({error})},{id:'b',revision:1}),e=>e===error);
});
test('actual app submit handler routes Midland staff to review, other stores still submit',async()=>{
 const app=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('function submitCurrentBasket(){'),app.indexOf('function orderActionLabel(){'));
 const calls=[];const context={store:'midland',orderView:'grid',uncertain:true,screenProfile:()=>employee,canFinalizeMidland,requestCurrentMidlandReview:()=>calls.push('review'),run:async fn=>fn(),completeBasketSubmission:async()=>calls.push('final')};
 vm.createContext(context);vm.runInContext(source,context);await vm.runInContext('submitCurrentBasket()',context);assert.deepEqual(calls,['review']);
 context.store='finch';await vm.runInContext('submitCurrentBasket()',context);assert.deepEqual(calls,['review','final']);
 context.store='midland';context.screenProfile=()=>manager;await vm.runInContext('submitCurrentBasket()',context);assert.deepEqual(calls,['review','final','final']);
});
test('combined history exposes individual references without employee edit controls',()=>{
 const host={innerHTML:'',querySelectorAll:()=>[]};
 renderGroupedOrderHistory(host,{t:a=>a,esc:String,name:p=>p.name_ko,orders:[{...order,kream_order_items:[{product_id:'milk',name_ko:'우유',order_unit:'EA',quantity:1}]},{...order,id:'b',kream_order_items:[{product_id:'milk',name_ko:'우유',order_unit:'EA',quantity:2}]}],stores:[{id:'midland',name:'Midland'}],profile:employee,lang:'ko',orderReference:id=>id});
 assert.match(host.innerHTML,/추가발주 포함/);assert.match(host.innerHTML,/3 EA/);assert.match(host.innerHTML,/개별 발주 내역/);assert.doesNotMatch(host.innerHTML,/data-amend-order=/);
});
