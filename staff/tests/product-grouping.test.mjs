import test from 'node:test';
import assert from 'node:assert/strict';
import {sortCatalog,sortProductRows} from '../order-layout.mjs';
const products=[
 {id:'matcha-cookie',name_ko:'말차 쿠키',category:'디저트',subgroup:'쿠키'},
 {id:'matcha-chewy',name_ko:'말차 두바이쫀득쿠키',category:'디저트',subgroup:'쿠키'},
 {id:'choco-cookie',name_ko:'초코 쿠키',category:'디저트',subgroup:'쿠키'},
 {id:'original-chewy',name_ko:'오리지널 두바이쫀득쿠키',category:'디저트',subgroup:'쿠키'},
 {id:'cake',name_ko:'케이크',category:'디저트',subgroup:'케이크'}
];
test('mixed saved ranks cannot separate product kinds',()=>{
 const result=sortCatalog(products,{product_order:['matcha-chewy','cake','choco-cookie','original-chewy','matcha-cookie']});
 assert.deepEqual(result.map(p=>p.id),['choco-cookie','matcha-cookie','matcha-chewy','original-chewy','cake']);
});
test('order and dispatch rows retain their snapshot data and quantities',()=>{
 const rows=products.map(p=>({product_id:p.id,name_ko:p.name_ko,quantity:3,order_unit:'EA'}));
 const before=JSON.stringify(rows),result=sortProductRows(rows,products);
 assert.deepEqual(result.map(p=>p.product_id),['matcha-cookie','choco-cookie','matcha-chewy','original-chewy','cake']);
 assert.equal(JSON.stringify(rows),before);
 assert.ok(result.every(p=>rows.includes(p)&&p.quantity===3&&p.order_unit==='EA'));
});
test('barcode-only product catalogs resolve the correct kinds',()=>{
 const catalog=[{barcode:'cake',category:'디저트',subgroup:'케이크'},{barcode:'cookie',category:'디저트',subgroup:'쿠키'}];
 const rows=[{barcode:'cookie',quantity:2},{barcode:'cake',quantity:1},{barcode:'unknown',quantity:4}];
 const result=sortProductRows(rows,catalog);
 assert.deepEqual(result.map(p=>p.barcode),['unknown','cookie','cake']);
 assert.ok(result.every(p=>rows.includes(p)));
});
