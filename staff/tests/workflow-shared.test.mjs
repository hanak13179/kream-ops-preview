import test from 'node:test';import assert from 'node:assert/strict';
import {workflowMap,workflowKey,workflowTokens,dispatchSharedEntries} from '../workflow-shared.mjs';
import {rowEntryKey} from '../dispatch-storage-model.mjs';
test('dispatch aggregation waits for every source order, keeps zero and maps totals back to stores',()=>{
 const row={key:'cake',stores:{finch:5,midland:2},parts:[{orderId:'a',productId:'cake',storeId:'finch',remaining:3},{orderId:'b',productId:'cake',storeId:'finch',remaining:2},{orderId:'c',productId:'cake',storeId:'midland',remaining:2}]};
 const a={order_id:'a',product_id:'cake',checked:true,basis_quantity:3,quantity:2,revision:1,source_version:'1:'},b={...a,order_id:'b',basis_quantity:2,quantity:0},c={...b,order_id:'c',quantity:2};
 assert.deepEqual(dispatchSharedEntries([row],[a,c],rowEntryKey),{[rowEntryKey(row,'midland')]:2});
 assert.deepEqual(dispatchSharedEntries([row],[a,b,c],rowEntryKey),{[rowEntryKey(row,'finch')]:2,[rowEntryKey(row,'midland')]:2});
 assert.equal(Object.hasOwn(dispatchSharedEntries([row],[a,{...b,basis_quantity:1},c],rowEntryKey),rowEntryKey(row,'finch')),false);
 assert.deepEqual(workflowTokens([a,b,c],'b'),[{product_id:'cake',revision:1,source_version:'1:'}]);assert.equal(workflowMap([a,b]).get(workflowKey('b','cake')),b);
});

test('saving waits for an overlapping old snapshot and the catch-up snapshot before reporting success',async()=>{
 const {watchWorkflow,stopWorkflows}=await import('../workflow-shared.mjs');const oldDoc=globalThis.document;globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
 let lines=[{order_id:'a',product_id:'cake',revision:0,checked:false}],hold=null,release;
 const channel={on(){return this},subscribe(){return this}};
 const db={channel:()=>channel,removeChannel(){},async rpc(name){if(name==='kream_save_workflow_checks'){lines=[{...lines[0],revision:1,checked:true}];return {data:structuredClone(lines)};}const snapshot=structuredClone(lines);if(hold){hold=false;await new Promise(resolve=>release=resolve);}return {data:snapshot};}};
 try{const shared=watchWorkflow({isConnected:true},{db,flow:'dispatch',ids:['a']});await shared.refresh();hold=true;const old=shared.refresh();let finished=false;const saved=shared.save([]).then(()=>{finished=true;});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(finished,false);release();await Promise.all([old,saved]);assert.equal(shared.lines[0].revision,1);assert.equal(shared.lines[0].checked,true);}finally{stopWorkflows();globalThis.document=oldDoc;}
});
