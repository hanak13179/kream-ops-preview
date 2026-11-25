import test from 'node:test';
import assert from 'node:assert/strict';
import {receivingSections,receiptInputQuantity,receiptCanComplete,receiptNeedsReason} from '../receiving-state.mjs';
import {receivingLayout} from '../receiving-layout.mjs';
const rows=[{product_id:'a',name_ko:'품목 A',name_en:'Item A',order_unit:'EA',quantity:4,receivable:4,received:0},{product_id:'b',name_ko:'품목 B',name_en:'Item B',order_unit:'EA',quantity:2,receivable:2,received:0},{product_id:'old',receivable:0}];
const order={id:'o',store_id:'finch',delivery_date:'2026-11-25',dispatch_finalized_at:'2026-11-25T12:00:00Z'};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const layout=(store_id,values={},inputs={})=>receivingLayout({t:k=>k,esc,stores:[{id:store_id,name:store_id}],receipts:[],dispatches:[],name:p=>p.name_ko,lang:'ko'},{list:[{...order,store_id}],order:{...order,store_id},rows,writable:true,waiting:false,values,inputs,note:'',expanded:new Set([store_id]),completed:null,outstanding:()=>rows});
test('confirmation moves items below; missing zero counts as checked and undo restores source order',()=>{
 const values={b:0};assert.deepEqual(receivingSections(rows,values).pending.map(p=>p.product_id),['a']);assert.deepEqual(receivingSections(rows,values).checked.map(p=>p.product_id),['b']);
 values.a=3;assert.equal(receivingSections(rows,values).pending.length,0);delete values.a;assert.deepEqual(receivingSections(rows,values).pending.map(p=>p.product_id),['a']);
 delete values.b;assert.deepEqual(receivingSections(rows,values).pending.map(p=>p.product_id),['a','b']);
});
test('typing a quantity alone leaves the item pending; confirmation renders it only in completed list',()=>{
 const html=layout('finch',{}, {a:'3'});assert.match(html,/data-receive="a"[^>]*value="3"/);assert.doesNotMatch(html,/data-receive-undo="a"/);
 const checked=layout('finch',{a:3});assert.doesNotMatch(checked,/data-receive="a"/);assert.match(checked,/data-receive-undo="a"/);assert.match(checked,/차이/);
});
test('all items must be checked; only Midland needs a difference reason, including zero missing',()=>{
 for(const store_id of ['finch','downtown','richmond-hill']){assert.equal(receiptCanComplete({store_id},rows,{a:3,b:0}),true);assert.equal(receiptNeedsReason({store_id},rows,{a:3,b:0}),false);assert.doesNotMatch(layout(store_id,{a:3,b:0}),/id="receiptNote"/);}
 assert.equal(receiptCanComplete(order,rows,{a:4}),false);
 assert.equal(receiptCanComplete({store_id:'midland'},rows,{a:3,b:0}),false);
 assert.equal(receiptCanComplete({store_id:'midland'},rows,{a:3,b:0},'Missing on delivery'),true);
 assert.equal(receiptCanComplete({store_id:'midland'},rows,{a:4,b:2}),true);
 assert.match(layout('midland',{a:3,b:0}),/id="receiptNote"[^>]*required/);
});
test('receipt quantities enforce finite precision and preserve half-box base units',()=>{
 const item={product_id:'regular',order_unit:'EA'};
 for(const raw of ['', '-1','NaN','Infinity','100001','0.0001'])assert.throws(()=>receiptInputQuantity(item,raw));
 assert.equal(receiptInputQuantity(item,'0'),0);assert.equal(receiptInputQuantity(item,'0.125'),0.125);
 const box={product_id:'chewy',name_ko:'오리지널 두바이쫀득쿠키',order_unit:'EA'};
 assert.equal(receiptInputQuantity(box,'0.5'),32);
});
