import test from 'node:test';import assert from 'node:assert/strict';
import {reservationToday,reservationDefaultDate,shiftReservationDate,manufacturingTotals,hasCakeMessage,messageDone,messageCard,renderReservations} from '../reservations.mjs';
import {visiblePages,navigationGroups} from '../access.mjs';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const row={source_order_id:1,order_number:'51',status:'processing',store_id:'midland',pickup_time:'17:30:00',customer_note:'Happy birthday <script>alert(1)</script>',items:[{name:'Cake',quantity:1}],content_hash:'new',reviewed_hash:'old'};
const c={t:k=>k,esc,stores:[{id:'midland',name:'Midland'}]};
test('today follows Toronto across UTC midnight and DST',()=>{assert.equal(reservationToday(new Date('2026-11-22T01:00:00Z')),'2026-11-21');assert.equal(reservationToday(new Date('2026-07-01T03:00:00Z')),'2026-06-30');});
test('messages on individual cake options are not omitted',()=>{assert.equal(hasCakeMessage({...row,customer_note:'',items:[{name:'Cake',quantity:1,options:[{label:'Cake message',value:'Hello'}]}]}),true);assert.equal(hasCakeMessage({...row,customer_note:'',items:[{name:'Cake',quantity:1}]}),false);assert.equal(hasCakeMessage({...row,items:[]}),false);});
test('changed messages invalidate the written check and user text is escaped',()=>{assert.equal(messageDone(row),false);const html=messageCard(row,c);assert.match(html,/주문변경/);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/박스 윈도우/);});
test('cancelled and unpaid orders cannot be marked written; previews are read only',()=>{for(const status of ['cancelled','refunded','failed','pending','on-hold'])assert.match(messageCard({...row,status},c),/data-reservation-review="1" disabled/);assert.match(messageCard(row,{...c,preview:true}),/data-reservation-review="1" disabled/);});
test('unapproved users cannot query reservation data',async()=>{let queried=false;const host={innerHTML:''};await renderReservations(host,{...c,profile:{active:false},db:{from(){queried=true;}}});assert.equal(queried,false);});
test('store messages remain assigned-branch tasks and factory preparation has a separate menu',()=>{for(const role of ['employee','manager','midland_owner','general_manager','manager_factory'])assert.ok(visiblePages(role).includes('reservations'));for(const role of ['factory','factory_staff','factory_manager']){assert.equal(visiblePages(role).includes('reservations'),false);assert.ok(visiblePages(role).includes('factoryreservations'));}for(const role of ['employee','manager','midland_owner'])assert.equal(visiblePages(role).includes('factoryreservations'),false);const groups=navigationGroups([['reservations']],'owner');assert.equal(groups.find(g=>g.key==='stores').pages[0][0],'reservations');});

test('factory opens tomorrow Toronto pickup date across DST and year boundaries; stores open today',()=>{
 for(const [now,today,tomorrow] of [['2026-11-22T01:00:00Z','2026-11-21','2026-11-22'],['2026-03-08T05:30:00Z','2026-03-08','2026-03-09'],['2026-11-01T04:30:00Z','2026-11-01','2026-11-02'],['2027-01-01T02:00:00Z','2026-12-31','2027-01-01']]){
  assert.equal(reservationDefaultDate(false,new Date(now)),today);assert.equal(reservationDefaultDate(true,new Date(now)),tomorrow);assert.equal(shiftReservationDate(tomorrow,-1),today);
 }
});
test('manufacturing totals combine equivalent sizes across branches and exclude cancelled and unpaid reservations',()=>{
 const item=(size,n,message)=>({name:'Strawberry',quantity:n,options:[{label:'Size',value:size},{label:'Message',value:message}]});
 const rows=[{status:'processing',items:[item('4 inch',2,'A')]},{status:'completed',store_id:'other',items:[item('4 inch',1,'B'),item('6 inch',1,'C')]},...['cancelled','refunded','failed','pending','on-hold','trash'].map(status=>({status,items:[item('4 inch',99,'X')]}))];
 assert.deepEqual(manufacturingTotals(rows).map(i=>[i.options[0].value,i.quantity]),[['4 inch',3],['6 inch',1]]);
});
test('factory reads cake requests without changing the store written marker',()=>{
 const html=messageCard({...row,reviewed_hash:'new'},{...c,factory:true});assert.match(html,/제조 대상/);assert.match(html,/고객 요청 원문/);assert.doesNotMatch(html,/data-reservation-review|문구 작성완료/);
 const groups=navigationGroups([['reservations'],['factoryreservations']],'owner');assert.equal(groups.find(g=>g.key==='factory').pages[0][0],'factoryreservations');
});
test('factory default queries all branches for tomorrow while store default queries only its branch today',async()=>{
 const savedInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 try{
  for(const factory of [false,true]){
   const queries=[],nodes=new Map();
   const host={innerHTML:'',querySelector(s){if(!nodes.has(s))nodes.set(s,{});return nodes.get(s)},querySelectorAll(){return []}};
   const db={from(table){const filters=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},async range(){queries.push({table,filters});return {data:[]}},async maybeSingle(){return {data:{last_received_at:'2026-11-22T05:01:00Z'}}}}}};
   await renderReservations(host,{...c,factory,store:'midland',profile:{active:true,role:factory?'factory':'employee'},db});
   assert.ok(queries[0].filters.some(([k,v])=>k==='pickup_date'&&v===reservationDefaultDate(factory)));
   assert.equal(queries[0].filters.some(([k,v])=>k==='store_id'&&v==='midland'),!factory);
   assert.equal(host.innerHTML.includes('제조 수량 합계'),factory);
  }
 }finally{globalThis.setInterval=savedInterval;}
});
