import {stockDisplayFactor} from './stock-units.mjs?v=20261122-cookie-pieces';
import {englishSystemLabel} from './system-labels.mjs?v=20261122-english';
import {aggregate} from './core.mjs?v=20261103-submit-fix';
import {sortProductRows} from './order-layout.mjs?v=20261119-garnish-sequence';
import {halfBoxCount,displayQuantity,inputQuantity,quantityLabel} from './packing.mjs?v=20261119-memo-items';

export const canFinalizeMidland=p=>p?.active===true&&(['owner','manager','midland_owner'].includes(p.role)||p.role==='factory'&&p.factory_manager&&p.store_manager);
export function torontoDateTime(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function midlandEditOpen(order,profile,now=new Date(),dispatches=[],receipts=[]){
 return order.store_id==='midland'&&order.source_kind!=='factory'&&canFinalizeMidland(profile)
 &&['submitted','confirmed'].includes(order.status)&&!order.dispatch_finalized_at
 &&!dispatches.some(d=>d.order_id===order.id)&&!receipts.some(r=>r.order_id===order.id)
 &&torontoDateTime(now)<`${order.delivery_date}T03:00:00`;
}
export function groupOrdersByDelivery(orders,catalog=[]){
 const groups=new Map();
 for(const order of orders){
  const key=JSON.stringify([order.store_id,order.delivery_date]);
  if(!groups.has(key))groups.set(key,{key,store_id:order.store_id,delivery_date:order.delivery_date,orders:[]});
  groups.get(key).orders.push(order);
 }
 return [...groups.values()].sort((a,b)=>b.delivery_date.localeCompare(a.delivery_date)||a.store_id.localeCompare(b.store_id)).map(g=>({...g,items:sortProductRows(aggregate(g.orders.filter(o=>o.status!=='cancelled')),catalog)}));
}
export function midlandReviewStatus(draft,{t,esc}){
 const requested=!!draft?.review_requested_at,changed=requested&&draft.review_changed_since_request;
 return `<section class="panel midland-review-status" aria-live="polite"><strong>${changed?t('변경된 내용 있음 · 관리자 재검토 필요','Changed since review request · review again'):requested?t('관리자 검토 대기','Awaiting manager review'):t('작성 중','Draft')}</strong><p>${t('직원은 검토 요청까지 할 수 있고, 미드랜드 관리자가 최종 발주합니다.','Staff request review; a Midland manager submits the final order.')}</p>${requested?`<small>${t('검토 요청 시각','Review requested')}: ${esc(new Date(draft.review_requested_at).toLocaleString('ko-KR',{timeZone:'America/Toronto'}))} · Toronto</small>`:''}<p class="muted">${t('완료된 발주 수정 마감: 입고희망일 당일 새벽 3시(토론토 시간). 출고·입고 처리가 시작된 발주는 수정할 수 없습니다.','Submitted orders can be edited until 3:00 a.m. Toronto time on the requested receipt date. Orders with dispatch or receipt activity cannot be edited.')}</p></section>`;
}
export function workflowError(error,t){
 const messages={MIDLAND_MANAGER_REQUIRED:['미드랜드 직원은 관리자 검토 요청까지만 할 수 있어요. 최종 발주는 관리자에게 요청해 주세요.','Only a Midland manager can submit the final order. Staff can request review.'],MIDLAND_EDIT_CLOSED:['입고희망일 당일 새벽 3시(토론토 시간)가 지나 수정이 마감됐어요.','Editing closed at 3:00 a.m. Toronto time on the requested receipt date.'],ORDER_CHANGED:['다른 관리자가 발주를 수정했어요. 최신 내용을 불러온 뒤 다시 확인해 주세요.','Another manager changed this order. Reload it before editing.'],ORDER_FULFILLMENT_STARTED:['출고 또는 입고 처리가 시작되어 발주를 수정할 수 없어요.','This order has dispatch or receipt activity and cannot be edited.'],INVALID_ORDER_REVISION:['품목과 수량, 입고희망일을 확인해 주세요.','Check items, quantities and requested receipt date.']};
 const value=messages[error?.message];return value?t(...value):'';
}
export async function requestMidlandReview(db,draft){
 const r=await db.rpc('kream_request_midland_review',{draft_id:draft.id,expected_revision:draft.revision});
 if(r.error)throw r.error;if(!r.data?.id)throw Error('EMPTY_REVIEW_RESPONSE');return r.data;
}

let editor=null,editorDirty=false;
export const hasOrderRevisionEdits=()=>editorDirty;
export function clearOrderRevision(){editor?.remove();editor=null;editorDirty=false;}
export function orderHistoryAmount(p,lang='ko'){
 const q=Number(p.quantity),dubai=halfBoxCount(p)===32,boxed=dubai&&Number.isFinite(q)&&q%32===0;
 const raw=String(p.order_unit||''),base=raw.split('·')[0].trim(),factor=stockDisplayFactor(p);
 const ko={ea:'개',bag:'봉',box:'박스',case:'케이스',pack:'팩',tray:'트레이',set:'세트'};
 const unit=boxed?(lang==='en'?'box':'박스'):dubai?(lang==='en'?'pcs':'개'):lang==='en'?englishSystemLabel(base):(ko[base.toLowerCase()]||base);
 let hint=boxed?(lang==='en'?`${q} pcs`:`${q}개`):factor===20?(lang==='en'?'20 pcs/bag':'20개/봉'):factor===10?(lang==='en'?'10 slices/tray':'10조각/트레이'):raw.split('·').slice(1).join('·').trim();
 if(lang==='en')hint=englishSystemLabel(hint);
 return {quantity:boxed?q/64:q,unit,hint};
}
export function orderHistoryTable(items,c){
 const {t,esc,name,lang='ko'}=c;
 if(!items.length)return `<p>${t('유효한 발주 품목이 없어요.','No active order items.')}</p>`;
 return `<div class="order-history-table-wrap"><table class="order-history-table" aria-label="${t('발주 품목과 수량','Ordered items and quantities')}"><colgroup><col class="history-name-col"><col class="history-quantity-col"></colgroup><thead><tr><th scope="col">${t('품목','Item')}</th><th scope="col">${t('발주수량','Quantity')}</th></tr></thead><tbody>${items.map(p=>{const amount=orderHistoryAmount(p,lang);return `<tr><td><div class="history-item-cell"><span class="history-item-text"><span>${esc(name(p))}</span>${amount.hint?`<small class="history-pack-hint">${esc(amount.hint)}</small>`:''}</span><small class="history-item-unit">${esc(amount.unit)}</small></div></td><td class="history-quantity"><b>${esc(amount.quantity)}</b></td></tr>`;}).join('')}</tbody></table></div>`;
}
export function renderGroupedOrderHistory(host,c){
 const {t,esc,name,orders,catalog=[],stores=[],profile,preview,lang}=c;
 const groups=groupOrdersByDelivery(orders,catalog);
 const status=o=>o.status==='cancelled'?t('취소','Cancelled'):o.status==='received'?t('입고 완료','Received'):o.dispatch_finalized_at||o.status==='dispatched'?t('출고 확정','Dispatched'):t('발주 완료','Submitted');
 host.innerHTML=groups.map(g=>`<details class="panel delivery-order-group" ${g.orders.some(o=>o.id===c.focusOrder)?'open':''}><summary><strong>${esc(g.delivery_date)} · ${esc(stores.find(s=>s.id===g.store_id)?.name||g.store_id)}</strong> · ${g.items.length}${t('품목',' items')} · ${g.orders.length>1?t('추가발주 포함 ','Includes additions · '):''}${g.orders.length}${t('건',' orders')}</summary><p class="muted">${t('같은 지점·입고희망일의 발주를 합산한 목록입니다. 취소된 발주는 합계에서 제외합니다.','Combined orders for this store and requested receipt date. Cancelled orders are excluded from totals.')}</p>${orderHistoryTable(g.items,c)}<details><summary>${t('개별 발주 내역·수정','Individual orders / edit')}</summary>${g.orders.map(o=>`<article class="panel"><div class="line"><strong>${esc(c.orderReference(o.id))}</strong><span>${status(o)}</span></div>${o.amended_at?`<small>${t('수정됨','Amended')} · ${esc(new Date(o.amended_at).toLocaleString(lang==='en'?'en-CA':'ko-KR',{timeZone:'America/Toronto'}))} · v${esc(o.order_revision)}</small>`:''}${orderHistoryTable(o.kream_order_items||[],c)}${o.note?`<p class="guide-body">${esc(o.note)}</p>`:''}${o.store_id==='midland'&&o.source_kind!=='factory'&&canFinalizeMidland(profile)?`<button type="button" data-amend-order="${esc(o.id)}" ${preview||!midlandEditOpen(o,profile,new Date(),c.dispatches,c.receipts)?'disabled':''}>${t('발주내용 수정','Edit order')}</button><small class="muted">${t('수정 마감: ','Edit deadline: ')}${esc(o.delivery_date)} 03:00 · Toronto</small>`:''}</article>`).join('')}</details></details>`).join('')||`<p>${t('아직 발주 내역이 없어요.','No orders yet.')}</p>`;
 host.querySelectorAll('[data-amend-order]').forEach(button=>button.onclick=()=>openOrderRevision(orders.find(o=>o.id===button.dataset.amendOrder),c));
}

export function openOrderRevision(order,c){
 const {t,esc,name,catalog=[],lang,profile}=c;
 if(c.preview||!midlandEditOpen(order,profile,new Date(),c.dispatches,c.receipts))return;
 clearOrderRevision();
 const dialog=document.createElement('dialog');editor=dialog;dialog.className='order-revision-dialog';dialog.setAttribute('aria-labelledby','orderRevisionTitle');
 const originals=new Map((order.kream_order_items||[]).map(p=>[p.product_id,p]));
 const amounts=new Map((order.kream_order_items||[]).map(p=>[p.product_id,Number(p.quantity)]));
 const available=catalog.filter(p=>p.active!==false&&!p.archived&&p.unit_confirmed&&p.category!=='키친 발주');
 const product=id=>({...catalog.find(p=>p.id===id),...originals.get(id),id});
 dialog.innerHTML=`<h2 id="orderRevisionTitle">${t('미드랜드 발주내용 수정','Edit Midland order')}</h2><p>${esc(c.orderReference(order.id))} · ${t('입고희망일 당일 새벽 3시(토론토 시간)까지 수정할 수 있어요.','Edits close at 3:00 a.m. Toronto time on the requested receipt date.')}</p><label>${t('입고희망일','Requested receipt date')}<input id="revisionDate" type="date" value="${esc(order.delivery_date)}" required></label><div id="revisionItems"></div><label>${t('품목 추가','Add item')}<select id="revisionProduct"><option value="">${t('품목을 선택하세요','Choose an item')}</option>${available.map(p=>`<option value="${esc(p.id)}">${esc(name(p))} · ${esc(p.order_unit)}</option>`).join('')}</select></label><button id="revisionAdd" type="button">${t('선택 품목 추가','Add selected item')}</button><label>${t('전달 사항','Note')}<textarea id="revisionNote" maxlength="2000">${esc(order.note||'')}</textarea></label><p id="revisionError" class="error" role="alert" tabindex="-1"></p><div class="actions"><button class="primary" id="revisionSave" type="button">${t('수정 내용 저장','Save changes')}</button><button id="revisionCancel" type="button">${t('취소','Cancel')}</button></div>`;
 document.body.append(dialog);dialog.showModal();
 function draw(){
  dialog.querySelector('#revisionItems').innerHTML=[...amounts].map(([id,q])=>{const p=product(id);return `<div class="line revision-item"><span>${esc(name(p))}<small>${esc(p.order_unit)}</small></span><input data-revision-product="${esc(id)}" aria-label="${esc(name(p))} ${t('수량','quantity')}" type="number" min="0" step="${halfBoxCount(p)===32?0.5:1}" value="${esc(displayQuantity(p,q))}"><button data-revision-remove="${esc(id)}" type="button">${t('삭제','Remove')}</button></div>`;}).join('');
  dialog.querySelectorAll('[data-revision-product]').forEach(input=>input.oninput=()=>{try{const p=product(input.dataset.revisionProduct);amounts.set(p.id,inputQuantity(p,input.value));input.setCustomValidity('');editorDirty=true;}catch{input.setCustomValidity(t('수량을 확인해 주세요.','Check the quantity.'));}});
  dialog.querySelectorAll('[data-revision-remove]').forEach(button=>button.onclick=()=>{amounts.delete(button.dataset.revisionRemove);editorDirty=true;draw();});
 }
 draw();
 dialog.querySelector('#revisionDate').onchange=()=>editorDirty=true;
 dialog.querySelector('#revisionNote').oninput=()=>editorDirty=true;
 dialog.querySelector('#revisionAdd').onclick=()=>{const p=available.find(p=>p.id===dialog.querySelector('#revisionProduct').value);if(!p)return;amounts.set(p.id,(amounts.get(p.id)||0)+halfBoxCount(p));editorDirty=true;draw();};
 const close=()=>{if(editorDirty&&!confirm(t('수정 내용을 취소할까요?','Discard these changes?')))return;clearOrderRevision();};
 dialog.querySelector('#revisionCancel').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.querySelector('#revisionSave').onclick=()=>{
  const invalid=[...dialog.querySelectorAll('input,select,textarea')].find(input=>!input.checkValidity());
  if(invalid){invalid.reportValidity();return;}
  const items=[...amounts].filter(([,q])=>q>0).map(([product_id,quantity])=>({product_id,quantity}));
  if(!items.length){dialog.querySelector('#revisionError').textContent=t('한 개 이상의 품목이 필요해요.','Keep at least one item.');return;}
  if(!confirm(t('이 발주의 품목·수량·입고희망일을 수정할까요?','Save these items, quantities and requested receipt date?')))return;
  c.act(async()=>{try{
   const r=await c.db.rpc('kream_revise_midland_order',{target_order:order.id,expected_revision:order.order_revision||1,new_items:items,new_note:dialog.querySelector('#revisionNote').value,new_date:dialog.querySelector('#revisionDate').value});
   if(r.error)throw r.error;
   clearOrderRevision();
   try{await c.reload();}catch{c.say(t('발주 수정은 저장됐어요. 최신 목록을 불러오지 못했으니 새로고침해서 확인해 주세요.','Your changes were saved. Reload the page to view the updated order list.'));return;}
   c.say(t('발주 수정 내용을 저장했어요. 같은 입고일 합계에도 반영됐어요.','Order updated. Combined receipt-date totals are refreshed.'));
  }catch(error){const box=dialog.querySelector('#revisionError');box.textContent=workflowError(error,t)||t('저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.','Could not save. Check your connection and retry.');box.focus();}});
 };
}
