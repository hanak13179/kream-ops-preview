let generation=0;
const ready=new Set(['processing','completed']);
const inactive=new Set(['cancelled','refunded','failed','trash']);
export const reservationToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const reservationDefaultDate=(factory=false,now=new Date())=>reservationToday(now);
export function manufacturingTotals(rows){
 const totals=new Map();
 for(const r of rows.filter(r=>ready.has(r.status)))for(const i of r.items||[]){
  const options=(i.options||[]).filter(o=>!/message|letter|inscription|text|문구|메시지|메세지/i.test(o.label));
  const key=JSON.stringify([i.name,[...options].sort((a,b)=>`${a.label}:${a.value}`.localeCompare(`${b.label}:${b.value}`))]);
  const item=totals.get(key)||{name:i.name,options,quantity:0};item.quantity+=Number(i.quantity)||0;totals.set(key,item);
 }
 return [...totals.values()];
}
export const hasCakeMessage=r=>Boolean(r.items?.length&&(r.customer_note?.trim()||r.items.some(i=>(i.options||[]).some(o=>/message|letter|inscription|text|문구|메시지|메세지/i.test(o.label)&&o.value?.trim()))));
export const messageDone=r=>Boolean(r.content_hash&&r.content_hash===r.reviewed_hash);
export function messageCard(r,{t,esc,stores,preview=false,factory=false}){
 const done=messageDone(r),cancelled=inactive.has(r.status),hasMessage=hasCakeMessage(r),canWrite=hasMessage&&ready.has(r.status)&&!preview;
 const branch=stores.find(s=>s.id===r.store_id)?.name||r.pickup_location||t('지점 확인 필요','Location needs confirmation');
 const badge=cancelled?t('취소·환불','Cancelled / refunded'):!ready.has(r.status)?t('결제 확인 대기','Awaiting payment'):factory?t('준비 대상','To prepare'):!hasMessage?t('문구 요청 없음','No message requested'):done?t('✓ 작성완료','✓ Written'):r.reviewed_hash?t('주문변경 · 다시 확인','Order changed · review again'):t('작성 필요','To write');
 return `<article class="reservation-card ${cancelled?'cancelled':done&&!factory?'done':''}"><div class="reservation-heading"><strong>#${esc(r.order_number)} · ${esc(r.pickup_time?.slice(0,5)||t('시간 미등록','Time not set'))}</strong><span class="reservation-badge">${badge}</span></div><small>${esc(branch)}</small><ul class="reservation-items">${(r.items||[]).map(i=>`<li><strong>${esc(i.name)} × ${esc(i.quantity)}</strong>${i.options?.length?`<small>${i.options.map(o=>`${esc(o.label)}: ${esc(o.value)}`).join(' · ')}</small>`:''}</li>`).join('')}</ul>${r.customer_note?.trim()?`<div class="reservation-message"><small>${t('고객 요청 원문 · 케이크 문구는 박스 윈도우에 작성','Original customer request · write cake messages on the box window')}</small><p>${esc(r.customer_note)}</p></div>`:''}${!r.customer_note?.trim()?`<p class="muted">${hasMessage?t('제품 옵션에 적힌 문구를 확인해 주세요.','See the message in the product options above.'):t('별도 문구 요청이 없는 주문입니다.','No message was requested for this order.')}</p>`:''}${factory?'':`<div class="reservation-actions"><button data-reservation-review="${esc(r.source_order_id)}" ${canWrite?'':'disabled'}>${done?t('작성완료 취소','Undo written'):t('문구 작성완료','Message written')}</button>${done&&r.reviewed_at?`<small>${t('확인','Checked')} ${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'}).format(new Date(r.reviewed_at)))}</small>`:''}</div>`}</article>`;
}
export async function renderReservations(host,c){
 const gen=++generation,{db,t,esc}=c,factory=c.factory===true;
 if(!c.profile?.active){host.innerHTML=`<p>${t('승인된 계정으로 로그인해 주세요.','Sign in with an approved account.')}</p>`;return;}
 let date=reservationDefaultDate(factory),store=factory?'':c.store||c.stores[0]?.id||'',filter=factory?'production':'all',rows=[],status=null,error='',busy=false,truncated=false;
 async function load(){
  const targetDate=date,targetStore=store;
  try{
   const out=[];truncated=false;
   for(let offset=0;offset<1000;offset+=200){let q=db.from('kream_cake_reservations').select('source_order_id,order_number,status,store_id,pickup_location,pickup_date,pickup_time,customer_note,items,content_hash,reviewed_hash,reviewed_at').eq('pickup_date',targetDate).order('pickup_time',{ascending:true,nullsFirst:false}).order('source_order_id',{ascending:true});if(targetStore)q=q.eq('store_id',targetStore);const result=await q.range(offset,offset+199);if(result.error)throw result.error;out.push(...(result.data||[]));if((result.data||[]).length<200)break;if(offset===800)truncated=true;}
   const sync=await db.from('kream_preorder_sync_status').select('last_received_at').eq('source','website').maybeSingle();
   if(gen!==generation||date!==targetDate||store!==targetStore)return;
   rows=out;status=sync.data||null;error='';
  }catch{if(gen!==generation)return;error=t('예약주문을 불러오지 못했어요. 새로고침해 주세요.','Unable to load reservations. Refresh and try again.');}
  draw();
 }
 function draw(){
  if(gen!==generation)return;
  const messages=rows.filter(hasCakeMessage),pending=messages.filter(r=>ready.has(r.status)&&!messageDone(r));
  const list=rows.filter(r=>r.items?.length&&(filter==='production'&&ready.has(r.status)||filter==='all'||filter==='done'&&hasCakeMessage(r)&&messageDone(r)&&!inactive.has(r.status)||filter==='need'&&hasCakeMessage(r)&&ready.has(r.status)&&!messageDone(r)));
  host.innerHTML=`<p class="muted">${factory?t('픽업일을 선택하면 전 지점의 예약주문 상품, 준비 수량과 고객 요청사항을 확인할 수 있습니다. 두쫀쿠·선물세트 등 모든 픽업 상품이 포함됩니다.','Choose a pickup date to view all locations’ pickup products, quantities and customer requests, including cookie sets and gift sets.'):t('선택한 날짜에 수령하는 모든 픽업 주문과 요청사항을 확인해 주세요. 케이크 문구는 박스 윈도우에 작성한 뒤 작성완료를 눌러 주세요.','Check all pickup orders and requests for the selected date. Write cake messages on the box window, then mark them written.')}</p><div class="reservation-controls"><label><span>${factory?t('픽업일','Pickup date'):t('수령일','Pickup date')}</span><span class="reservation-date-box"><span aria-hidden="true">${esc(date)}</span><input aria-label="${factory?t('픽업일','Pickup date'):t('수령일','Pickup date')}" data-reservation-date type="date" value="${esc(date)}"></span></label><label><span>${t('지점','Location')}</span><select data-reservation-store ${c.stores.length<2?'disabled':''}>${factory||c.profile.role==='owner'&&!c.preview?`<option value="">${t('전체 지점','All locations')}</option>`:''}${c.stores.map(s=>`<option value="${esc(s.id)}" ${s.id===store?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><button data-reservation-refresh>${t('새로고침','Refresh')}</button></div>${error?`<p class="error" role="alert">${error}</p>`:''}<p class="muted">${status?`${t('마지막 연결','Last received')}: ${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Toronto',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(status.last_received_at)))}`:t('예약 사이트 자동 연결 준비 중입니다.','The reservation site connection is being prepared.')}</p>${factory?`<p><strong>${t('픽업일','Pickup date')} ${esc(date)}</strong></p><section class="panel"><h2>${t('준비 수량 합계','Products to prepare')}</h2><ul>${manufacturingTotals(rows).map(i=>`<li><strong>${esc(i.name)} × ${esc(i.quantity)}</strong>${i.options.length?`<small> · ${i.options.map(o=>`${esc(o.label)}: ${esc(o.value)}`).join(' · ')}</small>`:''}</li>`).join('')||`<li>${t('준비할 픽업 상품이 없어요.','No pickup products to prepare.')}</li>`}</ul><small>${t('결제가 확인된 예약만 합산합니다. 취소·환불·결제 대기는 제외합니다.','Only paid reservations are counted. Cancelled, refunded and unpaid orders are excluded.')}</small></section><div class="chips"><button data-reservation-filter="production" class="${filter==='production'?'active':''}">${t('준비 대상','To prepare')} ${rows.filter(r=>ready.has(r.status)&&r.items?.length).length}</button>`:`<div class="chips"><button data-reservation-filter="need" class="${filter==='need'?'active':''}">${t('작성 필요','To write')} ${pending.length}</button><button data-reservation-filter="done" class="${filter==='done'?'active':''}">${t('작성완료','Written')}</button>`}<button data-reservation-filter="all" class="${filter==='all'?'active':''}">${t('픽업 주문 전체','All pickup orders')}</button></div>${truncated?`<p class="error">${t('표시할 주문이 많아요. 지점을 선택해 주세요.','Too many orders. Select a location.')}</p>`:''}<div class="reservation-list">${list.map(r=>messageCard(r,c)).join('')||`<p class="empty">${status?t('선택한 날짜에 표시할 픽업 주문이 없어요.','No matching pickup orders for this date.'):t('자동 연결을 완료하면 픽업 주문과 요청사항이 여기에 표시됩니다.','Pickup orders and customer requests will appear once connected.')}</p>`}</div>`;
  host.querySelector('[data-reservation-store]').value=store;
  host.querySelector('[data-reservation-store]').onchange=e=>{store=e.target.value;load();};
  host.querySelector('[data-reservation-date]').onchange=e=>{if(e.target.value){date=e.target.value;load();}};
  host.querySelector('[data-reservation-refresh]').onclick=()=>load();
  host.querySelectorAll('[data-reservation-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.reservationFilter;draw();});
  host.querySelectorAll('[data-reservation-review]').forEach(b=>{b.disabled=b.disabled||busy;b.onclick=async()=>{
   if(factory||c.preview||busy)return;const row=rows.find(r=>String(r.source_order_id)===b.dataset.reservationReview);if(!row||!ready.has(row.status))return;
   busy=true;draw();try{const result=await db.rpc('kream_review_cake_reservation',{order_id:row.source_order_id,expected_hash:row.content_hash,reviewed:!messageDone(row)});if(result.error)throw result.error;await load();}catch{c.say(t('주문이 변경됐거나 저장하지 못했어요. 최신 문구를 다시 확인해 주세요.','The order changed or could not be saved. Review the latest message.'),true);await load();}finally{busy=false;draw();}
  };});
 }
 await load();
 const timer=setInterval(()=>{if(gen!==generation||!host.isConnected){clearInterval(timer);return;}if(!busy&&!document.hidden)load();},60000);
}
