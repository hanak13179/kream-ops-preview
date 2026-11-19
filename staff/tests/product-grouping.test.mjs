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

test('beverage kinds stay contiguous despite mixed saved ranks',()=>{
 const items=['레몬 에이드','딸기 청','말차 드링크 베이스','패션프루트 청','패션프루트 퓨레','타로 음료 베이스','오미자 시럽','청포도 에이드'].map((name_ko,i)=>({id:String(i),name_ko,category:'원재료·음료',subgroup:'음료 베이스'}));
 const layout={product_order:items.map(p=>p.id).reverse()};
 assert.deepEqual(sortCatalog(items,layout).map(p=>p.name_ko),['타로 음료 베이스','말차 드링크 베이스','오미자 시럽','청포도 에이드','레몬 에이드','패션프루트 청','딸기 청','패션프루트 퓨레']);
 const rows=items.map(p=>({product_id:p.id,quantity:2}));
 assert.deepEqual(sortProductRows(rows,items,layout).map(p=>p.product_id),sortCatalog(items,layout).map(p=>p.id));
});

test('canned drinks start with hwachae, mango, then grain latte in every store layout',()=>{
 const items=['녹차 캔','곡물라떼 캔','리얼 망고 프루티 캔','화채 캔','레몬밤 민트 캔'].map((name_ko,i)=>({id:String(i),name_ko,category:'원재료·음료',subgroup:'캔 음료'}));
 for(const store of ['finch','wellesley','midland','richmond']){
  const layout={product_order:store==='midland'?items.map(p=>p.id).reverse():items.map(p=>p.id)};
  const result=sortCatalog(items,layout).map(p=>p.name_ko);
  assert.deepEqual(result.slice(0,3),['화채 캔','리얼 망고 프루티 캔','곡물라떼 캔']);
 }
});

test('retail coffee, paste, candy and dried fruit remain grouped across store layouts',()=>{
 const items=['레몬 페이스트','제로 커피 powder','달고나 캔디 봉투','커피 빈','달고나 캔디 · 리테일','동결건조 바나나','흑임자 페이스트','바나나 칩 · 리테일'].map((name_ko,i)=>({id:String(i),name_ko,category:'원재료·음료',subgroup:'리테일'}));
 for(const store of ['finch','downtown','midland','richmond-hill']){
  const layout={product_order:items.map(p=>p.id)};
  assert.deepEqual(sortCatalog(items,layout).map(p=>p.id),['1','3','0','6','2','4','5','7']);
 }
});
test('garnish herbs, fresh fruit and dried fruit precede other kinds without mutating history',()=>{
 const items=['레몬','로즈마리','초콜릿 청크','바나나','타임','동결건조 레몬','동결건조 딸기','오렌지','커피 초콜릿','슈가파우더'].map((name_ko,i)=>({id:String(i),name_ko,category:'원재료·음료',subgroup:'가니쉬'}));
 const layout={product_order:items.map(p=>p.id)};
 assert.deepEqual(sortCatalog(items,layout).map(p=>p.id),['1','4','0','3','7','5','6','2','8','9']);
 const rows=items.map(p=>({product_id:p.id,name_ko:'saved name',quantity:7}));
 const before=JSON.stringify(rows);
 assert.deepEqual(sortProductRows(rows,items,layout).map(p=>p.product_id),sortCatalog(items,layout).map(p=>p.id));
 assert.equal(JSON.stringify(rows),before);
});

test('strawberry cheong, passionfruit cheong and puree are the final beverage items',()=>{
 const items=[{id:'sheet-92f4924adb',name_ko:'패션프루트 퓨레'},{id:'sheet-30c6740e1f',name_ko:'패션프루트 청'},{id:'syrup',name_ko:'오미자 시럽'},{id:'sheet-5e9286882f',name_ko:'딸기 청'},{id:'ade',name_ko:'레몬 에이드'},{id:'base',name_ko:'말차 드링크 베이스'}].map(p=>({...p,category:'원재료·음료',subgroup:'음료 베이스'}));
 for(const store of ['finch','downtown','midland','richmond-hill']){
  assert.deepEqual(sortCatalog(items,{product_order:items.map(p=>p.id)}).map(p=>p.id),['base','syrup','ade','sheet-5e9286882f','sheet-30c6740e1f','sheet-92f4924adb']);
 }
});
