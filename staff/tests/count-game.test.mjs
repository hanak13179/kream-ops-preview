import test from 'node:test';import assert from 'node:assert/strict';
import {createStepState,renderOrderSteps} from '../order-steps.mjs';
import {incomingQuantity} from '../count-planning.mjs';
import {sheetUnitPolicy} from '../sheet-unit-policy.mjs';
function screen({binary=false,preview=false,fail=false}={}){
 const p={id:'p'},state=createStepState('finch','2026-11-22'),saved=[],checks=[],basket=[];state.typed.p=binary?'1':'5';state.edited.add('p');
 const host={innerHTML:'',contains:()=>true,querySelector:()=>null};
 renderOrderSteps(host,{state,items:[p],key:'all',t:ko=>ko,esc:String,name:()=> 'Product',unitLabel:()=> 'Box',picture:()=>'',lastStock:()=>9,parse:(_,s)=>Number(s),getQty:()=>0,setQty:(_,q)=>basket.push(q),qtyStep:()=>1,qtyDisplay:(_,q)=>q,yesNo:()=>binary,suggest:()=>3,saveStock:async(_,n)=>{if(fail)throw Error('conflict');saved.push(n);},saveAvailability:async(_,has)=>{if(fail)throw Error('offline');checks.push(has);},allIds:[],preview});
 return {host,state,saved,checks,basket,commit:()=>host.onclick({target:{closest:()=>({dataset:{os:'prev'}})}})};
}
test('availability answers never overwrite a physical stock quantity',async()=>{const s=screen({binary:true});await s.commit();assert.deepEqual(s.saved,[]);assert.deepEqual(s.checks,[true]);assert.equal(s.state.done.has('p'),true);});
test('a failed count does not change basket or mark the item done',async()=>{const s=screen({fail:true});await s.commit();assert.deepEqual(s.basket,[]);assert.equal(s.state.done.has('p'),false);assert.equal(s.state.failed.has('p'),true);});
test('successful physical count is saved before changing basket; preview saves nothing',async()=>{const s=screen();await s.commit();assert.deepEqual(s.saved,[5]);assert.deepEqual(s.basket,[3]);const preview=screen({preview:true});await preview.commit();assert.deepEqual(preview.saved,[]);assert.deepEqual(preview.basket,[]);assert.equal(preview.state.edited.size,0);});
const order=(id,date,quantity,extra={})=>({id,delivery_date:date,store_id:'finch',status:'submitted',kream_order_items:[{product_id:'p',quantity}],...extra});
const planned=extra=>incomingQuantity({store:'finch',today:'2026-11-22',date:'2026-11-23',product:'p',...extra});
test('future deliveries and other stores cannot suppress tomorrow order',()=>{assert.equal(planned({orders:[order('a','2026-11-23',3),order('b','2026-12-15',100),order('c','2026-11-23',20,{store_id:'downtown'})]}),3);});
test('partial receipts subtract only received units; finalized dispatch uses actual sent',()=>{const orders=[order('a','2026-11-23',10,{dispatch_finalized_at:'now'})],dispatches=[{order_id:'a',kream_dispatch_items:[{product_id:'p',quantity:6}]}],receipts=[{order_id:'a',kream_receipt_items:[{product_id:'p',quantity:2}]}];assert.equal(planned({orders,dispatches,receipts}),4);assert.equal(planned({orders:[order('a','2026-11-23',10,{status:'received'})]}),0);});
test('owner-confirmed retail portions and financier pack sizes differ correctly',()=>{assert.equal(sheetUnitPolicy({subgroup:'미니 스콘',order_unit:'Bag'}).package_quantity,3);assert.equal(sheetUnitPolicy({subgroup:'휘낭시에',order_unit:'Bag'}).package_quantity,20);assert.equal(sheetUnitPolicy({name_ko:'오미자 시럽'}).mode,'availability');});
