// Count only outstanding units due by the delivery being planned.
export function incomingQuantity({orders=[],receipts=[],dispatches=[],store,today,date,product}){
 if(!today||!date||date<today)return 0;
 return orders.filter(o=>o.store_id===store&&!/cancel|void|reject|received/i.test(String(o.status||''))&&o.delivery_date>=today&&o.delivery_date<=date).reduce((sum,o)=>{
  const ordered=(o.kream_order_items||[]).filter(i=>i.product_id===product).reduce((n,i)=>n+Number(i.quantity||0),0);
  const finalized=!!o.dispatch_finalized_at||o.status==='dispatched';
  const sent=dispatches.filter(d=>d.order_id===o.id).flatMap(d=>d.kream_dispatch_items||[]).filter(i=>i.product_id===product).reduce((n,i)=>n+Number(i.quantity||0),0);
  const received=receipts.filter(r=>r.order_id===o.id).flatMap(r=>r.kream_receipt_items||[]).filter(i=>i.product_id===product).reduce((n,i)=>n+Number(i.quantity||0),0);
  return sum+Math.max(0,(finalized?sent:ordered)-received);
 },0);
}
