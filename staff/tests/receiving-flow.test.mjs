import test from 'node:test';import assert from 'node:assert/strict';
import {renderReceiving,clearModuleState,hasModuleEdits} from '../operations.mjs';
class Host{
 constructor(){this.nodes=[];this.html='';}
 set innerHTML(html){this.html=html;this.nodes=[...html.matchAll(/<(button|input|textarea|select|details)\b([^>]*)>/g)].map(([,tag,attrs])=>{const a=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));return {tag,attrs:a,dataset:Object.fromEntries(Object.entries(a).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,s)=>s.toUpperCase()),v])),value:a.value??'',disabled:/\bdisabled\b/.test(attrs),open:/\bopen\b/.test(attrs),setCustomValidity(){},reportValidity(){}};});}
 get innerHTML(){return this.html;}
 querySelectorAll(s){const key=s.match(/^\[([^\]]+)\]$/)?.[1];return this.nodes.filter(n=>key in n.attrs);}
 querySelector(s){return s.startsWith('#')?this.nodes.find(n=>n.attrs.id===s.slice(1)):this.querySelectorAll(s)[0];}
 append(){}
 prepend(){}
 setAttribute(){}
}
const item=(product_id,quantity)=>({product_id,quantity,name_ko:product_id,name_en:product_id,order_unit:'EA'});
async function withEnvironment(fn){const oldDocument=globalThis.document,oldConfirm=globalThis.confirm;globalThis.document={createElement:()=>new Host()};globalThis.confirm=()=>true;clearModuleState();try{await fn();}finally{clearModuleState();globalThis.document=oldDocument;globalThis.confirm=oldConfirm;}}
function setup(store='finch',rpc=async()=>({data:'ok'})){
 const host=new Host(),items=[item('a',4),item('b',2)],o={id:'order',status:'submitted',dispatch_finalized_at:'2026-11-25T10:00:00Z',delivery_date:'2026-11-25',store_id:store,kream_order_items:items};
 const shared={ready:true,status:'live',saving:false,lines:items.map(x=>({order_id:o.id,product_id:x.product_id,basis_quantity:x.quantity,source_version:'1:',revision:0,checked:false,quantity:x.quantity})),async save(changes){for(const x of changes){const old=this.lines.find(y=>y.product_id===x.product_id);assert.equal(x.revision,old.revision);Object.assign(old,x,{revision:old.revision+1});}},async refresh(){}};
 const c={sharedWorkflow:shared,orders:[o],receipts:[],dispatches:[{order_id:o.id,kream_dispatch_items:items}],catalog:items.map(x=>({...x,id:x.product_id})),stores:[{id:store,name:store}],store,profile:{role:'employee'},t:k=>k,esc:s=>String(s??''),name:p=>p.name_ko,lang:'ko',preview:false,say(){},reload:async()=>{},db:{rpc,from(){return {select(){return this},neq(){return this},order(){return this},limit(){return this},eq(){return Promise.resolve({data:[]})}}}},act:async fn=>{try{return await fn()}finally{renderReceiving(host,c)}}};
 renderReceiving(host,c);return {host,c};
}
const choice=(host,id,value)=>host.querySelectorAll('[data-receive-choice]').find(b=>b.dataset.receiveProduct===id&&b.dataset.receiveChoice===value);
test('real receiving handlers require explicit confirmation, preserve edited quantity and missing zero, and retry the identical payload',()=>withEnvironment(async()=>{
 const calls=[];const {host}=setup('finch',async(name,payload)=>{calls.push(structuredClone(payload));if(calls.length===1)return {error:new Error('connection uncertain')};return {data:payload.request_id}});
 const input=host.querySelectorAll('[data-receive]').find(x=>x.dataset.receive==='a');input.value='3';input.oninput();assert.equal(hasModuleEdits(),true);assert.equal(host.querySelector('#confirmReceipt').disabled,true);
 await choice(host,'a','full').onclick();assert.equal(host.querySelectorAll('[data-receive]').length,1);await host.querySelectorAll('[data-receive-undo]')[0].onclick();assert.equal(host.querySelectorAll('[data-receive]').find(x=>x.dataset.receive==='a').value,'3');
 await choice(host,'a','full').onclick();await choice(host,'b','none').onclick();assert.equal(host.querySelectorAll('[data-receive]').length,0);assert.equal(host.querySelector('#confirmReceipt').disabled,false);
 await assert.rejects(host.querySelector('#confirmReceipt').onclick(),/connection uncertain/);assert.equal(host.querySelectorAll('[data-receive-undo]')[0].disabled,true);
 await host.querySelector('#confirmReceipt').onclick();assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1].actual_items,[{product_id:'a',quantity:3},{product_id:'b',quantity:0}]);assert.equal(calls[1].receipt_note,'');
}));
test('Midland handler blocks discrepancy submission until a reason is entered',()=>withEnvironment(async()=>{
 const calls=[];const {host}=setup('midland',async(name,payload)=>{calls.push(payload);return {data:'ok'}});
 await choice(host,'a','none').onclick();await host.querySelector('#fillReceipt').onclick();assert.equal(host.querySelector('#confirmReceipt').disabled,true);
 await host.querySelector('#confirmReceipt').onclick();assert.equal(calls.length,0);
 const note=host.querySelector('#receiptNote');note.value='One item missing';note.oninput({target:note});assert.equal(host.querySelector('#confirmReceipt').disabled,false);
 await host.querySelector('#confirmReceipt').onclick();assert.equal(calls.length,1);assert.equal(calls[0].receipt_note,'One item missing');
}));
