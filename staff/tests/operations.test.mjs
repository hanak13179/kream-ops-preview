import test from 'node:test';import assert from 'node:assert/strict';
import {outstanding,receiptPayload,canEditGuide} from '../operations.mjs';
const order={id:'o1',dispatch_finalized_at:'2026-11-22T12:00Z',kream_order_items:[{product_id:'a',quantity:5},{product_id:'b',quantity:2}]};
const sent=[{order_id:'o1',kream_dispatch_items:[{product_id:'a',quantity:5},{product_id:'b',quantity:2}]}];
const receipts=[{order_id:'o1',kream_receipt_items:[{product_id:'a',quantity:3}]},{order_id:'different',kream_receipt_items:[{product_id:'a',quantity:90}]}];
test('partial receipts show remaining per order, not another store/order',()=>{assert.deepEqual(outstanding(order,receipts).map(p=>[p.received,p.remaining]),[[3,2],[0,2]]);});
test('receipt rejects excess, negative, unknown, precision and empty; never assumes all arrived',()=>{for(const values of [{a:3},{a:-1},{z:1},{a:0.0001},{a:''},{a:0}])assert.throws(()=>receiptPayload(order,receipts,values,sent));assert.deepEqual(receiptPayload(order,receipts,{a:2,b:''},sent),[{product_id:'a',quantity:2}]);});
test('published global documents are owner-editable, store documents manager-editable; staff read only',()=>{assert.equal(canEditGuide({role:'employee'},{store_id:'finch'}),false);assert.equal(canEditGuide({role:'manager'},{store_id:null}),false);assert.equal(canEditGuide({role:'manager'},{store_id:'finch'}),true);assert.equal(canEditGuide({role:'owner'},{store_id:null}),true);});
test('new receipts cannot exceed quantities actually dispatched',()=>{const order={id:'o',dispatch_finalized_at:'2026-11-22T12:00Z',kream_order_items:[{product_id:'milk',quantity:10}]},ds=[{order_id:'o',kream_dispatch_items:[{product_id:'milk',quantity:3}]}];assert.equal(outstanding(order,[],ds)[0].receivable,3);assert.throws(()=>receiptPayload(order,[],{milk:4},ds),/RECEIPT_INVALID/);});

test('unconfirmed dispatch never creates receivable stock',()=>{const pending={id:'pending',kream_order_items:[{product_id:'milk',quantity:10}]};assert.equal(outstanding(pending,[],[{order_id:'pending',kream_dispatch_items:[{product_id:'milk',quantity:3}]}])[0].receivable,0);});
