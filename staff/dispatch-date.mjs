// Unfinished dispatches retain their original date; they are never rolled into a later preparation list.
export function dispatchOrdersForDate(orders,date){return orders.filter(o=>o.delivery_date===date&&o.status!=='cancelled');}
export function externalQueueForDate(rows,date,queueOnly){return queueOnly?rows.filter(r=>r.dispatch_date===date&&r.status==='ready'):rows;}
