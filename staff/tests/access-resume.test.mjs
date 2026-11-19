import test from 'node:test';
import assert from 'node:assert/strict';
import {watchPendingAccess} from '../access-resume.mjs';
function environment(){
 const events=new Map(),timers=new Map();
 const target={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name)};
 return {events,timers,window:{...target,setInterval:(fn)=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)},document:{...target,hidden:false}};
}
test('resuming a pending app rechecks server access and stops after approval',async()=>{
 const env=environment();let pending=true,calls=0;
 const stop=watchPendingAccess({...env,shouldRefresh:()=>pending,refresh:async()=>{calls++;pending=false;}});
 await env.events.get('pageshow')();assert.equal(calls,1);
 await env.timers.get(1)();assert.equal(calls,1);
 stop();assert.equal(env.timers.size,0);assert.equal(env.events.size,0);
});
test('hidden app and active work do not refresh or overlap requests',async()=>{
 const env=environment();let safe=false,calls=0,release;
 const stop=watchPendingAccess({...env,shouldRefresh:()=>safe,refresh:()=>{calls++;return new Promise(r=>release=r);}});
 await env.events.get('focus')();assert.equal(calls,0);
 safe=true;env.document.hidden=true;await env.events.get('visibilitychange')();assert.equal(calls,0);
 env.document.hidden=false;const request=env.events.get('focus')();await env.events.get('pageshow')();assert.equal(calls,1);
 release();await request;stop();
});
test('network failure permits a later retry',async()=>{
 const env=environment();let calls=0,errors=0;
 const stop=watchPendingAccess({...env,shouldRefresh:()=>true,refresh:async()=>{if(++calls===1)throw Error('offline');},onError:()=>errors++});
 await env.events.get('focus')();await env.events.get('focus')();assert.equal(calls,2);assert.equal(errors,1);stop();
});
