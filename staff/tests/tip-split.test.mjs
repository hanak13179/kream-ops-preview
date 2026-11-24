import test from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,parseHomebaseShifts,splitTips,shareCents,storeFromRole,toDate,toHours,toMinutes} from '../tip-split.mjs';

test('csv keeps quoted commas and newlines',()=>{assert.deepEqual(parseCsv('a,"b, c",d\r\n1,"x ""y""",3\n'),[['a','b, c','d'],['1','x "y"','3']]);});
test('store comes from the Homebase role name',()=>{assert.equal(storeFromRole('Wellesley'),'downtown');assert.equal(storeFromRole('Barista - Richmond'),'richmond-hill');assert.equal(storeFromRole('FINCH'),'finch');assert.equal(storeFromRole('Barista'),null);assert.equal(storeFromRole(''),null);});
test('dates, times and hours in the formats Homebase uses',()=>{
 assert.equal(toDate('11/16/2026'),'2026-11-16');assert.equal(toDate('Mon, Nov 16, 2026'),'2026-11-16');assert.equal(toDate('Nov 16',2026),'2026-11-16');assert.equal(toDate('2026-11-16 10:00'),'2026-11-16');
 assert.equal(toMinutes('5:30 PM'),1050);assert.equal(toMinutes('12:00 AM'),0);assert.equal(toMinutes('22:15'),1335);
 assert.equal(toHours('7:30'),7.5);assert.equal(toHours('7.25'),7.25);assert.equal(toHours('7h 30m'),7.5);assert.equal(toHours(''),null);});

const csv=`First Name,Last Name,Role,Date,Clock In,Clock Out,Total Hours
Kyungmin,No,Richmond,11/16/2026,10:00 AM,5:00 PM,7.00
Soohee,Kim,Richmond,11/16/2026,5:00 PM,10:15 PM,5.25
Chaewon,Min,Finch,11/16/2026,10:00 AM,5:00 PM,7
Minah,Shin,,11/16/2026,5:00 PM,10:00 PM,5
Totals,,,,,,24.25`;
test('reads a Homebase timesheet and flags shifts with no store role',()=>{
 const r=parseHomebaseShifts(csv);
 assert.equal(r.shifts.length,3);
 assert.deepEqual(r.shifts[0],{date:'2026-11-16',name:'Kyungmin No',store:'richmond-hill',hours:7,role:'Richmond'});
 assert.equal(r.skipped.length,1);assert.equal(r.skipped[0].reason,'store');assert.equal(r.skipped[0].name,'Minah Shin');});
test('hours from clock in/out when there is no hours column, closing past midnight',()=>{
 const r=parseHomebaseShifts('Employee,Role,Clock In,Clock Out\nHajun Lee,Richmond,11/20/2026 5:00 PM,11/20/2026 12:30 AM');
 assert.equal(r.shifts[0].hours,7.5);assert.equal(r.shifts[0].date,'2026-11-20');});
test('no header gives an error, not a crash',()=>{assert.equal(parseHomebaseShifts('hello\nworld').error,'NO_HEADER');});

test('cents are shared by weight and always add back up',()=>{assert.deepEqual(shareCents(1000,[1,1,1]),[334,333,333]);assert.deepEqual(shareCents(0,[1,2]),[0,0]);assert.deepEqual(shareCents(500,[0,0]),[0,0]);const s=shareCents(12345,[7,5.25,3.5]);assert.equal(s.reduce((a,b)=>a+b,0),12345);});
test('tips split by hours per store and day; cash and card separately',()=>{
 const {shifts}=parseHomebaseShifts(csv);
 const tips=[{date:'2026-11-16',store:'richmond-hill',cash:24,card:60},{date:'2026-11-16',store:'finch',cash:10,card:0},{date:'2026-11-17',store:'finch',cash:5,card:5}];
 const r=splitTips(tips,shifts);
 const kyung=r.lines.find(l=>l.name==='Kyungmin No'),soo=r.lines.find(l=>l.name==='Soohee Kim');
 assert.equal(kyung.pct,57.1);assert.equal(kyung.cash+soo.cash,24);assert.equal(kyung.card+soo.card,60);
 assert.equal(kyung.cash,13.71);assert.equal(soo.card,25.71);
 assert.deepEqual(r.lines.find(l=>l.name==='Chaewon Min'),{date:'2026-11-16',store:'finch',name:'Chaewon Min',hours:7,pct:100,cash:10,card:0,total:10});
 assert.deepEqual(r.unsplit,[{date:'2026-11-17',store:'finch',cash:5,card:5}]);
 assert.equal(r.people.length,3);assert.equal(r.from,'2026-11-16');assert.equal(r.to,'2026-11-17');});
test('a person working two stores the same day gets a share of each',()=>{
 const shifts=[{date:'2026-11-18',name:'A',store:'finch',hours:4},{date:'2026-11-18',name:'A',store:'richmond-hill',hours:4},{date:'2026-11-18',name:'B',store:'finch',hours:4}];
 const r=splitTips([{date:'2026-11-18',store:'finch',cash:20,card:0},{date:'2026-11-18',store:'richmond-hill',cash:0,card:30}],shifts);
 assert.deepEqual(r.people,[{name:'A',hours:8,cash:10,card:30,total:40},{name:'B',hours:4,cash:10,card:0,total:10}]);});
test('date range limits the split',()=>{const r=splitTips([{date:'2026-11-01',store:'finch',cash:5,card:0}],[{date:'2026-11-01',name:'A',store:'finch',hours:1}],{from:'2026-11-02'});assert.equal(r.lines.length,0);});
