import test from 'node:test';import assert from 'node:assert/strict';
import {cashPlan,envelope,cashDate,billText} from '../cash-count.mjs';
const c={'50':3,'20':5,'10':2,'5':2,'2':15,'1':83,'0.25':128};
test('total, extra over the float and the bill-only envelope',()=>{const p=cashPlan({counts:c,open:300});assert.equal(p.total,425);assert.equal(p.extra,125);assert.equal(p.envelope,125);assert.equal(p.nextOpen,300);});
test('only bills go in the envelope: $121 extra → $120, $1 stays for tomorrow',()=>{const p=cashPlan({counts:{'100':4,'20':1,'1':1},open:300,cashSales:121});assert.equal(p.envelope,120);assert.equal(p.nextOpen,301);assert.equal(p.diff,0);assert.equal(billText(p.bills),'$100×1 + $20×1');});
test('envelope uses the bills actually in the till',()=>{assert.deepEqual(envelope({'50':1,'20':3},60),{amount:60,bills:{'20':3}});assert.equal(envelope({'100':1,'20':1,'1':1},71).amount,20);assert.equal(envelope({'1':50},40).amount,0);});
test('closing after midnight still counts as the previous day',()=>{assert.equal(cashDate(new Date('2026-11-23T06:30:00Z')),'2026-11-22');assert.equal(cashDate(new Date('2026-11-23T14:00:00Z')),'2026-11-23');});
