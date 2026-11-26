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
