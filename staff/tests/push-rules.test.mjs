import test from 'node:test';import assert from 'node:assert/strict';
import {pushPlan,managersOf} from '../../supabase/functions/kream-push/rules.mjs';
import {zonedToISO} from '../team-logic.mjs';
const people=[{user_id:'own',role:'owner',active:true},{user_id:'m1',role:'manager',active:true,stores:['finch']},{user_id:'m2',role:'manager',active:true,stores:['downtown']},{user_id:'gm',role:'manager',general_manager:true,active:true},
 {user_id:'e1',role:'employee',active:true,stores:['finch'],display_name:'Amy'},{user_id:'e2',role:'employee',active:true,stores:['downtown'],display_name:'Ben'},{user_id:'fm',role:'factory',factory_manager:true,active:true}];
const keys=(plan,u)=>plan.filter(p=>p.user_id===u).map(p=>p.topic);
test('managers of a store',()=>{assert.deepEqual(managersOf('finch',people).sort(),['gm','m1','own']);});
test('evening: order and cash missing go to that store’s managers only',()=>{
 const plan=pushPlan({now:zonedToISO('2026-11-25',22*60+40),people,orders:[{store_id:'downtown',delivery_date:'2026-11-26',status:'submitted'},{store_id:'midland',delivery_date:'2026-11-26'},{store_id:'richmond-hill',delivery_date:'2026-11-26'}],cash:{finch:false,downtown:true,'richmond-hill':null}});
 assert.deepEqual(keys(plan,'m1').sort(),['cash_missing','order_missing']);
 assert.deepEqual(keys(plan,'m2'),[]);assert.deepEqual(keys(plan,'e1'),[]);
 assert.equal(pushPlan({now:zonedToISO('2026-11-25',18*60),people,orders:[]}).filter(p=>p.topic==='order_missing').length,0);   // 7시 전엔 안 보내요
});
test('shifts: reminder, no clock-in, forgot clock-out',()=>{
 const shifts=[{id:'s1',user_id:'e1',store_id:'finch',date:'2026-11-25',start_min:600,end_min:960,published:true}];
 assert.deepEqual(keys(pushPlan({now:zonedToISO('2026-11-25',485),people,shifts}),'e1'),['shift_reminder']);
 const p=pushPlan({now:zonedToISO('2026-11-25',620),people,shifts,timecards:[]});
 assert.deepEqual(keys(p,'e1'),['late_noshow']);assert.deepEqual(keys(p,'m1'),['late_noshow']);assert.deepEqual(keys(p,'m2'),[]);
 const tc=[{user_id:'e1',store_id:'finch',clock_in:zonedToISO('2026-11-25',598),clock_out:null}];
 assert.deepEqual(keys(pushPlan({now:zonedToISO('2026-11-25',985),people,shifts,timecards:tc}),'e1'),['clock_out']);
 assert.deepEqual(keys(pushPlan({now:zonedToISO('2026-11-25',1090),people,shifts,timecards:tc}),'m1'),['open_punch']);
});
test('market, requests, results, factory',()=>{
 const shifts=[{id:'s2',user_id:'e2',store_id:'downtown',date:'2026-11-28',start_min:600,end_min:960}];
 const p=pushPlan({now:zonedToISO('2026-11-25',700),people,shifts,swaps:[{id:'w',shift_id:'s2',from_user:'e2',status:'open'}],timeOff:[{id:'o',user_id:'e1',status:'pending',start_date:'2026-12-20',end_date:'2026-12-20'}],finished:[{product_id:'x',name:'타로 크림밤',quantity:-34}]});
 assert.ok(keys(p,'e1').includes('market'));assert.ok(!keys(p,'e2').includes('market'));
 assert.ok(keys(p,'m1').includes('requests'));assert.ok(!keys(p,'m2').includes('requests'));
 assert.deepEqual(keys(p,'fm'),['factory_short']);
 assert.equal(new Set(p.map(x=>x.key)).size,p.length);   // 같은 알림 중복 없음
});
