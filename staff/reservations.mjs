let generation=0;
const ready=new Set(['processing','completed']);
const inactive=new Set(['cancelled','refunded','failed','trash']);
export const reservationToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const hasCakeMessage=r=>Boolean(r.items?.length&&(r.customer_note?.trim()||r.items.some(i=>(i.options||[]).some(o=>/message|letter|inscription|text|문구|메시지|메세지/i.test(o.label)&&o.value?.trim()))));
export const messageDone=r=>Boolean(r.content_hash&&r.content_hash===r.reviewed_hash);
export function messageCard(r,{t,esc,stores,preview=false}){
 const done=messageDone(r),cancelled=inactive.has(r.status),canWrite=ready.has(r.status)&&!preview;
 const branch=stores.find(s=>s.id===r.store_id)?.name||r.pickup_location||t('지점 확인 필요','Location needs confirmation');
 const badge=cancelled?t('취소·환불','Cancelled / refunded'):!ready.has(r.status)?t('결제 확인 대기','Awaiting payment'):done?t('✓ 작성완료','✓ Written'):r.reviewed_hash?t('주문변경 · 다시 확인','Order changed · review again'):t('작성 필요','To write');
 return `<article class="reservation-card ${cancelled?'cancelled':done?'done':''}"><div class="reservation-heading"><strong>#${esc(r.order_number)} · ${esc(r.pickup_time?.slice(0,5)||t('시간 미등록','Time not set'))}</strong><span class="reservation-badge">${badge}</span></div><small>${esc(branch)}</small><ul class="reservation-items">${(r.items||[]).map(i=>`<li><strong>${esc(i.name)} × ${esc(i.quantity)}</strong>${i.options?.length?`<small>${i.options.map(o=>`${esc(o.label)}: ${esc(o.value)}`).join(' · ')}</small>`:''}</li>`).join('')}</ul>${r.customer_note?.trim()?`<div class="reservation-message"><small>${t('박스 윈도우에 적을 문구 · 고객 요청 원문','Box window message · original customer request')}</small><p>${esc(r.customer_note)}</p></div>`:''}${!r.customer_note?.trim()?`<p class="muted">${t('제품 옵션에 적힌 문구를 확인해 주세요.','See the message in the product options above.')}</p>`:''}<div class="reservation-actions"><button data-reservation-review="${esc(r.source_order_id)}" ${canWrite?'':'disabled'}>${done?t('작성완료 취소','Undo written'):t('문구 작성완료','Message written')}</button>${done&&r.reviewed_at?`<small>${t('확인','Checked')} ${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit'}).format(new Date(r.reviewed_at)))}</small>`:''}</div></article>`;
}
export async function renderReservations(host,c){
 const gen=++generation,{db,t,esc}=c;
 if(!c.profile?.active){host.innerHTML=`<p>${t('승인된 계정으로 로그인해 주세요.','Sign in with an approved account.')}</p>`;return;}
 let date=reservationToday(),store=c.store||c.stores[0]?.id||'',filter='need',rows=[],status=null,error='',busy=false,truncated=false;
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
  const list=messages.filter(r=>filter==='all'||filter==='done'&&messageDone(r)&&!inactive.has(r.status)||filter==='need'&&ready.has(r.status)&&!messageDone(r));
  host.innerHTML=`<p class="muted">${t('오늘 수령하는 예약 케이크의 문구를 확인하고, 박스 윈도우에 적은 뒤 작성완료를 눌러 주세요.','Check today’s cake messages, write them on the box window, then mark them written.')}</p><div class="reservation-controls"><label>${t('수령일','Pickup date')}<input data-reservation-date type="date" value="${esc(date)}"></label><label>${t('지점','Location')}<select data-reservation-store ${c.stores.length<2?'disabled':''}>${c.profile.role==='owner'&&!c.preview?`<option value="">${t('전체 지점','All locations')}</option>`:''}${c.stores.map(s=>`<option value="${esc(s.id)}" ${s.id===store?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><button data-reservation-refresh>${t('새로고침','Refresh')}</button></div>${error?`<p class="error" role="alert">${error}</p>`:''}<p class="muted">${status?`${t('마지막 연결','Last received')}: ${esc(new Intl.DateTimeFormat('ko-KR',{timeZone:'America/Toronto',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(status.last_received_at)))}`:t('예약 사이트 자동 연결 준비 중입니다.','The reservation site connection is being prepared.')}</p><div class="chips"><button data-reservation-filter="need" class="${filter==='need'?'active':''}">${t('작성 필요','To write')} ${pending.length}</button><button data-reservation-filter="done" class="${filter==='done'?'active':''}">${t('작성완료','Written')}</button><button data-reservation-filter="all" class="${filter==='all'?'active':''}">${t('문구 있는 예약 전체','All reservations with messages')}</button></div>${truncated?`<p class="error">${t('표시할 주문이 많아요. 지점을 선택해 주세요.','Too many orders. Select a location.')}</p>`:''}<div class="reservation-list">${list.map(r=>messageCard(r,c)).join('')||`<p class="empty">${status?t('선택한 날짜에 표시할 예약 케이크 문구가 없어요.','No matching cake messages for this date.'):t('자동 연결을 완료하면 예약 케이크와 문구가 여기에 표시됩니다.','Cake orders and messages will appear once connected.')}</p>`}</div>`;
  host.querySelector('[data-reservation-store]').value=store;
  host.querySelector('[data-reservation-store]').onchange=e=>{store=e.target.value;load();};
  host.querySelector('[data-reservation-date]').onchange=e=>{if(e.target.value){date=e.target.value;load();}};
  host.querySelector('[data-reservation-refresh]').onclick=()=>load();
  host.querySelectorAll('[data-reservation-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.reservationFilter;draw();});
  host.querySelectorAll('[data-reservation-review]').forEach(b=>{b.disabled=b.disabled||busy;b.onclick=async()=>{
   if(c.preview||busy)return;const row=rows.find(r=>String(r.source_order_id)===b.dataset.reservationReview);if(!row||!ready.has(row.status))return;
   busy=true;draw();try{const result=await db.rpc('kream_review_cake_reservation',{order_id:row.source_order_id,expected_hash:row.content_hash,reviewed:!messageDone(row)});if(result.error)throw result.error;await load();}catch{c.say(t('주문이 변경됐거나 저장하지 못했어요. 최신 문구를 다시 확인해 주세요.','The order changed or could not be saved. Review the latest message.'),true);await load();}finally{busy=false;draw();}
  };});
 }
 await load();
 const timer=setInterval(()=>{if(gen!==generation||!host.isConnected){clearInterval(timer);return;}if(!busy&&!document.hidden)load();},60000);
}
