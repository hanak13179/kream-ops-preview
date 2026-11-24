import {storageZones,storageUnit,numberedStore,storeNumber,buildStorageRows,storageGroups,rowEntryKey,checkedEntry,splitStorageEntries,displayQuantity,inputQuantity} from './dispatch-storage-model.mjs?v=20261124-storage';
import {halfBoxCount} from './packing.mjs?v=20261119-memo-items';
import {orderReference} from './presentation.mjs?v=20261103-clean-confirmation';
import {confirmDispatchSummary} from './dispatch-confirmation.mjs?v=20261105-dispatch-submit';
let state={date:'',entries:{},notes:{},zone:'',batch:null,busy:false};
export const hasStorageDispatchEdits=()=>!!state.batch||state.busy||Object.keys(state.entries).length>0||Object.values(state.notes).some(Boolean);
export function clearStorageDispatch(){state={date:'',entries:{},notes:{},zone:'',batch:null,busy:false};}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderStorageDispatch(host,c){
 const {t,date,catalog=[],orders=[],dispatches=[],stores=[],db,say=()=>{},reload=async()=>{},verifyDispatch,remaining}=c,lang=c.lang||'ko';
 if(state.date!==date){clearStorageDispatch();state.date=date;}
 const {pending,rows}=buildStorageRows(orders,catalog,dispatches,date),groups=storageGroups(rows),rowIndex=new Map(rows.map((r,i)=>[r.key,i]));
 const storeIds=[...new Set(pending.map(o=>o.store_id))].sort((a,b)=>storeNumber(a)-storeNumber(b)||a.localeCompare(b));
 const zoneList=storageZones.filter(([key])=>key!=='unassigned'||rows.some(r=>r.zone===key));
 if(!zoneList.some(([key])=>key===state.zone))state.zone=zoneList.find(([key])=>rows.some(r=>r.zone===key))?.[0]||zoneList[0][0];
 const label=id=>numberedStore(id,lang,stores),name=p=>lang==='en'?(p.name_en||p.family?.flavorEn&&`${p.family.flavorEn} ${p.family.en}`||p.product_id||p.id):p.name_ko||p.product_id||p.id;
 const quantity=(p,n)=>`${displayQuantity(p,n)} ${storageUnit(p,lang)}`;
 const locked=()=>state.busy||!!state.batch;
 const dis=()=>c.preview||locked()?'disabled':'';
 const selection=(row,s)=>state.entries[rowEntryKey(row,s)];
 const input=(row,s)=>{const i=rowIndex.get(row.key),raw=selection(row,s),value=raw==null||raw===''?displayQuantity(row,row.stores[s]):displayQuantity(row,raw);return `<input type="number" data-sd-input="${i}:${esc(s)}" min="0" max="${displayQuantity(row,row.stores[s])}" step="${halfBoxCount(row)===32?.5:1}" inputmode="decimal" value="${Number.isFinite(value)?value:''}" aria-label="${esc(label(s)+' · '+name(row)+' · '+t('출고수량','dispatch quantity'))}" ${dis()}>`;};
 function controls(indices,s){return `<div class="sd-actions"><button type="button" data-sd-check="${indices.join(',')}" data-sd-store="${esc(s)}" ${dis()}>${t('출고 확인','Confirm')}</button><button type="button" data-sd-none="${indices.join(',')}" data-sd-store="${esc(s)}" ${dis()}>${t('미출고','Not sent')}</button></div>`;}
 function groupMarkup(g,index){const list=g.rows,ids=list.map(r=>rowIndex.get(r.key)),family=g.family&&list.length>1,midland=g.zone==='midland';
  const title=family?t(g.family.ko,g.family.en):name(list[0]);
  const total=family?'':`<b class="sd-total">${esc(quantity(list[0],list[0].total))}</b>`;
  const all=`<button type="button" class="sd-all" data-sd-all="${ids.join(',')}" ${dis()}>${midland?t('출고 확인','Confirm'):t('전체수량 출고 확인','Confirm all quantities')}</button>`;
  if(midland)return `<article class="sd-group tone-${index%3}"><header class="sd-item-head"><strong>${esc(title)}</strong><span class="sd-cream-qty">${input(list[0],'midland')} ${esc(storageUnit(list[0],lang))}</span>${all}<button type="button" class="sd-all" data-sd-none="${ids.join(',')}" data-sd-store="midland" ${dis()}>${t('미출고','Not sent')}</button></header></article>`;
  const groupStores=storeIds.filter(s=>list.some(r=>r.stores[s]>0));
  return `<article class="sd-group tone-${index%3}"><header class="sd-item-head"><strong>${esc(title)}</strong>${total}${all}</header><table class="sd-table ${family?'sd-family':'sd-single'}" aria-label="${esc(title)}"><colgroup><col class="sd-store-col">${list.map(()=>'<col>').join('')}<col class="sd-action-col"></colgroup>${family?`<thead><tr><th>${t('지점','Store')}</th>${list.map((r,j)=>`<th class="${j%2?'sd-shaded':''}"><span>${esc(t(r.family.flavorKo,r.family.flavorEn))}</span><b>${displayQuantity(r,r.total)}</b><small>${esc(storageUnit(r,lang))}</small></th>`).join('')}<th>${t('출고','Dispatch')}</th></tr></thead>`:''}<tbody>${groupStores.map(s=>`<tr><th scope="row">${esc(label(s))}</th>${list.map((r,j)=>`<td class="${family&&j%2?'sd-shaded':''}">${r.stores[s]>0?input(r,s):'—'}</td>`).join('')}<td>${controls(ids.filter(i=>rows[i].stores[s]>0),s)}</td></tr>`).join('')}</tbody></table></article>`;
 }
 function memoMarkup(){const notes=orders.filter(o=>o.status!=='cancelled'&&o.delivery_date===date&&o.note?.trim());if(!notes.length)return '';
  return `<section class="sd-memos"><h3>${t('추가요청 메모','Additional request notes')}</h3>${[...new Set(notes.map(o=>o.store_id))].sort((a,b)=>storeNumber(a)-storeNumber(b)).map(s=>`<article><strong>${esc(label(s))}</strong><div>${notes.filter(o=>o.store_id===s).map(o=>`<small>${esc(orderReference(o.id))}</small><p>${esc(o.note)}</p>`).join('')}</div></article>`).join('')}<small>${t('메모는 자동으로 출고수량에 포함되지 않아요.','Notes are not automatically counted as dispatched items.')}</small></section>`;
 }
 host.innerHTML=`<section class="storage-dispatch"><div class="sd-tabs" role="tablist" aria-label="${t('보관장소','Storage location')}">${zoneList.map(([key,ko,en])=>`<button type="button" role="tab" id="sd-tab-${key}" data-sd-zone="${key}" aria-controls="sd-zone-${key}" aria-selected="${state.zone===key}">${esc(t(ko,en))}${key==='unassigned'?` · ${rows.filter(r=>r.zone===key).length}`:''}</button>`).join('')}</div>${memoMarkup()}${zoneList.map(([key,ko,en])=>`<section id="sd-zone-${key}" role="tabpanel" aria-labelledby="sd-tab-${key}" ${state.zone===key?'':'hidden'}>${key==='unassigned'?`<p class="sd-warning">${t('보관장소가 지정되지 않은 품목도 빠짐없이 표시했어요. 실제 준비 위치를 확인해 주세요.','All items without an assigned storage location are listed here. Check their preparation locations.')}</p>`:''}${groups.filter(g=>g.zone===key).map(groupMarkup).join('')||`<p class="sd-empty">${t('이 분류에 준비할 품목이 없어요.','No pending items in this location.')}</p>`}</section>`).join('')}<p class="sd-status" aria-live="polite"></p><p class="sd-error" role="alert"></p><section class="sd-finalize"><h3>${t('지점별 출고 확정','Finalize dispatch by store')}</h3>${storeIds.map(s=>`<article><strong>${esc(label(s))}</strong><button type="button" data-sd-finalize="${esc(s)}" ${c.preview||state.busy||state.batch&&state.batch.store!==s?'disabled':''}>${state.batch?.store===s?t('같은 출고 재확인','Retry same dispatch'):t('출고 확정','Finalize dispatch')}</button><label>${t('출고 메모 (선택)','Dispatch note (optional)')}<textarea data-sd-note="${esc(s)}" maxlength="2000" ${dis()}>${esc(state.notes[s]||'')}</textarea></label></article>`).join('')||`<p>${t('이 날짜의 처리대기 발주가 없어요.','No pending orders for this date.')}</p>`}</section><div class="sd-records">${c.recordsMarkup||''}</div></section>`;
 const root=host.querySelector('.storage-dispatch');
 function indices(button,key){return button.dataset[key].split(',').filter(Boolean).map(Number);}
 function sync(){let checked=0,total=0;for(const row of rows)for(const s of Object.keys(row.stores)){total++;if(checkedEntry(row,s,state.entries))checked++;}
  root.querySelector('.sd-status').textContent=t(`배분 확인 ${checked} / ${total}`,`Checked ${checked} / ${total} allocations`);
  for(const input of root.querySelectorAll('[data-sd-input]')){const [i,s]=input.dataset.sdInput.split(':'),row=rows[Number(i)],raw=selection(row,s),ok=checkedEntry(row,s,state.entries);input.classList.toggle('is-checked',ok);input.setAttribute('aria-invalid',String(raw!=null&&!ok));if(document.activeElement!==input)input.value=raw==null||raw===''?displayQuantity(row,row.stores[s]):Number.isFinite(Number(raw))?displayQuantity(row,raw):'';}
  for(const button of root.querySelectorAll('[data-sd-check],[data-sd-none],[data-sd-all]')){const key=button.hasAttribute('data-sd-check')?'sdCheck':button.hasAttribute('data-sd-none')?'sdNone':'sdAll',ids=indices(button,key),ss=button.dataset.sdStore?[button.dataset.sdStore]:storeIds;
   button.setAttribute('aria-pressed',String(ids.length>0&&ids.every(i=>ss.every(s=>!rows[i].stores[s]||checkedEntry(rows[i],s,state.entries)&&(key!=='sdNone'||Number(selection(rows[i],s))===0)))));
  }
 }
 root.querySelectorAll('[data-sd-zone]').forEach(button=>button.onclick=()=>{state.zone=button.dataset.sdZone;root.querySelectorAll('[data-sd-zone]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));root.querySelectorAll('[role=tabpanel]').forEach(p=>p.hidden=p.id!=='sd-zone-'+state.zone);});
 root.querySelectorAll('[data-sd-input]').forEach(input=>input.oninput=()=>{const [i,s]=input.dataset.sdInput.split(':'),row=rows[Number(i)],key=rowEntryKey(row,s);try{if(input.value==='')delete state.entries[key];else state.entries[key]=inputQuantity(row,input.value);input.setCustomValidity('');}catch{state.entries[key]=NaN;input.setCustomValidity(t('발주량 이내의 올바른 수량을 입력해 주세요.','Enter a valid quantity no greater than ordered.'));}sync();});
 root.querySelectorAll('[data-sd-check],[data-sd-none],[data-sd-all]').forEach(button=>button.onclick=()=>{if(c.preview||locked())return;const key=button.hasAttribute('data-sd-check')?'sdCheck':button.hasAttribute('data-sd-none')?'sdNone':'sdAll',ids=indices(button,key),ss=button.dataset.sdStore?[button.dataset.sdStore]:storeIds;
  for(const i of ids)for(const s of ss){const row=rows[i];if(!row.stores[s])continue;const k=rowEntryKey(row,s);if(key==='sdNone')state.entries[k]=0;else if(state.entries[k]==null||state.entries[k]==='')state.entries[k]=row.stores[s];}sync();});
 root.querySelectorAll('[data-sd-note]').forEach(input=>input.oninput=()=>state.notes[input.dataset.sdNote]=input.value);
 root.querySelectorAll('[data-sd-finalize]').forEach(button=>button.onclick=async()=>{
  const store=button.dataset.sdFinalize,error=root.querySelector('.sd-error');error.textContent='';if(c.preview||state.busy||!db)return;
  if(!state.batch){
   const invalid=rows.filter(r=>r.stores[store]>0&&!checkedEntry(r,store,state.entries));
   if(invalid.length){error.textContent=t('출고수량을 먼저 확인해 주세요: ','Confirm dispatch quantities first: ')+invalid.map(name).join(', ');const index=rowIndex.get(invalid[0].key);const zoneButton=root.querySelector(`[data-sd-zone="${invalid[0].zone}"]`);zoneButton?.click();root.querySelector(`[data-sd-input="${index}:${store}"]`)?.focus();return;}
   const target=pending.filter(o=>o.store_id===store);if(!target.length)return;
   if(target.some(o=>(c.receipts||[]).some(r=>r.order_id===o.id)&&!dispatches.some(d=>d.order_id===o.id))){error.textContent=t('이전 입고기록이 있어 중복 출고를 막았습니다. 기존 기록을 확인해 주세요.','Legacy receipts exist. Check prior records to avoid duplicate dispatch.');return;}
   const payloads=splitStorageEntries(rows,store,state.entries),items=rows.filter(r=>r.stores[store]>0).map(r=>({...r,actual:Number(selection(r,store))}));
   state.busy=true;let accepted=false;try{accepted=await(c.confirmDispatch||confirmDispatchSummary)({storeName:label(store),date,items,t,name,quantityLabel:quantity,lang});}finally{state.busy=false;}if(!accepted)return;
   state.batch={store,date,orders:target.map(o=>({payload:{target_order:o.id,request_id:crypto.randomUUID(),expected_items:remaining(o,dispatches).filter(r=>r.remaining>0).map(r=>({product_id:r.product_id,quantity:r.remaining})).sort((a,b)=>a.product_id.localeCompare(b.product_id)),actual_items:(payloads[o.id]||[]).sort((a,b)=>a.product_id.localeCompare(b.product_id)),dispatch_note:state.notes[store]||''},verified:false}))};
  }
  if(state.batch.store!==store)return;state.busy=true;root.querySelectorAll('input,button,textarea').forEach(el=>el.disabled=true);
  return c.act(async()=>{try{for(const item of state.batch.orders){if(item.verified)continue;const r=await db.rpc('kream_finalize_dispatch',item.payload);if(r.error)throw r.error;await verifyDispatch(db,item.payload);item.verified=true;}
    for(const row of rows)delete state.entries[rowEntryKey(row,store)];delete state.notes[store];state.batch=null;state.busy=false;await reload();say(t('출고를 저장하고 주문별 기록까지 확인했어요.','Dispatch saved and verified against each original order.'));
   }catch(e){state.busy=false;const done=state.batch?.orders.filter(x=>x.verified).length||0;error.textContent=t(`${done}건 저장 확인. 입력을 유지했어요. 같은 출고 재확인으로 이어서 처리해 주세요.`,`${done} orders verified. Entries are retained. Retry the same dispatch to continue safely.`);renderStorageDispatch(host,{...c});const node=host.querySelector('.sd-error');if(node)node.textContent=error.textContent;throw e;}});
 });
 c.bindRecords?.(root);sync();
}
