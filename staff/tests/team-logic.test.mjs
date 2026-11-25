import test from 'node:test';import assert from 'node:assert/strict';
import {addDays,weekStart,weekday,parseTime,fmtTime,localParts,distanceM,geoCheck,availability,noticeOk,shiftIssues,autoSchedule,copyWeek,workedHours,timesheet,timesheetCsv,tipShiftsFromTimecards,crewForDay} from '../team-logic.mjs';
import {splitTips} from '../tip-split.mjs';

test('dates and times',()=>{
 assert.equal(addDays('2026-11-30',2),'2026-12-02');assert.equal(weekday('2026-11-25'),3);assert.equal(weekStart('2026-11-25'),'2026-11-23');assert.equal(weekStart('2026-11-29'),'2026-11-23');
 assert.equal(parseTime('9:30'),570);assert.equal(parseTime('4pm'),960);assert.equal(parseTime('12am'),0);assert.equal(parseTime('25:00'),null);
 assert.equal(fmtTime(960,'en'),'4pm');assert.equal(fmtTime(570,'ko'),'오전 9:30');
 assert.deepEqual(localParts('2026-11-25T15:30:00Z'),{date:'2026-11-25',min:630});   // EST = UTC-5
 assert.deepEqual(localParts('2026-11-26T03:00:00Z'),{date:'2026-11-25',min:1320});
});
test('geofence: only within 100m of the POS',()=>{
 const store={lat:43.66497,lng:-79.38466,radius_m:100};
 assert.ok(Math.abs(distanceM(store,{lat:43.66587,lng:-79.38466})-100)<2);
 assert.equal(geoCheck(store,{lat:43.66580,lng:-79.38466,acc:10}).ok,true);    // ~92m
 assert.equal(geoCheck(store,{lat:43.66600,lng:-79.38466,acc:10}).reason,'far'); // ~115m
 assert.equal(geoCheck(store,{lat:43.6700,lng:-79.38466,acc:300}).reason,'fuzzy');
 assert.equal(geoCheck({lat:43.66497,lng:-79.38466},{lat:43.66600,lng:-79.38466}).ok,false);   // default radius 100
 assert.equal(geoCheck(store,null).reason,'no_location');
 assert.equal(geoCheck({},{lat:1,lng:1}).reason,'store_unset');
 assert.equal(geoCheck({},{lat:1,lng:1}).ok,false);   // 위치 없는 매장은 출근 막음 (서버와 같게)
});
const people=[{id:'a',name:'Amy',stores:['downtown']},{id:'b',name:'Ben',stores:['downtown']},{id:'c',name:'Cho',stores:['downtown','finch']}];
const week=['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-05','2026-12-06'];
test('availability and notice',()=>{
 const rows=[{user_id:'a',weekday:1,kind:'range',start_min:600,end_min:900},{user_id:'b',weekday:1,kind:'none'}];
 assert.equal(availability(rows,'a','2026-11-30',600,900),'yes');assert.equal(availability(rows,'a','2026-11-30',600,960),'no');
 assert.equal(availability(rows,'b','2026-11-30',600,900),'no');assert.equal(availability(rows,'c','2026-11-30',600,900),'unset');
 assert.equal(noticeOk('2026-12-09','2026-11-25',14),true);assert.equal(noticeOk('2026-12-08','2026-11-25',14),false);
});
test('auto schedule fills needs fairly and respects availability, time off and max hours',()=>{
 const needs=[0,1,2,3,4,5,6].flatMap(wd=>[{weekday:wd,start_min:600,end_min:960,count:1},{weekday:wd,start_min:960,end_min:1320,count:1}]);
 const availabilityRows=[{user_id:'b',weekday:1,kind:'none'}];
 const timeOff=[{user_id:'a',start_date:'2026-12-02',end_date:'2026-12-02',status:'approved'}];
 const other=[{id:'x',store_id:'finch',date:'2026-12-03',start_min:600,end_min:960,user_id:'c'}];
 const {shifts,unfilled}=autoSchedule({store:'downtown',dates:week,needs,people,shifts:other,availabilityRows,timeOff,prefs:{a:{max_hours:30}}});
 assert.equal(shifts.length,14);
 for(const s of shifts.filter(s=>s.user_id)){
  const iss=shiftIssues(s,{shifts:[...shifts,...other],availabilityRows,timeOff,prefs:{a:{max_hours:30}}});assert.deepEqual(iss,[],JSON.stringify(s));
 }
 const hrs=id=>shifts.filter(s=>s.user_id===id).reduce((a,s)=>a+(s.end_min-s.start_min)/60,0);
 assert.ok(hrs('a')<=30);assert.ok(Math.max(hrs('a'),hrs('b'),hrs('c'))-Math.min(hrs('a'),hrs('b'),hrs('c'))<=12,'roughly even');
 assert.equal(unfilled.length,shifts.filter(s=>!s.user_id).length);
 // 다시 돌려도 같은 자리를 또 만들지 않아요
 assert.equal(autoSchedule({store:'downtown',dates:week,needs,people,shifts:[...other,...shifts]}).shifts.length,0);
});
test('shift issues and copy week',()=>{
 const s={id:'1',date:'2026-11-30',start_min:600,end_min:900,user_id:'b'};
 assert.deepEqual(shiftIssues(s,{availabilityRows:[{user_id:'b',weekday:1,kind:'none'}]}),['unavailable']);
 assert.deepEqual(shiftIssues(s,{shifts:[{id:'2',date:'2026-11-30',start_min:800,end_min:1000,user_id:'b'}]}),['overlap']);
 const c=copyWeek([{store_id:'downtown',date:'2026-11-24',start_min:600,end_min:900,user_id:'a',published:true}],'2026-11-23','2026-11-30','downtown');
 assert.deepEqual(c,[{date:'2026-12-01',store_id:'downtown',start_min:600,end_min:900,position:'',user_id:'a',note:'',published:false}]);
});
test('timecards → hours, lateness, overtime, CSV and tips',()=>{
 const tc=(u,d,inH,outH,br=[] ,store='downtown')=>({id:u+d,user_id:u,store_id:store,clock_in:`${d}T${String(inH+5).padStart(2,'0')}:00:00Z`,clock_out:outH==null?null:`${d}T${String(outH+5).padStart(2,'0')}:00:00Z`,breaks:br});
 const one=tc('a','2026-11-23',10,18,[{start:'2026-11-23T20:00:00Z',end:'2026-11-23T20:30:00Z'}]);
 assert.equal(workedHours(one),7.5);
 const cards=[one,...['2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28'].map(d=>tc('a',d,8,17)),tc('b','2026-11-23',12,18)];
 const shifts=[{store_id:'downtown',date:'2026-11-23',start_min:540,end_min:1080,user_id:'a'}];
 const ts=timesheet({timecards:cards,shifts,people,from:'2026-11-23',to:'2026-11-29'});
 const amy=ts.find(r=>r.name==='Amy');assert.equal(amy.hours,52.5);assert.equal(amy.overtime,8.5);assert.equal(amy.regular,44);
 assert.ok(amy.cards[0].flags.includes('late'));assert.ok(amy.cards[1].flags.includes('nobreak'));
 assert.match(timesheetCsv(ts),/Amy,2026-11-23,downtown,10:00,18:00,30,7.5,09:00-18:00/);
 const tips=splitTips([{date:'2026-11-23',store:'downtown',cash:27,card:54}],tipShiftsFromTimecards(cards,people));
 assert.deepEqual(tips.lines.map(l=>[l.name,l.cash,l.card]),[['Amy',15,30],['Ben',12,24]]);
 assert.equal(tipShiftsFromTimecards([tc('a','2026-11-23',10,null)],people).length,0);   // 퇴근 안 한 기록은 빼요
 assert.deepEqual(crewForDay({timecards:cards,people,store:'downtown',date:'2026-11-23'}),[{name:'Amy',hours:7.5},{name:'Ben',hours:6}]);
 assert.deepEqual(crewForDay({shifts,people,store:'downtown',date:'2026-11-23'}),[{name:'Amy',hours:9}]);
});
import {lateMinutes,shiftStatus,zonedToISO} from '../team-logic.mjs';
test('late detection and zoned time',()=>{
 assert.equal(zonedToISO('2026-11-25',600),'2026-11-25T15:00:00.000Z');assert.equal(zonedToISO('2026-07-01',600),'2026-07-01T14:00:00.000Z');
 const shifts=[{user_id:'a',store_id:'downtown',date:'2026-11-25',start_min:600,end_min:960}];
 assert.equal(lateMinutes({user_id:'a',store_id:'downtown',clock_in:zonedToISO('2026-11-25',612)},shifts),12);
 assert.equal(lateMinutes({user_id:'a',store_id:'downtown',clock_in:zonedToISO('2026-11-25',604)},shifts),0);
 assert.equal(shiftStatus(shifts[0],[],new Date(zonedToISO('2026-11-25',630))).status,'late_nocard');
 assert.equal(shiftStatus(shifts[0],[],new Date(zonedToISO('2026-11-26',630))).status,'noshow');
 assert.deepEqual(shiftStatus(shifts[0],[{user_id:'a',store_id:'downtown',clock_in:zonedToISO('2026-11-25',620)}],new Date(zonedToISO('2026-11-25',700))).late,20);
});
import {lateRecord,clockOutReminder,payPeriod,payrollSummary} from '../team-logic.mjs';
test('repeat lateness, clock-out reminder, biweekly payroll',()=>{
 const shifts=['2026-11-20','2026-11-21','2026-11-22','2026-11-23'].map(d=>({user_id:'a',store_id:'downtown',date:d,start_min:600,end_min:960}));
 const cards=shifts.map((s,i)=>({id:String(i),user_id:'a',store_id:'downtown',clock_in:zonedToISO(s.date,600+(i<3?15:0)),clock_out:zonedToISO(s.date,960),breaks:[]}));
 const r=lateRecord(cards,shifts,'a','2026-11-25');assert.equal(r.count,3);assert.equal(r.level,2);
 assert.equal(lateRecord(cards.slice(0,1),shifts,'a','2026-11-25').level,1);
 const open={user_id:'a',store_id:'downtown',clock_in:zonedToISO('2026-11-23',600),clock_out:null};
 assert.equal(clockOutReminder(open,shifts,new Date(zonedToISO('2026-11-23',965))),null);
 assert.equal(clockOutReminder(open,shifts,new Date(zonedToISO('2026-11-23',975))).reason,'after_shift');
 assert.equal(clockOutReminder({...open,store_id:'finch'},shifts,new Date(zonedToISO('2026-11-23',1230))).reason,'long');
 assert.deepEqual(payPeriod('2026-11-25'),{from:'2026-11-16',to:'2026-11-29'});assert.deepEqual(payPeriod('2026-11-30'),{from:'2026-11-30',to:'2026-12-13'});assert.deepEqual(payPeriod('2026-11-15'),{from:'2026-11-02',to:'2026-11-15'});
 const p=payrollSummary({timecards:cards,shifts,people:[{id:'a',name:'Amy'}],from:'2026-11-16',to:'2026-11-29',tips:[{name:'Amy',card:40.5,cash:10}]});
 assert.equal(p[0].hours,23.25);assert.equal(p[0].late,3);assert.equal(p[0].card_tips,40.5);
});
import {wantHours} from '../team-logic.mjs';
test('wanted hours steer auto-schedule but stay fair',()=>{
 assert.equal(wantHours({want_max:true,max_hours:38}),38);assert.equal(wantHours({desired_hours:12}),12);assert.equal(wantHours({}),24);assert.equal(wantHours({desired_hours:50,max_hours:30}),30);
 const ppl=[{id:'max',name:'Max',stores:['finch']},{id:'few',name:'Few',stores:['finch']},{id:'mid',name:'Mid',stores:['finch']}];
 const needs=[0,1,2,3,4,5,6].flatMap(wd=>[{weekday:wd,start_min:600,end_min:960,count:1},{weekday:wd,start_min:960,end_min:1320,count:1}]);   // 84h
 const prefs={max:{want_max:true,max_hours:40},few:{desired_hours:12},mid:{desired_hours:24}};
 const {shifts}=autoSchedule({store:'finch',dates:week,needs,people:ppl,prefs});
 const h=id=>shifts.filter(s=>s.user_id===id).reduce((a,s)=>a+(s.end_min-s.start_min)/60,0);
 assert.ok(h('max')>h('mid')&&h('mid')>h('few'),`${h('max')} ${h('mid')} ${h('few')}`);
 assert.ok(h('few')>=12,'few still gets their wish'); assert.ok(h('max')<=40);
 // 일이 적은 주: 모두 비슷한 비율로 (최대한 많이도 혼자 다 가져가지 않아요)
 const small=autoSchedule({store:'finch',dates:week,needs:[1,2,3,4,5,6].map(wd=>({weekday:wd,start_min:600,end_min:960,count:1})),people:ppl,prefs}).shifts;
 const hs=id=>small.filter(s=>s.user_id===id).length;
 assert.ok(hs('few')>=1&&hs('mid')>=1,'everyone gets some'); assert.ok(hs('max')>=hs('mid'));
});
