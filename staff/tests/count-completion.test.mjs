import fs from 'node:fs';import vm from 'node:vm';
import test from 'node:test';import assert from 'node:assert/strict';
import {countPhase,countProgress,closingCarryover} from '../count-game-policy.mjs';
import {createStepState,renderOrderSteps} from '../order-steps.mjs';
const opts={isMorning:p=>p.morning,isCounted:p=>p.done};
test('Toronto handover is 5 PM, persists after midnight and resets at 3 AM',()=>{
 for(const [date,closing] of [['2026-11-22T21:59:59Z',false],['2026-11-22T22:00:00Z',true],['2026-11-23T06:00:00Z',true],['2026-11-23T08:00:00Z',false],['2026-07-22T20:59:59Z',false],['2026-07-22T21:00:00Z',true]])assert.equal(countPhase(new Date(date)).handover,closing,date);
});
test('only unfinished morning items transfer; completing one cannot shrink another out of the list',()=>{
 const products=[{id:'cups',morning:true},{id:'base',morning:true,done:true},{id:'milk'}],carry=new Set();
 assert.deepEqual([...closingCarryover(products,carry,{...opts,now:new Date('2026-11-22T21:59:59Z')})],[]);
 assert.deepEqual([...closingCarryover(products,carry,{...opts,now:new Date('2026-11-22T22:00:00Z')})],['cups']);
 products[0].done=true;assert.deepEqual([...closingCarryover(products,carry,{...opts,now:new Date('2026-11-22T22:01:00Z')})],['cups']);
});
test('completion requires every unique shift item and no failed save',()=>{
 assert.equal(countProgress(['a','b','a'],new Set(['a'])).complete,false);
 assert.deepEqual(countProgress(['a','b'],new Set(['a','b']),new Set(['b'])).remaining,['b']);
 assert.equal(countProgress([],new Set()).complete,false);assert.equal(countProgress(['a','b'],new Set(['a','b'])).complete,true);
});
function screen({done=[],items=[{id:'a'}],required=['a','b'],typed={},failed=[],preview=false,fail=false,getRequiredIds}={}){
 const state=createStepState('trial','2026-11-22');state.done=new Set(done);state.failed=new Set(failed);state.typed={...typed};const warn={textContent:''},saved=[],basket=[],opened=[];
 const host={innerHTML:'',contains:()=>true,querySelector:selector=>selector==='#osWarn'?warn:null};
 const context={state,items,key:'all',title:'Trial',shift:'morning',allIds:required,getRequiredIds,preview,t:ko=>ko,esc:String,name:p=>p.id,unitLabel:()=>'',picture:()=>'',parse:(_,s)=>Number(s),lastStock:()=>null,getQty:()=>0,qtyStep:()=>1,qtyDisplay:(_,q)=>q,suggest:()=>1,saveStock:async(p,v)=>{if(fail)throw Error('offline');saved.push(v);},setQty:(_,v)=>basket.push(v),openBasket:()=>opened.push(true),goRemaining:id=>opened.push(id)};
 renderOrderSteps(host,context);
 const click=(os,extra={})=>host.onclick({target:{closest:()=>({dataset:{os,...extra}})}});
 return {state,host,warn,saved,basket,opened,click,draw:()=>renderOrderSteps(host,context)};
}
test('blank Next is blocked and never persists a count or changes the basket',async()=>{const s=screen();await s.click('next');assert.equal(s.state.index,0);assert.deepEqual(s.saved,[]);assert.deepEqual(s.basket,[]);assert.match(s.warn.textContent,/입력하거나/);});
test('zero is a valid saved answer, but filtered category completion cannot finish the shift',async()=>{const s=screen({typed:{a:'0'}});await s.click('next');assert.deepEqual(s.saved,[0]);assert.match(s.host.innerHTML,/아직 1개 품목/);assert.match(s.host.innerHTML,/data-os="basket" disabled/);await s.click('basket');assert.deepEqual(s.opened,[]);await s.click('remaining');assert.deepEqual(s.opened,['b']);});
test('jumping directly to the last item cannot bypass earlier mandatory items',async()=>{const s=screen({items:[{id:'a'},{id:'b'}],typed:{b:'2'}});await s.click('one',{go:'1'});await s.click('next');assert.match(s.host.innerHTML,/data-os="basket" disabled/);assert.deepEqual(s.saved,[2]);assert(!s.state.done.has('a'));});
test('failed save cannot advance or mark completion',async()=>{const s=screen({required:['a'],typed:{a:'2'},fail:true});await s.click('next');assert.equal(s.state.index,0);assert(!s.state.done.has('a'));assert(s.state.failed.has('a'));assert.deepEqual(s.basket,[]);});
test('only all saved items enable finish; a disabled DOM button cannot invoke it',async()=>{const s=screen({done:['a','b']});s.state.index=1;s.draw();assert.match(s.host.innerHTML,/data-os="basket" >/);await s.click('basket');assert.deepEqual(s.opened,[true]);});
test('5 PM handover is checked again at finish, even before a screen refresh',async()=>{let ids=['a'];const s=screen({done:['a'],getRequiredIds:()=>ids});s.state.index=1;s.draw();ids=['a','morning-leftover'];await s.click('basket');assert.deepEqual(s.opened,[]);assert.match(s.host.innerHTML,/아직 1개 품목/);});
test('preview cannot finish or create a saved stock record',async()=>{const s=screen({preview:true,done:['a','b'],typed:{a:'2'}});s.state.index=1;s.draw();await s.click('basket');assert.deepEqual(s.opened,[]);assert.deepEqual(s.saved,[]);});

test('actual basket submission blocks the game bypass and resumes the first unfinished category',async()=>{
 const app=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8'),source=app.slice(app.indexOf('function submitCurrentBasket(){'),app.indexOf('function orderActionLabel(){'));
 const state={done:new Set(['a']),failed:new Set(),key:'dessert'},calls=[];
 const context={store:'finch',orderView:'steps',uncertain:true,stepStateFor:()=>state,orderCatalog:()=>[{id:'a',unit_confirmed:true,category:'디저트'},{id:'b',unit_confirmed:true,category:'포장·소모품'}],skipCount:()=>false,inShift:()=>true,shiftOf:()=> 'closing',countProgress,renderOrderArea:()=>calls.push('resume'),say:msg=>calls.push(msg),t:ko=>ko,run:async fn=>fn(),completeBasketSubmission:async()=>calls.push('submitted')};
 vm.createContext(context);vm.runInContext(source,context);await vm.runInContext('submitCurrentBasket()',context);assert(!calls.includes('submitted'));assert.equal(context.category,'포장·소모품');assert.equal(state.key,'');assert.match(calls[1],/아직 1개/);
 state.done.add('b');await vm.runInContext('submitCurrentBasket()',context);assert.equal(calls.at(-1),'submitted');
});
