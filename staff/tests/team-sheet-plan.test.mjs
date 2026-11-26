import test from 'node:test';import assert from 'node:assert/strict';
import {planSheetSync,matchName} from '../../supabase/functions/kream-team-sheet/plan.mjs';
const people=[{id:'e',name:'Eunyoung'},{id:'j',name:'Jeonghyeon Park'},{id:'c',name:'Alex'},{id:'c2',name:'Alex'}];
test('names from the sheet match app names',()=>{
 assert.deepEqual(matchName('eunyoung ',people),{user_id:'e'});
 assert.deepEqual(matchName('Jeonghyeon',people),{user_id:'j'});
 assert.deepEqual(matchName('Eunyoung ⚠ late 12m',people),{user_id:'e'});
 assert.deepEqual(matchName('',people),{user_id:null});assert.deepEqual(matchName('OPEN (빈 근무)',people),{user_id:null});
 assert.equal(matchName('Alex',people).many,true);assert.equal(matchName('Nobody',people).unknown,'Nobody');
});
test('sheet edits become a minimal plan',()=>{
 const existing=[{id:'1',date:'2026-11-23',start_min:600,end_min:960,user_id:'e',published:true},{id:'2',date:'2026-11-23',start_min:960,end_min:1380,user_id:'j',published:true},{id:'3',date:'2026-11-24',start_min:600,end_min:960,user_id:'e',published:true},{id:'d',date:'2026-11-24',start_min:600,end_min:960,user_id:null,published:false}];
 let n=0;const newId=()=>'new'+(++n);
 const incoming=[{date:'2026-11-23',start_min:600,end_min:960,name:'Eunyoung'},{date:'2026-11-23',start_min:960,end_min:1380,name:'Eunyoung'},{date:'2026-11-25',start_min:600,end_min:1020,name:'Nobody'}];
 const p=planSheetSync({existing,incoming,people,newId});
 assert.deepEqual(p.upserts.map(u=>[u.id,u.user_id]),[['2','e'],['new1',null]]);   // 2번은 사람만 바뀜, 새 근무는 빈 근무
 assert.deepEqual(p.deletes,['3']);   // 시트에서 지운 근무 (초안 d는 그대로)
 assert.equal(p.warnings.length,1);
 // 시간만 바꾸면 같은 근무(id 유지)
 const q=planSheetSync({existing,incoming:[{date:'2026-11-24',start_min:630,end_min:960,name:'Eunyoung'}],people,newId});
 assert.equal(q.upserts[0].id,'3');assert.equal(q.upserts[0].start_min,630);
 // 아무것도 안 바꾸면 할 일 없음
 assert.equal(planSheetSync({existing:existing.slice(0,1),incoming:[{date:'2026-11-23',start_min:600,end_min:960,name:'Eunyoung'}],people}).changed,0);
});

test('unmatched sheet drafts keep their identity when edited or resolved',()=>{
 const draft={id:'pending',date:'2026-11-23',start_min:600,end_min:960,user_id:null,position:'',note:'시트 이름 확인: Alex',published:false};
 const pending=planSheetSync({existing:[draft],incoming:[{date:draft.date,start_min:600,end_min:960,name:'Alex'}],people:[],newId:()=>{throw Error('duplicate placeholder')}});
 assert.equal(pending.upserts[0].id,'pending');assert.equal(pending.upserts[0].user_id,null);
 const resolved=planSheetSync({existing:[draft],incoming:[{date:draft.date,start_min:600,end_min:960,name:'Alex'}],people:[{id:'person',name:'Alex'}]});
 assert.equal(resolved.upserts[0].id,'pending');assert.equal(resolved.upserts[0].user_id,'person');assert.equal(resolved.upserts[0].note,'');
});

test('editing the time of an unresolved name preserves the draft id',()=>{
 const existing=[{id:'clara',date:'2026-11-27',start_min:1020,end_min:1410,user_id:null,note:'시트 이름 확인: Alex',published:false}];
 const p=planSheetSync({existing,incoming:[{date:'2026-11-27',start_min:1035,end_min:1410,name:'Alex'}],people:[],newId:()=>{throw Error('draft id changed')}});
 assert.equal(p.upserts[0].id,'clara');assert.equal(p.deletes.length,0);
});

test('sheet snapshots read every API page and fail instead of exporting a truncated schedule',async()=>{
 const {readScheduleRows}=await import('../../supabase/functions/kream-team-sheet/snapshot.mjs');
 const urls=[];const rows=await readScheduleRows(async url=>{urls.push(url);return urls.length<3?Array(2).fill({id:urls.length}):[{id:3}];},'shifts?select=id',{pageSize:2,max:10});
 assert.equal(rows.length,5);assert.match(urls[1],/offset=2/);
 await assert.rejects(()=>readScheduleRows(async()=>Array(2).fill({}),'shifts?select=id',{pageSize:2,max:4}),/too large/);
});


test('owner-confirmed aliases select the right eligible account without guessing others',()=>{
 const dahyun='895e3963-c5dc-4f63-8ee4-9403026de6ca',tm='b4db16a3-8b6c-4271-bbac-414bff9a6332',suhee='ecfbfaee-377b-4434-af64-040ded02d2a0';
 const eligible=[{id:dahyun,name:'박다현'},{id:tm,name:'Tm'},{id:suhee,name:'수희'},{id:'unused',name:'수희'}];
 assert.deepEqual(matchName('Clara',eligible),{user_id:dahyun});
 assert.deepEqual(matchName('태민',eligible),{user_id:tm});
 assert.deepEqual(matchName('수희',eligible),{user_id:suhee});
 assert.equal(matchName('수희',eligible.filter(p=>p.id!==suhee)).user_id,null);
 assert.equal(matchName('응섭',eligible).unknown,'응섭');
});
