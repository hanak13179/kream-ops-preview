// Database snapshots are authoritative; Realtime only signals when to reload them.
export const workflowKey=(order,product)=>JSON.stringify([order,product]);
export function workflowMap(lines){return new Map(lines.map(x=>[workflowKey(x.order_id,x.product_id),x]));}
export function workflowTokens(lines,order){return lines.filter(x=>x.order_id===order).map(({product_id,revision,source_version})=>({product_id,revision,source_version}));}
export function dispatchSharedEntries(rows,lines,key){const map=workflowMap(lines),entries={};for(const row of rows)for(const store of Object.keys(row.stores)){const parts=row.parts.filter(p=>p.storeId===store),checks=parts.map(p=>map.get(workflowKey(p.orderId,p.productId)));if(checks.every((x,i)=>x?.checked&&Number(x.basis_quantity)===parts[i].remaining))entries[key(row,store)]=checks.reduce((n,x)=>n+Number(x.quantity),0);}return entries;}
export function restoreWorkflowFocus(host,draw){const el=host.ownerDocument?.activeElement,attrs=['data-sd-input','data-receive','data-sd-note','id'],attr=el&&host.contains(el)?attrs.find(a=>el.hasAttribute(a)):null,value=attr?el.getAttribute(attr):null,top=globalThis.scrollY;draw();if(attr){const next=[...host.querySelectorAll(`[${attr}]`)].find(n=>n.getAttribute(attr)===value);next?.focus({preventScroll:true});}if(Number.isFinite(top))globalThis.scrollTo?.(0,top);}
const sessions=new WeakMap(),activeSessions=new Set();
export function stopWorkflows(){for(const s of activeSessions)s.stop();}
export function watchWorkflow(host,{db,flow,ids,onChange,onSource,onStatus}){
 if(!db?.channel||!ids.length)return null;
 const scope=flow+':'+[...ids].sort().join(','),prior=sessions.get(host);
 if(prior?.scope===scope&&!prior.stopped){prior.callbacks={onChange,onSource,onStatus};return prior;}
 prior?.stop();
 const session={scope,lines:[],ready:false,saving:false,callbacks:{onChange,onSource,onStatus},stopped:false};sessions.set(host,session);activeSessions.add(session);
 let timer,poll,fetching=false,again=false,last='',sourceLast=null,channel;
 const status=s=>{session.status=s;session.callbacks.onStatus?.(s);};
 async function refresh(){if(session.stopped)return;if(host.isConnected===false){session.stop();return;}if(fetching){again=true;return;}fetching=true;try{const r=await db.rpc('kream_workflow_snapshot',{flow,ids});if(r.error)throw r.error;if(session.stopped)return;session.lines=r.data||[];session.ready=true;const source=JSON.stringify(session.lines.map(x=>[x.order_id,x.product_id,x.basis_quantity,x.source_version]));if(sourceLast!==null&&source!==sourceLast)session.callbacks.onSource?.();sourceLast=source;const next=JSON.stringify(session.lines);if(next!==last){last=next;session.callbacks.onChange?.(session.lines);}status(session.connected?'live':'polling');}catch{session.ready=false;status('offline');}finally{fetching=false;if(again){again=false;void refresh();}}}
 session.refresh=refresh;
 session.save=async changes=>{if(!session.ready||session.saving)throw Error('SHARED_NOT_READY');session.saving=true;try{const r=await db.rpc('kream_save_workflow_checks',{flow,changes});if(r.error)throw r.error;await refresh();}finally{session.saving=false;}};
 const signal=()=>{clearTimeout(timer);timer=setTimeout(refresh,60);};
 channel=db.channel('workflow-'+flow+'-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'*',schema:'public',table:'kream_workflow_checks'},p=>{if(p.new?.workflow===flow&&ids.includes(p.new.order_id))signal();}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'kream_orders'},p=>{if(ids.includes(p.new?.id)){session.ready=false;status('connecting');signal();session.callbacks.onSource?.();}}).subscribe(s=>{session.connected=s==='SUBSCRIBED';status(session.connected?'live':'connecting');if(session.connected)void refresh();});
 const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);globalThis.addEventListener?.('online',visible);
 poll=setInterval(()=>{if(!host.isConnected){session.stop();return;}if(!document.hidden)void refresh();},5000);
 session.stop=()=>{if(session.stopped)return;session.stopped=true;activeSessions.delete(session);clearTimeout(timer);clearInterval(poll);document.removeEventListener('visibilitychange',visible);globalThis.removeEventListener?.('online',visible);void db.removeChannel(channel);};
 status('connecting');void refresh();return session;
}
export function sharedStatus(t,status){return status==='live'?t('동료와 실시간 연결됨','Live updates connected'):status==='polling'?t('동료의 변경사항 확인 중 · 5초 간격','Checking coworker updates · every 5 seconds'):status==='offline'?t('연결을 확인해 주세요 · 저장 전 최신 내용을 다시 확인해요','Check connection · latest checks are required before saving'):t('동료의 확인 내용 연결 중…','Connecting shared checks…');}
