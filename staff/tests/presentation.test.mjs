import {quantityStep} from '../quantity-step.mjs';
import * as availability from '../store-availability.mjs';
import * as subcategoryModule from '../subcategory-drag.mjs';
import * as catalogModule from '../catalog-editor.mjs';
import * as dailyModule from '../daily-log.mjs';
import * as replenishmentModule from '../replenishment.mjs';
import * as layoutModule from '../order-layout.mjs';
import * as checklistModule from '../checklist.mjs';
import * as journalModule from '../production-log.mjs';
import * as overviewModule from '../overview.mjs';
import * as stockModule from '../store-stock.mjs';
import * as dispatchModule from '../dispatch.mjs';
import * as productionModule from '../production.mjs';
import * as wasteModule from '../waste.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as presentation from '../presentation.mjs';
import * as core from '../core.mjs';
import * as operations from '../operations.mjs';
import * as access from '../access.mjs';
const catalog=[{id:'milk',name_ko:'우유',name_en:'Milk',category:'원재료·음료',subgroup:'유제품',order_unit:'봉',unit_confirmed:true,active:true},{id:'cookie',name_ko:'쿠키',name_en:'Cookie',category:'디저트',subgroup:'쿠키',order_unit:'개',unit_confirmed:true,active:true}];
test('needs-order ignores category and unknown stock, excludes threshold equality',()=>{assert.deepEqual(presentation.filterProducts(catalog,{filter:'need',category:'디저트',stock:[{product_id:'milk',on_hand:5,minimum:6},{product_id:'cookie',on_hand:null,minimum:2}]}).map(p=>p.id),['milk']);});
test('frequent counts distinct delivery days in seven-day window, excludes cancelled',()=>{const order=(date,status='submitted')=>({delivery_date:date,status,kream_order_items:[{product_id:'milk'}]});assert.equal(presentation.frequentIds([order('2026-10-31'),order('2026-10-31')],new Date('2026-11-01T17:00Z')).size,0);assert.deepEqual([...presentation.frequentIds([order('2026-10-31'),order('2026-10-30'),order('2026-10-01')],new Date('2026-11-01T17:00Z'))],['milk']);});
test('delivery display has weekday and omits year in both languages',()=>{for(const lang of ['ko','en']){const label=presentation.deliveryLabel('2026-11-02',lang);assert.ok(!label.includes('2026'));assert.match(label,lang==='ko'?/월/:/Mon/);}});
test('authenticated presentation preserves basket quantities through receiving navigation',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},insertAdjacentHTML(_,html){this.innerHTML+=html;},innerHTML:'',textContent:'',hidden:false,classList:{toggle(){},add(){},remove(){}},querySelector:s=>node(s),querySelectorAll:()=>[],scrollIntoView(){}});return nodes.get(id);};
 let source=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const bindings={};
 for(const m of source.matchAll(/import \{([^}]+)\} from ['"]([^'"]+)['"]/g)){
  const mod=await import(new URL(m[2],new URL('../app.mjs',import.meta.url)));
  for(const pair of m[1].split(',')){const [key,alias]=pair.trim().split(/\s+as\s+/);bindings[alias||key]=mod[key];}
 }
 bindings.renderReceiving=host=>{host.innerHTML='Receiving';};
 const context=vm.createContext({...bindings,URLSearchParams,Intl,Date,console,setInterval(){},localStorage:{getItem:k=>k==='kream-order-view'?'grid':null,setItem(){}},location:{hash:''},document:{querySelector:node,querySelectorAll:()=>[],documentElement:{},body:{classList:{toggle(){},add(){},remove(){}}}},window:{addEventListener(){}},confirm:()=>true});
 source=source.replace(/^import .*;\n/gm,'').replace(/boot\(\);\s*$/,'');
 vm.runInContext(source+`;user={id:'test'};profile={role:'owner',active:true,display_name:'Test'};stores=[{id:'finch',name:'Finch'}];store='finch';catalog=${JSON.stringify(catalog)};quantities={milk:3};dirty=true;render();`,context);
 assert.match(['#products','#allReq','#allExtra'].map(k=>node(k).innerHTML).join(''),/stepper|so-row|os-/);
 vm.runInContext("page='receiving';render();",context);assert.equal(node('#cart').innerHTML,'');
 vm.runInContext("page='order';render();",context);assert.equal(vm.runInContext('quantities.milk',context),3);assert.equal(vm.runInContext('dirty',context),true);
});
