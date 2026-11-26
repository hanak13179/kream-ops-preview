import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../integrations/schedule-sheet/Code.gs',import.meta.url),'utf8');
function script(seed={}) {
 const properties={...seed},locks=[];
 const c=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null,setProperty:(k,v)=>{properties[k]=v;}})},LockService:{getScriptLock:()=>({waitLock:()=>locks.push('lock'),tryLock:()=>{locks.push('lock');return true;},releaseLock:()=>locks.push('unlock')})}});
 vm.runInContext(source,c);return {c,properties,locks};
}
test('sheet edit spanning several store blocks queues every affected block',()=>{
 const {c,properties,locks}=script(),a=Array.from({length:55},()=>['']);
 a[0]=['# 2026-11-23 downtown'];a[19]=['# 2026-11-23 richmond-hill'];a[35]=['# 2026-11-23 finch'];
 const sh={getName:()=> 'November Schedule',getLastRow:()=>55,getRange:()=>({getDisplayValues:()=>a})};
 c.onEditInstalled({range:{getSheet:()=>sh,getColumn:()=>2,getRow:()=>6,getNumRows:()=>40}});
 assert.equal(Object.keys(JSON.parse(properties.dirty)).length,3);assert.deepEqual(locks,['lock','unlock']);
});
test('failed sheet imports stay queued; successful ones are removed',()=>{
 const dirty={'November Schedule|# 2026-11-23 downtown':Date.now()-60000,'November Schedule|# 2026-11-23 finch':Date.now()-60000};
 const {c,properties}=script({dirty:JSON.stringify(dirty)});
 c.scheduleSpreadsheet=()=>({getSheetByName:()=>({})});c.pushBlock=(_sh,key)=>key.endsWith('finch')?'failed':'✅ saved';
 c.pushDirty();assert.deepEqual(Object.keys(JSON.parse(properties.dirty)),['November Schedule|# 2026-11-23 finch']);
});
test('app export refuses to overwrite a pending edit in the source sheet',()=>{
 const {c}=script({dirty:JSON.stringify({'November Schedule|# 2026-11-23 finch':Date.now()})});
 assert.throws(()=>c.syncWeek('unused','2026-11-23',['finch']),/still syncing/);
});
test('schedule export preserves unresolved source names and excludes ordinary drafts',()=>{
 const {c}=script();let written;
 const base={store_id:'downtown',shift_date:'2026-11-23',start_min:600,end_min:960,position:'',user_id:null};
 c.sb=(_token,path)=>path.startsWith('kream_team_shifts')?[{...base,id:'pending',published:false,note:'시트 이름 확인: Clara'},{...base,id:'normal-draft',published:false,note:''}]:[];
 c.people=()=>({});c.rpc=()=>[{user_id:'manager'}];c.sheetNamed=()=>({setColumnWidth(){},getName:()=> 'November Schedule'});c.writeBlock=(_sh,_key,rows)=>{written=rows;};
 c.Utilities={formatDate:(_d,_tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-11-25':fmt==='HH:mm'?'12:00':'Nov 25 12:00'};
 c.syncWeek('unused','2026-11-23',['downtown']);
 assert.equal(written.flat().filter(x=>x==='Clara').length,1);assert.equal(written.flat().includes('OPEN'),false);
});
test('private polling does not overwrite a sheet block while its edit is queued',()=>{
 const dirty={'November Schedule|# 2026-11-23 downtown':Date.now()}, {c,properties}=script({dirty:JSON.stringify(dirty),FUNCTION_URL:'https://example.invalid',TEAM_SHEET_SECRET:'test-only'});
 const sh={getName:()=> 'November Schedule',getLastRow:()=>1,getRange:()=>({getDisplayValues:()=>[['# 2026-11-23 downtown']]})};
 c.scheduleSpreadsheet=()=>({getSheets:()=>[sh]});c.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,blocks:[{store:'downtown',week:'2026-11-23',fingerprint:'new',shifts:[]}]})})};
 c.writeWeekSnapshot=()=>{throw Error('source edit overwritten');};c.pullServerUpdates();
 assert.equal(JSON.parse(properties.LAST_SERVER_PULL).changed,0);
});
test('private polling keeps training cells when a server change is exported',()=>{
 const {c,properties}=script({FUNCTION_URL:'https://example.invalid',TEAM_SHEET_SECRET:'test-only'});
 const grid=[['# 2026-11-23 downtown'],[],[],['','10:00 ~ 12:00'],[],['','T']];
 const sh={getName:()=> 'November Schedule',getLastRow:()=>6,getRange:(_r,_c,_n,width)=>({getDisplayValues:()=>width===9?grid:grid.map(r=>[r[0]||''])})};
 c.scheduleSpreadsheet=()=>({getSheets:()=>[sh]});c.sheetNamed=()=>sh;
 c.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,blocks:[{store:'downtown',week:'2026-11-23',fingerprint:'new',shifts:[]}]})})};
 let received;c.writeWeekSnapshot=(_week,_stores,_people,shifts)=>{received=shifts;};c.pullServerUpdates();
 assert.equal(received[0].note,'training:T');assert.equal(received[0].start_min,600);assert.equal(properties['server:downtown:2026-11-23'],'new');
});

test('replacing a weekly block never deletes source rows before writing',()=>{
 const {c}=script();let written;const chain={setValues(v){written=v;return this;},setBackground(){return this;},setFontWeight(){return this;},setFontColor(){return this;},setWrap(){return this;},setVerticalAlignment(){return this;}};
 const sh={getLastRow:()=>4,getMaxRows:()=>100,getMaxColumns:()=>9,getRange:(_r,_c,_h,w)=>w===1?{getValues:()=>[['# 2026-11-23 downtown'],[''],[''],['']]}:chain,deleteRows(){throw Error('existing rows deleted');}};
 c.writeBlock(sh,'# 2026-11-23 downtown',[['# 2026-11-23 downtown','header'],['','new']],[]);
 assert.equal(written.length,4);assert.equal(written[1][1],'new');assert.equal(written[3][0],'');
});
