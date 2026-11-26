import test from 'node:test';import assert from 'node:assert/strict';
import {planSheetSync,matchName} from '../../supabase/functions/kream-team-sheet/plan.mjs';
const people=[{id:'e',name:'Eunyoung'},{id:'j',name:'Jeonghyeon Park'},{id:'c',name:'Clara'},{id:'c2',name:'Clara'}];
test('names from the sheet match app names',()=>{
 assert.deepEqual(matchName('eunyoung ',people),{user_id:'e'});
 assert.deepEqual(matchName('Jeonghyeon',people),{user_id:'j'});
 assert.deepEqual(matchName('Eunyoung ⚠ late 12m',people),{user_id:'e'});
 assert.deepEqual(matchName('',people),{user_id:null});assert.deepEqual(matchName('OPEN (빈 근무)',people),{user_id:null});
 assert.equal(matchName('Clara',people).many,true);assert.equal(matchName('Nobody',people).unknown,'Nobody');
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
 const draft={id:'pending',date:'2026-11-23',start_min:600,end_min:960,user_id:null,position:'',note:'시트 이름 확인: Clara',published:false};
 const pending=planSheetSync({existing:[draft],incoming:[{date:draft.date,start_min:600,end_min:960,name:'Clara'}],people:[],newId:()=>{throw Error('duplicate placeholder')}});
 assert.equal(pending.upserts[0].id,'pending');assert.equal(pending.upserts[0].user_id,null);
 const resolved=planSheetSync({existing:[draft],incoming:[{date:draft.date,start_min:600,end_min:960,name:'Clara'}],people:[{id:'person',name:'Clara'}]});
 assert.equal(resolved.upserts[0].id,'pending');assert.equal(resolved.upserts[0].user_id,'person');assert.equal(resolved.upserts[0].note,'');
});
