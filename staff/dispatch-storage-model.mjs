import {halfBoxCount,displayQuantity,inputQuantity} from './packing.mjs?v=20261119-memo-items';
import {sortCatalog} from './order-layout.mjs?v=20261119-garnish-sequence';

export const storageZones=[['chilled-desserts','냉장 디저트','Chilled desserts'],['chilled-ingredients','냉장 음료재료','Chilled drink ingredients'],['frozen','냉동','Frozen'],['supplies','포장·소모품','Packaging & supplies'],['ambient','상온','Ambient'],['unassigned','보관장소 확인','Check storage location'],['midland','미드랜드 크림밤','Midland Kream Bombs']];
const compact=s=>String(s||'').replace(/\s/g,'');
export function storageLocationNote(p,lang='ko'){
 return compact(p.name_ko)==='삼각김밥라벨스티커'?(lang==='en'?'Office':'사무실'):'';
}
export function storageZone(p,store){
 const n=compact(p.name_ko),g=compact(p.subgroup),cat=compact(p.category);
 if(g==='크림밤')return store==='midland'?'midland':'unassigned';
 // Confirmed locations override broad packaging, dessert and powder groups.
 if(storageLocationNote(p))return 'ambient';
 if(/포장|소모품|생일용품|주방및포장용품/.test(cat+' '+g)||['커피빈','판매용커피빈','스플렌다'].includes(n))return 'supplies';
 if(['죠리퐁','조리퐁','리얼레몬주스','딸기청'].includes(n))return 'ambient';
 if(['레몬','바나나','아몬드밀크','오트밀크','스패너크림','콜드브루','말차음료베이스','할라피뇨','할라피뇨슬라이스피클'].includes(n)||/페이스트/.test(n)||/^갈릭마요소스/.test(n)||/^티라미수크림/.test(n)||/^티라미수베이스/.test(n))return 'chilled-ingredients';
 if(g==='캔음료'||/캔$/.test(n)||n==='화채')return 'chilled-ingredients';
 if(/홀케이크|홀케익/.test(n+' '+g)||['소세지빵','소시지빵','바나나푸딩'].includes(n))return 'chilled-desserts';
 if(/^베이글(?:\(|$)/.test(n)||['생지','유부'].includes(n)||(/두바이|두쫀쿠/.test(n)&&!g.includes('재료')))return 'frozen';
 if(/티백|파우더/.test(n)||['설탕','황설탕','삼각김밥김','로투스','오레오','레이디핑거'].includes(n))return 'ambient';
 if(/냉동/.test(n)||['미니스콘','미니크루아상','휘낭시에','티라미수','아이스크림','사워도우'].includes(g))return 'frozen';
 if(g==='쿠키'&&!/두바이|두쫀쿠|구찌|세트/.test(n))return 'frozen';
 // Rare cheesecake keeps its previously confirmed chilled location.
 if(['레어치즈케이크','시루','시루크럼블','요거트쇼트케이크','푸딩'].includes(g))return 'chilled-desserts';
 if(/치즈케이크|치즈케익/.test(g)||(/치즈케이크|치즈케익/.test(n)&&!n.includes('레어')))return 'frozen';
 if(['우유2%','티라미수라떼베이스'].includes(n))return 'chilled-ingredients';
 return 'unassigned';
}
const flavors=[['블루베리','Blueberry'],['바질토마토','Basil tomato'],['다크초콜릿','Dark chocolate'],['말차마카다미아','Matcha macadamia'],['오리지널','Original'],['클래식','Classic'],['코코넛','Coconut'],['단호박','Pumpkin'],['인절미','Injeolmi'],['흑임자','Black sesame'],['플레인','Plain'],['초콜릿','Chocolate'],['초코','Chocolate'],['딸기','Strawberry'],['망고','Mango'],['오레오','Oreo'],['말차','Matcha'],['마차','Matcha'],['피칸','Pecan'],['스윗','Sweet'],['매운맛','Spicy'],['치즈','Cheese'],['청포도','Green grape'],['바닐라','Vanilla'],['쑥','Mugwort'],['밤','Chestnut']];
export function familyInfo(p){
 const n=compact(p.name_ko),g=compact(p.subgroup);let family;
 if(g==='레어치즈케이크')family=['rare','레어 치즈케이크','Rare cheesecake'];
 else if(g==='티라미수')family=['tiramisu','티라미수','Tiramisu'];
 else if(g==='쿠키'&&!/두바이|두쫀쿠|구찌|세트/.test(n))family=['cookies','일반 쿠키','Cookies'];
 else if(g==='미니크루아상')family=['croissant','크로와상 쿠키','Croissant cookies'];
 else if(g==='미니스콘')family=['scones','미니 스콘','Mini scones'];
 else if(g==='시루크럼블')family=['siru','시루','Siru'];
 else if(g==='요거트쇼트케이크')family=['yogurt','요거트케이크','Yogurt cakes'];
 else if(g==='푸딩'&&n.includes('치아시드'))family=['chia','치아시드 푸딩','Chia puddings'];
 else if(g==='아이스크림')family=['ice','아이스크림','Ice cream'];
 if(!family)return null;
 const flavor=flavors.find(([ko])=>n.startsWith(ko));if(!flavor)return null;
 return {key:family[0],ko:family[1],en:family[2],flavorKo:flavor[0],flavorEn:flavor[1]};
}
export function numberedStore(id,lang='ko',stores=[]){
 const labels={downtown:['1 · 웨슬리','1 · Wellesley'],wellesley:['1 · 웨슬리','1 · Wellesley'],midland:['2 · 미드랜드','2 · Midland'],'richmond-hill':['3 · 리치몬드힐','3 · Richmond Hill'],finch:['4 · 핀치','4 · Finch']};
 return labels[id]?.[lang==='en'?1:0]||stores.find(s=>s.id===id)?.name||id;
}
export const storeNumber=id=>({downtown:1,wellesley:1,midland:2,'richmond-hill':3,finch:4}[id]||99);
export function storageUnit(p,lang='ko'){
 if(halfBoxCount(p)===32)return lang==='en'?'box':'박스';
 const u=String(p.order_unit||'');
 const en={'백':'bag','송이':'bunch','미확인':'Unconfirmed','박스 (5kg)':'box (5kg)','통 (5kg)':'tub (5kg)','통 · 11kg':'tub · 11kg','개':'pcs','낱개':'pcs','EA':'pcs','ea':'pcs','통':'tub','봉':'bag','묶음':'bundle','1묶음':'bundle','켤레':'pair','포대':'sack','박스':'box','팩':'pack','롤 (100개)':'roll (100 pcs)','Bag · 20개/봉':'bag (20 pcs)'};
 return lang==='en'?(en[u]||u.replace(/10조각\/트레이/g,'10 slices/tray')):u;
}
export function buildStorageRows(orders,catalog,dispatches,date){
 const catalogMap=new Map(catalog.map(p=>[p.id,p])),sent=new Map();
 for(const d of dispatches)for(const i of d.kream_dispatch_items||[]){const k=JSON.stringify([d.order_id,i.product_id]);sent.set(k,(sent.get(k)||0)+Number(i.quantity));}
 const pending=orders.filter(o=>o.delivery_date===date&&o.status!=='cancelled'&&!o.dispatch_finalized_at&&!['dispatched','received'].includes(o.status));
 const rows=new Map();
 for(const o of [...pending].sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||a.id.localeCompare(b.id)))for(const i of o.kream_order_items||[]){
  const remaining=Math.max(0,Number(i.quantity)-(sent.get(JSON.stringify([o.id,i.product_id]))||0));if(!remaining)continue;
  const p={...i,...(catalogMap.get(i.product_id)||{}),order_unit:i.order_unit,id:i.product_id},zone=storageZone(p,o.store_id),key=JSON.stringify([i.product_id,i.order_unit,zone]);
  if(!rows.has(key))rows.set(key,{...p,key,zone,total:0,parts:[],stores:{},family:familyInfo(p)});
  const r=rows.get(key);r.total+=remaining;r.stores[o.store_id]=(r.stores[o.store_id]||0)+remaining;r.parts.push({orderId:o.id,storeId:o.store_id,productId:i.product_id,remaining});
 }
 return {pending,rows:sortCatalog([...rows.values()])};
}
export function storageGroups(rows){
 const groups=[],byKey=new Map();
 for(const row of rows){const family=row.family,k=family?JSON.stringify([row.zone,family.key,row.order_unit]):row.key;let g=byKey.get(k);if(!g){g={key:k,zone:row.zone,family,rows:[]};byKey.set(k,g);groups.push(g);}g.rows.push(row);}
 return groups.flatMap(g=>Array.from({length:Math.ceil(g.rows.length/4)},(_,n)=>({...g,key:g.key+':'+n,rows:g.rows.slice(n*4,n*4+4)})));
}
export const rowEntryKey=(row,store)=>JSON.stringify([row.key,store]);
export function checkedEntry(row,store,entries){const n=entries[rowEntryKey(row,store)];return n!==''&&n!=null&&Number.isInteger(Number(n))&&n>=0&&n<=row.stores[store]&&(halfBoxCount(row)!==32||n%32===0);}
export function splitStorageEntries(rows,store,entries){
 const out={};
 for(const row of rows.filter(r=>r.stores[store]>0)){
  if(!checkedEntry(row,store,entries))throw Error('DISPATCH_UNCHECKED');
  let left=Number(entries[rowEntryKey(row,store)]);
  for(const p of row.parts.filter(p=>p.storeId===store)){out[p.orderId]??=[];const n=Math.min(left,p.remaining);out[p.orderId].push({product_id:p.productId,quantity:n});left-=n;}
 }
 return out;
}
export {displayQuantity,inputQuantity};
