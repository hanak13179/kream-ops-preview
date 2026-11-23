import test from 'node:test';import assert from 'node:assert/strict';
test('saved counts are copied to the sheet in one batch with the sync key; Midland store label falls back to id',async()=>{
 const sent=[];globalThis.fetch=(url,opt)=>{sent.push({url,body:JSON.parse(opt.body),mode:opt.mode});return Promise.resolve();};
 const {queueSheetStock,flushSheetStock}=await import('../sheet-sync.mjs');
 queueSheetStock({store:'finch',staff:'Kim',product:{id:'cheesecake',name_ko:'플레인 크림 치즈케익',category:'디저트',subgroup:'치즈케이크'},count:7,sort:3,unit:'Tray · 10조각'});
 queueSheetStock({store:'downtown',staff:'Kim',product:{id:'cup',name_ko:'16oz Cold Cup',category:'포장·소모품'},count:0,sort:9,unit:'있음=1 · 없음=0'});
 flushSheetStock();
 assert.equal(sent.length,1);assert.match(sent[0].url,/script\.google\.com\/macros/);assert.equal(sent[0].mode,'no-cors');
 const b=sent[0].body;assert.equal(b.action,'recordStock');assert.equal(b.key,'kream-stock-sync');assert.equal(b.rows.length,2);
 assert.deepEqual([b.rows[0].store,b.rows[0].item,b.rows[0].count],['4호점 Finch','플레인 크림 치즈케익',7]);
 assert.equal(b.rows[1].count,0);flushSheetStock();assert.equal(sent.length,1);
});
