// Read complete schedules before exporting: the API page limit must never erase later rows.
export async function readScheduleRows(read,path,{pageSize=500,max=10000}={}) {
 const rows=[];
 for(let offset=0;offset<max;offset+=pageSize){
  const page=await read(`${path}&limit=${pageSize}&offset=${offset}`);
  if(!Array.isArray(page))throw Error('Invalid schedule response');
  rows.push(...page);if(page.length<pageSize)return rows;
 }
 throw Error('Schedule snapshot too large; export stopped without changing the sheet');
}
