import test from 'node:test';import assert from 'node:assert/strict';
import {periodFor,periodEnd,dueFor,priceAt,readPrices,productPriceMarkup,settlementDays,watchSettlementUpdates,settlementConfirmedOnDay,settlementLineSummary,settlementLineAmountLabel} from '../settlement.mjs';
test('semi-monthly dates and seven-day deadline handle leap years and year rollover',()=>{assert.equal(periodFor('2026-11-15'),'2026-11-01');assert.equal(periodFor('2026-11-16'),'2026-11-16');assert.equal(periodEnd('2024-02-16'),'2024-02-29');assert.equal(dueFor('2026-11-01'),'2026-11-22');assert.equal(dueFor('2026-12-16'),'2027-01-07');});
test('prices are effective-dated and unknown prices remain unknown',()=>{const p=[{product_id:'milk',effective_date:'2026-11-10',unit_price:4},{product_id:'milk',effective_date:'2026-10-01',unit_price:3}];assert.equal(priceAt(p,'milk','2026-11-09'),3);assert.equal(priceAt(p,'milk','2026-11-10'),4);assert.equal(priceAt(p,'other','2026-11-10'),null);});
test('employee and manager clients never request private prices',async()=>{const db={from(){throw new Error('Financial request attempted');}};for(const role of ['employee','manager','factory','factory_manager'])assert.deepEqual(await readPrices(db,{role},'midland'),[]);assert.deepEqual(await readPrices(db,{role:'midland_owner'},'finch'),[]);});

test('daily history includes both imported dates and live records, newest first without duplicate dates',()=>{
 const report={start:'2026-11-16',end:'2026-11-30',orders:[{delivery_date:'2026-11-23'},{delivery_date:'2026-11-23'},{delivery_date:'2026-11-19'}],lines:[{day:'2026-11-20'},{day:'2026-11-22'}]};
 assert.deepEqual(settlementDays(report,[{order_date:'2026-11-15'},{order_date:'2026-11-18'},{order_date:'2026-11-19'}]),['2026-11-23','2026-11-22','2026-11-20','2026-11-19','2026-11-18']);
});
test('settlement refreshes every minute and on resume, protects edits and can be stopped',async()=>{
 const events=new Map();let tick,ms,calls=0,safe=true,stopped=false;
 const target={addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const window={...target,setInterval:(fn,delay)=>{tick=fn;ms=delay;return 1;},clearInterval:()=>stopped=true},document={...target,hidden:false};
 const stop=watchSettlementUpdates({window,document,shouldRefresh:()=>safe,refresh:async()=>calls++});
 assert.equal(ms,60000);await tick();assert.equal(calls,1);
 safe=false;await tick();await events.get('focus')();assert.equal(calls,1);
 safe=true;document.hidden=true;await tick();assert.equal(calls,1);
 document.hidden=false;await events.get('visibilitychange')();assert.equal(calls,2);
 stop();assert.equal(stopped,true);assert.equal(events.size,0);await tick();assert.equal(calls,2);
});

test('late confirmed dispatch does not remain awaiting on original requested date',()=>{const r={orders:[{delivery_date:'2026-11-21',status:'dispatched'},{delivery_date:'2026-11-23',status:'submitted'},{delivery_date:'2026-11-23',status:'dispatched'}]};assert.equal(settlementConfirmedOnDay(r,'2026-11-21'),true);assert.equal(settlementConfirmedOnDay(r,'2026-11-23'),false);assert.equal(settlementConfirmedOnDay(r,'2026-11-24'),false);});

test('unknown price stays pending while all known line amounts remain visible',()=>{const lines=[{amount:'12.30'},{amount:0},{amount:null},{amount:'0.10'}];assert.deepEqual(settlementLineSummary(lines),{knownAmount:12.4,pending:1});assert.equal(settlementLineAmountLabel(lines,(ko,en)=>en),'$12.40 · Price pending 1');assert.deepEqual(settlementLineSummary([{amount:null}]),{knownAmount:0,pending:1});assert.deepEqual(settlementLineSummary([{amount:0}]),{knownAmount:0,pending:0});});
