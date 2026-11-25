import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {visiblePages} from '../access.mjs';
test('schedule and Cash$ are for stores 1·3·4 only (no Midland)',()=>{
 for(const r of ['employee','manager','general_manager'])assert.ok(visiblePages(r).includes('team'),r);
 assert.ok(!visiblePages('midland_owner').includes('team'));assert.ok(!visiblePages('midland_owner').includes('cash'));
 for(const r of ['factory_staff','factory_manager'])assert.ok(!visiblePages(r).includes('team'),r);
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/store==='midland'&&\['team','cash'\]\.includes\(p\[0\]\)/);   // 2호점 근무지에서는 버튼 숨김
 assert.match(app,/if\(store==='midland'&&\['team','cash'\]\.includes\(page\)\)page='order'/);
});
