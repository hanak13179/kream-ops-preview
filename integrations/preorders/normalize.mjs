const statuses=new Set(['pending','on-hold','processing','completed','cancelled','refunded','failed','trash']);
const text=(x,max)=>{if(typeof x!=='string'||x.length>max)throw Error('Invalid text');return x.replace(/<[^>]*>/g,'').trim();};
export function pickupStore(value){
 const s=String(value||'').toLowerCase();
 const matches=[['finch',/finch|pantry/],['downtown',/wellesley|downtown/],['midland',/midland|scarborough/],['richmond-hill',/richmond/]].filter(([,re])=>re.test(s));
 return matches.length===1?matches[0][0]:null;
}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function normalizeOrder(order){
 if(!Number.isSafeInteger(order?.id)||order.id<=0||!statuses.has(order.status))throw Error('Invalid order');
 const location=text(order.pickup_location??'',200),date=order.pickup_date??'',time=order.pickup_time??'';
 if(date&&!validDate(date))throw Error('Invalid pickup date');
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Invalid pickup time');
 if(!Array.isArray(order.items)||order.items.length>100)throw Error('Invalid items');
 for(const key of ['modified_at','exported_at'])if(typeof order[key]!=='string'||!Number.isFinite(Date.parse(order[key])))throw Error('Invalid timestamp');
 return {source_order_id:order.id,order_number:text(String(order.number||order.id),50),status:order.status,store_id:pickupStore(location),pickup_location:location,pickup_date:date||null,pickup_time:time||null,customer_note:text(order.customer_note??'',10000),items:order.items.map(i=>{
  if(!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>100000)throw Error('Invalid quantity');
  if(i.options&&!Array.isArray(i.options))throw Error('Invalid options');
  return {name:text(i.name,500),quantity:i.quantity,options:(i.options||[]).slice(0,30).map(o=>({label:text(o.label,100),value:text(o.value,1000)}))};
 }),source_modified_at:new Date(order.modified_at).toISOString(),source_exported_at:new Date(order.exported_at).toISOString()};
}
export function normalizeBatch(payload){
 if(payload?.version!==1||!Array.isArray(payload.orders)||payload.orders.length<1||payload.orders.length>50)throw Error('Invalid batch');
 const rows=payload.orders.map(normalizeOrder);
 if(new Set(rows.map(r=>r.source_order_id)).size!==rows.length)throw Error('Duplicate orders');
 return rows;
}
