import {normalizeBatch} from './normalize.mjs';
Deno.serve(async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const respond=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method!=='POST')return respond(405,{error:'Method not allowed'});
 const token=req.headers.get('x-kream-sync-token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return respond(401,{error:'Unauthorized'});
 const limit=1024*1024;
 if(Number(req.headers.get('content-length')||0)>limit)return respond(413,{error:'Payload too large'});
 let raw='';try{const reader=req.body?.getReader();if(!reader)return respond(400,{error:'Missing payload'});let size=0;const parts:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return respond(413,{error:'Payload too large'});}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}raw=new TextDecoder().decode(bytes);}catch{return respond(400,{error:'Invalid payload'});}
 let orders;try{orders=normalizeBatch(JSON.parse(raw));}catch{return respond(400,{error:'Invalid order data'});}
 try{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return respond(503,{error:'Connection unavailable'});
  const result=await fetch(url+'/rest/v1/rpc/kream_receive_reservations',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({sync_token:token,orders})});
  if(!result.ok)return respond(result.status===401||result.status===403?401:503,{error:'Sync unavailable'});
  return respond(200,{ok:true,accepted:await result.json()});
 }catch{return respond(503,{error:'Sync unavailable'});}
});
