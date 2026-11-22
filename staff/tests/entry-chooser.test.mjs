import test from 'node:test';import assert from 'node:assert/strict';
import {assignedWorkplaces,chooseWorkplace,clearWorkplaceChoice} from '../entry-chooser.mjs';
const stores=[{id:'downtown',name:'Wellesley'},{id:'midland',name:'Midland'},{id:'finch',name:'Finch'}];
test('assignment restricts single, multiple and combined workplaces',()=>{
 const scope=p=>assignedWorkplaces({active:true,...p},stores);
 assert.deepEqual(scope({role:'employee',store_ids:['downtown']}),{stores:[stores[0]],factory:false});
 assert.deepEqual(scope({role:'employee',store_ids:['downtown','finch']}).stores,[stores[0],stores[2]]);
 assert.deepEqual(scope({role:'factory',factory_manager:true,store_manager:true,store_ids:['finch']}),{stores:[stores[2]],factory:true});
 assert.deepEqual(scope({role:'factory',store_ids:['finch']}),{stores:[],factory:true});
 assert.equal(scope({role:'manager',store_ids:['midland']}).factory,false);
 assert.equal(scope({role:'owner'}).factory,true);
 assert.equal(scope({role:'manager',general_manager:true}).factory,false);
 assert.deepEqual(scope({role:'employee',active:false,store_ids:['finch']}),{stores:[],factory:false});
});
test('one workplace still asks; saved choices are isolated per account and revalidated',async()=>{
 const mem=new Map();globalThis.sessionStorage={getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
 let current;globalThis.document={getElementById:()=>true,createElement:()=>({setAttribute(){},remove(){},addEventListener(_,fn){this.click=fn;}}),body:{appendChild(el){current=el;}}};
 const first=chooseWorkplace({stores:[stores[0]],userId:'a'});assert.match(current.innerHTML,/data-entry="downtown"/);assert.doesNotMatch(current.innerHTML,/data-entry="finch"/);
 current.click({target:{closest:()=>({dataset:{entry:'downtown'}})}});assert.deepEqual(await first,{storeId:'downtown'});
 assert.deepEqual(await chooseWorkplace({stores:[stores[0]],userId:'a'}),{storeId:'downtown'});
 current=null;const other=chooseWorkplace({stores:[stores[0]],userId:'b'});assert.ok(current);current.click({target:{closest:()=>({dataset:{entry:'downtown'}})}});await other;
 current=null;const changed=chooseWorkplace({stores:[stores[2]],userId:'a'});assert.match(current.innerHTML,/data-entry="finch"/);current.click({target:{closest:()=>({dataset:{entry:'finch'}})}});await changed;
 clearWorkplaceChoice('a');assert.equal(mem.get('kream-entry-choice:a'),undefined);
});
