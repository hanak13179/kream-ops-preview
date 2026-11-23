// A failed or incomplete page must not silently become a shorter order list.
export async function readAllRows(makeQuery,size=500){
 const rows=[];for(let start=0;;start+=size){const r=await makeQuery().range(start,start+size-1);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error('INCOMPLETE_LIST_READ');rows.push(...r.data);if(r.data.length<size)return rows;}
}
