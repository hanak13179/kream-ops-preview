// A failed or incomplete page must not silently become a shorter order list.
export async function readAllRows(makeQuery,size=500){
 const rows=[];for(let start=0;;start+=size){const r=await makeQuery().range(start,start+size-1);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error('INCOMPLETE_LIST_READ');rows.push(...r.data);if(r.data.length<size)return rows;}
}

export async function verifySubmittedItems(db,orderId,basket){
 const r=await db.from('kream_orders').select('id,store_id,delivery_date,note,status,kream_order_items(product_id,quantity)').eq('id',orderId).single();
 if(r.error)throw r.error;
 const o=r.data,canonical=items=>JSON.stringify((items||[]).map(i=>[i.product_id,Number(i.quantity)]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(!o||o.id!==orderId||o.status==='cancelled'||o.store_id!==basket.store_id||o.delivery_date!==basket.delivery_date||(o.note||'')!==(basket.note||'')||canonical(o.kream_order_items)!==canonical(basket.items))throw Error('SUBMITTED_ITEMS_DIFFER');
 return o;
}
